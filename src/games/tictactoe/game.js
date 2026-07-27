// 틱택토 순수 모델 — 캔버스를 전혀 모른다(단위 테스트 용이).
//   보드: 길이 9 배열, 0=빈칸 / 1=X / 2=O (인덱스 0~8, 좌상→우하).

export const EMPTY = 0, X = 1, O = 2;

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // 가로
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // 세로
  [0, 4, 8], [2, 4, 6],            // 대각
];

export function emptyBoard() { return new Array(9).fill(EMPTY); }

export function available(b) {
  const out = [];
  for (let i = 0; i < 9; i++) if (b[i] === EMPTY) out.push(i);
  return out;
}

export function isFull(b) { return b.every((v) => v !== EMPTY); }

// 승자 정보 { player, line } 또는 null.
export function winnerInfo(b) {
  for (const L of LINES) {
    const [a, c, d] = L;
    if (b[a] !== EMPTY && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line: L };
  }
  return null;
}

// 게임 결과: 'x' | 'o' | 'draw' | null(진행중)
export function outcome(b) {
  const w = winnerInfo(b);
  if (w) return w.player === X ? 'x' : 'o';
  if (isFull(b)) return 'draw';
  return null;
}

// 미니맥스 — ai 관점 점수(승=+, 패=−). 빠른 승리를 선호하도록 depth 반영.
function minimax(b, player, ai, depth) {
  const w = winnerInfo(b);
  if (w) return (w.player === ai ? 10 - depth : depth - 10);
  if (isFull(b)) return 0;
  const opp = player === X ? O : X;
  let best = player === ai ? -Infinity : Infinity;
  for (const i of available(b)) {
    b[i] = player;
    const s = minimax(b, opp, ai, depth + 1);
    b[i] = EMPTY;
    best = player === ai ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

// 완벽한 수(어려움). 동점 후보 중에서는 rng로 하나 선택.
export function bestMove(b, ai, rng = Math.random) {
  let bestScore = -Infinity;
  const cands = [];
  for (const i of available(b)) {
    b[i] = ai;
    const s = minimax(b, ai === X ? O : X, ai, 0);
    b[i] = EMPTY;
    if (s > bestScore) { bestScore = s; cands.length = 0; cands.push(i); }
    else if (s === bestScore) cands.push(i);
  }
  return cands.length ? cands[Math.floor(rng() * cands.length)] : -1;
}

// 랜덤 수(쉬움).
export function randomMove(b, rng = Math.random) {
  const a = available(b);
  return a.length ? a[Math.floor(rng() * a.length)] : -1;
}
