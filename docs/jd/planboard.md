# 계획판 — pathfind-web 오케스트레이터 상태판

> 이 문서는 오케스트레이터 세션이 소유한다. 현재 상태·할 일·상태가 계속 업데이트된다.
> 새 세션은 HERMES.md → 이 문서 순서로 읽는다.

## 정체성

- 레포: `C:\Users\yusun\projects\pathfind-web` (MABC 2026 결선 산출물, Public)
- 공개 URL: `pathfind-web-five.vercel.app`
- 정체성/톤: Solar 로 만드는 Gemini Notebook 느낌. 3분할 메인 서비스 앱.
  - 좌: 출처 — 에이전트 리서치 결과물 md 파일이 쌓임 (좌 패널 출처 카드 = 단계별 md 원본)
  - 중앙: 에이전트 대화 (노드 클릭 = 그 노드 설명). Hermes 세션 이식. 기존 서버 함수 4개는 폴백.
  - 우: 마인드맵 (마인드맵 JSON은 같은 리서치 내용의 파생 구조 데이터)
- 타깃: AI 사용에 익숙하지 않은 퇴직 전후 50~60대, 새 일을 시작하는 사람들. 인터뷰·3분할·마인드맵 아이디어 유지.
- 길찾기 코어: pathfind v2 (예선본 업그레이드, 원본 보존 + 서비스판 새 폴더). 바뀌는 건 산출 부분: 단계별 md + ROADMAP 색인·요약 + 마인드맵 JSON. 조사 대상 확대(공공 API). 변경 내역은 PRD §6 매핑 표로.
- wow 포인트(MVP 우선순위 순): ① 마인드맵 노드 클릭 → 중앙 패널 설명 출력, ② 자료 더 찾기로 리서치 md 추가 쌓기, ③ 세션 끊겨도 세션 ID로 다시 들어와서 이어가기, ④ 주기 확인 예약(cron)으로 새 md 파일 생성 — cron은 마지막.
- Hermes 게이트웨이 구조: 브라우저 → Vercel 중계 함수 → Hermes 게이트웨이(M4 맥미니, mabc 프로필, 모델 solar-pro4 고정, OpenAI 호환 /v1/chat-completions·/v1/runs, pathfind 스킬 설치) → Solar. Vercel env에는 주소·키 이름만. 외부에서 닿는 주소는 추후 생성. 대화 기록·산출 md는 Hermes(맥미니)가 보유. 브라우저는 세션 ID만 localStorage에.
- 저장소: Vercel KV/Postgres 없음. 세션 지속은 세션 ID 기반.

## 하드 제약 (어기면 실격)

1. LLM은 Solar Pro 4만. 외부 LLM 호출 금지.
2. 개발 도구는 Hermes Agent만.
3. 키·토큰·프록시 주소는 서버(`/api`)에만. 클라이언트 소스·응답 JSON·PRD·커밋에 노출 금지.
4. 예선 당선 스킬 `pathfind`가 서비스 핵심 로직에 반드시 포함. 변경 내역은 PRD §6 매핑 표에 기록.
5. MCP·비-LLM 공개 외부 API 허용. 사용 시 저작권·출처 표기.
6. 개발 기간(2026-09-09 ~ 09-16) 중 Hermes/Upstage Console 입출력 기록이 제출물과 대조됨. 기록으로 설명되지 않는 코드는 규정 외 도구 사용으로 추정.

## 산출물 (공개·제출용)

`index.html`, `api/*.js`, `frontend/`, `PRD.md`, 포스터·발표자료·데모 영상(추후)

## 작업용 (커밋 대상 아님 또는 별도 관리)

`work/` (handoff·연구노트·테스트 입력), `pathfind-src/` (pathfind 원본 4개)

## 최근 커밋 (요약)

- `4b1c7b1` fix: CSS 진입점 임포트 + tokens.css 경로 수정  ← HEAD
- `373ddf5` feat: mindmap 패널 (우측) CSS+JS 초기 커밋
- `cada646` docs(prd): 스킬 매핑 표·3분할 다음단계·SEARCH_API_KEY; feat(api): stage + pathfind 오케스트레이션
- `6c32606` feat: batch 1 — frontend(index.html, app.html), styles, render.js, api/stage.js, DESIGN.md
- `9a072ae` refactor(api): grill 최대 턴 Solar 요약, pathfind 응답에서 handoff 제거

## 현재 상태

- HEAD: `4b1c7b1` (fix: CSS 진입점 임포트 + tokens.css 경로 수정).
- dirty 9 / untracked 8. dirty: .gitignore, PRD.md, planboard.md, package.json, package-lock.json, frontend/src/app/components/NotebookShell.tsx, frontend/src/app/main.tsx, frontend/src/lib/utils.ts. 삭제: docs/jd/00-README.md, JD-1-orchestrator.md, JD-2-backend.md, JD-3-frontend.md, JD-4-design.md. untracked: frontend/src/components/ 6개 컴포넌트(tsx) + temp/.
- 워커스: 워커1 완료·커밋됨. 워커2 완료·검증 통과·커밋 완료(`c2e31fe`). 워커3(프론트 전환 B∥C) 위임 결과 검증 완료, 커밋 대기 중. 워커4(셸 완성: registryDependencies fetch + 주석 해제 + 마운트) 위임 진행 중(`deleg_2d319a3a`).
- 프론트 전환 과제 분해: A(빌드 기반) → B∥C(셸 컴포넌트 + API 모듈) → B-완성(registryDependencies fetch + 주석 해제 + 마운트) → D(상태·훅 교체) → E(PRD 자산 출처 행 + 산출 md 경로 정리). A 완료, B∥C 위임 완료·검증 완료·커밋 대기, B-완성 위임 진행 중.

