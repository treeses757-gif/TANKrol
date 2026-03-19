// Простая детерминированная псевдослучайная функция на основе seed
function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function rand(seed, n, max) {
    return Math.floor(seededRandom(seed + n * 1000) * max);
}

export function getRandomMap(roomCode) {
    const seed = parseInt(roomCode) || 123456;
    const mapType = rand(seed, 0, 3); // 0,1,2

    switch(mapType) {
        case 0: return mapForest(seed);
        case 1: return mapArena(seed);
        case 2: return mapMaze(seed);
        default: return mapArena(seed);
    }
}

function mapForest(seed) {
    const obstacles = [];
    const count = 20 + rand(seed, 1, 10);
    for (let i = 0; i < count; i++) {
        obstacles.push({
            x: 50 + rand(seed, i*2, 700),
            y: 50 + rand(seed, i*2+1, 400),
            width: 20 + rand(seed, i*2+2, 40),
            height: 20 + rand(seed, i*2+3, 40)
        });
    }
    return obstacles;
}

function mapArena(seed) {
    return [
        { x: 150, y: 100, width: 80, height: 80 },
        { x: 550, y: 100, width: 80, height: 80 },
        { x: 150, y: 350, width: 80, height: 80 },
        { x: 550, y: 350, width: 80, height: 80 },
        { x: 350, y: 220, width: 100, height: 100 }
    ];
}

function mapMaze(seed) {
    return [
        { x: 100, y: 80, width: 30, height: 200 },
        { x: 300, y: 150, width: 30, height: 250 },
        { x: 500, y: 100, width: 30, height: 300 },
        { x: 700, y: 200, width: 30, height: 200 },
        { x: 200, y: 300, width: 250, height: 30 },
        { x: 450, y: 400, width: 200, height: 30 },
        { x: 80, y: 450, width: 250, height: 30 }
    ];
}
