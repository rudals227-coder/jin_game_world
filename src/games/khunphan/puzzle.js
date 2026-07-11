// 쿤판(클로츠키) 순수 모델. 캔버스/DOM을 전혀 모른다 — 보드 상태와 규칙만.
//
// 좌표계: col(x) 0..cols-1, row(y) 0..rows-1. 원점 = 좌상단.
// 피스: { id, kind, x, y, w, h }

export const COLS = 4;
export const ROWS = 5;

// 피스 종류별 크기(칸 단위). 에디터/렌더가 공유한다.
export const KINDS = {
  big: { w: 2, h: 2, label: '큰 말 2×2' }, // 탈출 대상 (정확히 1개)
  vtall: { w: 1, h: 2, label: '세로 1×2' },
  hwide: { w: 2, h: 1, label: '가로 2×1' },
  small: { w: 1, h: 1, label: '작은 말 1×1' },
};

// 출구: 큰 말(big)이 이 위치(좌상단 기준)에 오면 클리어 = 하단 중앙.
export const GOAL = { x: 1, y: 3 };

export function clonePieces(pieces) {
  return pieces.map((p) => ({ ...p }));
}

// 점유 격자: 각 칸에 피스 id, 빈 칸은 null.
export function buildOccupancy(pieces, cols = COLS, rows = ROWS) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const p of pieces) {
    for (let dy = 0; dy < p.h; dy++) {
      for (let dx = 0; dx < p.w; dx++) {
        const gx = p.x + dx;
        const gy = p.y + dy;
        if (gy >= 0 && gy < rows && gx >= 0 && gx < cols) grid[gy][gx] = p.id;
      }
    }
  }
  return grid;
}

// (cx, cy) 칸을 차지하는 피스 반환 (없으면 null).
export function pieceAt(pieces, cx, cy) {
  return (
    pieces.find(
      (p) => cx >= p.x && cx < p.x + p.w && cy >= p.y && cy < p.y + p.h
    ) || null
  );
}

// piece 를 (dx, dy)(단위 방향, 한 칸)만큼 밀 수 있는지.
// 새로 점유할 칸이 보드 안이고 비어있거나(=자기 자신) 하면 가능.
export function canShift(pieces, piece, dx, dy, cols = COLS, rows = ROWS) {
  const grid = buildOccupancy(pieces, cols, rows);
  for (let y = piece.y; y < piece.y + piece.h; y++) {
    for (let x = piece.x; x < piece.x + piece.w; x++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) return false;
      const occ = grid[ny][nx];
      if (occ !== null && occ !== piece.id) return false;
    }
  }
  return true;
}

// 가능하면 피스를 한 칸 이동(제자리 변경). 이동 여부 반환.
export function shift(pieces, piece, dx, dy, cols = COLS, rows = ROWS) {
  if (!canShift(pieces, piece, dx, dy, cols, rows)) return false;
  piece.x += dx;
  piece.y += dy;
  return true;
}

// 큰 말이 출구에 도달했는가.
export function isSolved(pieces) {
  const big = pieces.find((p) => p.kind === 'big');
  return !!big && big.x === GOAL.x && big.y === GOAL.y;
}
