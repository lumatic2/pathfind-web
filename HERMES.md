# pathfind-web

MABC 2026 결선 산출물 레포. 예선 당선 스킬 `pathfind` 를 누구나 URL로 쓰는 웹 서비스 MVP로 확장한다.

**목적**: 배포되는 코드(`index.html`, `app.html`, `api/*.js`, `frontend/`)와 제출물만 둔다. 대회 규정·일정·판정·설계 노트는 별도 레포(`../mabc-2026`)가 소유하며 여기에 복제하지 않는다. **Public 레포**이므로 올라가는 모든 것이 심사자 눈에 보인다.

**공개 URL**: `https://pathfind.askewly.com` (Vercel 프로젝트 `pathfind-web-five`. 배포 해시 URL은 302여도 정상).

**무엇을 만드는가**: `pathfind`는 하려는 일을 한 문단 받아 → 웹 검색으로 기존 해결책·사례를 모아 → 작업 단계로 배치하고 → 단계마다 "이미 있는 것 / 직접 해야 하는 것"을 가르는 스킬이다. 이것을 계정 없이 URL로 접속해 쓰는 공개 웹 서비스로 만든다. 화면은 세 패널이다. 왼쪽에 조사 결과가 폴더와 파일로 쌓이고, 가운데에서 인터뷰·승인·진행 중계·노드 설명·조사 후 대화가 흐르고, 오른쪽에 로드맵 마인드맵이 그려진다. 랜딩(`index.html`)에서 시작하기를 누르면 앱(`app.html`)으로 간다.

## 하드 제약 (어기면 실격)

1. **LLM은 Solar Pro 4만.** 모델 ID는 `solar-pro4`(하이픈 없음), `max_tokens` 명시. 외부 LLM(Claude·GPT·Gemini 등) 호출 금지. 플랫폼 자체 fallback은 예외.
2. **개발 도구는 타임리 또는 Hermes Agent만.** 외부 AI 코딩 어시스턴트 사용은 부정행위.
3. **키·토큰·프록시 주소를 클라이언트 소스·응답 JSON·로그·PRD·커밋 어디에도 넣지 않는다.** 비밀은 서버(`/api`)의 `process.env`에만. `VITE_` 접두 환경변수를 만들지 않는다(번들에 인라인된다).
4. **예선 당선 스킬** `pathfind`**가 서비스 핵심 로직에 반드시 포함된다.** `pathfind-src/`는 원문 그대로 두고 절대 수정하지 않는다. 서비스화는 전부 `api/`·`frontend/` 코드로 한다. 변경 내역은 PRD 스킬 매핑에 적는다.
5. **MCP와 비-LLM 공개 외부 API(지도·날씨·공공데이터 등)는 허용.** 사용 시 저작권·출처를 표기한다.
6. 개발 기간(2026-09-09 ~ 09-16) 중 Hermes/Upstage Console 입출력 기록이 수집되어 제출물과 대조된다. **기록으로 설명되지 않는 코드는 규정 외 도구 사용으로 추정된다.**

## 파일 지도

- **진입**: `index.html`(랜딩), `app.html`(앱). 둘 다 `vite.config.ts`의 빌드 입력.
- **서버**: `api/*.js` 함수 하나가 엔드포인트 하나. 기존 `grill`·`pathfind`·`stage`·`handoff` 넷은 요청·응답 모양을 바꾸지 않는다. 신설은 `explain`·`chat`·`outline`·`source-card`. 서버 공용 코드는 `api/_lib/`, 조사 채널은 `api/channels/`. 계약은 `docs/api-contract.md`.
- **앱**: `frontend/src/app/`(진입·셸), `frontend/src/state/`(타입·저장·흐름·파생), `frontend/src/lib/api.ts`(서버 호출), `frontend/src/landing/`(랜딩 진입). 상태 모양은 `docs/app-state.md`.
- **디자인 자산**: `frontend/src/components/`는 `https://ui.askewly.com` 레지스트리 설치본이다. 손으로 고치지 않는다. 필요한 슬롯이 없으면 그 사실을 말하고 멈춘다. 재설치는 `npx shadcn@latest add https://ui.askewly.com/r/<이름>.json --overwrite`. 토큰은 `frontend/tokens.css`.
- **제출물**: `PRD.md`, `README.md`.
- **작업용(커밋 대상 아님)**: `work/`(테스트 입력·기록), `roadmap/`(내 작업 노트), `pathfind-src/`(예선 스킬 원본 4개: SKILL.md, scripts/render.py, assets/steps-flow-template.html, assets/lucide-icons.json).
- **비밀**: `.env.local`(gitignore).

