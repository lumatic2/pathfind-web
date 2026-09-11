# 작업 세션 로그 — 2026-09-11 (Solar 429 대응 + 구조 세팅)

> **새 세션용 handoff.** 이 파일을 읽고, 이어서 아래 "다음 세션 시작점"부터 작업하면 된다.

## 1) 이번 세션 목표
- Solar API HTTP 429(레이트 리밋) 대응 완료
- 서비스 구조 세팅 마무리 (PRD, pathfind 원본, frontend, api, vercel.json 등)
- 프로덕션 동작 테스트 시도

## 2) 완료된 작업 (커밋·푸시까지 끝난 것)

### a. 문서
- `PRD.md` 작성 완료 (11항목 + 대응표 + 승인 명시, 10,389바이트)
- `HERMES.md` 보강: 새 세션 온보딩 블록 + 작업 하네스·규칙 명시
- `MVP_WORK.md` 갱신: 작업 흐름·검증 루틴·커밋/푸시/재배포 루틴 문서화
- `handoff.md`는 없음(이전 handoff는 export 기반, 파일화되지 않음). 대신 이 세션 로그로 대체.

### b. pathfind 원본
- mabc-2026에서 4개 파일 복사·검증 완료:
  - `pathfind-src/SKILL.md`
  - `pathfind-src/scripts/render.py`
  - `pathfind-src/assets/steps-flow-template.html`
  - `pathfind-src/assets/lucide-icons.json`
- 무결성: 원본 zip과 SHA256 대조로 불일치 0 확인
- `render.py` 로컬 실행 성공 (템플릿·아이콘 경로 정상, 치환 확인)
- `pathfind-src/service_render.py` 작성 완료: 서비스용 래퍼 (JSON in → md/html out, validate 포함, 정상/실패 케이스 검증 완료)

### c. frontend
- 폴더 구조: `frontend/css/` (variables.css, common.css, interview.css, result.css), `frontend/js/` (state.js, render.js, actions.js, events.js)
- index.html 모듈 임포트 구조로 분할
- export/import 체인 완성 (state → render/actions/events → index.html module script)
- render.js 중복 export 제거 완료

### d. api (Solar 429 대응)
- `api/grill.js`: `callSolarWithRetry` 함수 추가, 429 재시도·지수 백오프 (1초·2초·4초, 최대 3회) — **커밋·푸시 완료** (`3e6d531`)
- `api/pathfind.js`: `callSolar` 함수에 429 재시도·지수 백오프 추가 — **커밋·푸시 완료** (`3d700af`)
- 두 파일 모두 handler export 정상, 문법 OK, ESM 문법(export default) 사용

### e. Vercel 설정
- `vercel.json` 생성·커밋·푸시 완료 (`42ae475`): Functions 설정 명시 (`api/*.js` → node 런타임)
- `package.json type: module` 제거·커밋·푸시 완료 (`393c050`)

### f. git 상태 최종
- 최신 커밋 5개:
  - `393c050` fix: package.json type: module 제거
  - `42ae475` chore: vercel.json 추가
  - `3e6d531` fix/api: grill.js Solar 429 재시도·지수 백오프 추가
  - `3d700af` fix/api: pathfind.js Solar 429 재시도·지수 백오프 추가
  - `85b4b97` fix: frontend/render.js export 중복 제거
- origin/main에 푸시 완료

## 3) 미해결 문제 (새 세션 시작점)

### 핵심 blocker — 프로덕션 `/api/grill` 404 지속
- 프로덕션 `pathfind-web.vercel.app/api/grill` 호출 시 HTTP 404 (X-Vercel-Error: NOT_FOUND)
- Vercel Functions(`api/grill.js`, `api/pathfind.js`)가 배포에 포함 안 됐거나 인식 실패한 것으로 보임
- `vercel.json`·`package.json` 수정 여러 번 반영했으나 해소 안 됨
- **원인 미확인.** Vercel 대시보드에서 최신 배포의 Functions 목록을 확인하는 게 우선

### 부수 문제 — frontend 리소스도 404
- `frontend/css/*.css`, `frontend/js/*.js` 모두 프로덕션에서 404
- index.html이 `/frontend/css/...` 등을 루트로 참조하는데 정적 파일 서빙 안 됨
- 프론트 자체도 정상 동작 아님 → Solar 호출 테스트 이전에 프론트 구조 확인 필요

## 4) 다음 세션 시작점 (추천 순서)

