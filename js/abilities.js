// Описание всех способностей
export const abilities = {
    'phantom_trail': {
        name: 'Фантомный след',
        description: 'Создаёт копию, которая повторяет ваш путь и стреляет',
        cooldown: 20,
        duration: 8,
        type: 'active'
    },
    'gravity_mine': {
        name: 'Гравитационная мина',
        description: 'Ставит мину, притягивающую врагов',
        cooldown: 15,
        duration: 5,
        type: 'active'
    },
    'reflect_shield': {
        name: 'Энергетический щит-отражатель',
        description: 'Отражает снаряды обратно',
        cooldown: 12,
        duration: 4,
        type: 'active'
    },
    'teleport': {
        name: 'Телепорт через стену',
        description: 'Мгновенно перемещается на небольшое расстояние',
        cooldown: 10,
        duration: 0,
        type: 'instant'
    },
    'spider_tank': {
        name: 'Танк-паук',
        description: 'Игнорирует препятствия на 5 секунд',
        cooldown: 18,
        duration: 5,
        type: 'active'
    },
    'boomerang': {
        name: 'Снаряд-бумеранг',
        description: 'Выпускает бумеранг, который возвращается',
        cooldown: 8,
        duration: 0,
        type: 'instant'
    },
    'hacker_pulse': {
        name: 'Хакерский импульс',
        description: 'Инвертирует управление врага на 5 секунд',
        cooldown: 20,
        duration: 5,
        type: 'active'
    },
    'underground': {
        name: 'Подземный ход',
        description: 'Ныряет под землю, становится невидимым',
        cooldown: 16,
        duration: 4,
        type: 'active'
    },
    'magnetic_grab': {
        name: 'Магнитный захват',
        description: 'Притягивает вражеские снаряды и обезвреживает их',
        cooldown: 14,
        duration: 3,
        type: 'active'
    },
    'turbo_ally': {
        name: 'Турбо-заряд союзника',
        description: 'Ускоряет союзника (или врага), лишая поворотов',
        cooldown: 12,
        duration: 3,
        type: 'active'
    },
    'wall_constructor': {
        name: 'Стена-конструктор',
        description: 'Возводит временную стену',
        cooldown: 10,
        duration: 6,
        type: 'active'
    },
    'drone_swarm': {
        name: 'Рой дронов',
        description: 'Дроны перехватывают снаряды и атакуют',
        cooldown: 25,
        duration: 10,
        type: 'active'
    },
    'sapper_tape': {
        name: 'Сапёрная лента',
        description: 'Оставляет взрывчатую ленту, которая детонирует',
        cooldown: 18,
        duration: 0,
        type: 'instant'
    },
    'echo_location': {
        name: 'Эхо-локация',
        description: 'Показывает врага через стены',
        cooldown: 12,
        duration: 4,
        type: 'active'
    },
    'time_rewind': {
        name: 'Обратный временной откат',
        description: 'Возвращает состояние танка',
        cooldown: 30,
        duration: 0,
        type: 'instant'
    }
};

export const abilityList = Object.keys(abilities);