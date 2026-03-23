// game.js (исправленная версия)
import { db } from './firebase.js';
import { ref, onValue, update, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { isPositionFree, circleRectCollide } from './utils.js';
import { initMobileControls, getJoystickDirection, removeMobileControls, setActivateAbilityCallback } from './mobile-controls.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, PLAYER_SPEED, BULLET_SPEED, TANK_SIZE, TANK_HALF, BULLET_RADIUS } from './config.js';
import { tanks } from './tanks.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let enemyNick = null;
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
let myTank = null;
let enemyTank = null;

// Эффекты способностей
let phantomActive = false;
let phantomData = null;          // { startPos, path, lastShoot }
let reflectActive = false;
let spiderActive = false;
let lastAbilityTime = 0;
const ABILITY_COOLDOWN = 8;

let cameraX = 0, cameraY = 0;
let useCamera = false;

let enemyTurretDir = { x: 0, y: 1 };

const SHOOT_DELAY = 0.5;
let lastShootTime = 0;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let mobileControlsActive = false;

let lobbyScreenEl, gameScreenEl, gameOverScreenEl, gameoverMessageEl, restartBtnEl, restartStatusEl;

// Вспомогательные функции отрисовки
function drawTank(x, y, tankId, direction, isPhantom = false) {
    const tank = tanks[tankId];
    if (!tank) return;
    const sx = toScreenX(x);
    const sy = toScreenY(y);
    const scaleX = getScaleX();
    const scaleY = getScaleY();
    if (isPhantom) ctx.globalAlpha = 0.5;
    ctx.fillStyle = tank.color;
    const bodyW = tank.body.width * scaleX;
    const bodyH = tank.body.height * scaleY;
    ctx.fillRect(sx - bodyW/2, sy - bodyH/2 + tank.body.offsetY * scaleY, bodyW, bodyH);
    ctx.fillStyle = '#333';
    const trackW = tank.tracks.width * scaleX;
    const trackH = tank.tracks.height * scaleY;
    ctx.fillRect(sx - trackW/2, sy - trackH/2 + tank.tracks.offsetY * scaleY, trackW, trackH);
    ctx.fillRect(sx - trackW/2, sy - trackH/2 - trackH*2 + tank.tracks.offsetY * scaleY, trackW, trackH);
    const turretR = tank.turret.radius * scaleX;
    ctx.fillStyle = tank.color;
    ctx.beginPath();
    ctx.arc(sx, sy + tank.turret.offsetY * scaleY, turretR, 0, 2*Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2 * scaleX;
    ctx.stroke();
    const gunLen = tank.gun.length * scaleX;
    const gunW = tank.gun.width * scaleX;
    ctx.beginPath();
    ctx.moveTo(sx, sy + tank.turret.offsetY * scaleY);
    ctx.lineTo(sx + direction.x * gunLen, sy + tank.turret.offsetY * scaleY + direction.y * gunLen);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = gunW;
    ctx.stroke();
    if (isPhantom) ctx.globalAlpha = 1;
}

function toScreenX(vx) {
    if (useCamera) return ((vx - cameraX) / VIEWPORT_WIDTH) * canvas.width;
    else return (vx / VIRTUAL_WIDTH) * canvas.width;
}
function toScreenY(vy) {
    if (useCamera) return ((vy - cameraY) / VIEWPORT_HEIGHT) * canvas.height;
    else return (vy / VIRTUAL_HEIGHT) * canvas.height;
}
function getScaleX() {
    return useCamera ? canvas.width / VIEWPORT_WIDTH : canvas.width / VIRTUAL_WIDTH;
}
function getScaleY() {
    return useCamera ? canvas.height / VIEWPORT_HEIGHT : canvas.height / VIRTUAL_HEIGHT;
}

export function initGame(components) {
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
    gameOverScreenEl = components.gameOverScreen;
    gameoverMessageEl = components.gameoverMessage;
    restartBtnEl = components.restartBtn;
    restartStatusEl = components.restartStatus;

    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    useCamera = !isMobile;

    canvas.addEventListener('touchstart', (e) => e.preventDefault());
    canvas.addEventListener('touchmove', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        keys[e.code] = true;
        if (e.code === 'Space') { e.preventDefault(); shoot(); }
        if (e.code === 'KeyE') { e.preventDefault(); activateTankAbility(); }
        if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    if (restartBtnEl) {
        restartBtnEl.addEventListener('click', () => {
            if (!currentRoomCode || !currentPlayerNick) return;
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/restart/${currentPlayerNick}`]: true });
            restartBtnEl.disabled = true;
            restartStatusEl.textContent = 'Ожидание соперника...';
        });
    }
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

function shoot() {
    if (!gameActive || !currentRoomCode) return;
    const now = Date.now() / 1000;
    if (now - lastShootTime < SHOOT_DELAY) return;
    lastShootTime = now;

    const bulletKey = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const bullet = {
        x: myPos.x,
        y: myPos.y,
        vx: lastMoveDir.x * BULLET_SPEED,
        vy: lastMoveDir.y * BULLET_SPEED,
        owner: currentPlayerNick,
        key: bulletKey,
        type: 'normal'          // добавим тип
    };
    myBullets.push(bullet);
    update(ref(db), { [`rooms/${currentRoomCode}/gameState/bullets/${bulletKey}`]: bullet });
}

async function activateTankAbility() {
    if (!gameActive) return;
    const now = Date.now() / 1000;
    if (now - lastAbilityTime < ABILITY_COOLDOWN) return;
    lastAbilityTime = now;

    const tankId = myTank;
    if (!tankId) return;

    switch (tankId) {
        case 'phantom':
            phantomActive = true;
            phantomData = {
                startPos: { ...myPos },
                path: [{ ...myPos, dir: { ...lastMoveDir } }],
                lastShoot: 0
            };
            setTimeout(() => { phantomActive = false; }, 8000);
            break;
        case 'guardian':
            reflectActive = true;
            setTimeout(() => { reflectActive = false; }, 4000);
            break;
        case 'spider':
            spiderActive = true;
            setTimeout(() => { spiderActive = false; }, 5000);
            break;
        case 'boomer':
            // Создаём бумеранг и отправляем в Firebase
            const bulletKey = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const boomerangBullet = {
                x: myPos.x,
                y: myPos.y,
                vx: lastMoveDir.x * BULLET_SPEED,
                vy: lastMoveDir.y * BULLET_SPEED,
                owner: currentPlayerNick,
                key: bulletKey,
                type: 'boomerang',
                startTime: Date.now() / 1000,
                startPos: { x: myPos.x, y: myPos.y },
                startDir: { x: lastMoveDir.x, y: lastMoveDir.y }
            };
            myBullets.push(boomerangBullet);
            await update(ref(db), { [`rooms/${currentRoomCode}/gameState/bullets/${bulletKey}`]: boomerangBullet });
            break;
    }

    // Синхронизируем активацию способности (чтобы противник видел эффекты)
    await update(ref(db), {
        [`rooms/${currentRoomCode}/gameState/abilityActivation`]: {
            player: currentPlayerNick,
            ability: tankId,
            timestamp: now
        }
    });
}

export function setTanks(myNick, myTankId, enemyNickParam, enemyTankId) {
    myTank = myTankId;
    enemyNick = enemyNickParam;
    enemyTank = enemyTankId;
}

export async function startGame(roomCode, playerNick, tankId, enemyTankId) {
    if (!gameScreenEl || !lobbyScreenEl) return;

    if (isMobile && window.innerWidth < window.innerHeight) {
        alert('Пожалуйста, поверните устройство горизонтально');
        return;
    }

    lobbyScreenEl.classList.remove('active');
    gameScreenEl.classList.add('active');
    gameOverScreenEl.classList.remove('active');
    gameActive = true;
    myBullets = [];
    enemyBullets = [];
    lastTimestamp = 0;
    winner = null;
    lastShootTime = 0;
    phantomActive = false;
    reflectActive = false;
    spiderActive = false;
    lastAbilityTime = 0;

    if (isMobile && !document.getElementById('mobile-controls')) {
        initMobileControls(canvas, shoot);
        setActivateAbilityCallback(() => activateTankAbility());
        mobileControlsActive = true;
    }

    requestAnimationFrame(gameLoop);
}

export function stopGame() {
    gameActive = false;
    if (isMobile && mobileControlsActive) {
        removeMobileControls();
        mobileControlsActive = false;
    }
}

function showGameOver(message) {
    gameActive = false;
    gameScreenEl.classList.remove('active');
    gameOverScreenEl.classList.add('active');
    gameoverMessageEl.textContent = message;
    if (restartBtnEl) restartBtnEl.disabled = false;
    if (restartStatusEl) restartStatusEl.textContent = '';
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

        // Обновляем позиции: НЕ перезаписываем свою, только врага
        for (let id in state) {
            if (id === playerNick) continue; // игнорируем свою позицию
            if (id !== 'bullets' && id !== 'restart' && id !== 'winner' && id !== 'abilityActivation') {
                enemyPos = state[id];
            }
        }

        // Обработка пуль
        if (state.bullets) {
            const currentKeys = new Set();
            for (let key in state.bullets) {
                currentKeys.add(key);
                const bullet = state.bullets[key];
                if (bullet.owner !== playerNick) {
                    if (!enemyBullets.some(b => b.key === key)) {
                        enemyBullets.push({ ...bullet });
                    }
                } else {
                    // Если это наша пуля, но её нет в myBullets, добавляем (например, после перезапуска)
                    if (!myBullets.some(b => b.key === key)) {
                        myBullets.push({ ...bullet });
                    }
                }
            }
            enemyBullets = enemyBullets.filter(b => currentKeys.has(b.key));
            myBullets = myBullets.filter(b => currentKeys.has(b.key));
        } else {
            enemyBullets = [];
            myBullets = [];
        }

        // Обработка активации способностей соперника
        if (state.abilityActivation && state.abilityActivation.player !== playerNick) {
            const ability = state.abilityActivation.ability;
            if (ability === 'guardian') {
                reflectActive = true;
                setTimeout(() => { reflectActive = false; }, 4000);
            } else if (ability === 'spider') {
                spiderActive = true;
                setTimeout(() => { spiderActive = false; }, 5000);
            }
            // Удаляем запись, чтобы не применять повторно
            update(ref(db), { [`rooms/${code}/gameState/abilityActivation`]: null });
        }

        if (state.winner) {
            winner = state.winner;
            if (!gameActive) return;
            if (winner === playerNick) showGameOver('Вы победили!');
            else showGameOver('Вы проиграли!');
        }

        if (state.restart) {
            const players = Object.keys(state).filter(k => k !== 'bullets' && k !== 'restart' && k !== 'winner' && k !== 'abilityActivation');
            if (players.length === 2) {
                const bothReady = state.restart[players[0]] && state.restart[players[1]];
                if (bothReady) restartGame();
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

    const pos1 = { x: 100, y: 100 };
    const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
    const myNewPos = players[0] === currentPlayerNick ? pos1 : pos2;
    const enemyNewPos = players[0] === currentPlayerNick ? pos2 : pos1;

    myPos = myNewPos;
    enemyPos = enemyNewPos;
    myBullets = [];
    enemyBullets = [];
    lastShootTime = 0;
    winner = null;
    gameActive = true;
    phantomActive = false;
    reflectActive = false;
    spiderActive = false;

    const newGameState = {
        [players[0]]: pos1,
        [players[1]]: pos2,
        bullets: null,
        winner: null,
        restart: { [players[0]]: false, [players[1]]: false }
    };
    await set(ref(db, `rooms/${currentRoomCode}/gameState`), newGameState);

    gameScreenEl.classList.add('active');
    gameOverScreenEl.classList.remove('active');
    if (restartBtnEl) {
        restartBtnEl.disabled = false;
        restartStatusEl.textContent = '';
    }
}

export function loadMap(roomCode) {
    onValue(ref(db, `rooms/${roomCode}/map`), (snap) => {
        obstacles = snap.val() || [];
        console.log('Map loaded:', obstacles.length, 'obstacles');
    }, { onlyOnce: true });
}

function updateCamera() {
    if (!useCamera) {
        cameraX = 0;
        cameraY = 0;
        return;
    }
    cameraX = myPos.x - VIEWPORT_WIDTH / 2;
    cameraY = myPos.y - VIEWPORT_HEIGHT / 2;
    cameraX = Math.max(0, Math.min(VIRTUAL_WIDTH - VIEWPORT_WIDTH, cameraX));
    cameraY = Math.max(0, Math.min(VIRTUAL_HEIGHT - VIEWPORT_HEIGHT, cameraY));
}

function gameLoop(timestamp) {
    if (!gameActive) return;
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    const deltaTime = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    updateGame(deltaTime);
    updateBullets(deltaTime);
    updatePhantom(deltaTime);
    updateCamera();
    updateEnemyTurret();
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

    if (isMobile && mobileControlsActive) {
        const jDir = getJoystickDirection();
        if (jDir.x !== 0 || jDir.y !== 0) {
            lastMoveDir.x = jDir.x;
            lastMoveDir.y = jDir.y;
            newX += jDir.x * move;
            newY += jDir.y * move;
        }
    }

    if (!spiderActive) {
        newX = Math.max(TANK_HALF, Math.min(VIRTUAL_WIDTH - TANK_HALF, newX));
        newY = Math.max(TANK_HALF, Math.min(VIRTUAL_HEIGHT - TANK_HALF, newY));
        if (!isPositionFree(newX, newY, TANK_HALF, obstacles)) return;
    } else {
        newX = Math.max(0, Math.min(VIRTUAL_WIDTH, newX));
        newY = Math.max(0, Math.min(VIRTUAL_HEIGHT, newY));
    }

    if (newX !== myPos.x || newY !== myPos.y) {
        myPos.x = newX;
        myPos.y = newY;
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
    }
}

function updateBullets(deltaTime) {
    if (winner) return;

    // Движение пуль
    for (let b of myBullets) {
        if (b.type === 'boomerang') {
            // Бумеранг: летит 1 секунду вперёд, потом возвращается
            const now = Date.now() / 1000;
            const age = now - (b.startTime || now);
            if (age < 1.0) {
                b.x += b.vx * deltaTime;
                b.y += b.vy * deltaTime;
            } else {
                const dx = myPos.x - b.x;
                const dy = myPos.y - b.y;
                const len = Math.hypot(dx, dy);
                if (len > 0.01) {
                    b.vx = (dx / len) * BULLET_SPEED;
                    b.vy = (dy / len) * BULLET_SPEED;
                }
                b.x += b.vx * deltaTime;
                b.y += b.vy * deltaTime;
            }
        } else {
            b.x += b.vx * deltaTime;
            b.y += b.vy * deltaTime;
        }
    }
    for (let b of enemyBullets) {
        if (b.type === 'boomerang') {
            const now = Date.now() / 1000;
            const age = now - (b.startTime || now);
            if (age < 1.0) {
                b.x += b.vx * deltaTime;
                b.y += b.vy * deltaTime;
            } else {
                const dx = myPos.x - b.x;
                const dy = myPos.y - b.y;
                const len = Math.hypot(dx, dy);
                if (len > 0.01) {
                    b.vx = (dx / len) * BULLET_SPEED;
                    b.vy = (dy / len) * BULLET_SPEED;
                }
                b.x += b.vx * deltaTime;
                b.y += b.vy * deltaTime;
            }
        } else {
            b.x += b.vx * deltaTime;
            b.y += b.vy * deltaTime;
        }
    }

    // Отражение щита (только для вражеских пуль)
    if (reflectActive) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            const dx = b.x - myPos.x;
            const dy = b.y - myPos.y;
            if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
                // Меняем направление и владельца
                b.vx = -b.vx;
                b.vy = -b.vy;
                b.owner = currentPlayerNick;
                // Обновляем в Firebase
                if (currentRoomCode && b.key) {
                    update(ref(db), `rooms/${currentRoomCode}/gameState/bullets/${b.key}`, {
                        vx: b.vx,
                        vy: b.vy,
                        owner: b.owner
                    });
                }
                // Переносим в свои пули
                enemyBullets.splice(i, 1);
                myBullets.push(b);
            }
        }
    }

    // Свои пули
    for (let i = myBullets.length - 1; i >= 0; i--) {
        const b = myBullets[i];
        // Удаление за пределами
        if (b.x < 0 || b.x > VIRTUAL_WIDTH || b.y < 0 || b.y > VIRTUAL_HEIGHT) {
            if (currentRoomCode && b.key) remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
            myBullets.splice(i, 1);
            continue;
        }
        // Столкновение с препятствиями
        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                if (currentRoomCode && b.key) remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
                myBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;
        // Попадание в противника
        const dx = b.x - enemyPos.x;
        const dy = b.y - enemyPos.y;
        if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
            if (currentRoomCode && b.key) remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
            myBullets.splice(i, 1);
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/winner`]: currentPlayerNick });
            gameActive = false;
            return;
        }
    }

    // Вражеские пули
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        // Столкновение с препятствиями
        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                if (currentRoomCode && b.key) remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
                enemyBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;
        // Удаление за пределами
        if (b.x < 0 || b.x > VIRTUAL_WIDTH || b.y < 0 || b.y > VIRTUAL_HEIGHT) {
            if (currentRoomCode && b.key) remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
            enemyBullets.splice(i, 1);
            continue;
        }
        // Попадание в меня
        const dx = b.x - myPos.x;
        const dy = b.y - myPos.y;
        if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/winner`]: enemyNick });
            gameActive = false;
            return;
        }
    }
}

function updatePhantom(deltaTime) {
    if (!phantomActive) return;
    if (!phantomData) return;
    phantomData.path.push({ ...myPos, dir: { ...lastMoveDir } });
    if (phantomData.path.length > 100) phantomData.path.shift();

    const now = Date.now() / 1000;
    if (now - phantomData.lastShoot > 2 && phantomData.path.length > 0) {
        const lastPos = phantomData.path[phantomData.path.length - 1];
        const bulletKey = Date.now() + '_phantom_' + Math.random().toString(36).substr(2, 5);
        const bullet = {
            x: lastPos.x,
            y: lastPos.y,
            vx: lastPos.dir.x * BULLET_SPEED,
            vy: lastPos.dir.y * BULLET_SPEED,
            owner: currentPlayerNick,
            key: bulletKey,
            type: 'normal'
        };
        myBullets.push(bullet);
        // Отправляем в Firebase, чтобы противник видел пули фантома
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/bullets/${bulletKey}`]: bullet });
        phantomData.lastShoot = now;
    }
}

