import { db } from './firebase.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { tankBlueImg, tankRedImg } from './textures.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let canvas, ctx;
let currentRoomCode = null;
let currentPlayerNick = null;
let gameListener = null;
let keys = {};

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

function gameLoop() {
    if (!gameActive) return;
    updateGame();
    draw();
    requestAnimationFrame(gameLoop);
}

function updateGame() {
    if (!currentRoomCode || !currentPlayerNick || !canvas) return;
    const speed = 3;
    let moved = false;
    if (keys['ArrowUp'] || keys['KeyW']) { myPos.y -= speed; moved = true; }
    if (keys['ArrowDown'] || keys['KeyS']) { myPos.y += speed; moved = true; }
    if (keys['ArrowLeft'] || keys['KeyA']) { myPos.x -= speed; moved = true; }
    if (keys['ArrowRight'] || keys['KeyD']) { myPos.x += speed; moved = true; }
    if (moved) {
        myPos.x = Math.max(20, Math.min(canvas.width - 20, myPos.x));
        myPos.y = Math.max(20, Math.min(canvas.height - 20, myPos.y));
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false; // <--- отключаем сглаживание текстур

    if (tankRedImg.complete && tankRedImg.naturalHeight !== 0) {
        ctx.drawImage(tankRedImg, enemyPos.x - 20, enemyPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'red';
        ctx.beginPath(); ctx.arc(enemyPos.x, enemyPos.y, 20, 0, 2 * Math.PI); ctx.fill();
    }

    if (tankBlueImg.complete && tankBlueImg.naturalHeight !== 0) {
        ctx.drawImage(tankBlueImg, myPos.x - 20, myPos.y - 20, 40, 40);
    } else {
        ctx.fillStyle = 'blue';
        ctx.beginPath(); ctx.arc(myPos.x, myPos.y, 20, 0, 2 * Math.PI); ctx.fill();
    }
}
