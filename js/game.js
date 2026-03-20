import { db } from './firebase.js';
import { ref, onValue, update, get } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { tankBlueImg, tankRedImg } from './textures.js';
import { isPositionFree, circleRectCollide } from './utils.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let myBullets = [];
let enemyBullets = [];
let canvas, ctx;
let currentRoomCode = null;
let currentPlayerNick = null;
let gameListener = null;
let keys = {};
let lastMoveDir = { x: 0, y: -1 };
let obstacles = [];
let lastTimestamp = 0;
let winner = null;

const PLAYER_SPEED = 200;
const BULLET_SPEED = 400;
const BULLET_RADIUS = 5;
const PLAYER_RADIUS = 20;

let lobbyScreenEl, gameScreenEl, gameOverScreenEl, gameoverMessageEl, restartBtnEl, restartStatusEl;

export function initGame(components) {
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
    gameOverScreenEl = components.gameOverScreen;
    gameoverMessageEl = components.gameoverMessage;
    restartBtnEl = components.restartBtn;
    restartStatusEl = components.restartStatus;

    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        keys[e.code] = true;
        if (e.code === 'Space') {
            e.preventDefault();
            shoot();
        }
        if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    restartBtnEl.addEventListener('click', () => {
        if (!currentRoomCode || !currentPlayerNick) return;
        update(ref(db), {
            [`rooms/${currentRoomCode}/gameState/restart/${currentPlayerNick}`]: true
        });
        restartBtnEl.disabled = true;
        restartStatusEl.textContent = 'Ожидание соперника...';
    });
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

function shoot() {
    if (!gameActive || !currentRoomCode) return;
    const bullet = {
        x: myPos.x,
        y: myPos.y,
        vx: lastMoveDir.x * BULLET_SPEED,
        vy: lastMoveDir.y * BULLET_SPEED,
        owner: currentPlayerNick,
        createdAt: Date.now()
    };
    myBullets.push(bullet);
    update(ref(db), {
        [`rooms/${currentRoomCode}/gameState/bullets/${bullet.createdAt}`]: bullet
    });
}

export function startGame() {
    if (!gameScreenEl || !lobbyScreenEl) return;
    lobbyScreenEl.classList.remove('active');
    gameScreenEl.classList.add('active');
    gameOverScreenEl.classList.remove('active');
    gameActive = true;
    myBullets = [];
    enemyBullets = [];
    lastTimestamp = 0;
    winner = null;
    requestAnimationFrame(gameLoop);
}

export function stopGame() {
    gameActive = false;
}

function showGameOver(message, isWinner) {
    gameActive = false;
    gameScreenEl.classList.remove('active');
    gameOverScreenEl.classList.add('active');
    gameoverMessageEl.textContent = message;
    restartBtnEl.disabled = false;
    restartStatusEl.textContent = '';
}

export function setCurrentRoom(roomCode, playerNick) {
    currentRoomCode = roomCode;
    currentPlayerNick = playerNick;
}

export function listenGameState(code, playerNick) {
    if (gameListener) gameListener();
    gameListener = onValue(ref(db, `rooms/${code}/gameState`), (snap) => {
        const state = snap.val();
        if (!state) return;

        for (let id in state) {
            if (id === 'bullets' || id === 'restart' || id === 'winner') continue;
            if (id === playerNick) myPos = state[id];
            else if (id !== 'bullets' && id !== 'restart' && id !== 'winner') enemyPos = state[id];
        }

        if (state.bullets) {
            enemyBullets = Object.values(state.bullets).filter(b => b.owner !== playerNick);
        }

        if (state.winner) {
            winner = state.winner;
            if (!gameActive) return;
            if (winner === playerNick) {
                showGameOver('Вы победили!', true);
            } else {
                showGameOver('Вы проиграли!', false);
            }
        }

        if (state.restart) {
            const players = Object.keys(state).filter(k => k !== 'bullets' && k !== 'restart' && k !== 'winner');
            if (players.length === 2) {
                const bothReady = state.restart[players[0]] && state.restart[players[1]];
                if (bothReady) {
                    restartGame();
                }
            }
        }
    });
}

async function restartGame() {
    if (!currentRoomCode) return;
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    const snap = await get(roomRef);
    const data = snap.val();
    const players = Object.keys(data.players || {});
    if (players.length !== 2) return;

    const map = data.map || [];
    const pos1 = findFreePosition(map);
    const pos2 = findFreePosition(map);
    while (Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y) < 100) {
        pos2 = findFreePosition(map);
    }

    const newGameState = {
        [players[0]]: pos1,
        [players[1]]: pos2,
        bullets: null,
        winner: null,
        restart: { [players[0]]: false, [players[1]]: false }
    };

    await set(ref(db, `rooms/${currentRoomCode}/gameState`), newGameState);
    startGame();
}

