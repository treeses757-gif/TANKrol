import { db } from './firebase.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { tankBlueImg, tankRedImg } from './textures.js';
import { isPositionFree } from './utils.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let canvas, ctx;
let currentRoomCode = null;
let currentPlayerNick = null;
let gameListener = null;
let keys = {};
let obstacles = [];
let lastTimestamp = 0;
const PLAYER_SPEED = 200; // пикселей в секунду

let lobbyScreenEl, gameScreenEl;

export function initGame(components) {
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        keys[e.code] = true;
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

export function startGame() {
    if (!gameScreenEl || !lobbyScreenEl) {
        console.error('Game screens not initialized');
        return;
    }
    lobbyScreenEl.classList.remove('active');
    gameScreenEl.classList.add('active');
    gameActive = true;
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
        for (let id in state) {
            if (id === playerNick) myPos = state[id];
            else enemyPos = state[id];
        }
    });
}

export function loadMap(roomCode) {
    onValue(ref(db, `rooms/${roomCode}/map`), (snap) => {
        obstacles = snap.val() || [];
        console.log('Map loaded:', obstacles);
    }, { onlyOnce: true });
}

function gameLoop(timestamp) {
    if (!gameActive) return;
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    const deltaTime = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    updateGame(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
    if (!currentRoomCode || !currentPlayerNick || !canvas) return;
    const move = PLAYER_SPEED * deltaTime;
    let newX = myPos.x;
    let newY = myPos.y;

    if (keys['ArrowUp'] || keys['KeyW']) newY -= move;
    if (keys['ArrowDown'] || keys['KeyS']) newY += move;
    if (keys['ArrowLeft'] || keys['KeyA']) newX -= move;
    if (keys['ArrowRight'] || keys['KeyD']) newX += move;

    const radius = 20;
    newX = Math.max(radius, Math.min(canvas.width - radius, newX));
    newY = Math.max(radius, Math.min(canvas.height - radius, newY));

    if (isPositionFree(newX, newY, radius, obstacles)) {
        myPos.x = newX;
        myPos.y = newY;
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Отрисовка препятствий
    ctx.fillStyle = '#8B4513';
    obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });

    // Вражеский танк (красный)
    if (tankRedImg.complete && tankRedImg.naturalHeight !== 0) {
        ctx.drawImage(tankRedImg, enemyPos.x - 20, enemyPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(enemyPos.x, enemyPos.y, 20, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Свой танк (синий)
    if (tankBlueImg.complete && tankBlueImg.naturalHeight !== 0) {
        ctx.drawImage(tankBlueImg, myPos.x - 20, myPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(myPos.x, myPos.y, 20, 0, 2 * Math.PI);
        ctx.fill();
    }
}
