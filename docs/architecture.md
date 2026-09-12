# 서비스 아키텍처 — pathfind-web (Vercel 서버리스)

> 이 문서는 **현재 이 레포의 실제 코드 기준**으로 쓴 것이다.
> 배포 플랫폼은 Vercel 서버리스. 기본 제약(Solar Pro 4만, 키 클라이언트 0, pathfind 포함)만 지킨다.

## 한 줄 요약

브라우저(`index.html` + `frontend/`)가 같은 도메인의 `/api/*`만 호출하는 구조.
`/api` 뒤는 Vercel 서버리스 함수 하나가 받아, `/api/grill`, `/api/pathfind`, `/api/stage`, `/api/handoff`로 분기한다.
그 외 정적 요청은 `index.html`·`frontend/` 자산을 서빙한다.

```
브라우저 (index.html + frontend/js/*.js + frontend/css/*.css)
  │
  │  POST /api/grill      ← 정렬 인터뷰 1턴씩
  │  POST /api/pathfind   ← 큰 그림 + handoff.md 초안
  │  POST /api/stage      ← 단계 1개 검색 리서치
  │  POST /api/handoff    ← handoff 마크다운 최종본
  ▼
Vercel 서버리스 (api/*.js)
  │
  ├─ /api/grill    → api/grill.js     (POST(request))
  ├─ /api/pathfind → api/pathfind.js  (POST(request))
  ├─ /api/stage    → api/stage.js     (POST(request))
  └─ /api/handoff  → api/handoff.js   (POST(request))
```

## 서버 함수 구성

|| 파일 | 역할 |
|| --- | --- |
|| `api/grill.js` | 정렬 인터뷰 핸들러. `export async function POST(request)` |
|| `api/pathfind.js` | 큰 그림 + handoff 초안 핸들러. `export async function POST(request)` |
|| `api/stage.js` | 단계 1개 검색 리서치 핸들러. `export async function POST(request)` |
|| `api/handoff.js` | handoff 마크다운 최종본 핸들러. `export async function POST(request)` |
|| `frontend/` | 브라우저에 가는 정적 파일 |
|| `index.html` | 진입 화면 |

## 비밀 경계

- **서버 측(Vercel env)에 숨기는 것**
  - `SOLAR_API_KEY` — Vercel 환경변수( sensitive, production+preview)에 등록
  - 용도: 정렬 인터뷰(5턴) + pathfind bigPicture/handoff/stage 생성
  - 값 자체는 대화·코드·산출물·응답 JSON 어디에도 적지 않는다.

- **공개 가능한 값 (Vercel env plain)**
  - `SOLAR_API_URL` = `https://api.upstage.ai/v1/chat/completions`
  - `SOLAR_MODEL` = `solar-pro4`

- **클라이언트 측(브라우저)에 절대 안 가는 것**
  - `SOLAR_API_KEY` (Vercel env)
  - `index.html`, `frontend/js/*.js`, `api/*.js` 어디에도 키·프록시 주소 없음

## 사용자 프로필 (계정 없음)

- 사용자 프로필은 브라우저 `localStorage`에만 저장.
- 재방문 시 다시 묻지 않고, 저장된 상태(인터뷰 중간/결과)로 복원.
- 초기화 버튼 제공 → `localStorage`에서 상태 제거 후 초기 화면으로 복귀.

## pathfind 스킬 데이터 경로 이식 현황

- PRD 스킬 매핑에는 "pathfind의 데이터 경로(큰 단계 + 각 단계 verdict·findings·선택지)를 그대로 이식"이라 적혀 있다.
- **현재 `api/pathfind.js`는 Solar 하나로 bigPicture JSON + handoff.md를 생성**하며,
  원본 pathfind 스킬이 하던 "단계마다 웹 검색 1회 → findings"를 실제 웹 검색으로 수행하지는 않는다.
- 이 차이가 대회 규정(예선 당선 스킬 pathfind가 서비스 핵심 로직에 반드시 포함)과 걸리는지 여부는 **별도 확인 필요**.

## 참조

- 서버 API 계약: `docs/api-contract.md` (엔드포인트 4개, 공통 오류, 호출 순서, verdict 4종)
- render.py 위치: `pathfind-src/scripts/render.py`, `pathfind-src/scripts/service_render.py`.
  현재 서비스는 render.py를 거치지 않고 Solar가 직접 JSON/마크다운을 반환하는 구조.
