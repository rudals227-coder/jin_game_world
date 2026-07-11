// devicePixelRatio를 반영해 선명하게 렌더되는 캔버스를 만든다.
// - 컨테이너 크기에 맞춰 자동 리사이즈(아이패드 회전/분할화면 대응)
// - 렌더 코드는 CSS 픽셀 좌표계로 그리면 됨 (DPR 스케일은 내부에서 처리)
//
// 반환: { canvas, ctx, width, height, destroy }
//   width/height 는 CSS 픽셀 기준 (리사이즈 시 갱신됨)
//   onResize(cb) 로 크기 변경 통지를 받을 수 있음.
export function createCanvas(container, { onResize } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  container.appendChild(canvas);

  const api = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    destroy,
  };

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    // 이후 그리기는 CSS 픽셀 단위로 하면 됨
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    api.width = cssW;
    api.height = cssH;
    if (onResize) onResize(cssW, cssH);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function destroy() {
    ro.disconnect();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return api;
}
