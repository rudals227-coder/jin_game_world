// 탱크 배틀(Scorched 포격전). 두 플레이어가 번갈아 각도/파워/바람을 계산해
// 포탄을 쏘고 지형을 파괴하며 상대를 격파한다. 로컬 2인 대전.
// 게임 계약: mount(container) → unmount().
// 모델: terrain.js(높이맵) / weapons.js(무기 데이터). 이 파일은 뷰 + 물리 + 턴 진행.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import { generateTerrain, surfaceY, isSolid, carveCircle, addDirt } from './terrain.js';
import { BASIC, rollSpecials } from './weapons.js';

// ----- 월드(고정 좌표계) -----
// 캔버스 크기와 무관하게 지형은 항상 이 크기로 생성 → 리사이즈해도 스케일만 바뀜.
const WORLD_W = 1280;
const WORLD_H = 720;

// ----- 물리 튜닝(느긋하게 눈으로 따라갈 수 있게) -----
const GRAVITY = 320;      // 월드 px/s^2
const MAX_V = 620;        // 파워 100일 때 초기 속도
const WIND_ACC = 9;       // 바람 1당 수평 가속(px/s^2)
const SIM_SPEED = 0.82;   // 전체 시뮬 속도(작을수록 느림)
const ROLL_SPEED = 200;   // 굴림탄 속도
const ROLL_MAX = 420;     // 굴림탄 최대 이동거리

// ----- 탱크 -----
const TANK_W = 46;
const TANK_H = 22;
const TANK_R = 24;        // 피격/충돌 반경

