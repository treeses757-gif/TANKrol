import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, loadMap, gameActive } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { createSelectionScreen } from './selection.js';
import { tanks } from './tanks.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;
let playerTank = null;
let playerReady = false;

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
        if (currentPlayerNick) {
            playerTank = tanksData[currentPlayerNick] || null;
            playerReady = readyStatus[currentPlayerNick] || false;
        }
        if (tankSelectBtn) tankSelectBtn.disabled = playerReady;
        if (readyBtn) {
            readyBtn.disabled = (!playerTank) || playerReady;
            readyBtn.textContent = playerReady ? 'Готов' : 'Готов?';
        }
    }

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
            const snap = await get(ref(db, `rooms/${currentRoomCode}`));
            const data = snap.val();
            if (data) {
                updateRoomUI(Object.keys(data.players || {}), data.tanks || {}, data.ready || {});
            }
        });
    }

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
        console.log('[room] готовность изменена: ' + newReady);
    }

    async function tryStartGame(roomData) {
        const players = Object.keys(roomData.players || {});
        const tanksData = roomData.tanks || {};
        const readyStatus = roomData.ready || {};
        if (players.length === 2 && players.every(p => tanksData[p]) && players.every(p => readyStatus[p] === true) && !roomData.gameState) {
            console.log('[room] Оба готовы и выбрали танки, создаём gameState');
            const pos1 = { x: 100, y: 100 };
            const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
            const gameState = {
                [players[0]]: pos1,
                [players[1]]: pos2,
                bullets: null,
                winner: null
            };
            await set(ref(db, `rooms/${currentRoomCode}/gameState`), gameState);
            await set(ref(db, `rooms/${currentRoomCode}/ready`), null);
            console.log('[room] gameState создан');
        }
    }

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
            statusDiv.textContent = `Игроков: ${players.length}/2`;
            updateRoomUI(players, data.tanks || {}, data.ready || {});

            if (!data.gameState) {
                if (tankSelectBtn) tankSelectBtn.style.display = 'inline-block';
                if (readyBtn) readyBtn.style.display = 'inline-block';
            }

            if (data.gameState && !gameActive) {
                console.log('[room] gameState обнаружен, запускаем игру');
                const tanksData = data.tanks || {};
                const myTankId = tanksData[currentPlayerNick];
                const enemyNick = players.find(n => n !== currentPlayerNick);
                const enemyTankId = tanksData[enemyNick];
                console.log('[room] запуск: myTankId=' + myTankId + ', enemyTankId=' + enemyTankId);
                if (myTankId && enemyTankId) {
                    loadMap(currentRoomCode);
                    startGame(currentRoomCode, currentPlayerNick, myTankId, enemyNick, enemyTankId);
                    listenGameState(currentRoomCode, currentPlayerNick);
                    if (tankSelectBtn) tankSelectBtn.style.display = 'none';
                    if (readyBtn) readyBtn.style.display = 'none';
                } else {
                    console.error('[room] не удалось определить танки', tanksData);
                }
                return;
            }

            if (!data.gameState) {
                await tryStartGame(data);
            }
        });
    }

    function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
            remove(ref(db, `rooms/${currentRoomCode}/ready/${currentPlayerNick}`));
        }
        currentRoomCode = null;
        playerTank = null;
        playerReady = false;
        if (roomListener) roomListener();
        if (components.onRoomLeft) components.onRoomLeft();
        if (tankSelectBtn) tankSelectBtn.style.display = 'none';
        if (readyBtn) readyBtn.style.display = 'none';
        if (roomPlayersList) roomPlayersList.innerHTML = '';
        statusDiv.textContent = 'Ожидание...';
        roomCodeDisplay.textContent = '——';
        copyBtn.style.display = 'none';
        console.log('[room] комната покинута');
    }

    function resetGameStarted() {
        console.log('[room] resetGameStarted вызван (ничего не делает)');
    }

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
            console.log('[room] комната создана, код=' + code);
        } catch (err) {
            console.error(err);
            alert('Ошибка создания комнаты');
        }
    };

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
            console.log('[room] присоединились к комнате ' + code);
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
        getRoomCode,
        resetGameStarted
    };
}
