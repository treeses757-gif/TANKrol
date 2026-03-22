import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, gameActive, loadMap, setTanks, stopGame } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { createSelectionScreen } from './selection.js';
import { tanks } from './tanks.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;
let playerTank = null;
let isInGame = false;

export function initRoom(components) {
    const {
        lobbyScreen,
        roomLobbyScreen,
        roomCodeRoomLobby,
        playersList,
        chooseTankBtn,
        readyBtn,
        leaveRoomBtn,
        roomStatus,
        onRoomJoined,
        onRoomLeft,
        copyBtn,
        roomCodeDisplay
    } = components;

    function generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async function updateRoomUI(data) {
        if (!data) return;

        const players = data.players || {};
        const tanksData = data.tanks || {};
        const readyData = data.ready || {};
        const playerCount = Object.keys(players).length;

        // Обновляем отображение игроков
        playersList.innerHTML = '';
        for (const nick in players) {
            const tankId = tanksData[nick];
            const tank = tankId ? tanks[tankId] : null;
            const isReady = readyData[nick] || false;
            const isCurrent = nick === currentPlayerNick;

            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-info">
                    <div class="player-name">${nick}${isCurrent ? ' (Вы)' : ''}</div>
                    <div class="player-tank">${tank ? `${tank.icon} ${tank.name}` : 'Танк не выбран'}</div>
                </div>
                <div class="ready-indicator ready-${isReady}">${isReady ? 'Готов' : 'Не готов'}</div>
            `;
            playersList.appendChild(card);
        }

        // Обновляем кнопку "Готов"
        if (playerTank) {
            readyBtn.disabled = false;
            const myReady = readyData[currentPlayerNick] || false;
            readyBtn.textContent = myReady ? 'Не готов' : 'Готов';
            readyBtn.classList.toggle('ready', myReady);
        } else {
            readyBtn.disabled = true;
            readyBtn.textContent = 'Сначала выберите танк';
            readyBtn.classList.remove('ready');
        }

        // Статус
        if (playerCount === 2) {
            const bothReady = Object.keys(players).every(nick => readyData[nick] === true);
            if (bothReady && !isInGame) {
                roomStatus.textContent = 'Оба готовы! Игра начинается...';
                // Запускаем игру через секунду, чтобы UI обновился
                setTimeout(() => startGameIfReady(data), 100);
            } else {
                roomStatus.textContent = `Игроков: ${playerCount}/2. Ожидаем готовности...`;
            }
        } else {
            roomStatus.textContent = `Ожидание игроков (${playerCount}/2)...`;
        }
    }

    async function startGameIfReady(roomData) {
        if (isInGame) return;
        const players = roomData.players || {};
        const readyData = roomData.ready || {};
        const tanksData = roomData.tanks || {};

        if (Object.keys(players).length === 2 &&
            players[currentPlayerNick] &&
            Object.keys(players).every(nick => readyData[nick] === true) &&
            tanksData[players[0]] && tanksData[players[1]]) {

            isInGame = true;
            const enemyNick = Object.keys(players).find(n => n !== currentPlayerNick);
            const enemyTank = tanksData[enemyNick];
            setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
            loadMap(currentRoomCode);
            startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
            listenGameState(currentRoomCode, currentPlayerNick);
            if (onRoomJoined) onRoomJoined(currentRoomCode);

            // Скрываем комнатный лобби, показываем игру
            roomLobbyScreen.classList.remove('active');
            document.getElementById('game').classList.add('active');
        }
    }

    async function setTank(tankId) {
        if (!currentRoomCode || !currentPlayerNick) return;
        playerTank = tankId;
        await update(ref(db), {
            [`rooms/${currentRoomCode}/tanks/${currentPlayerNick}`]: tankId,
            [`rooms/${currentRoomCode}/ready/${currentPlayerNick}`]: false
        });
        // Обновляем UI через слушателя
    }

    async function setReady(ready) {
        if (!currentRoomCode || !currentPlayerNick) return;
        if (!playerTank) return;
        await update(ref(db), {
            [`rooms/${currentRoomCode}/ready/${currentPlayerNick}`]: ready
        });
    }

    async function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            await remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
            // Если комната пуста, удаляем её (опционально)
            const snap = await get(ref(db, `rooms/${currentRoomCode}/players`));
            if (!snap.exists()) {
                await remove(ref(db, `rooms/${currentRoomCode}`));
            }
        }
        currentRoomCode = null;
        playerTank = null;
        isInGame = false;
        if (roomListener) roomListener();
        if (onRoomLeft) onRoomLeft();

        // Показываем основной лобби, скрываем комнатный
        roomLobbyScreen.classList.remove('active');
        lobbyScreen.classList.add('active');
    }

    function listenRoom(code) {
        if (roomListener) roomListener();
        const roomRef = ref(db, `rooms/${code}`);
        roomListener = onValue(roomRef, async (snap) => {
            const data = snap.val();
            if (!data) {
                // Комната удалена
                leaveRoom();
                return;
            }
            updateRoomUI(data);
        });
    }

    // Обработчики кнопок
    chooseTankBtn.onclick = () => {
        if (!currentRoomCode || !currentPlayerNick) return;
        createSelectionScreen((tankId) => {
            setTank(tankId);
        }, playerTank);
    };

    readyBtn.onclick = () => {
        if (!currentRoomCode || !currentPlayerNick) return;
        if (!playerTank) return;
        const myReady = document.getElementById('readyBtn').classList.contains('ready');
        setReady(!myReady);
    };

    leaveRoomBtn.onclick = () => {
        leaveRoom();
        // Останавливаем игру, если она была активна
        stopGame();
    };

    // Функции для внешнего использования
    function setPlayerNick(nick) {
        currentPlayerNick = nick;
    }

    function getRoomCode() {
        return currentRoomCode;
    }

    async function createRoom() {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        const code = generateCode();
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (snap.exists()) return createRoom();

            const map = getRandomMap(code);
            await set(roomRef, {
                players: { [currentPlayerNick]: true },
                gameState: null,
                map: map,
                tanks: {},
                ready: {}
            });

            currentRoomCode = code;
            roomCodeRoomLobby.textContent = code;
            roomCodeDisplay.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);

            // Показываем комнатный лобби, скрываем основной
            lobbyScreen.classList.remove('active');
            roomLobbyScreen.classList.add('active');
        } catch (err) {
            console.error(err);
            alert('Ошибка создания комнаты');
        }
    }

    async function joinRoom(code) {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (!snap.exists()) { alert('Комната не найдена'); return; }
            const players = snap.val().players || {};
            if (Object.keys(players).length >= 2) { alert('Комната полна'); return; }

            await update(ref(db), {
                [`rooms/${code}/players/${currentPlayerNick}`]: true,
                [`rooms/${code}/ready/${currentPlayerNick}`]: false
            });

            currentRoomCode = code;
            roomCodeRoomLobby.textContent = code;
            roomCodeDisplay.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);

            lobbyScreen.classList.remove('active');
            roomLobbyScreen.classList.add('active');
        } catch (err) {
            console.error(err);
            alert('Ошибка присоединения');
        }
    }

    return {
        setPlayerNick,
        createRoom,
        joinRoom,
        leaveRoom,
        getRoomCode
    };
}
