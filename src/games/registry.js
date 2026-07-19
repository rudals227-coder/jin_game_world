// 게임 목록. 새 게임을 추가하려면 여기에 항목 하나만 넣으면 된다.
//   id       : URL 해시(#/game/<id>)와 매칭되는 고유 식별자
//   title    : 카드/히어로 제목
//   desc     : 짧은 설명 (카드)
//   tagline  : 히어로 배너용 한 줄 소개
//   tags     : 장르/특징 태그 배열
//   accent   : 대표 색 (커버/버튼 강조)
//   cover    : (uid) => SVG 문자열. 카드/히어로 커버 아트 (외부 이미지 없이 자체 생성)
//   load     : 동적 import. 반환 모듈은 mount(container) 를 export 해야 함
export const games = [
  {
    id: 'khunphan',
    title: '쿤판 탈출 퍼즐',
    desc: '블록을 밀어 큰 말을 출구로.',
    tagline: '슬라이딩 블록 퍼즐의 고전. 막힌 판에서 큰 말을 출구로 밀어내세요.',
    tags: ['퍼즐', '싱글', '터치'],
    accent: '#e0563f',
    cover: khunphanCover,
    load: () => import('./khunphan/index.js'),
  },
  {
    id: 'breakout',
    title: '벽돌깨기',
    desc: '공을 튕겨 벽돌을 모두 깨자.',
    tagline: '패들로 공을 받아 벽돌을 전부 부수세요. 놓치면 목숨이 줄어듭니다.',
    tags: ['액션', '싱글', '터치'],
    accent: '#4dabf7',
    cover: breakoutCover,
    load: () => import('./breakout/index.js'),
  },
  {
    id: 'lander',
    title: '달 착륙선',
    desc: '엔진을 분사해 착륙장에 안전하게.',
    tagline: '중력을 거슬러 엔진을 조절해, 연료가 떨어지기 전에 착륙장에 사뿐히 내리세요.',
    tags: ['아케이드', '싱글', '터치'],
    accent: '#8ea2c6',
    cover: landerCover,
    load: () => import('./lander/index.js'),
  },
  {
    id: 'mining',
    title: '광산 채굴',
    desc: '미로를 탐험하며 보석을 캐자.',
    tagline: '동굴 미로에서 몬스터를 피해 보석을 캐고, 다이너마이트로 역공하세요.',
    tags: ['아케이드', '미로', '터치'],
    accent: '#7ff0ff',
    cover: miningCover,
    load: () => import('./mining/index.js'),
  },
  {
    id: 'scorched',
    title: '탱크 배틀',
    desc: '각도·파워·바람을 계산해 포격.',
    tagline: '번갈아 조준해 포탄을 쏘고 지형을 파괴하며 상대 탱크를 먼저 격파하세요. 특수포탄으로 매 판이 다릅니다.',
    tags: ['포격', '2인 대전', '터치'],
    accent: '#ffb648',
    cover: scorchedCover,
    load: () => import('./scorched/index.js'),
  },
  {
    id: '2048',
    title: '2048',
    desc: '타일을 밀어 같은 숫자를 합치자.',
    tagline: '스와이프로 같은 숫자 타일을 합쳐 2048을 만드세요. 한 번 잡으면 놓기 힘든 숫자 퍼즐.',
    tags: ['퍼즐', '숫자', '터치'],
    accent: '#edc22e',
    cover: cover2048,
    load: () => import('./g2048/index.js'),
  },
  {
    id: 'tetris',
    title: '테트리스',
    desc: '떨어지는 블록을 쌓아 줄을 없애자.',
    tagline: '7가지 조각을 회전·이동해 빈틈없이 쌓고 줄을 지우세요. 레벨이 오를수록 빨라집니다.',
    tags: ['퍼즐', '아케이드', '터치'],
    accent: '#b06cf0',
    cover: tetrisCover,
    load: () => import('./tetris/index.js'),
  },
  {
    id: 'slidenum',
    title: '15 퍼즐',
    desc: '타일을 밀어 1~15를 순서대로.',
    tagline: '섞인 숫자 타일을 빈 칸으로 밀어 1부터 15까지 순서대로 정렬하세요. 고전 슬라이딩 퍼즐.',
    tags: ['퍼즐', '숫자', '터치'],
    accent: '#4bd0a0',
    cover: slidenumCover,
    load: () => import('./slidenum/index.js'),
  },
  {
    id: 'airhockey',
    title: '에어하키',
    desc: '두 명이 손가락으로 즐기는 에어하키.',
    tagline: '한 대의 아이패드를 사이에 두고 두 명이 각자 반쪽에서 손가락으로 말렛을 움직여 퍽을 상대 골대에! 7점 먼저.',
    tags: ['2인 대전', '반사신경', '터치'],
    accent: '#22d3ee',
    cover: airhockeyCover,
    load: () => import('./airhockey/index.js'),
  },
  {
    id: 'battle',
    title: '배틀 아레나',
    desc: '캐릭터를 골라 실시간 1:1 대결.',
    tagline: '한 아이패드를 마주보고 두 명이 실시간 대결! 전사·궁수·닌자·마법사 중 골라 조이스틱으로 움직이고 공격해 3판 2선승.',
    tags: ['2인 대전', '실시간 액션', '터치'],
    accent: '#e0563f',
    cover: battleCover,
    load: () => import('./battle/index.js'),
  },
];

