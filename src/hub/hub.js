import { games, genericCover } from '../games/registry.js';

// 허브(메인) 화면. 상단 추천 배너(히어로) + 커버 아트 카드 그리드.
// 게임 카드/버튼 탭 시 해당 게임 해시로 이동.
export function mountHub(container) {
  const root = document.createElement('div');
  root.className = 'hub';

  let uid = 0;
  const coverFor = (g) => (g.cover ? g.cover('c' + uid++) : genericCover(g, 'c' + uid++));
  const tagsHtml = (g) =>
    (g.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');

  const featured = games.find((g) => g.featured) || games[0];

  const heroHtml = featured
    ? `<section class="hero" style="--accent:${featured.accent || '#4f8cff'}">
         <div class="hero-art">${coverFor(featured)}</div>
         <div class="hero-body">
           <span class="hero-badge">추천 게임</span>
           <h1 class="hero-title">${featured.title}</h1>
           <p class="hero-desc">${featured.tagline || featured.desc || ''}</p>
           <div class="hero-tags">${tagsHtml(featured)}</div>
           <button class="btn-play" data-id="${featured.id}">▶ 플레이</button>
         </div>
       </section>`
    : '';

  const cardsHtml = games
    .map(
      (g) => `
      <div class="game-card" data-id="${g.id}" style="--accent:${g.accent || '#4f8cff'}">
        <div class="card-cover">
          ${coverFor(g)}
          <div class="card-play"><span>▶</span></div>
        </div>
        <div class="card-info">
          <div class="card-name">${g.title}</div>
          <div class="card-tags">${tagsHtml(g)}</div>
        </div>
      </div>`
    )
    .join('');

  root.innerHTML = `
    <header class="hub-header">
      <div class="brand"><span class="brand-mark">◆</span> JIN GAME WORLD</div>
      <div class="brand-sub">MINI GAME LIBRARY</div>
    </header>
    ${heroHtml}
    <section class="lib">
      <h2 class="lib-title">라이브러리</h2>
      <div class="lib-grid">${cardsHtml}</div>
    </section>`;

  // 이벤트 위임: data-id 를 가진 요소(카드/플레이 버튼) 탭 → 이동
  function onClick(e) {
    const target = e.target.closest('[data-id]');
    if (!target || !root.contains(target)) return;
    location.hash = `#/game/${target.dataset.id}`;
  }
  root.addEventListener('click', onClick);

  container.appendChild(root);

  return function unmount() {
    root.removeEventListener('click', onClick);
    root.remove();
  };
}
