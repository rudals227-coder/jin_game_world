import './styles.css';
import { startRouter } from './router.js';

// iOS Safari: 핀치/더블탭 확대 방지.
// (Safari 는 user-scalable=no 를 무시하는 경우가 있어 JS 로 확실히 막는다)
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault())
);
// 두 손가락(멀티터치) 제스처 → 확대 방지. 한 손가락 스크롤(허브)은 그대로 허용.
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
// 더블탭 확대 방지
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);
document.addEventListener('dblclick', (e) => e.preventDefault());

const app = document.getElementById('app');
startRouter(app);
