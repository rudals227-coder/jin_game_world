// 쿤판 게임 뷰: 렌더 + 입력. 순수 모델(puzzle/editor/levels)을 화면에 연결한다.
// 게임 모듈 계약: mount(container) → unmount().
import { createCanvas } from '../../engine/canvas.js';
import { createLoop } from '../../engine/loop.js';
import { attachPointer } from '../../engine/input.js';
import { sfx, resumeAudio, createMuteButton } from '../../engine/audio.js';
import {
  COLS,
  ROWS,
  KINDS,
  GOAL,
  clonePieces,
  pieceAt,
  shift,
  isSolved,
} from './puzzle.js';
import { canPlace, place, removeAt, validateLayout } from './editor.js';
import {
  classicLayout,
  emptyLayout,
  loadCustomLevels,
  saveCustomLevel,
} from './levels.js';

// 종류별 스타일: 그라데이션 상/하 색 + 전통 화용도(華容道) 이름 글자.
const STYLE = {
  big: { top: '#f0674a', bottom: '#b5321f', label: '曹操', text: '#fff4e6' },
  vtall: { top: '#2fd0c6', bottom: '#0f8f86', label: '將', text: '#eafffb' },
  hwide: { top: '#9c8bff', bottom: '#5b45d6', label: '關羽', text: '#f2efff' },
  small: { top: '#6f97c9', bottom: '#3a5c86', label: '兵', text: '#eef4fb' },
};
const KIND_ORDER = ['big', 'vtall', 'hwide', 'small'];

