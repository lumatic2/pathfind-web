# pathfind-web 서버 API 계약

> 백엔드 레인(B)과 프론트·디자인 레인(F)의 유일한 접점. 바꾸려면 오케스트레이터(O)를 거친다.
> 소유: `docs/api-contract.md`. 엔드포인트 4개는 전부 같은 도메인 `/api`, POST JSON.
> 기준 문서: `../mabc-2026/docs/finals-plan-2026-09-12.md` §3·§5.

## 0. 공통

- 모든 요청은 `POST`, `Content-Type: application/json`.
- 응답도 `Content-Type: application/json`.
- 인증·사용자 입력은 없다. 사용자 프로필은 클라이언트 localStorage에만.
- 모든 `/api/*.js`는 함수가 HTTP POST 요청을 받도록 내보낸다: `export async function POST(request)`. 환경변수·비밀은 `process.env`로 읽는다.
- 본문은 `request.json()`으로 읽는다. 읽을 수 없으면 400.
- 비밀은 `process.env`(Vercel env)에만. 클라이언트 소스·응답 JSON·PRD·커밋에 키·토큰·프록시 주소 0.
- 모델 ID: `solar-pro4`(하이픈 없음). `max_tokens` 명시.

### 공통 오류 응답

```json
{ "error": "사람이 읽을 수 있는 한 줄 설명" }
```

| 상태 | 상황 |
| --- | --- |
| 400 | 요청 본문 누락·형식 오류·필수 필드 없음 |
| 405 | POST 아님 |
| 500 | 서버 내부 오류(Solar 호출 실패 포함). 구현 세부를 노출하지 않는다. |
| 429 | (서비스 수준) Solar가 429를 돌려주면 서버는 백오프 재시도 후 → 500 계열로 실패 보고. 클라이언트 재시도 로직은 앱이 담당. |

---

## 1. `/api/grill` — 정렬 인터뷰 1턴

pathfind 스킬의 "생각 명료화 인터뷰"를 한 턴씩 돌려준다. 좌 대화창이 이 엔드포인트를 반복 호출한다.

### 요청

```json
{
  "question": "string | 생략 가능(첫 턴에만)",
  "answer": "string | 생략 가능(예시 버튼 선택 시 등)",
  "history": [{ "questionTitle": "string", "questionBody": "string", "suggestion": "string", "exampleButtons": ["string"] }],
  "turnCount": "number (0-based, 직전까지 진행 턴 수)"
}
```

### 응답 (진행 중)

```json
{
  "questionTitle": "string (24자 이내)",
  "questionBody": "string",
  "suggestion": "string",
  "exampleButtons": ["string"],
  "done": false,
  "turnCount": "number (이번 턴 포함)"
}
```

### 응답 (인터뷰 종료)

```json
{
  "questionTitle": "",
  "questionBody": "",
  "suggestion": "",
  "exampleButtons": [],
  "done": true,
  "summary": "string (3-5문장, 구현 단계 설계에 쓸 수 있게)",
  "turnCount": "number"
}
```

- 인터뷰 상한: 최대 5턴. `turnCount >= 4`(0-based)는 서버가 done=true로 강제 종료하고 summary를 채운다.
- `done=true`면 다음 턴은 `/api/pathfind`로 넘어간다.

---

## 2. `/api/pathfind` — 큰 그림 + handoff 초안

인터뷰 요약을 받아 단계별 큰 그림(stages)과 handoff 마크다운 초안을 한 번에 만든다.
우측 로드맵 골격(단계 카드 흐름)을 여기서 처음 받는다.

### 요청

```json
{
  "summary": "string (grill summary 또는 초기 아이디어 문단)",
  "initialQuestion": "string (요약이 없을 때만 사용, 둘 중 하나 필요)"
}
```

### 응답

