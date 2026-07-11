// 기본 레이아웃 + localStorage 커스텀 문제 저장/로드.
import { COLS, ROWS } from './puzzle.js';

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
