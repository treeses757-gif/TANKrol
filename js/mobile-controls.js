// mobile-controls.js
let joystickActive = false;
let joystickDir = { x: 0, y: 0 };
let shootCallback = null;

export function initMobileControls(canvas, onShoot) {
    shootCallback = onShoot;
    
    // Контейнер для элементов управления
    const controlsContainer = document.createElement('div');
    controlsContainer.id = 'mobile-controls';
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.bottom = '20px';
    controlsContainer.style.left = '0';
    controlsContainer.style.width = '100%';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.justifyContent = 'space-between';
    controlsContainer.style.padding = '0 20px';
    controlsContainer.style.boxSizing = 'border-box';
    controlsContainer.style.pointerEvents = 'none'; // чтобы фон не перехватывал клики
    
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
    joystick.appendChild(joystickKnob);
    
    // Кнопка стрельбы
    const shootBtn = document.createElement('div');
    shootBtn.id = 'shoot-button';
    shootBtn.style.width = '100px';
    shootBtn.style.height = '100px';
    shootBtn.style.borderRadius = '50%';
    shootBtn.style.background = 'rgba(255,0,0,0.6)';
    shootBtn.style.border = '2px solid white';
    shootBtn.style.display = 'flex';
    shootBtn.style.alignItems = 'center';
    shootBtn.style.justifyContent = 'center';
    shootBtn.style.color = 'white';
    shootBtn.style.fontSize = '20px';
    shootBtn.style.fontWeight = 'bold';
    shootBtn.style.pointerEvents = 'auto';
    shootBtn.textContent = 'FIRE';
    
    controlsContainer.appendChild(joystick);
    controlsContainer.appendChild(shootBtn);
    document.body.appendChild(controlsContainer);
    
    // Обработчики джойстика
    let touchId = null;
    
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
            if (knob) {
                knob.style.transform = 'translate(-50%, -50%)';
            }
        }
    };
    
    joystick.addEventListener('touchstart', handleTouchStart, { passive: false });
    joystick.addEventListener('touchmove', handleTouchMove, { passive: false });
    joystick.addEventListener('touchend', handleTouchEnd);
    joystick.addEventListener('touchcancel', handleTouchEnd);
    
    // Кнопка стрельбы
    shootBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (shootCallback) shootCallback();
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
        // Мёртвая зона
        if (distance > 5) {
            joystickDir.x = dx / maxDist;
            joystickDir.y = dy / maxDist;
        } else {
            joystickDir.x = 0;
            joystickDir.y = 0;
        }
        
        const knob = document.getElementById('joystick-knob');
        if (knob) {
            knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        }
    }
}

export function getJoystickDirection() {
    return joystickDir;
}

export function removeMobileControls() {
    const controls = document.getElementById('mobile-controls');
    if (controls) controls.remove();
}