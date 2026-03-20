import { db } from './firebase.js';
import { ref, set, update, onValue, get, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { startGame, listenGameState, gameActive, loadMap } from './game.js';
import { getRandomMap } from './maps.js';
import { isPositionFree } from './utils.js';

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

    function generateCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    function findFreePosition(obstacles, radius = 20, maxAttempts = 2000) {
        const margin = radius;
        const maxX = window.innerWidth - margin;
        const maxY = window.innerHeight - margin;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const x = margin + Math.random() * (maxX - margin);
            const y = margin + Math.random() * (maxY - margin);
            if (isPositionFree(x, y, radius, obstacles)) {
                return { x, y };
            }
        }
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    createBtn.onclick = async () => {
        if (!currentPlayerNick) { alert('Сначала войдите'); return; }
        const code = generateCode();
        try {
            const roomRef = ref(db, `rooms/${code}`);
            const snap = await get(roomRef);
            if (snap.exists()) {
                return createBtn.onclick();
            }
            // Генерируем карту на весь экран (можно заменить на фиксированные 2000x2000)
            const map = getRandomMap(code, window.innerWidth, window.innerHeight);
            await set(roomRef, {
                players: { [currentPlayerNick]: true },
                gameState: null,
                map: map
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

            if (count === 2 && data.gameState === null) {
                if (currentPlayerNick === Object.keys(players)[0]) {
                    const obstacles = data.map || [];
                    let pos1 = findFreePosition(obstacles);
                    let pos2 = findFreePosition(obstacles);
                    while (Math.hypot(pos1.x - pos2.x, pos1.y - pos2.y) < 100) {
                        pos2 = findFreePosition(obstacles);
                    }
                    const gameState = {
                        [Object.keys(players)[0]]: pos1,
                        [Object.keys(players)[1]]: pos2
                    };
                    await set(ref(db, `rooms/${code}/gameState`), gameState);
                }
            }

            if (count === 2 && data.gameState !== null && !gameActive) {
                loadMap(code);
                startGame();
                listenGameState(code, currentPlayerNick);
                if (onRoomJoined) onRoomJoined(code);
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
