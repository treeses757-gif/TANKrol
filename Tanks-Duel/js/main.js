import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyC-iLxizH1umfeHSUZHLvpAt6XNm21p90Y",
    authDomain: "tanksduel-b90c7.firebaseapp.com",
    projectId: "tanksduel-b90c7",
    storageBucket: "tanksduel-b90c7.firebasestorage.app",
    messagingSenderId: "952596856224",
    appId: "1:952596856224:web:aefd98cf1d768e9169f8c5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentPlayerId = null;
let currentRoomCode = null;
let roomListener = null;
let gameListener = null;
let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let canvas, ctx;

const copyBtn = document.getElementById('copyBtn');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');

signInAnonymously(auth).then(user => {
    currentPlayerId = user.user.uid;
    document.getElementById('status').textContent = 'Готов';
}).catch(err => {
    console.error(err);
    document.getElementById('status').textContent = 'Ошибка авторизации';
});

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

document.getElementById('createBtn').onclick = async () => {
    if (!currentPlayerId) { alert('Авторизация...'); return; }
    const code = generateCode();
    try {
        const roomRef = ref(db, `rooms/${code}`);
        const snap = await get(roomRef);
        if (snap.exists()) {
            return document.getElementById('createBtn').onclick(); // повторить
        }
        await set(roomRef, {
            players: { [currentPlayerId]: true },
            gameState: null
        });
        currentRoomCode = code;
        roomCodeDisplay.textContent = code;
        document.getElementById('roomCodeSpan').textContent = code;
        copyBtn.style.display = 'inline-block';
        listenRoom(code);
    } catch (err) {
        console.error(err);
        alert('Ошибка создания комнаты');
    }
};

document.getElementById('joinBtn').onclick = async () => {
    if (!currentPlayerId) { alert('Авторизация...'); return; }
    const code = document.getElementById('roomCodeInput').value.trim();
    if (!code || !/^\d+$/.test(code)) {
        alert('Введите код из цифр');
        return;
    }
    try {
        const roomRef = ref(db, `rooms/${code}`);
        const snap = await get(roomRef);
        if (!snap.exists()) { alert('Комната не найдена'); return; }
        const players = snap.val().players || {};
        if (Object.keys(players).length >= 2) { alert('Комната полна'); return; }
        await update(ref(db, `rooms/${code}/players`), { [currentPlayerId]: true });
        currentRoomCode = code;
        roomCodeDisplay.textContent = code;
        document.getElementById('roomCodeSpan').textContent = code;
        copyBtn.style.display = 'inline-block';
        listenRoom(code);
    } catch (err) {
        console.error(err);
        alert('Ошибка присоединения');
    }
};

copyBtn.addEventListener('click', () => {
    if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode).then(() => {
            alert('Код скопирован: ' + currentRoomCode);
        }).catch(err => {
            alert('Не удалось скопировать код');
        });
    }
});

function listenRoom(code) {
    if (roomListener) roomListener();
    const roomRef = ref(db, `rooms/${code}`);
    roomListener = onValue(roomRef, (snap) => {
        const data = snap.val();
        if (!data) { leaveRoom(); return; }
        const players = data.players || {};
        const count = Object.keys(players).length;
        document.getElementById('status').textContent = `Игроков: ${count}/2`;
        if (count === 2 && data.gameState === null) {
            if (currentPlayerId === Object.keys(players)[0]) {
                const gameState = {
                    [Object.keys(players)[0]]: { x: 200, y: 200 },
                    [Object.keys(players)[1]]: { x: 600, y: 200 }
                };
                set(ref(db, `rooms/${code}/gameState`), gameState);
            }
        }
        if (count === 2 && data.gameState !== null && !gameActive) {
            startGame();
            listenGameState(code);
        }
    });
}

function listenGameState(code) {
    if (gameListener) gameListener();
    gameListener = onValue(ref(db, `rooms/${code}/gameState`), (snap) => {
        const state = snap.val();
        if (!state) return;
        for (let id in state) {
            if (id === currentPlayerId) myPos = state[id];
            else enemyPos = state[id];
        }
    });
}

function startGame() {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    gameActive = true;
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (!gameActive) return;
    updateGame();
    draw();
    requestAnimationFrame(gameLoop);
}

let keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

function updateGame() {
    if (!currentRoomCode || !currentPlayerId || !canvas) return;
    const speed = 3;
    let moved = false;
    if (keys['ArrowUp'] || keys['KeyW']) { myPos.y -= speed; moved = true; }
    if (keys['ArrowDown'] || keys['KeyS']) { myPos.y += speed; moved = true; }
    if (keys['ArrowLeft'] || keys['KeyA']) { myPos.x -= speed; moved = true; }
    if (keys['ArrowRight'] || keys['KeyD']) { myPos.x += speed; moved = true; }
    if (moved) {
        myPos.x = Math.max(20, Math.min(canvas.width - 20, myPos.x));
        myPos.y = Math.max(20, Math.min(canvas.height - 20, myPos.y));
        update(ref(db), { [`rooms/${currentRoomCode}/gameState/${currentPlayerId}`]: myPos });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'red';
    ctx.beginPath(); ctx.arc(enemyPos.x, enemyPos.y, 20, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'blue';
    ctx.beginPath(); ctx.arc(myPos.x, myPos.y, 20, 0, 2 * Math.PI); ctx.fill();
}

function resizeCanvas() { if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } }

function leaveRoom() {
    if (currentPlayerId && currentRoomCode) {
        remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerId}`));
    }
    currentRoomCode = null; gameActive = false;
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('game').style.display = 'none';
    roomCodeDisplay.textContent = '——';
    copyBtn.style.display = 'none';
    if (roomListener) roomListener();
    if (gameListener) gameListener();
}

window.addEventListener('beforeunload', () => {
    if (currentPlayerId && currentRoomCode) {
        remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerId}`));
    }
});