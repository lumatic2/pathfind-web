# Upstage Hermes Agent / Upstage Console 조사

인입 노드: hermes-agent-is-nous-research-not-upstage-product

## 선조회 결과 (착수 전 필수)

1. **지식 그래프 discover "Hermes Agent Upstage"** — 걸린 노드는 전부 `hermes-agent-nousresearch-not-openclaw-family`,
   `hermes-kanban-vs-openclaw-sessions-send-persistent-multi-agent` 등 **Nous Research 사의 Hermes Agent**를
   OpenClaw 와 비교하는 맥락이었다. Upstage 연동을 다루는 기존 노드는 없었다. 이 discover 결과 자체가 이번
   조사의 첫 번째 결론(아래 「핵심 정정」)의 단서가 됐다.
2. **도구 셸프 recall "Upstage Hermes Agent Console 조사"** — 0건 매치. `ncli`(네이버 검색) 카드만 조회해
   실제 검색에 사용했다(아래 §5의 결과는 유의미한 매치를 얻지 못함 — 사용 결과는 `--fail` 로 기록하지 않음.
   ncli 자체는 정상 동작했고 단지 이 주제에 한국어 관련 자료가 얕았다).

---

## 핵심 정정 — 가장 먼저 알아야 할 사실

**Hermes Agent 는 업스테이지(Upstage)가 만든 제품이 아니다.** 미국 AI 연구소 **Nous Research**
(Hermes/Nomos/Psyche 모델 개발사)가 만든 오픈소스 자율 에이전트이고, MIT 라이선스로 GitHub
`NousResearch/hermes-agent` 에 공개돼 있다. Upstage 의 Solar Pro 4 는 Hermes 가 지원하는 **여러 LLM
provider 중 하나**로 붙는 것뿐이다. **Upstage Console 은 이것과 별개의 Upstage 자체 제품**(API 대시보드)이다.

MABC 대회 선택지 문구 "Hermes Agent 연동 (Upstage Console 이용)"은 이 구조를 정확히 반영한 것으로 읽을
수 있다 — 즉 "Nous Research 의 Hermes Agent 를, Upstage Console 에서 발급받은 API key 로 Solar 모델에
연동해서 쓴다"는 뜻이다. Upstage 가 Hermes Agent 자체를 만들었다는 오해로 조사를 시작하면 안 된다.

근거 등급: **공식** (Hermes 공식 문서 `hermes-agent.nousresearch.com` 원문, `stealthy_fetch` 로 축자 확인.
지식그래프에 이미 등재된 별개 조사에서도 같은 사실이 GitHub README stealthy_fetch 축자 확인으로 재확인됨).

---

## 1. Hermes Agent 가 정확히 무엇인가

| 항목 | 내용 | 근거 등급 |
|---|---|---|
| 개발사 | Nous Research | 공식 |
| 제품 형태 | CLI(풀 TUI, 터미널 UI) + 데스크톱 앱(Windows/macOS 인스톨러). 웹 UI 아님, "코딩 카피럿"·"단일 API 챗봇 래퍼" 아님(공식 문서가 명시적으로 부정) | 공식 |
| 라이선스 | MIT | 공식 |
| 출시 시점 | 정확한 최초 출시일은 미확인. 2026-09-05 기준(지식그래프 기존 노드) 최신 릴리스 v0.21.0 "Pantheon"(2026-08-31), 그 전 v0.20.3(2026-08-16). GitHub 241k stars / 49.5k forks / 31,894 commits (2026-09-05 시점) | 2차(WebSearch 요약, 원문 릴리스 페이지 미대조) |
| 공식 문서 | https://hermes-agent.nousresearch.com/docs/ | 공식 |
| 공식 저장소 | https://github.com/NousResearch/hermes-agent | 공식 |
| 핵심 특징 | 자가개선 학습 루프(스킬 자동 생성/개선, FTS5 세션 간 기억, Honcho 유저 모델링), 20개 이상 메신저 플랫폼 연동(Telegram/Discord/Slack/WhatsApp 등), Bot Mode(복수 페르소나 협업), Kanban 보드형 멀티에이전트 협업, MCP 지원, 60개 이상 내장 도구, $5 VPS부터 GPU 클러스터·서버리스(Daytona/Modal)까지 실행 가능 | 공식(원문 축자 확인) |