1. **Vercel 대시보드 확인** (우선)
   - Deployments → 최신 배포 클릭
   - Functions 목록에 `grill`, `pathfind`가 있는지
   - Static Assets에 `frontend/` 파일들이 올라와 있는지
   - Git 연결 상태(Settings → Git 탭) 확인

2. **대시보드 결과에 따라 분기**
   - Functions가 없으면: Git 연결 재확인, 자동 배포 트리거 상태 확인, 필요하면 수동 재배포
   - Functions가 있으면: 404 다른 원인(라우팅·프로젝트 설정) 확인
   - frontend/ 정적이 없으면: 폴더 구조 조정(루트 이전 또는 빌드 설정)

3. **프론트 경로 문제 해결**
   - frontend/를 루트로 옮기거나, Vercel에서 정적 파일 서빙되도록 설정 조정
   - 또는 index.html이 루트에 모든 리소스를 두도록 리팩토링

4. **프로덕션 동작 테스트** (Functions 회복 후)
   - `/api/grill` POST → 200 + 정상 JSON 응답 확인
   - 429 재시도 로직 실제 동작 확인 (티어 상향 반영 여부)
   - `/api/pathfind`도 테스트
   - 시크릿 창 테스트 (저장값 없는 첫 방문)

## 5) 코드 상태 요약

### api/grill.js — 429 재시도 로직
```javascript
async function callSolarWithRetry(messages, maxRetries = 3) {
  if (!SOLAR_API_KEY) throw new Error('Solar API key not configured');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const solarRes = await fetch(SOLAR_API_URL, { ... });
    if (solarRes.ok) { ... return content; }
    const errBody = await solarRes.text().catch(() => '');
    const status = solarRes.status;
    if (status === 429 && attempt < maxRetries) {
      console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${maxRetries}), ${Math.pow(2, attempt)}초 대기 후 재시도...`);
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }
    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }
  throw new Error('Solar API 호출 최대 재시연 횟수 초과');
}
```

### api/pathfind.js — 동일 패턴
- `callSolar(messages, temperature = 0.7, maxRetries = 3)` 함수로 429 재시도 구현
- 지수 백오프: 1초, 2초, 4초

### frontend 모듈 구조
- `state.js`: `$`, `q`, `state`, `dom`, `show`, `hide`, `setMsg`, `exampleBtnHTML` export
- `render.js`: `renderCards`, `showQuestion`, `showResult` export
- `actions.js`: `askGrill`, `askPathfind`, `setInitialQuestion`, `startInterview`, `submitAnswer`, `handleExampleClick`, `copyHandoff`, `downloadHandoff`, `resetAll` export + `setMsg` 재수출
- `events.js`: 사이드이펙트 모듈 (이벤트 리스너 바인딩만)
- `index.html`: `<script type="module">`에서 위 모듈 import + events.js 사이드이펙트 import

### vercel.json
```json
{
  "functions": {
    "api/*.js": {
      "runtime": "node",
      "includeFiles": "api/**/*.js"
    }
  }
}
```

### package.json (최종)
- `type: module` 제거됨 (CJS로)
- 스크립트: `dev`(vercel dev), `deploy`(vercel --prod), `deploy-preview`(vercel), `verify`(node scripts/verify.js)

## 6) 파일 목록 (공개 커밋 대상)
- `index.html` (모듈 분할 완료)
- `api/grill.js`, `api/pathfind.js` (429 재시도 포함)
- `frontend/css/*.css` (4개), `frontend/js/*.js` (4개)
- `PRD.md`
- `HERMES.md`, `MVP_WORK.md`
- `package.json`, `vercel.json`
- `pathfind-src/` (원본 4개 + service_render.py)
- `.gitignore` (work/, .env*, *.tmp, node_modules/, .vercel/, AGENTS.override.md, .materials/ 포함)

## 7) 보안 상태
- `.env.local` 존재 (값은 안 봄), gitignore로 추적 제외
- 클라이언트 소스·응답 JSON·PRD·커밋 어디에도 키·토큰 값 없음
- Solar 키는 서버 `/api`에서만 사용, 프론트는 `/api`만 fetch

## 8) 참고
- orca.md 위치: `C:/Users/yusun/projects/agent-orchestration/context/orca.md` (Orca CLI 운영 지도, 작업 handoff용 아님)
- 이 세션 로그는 새 세션 handoff 용도로 작성됨