export function getGame(id) {
  return games.find((g) => g.id === id) || null;
}

// ---------- 커버 아트 (자체 생성 SVG) ----------

// 쿤판: 실제 퍼즐 보드 모양을 그린다.
function khunphanCover(uid = 'k') {
  const cs = 30;
  const bw = 4 * cs;
  const bh = 5 * cs;
  const W = 400;
  const H = 240;
  const ox = (W - bw) / 2;
  const oy = (H - bh) / 2;
  const layout = [
    { x: 1, y: 0, w: 2, h: 2, c: '#e0563f' }, // 큰 말
    { x: 0, y: 0, w: 1, h: 2, c: '#1abc9c' },
    { x: 3, y: 0, w: 1, h: 2, c: '#1abc9c' },
    { x: 0, y: 2, w: 1, h: 2, c: '#1abc9c' },
    { x: 3, y: 2, w: 1, h: 2, c: '#1abc9c' },
    { x: 1, y: 2, w: 2, h: 1, c: '#8e7bff' }, // 가로 말
    { x: 1, y: 3, w: 1, h: 1, c: '#5b7fb0' },
    { x: 2, y: 3, w: 1, h: 1, c: '#5b7fb0' },
    { x: 0, y: 4, w: 1, h: 1, c: '#5b7fb0' },
    { x: 3, y: 4, w: 1, h: 1, c: '#5b7fb0' },
  ];
  const cells = layout
    .map((b) => {
      const x = ox + b.x * cs + 3;
      const y = oy + b.y * cs + 3;
      const w = b.w * cs - 6;
      const h = b.h * cs - 6;
      return (
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${b.c}"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.5}" rx="7" fill="#ffffff" fill-opacity="0.18"/>`
      );
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="kbg-${uid}" cx="50%" cy="32%" r="80%">
        <stop offset="0" stop-color="#242c3a"/>
        <stop offset="1" stop-color="#0b0e15"/>
      </radialGradient>
      <linearGradient id="kwood-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8a5f38"/>
        <stop offset="1" stop-color="#573a20"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#kbg-${uid})"/>
    <ellipse cx="${W / 2}" cy="${oy + bh / 2}" rx="${bw * 0.9}" ry="${bh * 0.6}" fill="#e0563f" fill-opacity="0.16"/>
    <rect x="${ox - 14}" y="${oy - 14}" width="${bw + 28}" height="${bh + 28}" rx="18" fill="url(#kwood-${uid})"/>
    <rect x="${ox - 6}" y="${oy - 6}" width="${bw + 12}" height="${bh + 12}" rx="12" fill="#0b0e14"/>
    ${cells}
  </svg>`;
}

// 벽돌깨기: 벽돌 줄 + 패들 + 공.
function breakoutCover(uid = 'b') {
  const W = 400;
  const H = 240;
  const rowColors = ['#ff6b6b', '#ffa94d', '#ffd43b', '#51cf66', '#4dabf7'];
  const cols = 7;
  const rows = 5;
  const margin = 34;
  const gap = 7;
  const bw = (W - margin * 2 - gap * (cols - 1)) / cols;
  const bh = 15;
  let bricks = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = margin + c * (bw + gap);
      const y = 34 + r * (bh + gap);
      bricks +=
        `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${rowColors[r]}"/>` +
        `<rect x="${x}" y="${y}" width="${bw}" height="${bh * 0.4}" rx="3" fill="#ffffff" fill-opacity="0.25"/>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bbg-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#141a26"/>
        <stop offset="1" stop-color="#0a0d14"/>
      </linearGradient>
      <linearGradient id="bpad-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a9d4ff"/>
        <stop offset="1" stop-color="#3f8cff"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bbg-${uid})"/>
    ${bricks}
    <rect x="${W / 2 - 45}" y="205" width="90" height="13" rx="6" fill="url(#bpad-${uid})"/>
    <circle cx="${W / 2 + 30}" cy="180" r="9" fill="#eef2f8"/>
  </svg>`;
}

// 달 착륙선: 우주 배경 + 별 + 달 표면 + 착륙선(화염) + 착륙장.
function landerCover(uid = 'l') {
  const W = 400;
  const H = 240;
  let stars = '';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 97) % W);
    const y = (i * 53) % 150;
    const r = (i % 3) * 0.4 + 0.4;
    stars += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="0.7"/>`;
  }
  // 달 표면 폴리곤 (착륙장 평평한 구간 포함)
  const ground =
    `M0,240 L0,190 L60,175 L110,200 L150,185 L210,205 L250,205 L300,180 L350,200 L400,185 L400,240 Z`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lsky-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#05070d"/>
        <stop offset="1" stop-color="#111a2c"/>
      </linearGradient>
      <linearGradient id="lflame-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe08a"/>
        <stop offset="1" stop-color="#ff7028" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#lsky-${uid})"/>
    ${stars}
    <path d="${ground}" fill="#3a4152"/>
    <line x1="210" y1="205" x2="250" y2="205" stroke="#51e08a" stroke-width="4"/>
    <g transform="translate(175,120)">
      <polygon points="-8,12 8,12 0,34" fill="url(#lflame-${uid})"/>
      <line x1="-11" y1="8" x2="-16" y2="18" stroke="#c8d0dd" stroke-width="2.5"/>
      <line x1="11" y1="8" x2="16" y2="18" stroke="#c8d0dd" stroke-width="2.5"/>
      <ellipse cx="0" cy="0" rx="12" ry="10" fill="#dfe6f0"/>
      <circle cx="0" cy="-1" r="5" fill="#4dabf7"/>
    </g>
  </svg>`;
}

// 광산 채굴: 어두운 동굴 격자 + 보석 + 광부(팩맨풍) + 몬스터.
function miningCover(uid = 'm') {
  const W = 400;
  const H = 240;
  // 격자 벽 블록 몇 개
  let walls = '';
  const blocks = [[40, 60], [120, 60], [280, 60], [40, 150], [200, 150], [320, 150], [120, 150]];
  for (const [x, y] of blocks) {
    walls += `<rect x="${x}" y="${y}" width="40" height="40" rx="7" fill="#333c52"/>`;
  }
  // 보석 몇 개
  let gems = '';
  for (const [x, y] of [[90, 120], [250, 110], [340, 60]]) {
    gems += `<path d="M${x},${y - 9} L${x + 7},${y} L${x},${y + 9} L${x - 7},${y} Z" fill="#7ff0ff"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="mbg-${uid}" cx="50%" cy="45%" r="75%">
        <stop offset="0" stop-color="#141a26"/>
        <stop offset="1" stop-color="#080a10"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#mbg-${uid})"/>
    ${walls}
    ${gems}
    <!-- 귀여운 몬스터 (외눈+뿔) -->
    <g transform="translate(300,116)">
      <polygon points="-9,-13 -3,-24 -1,-11" fill="#d84a3a"/>
      <polygon points="9,-13 3,-24 1,-11" fill="#d84a3a"/>
      <circle cx="0" cy="0" r="17" fill="#ff6b5a"/>
      <circle cx="0" cy="-2" r="8.5" fill="#fff"/>
      <circle cx="0" cy="-2" r="4" fill="#1a2233"/>
      <ellipse cx="0" cy="11" rx="6" ry="3.5" fill="#7a1f1f"/>
    </g>
    <!-- 곡괭이 든 광부 -->
    <g transform="translate(150,116)">
      <g transform="translate(15,2) rotate(18)">
        <rect x="-2" y="-26" width="4" height="30" rx="2" fill="#8a5a2b"/>
        <path d="M-13,-24 Q0,-33 13,-24" stroke="#cfd6e0" stroke-width="4" fill="none"/>
      </g>
      <rect x="-13" y="-2" width="26" height="26" rx="7" fill="#3f6fb0"/>
      <circle cx="0" cy="-11" r="13" fill="#f0c69a"/>
      <path d="M-15,-11 A15,15 0 0 1 15,-11 Z" fill="#ffcc33"/>
      <rect x="-16" y="-13" width="32" height="4.5" rx="2" fill="#ffcc33"/>
      <circle cx="9" cy="-14" r="3" fill="#fff6c0"/>
    </g>
  </svg>`;
}

// 탱크 배틀: 언덕 지형 + 탱크 2대 + 포물선 궤적 + 폭발.
function scorchedCover(uid = 's') {
  const W = 400;
  const H = 240;
  // 언덕 지형(사인풍 폴리곤)
  let d = 'M0,240 L0,170';
  for (let x = 0; x <= W; x += 20) {
    const y = 165 - Math.sin(x / 55) * 20 - Math.sin(x / 23) * 8;
    d += ` L${x},${Math.round(y)}`;
  }
  d += ` L${W},240 Z`;
  // 포물선 궤적 점선
  let arc = '';
  for (let i = 0; i <= 18; i++) {
    const tt = i / 18;
    const x = 70 + tt * 230;
    const y = 150 - Math.sin(tt * Math.PI) * 110;
    arc += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="2.4" fill="#ffd86b" fill-opacity="${(0.3 + tt * 0.6).toFixed(2)}"/>`;
  }
  const tank = (x, y, c, dark, ang) => {
    const bx = Math.cos(ang) * 22, by = -Math.sin(ang) * 22;
    return `<g transform="translate(${x},${y})">
      <line x1="0" y1="-8" x2="${bx.toFixed(0)}" y2="${(-8 + by).toFixed(0)}" stroke="#cfd6e0" stroke-width="4" stroke-linecap="round"/>
      <rect x="-22" y="-9" width="44" height="18" rx="5" fill="${c}"/>
      <path d="M-11,-9 A11,9 0 0 1 11,-9 Z" fill="${dark}"/>
      <circle cx="-12" cy="9" r="4.5" fill="#20242e"/><circle cx="0" cy="9" r="4.5" fill="#20242e"/><circle cx="12" cy="9" r="4.5" fill="#20242e"/>
    </g>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ssky-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a2740"/>
        <stop offset="1" stop-color="#0b1018"/>
      </linearGradient>
      <linearGradient id="sground-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6b4a2c"/>
        <stop offset="1" stop-color="#3c2a19"/>
      </linearGradient>
      <radialGradient id="sboom-${uid}" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff2b0"/>
        <stop offset="0.5" stop-color="#ff7a3d"/>
        <stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#ssky-${uid})"/>
    ${arc}
    <path d="${d}" fill="url(#sground-${uid})"/>
    <path d="M0,168 L400,150" stroke="#7ec86a" stroke-width="0" fill="none"/>
    ${tank(70, 150, '#4dabf7', '#2f6bd6', 1.0)}
    ${tank(320, 152, '#ff6b5a', '#d8412f', 2.1)}
    <circle cx="300" cy="70" r="26" fill="url(#sboom-${uid})"/>
  </svg>`;
}

// 2048: 4×4 보드에 대표 숫자 타일 몇 개.
function cover2048(uid = 'n') {
  const W = 400, H = 240;
  const side = 190;
  const ox = (W - side) / 2, oy = (H - side) / 2;
  const gap = side * 0.05;
  const cell = (side - gap * 5) / 4;
  const COLORS = { 0: 'rgba(238,228,218,0.30)', 2: '#eee4da', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 128: '#edcf72', 2048: '#edc22e' };
  const layout = [
    [2, 0, 8, 0],
    [0, 16, 0, 32],
    [128, 0, 0, 0],
    [0, 0, 0, 2048],
  ];
  let tiles = '';
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const v = layout[r][c];
      const x = ox + gap + c * (cell + gap);
      const y = oy + gap + r * (cell + gap);
      tiles += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="6" fill="${COLORS[v] || 'rgba(238,228,218,0.30)'}"/>`;
      if (v) {
        const fs = v < 100 ? cell * 0.42 : v < 1000 ? cell * 0.34 : cell * 0.26;
        tiles += `<text x="${(x + cell / 2).toFixed(1)}" y="${(y + cell / 2 + fs * 0.34).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="800" font-family="sans-serif" fill="${v <= 4 ? '#776e65' : '#f9f6f2'}">${v}</text>`;
      }
    }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="n2bg-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2620"/>
        <stop offset="1" stop-color="#0b0e15"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#n2bg-${uid})"/>
    <rect x="${ox}" y="${oy}" width="${side}" height="${side}" rx="10" fill="#bbada0"/>
    ${tiles}
  </svg>`;
}

// 테트리스: 바닥에 쌓인 블록 + 떨어지는 T조각.
function tetrisCover(uid = 't') {
  const W = 400, H = 240;
  const cell = 22;
  const cols = 10;
  const bw = cell * cols;
  const ox = (W - bw) / 2;
  const oy = H - cell * 6 - 10;
  const C = { I: '#4dd2e6', O: '#f7d94c', T: '#b06cf0', S: '#6cd06a', Z: '#f2685f', J: '#4d7de6', L: '#f4a13c' };
  // 바닥에 쌓인 블록(대충 울퉁불퉁)
  const stack = [
    [0, 5, 'J'], [1, 5, 'J'], [2, 5, 'S'], [3, 5, 'S'], [5, 5, 'L'], [6, 5, 'L'], [7, 5, 'O'], [8, 5, 'O'], [9, 5, 'Z'],
    [0, 4, 'J'], [2, 4, 'S'], [3, 4, 'I'], [7, 4, 'O'], [8, 4, 'O'], [9, 4, 'Z'],
    [3, 3, 'I'], [8, 3, 'L'],
  ];
  let blocks = '';
  const cellSvg = (cx, cy, color) =>
    `<rect x="${cx + 1}" y="${cy + 1}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="${color}"/>` +
    `<rect x="${cx + 1}" y="${cy + 1}" width="${cell - 2}" height="${(cell - 2) * 0.28}" rx="2" fill="#ffffff" fill-opacity="0.25"/>`;
  for (const [c, r, t] of stack) blocks += cellSvg(ox + c * cell, oy + r * cell, C[t]);
  // 떨어지는 T 조각(위쪽)
  const tp = [[1, 0], [0, 1], [1, 1], [2, 1]];
  const tox = ox + 4 * cell, toy = oy - cell * 3;
  for (const [x, y] of tp) blocks += cellSvg(tox + x * cell, toy + y * cell, C.T);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tbg-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a1526"/>
        <stop offset="1" stop-color="#0a0c12"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#tbg-${uid})"/>
    <rect x="${ox - 4}" y="${oy - cell * 4 - 4}" width="${bw + 8}" height="${cell * 10 + 8}" rx="6" fill="#12151d"/>
    ${blocks}
  </svg>`;
}

// 15 퍼즐: 4×4 숫자 타일(거의 정렬 + 빈 칸 1개).
function slidenumCover(uid = 'p') {
  const W = 400, H = 240;
  const side = 190;
  const ox = (W - side) / 2, oy = (H - side) / 2;
  const gap = side * 0.03;
  const cell = (side - gap * 5) / 4;
  // 거의 정렬된 배치(마지막 두 칸만 살짝 섞임 느낌) — 0 = 빈 칸
  const layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15];
  let tiles = '';
  for (let i = 0; i < 16; i++) {
    const v = layout[i];
    const r = Math.floor(i / 4), c = i % 4;
    const x = ox + gap + c * (cell + gap);
    const y = oy + gap + r * (cell + gap);
    if (v === 0) {
      tiles += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="6" fill="rgba(255,255,255,0.05)"/>`;
      continue;
    }
    const correct = v === i + 1;
    tiles += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="6" fill="${correct ? '#39b184' : '#3f76e0'}"/>`;
    tiles += `<text x="${(x + cell / 2).toFixed(1)}" y="${(y + cell / 2 + cell * 0.17).toFixed(1)}" text-anchor="middle" font-size="${(cell * 0.42).toFixed(1)}" font-weight="800" font-family="sans-serif" fill="#ffffff">${v}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pbg-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#132030"/>
        <stop offset="1" stop-color="#0a0d13"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#pbg-${uid})"/>
    <rect x="${ox}" y="${oy}" width="${side}" height="${side}" rx="10" fill="#1c2230"/>
    ${tiles}
  </svg>`;
}

// 에어하키: 링크 + 중앙선/원 + 말렛 2개 + 퍽 + 위/아래 골대.
function airhockeyCover(uid = 'a') {
  const W = 400, H = 240;
  const TOP = '#4dabf7', BOTTOM = '#ff6b5a';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ah-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#14304a"/>
        <stop offset="0.5" stop-color="#0f2338"/>
        <stop offset="1" stop-color="#14304a"/>
      </linearGradient>
      <radialGradient id="ahm1-${uid}" cx="40%" cy="35%" r="70%">
        <stop offset="0" stop-color="#9fd0ff"/><stop offset="1" stop-color="${TOP}"/>
      </radialGradient>
      <radialGradient id="ahm2-${uid}" cx="40%" cy="35%" r="70%">
        <stop offset="0" stop-color="#ffb3a8"/><stop offset="1" stop-color="${BOTTOM}"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#0c1420"/>
    <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="16" fill="url(#ah-${uid})"/>
    <line x1="12" y1="120" x2="388" y2="120" stroke="#ffffff" stroke-opacity="0.18" stroke-width="3"/>
    <circle cx="200" cy="120" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="3"/>
    <line x1="140" y1="8" x2="260" y2="8" stroke="${TOP}" stroke-width="7"/>
    <line x1="140" y1="232" x2="260" y2="232" stroke="${BOTTOM}" stroke-width="7"/>
    <!-- 말렛 -->
    <circle cx="200" cy="52" r="26" fill="url(#ahm1-${uid})"/>
    <circle cx="200" cy="52" r="13" fill="#fff" stroke="${TOP}" stroke-width="3"/>
    <circle cx="200" cy="188" r="26" fill="url(#ahm2-${uid})"/>
    <circle cx="200" cy="188" r="13" fill="#fff" stroke="${BOTTOM}" stroke-width="3"/>
    <!-- 퍽 -->
    <circle cx="248" cy="132" r="14" fill="#1b2430"/>
    <circle cx="243" cy="127" r="5" fill="#ffffff" fill-opacity="0.25"/>
  </svg>`;
}

// 배틀 아레나: 크림색 종이 위 손그림 아레나 + 마주선 캐릭터 2명 + 물결 HP.
function battleCover(uid = 'bt') {
  const W = 400, H = 240;
  const wavy = (x, y, w, col) => {
    let d = `M${x},${y}`;
    for (let i = 1; i <= 10; i++) d += ` L${(x + (w / 10) * i).toFixed(0)},${(y + (i % 2 ? -3 : 3)).toFixed(0)}`;
    return `<path d="${d}" stroke="${col}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  };
  let rules = '';
  for (let y = 40; y < H; y += 30) rules += `<line x1="14" y1="${y}" x2="${W - 14}" y2="${y}" stroke="rgba(120,90,60,0.10)" stroke-width="1"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#f4ecd8"/>
    ${rules}
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="8" fill="none" stroke="rgba(80,60,40,0.55)" stroke-width="3"/>
    <!-- 엄폐물 -->
    <g stroke="#3a3226" stroke-width="2.4" fill="rgba(150,120,80,0.4)">
      <rect x="182" y="104" width="46" height="20" rx="2"/>
      <rect x="120" y="150" width="20" height="40" rx="2"/>
      <rect x="262" y="52" width="20" height="40" rx="2"/>
    </g>
    <!-- 1P 전사(하단) -->
    <g transform="translate(96,168)">
      <ellipse cx="0" cy="22" rx="20" ry="8" fill="rgba(60,45,30,0.18)"/>
      <circle cx="0" cy="0" r="24" fill="#fbf6ea" stroke="#e0563f" stroke-width="4"/>
      <text x="0" y="9" text-anchor="middle" font-size="26">🛡️</text>
    </g>
    ${wavy(66, 132, 60, '#e0563f')}
    <!-- 2P 궁수(상단) -->
    <g transform="translate(310,74)">
      <ellipse cx="0" cy="22" rx="20" ry="8" fill="rgba(60,45,30,0.18)"/>
      <circle cx="0" cy="0" r="24" fill="#fbf6ea" stroke="#2f9e5e" stroke-width="4"/>
      <text x="0" y="9" text-anchor="middle" font-size="26">🏹</text>
    </g>
    ${wavy(280, 110, 60, '#2f9e5e')}
    <text x="200" y="128" text-anchor="middle" font-size="26" font-weight="900" fill="rgba(80,60,40,0.6)" font-family="'Comic Sans MS',sans-serif">VS</text>
  </svg>`;
}

// 커버가 없는 게임용 기본 아트 (그라데이션 + 제목 첫 글자).
export function genericCover(game, uid = 'g') {
  const a = game.accent || '#4f8cff';
  const initial = (game.title || '?').trim().charAt(0);
  return `<svg viewBox="0 0 400 240" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gc-${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${a}"/>
        <stop offset="1" stop-color="#0b0e15"/>
      </linearGradient>
    </defs>
    <rect width="400" height="240" fill="url(#gc-${uid})"/>
    <text x="200" y="140" text-anchor="middle" font-size="120" font-weight="800"
      fill="#ffffff" fill-opacity="0.9" font-family="sans-serif">${initial}</text>
  </svg>`;
}
