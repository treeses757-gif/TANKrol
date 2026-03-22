import { db } from './firebase.js';
import { ref, onValue, update, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { isPositionFree, circleRectCollide } from './utils.js';
import { initMobileControls, getJoystickDirection, removeMobileControls, setActivateAbilityCallback } from './mobile-controls.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, PLAYER_SPEED, BULLET_SPEED, TANK_SIZE, TANK_HALF, BULLET_RADIUS } from './config.js';
import { tanks } from './tanks.js';
import { initSimpleAbilities, activateSimpleAbility, hasActiveEffect, updateEffects, getPhantomPosition } from './abilities-simple.js';

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
let myAbilityCooldown = 0;
const ABILITY_COOLDOWN = 5; // секунд
let lastAbilityTime = 0;

// Для эффектов
let boomerangBullets = [];
let phantomImage = null;
let reflectActive = false;

let cameraX = 0, cameraY = 0;
let useCamera = false;

let enemyTurretDir = { x: 0, y: 1 };

const SHOOT_DELAY = 0.5;
let lastShootTime = 0;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let mobileControlsActive = false;

let lobbyScreenEl, gameScreenEl, gameOverScreenEl, gameoverMessageEl, restartBtnEl, restartStatusEl;

function toScreenX(vx) {
    if (useCamera) {
        return ((vx - cameraX) / VIEWPORT_WIDTH) * canvas.width;
    } else {
        return (vx / VIRTUAL_WIDTH) * canvas.width;
    }
}
function toScreenY(vy) {
    if (useCamera) {
        return ((vy - cameraY) / VIEWPORT_HEIGHT) * canvas.height;
    } else {
        return (vy / VIRTUAL_HEIGHT) * canvas.height;
    }
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
        if (e.code === 'Space') {
            e.preventDefault();
            shoot();
        }
        if (e.code === 'KeyE') {
            e.preventDefault();
            activateTankAbility();
        }
        if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    if (restartBtnEl) {
        restartBtnEl.addEventListener('click', () => {
            if (!currentRoomCode || !currentPlayerNick) return;
            update(ref(db), {
                [`rooms/${currentRoomCode}/gameState/restart/${currentPlayerNick}`]: true
            });
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
        key: bulletKey
    };
    myBullets.push(bullet);
    update(ref(db), {
        [`rooms/${currentRoomCode}/gameState/bullets/${bulletKey}`]: bullet
    });
}

async function activateTankAbility() {
    if (!gameActive) return;
    const now = Date.now() / 1000;
    if (now - lastAbilityTime < ABILITY_COOLDOWN) return;
    lastAbilityTime = now;
    
    const abilityCallbacks = {
        onPhantom: (pos) => {
            phantomImage = { pos: { ...pos }, timer: 8 };
        },
        onBoomerang: (pos, dir) => {
            const bullet = {
                x: pos.x,
                y: pos.y,
                vx: dir.x * BULLET_SPEED,
                vy: dir.y * BULLET_SPEED,
                owner: currentPlayerNick,
                key: 'boomerang_' + Date.now(),
                isBoomerang: true,
                returnTimer: 0
            };
            boomerangBullets.push(bullet);
        }
    };
    activateSimpleAbility(myPos, lastMoveDir, myTank, abilityCallbacks);
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
    boomerangBullets = [];
    lastTimestamp = 0;
    winner = null;
    lastShootTime = 0;
    myAbilityCooldown = 0;
    lastAbilityTime = 0;
    reflectActive = false;
    phantomImage = null;

    myTank = tankId;
    enemyTank = enemyTankId;
    initSimpleAbilities(tankId, enemyTankId);

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

        for (let id in state) {
            if (id === 'bullets' || id === 'restart' || id === 'winner') continue;
            if (id === playerNick) myPos = state[id];
            else if (id !== 'bullets' && id !== 'restart' && id !== 'winner') {
                enemyPos = state[id];
                enemyNick = id;
            }
        }

        if (state.bullets) {
            const currentKeys = new Set();
            for (let key in state.bullets) {
                currentKeys.add(key);
                const bullet = state.bullets[key];
                if (bullet.owner !== playerNick) {
                    if (!enemyBullets.some(b => b.key === key)) {
                        enemyBullets.push({ ...bullet });
                    }
                }
            }
            enemyBullets = enemyBullets.filter(b => currentKeys.has(b.key));
        } else {
            enemyBullets = [];
        }

        if (state.winner) {
            winner = state.winner;
            if (!gameActive) return;
            if (winner === playerNick) {
                showGameOver('Вы победили!');
            } else {
                showGameOver('Вы проиграли!');
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

    const pos1 = { x: 100, y: 100 };
    const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
    const myNewPos = players[0] === currentPlayerNick ? pos1 : pos2;
    const enemyNewPos = players[0] === currentPlayerNick ? pos2 : pos1;

    myPos = myNewPos;
    enemyPos = enemyNewPos;
    myBullets = [];
    enemyBullets = [];
    boomerangBullets = [];
    lastShootTime = 0;
    winner = null;
    gameActive = true;

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
    updateBoomerangs(deltaTime);
    updateEffects();
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

    // Эффект танка-паука: игнорируем препятствия
    let canMove = true;
    if (hasActiveEffect('spider')) {
        canMove = true;
    } else {
        newX = Math.max(TANK_HALF, Math.min(VIRTUAL_WIDTH - TANK_HALF, newX));
        newY = Math.max(TANK_HALF, Math.min(VIRTUAL_HEIGHT - TANK_HALF, newY));
        canMove = isPositionFree(newX, newY, TANK_HALF, obstacles);
    }

    if (canMove) {
        if (newX !== myPos.x || newY !== myPos.y) {
            myPos.x = newX;
            myPos.y = newY;
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
        }
    }
}

function updateBullets(deltaTime) {
    if (winner) return;

    for (let b of myBullets) {
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;
    }
    for (let b of enemyBullets) {
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;
    }

    // Отражающий щит: если активен, вражеские пули отражаются
    const reflectActive = hasActiveEffect('reflect');
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        if (reflectActive) {
            const dx = b.x - myPos.x;
            const dy = b.y - myPos.y;
            if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
                // Отражаем пулю
                b.vx = -b.vx;
                b.vy = -b.vy;
                b.owner = currentPlayerNick; // меняем владельца для отрисовки
                // Пуля становится "своей" для нас, но мы не добавляем её в myBullets, просто меняем направление
                // Удаляем из enemyBullets и добавляем в myBullets
                enemyBullets.splice(i, 1);
                myBullets.push(b);
                continue;
            }
        }
    }

    // Свои пули
    for (let i = myBullets.length - 1; i >= 0; i--) {
        const b = myBullets[i];
        if (b.x < 0 || b.x > VIRTUAL_WIDTH || b.y < 0 || b.y > VIRTUAL_HEIGHT) {
            if (currentRoomCode && b.key) remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
            myBullets.splice(i, 1);
            continue;
        }
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

    // Вражеские пули (без отражения)
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                enemyBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;
        if (b.x < 0 || b.x > VIRTUAL_WIDTH || b.y < 0 || b.y > VIRTUAL_HEIGHT) {
            enemyBullets.splice(i, 1);
            continue;
        }
        const dx = b.x - myPos.x;
        const dy = b.y - myPos.y;
        if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/winner`]: enemyNick });
            gameActive = false;
            return;
        }
    }
}

function updateBoomerangs(deltaTime) {
    for (let i = 0; i < boomerangBullets.length; i++) {
        const b = boomerangBullets[i];
        b.returnTimer += deltaTime;
        if (b.returnTimer < 1.0) {
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
        const dxE = b.x - enemyPos.x;
        const dyE = b.y - enemyPos.y;
        if (dxE * dxE + dyE * dyE < (TANK_HALF + BULLET_RADIUS) ** 2) {
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/winner`]: currentPlayerNick });
            gameActive = false;
            boomerangBullets.splice(i, 1);
            return;
        }
        if (b.x < -500 || b.x > VIRTUAL_WIDTH + 500 || b.y < -500 || b.y > VIRTUAL_HEIGHT + 500) {
            boomerangBullets.splice(i, 1);
            i--;
        }
    }
}

