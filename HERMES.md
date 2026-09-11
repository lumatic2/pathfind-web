# pathfind-web

> **새 세션은 이 문서를 먼저 읽는다.** 그다음 `handoff.md`와 `MVP_WORK.md`를 읽으면 현재 상태를 이어서 파악할 수 있다.
> 이 레포는 MABC 2026 결선 산출물 전용이며, 작업에 쓰는 모델은 **Solar Pro 4**, 개발 도구는 **Hermes Agent**뿐이다.

MABC 2026 결선 산출물 레포. 예선 당선 스킬 **`pathfind`** 를 누구나 URL로 쓰는 웹 서비스 MVP로 확장한다.

## 이 레포가 무엇인가

- **여기는 산출물만 둔다.** 배포되는 코드(`index.html`, `api/*.js`)와 제출물이 전부다.
- 대회 규정·일정·판정·설계 노트는 별도 레포(`../mabc-2026`)가 소유한다. 여기에 복제하지 않는다.
- **Public 레포다.** 여기에 올라가는 것은 심사자가 전부 본다. 키·토큰·개인정보가 남으면 실격이다.

## 무엇을 만드는가

`pathfind` 는 **하려는 일을 한 문단 받아 → 웹 검색으로 기존 해결책·사례를 모아 → 작업 단계로 배치하고 → 단계마다 "이미 있는 것 / 직접 해야 하는 것"을 가르는** 스킬이다. 바퀴를 다시 만들기 전에 쓴다.

이것을 **계정 없이 URL로 접속해 쓰는 공개 웹 서비스**로 만든다.

## 하드 제약 (어기면 실격)

1. **LLM 은 Solar Pro 4 만.** 외부 LLM(Claude·GPT·Gemini 등) 호출 금지. 플랫폼 자체 fallback 은 예외.
2. **개발 도구는 타임리 또는 Hermes Agent 만.** 외부 AI 코딩 어시스턴트 사용은 부정행위.
3. **키·토큰·프록시 주소를 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 넣지 않는다.** 비밀은 서버(`/api`)에만.
4. **예선 당선 스킬 `pathfind` 가 서비스 핵심 로직에 반드시 포함**된다. 서비스화를 위한 수정·확장은 허용되며, 변경 내역은 PRD 스킬 매핑에 적는다.
5. **MCP 와 비-LLM 공개 외부 API(지도·날씨·공공데이터 등)는 허용.** 사용 시 저작권·출처를 표기한다.
6. 개발 기간(2026-09-09 ~ 09-16) 중 Hermes/Upstage Console 입출력 기록이 수집되어 제출물과 대조된다. **기록으로 설명되지 않는 코드는 규정 외 도구 사용으로 추정된다.**

## 아키텍처 (공식 `skill-to-service` 킷 규격)

```
index.html          정적 화면. 같은 도메인 /api 만 fetch 한다.
api/*.js            Vercel 서버리스. pathfind 의 데이터 경로를 그대로 이식한다.
```

- 사용자는 **비밀을 하나도 입력하지 않는다.** 사용자 프로필은 localStorage 에 저장하고, 재방문 시 다시 묻지 않으며, 초기화 버튼을 둔다.
- 환경변수는 Vercel `plain` / production+preview / upsert 로 등록한다.
- **HTML/JS 는 파일당 원문 3KB 이내를 권장**한다. 커지면 파일을 나눈다.
- **P0(데모 필수)는 최대 4개.** 나머지는 전부 P1.

## 작업 순서

1. **A 대화** — `skill-to-service` 스킬로 스킬 건강검진(A-0) 후 5걸음(WHO·WHEN·INPUT/OUTPUT·SETUP·SOLVE)에 답한다.
2. **B PRD** — 11항목 미니 PRD 로 압축한다(2쪽 내외).
3. **C 구현** — 계획을 제시하고 **그 턴을 끝낸다.** 사용자가 별도 턴에서 `승인` 이라고 말한 뒤에만 구현을 시작한다.

## Vercel 배포 레시피 (어기면 실패한 실측 사례가 있다)

- `files[].data` 에는 **파일 원문 텍스트를 그대로** 넣는다. **base64 로 인코딩하지 않는다.**
- 파일 내용을 **터미널 출력에서 복사하지 않는다.** args 에 직접 작성하고, 워크스페이스에도 같은 내용으로 저장한다.
- **매 배포는 전체 파일 세트를 다시 올린다.** 일부만 올리면 기존 파일이 사라진다.
- 공개 URL 은 배포 해시 URL 이 아니라 **프로젝트 프로덕션 도메인(`프로젝트명.vercel.app`)** 으로 보고한다. 해시 URL 이 302 인 것은 정상이다.

## 완료 판정

배포했다고 끝이 아니다. 프로덕션 도메인에서 index 가 200 이고 제목 문자열이 원문 그대로 보이는지, `/api` 가 200 인지 직접 확인한다. 깨져 있으면 고치고 재배포한 뒤에만 완료를 선언한다.

완료 보고에 다음 네 가지를 반드시 붙인다.

