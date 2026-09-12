# pathfind-web

> **새 세션은 이 문서를 먼저 읽는다.** 그다음 `docs/jd/planboard.md`를 읽으면 현재 상태·할 일을 이어서 파악할 수 있다.
> 이 레포는 MABC 2026 결선 산출물 전용이며, 작업에 쓰는 모델은 **Solar Pro 4**, 개발 도구는 **Hermes Agent**뿐이다.

MABC 2026 결선 산출물 레포. 예선 당선 스킬 **`pathfind`** 를 누구나 URL로 쓰는 웹 서비스 MVP로 확장한다.

**목적**: 배포되는 코드(`index.html`, `api/*.js`)와 제출물만 둔다. 대회 규정·일정·판정·설계 노트는 별도 레포(`../mabc-2026`)가 소유하며 여기에 복제하지 않는다. **Public 레포**이므로 올라가는 모든 것이 심사자 눈에 보인다.

**공개 URL**: 프로젝트 프로덕션 도메인 `pathfind-web-five.vercel.app`(배포 해시 URL은 302여도 정상).

**무엇을 만드는가**: `pathfind`는 하려는 일을 한 문단 받아 → 웹 검색으로 기존 해결책·사례를 모아 → 작업 단계로 배치하고 → 단계마다 "이미 있는 것 / 직접 해야 하는 것"을 가르는 스킬이다. 이것을 계정 없이 URL로 접속해 쓰는 공개 웹 서비스로 만든다.

## 하드 제약 (어기면 실격)

1. **LLM은 Solar Pro 4만.** 외부 LLM(Claude·GPT·Gemini 등) 호출 금지. 플랫폼 자체 fallback은 예외.
2. **개발 도구는 타임리 또는 Hermes Agent만.** 외부 AI 코딩 어시스턴트 사용은 부정행위.
3. **키·토큰·프록시 주소를 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 넣지 않는다.** 비밀은 서버(`/api`)에만.
4. **예선 당선 스킬 `pathfind`가 서비스 핵심 로직에 반드시 포함된다.** 서비스화를 위한 수정·확장은 허용되며, 변경 내역은 PRD 스킬 매핑에 적는다.
5. **MCP와 비-LLM 공개 외부 API(지도·날씨·공공데이터 등)는 허용.** 사용 시 저작권·출처를 표기한다.
6. 개발 기간(2026-09-09 ~ 09-16) 중 Hermes/Upstage Console 입출력 기록이 수집되어 제출물과 대조된다. **기록으로 설명되지 않는 코드는 규정 외 도구 사용으로 추정된다.**

## 파일 지도

- **산출물(공개·제출용)**: `index.html`, `api/*.js`, `frontend/`, `PRD.md`, 포스터·발표자료·데모 영상(추후)
- **작업용(커밋 대상 아님 또는 별도 관리)**: `work/`(handoff·연구노트·테스트 입력), `pathfind-src/`(pathfind 원본 4개: SKILL.md, scripts/render.py, assets/steps-flow-template.html, assets/lucide-icons.json)
- **비밀**: `.env.local` (gitignore). 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 적지 않는다.

## 새 세션 규약

새 세션은 **이 HERMES.md → `docs/jd/` 의 JD 를 받는다.**

`.gitignore`가 `.env*`·`*.tmp`·`node_modules/`·`.vercel/`·`AGENTS.override.md`·`.materials/`를 막는지, `api/*.js`에 `solar-pro4`(하이픈 없음) 모델 ID가 있는지 확인한다.

레포 루트의 `HERMES.md`가 이 레포의 CLAUDE.md 역할이다. 글로벌 `~/.claude.md`는 없다(만들지 않는다).

## 계획판

큰 그림·할 일·상태판은 `docs/jd/planboard.md` 가 정본이다. 새 세션은 HERMES.md → `docs/jd/` 의 JD → `docs/jd/planboard.md` 순서로 읽는다.

## 커밋 게이트

커밋 전 `git status`로 dirty·untracked를 확인한다. `.env*`·키·토큰·프록시 주소·개인정보가 포함되면 커밋하지 않는다.

Hermes 글로벌 설정(`~/.hermes/config.yaml`, `skills/`, `hooks/`, `SOUL.md`, `memories/`)은 건드리지 않는다.

Hooks(pre-commit 등)는 이 레포에 두지 않는다. 커밋 검증은 이 HERMES.md의 체크리스트로 사람이 확인한다.
