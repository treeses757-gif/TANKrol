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
let bullets = [];
let powerups = [];
const POWERUP_SIZE = 20;
const POWERUP_COLORS = ['#f1c40f', '#e67e22', '#2ecc71'];
let mySpeedMultiplier = 1;
let enemySpeedMultiplier = 1;
const BASE_SPEED = 3;
let lobbyScreenEl, gameScreenEl;

function collideRectCircle(rect, circleX, circleY, radius) {
    let closestX = Math.max(rect.x, Math.min(circleX, rect.x + rect.width));
    let closestY = Math.max(rect.y, Math.min(circleY, rect.y + rect.height));
    let dx = circleX - closestX;
    let dy = circleY - closestY;
    return (dx * dx + dy * dy) < radius * radius;
}

function isPositionFree(x, y, radius = 20) {
    for (let obs of currentMap) {
        if (collideRectCircle(obs, x, y, radius)) {
            return false;
        }
    }
    return true;
}

function tryMove(oldX, oldY, newX, newY, radius = 20) {
    if (isPositionFree(newX, newY, radius)) {
        return { x: newX, y: newY };
    }
    if (isPositionFree(newX, oldY, radius)) {
        return { x: newX, y: oldY };
    }
    if (isPositionFree(oldX, newY, radius)) {
        return { x: oldX, y: newY };
    }
    return { x: oldX, y: oldY };
}

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
        if (e.code === 'Space') {
            e.preventDefault();
            shootBullet(myPos, myAngle, currentPlayerNick);
        }
        if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    setInterval(spawnPowerup, 10000);
}

export function setGameMap(map) {
    currentMap = map || [];
}

function spawnPowerup() {
    if (!canvas || !gameActive) return;
    const x = 50 + Math.random() * (canvas.width - 100);
    const y = 50 + Math.random() * (canvas.height - 100);
    if (!isPositionFree(x, y, POWERUP_SIZE/2)) return;
    const type = Math.floor(Math.random() * POWERUP_COLORS.length);
    powerups.push({ x, y, type });
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
    if (gameListener) { gameListener(); gameListener = null; }
    if (mapListener) { mapListener(); mapListener = null; }
    if (lobbyScreenEl && gameScreenEl) {
        lobbyScreenEl.classList.add('active');
        gameScreenEl.classList.remove('active');
    }
    bullets = [];
    powerups = [];
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
    updateBullets();
    updatePowerups();
    draw();
    requestAnimationFrame(gameLoop);
}

function updateGame() {
    if (!currentRoomCode || !currentPlayerNick || !canvas) return;

    let moved = false;
    let dx = 0, dy = 0;

    if (keys['ArrowUp'] || keys['KeyW']) { dy -= 1; moved = true; }
    if (keys['ArrowDown'] || keys['KeyS']) { dy += 1; moved = true; }
    if (keys['ArrowLeft'] || keys['KeyA']) { dx -= 1; moved = true; }
    if (keys['ArrowRight'] || keys['KeyD']) { dx += 1; moved = true; }

    if (moved) {
        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
        const speed = BASE_SPEED * mySpeedMultiplier;
        let newX = myPos.x + dx * speed;
        let newY = myPos.y + dy * speed;
        newX = Math.max(20, Math.min(canvas.width - 20, newX));
        newY = Math.max(20, Math.min(canvas.height - 20, newY));

        const finalPos = tryMove(myPos.x, myPos.y, newX, newY, 20);
        if (finalPos.x !== myPos.x || finalPos.y !== myPos.y) {
            const moveDx = finalPos.x - myPos.x;
            const moveDy = finalPos.y - myPos.y;
            if (moveDx !== 0 || moveDy !== 0) {
                myAngle = Math.atan2(moveDy, moveDx);
            }
            myPos = finalPos;
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
        }
    }
}

function shootBullet(pos, angle, owner) {
    const speed = 8;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    bullets.push({
        x: pos.x,
        y: pos.y,
        vx: vx,
        vy: vy,
        owner: owner,
        life: true
    });
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;

        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }

        let hitObstacle = false;
        for (let obs of currentMap) {
            if (b.x > obs.x && b.x < obs.x + obs.width &&
                b.y > obs.y && b.y < obs.y + obs.height) {
                hitObstacle = true;
                break;
            }
        }
        if (hitObstacle) {
            bullets.splice(i, 1);
            continue;
        }

        if (b.owner !== currentPlayerNick) {
            const dist = Math.hypot(b.x - myPos.x, b.y - myPos.y);
            if (dist < 20) {
                console.log('Игрок подбит!');
                bullets.splice(i, 1);
                continue;
            }
        } else {
            const dist = Math.hypot(b.x - enemyPos.x, b.y - enemyPos.y);
            if (dist < 20) {
                console.log('Враг подбит!');
                bullets.splice(i, 1);
                continue;
            }
        }
    }
}

function updatePowerups() {
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        const distToPlayer = Math.hypot(p.x - myPos.x, p.y - myPos.y);
        if (distToPlayer < 20 + POWERUP_SIZE/2) {
            applyPowerup(p.type, true);
            powerups.splice(i, 1);
            continue;
        }
        const distToEnemy = Math.hypot(p.x - enemyPos.x, p.y - enemyPos.y);
        if (distToEnemy < 20 + POWERUP_SIZE/2) {
            applyPowerup(p.type, false);
            powerups.splice(i, 1);
            continue;
        }
    }
}

function applyPowerup(type, forPlayer) {
    if (forPlayer) {
        switch(type) {
            case 0:
                mySpeedMultiplier = 2;
                setTimeout(() => mySpeedMultiplier = 1, 5000);
                break;
            case 1:
                console.log('Щит (не реализован)');
                break;
            case 2:
                console.log('Здоровье + (не реализовано)');
                break;
        }
    }
}

function drawTank(x, y, angle, isEnemy) {
    const bodyColor = isEnemy ? '#e74c3c' : '#3498db';
    const trackColor = '#7f8c8d';
    const barrelColor = '#2c3e50';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = trackColor;
    ctx.fillRect(-20, -15, 40, 30);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-15, -10, 30, 20);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, 2 * Math.PI);
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.fillStyle = barrelColor;
    ctx.fillRect(5, -3, 20, 6);

    ctx.restore();
}

function drawMap() {
    ctx.fillStyle = '#8B4513';
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    for (let obs of currentMap) {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    }
}

function drawPowerups() {
    for (let p of powerups) {
        ctx.fillStyle = POWERUP_COLORS[p.type];
        ctx.beginPath(); ctx.arc(p.x, p.y, POWERUP_SIZE/2, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
}

function drawBullets() {
    ctx.fillStyle = '#000';
    for (let b of bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 2 * Math.PI); ctx.fill();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    drawTank(enemyPos.x, enemyPos.y, enemyAngle, true);
    drawTank(myPos.x, myPos.y, myAngle, false);
    drawPowerups();
    drawBullets();
}
