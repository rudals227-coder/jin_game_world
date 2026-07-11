// 달 착륙선(Lunar Lander). 중력에 맞서 엔진을 분사해 착륙장에 저속으로 안전 착륙.
// 게임 모듈 계약: mount(container) → unmount().
// 조작: 화면 하단 버튼(◀ 좌회전 · 🔥 분사 · ▶ 우회전), PC는 방향키/스페이스.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import {
  sfx,
  resumeAudio,
  createMuteButton,
  startThrust,
  stopThrust,
} from '../../engine/audio.js';

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
    mode: 'ready', // ready | flying | landed | crashed
    x: 0, y: 0, vx: 0, vy: 0, // 위치/속도 (px, px/s)
    angle: 0, // 라디안, 0 = 위쪽
    fuel: 100,
    input: { left: false, right: false, thrust: false },
    thrusting: false, // 분사 사운드 상태
    terrain: [], // [{x,y}] 픽셀
    pad: null, // {x0, x1, y}
    stars: [], // [{x,y,r}]
    result: '', // 착륙/추락 사유
  };

  // 튜닝 값 (캔버스 높이 비례) — 감이 안 맞으면 배수만 조절.
  function params() {
    const H = view.height;
    return {
      grav: H * 0.22, // 중력 가속도
      thrust: H * 0.58, // 분사 가속도
      rot: 1.9, // 회전 속도(rad/s)
      burn: 24, // 초당 연료 소모
      maxVy: H * 0.075, // 안전 착륙 최대 수직속도
      maxVx: H * 0.05, // 안전 착륙 최대 수평속도
      maxAngle: 0.2, // 안전 착륙 최대 기울기(rad)
      r: Math.min(view.width, H) * 0.02 + 8, // 착륙선 반경
    };
  }

  function generateTerrain(W, H) {
    const n = 16;
    const pts = [];
    const base = H * 0.78;
    for (let i = 0; i <= n; i++) {
      pts.push({ x: (i / n) * W, y: base + (Math.random() * 2 - 1) * H * 0.12 });
    }
    // 착륙장: 한 구간을 평평하게 + 충분한 폭 확보(두 구간 병합)
    const pi = 3 + Math.floor(Math.random() * (n - 6));
    const padY = Math.min(H * 0.86, Math.max(H * 0.62, pts[pi].y));
    pts[pi].y = padY;
    pts[pi + 1].y = padY;
    S.pad = { x0: pts[pi].x, x1: pts[pi + 1].x, y: padY };
    S.terrain = pts;

    // 별
    S.stars = [];
    for (let i = 0; i < 60; i++) {
      S.stars.push({ x: Math.random() * W, y: Math.random() * H * 0.7, r: Math.random() * 1.4 + 0.3 });
    }
  }

  function resetGame() {
    const W = view.width;
    const H = view.height;
    generateTerrain(W, H);
    S.mode = 'ready';
    S.x = W * (0.25 + Math.random() * 0.5);
    S.y = H * 0.14;
    S.vx = (Math.random() * 2 - 1) * H * 0.03;
    S.vy = 0;
    S.angle = 0;
    S.fuel = 100;
    S.result = '';
    S.input.left = S.input.right = S.input.thrust = false;
    setThrustSound(false);
    updateHint();
  }

  function startFlying() {
    if (S.mode === 'ready') {
      S.mode = 'flying';
      updateHint();
    }
  }

  function setThrustSound(on) {
    if (on && !S.thrusting) {
      S.thrusting = true;
      startThrust();
    } else if (!on && S.thrusting) {
      S.thrusting = false;
      stopThrust();
    }
  }

  // 지형 높이 보간
  function terrainYAt(x) {
    const t = S.terrain;
    for (let i = 0; i < t.length - 1; i++) {
      if (x >= t[i].x && x <= t[i + 1].x) {
        const f = (x - t[i].x) / (t[i + 1].x - t[i].x);
        return t[i].y + (t[i + 1].y - t[i].y) * f;
      }
    }
    return view.height; // 범위 밖
  }

  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // ----- 물리 -----
  function step(dt) {
    dt = Math.min(dt, 0.033);
    const P = params();
    const W = view.width;

    if (S.mode !== 'flying') {
      setThrustSound(false);
      return;
    }

    // 회전
    if (S.input.left) S.angle -= P.rot * dt;
    if (S.input.right) S.angle += P.rot * dt;

    // 분사
    const thrusting = S.input.thrust && S.fuel > 0;
    setThrustSound(thrusting);
    if (thrusting) {
      const ax = Math.sin(S.angle) * P.thrust;
      const ay = -Math.cos(S.angle) * P.thrust;
      S.vx += ax * dt;
      S.vy += ay * dt;
      S.fuel = Math.max(0, S.fuel - P.burn * dt);
    }

    // 중력
    S.vy += P.grav * dt;

    // 이동
    S.x += S.vx * dt;
    S.y += S.vy * dt;

    // 좌우 화면 순환
    if (S.x < 0) S.x += W;
    if (S.x > W) S.x -= W;

    // 지형 충돌
    const gy = terrainYAt(S.x);
    if (S.y + P.r >= gy) {
      S.y = gy - P.r;
      const onPad = S.pad && S.x >= S.pad.x0 && S.x <= S.pad.x1;
      const gentle =
        Math.abs(S.vy) <= P.maxVy &&
        Math.abs(S.vx) <= P.maxVx &&
        Math.abs(normAngle(S.angle)) <= P.maxAngle;
      setThrustSound(false);
      S.vx = S.vy = 0;
      if (onPad && gentle) {
        S.mode = 'landed';
        S.result = '착륙 성공!';
        sfx.win();
      } else {
        S.mode = 'crashed';
        S.result = !onPad ? '착륙장을 벗어났어요' : '너무 빠르거나 기울었어요';
        sfx.lose();
      }
      updateHint();
    }
  }

  // ----- 렌더 -----
  function draw(dt) {
    step(dt);
    const { ctx, width: W, height: H } = view;
    const P = params();

    // 우주 배경
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070d');
    bg.addColorStop(1, '#0d1220');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 별
    ctx.fillStyle = '#ffffff';
    for (const s of S.stars) {
      ctx.globalAlpha = 0.5 + s.r * 0.3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 지형
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const p of S.terrain) ctx.lineTo(p.x, p.y);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = '#3a4152';
    ctx.fill();
    ctx.strokeStyle = '#8b97ad';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < S.terrain.length; i++) {
      const p = S.terrain[i];
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();

    // 착륙장 강조
    if (S.pad) {
      ctx.strokeStyle = '#51e08a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(S.pad.x0, S.pad.y);
      ctx.lineTo(S.pad.x1, S.pad.y);
      ctx.stroke();
      // 깃발
      drawFlag(ctx, S.pad.x0, S.pad.y);
      drawFlag(ctx, S.pad.x1, S.pad.y);
    }

    drawLander(ctx, P);
    drawHUD(ctx, P, W, H);

    if (S.mode === 'ready' || S.mode === 'landed' || S.mode === 'crashed')
      drawOverlay(ctx, W, H);
  }

  function drawFlag(ctx, x, y) {
    ctx.strokeStyle = '#51e08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 14);
    ctx.stroke();
    ctx.fillStyle = '#51e08a';
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x + 9, y - 11);
    ctx.lineTo(x, y - 8);
    ctx.closePath();
    ctx.fill();
  }

  function drawLander(ctx, P) {
    const r = P.r;
    ctx.save();
    ctx.translate(S.x, S.y);
    ctx.rotate(S.angle);

    // 분사 화염
    if (S.thrusting) {
      const flame = r * (1.4 + Math.random() * 0.7);
      const grad = ctx.createLinearGradient(0, r, 0, r + flame);
      grad.addColorStop(0, '#ffe08a');
      grad.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, r * 0.7);
      ctx.lineTo(r * 0.5, r * 0.7);
      ctx.lineTo(0, r + flame);
      ctx.closePath();
      ctx.fill();
    }

    // 착륙 다리
    ctx.strokeStyle = '#c8d0dd';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, r * 0.4);
    ctx.lineTo(-r, r);
    ctx.moveTo(r * 0.6, r * 0.4);
    ctx.lineTo(r, r);
    ctx.stroke();

    // 본체 (포드)
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, '#eef2f8');
    body.addColorStop(1, '#9aa6ba');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.7, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // 창문
    ctx.fillStyle = '#4dabf7';
    ctx.beginPath();
    ctx.arc(0, -r * 0.05, r * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawHUD(ctx, P, W, H) {
    const pad = 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${Math.floor(H * 0.024)}px sans-serif`;

    // 연료 바
    const fw = Math.min(160, W * 0.35);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, pad, pad, fw, 14, 7);
    ctx.fill();
    ctx.fillStyle = S.fuel > 25 ? '#51e08a' : '#ff6b6b';
    roundRect(ctx, pad, pad, (fw * S.fuel) / 100, 14, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`연료 ${Math.ceil(S.fuel)}`, pad, pad + 20);

    // 속도 (안전 기준 초과 시 빨강)
    const safeV = Math.abs(S.vy) <= P.maxVy && Math.abs(S.vx) <= P.maxVx;
    ctx.textAlign = 'right';
    ctx.fillStyle = safeV ? 'rgba(255,255,255,0.85)' : '#ff6b6b';
    const vtot = Math.hypot(S.vx, S.vy);
    ctx.fillText(`속도 ${(vtot).toFixed(0)}`, W - pad, pad);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `500 ${Math.floor(H * 0.02)}px sans-serif`;
    ctx.fillText(`↓${S.vy.toFixed(0)}  →${S.vx.toFixed(0)}`, W - pad, pad + 24);
  }

  function drawOverlay(ctx, W, H) {
    ctx.save();
    if (S.mode !== 'ready') {
      ctx.fillStyle = 'rgba(5,7,13,0.5)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let title = '';
    let sub = '';
    if (S.mode === 'ready') {
      title = 'LUNAR LANDER';
      sub = '분사 버튼(🔥)으로 시작 · 착륙장에 천천히 내리세요';
    } else if (S.mode === 'landed') {
      title = '🎉 ' + S.result;
      sub = `남은 연료 ${Math.ceil(S.fuel)} · 탭해서 다시 시작`;
    } else {
      title = '💥 추락';
      sub = `${S.result} · 탭해서 다시 시작`;
    }
    ctx.fillStyle = S.mode === 'crashed' ? '#ff8a8a' : '#ffd86b';
    ctx.font = `800 ${Math.floor(W * 0.07)}px sans-serif`;
    ctx.fillText(title, W / 2, H * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${Math.floor(W * 0.032)}px sans-serif`;
    ctx.fillText(sub, W / 2, H * 0.4 + W * 0.07);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent =
      S.mode === 'flying'
        ? '◀▶ 회전, 🔥 분사. 초록 착륙장에 저속·수평으로!'
        : '하단 버튼 또는 방향키/스페이스로 조종합니다.';
  }

  // ----- 조종 버튼 (터치) -----
  // 왼쪽 아래 = 불뿜기(분사), 오른쪽 아래 = 기울이기(◀▶). 양손 조작.
  const controls = el('div', 'lander-controls');
  const leftGroup = el('div', 'ctrl-group');
  const rightGroup = el('div', 'ctrl-group');
  const btnThrust = ctrlButton('🔥', (v) => (S.input.thrust = v), 'thrust');
  const btnLeft = ctrlButton('◀', (v) => (S.input.left = v));
  const btnRight = ctrlButton('▶', (v) => (S.input.right = v));
  leftGroup.append(btnThrust);
  rightGroup.append(btnLeft, btnRight);
  controls.append(leftGroup, rightGroup);
  stage.append(controls);

  function ctrlButton(label, setFlag, extra) {
    const b = el('div', 'ctrl' + (extra ? ' ' + extra : ''));
    b.textContent = label;
    const press = (on) => (e) => {
      e.preventDefault();
      if (on) {
        resumeAudio();
        startFlying();
        b.setPointerCapture?.(e.pointerId);
      }
      b.classList.toggle('active', on);
      setFlag(on);
    };
    b.addEventListener('pointerdown', press(true));
    b.addEventListener('pointerup', press(false));
    b.addEventListener('pointercancel', press(false));
    return b;
  }

  // ----- 탭(캔버스): 시작/재시작 -----
  function onCanvasPointerDown() {
    resumeAudio();
    if (S.mode === 'landed' || S.mode === 'crashed') resetGame();
    else startFlying();
  }

  // ----- 키보드 (PC) -----
  function onKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'd', 'w'].includes(e.key))
      e.preventDefault();
    if (S.mode === 'landed' || S.mode === 'crashed') {
      if (e.key === 'Enter' || e.key === ' ') resetGame();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a') S.input.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') S.input.right = true;
    else if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') {
      S.input.thrust = true;
      resumeAudio();
      startFlying();
    }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') S.input.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd') S.input.right = false;
    else if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') S.input.thrust = false;
  }

  // 리사이즈(회전 등): 위치/지형을 비율 스케일해 게임 상태 유지.
  function rescale(w, h) {
    const pw = rescale._w;
    const ph = rescale._h;
    if (pw && ph && (pw !== w || ph !== h)) {
      const sx = w / pw;
      const sy = h / ph;
      S.x *= sx; S.y *= sy; S.vx *= sx; S.vy *= sy;
      for (const p of S.terrain) { p.x *= sx; p.y *= sy; }
      for (const s of S.stars) { s.x *= sx; s.y *= sy; }
      if (S.pad) { S.pad.x0 *= sx; S.pad.x1 *= sx; S.pad.y *= sy; }
    }
    rescale._w = w;
    rescale._h = h;
  }

  // ----- 시작 -----
  view = createCanvas(stage, { onResize: rescale });
  view.canvas.addEventListener('pointerdown', onCanvasPointerDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  // ----- unmount -----
  return function unmount() {
    loop.stop();
    setThrustSound(false);
    view.canvas.removeEventListener('pointerdown', onCanvasPointerDown);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
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
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
