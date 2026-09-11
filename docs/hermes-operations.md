# Hermes Agent 운용 지도 (M4 확정값 · 2026-09-11)

> 이 문서는 **판정과 기록**이다. 설정의 정본은 `%LOCALAPPDATA%\hermes\` (`config.yaml` · `SOUL.md` · `memories/` · `skills/`).
> 컨텍스트 파일 로드 규칙은 `hermes-workspace.md`, 조사 근거는 `research/2026-09-11-hermes-solar-operation.md`,
> 실행 기록은 `changesets/20260911-hermes-agent-setup/README.md` 가 소유한다.
> 계획: `plans/2026-09-11-M4-hermes-agent-setup.md` (work-id `m4-hermes-setup`)

## 0. 한 줄

Hermes 는 **범용 개인 에이전트**다(D1). 결선 산출물 제작 도구이기도 하지만 결선이 끝나도 남는다.
단, 결선 기간에는 **Solar Pro 4 외의 모델로 새는 경로가 하나도 없어야** 한다 — 규정 제9조 1항, 위반 시 실격.

## 1. 모델·차단값 (규정 제9조 1항)

| 키 | 값 | 왜 |
| --- | --- | --- |
| `model.default` / `model.provider` | `solar-pro4` / `upstage` | 주 모델 |
| `model.context_length` | `524288` | 자동 탐지 실패 시 256,000 으로 **절반** 떨어진다(§1.1) |
| `agent.reasoning_effort` | `high` | Solar 는 `low/medium/high` 3단계 — 상위 값은 `high` 로 클램프 |
| `auxiliary.<18개 슬롯>.provider` / `.model` | `upstage` / `solar-pro4` | **핵심.** 아래 §1.2 |
| `auxiliary.free_only` | `true` | OpenRouter 레인 차단 (§1.2) |
| `auxiliary.openrouter_model` | `"BLOCKED-BY-MABC-RULE-9-1"` | 비-`:free` 값이라 위와 조합돼 레인이 무조건 skip |
| `auxiliary.transient_retries` | `0` | 보조 호출 재시도 최소화 |
| `display.status_bar.fields` | `[model, context_pct, total_tokens, duration]` | `model` 이 제9조 1항 육안 확인 수단 |

### 1.1 `context_length` 를 손으로 박은 이유
`/v1/models` 는 모델 **이름만** 주고 context 를 안 준다. models.dev 에도 `upstage/solar-pro4` 가 없다(네트워크 허용 조회도 `None`).
Hermes 의 가족 패턴 표(`agent/model_metadata.py:371`)는 `solar-pro3: 131072` 까지만 있고 `solar-pro4` 가 **없어서**, 미지정 시 `DEFAULT_FALLBACK_CONTEXT = 256_000`(`:297`)으로 조용히 떨어진다.
출처: https://openrouter.ai/upstage/solar-pro4 (접근 2026-09-11) — **524,288 tok · max output 131,072**. Hermes 자체 픽스처(`tests/agent/test_models_dev.py:848`)와 일치.

### 1.2 "키가 없으니 안전"이 왜 거짓인가 — 보조 호출 자동 체인

`agent/auxiliary_client.py:1~8` 이 선언한 텍스트 자동 체인:

```
main provider+model → OpenRouter → Nous Portal → custom endpoint → native Anthropic → 직접 API-key providers → None
```

`auxiliary.<task>.provider` 의 **기본값이 `"auto"`** 이고, `"auto"` 만 `_EXPLICIT_PROVIDER_BRANCHES["auto"] = _resolve_auto_branch`(`:4752`)로 이 체인을 탄다.
`upstage` 처럼 **구체적인 provider 는 `resolve_provider_client`(`:4824`)가 체인에 넣지 않고** 레지스트리 브랜치(`_resolve_registry_branch` `:4834`)로 보낸다. 그래서 18개 슬롯을 전부 `upstage`/`solar-pro4` 로 못 박았다.
⚠ `_EXPLICIT_PROVIDER_BRANCHES` 에 `upstage` 는 **없다**(`auto`·`openrouter`·`nous`·`openai-codex`·`xai-oauth`·`custom` 6개뿐). 결론(자동 체인 미진입)은 같지만 경로가 다르다 — 2026-09-11 리뷰가 잡은 근거 오기다.
핀된 슬롯은 429 를 맞아도 `_try_main_agent_model_fallback`(`:3790`)이 같은 upstage/solar-pro4 라 `_failed_backend_skip` 에 걸려 되돌아온다.

슬롯 18개 (소스에서 직접 열거 — 계획서가 적은 9개는 과소였다):
`vision` `compression` `skills_hub` `approval` `review` `mcp` `title_generation` `memory_query_rewrite` `tts_audio_tags` `triage_specifier` `kanban_decomposer` `profile_describer` `goal_judge` `curator` `monitor` `background_review` `moa_reference` `moa_aggregator`
⚠ `web_extract`·`session_search` 는 **은퇴한 키**다 — 유저 config 에 남아 있어도 무시된다(소스 주석).

### ⚠ 핀의 사정거리 — 플러그인이 등록하는 aux task 는 덮지 못한다

18개는 `DEFAULT_CONFIG["auxiliary"]` 의 **내장 슬롯 전부**다. 그런데 런타임 aux task 키 집합은 그보다 넓다 — `PluginContext.register_auxiliary_task`(`hermes_cli/plugins.py:844`)가 만드는 엔트리의 기본값이 `:871` 에서 **`"provider": "auto"`** 이고, 트리에는 이미 핀 밖 호출 지점이 있다(`plugins/kanban/dashboard/plugin_api.py:1027` 의 `call_llm(task="kanban_estimator")` — config 어디에도 없는 키라 `{}` → `"auto"` → 체인).

**지금은 새지 않는다** — `plugins.enabled: [orca-status]` 뿐이고 `plugins_discovery.py:213` 의 opt-in 게이트가 kanban 을 로드하지 않아 도달 불가다.
**그래서 규칙은 하나다: 결선 중 `plugins.enabled` 를 늘리지 않는다.** 늘리는 순간 그 플러그인의 aux task 는 핀 밖에서 auto 체인으로 간다.

같은 이유로 **결선 중 건드리지 않는 키 셋**:
- `plugins.enabled` (위)
- `model.fallback_providers` · `model.fallback_model` — 용량 오류 래더(`auxiliary_client.py:6780~6795`)는 429/402/연결 오류에서 **explicit-provider 게이트를 의도적으로 건너뛴다**. 지금은 `fallback_chain` 미정의 + main 이 같은 Solar 라 무해하지만, 이 키를 추가하면 그 즉시 새는 길이 된다(`_try_main_fallback_chain:3955`)
- `delegation.provider` · `delegation.model` — `delegate_task` 자식은 미설정 시 부모(Solar) 상속이라 현재 안전하다(`main_provider_setup.py:68-75` · `tools/delegate_tool.py:533`). 설정하면 핀 밖 표면이 생긴다

OpenRouter 이중 차단: `_try_openrouter`(`:2136`)는 `free_only=true` + 모델이 `:free`/`stealth/` 접두가 아니면(`_is_free_model` `:2103`) **키 유무와 무관하게** 레인을 건너뛴다(`:2139`).
`fallback_chain` 은 per-task 키이고 미정의라 `_try_configured_fallback_chain`(`:3884`)이 즉시 None.

### 1.3 크리덴셜
`hermes auth list` — **비-Upstage 풀 0건**. `solar` 풀 #1 과 `upstage` 풀 #1 은 같은 `env:UPSTAGE_API_KEY` 참조(= 같은 키의 풀 별칭, F6 해소). `upstage` #2 는 `mabc-hermes-backup`(manual).
⚠ 키 **값은 읽지 않는다.** `.env` 직접 열람은 guard 가 차단하며 그게 맞다 — 차단의 근거는 "키 부재"가 아니라 §1.2 의 명시 pin 이다.

## 2. 스킬 (D3·D4·D7)

**화이트리스트 16개만 켠다.** 집계: `53 builtin, 53 local — 68 enabled, 38 disabled`.

켠 것: `kg` `ts` `sb` `memo` `askewly-design` `orca-cli` `orchestration` `pdf` `pt` `oss-contribute` `humanize-korean` `imagegen-prompt` `skill-creator` `find-skills` `context-manager` `lens` + Hermes 내장(아래 3종 제외 전부)

끈 것 38 = **외부 LLM 위임 3** (`claude-code` `codex` `opencode` — 삭제 아님, 결선 후 되돌린다) + **import 여집합 35**.
여집합에 `harness-plan/run/done/bootstrap/review/update` · `session-end/log/log-query` 9종이 들어간다 — D2(하네스는 내장 `/plan` + hooks 만 쓴다)의 이행이고, 내장 `/plan` 과 표면이 겹치기 때문이다.

⚠ **판정을 `hermes skills list` 로 하지 마라 — 이름 dedupe 된다**(`skills_tool.py:213`). import 53개를 넣어도 집계는 +47 로 보인다.
중복·존재 판정은 **파일시스템**으로 한다. 중복 6개(`codex` `pdf` `computer-use` `find-skills` `orca-cli` `orchestration`)는 `claude-code-imports/` 쪽 사본을 지웠다.

⚠ **`hermes skills config` 는 TTY 를 강제한다**(`main_agent_cmds.py:169`). 비활성은 `config.yaml` 의 `skills.disabled` 직접 기입으로 한다.
⚠ `hermes-agent` 는 `ESSENTIAL_SKILLS`(`skills_config.py:47`)라 비활성 자체가 불가하다.

## 3. MCP

| 이름 | 전송 | 판정 |
| --- | --- | --- |
| `context7` | HTTP `mcp.context7.com/mcp` | ✓ 연결 (3.5s · tools 2) |
| `scrapling` | 로컬 command | ✓ 연결 (tools 다수) |
| `figma` | HTTP `mcp.figma.com/mcp` | **skipped** — 원격 OAuth 이고 크리덴셜이 이관되지 않는다. 실패가 아니라 미인증 |

`hermes mcp test` 는 **이름 인자를 요구한다**(`hermes mcp test <name>`) — 인자 없이 부르면 exit 2.

## 4. 스킬 실호출 실증 (DoD2)

Solar Pro 4 는 Hermes 의 네이티브 `terminal` 툴 루프에서 **스킬을 자발적으로 호출한다** — 3/3 성공, 재시도 불요.
판정은 **"그 스킬 없이는 만들 수 없는 값"**으로만 한다("호출했습니다"는 증거가 아니다 — `docs/skills/pathfind.md` F-5).

- `ts` → `shelf.py recall 누끼` 실제 표 출력 → `rmbg`. Windows 경로 실패를 **스스로 진단해 4회 만에 복구**했다
- `kg` → Hermes 관련 노드 slug 3건, 파일시스템과 **3/3 정확 일치**
- `orca-cli` → 워크트리 22건을 `<UUID>::<절대경로>` 그대로

**실측 판정**: 이 레포의 F-5/F-8("Solar 는 산문 지시로 도구 호출을 강제할 수 없다")은 **타임리 스킬 실행 맥락의 관측**이고, Hermes 툴 루프에서는 재현되지 않았다. 두 표면을 같은 것으로 취급하지 마라.

## 4.5 정체성·기억·하네스 (Wave B)

| 파일 | 역할 | 크기 |
| --- | --- | --- |
| `SOUL.md` | **정체성·작업 규약.** 사용자 신원 · Askewly AI OS 방향 · 코딩 원칙 4개 · 용어 규칙 · 산출물 전달 · 리서치 인용 · 검증 · 도구를 먼저 뒤진다 | 5,112 B |
| `memories/MEMORY.md` | **이 기기에서만 참인 사실.** 로컬 CLI 3종 · 레포 배치 · 기기·SSH 함정 · `pathfind-web` 진행 상황 | 4,040 B |
| `memories/USER.md` | Hermes 가 자동 유지하는 프로필. 손대지 않는다(덮인다) | 287 B |

**둘의 경계**: 규약은 `SOUL.md`, 사실은 `MEMORY.md`. 겹치면 `SOUL.md` 가 이긴다.
⚠ import 는 `~/.claude/CLAUDE.md` 를 `§` 청크로 잘게 쪼개 `MEMORY.md` 에 부었다(31,597 B). Claude Code 런타임 전용 규칙이라 Hermes 에서 무의미하고 제10조 열람 시 오해거리다 — 재작성하고 `.bak` 은 `HERMES_HOME` **밖**으로 옮겼다(안 옮기면 통짜 원본이 같은 디렉터리에 남아 재작성의 근거가 무효가 된다).

### 훅 — 규정 제9조 2항 가드

`hooks/block_external_ai_cli.py` · `pre_tool_call` · `fail_closed: false`
차단 대상: `claude` · `codex` · `cursor(-agent)` · `opencode` · `aider` · `gemini`

**성격부터 적는다 — 고의 우회를 막는 그물이 아니라 우발 호출을 잡는 그물이다.**
서브셸 `(claude …)` · `sh -c "claude …"` · 변수 치환 `C=claude; $C` · `xargs` · `cmd /c` 로는 빠져나간다(2026-09-11 리뷰가 9종 실증). 그걸 막으려면 셸 파서가 필요하고, **그 복잡도는 거짓 양성을 늘려 마감을 더 위협한다.** 규정 준수의 주체는 사람이고 이 훅은 손이 미끄러지는 것을 잡는다.

**덮는 표면 3개** (이 밖은 사람이 지킨다)
| 툴 | 필드 | 검사 |
| --- | --- | --- |
| `terminal` | `command` | 명령 위치 토큰 |
| `process_manage` | `data` | 같음 — `terminal(background, pty)` 로 띄운 셸에 흘려 넣는 키 입력이라 같은 표면이다 |
| `execute_code` | `code` | **`subprocess`/`os.system`/`Popen`/`shell=True` 등이 함께 있을 때만** 문자열 리터럴을 본다. `provider = "claude"` 같은 단순 등장으로 막지 않는다 |

⚠ `execute_code` 는 `terminal.backend: local` 이라 **로컬 파이썬 커널**이고 실제로 쓰인다(이 환경 로그 22회). 그래서 덮었다.

**따옴표를 마스킹한다.** 초판은 셸 파서가 아니라 따옴표 안의 `;`·`&`·`|` 도 명령 구분자로 읽어 **정상 명령을 막았다** — `git commit -m "fix: cursor 위치; cursor 보정"` 이 차단됐다(2026-09-11 리뷰 지적1). 합격선이 거짓 양성을 더 비싸게 잡았으므로 코드를 고쳤다. `shlex` 는 쓰지 않는다 — `shell_hooks.py:25` 와 같은 이유로 Windows 백슬래시를 먹는다.

**회귀 테스트 `hooks/test_block_external_ai_cli.py` — 20케이스(차단 8 · 통과 12).** 스크립트를 고치면 이걸 먼저 돌린다. 통과 케이스가 더 많은 것이 의도다.

`fail_closed` 를 끈 근거(소스 확인): 스크립트가 죽으면 exit 1 이고 `shell_hooks.py:354` 는 **`BLOCK_EXIT_CODE`(=2)에서만** 차단한다. exit 1 은 `:362` 에서 경고 후 빈 stdout → 통과. spawn 실패·타임아웃도 `:350` 에서 통과. **exit 1 이 우연히 차단으로 해석되는 경로는 없다.**

⚠ 훅 명령이 `python` 을 **PATH 로 찾는다.** 해석 실패 시 "command not found" 로 fail-open 하고 WARNING 만 남아 **게이트가 조용히 무력화된다.** 그래서 결선 세션 시작 때 `hermes hooks doctor` 를 1회 돌린다(§5).

⚠ **동의는 `hooks list` 에 env 를 걸어서는 안 잡힌다.** 동의 기록은 `register_from_config` 가 **에이전트 세션 안에서** 한다 — `hermes --accept-hooks -z "…"` 로 세션을 한 번 돌려야 `shell-hooks-allowlist.json` 에 쓰인다.
⚠ **스크립트를 고치면 `script modified since approval` 경고가 뜬다.** 이때도 훅은 계속 발화하지만(실측), 경고를 지우려면 `hermes hooks revoke '<command 문자열 그대로>'` 후 `--accept-hooks` 세션을 다시 한 번 돌린다.
⚠ **`hermes hooks test <event>` 는 빈 합성 페이로드를 쏜다** — `hook is observer-only` 라고 나오고 이건 **배선만 증명할 뿐 거부를 증명하지 못한다.** 거부 경로는 실세션으로 확인한다(아래 실증 참조).

**거부·통과 동시 실증** (세션 `20260911_164134_adbf84`, `hermes sessions export 20260911_164134_adbf84` 로 되짚을 수 있다):
한 턴에서 `claude --version` → 차단 메시지 반환, 직후 `echo gate-ok` → `gate-ok` 정상 출력. 양방향이 같은 턴에서 확인됐다.

### 내장 `/plan`

⚠ **`hermes -z "/plan …"` 은 슬래시 명령으로 해석되지 않는다** — 리터럴 텍스트가 된다. `/plan` 은 CLI 세션 명령이고 `cli_commands_mixin.py:1888` 이 `build_plan_prompt(task)` 를 턴으로 큐잉한다. 비대화형 검증은 그 함수로 프롬프트를 만들어 `-z` 에 먹인다.
동작 확인: `.hermes/plans/<날짜>-<slug>.md` 작성 · **코드 변경 0건**(실행 대신 열린 질문을 남긴다).
### ⚠ 터미널 툴의 cwd 는 launch dir 가 아니라 홈이다 (2026-09-11 실측)

**확인된 사실** — `~/projects/pathfind-web` 에서 `hermes` 를 띄우고 `pwd` 를 시켰더니 **`/c/Users/yusun`** 이 나왔다. `hermes --in ~/projects/pathfind-web` 으로 띄워도 **똑같이 홈**이었다.
세션 레코드의 `cwd` 는 레포로 제대로 찍히는데(`cwd= C:\Users\yusun\projects\pathfind-web`) **터미널 툴이 보는 cwd 는 다르다.** 둘을 같은 것으로 보면 안 된다.
부수 관측: Hermes 는 `pathfind-web` 이 git 레포인데도 세션 레코드에 `git_repo_root: None` 을 남긴다.

그래서 `/plan` 이 만든 계획 파일도 `$HOME/.hermes/plans/` 로 갔다.

**확인 못 한 것** — 파일 도구(file tools)도 같은지는 **판정하지 않았다.** 확인하려면 결선 레포에 파일을 써야 하는데 그건 Claude 소관이 아니다(레포 규약). 반대 증거가 있다: 사용자의 `PRD.md`·`pathfind-src/` 는 실제로 `pathfind-web` 안에 들어가 있다 — **파일 도구는 워크스페이스로 제대로 가고 터미널 툴만 홈에서 시작하는 것으로 보인다.** 확정은 아니다.

**그래서 결선에서 할 일** — 터미널로 파일을 만들거나 옮길 때 **상대경로를 쓰지 않고 절대경로를 준다.** 불안하면 첫 턴에 `pwd` 를 한 번 시켜 어디인지 눈으로 확인한다. `hermes sessions list` 의 `Workspace` 열은 **터미널 cwd 가 아니므로** 이 판정에 쓰지 않는다.

## 5. 검증 커맨드 (복붙용)

```bash
export HERMES_HOME="$LOCALAPPDATA/hermes"
hermes config get agent.reasoning_effort          # → high
hermes config get auxiliary.free_only             # → true
hermes config get auxiliary.vision.provider       # → upstage
hermes config get model.context_length            # → 524288
hermes skills list | tail -1                      # → 68 enabled, 38 disabled
hermes mcp test context7                          # 이름 인자 필수
hermes config get plugins.enabled                 # 결선 중 늘리지 않는다 (핀 사정거리 밖)
hermes auth list                                  # 이름·상태만 본다 (키 값 금지)
hermes doctor                                     # Config version v41 · No deprecated keys · Upstage Solar ✓
hermes hooks doctor                               # 결선 세션 시작 때 1회 — 전 항목 PASS 여야 한다
python "%LOCALAPPDATA%/hermes/hooks/test_block_external_ai_cli.py"   # 훅 회귀 20케이스
hermes -z "<프롬프트>"                             # 비대화형 실호출 (기계 판정 경로)
hermes sessions export <ID>                       # ⚠ cwd 에 파일을 떨군다 — 레포에서 실행하지 말 것
```

## 6. 되돌리기

**`hermes import <zip>` 은 전체 rollback 이 아니다** — 덮어쓰기만 하고 새로 생긴 파일을 안 지우며, `--force` 가 필요하고, `state.db` 를 덮어 **세션 기록을 지운다**(`backup.py:942,959`). 제10조가 개발 기록을 대조하므로 **기본 롤백에서 제외한다.**

항목별로 되돌린다:
| 대상 | 방법 |
| --- | --- |
| import 스킬 | `skills/claude-code-imports/` 디렉터리 삭제 |
| config | `config.yaml.bak.m4*` 복원 (M4 가 남긴 것: `.bak.m4-` · `.bak.m4step3-` · `.bak.m4step4-`) |
| 스킬 비활성 | `skills.disabled` 리스트에서 이름 제거 |
| 훅 | `hermes hooks revoke` |
| `MEMORY.md` | scratchpad 로 옮긴 `MEMORY.md.bak.1789110886` 복원 |
| `SOUL.md` | `SOUL.md.bak.m4-*` 복원 |
| 훅 | 위 `hermes hooks revoke` + `config.yaml` 의 `hooks:` 블록 제거 |

전체 백업: `C:\Users\yusun\hermes-backup-m4-20260911_161400.zip` (481 files · 35.3 MB)

## 7. 미해결 (finding 큐)

- **F14** — `memories/USER.md` 에 `MABC 2026 결선 contestant` 문구가 남아 있다. 규정 문단이 아니라 사실 기술이고 Hermes 가 자동 유지하는 파일이라 손대지 않았다.
- **F3** — `hermes proxy` 는 OpenAI 호환 로컬 프록시를 띄운다. 결선 중 사용 금지로 잡았으나 **설정으로 차단하는 방법은 확인 안 함**
- **F5** — rate-limit 범위(키 단위 vs 계정 단위) 미확정. 확정하려면 키 값 접근이 필요해 보안 규약에 걸린다(D8). 대안은 Upstage 문의·디스코드 질의
- **F7** — `backup.py:99` `_SECRET_FILE_NAMES` 의 의미 부분 확인. 백업은 `.env`·`auth.json`·`state.db` 를 **포함**한다
- **F8 [정정 2026-09-11 — 최초 판정이 틀렸다]** — import 가 `command_allowlist` 에 넣은 `git -C*`·`vercel --prod`·`npx tsc*` 를 "권한면이 넓어졌다"고 적었으나, **스위치가 뭘 여는지 확인하지 않은 판정이었다.**
  `command_allowlist` 는 **승인 프롬프트를 건너뛰는 목록**이고(`tools/approval_floors.py:188 _command_matches_permanent_allowlist`), 프롬프트는 `detect_dangerous_command` 가 위험으로 분류한 명령에만 뜬다. 실측:
  ```
  vercel --prod            dangerous=False
  git push                 dangerous=False
  git -C /x push --force   dangerous=False
  rm -rf /tmp/x            dangerous=True   (delete in root path)
  git reset --hard           dangerous=True   (uncommitted 변경 파괴)
  ```
  세 항목 모두 **애초에 물어보지 않는 명령**이라 allowlist 등재가 동작을 바꾸지 않는다. 축소할 실익이 없다 — 사용자 판정 불요.
- **F8-b [F8 을 확인하다 나온 실제 사실]** — **Hermes 는 `vercel --prod` 도 `git push --force` 도 위험으로 분류하지 않는다.** allowlist 와 무관하게 확인 없이 실행한다. 결선 중 배포·푸시를 Hermes 에 맡길 때 "물어봐 주겠지"를 전제하지 않는다. 막고 싶으면 `approvals.deny` 또는 `pre_tool_call` 훅이 경로다(이번 milestone 범위 밖).
- **F9** — `openrouter` 플러그인이 `image_gen` provider(`openrouter`·`nous`)를 등록한다. LLM 보조 체인이 아니라 **이미지 생성 경로**이고(디스코드 규정상 이미지 생성 AI 는 허용), `hermes doctor` 는 `image_gen` 을 "system dependency not met" 으로 본다. 그래도 결선 중 사용 전 재확인 대상
