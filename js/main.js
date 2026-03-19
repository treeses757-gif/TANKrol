import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getDatabase, 
    ref, 
    set, 
    update, 
    onValue, 
    get, 
    remove 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

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

// Элементы DOM
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showLoginBtn = document.getElementById('show-login');
const showRegisterBtn = document.getElementById('show-register');
const userNickSpan = document.getElementById('user-nick');
const logoutBtn = document.getElementById('logoutBtn');

// Переменные игры
let currentPlayerNick = localStorage.getItem('playerNick') || null;
let currentRoomCode = null;
let roomListener = null;
let gameListener = null;
let gameActive = false;
let myPos = { x: 200, y: 200 };
let enemyPos = { x: 600, y: 200 };
let canvas, ctx;

// Простая хеш-функция (для демо)
function hashPassword(password) {
    return btoa(password);
}

// Если уже есть сохранённый ник, показываем лобби
if (currentPlayerNick) {
    authScreen.classList.remove('active');
    lobbyScreen.classList.add('active');
    userNickSpan.textContent = currentPlayerNick;
}

// Переключение между формами
showLoginBtn.addEventListener('click', () => {
    showLoginBtn.classList.add('active');
    showRegisterBtn.classList.remove('active');
    loginForm.classList.add('active');
    registerForm.classList.remove('active');
});

showRegisterBtn.addEventListener('click', () => {
    showRegisterBtn.classList.add('active');
    showLoginBtn.classList.remove('active');
    registerForm.classList.add('active');
    loginForm.classList.remove('active');
});

// Регистрация
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nick = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const errorDiv = document.getElementById('register-error');

    if (!nick) {
        errorDiv.textContent = 'Ник не может быть пустым';
        return;
    }
    if (password !== confirm) {
        errorDiv.textContent = 'Пароли не совпадают';
        return;
    }

    try {
        const userRef = ref(db, `users/${nick}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            errorDiv.textContent = 'Ник уже занят';
            return;
        }
        await set(userRef, {
            password: hashPassword(password)
        });
        errorDiv.textContent = 'Регистрация успешна! Теперь войдите.';
        showLoginBtn.click();
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm').value = '';
    } catch (err) {
        console.error(err);
        errorDiv.textContent = 'Ошибка регистрации';
    }
});

// Вход
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nick = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    if (!nick) {
        errorDiv.textContent = 'Введите ник';
        return;
    }

    try {
        const userRef = ref(db, `users/${nick}`);
        const snapshot = await get(userRef);
        if (!snapshot.exists()) {
            errorDiv.textContent = 'Пользователь не найден';
            return;
        }
        const userData = snapshot.val();
        if (userData.password !== hashPassword(password)) {
            errorDiv.textContent = 'Неверный пароль';
            return;
        }
        currentPlayerNick = nick;
        localStorage.setItem('playerNick', nick);
        userNickSpan.textContent = nick;
        authScreen.classList.remove('active');
        lobbyScreen.classList.add('active');
        errorDiv.textContent = '';
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    } catch (err) {
        console.error(err);
        errorDiv.textContent = 'Ошибка входа';
    }
});

// Выход
logoutBtn.addEventListener('click', () => {
    currentPlayerNick = null;
    localStorage.removeItem('playerNick');
    if (currentRoomCode) leaveRoom();
    authScreen.classList.add('active');
    lobbyScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    document.getElementById('roomCodeDisplay').textContent = '——';
    document.getElementById('copyBtn').style.display = 'none';
    if (roomListener) roomListener();
    if (gameListener) gameListener();
});

// Генерация 6-значного кода
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Создание комнаты
document.getElementById('createBtn').onclick = async () => {
    if (!currentPlayerNick) { alert('Сначала войдите'); return; }
    const code = generateCode();
    try {
        const roomRef = ref(db, `rooms/${code}`);
        const snap = await get(roomRef);
        if (snap.exists()) {
            return document.getElementById('createBtn').onclick();
        }
        await set(roomRef, {
            players: { [currentPlayerNick]: true },
            gameState: null
        });
        currentRoomCode = code;
        document.getElementById('roomCodeDisplay').textContent = code;
        document.getElementById('roomCodeSpan').textContent = code;
        document.getElementById('copyBtn').style.display = 'inline-block';
        listenRoom(code);
    } catch (err) {
        console.error(err);
        alert('Ошибка создания комнаты');
    }
};

// Присоединение к комнате
document.getElementById('joinBtn').onclick = async () => {
    if (!currentPlayerNick) { alert('Сначала войдите'); return; }
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
        await update(ref(db, `rooms/${code}/players`), { [currentPlayerNick]: true });
        currentRoomCode = code;
        document.getElementById('roomCodeDisplay').textContent = code;
        document.getElementById('roomCodeSpan').textContent = code;
        document.getElementById('copyBtn').style.display = 'inline-block';
        listenRoom(code);
    } catch (err) {
        console.error(err);
        alert('Ошибка присоединения');
    }
};

// Копирование кода
document.getElementById('copyBtn').addEventListener('click', () => {
    if (currentRoomCode) {
        navigator.clipboard.writeText(currentRoomCode).then(() => {
            alert('Код скопирован: ' + currentRoomCode);
        }).catch(() => {
            alert('Не удалось скопировать код');
        });
    }
});

// Слушатель комнаты
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
            if (currentPlayerNick === Object.keys(players)[0]) {
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

// Слушатель состояния игры
function listenGameState(code) {
    if (gameListener) gameListener();
    gameListener = onValue(ref(db, `rooms/${code}/gameState`), (snap) => {
        const state = snap.val();
        if (!state) return;
        for (let id in state) {
            if (id === currentPlayerNick) myPos = state[id];
            else enemyPos = state[id];
        }
    });
}

// Запуск игры
function startGame() {
    lobbyScreen.classList.remove('active');
    gameScreen.classList.add('active');
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

// Управление
let keys = {};

// *** ИСПРАВЛЕНИЕ: теперь клавиши не перехватываются в полях ввода ***
window.addEventListener('keydown', (e) => {
    // Если фокус на поле ввода или текстовой области – не мешаем вводу
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return; // разрешаем стандартное поведение
    }
    keys[e.code] = true;
    if (e.key.startsWith('Arrow') || e.code.startsWith('Key')) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
    // Не блокируем отпускание клавиш, но в любом случае очищаем состояние keys
    // Проверка на поля ввода не обязательна, но можно оставить для симметрии
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        // Не сбрасываем keys? На самом деле даже если мы отпускаем клавишу вне поля,
        // а зажали внутри, то код не попал в keys, поэтому и удалять нечего.
        // Оставим без изменений.
    }
    keys[e.code] = false;
});

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
    ctx.fillStyle = 'red';
    ctx.beginPath(); ctx.arc(enemyPos.x, enemyPos.y, 20, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'blue';
    ctx.beginPath(); ctx.arc(myPos.x, myPos.y, 20, 0, 2 * Math.PI); ctx.fill();
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

// Выход из комнаты
function leaveRoom() {
    if (currentPlayerNick && currentRoomCode) {
        remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
    }
    currentRoomCode = null;
    gameActive = false;
    lobbyScreen.classList.add('active');
    gameScreen.classList.remove('active');
    document.getElementById('roomCodeDisplay').textContent = '——';
    document.getElementById('copyBtn').style.display = 'none';
    if (roomListener) roomListener();
    if (gameListener) gameListener();
}

window.addEventListener('beforeunload', () => {
    if (currentPlayerNick && currentRoomCode) {
        remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
    }
});

// Инициализация размера canvas
window.addEventListener('load', () => {
    resizeCanvas();
});
