// 광산 채굴(팩맨 스타일). 미로 이동 + 수집 + 몬스터 회피 + 파워업 역공 + 벽 파기.
// 게임 모듈 계약: mount(container) → unmount().
// 조작: 화면 D-pad(▲◀▶▼) + PC 방향키. 목표: 보석(G) 전부 획득.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import {
  TILE, LEVEL, parseLevel, tileAt, passable, isDiggable, isTunnel, collectAt, dig, gemsRemaining,
} from './maze.js';

const PLAYER_SPEED = 5.5; // 칸/초
const MON_SPEED = 4.6;
const FRIGHT_SPEED = 3.2;
const DIG_TIME = 0.6; // 파기 소요(초)
const FRIGHT_TIME = 7; // 파워 지속(초)
const EAT_DIST = 0.6; // 접촉 판정 거리(칸)
const TURN_TOL = 0.45; // 코너 프리턴 허용 거리(칸) — 방향 전환 반응성

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

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
    mode: 'ready', // ready | playing | won | lost
    grid: null, cols: 0, rows: 0, tunnels: [],
    score: 0, lives: 3,
    player: null,
    monsters: [],
    frightTimer: 0,
    eatValue: 200,
    respawnPause: 0,
    anim: 0, // 입 애니메이션용
  };

  function resetGame() {
    const lv = parseLevel(LEVEL);
    S.grid = lv.grid;
    S.cols = lv.cols;
    S.rows = lv.rows;
    S.tunnels = lv.tunnels;
    S.score = 0;
    S.lives = 3;
    S.frightTimer = 0;
    S.respawnPause = 0;
    S.player = {
      px: lv.playerStart.c, py: lv.playerStart.r,
      dir: { x: 0, y: 0 }, want: { x: 0, y: 0 }, face: 1,
      target: null, digTimer: 0, digCell: null,
      spawnC: lv.playerStart.c, spawnR: lv.playerStart.r,
    };
    S.monsters = lv.monsterStarts.map((m) => ({
      px: m.c, py: m.r, dir: { x: -1, y: 0 }, target: null,
      type: m.type, mode: 'normal', cooldown: 0, spawnC: m.c, spawnR: m.r,
    }));
    S.mode = 'ready';
    updateHint();
  }

  function resetPositions() {
    S.player.px = S.player.spawnC; S.player.py = S.player.spawnR;
    S.player.dir = { x: 0, y: 0 }; S.player.want = { x: 0, y: 0 };
    S.player.target = null; S.player.digTimer = 0; S.player.digCell = null;
    for (const m of S.monsters) {
      m.px = m.spawnC; m.py = m.spawnR; m.dir = { x: -1, y: 0 };
      m.target = null; m.mode = 'normal'; m.cooldown = 0;
    }
    S.frightTimer = 0;
  }

  // 누르는 동안만 이동: 눌린 방향 스택(held). 떼면 마지막 남은 방향, 없으면 정지.
  const held = [];
  function pressDir(dir) {
    if (!S.player) return;
    held.push(dir);
    S.player.want = { ...dir };
    if (S.mode === 'ready') { S.mode = 'playing'; updateHint(); }
  }
  function releaseDir(dir) {
    for (let i = held.length - 1; i >= 0; i--) {
      if (held[i].x === dir.x && held[i].y === dir.y) { held.splice(i, 1); break; }
    }
    const top = held[held.length - 1];
    if (S.player) S.player.want = top ? { ...top } : { x: 0, y: 0 };
  }

  // ----- 워프 -----
  function maybeWarp(e, c, r) {
    if (!isTunnel(S.grid, c, r)) return { c, r };
    const other = S.tunnels.find((t) => t.c !== c || t.r !== r);
    if (other) { e.px = other.c; e.py = other.r; return { c: other.c, r: other.r }; }
    return { c, r };
  }

  // ----- 이동 헬퍼 -----
  function moveToward(e, dt, speed) {
    const step = speed * dt;
    const dx = e.target.x - e.px;
    const dy = e.target.y - e.py;
    const d = Math.hypot(dx, dy);
    if (d <= step) { e.px = e.target.x; e.py = e.target.y; e.target = null; }
    else { e.px += (dx / d) * step; e.py += (dy / d) * step; }
  }

  // ----- 플레이어 스텝 -----
  function stepPlayer(dt) {
    const p = S.player;

    // 이동 중에도 방향 입력에 즉각 반응 (딜레이 감소)
    if (p.target && (p.want.x || p.want.y)) {
      const reverse = p.want.x === -p.dir.x && p.want.y === -p.dir.y;
      if (reverse) {
        // 역방향: 즉시 뒤돌아 방금 지나온 칸으로
        const from = { x: p.target.x - p.dir.x, y: p.target.y - p.dir.y };
        p.dir = { ...p.want };
        p.target = from;
      } else if (p.want.x !== p.dir.x || p.want.y !== p.dir.y) {
        // 수직 방향: 중심 도달 직전이면 미리 턴(코너링)
        const dist = Math.hypot(p.target.x - p.px, p.target.y - p.py);
        if (dist <= TURN_TOL) {
          const nc = p.target.x + p.want.x, nr = p.target.y + p.want.y;
          if (passable(S.grid, nc, nr)) {
            p.px = p.target.x; p.py = p.target.y;
            const g0 = collectAt(S.grid, p.target.x, p.target.y);
            if (g0) handleCollect(g0);
            p.dir = { ...p.want };
            p.target = { x: nc, y: nr };
          }
        }
      }
    }

    if (!p.target) {
      let c = Math.round(p.px);
      let r = Math.round(p.py);
      p.px = c; p.py = r;

      // 수집
      const got = collectAt(S.grid, c, r);
      if (got) handleCollect(got);

      // 워프
      const w = maybeWarp(p, c, r);
      c = w.c; r = w.r;

      // 방향 결정 (+ 채굴)
      const dec = decidePlayer(c, r);
      if (dec.dig) {
        p.digCell = dec.dig;
        p.digTimer += dt;
        if (p.digTimer >= DIG_TIME) {
          dig(S.grid, dec.dig.c, dec.dig.r);
          S.score += 20; sfx.paddle();
          p.digTimer = 0; p.digCell = null;
        }
        return;
      }
      p.digTimer = 0; p.digCell = null;
      if (dec.dir) {
        p.dir = dec.dir;
        p.target = { x: c + dec.dir.x, y: r + dec.dir.y };
      } else {
        return; // 정지
      }
    }
    moveToward(p, dt, PLAYER_SPEED);
    if (p.dir.x) p.face = Math.sign(p.dir.x);
  }

  function decidePlayer(c, r) {
    // 누르는 동안만(want) 이동. 손을 떼면 want=0 → 정지.
    const w = S.player.want;
    if (w.x || w.y) {
      const nc = c + w.x, nr = r + w.y;
      if (passable(S.grid, nc, nr)) return { dir: { ...w } };
      if (isDiggable(S.grid, nc, nr)) return { dig: { c: nc, r: nr } };
    }
    return {};
  }

  // ----- 몬스터 스텝 -----
  function stepMonster(m, dt) {
    if (m.cooldown > 0) { m.cooldown -= dt; return; }
    if (!m.target) {
      let c = Math.round(m.px);
      let r = Math.round(m.py);
      m.px = c; m.py = r;
      const w = maybeWarp(m, c, r);
      c = w.c; r = w.r;
      const dir = pickMonsterDir(m, c, r);
      m.dir = dir;
      m.target = { x: c + dir.x, y: r + dir.y };
    }
    const speed = m.mode === 'fright' ? FRIGHT_SPEED : MON_SPEED;
    moveToward(m, dt, speed);
  }

  function pickMonsterDir(m, c, r) {
    const opts = [];
    for (const key in DIRS) {
      const d = DIRS[key];
      if (passable(S.grid, c + d.x, r + d.y)) opts.push(d);
    }
    // 후진 제외 (막다른 길이면 허용)
    const rev = { x: -m.dir.x, y: -m.dir.y };
    let choices = opts.filter((d) => !(d.x === rev.x && d.y === rev.y));
    if (choices.length === 0) choices = opts.length ? opts : [rev];

    const p = S.player;
    if (m.mode === 'fright') {
      // 플레이어에게서 멀어지는 방향
      return maxBy(choices, (d) => manhattan(c + d.x, r + d.y, p.px, p.py));
    }
    if (m.type === 'chase') {
      return minBy(choices, (d) => manhattan(c + d.x, r + d.y, p.px, p.py));
    }
    // 배회형: 랜덤
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // ----- 수집/충돌/파워 -----
  function handleCollect(type) {
    if (type === TILE.ORE) { S.score += 10; sfx.wall(); }
    else if (type === TILE.GEM) {
      S.score += 100; sfx.brick();
      if (gemsRemaining(S.grid) === 0) { S.mode = 'won'; sfx.win(); updateHint(); }
    } else if (type === TILE.POWER) {
      S.score += 50; sfx.paddle();
      S.frightTimer = FRIGHT_TIME; S.eatValue = 200;
      for (const m of S.monsters) if (m.cooldown <= 0) m.mode = 'fright';
    }
  }

  function checkCollisions() {
    const p = S.player;
    for (const m of S.monsters) {
      if (m.cooldown > 0) continue;
      if (Math.hypot(m.px - p.px, m.py - p.py) < EAT_DIST) {
        if (m.mode === 'fright') {
          m.px = m.spawnC; m.py = m.spawnR; m.target = null;
          m.mode = 'normal'; m.cooldown = 1.0;
          S.score += S.eatValue; S.eatValue *= 2; sfx.brick();
        } else {
          caught();
          return;
        }
      }
    }
  }

  function caught() {
    S.lives -= 1;
    sfx.lose();
    if (S.lives <= 0) { S.mode = 'lost'; updateHint(); }
    else { resetPositions(); S.respawnPause = 1.0; }
  }

  // ----- 업데이트 -----
  function update(dt) {
    dt = Math.min(dt, 0.033);
    S.anim += dt;

    if (S.mode !== 'playing') return;

    if (S.respawnPause > 0) { S.respawnPause -= dt; return; }

    if (S.frightTimer > 0) {
      S.frightTimer -= dt;
      if (S.frightTimer <= 0) for (const m of S.monsters) if (m.mode === 'fright') m.mode = 'normal';
    }

    stepPlayer(dt);
    for (const m of S.monsters) stepMonster(m, dt);
    checkCollisions();
  }

  // ----- 렌더 -----
  function geom() {
    const W = view.width;
    const H = view.height;
    const topR = H * 0.06;
    const botR = clamp(H * 0.26, 150, 230); // D-pad 공간
    const areaH = H - topR - botR;
    const cell = Math.floor(Math.min((W - 16) / S.cols, areaH / S.rows));
    const boardW = cell * S.cols;
    const boardH = cell * S.rows;
    const ox = Math.floor((W - boardW) / 2);
    const oy = Math.floor(topR + (areaH - boardH) / 2);
    return { W, H, cell, ox, oy, topR };
  }

  function draw(dt) {
    update(dt);
    const { ctx } = view;
    const g = geom();
    const { cell, ox, oy } = g;

    // 배경
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, g.W, g.H);

    // 타일
    for (let r = 0; r < S.rows; r++) {
      for (let c = 0; c < S.cols; c++) {
        const x = ox + c * cell;
        const y = oy + r * cell;
        const t = S.grid[r][c];
        if (t === TILE.WALL) drawWall(ctx, x, y, cell);
        else if (t === TILE.DIG) drawDig(ctx, x, y, cell, c, r);
        else if (t === TILE.ORE) drawDot(ctx, x + cell / 2, y + cell / 2, cell * 0.1, '#c8d0dd');
        else if (t === TILE.GEM) drawGem(ctx, x + cell / 2, y + cell / 2, cell * 0.32);
        else if (t === TILE.POWER) drawPower(ctx, x + cell / 2, y + cell / 2, cell * 0.26);
        else if (t === TILE.TUNNEL) { /* 어두운 통로: 그리지 않음 */ }
      }
    }

    drawPlayer(ctx, g);
    for (const m of S.monsters) drawMonster(ctx, m, g);
    drawHUD(ctx, g);
    if (S.mode !== 'playing') drawOverlay(ctx, g);
  }

  function drawWall(ctx, x, y, cell) {
    roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, cell * 0.18);
    const gr = ctx.createLinearGradient(x, y, x, y + cell);
    gr.addColorStop(0, '#3d4760');
    gr.addColorStop(1, '#242c3d');
    ctx.fillStyle = gr;
    ctx.fill();
  }

  function drawDig(ctx, x, y, cell, c, r) {
    roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, cell * 0.18);
    const gr = ctx.createLinearGradient(x, y, x, y + cell);
    gr.addColorStop(0, '#7a5a34');
    gr.addColorStop(1, '#4e3a20');
    ctx.fillStyle = gr;
    ctx.fill();
    // 금(crack)
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + cell * 0.3, y + cell * 0.2);
    ctx.lineTo(x + cell * 0.5, y + cell * 0.55);
    ctx.lineTo(x + cell * 0.4, y + cell * 0.8);
    ctx.stroke();
    // 파는 중 진행 표시
    const p = S.player;
    if (p.digCell && p.digCell.c === c && p.digCell.r === r) {
      ctx.fillStyle = 'rgba(255,220,120,0.5)';
      const prog = p.digTimer / DIG_TIME;
      ctx.fillRect(x + 2, y + cell - 5, (cell - 4) * prog, 3);
    }
  }

  function drawDot(ctx, cx, cy, r, color) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawGem(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    const pulse = 0.85 + 0.15 * Math.sin(S.anim * 4);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.7, 0);
    ctx.lineTo(0, s);
    ctx.lineTo(-s * 0.7, 0);
    ctx.closePath();
    const gr = ctx.createLinearGradient(-s, -s, s, s);
    gr.addColorStop(0, '#7ff0ff');
    gr.addColorStop(1, '#2aa9d6');
    ctx.fillStyle = gr;
    ctx.shadowColor = 'rgba(120,230,255,0.8)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }

  function drawPower(ctx, cx, cy, r) {
    const pulse = 0.8 + 0.2 * Math.sin(S.anim * 6);
    ctx.save();
    ctx.shadowColor = 'rgba(255,150,60,0.9)';
    ctx.shadowBlur = 12 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8a3d';
    ctx.fill();
    ctx.restore();
  }

  // 곡괭이 든 광부
  function drawPlayer(ctx, g) {
    const p = S.player;
    const { cell, ox, oy } = g;
    const cx = ox + (p.px + 0.5) * cell;
    const cy = oy + (p.py + 0.5) * cell;
    const s = cell * 0.5;
    const face = p.face || 1;
    const moving = (p.dir.x || p.dir.y) && !!p.target;
    const digging = !!p.digCell;
    // 곡괭이 스윙: 이동 중 or 채굴 중이면 흔들림
    const swing = digging
      ? Math.sin(S.anim * 22) * 0.7
      : moving
      ? Math.sin(S.anim * 12) * 0.5
      : -0.2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(face, 1); // 좌우 반전

    // 곡괭이 (머리 뒤에서 앞으로)
    ctx.save();
    ctx.translate(s * 0.1, -s * 0.15);
    ctx.rotate(swing - 0.5);
    ctx.strokeStyle = '#8a5a2b'; // 손잡이
    ctx.lineWidth = Math.max(2, s * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.25);
    ctx.lineTo(0, -s * 0.95);
    ctx.stroke();
    ctx.strokeStyle = '#cfd6e0'; // 금속 머리
    ctx.lineWidth = Math.max(2, s * 0.13);
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.78);
    ctx.quadraticCurveTo(0, -s * 1.12, s * 0.5, -s * 0.78);
    ctx.stroke();
    ctx.restore();

    // 몸통 (멜빵바지)
    roundRect(ctx, -s * 0.42, -s * 0.05, s * 0.84, s * 0.85, s * 0.2);
    ctx.fillStyle = '#3f6fb0';
    ctx.fill();

    // 머리
    ctx.beginPath();
    ctx.arc(0, -s * 0.35, s * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c69a';
    ctx.fill();

    // 헬멧 + 챙
    ctx.beginPath();
    ctx.arc(0, -s * 0.42, s * 0.46, Math.PI, 0);
    ctx.fillStyle = '#ffcc33';
    ctx.fill();
    ctx.fillRect(-s * 0.5, -s * 0.46, s * 1.0, s * 0.12);

    // 랜턴 불빛
    ctx.save();
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.5, s * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = '#fff6c0';
    ctx.shadowColor = 'rgba(255,240,150,0.9)';
    ctx.shadowBlur = s * 0.6;
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // 귀여운 몬스터: 추적형=빨강 외눈+뿔, 배회형=청록 두눈+더듬이. 겁먹으면 파랑.
  function drawMonster(ctx, m, g) {
    const { cell, ox, oy } = g;
    const cx = ox + (m.px + 0.5) * cell;
    const cy = oy + (m.py + 0.5) * cell;
    const r = cell * 0.44;
    const chase = m.type === 'chase';
    let body = chase ? '#ff6b5a' : '#3fb6a8';
    let dark = chase ? '#d84a3a' : '#2c8f84';
    if (m.mode === 'fright') {
      const blink = S.frightTimer < 2 && Math.floor(S.frightTimer * 6) % 2 === 0;
      body = blink ? '#e6ebff' : '#5570ff';
      dark = blink ? '#c3cdf0' : '#3a52d6';
    }
    if (m.cooldown > 0) { body = 'rgba(150,160,190,0.4)'; dark = 'rgba(150,160,190,0.4)'; }

    const wob = Math.sin(S.anim * 6 + m.px * 1.3) * r * 0.06; // 통통 튀는 느낌
    ctx.save();
    ctx.translate(cx, cy + wob);

    // 뿔(추적형) / 더듬이(배회형)
    if (m.mode !== 'fright' && m.cooldown <= 0) {
      if (chase) {
        ctx.fillStyle = dark;
        tri(ctx, -r * 0.55, -r * 0.5, -r * 0.18, -r * 1.15, -r * 0.05, -r * 0.6);
        tri(ctx, r * 0.55, -r * 0.5, r * 0.18, -r * 1.15, r * 0.05, -r * 0.6);
      } else {
        ctx.strokeStyle = dark;
        ctx.lineWidth = Math.max(1.5, r * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.75); ctx.lineTo(-r * 0.5, -r * 1.2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.75); ctx.lineTo(r * 0.5, -r * 1.2); ctx.stroke();
        drawDot(ctx, -r * 0.5, -r * 1.22, r * 0.13, dark);
        drawDot(ctx, r * 0.5, -r * 1.22, r * 0.13, dark);
      }
    }

    // 팔
    ctx.strokeStyle = body;
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.lineCap = 'round';
    const arm = Math.sin(S.anim * 8 + m.px) * r * 0.25;
    ctx.beginPath(); ctx.moveTo(-r * 0.8, r * 0.15); ctx.lineTo(-r * 1.12, -r * 0.05 - arm); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.8, r * 0.15); ctx.lineTo(r * 1.12, -r * 0.05 + arm); ctx.stroke();

    // 몸통
    drawDot(ctx, 0, 0, r, body);

    // 눈
    const lx = (m.dir.x || 0) * r * 0.12;
    const ly = (m.dir.y || 0) * r * 0.12;
    if (chase) {
      drawDot(ctx, 0, -r * 0.05, r * 0.5, '#fff');
      drawDot(ctx, lx, -r * 0.05 + ly, r * 0.22, '#1a2233');
    } else {
      drawDot(ctx, -r * 0.34, -r * 0.05, r * 0.3, '#fff');
      drawDot(ctx, r * 0.34, -r * 0.05, r * 0.3, '#fff');
      drawDot(ctx, -r * 0.34 + lx, -r * 0.05 + ly, r * 0.14, '#1a2233');
      drawDot(ctx, r * 0.34 + lx, -r * 0.05 + ly, r * 0.14, '#1a2233');
    }

    // 입
    if (m.mode === 'fright') {
      ctx.strokeStyle = '#1a2233';
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const xx = -r * 0.4 + i * r * 0.2;
        const yy = r * 0.45 + (i % 2 ? -r * 0.08 : r * 0.08);
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#7a1f1f';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.3, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.17, r * 0.33, r * 0.1, r * 0.11);
      ctx.fillRect(r * 0.07, r * 0.33, r * 0.1, r * 0.11);
    }

    ctx.restore();
  }

  function drawHUD(ctx, g) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `700 ${Math.floor(g.topR * 0.7)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`점수 ${S.score}`, 12, g.topR / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7ff0ff';
    ctx.fillText(`💎 ${gemsRemaining(S.grid)}`, g.W / 2, g.topR / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe066';
    ctx.fillText('♥'.repeat(Math.max(0, S.lives)), g.W - 12, g.topR / 2);
  }

  function drawOverlay(ctx, g) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,9,14,0.6)';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let title = '', sub = '';
    if (S.mode === 'ready') { title = '광산 채굴'; sub = '방향 버튼으로 시작 · 보석 💎 을 모두 캐세요'; }
    else if (S.mode === 'won') { title = '🎉 클리어!'; sub = `점수 ${S.score} · 탭해서 다시 시작`; }
    else { title = '게임 오버'; sub = `점수 ${S.score} · 탭해서 다시 시작`; }
    ctx.fillStyle = S.mode === 'lost' ? '#ff8a8a' : '#ffd86b';
    ctx.font = `800 ${Math.floor(g.W * 0.08)}px sans-serif`;
    ctx.fillText(title, g.W / 2, g.H * 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `500 ${Math.floor(g.W * 0.032)}px sans-serif`;
    ctx.fillText(sub, g.W / 2, g.H * 0.4 + g.W * 0.07);
    ctx.restore();
  }

  function updateHint() {
    hint.textContent =
      S.mode === 'playing'
        ? '누르는 동안 이동(떼면 멈춤) · 갈색 벽은 눌러서 파기 · 다이너마이트로 몬스터 역공!'
        : '▲◀▶▼ 또는 방향키로 조종합니다.';
  }

  // ----- D-pad -----
  const dpad = el('div', 'dpad');
  function padButton(cls, label, dir) {
    const b = el('div', 'pad ' + cls);
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resumeAudio();
      pressDir(dir);
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('active');
    });
    const release = () => { b.classList.remove('active'); releaseDir(dir); };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    return b;
  }
  dpad.append(
    padButton('up', '▲', DIRS.up),
    padButton('left', '◀', DIRS.left),
    padButton('right', '▶', DIRS.right),
    padButton('down', '▼', DIRS.down)
  );
  stage.append(dpad);

  // ----- 탭(캔버스): 재시작 -----
  function onCanvasPointerDown() {
    resumeAudio();
    if (S.mode === 'won' || S.mode === 'lost') resetGame();
  }

  // ----- 키보드 -----
  const KEYMAP = {
    ArrowUp: DIRS.up, ArrowDown: DIRS.down, ArrowLeft: DIRS.left, ArrowRight: DIRS.right,
    w: DIRS.up, s: DIRS.down, a: DIRS.left, d: DIRS.right,
  };
  function onKeyDown(e) {
    if (KEYMAP[e.key]) { e.preventDefault(); if (!e.repeat) pressDir(KEYMAP[e.key]); }
    else if ((e.key === 'Enter' || e.key === ' ') && (S.mode === 'won' || S.mode === 'lost')) resetGame();
  }
  function onKeyUp(e) {
    if (KEYMAP[e.key]) releaseDir(KEYMAP[e.key]);
  }

  // ----- 시작 -----
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onCanvasPointerDown);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  resetGame();
  const loop = createLoop(draw);
  loop.start();

  // ----- unmount -----
  return function unmount() {
    loop.stop();
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
function spacer() { return el('div', 'spacer'); }
function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }
function tri(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}
function minBy(arr, fn) { let best = arr[0], bv = Infinity; for (const a of arr) { const v = fn(a); if (v < bv) { bv = v; best = a; } } return best; }
function maxBy(arr, fn) { let best = arr[0], bv = -Infinity; for (const a of arr) { const v = fn(a); if (v > bv) { bv = v; best = a; } } return best; }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
