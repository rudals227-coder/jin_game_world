// 포격 게임 무기 정의 — 순수 데이터.
//   radius : 폭발 반경(월드 px), damage : 최대 데미지
//   특수 플래그: split(분열 발수) / roll(굴림) / pierce(관통 깊이) / dirt(흙쌓기)

export const BASIC = { id: 'basic', name: '기본탄', icon: '●', radius: 30, damage: 32 };

// 특수탄 풀 — 게임 시작 시 랜덤 지급.
export const SPECIALS = [
  { id: 'big',     name: '대형탄',     icon: '💥', radius: 62,  damage: 40, desc: '폭발 반경 2배' },
  { id: 'split',   name: '분열탄',     icon: '☂',  radius: 26,  damage: 22, desc: '공중에서 3발로 분열', split: 3 },
  { id: 'cluster', name: '집속탄',     icon: '🌧', radius: 22,  damage: 16, desc: '공중에서 5발로 쏟아짐', split: 5 },
  { id: 'roller',  name: '굴림탄',     icon: '⛳', radius: 32,  damage: 34, desc: '착지 후 굴러가 폭발', roll: true },
  { id: 'bunker',  name: '벙커버스터', icon: '🛢', radius: 46,  damage: 46, desc: '땅을 뚫고 깊이 폭발', pierce: 26 },
  { id: 'dirt',    name: '흙폭탄',     icon: '⛰',  radius: 52,  damage: 0,  desc: '흙을 쌓아 상대를 묻음', dirt: true },
  { id: 'triple',  name: '삼연포',     icon: '🎯', radius: 26,  damage: 24, desc: '한 번에 3발 부채꼴 발사', volley: 3 },
  { id: 'bouncer', name: '튕김탄',     icon: '🏀', radius: 34,  damage: 32, desc: '지형을 튕기다 폭발', bounce: 2 },
  { id: 'heavy',   name: '철갑탄',     icon: '🔩', radius: 20,  damage: 58, desc: '좁지만 강력한 직격탄' },
  { id: 'nuke',    name: '핵탄',       icon: '☢️', radius: 118, damage: 80, desc: '초대형 폭발(1발 한정)', nuke: true },
  { id: 'napalm',  name: '네이팜탄',   icon: '🔥', radius: 24,  damage: 20, desc: '착탄 지점에 6연속 폭발 카펫', scatter: 6 },
  { id: 'dive',    name: '급강하탄',   icon: '🪂', radius: 34,  damage: 40, desc: '정점에서 수직 급강하(벽 너머 정밀타)', dive: true },
  { id: 'digger',  name: '굴착탄',     icon: '🕳', radius: 92,  damage: 12, desc: '지형을 크게 파내 추락 유도' },
  { id: 'penta',   name: '오연포',     icon: '✋', radius: 24,  damage: 20, desc: '한 번에 5발 부채꼴 발사', volley: 5 },
  { id: 'storm',   name: '폭풍탄',     icon: '🌪', radius: 18,  damage: 13, desc: '공중에서 7발로 광범위 분열', split: 7 },
];

// 특수탄 3종을 뽑아 각 2~3발 지급(핵탄은 1발).
export function rollSpecials(rng = Math.random) {
  const pool = SPECIALS.slice();
  const out = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const w = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const ammo = w.nuke ? 1 : 2 + Math.floor(rng() * 2);
    out.push({ ...w, ammo });
  }
  return out;
}
