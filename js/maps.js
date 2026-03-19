export function getRandomMap(roomCode) {
    let seed = parseInt(roomCode) || Math.floor(Math.random() * 1000);
    const rand = (max) => {
        seed = (seed * 9301 + 49297) % 233280;
        return Math.floor((seed / 233280) * max);
    };

    const maps = [mapForest, mapArena, mapMaze];
    const index = rand(maps.length);
    return maps[index](rand);
}

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

function mapArena(rnd) {
    return [
        { x: 200, y: 150, width: 60, height: 60 },
        { x: 500, y: 150, width: 60, height: 60 },
        { x: 200, y: 350, width: 60, height: 60 },
        { x: 500, y: 350, width: 60, height: 60 },
        { x: 350, y: 250, width: 80, height: 80 }
    ];
}

function mapMaze(rnd) {
    return [
        { x: 150, y: 80, width: 20, height: 200 },
        { x: 400, y: 200, width: 20, height: 250 },
        { x: 600, y: 100, width: 20, height: 300 },
        { x: 200, y: 300, width: 250, height: 20 },
        { x: 450, y: 400, width: 200, height: 20 },
        { x: 80, y: 450, width: 300, height: 20 }
    ];
}
