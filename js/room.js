import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, gameActive, loadMap, setTanks } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { createSelectionScreen, hideWaitingMessage } from './selection.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;
let playerTank = null;
let selectionShown = false; // чтобы не показывать выбор повторно

export function initRoom(components) {
    const {
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
        onRoomJoined,
        onRoomLeft
    } = components;

    function generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async function showTankSelection() {
        if (selectionShown) return;
        selectionShown = true;
        createSelectionScreen(async (tankId) => {
            console.log('Выбран танк:', tankId);
            playerTank = tankId;
            // Сохраняем выбор танка в БД
            await update(ref(db), {
                [`rooms/${currentRoomCode}/tanks/${currentPlayerNick}`]: tankId
            });
            selectionShown = false;
            // Обновляем отображение игроков
            updatePlayersList();
        });
    }

    async function setReady(ready) {
        if (!currentRoomCode || !currentPlayerNick) return;
        await update(ref(db), {
            [`rooms/${currentRoomCode}/ready/${currentPlayerNick}`]: ready
        });
        // Если игрок стал готов, блокируем выбор танка
        if (ready) {
            selectTankBtn.disabled = true;
            readyBtn.style.display = 'none';
            unreadyBtn.style.display = 'inline-block';
        } else {
            selectTankBtn.disabled = false;
            readyBtn.style.display = 'inline-block';
            unreadyBtn.style.display = 'none';
        }
    }

    async function checkAndStartGame() {
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        if (!data) return;
        const players = Object.keys(data.players || {});
        const tanks = data.tanks || {};
        const ready = data.ready || {};

        // Если в комнате 2 игрока, оба выбрали танк и оба готовы
        if (players.length === 2 && 
            tanks[players[0]] && tanks[players[1]] &&
            ready[players[0]] && ready[players[1]]) {
            
            if (gameActive) return; // игра уже идёт
            
            // Удаляем состояние готовности, чтобы повторно не запустить
            await update(ref(db), { [`rooms/${currentRoomCode}/ready`]: null });
            
            const enemyNick = players.find(n => n !== currentPlayerNick);
            const enemyTank = tanks[enemyNick];
            setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
            loadMap(currentRoomCode);
            
            // Создаём начальные позиции, если их нет
            if (!data.gameState) {
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
            }
            
            startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
            listenGameState(currentRoomCode, currentPlayerNick);
            if (onRoomJoined) onRoomJoined(currentRoomCode);
            
            // Скрываем интерфейс комнаты, показываем игровой экран
            roomInfoDiv.style.display = 'none';
        } else {
            // Обновляем статус
            const playersCount = players.length;
            if (playersCount < 2) {
                roomStatusSpan.textContent = 'Ожидание второго игрока...';
            } else if (!tanks[players[0]] || !tanks[players[1]]) {
                roomStatusSpan.textContent = 'Выберите танки';
            } else if (!ready[players[0]] || !ready[players[1]]) {
                roomStatusSpan.textContent = 'Ожидание готовности...';
            }
        }
    }

    async function updatePlayersList() {
        if (!currentRoomCode) return;
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        if (!data) return;
        
        const players = data.players || {};
        const tanks = data.tanks || {};
        const ready = data.ready || {};
        
        playersListDiv.innerHTML = '';
        for (const nick in players) {
            const tankId = tanks[nick];
            const tankName = tankId ? (window.tanks && window.tanks[tankId] ? window.tanks[tankId].name : tankId) : 'Не выбран';
            const isReady = ready[nick] || false;
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `
                <span class="player-nick">${nick}</span>
                <span class="player-tank">${tankName}</span>
                <span class="${isReady ? 'player-ready' : 'player-not-ready'}">${isReady ? 'Готов' : 'Не готов'}</span>
            `;
            playersListDiv.appendChild(playerDiv);
        }
        
        // Проверяем, можем ли мы стартовать
        await checkAndStartGame();
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
            
            const players = data.players || {};
            const count = Object.keys(players).length;
            statusDiv.textContent = `Игроков: ${count}/2`;
            
            // Показываем интерфейс комнаты, если мы в комнате
            roomInfoDiv.style.display = 'block';
            roomCodeSpan.textContent = code;
            
            await updatePlayersList();
            
            // Если мы уже в игре, не мешаем
            if (gameActive) return;
            
            // Если комната стала пустой (например, второй игрок вышел), сбрасываем состояние
            if (count === 0 && currentPlayerNick) {
                // Это может быть после выхода всех, но мы всё равно выйдем
                leaveRoom();
                return;
            }
            
            // Если мы в комнате, но игра не начата, обновляем интерфейс
            if (currentPlayerNick && players[currentPlayerNick]) {
                // Если игрок уже выбрал танк, показываем, что выбор сделан
                if (data.tanks && data.tanks[currentPlayerNick]) {
                    playerTank = data.tanks[currentPlayerNick];
                    selectTankBtn.disabled = true;
                } else {
                    selectTankBtn.disabled = false;
                }
                
                // Состояние готовности
                const isReady = data.ready && data.ready[currentPlayerNick];
                if (isReady) {
                    readyBtn.style.display = 'none';
                    unreadyBtn.style.display = 'inline-block';
                    selectTankBtn.disabled = true;
                } else {
                    readyBtn.style.display = 'inline-block';
                    unreadyBtn.style.display = 'none';
                    if (!playerTank) selectTankBtn.disabled = false;
                }
            }
        });
    }

    async function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            // Удаляем игрока из комнаты
            await remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
            await remove(ref(db, `rooms/${currentRoomCode}/tanks/${currentPlayerNick}`));
            await remove(ref(db, `rooms/${currentRoomCode}/ready/${currentPlayerNick}`));
            
            // Проверяем, остались ли игроки
            const roomRef = ref(db, `rooms/${currentRoomCode}`);
            const snap = await get(roomRef);
            const data = snap.val();
            if (data && data.players && Object.keys(data.players).length === 0) {
                // Комната пуста, удаляем её
                await remove(ref(db, `rooms/${currentRoomCode}`));
            }
        }
        currentRoomCode = null;
        playerTank = null;
        selectionShown = false;
        if (roomListener) roomListener();
        if (onRoomLeft) onRoomLeft();
        roomInfoDiv.style.display = 'none';
    }

    async function resetRoomForNewGame() {
        if (!currentRoomCode) return;
        // Очищаем игровое состояние
        await update(ref(db), {
            [`rooms/${currentRoomCode}/gameState`]: null,
            [`rooms/${currentRoomCode}/ready`]: null,
            [`rooms/${currentRoomCode}/tanks`]: null
        });
        // Сбрасываем локальные переменные
        playerTank = null;
        selectionShown = false;
        // Обновляем интерфейс комнаты
        roomInfoDiv.style.display = 'block';
        selectTankBtn.disabled = false;
        readyBtn.style.display = 'inline-block';
        unreadyBtn.style.display = 'none';
        roomStatusSpan.textContent = '';
        await updatePlayersList();
    }

    // Обработчики кнопок
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
            copyBtn.style.display = 'inline-block';
            listenRoom(code);
        } catch (err) {
            console.error(err);
            alert('Ошибка создания комнаты');
        }
    };

    joinBtn.onclick = async () => {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        const code = roomCodeInput.value.trim();
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
            roomCodeDisplay.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);
        } catch (err) {
            console.error(err);
            alert('Ошибка присоединения');
        }
    };

    copyBtn.onclick = () => {
        if (currentRoomCode) {
            navigator.clipboard.writeText(currentRoomCode).then(() => {
                alert('Код скопирован: ' + currentRoomCode);
            });
        }
    };

    selectTankBtn.onclick = () => {
        if (!currentRoomCode) return;
        showTankSelection();
    };

    readyBtn.onclick = async () => {
        if (!playerTank) {
            alert('Сначала выберите танк');
            return;
        }
        await setReady(true);
    };

    unreadyBtn.onclick = async () => {
        await setReady(false);
    };

    leaveRoomBtn.onclick = async () => {
        await leaveRoom();
    };

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
        resetRoomForNewGame
    };
}
