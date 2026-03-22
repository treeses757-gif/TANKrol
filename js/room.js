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
        createSelectionScreen(async (tankId) => {
            playerTank = tankId;
            await update(ref(db), {
                [`rooms/${currentRoomCode}/tanks/${currentPlayerNick}`]: tankId
            });
            await checkAndStartGame();
        });
    }

    async function checkAndStartGame() {
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        const players = Object.keys(data.players || {});
        const tanks = data.tanks || {};

        if (players.length === 2 && tanks[players[0]] && tanks[players[1]]) {
            hideWaitingMessage();
            const enemyNick = players.find(n => n !== currentPlayerNick);
            const enemyTank = tanks[enemyNick];
            setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
            loadMap(currentRoomCode);
            startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
            listenGameState(currentRoomCode, currentPlayerNick);
            if (onRoomJoined) onRoomJoined(currentRoomCode);
        } else if (playerTank) {
            showWaitingMessage();
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
            roomCodeSpan.textContent = code;
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

            // Если оба игрока подключились и игра ещё не началась
            if (count === 2 && data.gameState === null) {
                if (!data.gameState) {
                    const pos1 = { x: 100, y: 100 };
                    const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
                    const gameState = {
                        [Object.keys(players)[0]]: pos1,
                        [Object.keys(players)[1]]: pos2
                    };
                    await set(ref(db, `rooms/${code}/gameState`), gameState);
                }

                // Если мы ещё не выбрали танк – показываем выбор
                if (currentPlayerNick && !playerTank) {
                    showTankSelectionAndWait();
                }
            }

            // Если оба выбрали танки – запускаем игру (если ещё не активна)
            const tanks = data.tanks || {};
            if (count === 2 && tanks[players[0]] && tanks[players[1]] && data.gameState && !gameActive) {
                if (currentPlayerNick && playerTank) {
                    await checkAndStartGame();
                }
            }
        });
    }

    function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
        }
        currentRoomCode = null;
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
