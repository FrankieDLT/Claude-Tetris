'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Orden: I, O, T, S, Z, J, L, U, dot
const SKINS = {
  retro: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#f06292', '#a1887f'],
  },
  neon: {
    colors: [null, '#00ffff', '#ffff00', '#ff00ff', '#39ff14', '#ff073a', '#1f51ff', '#ff9500', '#ff2bd6', '#e0e0e0'],
  },
  pastel: {
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8f0', '#b8e6c1', '#f5b8b8', '#b8d4f5', '#fbd3a8', '#f7bcd2', '#d7c4bb'],
  },
  pixel: {
    colors: [null, '#29b6f6', '#fdd835', '#ab47bc', '#66bb6a', '#ef5350', '#3f6fd8', '#fb8c00', '#ec407a', '#8d6e63'],
  },
};

let COLORS = SKINS.retro.colors;
let skin = 'retro';

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
const skinSelect = document.getElementById('skin-select');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const startLevelSel = document.getElementById('start-level');

const MAX_START_LEVEL = 15;

const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsEl = document.getElementById('records');
const scoreListEl = document.getElementById('score-list');
const bestStatsEl = document.getElementById('best-stats');
const resetBtn = document.getElementById('reset-records');

const MAX_SCORES = 5;

let gridColor = '#22222e';
let slowHeld = false;
let startLevel = 1;
let records = loadRecords();
let pendingRank = -1;
let combo = 0, bestCombo = 0;

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
    combo++;
    bestCombo = Math.max(bestCombo, combo);
  } else {
    combo = 0;
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalFor(level);
    updateHUD();
  }
}

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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

const BLOCK_DRAWERS = {
  retro(context, px, py, s, color) {
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, s, 4);
  },
  neon(context, px, py, s, color) {
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.fillStyle = color;
    context.fillRect(px + 2, py + 2, s - 4, s - 4);
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(255,255,255,0.35)';
    context.fillRect(px + 4, py + 4, s - 8, s - 8);
  },
  pastel(context, px, py, s, color) {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(px, py, s, s, s * 0.3);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.45)';
    context.beginPath();
    context.roundRect(px + s * 0.18, py + s * 0.14, s * 0.64, s * 0.18, s * 0.09);
    context.fill();
  },
  pixel(context, px, py, s, color) {
    context.fillStyle = color;
    context.fillRect(px, py, s, s);
    const cell = Math.max(2, Math.round(s / 6));
    const n = Math.floor(s / cell);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
        if (edge) context.fillStyle = (i === 0 || j === 0) ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
        else if ((i + j) % 2) context.fillStyle = 'rgba(0,0,0,0.18)';
        else continue;
        context.fillRect(px + i * cell, py + j * cell, cell, cell);
      }
    }
  },
};

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  BLOCK_DRAWERS[skin](context, x * size + 1, y * size + 1, size - 2, COLORS[colorIndex]);
  context.globalAlpha = 1;
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

function loadRecords() {
  const empty = { scores: [], bestCombo: 0, maxLines: 0 };
  try {
    const r = JSON.parse(localStorage.getItem('records'));
    if (r && Array.isArray(r.scores)) return { ...empty, ...r };
  } catch (e) {}
  return empty;
}

function saveRecords() {
  try { localStorage.setItem('records', JSON.stringify(records)); } catch (e) {}
}

// posición (0-based) que ocuparía el puntaje actual, o -1 si no entra al top 5
function scoreRank(s) {
  if (s <= 0) return -1;
  const idx = records.scores.findIndex(e => s > e.score);
  if (idx !== -1) return idx;
  return records.scores.length < MAX_SCORES ? records.scores.length : -1;
}

function renderRecords(highlight) {
  scoreListEl.textContent = '';
  const list = records.scores.slice();
  if (highlight >= 0) list.splice(highlight, 0, { name: nameInput.value.trim() || 'Tú', score });
  for (let i = 0; i < MAX_SCORES; i++) {
    const li = document.createElement('li');
    const e = list[i];
    const left = document.createElement('span');
    const right = document.createElement('span');
    left.textContent = `${i + 1}. ${e ? e.name : '---'}`;
    right.textContent = e ? e.score.toLocaleString() : '';
    li.append(left, right);
    if (i === highlight) li.classList.add('highlight');
    scoreListEl.appendChild(li);
  }
  bestStatsEl.textContent =
    `Mejor combo: ${records.bestCombo} · Máx. líneas: ${records.maxLines}`;
}

