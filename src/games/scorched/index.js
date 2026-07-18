// 탱크 배틀(Scorched 포격전). 두 플레이어가 번갈아 각도/파워/바람을 계산해
// 포탄을 쏘고 지형을 파괴하며 상대를 격파한다. 로컬 2인 대전.
// 게임 계약: mount(container) → unmount().
// 모델: terrain.js(높이맵) / weapons.js(무기 데이터). 이 파일은 뷰 + 물리 + 턴 진행.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import { generateTerrain, surfaceY, isSolid, carveCircle, addDirt } from './terrain.js';
import { BASIC, SPECIALS, rollSpecials } from './weapons.js';

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

// ----- 이동(턴당 제한) -----
const MOVE_BUDGET = 135;  // 턴당 이동 가능 거리(월드 px)
const MOVE_SPEED = 95;    // 이동 속도(px/s)
const MAX_SLOPE = 1.15;   // 오를 수 있는 최대 경사(높이/가로). 넘으면 막힘(벽은 못 오름)

// ----- 낙하 데미지 -----
const FALL_MIN = 64;      // 이 이상 떨어져야 피해
const FALL_RATE = 0.34;   // 초과 낙하 px당 피해
const FALL_MAX = 44;      // 낙하 피해 상한

// ----- 맵 오브젝트 -----
const CRATE_W = 26;
const BARREL_W = 22;
const BARREL_R = 50;      // 드럼통 폭발 반경
const BARREL_DMG = 34;

// ----- 드래그 조준 -----
const AIM_GRAB_R = 130;      // 탱크 근처 이 반경(월드)을 누르면 드래그 조준 시작
const AIM_POWER_SCALE = 3.4; // 드래그 거리 → 파워

