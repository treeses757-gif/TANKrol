import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, loadMap, setTanks, gameActive } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { createSelectionScreen, showWaitingMessage, hideWaitingMessage } from './selection.js';
import { tanks } from './tanks.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;
let playerTank = null;
let playerReady = false;
let selectionShown = false;

// DOM элементы
let tankSelectBtn, readyBtn, leaveRoomBtn, roomPlayersList;
let createBtn, joinBtn, roomCodeInput, roomCodeDisplay, roomCodeSpan, copyBtn, statusDiv;

export function initRoom(components) {
    createBtn = components.createBtn;
    joinBtn = components.joinBtn;
    roomCodeInput = components.roomCodeInput;
    roomCodeDisplay = components.roomCodeDisplay;
    roomCodeSpan = components.roomCodeSpan;
    copyBtn = components.copyBtn;
    statusDiv = components.statusDiv;

    tankSelectBtn = document.getElementById('tankSelectBtn');
    readyBtn = document.getElementById('readyBtn');
    leaveRoomBtn = document.getElementById('leaveRoomBtn');
    roomPlayersList = document.getElementById('roomPlayersList');

    function generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Обновление UI лобби и локальных переменных
    function updateRoomUI(players, tanksData, readyStatus) {
        if (!roomPlayersList) return;
        roomPlayersList.innerHTML = '';
        for (let nick of players) {
            const tankId = tanksData[nick];
            const isReady = readyStatus[nick] || false;
            const isMe = (nick === currentPlayerNick);
            const tankName = tankId ? (tanks[tankId]?.name || 'Не выбран') : 'Не выбран';
            const div = document.createElement('div');
            div.className = 'player-card';
            div.innerHTML = `
                <div class="player-info">
                    <div class="player-name">${nick} ${isMe ? '(Вы)' : ''}</div>
                    <div class="player-tank">Танк: ${tankName}</div>
                </div>
                <div class="ready-indicator ${isReady ? 'ready-true' : 'ready-false'}">
                    ${isReady ? 'Готов' : 'Не готов'}
                </div>
            `;
            roomPlayersList.appendChild(div);
        }
        // Синхронизируем локальные переменные с Firebase
        if (currentPlayerNick) {
            if (tanksData[currentPlayerNick]) playerTank = tanksData[currentPlayerNick];
            else playerTank = null;
            playerReady = readyStatus[currentPlayerNick] || false;
        }
        // Управление кнопками
        if (tankSelectBtn) {
            tankSelectBtn.disabled = playerReady;
        }
        if (readyBtn) {
            readyBtn.disabled = (!playerTank) || playerReady;
            readyBtn.textContent = playerReady ? 'Готов' : 'Готов?';
        }
    }

    // Выбор танка
    function showTankSelection() {
        if (playerReady) {
            alert('Вы уже готовы. Сначала снимите готовность, чтобы сменить танк.');
            return;
        }
        createSelectionScreen(async (tankId) => {
            playerTank = tankId;
            await update(ref(db), {
                [`rooms/${currentRoomCode}/tanks/${currentPlayerNick}`]: tankId
            });
            if (playerReady) {
                playerReady = false;
                await update(ref(db), {
                    [`rooms/${currentRoomCode}/ready/${currentPlayerNick}`]: false
                });
            }
            const roomRef = ref(db, `rooms/${currentRoomCode}`);
            const snap = await get(roomRef);
            const data = snap.val();
            if (data) {
                updateRoomUI(Object.keys(data.players || {}), data.tanks || {}, data.ready || {});
            }
        });
    }

    // Переключение готовности
    async function toggleReady() {
        if (!playerTank) {
            alert('Сначала выберите танк!');
            return;
        }
        const newReady = !playerReady;
        playerReady = newReady;
        await update(ref(db), {
            [`rooms/${currentRoomCode}/ready/${currentPlayerNick}`]: newReady
        });
        // Проверка, можно ли начать игру
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        if (data) {
            const players = Object.keys(data.players || {});
            const readyStatus = data.ready || {};
            const allReady = players.length === 2 && players.every(p => readyStatus[p] === true);
            if (allReady && !data.gameState) {
                await startGameAfterReady(data);
            }
        }
    }

    async function startGameAfterReady(roomData) {
        const players = Object.keys(roomData.players);
        const tanksData = roomData.tanks;
        if (players.length !== 2 || !tanksData[players[0]] || !tanksData[players[1]]) return;
        // Создаём начальные позиции
        const pos1 = { x: 100, y: 100 };
        const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
        const gameState = {
            [players[0]]: pos1,
            [players[1]]: pos2,
            bullets: null,
            winner: null,
            restart: null
        };
        await set(ref(db, `rooms/${currentRoomCode}/gameState`), gameState);
        // Очищаем ready, чтобы при возврате не мешали
        await set(ref(db, `rooms/${currentRoomCode}/ready`), null);
        const enemyNick = players.find(n => n !== currentPlayerNick);
        const enemyTank = tanksData[enemyNick];
        setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
        loadMap(currentRoomCode);
        startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
        listenGameState(currentRoomCode, currentPlayerNick);
        if (components.onRoomJoined) components.onRoomJoined(currentRoomCode);
        // Скрываем кнопки лобби
        if (tankSelectBtn) tankSelectBtn.style.display = 'none';
        if (readyBtn) readyBtn.style.display = 'none';
    }

    // Слушатель изменений в комнате
    function listenRoom(code) {
        if (roomListener) roomListener();
        const roomRef = ref(db, `rooms/${code}`);
        roomListener = onValue(roomRef, async (snap) => {
            const data = snap.val();
            if (!data) {
                leaveRoom();
                return;
            }
            const players = Object.keys(data.players || {});
            const count = players.length;
            statusDiv.textContent = `Игроков: ${count}/2`;
            // Обновляем UI и локальные переменные
            updateRoomUI(players, data.tanks || {}, data.ready || {});

            // Если есть gameState и игра ещё не активна у этого клиента
            if (data.gameState && !gameActive) {
                const tanksData = data.tanks || {};
                if (players.length === 2 && tanksData[players[0]] && tanksData[players[1]] && currentPlayerNick) {
                    // Убедимся, что playerTank установлен
                    if (!playerTank) {
                        playerTank = tanksData[currentPlayerNick];
                    }
                    const enemyNick = players.find(n => n !== currentPlayerNick);
                    const enemyTank = tanksData[enemyNick];
                    setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
                    loadMap(currentRoomCode);
                    startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
                    listenGameState(currentRoomCode, currentPlayerNick);
                    if (tankSelectBtn) tankSelectBtn.style.display = 'none';
                    if (readyBtn) readyBtn.style.display = 'none';
                }
                return;
            }
        });
    }

    // Выход из комнаты (без выхода из аккаунта)
    function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
            remove(ref(db, `rooms/${currentRoomCode}/ready/${currentPlayerNick}`));
        }
        currentRoomCode = null;
        playerTank = null;
        playerReady = false;
        selectionShown = false;
        if (roomListener) roomListener();
        if (components.onRoomLeft) components.onRoomLeft();
        if (tankSelectBtn) tankSelectBtn.style.display = 'none';
        if (readyBtn) readyBtn.style.display = 'none';
        if (roomPlayersList) roomPlayersList.innerHTML = '';
        statusDiv.textContent = 'Ожидание...';
        roomCodeDisplay.textContent = '——';
        copyBtn.style.display = 'none';
    }

    // Создание комнаты
    createBtn.onclick = async () => {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        const code = generateCode();
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (snap.exists()) return createBtn.onclick();
            const map = getRandomMap(code);
            await set(roomRef, {
                players: { [currentPlayerNick]: true },
                gameState: null,
                map: map,
                tanks: {},
                ready: {}
            });
            currentRoomCode = code;
            roomCodeDisplay.textContent = code;
            roomCodeSpan.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);
            if (tankSelectBtn) tankSelectBtn.style.display = 'inline-block';
            if (readyBtn) readyBtn.style.display = 'inline-block';
        } catch (err) {
            console.error(err);
            alert('Ошибка создания комнаты');
        }
    };

    // Присоединение к комнате
    joinBtn.onclick = async () => {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        const code = roomCodeInput.value.trim();
        if (!code || !/^\d+$/.test(code)) {
            alert('Введите код из 6 цифр');
            return;
        }
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (!snap.exists()) { alert('Комната не найдена'); return; }
            const players = snap.val().players || {};
            if (Object.keys(players).length >= 2) { alert('Комната полна'); return; }
            await update(ref(db, `rooms/${code}/players`), { [currentPlayerNick]: true });
            await update(ref(db, `rooms/${code}/ready`), { [currentPlayerNick]: false });
            currentRoomCode = code;
            roomCodeDisplay.textContent = code;
            roomCodeSpan.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);
            if (tankSelectBtn) tankSelectBtn.style.display = 'inline-block';
            if (readyBtn) readyBtn.style.display = 'inline-block';
        } catch (err) {
            console.error(err);
            alert('Ошибка присоединения');
        }
    };

    copyBtn.addEventListener('click', () => {
        if (currentRoomCode) {
            navigator.clipboard.writeText(currentRoomCode).then(() => {
                alert('Код скопирован: ' + currentRoomCode);
            }).catch(() => alert('Не удалось скопировать код'));
        }
    });

    if (tankSelectBtn) tankSelectBtn.addEventListener('click', showTankSelection);
    if (readyBtn) readyBtn.addEventListener('click', toggleReady);
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', () => {
            if (currentRoomCode) leaveRoom();
            else alert('Вы не в комнате');
        });
    }

    function setPlayerNick(nick) {
        currentPlayerNick = nick;
    }

    function getRoomCode() {
        return currentRoomCode;
    }

    return {
        setPlayerNick,
        leaveRoom,
        getRoomCode
    };
}
