import { tanks, tankList } from './tanks.js';

let onConfirmCallback = null;

export function createSelectionScreen(onConfirm) {
    onConfirmCallback = onConfirm;
    
    const container = document.createElement('div');
    container.id = 'selection-screen';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.background = 'rgba(0,0,0,0.95)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.zIndex = '2000';
    container.style.overflowY = 'auto';
    container.style.padding = '20px';
    
    const title = document.createElement('h2');
    title.textContent = 'Выберите свой танк';
    title.style.color = 'white';
    title.style.marginBottom = '20px';
    title.style.fontSize = window.innerWidth < 600 ? '24px' : '32px';
    container.appendChild(title);
    
    const tanksContainer = document.createElement('div');
    tanksContainer.style.display = 'flex';
    tanksContainer.style.gap = '15px';
    tanksContainer.style.flexWrap = 'wrap';
    tanksContainer.style.justifyContent = 'center';
    tanksContainer.style.maxWidth = '100%';
    
    let selectedTank = null;
    
    tankList.forEach(tankId => {
        const tank = tanks[tankId];
        const card = document.createElement('div');
        card.className = 'tank-card';
        card.style.width = window.innerWidth < 600 ? '160px' : '200px';
        card.style.padding = '15px';
        card.style.background = tank.color;
        card.style.borderRadius = '15px';
        card.style.textAlign = 'center';
        card.style.cursor = 'pointer';
        card.style.transition = 'transform 0.2s';
        card.style.border = '2px solid white';
        card.style.margin = '5px';
        
        card.innerHTML = `
            <div style="font-size: ${window.innerWidth < 600 ? '36px' : '48px'}; margin-bottom: 8px;">${tank.icon}</div>
            <div style="font-size: ${window.innerWidth < 600 ? '18px' : '24px'}; font-weight: bold; margin-bottom: 5px;">${tank.name}</div>
            <div style="font-size: ${window.innerWidth < 600 ? '12px' : '14px'}; margin-bottom: 8px;">${tank.abilityName}</div>
            <div style="font-size: ${window.innerWidth < 600 ? '10px' : '12px'}; opacity: 0.8;">${tank.description}</div>
        `;
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.tank-card').forEach(c => {
                c.style.transform = 'scale(1)';
                c.style.border = '2px solid white';
            });
            card.style.transform = 'scale(1.05)';
            card.style.border = '3px solid gold';
            selectedTank = tankId;
        });
        
        tanksContainer.appendChild(card);
    });
    
    container.appendChild(tanksContainer);
    
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Подтвердить выбор';
    confirmBtn.style.marginTop = '20px';
    confirmBtn.style.padding = window.innerWidth < 600 ? '12px 25px' : '12px 30px';
    confirmBtn.style.fontSize = window.innerWidth < 600 ? '16px' : '18px';
    confirmBtn.style.background = '#4CAF50';
    confirmBtn.style.color = 'white';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '10px';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.style.width = window.innerWidth < 600 ? '80%' : 'auto';
    confirmBtn.style.maxWidth = '200px';
    confirmBtn.addEventListener('click', () => {
        if (selectedTank) {
            container.remove();
            if (onConfirmCallback) onConfirmCallback(selectedTank);
        } else {
            alert('Пожалуйста, выберите танк');
        }
    });
    container.appendChild(confirmBtn);
    
    document.body.appendChild(container);
}

export function showWaitingMessage() {
    const container = document.createElement('div');
    container.id = 'waiting-message';
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.background = 'rgba(0,0,0,0.8)';
    container.style.color = 'white';
    container.style.padding = '15px 25px';
    container.style.borderRadius = '10px';
    container.style.fontSize = '16px';
    container.style.zIndex = '1000';
    container.textContent = 'Ожидание выбора соперника...';
    document.body.appendChild(container);
}

export function hideWaitingMessage() {
    const msg = document.getElementById('waiting-message');
    if (msg) msg.remove();
}
