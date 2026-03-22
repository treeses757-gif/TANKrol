export const tanks = {
    'phantom': {
        name: 'Призрак',
        ability: 'phantom_trail',
        abilityName: 'Фантомный след',
        description: 'Создаёт копию, которая повторяет ваш путь и стреляет',
        icon: '👻',
        color: '#8A2BE2',
        // Параметры отрисовки
        body: { width: 28, height: 28, offsetY: 0 },
        turret: { radius: 12, offsetY: 0 },
        tracks: { width: 32, height: 4, offsetY: 12 },
        gun: { length: 18, width: 3 }
    },
    'guardian': {
        name: 'Страж',
        ability: 'reflect_shield',
        abilityName: 'Отражающий щит',
        description: 'Активирует щит, отражающий вражеские снаряды',
        icon: '🛡️',
        color: '#228B22',
        body: { width: 30, height: 26, offsetY: 2 },
        turret: { radius: 14, offsetY: -2 },
        tracks: { width: 34, height: 4, offsetY: 14 },
        gun: { length: 20, width: 4 }
    },
    'spider': {
        name: 'Паук',
        ability: 'spider_tank',
        abilityName: 'Танк-паук',
        description: 'Может ездить по стенам и препятствиям 5 секунд',
        icon: '🕷️',
        color: '#8B4513',
        body: { width: 26, height: 26, offsetY: 0 },
        turret: { radius: 10, offsetY: 2 },
        tracks: { width: 30, height: 3, offsetY: 13 },
        gun: { length: 16, width: 3 }
    },
    'boomer': {
        name: 'Бумеранг',
        ability: 'boomerang',
        abilityName: 'Снаряд-бумеранг',
        description: 'Выпускает бумеранг, возвращающийся к танку',
        icon: '🪃',
        color: '#FFA500',
        body: { width: 28, height: 28, offsetY: 0 },
        turret: { radius: 12, offsetY: -1 },
        tracks: { width: 32, height: 4, offsetY: 12 },
        gun: { length: 22, width: 3 }
    }
};

export const tankList = Object.keys(tanks);