// ----- 배경 테마(랜덤) -----
const BG_THEMES = [
  { sky: ['#3b6ea5', '#a9d4ef'], orb: { c: '#fff4c2', glow: 'rgba(255,240,180,0.5)', xy: [0.8, 0.2], r: 34 }, clouds: 4, stars: 0 },
  { sky: ['#43305f', '#ff9e5e'], orb: { c: '#ffd98a', glow: 'rgba(255,180,110,0.55)', xy: [0.72, 0.66], r: 46 }, clouds: 3, stars: 0 },
  { sky: ['#0a1230', '#22366b'], orb: { c: '#e8eefc', glow: 'rgba(220,230,255,0.35)', xy: [0.8, 0.22], r: 26 }, clouds: 1, stars: 70 },
  { sky: ['#132347', '#3a5a7a'], orb: null, clouds: 2, stars: 30 },
];

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
    moving: 0,   // 이동 입력 (-1/0/1)
    time: 0,     // 배경 애니메이션 시간
    bg: null,    // 랜덤 배경 테마
    crates: [],  // 아이템 상자
    barrels: [], // 폭발 드럼통
    crateMsg: null, // 획득 안내 { text, t }
    zones: [],   // 지속 지대(화염/독가스) [{x,y,r,kind,turns,dmg}]
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
      moveLeft: MOVE_BUDGET, // 이번 턴 남은 이동 거리
      shield: false, // 다음 피해 1회 흡수
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
    S.moving = 0;
    S.crateMsg = null;
    S.zones = [];
    spawnObjects();
    rollWind();
    rollBackground();
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

  function rollBackground() {
    const th = BG_THEMES[Math.floor(Math.random() * BG_THEMES.length)];
    const clouds = [];
    for (let i = 0; i < th.clouds; i++)
      clouds.push({ x: Math.random(), y: 0.08 + Math.random() * 0.32, s: 0.7 + Math.random() * 0.9, v: 6 + Math.random() * 10 });
    const stars = [];
    for (let i = 0; i < th.stars; i++)
      stars.push({ x: Math.random(), y: Math.random() * 0.5, r: Math.random() * 1.3 + 0.4 });
    S.bg = { th, clouds, stars };
  }

  // 이동(턴당 제한 + 경사 제한)
  function moveActive(dir, dt) {
    const p = active();
    if (p.moveLeft <= 0) return;
    const stepDist = Math.min(MOVE_SPEED * dt, p.moveLeft);
    let nx = Math.max(TANK_R, Math.min(WORLD_W - TANK_R, p.x + dir * stepDist));
    const e = enemy();
    if (e.hp > 0 && Math.abs(nx - e.x) < TANK_W) return; // 상대와 겹침 방지
    const dxAbs = Math.abs(nx - p.x);
    if (dxAbs < 0.01) return;
    const rise = surfaceY(S.terrain, p.x) - surfaceY(S.terrain, nx); // >0 = 오르막
    if (rise > 0 && rise / dxAbs > MAX_SLOPE) return; // 너무 가파른 경사(벽)는 못 오름
    p.x = nx;
    p.y = restY(p); // 지면 따라 정착
    p.moveLeft -= dxAbs;
    if (p.moveLeft < 0) p.moveLeft = 0;
    // 상자 밟고 지나가면 획득
    for (const c of S.crates)
      if (!c.taken && Math.abs(c.x - p.x) < CRATE_W / 2 + TANK_W / 2) collectCrate(c, p);
  }

  // ----- 맵 오브젝트 (상자/드럼통) -----
  const CRATE_KINDS = ['weapon', 'heal', 'shield', 'fuel'];
  function spawnObjects() {
    S.crates = []; S.barrels = [];
    const okX = (x) => S.players.every((t) => Math.abs(x - t.x) > 100);
    const place = (lo, hi) => { let x, g = 24; do { x = WORLD_W * (lo + Math.random() * (hi - lo)); } while (!okX(x) && g-- > 0); return x; };
    for (let i = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++)
      S.crates.push({ x: place(0.2, 0.8), type: CRATE_KINDS[Math.floor(Math.random() * CRATE_KINDS.length)], taken: false });
    for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++)
      S.barrels.push({ x: place(0.15, 0.85), dead: false });
  }

  function collectCrate(c, p) {
    if (c.taken) return;
    c.taken = true;
    let msg;
    if (c.type === 'heal') { p.hp = Math.min(p.maxHp, p.hp + 30); msg = `${p.name} 회복 +30`; }
    else if (c.type === 'shield') { p.shield = true; msg = `${p.name} 실드 획득!`; }
    else if (c.type === 'fuel') { p.moveLeft = Math.min(MOVE_BUDGET * 1.8, p.moveLeft + 90); msg = `${p.name} 이동력 +90`; }
    else { // weapon
      const w = SPECIALS[Math.floor(Math.random() * SPECIALS.length)];
      const ex = p.inv.find((it) => it.id === w.id);
      if (ex) ex.ammo += 2; else p.inv.push({ ...w, ammo: 2 });
      msg = `${p.name} ${w.name} 획득!`;
    }
    S.crateMsg = { text: msg, t: 1.8 };
    spawnBurst(c.x, surfaceY(S.terrain, c.x) - 10, 22, '#7fd0ff');
    sfx.explosion(0.3);
    if (S.mode === 'aim') renderControls(); // 인벤/이동력 갱신
  }

  function explodeBarrel(b) {
    if (b.dead) return;
    b.dead = true;
    const bx = b.x, by = surfaceY(S.terrain, b.x);
    carveCircle(S.terrain, bx, by, BARREL_R);
    applyDamage(bx, by, BARREL_R, BARREL_DMG);
    spawnBurst(bx, by, BARREL_R, '#ff7a3d');
    boom(0.8); S.shake = Math.max(S.shake, 22);
    for (const o of S.barrels) // 연쇄 폭발
      if (!o.dead && Math.abs(o.x - bx) < BARREL_R + BARREL_W) explodeBarrel(o);
  }

  // 폭발 반경 안의 상자 획득 + 드럼통 연쇄
  function blastObjects(x, y, r) {
    for (const c of S.crates)
      if (!c.taken && Math.hypot(c.x - x, surfaceY(S.terrain, c.x) - y) < r + CRATE_W) collectCrate(c, active());
    for (const b of S.barrels)
      if (!b.dead && Math.hypot(b.x - x, surfaceY(S.terrain, b.x) - y) < r + BARREL_W) explodeBarrel(b);
  }

  // 낙하 피해 (착지 시)
  function applyFallDamage(p, ry) {
    const drop = ry - (p._fy0 ?? ry);
    p._fy0 = ry;
    if (drop <= FALL_MIN) return;
    if (p.shield) { p.shield = false; spawnBurst(p.x, p.y - 8, 20, '#7fd0ff'); return; }
    const dmg = Math.min(FALL_MAX, (drop - FALL_MIN) * FALL_RATE);
    p.hp = Math.max(0, p.hp - dmg);
    spawnBurst(p.x, p.y, 16, '#ff9a3d');
    S.shake = Math.max(S.shake, 10);
    if (p.hp <= 0) sfx.lose();
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
    const v = (p.power / 100) * MAX_V * (w.rail ? 1.7 : 1); // 레일건은 초고속
    const count = w.volley || 1; // 삼연포 등: 한 번에 여러 발 부채꼴
    S.shots = [];
    for (let k = 0; k < count; k++) {
      const aa = a + (k - (count - 1) / 2) * (6 * Math.PI / 180); // 6° 간격
      const bx = p.x + Math.cos(aa) * (TANK_R + 6);
      const by = p.y - TANK_H / 2 - 4 - Math.sin(aa) * (TANK_R + 6);
      S.shots.push(makeShot(bx, by, Math.cos(aa) * v, -Math.sin(aa) * v, w));
    }
    if (w.ammo !== Infinity) w.ammo -= 1;
    if (w.ammo <= 0) p.weapon = 'basic';
    S.moving = 0;
    S.mode = 'flight';
    sfx.cannon();
    renderControls();
    updateHint();
  }

  function makeShot(x, y, vx, vy, w) {
    return {
      x, y, ox: x, oy: y, vx, vy, w, // ox,oy = 발사 원점(레일건 레이저 줄기용)
      t: 0, armed: false, trail: [],
      split: false, rolling: false, rollDist: 0, rollDir: 1, bounces: 0, dived: false,
    };
  }

  // ================= 물리 스텝 =================
  function stepShots(dt) {
    for (const s of S.shots) {
      if (s.rolling) { stepRoll(s, dt); continue; }
      s.t += dt;
      if (s.t > 0.08) s.armed = true;
      // 분열탄/집속탄: 정점(하강 시작)에서 여러 발로 분열
      if (s.w.split && !s.split && s.vy >= 0) {
        s.split = true;
        s.dead = true;
        const n = s.w.split;
        const speed = Math.hypot(s.vx, s.vy) * 0.9;
        const base = Math.atan2(s.vy, s.vx);
        for (let k = 0; k < n; k++) {
          const ang = base + (k - (n - 1) / 2) * 0.22;
          const c = makeShot(s.x, s.y, Math.cos(ang) * speed, Math.sin(ang) * speed,
            { ...s.w, split: 0 });
          c.armed = true;
          S.shots.push(c);
        }
        continue;
      }
      // 급강하탄: 정점에서 수평속도를 죽이고 수직으로 급강하
      if (s.w.dive && !s.dived && s.vy >= 0) {
        s.dived = true;
        s.vx *= 0.12;
        if (s.vy < 140) s.vy = 140;
      }
      // 유도탄: 정점 이후 상대 탱크 쪽으로 서서히 선회
      if (s.w.homing && s.t > 0.35) {
        const tgt = enemy();
        if (tgt && tgt.hp > 0) {
          const desired = Math.atan2(tgt.y - s.y, tgt.x - s.x);
          const cur = Math.atan2(s.vy, s.vx);
          let diff = desired - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = 2.4 * dt;
          const na = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
          const sp = Math.hypot(s.vx, s.vy);
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
        }
      }
      if (!s.w.rail) { // 레일건은 중력/바람 무시(직사)
        s.vx += S.wind * WIND_ACC * dt;
        s.vy += GRAVITY * dt;
      }
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
        if (s.w.bounce && s.bounces < s.w.bounce) { // 튕김탄: 지면에서 튕겨오름
          s.bounces += 1;
          s.y = surfaceY(S.terrain, s.x) - 3;
          s.vy = -Math.abs(s.vy) * 0.55;
          s.vx *= 0.72;
          spawnBurst(s.x, s.y, 10, '#cfd6e0');
          continue;
        }
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
    // 레일건: 포구→착탄점 레이저 잔상(짧게 남았다 사라짐)
    if (w.rail) S.particles.push({ beam: true, x1: s.ox, y1: s.oy, x2: x, y2: y, life: 0.4, max: 0.4 });
    if (w.scatter) {
      // 네이팜: 착탄 지점 좌우로 여러 발 연속 폭발(지면 기준 카펫)
      const n = w.scatter;
      for (let k = 0; k < n; k++) {
        const ox = Math.max(0, Math.min(WORLD_W, x + (k - (n - 1) / 2) * (r * 1.2)));
        const oy = surfaceY(S.terrain, ox);
        carveCircle(S.terrain, ox, oy, r);
        applyDamage(ox, oy, r, w.damage);
        blastObjects(ox, oy, r);
        spawnBurst(ox, oy, r, '#ff9a3d');
      }
      boom(0.9);
      S.shake = 26;
      return;
    }
    if (w.fire || w.gas) {
      // 지속 지대 생성 (화염=지면 불, 독가스=떠 있는 구름)
      if (w.fire) carveCircle(S.terrain, x, y, w.radius * 0.6);
      applyDamage(x, y, w.radius, w.damage);
      blastObjects(x, y, w.radius);
      const gy = surfaceY(S.terrain, x);
      S.zones.push({
        x, y: w.gas ? y : gy, r: w.radius * (w.gas ? 1.5 : 1.35),
        kind: w.gas ? 'gas' : 'fire', turns: w.gas ? 4 : 3, dmg: w.gas ? 9 : 12,
      });
      spawnBurst(x, gy, w.radius, w.gas ? '#8fe08f' : '#ff8a3d');
      boom(0.45);
      S.shake = Math.min(18, w.radius * 0.4);
      return;
    }
    if (w.dirt) {
      addDirt(S.terrain, x, r);       // 흙 쌓기(데미지 없음)
      spawnBurst(x, y, r, '#a9763f');
      boom(0.5);
    } else {
      carveCircle(S.terrain, x, y, r);
      applyDamage(x, y, r, w.damage);
      blastObjects(x, y, r);
      spawnBurst(x, y, r, '#ffcf6b');
      boom(Math.min(1, r / 60));
    }
    S.shake = Math.min(w.nuke ? 42 : 24, r * 0.4);
    // 지형이 바뀌었으니 탱크 재정착 필요 → settle 단계로
  }

  function applyDamage(x, y, r, dmg) {
    if (dmg <= 0) return;
    for (const p of S.players) {
      if (p.hp <= 0) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      const reach = r + TANK_R;
      if (d < reach) {
        if (p.shield) { p.shield = false; spawnBurst(p.x, p.y - 8, 22, '#7fd0ff'); continue; } // 실드가 흡수
        p.hp = Math.max(0, p.hp - dmg * (1 - d / reach));
        if (p.hp <= 0) sfx.lose();
      }
    }
  }

  // 지속 지대(화염/독가스) 턴 경과 처리 — 지대 안 탱크에 피해 후 지속시간 감소
  function tickZones() {
    for (const z of S.zones) {
      for (const p of S.players) {
        if (p.hp <= 0) continue;
        if (Math.hypot(p.x - z.x, p.y - z.y) < z.r + TANK_R * 0.5) {
          if (p.shield) { p.shield = false; spawnBurst(p.x, p.y - 8, 18, '#7fd0ff'); }
          else {
            p.hp = Math.max(0, p.hp - z.dmg);
            spawnBurst(p.x, p.y - 6, 14, z.kind === 'gas' ? '#8fe08f' : '#ff8a3d');
            if (p.hp <= 0) sfx.lose();
          }
        }
      }
      z.turns -= 1;
    }
    S.zones = S.zones.filter((z) => z.turns > 0);
  }

  // ================= 턴 진행 =================
  function endTurnMaybe() {
    tickZones(); // 지대 지속 피해 먼저 적용(사망 시 아래에서 종료 처리)
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
    active().moveLeft = MOVE_BUDGET; // 새 턴 이동력 충전
    S.moving = 0;
    S.mode = 'aim';
    renderControls();
    updateHint();
  }

  // ================= 업데이트 =================
  function update(dt) {
    dt = Math.min(dt, 0.033);
    S.time += dt;
    if (S.crateMsg && (S.crateMsg.t -= dt) <= 0) S.crateMsg = null;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 40);
    stepParticles(dt);

    if (S.mode === 'aim' && S.moving) moveActive(S.moving, dt);

    if (S.mode === 'flight') {
      stepShots(dt * SIM_SPEED);
      if (S.shots.length === 0) {
        S.mode = 'settle'; S.settleT = 0.7;
        for (const p of S.players) p._fy0 = p.y; // 낙하 시작 높이 기록
      }
    } else if (S.mode === 'settle') {
      // 탱크 낙하 정착
      let allRest = true;
      for (const p of S.players) {
        if (p.hp <= 0) continue;
        const ry = restY(p);
        if (p.y < ry - 0.5) {
          p.vy += GRAVITY * dt * SIM_SPEED;
          p.y += p.vy * dt * SIM_SPEED;
          if (p.y >= ry) { p.y = ry; p.vy = 0; applyFallDamage(p, ry); } // 착지 → 낙하 피해
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
      if (p.ring || p.beam) continue;
      p.vy += 220 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    S.particles = S.particles.filter((p) => p.life > 0);
  }

  function boom(intensity) {
    // 폭발음: 반경에 비례한 럼블 + 서브 붐(전차포 느낌)
    sfx.explosion(intensity);
  }

  // ================= 렌더 =================
  function draw(dt) {
    update(dt);
    const { ctx, width: W, height: H } = view;

    // 하늘 (랜덤 배경 테마)
    drawBackground(ctx, W, H);

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
    for (const b of S.barrels) if (!b.dead) drawBarrel(ctx, b);
    for (const c of S.crates) if (!c.taken) drawCrate(ctx, c);
    drawZones(ctx);
    for (const p of S.players) drawTank(ctx, p);
    drawParticles(ctx);
    for (const s of S.shots) drawShot(ctx, s);
    if (S.mode === 'aim') drawAimGuide(ctx);

    ctx.restore();

    drawHUD(ctx, W, H);
    if (S.mode === 'over') drawOverlay(ctx, W, H);
  }

  function drawBackground(ctx, W, H) {
    const bg = S.bg;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, bg.th.sky[0]);
    sky.addColorStop(1, bg.th.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // 별 (반짝임)
    ctx.fillStyle = '#ffffff';
    for (const s of bg.stars) {
      ctx.globalAlpha = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(S.time * 2 + s.x * 40));
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 해/달
    const orb = bg.th.orb;
    if (orb) {
      ctx.save();
      ctx.shadowColor = orb.glow; ctx.shadowBlur = 45;
      ctx.beginPath(); ctx.arc(orb.xy[0] * W, orb.xy[1] * H, orb.r, 0, Math.PI * 2);
      ctx.fillStyle = orb.c; ctx.fill();
      ctx.restore();
    }
    // 구름 (천천히 흐름)
    for (const c of bg.clouds) {
      const cx = ((c.x * (W + 260) + S.time * c.v) % (W + 260)) - 130;
      drawCloud(ctx, cx, c.y * H, c.s);
    }
  }
  function drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.ellipse(x, y, 34 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 26 * s, y + 4 * s, 24 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 26 * s, y + 5 * s, 22 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const CRATE_STYLE = {
    weapon: { c: '#c9a24b', mark: '⚙' },
    heal: { c: '#4bd07a', mark: '＋' },
    shield: { c: '#4db2e6', mark: '🛡' },
    fuel: { c: '#e6a54d', mark: '⛽' },
  };
  function drawCrate(ctx, c) {
    const cx = c.x, cy = surfaceY(S.terrain, c.x) - CRATE_W / 2 - 1;
    const st = CRATE_STYLE[c.type] || CRATE_STYLE.weapon;
    const bob = Math.sin(S.time * 3 + c.x) * 1.5;
    ctx.save();
    ctx.translate(cx, cy + bob);
    roundRect(ctx, -CRATE_W / 2, -CRATE_W / 2, CRATE_W, CRATE_W, 4);
    const g = ctx.createLinearGradient(0, -CRATE_W / 2, 0, CRATE_W / 2);
    g.addColorStop(0, lightenHex(st.c, 30)); g.addColorStop(1, st.c);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `${Math.floor(CRATE_W * 0.62)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(st.mark, 0, 1);
    ctx.restore();
  }
  function drawBarrel(ctx, b) {
    const cx = b.x, base = surfaceY(S.terrain, b.x);
    const h = 26, w = BARREL_W;
    ctx.save();
    ctx.translate(cx, base - h / 2 - 1);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#8a2b2b'); g.addColorStop(0.5, '#d8412f'); g.addColorStop(1, '#8a2b2b');
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,90,0.9)'; // 위험 띠
    ctx.fillRect(-w / 2, -3, w, 6);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('☢', 0, 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
    roundRect(ctx, -w / 2, -h / 2, w, h, 4); ctx.stroke();
    ctx.restore();
  }

  function drawZones(ctx) {
    for (const z of S.zones) {
      if (z.kind === 'gas') {
        const pulse = 0.5 + 0.5 * Math.sin(S.time * 2 + z.x);
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2 + S.time * 0.4;
          ctx.beginPath();
          ctx.arc(z.x + Math.cos(ang) * z.r * 0.5, z.y - 10 + Math.sin(ang) * z.r * 0.28, z.r * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(130,220,120,${0.09 + 0.06 * pulse})`;
          ctx.fill();
        }
      } else {
        const gy = surfaceY(S.terrain, z.x);
        for (let i = -2; i <= 2; i++) {
          const fx = z.x + i * z.r * 0.34;
          const h = z.r * (0.5 + 0.4 * Math.abs(Math.sin(S.time * 8 + i)));
          const g = ctx.createLinearGradient(fx, gy, fx, gy - h);
          g.addColorStop(0, '#ffd24a'); g.addColorStop(1, 'rgba(255,90,40,0.15)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(fx - 7, gy);
          ctx.quadraticCurveTo(fx, gy - h, fx + 7, gy);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
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
    const half = TANK_W / 2;
    const bodyTop = -TANK_H / 2 + 2, bodyBot = TANK_H / 2 - 8;

    // 무한궤도(트랙) — 바닥 밴드 + 바퀴 + 궤도 눈금
    ctx.fillStyle = '#23272f';
    roundRect(ctx, -half - 2, TANK_H / 2 - 9, TANK_W + 4, 13, 6); ctx.fill();
    ctx.fillStyle = '#12151c';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * (TANK_W * 0.2), TANK_H / 2 - 3, 3.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 7; i++) { const gx = -half + 3 + i * ((TANK_W - 6) / 7); line(ctx, gx, TANK_H / 2 - 9, gx, TANK_H / 2 + 3); }

    // 차체(사다리꼴, 위가 좁음) + 그라데이션 + 하이라이트
    const g = ctx.createLinearGradient(0, bodyTop, 0, bodyBot);
    g.addColorStop(0, lightenHex(p.color, 28));
    g.addColorStop(1, p.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-half + 5, bodyTop);
    ctx.lineTo(half - 5, bodyTop);
    ctx.lineTo(half, bodyBot);
    ctx.lineTo(-half, bodyBot);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-half + 6, bodyTop + 1, TANK_W - 12, 2.5);

    // 포탑(돔)
    const g2 = ctx.createLinearGradient(0, bodyTop - TANK_H * 0.6, 0, bodyTop);
    g2.addColorStop(0, lightenHex(p.color, 42));
    g2.addColorStop(1, p.color);
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, bodyTop, TANK_H * 0.62, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    // 해치
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.arc(-2, bodyTop - TANK_H * 0.2, 3.2, 0, Math.PI * 2); ctx.fill();

    // 포신(각도) — 맨틀렛 + 배럴 + 머즐 브레이크
    const a = (p.angle * Math.PI) / 180;
    ctx.save();
    ctx.translate(0, bodyTop - 1);
    ctx.rotate(-a);
    ctx.fillStyle = '#3a4048';
    roundRect(ctx, -3, -5, 11, 10, 3); ctx.fill();
    ctx.fillStyle = '#c2c9d4';
    roundRect(ctx, 6, -3, 26, 6, 2); ctx.fill();
    ctx.fillStyle = '#8b94a2';
    roundRect(ctx, 30, -4.5, 7, 9, 2); ctx.fill();
    ctx.restore();

    ctx.restore();

    // 실드(다음 피해 흡수) — 청록 링
    if (p.shield) {
      ctx.save();
      ctx.strokeStyle = `rgba(120,210,255,${0.55 + 0.25 * Math.sin(S.time * 5)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y - TANK_H * 0.35, TANK_R + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 머리 위 HP 바
    const bw = 52, bh = 6, by = p.y - TANK_H - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, p.x - bw / 2, by, bw, bh, 3); ctx.fill();
    ctx.fillStyle = p.hp > 40 ? '#5fd06a' : '#ff6b5a';
    roundRect(ctx, p.x - bw / 2, by, bw * (p.hp / p.maxHp), bh, 3); ctx.fill();
  }

  function drawShot(ctx, s) {
    const w = s.w;
    // 레일건: 포구→현재 위치로 뻗는 레이저 빔
    if (w.rail) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(120,220,255,0.95)'; ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(150,230,255,0.9)'; ctx.lineWidth = 6;
      line(ctx, s.ox, s.oy, s.x, s.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2;
      line(ctx, s.ox, s.oy, s.x, s.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e6f9ff'; ctx.shadowBlur = 20; ctx.fill();
      ctx.restore();
      return;
    }

    const kind = shotKind(w);
    // 트레일(종류별 색)
    const tc = kind === 'fire' ? '255,150,60'
      : kind === 'gas' ? '150,220,140'
        : kind === 'missile' ? '220,220,230'
          : '255,190,90';
    for (let i = 0; i < s.trail.length; i++) {
      const pt = s.trail[i];
      const a = i / s.trail.length;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1 + a * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tc},${a * 0.6})`;
      ctx.fill();
    }

    const ang = Math.atan2(s.vy, s.vx);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3;
    switch (kind) {
      case 'fire': drawFireball(ctx); break;
      case 'gas': ctx.rotate(ang); drawCanister(ctx); break;
      case 'missile': ctx.rotate(ang); drawMissile(ctx); break;
      case 'dart': ctx.rotate(ang); drawDart(ctx); break;
      case 'bomb': drawBomb(ctx, w); break;
      case 'dirt': drawDirtball(ctx); break;
      case 'cluster': drawCluster(ctx); break;
      case 'ball': drawBall(ctx, w); break;
      default: ctx.rotate(ang); drawShell(ctx); break;
    }
    ctx.restore();
  }

  function drawParticles(ctx) {
    for (const p of S.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.beam) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(120,220,255,0.9)'; ctx.shadowBlur = 16;
        ctx.strokeStyle = `rgba(150,230,255,${a})`; ctx.lineWidth = 7;
        line(ctx, p.x1, p.y1, p.x2, p.y2);
        ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.5;
        line(ctx, p.x1, p.y1, p.x2, p.y2);
        ctx.restore();
        continue;
      }
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
    const wSel = p.inv.find((it) => it.id === p.weapon);
    const rail = !!(wSel && wSel.rail);
    const mul = rail ? 1.7 : 1;
    let vx = Math.cos(a) * (p.power / 100) * MAX_V * mul;
    let vy = -Math.sin(a) * (p.power / 100) * MAX_V * mul;
    let x = ox, y = oy;
    ctx.moveTo(x, y);
    for (let i = 0; i < 22; i++) {
      const dt = 0.05;
      if (!rail) { vx += S.wind * WIND_ACC * dt; vy += GRAVITY * dt; }
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

    // 이동 게이지(현재 턴 남은 이동력)
    if (S.mode === 'aim') {
      const p = active();
      const gw = 92, gx = W / 2 - gw / 2, gy = 34;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, gx, gy, gw, 6, 3); ctx.fill();
      ctx.fillStyle = p.color;
      roundRect(ctx, gx, gy, gw * (p.moveLeft / MOVE_BUDGET), 6, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '600 11px sans-serif';
      ctx.fillText('이동력', W / 2, gy + 15);
    }

    // 좌우 플레이어 이름/턴 표시
    ctx.font = '800 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = S.players[0].color;
    ctx.fillText(`${S.players[0].name}${S.turn === 0 && S.mode !== 'over' ? ' ◀턴' : ''}`, 14, 22);
    ctx.textAlign = 'right';
    ctx.fillStyle = S.players[1].color;
    ctx.fillText(`${S.turn === 1 && S.mode !== 'over' ? '턴▶ ' : ''}${S.players[1].name}`, W - 14, 22);

    // 아이템 획득 안내
    if (S.crateMsg) {
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(127,208,255,${Math.min(1, S.crateMsg.t)})`;
      ctx.font = '800 18px sans-serif';
      ctx.fillText('📦 ' + S.crateMsg.text, W / 2, 62);
    }
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
    hint.textContent = `${active().name} 차례 · 탱크를 끌어 조준(또는 슬라이더) · ◀▶ 이동 · 상자📦 먹고 드럼통🛢 노리기`;
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

    // 이동 버튼(턴당 제한). 누르는 동안 이동. — 발사 버튼과 떨어뜨려 오터치 방지(왼쪽 배치).
    const moveRow = el('div', 'sc-move');
    const mkMove = (label, dir) => {
      const b = el('button', 'sc-weapon');
      b.innerHTML = `<span class="wi">${label}</span><span class="wn">이동</span>`;
      b.disabled = disabled;
      const down = (e) => { e.preventDefault(); if (S.mode === 'aim') { S.moving = dir; b.setPointerCapture?.(e.pointerId); b.classList.add('sel'); } };
      const up = () => { if (S.moving === dir) S.moving = 0; b.classList.remove('sel'); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      return b;
    };
    moveRow.append(mkMove('◀', -1), mkMove('▶', 1));

    // 발사 버튼 (오른쪽, 크게)
    const fireBtn = el('button', 'sc-fire primary');
    fireBtn.textContent = '🔥 발사';
    fireBtn.disabled = disabled;
    fireBtn.addEventListener('click', fire);

    // 하단 행: [◀ ▶ 이동]  ···큰 간격···  [🔥 발사]
    const bottomRow = el('div', 'sc-bottom');
    bottomRow.append(moveRow, fireBtn);

    controls.style.setProperty('--pc', p.color);
    controls.append(sliders, weaponRow, bottomRow);
    if (disabled) controls.classList.add('locked'); else controls.classList.remove('locked');
  }

  function sliderRow(label, min, max, value, onInput) {
    const row = el('div', 'sc-row');
    const lab = el('span', 'sc-lab'); lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.value = value;
    input.className = 'sc-range';
    const val = el('span', 'sc-val'); val.textContent = label === '각도' ? value + '°' : value;
    const set = (v) => {
      v = Math.max(min, Math.min(max, Math.round(v)));
      input.value = v;
      onInput(v);
    };
    input.addEventListener('input', () => set(parseInt(input.value, 10)));
    // −/＋ 미세 조절(누르고 있으면 가속 반복)
    const minus = stepBtn('−', () => set(parseInt(input.value, 10) - 1));
    const plus = stepBtn('＋', () => set(parseInt(input.value, 10) + 1));
    row.append(lab, minus, input, plus, val);
    return { row, input, val };
  }

  // 스텝 버튼: 탭 1회 = ±1, 길게 누르면 점점 빨라지며 반복
  function stepBtn(label, act) {
    const b = el('button', 'sc-step');
    b.textContent = label;
    let timer = null;
    const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const start = (e) => {
      e.preventDefault();
      if (S.mode !== 'aim') return;
      act();
      let delay = 340;
      const tick = () => { act(); delay = Math.max(28, delay * 0.78); timer = setTimeout(tick, delay); };
      timer = setTimeout(tick, 340);
      b.setPointerCapture?.(e.pointerId);
    };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('pointerleave', stop);
    return b;
  }

  // 캔버스: 탱크 근처를 끌면 조준(각도/파워), 그 외엔 핀치 줌 / 드래그 팬.
  const pointers = new Map(); // pointerId → {x,y}(캔버스 로컬)
  let pinchStart = null;      // {dist, zoom, anchor:{x,y}(월드)}
  let panLast = null;         // {x,y}(캔버스 로컬)
  let aiming = false;         // 드래그 조준 중

  // 월드 지점으로 조준값(각도/파워) 설정
  function updateAim(wp) {
    const p = active();
    const mx = p.x, my = p.y - TANK_H / 2;
    const dx = wp.x - mx, dy = wp.y - my;
    let deg = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI);
    deg = Math.max(0, Math.min(180, deg));
    const pow = Math.max(5, Math.min(100, Math.round(Math.hypot(dx, dy) / AIM_POWER_SCALE)));
    p.angle = deg; p.power = pow;
    syncSliders();
  }
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
    const cp = canvasPoint(e);
    pointers.set(e.pointerId, cp);
    if (pointers.size === 2) {
      const m = pinchMid();
      pinchStart = { dist: pinchDist(), zoom: S.zoom, anchor: toWorld(m.x, m.y) };
      panLast = null;
      aiming = false; // 두 손가락이면 조준 취소하고 줌
      return;
    }
    // 한 손가락: 탱크 근처면 조준, 아니면 팬
    if (S.mode === 'aim') {
      const wp = toWorld(cp.x, cp.y);
      if (Math.hypot(wp.x - active().x, wp.y - active().y) < AIM_GRAB_R) {
        aiming = true; panLast = null; updateAim(wp);
        return;
      }
    }
    panLast = cp;
  }
  function onCanvasMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, canvasPoint(e));
    if (aiming && pointers.size === 1) {
      updateAim(toWorld(pointers.get(e.pointerId).x, pointers.get(e.pointerId).y));
      return;
    }
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
    if (pointers.size === 0) aiming = false;
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
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

// ---------- 발사체 모양 (원점 0,0 기준. 방향성 있는 것은 호출부가 velocity로 회전) ----------
function shotKind(w) {
  if (w.gas) return 'gas';
  if (w.fire || w.scatter) return 'fire';   // 화염지대 / 네이팜
  if (w.homing) return 'missile';           // 유도탄
  if (w.dive || w.pierce || w.id === 'heavy') return 'dart'; // 급강하/벙커버스터/철갑탄
  if (w.dirt) return 'dirt';                // 흙폭탄
  if (w.nuke || w.id === 'big') return 'bomb'; // 핵탄/대형탄
  if (w.split) return 'cluster';            // 분열/집속/폭풍탄
  if (w.roll || w.bounce) return 'ball';    // 굴림/튕김탄
  return 'shell';                           // 기본/삼연포/오연포/굴착탄 등
}
function drawShell(ctx) { // 뾰족한 포탄 (+x 방향)
  ctx.fillStyle = '#d9c06a';
  roundRect(ctx, -7, -3.2, 11, 6.4, 2); ctx.fill();
  ctx.fillStyle = '#b8933f';
  ctx.beginPath(); ctx.moveTo(4, -3.2); ctx.lineTo(9, 0); ctx.lineTo(4, 3.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(-6, -2.3, 8, 1.4);
}
function drawMissile(ctx) { // 유도 미사일 (+x, 화염 꼬리)
  ctx.fillStyle = 'rgba(255,170,60,0.9)';
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-13 - Math.random() * 5, 0); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9aa3b2';
  ctx.beginPath(); ctx.moveTo(-7, -2.6); ctx.lineTo(-10, -5.2); ctx.lineTo(-4, -2.6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-7, 2.6); ctx.lineTo(-10, 5.2); ctx.lineTo(-4, 2.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8ecf2'; roundRect(ctx, -7, -2.6, 12, 5.2, 2.2); ctx.fill();
  ctx.fillStyle = '#ff5a4d';
  ctx.beginPath(); ctx.moveTo(5, -2.6); ctx.lineTo(10, 0); ctx.lineTo(5, 2.6); ctx.closePath(); ctx.fill();
}
function drawDart(ctx) { // 철갑/관통 다트 (+x, 날카로움)
  ctx.fillStyle = '#7d848f';
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(-2, -3.4); ctx.lineTo(-8, -2.4); ctx.lineTo(-8, 2.4); ctx.lineTo(-2, 3.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#cdd2da';
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(1, -2); ctx.lineTo(1, 2); ctx.closePath(); ctx.fill();
}
function drawBomb(ctx, w) { // 둥근 폭탄 (핵탄=☢)
  const R = w.nuke ? 9 : 7;
  ctx.fillStyle = w.nuke ? '#3a3f4a' : '#2c313b';
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.arc(-R * 0.35, -R * 0.35, R * 0.32, 0, Math.PI * 2); ctx.fill();
  if (w.nuke) {
    ctx.fillStyle = '#ffd34a'; ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☢', 0, 0.5);
  }
}
function drawDirtball(ctx) { // 흙덩이
  ctx.fillStyle = '#9a6b3c';
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a4f2a';
  for (const [dx, dy] of [[-3, -1], [2, 2], [3, -2], [-1, 3]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.6, 0, Math.PI * 2); ctx.fill(); }
}
function drawCluster(ctx) { // 집속/분열 폭탄
  ctx.fillStyle = '#5a6472'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b3038'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd34a'; ctx.fillRect(-6.5, -1, 13, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-2, -2, 2, 0, Math.PI * 2); ctx.fill();
}
function drawBall(ctx, w) { // 굴림/튕김 공
  ctx.fillStyle = w.bounce ? '#ff8a3d' : '#c9d0da';
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
  if (w.bounce) { line(ctx, -6, 0, 6, 0); line(ctx, 0, -6, 0, 6); } // 농구공 무늬
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(-2, -2, 1.8, 0, Math.PI * 2); ctx.fill();
}
function drawFireball(ctx) { // 화염구(깜빡임)
  const f = 0.75 + Math.random() * 0.3;
  ctx.shadowColor = 'rgba(255,140,40,0.9)'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.arc(0, 0, 6 * f, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(0, 0, 3.4 * f, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.arc(-1, -1, 1.4, 0, Math.PI * 2); ctx.fill();
}
function drawCanister(ctx) { // 독가스 캡슐 (+x)
  ctx.fillStyle = '#5fbf4f'; roundRect(ctx, -6, -3.5, 12, 7, 2.5); ctx.fill();
  ctx.fillStyle = '#2f7f2a'; ctx.fillRect(-6, -3.5, 3, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-3.5, -2.6, 7, 1.4);
  ctx.fillStyle = 'rgba(150,220,140,0.55)'; ctx.beginPath(); ctx.arc(7, 0, 2.2, 0, Math.PI * 2); ctx.fill();
}
function lightenHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}
