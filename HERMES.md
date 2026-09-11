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

### 결선별 참고 문서 (이 레포 `docs/`·`research/`로 가져옴)

정본은 여전히 `../mabc-2026`(`C:/Users/yusun/projects/mabc-2026`)이 소유한다. 아래는 작업 편의를 위해 이 레포로 복사한 사본이다. 원본과 충돌하면 원본이 우선.

| 용도 | 사본 위치 | 원본 |
| --- | --- | --- |
| 결선 규정·제출물·일정 요약 | `docs/finals-guide.md` | `../mabc-2026/docs/finals-guide.md` |
| 9/11 기준 결선 상태 | `docs/finals-status-2026-09-11.md` | `../mabc-2026/docs/finals-status-2026-09-11.md` |
| 9/12 멘토링 지참 문서 | `docs/mentoring-2026-09-12.md` | `../mabc-2026/docs/mentoring-2026-09-12.md` |
| 제출 실무 절차(runbook) | `docs/submission-runbook.md` | `../mabc-2026/docs/submission-runbook.md` |
| pathfind 스킬 정본(대조용) | `docs/skills/pathfind.md` | `../mabc-2026/docs/skills/pathfind.md` |
| skill-to-service 킷(원본) | `docs/skill-to-service-kit.md` | `../mabc-2026/docs/skill-to-service-kit.md` |
| Hermes 운용 정본(설정·차단값·검증) | `docs/hermes-operations.md` | `../mabc-2026/docs/hermes-operations.md` |
| Hermes Agent 리서치 | `research/2026-09-07-hermes-agent.md` | `../mabc-2026/research/2026-09-07-hermes-agent.md` |
| Hermes + Solar 운용 리서치 | `research/2026-09-11-hermes-solar-operation.md` | `../mabc-2026/research/2026-09-11-hermes-solar-operation.md` |

**지금 읽기 우선순위(1순위)**: `docs/finals-guide.md` → `docs/finals-status-2026-09-11.md` → `docs/mentoring-2026-09-12.md` → `docs/submission-runbook.md`. 설정·차단값을 건드릴 때만 `docs/hermes-operations.md`를 본다.

**읽기 전 바로 쓸 정보**:
- 결선 마감 **9/16(수) 18:00 KST**, 현장 발표 **9/19(토) 11:00~17:00** @ 한국과학기술회관(B1 ST Center 대회의실 1). 강남역 12번 출구 도보 약 7분, 주차 불가. (출처: `docs/finals-guide.md` §2·§8)
- 심사 배점(사전 90 + 현장 10): **Project Impact 25 / 예선 스킬 활용도 30 / Technical Implementation(처음 방문한 사람 기준 사용성) 15 / Innovation & Creativity 20**. 동점 시 먼저 제출한 팀 우선. 제출 필수 요건 미충족 시 사전 심사 제외. (출처: `docs/finals-guide.md` §4)
- 실격 경계(제9조 요약): **Solar Pro 4만**, 개발 도구는 **타임리 또는 Hermes Agent만**, 그 외 외부 AI 코딩 어시스턴트 금지(아이디어·프롬프트만 도움받는 것도 포함), **코드 편집기로 직접 작성은 허용**(설명 가능해야 함). MCP·공개 외부 API 허용, 키·토큰은 서버만. 개발 기록(9/9~9/16) 수집·PRD/코드 대조 있음. (출처: `docs/finals-guide.md` §5)
- 현재 자산: `pathfind-web`는 산출물 전용, `docs/`·`research/`는 대회 자료 사본. 정본은 `../mabc-2026`.

