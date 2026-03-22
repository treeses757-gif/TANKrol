import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, gameActive, loadMap, setTanks } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { createSelectionScreen, showWaitingMessage, hideWaitingMessage } from './selection.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;
let playerTank = null;
let selectionShown = false;

export function initRoom(components) {
    const {
        createBtn,
        joinBtn,
        roomCodeInput,
        roomCodeDisplay,
        roomCodeSpan,
        copyBtn,
        statusDiv,
        onRoomJoined,
        onRoomLeft
    } = components;

    function generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async function showTankSelectionAndWait() {
        if (selectionShown) return;
        selectionShown = true;
        console.log('Показываем экран выбора танка');
        createSelectionScreen(async (tankId) => {
            console.log('Выбран танк:', tankId);
            playerTank = tankId;
            await update(ref(db), {
                [`rooms/${currentRoomCode}/tanks/${currentPlayerNick}`]: tankId
            });
            await checkAndStartGame();
        });
    }

    async function checkAndStartGame() {
        console.log('checkAndStartGame вызван для', currentPlayerNick);
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        if (!data) return;

        const players = Object.keys(data.players || {});
        const tanks = data.tanks || {};

        console.log('Игроки:', players);
        console.log('Выбранные танки:', tanks);

        if (players.length === 2 && tanks[players[0]] && tanks[players[1]]) {
            // Создаём gameState, если его нет
            let gameState = data.gameState;
            if (!gameState) {
                console.log('Создаём gameState');
                const pos1 = { x: 100, y: 100 };
                const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
                gameState = {
                    [players[0]]: pos1,
                    [players[1]]: pos2
                };
                await set(ref(db, `rooms/${currentRoomCode}/gameState`), gameState);
            }

            // Если игра уже активна у этого игрока, не запускаем повторно
            if (gameActive) {
                console.log('Игра уже активна, пропускаем');
                return;
            }

            // Запускаем игру для этого игрока
            console.log('Запускаем игру для', currentPlayerNick);
            hideWaitingMessage();
            const enemyNick = players.find(n => n !== currentPlayerNick);
            const enemyTank = tanks[enemyNick];
            setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
            loadMap(currentRoomCode);
            startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
            listenGameState(currentRoomCode, currentPlayerNick);
            if (onRoomJoined) onRoomJoined(currentRoomCode);
        } else if (playerTank) {
            console.log('Ждём выбора соперника');
            showWaitingMessage();
        } else {
            console.log('Не все танки выбраны или не хватает игроков');
        }
    }

    async function checkShowSelection(playersCount, tanksData) {
        console.log('checkShowSelection:', playersCount, 'myTank=', tanksData[currentPlayerNick], 'selectionShown=', selectionShown);
        if (playersCount === 2 && currentPlayerNick && !tanksData[currentPlayerNick] && !selectionShown) {
            console.log('Условия выполнены – показываем выбор танка');
            await showTankSelectionAndWait();
        }
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
                tanks: {}
            });

            currentRoomCode = code;
            roomCodeDisplay.textContent = code;
            roomCodeSpan.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);
            console.log('Комната создана, код:', code);
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
        console.log('Попытка присоединиться к комнате:', code);
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (!snap.exists()) { alert('Комната не найдена'); return; }
            const players = snap.val().players || {};
            if (Object.keys(players).length >= 2) { alert('Комната полна'); return; }

            await update(ref(db, `rooms/${code}/players`), { [currentPlayerNick]: true });
            currentRoomCode = code;
            roomCodeDisplay.textContent = code;
            roomCodeSpan.textContent = code;
            copyBtn.style.display = 'inline-block';
            listenRoom(code);
            console.log('Присоединились, код:', code);

            // После присоединения сразу проверяем, нужно ли показать выбор
            const updatedSnap = await get(roomRef);
            const updatedData = updatedSnap.val();
            const playersCount = Object.keys(updatedData.players || {}).length;
            await checkShowSelection(playersCount, updatedData.tanks || {});
        } catch (err) {
            console.error(err);
            alert('Ошибка присоединения');
        }
    };

    copyBtn.addEventListener('click', () => {
        if (currentRoomCode) {
            navigator.clipboard.writeText(currentRoomCode).then(() => {
                alert('Код скопирован: ' + currentRoomCode);
            }).catch(() => {
                alert('Не удалось скопировать код');
            });
        }
    });

    function listenRoom(code) {
        if (roomListener) roomListener();
        const roomRef = ref(db, `rooms/${code}`);
        roomListener = onValue(roomRef, async (snap) => {
            const data = snap.val();
            if (!data) { leaveRoom(); return; }

            const players = data.players || {};
            const count = Object.keys(players).length;
            statusDiv.textContent = `Игроков: ${count}/2`;
            console.log(`Игроков в комнате: ${count}, данные:`, data);

            // Проверяем, нужно ли показать выбор
            await checkShowSelection(count, data.tanks || {});

            // Проверяем, можно ли начинать игру
            const tanks = data.tanks || {};
            if (count === 2 && tanks[players[0]] && tanks[players[1]]) {
                await checkAndStartGame();
            }
        });
    }

    function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
        }
        currentRoomCode = null;
        playerTank = null;
        selectionShown = false;
        if (roomListener) roomListener();
        if (onRoomLeft) onRoomLeft();
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
