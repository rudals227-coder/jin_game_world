// Pointer Events 기반 통합 입력.
// 마우스(PC)와 터치(아이패드)를 동일한 코드 경로로 처리한다.
// 좌표는 대상 엘리먼트(보통 canvas)의 로컬 CSS 픽셀 좌표로 변환해서 전달.
//
// attachPointer(target, { onDown, onMove, onUp }) → detach()
export function attachPointer(target, { onDown, onMove, onUp } = {}) {
  let activeId = null;

  function toLocal(e) {
    const rect = target.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e) {
    if (activeId !== null) return; // 단일 포인터만 추적
    activeId = e.pointerId;
    target.setPointerCapture?.(e.pointerId);
    if (onDown) onDown(toLocal(e), e);
  }

  function move(e) {
    if (e.pointerId !== activeId) return;
    if (onMove) onMove(toLocal(e), e);
  }

  function up(e) {
    if (e.pointerId !== activeId) return;
    activeId = null;
    if (onUp) onUp(toLocal(e), e);
  }

  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);

  return function detach() {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
}
