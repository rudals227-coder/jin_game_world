// 덧셈 관문 — 게임 허브에 들어가기 전 덧셈 5문제를 풀어야 통과.
//   문제 유형(랜덤): 한자리+한자리 / 두자리+한자리 / 두자리+두자리 / 두자리+한자리+한자리
//   하나 맞히면 다음 문제, 5개 다 맞히면 폭죽 → onPass() 호출로 허브 진입.
//   필기 노트: 손가락/펜슬로 숫자를 써서 계산 연습(펜·지우개·전체지우기).
// 계약: mountGate(container, onPass) → unmount()  (라우터가 정리 시 호출)
import { sfx, resumeAudio } from '../engine/audio.js';

const N = 5; // 문제 개수

export function mountGate(container, onPass) {
  const problems = makeProblems(N);
  let idx = 0;      // 현재 문제 번호
  let typed = '';   // 입력 중인 답
  let locked = false; // 정답 처리 애니메이션 동안 입력 잠금
  let finished = false;
  let raf = 0;
  const timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

  const root = el('div', 'mgate');
  container.appendChild(root);

  const card = el('div', 'mgate-card');
  const title = el('div', 'mgate-title');
  title.textContent = '🎮 덧셈 5문제를 풀면 게임 시작!';
  const dots = el('div', 'mgate-dots');
  const dotEls = [];
  for (let i = 0; i < N; i++) { const d = el('span', 'dot'); dots.appendChild(d); dotEls.push(d); }
  const count = el('div', 'mgate-count');
  const q = el('div', 'mgate-q');       // 문제식 (항이 가변이라 refresh에서 다시 그림)
  const ansBox = el('span', 'mgate-ans');
  const note = buildNote();             // 필기 노트(연습장)
  const pad = buildPad(onKey);
  // 좌우 2단: 왼쪽=문제/답/숫자패드, 오른쪽=큰 연습장
  const left = el('div', 'mgate-left');
  left.append(title, dots, count, q, pad);
  const right = el('div', 'mgate-right');
  right.append(note.wrap);
  card.append(left, right);
  root.appendChild(card);

  window.addEventListener('keydown', onKeyDown);
  refresh();

  // ----- 문제 표시 갱신 -----
  function refresh() {
    const p = problems[idx];
    q.innerHTML = '';
    p.terms.forEach((n, i) => {
      if (i > 0) { const op = el('span', 'op'); op.textContent = '+'; q.appendChild(op); }
      const b = el('b'); b.textContent = n; q.appendChild(b);
    });
    const eq = el('span', 'op'); eq.textContent = '='; q.appendChild(eq);
    q.appendChild(ansBox);
    count.textContent = `${idx + 1} / ${N}`;
    dotEls.forEach((d, i) => {
      d.className = 'dot' + (i < idx ? ' on' : i === idx ? ' cur' : '');
    });
    setTyped('');
    note.clear(); // 새 문제 → 노트 비우기
  }
  function setTyped(v) { typed = v; ansBox.textContent = typed === '' ? '?' : typed; }

  // ----- 입력 -----
  function onKey(k) {
    if (locked || finished) return;
    resumeAudio();
    if (k === 'back') { if (typed) setTyped(typed.slice(0, -1)); return; }
    if (k === 'ok') { submit(); return; }
    if (typed.length >= 4) return;            // 최대 4자리(세 항 합도 커버)
    if (typed === '' && k === '0') return;    // 선행 0 방지
    setTyped(typed + k);
  }
  function onKeyDown(e) {
    if (e.key >= '0' && e.key <= '9') { onKey(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { onKey('back'); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === '=') { onKey('ok'); e.preventDefault(); }
  }

  function submit() {
    if (typed === '') return;
    const p = problems[idx];
    if (Number(typed) === p.ans) {
      locked = true;
      sfx.win?.();
      card.classList.add('correct');
      dotEls[idx].classList.remove('cur'); dotEls[idx].classList.add('on');
      later(() => {
        card.classList.remove('correct');
        idx++;
        if (idx >= N) success();
        else { locked = false; refresh(); }
      }, 480);
    } else {
      sfx.lose?.();
      card.classList.remove('wrong'); void card.offsetWidth; // 리플로우로 애니메이션 재시작
      card.classList.add('wrong');
      setTyped('');
    }
  }

  // ----- 성공: 폭죽 → 허브 -----
  function success() {
    finished = true;
    note.destroy();
    root.classList.add('win');
    root.innerHTML = '';
    const fw = el('canvas', 'mgate-fw');
    const msg = el('div', 'mgate-win-msg');
    msg.innerHTML = '<div class="big">성공! 🎉</div><div class="sub">5문제 모두 맞았어요 · 게임 시작!</div>';
    root.append(fw, msg);
    sfx.win?.();
    runFireworks(fw);
    // 잠시 폭죽을 보여준 뒤 허브로 (탭하면 즉시 이동)
    const go = () => { root.removeEventListener('pointerdown', go); onPass(); };
    later(go, 2600);
    root.addEventListener('pointerdown', go);
  }

  // 폭죽 파티클 애니메이션
  function runFireworks(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const r = root.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const parts = [];
    const colors = ['#ff5a5a', '#ffd84d', '#4dd2e6', '#4f8cff', '#b06cf0', '#5ee08a', '#ff8ad6'];
    let seed = 1;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    function burst(x, y) {
      const c = colors[Math.floor(rand() * colors.length)];
      const n = 26 + Math.floor(rand() * 18);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.3;
        const sp = 70 + rand() * 170;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c, r: 2 + rand() * 2 });
      }
    }
    let last = 0;
    function frame(ts) {
      if (!last) last = ts;
      const dt = Math.min(0.033, (ts - last) / 1000); last = ts;
      if (parts.length < 500 && rand() < dt * 6) burst(W * (0.15 + rand() * 0.7), H * (0.15 + rand() * 0.4));
      ctx.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 220 * dt;           // 중력
        p.vx *= 0.99; p.vy *= 0.99; // 공기저항
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt * 0.9;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    for (let i = 0; i < 4; i++) burst(W * (0.2 + rand() * 0.6), H * (0.2 + rand() * 0.3));
    raf = requestAnimationFrame(frame);
  }

  return function unmount() {
    if (raf) cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', onKeyDown);
    note.destroy();
    root.remove();
  };
}

