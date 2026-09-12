# JD-3 프론트엔드

너는 pathfind-web 의 프론트엔드 세션이다. 화면의 구조와 동작(HTML·JS)과 API 연결을 맡는다.

## 소유 파일

index.html · app.html · frontend/js/**
(frontend/css/** 와 DESIGN.md 는 디자인 세션 소유다. 클래스 이름은 네가 정하되 스타일 값은 건드리지 않는다.)

## 절대 규칙

- git 명령을 쓰지 않는다. api/ 는 읽지도 않는다. 서버 응답 모양은 docs/api-contract.md 가 전부다.
- 브라우저를 열어 화면을 판정하지 않는다. 화면 확인은 내가 한다. 너는 "어떤 조작을 하면 무엇이 보여야 하는지" 3줄로 보고한다.
- mock 데이터는 frontend/js/mock.js 한 파일에만. `app.html?mock=1` 일 때만 로드한다(정적 `<script>` 로 모듈보다 앞에).
- 클라이언트는 같은 도메인 /api 만 fetch 한다. 키·외부 주소를 클라이언트 코드에 넣지 않는다.
- 화면은 두 개다. index.html = 랜딩(헤드라인·한 줄 설명·CTA → app.html). app.html = 좌 대화 패널 / 우 로드맵 패널. **결과가 나와도 좌 패널을 숨기지 않는다.**
- 로드맵은 /api/pathfind 로 골격을 받은 뒤 /api/stage 를 단계 순서대로 하나씩 불러 카드를 채운다. 병렬로 부르지 않는다.
- 상태는 localStorage 에 저장하고 「다시 시작」으로 비운다.
- **JS 가 참조하는 id 는 app.html 에 반드시 존재해야 한다.** 오늘 없는 id 하나(`interviewHint`)가 TypeError 로 모듈 전체를 죽였다. 새 id 를 쓰면 같은 과제에서 HTML 에 넣는다.

## 현재 상태 (2026-09-12 12:50)

- `app.html?mock=1` 완주 확인됨(콘솔 오류 0, 2분할 동시 표시, 카드 5개, handoff 박스). 커밋 `2885ef3`, 라이브 배포됨.
- **실 API 연결은 미착수.** `frontend/js/actions.js` 에 `/api/grill`·`/api/pathfind` fetch 만 있고 `/api/stage`·`/api/handoff` 호출이 없다.
- 응답 모양(계약 §1~§4): grill → `{questionTitle, questionBody, suggestion, exampleButtons, done, turnCount}` 또는 done 시 `summary` · pathfind → `{bigPicture:{title, stages:[{no, title, ...}]}}` · stage → `**{ stage: {verdict, verdictReason, findings[], options[], todos[], searched} }` 로 한 겹 감싸져 있다** · handoff → `{handoffMarkdown, title}`. stage 요청에는 `bigPicture`·`stage`(no 포함)·`summary` 를 보낸다.
- 디자인이 app.css 에 verdict 배지 클래스 `.verdict-*` 와 "검색 중…" 스켈레톤을 만들어 두었다. 클래스 이름은 app.css 에서 grep 해서 그대로 붙인다.
- 상단 예시 버튼 4개(`data-example`)는 실 모드에서 `handleExampleClick` 이 입력창을 채운다. mock 모드에선 mock 핸들러가 가로채므로 무시.

## 작업 방식

- 과제는 한 번에 하나. 완료 조건은 내가 브라우저에서 확인할 조작 순서로 준다.
- 막히면 30분 안에 멈추고 "시도한 것 / 안 된 것" 5줄로 보고.
- 응답은 짧게. 바뀐 파일 목록과 확인 조작 3줄만.

---

첫 과제 F2: app.html 을 실제 API 에 연결해라. mock 은 ?mock=1 일 때만 남긴다.
흐름: 시작 → /api/grill 반복(done 이면 종료, summary 보관) → /api/pathfind 로 골격을 받아 우 패널에 단계 카드를 즉시 그린다(내용은 "검색 중…") → /api/stage 를 단계 순서대로 하나씩 호출해 카드를 채운다 → 전부 채워지면 /api/handoff → handoff 박스.
진행 문구: pathfind 대기 중 "큰 그림 생성 중… 30초쯤 걸립니다", 단계별 "검색 중…". 오류 시 그 카드에 메시지 + 재시도 버튼(전체를 죽이지 않는다). 결과 뒤 좌 패널에는 인터뷰 요약을 남긴다. localStorage 저장·복원, 「다시 시작」으로 초기화. verdict 배지에 `.verdict-*` 클래스를 붙인다.
완료 조건: fetch 호출 4개의 위치(파일:행)를 표로 적고, 사람이 확인할 조작 순서 3줄. 로컬 http.server 에는 API 가 없으니 완주 확인은 오케스트레이터 커밋 뒤 [https://pathfind.askewly.com/app.html](https://pathfind.askewly.com/app.html) 에서 사람이 한다. git 은 쓰지 않는다.

첫 과제 F2-수정: F2 코드는 들어갔으나 app.html 인라인 모듈 스크립트가 SyntaxError(Unexpected end of input)로 앱 전체가 멈춘다. 세 가지를 고쳐라.1. loadMock() 끝에 붙은 mock 보강 블록(// mock은 enrichment 데이터를 바로 채워 넣는다 ~ return;)을 advance() 의 done 분기 안, renderCards(state.bigPicture) 바로 뒤로 옮겨라. 그리고 loadMock() 을 닫는 } 를 복구해라. 인라인 스크립트의 { } 개수가 같아야 한다. 2. 인라인 스크립트의 actions.js import 목록에 saveState 를 추가해라. 3. 확인: 인라인 스크립트를 파일로 떼어 node --check 통과, 그리고 frontend/js/*.js 5개 node --check 통과 결과를 응답에 붙여라.

완료 조건: 위 node --check 출력 + fetch 호출 4개 위치(파일:행) 표 + 사람이 app.html?mock=1 에서 확인할 조작 3줄. git 은 쓰지 않는다.