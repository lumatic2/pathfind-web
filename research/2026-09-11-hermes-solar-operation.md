# Hermes Agent(v0.21.0) × Upstage Solar Pro 4 — 운용 노하우·시행착오

인입 노드: 없음 (아래 「인입 판정」 참조 — 이번 조사는 노드 신설 요건인 재사용 가능한 압축 결론을 만들지 못했다. 발견은 대부분 "이 버전 이 설정 키는 이 값이다"류의 1회성 설정값이라 `research/2026-09-07-hermes-agent.md`의 인입 노드 `hermes-agent-is-nous-research-not-upstage-product`를 보강하는 편이 맞지만, 그 노드는 "정체성"을 다루고 이 문서는 "운용"을 다뤄 주제가 갈린다. 노드화할 만한 후보가 나오면 §10에 표시했다.)

## 선조회 결과 (착수 전 필수)

1. **지식 그래프 discover "Hermes Agent Solar Pro 4 운용"** — 걸린 노드 4건 전부 기존 문서(`2026-09-07-hermes-agent.md`)가 이미 만든 `hermes-agent-is-nous-research-not-upstage-product`이거나 무관한 도메인(비디오 파이프라인, 프로젝트 관리 패턴)이었다. Solar Pro 4 프롬프팅·Hermes 운용 세부를 다루는 기존 노드는 없음 — 이번 조사가 백지에서 시작한다는 뜻.
2. **도구 셸프 recall "hermes solar pro 프롬프팅"** — 0건 매치. 이 세션에서 새로 쓴 도구 없음(WebSearch·WebFetch·scrapling·ncli는 기존 카드 보유 도구이고 이번 조사에서 신규 등재 대상 없음).

기존 문서 `research/2026-09-07-hermes-agent.md`는 Hermes의 **정체성**(Nous Research 제품, Upstage는 provider일 뿐)과 SKILL.md 호환성 개요, 그리고 hard-stop으로 닫은 3개 공백(①Claude Code + Solar 공식 스크립트 ②Upstage Console API key 발급 세부 ③Skills Hub 배포 절차)을 남겼다. 이 문서는 그 공백 중 **①을 이번 조사에서 직접 닫았고**(§9), 나머지는 손대지 않았다 — 이 문서의 범위는 **Solar Pro 4 프롬프팅/운용 + Hermes 기능 운용 + 실측 사용기**로 좁혔다.

---

## 한 화면 요약 — 지금 당장 바꿀 설정 3~5개

| # | 설정 | 지금 값(기본) | 바꿀 값 | 왜 |
|---|---|---|---|---|
| 1 | `~/.hermes/config.yaml` → `model.reasoning_effort` | Hermes 상위 기본값은 빈 문자열(미설정)이지만, **Upstage provider 플러그인이 미설정 시 `reasoning_effort: medium`으로 자동 상향**한다(§4) | 결선 작업처럼 정확도가 중요하면 `medium` 유지 또는 `high`로. 속도가 중요한 단순 턴이면 명시적으로 `low`나 `none`으로 낮춰라 — **묵시적 medium을 모른 채 매 턴 추가 reasoning 토큰·지연을 태우는 것이 흔한 실수** | §4, 1차 실측(소스) |
| 2 | `~/.hermes/config.yaml` → `model.context_length` | 미설정(자동 감지) | `solar-pro4`는 Hermes v0.21.0의 로컬 폴백 표(`agent/model_metadata.py`)에 **아직 등재돼 있지 않다**(solar-pro3/pro2/mini/open2만 있음). `/v1/models`가 context_length를 안 주면 최대 256,000으로 낮춰 잡힌다. 공식 문서상 Solar Pro 4는 그보다 큰 컨텍스트를 광고하므로 긴 세션을 쓸 계획이면 수동으로 큰 값을 박아라 | §5, 1차 실측(소스) |
| 3 | `~/.hermes/config.yaml` → `display.status_bar.fields` | `[]` (내장 기본 세트) | 결선 작업 중 크레딧·rate limit을 놓치지 않으려면 `["model", "context_pct", "bg_tasks", "duration"]` 등으로 명시 지정 — 좁은 터미널에서는 `context_detail`·`prompt_elapsed`·`idle_since`가 자동으로 빠진다는 점도 고려 | §7-4, 1차 실측(소스) |
| 4 | Upstage Console 커밋 티어 확인 | Tier 0(기본) = 100 RPM / 50,000 TPM | 결선 3일(9/9~9/16) 동안 에이전트를 계속 돌릴 계획이면 Tier 0로는 금방 막힌다 — Credit 페이지에서 크레딧을 구매해 티어를 올리거나, 요청을 배치·캐싱으로 줄여라 | §3, 공식 문서 축자 확인 |
| 5 | `hermes import-agent claude-code --dry-run` 먼저 실행 | (실행 안 함) | 결선 규정상 이 세션(Claude Code)으로 산출물을 만들면 실격이지만, **CLAUDE.md/설정을 Hermes로 "가져오는" 것 자체는 제작이 아니라 세팅**이다. dry-run으로 무엇이 옮겨지는지 미리 확인해 사고 없이 이관하라(§6) | §6, 1차 실측(소스) |

---

## A. Solar Pro 4 프롬프팅·운용 (Upstage 공식 문서 기준)

### A-1. 시스템 프롬프트·프롬프팅 가이드

Upstage 공식 문서 사이트(`console.upstage.ai/docs`)는 `/docs/capabilities/generate/*` 하위에 Chat/Reasoning/Structured outputs/Tool calling 페이지를 두고 있다. **범용 "시스템 프롬프트 작성법" 전용 페이지는 확인하지 못했다** — Overview 페이지(`/docs/capabilities/generate.md`)가 "make your first API call → choose a model → add reasoning → structured outputs → tool calling → ship to production" 순서로 안내하는 흐름형 문서이고, 별도의 프롬프트 엔지니어링 가이드는 llms.txt 목차에 없었다. **확인 불가** — 다음 조사자는 `/docs/capabilities/generate.md` 본문(accordion 렌더링이라 `.md` 확장자로는 빈 뼈대만 나옴, HTML 렌더 페이지를 직접 열어야 함)을 열어봐야 한다.

근거 등급: 공식 문서(목차 대조), 세부 프롬프팅 가이드 존재 여부는 미확인.
출처: https://console.upstage.ai/llms.txt (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 원문 목차 축자 확인)

### A-2. 도구 호출(tool calling) 신뢰성 — 공식 예제와 Hermes 소스의 교차 확인

공식 문서(`/docs/capabilities/generate/tool-calling.md`, 2026-09-11 stealthy_fetch 축자 확인)의 코드 예제가 실제로 강조하는 것:

