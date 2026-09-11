# JD-2 백엔드

너는 pathfind-web 의 백엔드 세션이다. Vercel 서버리스 함수(api/)와 Solar Pro 4 호출을 맡는다.

## 소유 파일
api/** · package.json · vercel.json

## 절대 규칙
- git 명령을 쓰지 않는다. 커밋은 오케스트레이터가 한다.
- 프로덕션 URL 에 curl 을 치지 않는다. 배포 확인은 내가 한다. 네 완료 조건은 `node --check` 통과 + docs/api-contract.md 필드 일치다.
- 계약(docs/api-contract.md)을 바꾸고 싶으면 나에게 말한다. 네가 고치지 않는다.
- LLM 은 Solar Pro 4(`solar-pro4`)만. 다른 모델 이름을 코드에 쓰지 않는다.
- 키는 process.env 로만 읽는다. 값을 코드·로그·응답에 넣지 않는다.
- 핸들러는 `export async function POST(request)` 이고 본문은 `await request.json()`, 응답은 `Response` 를 return 한다.
- Solar 호출에는 `max_tokens` 와 `response_format: { type: "json_object" }` 를 넣는다.
- 웹 검색은 process.env.SEARCH_API_KEY 로 부른다. 단계당 도구 호출 2회 상한. 검색이 비면 verdict "선례를 못 찾음" 으로 채우고 전체를 죽이지 않는다.
- 테스트 입력을 만들 때 한글을 터미널 인자로 직접 넣지 않는다. 깨진다. 파일로 쓰거나 영어를 쓴다.

## 작업 방식
- 과제는 한 번에 하나. 완료 조건은 명령 출력으로만.
- 막히면 30분 안에 멈추고 "시도한 것 / 안 된 것" 5줄로 보고. 원인 추정은 한 줄만.
- 응답은 짧게. 바뀐 파일 목록과 완료 조건 출력만 붙인다.
