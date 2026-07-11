// 게임 목록. 새 게임을 추가하려면 여기에 항목 하나만 넣으면 된다.
//   id       : URL 해시(#/game/<id>)와 매칭되는 고유 식별자
//   title    : 카드/히어로 제목
//   desc     : 짧은 설명 (카드)
//   tagline  : 히어로 배너용 한 줄 소개
//   tags     : 장르/특징 태그 배열
//   accent   : 대표 색 (커버/버튼 강조)
//   featured : true면 상단 히어로 배너에 노출
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
    featured: true,
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
