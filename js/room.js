import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, loadMap, setTanks } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { tankList } from './tanks.js';

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

    // Назначаем случайный танк для игрока
    function assignRandomTank() {
        const randomIndex = Math.floor(Math.random() * tankList.length);
        return tankList[randomIndex];
    }

    async function checkAndStartGame() {
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        if (!data) return;

        const players = Object.keys(data.players || {});
        const tanks = data.tanks || {};

        // Если оба игрока есть и у обоих есть танки
        if (players.length === 2 && tanks[players[0]] && tanks[players[1]]) {
            const enemyNick = players.find(n => n !== currentPlayerNick);
            const enemyTank = tanks[enemyNick];
            setTanks(currentPlayerNick, playerTank, enemyNick, enemyTank);
            loadMap(currentRoomCode);
            startGame(currentRoomCode, currentPlayerNick, playerTank, enemyTank);
            listenGameState(currentRoomCode, currentPlayerNick);
            if (onRoomJoined) onRoomJoined(currentRoomCode);
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

            const players = Object.keys(data.players || {});
            const count = players.length;
            statusDiv.textContent = `Игроков: ${count}/2`;

            // Если оба игрока подключились и игра ещё не началась
            if (count === 2 && data.gameState === null) {
                // Создаём начальные позиции, если ещё не созданы
                if (!data.gameState) {
                    const pos1 = { x: 100, y: 100 };
                    const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
                    const gameState = {
                        [players[0]]: pos1,
                        [players[1]]: pos2
                    };
                    await set(ref(db, `rooms/${code}/gameState`), gameState);
                }

                // Назначаем танки тем игрокам, у кого их ещё нет
                const tanks = data.tanks || {};
                let needUpdate = false;
                for (let nick of players) {
                    if (!tanks[nick]) {
                        const newTank = assignRandomTank();
                        await update(ref(db), {
                            [`rooms/${code}/tanks/${nick}`]: newTank
                        });
                        needUpdate = true;
                        if (nick === currentPlayerNick) playerTank = newTank;
                    } else if (nick === currentPlayerNick) {
                        playerTank = tanks[nick];
                    }
                }
                if (needUpdate) {
                    // После обновления танков перепроверяем запуск игры
                    checkAndStartGame();
                } else {
                    // Если танки уже есть, сразу запускаем
                    checkAndStartGame();
                }
            } else if (count === 2 && data.gameState !== null && !gameActive) {
                // Игра уже начата, но локально ещё не активна – запускаем
                const tanks = data.tanks || {};
                if (tanks[currentPlayerNick]) {
                    playerTank = tanks[currentPlayerNick];
                    checkAndStartGame();
                }
            }
        });
    }

    function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
        }
        currentRoomCode = null;
        playerTank = null;
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
