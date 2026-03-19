import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, gameActive, setCurrentRoom } from './game.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let roomListener = null;

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

    // Генерация кода
    function generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Создание комнаты
    createBtn.onclick = async () => {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        const code = generateCode();
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (snap.exists()) {
                return createBtn.onclick(); // повторить
            }
            await set(roomRef, {
                players: { [currentPlayerNick]: true },
                gameState: null
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

    // Присоединение к комнате
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

    // Копирование кода
    copyBtn.addEventListener('click', () => {
        if (currentRoomCode) {
            navigator.clipboard.writeText(currentRoomCode).then(() => {
                alert('Код скопирован: ' + currentRoomCode);
            }).catch(() => {
                alert('Не удалось скопировать код');
            });
        }
    });

    // Слушатель комнаты
    function listenRoom(code) {
        if (roomListener) roomListener();
        const roomRef = ref(db, `rooms/${code}`);
        roomListener = onValue(roomRef, (snap) => {
            const data = snap.val();
            if (!data) { leaveRoom(); return; }
            const players = data.players || {};
            const count = Object.keys(players).length;
            statusDiv.textContent = `Игроков: ${count}/2`;
            if (count === 2 && data.gameState === null) {
                // Первый игрок инициализирует позиции
                if (currentPlayerNick === Object.keys(players)[0]) {
                    const gameState = {
                        [Object.keys(players)[0]]: { x: 200, y: 200 },
                        [Object.keys(players)[1]]: { x: 600, y: 200 }
                    };
                    set(ref(db, `rooms/${code}/gameState`), gameState);
                }
            }
            if (count === 2 && data.gameState !== null && !gameActive) {
                // Запускаем игру
                startGame();
                listenGameState(code, currentPlayerNick);
                if (onRoomJoined) onRoomJoined(code);
            }
        });
    }

    // Выход из комнаты (можно вызвать извне)
    function leaveRoom() {
        if (currentPlayerNick && currentRoomCode) {
            remove(ref(db, `rooms/${currentRoomCode}/players/${currentPlayerNick}`));
        }
        currentRoomCode = null;
        if (roomListener) roomListener();
        if (onRoomLeft) onRoomLeft();
    }

    // Обновление ника текущего игрока (вызывается при входе)
    function setPlayerNick(nick) {
        currentPlayerNick = nick;
    }

    // Получить текущий код комнаты
    function getRoomCode() {
        return currentRoomCode;
    }

    return {
        setPlayerNick,
        leaveRoom,
        getRoomCode
    };
}