원문 인용(축자, `mcp__scrapling__stealthy_fetch` 로 확보, 2026-09-07):
> "Hermes Agent — The self-improving AI agent built by Nous Research. The only agent with a built-in learning loop — it creates skills from experience, improves them during use, nudges itself to persist knowledge, and builds a deepening model of who you are across sessions."
> "It's not a coding copilot tethered to an IDE or a chatbot wrapper around a single API. It's an autonomous agent that gets more capable the longer it runs."
> "Built by Nous Research · MIT License · 2026"
> 출처: https://hermes-agent.nousresearch.com/docs/ (2026-09-07 접근, stealthy_fetch)

---

## 2. 설치·세팅 방법

| 항목 | 내용 | 근거 등급 |
|---|---|---|
| Windows 설치(네이티브 CLI) | PowerShell: `iex (irm https://hermes-agent.nousresearch.com/install.ps1)` | 공식(원문 축자 확인) |
| Linux/macOS/WSL2/Android(Termux) | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` | 공식(원문 축자 확인) |
| 데스크톱 설치 | Windows/macOS 인스톨러를 공식 웹사이트에서 다운로드 후 실행 — CLI 도 함께 설치됨 | 공식 |
| 지원 OS | "Linux, macOS, WSL2, native Windows, Nix & NixOS or Android" — 6개 이상 터미널 백엔드(local, Docker, SSH, Daytona, Singularity, Modal) | 공식(원문 축자 확인) |
| 최초 인증/모델 설정 | `hermes setup --portal` — 1회 OAuth 로 Nous Portal 모델 + Tool Gateway 4종(웹검색, 이미지생성, TTS, 브라우저) 확보 | 공식(원문 축자 확인) |
| 모델 프로바이더 | Nous Portal, OpenRouter, OpenAI, 그 외 임의 엔드포인트 — **Upstage 포함** | 공식(원문 축자 확인, "Works with Nous Portal, OpenRouter, OpenAI, or any endpoint") |
| Upstage Solar 연동 방법 | 공식 Docker 이미지(v0.18.2 기준)에 `upstage` provider 내장(별칭 `solar`), 환경변수 **`UPSTAGE_API_KEY`** 설정 후 `hermes chat --provider upstage --model solar-open2` 또는 config YAML `model.provider: upstage` / `model.default: solar-open2` | **2차** — GitHub `jyje/pilot-upstage-solar-open2` README, WebFetch 요약 기준(원문 직접 대조는 못함). base URL 은 별도 지정 불필요(Hermes 가 OpenAI 호환 API 로 자동 라우팅한다는 서술) |
| Upstage Console에서 발급받을 것 | API key (Console 대시보드 > API Keys) | 2차(WebSearch 요약) |

---

## 3. 스킬/에이전트 정의 포맷 — SKILL.md 지원 여부 (사용자 최우선 관심사)

**결론: 지원한다.** Hermes 공식 문서 "Skills System" 페이지 원문(`stealthy_fetch`로 축자 확인, 2026-09-07):

> "Skills are on-demand knowledge documents the agent can load when needed. They follow a progressive disclosure pattern to minimize token usage and are compatible with the agentskills.io open standard."
> "All skills live in `~/.hermes/skills/` — the primary directory and source of truth."
> 출처: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills (2026-09-07 접근, stealthy_fetch)

공식 문서 홈에서도:
> "Open standard skills — Compatible with agentskills.io. Skills are portable, shareable, and community-contributed via the Skills Hub"
> "MCP support — Connect to any MCP server for extended tool capabilities"
> 출처: https://hermes-agent.nousresearch.com/docs/ (2026-09-07 접근, stealthy_fetch)

정리:
- **SKILL.md 마크다운 스킬 포맷을 공식 지원**한다. `agentskills.io`라는 오픈 표준을 따르며, 이는 Claude Code 의
  skills 개념과 계열이 같은 표준이다(Claude 진영이 이 표준을 만들었는지, 업계 공용 표준인지는 이번 조사에서
  확인하지 못함 — agentskills.io 자체 문서를 열지 않았다. **미확인**).
- 스킬은 이름 + 설명 + 절차로 구성되고, "설명만 먼저 읽고 필요할 때 전체 로드"하는 progressive disclosure —
  MABC 스킬 설계에서 쓰는 절 구조와 개념적으로 유사하다.
- MCP는 HTTP(URL 지정)와 stdio(로컬 명령) 둘 다 지원.
- **미확인 사항**: 타임리 AI 플랫폼에서 만든 `SKILL.md` + `scripts/`(+`assets/`, `references/`) 폴더 구조가
  agentskills.io 표준의 폴더 배치·frontmatter 스키마와 **바이트 단위로 호환**되는지는 확인하지 못했다.
  이식을 실제로 시도하려면 (a) agentskills.io 스펙 문서를 열어 폴더 구조 요구사항을 대조하고, (b) 타임리에서
  받은 `skill.zip` 을 `~/.hermes/skills/` 밑에 그대로 풀어 `hermes` 가 인식하는지 실측이 필요하다. 이번
  조사는 여기까지 못 갔다(원문 미확보로 인한 hard-stop, 아래 §종료게이트 참조).

---

## 4. "Upstage 콘솔 스크립트로 Claude Code 안에서 Solar 사용 가능" — 이게 무엇인가

**미확인.** Upstage 공식 채널(console.upstage.ai, upstage.ai/blog)에서 "Claude Code 전용 공식 연동
스크립트"를 가리키는 원문을 찾지 못했다.

- `console.upstage.ai/docs`, `console.upstage.ai/docs/getting-started` 등은 클라이언트 렌더링 SPA 로,
  `WebFetch` 와 `mcp__scrapling__stealthy_fetch`(network_idle=true, wait=3000 포함) 둘 다 프로모션 배너
  텍스트("Solar Pro 4: 90% off through Sep 10", "Try it now →") 외의 본문을 받아오지 못했다. `/docs`
  루트는 실제로는 **404**를 반환했다(stealthy_fetch 로 확인, "This page could not be found").
- Solar 는 OpenAI 호환 API(`https://api.upstage.ai/v1`)를 제공한다(WebSearch 요약, 2차). Claude Code 는
  기본적으로 **Anthropic 포맷**을 쓰므로, Solar 를 직접 붙이려면 `claude-code-router` 같은 커뮤니티 프록시로
  포맷을 변환해야 한다는 것이 일반적인 패턴이라는 정황은 있으나(Opper.ai 블로그 "Claude Code Router" 등,
  2차), 이것이 "Upstage 콘솔 스크립트"인지는 확인되지 않는다.
