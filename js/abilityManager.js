import { db } from './firebase.js';
import { ref, update, get, onValue, remove } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { abilities, abilityList } from './abilities.js';
import { TELEPORT_DISTANCE, TANK_HALF, VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';
import { isPositionFree } from './utils.js';

let currentPlayerNick = null;
let currentRoomCode = null;
let myAbility = null;
let myAbilityCooldown = 0;
let activeEffects = {};          // активные эффекты для текущего игрока
let savedState = null;           // для time_rewind

// Колбэки для выполнения действий в game.js
let onTeleportCallback = null;
let onBoomerangCallback = null;
let onRewindCallback = null;
let onWallCallback = null;
let onDroneCallback = null;
let onMineCallback = null;

export function setAbilityCallbacks(callbacks) {
    if (callbacks.teleport) onTeleportCallback = callbacks.teleport;
    if (callbacks.boomerang) onBoomerangCallback = callbacks.boomerang;
    if (callbacks.rewind) onRewindCallback = callbacks.rewind;
    if (callbacks.wall) onWallCallback = callbacks.wall;
    if (callbacks.drone) onDroneCallback = callbacks.drone;
    if (callbacks.mine) onMineCallback = callbacks.mine;
}

export async function initAbilities(roomCode, playerNick) {
    currentRoomCode = roomCode;
    currentPlayerNick = playerNick;
    
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snap = await get(roomRef);
    const data = snap.val();
    if (data && data.abilities && data.abilities[playerNick]) {
        myAbility = data.abilities[playerNick];
    } else {
        const randomAbility = abilityList[Math.floor(Math.random() * abilityList.length)];
        await update(ref(db), {
            [`rooms/${roomCode}/abilities/${playerNick}`]: randomAbility
        });
        myAbility = randomAbility;
    }
    return myAbility;
}

export function getMyAbility() {
    return myAbility ? { ...abilities[myAbility], id: myAbility } : null;
}

export function getCooldown() {
    return Math.max(0, myAbilityCooldown);
}

export async function activateAbility(myPos, lastMoveDir) {
    if (!currentRoomCode || !currentPlayerNick) return false;
    if (myAbilityCooldown > 0) return false;
    
    const ability = abilities[myAbility];
    if (!ability) return false;
    
    const activationKey = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await update(ref(db), {
        [`rooms/${currentRoomCode}/activeAbilities/${activationKey}`]: {
            player: currentPlayerNick,
            ability: myAbility,
            timestamp: activationKey,
            pos: myPos,
            dir: lastMoveDir
        }
    });
    
    myAbilityCooldown = ability.cooldown;
    applyEffectLocally(myAbility, true, myPos, lastMoveDir);
    return true;
}

function applyEffectLocally(abilityId, isMe, myPos, dir) {
    const ability = abilities[abilityId];
    if (!ability) return;
    
    const now = performance.now() / 1000;
    switch (abilityId) {
        case 'teleport':
            if (isMe && onTeleportCallback) {
                onTeleportCallback(myPos, dir);
            }
            break;
        case 'boomerang':
            if (isMe && onBoomerangCallback) {
                onBoomerangCallback(myPos, dir);
            }
            break;
        case 'time_rewind':
            if (isMe) {
                if (savedState) {
                    if (onRewindCallback) onRewindCallback(savedState);
                    savedState = null;
                } else {
                    savedState = { pos: { ...myPos }, health: 100, ammo: 10 };
                }
            }
            break;
        case 'wall_constructor':
            if (isMe && onWallCallback) {
                onWallCallback(myPos, dir);
            }
            break;
        case 'drone_swarm':
            if (isMe && onDroneCallback) {
                onDroneCallback(myPos);
            }
            break;
        case 'gravity_mine':
            if (isMe && onMineCallback) {
                onMineCallback(myPos);
            }
            break;
        default:
            if (ability.duration > 0) {
                activeEffects[abilityId] = {
                    start: now,
                    duration: ability.duration,
                    player: isMe ? currentPlayerNick : null
                };
            }
            break;
    }
}

export function updateEffects(deltaTime, myPos, enemyPos, obstacles, canvas, enemyNick) {
    const now = performance.now() / 1000;
    for (let id in activeEffects) {
        if (now - activeEffects[id].start > activeEffects[id].duration) {
            delete activeEffects[id];
        }
    }
    return activeEffects;
}

export function updateCooldown(deltaTime) {
    if (myAbilityCooldown > 0) {
        myAbilityCooldown -= deltaTime;
        if (myAbilityCooldown < 0) myAbilityCooldown = 0;
    }
}

export function getActiveEffects() {
    return activeEffects;
}

export function listenAbilities() {
    if (!currentRoomCode) return;
    const refAbilities = ref(db, `rooms/${currentRoomCode}/activeAbilities`);
    onValue(refAbilities, (snap) => {
        const data = snap.val();
        if (data) {
            for (let key in data) {
                const activation = data[key];
                if (activation.player !== currentPlayerNick) {
                    applyEffectLocally(activation.ability, false, activation.pos, activation.dir);
                    remove(ref(db, `rooms/${currentRoomCode}/activeAbilities/${key}`));
                }
            }
        }
    });
}
