import './firebase.js';
import { initAuth } from './auth.js';
import { initRoom } from './room.js';
import { initGame, startGame, stopGame, setCurrentRoom, listenGameState, setReturnToRoomCallback } from './game.js';

// Элементы DOM
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby');
const roomLobbyScreen = document.getElementById('room-lobby');
const gameScreen = document.getElementById('game');
const gameOverScreen = document.getElementById('game-over');
const gameoverMessage = document.getElementById('gameover-message');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showLoginBtn = document.getElementById('show-login');
const showRegisterBtn = document.getElementById('show-register');
const userNickSpan = document.getElementById('user-nick');
const logoutBtn = document.getElementById('logoutBtn');

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyBtn = document.getElementById('copyBtn');
const statusDiv = document.getElementById('status');

// Room lobby elements
const roomCodeRoomLobby = document.getElementById('roomCodeRoomLobby');
const playersList = document.getElementById('players-list');
const chooseTankBtn = document.getElementById('chooseTankBtn');
const readyBtn = document.getElementById('readyBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const roomStatus = document.getElementById('room-status');

let currentPlayerNick = localStorage.getItem('playerNick') || null;

if (currentPlayerNick) {
    authScreen.classList.remove('active');
    lobbyScreen.classList.add('active');
    userNickSpan.textContent = currentPlayerNick;
}

// Инициализация игры (без restart элементов)
initGame({
    gameScreen,
    lobbyScreen,
    gameOverScreen,
    gameoverMessage
});

const roomHandlers = initRoom({
    lobbyScreen,
    roomLobbyScreen,
    roomCodeRoomLobby,
    playersList,
    chooseTankBtn,
    readyBtn,
    leaveRoomBtn,
    roomStatus,
    onRoomJoined: (code) => {
        setCurrentRoom(code, currentPlayerNick);
    },
    onRoomLeft: () => {
        stopGame();
        setCurrentRoom(null, null);
    },
    copyBtn,
    roomCodeDisplay
});

// Callback for returning to room after game
setReturnToRoomCallback(() => {
    // Show room lobby, hide game over
    gameOverScreen.classList.remove('active');
    roomLobbyScreen.classList.add('active');
    // Also ensure game is stopped
    stopGame();
});

initAuth({
    authScreen,
    lobbyScreen,
    loginForm,
    registerForm,
    showLoginBtn,
    showRegisterBtn,
    userNickSpan,
    logoutBtn,
    onLoginSuccess: (nick) => {
        currentPlayerNick = nick;
        roomHandlers.setPlayerNick(nick);
    },
    onLogout: () => {
        currentPlayerNick = null;
        roomHandlers.leaveRoom();
        stopGame();
        roomHandlers.setPlayerNick(null);
    }
});

roomHandlers.setPlayerNick(currentPlayerNick);

// Обработчики кнопок создания/присоединения
createBtn.onclick = () => {
    roomHandlers.createRoom();
};
joinBtn.onclick = () => {
    const code = roomCodeInput.value.trim();
    if (code) roomHandlers.joinRoom(code);
    else alert('Введите код');
};

window.addEventListener('beforeunload', () => {
    if (currentPlayerNick && roomHandlers.getRoomCode()) {
        // Cleanup can be done by leaveRoom but we rely on Firebase
    }
});
