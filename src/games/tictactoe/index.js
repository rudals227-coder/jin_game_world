// 틱택토 — 2인 로컬 대전 + AI(쉬움/어려움). 게임 계약: mount(container) → unmount().
// 모델: game.js(보드·판정·AI, 순수). 이 파일은 캔버스 렌더 + 탭 입력 + 모드/점수.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import { EMPTY, X, O, emptyBoard, winnerInfo, outcome, bestMove, randomMove } from './game.js';

const CX = '#4dabf7';  // X 색
const CO = '#ff6b5a';  // O 색

export function mount(container) {
  const screen = el('div', 'game-screen');
  const topbar = el('div', 'game-topbar');
  const stage = el('div', 'game-stage');
  const hint = el('div', 'game-hint');

  const modeBtns = {};
  const mkMode = (key, label) => {
    const b = el('button', 'toggle');
    b.textContent = label;
    b.addEventListener('click', () => setMode(key));
    modeBtns[key] = b;
    return b;
  };
  topbar.append(
    button('← 허브', () => (location.hash = '#/')),
    mkMode('2p', '2인'),
    mkMode('easy', 'AI 쉬움'),
    mkMode('hard', 'AI 어려움'),
    spacer(),
    createMuteButton(),
    button('다시', () => resetBoard())
  );
  screen.append(topbar, stage, hint);
  container.appendChild(screen);

  let view;
  const S = {
    board: emptyBoard(),
    turn: X,            // 현재 차례
    mode: '2p',         // 2p | easy | hard (AI는 항상 O)
    result: null,       // 'x' | 'o' | 'draw' | null
    winLine: null,      // 승리 3칸
    score: { x: 0, o: 0, draw: 0 },
    placedAt: new Array(9).fill(0), // 마크 팝 애니메이션용 시각
    winAt: 0,           // 승리선 애니메이션 시작
    aiTimer: 0,         // AI 착수 지연
    time: 0,
  };

  function setMode(key) {
    S.mode = key;
    for (const k in modeBtns) modeBtns[k].classList.toggle('active', k === key);
    resetBoard();
  }

  function resetBoard() {
    S.board = emptyBoard();
    S.turn = X;
    S.result = null;
    S.winLine = null;
    S.placedAt.fill(0);
    S.aiTimer = 0;
    updateHint();
  }

  const aiIsThinking = () => S.mode !== '2p' && S.turn === O && !S.result;

  function place(i) {
    if (S.result || S.board[i] !== EMPTY) return;
    resumeAudio();
    S.board[i] = S.turn;
    S.placedAt[i] = S.time;
    sfx.paddle?.();
    const w = winnerInfo(S.board);
    S.result = outcome(S.board);
    if (w) S.winLine = w.line;
    if (S.result) endGame();
    else { S.turn = S.turn === X ? O : X; if (aiIsThinking()) S.aiTimer = 0.45; }
    updateHint();
  }

  function endGame() {
    S.winAt = S.time;
    if (S.result === 'x') S.score.x++;
    else if (S.result === 'o') S.score.o++;
    else S.score.draw++;
    if (S.result === 'draw') sfx.lose?.(); else sfx.win?.();
  }

  function aiMove() {
    const i = S.mode === 'hard' ? bestMove(S.board.slice(), O) : randomMove(S.board);
    if (i >= 0) place(i);
  }

  // ----- 입력 -----
  function onDown(e) {
    const r = view.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (S.result) { resetBoard(); return; }       // 게임 끝났으면 탭으로 새 판
    if (aiIsThinking()) return;                    // AI 차례엔 입력 무시
    const g = geom();
    const col = Math.floor((px - g.ox) / g.cell);
    const row = Math.floor((py - g.oy) / g.cell);
    if (col < 0 || col > 2 || row < 0 || row > 2) return;
    place(row * 3 + col);
  }

  // ----- 기하 -----
  function geom() {
    const W = view.width, H = view.height;
    const size = Math.min(W, H) * 0.86;
    return { W, H, size, ox: (W - size) / 2, oy: (H - size) / 2 + 6, cell: size / 3 };
  }

  // ----- 업데이트 -----
  function update(dt) {
    S.time += dt;
    if (aiIsThinking() && S.aiTimer > 0) {
      S.aiTimer -= dt;
      if (S.aiTimer <= 0) aiMove();
    }
  }

  // ----- 렌더 -----
  function draw(dt) {
    update(dt);
    const { ctx } = view;
    const g = geom();
    // 배경
    ctx.fillStyle = '#12161d';
    ctx.fillRect(0, 0, g.W, g.H);

    // 상단: 점수 + 차례
    drawTop(ctx, g);

    // 격자
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let k = 1; k < 3; k++) {
      line(ctx, g.ox + k * g.cell, g.oy + 8, g.ox + k * g.cell, g.oy + g.size - 8);
      line(ctx, g.ox + 8, g.oy + k * g.cell, g.ox + g.size - 8, g.oy + k * g.cell);
    }

    // 마크
    for (let i = 0; i < 9; i++) {
      if (S.board[i] === EMPTY) continue;
      const cx = g.ox + (i % 3) * g.cell + g.cell / 2;
      const cy = g.oy + Math.floor(i / 3) * g.cell + g.cell / 2;
      const pop = Math.min(1, (S.time - S.placedAt[i]) / 0.18);
      const scale = 0.7 + 0.3 * easeOut(pop);
      const inWin = S.winLine && S.winLine.includes(i);
      drawMark(ctx, S.board[i], cx, cy, g.cell * 0.3 * scale, inWin);
    }

    // 승리선
    if (S.winLine) drawWinLine(ctx, g);

    // 종료 오버레이
    if (S.result) drawOverlay(ctx, g);
  }

  function drawTop(ctx, g) {
    const y = Math.max(26, g.oy - 22);
    ctx.textBaseline = 'middle';
    // 점수 (X 좌 / O 우)
    ctx.font = '800 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = CX; ctx.fillText(`X  ${S.score.x}`, 16, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = CO; ctx.fillText(`${S.score.o}  O`, g.W - 16, y);
    // 무승부
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 13px sans-serif';
    ctx.fillText(`무 ${S.score.draw}`, g.W / 2, y - 16);
    // 차례 표시
    if (!S.result) {
      const who = S.turn === X ? 'X' : 'O';
      const col = S.turn === X ? CX : CO;
      const ai = aiIsThinking();
      ctx.fillStyle = col; ctx.font = '800 20px sans-serif';
      ctx.fillText(ai ? '🤖 생각 중…' : `${who} 차례`, g.W / 2, y + 4);
    }
  }

  function drawMark(ctx, mark, cx, cy, r, glow) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(6, r * 0.28);
    if (glow) { ctx.shadowColor = mark === X ? CX : CO; ctx.shadowBlur = 18; }
    if (mark === X) {
      ctx.strokeStyle = CX;
      line(ctx, cx - r, cy - r, cx + r, cy + r);
      line(ctx, cx + r, cy - r, cx - r, cy + r);
    } else {
      ctx.strokeStyle = CO;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWinLine(ctx, g) {
    const [a, , c] = S.winLine;
    const p = (i) => ({ x: g.ox + (i % 3) * g.cell + g.cell / 2, y: g.oy + Math.floor(i / 3) * g.cell + g.cell / 2 });
    const s = p(a), e = p(c);
    const t = Math.min(1, (S.time - S.winAt) / 0.35);
    const ex = s.x + (e.x - s.x) * easeOut(t), ey = s.y + (e.y - s.y) * easeOut(t);
    const col = S.result === 'x' ? CX : CO;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.shadowColor = col; ctx.shadowBlur = 16;
    line(ctx, s.x, s.y, ex, ey);
    ctx.restore();
  }

  function drawOverlay(ctx, g) {
    if (S.time - S.winAt < 0.3) return; // 승리선 먼저 보여주고
    ctx.save();
    ctx.fillStyle = 'rgba(10,13,18,0.55)';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let title, col;
    if (S.result === 'draw') { title = '무승부!'; col = '#ffd86b'; }
    else if (S.result === 'x') { title = 'X 승리! 🎉'; col = CX; }
    else { title = (S.mode === '2p' ? 'O 승리! 🎉' : '🤖 AI 승리!'); col = CO; }
    ctx.fillStyle = col; ctx.font = `800 ${Math.floor(g.W * 0.08)}px sans-serif`;
    ctx.fillText(title, g.W / 2, g.H * 0.44);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `500 ${Math.floor(g.W * 0.032)}px sans-serif`;
    ctx.fillText('화면을 탭해서 새 판', g.W / 2, g.H * 0.44 + g.W * 0.06);
    ctx.restore();
  }

  function updateHint() {
    if (S.result) { hint.textContent = '게임 종료 — 탭하거나 “다시”로 새 판.'; return; }
    if (aiIsThinking()) { hint.textContent = 'AI가 두는 중…'; return; }
    const who = S.turn === X ? 'X' : 'O';
    hint.textContent = S.mode === '2p'
      ? `${who} 차례 · 빈 칸을 탭하세요.`
      : `당신(X) 차례 · 빈 칸을 탭하세요.`;
  }

  // ----- 시작 -----
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onDown);
  setMode('2p');
  const loop = createLoop(draw);
  loop.start();

  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onDown);
    view.destroy();
    screen.remove();
  };
}

// ---------- 헬퍼 ----------
function el(tag, className) { const n = document.createElement(tag); if (className) n.className = className; return n; }
function spacer() { return el('div', 'spacer'); }
function button(label, onClick) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', onClick); return b; }
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function easeOut(t) { return 1 - (1 - t) * (1 - t); }
