# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

여러 미니게임을 모아놓은 허브형 웹앱. 바닐라 JS + HTML5 Canvas, 빌드는 Vite. PC에서 개발하고 실제 플레이는 아이패드 Safari에서 URL 접속으로 한다. 백엔드 없음 — 전부 클라이언트 사이드 정적 앱이며, 호스팅은 정적 파일만 서빙한다.

## Commands

- `npm install` — 의존성 설치 (Vite만)
- `npm run dev` — 개발 서버 (HMR)
- `npm run dev -- --host` — **아이패드 테스트용**. 출력된 Network URL(`http://<PC-LAN-IP>:5173`)을 같은 와이파이의 아이패드 Safari로 접속. Windows 방화벽에서 Node의 사설망 접근 허용 필요.
- `npm run build` — `dist/`에 정적 빌드
- `npm run preview` — 빌드 결과 로컬 확인
- 배포: `dist/`를 정적 호스팅(GitHub Pages 등)에 업로드. `vite.config.js`의 `base: './'` 덕분에 서브경로 호스팅에서도 자산 경로가 유지된다.

테스트 러너는 아직 없음. 모델 로직(`games/*/puzzle.js`, `editor.js`)은 캔버스에 의존하지 않는 순수 함수라 단위 테스트를 붙이기 쉽다.

## Architecture

**단일 페이지 + 해시 라우팅.** 서버 설정 없이 정적 URL로 동작하도록 history API 대신 해시를 쓴다. 어떤 경로에서 새로고침해도 안전.
- `#/` → 허브 (`src/hub/hub.js`)
- `#/game/<id>` → 해당 게임

라우터(`src/router.js`)는 화면 전환 시 **이전 화면의 unmount를 반드시 호출**해 RAF 루프·이벤트·DOM을 정리한다. 게임 로드는 동적 import라 코드 스플리팅된다.

### 게임 모듈 계약 (가장 중요)

모든 게임은 `src/games/<id>/index.js`에서 이 인터페이스를 export한다:

```js
export function mount(container) {
  // container 안에 canvas/DOM 생성 + 게임 시작
  return function unmount() {
    // RAF 정지, 포인터 이벤트 해제, 캔버스/DOM 제거
  };
}
```

이 계약만 지키면 게임끼리 서로 몰라도 되고, 라우터/허브가 균일하게 다룬다.

### 새 게임 추가 절차

1. `src/games/<id>/index.js` 생성 — 위 `mount/unmount` 계약 구현.
2. `src/games/registry.js`의 `games` 배열에 `{ id, title, desc, load: () => import('./<id>/index.js') }` 추가.
   → 허브 카드는 레지스트리에서 자동 생성된다. 허브/라우터 수정 불필요.
3. 게임 내부는 **모델(순수 상태·규칙) / 뷰(렌더+입력) 분리**를 따를 것. 쿤판(`khunphan/`)이 참조 구현이다.

### 엔진 유틸 (`src/engine/`) — 재사용 헬퍼, 프레임워크 아님

- `canvas.js` `createCanvas(container, {onResize})` — devicePixelRatio 스케일링 + ResizeObserver(아이패드 회전/분할화면 대응). 렌더는 **CSS 픽셀 좌표계**로 그리면 됨. `destroy()`로 정리.
- `input.js` `attachPointer(target, {onDown,onMove,onUp})` — Pointer Events 통합(마우스=터치 동일 경로). 좌표는 target 로컬 CSS 픽셀. `detach()` 반환.
- `loop.js` `createLoop(update)` → `{start, stop}` — RAF 루프. unmount에서 `stop()` 필수(중복 루프 방지).

### 참조 구현: 쿤판(`src/games/khunphan/`)

- `puzzle.js` — 순수 모델: 4×5 보드, 피스 이동 규칙(`canShift`/`shift`), 승리 판정(`isSolved`), 종류별 크기(`KINDS`), 출구(`GOAL`). 캔버스를 전혀 모른다.
- `editor.js` — 순수 모델: 피스 배치/제거(`place`/`removeAt`)와 검증(`validateLayout`: 겹침·경계·큰 말 1개).
- `levels.js` — 기본 배치(`classicLayout`)와 localStorage 커스텀 문제 저장/로드.
- `index.js` — 뷰: 위 모델들을 캔버스 렌더·포인터 입력에 연결. **풀기 모드**(드래그로 슬라이드)와 **직접 배치 모드**(팔레트 선택→탭으로 배치/제거→"이 문제 풀기"/"저장") 두 모드 토글. 슬라이드 easing은 `disp` 맵으로 표시 위치를 논리 위치에 수렴시켜 구현.

### 참조 구현: 벽돌깨기(`src/games/breakout/`)

실시간(물리) 게임 예제. `engine/loop.js`의 RAF 루프로 매 프레임 `step(dt)`(공/패들/벽돌 충돌) 후 렌더. 좌표는 현재 캔버스 크기 기준 픽셀이며, 회전/리사이즈 시 `onResize`에서 위치를 비율 스케일해 상태를 유지한다. 패들은 포인터 이동을 따라가고(누른 채 드래그), 탭으로 발사/재시작. 상태: `ready`/`playing`/`won`/`lost`.

### 참조 구현: 달 착륙선(`src/games/lander/`)

물리 + **온스크린 조종 버튼** 예제. 중력/분사/회전/연료 물리, 지형·착륙장 생성, 착륙/추락 판정. 조작은 `.game-stage` 위에 절대배치한 버튼 3개(`.lander-controls`, pointerdown/up로 입력 플래그 토글)와 PC 키보드(방향키/스페이스, window 리스너)를 병행 — 새 게임에서 터치 버튼 UI가 필요할 때 참고. 지속 사운드는 `engine/audio.js`의 `startThrust/stopThrust`(노이즈 루프). unmount에서 window 키 리스너와 분사음 정리 필수.

### 참조 구현: 광산 채굴(`src/games/mining/`)

팩맨 스타일 격자 미로 게임. `maze.js`(순수 모델: 타일 상수·ASCII 레벨 파싱·`passable`/`isDiggable`/`collectAt`/`dig`/`gemsRemaining`)와 `index.js`(뷰) 분리. 이동은 **격자 정렬 + 방향 버퍼링**: 엔티티는 셀 단위 float 좌표로 인접 셀 중심(`target`)을 향해 이동, 중심 도달 시에만 방향 재결정(`want`). 몬스터 AI는 교차로에서 그리디(추적)/랜덤(배회), 후진 금지. 조작은 `.dpad`(십자, styles.css) — pointerdown으로 `want` 설정(누른 방향 유지) + 키보드. 벽 파기(`%`)가 팩맨 대비 차별 기능.

## iPad Safari 규약 (전 게임 공통)

- `index.html` viewport 메타로 핀치/더블탭 줌 차단, `viewport-fit=cover`로 노치 영역 활용.
- 게임 캔버스는 `touch-action: none`(드래그 조작), body는 `overscroll-behavior: none`(당겨서 새로고침/바운스 방지). `styles.css`에 정의됨.
- 입력은 항상 Pointer Events(`engine/input.js`)로 — 마우스/터치 분기하지 말 것.
- 캔버스는 devicePixelRatio로 스케일(`engine/canvas.js`) → 레티나에서 선명.
- 레이아웃은 `safe-area-inset` 여백을 반영(`--safe-*` CSS 변수).
