# pathfind 웹 서비스 MVP — 작업 노트

##概要
- **과제**: pathfind 스킬을 계정 없이 URL로 쓰는 공개 웹 서비스 MVP로 확장
- **스킬**: pathfind (예선 당선 스킬) + skill-to-service (결선 킷)
- **레포**: C:\Users\yusun\projects\pathfind-web (공개)
- **목표 플랫폼**: Vercel 배포, 프로젝트 도메인 `pathfind-web.vercel.app` 형태

## 세션 세션 정보
- **날짜**: 2026-09-10
- **스킬 호출**: pathfind (A-0 건강검진용 1회), grill-me 스킬 실데이터 확인 (web_extract 1회)
- **상태**: A-0 완료, A-1(WHO·WHEN·INPUT/OUTPUT) 진행 중, SETUP 진입 전

---

## A-0: 스킬 건강검진 (pathfind)

### pathfind 재료 명세서

| 항목 | 내용 |
|------|------|
| **입력** | JSON 객체: `topic`(string), `out_md`(string), `out_html`(string), `search_calls`(int), `steps[](array)` |
| **출력** | render.py가 `research-note-<topic>.md` + `flow-<topic>.html` 두 파일을 생성하고 stdout에 경로·바이트 출력 |
| **반환하지 못하는 것** | 스킬 자체는 웹 검색을 내장하지 않음. 호출자가 단계별 웹 검색 수행해 findings 채움. 데이터·URL·검색 결과는 모두 호출자 책임. |
| **실패 방식** | JSON 스키마 검증 실패 시 stderr ERROR + exit 2. 템플릿 파일 없거나 출력 경로가 작업공간 밖이면 실패. |
| **필요 설정** | render.py가 읽는 `assets/steps-flow-template.html`, `assets/lucide-icons.json`이 스킬 디렉토리에 있어야 함. 외부 키·계정·환경변수 불필요. 표준 라이브러리만 사용. |
| **이 스킬로 할 수 없는 일 3가지** | 1) 웹 검색 자체 수행 안 함 2) 실행 종료 후 결과를 채팅·브라우저에 자동 공유 안 함 3) 서비스 배포·라우팅·인증 등 서비스화 기능 전혀 없음 |

### 판정
pathfind는 서비스화하기에 충분한 소프트웨어를 갖추고 있음. 다만 웹 검색이 내장되지 않아 서비스화 시 /api에서 검색을 대신하거나, 프론트에서 검색 결과를 받아 render.py 로직만 이식하는 구조 선택 필요.

---

## A-1: 서비스를 위한 5 걸음

### ① WHO — 누가 내 서비스를 쓸까 [결정 완료]

- **타겟 사용자**: 20대 후반 직장인, 게임 좋아함, 코딩 거의 안 해봄.
- **가장 구체적인 한 장면**: 퇴근 후/주말에 "풋볼매니저 느낌의 야구 매니지먼트 게임을 내가 직접 만들어보고 싶다"는 아이디어가 떠올랐을 때. 컴퓨터 켜고 브라우저 열어서 "뭐부터 하지?" 하는 첫 10분.
- **pathfind 커버리지(무엇을 만들 때 쓸 수 있나)**: 그대로 넓게 유지. 게임, 서비스, 앱, 영상, 문서, 도구, 무엇이든.
- **MVP 타깃 한 사람(좁힘)**: 게임 아이디어를 가진 비코딩 직장인. 첫 입력 예: "풋볼매니저 같은 야구 매니지먼트 게임을 만들어보고 싶은데, 이미 비슷한 게임이 뭐가 있는지, 뭐부터 만들어야 하는지, 무료로 쓸 수 있는 엔진·에셋·오픈소스가 있는지 찾아서 순서대로 알려줘."

> 주의: MVP 타깃만 좁힌 것. pathfind 자체는 여전히 무엇이든 다룸.

### ② WHEN — 그들이 언제 쓸까 [정리 완료]