```json
{
  "bigPicture": {
    "title": "string (24자 이내)",
    "intro": "string (프로젝트 큰 그림 한 문장)",
    "stages": [
      {
        "no": "number",
        "title": "string (24자 이내)",
        "desc": "string (2-3문장)",
        "icon": "string (컴포넌트 아이콘 이름, 예: compass, code-xml, palette, flask-conical, rocket)",
        "tasks": [{ "order": "number", "task": "string", "why": "string" }],
        "verdict": "가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 선례를 못 찾음",
        "verdictReason": "string (판정 근거 한 줄)",
        "findings": [{ "kind": "오픈소스 | 무료 에셋 | 튜토리얼·블로그 | 참고 사례", "name": "string", "query": "string", "evidence": "string", "note": "string", "url": "string (빈 문자열 금지)" }],
        "choices": ["string"]
      }
    ],
    "prototypeLoop": "string"
  },
  "handoffMarkdown": "string (아직 검색이 붙지 않은 초안)"
}
```

- `stages` 배열 길이는 보통 5~7개.
- `bigPicture` 필드는 프론트가 로드맵을 그릴 수 있게 최소한으로 고정한다. 뒷단 `stage` 호출로 findings/url을 보강한다.
- verdicts 4종은 아래 §6으로 고정한다.

---

## 3. `/api/stage` — 단계 1개 검색 리서치

단계 1개를 받아 Solar의 도구 호출(tool calling)로 웹 검색을 수행하고 verdict·findings·options·todos로 채운다.
우측 패널이 단계 카드를 하나씩 채울 때 이 엔드포인트를 순서대로 호출한다.

### 요청

```json
{
  "stageIndex": "number (bigPicture.stages 내 인덱스, 0-based)",
  "stage": {
    "no": "number",
    "title": "string",
    "desc": "string",
    "icon": "string",
    "tasks": [{ "order": "number", "task": "string", "why": "string" }],
    "choices": ["string"]
  },
  "summary": "string (전체 요약, 검색 문맥용)"
}
```

- `stageIndex`는 프론트가 렌더링 순서와 로깅에 쓴다. 서버 응답 스펙에는 반영되지 않는다(서버는 `stage`로 작업).
- 검색 도구 호출 상한: 단계당 2회. 툴 콜 JSON이 깨지면 그 단계는 verdict "선례를 못 찾음"으로 채우고 전체를 죽이지 않는다(킷 규칙 "전체 실패 금지").

### 응답

```json
{
  "stage": {
    "no": "number",
    "title": "string",
    "desc": "string",
    "icon": "string",
    "tasks": [{ "order": "number", "task": "string", "why": "string" }],
    "verdict": "가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 선례를 못 찾음",
    "verdictReason": "string",
    "findings": [{ "kind": "string", "name": "string", "query": "string", "evidence": "string", "note": "string", "url": "string (빈 문자열 금지)" }],
    "choices": ["string"],
    "options": ["string"],
    "todos": [{ "task": "string", "owner": "가져다 씀 | 직접 함", "note": "string" }],
    "searched": true
  }
}
```

- `findings[0].url`이 실제 http(s) 주소임을 curl로 확인한다(배포 후 검증).
- `options`는 이 단계에서 갈 수 있는 선택지 branch. `choices`(source의 원 branch)보다 앱이 보여주는 분기용.
- `todos`는 "이미 있는 것 / 직접 해야 하는 것"을 구현 에이전트가 바로 쓸 수 있게 owner 표기로 바꾼 것.

---

## 4. `/api/handoff` — handoff 마크다운 최종본

단계 리서치 결과를 모아 최종 handoff 마크다운을 만든다. 앱 우측 하단 "handoff 다운로드·복사" 버튼이 이 엔드포인트를 부른다.

### 요청

```json
{
  "bigPicture": { /* /api/pathfind 응답의 bigPicture */ },
  "stages": [ /* /api/stage 응답을 단계 순서대로 쌓은 배열 */ ],
  "summary": "string"
}
```

