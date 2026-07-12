// 15 퍼즐 — 타일을 밀어 1~15를 순서대로 정렬. 게임 계약: mount → unmount.
// 모델: puzzle.js(순수). 이 파일은 뷰 + 입력 + 슬라이드 애니메이션.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import { SIZE, solved, blankIndex, canSlide, slide, isSolved, shuffle } from './puzzle.js';

const BEST_KEY = 'jgw.15puzzle.best';
const SLIDE_DUR = 0.09;

export function mount(container) {
  const screen = el('div', 'game-screen');
  const topbar = el('div', 'game-topbar');
  const stage = el('div', 'game-stage');
  const hint = el('div', 'game-hint');
  topbar.append(
    button('← 허브', () => (location.hash = '#/')),
    spacer(),
    createMuteButton(),
    button('섞기', () => resetGame())
  );
  screen.append(topbar, stage, hint);
  container.appendChild(screen);

  let view;
  const S = {
    board: solved(),
    moves: 0,
    started: false,
    elapsed: 0,
    solved: false,
    best: parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0,
    anim: null, // { from, to, value, t }
  };

  function resetGame() {
    S.board = shuffle();
    S.moves = 0;
    S.started = false;
    S.elapsed = 0;
    S.solved = false;
    S.anim = null;
    updateHint();
  }

  function doSlide(idx) {
    if (S.solved || S.anim || !canSlide(S.board, idx)) return;
    resumeAudio();
    const bi = blankIndex(S.board);
    const value = S.board[idx];
    const res = slide(S.board, idx);
    S.board = res.board;
    S.anim = { from: idx, to: bi, value, t: 0 };
    S.moves += 1;
    S.started = true;
    sfx.slide();
  }

  function finishAnim() {
    S.anim = null;
    if (isSolved(S.board)) {
      S.solved = true;
      sfx.win();
      if (S.best === 0 || S.moves < S.best) {
        S.best = S.moves;
        localStorage.setItem(BEST_KEY, String(S.best));
      }
      updateHint();
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (S.anim) {
      S.anim.t += dt;
      if (S.anim.t >= SLIDE_DUR) finishAnim();
    }
    if (S.started && !S.solved) S.elapsed += dt;
  }

  // ----- 렌더 -----
  function geom() {
    const W = view.width, H = view.height;
    const hud = 56, pad = 14;
    const side = Math.max(80, Math.min(W - pad * 2, H - hud - pad * 2));
    const ox = (W - side) / 2;
    const oy = hud + (H - hud - side) / 2;
    const gap = side * 0.02;
    const cell = (side - gap * (SIZE + 1)) / SIZE;
    return { W, H, hud, side, ox, oy, gap, cell };
  }
  function cellXY(g, idx) {
    const r = Math.floor(idx / SIZE), c = idx % SIZE;
    return { x: g.ox + g.gap + c * (g.cell + g.gap), y: g.oy + g.gap + r * (g.cell + g.gap) };
  }

  function draw(dt) {
    update(dt);
    const { ctx } = view;
    const g = geom();
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, g.W, g.H);

    drawHUD(ctx, g);

    // 보드 배경
    roundRect(ctx, g.ox, g.oy, g.side, g.side, g.cell * 0.12);
    ctx.fillStyle = '#1c2230';
    ctx.fill();

    // 타일
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = S.board[i];
      if (v === 0) continue;
      if (S.anim && i === S.anim.to) continue; // 이동 중 타일은 따로 그림
      const p = cellXY(g, i);
      drawTile(ctx, g, v, p.x, p.y, v === i + 1);
    }
    // 이동 애니메이션 타일
    if (S.anim) {
      const e = easeOut(Math.min(1, S.anim.t / SLIDE_DUR));
      const a = cellXY(g, S.anim.from), b = cellXY(g, S.anim.to);
      drawTile(ctx, g, S.anim.value, a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, S.anim.to === S.anim.value - 1);
    }

    if (S.solved) drawOverlay(ctx, g);
  }

  function drawTile(ctx, g, v, x, y, correct) {
    const cell = g.cell;
    roundRect(ctx, x, y, cell, cell, cell * 0.1);
    const grad = ctx.createLinearGradient(x, y, x, y + cell);
    if (correct) { grad.addColorStop(0, '#4bd0a0'); grad.addColorStop(1, '#2f9d78'); }
    else { grad.addColorStop(0, '#4f8cff'); grad.addColorStop(1, '#2f5fd0'); }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `800 ${Math.floor(cell * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), x + cell / 2, y + cell * 0.54);
  }

  function drawHUD(ctx, g) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#4f8cff';
    ctx.font = '800 20px sans-serif';
    ctx.fillText('15 퍼즐', 14, g.hud / 2);
    ctx.font = '700 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`${S.moves}수 · ${fmtTime(S.elapsed)}`, g.W - 14, g.hud / 2 - 9);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(S.best ? `최소 ${S.best}수` : '1~15를 순서대로!', g.W - 14, g.hud / 2 + 9);
  }

  function drawOverlay(ctx, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,9,14,0.6)';
    roundRect(ctx, g.ox, g.oy, g.side, g.side, g.cell * 0.12);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = g.ox + g.side / 2;
    ctx.fillStyle = '#4bd0a0';
    ctx.font = `800 ${Math.floor(g.side * 0.11)}px sans-serif`;
    ctx.fillText('🎉 완성!', cx, g.oy + g.side * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `600 ${Math.floor(g.side * 0.05)}px sans-serif`;
    ctx.fillText(`${S.moves}수 · ${fmtTime(S.elapsed)}`, cx, g.oy + g.side * 0.53);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `500 ${Math.floor(g.side * 0.04)}px sans-serif`;
    ctx.fillText('“섞기”로 다시 도전', cx, g.oy + g.side * 0.62);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent = S.solved
      ? `완성! ${S.moves}수 / ${fmtTime(S.elapsed)} · 섞기로 다시`
      : '빈 칸 옆의 타일을 탭(또는 방향키)해서 밀어 1~15를 순서대로 맞추세요.';
  }

  // ----- 입력 -----
  function hitIndex(clientX, clientY) {
    const rect = view.canvas.getBoundingClientRect();
    const g = geom();
    const x = clientX - rect.left, y = clientY - rect.top;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const p = cellXY(g, i);
      if (x >= p.x && x <= p.x + g.cell && y >= p.y && y <= p.y + g.cell) return i;
    }
    return -1;
  }
  function onPointerDown(e) {
    const i = hitIndex(e.clientX, e.clientY);
    if (i >= 0) doSlide(i);
  }

  // 방향키: 화살표 방향으로 타일이 빈 칸에 밀려 들어감.
  function onKeyDown(e) {
    const bi = blankIndex(S.board);
    const r = Math.floor(bi / SIZE), c = bi % SIZE;
    let idx = -1;
    if (e.key === 'ArrowUp' && r < SIZE - 1) idx = bi + SIZE;      // 아래 타일이 위로
    else if (e.key === 'ArrowDown' && r > 0) idx = bi - SIZE;      // 위 타일이 아래로
    else if (e.key === 'ArrowLeft' && c < SIZE - 1) idx = bi + 1;  // 오른쪽 타일이 왼쪽으로
    else if (e.key === 'ArrowRight' && c > 0) idx = bi - 1;        // 왼쪽 타일이 오른쪽으로
    if (idx >= 0) { e.preventDefault(); doSlide(idx); }
  }

  // ----- 시작 -----
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
    view.destroy();
    screen.remove();
  };
}

// ---------- 헬퍼 ----------
function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
function spacer() { return el('div', 'spacer'); }
function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function easeOut(p) { return 1 - (1 - p) * (1 - p); }
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