**지금 붙잡고 갈 상태 포인트** (정본: `docs/finals-status-2026-09-11.md`):
- 결선 크레딧은 들어와 있다(미지급 대기 해소). 잔액은 미조회.
- 로컬 구현 파일(`index.html`, `api/`, `package.json`, `MVP_WORK.md`, `handoff.md` 등)은 있지만 **공개 Git·Vercel 배포까지 올라갔다는 뜻은 아니다**. `api/debug-env.js`에 키 일부·전방 문자 코드를 응답/로그에 담는 코드가 존재 → Hermes가 처리해야 할 노출 우려 항목.
- 이전 핸드오프에 남은 것: Solar 401 이후 429, API 호출 타임아웃, 공개 도메인 별칭 미확정. `api/grill.js`는 `SOLAR_API_KEY` 하나로 직접 fetch라, Hermes 크리덴셜 풀 변경만으로 배포 서비스의 429가 해결되지 않는다(키별/계정별 한도는 미확인).
- 2026-09-11에 추가 Upstage 키를 발급해 Hermes Upstage 풀에 `mabc-hermes-backup` 등록 완료(값은 노출하지 않음). 실제 인증 성공·429 전환·한도 증가는 미검증.

**바로 바꿀 설정 후보** (정본: `research/2026-09-11-hermes-solar-operation.md` §한 화면 요약):
- `model.reasoning_config`: Solar 기본값은 reasoning OFF지만 Hermes Upstage 프로바이더는 미설정 시 `reasoning_effort: medium`으로 올려 보냄. 속도·비용이 중요한 단순 턴에서는 명시적 `low`/`none`으로 낮출 수 있음. 결선처럼 정확도가 중요하면 `medium`/`high` 유지.
- `model.context_length`: `solar-pro4`가 Hermes 로컬 폴백 표에 아직 없으면 256,000으로 낮춰 잡힐 수 있음 → 긴 세션 쓸 계획이면 수동 설정 검토.
- `display.status_bar.fields`: `["model","context_pct","bg_tasks","duration"]` 등으로 명시 지정하면 크레딧·rate limit을 놓치지 않기 쉬움. (좁은 터미널에서는 일부 필드가 자동 탈락)
- Tier 0 = **100 RPM / 50,000 TPM**. 결선 3일간 에이전트를 계속 돌릴 계획이면 이 한도만으로는 막히기 쉽다(배치·캐싱·요청 축소 검토).

- 레포 루트의 `HERMES.md`가 이 레포의 CLAUDE.md 역할이다. 글로벌 `~/.claude.md`는 없다(만들지 않는다).
- 세션 로그 파일(`SESSION_LOG_*.md`)이 있으면 그 세션의 작업 내역·미해결 문제·다음 시작점이 적혀 있으니 먼저 읽는다.
- Hermes 글로벌 설정(`~/.hermes/config.yaml`, `skills/`, `hooks/`, `SOUL.md`, `memories/`)은 건드리지 않는다.
- 이 레포 전용 스킬이 필요하면 루트에 `skills/` 폴더를 두고, Hermes가 읽을 수 있게 별도 스킬 파일(SKILL.md)로 둔다. 지금은 별도 스킬 없이 HERMES.md만으로 작업한다.
- Hooks(pre-commit 등)는 이 레포에 두지 않는다. 커밋 검증은 이 HERMES.md의 체크리스트로 사람이 확인한다.

## Orca CLI 운영 지도

Orca로 워크트리·터미널·에이전트 세션을 다룰 때 먼저 읽는다. 위치: `./orca.md`

- **용도**: Orca CLI의 실측 판정서. 사용법의 정본은 `orca skills get orca-cli`이고, 이 문서는 "실제로 해보니 무엇이 되고 무엇이 물었는가"만 적는다.
- **읽는 순서**: 급하면 §0 사고 목록만 먼저 읽는다 → 무엇을 쓸지는 §2 결정 표 → 기능 판정은 §3.
- **핵심 원칙**: `ok:true`를 결과 증거로 쓰지 않는다(§0 사고 목록). 워크트리 셀렉터는 `path:<절대경로>`가 정본. 첫 프롬프트는 `terminal send`가 아니라 `create --command "<프롬프트>"`(argv)로 넣는다. TUI 준비 전 주입은 프롬프트를 증발시킨다.
- **새 세션을 이 레포로 띄울 때**: HERMES.md §9(새 세션용 핸드오프)를 함께 본다. 프롬프트는 argv로 넣고, 작업 위치는 `path:<절대경로>`로 지정한다.

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