function submitScore() {
  if (pendingRank < 0) return;
  records.scores.splice(pendingRank, 0, { name: nameInput.value.trim() || 'Anónimo', score });
  records.scores.length = Math.min(records.scores.length, MAX_SCORES);
  const rank = pendingRank;
  pendingRank = -1;
  saveRecords();
  nameForm.classList.add('hidden');
  renderRecords(rank);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records.bestCombo = Math.max(records.bestCombo, bestCombo);
  records.maxLines = Math.max(records.maxLines, lines);
  saveRecords();
  pendingRank = scoreRank(score);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  nameInput.value = '';
  nameForm.classList.toggle('hidden', pendingRank < 0);
  recordsEl.classList.remove('hidden');
  restartBtn.textContent = 'Reiniciar';
  renderRecords(pendingRank);
  overlay.classList.remove('hidden');
  if (pendingRank >= 0) nameInput.focus();
}

function showStart() {
  gameOver = true;
  cancelAnimationFrame(animId);
  pendingRank = -1;
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  nameForm.classList.add('hidden');
  recordsEl.classList.remove('hidden');
  restartBtn.textContent = 'Jugar';
  renderRecords(-1);
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    slowHeld = false;
    cancelAnimationFrame(animId);
    startLevelSel.value = startLevel;
    pauseMenu.classList.remove('hidden');
    resumeBtn.focus();
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

function redrawAll() {
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  // redibujar aunque esté en pausa o game over
  if (current && next) { draw(); drawNext(); drawHold(); }
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch (e) {}
  themeBtn.textContent = t === 'dark' ? 'Light Theme' : 'Dark Theme';
  redrawAll();
}

function setSkin(s) {
  if (!SKINS[s]) s = 'retro';
  skin = s;
  COLORS = SKINS[s].colors;
  document.documentElement.dataset.skin = s;
  skinSelect.value = s;
  try { localStorage.setItem('skin', s); } catch (e) {}
  redrawAll();
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  dropAccum = 0;
  slowHeld = false;
  combo = 0;
  bestCombo = 0;
  if (pendingRank >= 0) submitScore();
  lastTime = performance.now();
  hold = null;
  drawHold();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  if (e.code === 'KeyC') { slowHeld = true; return; }
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

pauseRestartBtn.addEventListener('click', e => { init(); e.currentTarget.blur(); });
resumeBtn.addEventListener('click', e => { togglePause(); e.currentTarget.blur(); });

for (let l = 1; l <= MAX_START_LEVEL; l++) startLevelSel.add(new Option(l, l));
startLevelSel.addEventListener('change', () => {
  startLevel = Number(startLevelSel.value);
  startLevelSel.blur(); // evita que las flechas cambien el nivel al reanudar
});

restartBtn.addEventListener('click', e => {
  init();
  e.currentTarget.blur(); // evita que Space reactive el botón
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  submitScore();
  restartBtn.focus();
});

nameInput.addEventListener('input', () => {
  if (pendingRank >= 0) renderRecords(pendingRank);
});

resetBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = { scores: [], bestCombo: 0, maxLines: 0 };
  saveRecords();
  pendingRank = -1;
  nameForm.classList.add('hidden');
  renderRecords(-1);
});

themeBtn.addEventListener('click', e => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  e.currentTarget.blur(); // evita que Space reactive el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
setTheme(savedTheme === 'light' ? 'light' : 'dark');

skinSelect.addEventListener('change', e => {
  setSkin(e.target.value);
  e.target.blur(); // evita que Space/flechas cambien la opción
});

let savedSkin = null;
try { savedSkin = localStorage.getItem('skin'); } catch (e) {}
setSkin(savedSkin);

init();
showStart();
