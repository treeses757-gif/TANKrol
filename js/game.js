import { db } from './firebase.js';
import { ref, onValue, update, get, remove, set } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { isPositionFree, circleRectCollide } from './utils.js';
import { initMobileControls, getJoystickDirection, removeMobileControls, setActivateAbilityCallback } from './mobile-controls.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, PLAYER_SPEED, BULLET_SPEED, TANK_HALF, BULLET_RADIUS } from './config.js';
import { tanks } from './tanks.js';

export let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 600 };
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
let myReflectActive = false;
let enemyReflectActive = false;
let mySpiderActive = false;
let enemySpiderActive = false;

let phantomActive = false;
let phantomData = null;
let enemyPhantomActive = false;
let enemyPhantomData = null;

let boomerangBullets = [];

let lastAbilityTime = 0;
const ABILITY_COOLDOWN = 25;

let cameraX = 0, cameraY = 0;
let useCamera = false;

let enemyTurretDir = { x: 0, y: 1 };
const SHOOT_DELAY = 0.5;
let lastShootTime = 0;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let mobileControlsActive = false;

let lobbyScreenEl, gameScreenEl, gameOverScreenEl, gameoverMessageEl, returnToRoomBtn;

let animationFrameId = null;
let roomHandlersRef = null;

function drawTank(x, y, tankId, direction, isPhantom = false) {
    const tank = tanks[tankId];
    if (!tank) return;
    const sx = toScreenX(x);
    const sy = toScreenY(y);
    const scaleX = getScaleX();
    const scaleY = getScaleY();
    if (isPhantom) ctx.globalAlpha = 0.5;
    const bodyW = tank.body.width * scaleX;
    const bodyH = tank.body.height * scaleY;
    const bodyX = sx - bodyW/2;
    const bodyY = sy - bodyH/2 + tank.body.offsetY * scaleY;
    ctx.fillStyle = tank.color;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.fillStyle = '#333';
    const trackW = tank.tracks.width * scaleX;
    const trackH = tank.tracks.height * scaleY;
    const trackX = sx - trackW/2;
    const trackY = sy - trackH/2 + tank.tracks.offsetY * scaleY;
    ctx.fillRect(trackX, trackY, trackW, trackH);
    ctx.fillRect(trackX, trackY - trackH*2, trackW, trackH);
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

export function initGame(components, roomHandlers) {
    roomHandlersRef = roomHandlers;
    lobbyScreenEl = components.lobbyScreen;
    gameScreenEl = components.gameScreen;
    gameOverScreenEl = components.gameOverScreen;
    gameoverMessageEl = components.gameoverMessage;
    returnToRoomBtn = document.getElementById('return-to-room-btn');

    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    useCamera = !isMobile;

    if (isMobile) {
        canvas.style.pointerEvents = 'none';
    }

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
    });
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
    });

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        keys[e.code] = true;
        if (e.code === 'Space') { e.preventDefault(); shoot(); }
        if (e.code === 'KeyE') { e.preventDefault(); activateTankAbility(); }
        if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    if (returnToRoomBtn) {
        returnToRoomBtn.addEventListener('click', async () => {
            if (!currentRoomCode) return;
            await set(ref(db, `rooms/${currentRoomCode}/gameState`), null);
            gameActive = false;
            gameScreenEl.classList.remove('active');
            lobbyScreenEl.classList.add('active');
            if (roomHandlersRef && roomHandlersRef.resetGameStarted) {
                roomHandlersRef.resetGameStarted();
            }
            const tankSelectBtn = document.getElementById('tankSelectBtn');
            const readyBtn = document.getElementById('readyBtn');
            if (tankSelectBtn) tankSelectBtn.style.display = 'inline-block';
            if (readyBtn) readyBtn.style.display = 'inline-block';
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
            phantomData = { startPos: { ...myPos }, path: [{ ...myPos, dir: { ...lastMoveDir } }], lastShoot: 0 };
            setTimeout(() => { phantomActive = false; }, 8000);
            break;
        case 'guardian':
            myReflectActive = true;
            setTimeout(() => { myReflectActive = false; }, 4000);
            break;
        case 'spider':
            mySpiderActive = true;
            setTimeout(() => { mySpiderActive = false; }, 5000);
            break;
        case 'boomer':
            const bulletKey = Date.now() + '_boomer';
            const boomerang = {
                x: myPos.x,
                y: myPos.y,
                vx: lastMoveDir.x * BULLET_SPEED,
                vy: lastMoveDir.y * BULLET_SPEED,
                owner: currentPlayerNick,
                key: bulletKey,
                type: 'boomerang',
                returning: false
            };
            update(ref(db), { [`rooms/${currentRoomCode}/gameState/bullets/${bulletKey}`]: boomerang });
            break;
    }
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

export async function startGame(roomCode, playerNick, myTankId, enemyNickParam, enemyTankId) {
    console.log('[game] startGame called', { roomCode, playerNick, myTankId, enemyNickParam, enemyTankId });
    if (!gameScreenEl || !lobbyScreenEl) return;
    if (isMobile && window.innerWidth < window.innerHeight) {
        alert('Пожалуйста, поверните устройство горизонтально');
        return;
    }

    const gameStateSnap = await get(ref(db, `rooms/${roomCode}/gameState`));
    const gameState = gameStateSnap.val();
    if (gameState) {
        if (gameState[playerNick]) myPos = gameState[playerNick];
        const enemyNickLocal = Object.keys(gameState).find(n => n !== playerNick);
        if (enemyNickLocal) enemyPos = gameState[enemyNickLocal];
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
    myReflectActive = false;
    enemyReflectActive = false;
    mySpiderActive = false;
    enemySpiderActive = false;
    phantomActive = false;
    phantomData = null;
    enemyPhantomActive = false;
    enemyPhantomData = null;
    lastAbilityTime = 0;

    setTanks(playerNick, myTankId, enemyNickParam, enemyTankId);

    if (isMobile && !document.getElementById('mobile-controls')) {
        initMobileControls(canvas, shoot);
        setActivateAbilityCallback(() => activateTankAbility());
        mobileControlsActive = true;
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
    console.log('[game] game started, gameActive = true');
}

export function stopGame() {
    gameActive = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
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
    if (returnToRoomBtn) returnToRoomBtn.disabled = false;
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
            if (id === 'bullets' || id === 'restart' || id === 'winner' || id === 'abilityActivation') continue;
            if (id === playerNick) myPos = state[id];
            else if (id !== 'bullets' && id !== 'restart' && id !== 'winner' && id !== 'abilityActivation') {
                enemyPos = state[id];
            }
        }
        if (state.bullets) {
            const currentKeys = new Set();
            for (let key in state.bullets) {
                currentKeys.add(key);
                const bullet = state.bullets[key];
                if (bullet.owner === playerNick) {
                    if (!myBullets.some(b => b.key === key)) {
                        if (bullet.type === 'boomerang') {
                            boomerangBullets.push({ ...bullet });
                        } else {
                            myBullets.push({ ...bullet });
                        }
                    }
                } else {
                    if (!enemyBullets.some(b => b.key === key)) {
                        if (bullet.type === 'boomerang') {
                            boomerangBullets.push({ ...bullet });
                        } else {
                            enemyBullets.push({ ...bullet });
                        }
                    }
                }
            }
            myBullets = myBullets.filter(b => currentKeys.has(b.key));
            enemyBullets = enemyBullets.filter(b => currentKeys.has(b.key));
            boomerangBullets = boomerangBullets.filter(b => currentKeys.has(b.key));
        } else {
            enemyBullets = [];
            myBullets = [];
            boomerangBullets = [];
        }
        if (state.abilityActivation && state.abilityActivation.player !== playerNick) {
            const ability = state.abilityActivation.ability;
            switch (ability) {
                case 'guardian':
                    enemyReflectActive = true;
                    setTimeout(() => { enemyReflectActive = false; }, 4000);
                    break;
                case 'spider':
                    enemySpiderActive = true;
                    setTimeout(() => { enemySpiderActive = false; }, 5000);
                    break;
                case 'phantom':
                    enemyPhantomActive = true;
                    setTimeout(() => { enemyPhantomActive = false; }, 8000);
                    break;
            }
            update(ref(db), { [`rooms/${code}/gameState/abilityActivation`]: null });
        }
        if (state.winner) {
            winner = state.winner;
            if (!gameActive) return;
            if (winner === playerNick) showGameOver('Вы победили!');
            else showGameOver('Вы проиграли!');
        }
    });
}

export function loadMap(roomCode) {
    onValue(ref(db, `rooms/${roomCode}/map`), (snap) => {
        obstacles = snap.val() || [];
        console.log('[game] obstacles loaded', obstacles);
    }, { onlyOnce: true });
}

function updateCamera() {
    if (!useCamera) {
        cameraX = 0; cameraY = 0;
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
    updateBoomerangs(deltaTime);
    updateCamera();
    updateEnemyTurret();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}

function updateGame(deltaTime) {
    if (!currentRoomCode || !currentPlayerNick || !canvas) return;
    const move = PLAYER_SPEED * deltaTime;
    let newX = myPos.x, newY = myPos.y;
    let moved = false;
    let dx = 0, dy = 0;

    if (keys['ArrowUp'] || keys['KeyW']) { dy -= 1; moved = true; }
    if (keys['ArrowDown'] || keys['KeyS']) { dy += 1; moved = true; }
    if (keys['ArrowLeft'] || keys['KeyA']) { dx -= 1; moved = true; }
    if (keys['ArrowRight'] || keys['KeyD']) { dx += 1; moved = true; }

    if (isMobile && mobileControlsActive) {
        const jDir = getJoystickDirection();
        if (jDir.x !== 0 || jDir.y !== 0) {
            dx = jDir.x;
            dy = jDir.y;
            moved = true;
        }
    }

    if (!moved) return;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len;
        dy /= len;
    }
    lastMoveDir = { x: dx, y: dy };

    newX += dx * move;
    newY += dy * move;

    if (!mySpiderActive) {
        newX = Math.max(TANK_HALF, Math.min(VIRTUAL_WIDTH - TANK_HALF, newX));
        newY = Math.max(TANK_HALF, Math.min(VIRTUAL_HEIGHT - TANK_HALF, newY));
        if (!isPositionFree(newX, newY, TANK_HALF, obstacles)) return;
    } else {
        newX = Math.max(0, Math.min(VIRTUAL_WIDTH, newX));
        newY = Math.max(0, Math.min(VIRTUAL_HEIGHT, newY));
    }

    if (newX !== myPos.x || newY !== myPos.y) {
        myPos = { x: newX, y: newY };
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerNick}`]: myPos });
        console.log('[game] moved to', myPos);
    }
}

// ... остальные функции (updateBullets, updatePhantom, updateBoomerangs, updateEnemyTurret, draw) остаются без изменений ...
// (они уже были в вашем файле, я их не менял)
