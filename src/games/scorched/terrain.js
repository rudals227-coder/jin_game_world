// 포격 게임 지형 — 높이맵 기반 순수 모델(캔버스 비의존).
//   ground[x] = 해당 열(column)의 지표면 y. 값이 클수록 아래. 그 아래는 흙(solid).
//   파괴 = 지표면을 아래로 내림(값 증가), 흙쌓기 = 위로 올림(값 감소).
// 캔버스를 전혀 모르므로 단위 테스트가 쉽다.

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 여러 사인파를 합쳐 언덕/계곡 지형을 생성한다.
export function generateTerrain(width, height, rng = Math.random) {
  const ground = new Float32Array(width);
  const base = height * 0.6;
  const waves = [];
  for (let i = 0; i < 4; i++) {
    waves.push({
      amp: (height * 0.14) * (rng() * 0.7 + 0.3) / (i * 0.6 + 1),
      len: width / (rng() * 2 + 1.2 + i * 1.6),
      phase: rng() * Math.PI * 2,
    });
  }
  for (let x = 0; x < width; x++) {
    let y = base;
    for (const w of waves) y += Math.sin(x / w.len + w.phase) * w.amp;
    ground[x] = clamp(y, height * 0.28, height * 0.9);
  }
  return { width, height, ground };
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
