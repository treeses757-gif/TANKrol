import { db } from './firebase.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let myAngle = 0;
let enemyAngle = 0;
let canvas, ctx;
let currentRoomCode = null;
let currentPlayerNick = null;
let gameListener = null;
let mapListener = null;
let currentMap = [];
let keys = {};
const BASE_SPEED = 2; // Для теста оставим 2, но если слишком быстро – уменьши до 1.5 или 1
let lobbyScreenEl, gameScreenEl;

let lastSendTime = 0;
const SEND_INTERVAL = 50;

function collideRectCircle(rect, circleX, circleY, radius) {
    let closestX = Math.max(rect.x, Math.min(circleX, rect.x + rect.width));
    let closestY = Math.max(rect.y, Math.min(circleY, rect.y + rect.height));
    let dx = circleX - closestX;
    let dy = circleY - closestY;
    return (dx * dx + dy * dy) < radius * radius;
}

function isPositionFree(x, y, radius = 20) {
    for (let obs of currentMap) {
        if (collideRectCircle(obs, x, y, radius)) return false;
    }
    return true;
}

function tryMove(oldX, oldY, newX, newY, radius = 20) {
    if (isPositionFree(newX, newY, radius)) return { x: newX, y: newY };
    if (isPositionFree(newX, oldY, radius)) return { x: newX, y: oldY };
    if (isPositionFree(oldX, newY, radius)) return { x: oldX, y: newY };
    return { x: oldX, y: oldY };
}

export function initGame(components) {
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        keys[e.code] = true;
        if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

export function setGameMap(map) { currentMap = map || []; }

function resizeCanvas() {
    if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
}

export function startGame() {
    if (!gameScreenEl || !lobbyScreenEl) return;
    lobbyScreenEl.classList.remove('active');
    gameScreenEl.classList.add('active');
    gameActive = true;
    requestAnimationFrame(gameLoop);
}

export function stopGame() {
    gameActive = false;
    if (gameListener) { gameListener(); gameListener = null; }
    if (mapListener) { mapListener(); mapListener = null; }
    if (lobbyScreenEl && gameScreenEl) {
        lobbyScreenEl.classList.add('active');
        gameScreenEl.classList.remove('active');
    }
    currentMap = [];
}

export function setCurrentRoom(roomCode, playerNick) {
    currentRoomCode = roomCode;
    currentPlayerNick = playerNick;
    if (roomCode) {
        if (mapListener) mapListener();
        mapListener = onValue(ref(db, `rooms/${roomCode}/map`), (snap) => {
            const map = snap.val();
            if (map) setGameMap(map);
        });
    }
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

    let dx = 0, dy = 0;
    if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
    if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;

    if (dx !== 0 || dy !== 0) {
        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
        let newX = myPos.x + dx * BASE_SPEED;
        let newY = myPos.y + dy * BASE_SPEED;
        newX = Math.max(20, Math.min(canvas.width - 20, newX));
        newY = Math.max(20, Math.min(canvas.height - 20, newY));

        const finalPos = tryMove(myPos.x, myPos.y, newX, newY, 20);
        if (finalPos.x !== myPos.x || finalPos.y !== myPos.y) {
            const moveDx = finalPos.x - myPos.x;
            const moveDy = finalPos.y - myPos.y;
            if (moveDx !== 0 || moveDy !== 0) myAngle = Math.atan2(moveDy, moveDx);
            myPos = finalPos;

            const now = Date.now();
            if (now - lastSendTime > SEND_INTERVAL) {
                update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
                lastSendTime = now;
            }
        }
    }
}

function drawTank(x, y, angle, isEnemy) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = isEnemy ? '#e74c3c' : '#3498db';
    ctx.fillRect(-15, -10, 30, 20);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(5, -3, 20, 6);
    ctx.restore();
}

function drawMap() {
    ctx.fillStyle = '#8B4513';
    for (let obs of currentMap) {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    drawTank(enemyPos.x, enemyPos.y, enemyAngle, true);
    drawTank(myPos.x, myPos.y, myAngle, false);
}
