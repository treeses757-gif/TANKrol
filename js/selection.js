import { tanks, tankList } from './tanks.js';

export function createSelectionScreen(onConfirm, currentTank = null) {
    const container = document.createElement('div');
    container.id = 'selection-screen';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.background = 'rgba(0,0,0,0.9)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.zIndex = '1000';
    
    const title = document.createElement('h2');
    title.textContent = 'Выберите свой танк';
    title.style.color = 'white';
    title.style.marginBottom = '30px';
    container.appendChild(title);
    
    const tanksContainer = document.createElement('div');
    tanksContainer.style.display = 'flex';
    tanksContainer.style.gap = '20px';
    tanksContainer.style.flexWrap = 'wrap';
    tanksContainer.style.justifyContent = 'center';
    
    let selectedTank = currentTank;
    
    tankList.forEach(tankId => {
        const tank = tanks[tankId];
        const card = document.createElement('div');
        card.className = 'tank-card';
        card.style.width = '200px';
        card.style.padding = '20px';
        card.style.background = tank.color;
        card.style.borderRadius = '15px';
        card.style.textAlign = 'center';
        card.style.cursor = 'pointer';
        card.style.transition = 'transform 0.2s';
        card.style.border = '2px solid white';
        
        if (currentTank === tankId) {
            card.style.border = '3px solid gold';
            card.style.transform = 'scale(1.05)';
        }
        
        card.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 10px;">${tank.icon}</div>
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${tank.name}</div>
            <div style="font-size: 14px; margin-bottom: 10px;">${tank.abilityName}</div>
            <div style="font-size: 12px; opacity: 0.8;">${tank.description}</div>
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
    confirmBtn.style.marginTop = '30px';
    confirmBtn.style.padding = '12px 30px';
    confirmBtn.style.fontSize = '18px';
    confirmBtn.style.background = '#4CAF50';
    confirmBtn.style.color = 'white';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '10px';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.addEventListener('click', () => {
        if (selectedTank) {
            container.remove();
            if (onConfirm) onConfirm(selectedTank);
        } else {
            alert('Пожалуйста, выберите танк');
        }
    });
    container.appendChild(confirmBtn);
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Отмена';
    cancelBtn.style.marginTop = '10px';
    cancelBtn.style.padding = '8px 20px';
    cancelBtn.style.fontSize = '14px';
    cancelBtn.style.background = '#999';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '10px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => {
        container.remove();
    });
    container.appendChild(cancelBtn);
    
    document.body.appendChild(container);
}
