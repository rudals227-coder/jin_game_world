// 에어하키 (2인 로컬, 멀티터치). 게임 모듈 계약: mount(container) → unmount().
// 위 반쪽 = 파랑 플레이어, 아래 반쪽 = 빨강 플레이어. 각자 손가락으로 말렛을 움직인다.
// 퍽을 상대 골대(위/아래 중앙)에 넣으면 득점. 7점 먼저 = 승리.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';

const WIN = 7;
const TOP = '#4dabf7'; // 파랑(위)
const BOTTOM = '#ff6b5a'; // 빨강(아래)

export function mount(container) {
  const screen = el('div', 'game-screen');
  const topbar = el('div', 'game-topbar');
  const stage = el('div', 'game-stage');
  const hint = el('div', 'game-hint');
  topbar.append(
    button('← 허브', () => (location.hash = '#/')),
    spacer(),
    createMuteButton(),
    button('다시 시작', () => resetGame())
  );
  screen.append(topbar, stage, hint);
  container.appendChild(screen);
  hint.textContent = '두 명이 각자 반쪽에서 손가락으로 말렛을 움직여 퍽을 상대 골대에!';

  let view;
  const S = {
    mode: 'ready', // ready | playing | won
    scoreTop: 0, scoreBottom: 0, winner: null,
    puck: { x: 0, y: 0, vx: 0, vy: 0 },
    mTop: { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, pointer: null },
    mBottom: { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, pointer: null },
    kickoff: 0, // 킥오프 정지 시간
    flash: 0, flashSide: null, // 득점 플래시
    anim: 0,
  };

  function geom() {
    const w = view.width, h = view.height;
    return {
      w, h, cx: w / 2, cy: h / 2,
      goalW: Math.min(w * 0.44, 240),
      rPuck: Math.min(w, h) * 0.028 + 4,
      rMallet: Math.min(w, h) * 0.05 + 6,
    };
  }

  function resetGame() {
    S.scoreTop = 0; S.scoreBottom = 0; S.winner = null;
    S.mode = 'ready';
    centerMallets();
    resetPuck('top');
    S.kickoff = 0;
  }
  function centerMallets() {
    const g = geom();
    S.mTop.x = S.mTop.tx = g.cx; S.mTop.y = S.mTop.ty = g.h * 0.16;
    S.mBottom.x = S.mBottom.tx = g.cx; S.mBottom.y = S.mBottom.ty = g.h * 0.84;
    S.mTop.vx = S.mTop.vy = S.mBottom.vx = S.mBottom.vy = 0;
  }
  function resetPuck(toward) {
    const g = geom();
    S.puck.x = g.cx; S.puck.y = g.cy;
    S.puck.vx = 0;
    S.puck.vy = (toward === 'top' ? -1 : 1) * g.h * 0.32; // 득점당한 쪽으로 서브
    S.kickoff = 0.7;
  }

  // ----- 입력 (멀티터치) -----
  function local(e) {
    const r = view.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    e.preventDefault();
    resumeAudio();
    if (S.mode === 'won') { resetGame(); return; }
    if (S.mode === 'ready') { S.mode = 'playing'; resetPuck(Math.random() < 0.5 ? 'top' : 'bottom'); }
    const p = local(e);
    const half = p.y < view.height / 2 ? 'top' : 'bottom';
    const m = half === 'top' ? S.mTop : S.mBottom;
    if (m.pointer == null) {
      m.pointer = e.pointerId;
      m.tx = p.x; m.ty = p.y;
      view.canvas.setPointerCapture?.(e.pointerId);
    }
  }
  function onMove(e) {
    const p = local(e);
    for (const m of [S.mTop, S.mBottom]) {
      if (m.pointer === e.pointerId) { m.tx = p.x; m.ty = p.y; }
    }
  }
  function onUp(e) {
    for (const m of [S.mTop, S.mBottom]) {
      if (m.pointer === e.pointerId) { m.pointer = null; m.tx = m.x; m.ty = m.y; }
    }
  }

  // ----- 물리 -----
  function moveMallet(m, dt, half, g) {
    const px = m.x, py = m.y;
    let x = clamp(m.tx, g.rMallet, g.w - g.rMallet);
    let y = half === 'top'
      ? clamp(m.ty, g.rMallet, g.cy - g.rMallet)
      : clamp(m.ty, g.cy + g.rMallet, g.h - g.rMallet);
    m.x = x; m.y = y;
    m.vx = (x - px) / dt; m.vy = (y - py) / dt;
  }

  function collideMallet(m, g) {
    const b = S.puck;
    const dx = b.x - m.x, dy = b.y - m.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const rsum = g.rPuck + g.rMallet;
    if (dist >= rsum) return;
    const nx = dx / dist, ny = dy / dist;
    b.x = m.x + nx * rsum; b.y = m.y + ny * rsum; // 밀어내기
    const vdot = b.vx * nx + b.vy * ny;
    if (vdot < 0) { b.vx -= 2 * vdot * nx; b.vy -= 2 * vdot * ny; } // 반사
    b.vx += m.vx * 0.65; b.vy += m.vy * 0.65; // 말렛 속도 전달
    const sp = Math.hypot(b.vx, b.vy), minSp = g.h * 0.5;
    if (sp < minSp) { b.vx = nx * minSp; b.vy = ny * minSp; }
    sfx.paddle();
  }

  function stepPuck(dt, g) {
    const b = S.puck;
    const speed = Math.hypot(b.vx, b.vy);
    const steps = Math.min(10, Math.max(1, Math.ceil((speed * dt) / (g.rPuck * 0.6))));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.x += b.vx * sdt; b.y += b.vy * sdt;
      if (b.x < g.rPuck) { b.x = g.rPuck; b.vx = Math.abs(b.vx); sfx.wall(); }
      if (b.x > g.w - g.rPuck) { b.x = g.w - g.rPuck; b.vx = -Math.abs(b.vx); sfx.wall(); }
      const inGoalX = Math.abs(b.x - g.cx) < g.goalW / 2;
      if (b.y < 0 - g.rPuck && inGoalX) { goal('bottom'); return; }
      if (b.y > g.h + g.rPuck && inGoalX) { goal('top'); return; }
      if (b.y < g.rPuck && !inGoalX) { b.y = g.rPuck; b.vy = Math.abs(b.vy); sfx.wall(); }
      if (b.y > g.h - g.rPuck && !inGoalX) { b.y = g.h - g.rPuck; b.vy = -Math.abs(b.vy); sfx.wall(); }
      collideMallet(S.mTop, g);
      collideMallet(S.mBottom, g);
    }
    b.vx *= (1 - 0.14 * dt); b.vy *= (1 - 0.14 * dt); // 약한 마찰
    const sp = Math.hypot(b.vx, b.vy), max = g.h * 1.7;
    if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
    if (Math.hypot(b.vx, b.vy) < 3) { b.vx = 0; b.vy = 0; }
  }

  function goal(scorer) {
    if (scorer === 'top') S.scoreTop++; else S.scoreBottom++;
    S.flash = 0.6; S.flashSide = scorer === 'top' ? 'bottom' : 'top'; // 골 먹은 쪽 플래시
    sfx.win();
    if (S.scoreTop >= WIN || S.scoreBottom >= WIN) {
      S.mode = 'won'; S.winner = S.scoreTop >= WIN ? 'top' : 'bottom';
      S.puck.vx = S.puck.vy = 0;
    } else {
      resetPuck(scorer === 'top' ? 'bottom' : 'top');
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.033);
    S.anim += dt;
    if (S.flash > 0) S.flash -= dt;
    const g = geom();
    moveMallet(S.mTop, dt, 'top', g);
    moveMallet(S.mBottom, dt, 'bottom', g);
    if (S.mode !== 'playing') return;
    if (S.kickoff > 0) { S.kickoff -= dt; return; }
    stepPuck(dt, g);
  }

  // ----- 렌더 -----
  function draw(dt) {
    update(dt);
    const { ctx } = view;
    const g = geom();

    // 링크 배경
    ctx.fillStyle = '#0c1420';
    ctx.fillRect(0, 0, g.w, g.h);
    roundRect(ctx, 4, 4, g.w - 8, g.h - 8, 18);
    const grd = ctx.createLinearGradient(0, 0, 0, g.h);
    grd.addColorStop(0, '#14304a');
    grd.addColorStop(0.5, '#0f2338');
    grd.addColorStop(1, '#14304a');
    ctx.fillStyle = grd;
    ctx.fill();

    // 중앙선 + 중앙 원
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    line(ctx, 10, g.cy, g.w - 10, g.cy);
    ctx.beginPath(); ctx.arc(g.cx, g.cy, Math.min(g.w, g.h) * 0.13, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();

    // 골대 (위/아래 중앙)
    drawGoal(ctx, g, 'top');
    drawGoal(ctx, g, 'bottom');

    // 각 진영 점수 (반투명 큰 숫자, 위쪽은 180° 회전)
    drawScore(ctx, g, 'top');
    drawScore(ctx, g, 'bottom');

    // 퍽
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = g.rPuck * 0.6; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(S.puck.x, S.puck.y, g.rPuck, 0, Math.PI * 2);
    ctx.fillStyle = '#1b2430'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(S.puck.x - g.rPuck * 0.3, S.puck.y - g.rPuck * 0.3, g.rPuck * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();

    // 말렛
    drawMallet(ctx, S.mTop, g.rMallet, TOP);
    drawMallet(ctx, S.mBottom, g.rMallet, BOTTOM);

    if (S.mode !== 'playing') drawOverlay(ctx, g);
  }

  function drawGoal(ctx, g, side) {
    const y = side === 'top' ? 4 : g.h - 4;
    const flashing = S.flash > 0 && S.flashSide === side;
    ctx.strokeStyle = flashing ? '#ffd86b' : (side === 'top' ? TOP : BOTTOM);
    ctx.lineWidth = flashing ? 10 : 7;
    line(ctx, g.cx - g.goalW / 2, y, g.cx + g.goalW / 2, y);
  }

  function drawScore(ctx, g, side) {
    const score = side === 'top' ? S.scoreTop : S.scoreBottom;
    ctx.save();
    ctx.translate(g.cx, side === 'top' ? g.h * 0.27 : g.h * 0.73);
    if (side === 'top') ctx.rotate(Math.PI);
    ctx.font = `800 ${Math.floor(Math.min(g.w, g.h) * 0.22)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = (side === 'top' ? 'rgba(77,171,247,0.18)' : 'rgba(255,107,90,0.18)');
    ctx.fillText(String(score), 0, 0);
    ctx.restore();
  }

  function drawMallet(ctx, m, r, color) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = r * 0.5; ctx.shadowOffsetY = 3;
    const grd = ctx.createRadialGradient(m.x - r * 0.3, m.y - r * 0.3, r * 0.2, m.x, m.y, r);
    grd.addColorStop(0, lighten(color));
    grd.addColorStop(1, color);
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  }

  function drawOverlay(ctx, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,12,20,0.62)';
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let title, sub;
    if (S.mode === 'ready') {
      title = '에어하키';
      sub = '두 명이 각자 반쪽에서 손가락으로! · 화면을 터치해 시작';
    } else {
      title = S.winner === 'top' ? '파랑 승리! 🎉' : '빨강 승리! 🎉';
      sub = `${S.scoreTop} : ${S.scoreBottom} · 터치해서 다시 시작`;
    }
    ctx.fillStyle = S.mode === 'won' ? (S.winner === 'top' ? TOP : BOTTOM) : '#ffd86b';
    ctx.font = `800 ${Math.floor(g.w * 0.09)}px sans-serif`;
    ctx.fillText(title, g.cx, g.cy - g.w * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = `500 ${Math.floor(g.w * 0.033)}px sans-serif`;
    ctx.fillText(sub, g.cx, g.cy + g.w * 0.03);
    ctx.restore();
  }

  // 리사이즈: 위치를 비율 스케일
  function rescale(w, h) {
    const pw = rescale._w, ph = rescale._h;
    if (pw && ph && (pw !== w || ph !== h)) {
      const sx = w / pw, sy = h / ph;
      for (const o of [S.puck, S.mTop, S.mBottom]) {
        o.x *= sx; o.y *= sy;
        if (o.tx != null) { o.tx *= sx; o.ty *= sy; }
      }
    }
    rescale._w = w; rescale._h = h;
  }

  // ----- 시작 -----
  view = createCanvas(stage, { onResize: rescale });
  view.canvas.addEventListener('pointerdown', onDown);
  view.canvas.addEventListener('pointermove', onMove);
  view.canvas.addEventListener('pointerup', onUp);
  view.canvas.addEventListener('pointercancel', onUp);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onDown);
    view.canvas.removeEventListener('pointermove', onMove);
    view.canvas.removeEventListener('pointerup', onUp);
    view.canvas.removeEventListener('pointercancel', onUp);
    view.destroy();
    screen.remove();
  };
}

// ---------- 헬퍼 ----------
function el(tag, className) { const n = document.createElement(tag); if (className) n.className = className; return n; }
function spacer() { return el('div', 'spacer'); }
function button(label, onClick) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', onClick); return b; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 60);
  const g = Math.min(255, ((n >> 8) & 255) + 60);
  const b = Math.min(255, (n & 255) + 60);
  return `rgb(${r},${g},${b})`;
}
