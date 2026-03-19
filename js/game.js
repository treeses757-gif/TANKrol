// Временный упрощённый код для проверки поворота
import { db } from './firebase.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let myAngle = 0;
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
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        keys[e.code] = true;
        e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keys[e.code] = false);
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

function resizeCanvas() {
    if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
}

export function startGame() {
    lobbyScreenEl.classList.remove('active');
    gameScreenEl.classList.add('active');
    gameActive = true;
    requestAnimationFrame(gameLoop);
}

export function stopGame() { gameActive = false; }
export function setCurrentRoom(rc, pn) { currentRoomCode = rc; currentPlayerNick = pn; }
export function listenGameState(code, pn) {
    gameListener = onValue(ref(db, `rooms/${code}/gameState`), (snap) => {
        let state = snap.val();
        if (!state) return;
        for (let id in state) {
            if (id === pn) myPos = state[id];
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
    let dx = 0, dy = 0, moved = false;
    if (keys['ArrowUp'] || keys['KeyW']) { dy -= 1; moved = true; }
    if (keys['ArrowDown'] || keys['KeyS']) { dy += 1; moved = true; }
    if (keys['ArrowLeft'] || keys['KeyA']) { dx -= 1; moved = true; }
    if (keys['ArrowRight'] || keys['KeyD']) { dx += 1; moved = true; }
    if (moved) {
        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
        myPos.x += dx * 3; myPos.y += dy * 3;
        myPos.x = Math.max(20, Math.min(canvas.width-20, myPos.x));
        myPos.y = Math.max(20, Math.min(canvas.height-20, myPos.y));
        if (dx !== 0 || dy !== 0) myAngle = Math.atan2(dy, dx);
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Рисуем врага без поворота (для простоты)
    ctx.fillStyle = 'red';
    ctx.beginPath(); ctx.arc(enemyPos.x, enemyPos.y, 20, 0, 2*Math.PI); ctx.fill();

    // Рисуем игрока с поворотом
    ctx.save();
    ctx.translate(myPos.x, myPos.y);
    ctx.rotate(myAngle);
    ctx.fillStyle = 'blue';
    ctx.fillRect(-15, -10, 30, 20); // корпус
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, 2*Math.PI); ctx.fill(); // башня
    ctx.fillStyle = '#333';
    ctx.fillRect(5, -3, 20, 6); // ствол
    ctx.restore();
}
