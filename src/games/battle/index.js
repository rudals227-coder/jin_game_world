// 배틀 아레나 — 실시간 탑뷰 1:1 로컬 대전. 게임 계약: mount(container) → unmount().
// 한 아이패드를 두 명이 마주보고: 1P(하단)·2P(상단, 180° 반대). 각자 조이스틱(이동)+공격 버튼.
//   조이스틱은 화면좌표 그대로 매핑 → 마주본 구도에서 물리 회전으로 자연스럽게 방향이 맞음(별도 반전 불필요).
// 승부: 3판 2선승. 캐릭터는 첫 선택 고정. 공격은 쿨다운 있는 단발(사거리 내 상대에게 즉시 판정/투사체).
// 모델: characters.js(캐릭터·판정, 순수). 이 파일은 뷰 + 실시간 물리 + 턴/라운드 진행.
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import { CHARACTERS, getCharacter, resolveHit } from './characters.js';

const WIN_ROUNDS = 2;       // 2선승
const HANDICAP_BONUS = 1.4; // 어린 쪽 최대 체력 배수
const PR = 24;              // 캐릭터 반경
const FONT = "'Segoe Print','Bradley Hand','Comic Sans MS','Nanum Pen Script',sans-serif";
const INK = '#3a3226';
const PAPER = '#f4ecd8';

