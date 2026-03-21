import { db } from './firebase.js';
import { ref, onValue, update, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { isPositionFree, circleRectCollide } from './utils.js';
import { initMobileControls, getJoystickDirection, removeMobileControls } from './mobile-controls.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, PLAYER_SPEED, BULLET_SPEED, TANK_SIZE, TANK_HALF, BULLET_RADIUS } from './config.js';

// Игровое состояние
export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let enemyNick = null;               // ник врага, используется при определении победителя
let myBullets = [];                 // свои пули
let enemyBullets = [];              // пули противника
let canvas, ctx;
let currentRoomCode = null;
let currentPlayerNick = null;
let gameListener = null;
let keys = {};
let lastMoveDir = { x: 0, y: -1 };
let obstacles = [];
let lastTimestamp = 0;
let winner = null;

// Камера
let cameraX = 0, cameraY = 0;
let useCamera = false;              // true на ПК, false на мобильных

// Направление пушки врага
let enemyTurretDir = { x: 0, y: 1 };

// Задержка стрельбы
const SHOOT_DELAY = 0.5;            // секунд
let lastShootTime = 0;

// Мобильное управление
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let mobileControlsActive = false;

// Элементы DOM
let lobbyScreenEl, gameScreenEl, gameOverScreenEl, gameoverMessageEl, restartBtnEl, restartStatusEl;

// Вспомогательные функции для преобразования координат
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

// Инициализация
export function initGame(components) {
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
    gameOverScreenEl = components.gameOverScreen;
    gameoverMessageEl = components.gameoverMessage;
    restartBtnEl = components.restartBtn;
    restartStatusEl = components.restartStatus;

    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    useCamera = !isMobile;          // ПК – камера, мобильный – вся карта

    // Запрещаем скролл при касании canvas на мобильных
    canvas.addEventListener('touchstart', (e) => e.preventDefault());
    canvas.addEventListener('touchmove', (e) => e.preventDefault());

    // Клавиатура
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

    // Кнопка "Заново"
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

// Выстрел
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

// Запуск игры
export function startGame() {
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

    if (isMobile && !document.getElementById('mobile-controls')) {
        initMobileControls(canvas, shoot);
        mobileControlsActive = true;
    }

    requestAnimationFrame(gameLoop);
}

// Остановка игры
export function stopGame() {
    gameActive = false;
    if (isMobile && mobileControlsActive) {
        removeMobileControls();
        mobileControlsActive = false;
    }
}

// Показ экрана победы/поражения
function showGameOver(message) {
    gameActive = false;
    gameScreenEl.classList.remove('active');
    gameOverScreenEl.classList.add('active');
    gameoverMessageEl.textContent = message;
    if (restartBtnEl) restartBtnEl.disabled = false;
    if (restartStatusEl) restartStatusEl.textContent = '';
}

// Установка текущей комнаты и ника
export function setCurrentRoom(roomCode, playerNick) {
    currentRoomCode = roomCode;
    currentPlayerNick = playerNick;
}

// Слушатель состояния игры (позиции, пули, рестарт)
export function listenGameState(code, playerNick) {
    if (gameListener) gameListener();
    gameListener = onValue(ref(db, `rooms/${code}/gameState`), (snap) => {
        const state = snap.val();
        if (!state) return;

        // Обновляем позиции игроков и запоминаем ник врага
        for (let id in state) {
            if (id === 'bullets' || id === 'restart' || id === 'winner') continue;
            if (id === playerNick) {
                myPos = state[id];
            } else if (id !== 'bullets' && id !== 'restart' && id !== 'winner') {
                enemyPos = state[id];
                enemyNick = id;            // запоминаем ник врага для корректного определения победителя
            }
        }

        // Синхронизация пуль противника
        if (state.bullets) {
            const currentKeys = new Set();
            for (let key in state.bullets) {
                currentKeys.add(key);
                const bullet = state.bullets[key];
                if (bullet.owner !== playerNick) {
                    // Если пули ещё нет в локальном массиве – добавляем
                    if (!enemyBullets.some(b => b.key === key)) {
                        enemyBullets.push({ ...bullet });
                    }
                }
            }
            // Удаляем пули, которых больше нет в Firebase
            enemyBullets = enemyBullets.filter(b => currentKeys.has(b.key));
        } else {
            enemyBullets = [];
        }

        // Победитель
        if (state.winner) {
            winner = state.winner;
            if (!gameActive) return;
            if (winner === playerNick) {
                showGameOver('Вы победили!');
            } else {
                showGameOver('Вы проиграли!');
            }
        }

        // Рестарт
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

// Перезапуск игры (вызывается, когда оба нажали "Заново")
async function restartGame() {
    if (!currentRoomCode) return;
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    const snap = await get(roomRef);
    const data = snap.val();
    const players = Object.keys(data.players || {});
    if (players.length !== 2) return;

    // Новые позиции в противоположных углах
    const pos1 = { x: 100, y: 100 };
    const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };

    // Определяем, какая позиция наша, и сразу обновляем локальные переменные
    const myNewPos = players[0] === currentPlayerNick ? pos1 : pos2;
    const enemyNewPos = players[0] === currentPlayerNick ? pos2 : pos1;

    myPos = myNewPos;
    enemyPos = enemyNewPos;

    // Сбрасываем остальные переменные
    myBullets = [];
    enemyBullets = [];
    lastShootTime = 0;
    winner = null;
    gameActive = true;

    // Обновляем состояние в Firebase
    const newGameState = {
        [players[0]]: pos1,
        [players[1]]: pos2,
        bullets: null,
        winner: null,
        restart: { [players[0]]: false, [players[1]]: false }
    };
    await set(ref(db, `rooms/${currentRoomCode}/gameState`), newGameState);

    // Показываем игровой экран и активируем кнопку "Заново" на будущее
    gameScreenEl.classList.add('active');
    gameOverScreenEl.classList.remove('active');
    if (restartBtnEl) {
        restartBtnEl.disabled = false;
        restartStatusEl.textContent = '';
    }
}

// Загрузка карты (препятствий)
export function loadMap(roomCode) {
    onValue(ref(db, `rooms/${roomCode}/map`), (snap) => {
        obstacles = snap.val() || [];
        console.log('Map loaded:', obstacles.length, 'obstacles');
    }, { onlyOnce: true });
}

// Обновление камеры (только на ПК)
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

// Главный цикл
function gameLoop(timestamp) {
    if (!gameActive) return;
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    const deltaTime = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    updateGame(deltaTime);
    updateBullets(deltaTime);
    updateCamera();
    updateEnemyTurret();
    draw();
    requestAnimationFrame(gameLoop);
}

// Движение игрока (оптимизировано – отправляем только при изменении позиции)
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

    newX = Math.max(TANK_HALF, Math.min(VIRTUAL_WIDTH - TANK_HALF, newX));
    newY = Math.max(TANK_HALF, Math.min(VIRTUAL_HEIGHT - TANK_HALF, newY));

    // Проверяем, изменилась ли позиция, чтобы не отправлять лишние обновления
    const prevX = myPos.x, prevY = myPos.y;
    if (isPositionFree(newX, newY, TANK_HALF, obstacles)) {
        if (newX !== prevX || newY !== prevY) {
            myPos.x = newX;
            myPos.y = newY;
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
        }
    }
}

// Движение и проверка пуль (с поддержкой препятствий для врага и корректным определением победителя)
function updateBullets(deltaTime) {
    if (winner) return; // игра уже окончена

    // 1. Двигаем все пули (свои и вражеские)
    for (let b of myBullets) {
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;
    }
    for (let b of enemyBullets) {
        b.x += b.vx * deltaTime;
        b.y += b.vy * deltaTime;
    }

    // 2. Проверка своих пуль
    for (let i = myBullets.length - 1; i >= 0; i--) {
        const b = myBullets[i];
        // Выход за границы
        if (b.x < 0 || b.x > VIRTUAL_WIDTH || b.y < 0 || b.y > VIRTUAL_HEIGHT) {
            if (currentRoomCode && b.key) {
                remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
            }
            myBullets.splice(i, 1);
            continue;
        }
        // Столкновение с препятствиями
        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                if (currentRoomCode && b.key) {
                    remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
                }
                myBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;

        // Попадание во врага
        const dx = b.x - enemyPos.x;
        const dy = b.y - enemyPos.y;
        if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
            if (currentRoomCode && b.key) {
                remove(ref(db, `rooms/${currentRoomCode}/gameState/bullets/${b.key}`));
            }
            myBullets.splice(i, 1);
            update(ref(db), {
                [`rooms/${currentRoomCode}/gameState/winner`]: currentPlayerNick
            });
            gameActive = false;   // локально останавливаем игру, чтобы не было повторных попаданий
            return;
        }
    }

    // 3. Проверка вражеских пуль (попадание в игрока + столкновение с препятствиями)
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        // Столкновение с препятствиями
        let hit = false;
        for (let obs of obstacles) {
            if (circleRectCollide(b.x, b.y, BULLET_RADIUS, obs)) {
                enemyBullets.splice(i, 1);
                hit = true;
                break;
            }
        }
        if (hit) continue;

        // Выход за границы
        if (b.x < 0 || b.x > VIRTUAL_WIDTH || b.y < 0 || b.y > VIRTUAL_HEIGHT) {
            enemyBullets.splice(i, 1);
            continue;
        }

        // Попадание в игрока
        const dx = b.x - myPos.x;
        const dy = b.y - myPos.y;
        if (dx * dx + dy * dy < (TANK_HALF + BULLET_RADIUS) ** 2) {
            update(ref(db), {
                [`rooms/${currentRoomCode}/gameState/winner`]: enemyNick
            });
            gameActive = false;   // локально останавливаем игру
            return;
        }
    }
}

// Направление пушки врага на игрока
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

// Отрисовка танка
function drawTank(x, y, color, direction) {
    const sx = toScreenX(x);
    const sy = toScreenY(y);
    const scaleX = getScaleX();
    const scaleY = getScaleY();
    const w = TANK_SIZE * scaleX;
    const h = TANK_SIZE * scaleY;
    const left = sx - w/2;
    const top = sy - h/2;

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
}

// Основная отрисовка
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = getScaleX();
    const scaleY = getScaleY();

    // Препятствия
    ctx.fillStyle = '#8B4513';
    obstacles.forEach(obs => {
        const sx = toScreenX(obs.x);
        const sy = toScreenY(obs.y);
        const sw = obs.width * scaleX;
        const sh = obs.height * scaleY;
        ctx.fillRect(sx, sy, sw, sh);
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
    ctx.shadowBlur = 0;

    // Танки
    drawTank(enemyPos.x, enemyPos.y, '#E53935', enemyTurretDir);
    drawTank(myPos.x, myPos.y, '#1E88E5', lastMoveDir);
}
