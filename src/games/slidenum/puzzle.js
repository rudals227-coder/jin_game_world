// 15 퍼즐(슬라이딩 숫자 퍼즐) 순수 모델 — 캔버스를 전혀 모른다.
//   보드: 길이 16 배열. 값 1~15 = 타일, 0 = 빈 칸. index = r*SIZE + c.
//   항상 '풀 수 있는' 배치만 생성한다(정답에서 무작위 슬라이드 → 해가 반드시 존재).

export const SIZE = 4;
const N = SIZE * SIZE;

export function solved() {
  const b = [];
  for (let i = 1; i < N; i++) b.push(i);
  b.push(0);
  return b;
}

export function blankIndex(b) { return b.indexOf(0); }

// 빈 칸에 인접한 칸 인덱스들.
function neighborsOf(i) {
  const r = Math.floor(i / SIZE), c = i % SIZE;
  const res = [];
  if (r > 0) res.push(i - SIZE);
  if (r < SIZE - 1) res.push(i + SIZE);
  if (c > 0) res.push(i - 1);
  if (c < SIZE - 1) res.push(i + 1);
  return res;
}

// idx 타일이 빈 칸과 인접(=밀 수 있음)한가.
export function canSlide(b, idx) {
  return neighborsOf(blankIndex(b)).includes(idx);
}

// idx 타일을 빈 칸으로 민 새 보드. { board, moved } 반환.
export function slide(b, idx) {
  if (!canSlide(b, idx)) return { board: b, moved: false };
  const nb = b.slice();
  const bi = blankIndex(b);
  nb[bi] = nb[idx];
  nb[idx] = 0;
  return { board: nb, moved: true };
}

export function isSolved(b) {
  for (let i = 0; i < N - 1; i++) if (b[i] !== i + 1) return false;
  return b[N - 1] === 0;
}

// 정답에서 무작위 슬라이드를 반복해 섞는다(직전 되돌리기 제외 → 잘 섞임).
export function shuffle(rng = Math.random) {
  let b = solved();
  let prevBlank = -1;
  const steps = N * 40;
  for (let k = 0; k < steps; k++) {
    const bi = blankIndex(b);
    const opts = neighborsOf(bi).filter((n) => n !== prevBlank);
    const pick = opts[Math.floor(rng() * opts.length)];
    b = slide(b, pick).board;
    prevBlank = bi;
  }
  return isSolved(b) ? shuffle(rng) : b;
}
