# pathfind-web

> 만들려는 일을 한 문단 받아 → 짧은 정렬 인터뷰(5턴) → 구현을 위한 큰 단계와 각 단계의 할 일, 그리고 각 단계마다 "이미 있는 것 / 직접 해야 하는 것"을 가른 경로 + handoff.md 문서를 주는 서비스.

[MABC 2026 결선](https://github.com/lumatic2/mabc-2026) 산출물 전용 공개 웹 서비스 MVP.
예선 당선 스킬 **`pathfind`** 를 계정 없이 URL로 접속해 쓰는 웹 서비스로 확장한 것이다.

- **공개 URL**: <https://pathfind-web-five.vercel.app>
- **소스**: <https://github.com/lumatic2/pathfind-web> (Public)
- **모델**: Solar Pro 4 (Upstage) — 서버 측(`/api`)에서만 호출
- **개발 도구**: Hermes Agent

## 서비스 구조

브라우저(`index.html` + `frontend/`)가 같은 도메인의 `/api/*`만 호출한다.

```
브라우저 (index.html + frontend/js/*.js + frontend/css/*.css)
  │
  ├─ POST /api/grill      정렬 인터뷰 1턴
  ├─ POST /api/pathfind   큰 그림 + handoff.md 초안
  ├─ POST /api/stage      단계 1개 검색 리서치
  └─ POST /api/handoff    handoff 마크다운 최종본
  ▼
Vercel 서버리스 (api/*.js)
```

- **진입**: `index.html` (정적 화면)
- **서버**: `api/grill.js`, `api/pathfind.js`, `api/stage.js`, `api/handoff.js` — Vercel 서버리스 함수
- **프론트**: `frontend/js/*.js`, `frontend/css/*.css`
- **계약**: `docs/api-contract.md` (엔드포인트 4개, 공통 오류, 호출 순서, verdict 4종)
- **아키텍처**: `docs/architecture.md`

## 예선 스킬 연결 (pathfind → 서비스)

| pathfind 원본 | 서비스 대응 |
| --- | --- |
| `pathfind-src/SKILL.md` | 서비스 핵심 로직의 출처 스킬 |
| `pathfind-src/scripts/render.py` | 웹 변환 대상 (현재 서비스는 Solar 직접 반환) |
| `pathfind-src/assets/steps-flow-template.html` | 단계 흐름 템플릿 참조 |
| `pathfind-src/assets/lucide-icons.json` | 아이콘 목록 참조 |
| pathfind 데이터 경로(큰 단계 + verdict·findings·선택지) | `api/pathfind.js` bigPicture → `api/stage.js` 단계 리서치 → `api/handoff.js` 최종 handoff |

서비스화를 위한 수정·확장은 허용되며, 변경 내역은 PRD 스킬 매핑에 적는다.

## 로컬 실행법

```bash
# 1) 저장소 복제
git clone https://github.com/lumatic2/pathfind-web.git
cd pathfind-web

# 2) 비밀 설정 (서버 측만)
# .env.local 에 SOLAR_API_KEY=... 를 넣는다 (gitignore 처리됨, 커밋하지 말 것)

# 3) Vercel 개발 서버 (선택)
npm install -g vercel
vercel dev
# 또는 Vercel 대시보드에서 배포 후 프로덕션 URL로 확인
```

- `vercel.json`이 `api/*.js` → node 런타임을 지정한다.
- 로컬에서 `vercel dev` 없이 확인하려면 `api/*.js`를 직접 실행하지 말고, Vercel에 배포한 프로덕션 URL에서 검증한다.
- 사용자 프로필은 `localStorage`에만 저장한다(계정 없음).

## 규칙 (요약)

- LLM은 **Solar Pro 4만**. 외부 LLM 호출 금지.
- 개발 도구는 **Hermes Agent만**.
- **키·토큰·프록시 주소를 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 넣지 않는다.** 비밀은 서버(`/api`)에만.
-예선 당선 스킬 `pathfind`가 서비스 핵심 로직에 반드시 포함된다.
- 매 배포는 전체 파일 세트를 다시 올린다.

## 문서

- `HERMES.md` — 레포 규약 (새 세션은 이것을 먼저 읽는다)
- `docs/api-contract.md` — 서버 API 계약
- `docs/architecture.md` — 서비스 아키텍처
- `PRD.md` — 미니 PRD
- `work/SESSION_LOG_20260911.md` — 과거 세션 로그(handoff용)
- `work/orca.md` — Orca CLI 운영 지도(실측 판정서)
