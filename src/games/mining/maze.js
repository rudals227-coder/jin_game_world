// 광산 채굴(팩맨 스타일) 순수 모델. 캔버스/DOM을 전혀 모른다 — 격자·타일·규칙만.
//
// 좌표계: col(c) 가로, row(r) 세로. grid[r][c] 에 타일 문자 저장. 원점 = 좌상단.

export const TILE = {
  WALL: '#', // 고정 벽 (통과 불가)
  DIG: '%', // 파기 가능 벽 (곡괭이로 뚫으면 바닥)
  FLOOR: ' ', // 빈 바닥
  ORE: '.', // 광석 (점수)
  GEM: 'G', // 보석 (목표 — 전부 먹으면 클리어)
  POWER: 'D', // 다이너마이트 (파워업)
  TUNNEL: 'T', // 워프 터널
};

// 손으로 짠 레벨 1개 (15 x 15). P=플레이어, 1=추적형, 2=배회형 시작점.
export const LEVEL = [
  '###############',
  '#G...........G#',
  '#.#.#.#.#.#.#.#',
  '#......D......#',
  '#.#.#.#.#.#.#.#',
  '#......%......#',
  '#.#.#.#.#.#.#.#',
  'T..%..1.2..%..T',
  '#.#.#.#.#.#.#.#',
  '#......%......#',
  '#.#.#.#.#.#.#.#',
  '#......D......#',
  '#.#.#.#.#.#.#.#',
  '#G.....P.....G#',
  '###############',
];

// ASCII 레벨 → { grid, cols, rows, playerStart, monsterStarts, tunnels, gemCount }
export function parseLevel(level = LEVEL) {
  const rows = level.length;
  const cols = level[0].length;
  const grid = [];
  let playerStart = { c: 1, r: 1 };
  const monsterStarts = [];
  const tunnels = [];

  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = level[r][c];
      if (ch === 'P') {
        playerStart = { c, r };
        row.push(TILE.FLOOR);
      } else if (ch === '1') {
        monsterStarts.push({ c, r, type: 'chase' });
        row.push(TILE.FLOOR);
      } else if (ch === '2') {
        monsterStarts.push({ c, r, type: 'wander' });
        row.push(TILE.FLOOR);
      } else if (ch === TILE.TUNNEL) {
        tunnels.push({ c, r });
        row.push(TILE.TUNNEL);
      } else {
        row.push(ch);
      }
    }
    grid.push(row);
  }
  return { grid, cols, rows, playerStart, monsterStarts, tunnels, gemCount: countGems(grid) };
}

export function tileAt(grid, c, r) {
  if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return TILE.WALL;
  return grid[r][c];
}

// 플레이어/몬스터가 지금 들어갈 수 있는 칸인가 (벽·안 뚫린 파기벽은 불가).
export function passable(grid, c, r) {
  const t = tileAt(grid, c, r);
  return t !== TILE.WALL && t !== TILE.DIG;
}

export function isDiggable(grid, c, r) {
  return tileAt(grid, c, r) === TILE.DIG;
}

export function isTunnel(grid, c, r) {
  return tileAt(grid, c, r) === TILE.TUNNEL;
}

// 수집물(광석/보석/파워)을 먹고 바닥으로 바꾼다. 먹은 종류 반환(없으면 null).
export function collectAt(grid, c, r) {
  const t = tileAt(grid, c, r);
  if (t === TILE.ORE || t === TILE.GEM || t === TILE.POWER) {
    grid[r][c] = TILE.FLOOR;
    return t;
  }
  return null;
}

// 파기 가능 벽을 뚫어 바닥으로. 성공 여부 반환.
export function dig(grid, c, r) {
  if (tileAt(grid, c, r) === TILE.DIG) {
    grid[r][c] = TILE.FLOOR;
    return true;
  }
  return false;
}

export function countGems(grid) {
  let n = 0;
  for (const row of grid) for (const t of row) if (t === TILE.GEM) n++;
  return n;
}
export const gemsRemaining = countGems;
