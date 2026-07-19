// 배틀(실시간 1:1) 캐릭터 데이터 + 전투 판정 — 순수 로직(캔버스 모름).
//   maxHp    : 최대 체력
//   dmg      : 명중 시 기본 데미지 (크리티컬은 ×1.8)
//   speed    : 이동 속도(px/s)
//   range    : 공격 사거리(px). 근접이면 짧게, 원거리면 길게.
//   melee    : 근접 여부(false면 projectile로 투사체 발사)
//   hitChance/critChance : 명중률/크리티컬 확률
//   cooldown : 공격 후 재사용 대기(초)

export const CHARACTERS = [
  {
    id: 'warrior', name: '전사', emoji: '🛡️', color: '#e0563f',
    maxHp: 120, dmg: 20, speed: 130, range: 82, melee: true,
    hitChance: 0.9, critChance: 0.15, cooldown: 0.7,
    desc: '근접 · 튼튼하고 강함',
  },
  {
    id: 'archer', name: '궁수', emoji: '🏹', color: '#2f9e5e',
    maxHp: 66, dmg: 16, speed: 98, range: 460, melee: false,
    projectile: { speed: 400, r: 6 },
    hitChance: 0.84, critChance: 0.12, cooldown: 0.85,
    desc: '원거리 견제 · 약함',
  },
  {
    id: 'ninja', name: '닌자', emoji: '🥷', color: '#7a4fd0',
    maxHp: 66, dmg: 12, speed: 200, range: 120, melee: true,
    hitChance: 0.95, critChance: 0.4, cooldown: 0.42,
    desc: '빠름 · 크리티컬 높음',
  },
  {
    id: 'mage', name: '마법사', emoji: '🔮', color: '#3f7de0',
    maxHp: 96, dmg: 15, speed: 96, range: 330, melee: false,
    projectile: { speed: 270, r: 13, aoe: 48, pierceCover: true },
    hitChance: 0.86, critChance: 0.15, cooldown: 1.0,
    desc: '범위 공격 · 엄폐 무시',
  },
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

// 전투 판정 — 순수. covered=상대가 엄폐물 뒤(명중률 하락).
// 반환: { result: 'miss'|'hit'|'crit', damage }
export function resolveHit(atk, { covered = false } = {}, rng = Math.random) {
  const hitCh = atk.hitChance - (covered ? 0.4 : 0);
  if (rng() > hitCh) return { result: 'miss', damage: 0 };
  const crit = rng() < atk.critChance;
  const damage = Math.round(atk.dmg * (crit ? 1.8 : 1));
  return { result: crit ? 'crit' : 'hit', damage };
}