function findFreePosition(obstacles, radius = 20, maxAttempts = 2000) {
    const margin = radius;
    const maxX = window.innerWidth - margin;
    const maxY = window.innerHeight - margin;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = margin + Math.random() * (maxX - margin);
        const y = margin + Math.random() * (maxY - margin);
        if (isPositionFree(x, y, radius, obstacles)) {
            return { x, y };
        }
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export function loadMap(roomCode) {
    onValue(ref(db, `rooms/${roomCode}/map`), (snap) => {
        obstacles = snap.val() || [];
        console.log('Map loaded:', obstacles.length, 'obstacles');
    }, { onlyOnce: true });
}

function gameLoop(timestamp) {
    if (!gameActive) return;
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    const deltaTime = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    updateGame(deltaTime);
    updateBullets(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
    if (!currentRoomCode || !currentPlayerNick || !canvas) return;
    const move = PLAYER_SPEED * deltaTime;
    let newX = myPos.x;
    let newY = myPos.y;

    if (keys['ArrowUp'] || keys['KeyW']) { newY -= move; lastMoveDir = { x: 0, y: -1 }; }
    if (keys['ArrowDown'] || keys['KeyS']) { newY += move; lastMoveDir = { x: 0, y: 1 }; }
    if (keys['ArrowLeft'] || keys['KeyA']) { newX -= move; lastMoveDir = { x: -1, y: 0 }; }
    if (keys['ArrowRight'] || keys['KeyD']) { newX += move; lastMoveDir = { x: 1, y: 0 }; }

    newX = Math.max(PLAYER_RADIUS, Math.min(canvas.width - PLAYER_RADIUS, newX));
    newY = Math.max(PLAYER_RADIUS, Math.min(canvas.height - PLAYER_RADIUS, newY));

    if (isPositionFree(newX, newY, PLAYER_RADIUS, obstacles)) {
        myPos.x = newX;
        myPos.y = newY;
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
    }
}

function updateBullets(deltaTime) {
    for (let i = myBullets.length - 1; i >= 0; i--) {
        const b = myBullets[i];
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;

        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            myBullets.splice(i, 1);
            continue;
        }

        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                myBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;

        const dx = b.x - enemyPos.x;
        const dy = b.y - enemyPos.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + BULLET_RADIUS) ** 2) {
            update(ref(db), {
                [`rooms/${currentRoomCode}/gameState/winner`]: currentPlayerNick
            });
            myBullets.splice(i, 1);
            return;
        }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;

        if (!winner) {
            const dx = b.x - myPos.x;
            const dy = b.y - myPos.y;
            if (dx * dx + dy * dy < (PLAYER_RADIUS + BULLET_RADIUS) ** 2) {
                update(ref(db), {
                    [`rooms/${currentRoomCode}/gameState/winner`]: enemyPos.owner || 'unknown'
                });
                return;
            }
        }

        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            enemyBullets.splice(i, 1);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#8B4513';
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });

    ctx.fillStyle = '#00f';
    myBullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    });

    ctx.fillStyle = '#f00';
    enemyBullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    });

    if (tankRedImg.complete && tankRedImg.naturalHeight !== 0) {
        ctx.drawImage(tankRedImg, enemyPos.x - 20, enemyPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(enemyPos.x, enemyPos.y, PLAYER_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    }

    if (tankBlueImg.complete && tankBlueImg.naturalHeight !== 0) {
        ctx.drawImage(tankBlueImg, myPos.x - 20, myPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, PLAYER_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    }
}