- **찾는 순간**: 게임 아이디어 떠오른 직후, 컴퓨터 켜고 브라우저 열었을 때. "이거 만들어보고 싶은데 뭐부터 하지?" 하는 첫 10분.
- **스스로 오는가 / 불러 쓰는가**: 불러 쓰는 쪽. URL로 접속 → 입력 → 결과. 알림·공유 링크은 MVP 범위 밖.
- **사용자 워크플로우**: 네 개인 워크플로우(메모 앱 + 에이전트 읽→ 구체화)는 미래 확장 방향. MVP에선 "언제든 URL로 들어와서 쓰는" 걸로 충분.

### ③ INPUT/OUTPUT — 사용자는 뭘 넣어주고 뭘 기대할까 [정리 완료, b/Solar 결정]

**입력 1 (첫 화면)**:
- 한 문단 텍스트 박스 (자유 입력)
- 예시 프롬프트 버튼 3~4개: "게임 만들고 싶어", "업무 자동화하고 싶어" 등 — 텍스트 작성 마찰 줄이기용
- 중요 포인트: 사용자가 상상하는 형태를 에이전트에게 **명료하게 전달**하는 것이 핵심. 질 좋은 컨텍스트 → 질 좋은 결과물.

**입력 2 (그 이후, grill-me 인터뷰)**:
- grill-me 인터뷰 스킬을 써서 사용자와 여러 턴 대화
- 사용자가 본인이 원하는 걸 명료화하고, 에이전트도 같은 시선으로 정렬됨
- pathfinding에 돌입 가능한 지점까지 컨텍스트가 쌓이면 본격 작업 시작

**출력 1 (1차)**: 큰 그림·과정을 한 눈에 보여주는 시각화 결과물 (카드 흐름도 — CSS/JS, 인터랙티브. three.js도 가능)
**출력 2 (2차)**: handoff.md — 복사해서 자기 코딩 에이전트(Codex, Claude Code 등)에 넣음
**사용자가 얻는 감각**: "이건 이미 있는 것(가져다 써도 됨) / 이건 직접 해야 하는 것" 구분을 시각적으로 익힘

**grill-me 인터뷰 방식 결정**: **(b) Solar API 호출로 진행**. 무제한 대신 **5턴 제한**. 서비스 안정성·MVP 범위 이유.

### grill-me 스킬 실데이터 [확인 완료]

- **출처**: https://github.com/mattpocock/skills (web_extract로 실데이터 확인)
- `/grill-me`: 계획·설계에 대해 사용자를 집요하게 인터뷰해서 설계 트리의 모든 분기를 해결하는 스킬. 비코드용. mattpocock의 가장 인기 스킬.
- `/grilling`: 인터뷰 프리미티브를 재사용 가능하게 뽑아둔 것.
- `/handoff`: 대화를 handoff 문서로 압축해서 다른 에이전트가 이어받게 함 — 우리가 만들 handoff.md와 정확히 같은 컨셉.
- 핵심 철학: "아무도 자기가 정확히 뭘 원하는지 모른다" — 에이전트와 사용자 간 정렬 실패가 가장 흔한 실패 모드. grilling으로 고친다.

### ④ SETUP — 서비스가 되면서 신경 써야 할 부분 [미해소 — 진행 중]

**비밀 (Vercel 환경변수)**:
- Solar API 키 (서버 /api에서만 사용). 아직 구체적 값·발급처는 확인 안 함. 이름과 용도만 적고 값은 적지 않음.

**사용자 프로필 (localStorage)**:
- grill-me 인터뷰 기록, 입력 텍스트, 예시 버튼 선택 여부 등. 재방문 시 묻지 않음, 초기화 버튼 제공.

**미해소 질문**:
1. grill-me 인터뷰의 5턴 동안 상태 관리는 어떻게 하나? /api에서 세션처럼 관리하나, 프론트 localStorage로 한 턴씩 주고 받나?
2. pathfind render.py 로직을 서비스에 이식할 때, 웹 검색을 누가 수행하나? 서버가 Solar로 웹 검색 대행, 또는 프론트가 직접 웹 검색 결과를 모아서 /api에 넘겨 render 로직만 서버에서 실행. 어느 쪽이 낫나?
3. grill-me의 질문 로직을 Solar에 넘길 때 어떤 프롬프트/지시 구조로 줄 건가? grill-me SKILL.md 내용을 그대로 프롬프트로 넣나, 핵심만 추리나?