## 새 세션 규약

새 세션은 **이 HERMES.md만** 먼저 읽는다. 다른 문서는 내가 읽으라고 줄 때만 읽는다. `docs/api-contract.md`·`docs/app-state.md`는 그 모양이 필요한 작업에서 내가 지정한다.

`.gitignore`가 `.env*`·`*.tmp`·`node_modules/`·`.vercel/`·`AGENTS.override.md`·`.materials/`·`work/`·`roadmap/`를 막는지, `api/*.js`에 `solar-pro4` 모델 ID가 있는지 확인한다.

레포 루트의 `HERMES.md`가 이 레포의 CLAUDE.md 역할이다. 글로벌 `~/.claude.md`는 없다(만들지 않는다).

## 로드맵

`roadmap/`은 사용자가 관리하는 문서 폴더다. Hermes는 **사용자가 읽으라고 지정한 문서만** roadmap/ 안에서 읽는다. 기본으로 읽어들이지 않는다. 세션 하나에 작업 하나다. 내가 준 작업만 하고 커밋하면 그 세션은 끝이다.

## 만들 때 지키는 것

- **라이트 모드만.** 다크 모드 토글을 만들지 않는 것으로 부족하고, OS가 다크여도 켜지지 않게 막는다. 모바일·사용자 소스 추가·공유 링크·로그인도 만들지 않는다.
- **기능 없는 버튼을 두지 않는다.** 콜백이 없는 아이콘·메뉴는 끈다.
- **빌드 통과는 완료가 아니다.** CSS가 번들에 없어도 빌드는 성공한다.
- **화면 문구**: 존댓말, 느낌표·이모지 없음. 싸이클·세션·런 대신 "로드맵". 횟수가 줄어드는 순간은 누르기 전에 알린다. 기다리는 동안 몇 번째인지 보여 준다. 실패는 한 줄로 말하고 남은 것을 먼저 말한다. 하지 말라는 문장 대신 해 달라는 문장으로 쓴다.
- **판정 4종은 계약 값이다.** `가져다 써도 됨`·`직접 해야 함`·`섞어야 함`·`선례를 못 찾음`을 저장과 서버 응답에 그대로 두고, 화면에 보여 줄 때만 이미 있음·없음·일부만 있음·못 찾음으로 바꾼다.

## 끝났다고 말하는 법

"했다"는 말은 완료가 아니다. 작업이 끝나면 확인 명령을 실제로 돌리고 **그 출력을 그대로 보여 준다.** 타입 검사는 `npm run typecheck`, 빌드는 `npm run build`, 키 잔존은 `npm run scan:secrets`, 그 밖에 파일이 있는지·문자열이 남았는지는 ls·grep으로 본다. 내가 "확인해서 결과 보여 줘"라고 하면 이 뜻이다.

## 커밋 게이트

커밋 전 `git status`로 dirty·untracked를 확인한다. `.env*`·키·토큰·프록시 주소·개인정보가 포함되면 커밋하지 않는다. `npm run typecheck`와 `npm run scan:secrets`가 둘 다 0이어야 커밋한다.

Hermes 글로벌 설정(`~/.hermes/config.yaml`, `skills/`, `hooks/`, `SOUL.md`, `memories/`)은 건드리지 않는다.

Hooks(pre-commit 등)는 이 레포에 두지 않는다. 커밋 검증은 이 HERMES.md의 체크리스트로 사람이 확인한다.

이 레포 작업 세션의 모델은 **Solar Pro 4**, 개발 도구는 **Hermes Agent**만 사용한다(규정 하드 제약).