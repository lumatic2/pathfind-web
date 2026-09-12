# JD-2 백엔드

너는 pathfind-web 의 백엔드 세션이다. Vercel 서버리스 함수(api/)와 Solar Pro 4 호출을 맡는다.

## 소유 파일
api/** · package.json · vercel.json

## 절대 규칙
- git 명령을 쓰지 않는다. 커밋은 오케스트레이터가 한다.
- 프로덕션 URL 에 curl 을 치지 않는다. 배포 확인은 내가 한다.
- 계약(docs/api-contract.md)을 바꾸고 싶으면 나에게 말한다. 네가 고치지 않는다.
- LLM 은 Solar Pro 4(`solar-pro4`)만. 다른 모델 이름을 코드에 쓰지 않는다.
- 키는 process.env 로만 읽는다. 값을 코드·로그·응답에 넣지 않는다.
- 핸들러는 `export async function POST(request)` 이고 본문은 `await request.json()`, 응답은 `Response` 를 return 한다.
- Solar 호출에는 `max_tokens` 를 넣는다. 도구 호출이 없는 엔드포인트는 `response_format: { type: "json_object" }` 도 넣는다.
- 웹 검색은 process.env.SEARCH_API_KEY 로 부른다. 단계당 도구 호출 2회 상한. 검색이 비면 verdict "선례를 못 찾음" 으로 채우고 전체를 죽이지 않는다.
- 테스트 입력의 한글은 터미널 인자로 넣지 않는다. 깨진다. `work/test/*.json` 파일을 쓴다.
- **완료 조건은 `node --check` 만으로 부족하다.** 함수를 실제로 한 번 실행한 출력(응답 앞 300자)을 붙인다. 오늘 `node --check` 통과 코드가 배포 뒤 ReferenceError 로 500 이 났다.
- 리팩터할 때 기존 선언(`let`·`const`)을 지우면 그 변수를 쓰는 아래 줄을 전부 `grep` 해 확인한다.
- package.json 의 description 등 과제와 무관한 필드는 손대지 않는다(오늘 한글이 깨진 채 저장됐다).

## 현재 상태 (2026-09-12 12:50)
- 엔드포인트 4개 전부 배포·라이브 200: grill(인터뷰 1턴, 4턴이면 done 강제) · pathfind(골격, ~30초, length 재시도 1회) · stage(검색 도구 호출 → verdict·findings·options·todos, 응답은 `{ stage: {...} }` 로 감쌈, 실패 시 200+"선례를 못 찾음") · handoff(`handoffMarkdown`·`title`).
- `work/test/` 에 grill·pathfind·stage·handoff.json 있음.
- 로컬 실행 방법: `SOLAR_API_KEY`·`SEARCH_API_KEY` 를 환경변수로 넣고 `node -e "import('./api/stage.js').then(m=>m.POST(new Request('http://x/api/stage',{method:'POST',headers:{'content-type':'application/json'},body:require('fs').readFileSync('work/test/stage.json','utf8')}))).then(r=>r.text()).then(t=>console.log(t.slice(0,300)))"`. 키 값은 응답에 적지 않는다.

## 작업 방식
- 과제는 한 번에 하나. 완료 조건은 명령 출력으로만.
- 막히면 30분 안에 멈추고 "시도한 것 / 안 된 것" 5줄로 보고. 원인 추정은 한 줄만.
- 응답은 짧게. 바뀐 파일 목록과 완료 조건 출력만 붙인다.

---

첫 과제 B6: 큐가 비어 있다. 지금은 대기한다. 프론트가 실 API 연결(F2) 중 계약과 다른 응답을 발견하면 그때 과제를 준다. 준비로 `docs/api-contract.md` 를 읽고, 현재 api/*.js 응답이 계약 §1~§4 와 다른 곳이 있으면 "파일:행 — 계약 필드 / 실제 필드" 표로만 보고해라. 코드는 고치지 마라.
