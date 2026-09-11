# Orca CLI 운영 지도

> **이 문서의 역할**: Claude·Codex가 Orca를 쓰기 전에 읽는 **실측 판정서**. *사용법*의 정본은 `orca skills get <name>`(번들 가이드 8종)이고, 여기에는 **"실제로 해보니 무엇이 되고 무엇이 물었는가"**만 적는다. 둘이 어긋나면 이 문서(실측)를 따르되 버전을 확인한다.
>
> 실측 환경: Windows · production `orca.exe` · 2026-07-19 ~ 2026-07-23.

**읽는 순서**: 급하면 [§0 사고 목록](#0-사고-목록--먼저-읽는다)만 읽는다 → 무엇을 쓸지는 [§2 결정 표](#2-결정-표--언제-뭘-쓰나) → 그 기능의 판정은 [§3](#3-기능별-실측-판정)에서 찾는다.

| 절 | 내용 |
|---|---|
| [§0](#0-사고-목록--먼저-읽는다) | **사고 목록** — 실제로 터진 것들. 이것만은 외운다 |
| [§1](#1-개념-단위와-소유-관계) | 개념 단위와 소유 관계 |
| [§2](#2-결정-표--언제-뭘-쓰나) | 하네스 단계별 결정 표 |
| [§3](#3-기능별-실측-판정) | 기능별 실측 판정 (worktree·terminal·orchestration·automations·browser·file·metadata·agent-context·remote) |
| [§4](#4-검증-현황) | 검증 현황 (완료 / 부분 / 재검증 대기) |
| [§5](#5-시작-체크) | 시작 체크 |

---

## §0 사고 목록 — 먼저 읽는다

실제로 터졌거나, 정상 응답을 주면서 아무 일도 안 한 것들. **성공 응답(`ok:true`)을 결과의 증거로 쓰지 않는다**가 이 목록의 공통 교훈이다.

| # | 함정 | 무슨 일이 나는가 | 어떻게 피하나 |
|---|---|---|---|
| 1 | **`terminal send --terminal ""`** | 빈 핸들이 **현재 활성 터미널로 폴백** → 주입 명령이 **호출자 자신의 입력창에 타이핑**됨(실제 사고) | 스크립트는 **handle이 비면 무조건 abort**. handle 경로는 `result.terminal.handle`(`result.handle` 아님) |
| 2 | **`terminal stop --worktree`** | worktree 단위라 **그 폴더의 터미널을 전부 죽인다 — 내 세션 포함** | 핸들 단위 `terminal close --terminal <handle>` 사용. ⚠ **`stop` 은 `--worktree` 만 받는다 — 개별 종료라는 선택지가 이 명령에 없다.** 하나만 끄고 싶으면 `close --terminal <handle>`(패널) 또는 `close --terminal <handle> --tab`(탭째) 뿐이다 |
| 3 | **`orchestration run` `--from` 생략** | `{"status":"running"}`을 반환하고 **task를 하나도 dispatch하지 않음**. 루프가 살아있지도 않다 | `--from <내 handle>`을 **항상** 준다 |
| 4 | **coordinator 워커 자동 선정** | **사람이 지금 쓰고 있는 세션**을 유휴 워커로 보고 주입(실제 사고) | 주입 전 `worktree ps`의 `prompt`·`state`로 점유 확인. `terminal list` 등재 ≠ 유휴 |
| 5 | **`automations run`(수동)** | **precheck를 우회**하고 곧바로 에이전트 기동. `--disabled`여도 실행됨 | 게이트 검증은 **예약 실행**으로만 |
| 6 | **자동화가 띄운 에이전트** | `⏵⏵ bypass permissions on` — 승인 없이 쓰고 커밋 가능한 에이전트가 **예약 시각에 혼자 깨어난다** | 프롬프트에 **읽기 전용 범위 명시**. 쓰기는 `new_per_run` 격리 |
| 7 | **`file diff`의 `ok:true`** | **diff 존재를 검사하지 않는다.** 무변경 파일·staged 0에도 성공 반환 | 변경 유무는 `open-changed`나 `git`으로 별도 판정 |
| 8 | **`file open-changed`** | **상한 없음** — 변경 7건이면 탭 7개(`--mode both`면 13개)를 열어 사용자 화면 점거 | `--json`으로 `totalChanged` 선측정 |
| 9 | **`worktree set` 값 검증** | `bogus-status`·없는 이슈 번호(999999)도 **그대로 저장**. 오타가 조용히 남음 | 신뢰 가능한 상태기계로 쓰지 않는다(사람용 라벨 전용) |
| 10 | **브라우저 포커스 기반 입력** | `type`·`keypress`·`inserttext`·`find --action fill`이 성공을 반환하고 **값이 안 들어간다.** ⚠ **무동작이 아니다 — 키 입력이 실제 포커스된 pane 으로 간다. 사람이 작업 중인 터미널에 타이핑된다**(2026-08-05 실제 사고 — 4개 중 1개(`orca-type-test`)가 타 워크트리 세션에 착지, **사용자가 입력 중이던 프롬프트 맨 앞에 끼어들었다**. 8터미널 전수 스캔으로 범위 확정, 잘못된 동작은 없었음. `keypress Enter` 2회의 착지는 관측되지 않음) | 입력·제출은 **반드시 `snapshot`→`--element <ref>`**. **`--element` 없는 입력 명령(`type`·`inserttext`·`keypress`)은 쓰지 않는다** — 검증 목적이라도. 굳이 시험해야 하면 사람이 안 쓰는 워크트리에서 하고 사전 고지한다.<br>**사고 후 범위 확인법**: `terminal read` 의 내용은 **`result.terminal.tail`** 이다(`result.output` 아님 — 이 오독으로 1차 스캔이 전 터미널 0건을 내 「피해 없음」으로 잘못 닫을 뻔했다) |
| 11 | **셀렉터 `branch:`·`name:`** | `branch:master` → `selector_ambiguous`(여러 레포 동명), `name:` 은 폴더명이 아니라 **displayName** | worktree 셀렉터 정본은 **`path:<절대경로>`** |
| 12 | **`~30초 뒤 `runtime_unavailable`** | snapshot·storage get·tab create 등에서 발생. **런타임 자체는 멀쩡** | orca RPC 전반의 알려진 타임아웃([#7410](https://github.com/stablyai/orca/issues/7410)·[#7848](https://github.com/stablyai/orca/issues/7848)). 실패 응답 뒤 `status`·`tab list`로 **부분 성공 여부 확인** |
| 13 | **`tab close` 가 인자 없으면 "닫을 활성 브라우저 탭이 없습니다"** (2026-08-07 실측) | 같은 시점 `tab list` 는 `active:true` 탭을 정상 반환한다 — 응답을 믿고 넘어가면 탭이 계속 쌓인다 | `tab list` 로 `browserPageId` 를 얻어 **`tab close --page <id>`** 로 명시. 정리 후 `tab list` 로 0 확인 |
| 14 | **`terminal close` 가 형제 핸들을 무효화한다** (2026-08-14 실측, ui-dictionary 워크트리 5개 정리) | `terminal list` 로 받은 핸들 11개를 순회하며 닫으면 **첫 1개만 닫히고 나머지는 `runtime_error / tab_not_found`** 가 난다. 한 탭을 닫으면 같은 목록의 다른 핸들이 낡는다 — 목록을 한 번 받아 반복문에 넣는 자연스러운 코드가 조용히 대부분을 놓친다 | **닫을 때마다 `terminal list` 를 다시 받아 하나씩** 닫는다(11개를 9회차에 소진 실측). 종료 판정은 반환값이 아니라 **재조회 결과 0** 으로 한다. ⚠ 함정 하나 더 — `while read h; do orca ...; done < file` 은 `orca` 가 루프의 stdin 을 먹어 **1회만 돌고 끝난다.** `</dev/null` 을 붙이거나 `for` 로 쓴다 |
| 15 | **TUI 준비 전 주입 — `terminal create` 직후 `terminal send`** (2026-08-15 실측, 브리핑 세션 발사 9개 중 8개 실패) | 프롬프트가 **통째로 증발한다.** Claude Code TUI 가 뜨기 전의 PTY 는 입력을 받아 주기만 하고 버리는데, `terminal send` 는 그래도 `ok:true` 와 `bytesWritten` 을 돌려준다. 세션 9개가 전부 빈 입력창으로 떠 있었고 사용자가 탭을 열어 보고 발견했다. ⚠ **permission mode 는 이 사고의 하류가 아니다 (M28 2026-09-03 교정)** — 구 처방은 이 증발이 mode 까지 끌어내린다고 적었으나(기동 중 선택지가 버려진 텍스트를 키 입력으로 먹는다는 설명), 2026-09-03 발사 6건에서 **주입에 성공한 건도 `⏵⏵ auto mode on` 으로 떴다**(착지 1/6 · bypass 0/6 — 두 분모가 다르다). mode 는 대기로 얻는 것이 아니라 `claude --dangerously-skip-permissions` 로 **명시 확보**한다 | **애초에 `send` 를 쓰지 않는다 — 첫 프롬프트는 argv 로 넣는다**(`create --command "claude --model <alias> --dangerously-skip-permissions '<프롬프트>'"`). 그러면 이 사고도 #16 도 성립하지 않는다. 정본 진입점은 `$HARNESS_SCRIPTS/launch_session.py` 하나이고 브리핑·harness-plan 이 그것만 부른다. 착지 판정은 **`read --screen` 프레임에 프롬프트가 에코됐는가**로 한다 — ⚠ **`terminal list` 의 `title` 로 판정하지 말 것**: 정상 착지해 답변까지 끝난 세션의 제목이 `✳ Claude Code` 로 남아 있었다(2026-09-03 실측 — 답이 짧으면 제목이 안 붙는다). 제목은 붙었으면 착지한 것이라는 **충분**조건일 뿐이다 |
| 16 | **`tui-idle` 이 folder-trust 다이얼로그에서도 satisfied 를 준다** (2026-08-15 실측) | 대기를 넣어도 "Is this a project you trust?" 가 떠 있는 상태를 준비 완료로 읽는다. 다이얼로그 중에 보낸 텍스트는 **큐잉되지 않고 버려진다**(gems-2026·mabc-2026) | wait 직후 **`terminal read --terminal <h> --screen`** 으로 한 번 확인한다 — ⚠ **`--screen` 을 반드시 붙인다**(구 처방은 bare `read` 를 시켰다. #20 참조). 다이얼로그면 **커서 위치를 먼저 읽는다** — ⚠ **기본 선택이 `❯ No, exit` 이다**(2026-09-03 실측). 맨 `send --text "" --enter` 를 보내면 **세션이 그대로 종료된다**(구 처방은 기본이 `Yes` 라고 적었다). `Yes, I trust this folder` 위가 아니면 `send --text $'[B'`(↓) 로 내린 뒤 Enter. ⚠ **문구도 버전마다 바뀐다** — 2026-09-03 실측은 "Quick safety check: Is this a project you created or one you trust?" 라 옛 마커로는 안 걸렸다. 처음 여는 레포·새로 만든 워크트리에서 뜬다. **argv 경로(#15)를 쓰면 프롬프트 재전송 자체가 불필요하다** — 프롬프트가 입력이 아니라 프로세스 인자로 실려 있어서 다이얼로그가 먹을 것이 없다 |
| 17 | **레포 폴더를 옮기면 그 워크트리 핸들이 stale 된다** (2026-08-15 실측, 아카이브 2건) | `terminal close` 가 `terminal_handle_stale` 로 거부된다. 폴더를 옮기기 **전에** 받아 둔 핸들은 이미 죽어 있다 | `terminal list` 를 다시 받아 **새 핸들로** 닫는다. 순서를 바꿔 이동 전에 터미널을 먼저 정리하면 더 낫다 |
| 18 | **`orchestration send` 는 배달이 아니라 적재다** (2026-08-17 실측, ui-dictionary 워크트리 3세션) | 사서함에 넣을 뿐 **상대 화면에 아무것도 뜨지 않는다.** 받는 쪽이 `orchestration check` 를 스스로 불러야 읽히는데, **orchestration 밖에서 태어난 세션**(사람이 워크트리에 그냥 띄운 것 — Task·Dispatch·preamble 이 없다)은 그걸 부를 이유가 없어 **영원히 안 읽는다.** 6건을 보내고 전건 `read:0 · delivered_at:null` 로 확인했다. 스킬 문서도 명문화한다: `check` 는 "never writes to terminal input or remotely wakes another terminal" | 상대 화면에 실제로 넣으려면 **`terminal send --terminal <handle> --text ... --enter`**(자유 프롬프트) 또는 **`dispatch --inject`**(추적 과제). 배달 여부는 `orchestration inbox --json` 의 `read`·`delivered_at` 으로 판정한다. 애초에 양방향이 필요하면 세션을 **`worker-start` 로 띄운다**(§3.3) — preamble 이 박혀야 `ask`/`reply` 가 성립하고, 사후 결합은 안 된다 |
| 19 | **워크트리 개설이 탭을 3개 남긴다** (2026-09-02 실측, ui-dictionary figma-mastery 등 3개 + agent-orchestration probe) | 에이전트 탭 외에 **setup 탭**(레포 hookSettings `setup: npm install` 이 `run-by-default` 로 돌고 끝난 뒤 pwsh 프롬프트로 남음)과 **폴백 셸 탭**(`--agent` 없는 bare `worktree create` 가 첫 터미널로 셸을 연다)이 붙는다. 사용자가 워크트리마다 손으로 둘을 닫고 있었다 | `--agent claude` 로 만들면 폴백 셸은 안 생긴다(실측: 탭 2개). 모델 플래그가 필요해 두 단계로 만들 때는 **setup 이 프롬프트로 돌아온 뒤 `terminal close --terminal <h> --tab`** 으로 여분 탭을 닫는다 — 닫을 때마다 재-list(#14). `spawn_chain.py` 가 이걸 기본으로 한다(`--keep-extra-tabs` 로 끔). setup 자체를 안 돌리려면 `--setup skip` |
| 20 | **`terminal read` 의 기본은 스트림이다 — 재도색되는 화면이 조각으로 온다** (2026-09-03 실측) | 셸에 `clear` 한 번을 보내고 bare `read` 하면 tail 이 `codexclaudeclecleaclear` 로 온다(키 입력이 쌓인 누적 출력). 같은 터미널을 `read --screen` 으로 읽으면 `PS …\toolshelf>` 한 줄이다. ⚠ **미문서 함정이 아니다** — `terminal read --help` 가 이미 적고 있다("the default is unsuitable for verifying rendered output. Use `--screen`"). 우리가 `--help` 를 안 읽어서 #16 이 틀린 도구를 시키고 있었다. ⚠ 이 빌드는 **TUI 가 완전히 붙은 뒤에는 bare `read` 도 `source: screen` 으로 자동 승격**한다 — 그래서 어쩌다 맞아 보이고, 셸·기동 중 창에서만 터진다 | 렌더 결과로 판정할 일이면 **항상 `--screen`**. 무엇을 받았는지는 응답의 **`source` 필드**(`stream`/`screen`/`screen-unavailable`)로 확인한다. 재현: `orca terminal read --terminal <h> --json` 과 `... --screen --json` 을 연달아 호출해 `source` 와 tail 을 대조 |
| 21 | **`terminal send` 는 입력창에 남은 draft 뒤에 붙는다** (2026-09-03 실측) | 입력창에 `쓰던메모` 가 남은 세션에 `send --text "안녕" --enter` 하면 **`쓰던메모안녕` 이 한 덩어리로 제출된다.** 오류가 없어서 **조용히 다른 작업**이 된다 — 실사고는 `/briefing` 이 `쓰던/briefing` 으로 제출돼 슬래시 명령이 아닌 일반 텍스트가 된 건이다(세션 `39d2f52e`) | **argv 경로(#15)를 쓰면 입력창을 안 거치므로 성립하지 않는다.** send 를 꼭 써야 하면 보내기 전에 `read --json` 의 **`draft` 필드로 잔여물을 확인**하고(위 재현에서 `draft = '쓰던메모'` 로 그대로 보였다) — ⚠ **`draft` 는 세 가지를 한 이름으로 보여 준다** (①② 2026-09-03 · ③ 2026-09-07 추가 실측): ①`send` 로 TUI 입력줄에 친 텍스트(다음 send 앞에 **붙는다**) ②사용자가 Orca 앱 컴포저에 친 텍스트(`--help` 의 "UI-only composer text" — **PTY 에 없어서 붙지 않고**, 맨 `send --text "" --enter` 로 **제출되지도 않는다**. 실측: 사용자 draft `세션 마무리하자` 에 Enter 를 보냈으나 아무 턴도 생기지 않았고 draft 는 그대로 남았다) ③**Claude Code 가 스스로 만들어 입력줄에 띄우는 다음-턴 제안 문장 — 사람이 친 것이 아니다**(2026-09-07 사용자 확정). 브리핑 세션이 `cover-letter` 의 `A로 가고 문항 3은 AI Intensive로. 본문 써줘` 와 `ui-dictionary` 의 `design-loop-repair 먼저 병합하고 M112 파자` 를 사람 입력으로 읽고, 사용자가 지시한 send 2건을 **불필요하게 보류**했다. 제안문은 그 세션의 맥락을 반영해 자연스럽게 읽히므로 **문장만 보고는 사람 입력과 구별되지 않는다**. **필드만 보고는 셋을 못 가른다** — ⚠ **그렇다고 「비어 있으면 보내고 아니면 안 보낸다」로 굳히지 말 것**: ③이 흔해서 그 규칙은 정당한 전달을 상시로 막는다(위 실사고가 그 모양이다). 판정은 draft 하나가 아니라 **`lastOutputAt`·`preview`·`read --screen` 프레임을 같이** 본다 — 에이전트가 답을 막 끝내고 멈춘 직후면 ③일 확률이 높다. 그래도 애매하면 **사용자에게 한 줄 확인**하고, 보낼 때는 **앞에 붙어도 말이 되는 문장**으로 쓴다(선두를 슬래시 명령으로 시작하지 않는다). `send --text $''`(Ctrl+U)로 비운 뒤 보낸다. 재현: `send --text "쓰던메모"`(--enter 없이) → `read --screen` 으로 draft 확인 → `send --text "안녕" --enter` → tail 에 `❯ 쓰던메모안녕` |
| 22 | **Codex `/hooks` 승인이 새 세션마다 다시 뜬다** (Windows, Orca v1.4.196 · Codex 0.153.0, 2026-09-03 실측) | Orca가 같은 hook state key를 역슬래시형·슬래시형 alias 둘로 쓰는데, Codex UI는 실제 lookup key 하나만 새 hash로 갱신한다. 두 alias가 갈리면 Orca가 충돌로 읽어 base 승격을 건너뛰고 다음 세션에 stale 신뢰가 다시 투영된다. 별개로 active `CODEX_HOME/hooks.json`만 고친 훅은 Orca refresh 때 사라진다 | 같은 review를 반복 승인하지 않는다. 지속 훅은 base `~/.codex/hooks.json`에 적용한 뒤 `orca agent hooks prepare-codex`로 active를 재생성한다. 이미 사용자가 승인해 alias만 갈렸다면 `python ~/projects/harness-engineering/scripts/deploy_codex_hooks.py reconcile-trust --codex-home <active-home> --cwd <repo>` dry-run 확인 후 `--apply`; Codex `hooks/list=trusted` + provenance/current 2값인 harness 훅만 수렴하고 새 훅은 자동 신뢰하지 않는다 |
| 23 | **런타임 업데이트 전 orchestration 스레드는 legacy read-only 가 된다** (Orca 1.4.197, 2026-09-04 실측 — Claude·Codex 두 세션) | 업데이트 전에 만들어진 메시지에 `reply --id` 하면 `legacy_read_only`·`effectsApplied:false` 로 거부되고, `check --unread` 도 「inspect-only; use --peek or --all」로 막힌다. `--inject` 플래그는 폐기(Unknown flag) | 옛 스레드엔 답하지 말고 같은 수신자에게 **새 `send`** 로 보낸다. 읽기는 `check --peek`. instruction 의 `--inject` 문구는 `scripts/check_codex_instruction_stale.py` 가 잡는다 |

---

## §1 개념 단위와 소유 관계

```text
Project
└─ Host setup
   └─ Repo
      ├─ main worktree (= workspace)
      └─ linked worktree (= 별도 workspace)
         ├─ terminal
         │  └─ agent session
         ├─ browser tabs
         └─ editor/file state

Orchestration
└─ Task
   └─ Dispatch ──→ 특정 terminal의 agent
      └─ worker_done / escalation / decision gate
```

| 단위 | 의미 |
|---|---|
| Project | 여러 host setup을 가질 수 있는 장기 논리 단위 |
| Host setup | 특정 머신에서 Project를 어느 경로·방식으로 사용할지 나타내는 설정 |
| Repo | Orca에 등록한 Git 저장소 |
| Workspace | Orca UI가 작업 상태를 묶는 일반 단위. worktree나 폴더 context가 될 수 있음 |
| Worktree | 실제 Git checkout 폴더와 브랜치. Orca metadata·terminal·browser 상태가 귀속됨 |
| Terminal | worktree 안의 shell/TUI pane |
| Agent session | terminal 안에서 실행되는 Codex·Claude 등의 세션 |
| Task | orchestration 작업 추적 레코드. 폴더·브랜치·worktree가 아님 |
| Dispatch | Task를 특정 terminal/agent에 할당한 lifecycle 기록 |
| Gate | Task 진행을 막는 coordinator/user 결정 지점 |
| Automation | 일정에 따라 prompt run을 만드는 예약 단위 |

**셀렉터 규칙 (실측)**: worktree 지정은 **`path:<절대경로>`가 정본**이다. `name:`은 displayName(기본값이 브랜치명이라 폴더명으로는 안 잡힘), `branch:`는 여러 레포가 같은 이름을 써서 `selector_ambiguous`가 난다. worktree 전체 ID는 `<repoId>::<worktreePath>`이며, 반복 호출에는 반환된 전체 ID나 terminal handle을 재사용한다.

---

## §2 결정 표 — 언제 뭘 쓰나

> 하네스(계획→구현→검증→검토) 단계별 orca 기능 선택 기준. 상세 사용법은 `orca skills get <name>`. 실측 근거: harness-engineering `research/2026-07-21-hq4-orca-survey.md`·`research/2026-07-22-orca-capabilities-survey.md`.

| 하네스 단계 | 상황 | orca 기능 |
|---|---|---|
| 계획(/harness-plan) | milestone 병행 격리 작업장 | `worktree create` (병행 실증: main=MM · 워크트리=HQ, 2026-07-21) |
| 계획→구현 경계(승인 직후) | 승인된 plan을 별도 워크트리·새 에이전트로 착수 | `~/.claude/skills/harness-run/scripts/spawn_chain.py` 1커맨드(SW2 정식 승격 2026-07-21 · 경로는 2026-07-24 재조립 P5 로 harness-run 이관) — 워크트리 개설→그 안에서 approve→패널 착수(resume 승계 포함). E2E: `evidence/harness/20260721-il1-e2e.md`·`20260721-sw2-e2e.md` |
| 구현(/harness-run) | 하위 에이전트 스폰·감독 | `terminal create/send/read/wait` — 전권 핸드오프도 이 경로(orca-cli 스킬) |
| 구현(/harness-run) | 감독형 다중 에이전트(DAG·게이트·회신 대기) | `orchestration task/dispatch/gate/run` — 위임 명시 결정(delegation.md)의 실행 경로 |
| 검증(DoD E2E) | **모바일(Android) 표면 실구동** | `orca emulator` — attach(부팅 포함)→install/launch→tap/ax→logcat. 조작 기본값(2026-08-04 실측, §3.10). 빌드+원샷 자동화·보이는 창 QA 는 apk-test 스킬 SDK 경로 |
| 검증(DoD E2E) | 웹 표면 실구동 | 내장 브라우저 `tab create`→**`snapshot`→`fill/click --element <ref>`**→네비게이션 후 **재-snapshot**. 사람이 orca 앱에서 같은 화면 관전 가능. **폼 제출까지 실측 완주(2026-07-22)**. 요소 수백 개 페이지에선 `snapshot`이 죽어 ref를 못 얻는다 → 그때만 `eval` 우회 |
| 검증(DoD E2E) | **웹앱 디버깅**(콘솔·네트워크·트레이스) | 내장 브라우저 **기본값**(2026-08-05 라우팅 전환). `capture start`→`console`/`network`, 깊게 파면 `exec --command "trace start\|stop <path>"`·`"network route"`(모킹)·`"network har"`. **Playwright 는 폴백** — 격리 깨끗한 프로필·쿠키 0 재현, 또는 모바일 뷰포트가 필요할 때만(§3.5) |
| 검증·검토 | 병행 작업 조망("지금 어디들 도나") | `worktree ps` · `terminal list`. **의지축 겹친 뷰(채택 2026-07-22, C5)** = `python scripts/portfolio_live.py` — PORTFOLIO(milestone 의지) × `worktree ps`(지금 도는가) 2축 판정 |
| 검토(사람에게 넘김) | "이 변경 좀 봐 주세요"를 **말이 아니라 열린 탭으로** 전달 | `orca file open-changed --mode diff --worktree path:<타레포 절대경로>` (실측 2026-07-22). 쏘기 전 `--json`으로 `totalChanged` 확인(상한 없음) |
| 검토(완료) | 최종 보고서 열람 | md 정본 + Artifact 링크 — 모바일 원격에서도 열람 |
| 원격 | 외출 중 관측·재개 지시 | `orca serve --mobile-pairing` + `environment add` (실기기 왕복 실측 완료 — tailscale 경유, 2026-07-21 사용자 확인) |
| 원격 | **다른 기기에서 이 기기 세션을 사람이 직접 이어받기** | **Orca Web** = `python3 agent-orchestration/scripts/orca_web.py <환경>` — 사이드바·터미널째 그대로. headed 앱이 이미 서빙 중이라 `serve` 불요. ⚠ **평문 tailnet IP 로 직접 열면 흰 화면**(secure context 아님 → `crypto.randomUUID` 부재) — 스크립트가 ssh 터널로 localhost 에 붙여 연다. `claude -r`은 크로스머신 불가라는 사실과 혼동 금지 (§3.11, 2026-08-01 채택 · 2026-09-01 온라인 경로 실측) |

**워크트리 하네스 운용 규칙 (HQ1 연계, 2026-07-21 · 스킬명은 2026-07-24 3분할 반영)**: orca 워크트리에서 승인된 계획(/harness-run)을 실행하려면 **승인(approve_harness_plan)을 그 워크트리 안에서** 돌린다 — continuation 상태(`.harness/work.json`)는 checkout-local(cs#248)이라 다른 체크아웃의 승인은 이 워크트리를 지키지 못한다. 침묵 진단: `python ~/.codex/hooks/harness_work_state.py diagnose --root .` · 세션 교체 승계: `... resume --root . --work-id <id> --session <runtime>:<uuid>`.

## §2.5 워크트리 생애주기 — 나누기·실행·쓰기 주체·거두기·두 모드·rebase

> **발명이 아니라 승격이다.** 아래 여섯은 `ui-dictionary` 가 2026-08-17부터 자기 `ROADMAP.md`
> 「번호 선점 — 병렬 발사 대비」 절로 운영해 온 관례를 플릿 규약으로 올린 것이다(M29 2026-09-03).
> 그 레포에 그 절이 생긴 이유는 **어제 두 워크트리가 같은 M60 을 등록하는 사고**였고,
> 2026-08-18 병합에서 *"세 갈래가 같은 자리에 같은 개념을 서로 다른 이름으로 각자 신설했다"* 를
> 겪고 「계약 문서 소유」까지 붙었다. 그 절은 은퇴하지 않는다 — 이 절이 그것의 플릿판이다.
>
> ⚠ **trunk-based development 를 근거로 끌어오지 않는다.** 그쪽 정석은 "trunk 에 자주 바로 커밋"이라
> 철학이 반대다(리서처 concerns 2, 2026-09-03). 공식 Anthropic 문서는 "병렬 중 메인에서 작업하지 말라"에
> **침묵한다** — 워크트리를 순수 파일 격리 장치로만 규정한다. 아래는 그 공백을 우리 실측으로 메운 것이다.

**① 나누기 — main 이 계획하고 번호를 선점해 배정한다.**
병렬로 열기 **전에** milestone 번호 구간을 갈라 배정한다(예: M92=main · M94=`m91-icon-publish` · M96~M98=`design-system-analysis`).
필요하면 **계약 문서 소유**까지 나눈다 — 어느 milestone 이 어느 파일을 여는가.
*근거*: `ui-dictionary` 2026-08-18 병합 실측 — **워크트리 격리는 파일 충돌만 막는다. 설계 충돌은 못 막는다.**
같은 파일을 안 건드려도 같은 개념을 각자 신설하면 병합할 때 사람이 고쳐야 한다.

**② 실행 — 워크트리는 배정받은 milestone 을 실행 소유하되, 번호를 스스로 뽑지 않는다.**
*출처*: 2026-09-03 사용자 — *"main 세션에서 작업 계획을 하고(병렬이면 마일스톤들을 여러 개로 나눔)
그 다음 마일스톤당 워크트리 세션들을 열고 거기서 작업을 하게 되지."*
「번호를 안 뽑는다」와 「milestone 을 소유한다」는 대립이 아니라 같은 그림의 앞뒤다.

**③ 쓰기 주체 분리 — 상태·인덱스 파일은 거두는 메인이 쓴다.**
대상: `ROADMAP.md` · `changesets/README.md` · `docs/BACKLOG.md` · `~/projects/INDEX.md`.
워크트리는 자기 `changesets/<id>/README.md` 와 `plans/` 만 쓴다.
*근거*: `merge=union` 드라이버는 답이 아니다 — union 이 안전한 조건은 "한 줄=완결 레코드 · 순서 무관 ·
in-place 수정 없음"인데, `changesets/README.md` 는 **`#` 전역 순번을 가진 표**라 union 이면 번호가
중복되고(milestone ID 충돌과 같은 계열), `ROADMAP.md` 는 `Status: [x]` 를 **in-place 로 고친다**.
포맷을 개편하는 대신 쓰는 사람을 하나로 줄인다. 기계 검사는 `check_worktree_scope.py`.

**④ 거두기 — 워크트리는 「병합 대기」를 선언하고 끝낸다. `/harness-done` 은 메인이 1회 돌린다.**
워크트리는 마지막 step 을 닫으면 자기 changeset 에 **「병합 대기」 절**(브랜치명 · 커밋 수 ·
DoD 자기판정 · 미해결 항목)을 쓰고 push 후 종료한다. **워크트리 안에서는 연쇄 승격을 끈다.**
메인이 병합한 뒤 그 레포에서 `/harness-done` 을 돌려 ROADMAP·인덱스·보고서를 닫는다.
*근거*: `/harness-done` 이 쓰는 것(`ROADMAP.md`·`docs/BACKLOG.md`·`archive/plans/`)이 전부 ③의 대상이다.
거두는 절차는 `harvest_worktree.py`(기본 dry-run).

**⑤ 두 모드 — 워크트리가 2개 이상인 병렬 구간엔 main 에서 작업하지 않는다.**
그 구간의 main 은 병합·리뷰·상태판 갱신만 한다.
*출처*: 2026-09-03 사용자.
⚠ **이 임계값은 이 규약을 만든 사고를 덮지 못한다.** `ui-dictionary/figma-mastery` 는 **워크트리 1개**였고
그동안 main 이 194커밋 앞섰다 — ⑤는 발화하지 않는다. 그 구멍은 ⑥이 메운다. **두 항은 함께 읽어야 성립한다.**

**⑥ rebase — step 착수 시 `git fetch && git rebase origin/<main>`. step 이 길면 중간에도 한다.**
주기를 숫자로 정하지 않는다(정하면 지켜지지 않는 규칙이 하나 더 는다). 수명 상한도 두지 않는다.
*출처*: 2026-09-03 사용자 + 검증자 지적(step 이 길면 그 안에서도 벌어진다).
⑤가 못 덮는 「워크트리 1개인데 크게 벌어짐」이 여기 걸린다 — step 마다 따라붙으면 194 는 쌓이지 않는다.

### ⚠ 여섯을 다 지켜도 안 잡히는 것 — 버려진 갈래

⑥은 **워크트리가 계속 일할 때만** 발화한다. 커밋 몇 개를 남기고 **멈춘** 갈래에는 step 착수가 없어
rebase 시점도 오지 않고, ④의 「병합 대기」 선언도 하지 않은 채 남는다. `figma-mastery` 가 정확히 그
모양이고, 이 레포의 `codex-exec-shutdown`(ahead 3 · behind 131)·`codex-hook-startup`(ahead 0 · behind 131)도
같다. **이 절에는 버려짐을 *감지*하는 규칙이 없다** — 지금은 `python scripts/portfolio_live.py` 와
`git worktree list` 를 사람이 볼 때 드러난다. 감지를 기계로 만드는 것은 별건이다.
규약이 자기가 만들어진 사고를 어디까지 막는지 적어 두는 편이, 막는다고 적어 두는 것보다 낫다.

---

## §3 기능별 실측 판정

각 항목은 **한 줄 판정 → 표 → 함정** 순서다.

### 3.1 worktree 생성·병합·정리

**판정**: 생명주기 전체(create → 작업 → merge → rm)가 Windows·원격 양쪽에서 실측 완주. 단 **merge 명령은 orca에 없다** — Git으로 한다.

CLI primitive는 서로 분리돼 있다.

```powershell
# Task만 생성한다. worktree는 생기지 않는다.
orca orchestration task-create --spec "..." --json

# worktree와 agent terminal을 만든다. orchestration Task는 생기지 않는다.
orca worktree create --name <name> --agent codex --prompt "..." --json

# 현재 worktree에 agent session만 추가한다.
orca terminal create --worktree active --command "codex" --json
```

- 독립 작업은 `worktree create --no-parent --agent <id>`. 현재 작업의 자식 관계가 필요할 때만 `--parent-worktree active`.
- `--no-parent`는 Orca sidebar lineage만 제어한다. **Git base를 고르지 않는다.**
- **⚠ 새 워크트리 Claude의 folder-trust 게이트**: `worktree create --agent claude --prompt "..."`로 스폰하면 새 checkout 경로라 Claude가 첫 실행 시 **"Is this a project you trust?"**를 띄운다. `--prompt`로 준 작업은 그 뒤에 큐잉돼 있다가 **신뢰 확인(`terminal send --enter` 1회) 후에야 실행**된다. 무인 스폰이라도 이 게이트를 넘겨줘야 진행된다.
  - 2026-08-14 실측(h-e M17·M18, `terminal create --command "claude …"` 경로 3회): 게이트가 **발화하지 않았다** — 스폰 터미널이 `⏵⏵ bypass permissions on` 으로 기동해 프롬프트가 즉시 실행됐다. 게이트 유무를 가정하지 말고 스폰 직후 `terminal read` 로 확인 후 필요 시에만 `--enter`. 증거: harness-engineering `evidence/harness/2026-08-14-m17-handoff-e2e.md` §B.

**병합·정리의 주체 = 항상 main 체크아웃 세션 (2026-08-28 사용자 확정)**

- **워크트리 세션은 병합하지 않는다.** 워크트리 세션의 수명은 「milestone 실행 → `/harness-done` 마감 → `/session-end` → 세션·터미널 종료」까지다. 병합·워크트리 제거·브랜치 삭제는 전부 **main 체크아웃 세션**이 그 뒤에 수행한다.
- 이유: 워크트리 세션 자신이 그 폴더를 cwd로 잡고 있어 Windows에서 `worktree rm`이 막히고(§0 사고 목록), 병합 후 재생성 1회의 정본 위치도 main이다(ui-dictionary M81 규칙).
- main 세션의 병합 절차는 아래 순서 그대로 + 병합 직후 그 레포의 재생성기(생성물 충돌면)를 main에서 1회 돌려 커밋한다.

**병합·정리 순서** — `workspaceStatus=completed`는 UI metadata일 뿐 Git commit도 merge도 아니다.

```text
작업 worktree에서 검토·커밋
→ 메인 worktree와 기준 브랜치 확인
→ merge-tree로 충돌 예측
→ git merge --no-ff <branch>
→ terminal stop
→ git status clean 확인
→ orca worktree rm
```

- base가 최신 master와 같으면 `--no-ff`가 충돌 없이 붙는다(실측).
- dirty·locked·detached worktree는 자동 merge/remove하지 않는다. 충돌 자동 해결이나 `git merge --abort` 자동 실행도 하지 않는다.
- `git worktree remove --force`·`git branch -D`를 기본 경로로 쓰지 않는다. 폐기 승인된 dirty worktree는 정확한 파일을 먼저 지워 clean으로 만든 뒤 force 없이 제거한다.
- Windows에서는 그 worktree를 cwd로 잡은 terminal·agent·IDE·watcher를 먼저 닫는다.
- 완료 카드·terminal·worktree·branch·orchestration Task는 **서로 별개다**. `completed`가 worktree를 자동 삭제하지 않는다.

**Windows 정리 중 부분 성공 판정**

- clean discard 실측 성공 순서: `terminal stop --worktree <selector>` → 폐기 승인된 artifact 삭제 → `git status --porcelain` 빈 결과 확인 → `orca worktree rm --worktree <selector>`. `orch-capabilities`·`orch-smoke-checklist` 실측에서 `removed=true`와 함께 Git worktree·브랜치·폴더가 모두 제거됐다. (이 경로에선 별도 `git branch -d`가 불필요했지만, 버전별 동작을 추정하지 말고 제거 후 `git worktree list`·`git branch --list`·실제 경로를 각각 확인한다.)
- `terminal close --tab` 결과가 `ptyKilled=false`이면 탭만 닫히고 terminal이 계속 연결될 수 있다.
- `orca worktree rm`이 `Worktree deletion already in progress`를 반환하면 **반복 호출하지 않는다**. Orca selector·`git worktree list`·실제 폴더를 각각 확인한다.
- `git worktree remove`가 마지막 디렉터리 삭제에서 `Permission denied`를 내도 등록 해제와 파일 제거는 이미 끝났을 수 있다. 목록·브랜치·폴더 내용으로 **부분 성공 범위를 나눠** 확인한다. 빈 폴더가 잠겨 남으면 강제·우회 삭제하지 말고 잠금 프로세스 종료 후 정리한다.

**개설 직후 탭 정리 (2026-09-02)** — 새 워크트리에는 에이전트 탭 말고 setup 탭과 폴백 셸 탭이 같이 뜬다(§0 #19). 정본 절차: ① 모델 지정이 필요 없으면 `worktree create --agent claude --prompt "<지시>"` 한 번(셸 탭 없음) ② 모델을 지정하려면 bare create → `terminal create --command "claude --model <alias> ..."` → 그 워크트리 `terminal list` 에서 에이전트 핸들이 아닌 것을 골라, `terminal read` tail 이 프롬프트(`PS …>`)로 끝나면 `terminal close --terminal <h> --tab`. 하나 닫고 다시 list. 실측 정본 스크립트 = `~/.claude/skills/harness-run/scripts/spawn_chain.py` 의 `close_extra_tabs`. 사람이 만든 워크트리의 잔여 탭도 같은 명령으로 닫으면 된다(2026-09-02 ui-dictionary 3개 정리).

### 3.2 terminal — 주입과 관측

**판정**: 크로스-레포 프롬프트 주입이 실측 왕복 확인됨. **주입 대상 판별이 전부**다.

- **⚠ `worktree ps` ≠ `terminal list`.** `worktree ps`는 워크트리별 **마지막 에이전트 상태를 기억**해 보여준다 — 세션이 끊긴 레포도 ⚪idle로 뜬다. **실제 주입 가능한 건 `terminal list`에 뜨는 라이브 PTY뿐**이다. 대시보드의 ⚪를 주입 가능으로 오인하지 말 것.
- **⚠ 라이브라고 유휴가 아니다.** 사람이 그 세션에서 작업 중일 수 있다 — `worktree ps`의 `prompt`·`state`로 점유 여부를 본다([§0](#0-사고-목록--먼저-읽는다) #4).
- **⚠ 빈 handle 폴백**([§0](#0-사고-목록--먼저-읽는다) #1) — `terminal create` 응답의 handle은 `result.terminal.handle`. 팬아웃 스크립트는 handle이 비면 abort.
- **⚠ `--title`은 실행 프로세스명(`pwsh.exe` 등)으로 덮인다** — title로 식별·필터하지 말고 handle로 추적한다.
- **⚠ `terminal stop`은 worktree 단위**([§0](#0-사고-목록--먼저-읽는다) #2) — 핸들 단위는 `terminal close --terminal <handle>`.
- Windows 키 입력 에코 아티팩트: `terminal read`가 주입 명령을 글자 단위로 반복 에코한 뒤 최종 실행 라인을 보인다. **파싱은 마지막 완결 라인 기준.**
- 에이전트 TUI 페인은 `terminal read`가 **0줄**을 반환하는 경우가 있다. 그때 진행 관측은 `worktree ps`의 `state`·`toolName`·`lastAssistantMessage`로 한다.
- create → rename → switch → horizontal split → split pane send/read → pane close 전 과정 성공(pane close는 `ptyKilled=true`).
- tab close는 `ptyKilled=false`와 고아 handle을 남길 수 있다. 정확한 handle에 `--tab` 없이 `terminal close`를 다시 호출하면 `ptyKilled=true`가 된다.
- PTY 종료 뒤에도 `terminal list/show`가 `paneRuntimeId=-1`·`connected=true`로 handle을 계속 표시할 수 있다. `diagnostics memory`에 session/PID가 없고 visual layout에도 탭이 없으면 **stale registry 표시로 판정하고 close를 반복하지 않는다.**

**`dispatch --inject`가 제출되지 않음** — 증상: 입력창이 `[Pasted Content ...]`에서 멈추고 Task가 시작되지 않는다(병렬 worker 2개·DAG A/B/C에서 재현). 복구: 재-dispatch하지 말고 Enter만 한 번 보낸다.

```powershell
orca terminal send --terminal <handle> --enter --json
```

**`tui-idle` 조기 만족** — 초기 TUI가 준비된 순간이나 실제 작업 중에도 일찍 만족할 수 있다. 완료 판정은 task 상태·terminal output·`worker_done`·실제 파일을 함께 본다.

### 3.3 orchestration — 감독형 조율

**판정**: 감독형 DAG·게이트·blocking ask 전부 동작. `run`은 **분해기가 아니라 배정·추적 스케줄러**다.

작업 결과를 coordinator가 기다리고 추적해야 할 때만 쓴다. full handoff에는 Task를 만들지 않는다(`worktree create --agent --prompt` 또는 `terminal send`로 소유권만 넘긴다).

```text
task-create → agent terminal 준비 → dispatch --inject → check --wait → worker_done
```

- `worker_done`이 유효한 `taskId`·`dispatchId`를 포함하면 Task가 자동 완료된다. 뒤이어 `task-update completed`를 중복 호출하지 않는다.
- dependency가 남으면 `pending`, 끝나면 `ready`. pending gate가 있으면 `blocked`, `gate-resolve` 후 `ready`.
- 같은 worktree에서 순차 Task를 처리할 땐 완료 후 유휴가 된 terminal을 새 dispatch로 재사용할 수 있다.
- 일반 질의에 `send --type ask`는 유효하지 않다. 단순 왕복은 `status`로 보내고 `reply`. `peek`은 unread 유지, `unread`는 읽음 처리.
- blocking 질의는 `orchestration ask`. 실측에서 `decision_gate` 메시지가 생성되고 coordinator가 `reply`하면 호출자에게 `{answer, messageId, threadId, timedOut:false}`가 직접 반환됐다.

**`worker-start` 판정 (2026-08-17 실측, ui-dictionary)** — 감독형 워커의 **권장 경로**. 아래 `run` 표는 구세대 경로의 기록이고, 이쪽이 그 함정 3건을 구조적으로 없앤다.

읽기 전용 과제 1건으로 전 구간 왕복 **32초** 완주:

```bash
orca orchestration run-create --objective "<목표>" --json          # 코디네이터가 내 터미널로 자동 바인딩
orca orchestration task-create --spec "<과제>" --json               # status: ready
orca orchestration worker-start --task <id> --worktree current --agent claude --model sonnet --json
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 300000 --json
orca orchestration worker-release --dispatch <dispatch_id> --json   # 처리 → 해제 → ack 순서
orca orchestration check --ack <delivery_id> --json
```

| 항목 | 판정 |
|---|---|
| 한 명령의 범위 | O: 워크트리 `reused` + 터미널 `created` + 주입 `accepted` 를 receipt 의 `effects` 로 각각 보고 |
| **`stage: "input_accepted"`** | **[§0](#0-사고-목록--먼저-읽는다) #15 해소.** TUI 준비 대기를 내부에서 처리하고 **주입이 먹었음을 증거로 돌려준다.** `create`→`wait`→`send` 3단을 손으로 엮을 때 생기던 프롬프트 증발이 없다 |
| **워커 자동 선정 없음** | **[§0](#0-사고-목록--먼저-읽는다) #4 해소.** `--terminal` 을 명시하지 않으면 **항상 새 터미널을 만든다**(help 명문화 + 실측 `action:"created"`). 사람 점유 세션을 고를 경로 자체가 없다 |
| `--from` | **불필요.** `run-create` 가 호출 터미널을 `coordinator_handle` 로 자동 바인딩한다([§0](#0-사고-목록--먼저-읽는다) #3 해소) |
| `worker_done` → Task | O: 자동 `completed`. `task-update` 중복 호출 금지 |
| `worker-release` | O: `processAction: closed_agent_terminal` + 출력 `archive.status: captured`. 해제 후에도 `worker-read` 로 읽힌다. 터미널 수 원상복귀 실측 |
| `--model` / `--effort` | ⚠ **새로 만드는 터미널에만 먹는다.** `--terminal` 과 병용 불가, `--effort` 는 `--model` 필수. 워커를 재사용하면 모델이 고정된다 |
| 적용 범위 | 감독형(결과를 기다리고 추적)에만. **full handoff 에는 쓰지 않는다** — 소유권만 넘기는 자리는 `worktree create --agent --prompt` 나 `terminal send` 가 정본이다 |

**`orchestration run`(코디네이터 루프) 판정 표 — ⚠ 은퇴 (2026-08-28 M26 실측)**: `run`·`run-stop` 은 v1.4.190 스키마에 없다. Run 모델이 `run-create/run-current/run-list/run-show(--id)/run-use` 로 개편됐고, 후계 `coordinator-start/stop` 호출은 `orchestration_migration_required`("legacy automatic coordinator command is retired. No effects were applied.")를 반환한다. 아래 표는 구세대 기록으로 보존한다.

| 항목 | 판정 |
|---|---|
| **`--from <내 handle>` 생략** | **⚠ 무증상 실패.** `{"runId":..., "status":"running"}`을 반환하고도 **task를 하나도 dispatch하지 않는다**(ready로 60초+ 방치). 이후 `run-stop`이 `"No active coordinator run"` — 루프가 살아있지도 않았다. **사실상 필수 인자** |
| `--from` 지정 시 | O — ready task를 즉시 집어 워커 자동 선정·주입, `worker_done` 회신, `completed`. **33초** 완주 |
| **`--spec` 자동 분해** | **X — spec만으로는 task가 0개.** run의 목표 라벨일 뿐이다. **task는 `task-create`로 직접 만든다** |
| `task-list`의 배정 정보 | ⚠ 부정확 — dispatched인데 `assigneeTerminal:null`·`dispatchId:null`. 실제 값은 **`dispatch-show --task <id>`**(`assignee_handle`·`dispatched_at`·`completed_at`·`failure_count`) |
| 결과 회수 | `orchestration inbox`의 `worker_done` 본문 |
| 정리 | `run-stop` → `reset --tasks` |

- **⚠ 워커 자동 선정이 사람 점유 세션을 고른다**([§0](#0-사고-목록--먼저-읽는다) #4).
- 빈 Task 큐에서 `run`은 run ID와 `running`을 반환한 직후 자체 종료될 수 있다. 이때 곧바로 `run-stop`하면 `No active coordinator run`이 정상적으로 나온다.
- 3연속 실패하면 dispatch context가 circuit-break되고 task가 failed로 표시된다.

### 3.4 automations — 예약 실행

**판정**: **스케줄러 자체는 신뢰 가능**(예약 시각 발화 실측). 관측이 빈약하고 무인 에이전트가 bypass 권한으로 뜨므로 **읽기 전용 작업 우선**.

| 항목 | 판정 |
|---|---|
| 예약 발화 | O — cron 5필드·preset·RRULE, 기본 timezone `Asia/Seoul`. 22:11:00 예약 → 55초 내 감지 |
| **precheck 게이트** | O — exit 0 진행, 비0이면 `status:skipped_precheck` + `error:"Precheck exited with code N."`로 기록되고 **worktree·에이전트를 아예 안 만든다**(무비용 게이트) |
| **`automations run`(수동)** | **⚠ precheck 우회**([§0](#0-사고-목록--먼저-읽는다) #5) |
| precheck 실행 환경 | cwd = **레포/워크트리 루트**(`existing`·`new_per_run` 양쪽 확인) · 셸 = **`cmd.exe`**(COMSPEC, PowerShell 아님) · env에 `ORCA_APP_VERSION`·`ORCA_USER_DATA_PATH`(자동화 실행임을 감지 가능) |
| `--repo`만 지정 | ⚠ `workspaceMode=new_per_run` — 실행마다 새 worktree |
| `--workspace` 지정 | `workspaceMode=existing` — 기존 worktree 재사용 |
| `--repo` + `--workspace` | X — `invalid_argument`("Use either --repo or --workspace, not both.") |
| **실행 결과 관측** | **O — 풍부하다.** run 레코드에 **`outputSnapshot`(에이전트 최종 결과 전문)·`precheckResult`(`command`·`exitCode`·`stdout`·`stderr`·`durationMs`·`timedOut`)·`usage`·`terminalPaneKey`·`chatSessionId`·`scheduledFor`** 가 실린다. **⚠ `runs --json` 의 기본 표시에는 안 보이므로 키를 명시해 읽어야 한다** — 2026-07-22 초판이 "출력이 안 남는다"고 오판한 원인이 이것(선택한 키만 출력해 놓고 없다고 결론) |
| 놓친 실행 | O — `missedRunPolicy: run_once_within_grace`. **Orca가 꺼져 있어 놓친 실행을 다음 기동 때 1회 따라잡는다.** 유효기간은 `missedRunGraceMinutes`(기본 720분=12시간, `harness-evidence-weekly`는 2026-07-22에 4320분=3일로 상향). 스케줄러 소유자는 `schedulerOwner: local_host_service` — **Orca 앱이 떠 있어야 돈다** |

- **⚠ 무인 에이전트는 bypass 권한**([§0](#0-사고-목록--먼저-읽는다) #6).
- **⚠ `existing` 모드는 내가 지금 쓰는 워크트리에 두 번째 에이전트를 띄운다.** 같은 폴더에서 두 Claude가 동시에 파일을 만질 수 있다. 정리는 반드시 handle 단위([§0](#0-사고-목록--먼저-읽는다) #2).
- **⚠ 탭·PTY 누수**: 종료 후에도 handle이 목록에 남는 현상은 공식 이슈 [#9479](https://github.com/stablyai/orca/issues/9479)("Recurring automation runs leak background tabs and PTYs" — 32개 누적 관측)와 일치한다. 반복 자동화를 오래 돌리면 쌓이므로 주기적으로 `terminal list`를 훑는다.
- **하네스 운용 규칙 (IL2, 2026-07-21)**: automation에 올리는 작업은 관측·보고형(쓰기 없는 프롬프트) 우선 — 쓰기는 사용자 승인 후에만. **precheck를 항상 건다.** 실측 기록: harness-engineering `evidence/harness/20260721-il2-automation.md`.
- **결과 수확 정본** = `automations runs --id <id> --json` 의 **`outputSnapshot.content`**(에이전트 보고 전문)와 **`precheckResult`**(게이트가 왜 통과/차단했는지). 파일로 따로 남길 필요 없다. 적합 용도 = 주간 리뷰용 읽기 전용 리포트(판정 대기 큐 요약, drift 검사).
- **⚠ 실패 진단은 `precheckResult.command`부터 본다 — 현재 등록된 precheck가 아니라 *그 run이 실제로 쓴* 명령이 저장돼 있다.** 실제 사례: `harness-evidence-weekly`의 2026-07-21 `skipped_precheck`는 오래 미궁이었는데, run 레코드를 열어 보니 그때의 precheck가 **`python -c "import sys; sys.exit(1)"`(항상 실패하는 테스트 스텁)**이었다. 이후 실검사(`evidence` 존재)로 교체됐고 **automation 설정은 지금 정상**이다. 즉 "예약이 안 돈다"가 아니라 스텁이 제 일을 한 것 — **설정 스냅샷을 현재값으로 추정하지 말 것.**
- 처음 만들 땐 `--disabled`로 검증한 뒤 활성화를 검토한다. `--reuse-session`은 existing workspace에서만. existing workspace + Codex 실측에서 run 상태는 `dispatching` → `dispatched` → `completed`로 전이했다.
- `automations remove <id>`는 run history까지 함께 지운다 — 제거 전 `automations runs --id <id>`로 결과를 보존한다. **automation 삭제가 그 run이 만든 worktree를 자동 삭제하지는 않는다**(`terminal stop` → `worktree rm`으로 별도 정리).
- `--repo ... --workspace-mode new-per-run --base-branch <ref>` 실측에서 run마다 `auto-<name>-run-<n>-<timestamp>` worktree·동명 브랜치가 생성됐고, worktree metadata의 `automationProvenance`에 automation ID와 run ID가 연결됐다.

### 3.5 내장 browser

**판정**: **Playwright 급 디버깅 엔진이다.** 콘솔·네트워크·트레이스·요청 모킹·HAR·녹화까지 된다(2026-08-05 실측). 조작은 공식 워크플로우(`snapshot` → `--element` 조작 → 네비게이션 후 재-snapshot)를 그대로 따를 것. **유일한 실질 한계는 복잡 페이지에서의 `snapshot` 실패.**

> **⚠ 정정 이력 (2026-07-22)**: 이 절의 초판은 "`fill`·`type`이 전부 무력 → 폼 E2E 불가"로 판정했으나 **틀렸다.** 오판 이유는 대상 페이지에서 `snapshot`이 죽어 **ref를 못 얻은 상태로** 대체 경로만 시험했기 때문. 재현 증거: duckduckgo.com `snapshot`(ref=e145) → `fill --element e145` → 재-snapshot → `click --element e127` → URL이 `?q=orca+ade+stably`로 전이(**폼 제출 완주**).

> **⚠ 정정 이력 (2026-08-05)**: 이 절은 콘솔·네트워크 명령의 존재를 **누락**했고, 그 결과 "Orca는 웹앱 디버깅을 못 한다 → Playwright 로 간다"는 라우팅을 지탱했다. **원인은 명령 탐색 표면이다** — 아래 명령군은 `orca --help` 에도, `orca agent-context --json`(220개, *에이전트용* 기계판독 스키마)에도 **하나도 안 뜬다.** 오직 `orca skills get orca-cli` 가이드에만 있다. **능력 판정을 `--help`·`agent-context` 로 하지 말 것 — 반드시 번들 가이드를 함께 본다.**

> **✅ 라우팅 전환 실측 완료 (2026-08-07)**: 2026-08-05 의 라우팅 전환은 그때까지 **문구 반영만** 됐고 실구동 검증이 없었다. 외부 공개 페이지(example.com)로 경로 전체를 왕복해 확인했다 — `tab create` → `snapshot`(refs 수신) → `console` → `network` → `tab close`. **핵심: `ok:true` + 빈 배열을 통과로 읽지 않았다.** 첫 조회는 `messages: []`·`requests: []` 였는데 이는 "캡처가 안 된다"와 구별되지 않으므로, `eval` 로 `console.log`·`console.warn`·`fetch` 를 실제로 발생시킨 뒤 재조회해 **양쪽 다 잡히는 것**을 확인했다(로그 2건 + Fetch 요청 1건, 헤더·mimeType·responseHeaders 포함). 이제 이 절은 실측에 근거한다.
>
> 이번 왕복에서 새로 관측된 함정 3가지:
> - **`ORCA` 는 문서 플레이스홀더이지 하위 명령이 아니다.** 가이드의 `ORCA snapshot` 은 `orca snapshot` 이다 — `orca browser open` 류는 `Unknown command` 로 죽는다. **바로 이것이 `--help` 로 능력을 판정하면 없는 기능으로 보이는 이유다.**
> - **탭이 없으면 `browser_no_tab`** — `goto` 가 탭을 만들어 주지 않는다. 진입은 `orca tab create --url <url>` 이다.
> - **`tab create` 직후 첫 명령이 `runtime_unavailable` 로 튈 수 있다(일시적).** `status` 는 `ready`·`reachable:true` 였고 **재시도하면 성공**했다 — [§0](#0-사고-목록--먼저-읽는다) #12(응답만 보고 오판)의 반대 방향 사례다. 실패 응답 하나로 능력을 부정하지 말 것.
> - **`tab close` 가 인자 없이는 "닫을 활성 브라우저 탭이 없습니다"로 거절**하는데, 같은 시점 `tab list` 는 `active:true` 탭을 돌려준다. `--page <browserPageId>` 로 명시하면 `closed:true`. 정리 단계에서 응답을 믿고 넘어가면 탭이 쌓인다.

**미노출 명령군 — 실측 확인 (2026-08-05)**

| 명령 | 실측 결과 |
|---|---|
| `console --limit <n>` | **O.** `log`·`warning`·`error` 타입 구분해 반환. **⚠ `capture start` 가 전제** — 없으면 조용히 `messages: []` 를 준다(→ "안 된다"로 오판하기 쉽다). **⚠ `--page <id>` 를 붙이면 `runtime_unavailable`** 로 죽는다. 붙이지 말 것 |
| `network --limit <n>` | **O.** 요청/응답 헤더·status·mimeType·resourceType·timestamp·url 전부 |
| `exec --command "network route <url> [--abort\|--body <json>] [--resource-type <csv>]"` | **O(usage 확인).** 요청 가로채기·모킹·차단 |
| `exec --command "network har <start\|stop> [path]"` | HAR 추출 |
| `exec --command "trace <start\|stop> [path]"` | **O 실증.** `trace stop` 이 이벤트 **103,971건 / 18MB zip** 생성 |
| `exec --command "record <start\|stop\|restart> [path] [url]"` | 세션 녹화 |
| `exec --command "download <selector> <path>"` | 타입 명령 쪽 다운로드 실패(아래 «막히는 지점» 5)와 별개 경로 |
| `cookie get` · `full-screenshot` · `pdf` | **O 전부.** `pdf` 는 페이지→PDF base64 (Playwright MCP 엔 없는 기능) |
| `capture start` / `capture stop` | **O.** 탭 단위 — 탭을 닫으면 함께 끝난다(`capture stop` 이 `browser_no_tab`) |

- **패스스루 하위 엔진 = `agent-browser`.** `exec --command "<cmd>"` 로 타입 명령 밖 표면에 닿는다. 유효 루트: `console · cookies · storage <local|session> · network <route|unroute|requests|request|har> · trace · record · download · pdf`. (`help`·`commands`·`list` 는 미지원 — usage 는 인자 없이 호출해 에러 메시지로 얻는다.)
- **⚠ Windows 경로 함정**: `trace stop <path>` 등 경로 인자에 MSYS 가 변환한 `/c/Users/...` 가 들어가면 실패한다. **Windows 경로(`C:/...`) + `MSYS_NO_PATHCONV=1`** 로 호출한다.
- **Playwright MCP 에 없는 것**: `pdf` · `trace` · `record` · HAR · 요청 모킹(`route`) · `cookie` · `storage` · 워크트리 스코프(`--worktree`) · 원격 실행(`--environment`) · 영속 세션 프로필(`tab profile` + Chrome/Edge 쿠키 임포트).
- **Playwright 가 여전히 나은 것**: **터치 에뮬레이션**(`ontouchstart`·`maxTouchPoints`·`pointer:coarse`) 과 임의 크기 뷰포트(`browser_resize` — Orca 는 사전 정의 기기 목록만). Orca 의 `set device` 도 뷰포트·미디어쿼리·UA 는 제대로 먹는다(2026-08-05 재측정, «막히는 지점» 3).

**입력 경로 — 되는 것과 안 되는 것이 갈린다**

| 경로 | 판정 |
|---|---|
| **`fill --element <ref> --value`** | **O (정본).** `e145`·`@e145` 두 표기 모두 수용 |
| `click --element <ref>` | O — 폼 제출까지 실측 |
| `clear` · `focus` · `get --element --what value` | O — ref 기반은 전부 정상 |
| `type --input`(포커스 기반) | **X — 그리고 위험.** `{"typed":true}`인데 값이 안 들어감. `focus --element` 후에도 실패. **⚠ 무동작이 아니라 실제 포커스된 pane(=사람의 터미널)으로 타이핑된다**([§0](#0-사고-목록--먼저-읽는다) #10, 2026-08-05 사고) |
| `keypress --key Enter`(포커스 기반) | **X — 가장 위험.** `{"pressed":"Enter"}`인데 제출 안 됨. **사람 세션의 선택 프롬프트를 확정시킬 수 있다.** 제출은 **버튼을 `click --element`** |
| `inserttext --text` | **X — 실패 양상이 바뀌었다(2026-08-05).** 구: 호출이 `runtime_unavailable`로 연결을 끊음 → 신: **`ok:true` 를 주고 조용히 아무 값도 안 넣는다**(그리고 키 입력은 포커스된 pane 으로). 조용한 실패라 더 위험 |
| `find --action fill` | X — locate는 맞는데 값이 안 들어감(2026-08-05 재확인, `eval` 로 교차 검증) |
| `exec --command "fill --selector ..."` | X — 유효 셀렉터에도 `Element not found`. 하위 `agent-browser` 직결이 아직 미배선([#5610](https://github.com/stablyai/orca/issues/5610)이 요청 중) |

**작동 확인**

| 명령 | 결과 |
|---|---|
| `tab create/list/close` | 정상. `browserPageId`를 `--page`로 재사용 |
| `eval --expression` | **가장 신뢰할 수 있는 경로.** 무거운 페이지에서도 즉답 |
| `get --what title\|url` · `screenshot --format png` | 정상 |
| `scroll` · `reload` | 정상 |
| `set media --color-scheme dark\|light` | **실효 확인**(`matchMedia('(prefers-color-scheme: dark)').matches === true`) |
| `find --locator <t> --value <v> --action click\|hover` | locate 자체는 정확 |
| isolated profile create/list/clone/delete · stable page ID targeting | 성공. 서로 다른 profile에서 같은 origin의 localStorage가 분리됨 |
| `set offline on/off` | `ERR_INTERNET_DISCONNECTED`·`loadError.code=-106` 남기고 `off`+reload로 복구 |

**막히는 지점**

1. ~~**`snapshot`이 복잡한 페이지에서 죽는다 — 유일한 실질 차단 요인.**~~ **해소됨 (2026-08-05 재측정 — 재현 실패).** 구 기록: 버튼 123개 페이지에서 ~30초 뒤 `runtime_unavailable`.
   - 재측정: **amazon.com**(요소 2,575·상호작용 376) → **1초·192KB** · **airbnb.com**(3,139·262) → 1초 · news.ycombinator.com(821·231) → 0초 · github.com 레포 페이지 → 1초·84KB. **전부 성공.** 구 기록보다 훨씬 무거운 페이지들이다.
   - **이 항목이 「유일한 실질 한계」로 §3.5 전체 판단의 전제였다** — 그 전제가 사라졌으므로 이 절의 결론을 그것에 근거해 좁히지 말 것. 다시 재현되면 페이지·버전과 함께 이 자리에 적는다.
   - snapshot이 죽으면 ref를 못 얻어 입력·제출이 통째로 막힌다. 남는 우회는 `eval`뿐:
     ```
     orca eval --page <id> --expression "(()=>{const e=document.querySelector('<sel>');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(e,'<값>');e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()"
     ```
     (native setter + `input` 이벤트 — React 제어 컴포넌트에도 먹는 것 확인)
2. **ref는 휘발성이다.** 공식 기준 ref는 **탭 1개에 스코프되고 네비게이션·탭 전환으로 무효화**된다(`browser_stale_ref`). **페이지가 바뀌면 반드시 재-snapshot** — 실측에서도 제출 버튼 전에 필요했다.
3. **`set device` — 터치만 빠지고 뷰포트는 제대로 먹는다.** ~~겉만 적용~~ (2026-08-05 재측정으로 **초판 판정 철회**, 아래 정정 참조)
   - **되는 것**: `innerWidth`·`outerWidth`·`screen.width`·`documentElement.clientWidth` **전부** 전환 + `devicePixelRatio` + **미디어쿼리 발동**(`(max-width:480px)`→true, `(orientation:portrait)`→true) + **UA 스푸핑**(`Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15`). 실측: iPhone 12 `390×844 dpr3` · Pixel 5 `393×851 dpr2.75` · iPad Pro `1024×1366 dpr2`. **CSS 반응형 검증 가능.**
   - **안 되는 것 = 터치 에뮬레이션뿐**: `ontouchstart` false · `maxTouchPoints` 0 · `(pointer:coarse)` false · `(hover:none)` false. 터치 전용 CSS·JS 분기는 안 걸린다.
   - **⚠ `runtime_unavailable` 을 뱉고도 적용된다.** 첫 호출이 정확히 그랬다([§0](#0-사고-목록--먼저-읽는다) #12의 교과서 사례) — 응답만 보면 "안 됐다"로 오판한다. **2026-07-22 초판 오판의 원인이 이것으로 추정된다.** 반드시 `eval` 로 실제 값을 확인한다.
   - **⚠ 에러 메시지의 지원 목록이 부정확하다.** `Supported: iPhone 15, iPhone 16, iPhone 16 Pro, iPhone 17, iPad, iPad Pro, Pixel 9, Galaxy S25` 라고 하지만 목록에 없는 **iPhone 12·Pixel 5 도 정상 작동**한다. 실제로 없는 건 `iPad Pro 11`(정확한 이름은 `iPad Pro`).
4. **`clipboard read/write` 실패** — `NotAllowedError: Document is not focused`.
5. **`download` 실패** — `data:`·같은-origin HTTP 링크 모두 GUID를 반환했지만 `Downloaded file not found at expected path`로 파일이 안 생겼다.
6. **존재하지 않는 storage key만 행(hang)** — `storage local get`이 30초 뒤 연결 종료(2026-08-05 재현됨). **단 경계는 좁다: `set`·존재하는 키 `get`은 정상**(`set orca-probe=v123` → `get` → `eval localStorage.getItem` 3중 교차 확인, 2026-08-05). `local`·`session` 양쪽에 `get|set|clear` 가 있다. 없는 키를 물어야 하면 `eval localStorage.getItem(...)`(즉시 `null`)을 쓴다.
7. **`find`는 조회가 아니라 "찾아서 즉시 액션"**(`--action` 필수). `--action focus`는 미지원. 로케이터 전체 집합은 help(`role|text|label`)보다 넓다 — 실측 정본: **`role, text, label, placeholder, alt, title, testid, first, last, nth`**. 하나 실패하면 갈아탄다(aria-label 검색창은 `label`로 안 잡히고 `placeholder`로 잡혔다).

**외부 사례 조사 (2026-07-22)**: 공식 문서·README·리뷰 어디에도 **snapshot 실패나 입력 한계는 기술돼 있지 않다** — 공개된 사용법은 전부 `snapshot`→`click`/`fill --element @e1` 정본 경로 하나이고 그 경로는 우리 실측에서도 정상이다. 즉 우리가 겪은 건 **문서화된 한계가 아니라 미문서 경계**였다. 커뮤니티가 실제로 미는 활용은 CLI 자동화보다 **Design Mode**(Chromium에서 UI 요소를 클릭하면 HTML·CSS·잘린 스크린샷이 에이전트 프롬프트로 주입) 쪽 — 사람이 "여기 이거 고쳐"를 좌표로 지시하는 용도. 관련 이슈: [#5610](https://github.com/stablyai/orca/issues/5610)(agent-browser 직결), [#6348](https://github.com/stablyai/orca/issues/6348)(CDP attach 공개 — 되면 Playwright 직결 가능), [#9718](https://github.com/stablyai/orca/issues/9718)(스텔스 브라우저), [#8139](https://github.com/stablyai/orca/issues/8139)(키보드 탈취). 출처: <https://www.onorca.dev/docs/browser/overview> · <https://github.com/stablyai/orca> (접근 2026-07-22).

### 3.6 file open/diff/open-changed — 사람에게 넘기는 경로

**판정**: 채택. **에이전트가 만든 파일을 사람 화면에 올리는 정본 경로**다. 용도는 둘 — ① 같은 레포에서 방금 쓴 파일을 사용자가 바로 편집하게 띄우기 ② 다른 레포의 파일을 이 세션에서 띄우기(`--worktree path:<절대경로>`).

> ⚠ **`.md` 는 OS 기본 연결 앱이 없는 경우가 많다** (Windows 실측 2026-08-29 — `Invoke-Item` 이 `응용 프로그램을 찾을 수 없습니다` 로 실패). 그때 설치된 편집기를 뒤져 아무거나(Cursor·VS Code) 띄우면 **사용자가 안 쓰는 앱이 열린다**(실제 사고). 워크스페이스 파일을 사람에게 보여주는 기본값은 **`orca file open`** 이고, OS 연결 앱·임의 편집기로 폴백하지 않는다.

```bash
orca file open <worktree 상대경로> --worktree path:<절대경로> --json
# → {"ok":true,"result":{"kind":"markdown","opened":true,"relativePath":"..."}}
```

| 항목 | 판정 |
|---|---|
| cwd 추론(`--worktree` 생략) | O — 현재 폴더의 worktree로 자동 해석 |
| **`.md` 열기** | **O — `kind:"markdown"` 으로 Orca 편집기 탭에 뜬다** (실측 2026-08-29) |
| **타 레포 열기** | **O — `--worktree path:<절대경로>`** (Orca에 등록된 worktree만) |
| `name:`·`branch:` 셀렉터 | X — [§0](#0-사고-목록--먼저-읽는다) #11 |
| 존재하지 않는 파일 | O — `ENOENT`로 정직하게 실패 |
| 절대경로를 `<path>` 인자로 | X — `invalid_relative_path`. 경로는 **worktree 상대경로만** |
| `open-changed` untracked | O — 포함. git이 `?? dir/`로 접는 디렉터리도 **개별 파일로 펼쳐서** 연다 |
| `open-changed --mode edit` 삭제파일 | O — 열지 않고 `skipped[{reason:"deleted file has no edit target"}]`로 분리 보고 |
| `--mode` 오타 | O — 런타임 가기 전 `invalid_argument`로 로컬 차단 |
| `file diff`의 `ok` | ⚠ 변경 증거 아님 — [§0](#0-사고-목록--먼저-읽는다) #7 |
| `open-changed` 탭 상한 | ⚠ 없음 — [§0](#0-사고-목록--먼저-읽는다) #8 |

- **`open-changed --json`은 데이터 소스로도 쓸 만하다** — `totalChanged`·`opened[]`·`skipped[]`·파일별 `kind`를 구조화해 돌려준다. **원격 worktree의 변경 규모를 `git` 없이 재는** 용도.

### 3.7 worktree set — 칸반 메타데이터

**판정**: **사람 눈에 보이는 부착 라벨로만** 쓴다. 검증이 전무해 상태기계로 못 쓴다. 정본은 여전히 `ROADMAP.md` 마커·`.harness/work.json`.

**⚠ 보드는 두 개다 (2026-08-28 M26 실측)**: 이 절의 `workspaceStatus` 칸반(workspace board)은 **수동 라벨**이고, v1.4.162 의 **Agent Dashboard**(Needs You/Working/Done)는 **훅 이벤트 자동 감지**로 도는 별개 기능이다(§3.15). "보드가 죽어 있다"는 관측은 수동 보드 한정 — 실측에서 33/33 워크트리가 `in-progress` 정체(아무도 안 옮겨 무정보). 값 검증 X 판정(§0 #9)은 v1.4.190 에서도 유효(미정의 한글 커스텀 값도 그대로 저장 재확인). 정본 노드: kg `orca-workspace-board-vs-agent-dashboard`.

`displayName`·`comment`·`workspaceStatus`(칸반 컬럼)·연결 이슈·**부모-자식 계보**를 붙이며, 전부 `show`·`list`·**`ps` 응답에 실린다** → 프로그램으로 읽을 수 있는 **에이전트 부착 상태 필드**.

| 항목 | 판정 |
|---|---|
| `--comment` / `--display-name` / `--workspace-status` | O — 즉시 저장, `show`·`list`·`ps` 모두 반영 |
| **`--parent-worktree` 크로스-레포** | **O — 다른 레포의 worktree를 부모로 지정 가능.** 부모쪽 `childWorktreeIds`에 양방향 반영, `lineage`에 `origin:manual`·`capture.confidence:explicit` 기록 |
| `--no-parent` | O — 양쪽에서 깨끗이 해제 |
| `name:<displayName>` 셀렉터 | O — **`--display-name`을 지정해 두면** 그때부터 `name:`으로 잡힌다 |
| `--workspace-status` 값 검증 | **X** — [§0](#0-사고-목록--먼저-읽는다) #9 |
| `--issue` 실재 검증 | **X** — 없는 번호도 그대로 링크. GitHub 조회 안 함 |
| `--comment` 비우기 | **X — 불가.** `""`·`--comment=`는 "미지정"으로 무시(기존값 유지), `null`은 문자열 `"null"`로 저장. 최선이 공백 한 칸 |

- **활용 경로(2026-07-23 배선 완료)**: 팬아웃 워커가 끝날 때 `orca worktree set --worktree <자기> --workspace-status in-review --comment "<완료 요약>"` 을 남기면 **`python scripts/portfolio_live.py` 의 `워커 라벨` 열로 한 번에 수확**된다(왕복 실측). 기본값 `todo`·`in-progress` 는 orca 가 자동 부여하는 값이라 **노이즈로 숨기고**, 의도적으로 옮긴 칸(`in-review`·`completed`·커스텀)과 comment 만 표시한다.
- **크로스-레포 계보**는 이 레포의 총괄 역할과 직접 맞는다 — "이 작업은 저 레포 작업의 자식"을 orca 상태에 기록할 수 있다. 다만 `origin:manual`이라 **성실히 쓰지 않으면 비는 필드**.

### 3.8 repo·project·원격 머신

- `repo search-refs`는 local branch를 찾고, `repo set-base-ref`는 `worktreeBaseRef`를 영속화한다.
- `project list`·`project setups`에서 Project → local Host setup → Repo 연결과 `imported-existing-folder / ready` 상태를 확인할 수 있다.
- **M4 원격 레지스트리 drift와 재등록 (2026-07-22, 해소됨)**
  - 증상: `status --environment macmini-m4`는 ready인데 **`repo list --environment macmini-m4` = 0건** — 원격 팬아웃 타깃이 없었다.
  - **⚠ `repo add --path <원격경로> --environment <remote>`는 Windows에서 실패한다** — `Project path must be an absolute path`. 호출하는 CLI가 원격 경로를 **로컬(Windows) 절대경로 규칙으로 검증**하는 클라이언트측 문제. `/Users/...`도 거부된다.
  - **우회(실측 성공)**: 원격에서 직접 등록 — `ssh m4 'export PATH=$HOME/.local/bin:$PATH; orca repo add --path /Users/luma3/projects/agent-orchestration --json'`. 직후 Windows의 `repo list --environment`에 즉시 반영.
  - 등록 시 Orca가 그 repo에 **빈 터미널을 자동 생성**할 수 있다 — 작업 후 `terminal list --environment`로 정리.
- Windows → M4 전체 생명주기 성공: `--environment macmini-m4` 지정 → 독립 worktree 생성 → remote zsh terminal create/send/read → stop → clean 확인 → `worktree rm`. worktree는 `/Users/luma3/orca/workspaces/<repo>/<name>`, branch는 `<gitUsername>/<name>` 형태. 크로스-머신 왕복 회수값: `host=luma3ui-Macmini-2 arch=arm64 os=Darwin branch=master`.
- remote one-shot terminal은 exit 0이어도 scrollback이 빌 수 있다. **지속 zsh를 만들고 `send`→`read`**가 안전하다. 일반 zsh prompt에서 `tui-idle`은 timeout될 수 있다.
- headless runtime의 background terminal create가 `could not make it discoverable` 경고를 내도 handle은 유효했다 — **GUI 노출 실패와 PTY 생성 실패를 구분**한다.
- M4 remote worktree를 `--agent codex --prompt ... --setup skip`으로 생성하자 Codex 0.144.6이 기동·인증되고 지정 응답을 반환했다. 이 Codex TUI에서는 `tui-idle`이 정상 만족했다.

### 3.9 `agent-context` — 플래그 이름을 추측하지 않는 법 (2026-07-23 실측)

**판정**: 채택. `orca agent-context --json` 은 **206개 명령 전체의 기계 판독 스키마**(약 100KB)를 돌려준다. 이 세션에서 낸 플래그 오류(`type --input` vs `inserttext --text`, `terminal read --lines` vs `--limit`)는 **전부 이걸 먼저 조회했으면 안 났다.**

- 구조: `{schemaVersion:1, commandCount:206, commands:[...]}`. 각 항목 = `command`·`path`·`aliases`·`argumentMode`·`summary`·`usage`·**`flags`**·`positionalArgs`·`examples`·`notes`.
- **⚠ 응답에 `ok`/`result` 봉투가 없다** — 다른 명령과 달리 최상위가 곧 데이터다. `d['result']` 로 읽으면 `KeyError`.
- 용례 — 플래그 확인 한 줄:
  ```bash
  orca agent-context --json | python -c "import json,sys;print([c['flags'] for c in json.load(sys.stdin)['commands'] if c['command']=='<명령>'])"
  ```
- 실측 사례: `find`→`locator,value,action,text` · `type`→`input` · `inserttext`→`text` · `fill`→`element,value`. **이름이 명령마다 다르다는 사실 자체**가 여기서만 한눈에 보인다.

### 3.10 외부 환경·진단·부가 표면

- `environment list`가 비어 있으면 remote pairing 테스트 대상이 없다. **모바일 앱 페어링과 원격 runtime 등록은 별개다** — `orca serve --mobile-pairing`의 QR/link는 모바일 앱용, `environment add`는 다른 머신 runtime이 발급한 pairing code용. (단 *서빙 표면*은 별개가 아니다 — 3.11 참조: headed 데스크톱 앱도 같은 포트로 Orca Web을 내보낸다.)
- `vm recipe doctor` 기본 모드는 provisioning 없는 정적 검사다. **`--provision`은 비용·외부 상태를 만들 수 있으므로 별도 승인 없이 실행하지 않는다.**
- `diagnostics memory`는 app/main/renderer/other·host·worktree별 session의 CPU·memory snapshot을 반환한다. 종료된 session이 한동안 포함될 수 있다.
- Linear current issue 조회는 worktree 링크가 없으면 `linear_no_linked_issue`. 명시 issue나 Linear-linked worktree 없이는 쓰기 테스트를 하지 않는다.
- **computer-use 검증 불일치**: 앱·창·접근성 tree 조회와 Notepad 새 탭 클릭은 성공. 그러나 `set-value`에 불필요한 prefix가 붙어 `value_mismatch`, synthetic keyboard 입력은 focus 확보 실패로 `unverified`, target metadata는 Notepad인데 screenshot pixels가 다른 창인 사례. **반환된 verification과 새 accessibility state를 우선하고 UI 성공을 추정하지 않는다.**
- **emulator**: Windows에서 iOS `emulator list`는 `spawn serve-sim ENOENT`. M4에 Xcode 26.6·iOS 26.5 runtime 설치 후 `iPhone 17 Pro` attach/home/rotate/kill 성공. iOS `emulator ax`는 `accessibilityTree is not supported`. 번들 `orca-emulator` 스킬은 remote/SSH를 unsupported로 설명하지만 `--environment` + 명시 remote selector 조합은 **실측에서 동작**했다.
- Android: `emulator devices`는 실기기와 shutdown AVD를 구분해 나열. `emulator exec`가 scalar 출력 `35`를 받고 `Cannot use 'in' operator ...`로 실패 — **adb 실행이 아니라 Orca 결과 정규화 결함**으로 구분한다.
- **Android 재실측 (2026-08-04, v1.4.167)**: 여전히 `boot` 명령은 없지만 **`emulator attach --device <AVD>` 가 꺼진 AVD 를 부팅까지 트리거한다** — 단 부팅이 30초 RPC 창을 넘겨 **`runtime_unavailable` 로 응답만 실패**(§0 #12 계열). `devices` 로 `booted` 확인 후 **재-attach 하면 즉시 성공**(scrcpy 스트림 연결). 플래그 실측: `button --name home`(O — `--button` 아님) · `rotate --orientation portrait`(O — `landscape`/`landscape-left` 는 Invalid) · `tap --x 0.5 --y 0.9`(O, 0..1 정규화) · `ax`(O — 홈 화면 앱 텍스트 판독) · `logcat`(O — result 가 **list**, 5.4만 줄) · `shutdown`(O). 조작 전 `agent-context` 플래그 확인(§3.9)이 이번에도 오류 2건을 만들었다 — 선조회 습관 필수.
- **Android 3차 실측 (2026-08-14, askewly-command M110 실기기 회귀)**: capability 동사가 **기기가 진짜 부팅돼 있으면 전부 정상**이다 — `install <apk> --reinstall`(93MB release APK, 성공) · `launch <pkg>` · `tap <x> <y>`(위치 인자 O — `--x/--y` 형태와 둘 다 받는다) 로 앱 설치→기동→화면 이동까지 CLI 만으로 마쳤다. 두 가지를 새로 기록한다.
  - **`runtime_unavailable` 을 Orca 결함으로 읽지 않는다.** 이번에 `attach`·`install` 이 3회 연속 이 오류를 냈는데 원인은 §0 #12 의 RPC 타임아웃이 아니라 **기기가 실제로 안 떠 있었던 것**이다(`devices` 는 정상 응답했다 — 조회 계열은 살아 있고 capability 계열만 떨어진다). 판정 순서: 오류를 보면 먼저 `emulator devices --json` 의 `state` 가 `booted` 인지 본다. `shutdown` 이면 Orca 가 아니라 호스트 쪽 문제다.
  - **호스트 함정(Orca 밖, 하지만 여기서 만난다)**: 에뮬레이터는 런처(`emulator.exe`)와 VM(**`qemu-system-x86_64-headless`** — 이름에 `-headless` 가 붙어 `qemu-system-x86_64` 검색으로는 **안 잡힌다**)이 별개 프로세스다. 런처만 죽이면 VM 이 고아로 남아 `<AVD>.avd/hardware-qemu.ini.lock`(디렉터리, 안의 `pid` 가 범인)·`multiinstance.lock` 을 계속 쥐고, adb 는 `device offline` 로 고착하며 재부팅은 `FATAL | Running multiple emulators with the same AVD` 로 죽는다. 복구는 lock 의 `pid` → 그 PID 종료 → `*.lock` 삭제 → `adb kill-server` → 재부팅. 예방은 `adb -s <serial> emu kill`(런처 강제 종료 금지). 지식 노드 `android-emulator-orphan-vm-lock`(kg, draft).
  - **스크린샷 verb 는 없다** — `adb -s <serial> exec-out screencap -p` 폴백. 번들 스킬 정본은 `orca skills get orca-emulator-android`(Android 전용, 좌표 0..1 정규화·capability 동사 표).
- **M4 headless 운영**: headed Orca와 `orca serve`는 같은 userData profile 단일 인스턴스 잠금을 공유해 **동시 실행 불가**. 24시간 remote runtime은 LaunchAgent `dev.onorca.headless`가 `orca serve --port 6769 --pairing-address 100.100.79.12 --mobile-pairing`을 실행한다(`RunAtLoad` + network-aware `KeepAlive`). 정본은 M4의 `~/Library/LaunchAgents/dev.onorca.headless.plist`, 로그는 `~/Library/Logs/orca-headless.{out,err}.log`, 권한은 `0600`. 상태 `launchctl print gui/$(id -u)/dev.onorca.headless`, 재시작 `launchctl kickstart -k ...`. 사용자 `luma3` 로그인 세션에서 실행되며 실측값 `autoLoginUser=luma3`·FileVault off·system sleep 0·`autorestart=1`·`womp=1`이라 재부팅 뒤 자동 복구된다. 폰 직접 접속은 폰 Tailscale이 같은 tailnet이어야 하고 M4 화면이 잠겨도 된다. **M4 headed Orca를 쓰려면 먼저 LaunchAgent를 중지**한다. (M4 여유 공간은 캐시 정리·Xcode/runtime 설치 전후로 9.6GiB → 37GiB → 16GiB로 움직였다.) SSH 환경에서 pairing URL stdout이 버퍼링된 사례가 있어 launchd 로그의 최신 `Pairing URL:`에서 가져오되 **링크 자체를 운영 노트나 memory에 저장하지 않는다.**

### 3.11 다른 기기에서 이 기기 세션 이어받기 — Orca Web (2026-08-01 실측·사용자 채택)

**판정**: 채택, 기본 경로. 맥북에서 집 Windows의 돌아가는 Claude 세션 12개를 **사이드바째** 이어받았다. 사용자 확인: "내가 원하던 형태가 이것".

**핵심 사실 — 여기서 막혔던 지점**: `claude -r`은 트랜스크립트가 기기-로컬이라 크로스머신이 안 된다. 그래서 "세션은 기기에 묶인다"로 결론내기 쉬운데 **틀렸다.** Orca는 런타임 자체를 원격에 노출하고, **headed 데스크톱 앱이 이미 Orca Web을 같은 포트로 서빙하고 있다** — `orca serve`를 따로 띄울 필요가 없다. 모바일에서 되던 게 맥북에서 안 됐던 이유는 기능 부재가 아니라 **그 기기에 environment 등록이 빠져 있었을 뿐**이다.

| 경로 | 얻는 것 | 쓸 때 |
|---|---|---|
| **Orca Web** (브라우저) | 원격 기기의 Orca UI 통째 — 사이드바·터미널·세션 | 사람이 직접 이어서 작업할 때 (**기본**) |
| 데스크톱 앱 `Settings → Runtime Environments` | 앱 사이드바를 그 환경으로 전환 | 앱 안에서 계속 쓰고 싶을 때 |
| `--environment <name>` CLI | `terminal list/read/send`, `repo list` 등 | 에이전트가 프로그램으로 조작할 때 |

**절차**
1. 대상 기기에서 런타임 확인: `ssh <host> "orca status"` → `runtimeReachable: true`. 리스닝 포트는 `orca-runtime.json`의 `transports[].endpoint`(headed 앱 기본 6768, M4 headless는 6769).
2. 페어링 오퍼를 만든다. 스키마(`shared/mobile-relay-pairing-offer.js`, `v:2`): `{v, endpoint, deviceToken, publicKeyB64, scope:"runtime"}` → JSON을 **base64url**(`+`→`-`, `/`→`_`, `=` 제거)로 인코딩 → `orca://pair?code=<...>`. 재료 위치(대상 기기 `%APPDATA%\orca` / `~/Library/Application Support/orca`): `orca-devices.json`의 **scope=runtime** 토큰, `orca-e2ee-keypair.json`의 `publicKeyB64`, endpoint는 tailnet IP로 바꿔 쓴다(`0.0.0.0` 그대로 쓰지 않는다).
3. CLI 등록: `orca environment add --name <host> --pairing-code "<코드>"` → 검증은 `environment show`의 `runtimeId`가 **대상 기기 runtimeId와 일치**하는지 (null이면 미연결).
4. 브라우저: **`http://localhost:<로컬포트>/?code=<base64url 부분>`** 을 연다(ssh 터널 경유 — 아래 함정 첫 항목). 웹 클라이언트는 `?pairing|pair|code|token=` 또는 hash를 읽고, **scope가 `runtime`이면 자동 저장**(`auto-save-runtime-offer`)한 뒤 `history.replaceState`로 URL에서 지운다. 저장은 origin 단위라 같은 localhost 포트로 재방문하면 `?code=` 없이도 붙는다.

**함정**
- ⚠ **평문 tailnet IP 로는 안 열린다 — 흰 화면 (2026-09-01 실측, Chrome).** `http://100.x.x.x:6768/?code=…` 은 브라우저의 **secure context 가 아니라** `crypto.randomUUID` 가 존재하지 않고, Orca Web 번들이 부팅 중 `TypeError: globalThis.crypto.randomUUID is not a function` 으로 죽어 빈 `<div>` 만 남는다(서버는 정상 — 루트가 200/3.7KB SPA 를 낸다). **브라우저 종류·페어링과 무관하다.** 우회는 **secure context 로 만드는 것**: `ssh -f -N -L 127.0.0.1:<로컬포트>:127.0.0.1:<원격포트> <host>` 후 `http://localhost:<로컬포트>/` 로 연다(localhost 는 secure context). ws 는 offer 의 tailnet endpoint 로 그대로 나가므로 터널은 *페이지 서빙*만 담당한다. 8/1 채택 당시엔 통과했으니 **번들이 그 사이 randomUUID 를 쓰기 시작한 회귀**로 본다.
- ⚠ **터널 포트에 `127.0.0.1:` 을 명시하지 않으면 로컬 Orca 를 가린다 (2026-09-01 사고).** 이 맥의 Orca 도 6768 을 듣고 있어 `-L 6768:...` 은 IPv4 bind 에 실패하면서 **IPv6(`::1`)에만 붙어 조용히 성공**한다 — 그 뒤 `localhost:6768` 이 원격을 가리키게 된다. 다른 로컬 포트(6778~)를 쓰고 bind 주소를 명시한다. 또한 ssh 가 ControlMaster 를 공유하면 **터널 하나를 죽일 때 다른 터널도 함께 끊긴다**(실측).
- ⚠ **URL과 pairing code에 런타임 인증 토큰이 들어 있다.** 문서·memory·커밋·스크린샷에 남기지 않는다(§3.10 M4 항목과 같은 규칙). 재료는 매번 대상 기기에서 읽어 조립한다.
- 이미 발급됐지만 안 쓴 오퍼가 남아 있을 수 있다 — `orca-devices.json`에서 `scope:"runtime"` + `lastSeenAt:0`. 새로 뽑기 전에 확인한다.
- **이어받는 세션이 자율 실행 중일 수 있다.** `terminal send`는 그 입력창에 직접 타이핑하는 것이라 진행을 깬다. 넣기 전에 `terminal read`로 현재 상태를 본다(§3.2).
- tailnet 밖이면 전부 죽는다. `ws://`는 평문이고 기밀성은 Tailscale이 책임진다.

**재방문은 ssh 불요 (2026-08-25 실측)**: 한 번 `environment add` 를 하면 pairing 재료(`endpoint`·`deviceToken`·`publicKeyB64`)가 **이 기기의 `orca-environments.json` 에 남는다**. 그래서 §3.11 절차 1~3단계를 다시 밟을 필요 없이 로컬에서 URL 을 재조립할 수 있다 — `python3 scripts/orca_web.py windows`. 대상 기기가 꺼져 있으면 TCP 프리플라이트에서 걸러 안내만 하고 브라우저를 열지 않는다(오프라인 경로 실측 — 2026-08-28 Windows 에서도 재확인, `macmini-m4` 대상). **온라인 경로 검증 완료 (2026-09-01, Mac → Windows)**: 프리플라이트 통과 후 Chrome 에 Windows 사이드바가 그대로 떴다. 단 **평문 IP 직결은 흰 화면**이어서(위 함정 1번) 스크립트가 **ssh 터널을 자동 수립해 `http://localhost:<포트>/` 로 연다** — 이미 뚫린 터널이 있으면 재사용하고, `--ssh-host` 로 ssh 별칭을 지정할 수 있으며 `--no-tunnel` 로 옛 직결 경로도 남겼다(경고를 붙여 출력). 터널 재사용 탐지는 posix 전용이다(macOS `pgrep -a` 는 PID 만 내므로 `ps -axo pid=,command=` 로 읽는다). 검증하려면 **양쪽 기기가 동시에 켜져 있어야 한다** — 환경 등록이 한 방향씩만 돼 있어서(이 Windows 에는 `macmini-m4` 만, Mac 에는 `windows` 만) 각 기기는 상대를 향해서만 열 수 있다. ⚠ **2026-08-28 이식성 수리**: 이 스크립트는 `orca-environments.json` 경로와 브라우저 실행기가 macOS 로 하드코딩돼 있어 **Windows 에서는 첫 줄에서 죽었다**(파일은 있었고 경로만 `AppData/Roaming/orca/` 로 달랐다). 경로 탐색 3후보 + `sys.platform` 분기로 고쳤고 Windows 에서 목록·프리플라이트까지 실행을 확인했다. 스크립트는 토큰이 든 URL 을 기본적으로 출력하지 않는다(`--print` 로만 노출).

**독립 사이드바 정합 (2026-08-25 실측)**: 양쪽 기기에서 같은 프로젝트 세트를 *독립적으로* 쓰려면 각 기기에서 `orca repo add --path <절대경로>` 를 돌리면 된다. Project 는 `github:owner/repo` 로 기기 무관이고 host setup(경로)만 기기별로 생긴다. 이 맥북에서 41개 일괄 등록 → 48/48 `ready`, **터미널 자동 생성 부작용 없음**(3개 유지 — §3.8 의 M4 사례와 달랐다). Windows 를 켤 필요도 없었다: 기준 목록은 Windows 에서 생성돼 git 으로 넘어온 `~/projects/INDEX.md` 가 대신했다.
- computer-use로 앱 GUI를 대신 조작하려던 시도는 **실패**했다: `permissions`는 accessibility/screenshots 모두 `granted`로 보고하는데 `get-app-state`는 계속 접근성 거부. 헬퍼(`Orca.app/Contents/Resources/Orca Computer Use.app`) 재기동으로도 안 풀렸다 — TCC 등록이 헬퍼가 아닌 본체에 붙은 것으로 추정(미확증). **GUI 대행이 막혀도 위 세 경로는 영향 없다.**

### 3.12 Windows 앱 업데이트 회귀 — IME 터미널 글자 깨짐 (2026-08-02 실측 · **2026-08-04 해소**)

> **해소 (2026-08-04, M1 step-1)**: upstream [#12286](https://github.com/stablyai/orca/issues/12286)(영향 1.4.161–1.4.165 — 증상 3종: Shift 자모 입력 시 Shift+Enter 삽입으로 행 바뀜·미완성 메시지 전송 / 조합 오버레이가 이전 글자 위에 겹침 / Backspace 로 지운 글자 커밋)이 우리 증상과 일치했고, **v1.4.167**("Fixed IME typing issues (Korean & Chinese)")로 업데이트 후 사용자 실타이핑 판정 정상. **자동 업데이트 ON 유지.** 아래 롤백 절차는 재발 대비용으로 보존 — Orca 는 IME 반복 회귀 이력이 있고 [#12308](https://github.com/stablyai/orca/issues/12308)(Gemini CLI 한글)이 잔존한다. 업데이트 시 Orca.exe 만 종료하면 되고, 터미널 데몬 분리 덕에 **실측에서 터미널 14개·Claude 세션 전부 앱 재기동 후 생존**했다.

**증상**: Orca 앱 업데이트(v1.4.163) 직후부터 터미널에 타이핑하는 도중 실시간으로 줄바꿈이 깨지고 글자가 이상해짐. Orca.exe 재시작·데몬 포함 완전 재시작으로도 해결 안 됨(상태 문제가 아니라 바이너리 코드 버그였다는 뜻).

**원인 추정**: v1.4.163의 "reconcile cross-platform IME composition lifecycle"(PR #11293)가 Windows에서 회귀. Orca는 한글·중국어 등 IME 조합 처리에서 과거에도 반복 회귀 이력이 있다([#7183](https://github.com/stablyai/orca/issues/7183) 한글 입력 완전 불가, [#6147](https://github.com/stablyai/orca/issues/6147) 중국어 전각 문장부호 깨짐, v1.4.146 IME 커밋 중복/유실).

**해결 — 이전 버전 롤백**: GitHub 릴리스에 버전별 `orca-windows-setup.exe`가 남아 있어 수동 다운그레이드가 가능하다. v1.4.161(문제 PR 이전)로 롤백해 해결 확인.

```powershell
Get-Process -Name "Orca" | Stop-Process -Force
gh release download v1.4.161 --repo stablyai/orca --pattern "orca-windows-setup.exe" --clobber
Start-Process -FilePath ".\orca-windows-setup.exe" -ArgumentList "/S" -Wait
(Get-Item "C:\Users\yusun\AppData\Local\Programs\orca\Orca.exe").VersionInfo.ProductVersion
```

- Orca.exe만 종료하면 됨 — `orca-terminal-daemon`은 별도 프로세스라 건드리지 않으면 기존 세션이 안 끊긴다.
- 자동 업데이트는 롤백 후에도 켜진 채로 남는다. 재발 시 최신 릴리스 노트에서 IME/터미널 렌더링 관련 변경 여부부터 확인([릴리스 목록](https://github.com/stablyai/orca/releases)).

---

### 3.13 신규 GUI 표면 4종 — Quick Commands·Design Mode·Diff Annotation·AI Vault (2026-08-04 실측, M1 step-2)

**판정 한 줄**: 4종 전부 **CLI 미노출**(206개 명령 전수 검색 0건 — `agent-context` 실측). 전부 GUI 표면이고, 그중 에이전트 워크플로우에 닿는 건 Quick Commands 하나다.

| 표면 | 확인 경로 (실측) | 판정 |
|---|---|---|
| **Quick Commands** | capability `terminal.quick-commands.v1` + **접근성 트리에서 터미널 탭 바 「빠른 명령 추가」 단추 확인**(computer-use get-app-state) | **채택 — GUI 수동 등재.** 자주 쓰는 스폰 프롬프트·명령을 터미널 탭에 저장, 모바일 컴패니언에서도 실행 가능(공식 docs/mobile). 등재는 사람이 GUI에서 |
| **Design Mode** | CLI 0건. 브라우저 pane GUI 소속 — 백그라운드 워크스페이스에 `tab create`는 되지만 토글은 포커스된 pane에만 떠서 a11y 프로브 미노출. **수신 실물 확인 2026-08-05(아래)** | **GUI 전용·사람-주도.** 사람이 요소 클릭→HTML/CSS가 에이전트 프롬프트로 주입되는 지시 표면. 에이전트 쪽 자동화 경로는 기존 `snapshot`→`--element`(3.5)가 정본 — Design Mode 를 에이전트가 대신 누르는 시도는 하지 않는다 |
| **Diff Annotation** | CLI 0건(diff 관련은 `file diff` 열기뿐). 공식 README "diff 라인에 마크다운 코멘트→에이전트 피드백" | **GUI 전용·사람-주도.** 사람 리뷰→에이전트 수정 루프의 지시 표면. 에이전트가 읽는 쪽 배선은 미확인 — 실사용에서 코멘트가 에이전트 프롬프트로 어떻게 들어오는지 관찰 후 재판정 |
| **AI Vault** | CLI 0건. v1.4.165 릴리스노트 "AI Vault session history"(세션 히스토리 행에 첫 프롬프트 표시) | **확인만 — 활용도 낮음.** 세션 히스토리 UI 명칭. 세션 이어받기 정본은 HANDOFF.md·`claude -r`·Orca Web(3.11)이라 에이전트 경로에 안 얹는다 |

- **Quick Commands 등재 후보 (M1 step-3 — GUI 「빠른 명령 추가」로 사람이 등재)**: ① `claude` 실행 후 첫 프롬프트용 — "HANDOFF.md 읽고 이어서 할 일부터 브리핑해줘" ② "`/briefing`" ③ 점검용 셸 명령 — `orca worktree ps --json`. 등재 여부·사용감은 실사용 후 이 절에 추가 기록.
- 한계 명시: Diff Annotation 은 **화면 실측이 아니라 CLI 부재 실측 + 공식 문서 근거** 판정이다 — 포커스된 워크스페이스가 아니면 pane 이 a11y 트리에 안 실려 프로브가 닿지 않았다(2026-08-04). 실사용 관찰이 쌓이면 재판정. **Design Mode 는 2026-08-05 수신 실물 확인으로 이 한계에서 해제**(아래).

**Design Mode 수신 경로 — 실물 확인 (2026-08-05, 구 F2 큐 종결)**

사람이 Orca 브라우저 pane 에서 요소를 클릭하고 코멘트를 달면, **에이전트의 다음 사용자 턴 앞에 텍스트 블록으로 주입**된다. 도구 호출도 폴링도 없다 — 에이전트는 그냥 프롬프트로 받는다.

- **⚠ 라우팅은 「탭을 소유한 워크트리」 기준이다 — 사이트가 속한 레포가 아니다.** 실측: `hr.askewly.com`(코드는 `interx-onboarding-portal`) 을 **agent-orchestration 워크트리의 브라우저 pane** 에서 열고 주석을 달자 **agent-orchestration 세션으로** 들어왔다. 포털 세션은 아무것도 못 받았다. 특정 레포 담당 세션에 지시를 보내려면 **그 워크트리의 pane 에서 열어야 한다**(`tab list --worktree all` 로 소속 확인).
- 페이로드 2부: ① `Attached browser context` — 선택 요소의 tag·Role·Selector·Dimensions·Text content·Nearby context·주요 computed styles·HTML·Ancestor path·Full DOM path. ② `## Design Feedback: <경로>` — URL·**Browser tab id**·Viewport + 주석 N개. 주석 하나마다 `Intent`(예: `question`)·Selector·Location·**Bounds(x,y,w,h)**·Classes·Text·computed styles 약 15종·Full DOM path·**전체 outerHTML**·그리고 사람이 쓴 `Feedback` 한 줄.
- **컨텍스트 비용이 크다** — 주석 1건이 outerHTML 전문 + 스타일 15종이다. 여러 개를 한 번에 달면 프롬프트가 무거워진다. 많이 달 땐 나눠 보내는 편이 낫다.
- 스크린샷은 이 경로에 포함되지 않았다(구 기록의 "잘린 스크린샷"은 미확인 — HTML/CSS/좌표만 왔다).
- 참고: 사이드바 구성·터미널 탭 구조는 `computer get-app-state --app Orca` 접근성 트리(약 20KB)로 기계 판독 가능 — 사이드 네비 정리 검증(레포 제거 확인)에 실사용했다.

### 3.14 포트 패널 — 내장돼 있으나 이 기계에서 dev 서버를 놓친다 (2026-08-12 실측, M2)

**위치**: 우하단 상태바의 플러그 아이콘(`7.14 GB · >_ 9 | 🔌 57 | 호스트 1개` 중 가운데). 사이드바가 아니라 상태바라 잘 안 보인다. 옆의 "개발서버 시작" 툴바 버튼은 워크트리에서 `npm run dev` 를 실행하는 시작 버튼일 뿐 관리 뷰가 아니다(`package.json` 없는 레포에서는 npm ENOENT).

**CLI 에는 없다** — `agent-context` 명령 228개 전수 스캔·공식 CLI 레퍼런스·번들 스킬 세 갈래 모두 dev server·포트 명령 0개. 즉 **패널은 눈으로만 볼 수 있고 에이전트는 그 데이터를 못 읽는다.**

**스캔 자체는 정상이다.** `Port scanning is temporarily paused after a command timeout` 문구 없음 — 이 PC 에 금융권 보안 프로그램이 다수 주입돼 있어 [#11161](https://github.com/stablyai/orca/issues/11161)(EDR 주입 지연) 을 의심했으나 해당 없음. 소스(`src/main/ports/local-workspace-port-scanner.ts`)의 Windows 경로는 `netstat -ano -p tcp` + `Get-CimInstance Win32_Process`, 귀속은 cwd 우선 후 command line 경로 매칭이다.

**⚠ 그런데 우리 용도로는 거꾸로 나온다.** 실측(라이브 세션 9개): 헤더 `57 워크스페이스 · 37 외부`, 목록은 전부 `second-brain` 하나에 묶인 `node.exe`/`workerd.exe` 의 임시 포트(49828·50881 등) — **에이전트 세션 자신의 내부 소켓**이다. 반면 **진짜 dev 서버인 :5173(ui-dictionary 의 고아 vite)은 워크스페이스 목록에 없다**(목록이 포트 오름차순인데 첫 행이 8788). 원인 미규명 — 같은 조건에서 `scripts/devserver_ports.py` 는 command line 경로 매칭만으로 :5173 을 ui-dictionary 로 정확히 붙였다.

**워크트리 지정 열기는 된다 (2026-08-12 M4 실측)**: `orca tab create --url <url> --worktree path:<절대경로>` 로 특정 워크트리 pane 에 탭을 띄울 수 있고, `tab list --worktree all` 에서 그 소속으로 잡힌다. `widget/` 의 Orca 열기 버튼이 이 경로를 쓴다. 경로는 `--json` 이 준 원본을 그대로 넘긴다(정규화본은 소문자화돼 있어 못 쓴다).

**그래서 이 레포는 `python scripts/devserver_ports.py` 를 쓴다** — 같은 데이터를 CLI 로 내고, 임시 포트·에이전트 내부 소켓·시스템 데몬을 걷어낸다(93건 → 11건). 관련 업스트림: [#12190](https://github.com/stablyai/orca/issues/12190) 실행 서비스·소유 프로젝트 사이드바 · [#11258](https://github.com/stablyai/orca/issues/11258) dev 서버 이름 붙이기 · [#10346](https://github.com/stablyai/orca/issues/10346) Windows 터미널 종료 시 자식 서버 tree-kill(고아 포트의 원인).

### 3.15 M26 전수 실구동 판정 — 신규 표면 5계열 (2026-08-28, v1.4.190)

**판정 한 줄**: 232개 CLI 전수를 3분류로 닫았다(전수표·실행 로그의 정본은 changeset — §4 참조). 여기엔 새로 확인된 표면과 함정만 적는다.

| 표면 | 판정 |
|---|---|
| **`agent hooks` 4종** (`status/on/off/prepare-codex`) | **Agent Dashboard 자동감지의 배선.** enabled 상태에서 `~/.claude/settings.json` 의 11개 훅 이벤트가 `~/.orca/agent-hooks/claude-hook.cmd` 경유로 `127.0.0.1:<port>/hook/claude` 에 이벤트 POST(Orca pane 밖에서는 무해 종료). off→on 왕복 실측 — settings.json 바이트 동일 복원. 에이전트 17종 훅 스크립트 존재, 현재 installed: claude·codex·gemini·antigravity·hermes |
| **Agent Dashboard** (GUI) | 배선은 위로 확정, **GUI 컬럼 실물은 미관측** — `computer get-app-state` 접근성 트리가 9노드 무명 "영역"으로 §3.13 때(20KB 트리)보다 퇴행해 프로브 미도달. 스크린샷 경로는 정상(`screenshot.path` 판독 가능). workspace board 와는 별개(§3.7) |
| **공유 게이트** (`artifacts` 5종·`skills share`) | 발행 계열은 **토글 게이트가 인증보다 먼저** 발화(`artifact_sharing_disabled`/`agent_skill_sharing_disabled` — "off for this device"), 회수·조회 계열은 `authentication_required`. Orca Account 로그인 명령은 CLI 에 없다(사람 GUI 전용). **로그인·토글 ON 후 왕복 완주(2026-08-28)**: share(30일 만료·즉시 실서빙)→update(`updatedAt` 갱신, `version` 불변)→unshare/delete 전부 O. delete 의 id = **`artifact.slug`**. ⚠ **없는 id 에도 `deleted:true` 를 준다** — 삭제 확인은 `list` 재조회+URL 404 로만 |
| **orchestration Run 모델** | `run` → `run-create/run-current/run-list/run-show(--id)/run-use` 개편, `coordinator-start/stop` 은퇴 실측(§3.3). `gate-list` 등은 Run 바인딩(`run_required`)이 전제 |
| **브라우저 잔여** | O: `upload`(`--element`+`--files`, files.length 재조회 — **download 실패와 비대칭**) · `dialog accept/dismiss`(실 confirm 왕복) · `drag`(재-snapshot 후) · `intercept enable→list→disable`(list 는 enable 전제 — 단독 호출은 `runtime_unavailable`) · `mouse wheel --dy/--dx` · storage session 3종 · `tab profile set(--profile <id>)/use-default` · `viewport`·`geolocation`·`back/forward`·`dblclick`. **X**: `select-all`(ok:true 인데 선택 0자 — 조용한 무효) · `hover`(3회 연결 종료, 같은 탭 타 명령 정상 — hover 특이 결함. 대안 `find --action hover`) |

**신규 함정 (§0 급이지만 M26 한정 관측 — 재발 시 §0 승격)**: `orchestration worker-start` 의 receipt 가 `state:failed`·`agent_prompt_stalled` 를 줬는데 **워커는 실제로 기동해 과제를 완주**했다(터미널 재조회로 확인). receipt 실패를 믿고 재-dispatch 하면 이중 실행이 된다 — 판정은 반드시 `terminal read`/`worker-show` 재조회로. 또 `worker-abandon` 은 터미널을 닫지 않는다("no process was stopped" 경고 반환) — 정리는 별도 `terminal close`.

## §4 검증 현황

> **전수 인벤토리 (2026-08-28 M26)**: CLI 232개 명령 전수의 3분류표·실행 로그 정본 = `changesets/20260828-m26-orca-unused-surface-survey/README.md`. 분류 합계(M26 착수 시점): **검증됨 118 · 미검증 86 · 해당없음 28**. 미검증 86 은 M26 이 전부 처분했다 — 실구동 완료 60(조회 17 + 부작용 43 — step-6 이관 해소 포함) · 환경불가+부활조건 14 · 계정 게이트(로그인 대기) 6 · 범위 밖/보류(부활 조건 등재) 6. **미검증 잔여 = 아래 「환경·수정이 준비되면 재검증」의 M26 항목들이 전부다.**

> (2026-08-28 M26 재작성 — 구 「완료」·「부분 완료」 서술 목록은 은퇴했다. 명령별 판정·근거 절은 위 changeset 인벤토리표가 행 단위로 소유하고, 판정 본문은 §0·§3 이 소유한다. 이 절은 **미검증 잔여**만 관리한다.)

### 환경·수정이 준비되면 재검증

**M26 마감분 (2026-08-28 — 부활 조건 상세는 changeset step-4·6)**
- `account add` — 사용자 동석 대화형
- `claude-teams` — 일회용 워크트리 터미널에서
- `agent hooks prepare-codex` — Codex 훅 신뢰가 실제로 깨졌을 때
- `skills install/update` — 격리 환경에서(배포본 직접 변경 금지 규약)
- `project setup-existing-folder/clone/update/create/delete` — 신규 projectId 생성→삭제→복원 왕복 실증 후
- `environment rm` — M4 가동 중 삭제→재등록 왕복 가능할 때
- `computer drag/hotkey/paste-text/perform-secondary-action/press-key/scroll` — 사용자 부재 + 무해 대상 앱 지정 승인
- `hover` 결함(3회 연결 종료)·`select-all` 조용한 무효 — 상류 수정 후
- Agent Dashboard GUI 컬럼 실물 — 사람이 해당 뷰를 연 상태에서 재프로브
- emulator `gesture/permissions/type` — 다음 에뮬레이터 회귀 실측에 편승

**기존 이월분**
- browser download path 결함, 존재하지 않는 storage key의 응답 단절
- agent-browser 직결([#5610](https://github.com/stablyai/orca/issues/5610))·CDP attach([#6348](https://github.com/stablyai/orca/issues/6348)) — 열리면 Playwright 직결 검토
- Windows computer-use Notepad focus/value/screenshot — `computer capabilities` 가 `focus:false`·`moveResize:false` 를 명시(M26)해 **원인은 provider 미지원으로 확정**, 상류가 지원을 열면 재검증
- ~~실제 recipe가 있는 VM doctor~~ → **보류 (2026-07-23 사용자 확정)**. `--provision` 은 레시피를 실제로 실행해 클라우드 샌드박스/VM 을 띄우므로 **과금**이 생기는데, 실측 결과 **`~/projects` 어디에도 `orca.yaml` 이 없어 돌릴 대상 자체가 없다**(`vm recipe doctor cloud-sandbox` → `fail: No orca.yaml found`). recipe 를 만들려면 그 전에 4단계(클라우드 계정·CLI 로그인 → base 스냅샷 → 에이전트 인증 스냅샷 → state 배선)가 필요해 **승인 한 번으로 끝나는 검증이 아니라 별도 셋업 프로젝트**다. 부활 조건 = 일회용 클라우드 머신이 실제로 필요해질 때(신뢰 못 할 코드 실행·대규모 병렬 빌드 등). 현재는 로컬 Windows + M4 원격으로 격리 요구가 충족된다.
- Linear-linked worktree의 읽기 흐름
- Android `emulator exec` scalar 출력 정규화 결함
- iOS `emulator ax` backend 미지원과 번들 스킬의 remote 지원 설명 불일치

---

## §5 시작 체크

```powershell
orca status --json
orca skills list --json
orca skills get orca-cli
orca worktree ps --json
orca terminal list --json
```

**Orca 상태가 중요한 작업에는 Orca CLI를, Git 자체 상태·diff·commit·merge에는 Git을 쓴다.**