function updatePhantom(deltaTime) {
    if (phantomImage) {
        phantomImage.timer -= deltaTime;
        if (phantomImage.timer <= 0) {
            phantomImage = null;
        }
    }
}

function updateEnemyTurret() {
    let dx = myPos.x - enemyPos.x;
    let dy = myPos.y - enemyPos.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.01) {
        enemyTurretDir = { x: dx / len, y: dy / len };
    } else {
        enemyTurretDir = { x: 0, y: 1 };
    }
}

function drawTank(x, y, color, direction, isPhantom = false) {
    const sx = toScreenX(x);
    const sy = toScreenY(y);
    const scaleX = getScaleX();
    const scaleY = getScaleY();
    const w = TANK_SIZE * scaleX;
    const h = TANK_SIZE * scaleY;
    const left = sx - w/2;
    const top = sy - h/2;

    if (isPhantom) {
        ctx.globalAlpha = 0.5;
    }
    ctx.fillStyle = color;
    ctx.fillRect(left, top, w, h);

    ctx.fillStyle = '#333';
    const trackHeight = 5 * scaleY;
    ctx.fillRect(left, top, w, trackHeight);
    ctx.fillRect(left, top + h - trackHeight, w, trackHeight);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, w * 0.3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2 * scaleX;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + direction.x * w * 0.6, sy + direction.y * w * 0.6);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4 * scaleX;
    ctx.stroke();
    
    if (isPhantom) {
        ctx.globalAlpha = 1;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = getScaleX();
    const scaleY = getScaleY();

    ctx.fillStyle = '#8B4513';
    obstacles.forEach(obs => {
        const sx = toScreenX(obs.x);
        const sy = toScreenY(obs.y);
        const sw = obs.width * scaleX;
        const sh = obs.height * scaleY;
        ctx.fillRect(sx, sy, sw, sh);
    });

    // Фантом (копия)
    if (phantomImage) {
        drawTank(phantomImage.pos.x, phantomImage.pos.y, '#AAAAAA', lastMoveDir, true);
    }

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
        ctx.arc(sx, sy, bulletSize, 0, 2 * Math.PI);
        ctx.fill();
    }
    for (let b of enemyBullets) {
        const sx = toScreenX(b.x);
        const sy = toScreenY(b.y);
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, bulletSize);
        grad.addColorStop(0, '#ffaa00');
        grad.addColorStop(1, '#ff5500');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, bulletSize, 0, 2 * Math.PI);
        ctx.fill();
    }
    for (let b of boomerangBullets) {
        const sx = toScreenX(b.x);
        const sy = toScreenY(b.y);
        ctx.fillStyle = '#FF00FF';
        ctx.beginPath();
        ctx.arc(sx, sy, bulletSize, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Вражеский танк
    const enemyTankColor = tanks[enemyTank]?.color || '#E53935';
    drawTank(enemyPos.x, enemyPos.y, enemyTankColor, enemyTurretDir);
    // Свой танк
    const myTankColor = tanks[myTank]?.color || '#1E88E5';
    drawTank(myPos.x, myPos.y, myTankColor, lastMoveDir);

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

        // Индикатор в углу
        const indicatorX = canvas.width - 20;
        const indicatorY = 20;
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, 8, 0, 2 * Math.PI);
        ctx.fillStyle = cooldownLeft <= 0 ? '#00ff00' : '#ff5500';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}
