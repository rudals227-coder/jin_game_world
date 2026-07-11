// 벽돌깨기(Breakout) + 아이템. 실시간 게임 — 엔진의 캔버스 + RAF 루프를 사용한다.
// 게임 모듈 계약: mount(container) → unmount().
// 조작: 손가락(마우스) 드래그로 패들 이동, 탭으로 발사/재시작.
// 아이템: 벽돌을 깨면 확률로 낙하 → 패들로 받으면 효과 발동(일부 일정시간 지속).
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';

const ROWS = 5;
const COLS = 8;
const ROW_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#4dabf7'];

// 아이템 정의: 색/글자/지속시간(초, 0=즉시)/좋은지 여부
const ITEMS = {
  fire: { color: '#ff6b3d', letter: 'F', dur: 8, good: true },
  multi: { color: '#4dabf7', letter: 'M', dur: 0, good: true },
  pierce: { color: '#b07cff', letter: 'P', dur: 8, good: true },
  wide: { color: '#51cf66', letter: 'W', dur: 10, good: true },
  slow: { color: '#20c997', letter: 'S', dur: 8, good: true },
  small: { color: '#ff5252', letter: 'X', dur: 8, good: false },
};
// 드롭 가중치 (좋은:나쁜 ≈ 3:1)
const DROP_POOL = [
  ['fire', 3], ['multi', 2], ['pierce', 2], ['wide', 3], ['slow', 2], ['small', 4],
];
const DROP_CHANCE = 0.22; // 벽돌 깰 때 아이템 낙하 확률
const TIMED_KEYS = ['fire', 'pierce', 'wide', 'slow', 'small'];

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

  let view;

  // ----- 상태 -----
  const S = {
    mode: 'ready', // 'ready' | 'playing' | 'won' | 'lost'
    score: 0,
    lives: 3,
    paddleX: 0,
    balls: [], // [{x,y,vx,vy}]
    bricks: [], // { col, row, alive, color }
    items: [], // { x, y, vy, type }
    effects: { fire: 0, pierce: 0, wide: 0, slow: 0, small: 0 }, // 남은 초
    pointerX: null,
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
    S.items = [];
    for (const k of TIMED_KEYS) S.effects[k] = 0;
    buildBricks();
    S.paddleX = view.width / 2;
    S.balls = [newBall()];
    putBallsOnPaddle();
    updateHint();
  }

  function newBall() {
    return { x: 0, y: 0, vx: 0, vy: 0 };
  }

  function putBallsOnPaddle() {
    const g = geom();
    S.paddleX = clamp(S.paddleX, g.pw / 2, view.width - g.pw / 2);
    const b = S.balls[0];
    if (b) {
      b.x = S.paddleX;
      b.y = g.paddleY - g.r - 1;
      b.vx = 0;
      b.vy = 0;
    }
  }

  function launch() {
    const speed = view.height * 0.72;
    const a = (Math.random() * 2 - 1) * 0.3;
    const b = S.balls[0];
    if (!b) return;
    b.vx = Math.sin(a) * speed;
    b.vy = -Math.cos(a) * speed;
    S.mode = 'playing';
    updateHint();
  }

  function loseLife() {
    S.lives -= 1;
    S.items = [];
    for (const k of TIMED_KEYS) S.effects[k] = 0;
    if (S.lives <= 0) {
      S.mode = 'lost';
    } else {
      S.mode = 'ready';
      S.balls = [newBall()];
      putBallsOnPaddle();
    }
    updateHint();
  }

  // 현재 캔버스 크기에 맞춘 기하값 (매 프레임 계산). 패들 폭은 확장/축소 효과 반영.
  function geom() {
    const W = view.width;
    const H = view.height;
    const margin = W * 0.04;
    const gap = W * 0.012;
    const top = H * 0.14;
    const bw = (W - margin * 2 - gap * (COLS - 1)) / COLS;
    const bh = H * 0.032;
    let pf = 1;
    if (S.effects.wide > 0) pf *= 1.6;
    if (S.effects.small > 0) pf *= 0.6;
    const pw = clamp(W * 0.2 * pf, 50, W * 0.6);
    const ph = Math.max(10, H * 0.016);
    const paddleY = H - H * 0.07;
    const r = Math.min(W, H) * 0.014 + 3;
    const itm = Math.min(W, H) * 0.032;
    return { W, H, margin, gap, top, bw, bh, pw, ph, paddleY, r, itm };
  }

  function brickRect(b, g) {
    return {
      x: g.margin + b.col * (g.bw + g.gap),
      y: g.top + b.row * (g.bh + g.gap),
      w: g.bw,
      h: g.bh,
    };
  }

  function brickAt(col, row) {
    return S.bricks.find((b) => b.alive && b.col === col && b.row === row) || null;
  }

  // 파이어볼: 맞은 벽돌 + 상하좌우 이웃까지 파괴
  function explode(hc, hr) {
    for (const [c, r] of [[hc, hr], [hc - 1, hr], [hc + 1, hr], [hc, hr - 1], [hc, hr + 1]]) {
      const br = brickAt(c, r);
      if (br) {
        br.alive = false;
        S.score += 10;
      }
    }
  }

  // 리사이즈: 위치를 비율 스케일해 게임 상태 유지.
  function rescale(w, h) {
    const pw = rescale._w;
    const ph = rescale._h;
    if (pw && ph && (pw !== w || ph !== h)) {
      const sx = w / pw;
      const sy = h / ph;
      S.paddleX *= sx;
      for (const b of S.balls) { b.x *= sx; b.y *= sy; b.vx *= sx; b.vy *= sy; }
      for (const it of S.items) { it.x *= sx; it.y *= sy; it.vy *= sy; }
    }
    rescale._w = w;
    rescale._h = h;
  }

  // ----- 아이템 -----
  function pickItemType() {
    const total = DROP_POOL.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [type, w] of DROP_POOL) {
      if ((r -= w) < 0) return type;
    }
    return DROP_POOL[0][0];
  }

  function maybeDropItem(cx, cy) {
    if (Math.random() < DROP_CHANCE)
      S.items.push({ x: cx, y: cy, vy: view.height * 0.28, type: pickItemType() });
  }

  function applyEffect(type) {
    if (type === 'multi') {
      multiball();
    } else {
      S.effects[type] = ITEMS[type].dur;
      if (type === 'wide') S.effects.small = 0; // 확장↔축소 상쇄
      if (type === 'small') S.effects.wide = 0;
    }
    sfx.brick();
  }

  function multiball() {
    const extra = [];
    for (const b of S.balls) {
      const sp = Math.hypot(b.vx, b.vy) || view.height * 0.72;
      const base = Math.atan2(b.vy, b.vx) || -Math.PI / 2;
      for (const off of [-0.4, 0.4]) {
        const a = base + off;
        extra.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      }
    }
    S.balls.push(...extra);
    if (S.balls.length > 8) S.balls.length = 8;
  }

  // ----- 입력 -----
  function toLocalX(e) {
    const rect = view.canvas.getBoundingClientRect();
    return e.clientX - rect.left;
  }
  function onPointerMove(e) {
    S.pointerX = toLocalX(e);
  }
  function onPointerDown(e) {
    resumeAudio();
    S.pointerX = toLocalX(e);
    view.canvas.setPointerCapture?.(e.pointerId);
    if (S.mode === 'ready') launch();
    else if (S.mode === 'won' || S.mode === 'lost') resetGame();
  }

  // ----- 물리 -----
  function step(dt) {
    dt = Math.min(dt, 0.033);
    const g = geom();

    // 효과 타이머 감소
    for (const k of TIMED_KEYS) if (S.effects[k] > 0) S.effects[k] = Math.max(0, S.effects[k] - dt);

    // 패들: 포인터 따라감
    if (S.pointerX != null) S.paddleX = clamp(S.pointerX, g.pw / 2, g.W - g.pw / 2);

    // 낙하 아이템 이동/획득/놓침
    stepItems(dt, g);

    if (S.mode !== 'playing') {
      if (S.mode === 'ready') putBallsOnPaddle();
      return;
    }

    const slowF = S.effects.slow > 0 ? 0.6 : 1;

    for (const b of S.balls) stepBall(b, dt, g, slowF);

    // 바닥으로 떨어진 공 제거 → 남은 공 없으면 목숨 감소
    S.balls = S.balls.filter((b) => b.y <= g.H + g.r);
    if (S.balls.length === 0) {
      sfx.lose();
      loseLife();
      return;
    }

    if (S.bricks.every((br) => !br.alive)) {
      S.mode = 'won';
      sfx.win();
      updateHint();
    }
  }

  function stepBall(b, dt, g, slowF) {
    b.x += b.vx * dt * slowF;
    b.y += b.vy * dt * slowF;

    // 벽 반사
    if (b.x < g.r) { b.x = g.r; b.vx = Math.abs(b.vx); sfx.wall(); }
    if (b.x > g.W - g.r) { b.x = g.W - g.r; b.vx = -Math.abs(b.vx); sfx.wall(); }
    if (b.y < g.r) { b.y = g.r; b.vy = Math.abs(b.vy); sfx.wall(); }
    if (b.y > g.H + g.r) return; // 낙하 → filter 에서 제거

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
      const angle = offset * 1.0;
      b.vx = Math.sin(angle) * speed;
      b.vy = -Math.abs(Math.cos(angle) * speed);
      b.y = g.paddleY - g.r - 0.5;
      sfx.paddle();
    }

    // 벽돌 충돌 (공당 프레임당 첫 충돌)
    for (const brick of S.bricks) {
      if (!brick.alive) continue;
      const rr = brickRect(brick, g);
      const nx = clamp(b.x, rr.x, rr.x + rr.w);
      const ny = clamp(b.y, rr.y, rr.y + rr.h);
      const dx = b.x - nx;
      const dy = b.y - ny;
      if (dx * dx + dy * dy > g.r * g.r) continue;

      const hc = brick.col;
      const hr = brick.row;
      if (S.effects.fire > 0) {
        explode(hc, hr); // 이웃까지 파괴 (맞은 벽돌 포함)
      } else {
        brick.alive = false;
        S.score += 10;
      }
      maybeDropItem(rr.x + rr.w / 2, rr.y + rr.h / 2);
      sfx.brick();

      // 관통 아니면 반사, 살짝 가속
      if (S.effects.pierce <= 0) {
        if (Math.abs(dx) > Math.abs(dy)) b.vx = -b.vx;
        else b.vy = -b.vy;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < g.H * 1.15) { b.vx *= 1.015; b.vy *= 1.015; }
      }
      break;
    }
  }

  function stepItems(dt, g) {
    const px = S.paddleX - g.pw / 2;
    const kept = [];
    for (const it of S.items) {
      it.y += it.vy * dt;
      // 패들 획득
      const caught =
        it.y + g.itm * 0.5 >= g.paddleY &&
        it.y - g.itm * 0.5 <= g.paddleY + g.ph &&
        it.x >= px - g.itm * 0.5 &&
        it.x <= px + g.pw + g.itm * 0.5;
      if (caught) {
        applyEffect(it.type);
        continue;
      }
      if (it.y - g.itm > g.H) continue; // 놓침
      kept.push(it);
    }
    S.items = kept;
  }

  // ----- 렌더 -----
  function draw(dt) {
    step(dt);
    const { ctx } = view;
    const g = geom();

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
      ctx.save();
      roundRect(ctx, rr.x, rr.y, rr.w, rr.h, Math.min(6, rr.h * 0.4));
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h * 0.4);
      ctx.restore();
    }

    // 낙하 아이템
    for (const it of S.items) drawItem(ctx, it, g);

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
    for (const b of S.balls) drawBall(ctx, b, g);

    drawHUD(ctx, g);
    if (S.mode !== 'playing') drawOverlay(ctx, g);
  }

  function drawBall(ctx, b, g) {
    const fire = S.effects.fire > 0;
    const pierce = S.effects.pierce > 0;
    ctx.save();
    if (fire) { ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = g.r * 1.6; }
    const grad = ctx.createRadialGradient(b.x - g.r * 0.3, b.y - g.r * 0.3, g.r * 0.2, b.x, b.y, g.r);
    if (fire) { grad.addColorStop(0, '#fff2c8'); grad.addColorStop(1, '#ff6b3d'); }
    else if (pierce) { grad.addColorStop(0, '#efe3ff'); grad.addColorStop(1, '#b07cff'); }
    else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d0d7e2'); }
    ctx.beginPath();
    ctx.arc(b.x, b.y, g.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  function drawItem(ctx, it, g) {
    const s = g.itm;
    const meta = ITEMS[it.type];
    roundRect(ctx, it.x - s / 2, it.y - s / 2, s, s, s * 0.28);
    ctx.fillStyle = meta.color;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(it.x - s / 2, it.y - s / 2, s, s * 0.35);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.floor(s * 0.62)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.letter, it.x, it.y + 1);
  }

  function drawHUD(ctx, g) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${Math.floor(g.H * 0.03)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`점수 ${S.score}`, g.margin, g.H * 0.045);

    // 목숨
    const lr = g.H * 0.012;
    for (let i = 0; i < S.lives; i++) {
      ctx.beginPath();
      ctx.arc(g.W - g.margin - i * (lr * 2.6) - lr, g.H * 0.06, lr, 0, Math.PI * 2);
      ctx.fillStyle = '#ff6b6b';
      ctx.fill();
    }

    // 활성 효과 뱃지 (점수 아래)
    let i = 0;
    const bs = g.H * 0.03;
    for (const k of TIMED_KEYS) {
      const t = S.effects[k];
      if (t <= 0) continue;
      const bx = g.margin + i * (bs + 6);
      const by = g.H * 0.092;
      roundRect(ctx, bx, by, bs, bs, 5);
      ctx.fillStyle = ITEMS[k].color;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.floor(bs * 0.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ITEMS[k].letter, bx + bs / 2, by + bs / 2);
      // 남은시간 바
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(bx, by + bs + 2, bs * (t / ITEMS[k].dur), 3);
      i++;
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
      sub = '탭하면 발사 · 드래그로 패들 이동 · 벽돌에서 아이템이 떨어져요';
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
    ctx.font = `500 ${Math.floor(g.W * 0.032)}px sans-serif`;
    ctx.fillText(sub, g.W / 2, g.H / 2 + g.W * 0.03);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent =
      S.mode === 'playing'
        ? '아이템: 🔥파이어 ⚡멀티볼 ➤관통 ↔확장 🐢슬로우 · X는 축소(주의!)'
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
function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amt);
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amt);
  const b = Math.min(255, (n & 255) + 255 * amt);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
