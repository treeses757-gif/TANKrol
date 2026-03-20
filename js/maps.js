// Генерация препятствий в зависимости от размеров экрана
export function getRandomMap(roomCode, width, height) {
    const seed = parseInt(roomCode) || 123456;
    const mapType = seededRand(seed, 0, 3);

    switch (mapType) {
        case 0: return mapForest(seed, width, height);
        case 1: return mapArena(seed, width, height);
        case 2: return mapMaze(seed, width, height);
        default: return mapArena(seed, width, height);
    }
}

function seededRand(seed, n, max) {
    const x = Math.sin(seed + n) * 10000;
    return Math.floor((x - Math.floor(x)) * max);
}

function mapForest(seed, w, h) {
    const obstacles = [];
    const count = 15 + seededRand(seed, 1, 15);
    for (let i = 0; i < count; i++) {
        obstacles.push({
            x: 50 + seededRand(seed, i * 2, w - 100),
            y: 50 + seededRand(seed, i * 2 + 1, h - 100),
            width: 20 + seededRand(seed, i * 2 + 2, 50),
            height: 20 + seededRand(seed, i * 2 + 3, 50)
        });
    }
    return obstacles;
}

function mapArena(seed, w, h) {
    return [
        { x: w * 0.2, y: h * 0.2, width: 60, height: 60 },
        { x: w * 0.7, y: h * 0.2, width: 60, height: 60 },
        { x: w * 0.2, y: h * 0.7, width: 60, height: 60 },
        { x: w * 0.7, y: h * 0.7, width: 60, height: 60 },
        { x: w * 0.45, y: h * 0.45, width: 80, height: 80 }
    ];
}

function mapMaze(seed, w, h) {
    return [
        { x: w * 0.1, y: h * 0.1, width: 30, height: h * 0.3 },
        { x: w * 0.3, y: h * 0.2, width: 30, height: h * 0.4 },
        { x: w * 0.5, y: h * 0.1, width: 30, height: h * 0.5 },
        { x: w * 0.7, y: h * 0.3, width: 30, height: h * 0.3 },
        { x: w * 0.2, y: h * 0.5, width: w * 0.3, height: 30 },
        { x: w * 0.5, y: h * 0.7, width: w * 0.3, height: 30 },
        { x: w * 0.1, y: h * 0.8, width: w * 0.3, height: 30 }
    ];
}