- "I put Claude Code on Solar Pro 4 — it fixed a real bug in 21 seconds"라는 유튜브 영상
  (`https://www.youtube.com/watch?v=yVdFx21FxLk`)이 존재하나, 영상 설명란(description)을 가져오지
  못했다(`WebFetch`·`stealthy_fetch` 둘 다 YouTube 의 정적 텍스트만 반환, 설명 텍스트 로드 안 됨). 이 안에
  스크립트가 언급됐을 가능성이 있으나 확인하지 못했다.
- GitHub `UpstageAI/cookbook` 저장소(`https://github.com/UpstageAI/cookbook`)에 Claude Code 관련 예제가
  있는지는 리스트 검색만 했고 저장소 내부를 열어보지 못했다 — **후속 조사 필요**.

**사다리 기록**: WebFetch → stealthy_fetch(network_idle, wait 포함) 순으로 시도했고, 함정4 절차(HTML 전체
+ 첨부/다운로드 링크 추적)까지는 시간 예산상 못 갔다. `make_request` 로 `main_content_only=False` HTML
전체를 받아 라우팅 스크립트나 다운로드 링크를 찾는 것이 다음 시도 후보다.

---

## 5. Upstage Console 가입 방법·URL·무료 크레딧

| 항목 | 내용 | 근거 등급 |
|---|---|---|
| URL | https://console.upstage.ai/ | 공식 |
| 무료 크레딧 | 가입 즉시 **10달러(US$10)** 크레딧 제공, 이 크레딧으로 Solar Pro 포함 전 API 호출 가능 | 공식(메타 설명 축자 확인) + 2차(본문 서술은 WebSearch 요약) |
| API key 발급 | Console 대시보드 > API Keys 페이지에서 "Create new key" 버튼 | 2차(WebSearch 요약, 원문 미대조) |
| 회원가입 없이 테스트 | Playground 에서 가입 없이 즉시 API 테스트 가능하다는 서술 | 2차(WebSearch 요약) |
| 비영리/교육/연구 혜택 | Upstage-AWS AI Initiative 통해 Document Parse·Solar Pro 최대 1년 무료 제공 언급 | 2차(WebSearch 요약, 원문 미대조 — 확인 필요) |

