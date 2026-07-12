// 테트리스 순수 모델 — 보드/조각/충돌/줄삭제. 캔버스를 전혀 모른다.
//   보드: (string|null)[ROWS][COLS], 셀에는 조각 종류 문자('I','O',...) 또는 null.
//   조각 회전은 4가지 상태를 각 [x,y] 블록 좌표로 하드코딩(회전 계산 버그 방지).

export const COLS = 10;
export const ROWS = 20;

// 각 조각: 색 + 4개 회전 상태(상태별 4블록의 [x,y], 바운딩박스 기준).
export const PIECES = {
  I: { color: '#4dd2e6', states: [
    [[0, 1], [1, 1], [2, 1], [3, 1]], [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]], [[1, 0], [1, 1], [1, 2], [1, 3]] ] },
  O: { color: '#f7d94c', states: [
    [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [2, 1]] ] },
  T: { color: '#b06cf0', states: [
    [[1, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]], [[1, 0], [0, 1], [1, 1], [1, 2]] ] },
  S: { color: '#6cd06a', states: [
    [[1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [0, 1], [1, 1], [1, 2]] ] },
  Z: { color: '#f2685f', states: [
    [[0, 0], [1, 0], [1, 1], [2, 1]], [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]], [[1, 0], [0, 1], [1, 1], [0, 2]] ] },
  J: { color: '#4d7de6', states: [
    [[0, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]], [[1, 0], [1, 1], [0, 2], [1, 2]] ] },
  L: { color: '#f4a13c', states: [
    [[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]], [[0, 0], [1, 0], [1, 1], [1, 2]] ] },
};

export const TYPES = Object.keys(PIECES);

export function emptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

// 조각의 현재 회전 상태 블록 좌표.
export function cellsOf(type, rot) {
  return PIECES[type].states[((rot % 4) + 4) % 4];
}

// (type,rot)를 (px,py)에 놓았을 때 벽/바닥/기존 블록과 충돌하는가.
export function collides(board, type, rot, px, py) {
  for (const [x, y] of cellsOf(type, rot)) {
    const bx = px + x, by = py + y;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx]) return true;
  }
  return false;
}

// 조각을 보드에 고정한 새 보드 반환.
export function lockPiece(board, type, rot, px, py) {
  const b = board.map((r) => r.slice());
  for (const [x, y] of cellsOf(type, rot)) {
    const bx = px + x, by = py + y;
    if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) b[by][bx] = type;
  }
  return b;
}

// 가득 찬 줄의 인덱스 목록.
export function fullRows(board) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) if (board[r].every((c) => c)) rows.push(r);
  return rows;
}

// 가득 찬 줄 삭제 후 위에서 빈 줄 보충. { board, cleared } 반환.
export function clearLines(board) {
  const remaining = board.filter((row) => !row.every((c) => c));
  const cleared = ROWS - remaining.length;
  const fresh = Array.from({ length: cleared }, () => new Array(COLS).fill(null));
  return { board: [...fresh, ...remaining], cleared };
}

// 하드드롭 시 조각이 안착할 y.
export function dropY(board, type, rot, px, py) {
  let y = py;
  while (!collides(board, type, rot, px, y + 1)) y++;
  return y;
}
