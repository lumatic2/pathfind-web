# pathfind-web — Pathfinder

하려는 일을 한 문단 적으면, 짧은 인터뷰로 생각을 정리하고 → 웹·오픈소스·법령·공공데이터·통계
다섯 곳을 뒤져 → 단계마다 **이미 있어서 가져다 쓸 것**과 **직접 만들 것**을 갈라 → 로드맵(마인드맵)과
PATH.md 로 내놓는 서비스입니다. **MABC 2026 결선 출품작**(예선 당선 스킬 `pathfind` 의 웹 서비스판)입니다.

**공개 URL**: https://pathfind.askewly.com

## 지금 이 사이트는 데모입니다 (2026-09-20)

대회 심사가 끝나(2026-09-19 발표회) 이 사이트는 제출물이 아니라 **프로젝트 소개**로 서 있습니다.
그래서 실 API 배선을 걷어냈습니다 — 서버리스 함수 0, 환경변수 0, 외부 호출 0.

- 앱에서 예시 주제 3개 중 하나를 고르면, **실제로 한 번 돌린 조사를 녹화한 것**을 그대로 재생합니다
  (인터뷰 → 조사 6단계 → 마인드맵 → 노드 설명 → PATH.md 내려받기까지 완주합니다)
- 녹화 재생이라 자유 입력은 잠겨 있습니다
- 재생 코드: `frontend/src/lib/demo-player.ts` · 녹화 데이터: `public/demo/`

**심사에 낸 그 형상은 태그로 남아 있습니다** — `submission-2026-09-16`(2026-09-16 23:57 배포본).
그때는 `api/` 6함수가 Solar Pro 4 를 서버에서 호출했습니다.

```bash
git show submission-2026-09-16:api/pathfind.js   # 제출 시점 서버 코드
```

- **모델**(제출 당시): Solar Pro 4 (Upstage) — 서버 측(`/api`)에서만 호출
- **개발 도구**(제출 당시): Hermes Agent

---

## 실행

```bash
# 1) 저장소 복제
git clone https://github.com/lumatic2/pathfind-web.git
cd pathfind-web

# 2) 종속성 설치
npm install

# 3) 개발 서버 (키 불요 — 데모 재생이라 서버가 없다)
npm run dev
#    http://localhost:5173
```

