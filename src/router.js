import { mountHub } from './hub/hub.js';
import { getGame } from './games/registry.js';
import { mountGate } from './gate/mathGate.js';

// 해시 기반 라우터.
//   #/            → 허브
//   #/game/<id>   → 해당 게임 mount
// 어떤 화면이든 이탈 시 이전 화면의 unmount 를 호출해 자원을 정리한다.
export function startRouter(container) {
  let currentUnmount = null;
  // 덧셈 관문: 이번 방문(새로고침 전까지) 동안 한 번만 통과하면 됨.
  let gatePassed = false;

  async function render() {
    // 이전 화면 정리 (RAF/이벤트/DOM)
    if (currentUnmount) {
      try {
        currentUnmount();
      } catch (e) {
        console.error('unmount 중 오류:', e);
      }
      currentUnmount = null;
    }
    container.innerHTML = '';

    // 관문 미통과 시 어떤 경로든 덧셈 문제부터. 통과하면 원래 가려던 화면으로.
    if (!gatePassed) {
      currentUnmount = mountGate(container, () => {
        gatePassed = true;
        render();
      });
      return;
    }

    const route = parseHash(location.hash);

    if (route.name === 'game') {
      const game = getGame(route.id);
      if (!game) {
        location.hash = '#/';
        return;
      }
      // 게임 로딩 중 다른 곳으로 이동했을 수 있으므로 로드 후 유효성 재확인
      const mod = await game.load();
      if (parseHash(location.hash).id !== route.id) return;
      currentUnmount = mod.mount(container);
      return;
    }

    // 기본: 허브
    currentUnmount = mountHub(container);
  }

  function parseHash(hash) {
    const clean = (hash || '').replace(/^#/, '');
    const parts = clean.split('/').filter(Boolean); // ['game','khunphan']
    if (parts[0] === 'game' && parts[1]) {
      return { name: 'game', id: parts[1] };
    }
    return { name: 'hub' };
  }

  window.addEventListener('hashchange', render);
  render();
}
