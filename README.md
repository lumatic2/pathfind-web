# pathfind-web

만들려는 일을 한 문단 받아 → 짧은 정렬 인터뷰로 생각을 정리한 뒤 → 웹 검색으로 기존 해결책·사례를 모아 → 단계마다 "이미 있는 것 / 직접 해야 하는 것"을 가른 경로와 handoff 마크다운을 주는 서비스.

**공개 URL**: https://pathfind.askewly.com  
**배포본**: 배포 전. 첫 Vercel 배포 후 여기에 커밋 해시를 채운다. 현재는 비어 있음. (예: 배포 후 `deploy: <commit hash>` 형태로 채움)

MABC 2026 결선 산출물 전용 공개 웹 서비스 MVP. 예선 당선 스킬 `pathfind`를 계정 없이 URL로 접속해 쓰는 웹 서비스로 만든 것이다.

- **모델**: Solar Pro 4 (Upstage) — 서버 측(`/api`)에서만 호출
- **개발 도구**: Hermes Agent

---

## 실행

```bash
# 1) 저장소 복제
git clone https://github.com/lumatic2/pathfind-web.git
cd pathfind-web

# 2) 종속성 설치
npm install

# 3) 비밀 설정 (서버 측만 — .env.local, gitignore 처리됨, 커밋 금지)
#    아래 환경변수 이름 목록의 키를 .env.local 에 넣는다. 값은 적지 않는다.

# 4) Vercel 개발 서버 (로컬 실행)
vercel dev
#    포트 3000. http://localhost:3000 에서 확인.
```

- `npm run dev`는 Vite만 띄운다. 화면은 뜨지만 `/api`가 404이므로 서버 기능은 확인할 수 없다. 반드시 `vercel dev`를 쓴다.
- 빌드: `npm run build`
- 배포: `npm run deploy`

---

## 환경변수 (이름만)

서버(`/api`)가 `process.env`에서 읽는 변수다. 값은 `.env.local`(gitignore·vercelignore)에 넣고 절대 커밋하지 않는다.

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

api/                  Vercel 서버리스 함수 — 파일 하나 = 엔드포인트 하나
  grill.js            정렬 인터뷰 1턴
  pathfind.js         큰 그림(stages) + handoff 마크다운 초안
  stage.js            단계 1개 검색 리서치
  handoff.js          handoff 마크다운 최종본
  explain.js          노드 설명
  chat.js             조사 후 대화
  outline.js          개요
  source-card.js      출처 카드
  _lib/               서버 공용 코드 (예: solar.js)
  channels/           조사 채널 — 외부 검색·데이터 공급자를 추상화
    naver.js          네이버 검색
    github.js         GitHub
    public-data.js    공공데이터포털
    kosis.js          KOSIS
    law.js           국가법령정보센터

frontend/src/
  app/                앱 진입·셸
  state/              타입·저장·흐름·파생 상태
  lib/api.ts          서버 호출
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

1. **네이버 검색** — `api/channels/naver.js`
2. **GitHub** — `api/channels/github.js`
3. **공공데이터포털** — `api/channels/public-data.js`
4. **KOSIS** — `api/channels/kosis.js`
5. **국가법령정보센터** — `api/channels/law.js`

---

## 디자인 자산 출처

`frontend/src/components/`는 `https://ui.askewly.com` 레지스트리 설치본이다. 손으로 고치지 않는다. 재설치는 `npx shadcn@latest add https://ui.askewly.com/r/<이름>.json --overwrite`.

주요 자산 네 가지:

- `mindmap-spine-tree` — 오른쪽 로드맵 마인드맵
- `grounded-source-panel` — 왼쪽 조사 결과 패널
- `chat-conversation-panel` — 가운데 대화· 중계 패널
- `studio-artifact-panel` — 아트팩트 패널

---

## 결과물 규격

- 화면을 "로드맵"이라 부르지 않는다. 결과물은 **패스(path)** 다.
- 내려받는 파일은 `PATH.md`다. `handoff.md`가 아니다.
- 판정 4종은 계약 값을 그대로 저장·응답에 둔다: `가져다 써도 됨`·`직접 해야 함`·`섞어야 함`·`선례를 못 찾음`. 화면 표시 때만 이미 있음·없음·일부만 있음·못 찾음으로 바꾼다.

---

## 규칙 (요약)

- LLM은 **Solar Pro 4만**. 모델 ID는 `solar-pro4`(하이픈 없음), `max_tokens` 명시. 외부 LLM 호출 금지.
- 개발 도구는 **Hermes Agent만**.
- **키·토큰·프록시 주소를 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 넣지 않는다.** 비밀은 서버(`/api`)의 `process.env`에만.
- 예선 당선 스킬 `pathfind`가 서비스 핵심 로직에 반드시 포함된다. `pathfind-src/`는 원문 그대로 두고 절대 수정하지 않는다.
- 매 배포는 전체 파일 세트를 다시 올린다.