export function mount(container) {
  const screen = el('div', 'game-screen battle-screen');
  const topbar = el('div', 'game-topbar');
  const stage = el('div', 'game-stage');
  topbar.append(
    button('← 허브', () => (location.hash = '#/')),
    spacer(),
    createMuteButton(),
    button('새 대결', () => startFlow())
  );
  screen.append(topbar, stage);
  container.appendChild(screen);

  let view;

  const S = {
    phase: 'handicap',   // handicap | select | countdown | play | roundover | matchover
    handicap: -1,        // 체력 보너스 받는 플레이어 인덱스(0/1), -1=없음
    picks: [null, null], // 각 플레이어가 고른 캐릭터 id
    score: [0, 0],
    round: 1,
    players: [],         // 라운드별 전투 상태
    obstacles: [],
    projectiles: [],
    texts: [],           // 떠오르는 판정/데미지 텍스트
    particles: [],
    countdown: 0,
    roundWinner: -1,
    overT: 0,            // roundover 자동 진행 타이머
    time: 0,
  };

  // ----- 컨트롤 배치(화면 코너) -----
  const JOY_R = 62, KNOB_R = 30, ATK_R = 46, MARGIN = 22;
  function layout() {
    const W = view.width, H = view.height;
    return {
      W, H,
      arena: { x: 12, y: 12, w: W - 24, h: H - 24 },
      joy: [
        { x: MARGIN + JOY_R, y: H - MARGIN - JOY_R },   // 1P 좌하단
        { x: W - MARGIN - JOY_R, y: MARGIN + JOY_R },   // 2P 우상단
      ],
      atk: [
        { x: W - MARGIN - ATK_R, y: H - MARGIN - ATK_R }, // 1P 우하단
        { x: MARGIN + ATK_R, y: MARGIN + ATK_R },         // 2P 좌상단
      ],
    };
  }

  // ================= 라운드 셋업 =================
  function newObstacles() {
    const L = layout();
    const A = L.arena;
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    const obs = [];
    const add = (x, y, w, h) => obs.push({ x: x - w / 2, y: y - h / 2, w, h, hp: 3, maxHp: 3 });
    // 중앙 + 대칭 배치(양쪽 공평하게). 아레나 크기에 비례.
    add(cx, cy, 74, 26);
    const ox = A.w * 0.24, oy = A.h * 0.2;
    add(cx - ox, cy - oy, 30, 64);
    add(cx + ox, cy + oy, 30, 64);
    add(cx - ox, cy + oy, 54, 26);
    add(cx + ox, cy - oy, 54, 26);
    S.obstacles = obs;
  }

  function startRound() {
    const L = layout();
    const A = L.arena;
    S.players = [0, 1].map((i) => {
      const ch = getCharacter(S.picks[i]);
      const maxHp = Math.round(ch.maxHp * (S.handicap === i ? HANDICAP_BONUS : 1));
      return {
        char: ch, i, maxHp, hp: maxHp,
        x: A.x + A.w / 2, y: i === 0 ? A.y + A.h - 70 : A.y + 70,
        vx: 0, vy: 0, face: i === 0 ? -Math.PI / 2 : Math.PI / 2,
        cd: 0, hitFlash: 0, shake: 0, lunge: 0, dead: false,
        joy: { ax: 0, ay: 0 }, // 조이스틱 입력(-1..1)
      };
    });
    S.obstacles = [];
    newObstacles();
    S.projectiles = [];
    S.texts = [];
    S.particles = [];
    S.roundWinner = -1;
    S.countdown = 2.6;
    S.phase = 'countdown';
    clearOverlay();
    setHint(`라운드 ${S.round} · 먼저 상대 체력을 0으로!`);
  }

  // ================= 입력(멀티터치) =================
  const pointers = new Map(); // pointerId → { kind:'joy'|'atk', p:0|1 }
  function canvasPoint(e) {
    const r = view.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onDown(e) {
    if (S.phase !== 'play') return;
    resumeAudio();
    const cp = canvasPoint(e);
    const L = layout();
    for (let i = 0; i < 2; i++) {
      if (dist(cp, L.joy[i]) <= JOY_R + 26) {
        pointers.set(e.pointerId, { kind: 'joy', p: i });
        updateJoy(i, cp, L);
        view.canvas.setPointerCapture?.(e.pointerId);
        return;
      }
    }
    for (let i = 0; i < 2; i++) {
      if (dist(cp, L.atk[i]) <= ATK_R + 12) {
        pointers.set(e.pointerId, { kind: 'atk', p: i });
        attack(i);
        view.canvas.setPointerCapture?.(e.pointerId);
        return;
      }
    }
  }
  function onMove(e) {
    const ctrl = pointers.get(e.pointerId);
    if (!ctrl || ctrl.kind !== 'joy') return;
    updateJoy(ctrl.p, canvasPoint(e), layout());
  }
  function onUp(e) {
    const ctrl = pointers.get(e.pointerId);
    if (ctrl && ctrl.kind === 'joy' && S.players[ctrl.p]) {
      S.players[ctrl.p].joy.ax = 0; S.players[ctrl.p].joy.ay = 0;
    }
    pointers.delete(e.pointerId);
  }
  function updateJoy(i, cp, L) {
    const pl = S.players[i]; if (!pl) return;
    let dx = cp.x - L.joy[i].x, dy = cp.y - L.joy[i].y;
    const m = Math.hypot(dx, dy) || 1;
    const cl = Math.min(1, m / JOY_R);
    pl.joy.ax = (dx / m) * cl;
    pl.joy.ay = (dy / m) * cl;
  }

  // ================= 전투 =================
  function attack(i) {
    const me = S.players[i], foe = S.players[1 - i];
    if (!me || me.dead || me.cd > 0) return;
    me.cd = me.char.cooldown;
    me.face = Math.atan2(foe.y - me.y, foe.x - me.x);
    sfx.paddle?.();
    if (me.char.melee) {
      me.lunge = 0.18;
      const d = dist(me, foe);
      if (d <= me.char.range + PR) {
        const covered = segmentBlocked(me, foe);
        applyResult(me, foe, resolveHit(me.char, { covered }));
      } else {
        // 헛스윙
        pushText((me.x + foe.x === 0 ? me.x : me.x), me.y - PR - 10, '빗나감!', '#9a8f7a');
      }
    } else {
      // 투사체: 상대 현재 위치로 직선 발사
      const a = me.char.projectile;
      const ang = Math.atan2(foe.y - me.y, foe.x - me.x);
      S.projectiles.push({
        owner: i, char: me.char, x: me.x + Math.cos(ang) * (PR + 4), y: me.y + Math.sin(ang) * (PR + 4),
        vx: Math.cos(ang) * a.speed, vy: Math.sin(ang) * a.speed,
        r: a.r, travelled: 0, dead: false,
      });
    }
  }

  function applyResult(atk, def, res) {
    if (res.result === 'miss') {
      pushText(def.x, def.y - PR - 10, '빗나감!', '#9a8f7a');
      return;
    }
    def.hp = Math.max(0, def.hp - res.damage);
    def.hitFlash = 0.35; def.shake = 8;
    const crit = res.result === 'crit';
    pushText(atk.x, atk.y - PR - 14, crit ? '크리티컬!' : '명중!', crit ? '#e0563f' : INK, crit ? 26 : 20);
    pushText(def.x, def.y - PR - 8, `-${res.damage}`, crit ? '#e0563f' : '#c0472f', crit ? 30 : 22);
    burst(def.x, def.y, crit ? '#ffd24a' : '#ff9a6b', crit ? 18 : 12);
    sfx.brick?.();
    if (def.hp <= 0) killPlayer(def);
  }

  function killPlayer(pl) {
    pl.dead = true;
    burst(pl.x, pl.y, '#e0563f', 30);
    endRound(1 - pl.i);
  }

  // 투사체/근접 물리
  function stepCombat(dt) {
    for (const pr of S.projectiles) {
      if (pr.dead) continue;
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
      pr.travelled += Math.hypot(nx - pr.x, ny - pr.y);
      pr.x = nx; pr.y = ny;
      const foe = S.players[1 - pr.owner];
      // 엄폐물 충돌(마법사는 관통)
      if (!pr.char.projectile.pierceCover) {
        for (const o of S.obstacles) {
          if (pointInRect(pr.x, pr.y, o)) {
            o.hp -= 1; burst(pr.x, pr.y, '#b79b6b', 8);
            if (o.hp <= 0) burst(o.x + o.w / 2, o.y + o.h / 2, '#b79b6b', 16);
            pr.dead = true; break;
          }
        }
        if (pr.dead) continue;
      }
      // 상대 명중
      if (foe && !foe.dead && dist(pr, foe) <= PR + pr.r) {
        explodeProjectile(pr, foe);
        continue;
      }
      // 사거리 초과 / 화면 밖
      const A = layout().arena;
      if (pr.travelled > pr.char.range || pr.x < A.x - 20 || pr.x > A.x + A.w + 20 || pr.y < A.y - 20 || pr.y > A.y + A.h + 20) {
        if (pr.char.projectile.aoe) explodeProjectile(pr, foe, true);
        else pr.dead = true;
      }
    }
    S.projectiles = S.projectiles.filter((p) => !p.dead);
    S.obstacles = S.obstacles.filter((o) => o.hp > 0);
  }

  function explodeProjectile(pr, foe, endOnly) {
    pr.dead = true;
    const aoe = pr.char.projectile.aoe;
    if (aoe) {
      burst(pr.x, pr.y, '#7db4ff', 20);
      if (foe && !foe.dead && dist(pr, foe) <= aoe + PR) {
        applyResult(S.players[pr.owner], foe, resolveHit(pr.char, { covered: false }));
      }
    } else if (!endOnly && foe && !foe.dead) {
      applyResult(S.players[pr.owner], foe, resolveHit(pr.char, { covered: false }));
    }
  }

  // ================= 이동/충돌 =================
  function stepMove(dt) {
    const A = layout().arena;
    for (const pl of S.players) {
      if (pl.dead) continue;
      if (pl.cd > 0) pl.cd = Math.max(0, pl.cd - dt);
      if (pl.hitFlash > 0) pl.hitFlash = Math.max(0, pl.hitFlash - dt);
      if (pl.shake > 0) pl.shake = Math.max(0, pl.shake - dt * 26);
      if (pl.lunge > 0) pl.lunge = Math.max(0, pl.lunge - dt);
      const sp = pl.char.speed;
      pl.x += pl.joy.ax * sp * dt;
      pl.y += pl.joy.ay * sp * dt;
      if (Math.hypot(pl.joy.ax, pl.joy.ay) > 0.15) pl.face = Math.atan2(pl.joy.ay, pl.joy.ax);
      // 아레나 경계
      pl.x = Math.max(A.x + PR, Math.min(A.x + A.w - PR, pl.x));
      pl.y = Math.max(A.y + PR, Math.min(A.y + A.h - PR, pl.y));
      // 엄폐물 밀어내기
      for (const o of S.obstacles) collideCircleRect(pl, o);
    }
    // 두 캐릭터 겹침 방지
    const [a, b] = S.players;
    if (a && b && !a.dead && !b.dead) {
      const d = dist(a, b), min = PR * 2;
      if (d < min && d > 0) {
        const nx = (a.x - b.x) / d, ny = (a.y - b.y) / d, push = (min - d) / 2;
        a.x += nx * push; a.y += ny * push; b.x -= nx * push; b.y -= ny * push;
      }
    }
  }

  function collideCircleRect(pl, o) {
    const cx = Math.max(o.x, Math.min(pl.x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(pl.y, o.y + o.h));
    const dx = pl.x - cx, dy = pl.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= PR * PR) return;
    const d = Math.sqrt(d2) || 0.001;
    const push = PR - d;
    pl.x += (dx / d) * push; pl.y += (dy / d) * push;
  }

  // ================= 라운드/매치 진행 =================
  function endRound(winner) {
    if (S.phase !== 'play') return;
    S.roundWinner = winner;
    S.score[winner] += 1;
    S.phase = 'roundover';
    S.overT = 2.4;
    if (S.score[winner] >= WIN_ROUNDS) sfx.win?.(); else sfx.lose?.();
    setHint(`P${winner + 1} 라운드 승리!`);
  }
  function advanceAfterRound() {
    if (S.score[0] >= WIN_ROUNDS || S.score[1] >= WIN_ROUNDS) { showMatchOver(); return; }
    S.round += 1;
    startRound();
  }

  // ================= 업데이트 =================
  function update(dt) {
    dt = Math.min(dt, 0.033);
    S.time += dt;
    stepTexts(dt); stepParticles(dt);
    if (S.phase === 'countdown') {
      S.countdown -= dt;
      if (S.countdown <= 0) { S.phase = 'play'; }
    } else if (S.phase === 'play') {
      stepMove(dt); stepCombat(dt);
    } else if (S.phase === 'roundover') {
      S.overT -= dt;
      if (S.overT <= 0) advanceAfterRound();
    }
  }

  // ================= 렌더 =================
  function draw(dt) {
    update(dt);
    const { ctx } = view;
    const L = layout();
    drawPaper(ctx, L);
    for (const o of S.obstacles) drawObstacle(ctx, o);
    if (S.players.length) {
      for (const pl of S.players) if (!pl.dead) drawPlayer(ctx, pl);
    }
    for (const pr of S.projectiles) drawProjectile(ctx, pr);
    drawParticles(ctx);
    drawTexts(ctx);
    if (S.phase !== 'handicap' && S.phase !== 'select') {
      drawControls(ctx, L);
      drawHudBars(ctx, L);
      drawScore(ctx, L);
    }
    if (S.phase === 'countdown') drawCountdown(ctx, L);
    if (S.phase === 'roundover') drawRoundOver(ctx, L);
  }

  function drawPaper(ctx, L) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, L.W, L.H);
    // 은은한 가로 괘선
    ctx.strokeStyle = 'rgba(120,90,60,0.10)'; ctx.lineWidth = 1;
    for (let y = 40; y < L.H; y += 34) line(ctx, 10, y, L.W - 10, y);
    // 연필 테두리 프레임
    ctx.strokeStyle = 'rgba(80,60,40,0.5)'; ctx.lineWidth = 3;
    sketchRect(ctx, L.arena.x, L.arena.y, L.arena.w, L.arena.h);
  }

  function drawObstacle(ctx, o) {
    ctx.save();
    ctx.translate(o.x, o.y);
    const dmg = 1 - o.hp / o.maxHp;
    ctx.fillStyle = `rgba(150,120,80,${0.35 + 0.15 * (1 - dmg)})`;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    sketchRect(ctx, 0, 0, o.w, o.h, true);
    // 크로스해치
    ctx.strokeStyle = 'rgba(80,60,40,0.35)'; ctx.lineWidth = 1;
    for (let x = 6; x < o.w; x += 9) line(ctx, x, 3, x - 6, o.h - 3);
    // 손상 금
    if (dmg > 0.33) { ctx.strokeStyle = 'rgba(60,40,25,0.7)'; ctx.lineWidth = 1.6; line(ctx, o.w * 0.3, 2, o.w * 0.5, o.h - 2); }
    if (dmg > 0.66) line(ctx, o.w * 0.7, 3, o.w * 0.45, o.h - 3);
    ctx.restore();
  }

  function drawPlayer(ctx, pl) {
    const sx = pl.shake ? (Math.random() * 2 - 1) * pl.shake : 0;
    const sy = pl.shake ? (Math.random() * 2 - 1) * pl.shake : 0;
    const lx = Math.cos(pl.face) * pl.lunge * 60, ly = Math.sin(pl.face) * pl.lunge * 60;
    ctx.save();
    ctx.translate(pl.x + sx + lx, pl.y + sy + ly);
    // 그림자
    ctx.fillStyle = 'rgba(60,45,30,0.18)';
    ctx.beginPath(); ctx.ellipse(0, PR - 2, PR * 0.9, PR * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    // 사거리 링(근접만, 은은하게)
    if (pl.char.melee) {
      ctx.strokeStyle = hexA(pl.char.color, 0.16); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, pl.char.range, 0, Math.PI * 2); ctx.stroke();
    }
    // 몸통(색 링 + 종이색 안)
    ctx.fillStyle = pl.hitFlash > 0 ? '#ff8a6b' : '#fbf6ea';
    ctx.strokeStyle = pl.char.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, PR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 방향 표시(작은 삼각)
    ctx.fillStyle = pl.char.color;
    ctx.save(); ctx.rotate(pl.face);
    ctx.beginPath(); ctx.moveTo(PR + 2, 0); ctx.lineTo(PR - 6, -6); ctx.lineTo(PR - 6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 이모지 얼굴
    ctx.font = `${PR * 1.35}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pl.char.emoji, 0, 1);
    ctx.restore();
    // 머리 위 물결 HP
    drawWavyHp(ctx, pl.x + sx, pl.y - PR - 14, 58, pl.hp / pl.maxHp, pl.char.color);
  }

  function drawProjectile(ctx, pr) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    if (pr.char.id === 'mage') {
      ctx.fillStyle = 'rgba(80,140,255,0.85)';
      ctx.shadowColor = 'rgba(90,150,255,0.9)'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(0, 0, pr.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#dceaff';
      ctx.beginPath(); ctx.arc(0, 0, pr.r * 0.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // 화살
      ctx.rotate(Math.atan2(pr.vy, pr.vx));
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      line(ctx, -10, 0, 8, 0);
      ctx.fillStyle = '#7a5a2a';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawControls(ctx, L) {
    for (let i = 0; i < 2; i++) {
      const c = L.joy[i], pl = S.players[i];
      const col = pl ? pl.char.color : '#8a7a5a';
      ctx.strokeStyle = hexA(col, 0.5); ctx.fillStyle = hexA(col, 0.08); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, JOY_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const kx = c.x + (pl ? pl.joy.ax : 0) * (JOY_R - KNOB_R);
      const ky = c.y + (pl ? pl.joy.ay : 0) * (JOY_R - KNOB_R);
      ctx.fillStyle = hexA(col, 0.85);
      ctx.beginPath(); ctx.arc(kx, ky, KNOB_R, 0, Math.PI * 2); ctx.fill();
      // 공격 버튼
      const a = L.atk[i];
      const ready = pl && pl.cd <= 0;
      ctx.fillStyle = ready ? hexA(col, 0.85) : hexA(col, 0.25);
      ctx.strokeStyle = hexA(col, 0.7); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(a.x, a.y, ATK_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(a.x, a.y); if (i === 1) ctx.rotate(Math.PI);
      ctx.fillStyle = ready ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.font = `800 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('공격', 0, 0);
      ctx.restore();
      // 쿨다운 원호
      if (pl && pl.cd > 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(a.x, a.y, ATK_R - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - pl.cd / pl.char.cooldown)); ctx.stroke();
      }
    }
  }

  // 각 플레이어 진영 가장자리 HP 바(이름 + 물결) — 2P는 180° 회전
  function drawHudBars(ctx, L) {
    for (let i = 0; i < 2; i++) {
      const pl = S.players[i]; if (!pl) continue;
      ctx.save();
      if (i === 0) ctx.translate(L.W / 2, L.H - 16);
      else { ctx.translate(L.W / 2, 16); ctx.rotate(Math.PI); }
      ctx.fillStyle = INK; ctx.font = `800 15px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const tag = `${pl.char.emoji} P${i + 1}` + (S.handicap === i ? ' ⭐' : '');
      ctx.fillText(`${tag}   ${Math.ceil(pl.hp)}/${pl.maxHp}`, 0, -8);
      drawWavyHp(ctx, -95, -4, 190, pl.hp / pl.maxHp, pl.char.color, 8);
      ctx.restore();
    }
  }

  function drawScore(ctx, L) {
    ctx.save();
    ctx.translate(L.W / 2, L.H / 2);
    ctx.fillStyle = 'rgba(80,60,40,0.5)';
    ctx.font = `800 14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${S.score[0]} : ${S.score[1]}   (R${S.round})`, 0, 0);
    ctx.restore();
  }

  function drawCountdown(ctx, L) {
    const n = Math.ceil(S.countdown);
    ctx.save();
    ctx.translate(L.W / 2, L.H / 2);
    ctx.fillStyle = 'rgba(244,236,216,0.6)';
    ctx.fillRect(-L.W / 2, -60, L.W, 120);
    ctx.fillStyle = INK; ctx.font = `900 84px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n > 0 ? String(n) : '시작!', 0, 0);
    ctx.restore();
  }

  function drawRoundOver(ctx, L) {
    const w = S.roundWinner;
    ctx.save();
    ctx.fillStyle = 'rgba(244,236,216,0.72)';
    ctx.fillRect(0, 0, L.W, L.H);
    for (const [oy, rot] of [[L.H * 0.32, 0], [L.H * 0.68, Math.PI]]) {
      ctx.save(); ctx.translate(L.W / 2, oy); ctx.rotate(rot);
      ctx.fillStyle = S.players[w].char.color; ctx.font = `900 40px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`P${w + 1} 라운드 승리! 🎉`, 0, -10);
      ctx.fillStyle = INK; ctx.font = `700 22px ${FONT}`;
      ctx.fillText(`${S.score[0]} : ${S.score[1]}`, 0, 26);
      ctx.restore();
    }
    ctx.restore();
  }

  // ----- 물결 HP 바 -----
  function drawWavyHp(ctx, x, y, w, ratio, color, h = 6) {
    ratio = Math.max(0, Math.min(1, ratio));
    const amp = h * 0.45, seg = 8;
    // 배경 트랙
    ctx.strokeStyle = 'rgba(80,60,40,0.25)'; ctx.lineWidth = h;
    ctx.lineCap = 'round';
    wavyLine(ctx, x, y, w, amp, seg);
    // 채움
    if (ratio > 0) {
      ctx.strokeStyle = ratio > 0.35 ? color : '#e0563f'; ctx.lineWidth = h;
      wavyLine(ctx, x, y, w * ratio, amp, seg);
    }
  }
  function wavyLine(ctx, x, y, w, amp, seg) {
    ctx.beginPath();
    for (let i = 0; i <= Math.max(1, Math.round(w / seg)); i++) {
      const px = x + i * seg;
      if (px > x + w) break;
      const py = y + Math.sin((px) * 0.35 + S.time * 4) * amp;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // ================= 텍스트/파티클 =================
  function pushText(x, y, text, color, size = 20) {
    S.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9, vy: -34 });
  }
  function stepTexts(dt) {
    for (const t of S.texts) { t.life -= dt; t.y += t.vy * dt; }
    S.texts = S.texts.filter((t) => t.life > 0);
  }
  function drawTexts(ctx) {
    for (const t of S.texts) {
      const a = Math.max(0, t.life / t.max);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = t.color; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
      ctx.font = `900 ${t.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 130 + 30;
      S.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.3, max: 0.7, r: 2 + Math.random() * 2.5, color });
    }
  }
  function stepParticles(dt) {
    for (const p of S.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    S.particles = S.particles.filter((p) => p.life > 0);
  }
  function drawParticles(ctx) {
    for (const p of S.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ================= DOM 오버레이(설정/결과) =================
  let overlay = null;
  function clearOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  function makeOverlay() {
    clearOverlay();
    overlay = el('div', 'battle-overlay');
    stage.appendChild(overlay);
    return overlay;
  }

  function startFlow() {
    S.score = [0, 0]; S.round = 1; S.handicap = -1; S.picks = [null, null];
    S.players = []; S.projectiles = []; S.obstacles = []; S.texts = []; S.particles = [];
    S.phase = 'handicap';
    showHandicap();
  }

  function showHandicap() {
    const ov = makeOverlay();
    const card = el('div', 'battle-card');
    card.innerHTML = `<h2>누가 더 어려워요?</h2><p>어린 쪽에게 체력을 조금 더 줄게요 (핸디캡).</p>`;
    const row = el('div', 'battle-btnrow');
    const opts = [
      { label: '1P가 어려워요', v: 0 },
      { label: '둘이 비슷해요', v: -1 },
      { label: '2P가 어려워요', v: 1 },
    ];
    for (const o of opts) {
      const b = el('button', 'battle-big');
      b.textContent = o.label;
      b.addEventListener('click', () => { S.handicap = o.v; showSelect(); });
      row.append(b);
    }
    card.append(row);
    ov.append(card);
    setHint('먼저 핸디캡을 정하세요.');
  }

  function showSelect() {
    S.phase = 'select';
    const ov = makeOverlay();
    ov.classList.add('battle-select');
    const ready = [false, false];
    const panels = [];
    for (let i = 0; i < 2; i++) {
      const panel = el('div', 'battle-panel' + (i === 1 ? ' flip' : ''));
      const h = el('div', 'battle-panel-title');
      h.textContent = `P${i + 1} 캐릭터 선택` + (S.handicap === i ? '  ⭐(+체력)' : '');
      const chars = el('div', 'battle-chars');
      const cardEls = [];
      for (const ch of CHARACTERS) {
        const c = el('button', 'battle-char');
        c.style.setProperty('--cc', ch.color);
        c.innerHTML = `<span class="ce">${ch.emoji}</span><span class="cn">${ch.name}</span>` +
          `<span class="cd">${ch.desc}</span>` +
          `<span class="cs">❤${ch.maxHp} · ⚔${ch.dmg} · 👟${ch.speed}</span>`;
        c.addEventListener('click', () => {
          S.picks[i] = ch.id;
          cardEls.forEach((e) => e.classList.remove('sel'));
          c.classList.add('sel');
          rbtn.disabled = false;
        });
        cardEls.push(c);
        chars.append(c);
      }
      const rbtn = el('button', 'battle-ready');
      rbtn.textContent = '준비 완료 ✓';
      rbtn.disabled = true;
      rbtn.addEventListener('click', () => {
        if (!S.picks[i]) return;
        ready[i] = true; rbtn.classList.add('on'); rbtn.textContent = '준비됨!';
        panel.classList.add('ready');
        if (ready[0] && ready[1]) { S.phase = 'countdown'; startRound(); }
      });
      panel.append(h, chars, rbtn);
      panels.push(panel);
      ov.append(panel);
    }
    setHint('각자 캐릭터를 고르고 “준비 완료”!');
  }

  function showMatchOver() {
    S.phase = 'matchover';
    const winner = S.score[0] >= WIN_ROUNDS ? 0 : 1;
    const ov = makeOverlay();
    for (const [cls, rot] of [['', false], ['flip', true]]) {
      const card = el('div', 'battle-card win ' + cls);
      card.innerHTML = `<h2 style="color:${S.players[winner].char.color}">P${winner + 1} 최종 승리! 🏆</h2>` +
        `<p>${S.players[0].char.emoji} ${S.score[0]} : ${S.score[1]} ${S.players[1].char.emoji}</p>`;
      const b = el('button', 'battle-big');
      b.textContent = '다시 대결';
      b.addEventListener('click', () => startFlow());
      card.append(b);
      ov.append(card);
    }
    setHint('대결 종료! “다시 대결”로 재시작.');
  }

  function setHint(t) { /* 힌트 영역 없음(전체화면). 필요시 확장 */ }

  // ================= 시작 =================
  view = createCanvas(stage);
  view.canvas.addEventListener('pointerdown', onDown);
  view.canvas.addEventListener('pointermove', onMove);
  view.canvas.addEventListener('pointerup', onUp);
  view.canvas.addEventListener('pointercancel', onUp);
  startFlow();
  const loop = createLoop(draw);
  loop.start();

  return function unmount() {
    loop.stop();
    view.canvas.removeEventListener('pointerdown', onDown);
    view.canvas.removeEventListener('pointermove', onMove);
    view.canvas.removeEventListener('pointerup', onUp);
    view.canvas.removeEventListener('pointercancel', onUp);
    clearOverlay();
    view.destroy();
    screen.remove();
  };

  // ---- 기하 헬퍼(클로저 밖 순수 계산은 아래 모듈 함수) ----
  function segmentBlocked(a, b) {
    for (const o of S.obstacles) if (segIntersectsRect(a.x, a.y, b.x, b.y, o)) return true;
    return false;
  }
}

// ---------- 모듈 헬퍼 ----------
function el(tag, className) { const n = document.createElement(tag); if (className) n.className = className; return n; }
function spacer() { return el('div', 'spacer'); }
function button(label, onClick) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', onClick); return b; }
function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function pointInRect(x, y, o) { return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h; }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// 손그림 느낌 사각형(살짝 흔들리는 선)
function sketchRect(ctx, x, y, w, h, fill) {
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}
// 선분 vs 사각형 교차
function segIntersectsRect(x1, y1, x2, y2, o) {
  if (pointInRect(x1, y1, o) || pointInRect(x2, y2, o)) return true;
  const edges = [
    [o.x, o.y, o.x + o.w, o.y],
    [o.x + o.w, o.y, o.x + o.w, o.y + o.h],
    [o.x + o.w, o.y + o.h, o.x, o.y + o.h],
    [o.x, o.y + o.h, o.x, o.y],
  ];
  for (const [ex1, ey1, ex2, ey2] of edges) if (segSeg(x1, y1, x2, y2, ex1, ey1, ex2, ey2)) return true;
  return false;
}
function segSeg(a, b, c, d, e, f, g, h) {
  const d1 = cross(g - e, h - f, a - e, b - f);
  const d2 = cross(g - e, h - f, c - e, d - f);
  const d3 = cross(c - a, d - b, e - a, f - b);
  const d4 = cross(c - a, d - b, g - a, h - b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
