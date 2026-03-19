// Три разные карты (каждая возвращает массив препятствий)
// Препятствия: { x, y, width, height }

export function getRandomMap(roomCode) {
    // Используем код комнаты как seed для детерминированной случайности
    const seed = parseInt(roomCode) || Math.floor(Math.random() * 1000);
    const rand = (max) => Math.floor(Math.abs(Math.sin(seed + ++seed) * 10000)) % max;

    const maps = [mapForest, mapArena, mapMaze];
    const index = rand(maps.length);
    return maps[index](rand);
}

// Карта 1: Лес (много маленьких деревьев)
function mapForest(rnd) {
    const obstacles = [];
    const count = 20 + rnd(10);
    for (let i = 0; i < count; i++) {
        obstacles.push({
            x: 50 + rnd(700),
            y: 50 + rnd(400),
            width: 30 + rnd(30),
            height: 30 + rnd(30)
        });
    }
    return obstacles;
}

// Карта 2: Арена (симметричные укрытия)
function mapArena(rnd) {
    return [
        { x: 200, y: 150, width: 60, height: 60 },
        { x: 500, y: 150, width: 60, height: 60 },
        { x: 200, y: 350, width: 60, height: 60 },
        { x: 500, y: 350, width: 60, height: 60 },
        { x: 350, y: 250, width: 80, height: 80 } // центральное укрытие
    ];
}

// Карта 3: Лабиринт (стены)
function mapMaze(rnd) {
    return [
        // Вертикальные стены
        { x: 150, y: 80, width: 20, height: 200 },
        { x: 400, y: 200, width: 20, height: 250 },
        { x: 600, y: 100, width: 20, height: 300 },
        // Горизонтальные стены
        { x: 200, y: 300, width: 250, height: 20 },
        { x: 450, y: 400, width: 200, height: 20 },
        { x: 80, y: 450, width: 300, height: 20 }
    ];
}