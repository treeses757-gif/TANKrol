let joystickDir = { x: 0, y: 0 };
let shootCallback = null;
let abilityCallback = null;
let joystickActive = false;
let touchId = null;

export function initMobileControls(canvas, onShoot) {
    shootCallback = onShoot;
    
    const controlsContainer = document.createElement('div');
    controlsContainer.id = 'mobile-controls';
    controlsContainer.style.position = 'fixed';
    controlsContainer.style.bottom = '20px';
    controlsContainer.style.left = '0';
    controlsContainer.style.right = '0';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.justifyContent = 'space-between';
    controlsContainer.style.alignItems = 'flex-end';
    controlsContainer.style.padding = '0 20px';
    controlsContainer.style.boxSizing = 'border-box';
    controlsContainer.style.pointerEvents = 'none';
    controlsContainer.style.zIndex = '1000';
    
    // Левая колонка: джойстик и кнопка способности
    const leftColumn = document.createElement('div');
    leftColumn.style.display = 'flex';
    leftColumn.style.flexDirection = 'column';
    leftColumn.style.alignItems = 'center';
    leftColumn.style.gap = '10px';
    leftColumn.style.pointerEvents = 'auto';
    
    // Кнопка способности (уменьшенная, выше)
    const abilityBtn = document.createElement('div');
    abilityBtn.id = 'ability-button';
    abilityBtn.style.width = '70px';
    abilityBtn.style.height = '70px';
    abilityBtn.style.borderRadius = '50%';
    abilityBtn.style.background = 'rgba(0,255,0,0.7)';
    abilityBtn.style.border = '2px solid white';
    abilityBtn.style.display = 'flex';
    abilityBtn.style.alignItems = 'center';
    abilityBtn.style.justifyContent = 'center';
    abilityBtn.style.color = 'white';
    abilityBtn.style.fontSize = '16px';
    abilityBtn.style.fontWeight = 'bold';
    abilityBtn.style.pointerEvents = 'auto';
    abilityBtn.style.touchAction = 'manipulation';
    abilityBtn.textContent = 'SKILL';
    
    // Джойстик
    const joystick = document.createElement('div');
    joystick.id = 'joystick';
    joystick.style.width = '120px';
    joystick.style.height = '120px';
    joystick.style.borderRadius = '50%';
    joystick.style.background = 'rgba(255,255,255,0.3)';
    joystick.style.border = '2px solid white';
    joystick.style.position = 'relative';
    joystick.style.pointerEvents = 'auto';
    joystick.style.touchAction = 'none';
    
    const joystickKnob = document.createElement('div');
    joystickKnob.id = 'joystick-knob';
    joystickKnob.style.width = '50px';
    joystickKnob.style.height = '50px';
    joystickKnob.style.borderRadius = '50%';
    joystickKnob.style.background = 'white';
    joystickKnob.style.position = 'absolute';
    joystickKnob.style.top = '50%';
    joystickKnob.style.left = '50%';
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystickKnob.style.touchAction = 'none';
    joystick.appendChild(joystickKnob);
    
    leftColumn.appendChild(abilityBtn);
    leftColumn.appendChild(joystick);
    
    // Правая колонка: кнопка огня
    const shootBtn = document.createElement('div');
    shootBtn.id = 'shoot-button';
    shootBtn.style.width = '100px';
    shootBtn.style.height = '100px';
    shootBtn.style.borderRadius = '50%';
    shootBtn.style.background = 'rgba(255,0,0,0.7)';
    shootBtn.style.border = '2px solid white';
    shootBtn.style.display = 'flex';
    shootBtn.style.alignItems = 'center';
    shootBtn.style.justifyContent = 'center';
    shootBtn.style.color = 'white';
    shootBtn.style.fontSize = '20px';
    shootBtn.style.fontWeight = 'bold';
    shootBtn.style.pointerEvents = 'auto';
    shootBtn.style.touchAction = 'manipulation';
    shootBtn.textContent = 'FIRE';
    
    controlsContainer.appendChild(leftColumn);
    controlsContainer.appendChild(shootBtn);
    document.body.appendChild(controlsContainer);
    
    // Обработка джойстика
    const handleTouchStart = (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width/2;
        const centerY = rect.top + rect.height/2;
        touchId = touch.identifier;
        joystickActive = true;
        updateJoystick(touch.clientX, touch.clientY, centerX, centerY);
    };
    
    const handleTouchMove = (e) => {
        e.preventDefault();
        if (!joystickActive) return;
        let touch = Array.from(e.touches).find(t => t.identifier === touchId);
        if (!touch) return;
        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width/2;
        const centerY = rect.top + rect.height/2;
        updateJoystick(touch.clientX, touch.clientY, centerX, centerY);
    };
    
    const handleTouchEnd = (e) => {
        e.preventDefault();
        if (!joystickActive) return;
        if (e.touches.length === 0 || !Array.from(e.touches).some(t => t.identifier === touchId)) {
            joystickActive = false;
            joystickDir = { x: 0, y: 0 };
            const knob = document.getElementById('joystick-knob');
            if (knob) knob.style.transform = 'translate(-50%, -50%)';
            touchId = null;
        }
    };
    
    joystick.addEventListener('touchstart', handleTouchStart, { passive: false });
    joystick.addEventListener('touchmove', handleTouchMove, { passive: false });
    joystick.addEventListener('touchend', handleTouchEnd);
    joystick.addEventListener('touchcancel', handleTouchEnd);
    
    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (shootCallback) shootCallback();
    }, { passive: false });
    
    abilityBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (abilityCallback) abilityCallback();
    }, { passive: false });
    
    function updateJoystick(touchX, touchY, centerX, centerY) {
        let dx = touchX - centerX;
        let dy = touchY - centerY;
        const distance = Math.sqrt(dx*dx + dy*dy);
        const maxDist = 50;
        if (distance > maxDist) {
            dx = (dx / distance) * maxDist;
            dy = (dy / distance) * maxDist;
        }
        if (distance > 5) {
            joystickDir.x = dx / maxDist;
            joystickDir.y = dy / maxDist;
        } else {
            joystickDir.x = 0;
            joystickDir.y = 0;
        }
        const knob = document.getElementById('joystick-knob');
        if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
}

export function getJoystickDirection() {
    return joystickDir;
}

export function removeMobileControls() {
    const controls = document.getElementById('mobile-controls');
    if (controls) controls.remove();
}

export function setActivateAbilityCallback(callback) {
    abilityCallback = callback;
}
