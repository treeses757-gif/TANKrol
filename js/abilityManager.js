import { db } from './firebase.js';
import { ref, update, get } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { abilities, abilityList } from './abilities.js';
import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT, TANK_HALF } from './config.js';
import { isPositionFree, circleRectCollide } from './utils.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let myAbility = null;
let myAbilityCooldown = 0;
let activeEffects = {};      // активные эффекты для текущего игрока
let enemyAbility = null;

// Синхронизация способностей через Firebase
export async function initAbilities(roomCode, playerNick) {
    currentRoomCode = roomCode;
    currentPlayerNick = playerNick;
    
    // Получаем текущие способности из комнаты
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snap = await get(roomRef);
    const data = snap.val();
    if (data && data.abilities) {
        myAbility = data.abilities[playerNick];
        const enemyNick = Object.keys(data.players).find(n => n !== playerNick);
        if (enemyNick) enemyAbility = data.abilities[enemyNick];
    }
    
    // Если способность ещё не назначена – генерируем случайную
    if (!myAbility) {
        const randomAbility = abilityList[Math.floor(Math.random() * abilityList.length)];
        await update(ref(db), {
            [`rooms/${roomCode}/abilities/${playerNick}`]: randomAbility
        });
        myAbility = randomAbility;
    }
}

// Получить информацию о своей способности
export function getMyAbility() {
    return myAbility ? { ...abilities[myAbility], id: myAbility } : null;
}

// Получить кулдаун (в секундах)
export function getCooldown() {
    return Math.max(0, myAbilityCooldown);
}

// Активация способности (вызывается по нажатию E)
export async function activateAbility() {
    if (!currentRoomCode || !currentPlayerNick) return false;
    if (myAbilityCooldown > 0) return false;
    
    const ability = abilities[myAbility];
    if (!ability) return false;
    
    // Записываем в Firebase факт активации
    const activationKey = Date.now();
    await update(ref(db), {
        [`rooms/${currentRoomCode}/activeAbilities/${activationKey}`]: {
            player: currentPlayerNick,
            ability: myAbility,
            timestamp: activationKey
        }
    });
    
    // Запускаем локальный кулдаун
    myAbilityCooldown = ability.cooldown;
    
    // Применяем мгновенный эффект (если есть)
    applyEffectLocally(myAbility, true);
    
    return true;
}

// Применить эффект локально (или синхронизировать через Firebase)
function applyEffectLocally(abilityId, isMe) {
    const ability = abilities[abilityId];
    if (!ability) return;
    
    switch (abilityId) {
        case 'teleport':
            // телепорт на 200 пикселей в направлении движения
            // это будет обработано в game.js
            break;
        case 'boomerang':
            // бумеранг – будет создан специальный снаряд
            break;
        case 'wall_constructor':
            // создание временной стены
            break;
        case 'sapper_tape':
            // взрывная лента
            break;
        case 'time_rewind':
            // откат состояния
            break;
        default:
            // остальные – просто включаем активный эффект
            if (ability.duration > 0) {
                activeEffects[abilityId] = {
                    start: performance.now() / 1000,
                    duration: ability.duration,
                    player: isMe ? currentPlayerNick : null
                };
            }
            break;
    }
}

// Обновление активных эффектов (вызывается каждый кадр)
export function updateEffects(deltaTime, myPos, enemyPos, obstacles, canvas, setMyPos, setEnemyPos) {
    const now = performance.now() / 1000;
    
    // Удаляем истекшие эффекты
    for (let id in activeEffects) {
        if (now - activeEffects[id].start > activeEffects[id].duration) {
            delete activeEffects[id];
        }
    }
    
    // Применяем эффекты
    let modified = false;
    
    if (activeEffects['spider_tank'] && activeEffects['spider_tank'].player === currentPlayerNick) {
        // Игнорируем препятствия (будет флаг)
    }
    
    if (activeEffects['hacker_pulse'] && activeEffects['hacker_pulse'].player !== currentPlayerNick) {
        // Инвертируем управление (делаем в updateGame)
    }
    
    if (activeEffects['reflect_shield'] && activeEffects['reflect_shield'].player === currentPlayerNick) {
        // Отражаем пули
    }
    
    if (activeEffects['gravity_mine'] && activeEffects['gravity_mine'].player !== currentPlayerNick) {
        // Притягиваем врага
    }
    
    if (activeEffects['magnetic_grab'] && activeEffects['magnetic_grab'].player === currentPlayerNick) {
        // Притягиваем вражеские пули
    }
    
    if (activeEffects['turbo_ally'] && activeEffects['turbo_ally'].player !== currentPlayerNick) {
        // Ускоряем врага, но лишаем поворотов
    }
    
    // Возвращаем флаг, изменилась ли позиция
    return modified;
}

// Получить список активных эффектов для отрисовки
export function getActiveEffects() {
    return activeEffects;
}

// Уменьшить кулдаун каждый кадр
export function updateCooldown(deltaTime) {
    if (myAbilityCooldown > 0) {
        myAbilityCooldown -= deltaTime;
        if (myAbilityCooldown < 0) myAbilityCooldown = 0;
    }
}

// Синхронизация способностей от других игроков (слушатель Firebase)
export function listenAbilities(callback) {
    if (!currentRoomCode) return;
    const refAbilities = ref(db, `rooms/${currentRoomCode}/activeAbilities`);
    onValue(refAbilities, (snap) => {
        const data = snap.val();
        if (data) {
            // Обрабатываем новые активации
            for (let key in data) {
                const activation = data[key];
                if (activation.player !== currentPlayerNick) {
                    // Применяем эффект для врага
                    applyEffectLocally(activation.ability, false);
                    // Удаляем запись после обработки
                    remove(ref(db, `rooms/${currentRoomCode}/activeAbilities/${key}`));
                }
            }
        }
    });
}