원문 인용(축자, `stealthy_fetch`, 2026-09-07):
> "Upstage Console에서 Solar Pro 2 API를 1분 만에 호출하는 가장 빠른 방법! 가입 즉시 $10 크레딧 제공, 실습 코드와 함께 바로 실행해보세요."
> 출처: https://www.upstage.ai/blog/ko/guide-1-upstage-console-api (2026-09-07 접근, stealthy_fetch) — 단 이 문장은 페이지의 **메타 설명(요약 카드)** 텍스트이며 기사 본문 문단은 SPA 렌더링 한계로 별도 확보하지 못했다(함정4 유형 — 후속 조사 시 본문 단락까지 스크래핑 권장).

---

## 6. 배포·공유 경로 — 미확인

- Hermes 공식 문서 홈이 "Skills Hub"를 언급한다: **"Open standard skills — Compatible with agentskills.io. Skills are portable, shareable, and community-contributed via the Skills Hub"** (stealthy_fetch 축자 확인, 2026-09-07,
  https://hermes-agent.nousresearch.com/docs/). 즉 스킬을 커뮤니티에 공유하는 공식 채널(Skills Hub)이
  존재한다는 것은 확인했다.
- 그러나 **Skills Hub 의 실제 업로드/배포 절차**(URL, 승인 여부, 남이 설치하는 방법 — `hermes skills install <name>` 류의 명령이 있는지)는 별도 페이지를 열지 못해 **미확인**이다.
- Hermes "에이전트"(프로필 + 스킬 + 설정 전체)를 통째로 남에게 배포하는 절차(export/import, Bot Mode
  공유)도 조사하지 못했다 — **미확인**.
- 후속 조사 시작점: `https://hermes-agent.nousresearch.com/docs/` 좌측 목차의 "Skills Hub" 관련 하위 페이지,
  또는 `hermes-agent.nousresearch.com/skills` (사이트 네비게이션에 "Skills" 링크가 별도로 존재함이
  홈페이지 헤더에서 확인됨: "Docs / Skills / Download").

---

## 종료 게이트

**hard-stop 으로 닫음.** 아래 3항목이 미달이며 각 절 본문에 이미 명시했다:

1. §4 "Claude Code 안에서 Solar 사용" — 공식 스크립트 원문 미확인 (console.upstage.ai SPA 렌더링 실패, 유튜브 설명란 미확보, UpstageAI/cookbook 저장소 내부 미열람)
2. §5 세부 항목(API key 발급 절차, 비영리 혜택) — WebSearch 요약 기준, 원문 미대조
3. §6 배포·공유 경로 전체 — Skills Hub 세부 절차 미확인

이 세 항목을 닫으려면 다음 라운드에서: (a) `mcp__scrapling__make_request` 로 `console.upstage.ai/docs`
전체 HTML(`main_content_only=False`)을 받아 실제 라우팅되는 정적 경로를 찾고, (b) GitHub
`UpstageAI/cookbook` 저장소 파일 목록을 직접 열어 Claude Code 관련 예제 유무를 확인하고, (c)
`hermes-agent.nousresearch.com` 사이트 네비게이션의 "Skills" 링크(홈페이지 확인됨)를 따라가 Skills Hub
페이지를 직접 연다.

## 인입 노드 상세

- `hermes-agent-is-nous-research-not-upstage-product` (draft, domain: ai-agent-operations) — 「핵심
  정정」과 §1~§3 요지를 담았다. source-map 타입, sources 4건(Hermes 공식 문서 홈, Skills System 문서,
  jyje/pilot-upstage-solar-open2 README, Upstage 공식 블로그) 전부 위 조사에서 실제로 연 URL이다.
  `knowledge.py new` 실행 시 관련 후보로 `mcp-session-binds-to-host-process-lifetime` 등 MCP 계열 5건이
  제시됐으나, 도메인은 같아도 주제(Upstage/Hermes 정체성 문제)가 달라 연결하지 않았다.
  외부 URL 발췌 아카이브(`sources/archive/`) 미생성 경고가 떴으나 이번 조사 범위 밖으로 보류했다 —
  다음 사람이 `askc data kg source-durability` 로 재확인 가능.
