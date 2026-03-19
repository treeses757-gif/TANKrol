// Проверка столкновения круга с прямоугольником
export function circleRectCollide(cx, cy, radius, rect) {
    let closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    let closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    let dx = cx - closestX;
    let dy = cy - closestY;
    return (dx * dx + dy * dy) < radius * radius;
}

// Проверка, свободна ли позиция от препятствий
export function isPositionFree(x, y, radius, obstacles) {
    for (let obs of obstacles) {
        if (circleRectCollide(x, y, radius, obs)) return false;
    }
    return true;
}
