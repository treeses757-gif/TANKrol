import './firebase.js';
import { initAuth } from './auth.js';
import { initRoom } from './room.js';
import { initGame, startGame, stopGame, setCurrentRoom, listenGameState, gameActive, returnToLobby } from './game.js';

// Элементы DOM
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const gameOverScreen = document.getElementById('game-over');
const gameoverMessage = document.getElementById('gameover-message');
const returnAfterGameBtn = document.getElementById('returnAfterGameBtn');  // кнопка на экране окончания игры
const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');      // кнопка во время игры

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showLoginBtn = document.getElementById('show-login');
const showRegisterBtn = document.getElementById('show-register');
const userNickSpan = document.getElementById('user-nick');
const logoutAccountBtn = document.getElementById('logoutAccountBtn');     // выход из аккаунта

const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeSpan = document.getElementById('roomCodeSpan');
const copyBtn = document.getElementById('copyBtn');
const statusDiv = document.getElementById('status');
const roomInfoDiv = document.getElementById('room-info');
const playersListDiv = document.getElementById('players-list');
const selectTankBtn = document.getElementById('selectTankBtn');
const readyBtn = document.getElementById('readyBtn');
const unreadyBtn = document.getElementById('unreadyBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const roomStatusSpan = document.getElementById('room-status');

let currentPlayerNick = localStorage.getItem('playerNick') || null;

if (currentPlayerNick) {
    authScreen.classList.remove('active');
    lobbyScreen.classList.add('active');
    userNickSpan.textContent = currentPlayerNick;
}

// Инициализация игры
initGame({
    gameScreen,
    lobbyScreen,
    gameOverScreen,
    gameoverMessage,
    returnAfterGameBtn,
    returnToLobbyBtn,
    onReturnToLobby: () => {
        // После возврата в лобби нужно сбросить состояние комнаты и показать интерфейс комнаты
        if (roomHandlers.getRoomCode()) {
            roomHandlers.resetRoomForNewGame();
        }
    }
});

const roomHandlers = initRoom({
    createBtn,
    joinBtn,
    roomCodeInput,
    roomCodeDisplay,
    roomCodeSpan,
    copyBtn,
    statusDiv,
    roomInfoDiv,
    playersListDiv,
    selectTankBtn,
    readyBtn,
    unreadyBtn,
    leaveRoomBtn,
    roomStatusSpan,
    onRoomJoined: (code) => {
        setCurrentRoom(code, currentPlayerNick);
    },
    onRoomLeft: () => {
        stopGame();
        setCurrentRoom(null, null);
        // Скрыть блок информации о комнате
        roomInfoDiv.style.display = 'none';
    }
});

initAuth({
    authScreen,
    lobbyScreen,
    loginForm,
    registerForm,
    showLoginBtn,
    showRegisterBtn,
    userNickSpan,
    logoutAccountBtn,
    onLoginSuccess: (nick) => {
        currentPlayerNick = nick;
        roomHandlers.setPlayerNick(nick);
    },
    onLogout: () => {
        currentPlayerNick = null;
        roomHandlers.leaveRoom();   // выходим из комнаты при выходе из аккаунта
        stopGame();
        roomHandlers.setPlayerNick(null);
    }
});

roomHandlers.setPlayerNick(currentPlayerNick);