1. 스킬 호출 내역 (스킬명 · 호출 횟수 · 결과)
2. P0 요구사항별 충족 여부 체크리스트 표
3. 배포 후 검증 (공개 URL · index/`api` 상태 코드 · **클라이언트 소스에 키·프록시 주소 0**)
4. **시크릿 창 테스트** — 계정도 저장값도 없는 브라우저의 첫 방문에서 안내가 스스로 나오고 최소 기능이 도는가

## 제출 (2026-09-16 18:00 KST · 이후 수정 불가)

| 제출물 | 규격 |
| --- | --- |
| 서비스 MVP URL & 소스코드 | 공개 배포 URL + 이 레포 링크(Public) + **배포본 커밋 해시** |
| PRD | PDF 또는 Markdown, 2쪽 내외 |
| 포스터 | A1 세로 1장 PDF, 제공 템플릿 |
| 발표자료 | PDF 5장 이내, 제공 템플릿, Noto Sans |
| 데모 영상 | 3분 이내 MP4, 실제 동작 화면 |

제출 이후 배포본을 변경하지 않는다. **심사 종료까지 URL 이 살아 있어야 한다.**

## Hermes 세팅 (이 레포에서 Hermes Agent가 일하기 위한 최소 환경)

이 레포의 작업 모델은 **Solar Pro 4**, 개발 도구는 **Hermes Agent**뿐이다.

- 새 세션은 **이 HERMES.md → SESSION_LOG_20260911.md(해당 세션의 handoff면) → MVP_WORK.md → PRD.md** 순서로 먼저 읽는다.
- 레포 루트의 `HERMES.md`가 이 레포의 CLAUDE.md 역할이다. 글로벌 `~/.claude.md`는 없다(만들지 않는다).
- 세션 로그 파일(`SESSION_LOG_*.md`)이 있으면 그 세션의 작업 내역·미해결 문제·다음 시작점이 적혀 있으니 먼저 읽는다.
- Hermes 글로벌 설정(`~/.hermes/config.yaml`, `skills/`, `hooks/`, `SOUL.md`, `memories/`)은 건드리지 않는다.
- 이 레포 전용 스킬이 필요하면 루트에 `skills/` 폴더를 두고, Hermes가 읽을 수 있게 별도 스킬 파일(SKILL.md)로 둔다. 지금은 별도 스킬 없이 HERMES.md만으로 작업한다.
- Hooks(pre-commit 등)는 이 레포에 두지 않는다. 커밋 검증은 이 HERMES.md의 체크리스트로 사람이 확인한다.

## 작업 하네스 (무엇을 어디에 두는지)

- **산출물(공개·제출용)**: `index.html`, `api/*.js`, `PRD.md`, 포스터·발표자료·데모 영상(추후)
- **작업용(커밋 대상 아님 또는 별도 관리)**: `work/`(handoff·연구노트·테스트 입력), `pathfind-src/`(pathfind 원본 4개: SKILL.md, scripts/render.py, assets/steps-flow-template.html, assets/lucide-icons.json)
- **비밀**: `.env.local` (gitignore). 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 적지 않는다.

## 9) 새 세션용 핸드오프 (Orca로 새 세션 띄울 경우 참고)

새 세션을 레포 루트로 띄울 때, 첫 프롬프트를 **프로세스 인자(argv)로** 넣어 TUI 준비 전 주입 사고를 피한다. 정본은 `terminal create --command "hermes-agent ... '<프롬프트>'"`(모델·프로필 옵션 포함). 프롬프트 핵심만 이 문서로 남긴다.

- 이 레포(C:\Users\yusun\projects\pathfind-web)는 MABC 2026 결선 산출물 전용. 모델은 Solar Pro 4, 개발 도구는 Hermes Agent뿐.
- 먼저 이 HERMES.md → SESSION_LOG_20260911.md → MVP_WORK.md → PRD.md 순서로 읽는다.
- SESSION_LOG_20260911.md에 이번 세션 작업 내역·미해결 문제·다음 시작점이 적혀 있으니 그걸 따라 작업한다.
- 작업 원칙: 실데이터만, 답을 대신 정하지 않는다, 키·토큰·프록시 주소는 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 넣지 않는다.
- 현재 blocker: 프로덕션 /api/grill 404 — Vercel Functions 미배포 상태로 보임. 대시보드 확인부터 한다.

Orca 주의사항(§0 요약): 터미널 핸들은 `result.terminal.handle`로 받고 빈 handle이면 abort, `terminal send`는 입력창 draft 뒤에 붙을 수 있으니 argv 경로 우선, worktree 셀렉터는 `path:<절대경로>` 정본, 폴더 옮기기 전에 terminal list 재조회.

작업 폴더를 만들 때 이 위계를 지킨다.

## 시작 전 확인 (새 세션)

1. `git status`로 dirty·untracked 확인
2. `.gitignore`가 `.env*`·`*.tmp`·`node_modules/`·`.vercel/`·`AGENTS.override.md`·`.materials/`를 막는지 확인
3. `api/*.js`에 `solar-pro4`(하이픈 없음) 모델 ID가 있는지 확인
4. `pathfind-src/` 4개 파일 무결성 확인(필요 시)
5. 비밀(`.env.local`)이 존재하면 값 말고 **존재 여부만** 확인
