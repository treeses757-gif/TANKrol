import './firebase.js';
import { initAuth } from './auth.js';
import { initRoom } from './room.js';
import { initGame, startGame, stopGame, setCurrentRoom, listenGameState } from './game.js';

// Элементы DOM
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby');
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
const roomCodeSpan = document.getElementById('roomCodeSpan');
const copyBtn = document.getElementById('copyBtn');
const statusDiv = document.getElementById('status');

let currentPlayerNick = localStorage.getItem('playerNick') || null;

if (currentPlayerNick) {
    authScreen.classList.remove('active');
    lobbyScreen.classList.add('active');
    userNickSpan.textContent = currentPlayerNick;
}

const roomHandlers = initRoom({
    createBtn,
    joinBtn,
    roomCodeInput,
    roomCodeDisplay,
    roomCodeSpan,
    copyBtn,
    statusDiv,
    onRoomJoined: (code) => {
        setCurrentRoom(code, currentPlayerNick);
    },
    onRoomLeft: () => {
        stopGame();
        setCurrentRoom(null, null);
    }
});

initGame({
    gameScreen,
    lobbyScreen,
    gameOverScreen,
    gameoverMessage
}, roomHandlers);

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

window.addEventListener('beforeunload', () => {
    if (currentPlayerNick && roomHandlers.getRoomCode()) {
        // очистка при необходимости
    }
});