const PLAYERS = [
  { name: 'P1', color: '#4dabf7', dark: '#2f6bd6' },
  { name: 'P2', color: '#ff6b5a', dark: '#d8412f' },
];

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
    button('새 게임', () => resetGame())
  );
  screen.append(topbar, stage, hint);
  container.appendChild(screen);

  let view;

  // ----- 상태 -----
  const S = {
    mode: 'aim',        // aim | flight | settle | over
    terrain: null,
    players: [],        // [{...PLAYERS[i], x, hp, maxHp, angle, power, weapon, inv}]
    turn: 0,            // 현재 플레이어 인덱스
    wind: 0,            // -10..10 (양수=오른쪽)
    shots: [],          // 비행 중 포탄들
    particles: [],
    shake: 0,
    cam: { x: 0, y: 0 },// 카메라 좌상단 월드 좌표
    zoom: 1,            // 사용자 줌(1=배틀필드 전체, 핀치로 확대)
    settleT: 0,
    winner: -1,
    msg: '',
  };

  function makePlayer(i, x) {
    const base = PLAYERS[i];
    return {
      ...base, x,
      hp: 100, maxHp: 100,
      angle: i === 0 ? 55 : 125,
      power: 62,
      weapon: 'basic',
      inv: [{ ...BASIC, ammo: Infinity }, ...rollSpecials()],
      vy: 0, // 낙하용
    };
  }

  function resetGame() {
    S.terrain = generateTerrain(WORLD_W, WORLD_H);
    S.players = [makePlayer(0, WORLD_W * 0.12), makePlayer(1, WORLD_W * 0.88)];
    for (const p of S.players) settleTank(p, true);
    S.turn = 0;
    S.shots = [];
    S.particles = [];
    S.shake = 0;
    S.winner = -1;
    S.mode = 'aim';
    rollWind();
    S.zoom = 1;
    S.cam.x = 0; S.cam.y = 0;
    clampCam();
    S.msg = '';
    renderControls();
    updateHint();
  }

  function rollWind() {
    S.wind = Math.round((Math.random() * 2 - 1) * 10);
  }

  const active = () => S.players[S.turn];
  const enemy = () => S.players[1 - S.turn];

  // ----- 탱크 지면 정착/낙하 -----
  function restY(p) { return surfaceY(S.terrain, p.x) - TANK_H / 2; }
  function settleTank(p, instant) {
    const ry = restY(p);
    if (instant || p.y == null) { p.y = ry; p.vy = 0; return true; }
    if (p.y < ry - 0.5) return false; // 아직 공중 — update에서 낙하
    p.y = ry; p.vy = 0; return true;
  }

  // ================= 발사 =================
  function fire() {
    if (S.mode !== 'aim') return;
    resumeAudio();
    const p = active();
    const w = p.inv.find((it) => it.id === p.weapon) || p.inv[0];
    if (w.ammo <= 0) return;
    const a = (p.angle * Math.PI) / 180;
    const v = (p.power / 100) * MAX_V;
    const bx = p.x + Math.cos(a) * (TANK_R + 6);
    const by = p.y - TANK_H / 2 - 4 - Math.sin(a) * (TANK_R + 6);
    S.shots = [makeShot(bx, by, Math.cos(a) * v, -Math.sin(a) * v, w)];
    if (w.ammo !== Infinity) w.ammo -= 1;
    if (w.ammo <= 0) p.weapon = 'basic';
    S.mode = 'flight';
    sfx.paddle();
    renderControls();
    updateHint();
  }

  function makeShot(x, y, vx, vy, w) {
    return {
      x, y, vx, vy, w,
      t: 0, armed: false, trail: [],
      split: false, rolling: false, rollDist: 0, rollDir: 1,
    };
  }

  // ================= 물리 스텝 =================
  function stepShots(dt) {
    for (const s of S.shots) {
      if (s.rolling) { stepRoll(s, dt); continue; }
      s.t += dt;
      if (s.t > 0.08) s.armed = true;
      // 분열탄: 정점(하강 시작)에서 3발로 분열
      if (s.w.split && !s.split && s.vy >= 0) {
        s.split = true;
        s.dead = true;
        for (let k = -1; k <= 1; k++) {
          const speed = Math.hypot(s.vx, s.vy) * 0.9;
          const ang = Math.atan2(s.vy, s.vx) + k * 0.28;
          const c = makeShot(s.x, s.y, Math.cos(ang) * speed, Math.sin(ang) * speed,
            { ...s.w, split: 0 });
          c.armed = true;
          S.shots.push(c);
        }
        continue;
      }
      s.vx += S.wind * WIND_ACC * dt;
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 16) s.trail.shift();

      // 월드 밖으로 나가면 불발 처리
      if (s.x < -40 || s.x > WORLD_W + 40 || s.y > WORLD_H + 60) { s.dead = true; continue; }

      if (!s.armed) continue;
      // 탱크 직격
      const hitTank = tankHitBy(s.x, s.y);
      if (hitTank) { impact(s, s.x, s.y); continue; }
      // 지형 충돌
      if (isSolid(S.terrain, s.x, s.y)) {
        if (s.w.roll) { startRoll(s); continue; }
        if (s.w.pierce) { impact(s, s.x, s.y + s.w.pierce); continue; } // 관통 후 깊이 폭발
        impact(s, s.x, s.y);
      }
    }
    S.shots = S.shots.filter((s) => !s.dead);
  }

  function startRoll(s) {
    s.rolling = true;
    s.rollDir = s.vx >= 0 ? 1 : -1;
    s.y = surfaceY(S.terrain, s.x) - 3;
  }
  function stepRoll(s, dt) {
    const nx = s.x + s.rollDir * ROLL_SPEED * dt;
    s.rollDist += ROLL_SPEED * dt;
    const cur = surfaceY(S.terrain, s.x);
    const next = surfaceY(S.terrain, nx);
    s.x = nx;
    s.y = next - 3;
    s.trail.length = 0;
    const uphill = next < cur - 0.6;               // 오르막 시작 → 멈춤
    const near = tankHitBy(s.x, s.y - 2);
    if (uphill || near || s.rollDist > ROLL_MAX || nx < 4 || nx > WORLD_W - 4) {
      impact(s, s.x, s.y);
    }
  }

  // 탱크 피격 판정 — 맞은 탱크 반환(없으면 null)
  function tankHitBy(x, y) {
    for (const p of S.players) {
      if (p.hp <= 0) continue;
      if (Math.hypot(p.x - x, p.y - y) < TANK_R) return p;
    }
    return null;
  }

  // ================= 착탄 =================
  function impact(s, x, y) {
    s.dead = true;
    const w = s.w;
    const r = w.radius;
    if (w.dirt) {
      addDirt(S.terrain, x, r);       // 흙 쌓기(데미지 없음)
      spawnBurst(x, y, r, '#a9763f');
      boom(0.5);
    } else {
      carveCircle(S.terrain, x, y, r);
      applyDamage(x, y, r, w.damage);
      spawnBurst(x, y, r, '#ffcf6b');
      boom(Math.min(1, r / 60));
    }
    S.shake = Math.min(24, r * 0.4);
    // 지형이 바뀌었으니 탱크 재정착 필요 → settle 단계로
  }

  function applyDamage(x, y, r, dmg) {
    if (dmg <= 0) return;
    for (const p of S.players) {
      if (p.hp <= 0) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      const reach = r + TANK_R;
      if (d < reach) {
        p.hp = Math.max(0, p.hp - dmg * (1 - d / reach));
        if (p.hp <= 0) sfx.lose();
      }
    }
  }

  // ================= 턴 진행 =================
  function endTurnMaybe() {
    // 죽은 플레이어 있으면 게임 종료
    const dead = S.players.findIndex((p) => p.hp <= 0);
    if (dead >= 0) {
      S.winner = 1 - dead;
      S.mode = 'over';
      S.msg = `${S.players[S.winner].name} 승리!`;
      sfx.win();
      updateHint();
      return;
    }
    S.turn = 1 - S.turn;
    rollWind();
    S.mode = 'aim';
    renderControls();
    updateHint();
  }

  // ================= 업데이트 =================
  function update(dt) {
    dt = Math.min(dt, 0.033);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 40);
    stepParticles(dt);

    if (S.mode === 'flight') {
      stepShots(dt * SIM_SPEED);
      if (S.shots.length === 0) { S.mode = 'settle'; S.settleT = 0.7; }
    } else if (S.mode === 'settle') {
      // 탱크 낙하 정착
      let allRest = true;
      for (const p of S.players) {
        if (p.hp <= 0) continue;
        const ry = restY(p);
        if (p.y < ry - 0.5) {
          p.vy += GRAVITY * dt * SIM_SPEED;
          p.y += p.vy * dt * SIM_SPEED;
          if (p.y >= ry) { p.y = ry; p.vy = 0; }
          else allRest = false;
        } else if (p.y > ry) {
          p.y = ry; // 흙에 묻힌 경우 지면 위로
        }
      }
      S.settleT -= dt;
      if (allRest && S.settleT <= 0 && S.particles.length === 0) endTurnMaybe();
    }

    // 카메라: 비행 중 손을 안 대고 있으면 포탄을 부드럽게 따라감(확대 상태에서도 착탄 확인).
    // 손가락으로 핀치/팬 중이면 사용자 조작 우선.
    if (S.mode === 'flight' && S.shots[0] && pointers.size === 0) {
      const tx = S.shots[0].x - vpW() / 2;
      const ty = S.shots[0].y - vpH() / 2;
      S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 6);
      S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 6);
    }
    clampCam();
  }

  // ----- 카메라(줌/팬) -----
  // baseScale = 배틀필드 전체가 딱 들어가는 배율(contain). effScale = baseScale * 줌.
  function baseScale() { return Math.min(view.width / WORLD_W, view.height / WORLD_H); }
  function effScale() { return baseScale() * S.zoom; }
  function vpW() { return view.width / effScale(); }  // 보이는 월드 가로폭
  function vpH() { return view.height / effScale(); } // 보이는 월드 세로폭
  function clampCam() {
    const w = vpW(), h = vpH();
    S.cam.x = w >= WORLD_W ? (WORLD_W - w) / 2 : Math.max(0, Math.min(WORLD_W - w, S.cam.x));
    S.cam.y = h >= WORLD_H ? (WORLD_H - h) / 2 : Math.max(0, Math.min(WORLD_H - h, S.cam.y));
  }

  // ================= 파티클 =================
  function spawnBurst(x, y, r, color) {
    const n = Math.floor(r * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * r * 3 + 40;
      S.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.5 + Math.random() * 0.5, max: 1, r: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? color : '#ff7a3d',
      });
    }
    S.particles.push({ ring: true, x, y, r: 4, rr: r, life: 0.32, max: 0.32, color });
  }
  function stepParticles(dt) {
    for (const p of S.particles) {
      p.life -= dt;
      if (p.ring) continue;
      p.vy += 220 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    S.particles = S.particles.filter((p) => p.life > 0);
  }

  function boom(intensity) {
    // 폭발음: 강도에 따라 저음 슬라이드
    intensity > 0.6 ? sfx.lose() : sfx.brick();
  }

  // ================= 렌더 =================
  function draw(dt) {
    update(dt);
    const { ctx, width: W, height: H } = view;

    // 하늘 (여백/레터박스 포함 전체를 덮음)
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1a2740');
    sky.addColorStop(1, '#0b1018');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // 월드 좌표계로 진입 (화면 흔들림 + 줌 스케일 + 2D 카메라)
    const es = effScale();
    const sh = S.shake;
    const shakeX = sh ? (Math.random() * 2 - 1) * sh : 0;
    const shakeY = sh ? (Math.random() * 2 - 1) * sh : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.scale(es, es);
    ctx.translate(-S.cam.x, -S.cam.y);

    drawTerrain(ctx);
    for (const p of S.players) drawTank(ctx, p);
    drawParticles(ctx);
    for (const s of S.shots) drawShot(ctx, s);
    if (S.mode === 'aim') drawAimGuide(ctx);

    ctx.restore();

    drawHUD(ctx, W, H);
    if (S.mode === 'over') drawOverlay(ctx, W, H);
  }

  function drawTerrain(ctx) {
    const t = S.terrain;
    ctx.beginPath();
    ctx.moveTo(0, t.ground[0]);
    for (let x = 1; x < t.width; x += 2) ctx.lineTo(x, t.ground[x]);
    ctx.lineTo(t.width, t.ground[t.width - 1]);
    ctx.lineTo(t.width, WORLD_H + 800); // 세로 여백(레터박스)까지 흙으로 채움
    ctx.lineTo(0, WORLD_H + 800);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, WORLD_H * 0.4, 0, WORLD_H);
    g.addColorStop(0, '#6b4a2c');
    g.addColorStop(1, '#3c2a19');
    ctx.fillStyle = g;
    ctx.fill();
    // 지표면 잔디 라인
    ctx.beginPath();
    ctx.moveTo(0, t.ground[0]);
    for (let x = 1; x < t.width; x += 2) ctx.lineTo(x, t.ground[x]);
    ctx.strokeStyle = '#7ec86a';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  function drawTank(ctx, p) {
    if (p.hp <= 0) {
      // 파괴된 잔해
      ctx.save();
      ctx.translate(p.x, p.y + 4);
      ctx.fillStyle = '#3a3f4a';
      ctx.globalAlpha = 0.8;
      roundRect(ctx, -TANK_W / 2, -4, TANK_W, TANK_H * 0.6, 4);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    // 포신
    const a = (p.angle * Math.PI) / 180;
    ctx.save();
    ctx.strokeStyle = '#cfd6e0';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -TANK_H / 2 - 2);
    ctx.lineTo(Math.cos(a) * 30, -TANK_H / 2 - 2 - Math.sin(a) * 30);
    ctx.stroke();
    ctx.restore();
    // 차체
    const g = ctx.createLinearGradient(0, -TANK_H, 0, TANK_H / 2);
    g.addColorStop(0, p.color);
    g.addColorStop(1, p.dark);
    ctx.fillStyle = g;
    roundRect(ctx, -TANK_W / 2, -TANK_H / 2, TANK_W, TANK_H, 6);
    ctx.fill();
    // 포탑
    ctx.beginPath();
    ctx.arc(0, -TANK_H / 2, TANK_H * 0.5, Math.PI, 0);
    ctx.fill();
    // 바퀴
    ctx.fillStyle = '#20242e';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * TANK_W * 0.3, TANK_H / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 머리 위 HP 바
    const bw = 52, bh = 6, by = p.y - TANK_H - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, p.x - bw / 2, by, bw, bh, 3); ctx.fill();
    ctx.fillStyle = p.hp > 40 ? '#5fd06a' : '#ff6b5a';
    roundRect(ctx, p.x - bw / 2, by, bw * (p.hp / p.maxHp), bh, 3); ctx.fill();
  }

  function drawShot(ctx, s) {
    // 트레일
    for (let i = 0; i < s.trail.length; i++) {
      const pt = s.trail[i];
      const a = i / s.trail.length;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1 + a * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,190,90,${a * 0.6})`;
      ctx.fill();
    }
    // 포탄
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe08a';
    ctx.shadowColor = 'rgba(255,200,90,0.9)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawParticles(ctx) {
    for (const p of S.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.ring) {
        const rad = p.rr * (1 - a) + p.r;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,140,${a})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 조준 점선 가이드(예상 초기 방향)
  function drawAimGuide(ctx) {
    const p = active();
    const a = (p.angle * Math.PI) / 180;
    const ox = p.x + Math.cos(a) * (TANK_R + 6);
    const oy = p.y - TANK_H / 2 - 4 - Math.sin(a) * (TANK_R + 6);
    ctx.save();
    ctx.setLineDash([2, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    let vx = Math.cos(a) * (p.power / 100) * MAX_V;
    let vy = -Math.sin(a) * (p.power / 100) * MAX_V;
    let x = ox, y = oy;
    ctx.moveTo(x, y);
    for (let i = 0; i < 22; i++) {
      const dt = 0.05;
      vx += S.wind * WIND_ACC * dt;
      vy += GRAVITY * dt;
      x += vx * dt; y += vy * dt;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD(ctx, W, H) {
    // 바람
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const dir = S.wind === 0 ? '무풍' : (S.wind > 0 ? '▶'.repeat(Math.min(4, Math.ceil(Math.abs(S.wind) / 3))) : '◀'.repeat(Math.min(4, Math.ceil(Math.abs(S.wind) / 3))));
    ctx.fillText(`바람 ${Math.abs(S.wind)} ${dir}`, W / 2, 22);

    // 좌우 플레이어 이름/턴 표시
    ctx.font = '800 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = S.players[0].color;
    ctx.fillText(`${S.players[0].name}${S.turn === 0 && S.mode !== 'over' ? ' ◀턴' : ''}`, 14, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = S.players[1].color;
    ctx.fillText(`${S.turn === 1 && S.mode !== 'over' ? '턴▶ ' : ''}${S.players[1].name}`, W - 14, 22);
  }

  function drawOverlay(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,9,14,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = S.winner >= 0 ? S.players[S.winner].color : '#ffd86b';
    ctx.font = `800 ${Math.floor(W * 0.07)}px sans-serif`;
    ctx.fillText(S.msg, W / 2, H * 0.42);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${Math.floor(W * 0.03)}px sans-serif`;
    ctx.fillText('“새 게임”을 눌러 다시 시작', W / 2, H * 0.42 + W * 0.065);
    ctx.restore();
  }

  function updateHint() {
    if (S.mode === 'over') { hint.textContent = '게임 종료 — 새 게임으로 재시작하세요.'; return; }
    if (S.mode === 'flight' || S.mode === 'settle') { hint.textContent = '포탄 비행 중…'; return; }
    hint.textContent = `${active().name} 차례 · 아래에서 각도/파워 조절 후 발사 · 화면은 핀치 줌 / 드래그로 둘러보기`;
  }

  // ================= 조작 패널(DOM) =================
  const controls = el('div', 'scorched-controls');
  screen.insertBefore(controls, hint); // 캔버스와 겹치지 않는 하단 전용 공간
  let angleInput, powerInput, angleVal, powerVal, weaponRow;

  function renderControls() {
    controls.innerHTML = '';
    const p = active();
    const disabled = S.mode !== 'aim';

    // 슬라이더 행
    const sliders = el('div', 'sc-sliders');
    const angleWrap = sliderRow('각도', 0, 180, p.angle, (v) => { p.angle = v; angleVal.textContent = v + '°'; });
    const powerWrap = sliderRow('파워', 0, 100, p.power, (v) => { p.power = v; powerVal.textContent = v; });
    angleInput = angleWrap.input; angleVal = angleWrap.val;
    powerInput = powerWrap.input; powerVal = powerWrap.val;
    sliders.append(angleWrap.row, powerWrap.row);

    // 무기 선택 행
    weaponRow = el('div', 'sc-weapons');
    for (const w of p.inv) {
      const b = el('button', 'sc-weapon');
      if (w.id === p.weapon) b.classList.add('sel');
      if (w.ammo <= 0) b.disabled = true;
      const ammo = w.ammo === Infinity ? '∞' : w.ammo;
      b.innerHTML = `<span class="wi">${w.icon}</span><span class="wn">${w.name}</span><span class="wa">${ammo}</span>`;
      b.title = w.desc || '';
      b.addEventListener('click', () => {
        if (S.mode !== 'aim' || w.ammo <= 0) return;
        p.weapon = w.id;
        renderControls();
      });
      weaponRow.append(b);
    }

    // 발사 버튼
    const fireBtn = el('button', 'sc-fire primary');
    fireBtn.textContent = '🔥 발사';
    fireBtn.disabled = disabled;
    fireBtn.addEventListener('click', fire);

    controls.style.setProperty('--pc', p.color);
    controls.append(sliders, weaponRow, fireBtn);
    if (disabled) controls.classList.add('locked'); else controls.classList.remove('locked');
  }

  function sliderRow(label, min, max, value, onInput) {
    const row = el('div', 'sc-row');
    const lab = el('span', 'sc-lab'); lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.value = value;
    input.className = 'sc-range';
    const val = el('span', 'sc-val'); val.textContent = label === '각도' ? value + '°' : value;
    input.addEventListener('input', () => onInput(parseInt(input.value, 10)));
    row.append(lab, input, val);
    return { row, input, val };
  }

  // 캔버스 = 보기 전용(핀치 줌 + 드래그 팬). 조준/발사는 하단 패널에서.
  const pointers = new Map(); // pointerId → {x,y}(캔버스 로컬)
  let pinchStart = null;      // {dist, zoom, anchor:{x,y}(월드)}
  let panLast = null;         // {x,y}(캔버스 로컬)
  function canvasPoint(e) {
    const r = view.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function toWorld(px, py) {
    const es = effScale();
    return { x: S.cam.x + px / es, y: S.cam.y + py / es };
  }
  function pinchMid() {
    const p = [...pointers.values()];
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  }
  function pinchDist() {
    const p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
  }
  function onCanvasDown(e) {
    resumeAudio();
    view.canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, canvasPoint(e));
    if (pointers.size === 2) {
      const m = pinchMid();
      pinchStart = { dist: pinchDist(), zoom: S.zoom, anchor: toWorld(m.x, m.y) };
      panLast = null;
    } else if (pointers.size === 1) {
      panLast = canvasPoint(e);
    }
  }
  function onCanvasMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, canvasPoint(e));
    if (pointers.size >= 2 && pinchStart) {
      const m = pinchMid();
      S.zoom = Math.max(1, Math.min(3.5, pinchStart.zoom * (pinchDist() / pinchStart.dist)));
      const es = effScale();
      S.cam.x = pinchStart.anchor.x - m.x / es; // 핀치 중심(anchor)을 손가락 아래 고정
      S.cam.y = pinchStart.anchor.y - m.y / es;
      clampCam();
    } else if (pointers.size === 1 && panLast) {
      const p = canvasPoint(e);
      const es = effScale();
      S.cam.x -= (p.x - panLast.x) / es;
      S.cam.y -= (p.y - panLast.y) / es;
      panLast = p;
      clampCam();
    }
  }
  function onCanvasUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    panLast = pointers.size === 1 ? [...pointers.values()][0] : null;
  }

  // ================= 키보드 =================
  function onKeyDown(e) {
    if (S.mode !== 'aim') {
      if ((e.key === 'Enter' || e.key === ' ') && S.mode === 'over') resetGame();
      return;
    }
    const p = active();
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') { p.angle = Math.min(180, p.angle + step); syncSliders(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { p.angle = Math.max(0, p.angle - step); syncSliders(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { p.power = Math.min(100, p.power + step); syncSliders(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { p.power = Math.max(0, p.power - step); syncSliders(); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { fire(); e.preventDefault(); }
  }
  function syncSliders() {
    const p = active();
    if (angleInput) { angleInput.value = p.angle; angleVal.textContent = p.angle + '°'; }
    if (powerInput) { powerInput.value = p.power; powerVal.textContent = p.power; }
  }

  // ================= 시작 =================
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onCanvasDown);
  view.canvas.addEventListener('pointermove', onCanvasMove);
  view.canvas.addEventListener('pointerup', onCanvasUp);
  view.canvas.addEventListener('pointercancel', onCanvasUp);
  window.addEventListener('keydown', onKeyDown);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  // ================= unmount =================
  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onCanvasDown);
    view.canvas.removeEventListener('pointermove', onCanvasMove);
    view.canvas.removeEventListener('pointerup', onCanvasUp);
    view.canvas.removeEventListener('pointercancel', onCanvasUp);
    window.removeEventListener('keydown', onKeyDown);
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
function spacer() { return el('div', 'spacer'); }
function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
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
