import { db } from './firebase.js';
import { ref, onValue, update } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let myAngle = 0;          // угол поворота танка игрока (радианы)
let enemyAngle = 0;       // угол поворота танка врага

let canvas, ctx;
let currentRoomCode = null;
let currentPlayerNick = null;
let gameListener = null;
let keys = {};

// Пули
let bullets = [];

// Баффы
let powerups = [];
const POWERUP_SIZE = 20;
const POWERUP_COLORS = ['#f1c40f', '#e67e22', '#2ecc71']; // жёлтый, оранжевый, зелёный

// Временные эффекты
let mySpeedMultiplier = 1;
let enemySpeedMultiplier = 1;
const BASE_SPEED = 3;

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
        // Стрельба по пробелу
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

    // Создаём несколько баффов для теста
    spawnPowerup();
    setInterval(spawnPowerup, 10000); // каждые 10 секунд
}

function spawnPowerup() {
    if (!canvas || !gameActive) return;
    const x = 50 + Math.random() * (canvas.width - 100);
    const y = 50 + Math.random() * (canvas.height - 100);
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
    if (gameListener) {
        gameListener();
        gameListener = null;
    }
    if (lobbyScreenEl && gameScreenEl) {
        lobbyScreenEl.classList.add('active');
        gameScreenEl.classList.remove('active');
    }
    bullets = [];
    powerups = [];
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
            if (id === playerNick) {
                myPos = state[id];
                // Угол врага мы не получаем, он уйдёт в локальный просчёт
            } else {
                enemyPos = state[id];
            }
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
        // Нормализуем диагональную скорость
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707; // 1/√2
            dy *= 0.707;
        }
        const speed = BASE_SPEED * mySpeedMultiplier;
        myPos.x += dx * speed;
        myPos.y += dy * speed;
        myPos.x = Math.max(20, Math.min(canvas.width - 20, myPos.x));
        myPos.y = Math.max(20, Math.min(canvas.height - 20, myPos.y));

        // Вычисляем угол поворота танка по направлению движения
        if (dx !== 0 || dy !== 0) {
            myAngle = Math.atan2(dy, dx);
        }

        // Отправляем позицию в Firebase
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
    }

    // Вражеский угол не синхронизируется, поэтому для врага оставим прежний или будем вычислять по изменению позиции
    // Пока просто оставим как есть
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

        // Проверка выхода за границы
        if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
            bullets.splice(i, 1);
            continue;
        }

        // Проверка попадания во врага
        if (b.owner !== currentPlayerNick) { // пуля врага
            const dist = Math.hypot(b.x - myPos.x, b.y - myPos.y);
            if (dist < 20) {
                // Попадание в игрока
                console.log('Игрок подбит!');
                bullets.splice(i, 1);
                // Можно перезапустить игру или уменьшить жизни
                continue;
            }
        } else { // пуля игрока
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
        // Проверка касания игроком
        const distToPlayer = Math.hypot(p.x - myPos.x, p.y - myPos.y);
        if (distToPlayer < 20 + POWERUP_SIZE/2) {
            applyPowerup(p.type, true);
            powerups.splice(i, 1);
            continue;
        }
        // Проверка касания врагом
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
            case 0: // ускорение на 5 секунд
                mySpeedMultiplier = 2;
                setTimeout(() => { mySpeedMultiplier = 1; }, 5000);
                break;
            case 1: // щит (пока просто сброс)
                console.log('Щит активирован (не реализован)');
                break;
            case 2: // восстановление здоровья
                console.log('Здоровье + (не реализовано)');
                break;
        }
    } else {
        // Для врага можно добавить аналогично, но проще пока игнорировать
    }
}

function drawTank(x, y, angle, isEnemy) {
    const bodyColor = isEnemy ? '#e74c3c' : '#3498db';
    const trackColor = '#7f8c8d';
    const barrelColor = '#2c3e50';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Гусеницы (прямоугольники по бокам)
    ctx.fillStyle = trackColor;
    ctx.fillRect(-20, -15, 40, 30);

    // Корпус
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-15, -10, 30, 20);

    // Башня (круг)
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, 2 * Math.PI);
    ctx.fillStyle = bodyColor;
    ctx.fill();

    // Ствол (вперёд)
    ctx.fillStyle = barrelColor;
    ctx.fillRect(5, -3, 20, 6);

    ctx.restore();
}

function drawPowerups() {
    for (let p of powerups) {
        ctx.fillStyle = POWERUP_COLORS[p.type];
        ctx.beginPath();
        ctx.arc(p.x, p.y, POWERUP_SIZE/2, 0, 2 * Math.PI);
        ctx.fill();
        // Обводка
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawBullets() {
    ctx.fillStyle = '#000';
    for (let b of bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Враг
    drawTank(enemyPos.x, enemyPos.y, enemyAngle, true);
    // Игрок
    drawTank(myPos.x, myPos.y, myAngle, false);

    drawPowerups();
    drawBullets();
}