### 응답

```json
{
  "handoffMarkdown": "string (한국어의 완전한 마크다운 문서)",
  "title": "string"
}
```

- handoff 문서는 다음 섹션을 포함한다.
  - `# 핸드오프 — [프로젝트 제목]`
  - `## 1. 아이디어 요약`
  - `## 2. 큰 그림` (단계 목록 + 각 단계 핵심 할 일)
  - `## 3. 단계별 리서치 결과` (각 단계 verdict, 찾은 자료, 선택지)
  - `## 4. prototype 루프 조언`
  - `## 5. 다음 액션` (가장 먼저 할 일 1-3개)
  - `## 6. 참고 링크` (전체 자료 링크 모음)
- 자료 출처 URL은 정확히 옮긴다. 없는 정보는 "확인 불가"로 표기. 추정하지 않는다.

---

## 5. 호출 순서 (클라이언트 시나리오)

시크릿 창 첫 방문 기준 최소 완주 흐름:

1. 앱 진입 → `/api/grill` 첫 턴 (question 또는 초기 문단)
2. 좌 대화: 답변 또는 예시 버튼 → `/api/grill` 반복 (최대 5턴)
3. 인터뷰 종료(`done=true`, summary) → `/api/pathfind` → 우측에 단계 카드 골격 렌더링
4. 단계 순서대로 `/api/stage` 순차 호출 → 각 카드에 findings·url·verdict·options·todos 채움
5. 마지막 단계까지 채워지면 handoff 버튼 활성화 → `/api/handoff` → 마크다운 다운로드·복사
6. "다시 시작" → localStorage·결과 초기화, 1로 복귀

이유: Vercel 함수 1회 실행 시간 상한, Tier 0 한도(100 RPM / 50,000 TPM), 우측 패널이 하나씩 채워지는 것이 "에이전트가 일한다"는 시연 자체.

---

## 6. 단계 verdict 4종 (고정 값)

| 값 | 의미 |
| --- | --- |
| `가져다 써도 됨` | 오픈소스·무료 에셋·튜토리얼·유사 사례로 대부분 덮을 수 있음 |
| `직접 해야 함` | 이 단계 핵심 과제는 외부 자료로 대체 불가, 직접 제작 필요 |
| `섞어야 함` | 외부 자료로 뼈대를 잡고 일부만 직접 함 |
| `선례를 못 찾음` | 검색 상한 내 유효한 선례를 못 찾음. 그 단계는 여기서 멈추고 뒤를 죽이지 않음 |

`verdictReason`은 한 줄. `findings`(최소 0건)와 함께 표시한다.

---

## 7. 검색 API 공급자에 대한 계약 입장

- 검색 API는 비-LLM 공개 외부 API라 규정 허용. 출처 표기.
- 사용자는 공급자 하나를 고른다(후보: Tavily / Brave Search / Naver 등). 키는 Vercel env `SEARCH_API_KEY`(sensitive, production+preview)에만.
- `/api/stage`는 `SEARCH_API_KEY`를 써서 검색한다. 공급자를 하드코드하지 않는다(환경변수 이름 하나로 추상화).
- 공급자 선정·배기·Vercel env 등록은 사람(H)이 한다. 코드는 키를 값으로 보지 않는다.

---

## 8. 아직 만들지 않는 것 (이번 제출 범위 밖)

- `/api/stage` 완료 전까지는 `/api/pathfind`의 `handoffMarkdown`이 초안이다. 검색이 붙지 않은 상태로도 handoff 버튼은 비활성/안내로 둔다.
- `api/debug-env.js`류의 키 노출 코드는 계약 범위에 없으며, 배포 전 제거 대상이다.

---

작성일: 2026-09-12. 이 문서의 필드는 `curl` 검증으로 닫는다. 프론트는 계약 확정 직후 mock JSON으로 먼저 만든다.
