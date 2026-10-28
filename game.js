'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

let COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - light blue
  '#ffb74d', // L - orange
  '#f06292', // U - pink
  '#a1887f', // dot - brown
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,0,8],[8,0,8],[8,8,8]],                  // U
  [[9]],                                       // dot (1x1)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-toggle');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const skinSelect = document.getElementById('skin-select');

let gridColor = '#22222e';
let slowHeld = false;

let board, current, next, hold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  return makePiece(Math.floor(Math.random() * (PIECES.length - 1)) + 1);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----
function drawRetro(context, px, py, s, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, s - 2, s - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, s - 2, 4);
}

function drawNeon(context, px, py, s, color) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 3, py + 3, s - 6, s - 6);
  context.fillStyle = color;
  context.globalAlpha *= 0.35;
  context.fillRect(px + 3, py + 3, s - 6, s - 6);
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawPastel(context, px, py, s, color) {
  roundRectPath(context, px + 1.5, py + 1.5, s - 3, s - 3, 8);
  context.fillStyle = color;
  context.fill();
  roundRectPath(context, px + 5, py + 4, s - 10, 6, 3);
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fill();
}

function drawPixel(context, px, py, s, color) {
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  // textura: tablero de 4x4 px
  const t = 4;
  context.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < s; i += t)
    for (let j = 0; j < s; j += t)
      if (((i + j) / t) % 2 === 0) context.fillRect(px + i, py + j, Math.min(t, s - i), Math.min(t, s - j));
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(px, py, s, t / 2);
  context.fillRect(px, py, t / 2, s);
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.fillRect(px, py + s - t / 2, s, t / 2);
  context.fillRect(px + s - t / 2, py, t / 2, s);
}

const SKINS = {
  retro: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#f06292', '#a1887f'],
    draw: drawRetro,
  },
  neon: {
    colors: [null, '#00f5ff', '#fff700', '#d400ff', '#39ff14', '#ff073a', '#1f51ff', '#ff9500', '#ff2bd6', '#e0e0e0'],
    draw: drawNeon,
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1b8', '#d7b9ef', '#b9e8c1', '#f6bcbc', '#b5d4f7', '#fbd3a6', '#f7b9d1', '#d3c1b9'],
    draw: drawPastel,
  },
  pixel: {
    colors: [null, '#29b6c9', '#e6b800', '#9c3fb0', '#43a047', '#d32f2f', '#1e78d2', '#ef8a00', '#d81b60', '#795548'],
    draw: drawPixel,
  },
};
let currentSkin = 'retro';

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  SKINS[currentSkin].draw(context, x * size, y * size, size, COLORS[colorIndex]);
  context.restore(); // restaura shadowBlur y globalAlpha
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawPreview(context, piece) {
  const NB = 30;
  context.clearRect(0, 0, 4 * NB, 4 * NB);
  if (!piece) return;
  const shape = piece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB);
}

function drawNext() {
  drawPreview(nextCtx, next);
}

function drawHold() {
  drawPreview(holdCtx, hold);
}

function holdPiece() {
  if (!hold) {
    hold = makePiece(current.type);
    spawn();
  } else {
    const swapped = makePiece(hold.type);
    if (collide(swapped.shape, swapped.x, swapped.y)) return;
    hold = makePiece(current.type);
    current = swapped;
  }
  dropAccum = 0;
  drawHold();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  const interval = slowHeld ? dropInterval * 2 : dropInterval;
  if (dropAccum >= interval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch (e) {}
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  themeBtn.textContent = t === 'dark' ? 'Light Theme' : 'Dark Theme';
  // redibujar aunque esté en pausa o game over
  if (current && next) { draw(); drawNext(); drawHold(); }
}

function setSkin(name) {
  if (!SKINS[name]) name = 'retro';
  currentSkin = name;
  COLORS = SKINS[name].colors;
  document.documentElement.dataset.skin = name;
  try { localStorage.setItem('skin', name); } catch (e) {}
  skinSelect.value = name;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  // redibujar aunque esté en pausa o game over
  if (current && next) { draw(); drawNext(); drawHold(); }
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  slowHeld = false;
  lastTime = performance.now();
  hold = null;
  drawHold();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyC') { slowHeld = true; return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'KeyS':
      holdPiece();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  if (e.code === 'KeyC') slowHeld = false;
});

window.addEventListener('blur', () => { slowHeld = false; });

restartBtn.addEventListener('click', init);

themeBtn.addEventListener('click', e => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  e.currentTarget.blur(); // evita que Space reactive el botón
});

skinSelect.addEventListener('change', e => {
  setSkin(e.currentTarget.value);
  e.currentTarget.blur(); // evita que Space/flechas cambien la skin
});

let savedSkin = null;
try { savedSkin = localStorage.getItem('skin'); } catch (e) {}
setSkin(savedSkin);

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
setTheme(savedTheme === 'light' ? 'light' : 'dark');

init();
