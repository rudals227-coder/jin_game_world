// 기본 레이아웃 + 랜덤 문제 생성 + localStorage 커스텀 문제 저장/로드.
import { COLS, ROWS, canShift, clonePieces, isSolved } from './puzzle.js';

const STORAGE_KEY = 'khunphan.customLevels.v1';

// 표준 "횡도입마(橫刀立馬)" 초기 배치.
// 빈 칸 2개는 하단 중앙(row4 col1,col2).
export function classicLayout() {
  return [
    { id: 'big', kind: 'big', x: 1, y: 0, w: 2, h: 2 }, // 큰 말
    { id: 'vL1', kind: 'vtall', x: 0, y: 0, w: 1, h: 2 },
    { id: 'vR1', kind: 'vtall', x: 3, y: 0, w: 1, h: 2 },
    { id: 'vL2', kind: 'vtall', x: 0, y: 2, w: 1, h: 2 },
    { id: 'vR2', kind: 'vtall', x: 3, y: 2, w: 1, h: 2 },
    { id: 'hMid', kind: 'hwide', x: 1, y: 2, w: 2, h: 1 }, // 가로 말
    { id: 's1', kind: 'small', x: 1, y: 3, w: 1, h: 1 },
    { id: 's2', kind: 'small', x: 2, y: 3, w: 1, h: 1 },
    { id: 's3', kind: 'small', x: 0, y: 4, w: 1, h: 1 },
    { id: 's4', kind: 'small', x: 3, y: 4, w: 1, h: 1 },
  ];
}

// 빈 에디터 시작용.
export function emptyLayout() {
  return [];
}

// 정답 상태: 큰 말이 출구(하단 중앙)에 있고 나머지는 위쪽에 유효하게 배치.
function solvedLayout() {
  return [
    { id: 'big', kind: 'big', x: 1, y: 3, w: 2, h: 2 },
    { id: 'vL1', kind: 'vtall', x: 0, y: 0, w: 1, h: 2 },
    { id: 'vL2', kind: 'vtall', x: 0, y: 2, w: 1, h: 2 },
    { id: 'vR1', kind: 'vtall', x: 3, y: 0, w: 1, h: 2 },
    { id: 'vR2', kind: 'vtall', x: 3, y: 2, w: 1, h: 2 },
    { id: 'hTop', kind: 'hwide', x: 1, y: 0, w: 2, h: 1 },
    { id: 's1', kind: 'small', x: 1, y: 1, w: 1, h: 1 },
    { id: 's2', kind: 'small', x: 2, y: 1, w: 1, h: 1 },
    { id: 's3', kind: 'small', x: 1, y: 2, w: 1, h: 1 },
    { id: 's4', kind: 'small', x: 2, y: 2, w: 1, h: 1 },
  ];
}

const DIRS4 = [ { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 } ];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 종류 기반 상태 키 (같은 종류 말은 교환 가능 → 상태공간 축소, 대칭성 활용)
function stateKey(pieces) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const code = { big: 'C', vtall: 'V', hwide: 'H', small: 'S' };
  for (const p of pieces)
    for (let dy = 0; dy < p.h; dy++)
      for (let dx = 0; dx < p.w; dx++) g[p.y + dy][p.x + dx] = code[p.kind];
  return g.map((r) => r.join('')).join('/');
}

// 이웃 상태들(합법 슬라이드 결과) 생성.
function neighbors(s) {
  const out = [];
  for (const p of s) for (const d of DIRS4) {
    if (canShift(s, p, d.x, d.y)) {
      const ns = clonePieces(s);
      const np = ns.find((x) => x.id === p.id);
      np.x += d.x; np.y += d.y;
      out.push(ns);
    }
  }
  return out;
}

// 난이도 보장 풀 생성:
//  1) 정답에서 도달 가능한 전체 상태를 수집(모두 풀 수 있음).
//  2) "큰 말이 출구인 상태(목표집합)"에서 다중소스 BFS로 각 상태의 실제 풀이 수(거리) 계산.
//  3) 거리 >= MIN_DEPTH 인 상태만 풀에 담는다.
let POOL = null;
function buildPool() {
  const MIN_DEPTH = 20;
  const SAFETY = 60000;
  // 1) 전체 상태 수집
  const start = solvedLayout();
  const states = new Map([[stateKey(start), start]]);
  let frontier = [start];
  while (frontier.length && states.size < SAFETY) {
    const next = [];
    for (const s of frontier) {
      for (const ns of neighbors(s)) {
        const k = stateKey(ns);
        if (!states.has(k)) { states.set(k, ns); next.push(ns); }
      }
    }
    frontier = next;
  }
  // 2) 목표집합(큰 말 출구)에서 다중소스 BFS
  const dist = new Map();
  let q = [];
  for (const [k, s] of states) if (isSolved(s)) { dist.set(k, 0); q.push(s); }
  let depth = 0;
  let maxD = 0;
  while (q.length) {
    depth++;
    const nq = [];
    for (const s of q) {
      for (const ns of neighbors(s)) {
        const k = stateKey(ns);
        if (states.has(k) && !dist.has(k)) { dist.set(k, depth); maxD = depth; nq.push(ns); }
      }
    }
    q = nq;
  }
  // 3) 충분히 먼 상태만 풀에 (없으면 가장 먼 쪽으로 낮춰서라도 확보)
  const threshold = Math.min(MIN_DEPTH, maxD);
  const pool = [];
  for (const [k, s] of states) if ((dist.get(k) ?? 0) >= threshold) pool.push(s);
  return pool.length ? pool : [start];
}

// 랜덤(항상 풀 수 있는, 충분히 어려운) 문제. 첫 호출에만 풀 생성(캐시).
export function randomLayout() {
  if (!POOL) POOL = buildPool();
  return clonePieces(rand(POOL));
}

export const boardSize = { cols: COLS, rows: ROWS };

// ---- 커스텀 문제 저장소 (localStorage) ----
// 저장 형태: [{ id, name, createdAt, pieces }]

export function loadCustomLevels() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomLevel(pieces, name) {
  const levels = loadCustomLevels();
  const entry = {
    id: `lvl-${Date.now()}`,
    name: name || `내 문제 ${levels.length + 1}`,
    createdAt: Date.now(),
    // id 충돌 방지를 위해 피스는 새 id로 재부여
    pieces: pieces.map((p, i) => ({ ...p, id: `${p.kind}-${i}` })),
  };
  levels.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
  return entry;
}

export function deleteCustomLevel(id) {
  const levels = loadCustomLevels().filter((l) => l.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}
