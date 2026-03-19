export function getRandomMap(roomCode, canvasWidth = 1200, canvasHeight = 800) {
    let seed = parseInt(roomCode) || Math.floor(Math.random() * 1000);
    const rand = (max) => {
        seed = (seed * 9301 + 49297) % 233280;
        return Math.floor((seed / 233280) * max);
    };

    const maps = [mapForest, mapArena, mapMaze];
    const index = rand(maps.length);
    return maps[index](rand, canvasWidth, canvasHeight);
}

function mapForest(rnd, w, h) {
    const obstacles = [];
    const count = 20 + rnd(10);
    for (let i = 0; i < count; i++) {
        obstacles.push({
            x: 50 + rnd(w - 100),
            y: 50 + rnd(h - 100),
            width: 30 + rnd(60),
            height: 30 + rnd(60)
        });
    }
    return obstacles;
}

function mapArena(rnd, w, h) {
    return [
        { x: w * 0.2, y: h * 0.2, width: 80, height: 80 },
        { x: w * 0.7, y: h * 0.2, width: 80, height: 80 },
        { x: w * 0.2, y: h * 0.7, width: 80, height: 80 },
        { x: w * 0.7, y: h * 0.7, width: 80, height: 80 },
        { x: w * 0.45, y: h * 0.45, width: 120, height: 120 }
    ];
}

function mapMaze(rnd, w, h) {
    return [
        { x: w * 0.15, y: h * 0.1, width: 30, height: h * 0.3 },
        { x: w * 0.4, y: h * 0.25, width: 30, height: h * 0.4 },
        { x: w * 0.7, y: h * 0.15, width: 30, height: h * 0.5 },
        { x: w * 0.2, y: h * 0.5, width: w * 0.3, height: 30 },
        { x: w * 0.55, y: h * 0.65, width: w * 0.25, height: 30 },
        { x: w * 0.1, y: h * 0.8, width: w * 0.4, height: 30 }
    ];
}