**매 배포는 전체 파일 세트를 다시 올린다(일부만 올리면 기존 파일이 사라진다).** — Vercel 레시피 규칙.

### ⑤ SOLVE — 내 서비스가 결국 뭘 해결하나 [미해소 — INPUT/OUTPUT 확정 후 작성 예정]

- 결과를 받은 그 사람은 바로 다음에 무슨 행동/결정을 하나?
- 이 서비스가 없던 때와 무엇이 달라지나?
- 그 결정에 함께 필요한 정보가 있으면, 조합할 다른 스킬 후보는? (예: grill-me, handoff 등)

---

## Solar API 호출 방식 결정 (b 선택 근거)

**(a) 직접 구현 vs (b) Solar API 호출 차이**

| | (a) 직접 구현 | (b) Solar API 호출 |
|---|---|---|
| 질문 로직 결정 주체 | 우리가 코드로 정함 (grill-me SKILL.md에서 질문 패턴 뽑아 코드화) | Solar가 프롬프트+모델로로 정함 |
| 예측성 | 높음 — 인터뷰 루트 결정적 | Solar가 그때그때 emergent |
| 비용/지연 | 없음 (Solar 호출 안 함) | 매 턴 Solar 호출 발생 |
| 유연성 | 낮음 — 정해진 질문 5개 | 높음 — 사용자 반응에 맞춰深化 |
| upfront 작업 | grill-me SKILL.md 분석·질문 설계가 필요 | 프롬프트 설계 정도면 됨 |

**선택**: b. 이유: 5턴 제한이면 Solar 호출 부담이 통제되고, 사용자 경험 측면에서 더 유연하고 반응이 좋음. grill-me 스킬의 의도(사용자-에이전트 정렬)를 살리려면 emergent 질문이 낫다고 판단.

**Solar 사용 분배 (기정사실)**:
- grill-me 인터뷰(5턴) → Solar /api 호출
- pathfind 리서치·경로 생성 → Solar /api 호출
- render.py 로직 자체는 그대로 쓰지 못함(파일 출력 방식이라) → 웹용으로 이식하거나 별도 로직으로 분리

---

## 참고 링크 (실데이터)

- Vercel Functions 공식: https://vercel.com/docs/functions
- Vercel 빌드 출력 API (api 경로 매핑): https://vercel.com/docs/build-output-api/primitives
- Vercel 노드 요청 바디 처리 (curl 예시): https://vercel.com/kb/guide/handling-node-request-body
- Flik 블로그 — Next.js 없이 api 폴더 서버리스: https://flik.tistory.com/138
- GitHub: mattpocock/skills (grill-me, handoff 등): https://github.com/mattpocock/skills
- grill-me SKILL.md: https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md
- handoff SKILL.md: https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md
- ZenGM Baseball (무료 야구 매니지먼트 웹 게임, 오픈소스 아님): https://zengm.com/baseball/
- Dugout Dynasty (오픈소스 야구 매니지먼트 웹 게임, GitHub): https://github.com/arout77/Dugout-Dynasty
- ethbaseball (오픈소스 이더리움 야구 리그, GitHub): https://github.com/American-Space-Software/ethbaseball
- Reddit: Godot으로 만든 야구 매니지먼트 Sim 무료 데모: https://www.reddit.com/r/godot/comments/1uczwm9/my_baseball_management_sim_made_in_godot_now_has/

---

## 다음 단계

1. **SETUP 완료**: 미해소 질문 3개(상태 관리, 웹 검색 대행, grill-me 프롬프트 구조)에 답하고, P0/P1 정리.
2. **PRD(B)**: 11항목 미니 PRD로 압축. P0 최대 4개 확정.
3. **구현 가드 모드(C)**: PRD 확인 후 계획 제시 → 승인 → 구현 → 배포 → 동작 확인.

---

*이 문서는 매 단계마다 갱신한다. 없어진 데이터는 '확인 불가'로 표시.*
