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

- `373ddf5` feat: mindmap 패널 (우측) CSS+JS 초기 커밋
- `cada646` docs(prd): 스킬 매핑 표·3분할 다음단계·SEARCH_API_KEY; feat(api): stage + pathfind 오케스트레이션
- `6c32606` feat: batch 1 — frontend(index.html, app.html), styles, render.js, api/stage.js, DESIGN.md
- `9a072ae` refactor(api): grill 최대 턴 Solar 요약, pathfind 응답에서 handoff 제거

## 현재 상태

- HEAD: `cada646`. mindmap 커밋 `373ddf5` 추가됨.
- dirty 11 / untracked 2 (mindmap 커밋 후). untracked 내역 확인 필요.
- docs/jd/JD-orchestrator.md·JD-worker.md·planboard.md 생성됨. 기존 JD-1~4 삭제됨.
- docs/api-contract.md 읽음 (4개 엔드포인트: grill·pathfind·stage·handoff).

## 할 일

- [x] mindmap.js·mindmap.css 커밋 (`373ddf5`)
- [x] docs/api-contract.md·planboard·JD-orchestrator 확인
- [ ] git status 재확인 + dirty/untracked 내역 파악 (지금 상태: dirty 11, untracked 2)
- [ ] 경로 산출물 관계·게이트웨이·MVP 범위 정리 반영 완료 (planboard 정체성 + 메모리 반영 완료)
- [ ] 다음 과제 도출: pathfind v2 → 새 폴더 구조 + 산출 스펙부터. 그 전에 계약 문서와 현재 api/*.js 내역이 이 새 방향과 어디서 부딪히는지 확인.
- [ ] 워커스 세션에 줄 과제 문안 작성·dispatch
- [ ] 워커 결과 검증 → 통과 시 커밋

## 비고

- 경로 산출물 관계(메모리에 넣음): 한 번 리서치에서 단계별 md·ROADMAP 색인·마인드맵 JSON 셋이 같이 나오고 md가 원본, 둘은 파생. 좌 출처 카드=단계별 md 원본, ROADMAP.md=그 md의 색인·요약(다운로드용), 마인드맵 JSON=우 패널 구조 데이터.
- 게이트웨이·세션 지속·저장소 없음·cron 우선순위는 planboard 정체성에 이미 반영됨.

## 참고 자료 경로

- 결선 기록 레포: `../mabc-2026/docs/` (계획·설계·조사 문서 — 읽기는 여기서, 갱신은 그쪽 세션 몫)
- 지식 조회: `kg` 스킬
- 도구 검색: `ts` 스킬
- 화면 스펙: `askewly-design` 스킬 (원문은 curl)