function updateEnemyTurret() {
    let dx = myPos.x - enemyPos.x;
    let dy = myPos.y - enemyPos.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) enemyTurretDir = { x: dx / len, y: dy / len };
    else enemyTurretDir = { x: 0, y: 1 };
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = getScaleX();
    const scaleY = getScaleY();

    // Препятствия
    ctx.fillStyle = '#8B4513';
    obstacles.forEach(obs => {
        const sx = toScreenX(obs.x);
        const sy = toScreenY(obs.y);
        ctx.fillRect(sx, sy, obs.width * scaleX, obs.height * scaleY);
    });

    // Пули
    const bulletSize = BULLET_RADIUS * scaleX * 1.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    for (let b of myBullets) {
        const sx = toScreenX(b.x);
        const sy = toScreenY(b.y);
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, bulletSize);
        grad.addColorStop(0, '#ffaa00');
        grad.addColorStop(1, '#ff5500');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, bulletSize, 0, 2*Math.PI);
        ctx.fill();
    }
    for (let b of enemyBullets) {
        const sx = toScreenX(b.x);
        const sy = toScreenY(b.y);
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.arc(sx, sy, bulletSize, 0, 2*Math.PI);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Фантомная копия
    if (phantomActive && phantomData && phantomData.path.length > 0) {
        const steps = Math.min(10, phantomData.path.length);
        for (let i = 0; i < steps; i++) {
            const p = phantomData.path[phantomData.path.length - 1 - i];
            if (p) drawTank(p.x, p.y, myTank, p.dir, true);
        }
    }

    // Танки
    drawTank(enemyPos.x, enemyPos.y, enemyTank, enemyTurretDir);
    drawTank(myPos.x, myPos.y, myTank, lastMoveDir);

    // Интерфейс способности
    const now = Date.now() / 1000;
    const cooldownLeft = Math.max(0, ABILITY_COOLDOWN - (now - lastAbilityTime));
    const tankInfo = tanks[myTank];
    if (tankInfo) {
        ctx.font = '16px Arial';
        ctx.fillStyle = 'white';
        ctx.shadowBlur = 0;
        ctx.fillText(`Танк: ${tankInfo.name}`, canvas.width - 200, 30);
        ctx.fillText(`Способность: ${tankInfo.abilityName}`, canvas.width - 200, 55);
        if (cooldownLeft > 0) {
            ctx.fillStyle = 'orange';
            ctx.fillText(`Кулдаун: ${cooldownLeft.toFixed(1)}с`, canvas.width - 200, 80);
        } else {
            ctx.fillStyle = 'lightgreen';
            ctx.fillText('Готово (E)', canvas.width - 200, 80);
        }
        const indicatorX = canvas.width - 20;
        const indicatorY = 20;
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, 8, 0, 2*Math.PI);
        ctx.fillStyle = cooldownLeft <= 0 ? '#00ff00' : '#ff5500';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
