// 테트리스 — 떨어지는 블록을 쌓아 줄을 없앤다.
// 게임 계약: mount(container) → unmount(). 모델: tetris.js(순수). 이 파일은 뷰+입력+낙하 루프.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import {
  COLS, ROWS, PIECES, TYPES, emptyBoard, cellsOf, collides, lockPiece, fullRows, clearLines, dropY,
} from './tetris.js';

const DAS = 0.16;        // 버튼 홀드 첫 반복 지연
const REPEAT = 0.05;     // 이후 반복 간격
const CLEAR_DUR = 0.18;  // 줄 삭제 플래시 시간
const LINE_SCORE = { 1: 100, 2: 300, 3: 500, 4: 800 };

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
    board: emptyBoard(),
    cur: null,          // { type, rot, x, y }
    bag: [],
    next: null,
    mode: 'play',       // play | clearing | over
    dropTimer: 0,
    clearRows: [],
    clearT: 0,
    score: 0, lines: 0, level: 1,
  };

  function gravityInterval() { return Math.max(0.06, 0.8 - (S.level - 1) * 0.07); }

  // 7-bag 랜덤: 7종을 섞어 소진 후 재보충.
  function nextType() {
    if (S.bag.length === 0) {
      S.bag = TYPES.slice();
      for (let i = S.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [S.bag[i], S.bag[j]] = [S.bag[j], S.bag[i]];
      }
    }
    return S.bag.pop();
  }

  function spawn() {
    const type = S.next || nextType();
    S.next = nextType();
    S.cur = { type, rot: 0, x: 3, y: 0 };
    if (collides(S.board, type, 0, 3, 0)) { S.mode = 'over'; sfx.lose(); updateHint(); }
  }

  function resetGame() {
    S.board = emptyBoard();
    S.bag = [];
    S.next = nextType();
    S.score = 0; S.lines = 0; S.level = 1;
    S.dropTimer = 0; S.clearRows = []; S.clearT = 0;
    S.mode = 'play';
    spawn();
    updateHint();
  }

  // ----- 조작 액션 -----
  function tryMove(dx, dy) {
    if (!S.cur) return false;
    if (!collides(S.board, S.cur.type, S.cur.rot, S.cur.x + dx, S.cur.y + dy)) {
      S.cur.x += dx; S.cur.y += dy; return true;
    }
    return false;
  }
  function tryRotate(dir) {
    if (!S.cur) return;
    const nrot = S.cur.rot + dir;
    for (const kick of [0, -1, 1, -2, 2]) { // 간단 월킥
      if (!collides(S.board, S.cur.type, nrot, S.cur.x + kick, S.cur.y)) {
        S.cur.rot = nrot; S.cur.x += kick; sfx.slide(); return;
      }
    }
  }
  function softDrop() {
    if (S.mode !== 'play') return;
    if (tryMove(0, 1)) { S.score += 1; S.dropTimer = 0; }
    else lockDown();
  }
  function hardDrop() {
    if (S.mode !== 'play' || !S.cur) return;
    const gy = dropY(S.board, S.cur.type, S.cur.rot, S.cur.x, S.cur.y);
    S.score += (gy - S.cur.y) * 2;
    S.cur.y = gy;
    lockDown();
  }

  function lockDown() {
    if (!S.cur) return;
    S.board = lockPiece(S.board, S.cur.type, S.cur.rot, S.cur.x, S.cur.y);
    sfx.wall();
    const rows = fullRows(S.board);
    if (rows.length) {
      S.clearRows = rows; S.clearT = CLEAR_DUR; S.mode = 'clearing';
      S.cur = null;
    } else {
      spawn();
    }
  }

  function commitClear() {
    const n = S.clearRows.length;
    const res = clearLines(S.board);
    S.board = res.board;
    S.lines += n;
    S.score += (LINE_SCORE[n] || 0) * S.level;
    S.level = 1 + Math.floor(S.lines / 10);
    S.clearRows = [];
    n >= 4 ? sfx.win() : sfx.brick();
    S.mode = 'play';
    spawn();
  }

  // ----- 업데이트 -----
  function update(dt) {
    dt = Math.min(dt, 0.05);
    tickRepeat(dt);
    if (S.mode === 'clearing') {
      S.clearT -= dt;
      if (S.clearT <= 0) commitClear();
      return;
    }
    if (S.mode !== 'play') return;
    S.dropTimer += dt;
    if (S.dropTimer >= gravityInterval()) {
      S.dropTimer = 0;
      if (!tryMove(0, 1)) lockDown();
    }
  }

  // ----- 렌더 -----
  function geom() {
    const W = view.width, H = view.height;
    const hud = 52;
    const pad = 10;
    const cell = Math.max(6, Math.floor(Math.min((W - pad * 2) / COLS, (H - hud - pad * 2) / ROWS)));
    const bw = cell * COLS, bh = cell * ROWS;
    const ox = Math.floor((W - bw) / 2);
    const oy = hud + Math.floor((H - hud - bh) / 2);
    return { W, H, hud, cell, bw, bh, ox, oy };
  }

  function draw(dt) {
    update(dt);
    const { ctx } = view;
    const g = geom();
    ctx.fillStyle = '#0b0e15';
    ctx.fillRect(0, 0, g.W, g.H);

    drawHUD(ctx, g);

    // 보드 배경 + 격자
    ctx.fillStyle = '#12151d';
    ctx.fillRect(g.ox, g.oy, g.bw, g.bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) line(ctx, g.ox + c * g.cell, g.oy, g.ox + c * g.cell, g.oy + g.bh);
    for (let r = 1; r < ROWS; r++) line(ctx, g.ox, g.oy + r * g.cell, g.ox + g.bw, g.oy + r * g.cell);

    // 쌓인 블록
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (S.board[r][c]) drawCell(ctx, g, c, r, PIECES[S.board[r][c]].color);

    // 줄삭제 플래시
    if (S.mode === 'clearing') {
      const a = S.clearT / CLEAR_DUR;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      for (const r of S.clearRows) ctx.fillRect(g.ox, g.oy + r * g.cell, g.bw, g.cell);
    }

    // 고스트 + 현재 조각
    if (S.cur && S.mode === 'play') {
      const gy = dropY(S.board, S.cur.type, S.cur.rot, S.cur.x, S.cur.y);
      for (const [x, y] of cellsOf(S.cur.type, S.cur.rot)) {
        if (gy + y >= 0) drawCell(ctx, g, S.cur.x + x, gy + y, PIECES[S.cur.type].color, true);
      }
      for (const [x, y] of cellsOf(S.cur.type, S.cur.rot)) {
        if (S.cur.y + y >= 0) drawCell(ctx, g, S.cur.x + x, S.cur.y + y, PIECES[S.cur.type].color);
      }
    }

    if (S.mode === 'over') drawOverlay(ctx, g);
  }

  function drawCell(ctx, g, c, r, color, ghost) {
    const x = g.ox + c * g.cell, y = g.oy + r * g.cell;
    if (ghost) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, g.cell - 4, g.cell - 4);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, g.cell - 2, g.cell - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; // 하이라이트
    ctx.fillRect(x + 1, y + 1, g.cell - 2, Math.max(2, g.cell * 0.22));
  }

  function drawHUD(ctx, g) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b06cf0';
    ctx.font = '800 22px sans-serif';
    ctx.fillText('테트리스', 14, g.hud / 2);
    ctx.font = '700 14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(`점수 ${S.score}`, g.W - 14, g.hud / 2 - 9);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`Lv ${S.level} · ${S.lines}줄`, g.W - 14, g.hud / 2 + 9);

    // 다음 조각 미리보기(중앙 상단)
    if (S.next) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.font = '600 11px sans-serif';
      ctx.fillText('NEXT', g.W / 2 - 34, g.hud / 2);
      const cs = 9;
      const cells = cellsOf(S.next, 0);
      const minx = Math.min(...cells.map((p) => p[0])), miny = Math.min(...cells.map((p) => p[1]));
      for (const [x, y] of cells) {
        ctx.fillStyle = PIECES[S.next].color;
        ctx.fillRect(g.W / 2 - 12 + (x - minx) * cs, g.hud / 2 - 9 + (y - miny) * cs, cs - 1, cs - 1);
      }
    }
  }

  function drawOverlay(ctx, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,9,14,0.72)';
    ctx.fillRect(g.ox, g.oy, g.bw, g.bh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff8a8a';
    ctx.font = `800 ${Math.floor(g.bw * 0.13)}px sans-serif`;
    ctx.fillText('게임 오버', g.ox + g.bw / 2, g.oy + g.bh * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${Math.floor(g.bw * 0.055)}px sans-serif`;
    ctx.fillText(`점수 ${S.score} · 탭해서 재시작`, g.ox + g.bw / 2, g.oy + g.bh * 0.42 + g.bw * 0.11);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent = S.mode === 'over'
      ? '게임 오버 — 탭하거나 “새 게임”으로 재시작'
      : '◀▶ 이동 · ↻ 회전 · ▼ 소프트드롭 · ⤓ 하드드롭 (방향키/스페이스도 가능)';
  }

  // ----- 화면 버튼(홀드 반복) + 캔버스 탭 -----
  const controls = el('div', 'tetris-controls');
  const held = new Map(); // action → { t } (반복용)
  function padButton(label, cls, action, repeat) {
    const b = el('button', 'tt-btn ' + cls);
    b.textContent = label;
    const down = (e) => {
      e.preventDefault();
      resumeAudio();
      if (S.mode === 'play') action();
      if (repeat) held.set(action, { t: DAS });
      b.setPointerCapture?.(e.pointerId);
    };
    const up = () => { if (repeat) held.delete(action); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return b;
  }
  function tickRepeat(dt) {
    if (S.mode !== 'play') return;
    for (const [action, st] of held) {
      st.t -= dt;
      if (st.t <= 0) { action(); st.t = REPEAT; }
    }
  }
  const actLeft = () => tryMove(-1, 0);
  const actRight = () => tryMove(1, 0);
  // 양손 분리: 왼쪽=이동/소프트드롭, 오른쪽=하드드롭/회전(엄지에 크게).
  const leftGroup = el('div', 'tt-group');
  leftGroup.append(
    padButton('◀', 'move', actLeft, true),
    padButton('▼', 'soft', softDrop, true),
    padButton('▶', 'move', actRight, true),
  );
  const rightGroup = el('div', 'tt-group');
  rightGroup.append(
    padButton('⤓', 'hard', hardDrop, false),
    padButton('↻', 'rot', () => tryRotate(1), false),
  );
  controls.append(leftGroup, rightGroup);
  screen.insertBefore(controls, hint);

  function onCanvasTap() {
    resumeAudio();
    if (S.mode === 'over') resetGame();
  }

  // ----- 키보드 -----
  function onKeyDown(e) {
    if (S.mode === 'over') {
      if (e.key === 'Enter' || e.key === ' ') resetGame();
      return;
    }
    if (S.mode !== 'play') return;
    const k = e.key;
    if (k === 'ArrowLeft') { actLeft(); held.set(actLeft, { t: DAS }); e.preventDefault(); }
    else if (k === 'ArrowRight') { actRight(); held.set(actRight, { t: DAS }); e.preventDefault(); }
    else if (k === 'ArrowDown') { softDrop(); held.set(softDrop, { t: DAS }); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'x') { tryRotate(1); e.preventDefault(); }
    else if (k === 'z') { tryRotate(-1); e.preventDefault(); }
    else if (k === ' ') { hardDrop(); e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft') held.delete(actLeft);
    else if (e.key === 'ArrowRight') held.delete(actRight);
    else if (e.key === 'ArrowDown') held.delete(softDrop);
  }

  // ----- 시작 -----
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onCanvasTap);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onCanvasTap);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
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
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