- `tool_choice`를 `"auto"`뿐 아니라 `{"type": "function", "function": {"name": "..."}}` 형태로 **특정 함수를 강제**할 수 있다(예제 2).
- `parallel_tool_calls`를 `True`/`False`로 명시 제어할 수 있다 — 예제 1은 `False`(순차), 예제 2는 `True`(병렬)로 대조해서 보여준다. **병렬 호출을 켜면 모델이 한 응답에 여러 `tool_calls`를 반환**하므로, 호출부는 전부 실행한 뒤 결과를 한꺼번에 대화에 append해야 한다고 공식 문서가 명시.
- 예제 코드 자체가 **모델이 돌려준 JSON 인자를 그대로 신뢰하지 않고** `json.JSONDecodeError`, 예상 밖 키(`unexpected = set(function_args) - {...}`), 타입 불일치를 전부 방어적으로 검사한다 — 이것이 Upstage가 자기 문서에서 보여주는 "권장 패턴"이다.

근거 등급: 공식 문서(축자 확인, 코드 원문 그대로).
출처: https://console.upstage.ai/docs/capabilities/generate/tool-calling.md (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 원문 축자 확인)

### A-3. Structured output

공식 문서(`/docs/capabilities/generate/structured-outputs.md`, 2026-09-11 축자 확인)가 규정하는 스키마 제약(OpenAI Structured Outputs 서브셋과 동일):

- 루트는 반드시 `object`, 모든 property는 `required`에 나열, 선택값은 타입에 `null`을 추가하는 식으로 표현(키 자체는 항상 응답에 존재, 값이 `null`일 수 있음).
- `strict: true` 필수, 모든 object에 `additionalProperties: false` 필수.
- 중첩은 10단계까지, `$defs`/`$ref`는 로컬 참조(`#/$defs/...`)만 허용 — 재귀 참조·스키마 자기참조(`{"$ref": "#"}`)는 HTTP 400.
- `allOf`/`oneOf`/`not`/`dependentRequired`/`dependentSchemas`/`if-then-else`/`patternProperties` 미지원.
- `finish_reason`이 `stop`이 아니라 `length`면 JSON이 중간에 잘린 것이므로 파싱 전에 반드시 확인하라고 명시.

근거 등급: 공식 문서(축자 확인).
출처: https://console.upstage.ai/docs/capabilities/generate/structured-outputs.md (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 원문 축자 확인)

### A-4. Reasoning 모드 — solar-pro4의 기본 동작과 Hermes의 개입

공식 문서(`/docs/capabilities/generate/reasoning.md`, 2026-09-11 축자 확인) 원문:

> "`solar-pro4` does not reason unless you turn it on: omitting `reasoning_effort` — or sending it as `null` — leaves reasoning off, and it turns on only when you set an effort between `low` and `max`."

즉 **Upstage API 자체의 기본값은 reasoning OFF**다. 그런데 Hermes Agent v0.21.0 소스(`plugins/model-providers/upstage/__init__.py`, 1차 실측)를 열어보면:

```python
"""Upstage Solar provider profile: top-level ``reasoning_effort`` (low|medium|high).

Solar's server default is ``minimal`` (reasoning off) — wrong for agentic work —
so an unset reasoning_config defaults reasoning ON at ``medium``, matching the
"medium (default)" the /reasoning panel shows. Explicit settings always win.
"""
...
if not reasoning_config or not isinstance(reasoning_config, dict):
    return {}, {"reasoning_effort": "medium"}  # unset -> reasoning ON for agents
```

**Hermes는 사용자가 아무 설정도 안 하면 Upstage에 `reasoning_effort=medium`을 자동으로 붙여서 보낸다** — Solar API 원래 기본값(OFF)을 Hermes가 조용히 뒤집는 것이다. 코드 주석이 "Solar's server default is minimal"이라 쓴 것은 공식 문서의 "omitted = OFF" 서술과 표현이 다르지만(코드는 "minimal"을 "OFF와 동의어"로 쓰고 있다 — 문서의 reasoning표에서도 `none`/`minimal`이 "Turns reasoning off" 칸에 있어 일치한다), 결론은 같다: **가만히 두면 Solar API는 reasoning이 꺼지지만, Hermes를 거치면 medium으로 켜진다.**

