// 직접 배치(에디터) 순수 모델. 피스 배치/제거/검증만 담당, 렌더 무관.
import { COLS, ROWS, KINDS, buildOccupancy, pieceAt } from './puzzle.js';

let nextId = 1;
function makeId() {
  return `p${nextId++}`;
}

// (x,y)를 좌상단으로 kind 피스를 놓을 수 있는지 (경계 안 + 겹침 없음).
export function canPlace(pieces, kind, x, y, cols = COLS, rows = ROWS) {
  const { w, h } = KINDS[kind];
  if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
  const grid = buildOccupancy(pieces, cols, rows);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (grid[y + dy][x + dx] !== null) return false;
    }
  }
  return true;
}

// 놓을 수 있으면 새 피스를 추가한 새 배열을 반환, 아니면 null.
export function place(pieces, kind, x, y, cols = COLS, rows = ROWS) {
  if (!canPlace(pieces, kind, x, y, cols, rows)) return null;
  const { w, h } = KINDS[kind];
  return [...pieces, { id: makeId(), kind, x, y, w, h }];
}

// (cx,cy) 칸의 피스를 제거한 새 배열 반환 (없으면 원본 그대로).
export function removeAt(pieces, cx, cy) {
  const target = pieceAt(pieces, cx, cy);
  if (!target) return pieces;
  return pieces.filter((p) => p.id !== target.id);
}

// 풀 수 있는 유효한 문제인지 검증.
//   - 큰 말(big) 정확히 1개
//   - (경계/겹침은 place 단계에서 보장되지만 방어적으로 재확인)
// 반환: { ok, error }
export function validateLayout(pieces, cols = COLS, rows = ROWS) {
  const bigs = pieces.filter((p) => p.kind === 'big');
  if (bigs.length === 0) return { ok: false, error: '큰 말(2×2)을 1개 배치하세요.' };
  if (bigs.length > 1) return { ok: false, error: '큰 말(2×2)은 1개만 놓을 수 있어요.' };

  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  for (const p of pieces) {
    for (let dy = 0; dy < p.h; dy++) {
      for (let dx = 0; dx < p.w; dx++) {
        const gx = p.x + dx;
        const gy = p.y + dy;
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows)
          return { ok: false, error: '보드를 벗어난 피스가 있어요.' };
        if (grid[gy][gx] !== null) return { ok: false, error: '겹친 피스가 있어요.' };
        grid[gy][gx] = p.id;
      }
    }
  }
  return { ok: true, error: null };
}
