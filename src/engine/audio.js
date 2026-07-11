// 효과음 엔진. Web Audio API로 소리를 실시간 합성한다 (외부 음원 파일 없음).
// iOS Safari는 사용자 제스처 후에만 오디오가 울리므로, 첫 입력에서 resumeAudio()를 호출할 것.
const STORAGE_KEY = 'jgw.muted';
let ctx = null;
let muted = localStorage.getItem(STORAGE_KEY) === '1';

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

// 사용자 제스처(첫 탭)에서 호출 → iOS/Safari 오디오 잠금 해제.
export function resumeAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
}

export function isMuted() {
  return muted;
}
export function setMuted(v) {
  muted = !!v;
  localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  if (muted) stopThrust(); // 음소거 시 지속음 즉시 정지
}

// 단일 톤 (엔벨로프 포함). freq→slideTo 로 피치 슬라이드 가능.
function tone({ freq, dur = 0.1, type = 'square', gain = 0.18, slideTo, delay = 0 }) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function chord(notes, opts = {}) {
  notes.forEach((n, i) => tone({ freq: n, delay: i * (opts.stagger ?? 0.09), ...opts }));
}

// 게임에서 쓰는 효과음 모음.
export const sfx = {
  // 벽돌깨기
  paddle: () => tone({ freq: 240, slideTo: 360, dur: 0.08, type: 'square', gain: 0.16 }),
  wall: () => tone({ freq: 180, dur: 0.05, type: 'sine', gain: 0.12 }),
  brick: () => tone({ freq: 520, slideTo: 700, dur: 0.07, type: 'square', gain: 0.14 }),
  lose: () => tone({ freq: 300, slideTo: 70, dur: 0.45, type: 'sawtooth', gain: 0.18 }),
  win: () => chord([523, 659, 784, 1047], { dur: 0.18, type: 'triangle', gain: 0.16, stagger: 0.1 }),
  // 쿤판(슬라이드)
  slide: () => tone({ freq: 150, slideTo: 120, dur: 0.05, type: 'sine', gain: 0.1 }),
  place: () => tone({ freq: 330, dur: 0.05, type: 'triangle', gain: 0.12 }),
};

// 지속되는 분사(로켓) 소리 — 필터링된 화이트 노이즈 루프. startThrust/stopThrust 로 제어.
let thrustNode = null;
export function startThrust() {
  if (muted) return;
  const c = getCtx();
  if (!c || thrustNode) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.4), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 480;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.13, c.currentTime + 0.04);
  src.connect(lp).connect(g).connect(c.destination);
  src.start();
  thrustNode = { src, g };
}
export function stopThrust() {
  if (!thrustNode) return;
  const c = getCtx();
  const { src, g } = thrustNode;
  try {
    g.gain.cancelScheduledValues(c.currentTime);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
    src.stop(c.currentTime + 0.12);
  } catch (e) {
    /* 이미 정지됨 */
  }
  thrustNode = null;
}

// 음소거 토글 버튼(🔊/🔇). 게임 상단바에 넣어 재사용.
export function createMuteButton() {
  const b = document.createElement('button');
  b.className = 'toggle';
  b.setAttribute('aria-label', '소리 켜기/끄기');
  const sync = () => (b.textContent = muted ? '🔇' : '🔊');
  sync();
  b.addEventListener('click', () => {
    setMuted(!muted);
    sync();
    if (!muted) resumeAudio();
  });
  return b;
}
