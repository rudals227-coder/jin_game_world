// 2048 — 스와이프로 같은 숫자 타일을 합쳐 2048을 만드는 퍼즐.
// 게임 계약: mount(container) → unmount(). 모델: board.js(순수). 이 파일은 뷰+입력.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import { SIZE, emptyGrid, spawnTile, slide, canMove, hasTile, maxTile } from './board.js';

const BEST_KEY = 'jgw.2048.best';
const SLIDE_DUR = 0.09;  // 슬라이드 시간(초)
const POP_DUR = 0.14;    // 병합/생성 팝 시간(초)
const TAP_THRESH = 22;   // 이보다 짧으면 탭(스와이프 아님)

const TILE_COLORS = {
  2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f',
  64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850',
  1024: '#edc53f', 2048: '#edc22e',
};

export function mount(container) {
  const screen = el('div', 'game-screen');
  const topbar = el('div', 'game-topbar');
  const stage = el('div', 'game-stage');
  const hint = el('div', 'game-hint');
  topbar.append(
    button('← 허브', () => (location.hash = '#/')),
    spacer(),
    createMuteButton(),
    button('새 게임', () => resetGame())
  );
  screen.append(topbar, stage, hint);
  container.appendChild(screen);

  let view;
  const S = {
    grid: emptyGrid(),
    score: 0,
    best: parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0,
    mode: 'play',           // play | won | over
    slideAnim: null,        // { moves, t }
    pops: new Map(),        // cellKey → 남은시간
    lastMerges: [],
    wonShown: false,
  };

  const key = (r, c) => r * SIZE + c;

  function resetGame() {
    S.grid = emptyGrid();
    spawnTile(S.grid);
    spawnTile(S.grid);
    S.score = 0;
    S.mode = 'play';
    S.slideAnim = null;
    S.pops.clear();
    S.lastMerges = [];
    S.wonShown = false;
    updateHint();
  }

  // ----- 입력: 스와이프 + 키보드 -----
  function doMove(dir) {
    if (S.mode !== 'play' || S.slideAnim) return; // 오버레이 중엔 탭으로 계속/재시작
    const res = slide(S.grid, dir);
    if (!res.moved) return;
    resumeAudio();
    S.slideAnim = { moves: res.moves, t: 0 };
    S.lastMerges = res.moves.filter((m) => m.merged).map((m) => ({ r: m.toR, c: m.toC }));
    S.grid = res.grid;
    if (res.gained > 0) { S.score += res.gained; sfx.brick(); } else sfx.slide();
    if (S.score > S.best) { S.best = S.score; localStorage.setItem(BEST_KEY, String(S.best)); }
  }

  function finalizeMove() {
    const sp = spawnTile(S.grid);
    if (sp) S.pops.set(key(sp.r, sp.c), POP_DUR);
    for (const m of S.lastMerges) S.pops.set(key(m.r, m.c), POP_DUR);
    S.lastMerges = [];
    if (!S.wonShown && hasTile(S.grid, 2048)) { S.mode = 'won'; S.wonShown = true; sfx.win(); }
    else if (!canMove(S.grid)) { S.mode = 'over'; sfx.lose(); }
    updateHint();
  }

  // ----- 업데이트(애니메이션 진행) -----
  function update(dt) {
    dt = Math.min(dt, 0.05);
    if (S.slideAnim) {
      S.slideAnim.t += dt;
      if (S.slideAnim.t >= SLIDE_DUR) { S.slideAnim = null; finalizeMove(); }
    }
    for (const [k, v] of S.pops) {
      const nv = v - dt;
      if (nv <= 0) S.pops.delete(k); else S.pops.set(k, nv);
    }
  }

  // ----- 렌더 -----
  function geom() {
    const W = view.width, H = view.height;
    const hud = 60;
    const pad = 12;
    const side = Math.max(80, Math.min(W - pad * 2, H - hud - pad * 2));
    const ox = (W - side) / 2;
    const oy = hud + (H - hud - side) / 2;
    const gap = side * 0.028;
    const cell = (side - gap * (SIZE + 1)) / SIZE;
    return { W, H, side, ox, oy, gap, cell, hud };
  }
  function cellPos(g, r, c) {
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
    roundRect(ctx, g.ox, g.oy, g.side, g.side, g.cell * 0.14);
    ctx.fillStyle = '#bbada0';
    ctx.fill();
    // 빈 슬롯
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const p = cellPos(g, r, c);
        roundRect(ctx, p.x, p.y, g.cell, g.cell, g.cell * 0.1);
        ctx.fillStyle = 'rgba(238,228,218,0.32)';
        ctx.fill();
      }

    if (S.slideAnim) {
      // 슬라이드 중: 이동 타일만 보간 위치로 그림(병합 전 값)
      const e = easeOut(Math.min(1, S.slideAnim.t / SLIDE_DUR));
      for (const m of S.slideAnim.moves) {
        const fr = cellPos(g, m.fromR, m.fromC);
        const to = cellPos(g, m.toR, m.toC);
        drawTile(ctx, g, m.value, fr.x + (to.x - fr.x) * e, fr.y + (to.y - fr.y) * e, 1);
      }
    } else {
      // 정적 격자 + 팝 스케일
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          const v = S.grid[r][c];
          if (!v) continue;
          const p = cellPos(g, r, c);
          const pt = S.pops.get(key(r, c)) || 0;
          const scale = 1 + 0.16 * (pt / POP_DUR);
          drawTile(ctx, g, v, p.x, p.y, scale);
        }
    }

    if (S.mode === 'won' || S.mode === 'over') drawOverlay(ctx, g);
  }

  function drawTile(ctx, g, v, x, y, scale) {
    const cell = g.cell;
    ctx.save();
    ctx.translate(x + cell / 2, y + cell / 2);
    ctx.scale(scale, scale);
    roundRect(ctx, -cell / 2, -cell / 2, cell, cell, cell * 0.1);
    ctx.fillStyle = TILE_COLORS[v] || '#3c3a32';
    ctx.fill();
    ctx.fillStyle = v <= 4 ? '#776e65' : '#f9f6f2';
    const digits = String(v).length;
    const fs = cell * (digits <= 2 ? 0.44 : digits === 3 ? 0.36 : 0.28);
    ctx.font = `800 ${fs}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v), 0, cell * 0.02);
    ctx.restore();
  }

  function drawHUD(ctx, g) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#edc22e';
    ctx.font = '800 24px sans-serif';
    ctx.fillText('2048', 16, g.hud / 2);
    // 점수 / 최고
    ctx.textAlign = 'right';
    ctx.font = '700 15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`점수 ${S.score}`, g.W - 16, g.hud / 2 - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`최고 ${S.best}`, g.W - 16, g.hud / 2 + 10);
  }

  function drawOverlay(ctx, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(238,228,218,0.55)';
    roundRect(ctx, g.ox, g.oy, g.side, g.side, g.cell * 0.14);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = g.ox + g.side / 2;
    ctx.fillStyle = '#776e65';
    ctx.font = `800 ${Math.floor(g.side * 0.11)}px sans-serif`;
    ctx.fillText(S.mode === 'won' ? '🎉 2048 달성!' : '게임 오버', cx, g.oy + g.side * 0.42);
    ctx.font = `600 ${Math.floor(g.side * 0.045)}px sans-serif`;
    ctx.fillText(S.mode === 'won' ? '탭하면 계속 진행' : '탭하거나 “새 게임”', cx, g.oy + g.side * 0.56);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent =
      S.mode === 'over' ? `게임 오버 · 최고 타일 ${maxTile(S.grid)} · 새 게임으로 다시`
        : S.mode === 'won' ? '2048 달성! 탭해서 계속 도전하세요.'
          : '스와이프 또는 방향키로 타일을 밀어 합치세요. 목표는 2048!';
  }

  // ----- 포인터(스와이프/탭) -----
  let downPt = null;
  function onDown(e) {
    resumeAudio();
    downPt = { x: e.clientX, y: e.clientY };
    view.canvas.setPointerCapture?.(e.pointerId);
  }
  function onUp(e) {
    if (!downPt) return;
    const dx = e.clientX - downPt.x;
    const dy = e.clientY - downPt.y;
    downPt = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TAP_THRESH) {
      // 탭: 오버레이 처리
      if (S.mode === 'won') { S.mode = 'play'; updateHint(); }
      else if (S.mode === 'over') resetGame();
      return;
    }
    doMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  function onKeyDown(e) {
    if (KEYS[e.key]) { e.preventDefault(); doMove(KEYS[e.key]); }
    else if ((e.key === 'Enter' || e.key === ' ')) {
      if (S.mode === 'won') { S.mode = 'play'; updateHint(); }
      else if (S.mode === 'over') resetGame();
    }
  }

  // ----- 시작 -----
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onDown);
  view.canvas.addEventListener('pointerup', onUp);
  view.canvas.addEventListener('pointercancel', () => (downPt = null));
  window.addEventListener('keydown', onKeyDown);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onDown);
    view.canvas.removeEventListener('pointerup', onUp);
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
