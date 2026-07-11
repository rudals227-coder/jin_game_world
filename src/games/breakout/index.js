// 벽돌깨기(Breakout). 실시간 게임 — 엔진의 캔버스 + RAF 루프를 사용한다.
// 게임 모듈 계약: mount(container) → unmount().
// 조작: 손가락(마우스) 드래그로 패들 이동, 탭으로 발사/재시작.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';

const ROWS = 5;
const COLS = 8;
const ROW_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#4dabf7'];

export function mount(container) {
  // ----- DOM -----
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

  // 캔버스는 상태(S) 정의 뒤에 생성한다 (초기 onResize 콜백이 S를 안전하게 참조하도록).
  let view;

  // ----- 상태 -----
  const S = {
    mode: 'ready', // 'ready' | 'playing' | 'won' | 'lost'
    score: 0,
    lives: 3,
    paddleX: 0, // 패들 중심 x (px)
    ball: { x: 0, y: 0, vx: 0, vy: 0 }, // px, px/s
    bricks: [], // { col, row, alive, color }
    pointerX: null, // 마지막 포인터 x
  };

  function buildBricks() {
    S.bricks = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        S.bricks.push({ col: c, row: r, alive: true, color: ROW_COLORS[r % ROW_COLORS.length] });
  }

  function resetGame() {
    S.mode = 'ready';
    S.score = 0;
    S.lives = 3;
    buildBricks();
    S.paddleX = view.width / 2;
    resetBall();
    updateHint();
  }

  function resetBall() {
    const g = geom();
    S.paddleX = clamp(S.paddleX, g.pw / 2, view.width - g.pw / 2);
    S.ball.x = S.paddleX;
    S.ball.y = g.paddleY - g.r - 1;
    S.ball.vx = 0;
    S.ball.vy = 0;
  }

  function launch() {
    const g = geom();
    const speed = view.height * 0.72;
    const a = (Math.random() * 2 - 1) * 0.3; // 위쪽 살짝 랜덤 각도
    S.ball.vx = Math.sin(a) * speed;
    S.ball.vy = -Math.cos(a) * speed;
    S.mode = 'playing';
    updateHint();
  }

  function loseLife() {
    S.lives -= 1;
    if (S.lives <= 0) {
      S.mode = 'lost';
    } else {
      S.mode = 'ready';
      resetBall();
    }
    updateHint();
  }

  // 현재 캔버스 크기에 맞춘 기하값 (매 프레임 계산).
  function geom() {
    const W = view.width;
    const H = view.height;
    const margin = W * 0.04;
    const gap = W * 0.012;
    const top = H * 0.13;
    const bw = (W - margin * 2 - gap * (COLS - 1)) / COLS;
    const bh = H * 0.032;
    const pw = clamp(W * 0.2, 70, W * 0.5);
    const ph = Math.max(10, H * 0.016);
    const paddleY = H - H * 0.07;
    const r = Math.min(W, H) * 0.014 + 3;
    return { W, H, margin, gap, top, bw, bh, pw, ph, paddleY, r };
  }

  function brickRect(b, g) {
    return {
      x: g.margin + b.col * (g.bw + g.gap),
      y: g.top + b.row * (g.bh + g.gap),
      w: g.bw,
      h: g.bh,
    };
  }

  // 리사이즈(회전 등): 위치를 비율만큼 스케일해 게임 상태 유지.
  function rescale(w, h, prevW, prevH) {
    // createCanvas 는 (w,h)만 넘기므로 이전 크기를 자체 보관
    const pw = rescale._w || w;
    const ph = rescale._h || h;
    if (pw && ph && (pw !== w || ph !== h)) {
      const sx = w / pw;
      const sy = h / ph;
      S.paddleX *= sx;
      S.ball.x *= sx;
      S.ball.y *= sy;
      S.ball.vx *= sx;
      S.ball.vy *= sy;
    }
    rescale._w = w;
    rescale._h = h;
  }

  // ----- 입력 (Pointer Events: 마우스 = 터치 동일) -----
  function toLocalX(e) {
    const rect = view.canvas.getBoundingClientRect();
    return e.clientX - rect.left;
  }
  function onPointerMove(e) {
    S.pointerX = toLocalX(e);
  }
  function onPointerDown(e) {
    resumeAudio(); // iOS: 첫 터치에서 오디오 잠금 해제
    S.pointerX = toLocalX(e);
    view.canvas.setPointerCapture?.(e.pointerId);
    if (S.mode === 'ready') launch();
    else if (S.mode === 'won' || S.mode === 'lost') resetGame();
  }
  // ----- 물리 -----
  function step(dt) {
    const g = geom();
    dt = Math.min(dt, 0.033); // 큰 프레임 간격에서 터널링 방지

    // 패들: 포인터를 따라감 (없으면 유지)
    if (S.pointerX != null) S.paddleX = clamp(S.pointerX, g.pw / 2, g.W - g.pw / 2);

    if (S.mode !== 'playing') {
      if (S.mode === 'ready') resetBallFollow(g);
      return;
    }

    const b = S.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // 벽 반사
    if (b.x < g.r) { b.x = g.r; b.vx = Math.abs(b.vx); sfx.wall(); }
    if (b.x > g.W - g.r) { b.x = g.W - g.r; b.vx = -Math.abs(b.vx); sfx.wall(); }
    if (b.y < g.r) { b.y = g.r; b.vy = Math.abs(b.vy); sfx.wall(); }
    if (b.y > g.H + g.r) { sfx.lose(); loseLife(); return; }

    // 패들 반사
    const px = S.paddleX - g.pw / 2;
    if (
      b.vy > 0 &&
      b.y + g.r >= g.paddleY &&
      b.y - g.r <= g.paddleY + g.ph &&
      b.x >= px - g.r &&
      b.x <= px + g.pw + g.r
    ) {
      const speed = Math.hypot(b.vx, b.vy);
      const offset = clamp((b.x - S.paddleX) / (g.pw / 2), -1, 1);
      const angle = offset * 1.0; // 최대 ~57도
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.abs(Math.cos(angle) * speed);
      b.y = g.paddleY - g.r - 0.5;
      sfx.paddle();
    }

    // 벽돌 충돌 (프레임당 첫 충돌만 처리)
    for (const brick of S.bricks) {
      if (!brick.alive) continue;
      const rr = brickRect(brick, g);
      const nx = clamp(b.x, rr.x, rr.x + rr.w);
      const ny = clamp(b.y, rr.y, rr.y + rr.h);
      const dx = b.x - nx;
      const dy = b.y - ny;
      if (dx * dx + dy * dy <= g.r * g.r) {
        brick.alive = false;
        S.score += 10;
        sfx.brick();
        // 반사 축 결정
        if (Math.abs(dx) > Math.abs(dy)) b.vx = -b.vx;
        else b.vy = -b.vy;
        // 속도 살짝 증가 (최대치 제한)
        const sp = Math.hypot(b.vx, b.vy);
        const maxSp = g.H * 1.15;
        if (sp < maxSp) {
          const k = 1.015;
          b.vx *= k;
          b.vy *= k;
        }
        break;
      }
    }

    if (S.bricks.every((br) => !br.alive)) {
      S.mode = 'won';
      sfx.win();
      updateHint();
    }
  }

  function resetBallFollow(g) {
    S.ball.x = S.paddleX;
    S.ball.y = g.paddleY - g.r - 1;
  }

  // ----- 렌더 -----
  function draw(dt) {
    step(dt);
    const { ctx } = view;
    const g = geom();

    // 배경
    const bg = ctx.createLinearGradient(0, 0, 0, g.H);
    bg.addColorStop(0, '#141a26');
    bg.addColorStop(1, '#0a0d14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, g.W, g.H);

    // 벽돌
    for (const brick of S.bricks) {
      if (!brick.alive) continue;
      const rr = brickRect(brick, g);
      const grad = ctx.createLinearGradient(rr.x, rr.y, rr.x, rr.y + rr.h);
      grad.addColorStop(0, lighten(brick.color, 0.18));
      grad.addColorStop(1, brick.color);
      roundRect(ctx, rr.x, rr.y, rr.w, rr.h, Math.min(6, rr.h * 0.4));
      ctx.fillStyle = grad;
      ctx.fill();
      // 상단 광택
      ctx.save();
      roundRect(ctx, rr.x, rr.y, rr.w, rr.h, Math.min(6, rr.h * 0.4));
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h * 0.4);
      ctx.restore();
    }

    // 패들
    const px = S.paddleX - g.pw / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(80,170,255,0.6)';
    ctx.shadowBlur = 14;
    const pg = ctx.createLinearGradient(px, g.paddleY, px, g.paddleY + g.ph);
    pg.addColorStop(0, '#a9d4ff');
    pg.addColorStop(1, '#3f8cff');
    roundRect(ctx, px, g.paddleY, g.pw, g.ph, g.ph / 2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.restore();

    // 공
    const b = S.ball;
    const bgc = ctx.createRadialGradient(
      b.x - g.r * 0.3, b.y - g.r * 0.3, g.r * 0.2, b.x, b.y, g.r
    );
    bgc.addColorStop(0, '#ffffff');
    bgc.addColorStop(1, '#d0d7e2');
    ctx.beginPath();
    ctx.arc(b.x, b.y, g.r, 0, Math.PI * 2);
    ctx.fillStyle = bgc;
    ctx.fill();

    drawHUD(ctx, g);

    if (S.mode !== 'playing') drawOverlay(ctx, g);
  }

  function drawHUD(ctx, g) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${Math.floor(g.H * 0.03)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`점수 ${S.score}`, g.margin, g.H * 0.045);
    // 목숨 (작은 공)
    const lr = g.H * 0.012;
    for (let i = 0; i < S.lives; i++) {
      ctx.beginPath();
      ctx.arc(g.W - g.margin - i * (lr * 2.6) - lr, g.H * 0.06, lr, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b6b';
      ctx.fill();
    }
  }

  function drawOverlay(ctx, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,9,14,0.55)';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let title = '';
    let sub = '';
    if (S.mode === 'ready') {
      title = '준비';
      sub = '탭하면 발사 · 드래그로 패들 이동';
    } else if (S.mode === 'won') {
      title = '🎉 클리어!';
      sub = `점수 ${S.score} · 탭해서 다시 시작`;
    } else if (S.mode === 'lost') {
      title = '게임 오버';
      sub = `점수 ${S.score} · 탭해서 다시 시작`;
    }
    ctx.fillStyle = '#ffd86b';
    ctx.font = `800 ${Math.floor(g.W * 0.09)}px sans-serif`;
    ctx.fillText(title, g.W / 2, g.H / 2 - g.W * 0.04);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${Math.floor(g.W * 0.035)}px sans-serif`;
    ctx.fillText(sub, g.W / 2, g.H / 2 + g.W * 0.03);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent =
      S.mode === 'playing'
        ? '드래그로 패들을 움직여 공을 받아내세요.'
        : '화면을 드래그해 패들 이동, 탭하면 시작합니다.';
  }

  // ----- 시작 -----
  view = createCanvas(stage, { onResize: rescale });
  view.canvas.addEventListener('pointermove', onPointerMove);
  view.canvas.addEventListener('pointerdown', onPointerDown);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  // ----- unmount -----
  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointermove', onPointerMove);
    view.canvas.removeEventListener('pointerdown', onPointerDown);
    view.destroy();
    screen.remove();
  };
}

// ---------- 헬퍼 ----------
function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
function spacer() {
  return el('div', 'spacer');
}
function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// 색을 하양 쪽으로 살짝 밝게 (#rrggbb 가정)
function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amt);
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amt);
  const b = Math.min(255, (n & 255) + 255 * amt);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
