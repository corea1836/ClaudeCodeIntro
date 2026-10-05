# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트

"오늘의 식단 룰렛" MVP. 앱 전체(HTML·CSS·JS)가 `index.html` 한 파일에 있고, 런타임 외부 의존성 없이 브라우저에서 바로 연다(`open index.html`). npm 패키지는 모두 검사용 `devDependencies`다. 요구사항 원문은 `.claude/skills/reviewing-code/references/project-spec.md`에 있다.

## 명령어

```bash
npm install
npm run check                                    # lint → build → test 전부
npm run lint                                     # ESLint (index.html 인라인 스크립트 + tests/)
npm run build                                    # html-validate. 번들러가 없어 마크업 검증이 build 단계다
npm test                                         # node --test (tests/*.test.js)
node --test --test-name-pattern="포인터"          # 이름으로 테스트 하나만 실행
```

## 앱 구조 (`index.html`의 `<script>`)

모듈이 아닌 클래식 스크립트라 최상위 선언이 전역이 된다. 흐름은 단방향이다:

- 메뉴 데이터(`MENUS`, `CATEGORIES`) + localStorage(`load`/`save`, 모두 try/catch) + 메모리 상태 `state` → `render()`가 탭·칩·식단 카드·히스토리 DOM을 매번 통째로 다시 만들고 `drawWheel()`로 canvas를 그린다. 이벤트 핸들러는 상태를 바꾼 뒤 `render()`를 부른다.
- `getCandidates(meal)`: 카테고리 필터 → 최근 3일(어제~사흘 전) 확정 메뉴 제외 → 같은 날 다른 끼니에서 뽑은 메뉴 제외. 제외 후 0개면 필터 결과로 되돌리고 `relaxed`로 안내한다. 회전 중에는 `state.items`를 갱신하지 않아 원판이 바뀌지 않는다.
- `spin()`은 당첨 칸을 먼저 뽑고 그 칸이 12시 포인터에 오도록 목표 각도를 역산한다. 애니메이션이 끝나면 `finishSpin()`이 `indexAtPointer()`로 결과를 다시 계산해 `state.draft`에 넣는다. **포인터가 가리키는 칸 = 식단 카드의 메뉴**가 이 앱의 핵심 불변식이다.
- `state.draft`(오늘 뽑은 결과)는 메모리에만 있고, "확정"할 때만 히스토리에 저장된다(같은 날짜는 덮어씀). `TODAY`는 페이지를 연 시점에 한 번 계산된다.
- localStorage 키 `mealRoulette.history`, `mealRoulette.filters`를 바꾸면 기존 사용자 기록이 사라진다. 바꿔야 하면 이전 키를 옮기는 코드가 필요하다.
- 최상위 변수 이름이 `history`, `name`, `status` 같은 브라우저 전역을 가리지 않게 한다(ESLint `no-redeclare`가 잡는다).

## 테스트 구조

- `tests/load-app.js`의 `loadApp({ storage, random, confirmAnswer })`가 `index.html`을 jsdom에 띄운다. 날짜는 2026-10-05 정오로 고정되고, `Math.random`, `requestAnimationFrame`/`performance.now`, `confirm`, canvas가 테스트용으로 바뀐다.
- 가짜 canvas 컨텍스트가 마지막 `clearRect` 이후의 `arc`/`rotate`/`fillText` 호출을 기록한다. `labelAtPointer()`는 이 기록만으로 포인터 아래 칸의 글자를 계산하므로 앱 내부 계산과 독립적으로 불변식을 검증한다.
- 앱 내부 상태는 `app.window.eval('JSON.stringify(state)')`처럼 읽는다. 최상위 `const`/`let`은 `window` 속성이 아니라서 eval이 필요하고, 다른 realm 객체라 `deepEqual` 전에 JSON으로 왕복시킨다.
- 테스트 폴더 이름은 `tests/`다. `node --test`는 `test/` 폴더의 모든 `.js`를 테스트로 실행하므로 `test/`로 바꾸면 `load-app.js`까지 테스트로 돈다.

## Claude Code 설정 (`.claude/`)

- **훅:** Edit/Write로 프로젝트의 `.html`/`.js`/`.mjs`/`.json`을 바꾸면 `.claude/hooks/run-checks.sh`가 lint·build·test를 돌리고, 실패하면 exit 2로 결과를 돌려준다. 여러 번에 걸쳐 고치는 중간에 실패가 뜨는 것은 정상이고, 작업을 끝내기 전에 통과해 있어야 한다.
- **리뷰:** 코드 리뷰 요청에는 `reviewing-code` 스킬을 따르거나 `code-reviewer` 서브에이전트에 맡긴다. 리뷰어는 코드를 고치지 않고 리포트만 돌려준다.
