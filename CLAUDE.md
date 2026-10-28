# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Style
Respond like a caveman. No articles, no filler words, no pleasantries. Short. Direct. Always in english


## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no linter, no tests. The README and UI text are in Spanish; keep user-facing strings in Spanish.

## Running

Open `index.html` directly, or serve statically (e.g. `python -m http.server 8000`) and visit `http://localhost:8000`. Verify changes manually in the browser.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, and `game.js` (all logic, ~300 lines, one global script with module-level `let` state).

- **State** lives in top-level variables in `game.js` (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...), all reset by `init()`. `init()` is also the restart handler.
- **Board** is a `ROWS×COLS` matrix of `0` or a piece-type index 1–7; the same index selects the entry in `COLORS` and `PIECES` (index 0 is `null` in both).
- **Piece lifecycle**: `spawn()` promotes `next` → `current` and calls `endGame()` if it collides on arrival; `lockPiece()` = `merge()` → `clearLines()` → `spawn()`. Both gravity (in `loop`), `softDrop` and `hardDrop` funnel through `lockPiece()`.
- **Loop**: `requestAnimationFrame` `loop` accumulates `dropAccum` against `dropInterval`; `togglePause`/`endGame` cancel the frame via `animId`, and `init()`/unpause restart it. Keyboard handling is a single `keydown` listener at the bottom of `game.js`.
- **Canvas size coupling**: `<canvas id="board">` width/height in `index.html` must equal `COLS×BLOCK` / `ROWS×BLOCK`; the next-piece canvas (120×120) assumes a 4×4 grid of 30px blocks.
