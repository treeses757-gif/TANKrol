import { VIRTUAL_WIDTH, VIRTUAL_HEIGHT } from './config.js';

export function getRandomMap(roomCode) {
    const seed = parseInt(roomCode) || 123456;
    const mapType = seededRand(seed, 0, 3);

    switch (mapType) {
        case 0: return mapForest(seed);
        case 1: return mapArena(seed);
        case 2: return mapMaze(seed);
        default: return mapArena(seed);
    }
}

function seededRand(seed, n, max) {
    const x = Math.sin(seed + n) * 10000;
    return Math.floor((x - Math.floor(x)) * max);
}

function mapForest(seed) {
    const obstacles = [];
    const count = 15 + seededRand(seed, 1, 15);
    for (let i = 0; i < count; i++) {
        obstacles.push({
            x: 50 + seededRand(seed, i * 2, VIRTUAL_WIDTH - 100),
            y: 50 + seededRand(seed, i * 2 + 1, VIRTUAL_HEIGHT - 100),
            width: 20 + seededRand(seed, i * 2 + 2, 50),
            height: 20 + seededRand(seed, i * 2 + 3, 50)
        });
    }
    return obstacles;
}

function mapArena(seed) {
    return [
        { x: VIRTUAL_WIDTH * 0.2, y: VIRTUAL_HEIGHT * 0.2, width: 60, height: 60 },
        { x: VIRTUAL_WIDTH * 0.7, y: VIRTUAL_HEIGHT * 0.2, width: 60, height: 60 },
        { x: VIRTUAL_WIDTH * 0.2, y: VIRTUAL_HEIGHT * 0.7, width: 60, height: 60 },
        { x: VIRTUAL_WIDTH * 0.7, y: VIRTUAL_HEIGHT * 0.7, width: 60, height: 60 },
        { x: VIRTUAL_WIDTH * 0.45, y: VIRTUAL_HEIGHT * 0.45, width: 80, height: 80 }
    ];
}

function mapMaze(seed) {
    return [
        { x: VIRTUAL_WIDTH * 0.1, y: VIRTUAL_HEIGHT * 0.1, width: 30, height: VIRTUAL_HEIGHT * 0.3 },
        { x: VIRTUAL_WIDTH * 0.3, y: VIRTUAL_HEIGHT * 0.2, width: 30, height: VIRTUAL_HEIGHT * 0.4 },
        { x: VIRTUAL_WIDTH * 0.5, y: VIRTUAL_HEIGHT * 0.1, width: 30, height: VIRTUAL_HEIGHT * 0.5 },
        { x: VIRTUAL_WIDTH * 0.7, y: VIRTUAL_HEIGHT * 0.3, width: 30, height: VIRTUAL_HEIGHT * 0.3 },
        { x: VIRTUAL_WIDTH * 0.2, y: VIRTUAL_HEIGHT * 0.5, width: VIRTUAL_WIDTH * 0.3, height: 30 },
        { x: VIRTUAL_WIDTH * 0.5, y: VIRTUAL_HEIGHT * 0.7, width: VIRTUAL_WIDTH * 0.3, height: 30 },
        { x: VIRTUAL_WIDTH * 0.1, y: VIRTUAL_HEIGHT * 0.8, width: VIRTUAL_WIDTH * 0.3, height: 30 }
    ];
}