이건 운용상 중요한 시행착오 포인트다:
- **속도·비용에 민감한 단순 턴에서 의도치 않게 reasoning 토큰이 추가로 소모**될 수 있다(Tier 0 TPM 50,000 한도에서는 체감이 크다).
- 끄고 싶으면 `reasoning_config.enabled: false`를 명시하거나(Hermes가 Solar 자체 기본값 OFF로 되돌림), CLI에서 `--reasoning none` 또는 세션 중 `/reasoning none`.
- Hermes의 effort 어휘(`none/minimal/low/medium/high/xhigh/max/ultra`)는 Solar가 실제로 받는 3단계(`low/medium/high`, `agent/reasoning_effort.py`의 `SOLAR_EFFORTS`)보다 넓다 — `xhigh`/`max`/`ultra`를 세션에서 선택해도 Solar 쪽에는 클램프 규칙에 따라 `high`로 눌려서 나간다(`clamp_effort`, 알려지지 않은 상위 레벨은 자동으로 `high`로 승격 — "조용히 하위로 떨어뜨리지 않는다"는 게 코드 주석의 명시적 설계 의도, #62650 이슈 전례 참조).

근거 등급: **공식 문서(reasoning 표) + 1차 실측(Hermes 소스 `plugins/model-providers/upstage/__init__.py`, `agent/reasoning_effort.py` 원문 직접 확인, 2026-09-11)**.
출처: https://console.upstage.ai/docs/capabilities/generate/reasoning.md (2026-09-11, stealthy_fetch 축자 확인) · `C:\Users\yusun\AppData\Local\hermes\hermes-agent\plugins\model-providers\upstage\__init__.py` (2026-09-11, Read 원문 확인) · `agent\reasoning_effort.py` (동일)

### A-5. 알려진 약점과 회피법 — 확인된 것 vs 확인 못한 것

**확인된 것 (Upstage 공식 문서 근거):**
- `reasoning_effort`를 켰는데 `max_tokens`를 너무 낮게 잡으면 reasoning 토큰만 소모하고 `message.content`가 `null`, `finish_reason: length`로 답이 안 나올 수 있다 — 문서가 명시적으로 경고("If you set `max_tokens`, leave enough room for the final answer").
- JSON mode(구식 `response_format: json_object`)는 **프롬프트에 "JSON"이라는 단어가 반드시 있어야** 한다 — 없으면 HTTP 400. Structured outputs(`json_schema`)는 이 제약이 없다.
- `solar-mini`는 reasoning을 아예 지원하지 않고, `reasoning_effort`를 보내면 HTTP 400 — 모델 스위칭 로직에서 "reasoning_effort를 무조건 실어 보내는" 코드는 solar-mini로 폴백할 때 깨진다.

**긴 지시 흘림·도구 호출 누락·빈 응답으로 턴 종료 — 이 프로젝트의 기존 실측(`docs/skills/pathfind.md`)에 이미 기록된 Solar Pro 4(구버전 계열)의 알려진 약점**이며, 이번 조사에서는 Upstage 공식 문서나 Nous/Hermes 공식 문서 어디에서도 이 셋을 명시적으로 인정하는 문장을 찾지 못했다(공식 채널은 자사 모델의 약점을 문서화하지 않는 경향 — 예상된 결과). **확인 불가 — 공식 출처 없음.** `docs/skills/pathfind.md`의 F-5/F-8 기록(금지문 대신 산출 지시로 번역, 길이 압박과 도구 호출 요구를 동시에 주지 않기)은 여전히 이 프로젝트에서 유효한 1차 실측이지만, 이번 조사가 새로 확인한 것은 아니므로 근거 등급은 **3자 전언(같은 레포의 이전 실측)**으로 표기한다.

근거 등급: 공식 문서(max_tokens/JSON mode/solar-mini 제약) + 3자 전언(길이 흘림·도구 누락, 같은 레포 이전 문서 인용).
출처: https://console.upstage.ai/docs/capabilities/generate/reasoning.md, https://console.upstage.ai/docs/capabilities/generate/structured-outputs.md (2026-09-11 축자 확인) · `docs/skills/pathfind.md` F-5, F-8 (이 레포, 기존 문서)

---

## B. Tier 0 rate limit(100 RPM / 50,000 TPM) 환경에서의 실무

### B-1. 공식 수치 확정

Upstage 공식 레이트리밋 문서(`/docs/guides/rate-limits.md`, 2026-09-11 축자 확인)에서 **Solar Pro 4 · Tier 0 = RPM 100 / TPM 50,000**을 그대로 확인했다(과제 프롬프트에 주어진 수치와 정확히 일치). 참고로 상위 티어는 Tier 1(Explore) 400 RPM/150,000 TPM, Tier 2(Build) 2,000/750,000, Tier 3(Scale) 4,000/1,500,000, Tier 4(Enterprise) 8,000/3,000,000 — 크레딧을 구매(Credit 페이지)하면 자동으로 승급된다. **Legacy 티어(2025-11-04 이전 가입자)는 Solar Pro 4에 한해 티어 무관하게 100 RPM/50,000 TPM으로 고정**된다는 각주도 있다.

근거 등급: 공식 문서(축자 확인).
출처: https://console.upstage.ai/docs/guides/rate-limits.md (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 표 전체 축자 확인)

### B-2. 429 대응 — 공식 권장 패턴

Upstage 공식 문서가 명시하는 표준 429 처리:
- 모든 응답에 `X-Upstage-RateLimit-{Limit,Remaining,Reset,Interval}-{Requests,Tokens}` 헤더가 붙는다. 429가 났을 때만 `X-Upstage-RateLimit-Retry-After-{Requests,Tokens}` 헤더(Unix timestamp)가 추가된다.
- 권장 순서: ① 응답 헤더로 remaining을 미리 체크해 선제적으로 대기 ② 429가 나면 `Retry-After` 타임스탬프까지 대기 ③ 지수 백오프(문서 예제는 `wait_time *= 2`) ④ 임베딩류는 배치 처리·캐싱으로 요청 수 자체를 줄이기.

### B-3. Hermes Agent가 이미 이걸 대신 해준다 — 1차 실측

Hermes 소스(`agent/agent_runtime_helpers.py`, 2026-09-11 Read 원문 확인)에 다음 주석이 있다:

> "Retries belong to the outer conversation loop (honors Retry-After); SDK retries would double-retry inside it... Delegate all rate-limit / 5xx retry to hermes's outer conversation loop, which honors Retry-After and applies adaptive/jittered backoff. The OpenAI SDK default (max_retries=2) uses its own 1-2s backoff that ignores Retry-After and double-retries inside our loop."

그래서 Hermes는 OpenAI SDK의 자체 재시도를 명시적으로 끄고(`client_kwargs.setdefault("max_retries", 0)`) **429/5xx 재시도·Retry-After 준수·지터 백오프를 전부 자기 대화 루프에서 처리**한다. 429가 감지되면 `agent/agent_runtime_helpers.py`의 `_recover_rate_limit`이 (a) fallback provider chain(`hermes fallback`으로 설정)이 있으면 그쪽으로 전환하거나 (b) 자격증명 풀(pool) 안에 여러 API key가 있으면 그걸 로테이션한다.

**운용 함의**: Tier 0 100 RPM/50,000 TPM을 사람이 직접 재시도 코드로 관리할 필요가 거의 없다 — Hermes가 이미 Retry-After를 지키는 재시도 루프를 갖고 있다. 사람이 할 일은 ① `hermes fallback add`로 대체 provider를 미리 등록해 두는 것(Solar가 429로 막히면 자동으로 다음 provider로 넘어가게) ② 여러 Upstage API key를 자격증명 풀에 등록해 두는 것(주석의 "credential pool rotation"이 이 경로를 씀) — 둘 다 소스에서 존재는 확인했으나 **정확한 CLI 명령 조합("hermes fallback add"의 실제 프롬프트 흐름, credential pool에 다중 key를 등록하는 정확한 절차)은 `--help` 텍스트 이상으로 실행해 검증하지 않았다** — 이 문서의 규칙상 `hermes` 명령을 실제로 실행하지 않았기 때문. 대화형 마법사이므로 다음 사람이 직접 시도해야 한다.

근거 등급: 1차 실측(Hermes 소스 원문 확인) + 공식 문서(대응 패턴).
출처: `C:\Users\yusun\AppData\Local\hermes\hermes-agent\agent\agent_runtime_helpers.py` 라인 651, 753-881, 1720-1745 (2026-09-11, Read 원문 확인) · `hermes fallback --help`(2026-09-11, `--help` 조회만, 실행 안 함) · https://console.upstage.ai/docs/guides/rate-limits.md (2026-09-11)

### B-4. 요청 합치기 — 배치·캐싱

Upstage 공식 문서의 배치·캐싱 예제는 **임베딩 API**를 대상으로 한 것이고(`client.embeddings.create(input=documents[i:i+batch_size], ...)`), **Chat Completions(Solar Pro 4 대화형 호출)에 대한 공식 "요청 합치기" 가이드는 확인하지 못했다** — 챗 API는 구조상 한 턴이 한 요청이라 배치가 어렵다. Hermes 쪽에서 요청을 합치는 메커니즘으로 짐작할 만한 것은 ① 서브에이전트 위임(`delegation.max_concurrent_children`, 기본 10 — 여러 자식 작업을 병렬로 굴리되 이건 요청을 "줄이는" 게 아니라 "늘리는" 방향이라 Tier 0에서는 오히려 역효과) ② 압축(compression) 임계값을 낮춰 컨텍스트를 자주 정리해서 턴당 TPM 소모를 줄이는 것 정도다. **명시적인 "요청 합치기" 기능은 확인 불가.**

근거 등급: 공식 문서(임베딩 배치만 확인) + 1차 실측(delegation 설정 존재 확인, 그러나 "요청 합치기" 의도로 설계된 것은 아님).

---

## C. Hermes Agent 운용

### C-1. `hermes import-agent` — 무엇이 옮겨지고 무엇이 안 옮겨지는지 (1차 실측, 소스 직독)

소스: `hermes_cli/agent_import.py`(666줄), `hermes_cli/subcommands/import_agent.py`, 2026-09-11 Read 원문 확인. **`hermes` 명령 자체는 실행하지 않았다** — 아래는 소스 코드를 그대로 읽어 재구성한 것이다.

**Claude Code(`~/.claude`) → Hermes 매핑표:**

| Claude Code 쪽 | 읽는 파일 | Hermes 쪽 목적지 | 방식 |
|---|---|---|---|
| `CLAUDE.md` | `<source>/CLAUDE.md` | `memories/MEMORY.md` | 마크다운을 헤딩·불릿·문단 단위 "엔트리"로 쪼개(`extract_markdown_entries`, 코드 블록·표는 스킵) `§` 구분자로 병합. 병합 전 기존 `MEMORY.md`를 `<name>.bak.<unix_ts>`로 백업 |
| `settings.json` → `permissions.allow` | JSON | `config.yaml` → `command_allowlist` | `Bash(...)` 패턴만 매핑 가능(`claude_rule_to_command_pattern`), 매핑 안 되는 규칙은 `unmapped_rules`로 리포트만 되고 버려짐 |
| `settings.json` → `permissions.deny` | JSON | `config.yaml` → `approvals.deny` | 위와 동일한 매핑 함수, deny는 `unmapped_rules` 추적 안 함(`track_unmapped=False`) |
| `~/.claude.json`(부모 디렉터리) → `mcpServers`, 없으면 `settings.json` → `mcpServers` | JSON | `config.yaml` → `mcp_servers` | `.claude.json`이 **우선**(같은 이름이면 먼저 본 것이 유지, `setdefault`) |
| `skills/` 디렉터리 | 폴더 | Hermes 스킬 카테고리 `claude-code-imports` | `import_skills()` 호출(세부 변환 로직은 이번 조사에서 안 읽음) |
| `commands/*.md`(슬래시 커맨드) | 폴더 | **없음** | "Claude slash commands have no direct Hermes equivalent — consider converting them into skills"라고만 기록하고 skip. **1:1 대응 기능 없음이 소스로 확정됨** |

**중요 — 시크릿은 절대 안 옮긴다(소스 상단 docstring, 코드로 강제):**
```
Secrets are NEVER imported: credential files are never read, and MCP env vars with secret-looking
names (KEY, TOKEN, SECRET, PASSWORD, ...) are stripped and reported so the user re-adds them via
`hermes setup` or config.yaml.
```
정규식 `_SECRET_KEY_RE`가 `API_KEY`/`APIKEY`/`TOKEN`/`SECRET`/`PASSWORD`/`PASSWD`/`CREDENTIALS`/`AUTH`/`PRIVATE_KEY`/`ACCESS_KEY`류 이름, 혹은 `*_KEY`로 끝나는 이름을 전부 걸러 스트립하고 `stripped_secrets`로 리포트만 한다.

**안전장치들(소스로 확인):**
- 기존 `config.yaml`이 깨진 YAML이거나 매핑이 아니면 `ConfigReadError`로 **거부하고 파일을 바이트 단위로 그대로 둔다**(read-modify-write 라운드트립 중간에 정보를 잃는 걸 막기 위한 설계).
- `--dry-run`은 실제 쓰기 없이 무엇을 할지만 리포트(모든 `apply()` 호출이 `self.execute` 플래그로 분기).
- `--overwrite` 없으면 이름 충돌 시 기존 항목 유지(skip).

**Codex(`~/.codex`) → Hermes 매핑**은 구조가 다르다: `config.toml`을 읽고 `mcp_servers` 테이블만 가져오며, `AGENTS.md`는 Claude의 `CLAUDE.md`와 동일하게 메모리로 흡수하되, **`memories/*.md` 디렉터리 전체**도 추가로 흡수한다(Claude Code 쪽엔 이 단계가 없음 — Claude Code는 원래 memories 디렉터리 개념이 없기 때문으로 추정, 소스에 이유 설명은 없음).

**결론 — "가장 중요한 것"에 대한 답**: `import-agent`는 **컨텍스트(지침 문서)와 권한 allowlist/denylist, MCP 서버 설정, 스킬**을 옮기고, **API key·크리덴셜·슬래시 커맨드**는 옮기지 않는다. 이관 후에도 사람이 직접 해야 하는 일은 (a) `hermes setup`으로 API key 재입력 (b) 슬래시 커맨드를 스킬로 수동 재작성 (c) `unmapped_rules`로 리포트된 allow/deny 규칙 수동 이관.

### C-2. `hermes skills` / SKILL.md 호환성 — 기존 문서에 이미 확정, 재확인만

`research/2026-09-07-hermes-agent.md` §3이 이미 "SKILL.md 마크다운 스킬 포맷을 공식 지원, agentskills.io 오픈 표준 호환, `~/.hermes/skills/`가 source of truth"까지 공식 문서 축자 확인으로 닫아뒀다. 이번 조사에서 실제 설치 로그(§9의 Naver 블로그 실측)로 교차 확인된 것: 신규 설치 시 **58개의 번들 스킬이 기본으로 동기화**되며(`Syncing bundled skills into ~/.hermes/skills/ ...`), 카테고리는 `autonomous-ai-agents`(claude-code, codex, computer-use, hermes-agent, opencode), `creative`, `devops`, `email`, `media`, `note-taking`, `productivity`, `research`, `software-development`, `web` 등으로 나뉜다. `hermes-agent-skill-authoring`이라는 **스킬 작성법 자체를 가르치는 스킬**이 번들에 포함돼 있다는 것도 확인(실측 로그의 스킬 목록에 존재) — 다음 조사자가 이걸 열어 스킬 작성 컨벤션을 확인할 수 있다.

`hermes bundles`, `hermes curator`, `hermes plugins`는 `--help` 텍스트만 확인:
- `bundles`: "Create, list, and manage skill bundles (aliases for multiple skills)" — 여러 스킬을 하나의 별칭으로 묶는 기능.
- `curator`: "Background skill maintenance (curator) — status, run, pause, pin" — 백그라운드에서 스킬을 자동 개선/정리하는 프로세스(공식 문서 홈의 "self-improving" 서술과 일치).
- `plugins`: "Manage and validate plugins" — 세부 미조사.

근거 등급: 공식 문서(SKILL.md 호환) — 기존 문서 인용 · 1차 실측(58개 번들 스킬 목록, 실제 설치 로그) · 1차 실측(`--help` 텍스트, 이번 조사).

### C-3. `hermes mcp` — MCP 서버 연결

`--help` 원문(2026-09-11, 실행은 `--help`만):
```
positional arguments:
  {serve,add,remove,rm,list,ls,test,configure,config,login,reauth,picker,catalog,install}
```
`hermes mcp add`가 "discovery-first install"이라고 명시 — MCP 서버를 추가할 때 먼저 뭘 제공하는지 찾아본 뒤 설치하는 흐름으로 추정(세부 UX는 미실행 확인). `hermes mcp catalog`는 "Nous-approved MCPs" 목록, `hermes mcp install <name>`으로 카탈로그 항목을 원클릭 설치(예시로 `hermes mcp install n8n`). `hermes mcp serve`는 반대 방향 — **Hermes 자신을 MCP 서버로 노출**해 다른 에이전트가 Hermes 대화에 접근할 수 있게 한다.

근거 등급: 1차 실측(`--help` 텍스트 원문).

### C-4. `hooks`, `project`, `sync`, `skin`, `dashboard`, `memory` — `--help` 확인

전부 `--help`만 조회(실행 안 함), 2026-09-11:

- **`hooks`**: `~/.hermes/config.yaml`에 선언한 셸스크립트 훅을 검사·테스트·철회. 서브커맨드 `list/test/revoke/doctor`. `doctor`는 "exec bit, allowlist, mtime drift, JSON validity, synthetic run timing"까지 점검 — Claude Code의 훅 시스템과 개념적으로 유사하지만 첫 사용 시 동의(consent) 절차(`~/.hermes/shell-hooks-allowlist.json`)가 있다는 점이 다르다.
- **`sync`** ("Skill Sync"): "keeps your skills with you" — 개인 스킬을 여러 기기 사이에서, 조직 소속이면 팀 공유 스킬까지 동기화. 서브커맨드: `status/pull/push/now/enable/disable/device/propose`. `propose`가 "Share a skill with your organisation"이라 팀 배포 채널로 보인다 — `research/2026-09-07-hermes-agent.md`가 미확인으로 남긴 "Skills Hub 배포 절차"의 답이 이거일 가능성이 있으나(Hub와 Sync가 동일 메커니즘인지, 별개인지는 확인 못함), **완전히 닫지는 못했다.**
- **`skin`**: `list/use/set` — 색상 테마 전환·부분 커스터마이즈(`skin set ui_tool '#00FFFF'`). `dashboard.theme` 설정 키(config_defaults.py 확인, 1차 실측)와 별개 시스템으로 보인다(CLI 스킨 vs 대시보드 테마).
- **`dashboard`**: "Start the web UI dashboard". config_defaults.py에서 `dashboard.theme`(default/midnight/ember/mono/cyberpunk/rose), `dashboard.show_token_analytics`(기본 False — "토큰/비용 분석은 로컬 하한 추정치일 뿐 청구서가 아니고, 보조 호출·재시도·폴백·캐시 쓰기는 안 잡혀서 실제 청구액의 10~100배 낮게 나올 수 있다"는 경고 주석 확인) 등을 1차 실측.
- **`memory`**: `--help` 상 "Configure external memory provider" — 외부 메모리 프로바이더(Honcho 등, 공식 문서 홈이 언급한 "Honcho 유저 모델링") 설정용으로 추정. 세부는 미조사.
- **`project`**: "Manage projects (named, multi-folder workspaces)" — 여러 폴더를 하나의 "프로젝트"로 묶어 관리하는 기능. Claude Code의 프로젝트 개념과 다르게 **명명된 워크스페이스**라는 점이 특징.

### C-5. 상태 표시줄(status line) 커스터마이즈 — 설정 키 확정

**가능하다.** `hermes_cli/config_defaults.py` 원문(2026-09-11 Read 확인), `display.status_bar` 항목:

```yaml
display:
  status_bar:
    fields: []   # 비어있으면 기본 세트, 채우면 그 필드만(순서는 내장 순서 유지)
```

소스 코드 주석이 사용 가능한 필드를 전부 나열한다:
> `model, context_detail, context_pct, cache_hit, latency, tps, compressions, bg_tasks, bg_processes, bg_subagents, goal, duration, prompt_elapsed, idle_since, focus, yolo, stash, battery, title, total_tokens`(세션 합계, opt-in 전용)

주석은 또한 **"좁은 터미널에서는 `context_detail`/`prompt_elapsed`/`idle_since`가 자동으로 빠진다"**고 명시 — 터미널 폭에 따라 실제 표시가 달라질 수 있다는 뜻. 별개로 게이트웨이(메신저) 채널용 `display.runtime_footer`(기본 비활성, `fields: ["model", "context_pct", "cwd"]`)도 있는데 이건 CLI 상태줄이 아니라 **최종 메시지 하단에 붙는 푸터**다 — 둘을 혼동하지 말 것.

근거 등급: **1차 실측(소스 원문 직접 확인)**.
출처: `C:\Users\yusun\AppData\Local\hermes\hermes-agent\hermes_cli\config_defaults.py` 라인 887-902 (2026-09-11, Read 원문 확인)

### C-6. `SOUL.md`와 `AGENTS.md`(+ `CLAUDE.md`, `.hermes.md`) — 역할 차이와 우선순위 (1차 실측, 소스 확정)

`agent/prompt_builder.py`의 `build_context_files_prompt` 함수 docstring이 정확한 우선순위를 명시한다(2026-09-11 Read 원문 확인):

> "Only ONE project context type loads, first found wins: `.hermes.md`/`HERMES.md`(walk to git root) → `AGENTS.md` chain(git root → cwd) → `CLAUDE.md`(cwd) → `.cursorrules` + `.cursor/rules/*.mdc`(cwd). `SOUL.md` from `HERMES_HOME` is independent and always included unless *skip_soul* (already the identity slot)."

정리하면:

| 파일 | 위치 | 역할 | 로드 조건 |
|---|---|---|---|
| `SOUL.md` | `HERMES_HOME`(프로필별, 예: `~/.hermes/` 또는 커스텀 `HERMES_HOME`) | **정체성(identity) 슬롯** — 페르소나. cron 실행에서도 이건 유지하되 cwd 컨텍스트만 스킵 | 항상 로드(스킵 옵션 없는 한) — **프로젝트와 무관하게 독립적** |
| `.hermes.md` / `HERMES.md` | git root까지 walk | **프로젝트 컨텍스트 1순위** | 존재하면 이것만 로드하고 아래는 안 봄 |
| `AGENTS.md` | git root → cwd 체인 | 프로젝트 컨텍스트 2순위(HERMES.md 없을 때) | 위 없을 때만 |
| `CLAUDE.md` | cwd | 프로젝트 컨텍스트 3순위 | 위 둘 다 없을 때만 |
| `.cursorrules` + `.cursor/rules/*.mdc` | cwd | 프로젝트 컨텍스트 4순위(최후) | 위 셋 다 없을 때만 |

**이건 "다중 파일을 병합"하는 게 아니라 "가장 우선순위 높은 파일 하나만" 쓴다는 뜻**이다 — `AGENTS.md`와 `CLAUDE.md`가 둘 다 있어도 `AGENTS.md`만 읽고 `CLAUDE.md`는 완전히 무시된다.

이 레포의 `CLAUDE.md` §Gotchas가 이미 "결선 작업의 cwd는 `~/projects/pathfind-web`으로 고정하고 그 레포엔 `CLAUDE.md`를 두지 않으며 지침 파일명은 `HERMES.md`로 한다"고 정해뒀는데, **이번 소스 확인으로 그 결정의 근거가 정확히 맞다는 게 확정됐다** — `.hermes.md`/`HERMES.md`가 `AGENTS.md`보다도 우선순위가 높으므로, 그 레포에 `HERMES.md`를 두면 확실하게(다른 파일과 경쟁 없이) 최우선으로 로드된다.

추가로 확인한 것: **전역 지침을 두는 정본 위치는 `HERMES_HOME`의 `SOUL.md`다.** `HERMES.md`/`AGENTS.md`/`CLAUDE.md`는 **프로젝트별**(cwd 종속) 컨텍스트이고, `SOUL.md`만 프로필 전역이자 cwd 무관이다. 참고로 `HERMES_HOME`이 설치 트리(Hermes 자체 레포) 안으로 잘못 잡히면 그 레포의 컨트리뷰터용 `AGENTS.md`를 시스템 프롬프트로 오독하는 사고를 막기 위해, `cwd`가 명시 지정되지 않고 install tree로 폴백된 경우 프로젝트 컨텍스트 discovery 자체를 건너뛴다는 방어 로직도 소스에 있다(`_is_install_tree` 체크, #64590 이슈 참조 주석).

근거 등급: **1차 실측(소스 원문 직접 확인)**.
출처: `C:\Users\yusun\AppData\Local\hermes\hermes-agent\agent\prompt_builder.py` 라인 1568-1600, 1436-1467 (2026-09-11, Read 원문 확인) · `hermes_cli\default_soul.py`(SOUL.md 최초 시딩 로직, 동일 접근일)

### C-7. Hermes를 "하네스"로 굴린 사례 — 계획·실행·완료 분리, 훅 게이트

공식 힌트 두 가지를 소스에서 확인:
- `/plan` 슬래시 커맨드가 있다 — 실측 로그(§9)에서 "Tip: `/plan` writes a markdown implementation plan to `.hermes/plans/` without executing anything"이라는 배너 문구를 그대로 확인했다. **계획을 실행과 분리해 파일로 먼저 뽑아두는 기능이 내장돼 있다** — Claude Code의 계획 모드와 유사한 개념.
- `hooks doctor`가 "exec bit, allowlist, mtime drift, JSON validity, synthetic run timing"까지 점검한다는 것은, 셸훅을 하네스의 "게이트"(사전조건 검사)로 쓰는 것을 Hermes가 공식적으로 지원한다는 뜻이다. 다만 **이번 조사에서 실제 사용자가 이걸 Claude Code 스타일의 "계획→실행→완료 하네스"로 조립한 사례**(레포 자동화, 마일스톤 완료 훅 등)는 한국어 블로그·영어 커뮤니티 어디서도 찾지 못했다. **확인 불가.**

근거 등급: 1차 실측(실측 로그의 배너 문구, `hooks doctor` 서술) — "굴린 사례" 자체는 미확인.

---

## D. 남들의 실측 (한국어 우선, `ncli` 사용)

### D-1. `ncli` 검색 결과 요약

`ncli search blog/cafe/kin`으로 "Hermes Agent 솔라", "Hermes Agent Solar Pro", "Hermes Agent 솔라 프로4", "Hermes Agent 업스테이지"를 검색(2026-09-11). 대부분은 업스테이지의 Solar Open 2/Solar Pro 4 **출시 보도자료를 재가공한 주식·뉴스 블로그**였고("OpenRouter·Hermes Agent 등재" 같은 문구가 반복 — Hermes Agent를 모델이 등재되는 플랫폼으로만 언급, 실제 사용기 아님), MABC 참가자의 Hermes 후기는 **0건**(`ncli search blog "MABC 2026 Hermes Agent 결선"` 결과 0건, `ncli search kin` 0건).

예외적으로 실사용 로그를 올린 블로그 1건을 발견: **Naver 블로그 `position1128`("Touch my memory at this virtual place."), 2026-09-07 작성, 「AMD AI PRO R9700 32GB 시스템 환경 AI오케스트레이션 준비중/Prepared Vol.Hermes」 2편.** 이 블로거는 Windows에 Hermes v0.21.0을 처음 설치하는 전 과정과 이후 로컬 Ollama 모델(Qwen3.8, **Solar가 아님**)로 첫 채팅을 하는 로그를 통째로 캡처해 올렸다.

근거 등급: **3자 전언(개인 블로그, 원문 축자 확인 — 단 Solar Pro 4가 아니라 로컬 Ollama 모델을 쓴 사례라 A~C절의 Solar 전용 내용과는 별개 취급)**.
출처: https://m.blog.naver.com/position1128/224403149497, https://m.blog.naver.com/position1128/224403165184 (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 원문 축자 확인 — `blog.naver.com` 데스크톱 URL은 iframe이라 빈 응답, `m.blog.naver.com` 모바일 URL로 우회해야 본문이 나온다는 것도 이번 조사에서 확인한 함정)

### D-2. 이 블로그 실측에서 건질 수 있는 것

Solar Pro 4 전용은 아니지만 **Hermes 자체의 운용 함정**으로 이 프로젝트에도 적용 가능한 것들:

1. **컨텍스트 파일 초과 시 조용히 잘리는 게 아니라 경고를 띄운다**: 실측 로그에 `⚠️ Context file AGENTS.md TRUNCATED: 95167 chars exceeds limit of 62914 — trim the file, pin a larger context_file_max_chars, or use a larger-context model!`가 그대로 찍혀 있다. `context_file_max_chars`가 `null`이면 "모델의 컨텍스트 윈도에 맞춰 자동 스케일(하한 20K, 상한 500K)"(config_defaults.py 1차 실측)이므로, **큰 `AGENTS.md`/`HERMES.md`를 쓰려면 모델의 컨텍스트 윈도가 충분히 커야 한다** — 작은 모델로 전환하면 같은 파일이 갑자기 잘리기 시작한다.
2. **모델 이름을 잘못/구식으로 지정하면 HTTP 404가 나고, 그 에러 메시지가 TUI 렌더링과 겹쳐서 읽기 힘들다**(실측 로그에 ANSI 컬러 코드가 텍스트에 섞여 나온 것으로 보아 터미널 렌더링 깨짐 — 캡처 도구 문제일 수도 있어 이건 재현성이 낮은 관찰로 등급을 낮춰 취급).
3. **세션 간 "기억"이 즉시 공유되지 않는다** — 블로거가 Ollama CLI에서 한 대화를 Hermes TUI 세션에서 "기억하냐"고 물었을 때 Hermes가 정확하게 "그 대화는 다른 채널(Ollama CLI)의 기록이고 내 영구 기억(memories 폴더)에는 없다"고 스스로 진단했다 — Hermes의 메모리는 **Hermes를 거쳐 간 대화만** 쌓이지, 같은 모델을 다른 클라이언트로 쓴 이력까지 자동으로 흡수하지 않는다는 것을 실측이 보여준다.
4. **응답이 `finish_reason='length'`로 잘리는 게 실제로 자주 뜬다**(로그에 `⚠️ Response truncated (finish_reason='length') - model hit max output tokens`가 3회 등장) — A-5절의 공식 경고(reasoning + 낮은 max_tokens 조합의 위험)가 실전에서도 재현된다는 정황 증거. 단 이 사례는 로컬 Qwen 모델이고 Solar Pro 4가 아니므로 **직접 증거는 아니고 정황 증거**로만 취급한다.

근거 등급: 3자 전언(1차 실측 블로그, 원문 축자 확인) — Solar Pro 4에 대한 직접 증거 아님, 일반적 Hermes 운용 함정으로만 인용.

### D-3. 영어권(GitHub issues, Reddit) 검색

WebSearch로 "Hermes Agent Solar" 조합을 영어권에서 검색했으나, 검색 결과 상위는 전부 벤치마크/가격 비교 사이트(OpenRouter, LM Market Cap, Puter Developer 등)였고 **GitHub NousResearch/hermes-agent의 이슈 트래커에서 Solar Pro 4를 구체적으로 다루는 이슈, 또는 Reddit r/LocalLLaMA의 Hermes+Solar 조합 스레드는 이번 검색에서 찾지 못했다.** 검색 쿼리 2회(`Upstage Solar Pro 4 rate limit`, `Upstage rate limit Tier RPM TPM`)만 시도했고 GitHub 이슈 트래커 자체를 직접 검색(`site:github.com/NousResearch/hermes-agent`)하지는 않았다 — **후속 조사 필요, 이번 조사는 시간 예산상 여기서 멈춤.**

근거 등급: 미확인(탐색 부족, 사다리를 끝까지 올리지 않음 — GitHub 이슈 검색을 직접 시도하지 않은 것은 명백한 공백).

### D-4. MABC 2026 참가자 공개 후기

`ncli` 블로그 검색, WebSearch 둘 다 **0건**. Naver 카페 검색에서도 MABC 관련 결과 없음. **확인 불가 — 존재 자체가 확인되지 않음**(비공개거나, 아직 결선 진행 중(9/9~9/16)이라 후기가 안 올라온 시점일 가능성이 높다 — 결선 기간과 이번 조사 시점(2026-09-11)이 겹친다는 점을 감안하면 자연스러운 결과).

---

## E. 이 조사가 새로 닫은 기존 문서의 공백

`research/2026-09-07-hermes-agent.md` §4가 hard-stop으로 남긴 첫 번째 항목 — **"Upstage 콘솔 스크립트로 Claude Code 안에서 Solar 사용" — 공식 스크립트 원문 미확인** — 을 이번 조사에서 확정했다.

Upstage 공식 문서 `console.upstage.ai/docs/integrations/claude-code.md`(2026-09-11, `stealthy_fetch` 축자 확인):

> "Run [Claude Code](https://www.anthropic.com/claude-code), Anthropic's agentic coding CLI, on **Upstage Solar** models. A single script points Claude Code at the Upstage API and launches it — your shell profile and existing `~/.claude` settings are left untouched."
>
> Install: `curl -fsSL https://console.upstage.ai/claude-solar.sh | sh`

이 스크립트는 **공식으로 존재**하며, `claude-solar`라는 CLI 별칭을 설치해 `claude-solar --model`, `claude-solar --continue`, `claude-solar doctor`, `claude-solar login/logout` 서브커맨드까지 제공한다. API key는 옵트인 시에만 OS 키체인에 저장되고 `~/.claude` 설정 자체는 건드리지 않는다고 명시.

**같은 문서 세트에 Hermes Agent 전용 설치 스크립트도 있다**(이번 조사 §C 전체가 이걸 근거로 씀): `console.upstage.ai/docs/integrations/hermes-agent.md`의 `curl -fsSL https://console.upstage.ai/hermes-upstage-setup.sh | bash` — Upstage를 OpenAI 호환 커스텀 provider로 등록하고 `solar-pro4/solar-pro3/solar-pro2/solar-mini` 중 모델을 고르게 하는 대화형 스크립트다. 비대화형 설치는 `./hermes-upstage-setup.sh --api-key up_xxx --model solar-pro4 --yes`.

**⚠ 이 사실 자체가 MABC 규정과 충돌 가능성이 있다는 점을 명시적으로 적어둔다**: 이 프로젝트 `CLAUDE.md`의 결선 규정 요약(제9조 2항)은 "결선 개발에 허용된 AI 도구는 ① 타임리 ② Solar Pro 4 연동 Hermes Agent 둘뿐이고 Claude Code 등 외부 AI 코딩 어시스턴트 사용은 부정행위"라고 못박고 있다. Upstage 공식 문서가 "Claude Code를 Solar 위에서 돌리는" 스크립트를 **공식으로 제공**한다는 사실은, 그 스크립트의 존재 자체가 규정 위반의 회색지대를 만든다는 뜻은 아니지만("Solar API로 Claude Code를 구동하는 것"과 "Hermes Agent가 Solar를 provider로 쓰는 것"은 다른 조합이다) — **혼동하지 않도록 이 문서에 명시**: 결선에서 허용되는 건 어디까지나 `console.upstage.ai/docs/integrations/hermes-agent.md`의 조합(Hermes + Upstage provider)이지, `claude-solar.sh`(Claude Code + Upstage) 조합이 아니다. 이 판정은 규정 재해석이 아니라 **사실관계를 명확히 하기 위한 주석**이며, 최종 판단은 이 문서가 아니라 `docs/finals-guide.md`가 소유한다.

근거 등급: 공식 문서(축자 확인).
출처: https://console.upstage.ai/docs/integrations/claude-code.md, https://console.upstage.ai/docs/integrations/hermes-agent.md (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 원문 축자 확인)

---

## F. 오류 코드 참고표 (공식, 요약)

Upstage 공식 에러 코드 문서(`/docs/resources/error-codes.md`, 2026-09-11 축자 확인)에서 운용 중 마주칠 가능성이 높은 것만 발췌:

| HTTP | code | 뜻 | 대응 |
|---|---|---|---|
| 400 | `invalid_request_body` | JSON 문법 오류, 필수 키 누락, 존재하지 않는 모델명 등 | 요청 바디 점검 |
| 401 | `invalid_api_key` | key 누락/오탈자/삭제됨 | 헤더 `Authorization: Bearer <API_KEY>` 형식 재확인 |
| 401 | `api_key_is_blocked` | **key는 유효하지만 크레딧 소진 + 결제수단 미등록으로 차단됨** — 새 key를 발급해도 해결 안 됨 | 결제수단 등록 또는 크레딧 구매 |
| 429 | `too_many_requests` | rate limit 초과 | `Retry-After` 헤더만큼 대기 |
| 429 | `usage_limit_exceeded` | **계정에 설정된 사용량 한도 도달 — rate limit이 아니라서 재시도해도 안 풀림** | 크레딧 구매/결제수단 등록 |
| 499 | `client_closed_request` | 클라이언트가 먼저 연결을 끊음(타임아웃 등) | 타임아웃 늘리거나 스트리밍 사용 |

`api_key_is_blocked`와 `usage_limit_exceeded`를 `too_many_requests`(429)와 혼동하지 않는 것이 중요하다 — 셋 다 사용자 입장에서는 "요청이 실패한다"로 보이지만 **재시도로 풀리는 건 `too_many_requests`뿐**이다.

근거 등급: 공식 문서(축자 확인).
출처: https://console.upstage.ai/docs/resources/error-codes.md (2026-09-11 접근, `mcp__scrapling__stealthy_fetch`, 표 전체 축자 확인)

---

## 종료 게이트

**hard-stop으로 닫음.** 남은 공백과 각각의 사다리 기록:

1. **A-1 Solar Pro 4 전용 프롬프팅 가이드 본문** — `console.upstage.ai/docs/capabilities/generate.md`가 accordion 렌더링이라 `.md` 확장자 요청으로는 뼈대만 나옴(`_SolarPro4Page (rendered on the docs page)`류). `stealthy_fetch`로 HTML 렌더 페이지를 직접 열어 JS 렌더링 후 텍스트를 뽑는 시도까지는 못 감 — 시간 예산 초과.
2. **B-4 Chat Completions 요청 합치기 가이드** — 임베딩 배치 예제만 확인, 챗 API 전용 가이드 존재 여부 미확인.
3. **C-4 `hermes sync`와 "Skills Hub"가 같은 채널인지** — `sync propose`가 Hub 배포 메커니즘인지 별개인지 확정 못함.
4. **C-7 Hermes를 하네스로 쓴 사례** — 검색 자체가 0건, 다른 검색어(예: "Hermes Agent workflow gate", "Hermes Agent CI")로 재시도 필요.
5. **D-3 GitHub 이슈 트래커 직접 검색** — `site:github.com/NousResearch/hermes-agent Solar` 류의 타겟 검색을 시도하지 않았다. 명백한 공백.
6. **D-4 MABC 참가자 후기** — 결선 진행 중(9/9~9/16)이라 시점상 존재하지 않을 가능성이 높음, 결선 종료 후 재검색 권장.

이 여섯 항목을 닫으려면 다음 라운드에서: (a) `mcp__scrapling__stealthy_fetch`로 `console.upstage.ai/docs/capabilities/generate` (`.md` 아닌 렌더 페이지, `network_idle: true`)를 열어 accordion 콘텐츠를 강제 로드, (b) GitHub 이슈 검색 API 또는 WebSearch에 `site:github.com/NousResearch/hermes-agent` 제한, (c) `hermes sync status`/`hermes sync propose --help` 세부 실행(사용자 동의 하에), (d) 결선 종료(9/16) 이후 MABC 관련 검색 재시도.

## 인입 판정 — 왜 노드를 신설하지 않았는가

이번 조사의 발견 대부분은 **버전 고정적 설정값**(v0.21.0의 특정 config 키, 특정 provider 플러그인의 특정 기본값)이거나 **일회성 사실**(Tier 0 수치, 에러 코드 표)이라, 지식 그래프가 요구하는 "재사용 가능한 압축 결론"의 형태로 일반화하기 어렵다고 판단했다. 유일하게 일반화 가능성이 있는 후보는 §A-4의 "Hermes가 provider의 실제 기본값을 조용히 뒤집을 수 있다"(provider profile이 서버 기본값과 다른 값을 자체 주입)는 패턴인데, 이건 Upstage 하나의 사례만 확인했고 다른 provider(Anthropic/OpenAI 등)에서도 같은 패턴이 있는지 교차 확인하지 않아 **일반화하기엔 근거가 1건뿐**이다. 다음 조사에서 2번째 사례(다른 provider profile 소스)를 확인하면 `hermes-provider-profile-can-override-server-default-silently` 류의 노드로 승격할 후보로 남겨둔다.