- 빌드 결과 확인은 `npm run build && npm run preview`(http://localhost:5199).
- 빌드: `npm run build`
- 배포: `npm run deploy`

---

## 환경변수 (이름만 — 제출 당시)

⚠ **지금은 하나도 쓰지 않는다**(서버가 없다). 아래는 `submission-2026-09-16` 시점의 목록이다.
서버(`/api`)가 `process.env`에서 읽던 변수다. 값은 `.env.local`(gitignore·vercelignore)에 넣고 절대 커밋하지 않는다.

| 이름 | 용도 |
| --- | --- |
| `SOLAR_API_KEY` | Solar Pro 4 호출 |
| `SEARCH_API_KEY` | 웹 검색 공급자 호출 |
| `NAVER_CLIENT_ID` | 네이버 검색 API |
| `NAVER_CLIENT_SECRET` | 네이버 검색 API |
| `KOSIS_API_KEY` | KOSIS 공공데이터 |
| `LAW_API_OC` | 국가법령정보센터 |
| `GITHUB_MCP_TOKEN` | GitHub (선택) |
| `DATA_GO_KR_KEY` | 공공데이터포털 (선택) |
| `HERMES_RELAY_URL` | Hermes 릴레이 (api/hermes 폴더가 있을 때만) |
| `HERMES_API_KEY` | Hermes 릴레이 (api/hermes 폴더가 있을 때만) |

`VITE_` 접두 환경변수는 만들지 않는다. 번들에 인라인되어 비밀 노출 위험이 있다.

---

## 구조

```
index.html            랜딩 화면 — 시작하기를 누르면 app.html 로 이동
app.html              앱 화면 — 세 패널(왼쪽 조사 결과 / 가운데 대화·중계 / 오른쪽 로드맵 마인드맵)

public/demo/          데모 녹화 — manifest.json + 시나리오 3벌(woodwork·lease·indie)
                      ⚠ api/ 는 없다. 제출 시점 서버 코드는 submission-2026-09-16 태그에 있다

frontend/src/
  app/                앱 진입·셸
  state/              타입·저장·흐름·파생 상태
  lib/api.ts          데이터 진입점 — 데모 빌드에서는 재생기로 간다
  lib/demo-player.ts  녹화 재생기 (순서·키 매칭)
  landing/            랜딩 진입 (디자인 시스템 레포 examples/glide-landing 복사본)

frontend/src/components/   https://ui.askewly.com 레지스트리 설치본 — 손으로 고치지 않는다
  mindmap-spine-tree
  grounded-source-panel
  chat-conversation-panel
  studio-artifact-panel
  (그 외 ui/ 프리미티브: button, dialog, popover, checkbox, accordion, editable-text, citation-ladder, notebook-workspace-shell)

pathfind-src/         예선 당선 스킬 원문 — 절대 수정하지 않는다
  SKILL.md
  scripts/render.py
  assets/steps-flow-template.html
  assets/lucide-icons.json

PRD.md                미니 PRD (제출물)
HERMES.md             레포 규약 (새 세션은 이것을 먼저 읽는다)
docs/api-contract.md  서버 API 계약
```

- **진입**: `index.html`(랜딩) → `app.html`(앱). 둘 다 `vite.config.ts`의 빌드 입력.
- **서버**: `api/*.js` 함수 하나가 엔드포인트 하나. 기존 `grill`·`pathfind`·`stage`·`handoff` 넷은 요청·응답 모양을 바꾸지 않는다. 신설은 `explain`·`chat`·`outline`·`source-card`.
- **앱 상태 모양**: `docs/app-state.md`
- **제출물**: `PRD.md`, `README.md`

---

## 사용한 외부 API · 출처 표기

규정상 비-LLM 공개 외부 API는 허용된다. 사용 시 출처를 표기한다.

1. **네이버 검색** — `api/_channels/naver.js`
2. **GitHub** — `api/_channels/github.js`
3. **공공데이터포털** — `api/_channels/public-data.js`
4. **KOSIS** — `api/_channels/kosis.js`
5. **국가법령정보센터** — `api/_channels/law.js`

---

## 디자인 자산 출처

`frontend/src/components/`는 `https://ui.askewly.com` 레지스트리 설치본이다. 손으로 고치지 않는다. 재설치는 `npx shadcn@latest add https://ui.askewly.com/r/<이름>.json --overwrite`.

주요 자산 네 가지:

- `mindmap-spine-tree` — 오른쪽 로드맵 마인드맵
- `grounded-source-panel` — 왼쪽 조사 결과 패널
- `chat-conversation-panel` — 가운데 대화· 중계 패널
- `studio-artifact-panel` — 아트팩트 패널

---

## 예선 당선 스킬 원문

서비스 코어는 예선에서 당선된 스킬 `pathfind`의 원문 그대로를 출발점으로 쓴다. 원문은 `pathfind-src/` 폴더에 있다.

- `pathfind-src/` 안의 파일 네 개(`SKILL.md`, `scripts/render.py`, `assets/steps-flow-template.html`, `assets/lucide-icons.json`)는 예선에 낸 zip과 파일 구성과 내용이 같다. 해시 대조 결과(PRD 6) 참조.
- 이 폴더 자체는 고치지 않는다. 서비스로 늘린 부분은 전부 `api/`와 `frontend/` 쪽 후처리다.

## 결과물 규격

- 화면을 "로드맵"이라 부르지 않는다. 결과물은 **패스(path)** 다.
- 왼쪽 문서(planning + 단계별 조사 결과)와 내려받는 **PATH.md**는 다르다. 왼쪽 문서는 승인 후 선행 조사 기록(planning)과 단계마다 조사 결과가 폴더·파일로 쌓이는 참고용 트리이고, PATH.md는 큰 그림과 단계별 조사 결과를 모아 `handoff.js`가 최종 조립해 내려보내는 하나의 마크다운 파일이다.
- 내려받는 파일은 `PATH.md`다. `handoff.md`가 아니다.
- 판정 4종은 계약 값을 그대로 저장·응답에 둔다: `가져다 써도 됨`·`직접 해야 함`·`섞어야 함`·`선례를 못 찾음`. 화면 표시 때만 이미 있음·없음·일부만 있음·못 찾음으로 바꾼다.

---

## 규칙 (요약)

- LLM은 **Solar Pro 4만**. 모델 ID는 `solar-pro4`(하이픈 없음), `max_tokens` 명시. 외부 LLM 호출 금지.
- 개발 도구는 **Hermes Agent만**.
- **키·토큰·프록시 주소를 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 넣지 않는다.** 비밀은 서버(`/api`)의 `process.env`에만.
- 예선 당선 스킬 `pathfind`가 서비스 핵심 로직에 반드시 포함된다. `pathfind-src/`는 원문 그대로 두고 절대 수정하지 않는다.
- 매 배포는 전체 파일 세트를 다시 올린다.
