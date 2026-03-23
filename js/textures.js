// Загружаем текстуры и экспортируем их
const tankBlueImg = new Image();
const tankRedImg = new Image();
tankBlueImg.src = 'img/tank_blue.png';
tankRedImg.src = 'img/tank_red.png';

// Можно добавить промисы для ожидания загрузки, но пока просто экспортируем
export { tankBlueImg, tankRedImg };