// ---------- 필기 노트 (펜/지우개/전체지우기) ----------
function buildNote() {
  const wrap = el('div', 'mgate-note');
  const tools = el('div', 'note-tools');
  const lab = el('span', 'note-lab'); lab.textContent = '✏️ 연습장';
  const penBtn = toolBtn('펜', 'pen active');
  const eraBtn = toolBtn('지우개', 'era');
  const clrBtn = toolBtn('전체 지우기', 'clr');
  tools.append(lab, spacerEl(), penBtn, eraBtn, clrBtn);
  const canvas = el('canvas', 'note-canvas');
  wrap.append(tools, canvas);

  const ctx = canvas.getContext('2d');
  let dpr = 1, W = 0, H = 0, eraser = false, drawing = false, lastX = 0, lastY = 0, pid = null;

  function fit() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function apply() {
    if (eraser) { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 26; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#20252e'; ctx.lineWidth = 3.2; }
  }
  function dot(x, y) {
    apply();
    ctx.beginPath();
    ctx.arc(x, y, (eraser ? 13 : 1.7), 0, Math.PI * 2);
    if (eraser) { ctx.fill(); } // destination-out fill = 지움
    else { ctx.fillStyle = '#20252e'; ctx.fill(); }
  }
  function seg(x1, y1, x2, y2) {
    apply();
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function down(e) {
    e.preventDefault();
    if (!W) fit();
    drawing = true; pid = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    const p = pos(e); lastX = p.x; lastY = p.y; dot(p.x, p.y);
  }
  function move(e) {
    if (!drawing || e.pointerId !== pid) return;
    e.preventDefault();
    const p = pos(e); seg(lastX, lastY, p.x, p.y); lastX = p.x; lastY = p.y;
  }
  function up(e) {
    if (e.pointerId !== pid) return;
    drawing = false; pid = null;
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  penBtn.addEventListener('click', () => { eraser = false; penBtn.classList.add('active'); eraBtn.classList.remove('active'); });
  eraBtn.addEventListener('click', () => { eraser = true; eraBtn.classList.add('active'); penBtn.classList.remove('active'); });
  clrBtn.addEventListener('click', () => clear());

  function clear() {
    if (!W) { fit(); if (!W) return; }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
  }
  const onResize = () => { const prev = W; fit(); if (prev) clear(); };
  window.addEventListener('resize', onResize);
  // 레이아웃 완료 후 최초 fit
  requestAnimationFrame(fit);

  return {
    wrap,
    clear,
    destroy() {
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    },
  };
}

function toolBtn(label, cls) {
  const b = document.createElement('button');
  b.className = 'note-tool ' + cls;
  b.textContent = label;
  return b;
}
function spacerEl() { return el('span', 'note-spacer'); }

// 숫자패드 (3x4): 1-9, ⌫, 0, 확인
function buildPad(onKey) {
  const pad = el('div', 'mgate-pad');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
  for (const k of keys) {
    const b = document.createElement('button');
    b.className = 'mkey' + (k === 'ok' ? ' ok' : k === 'back' ? ' back' : '');
    b.textContent = k === 'back' ? '⌫' : k === 'ok' ? '확인' : k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); onKey(k); });
    pad.appendChild(b);
  }
  return pad;
}

// 문제 5개 생성 — 네 유형에서 랜덤
function makeProblems(n) {
  // s: 1+1 / m: 2+1 / l: 2+2 / t: 2+1+1(세 항)
  const types = ['s', 'm', 'l', 't'];
  const rnd = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    let terms;
    if (t === 's') terms = [rnd(1, 9), rnd(1, 9)];
    else if (t === 'm') terms = [rnd(10, 99), rnd(1, 9)];
    else if (t === 'l') terms = [rnd(10, 99), rnd(10, 99)];
    else terms = [rnd(10, 99), rnd(1, 9), rnd(1, 9)];
    out.push({ terms, ans: terms.reduce((a, b) => a + b, 0) });
  }
  return out;
}

function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
