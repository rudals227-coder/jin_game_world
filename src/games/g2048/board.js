// 2048 순수 모델 — 4×4 격자. 캔버스/DOM을 전혀 모른다(단위 테스트 용이).
//   격자: number[4][4], 0 = 빈 칸.
//   slide(grid, dir) 가 핵심: 이동/병합 결과 격자 + 애니메이션용 이동 목록을 반환.

export const SIZE = 4;

export function emptyGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
}
export function cloneGrid(g) { return g.map((row) => row.slice()); }

export function emptyCells(g) {
  const cells = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (g[r][c] === 0) cells.push({ r, c });
  return cells;
}

// 빈 칸 한 곳에 2(90%)/4(10%) 생성. grid를 변경하고 생성 정보 반환(없으면 null).
export function spawnTile(g, rng = Math.random) {
  const cells = emptyCells(g);
  if (!cells.length) return null;
  const { r, c } = cells[Math.floor(rng() * cells.length)];
  const value = rng() < 0.9 ? 2 : 4;
  g[r][c] = value;
  return { r, c, value };
}

// 라인 i의 셀 좌표(길이 SIZE). index 0 = 이동 목표 벽에 가장 가까운 칸.
function lineCoords(dir, i) {
  const out = [];
  for (let k = 0; k < SIZE; k++) {
    if (dir === 'left') out.push({ r: i, c: k });
    else if (dir === 'right') out.push({ r: i, c: SIZE - 1 - k });
    else if (dir === 'up') out.push({ r: k, c: i });
    else out.push({ r: SIZE - 1 - k, c: i }); // down
  }
  return out;
}

// 한 라인(값 배열) 압축+병합. 반환: { out, moves }
//   moves: { from(입력 index), to(출력 index), value(병합 전 값), merged }
function compressLine(values) {
  const out = new Array(SIZE).fill(0);
  const moves = [];
  let pos = 0;
  let last = null; // { outIndex, value, merged }
  for (let i = 0; i < SIZE; i++) {
    const v = values[i];
    if (v === 0) continue;
    if (last && !last.merged && last.value === v) {
      out[last.outIndex] = v * 2;
      moves.push({ from: i, to: last.outIndex, value: v, merged: true });
      last.merged = true;
    } else {
      out[pos] = v;
      moves.push({ from: i, to: pos, value: v, merged: false });
      last = { outIndex: pos, value: v, merged: false };
      pos++;
    }
  }
  return { out, moves };
}

// dir: 'left'|'right'|'up'|'down'
// 반환: { grid(새 격자), moves(이동 목록, 셀좌표), gained(획득 점수), moved(변화 여부) }
export function slide(grid, dir) {
  const g = cloneGrid(grid);
  const moves = [];
  let gained = 0;
  for (let i = 0; i < SIZE; i++) {
    const coords = lineCoords(dir, i);
    const values = coords.map(({ r, c }) => grid[r][c]);
    const { out, moves: lm } = compressLine(values);
    for (let k = 0; k < SIZE; k++) { const { r, c } = coords[k]; g[r][c] = out[k]; }
    for (const mv of lm) {
      const from = coords[mv.from], to = coords[mv.to];
      moves.push({ fromR: from.r, fromC: from.c, toR: to.r, toC: to.c, value: mv.value, merged: mv.merged });
      if (mv.merged) gained += mv.value * 2;
    }
  }
  const moved = moves.some((m) => m.fromR !== m.toR || m.fromC !== m.toC || m.merged);
  return { grid: g, moves, gained, moved };
}

// 더 이상 이동 가능한 수가 있는가.
export function canMove(g) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (g[r][c] === 0) return true;
      if (c < SIZE - 1 && g[r][c] === g[r][c + 1]) return true;
      if (r < SIZE - 1 && g[r][c] === g[r + 1][c]) return true;
    }
  return false;
}

export function hasTile(g, val) { return g.some((row) => row.includes(val)); }
export function maxTile(g) { return Math.max(...g.flat()); }
