// 포격 게임 지형 — 높이맵 기반 순수 모델(캔버스 비의존).
//   ground[x] = 해당 열(column)의 지표면 y. 값이 클수록 아래. 그 아래는 흙(solid).
//   파괴 = 지표면을 아래로 내림(값 증가), 흙쌓기 = 위로 올림(값 감소).
// 캔버스를 전혀 모르므로 단위 테스트가 쉽다.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 맵 프리셋 — 매 게임 랜덤 선택. base=지표면 기준 높이(화면 비율, 클수록 아래),
//   octaves/amp/freq*=사인파 굴곡, chasm=중앙 협곡, peaks=봉우리 개수, mesa=중앙 고원.
const PRESETS = [
  { name: '평원', base: 0.72, octaves: 2, amp: 0.045, freqBase: 0.7, freqRand: 1.0, freqStep: 0.9 },
  { name: '구릉', base: 0.60, octaves: 4, amp: 0.13, freqBase: 1.2, freqRand: 2.0, freqStep: 1.6 },
  { name: '험준한 협곡', base: 0.46, octaves: 4, amp: 0.16, freqBase: 1.8, freqRand: 2.6, freqStep: 2.0, chasm: true },
  { name: '봉우리', base: 0.66, octaves: 3, amp: 0.07, freqBase: 1.0, freqRand: 1.4, freqStep: 1.2, peaks: 2 },
  { name: '고원 요새', base: 0.68, octaves: 3, amp: 0.06, freqBase: 1.0, freqRand: 1.4, freqStep: 1.2, mesa: true },
];

// 가우시안 융기/함몰을 지형에 더한다. amp>0=아래로(함몰), amp<0=위로(융기).
function addBump(ground, width, cx, w, amp) {
  for (let x = 0; x < width; x++) {
    const d = (x - cx) / w;
    ground[x] += amp * Math.exp(-d * d);
  }
}

// 여러 사인파 + 프리셋별 지형 특징을 합쳐 맵을 생성한다.
export function generateTerrain(width, height, rng = Math.random) {
  const preset = PRESETS[Math.floor(rng() * PRESETS.length)];
  const ground = new Float32Array(width);
  const base = height * preset.base;
  const waves = [];
  for (let i = 0; i < preset.octaves; i++) {
    waves.push({
      amp: (height * preset.amp) * (rng() * 0.6 + 0.4) / (i * 0.7 + 1),
      len: width / (rng() * preset.freqRand + preset.freqBase + i * preset.freqStep),
      phase: rng() * Math.PI * 2,
    });
  }
  for (let x = 0; x < width; x++) {
    let y = base;
    for (const w of waves) y += Math.sin(x / w.len + w.phase) * w.amp;
    ground[x] = y;
  }
  // 프리셋별 지형 특징
  if (preset.chasm) addBump(ground, width, width * 0.5, width * 0.09, height * 0.44);            // 중앙 깊은 협곡
  if (preset.mesa) addBump(ground, width, width * 0.5, width * 0.16, -height * 0.22);            // 중앙 고원
  if (preset.peaks) for (let k = 0; k < preset.peaks; k++)
    addBump(ground, width, width * (0.32 + rng() * 0.36), width * 0.06, -height * (0.18 + rng() * 0.12)); // 봉우리
  for (let x = 0; x < width; x++) ground[x] = clamp(ground[x], height * 0.16, height * 0.92);
  return { width, height, ground, preset: preset.name };
}

// 해당 x의 지표면 y (정수 열로 반올림).
export function surfaceY(t, x) {
  return t.ground[clamp(Math.round(x), 0, t.width - 1)];
}

// (x, y)가 흙 속(지표면 아래)인가.
export function isSolid(t, x, y) {
  if (x < 0 || x >= t.width) return false;
  return y >= surfaceY(t, x);
}

// 원형 크레이터 — 지표면을 크레이터 바닥까지 내려 파괴.
export function carveCircle(t, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(t.width - 1, Math.ceil(cx + r));
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const h = r * r - dx * dx;
    if (h <= 0) continue;
    const bottom = cy + Math.sqrt(h); // 크레이터 바닥
    if (bottom > t.ground[x]) t.ground[x] = Math.min(t.height, bottom);
  }
}

// 흙 쌓기 — 각 열의 현재 지면 위로 봉우리를 얹어 올림(흙폭탄용).
export function addDirt(t, cx, r) {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(t.width - 1, Math.ceil(cx + r));
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const h = r * r - dx * dx;
    if (h <= 0) continue;
    const top = t.ground[x] - Math.sqrt(h); // 현재 지면 기준 위로
    if (top < t.ground[x]) t.ground[x] = Math.max(0, top);
  }
}