## 할 일

- [x] mindmap.js·mindmap.css 커밋 (`373ddf5`)
- [x] docs/api-contract.md·planboard·JD-orchestrator 확인
- [x] git status 재확인 + dirty/untracked 내역 파악
- [x] 경로 산출물 관계·게이트웨이·MVP 범위 정리 반영 완료
- [x] 워커2 결과 검증 → 통과 (app.html 첫 화면·PRD §2/§3 톤 정렬, 예시 버튼 4개 새 일 시작 맥락 전환 확인)
- [x] 워커2 산출 커밋 (`c2e31fe`)
- [x] 프론트 전환 과제 분해·스폰: A(빌드 기반 + Tailwind v4 + 자산 설치 진입 확인) / B(앱 React 셸 컴포넌트) / C(actions.js 로직 이관) / D(상태·훅 교체) / E(PRD 자산 출처 행 + 산출 md 경로 정리)
- [x] A 직접 처리 완료: package.json 의존성·스크립트, vite.config.ts(멀티 엔트리 + outDir + Tailwind v4 플러그인), vercel.json(buildCommand/outputDirectory), frontend/src/app/index.css(Tailwind v4 @import + @theme + verdict 4색), frontend/src/app/main.tsx(React 19 진입점), app.html 빈 껍데기화. `npm run build` 성공(dist/index.html + dist/app.html + assets).
- [x] 서브에이전트 위임 테스트: 위임 호출 자체가 실행·반환되는지 확인(subagent test ok → 파일 생성·내용 확인 후 보고). 위임 정상 작동 확인.
- [x] 위임 결과 수신 → 확인: B(셸 콘텐츠 이식·import 조정·var() 확인·dialog/cn 제공), C(API 순수 함수 모듈·타입 정의·node 스모크).
- [x] 기계 검사: `npx @askewly/design verify` 실행 및 결과 확인(B 산출물 대상, 13건 — index.css 정의부 12 + NotebookShell surface-levels 1, work/verify-report-2026-09-13.md에 정리).
- [ ] 사람 확인(라이브 페이지): B 산출물로 실제 앱에서 React 마운트·3패널 레이아웃 렌더링 확인 (데모·검증 초점: 게임 시나리오).
- [x] B∥C 통과 시 커밋 (`3fc280b`).
- [ ] D(상태·훅 교체: useDemoNotebook → 실제 상태 훅, 세션ID localStorage·md 목록·마인드맵 JSON·중앙 대화 상태 타입) 스폰·검증.
- [ ] E(PRD 자산 출처 행 + 산출 md 루트 레벨 낙하 정리) 수행.

## 비고

- 진입 프로토콜(entry-protocol.md) fetch 완료: 자산은 `https://ui.askewly.com/r/<name>.json` 로 받고, 코드 자산 있으면 코드 우선(이식 → 프로젝트 토큰 재스타일). 기계 검사 `npx @askewly/design verify`, 최종 게이트는 사람 확인. 우리 앱은 본인 디자인 시스템(ui-dictionary)이 룩 소유 → Askewly 토큰 주입 아님, 코드 자산 이식 + 재스타일.
- ui-dictionary 레포 `~/projects/ui-dictionary` 존재 확인. NotebookMindmapShellDemo = notebook-workspace-shell.tsx 안 함수 + useDemoNotebook 훅, 레지스트리로 받으면 파일 통째로.
- api-contract.md 변경 없음(SPA로 바꿔도 `/api/*` fetch 기반 그대로). 계약 변경 없으면 프론트 과제는 계약과 독립.
- 위임 방식: delegate_task `tasks`는 JSON 배열이어야 함(문자열 전달 시 파싱 오류). 각 태스크에 goal + context + output_schema + 완료 조건을 명시하면 서브에이전트가 수행하고 결과가 이 세션으로 돌아옴. 실행 후 오케스트레이터가 diff + 실행 출력 + 계약 일치로 직접 검증 후 커밋.
- untracked 산출 md 3개 + skills/ 위치 정리 필요 — 과제 E에서 처리.
- [관측 2026-09-13] app.html 라이브: 우측 마인드맵 패널만 렌더. 좌(출처)·중앙(채팅) 패널 미표시. 원인 진단 중(셸 마운트·높이 제약·접힘 상태).

## 참고 자료 경로

- 결선 기록 레포: `../mabc-2026/docs/` (계획·설계·조사 문서 — 읽기는 여기서, 갱신은 그쪽 세션 몫)
- 지식 조회: `kg` 스킬
- 도구 검색: `ts` 스킬
- 화면 스펙: `askewly-design` 스킬 (원문은 curl)

## 비고
