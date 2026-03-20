import { db } from './firebase.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
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
const PLAYER_SPEED = 200;
const BULLET_SPEED = 400;
const BULLET_RADIUS = 5;
const PLAYER_RADIUS = 20;

let lobbyScreenEl, gameScreenEl;

export function initGame(components) {
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
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
        owner: currentPlayerNick
    };
    myBullets.push(bullet);
    // Отправляем в Firebase с уникальным ключом
    const bulletKey = `bullet_${Date.now()}_${Math.random()}`;
    update(ref(db), {
        [`rooms/${currentRoomCode}/gameState/bullets/${bulletKey}`]: bullet
    });
}

export function startGame() {
    if (!gameScreenEl || !lobbyScreenEl) return;
    lobbyScreenEl.classList.remove('active');
    gameScreenEl.classList.add('active');
    gameActive = true;
    myBullets = [];
    enemyBullets = [];
    lastTimestamp = 0;
    requestAnimationFrame(gameLoop);
}

export function stopGame() {
    gameActive = false;
    if (gameListener) {
        gameListener();
        gameListener = null;
    }
    if (lobbyScreenEl && gameScreenEl) {
        lobbyScreenEl.classList.add('active');
        gameScreenEl.classList.remove('active');
    }
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
        // Обновляем позиции игроков
        for (let id in state) {
            if (id === 'bullets') continue;
            if (id === playerNick) myPos = state[id];
            else if (id !== 'bullets') enemyPos = state[id];
        }
        // Обновляем пули противника (все, кроме своих)
        if (state.bullets) {
            enemyBullets = Object.values(state.bullets).filter(b => b.owner !== playerNick);
        }
    });
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
    // Двигаем свои пули
    for (let i = myBullets.length - 1; i >= 0; i--) {
        const b = myBullets[i];
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;

        // Границы
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            myBullets.splice(i, 1);
            continue;
        }

        // Столкновение с препятствиями
        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                myBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;

        // Попадание во врага
        const dx = b.x - enemyPos.x;
        const dy = b.y - enemyPos.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + BULLET_RADIUS) ** 2) {
            alert('Вы победили!');
            stopGame();
            return;
        }
    }

    // Двигаем вражеские пули и проверяем попадание в нас
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;

        const dx = b.x - myPos.x;
        const dy = b.y - myPos.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + BULLET_RADIUS) ** 2) {
            alert('Вы проиграли!');
            stopGame();
            return;
        }

        // Удаляем, если улетели за экран
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            enemyBullets.splice(i, 1);
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Препятствия
    ctx.fillStyle = '#8B4513';
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });

    // Свои пули (синие)
    ctx.fillStyle = '#00f';
    myBullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Вражеские пули (красные)
    ctx.fillStyle = '#f00';
    enemyBullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    });

    // Вражеский танк
    if (tankRedImg.complete && tankRedImg.naturalHeight !== 0) {
        ctx.drawImage(tankRedImg, enemyPos.x - 20, enemyPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(enemyPos.x, enemyPos.y, PLAYER_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Свой танк
    if (tankBlueImg.complete && tankBlueImg.naturalHeight !== 0) {
        ctx.drawImage(tankBlueImg, myPos.x - 20, myPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, PLAYER_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
    }
}
