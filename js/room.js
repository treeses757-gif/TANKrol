import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, loadMap, setTanks } from './game.js';
import { getRandomMap } from './maps.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { tankList } from './tanks.js'; // импортируем список танков

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;
let playerTank = null; // будет установлен автоматически

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

    // Автоматически назначаем танк игроку (можно рандомный, но для простоты – первый из списка)
    function assignDefaultTank() {
        return tankList[0]; // например, 'phantom'
    }

    async function checkAndStartGame() {
        console.log('checkAndStartGame вызван');
        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snap = await get(roomRef);
        const data = snap.val();
        if (!data) return;
        const players = Object.keys(data.players || {});
        const tanksData = data.tanks || {};

        console.log('Игроки:', players);
        console.log('Выбранные танки:', tanksData);

        // Если оба игрока есть и оба имеют танки (которые мы назначим)
        if (players.length === 2 && tanksData[players[0]] && tanksData[players[1]]) {
            // Убедимся, что gameState не null
            if (!data.gameState) {
                const pos1 = { x: 100, y: 100 };
                const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
                const gameState = {
                    [players[0]]: pos1,
                    [players[1]]: pos2
                };
                await set(ref(db, `rooms/${currentRoomCode}/gameState`), gameState);
                console.log('Созданы начальные позиции');
            }

            // Запускаем игру, если она ещё не активна
            const enemyNick = players.find(n => n !== currentPlayerNick);
            const enemyTank = tanksData[enemyNick];
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
            console.log(`Игроков в комнате: ${count}`);

            // Если оба игрока подключились и gameState ещё не создан, создаём
            if (count === 2 && !data.gameState) {
                const playerIds = Object.keys(players);
                const pos1 = { x: 100, y: 100 };
                const pos2 = { x: VIRTUAL_WIDTH - 100, y: VIRTUAL_HEIGHT - 100 };
                const gameState = {
                    [playerIds[0]]: pos1,
                    [playerIds[1]]: pos2
                };
                await set(ref(db, `rooms/${code}/gameState`), gameState);
                console.log('Созданы начальные позиции');
            }

            // Назначаем танки, если ещё не назначены
            const tanksData = data.tanks || {};
            if (count === 2 && currentPlayerNick && !playerTank) {
                // Назначаем танк текущему игроку, если его ещё нет
                if (!tanksData[currentPlayerNick]) {
                    const defaultTank = assignDefaultTank();
                    await update(ref(db), {
                        [`rooms/${code}/tanks/${currentPlayerNick}`]: defaultTank
                    });
                    playerTank = defaultTank;
                    console.log(`Игроку ${currentPlayerNick} назначен танк ${defaultTank}`);
                } else {
                    playerTank = tanksData[currentPlayerNick];
                }
            }

            // Проверяем, есть ли танки у обоих игроков, и запускаем игру
            const allPlayers = Object.keys(players);
            if (count === 2 && tanksData[allPlayers[0]] && tanksData[allPlayers[1]] && data.gameState) {
                if (currentPlayerNick && playerTank) {
                    console.log('Оба игрока имеют танки, запускаем игру');
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
