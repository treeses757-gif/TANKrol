// Простая реализация способностей без сложной синхронизации
// Способности активируются нажатием E и применяют мгновенный или временный эффект

let activeEffects = {}; // { effectId: { endTime, params } }

export function initSimpleAbilities(playerTank, enemyTank) {
    // Сохраняем выбор танков для использования в эффектах
    window.playerTank = playerTank;
    window.enemyTank = enemyTank;
    activeEffects = {};
}

export function activateSimpleAbility(myPos, lastMoveDir, tankId, callback) {
    const now = Date.now() / 1000;
    const abilityMap = {
        'phantom': () => {
            // Фантомный след: создать копию (просто для отображения)
            if (callback.onPhantom) callback.onPhantom(myPos);
            activeEffects['phantom'] = { endTime: now + 8, params: { startPos: { ...myPos } } };
        },
        'guardian': () => {
            // Отражающий щит: временный эффект
            activeEffects['reflect'] = { endTime: now + 4 };
        },
        'spider': () => {
            // Танк-паук: игнорировать препятствия
            activeEffects['spider'] = { endTime: now + 5 };
        },
        'boomer': () => {
            // Бумеранг: создать специальный снаряд
            if (callback.onBoomerang) callback.onBoomerang(myPos, lastMoveDir);
            activeEffects['boomer'] = { endTime: now + 0.5 }; // короткий кулдаун
        }
    };
    
    const ability = abilityMap[tankId];
    if (ability) ability();
    return true;
}

export function hasActiveEffect(effectId) {
    const now = Date.now() / 1000;
    return activeEffects[effectId] && activeEffects[effectId].endTime > now;
}

export function updateEffects() {
    const now = Date.now() / 1000;
    for (let id in activeEffects) {
        if (activeEffects[id].endTime <= now) {
            delete activeEffects[id];
        }
    }
}

export function getPhantomPosition() {
    if (activeEffects['phantom']) {
        return activeEffects['phantom'].params.startPos;
    }
    return null;
}