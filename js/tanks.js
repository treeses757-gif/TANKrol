// Описание доступных танков
export const tanks = {
    'phantom': {
        name: 'Призрак',
        color: '#8A2BE2', // фиолетовый
        ability: 'phantom_trail',
        abilityName: 'Фантомный след',
        description: 'Создаёт копию, повторяющую ваш путь и стреляющую',
        icon: '👻'
    },
    'guardian': {
        name: 'Страж',
        color: '#228B22', // зелёный
        ability: 'reflect_shield',
        abilityName: 'Отражающий щит',
        description: 'Активирует щит, отражающий вражеские снаряды',
        icon: '🛡️'
    },
    'spider': {
        name: 'Паук',
        color: '#8B4513', // коричневый
        ability: 'spider_tank',
        abilityName: 'Танк-паук',
        description: 'Может ездить по стенам и препятствиям 5 секунд',
        icon: '🕷️'
    },
    'boomer': {
        name: 'Бумеранг',
        color: '#FFA500', // оранжевый
        ability: 'boomerang',
        abilityName: 'Снаряд-бумеранг',
        description: 'Выпускает бумеранг, возвращающийся к танку',
        icon: '🪃'
    }
};

export const tankList = Object.keys(tanks);