// requestAnimationFrame 루프 헬퍼.
// start(update) 는 매 프레임 update(dt, now) 를 호출 (dt = 초 단위 델타).
// stop() 은 루프를 멈춘다. unmount 시 반드시 호출해 중복 루프를 막을 것.
export function createLoop(update) {
  let rafId = null;
  let last = 0;

  function frame(now) {
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    update(dt, now);
    rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (rafId !== null) return;
      last = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    },
  };
}
