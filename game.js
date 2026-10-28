'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
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
const hsSection = document.getElementById('hs-section');
const hsTable = document.getElementById('hs-table');
const hsStats = document.getElementById('hs-stats');
const hsForm = document.getElementById('hs-form');
const hsName = document.getElementById('hs-name');
const hsSaveBtn = document.getElementById('hs-save-btn');
const hsResetBtn = document.getElementById('hs-reset-btn');

const MAX_SCORES = 5;

let gridColor = '#22222e';
let slowHeld = false;

let board, current, next, hold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxCombo;
let started = false;
let lastEntryDate = null;

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
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0; // se corta la racha
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
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

// ---- Récords (localStorage) ----
function loadScores() {
  try {
    const arr = JSON.parse(localStorage.getItem('highScores'));
    if (Array.isArray(arr)) {
      return arr
        .filter(s => s && typeof s.score === 'number')
        .map(s => ({ name: String(s.name ?? 'Anónimo'), score: s.score, lines: +s.lines || 0, maxCombo: +s.maxCombo || 0, date: s.date }))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SCORES);
    }
  } catch (e) {}
  return [];
}

function saveScores(arr) {
  try { localStorage.setItem('highScores', JSON.stringify(arr)); } catch (e) {}
}

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem('highStats'));
    if (s) return { maxCombo: +s.maxCombo || 0, maxLines: +s.maxLines || 0 };
  } catch (e) {}
  return { maxCombo: 0, maxLines: 0 };
}

function updateStats() {
  const s = loadStats();
  s.maxCombo = Math.max(s.maxCombo, maxCombo);
  s.maxLines = Math.max(s.maxLines, lines);
  try { localStorage.setItem('highStats', JSON.stringify(s)); } catch (e) {}
}

function qualifies() {
  if (score <= 0) return false;
  const arr = loadScores();
  return arr.length < MAX_SCORES || score > arr[arr.length - 1].score;
}

function renderScores() {
  const arr = loadScores();
  hsTable.textContent = '';
  if (!arr.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin récords todavía';
    hsTable.appendChild(li);
  }
  arr.forEach(s => {
    const li = document.createElement('li');
    if (lastEntryDate !== null && s.date === lastEntryDate) li.className = 'current';
    const name = document.createElement('span');
    name.className = 'hs-who';
    name.textContent = s.name;
    const pts = document.createElement('span');
    pts.className = 'hs-pts';
    pts.textContent = Number(s.score).toLocaleString();
    const extra = document.createElement('span');
    extra.className = 'hs-extra';
    extra.textContent = `${s.lines} líneas · combo x${s.maxCombo}`;
    li.append(name, pts, extra);
    hsTable.appendChild(li);
  });
  const st = loadStats();
  hsStats.textContent = `Mejor combo: ${st.maxCombo} · Máx. líneas: ${st.maxLines}`;
}

function submitScore() {
  if (hsForm.classList.contains('hidden')) return;
  const name = hsName.value.trim().slice(0, 12) || 'Anónimo';
  const entry = { name, score, lines, maxCombo, date: Date.now() };
  const arr = loadScores();
  arr.push(entry);
  arr.sort((a, b) => b.score - a.score);
  saveScores(arr.slice(0, MAX_SCORES));
  lastEntryDate = entry.date;
  hsForm.classList.add('hidden');
  renderScores();
}

function showStart() {
  started = false;
  gameOver = true;
  lastEntryDate = null;
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  hsForm.classList.add('hidden');
  hsSection.classList.remove('hidden');
  renderScores();
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateStats();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  restartBtn.textContent = 'Reiniciar';
  lastEntryDate = null;
  hsForm.classList.toggle('hidden', !qualifies());
  hsName.value = '';
  hsSection.classList.remove('hidden');
  renderScores();
  overlay.classList.remove('hidden');
  if (!hsForm.classList.contains('hidden')) hsName.focus();
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

function init() {
  started = true;
  hsSection.classList.add('hidden');
  hsForm.classList.add('hidden');
  restartBtn.textContent = 'Reiniciar';
  combo = 0;
  maxCombo = 0;
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
  // ignorar teclas del juego al escribir en un input
  if (e.target instanceof HTMLInputElement) return;
  if (!started) {
    if (e.code === 'Enter' && !(e.target instanceof HTMLButtonElement)) init();
    return;
  }
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

restartBtn.addEventListener('click', e => {
  init();
  e.currentTarget.blur();
});

hsSaveBtn.addEventListener('click', e => {
  submitScore();
  e.currentTarget.blur();
});

hsName.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitScore();
});

hsResetBtn.addEventListener('click', e => {
  if (confirm('¿Borrar todos los récords?')) {
    try { localStorage.removeItem('highScores'); localStorage.removeItem('highStats'); } catch (err) {}
    lastEntryDate = null;
    renderScores();
  }
  e.currentTarget.blur();
});

themeBtn.addEventListener('click', e => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  e.currentTarget.blur(); // evita que Space reactive el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
setTheme(savedTheme === 'light' ? 'light' : 'dark');

showStart();