export function mount(container) {
  // ----- state -----
  const state = {
    mode: 'play', // 'play' | 'editor'
    pieces: classicLayout(), // 현재 작업 중인 피스들
    base: classicLayout(), // 풀기 모드 리셋 기준
    editorKind: 'big',
    solved: false,
    message: '',
  };

  // 화면에 그려진 보드 기하 (포인터→칸 변환에 사용, 매 프레임 갱신)
  let geom = { cell: 0, offsetX: 0, offsetY: 0 };

  // 슬라이드 애니메이션용 표시 위치(칸 단위 float). 논리 위치(p.x,p.y)로 매 프레임 수렴.
  const disp = new Map(); // pieceId -> { x, y }
  function dispOf(p) {
    let d = disp.get(p.id);
    if (!d) {
      d = { x: p.x, y: p.y };
      disp.set(p.id, d);
    }
    return d;
  }

  // ----- DOM -----
  const screen = el('div', 'game-screen');
  const topbar = el('div', 'game-topbar');
  const stage = el('div', 'game-stage');
  const hint = el('div', 'game-hint');
  screen.append(topbar, stage, hint);
  container.appendChild(screen);

  const view = createCanvas(stage);

  // ----- render topbar (모드별로 다시 구성) -----
  function renderTopbar() {
    topbar.innerHTML = '';

    const back = button('← 허브', () => {
      location.hash = '#/';
    });

    const playToggle = button('풀기', () => setMode('play'));
    playToggle.classList.add('toggle');
    const editToggle = button('직접 배치', () => setMode('editor'));
    editToggle.classList.add('toggle');
    if (state.mode === 'play') playToggle.classList.add('active');
    else editToggle.classList.add('active');

    topbar.append(back, playToggle, editToggle);

    const spacer = el('div', 'spacer');
    topbar.append(spacer, createMuteButton());

    if (state.mode === 'play') {
      // 문제 선택 (기본 + 저장된 커스텀)
      const select = document.createElement('select');
      const optClassic = new Option('기본 문제', 'classic');
      select.add(optClassic);
      for (const lvl of loadCustomLevels()) {
        select.add(new Option(lvl.name, lvl.id));
      }
      select.addEventListener('change', () => loadLevel(select.value));
      topbar.append(select);
      topbar.append(button('다시 시작', resetPlay));
    } else {
      topbar.append(button('기본 배치', () => loadEditor(classicLayout())));
      topbar.append(button('전체 지우기', () => loadEditor(emptyLayout())));
      topbar.append(button('이 문제 풀기', solveCurrentEditor, 'primary'));
      topbar.append(button('저장', saveCurrentEditor));
    }
  }

  // 에디터 팔레트를 힌트 영역 위 별도 줄로 표시하려면 topbar 재사용; 여기선 hint에 안내.
  function renderHint() {
    if (state.message) {
      hint.textContent = state.message;
      return;
    }
    if (state.mode === 'play') {
      hint.textContent = state.solved
        ? '🎉 클리어! 큰 말이 출구로 나왔어요.'
        : '피스를 드래그해 빈 칸으로 미세요. 큰 말을 하단 출구로.';
    } else {
      const names = KIND_ORDER.map(
        (k) => (k === state.editorKind ? `【${KINDS[k].label}】` : KINDS[k].label)
      ).join('  ·  ');
      hint.textContent = `배치할 피스 선택: ${names}  |  빈 칸 탭=놓기, 피스 탭=제거`;
    }
  }

  // 에디터 팔레트 버튼을 topbar 아래에 추가 (모드가 editor일 때만)
  function renderPalette() {
    const existing = screen.querySelector('.editor-palette');
    if (existing) existing.remove();
    if (state.mode !== 'editor') return;

    const bar = el('div', 'game-topbar editor-palette');
    for (const k of KIND_ORDER) {
      const b = button(KINDS[k].label, () => {
        state.editorKind = k;
        renderPalette();
        renderHint();
      });
      b.classList.add('toggle');
      if (state.editorKind === k) b.classList.add('active');
      bar.append(b);
    }
    // topbar 바로 다음에 삽입
    topbar.after(bar);
  }

  // ----- mode / level 전환 -----
  function setMode(mode) {
    state.mode = mode;
    state.message = '';
    if (mode === 'editor') {
      // 에디터는 빈 배치로 시작 (사용자가 직접 문제를 만든다)
      state.pieces = emptyLayout();
    }
    renderTopbar();
    renderPalette();
    renderHint();
  }

  function loadLevel(value) {
    const layout =
      value === 'classic'
        ? classicLayout()
        : (loadCustomLevels().find((l) => l.id === value)?.pieces ?? classicLayout());
    state.base = clonePieces(layout);
    resetPlay();
  }

  function resetPlay() {
    state.pieces = clonePieces(state.base);
    state.solved = false;
    state.message = '';
    renderHint();
  }

  function loadEditor(layout) {
    state.pieces = clonePieces(layout);
    state.message = '';
    renderHint();
  }

  function solveCurrentEditor() {
    const { ok, error } = validateLayout(state.pieces);
    if (!ok) {
      state.message = '⚠️ ' + error;
      renderHint();
      return;
    }
    state.base = clonePieces(state.pieces);
    state.mode = 'play';
    state.message = '';
    state.pieces = clonePieces(state.base);
    state.solved = false;
    renderTopbar();
    renderPalette();
    renderHint();
  }

  function saveCurrentEditor() {
    const { ok, error } = validateLayout(state.pieces);
    if (!ok) {
      state.message = '⚠️ ' + error;
      renderHint();
      return;
    }
    const entry = saveCustomLevel(state.pieces);
    state.message = `저장됨: ${entry.name}`;
    renderHint();
  }

  // ----- 포인터 좌표 → 보드 칸 -----
  function cellAt(px, py) {
    if (geom.cell <= 0) return null;
    const col = Math.floor((px - geom.offsetX) / geom.cell);
    const row = Math.floor((py - geom.offsetY) / geom.cell);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  // ----- 입력 -----
  let drag = null; // 풀기 모드 드래그 상태
  let tapStart = null; // 에디터 탭 판정용

  const detach = attachPointer(view.canvas, {
    onDown: (pos) => {
      resumeAudio(); // iOS: 첫 터치에서 오디오 잠금 해제
      if (state.mode === 'play') {
        if (state.solved) return;
        const c = cellAt(pos.x, pos.y);
        if (!c) return;
        const piece = pieceAt(state.pieces, c.col, c.row);
        if (piece) drag = { piece, anchorX: pos.x, anchorY: pos.y };
      } else {
        tapStart = { x: pos.x, y: pos.y, moved: false };
      }
    },
    onMove: (pos) => {
      if (state.mode === 'play') {
        if (!drag) return;
        stepDrag(pos);
      } else if (tapStart) {
        if (Math.hypot(pos.x - tapStart.x, pos.y - tapStart.y) > 8)
          tapStart.moved = true;
      }
    },
    onUp: (pos) => {
      if (state.mode === 'play') {
        drag = null;
      } else if (tapStart && !tapStart.moved) {
        handleEditorTap(pos);
        tapStart = null;
      } else {
        tapStart = null;
      }
    },
  });

  // 포인터 이동량만큼 피스를 칸 단위로 민다 (한 제스처에서 여러 칸 가능).
  function stepDrag(pos) {
    const cell = geom.cell;
    let guard = 12;
    while (guard-- > 0) {
      const dxpix = pos.x - drag.anchorX;
      const dypix = pos.y - drag.anchorY;
      const horizontal = Math.abs(dxpix) >= Math.abs(dypix);
      if (horizontal && Math.abs(dxpix) >= cell * 0.5) {
        const dir = Math.sign(dxpix);
        if (shift(state.pieces, drag.piece, dir, 0)) { drag.anchorX += dir * cell; sfx.slide(); }
        else break;
      } else if (!horizontal && Math.abs(dypix) >= cell * 0.5) {
        const dir = Math.sign(dypix);
        if (shift(state.pieces, drag.piece, 0, dir)) { drag.anchorY += dir * cell; sfx.slide(); }
        else break;
      } else {
        break;
      }
    }
    if (isSolved(state.pieces)) {
      state.solved = true;
      drag = null;
      sfx.win();
      renderHint();
    }
  }

  function handleEditorTap(pos) {
    const c = cellAt(pos.x, pos.y);
    if (!c) return;
    const existing = pieceAt(state.pieces, c.col, c.row);
    if (existing) {
      state.pieces = removeAt(state.pieces, c.col, c.row);
      state.message = '';
    } else if (canPlace(state.pieces, state.editorKind, c.col, c.row)) {
      state.pieces = place(state.pieces, state.editorKind, c.col, c.row);
      state.message = '';
      sfx.place();
    } else {
      state.message = '⚠️ 여기엔 놓을 수 없어요 (겹침/경계). 탭한 칸이 좌상단 기준.';
    }
    renderHint();
  }

  // ----- 렌더 -----
  function draw(dt, now) {
    const { ctx, width, height } = view;

    // 배경 (은은한 방사형 그라데이션)
    const bg = ctx.createRadialGradient(
      width / 2, height * 0.4, 0,
      width / 2, height * 0.4, Math.max(width, height) * 0.7
    );
    bg.addColorStop(0, '#1a2030');
    bg.addColorStop(1, '#0b0e14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // 보드 기하 계산 (정사각 셀, 화면 중앙, 프레임 여백 확보)
    const frame = Math.max(14, Math.min(width, height) * 0.03);
    const pad = frame + 10;
    const cell = Math.floor(
      Math.min((width - pad * 2) / COLS, (height - pad * 2) / ROWS)
    );
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const offsetX = Math.floor((width - boardW) / 2);
    const offsetY = Math.floor((height - boardH) / 2);
    geom = { cell, offsetX, offsetY };

    drawFrame(ctx, offsetX, offsetY, boardW, boardH, frame);
    drawWell(ctx, offsetX, offsetY, boardW, boardH, cell);
    drawExit(ctx, offsetX, offsetY, cell, now);

    // 표시 위치를 논리 위치로 부드럽게 수렴 (프레임레이트 독립 easing)
    const k = 1 - Math.exp(-22 * Math.min(dt || 0, 0.05));
    const alive = new Set();
    for (const p of state.pieces) {
      alive.add(p.id);
      const d = dispOf(p);
      d.x += (p.x - d.x) * k;
      d.y += (p.y - d.y) * k;
      if (Math.abs(d.x - p.x) < 0.003) d.x = p.x;
      if (Math.abs(d.y - p.y) < 0.003) d.y = p.y;
    }
    for (const id of [...disp.keys()]) if (!alive.has(id)) disp.delete(id); // 제거된 피스 정리

    // 피스 (드래그 중인 것은 맨 위로)
    const ordered = drag
      ? [...state.pieces.filter((p) => p !== drag.piece), drag.piece]
      : state.pieces;
    for (const p of ordered) drawPiece(ctx, p, cell, offsetX, offsetY, p === drag?.piece);

    if (state.mode === 'play' && state.solved)
      drawSolvedOverlay(ctx, offsetX, offsetY, boardW, boardH, now);
  }

  // 나무 프레임
  function drawFrame(ctx, ox, oy, bw, bh, frame) {
    const x = ox - frame, y = oy - frame, w = bw + frame * 2, h = bh + frame * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = frame;
    ctx.shadowOffsetY = frame * 0.4;
    const wood = ctx.createLinearGradient(x, y, x, y + h);
    wood.addColorStop(0, '#6b4a2b');
    wood.addColorStop(0.5, '#8a5f38');
    wood.addColorStop(1, '#573a20');
    roundRect(ctx, x, y, w, h, frame * 0.7);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.restore();
    // 프레임 하이라이트 테두리
    ctx.strokeStyle = 'rgba(255,225,190,0.25)';
    ctx.lineWidth = 1.5;
    strokeRoundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, frame * 0.6);
  }

  // 움푹한 플레이 영역 + 격자
  function drawWell(ctx, ox, oy, bw, bh, cell) {
    roundRect(ctx, ox - 4, oy - 4, bw + 8, bh + 8, 10);
    ctx.fillStyle = '#0c0f15';
    ctx.fill();
    // 격자
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let r = 1; r < ROWS; r++)
      line(ctx, ox, oy + r * cell, ox + bw, oy + r * cell);
    for (let c = 1; c < COLS; c++)
      line(ctx, ox + c * cell, oy, ox + c * cell, oy + bh);
    ctx.restore();
  }

  // 출구: 목표 자리 점선 + 하단 중앙 화살표(맥동)
  function drawExit(ctx, ox, oy, cell, now) {
    const pulse = 0.5 + 0.5 * Math.sin((now || 0) / 500);
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(240,180,90,${0.4 + pulse * 0.45})`;
    strokeRoundRect(ctx, ox + GOAL.x * cell + 4, oy + GOAL.y * cell + 4, cell * 2 - 8, cell * 2 - 8, 8);
    ctx.restore();
    // 하단 화살표 (출구 방향)
    const cx = ox + (GOAL.x + 1) * cell;
    const by = oy + ROWS * cell + 6;
    ctx.save();
    ctx.fillStyle = `rgba(240,180,90,${0.5 + pulse * 0.5})`;
    for (let i = 0; i < 2; i++) {
      const yy = by + i * cell * 0.22;
      ctx.beginPath();
      ctx.moveTo(cx - cell * 0.28, yy);
      ctx.lineTo(cx + cell * 0.28, yy);
      ctx.lineTo(cx, yy + cell * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPiece(ctx, p, cell, ox, oy, isDragging) {
    const s = STYLE[p.kind] || STYLE.small;
    const d = disp.get(p.id) || p; // 애니메이션 표시 위치
    const x = ox + d.x * cell, y = oy + d.y * cell;
    const w = p.w * cell, h = p.h * cell;
    const inset = Math.max(3, cell * 0.06);
    const rx = x + inset, ry = y + inset, rw = w - inset * 2, rh = h - inset * 2;
    const r = Math.min(rw, rh) * 0.16;

    // 그림자 + 본체 그라데이션
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = isDragging ? cell * 0.28 : cell * 0.14;
    ctx.shadowOffsetY = cell * (isDragging ? 0.1 : 0.07);
    const g = ctx.createLinearGradient(rx, ry, rx, ry + rh);
    g.addColorStop(0, s.top);
    g.addColorStop(1, s.bottom);
    roundRect(ctx, rx, ry, rw, rh, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    // 상단 광택
    ctx.save();
    roundRect(ctx, rx, ry, rw, rh, r);
    ctx.clip();
    const gloss = ctx.createLinearGradient(rx, ry, rx, ry + rh * 0.55);
    gloss.addColorStop(0, 'rgba(255,255,255,0.35)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(rx, ry, rw, rh * 0.55);
    ctx.restore();

    // 베벨 테두리
    roundRect(ctx, rx + 1, ry + 1, rw - 2, rh - 2, Math.max(1, r - 1));
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    roundRect(ctx, rx, ry, rw, rh, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 드래그 강조 (금색 글로우)
    if (isDragging) {
      ctx.save();
      roundRect(ctx, rx, ry, rw, rh, r);
      ctx.strokeStyle = 'rgba(255,214,120,0.9)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(255,200,90,0.8)';
      ctx.shadowBlur = cell * 0.3;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSolvedOverlay(ctx, ox, oy, bw, bh, now) {
    ctx.save();
    roundRect(ctx, ox - 4, oy - 4, bw + 8, bh + 8, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(ox - 4, oy - 4, bw + 8, bh + 8);
    const pop = 0.5 + 0.5 * Math.sin((now || 0) / 300);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.floor(bw * 0.13)}px "Noto Serif KR", serif`;
    ctx.fillStyle = `rgba(255,214,120,${0.85 + pop * 0.15})`;
    ctx.fillText('클리어!', ox + bw / 2, oy + bh / 2 - bw * 0.06);
    ctx.font = `500 ${Math.floor(bw * 0.06)}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('큰 말이 탈출했습니다', ox + bw / 2, oy + bh / 2 + bw * 0.08);
    ctx.restore();
  }

  const loop = createLoop(draw);

  // ----- 초기화 -----
  renderTopbar();
  renderPalette();
  renderHint();
  loop.start();

  // ----- unmount (라우터가 이탈 시 호출) -----
  return function unmount() {
    loop.stop();
    detach();
    view.destroy();
    screen.remove();
  };
}

// ---------- DOM/canvas 헬퍼 ----------
function el(tag, className) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  return n;
}
function button(label, onClick, extraClass) {
  const b = document.createElement('button');
  b.textContent = label;
  if (extraClass) b.classList.add(extraClass);
  b.addEventListener('click', onClick);
  return b;
}
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function strokeRoundRect(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}
