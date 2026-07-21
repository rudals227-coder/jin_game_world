// 포격 게임 무기 정의 — 순수 데이터.
//   radius : 폭발 반경(월드 px), damage : 최대 데미지
//   특수 플래그: split(분열 발수) / roll(굴림) / pierce(관통 깊이) / dirt(흙쌓기)
//     / stream(같은 궤적으로 N발 연속) / scratch(착탄 후 배회하며 다회 타격)
//     / magnet(상대 끌어당김) / freeze(다음 턴 이동 봉쇄)

export const BASIC = { id: 'basic', name: '기본탄', icon: '●', radius: 30, damage: 32 };

// 특수탄 풀 — 게임 시작 시 랜덤 지급.
export const SPECIALS = [
  { id: 'big',     name: '대형탄',     icon: '💥', radius: 62,  damage: 40, desc: '폭발 반경 2배' },
  { id: 'split',   name: '분열탄',     icon: '☂',  radius: 26,  damage: 22, desc: '공중에서 6발로 분열', split: 6 },
  { id: 'roller',  name: '굴림탄',     icon: '⛳', radius: 32,  damage: 34, desc: '착지 후 굴러가 폭발', roll: true },
  { id: 'bunker',  name: '벙커버스터', icon: '🛢', radius: 46,  damage: 48, desc: '땅을 깊숙이 뚫고 들어가 폭발', pierce: 72 },
  { id: 'dirt',    name: '흙폭탄',     icon: '⛰',  radius: 52,  damage: 0,  desc: '흙을 쌓아 상대를 묻음', dirt: true },
  { id: 'triple',  name: '삼연포',     icon: '🎯', radius: 26,  damage: 24, desc: '같은 궤적으로 3발 연속 발사', stream: 3 },
  { id: 'scratch', name: '스크래치탄', icon: '💢', radius: 22,  damage: 8,  desc: '착탄 후 주변을 돌며 여러 번 긁는 피해', scratch: true },
  { id: 'heavy',   name: '철갑탄',     icon: '🔩', radius: 20,  damage: 58, desc: '좁지만 강력한 직격탄' },
  { id: 'nuke',    name: '핵탄',       icon: '☢️', radius: 118, damage: 80, desc: '초대형 폭발(1발 한정)', nuke: true },
  { id: 'napalm',  name: '네이팜탄',   icon: '🔥', radius: 24,  damage: 20, desc: '착탄 지점에 6연속 폭발 카펫', scatter: 6 },
  { id: 'digger',  name: '굴착탄',     icon: '🕳', radius: 92,  damage: 12, desc: '지형을 크게 파내 추락 유도' },
  { id: 'storm',   name: '폭풍탄',     icon: '🌪', radius: 16,  damage: 8,  desc: '공중에서 12발로 광범위 분열', split: 12 },
  { id: 'magnet',  name: '자석탄',     icon: '🧲', radius: 120, damage: 10, desc: '착탄점으로 상대를 끌어당김(추락 유도)', magnet: true },
  { id: 'freeze',  name: '빙결탄',     icon: '🧊', radius: 34,  damage: 24, desc: '명중 시 상대 다음 턴 이동 불가', freeze: true },
  { id: 'homing',  name: '유도탄',     icon: '🛰', radius: 30,  damage: 30, desc: '정점 이후 상대 탱크를 추적', homing: true },
  { id: 'fire',    name: '화염지대',   icon: '🌋', radius: 26,  damage: 16, desc: '착탄 지점이 3턴간 불타 지속 피해', fire: true },
  { id: 'gas',     name: '독가스탄',   icon: '☠️', radius: 40,  damage: 0,  desc: '독가스 구름이 4턴간 머물며 지속 피해', gas: true },
  { id: 'rail',    name: '레일건',     icon: '⚡', radius: 18,  damage: 52, desc: '중력 무시 초고속 직사 저격(언덕은 못 넘음)', rail: true },
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
