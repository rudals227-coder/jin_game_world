// 포격 게임 무기 정의 — 순수 데이터.
//   radius : 폭발 반경(월드 px), damage : 최대 데미지
//   특수 플래그: split(분열 발수) / roll(굴림) / pierce(관통 깊이) / dirt(흙쌓기)

export const BASIC = { id: 'basic', name: '기본탄', icon: '●', radius: 30, damage: 32 };

// 특수탄 풀 — 게임 시작 시 랜덤 지급.
export const SPECIALS = [
  { id: 'big',    name: '대형탄',    icon: '💥', radius: 62, damage: 40, desc: '폭발 반경 2배' },
  { id: 'split',  name: '분열탄',    icon: '☂',  radius: 26, damage: 22, desc: '공중에서 3발로 분열', split: 3 },
  { id: 'roller', name: '굴림탄',    icon: '⛳', radius: 32, damage: 34, desc: '착지 후 굴러가 폭발', roll: true },
  { id: 'bunker', name: '벙커버스터', icon: '🛢', radius: 46, damage: 46, desc: '땅을 뚫고 깊이 폭발', pierce: 26 },
  { id: 'dirt',   name: '흙폭탄',    icon: '⛰',  radius: 52, damage: 0,  desc: '흙을 쌓아 상대를 묻음', dirt: true },
];

// 특수탄 2종을 뽑아 각 2~3발 지급.
export function rollSpecials(rng = Math.random) {
  const pool = SPECIALS.slice();
  const out = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    const w = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    out.push({ ...w, ammo: 2 + Math.floor(rng() * 2) });
  }
  return out;
}
