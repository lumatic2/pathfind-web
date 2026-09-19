/**
 * 흐름 제어 — 목표 흐름 1~6(`docs/finals-plan-2026-09-12.md` §2)을 그대로 옮긴 자리.
 *   1 인터뷰(≤5턴) → 2 요약 승인 → 3-① 단계 골격 → 3-② 단계 리서치(동시 3, 429 면 순차)
 *   → 4 마인드맵 → 5 노드 클릭 = 중앙 설명 → 6 PNG · ROADMAP.md
 * 화면은 이 훅이 주는 함수만 부른다.
 */
import { useCallback, useRef } from "react"
import * as api from "@/lib/api"
import * as hermes from "@/lib/hermes"
import { channelTally, planningExplanation, groundStageCitations, isBetterStage, needsReinforce, normalizeVerdict, reinforceNote, type GroundedStage } from "./derive"
import type { Action } from "./store"
import type { ChatEntry, Finding, Session, Stage, StageSlot } from "./types"
import { CHANNEL_HOST, hostMatchesChannel, looksLikeReview, resolveChannel, stripMcpPrefix } from "@/state/channel-host"
import { CHANNEL_NAME, channelLine, stageSearchLine } from "@/state/waiting-lines"

export const STAGE_CONCURRENCY = 3

/** 이벤트가 이만큼 조용하면 「오래 걸리는 단계」 한 줄을 띄운다 — 침묵이 정지로 보이면 안 된다. */
const QUIET_MS = 30_000

/** 이만큼 아무 소식이 없으면 그 단계는 포기하고 4함수로 간다. 침묵이 영원이 되면 안 된다. */
const STAGE_TIMEOUT_MS = 360_000

const BUSY_LINE = "요청이 몰려 한 번에 하나씩 조사합니다. 조금 느려도 결과는 그대로 쌓입니다."
const STAGE_FAILED_LINE = "이 단계는 자료를 못 찾았습니다. 나머지는 계속합니다."

/**
 * 단계 하나를 Hermes 에게 시키는 프롬프트. **JSON 만** 받는다 —
 * 게이트웨이가 주는 구조화 표면은 최종 `output` 하나뿐이기 때문이다
 * (근거: `research/2026-09-13-hermes-gateway-contract.md` §4).
 */
/**
 * hermes 가 돌려준 finding 하나를 앱 모양으로 (5차 step-18).
 * 모델은 도구 이름(`law_search`)을 적으므로 채널 키(`law`)로 되돌리고, 채널이 고정 등급을 가진 것만 `grade` 를 채운다.
 * ⚠ 웹은 호스트마다 등급이 갈려(`gradeWeb`) 서버만 매길 수 있다 — 여기서 지어내지 않고 비워 둔다.
 */
const TOOL_TO_CHANNEL: Record<string, string> = {
  // 앞가지 붙은 MCP 이름과 맨 이름을 둘 다 받는다 — 앞가지는 Hermes 내장 `web_search` 와의 충돌을 피하려고 붙였다(step-19)
  pathfind_web_search: "web",
  pathfind_web_review_search: "web_review",
  pathfind_oss_search: "oss",
  pathfind_public_data_search: "public_data",
  pathfind_stats_search: "stats",
  pathfind_law_search: "law",
  web_search: "web",
  web_review_search: "web_review",
  oss_search: "oss",
  public_data_search: "public_data",
  stats_search: "stats",
  law_search: "law",
}
const FIXED_GRADE: Record<string, string> = { oss: "E2", public_data: "E1", stats: "E1", law: "E1" }
/**
 * 채널이 **반드시 그 호스트에서 와야 한다**는 표 (5차 step-19 실측).
 *
 * ⚠ hermes 경로의 `channel` 은 **모델이 스스로 붙인 이름**이라 믿을 수 없다 — 실측에서 17건 중 9건이 어긋났다.
 * KOSIS 라고 적힌 셋이 전부 웹 페이지였고(숨고·모카클래스·농민신문), 공공데이터라고 적힌 셋은 `data.seoul.go.kr`(다른 포털)이었다.
 * `local` 은 카탈로그가 결과를 준 채널을 **코드가** 붙이므로 틀릴 수가 없다. 그 비대칭을 여기서 닫는다.
 *
 * 호스트가 안 맞으면 **채널을 지운다**(등급도 같이). 틀린 `E1` 을 달아 두면 근거 등급이 거짓이 된다 —
 * 「0건이 틀린 1건보다 낫다」(step-12)와 같은 규칙이다. 웹은 아무 호스트나 올 수 있어 검사하지 않는다.
 */
/**
 * 출처가 없는 finding 을 버린다 (5차 step-18 실측).
 *
 * 실제 run 에서 모델이 **0건 검색에도 finding 을 지어냈다** — 「0건 반환 — …을 찾지 못함」을 근거로 적고 `url` 은 빈 문자열이었다.
 * `local` 경로는 카탈로그에 있는 결과만 `addFinding` 이 받아 이런 것이 애초에 못 들어오는데, hermes 경로에는 그 관문이 없었다.
 * 출처 없는 자료는 좌 패널에서 열 수도 없고 인용 배지의 근거도 못 된다 — 「못 찾았다」는 판정으로 말할 일이지 자료로 세울 일이 아니다.
 */
function hasSource(f: Finding): boolean {
  return /^https?:\/\//.test(String((f as { url?: unknown }).url ?? "").trim())
}
function normalizeHermesFinding(f: Finding): Finding {
  const raw = String((f as { channel?: unknown }).channel ?? "").trim()
  // 6차 step-16 — 모델은 **도구 앞가지 이름·채널 키·한국어 표시 이름**을 뒤섞어 적는다(라이브 완주 실측).
  // `resolveChannel` 이 셋을 다 받고, 못 알아보면 빈 문자열을 준다.
  const channel = resolveChannel(raw, TOOL_TO_CHANNEL) || (raw in FIXED_GRADE || raw === "web" || raw === "web_review" ? raw : "")
  if (!channel) {
    // ⚠ **모르는 이름을 그대로 통과시키지 않는다.** 5차는 `return f` 였고, 그래서 `channel: "웹문서"` 인 자료가
    //   7건 섰다 — 집계표에 없는 이름이라 화면에서 겉돈다. 채널을 지우면 채널 없는 웹 자료로 정상히 선다.
    const { channel: _unknown, grade: _unknownGrade, ...rest } = f as Finding & { channel?: string; grade?: string }
    return rest as Finding
  }
  const must = CHANNEL_HOST[channel]
  if (must) {
    let host = ""
    try { host = new URL(String((f as { url?: unknown }).url ?? "")).hostname } catch { /* 주소가 아니면 검사도 못 한다 */ }
    if (!hostMatchesChannel(host, must, channel)) {
      // 모델이 잘못 붙인 이름이다 — 지우고 등급도 달지 않는다. 자료 자체는 남는다(출처가 있으면 웹 자료로 선다).
      const { channel: _drop, grade: _dropGrade, ...rest } = f as Finding & { channel?: string; grade?: string }
      return rest as Finding
    }
  }
  // 6차 step-12 — **웹으로 온 것 중 후기 호스트는 후기로 올린다.** 모델이 갈래를 뭉개도(5차 실측 `web_review` 0건)
  // 호스트는 코드가 URL 에서 뽑는 값이라 틀릴 수가 없다. 반대 방향(후기 → 웹)은 하지 않는다.
  let finalChannel = channel
  if (channel === "web") {
    let host = ""
    try { host = new URL(String((f as { url?: unknown }).url ?? "")).hostname } catch { /* 주소가 아니면 그대로 */ }
    if (looksLikeReview(host)) finalChannel = "web_review"
  }
  const grade = String((f as { grade?: unknown }).grade ?? "").trim() || FIXED_GRADE[finalChannel] || ""
  return { ...f, channel: finalChannel, ...(grade ? { grade } : {}) }
}

function stagePrompt(stage: Stage, summary: string, planned: api.ChannelPlanItem[] = []): string {
  // 어느 채널을 부를지는 **코드 규칙**이 정한다(5차 step-18 · D11) — `local` 과 같은 규칙에서 나온 목록을 그대로 준다.
  // 목록이 비면(엔드포인트 실패) 종전 산문 한 줄로 돌아간다. 두 경로가 다른 곳을 보면 랜딩의 약속이 경로마다 달라진다.
  const channelLines = planned.length
    ? [
        "아래 도구로 조사합니다 — 채널마다 검색어 모양이 다르니 안내를 그대로 따릅니다.",
        ...planned.map((p) => `- ${p.tool}${p.why ? ` (이 단계에 걸린 말: ${p.why})` : ""} — 검색어: ${p.queryHint}`),
        // 6차 성능 — **한 번에 몰아 부른다.** 실측에서 한 단계가 Solar API 를 5~10회 불렀고 한 번이 1.2s~311s 다.
        // 왕복 수가 그대로 시간이라, 도구를 차례로 하나씩 부르면 그만큼 곱해진다.
        "위 도구를 **한 번의 응답에서 모두 함께** 부릅니다 — 하나 부르고 결과를 본 뒤 다음을 부르지 않습니다. 도구마다 검색어는 하나입니다.",
        "결과를 받으면 **그다음 응답에서 바로 최종 JSON** 을 냅니다. 결과가 0건인 도구는 0건이라고 적고 넘어갑니다. 도구가 준 것만 근거로 씁니다.",
        "findings 의 각 항목에는 **그 결과 항목에 적힌 channel 값을 그대로** 옮깁니다(도구 결과 JSON 의 각 항목이 자기 channel 을 들고 옵니다). 항목에 없을 때만 부른 도구 이름을 적습니다 — 웹 검색은 웹문서와 블로그·카페 후기를 함께 물어 오므로, 도구 이름으로 뭉뚱그리면 후기 갈래가 통째로 사라집니다.",
      ]
    : ["웹 검색 도구로 서로 다른 검색어 3개를 **한 번의 응답에서 함께** 써서 실제 자료를 찾아 주세요. 결과를 받으면 그다음 응답에서 바로 최종 JSON 을 냅니다."]
  return [
    `당신은 「${summary}」를 만들려는 사람의 조사 담당자입니다.`,
    `이번에 맡은 단계는 「${stage.no}. ${stage.title}」입니다. 설명: ${stage.desc}`,
    ...channelLines,
    "찾은 것만 근거로 씁니다. 못 찾은 것은 찾지 못했다고 적습니다.",
    "판정 근거는 두 자리에 나눠 냅니다 — verdictReason 에 한두 문장, 가려낸 것은 reasonPoints 배열에 2~4개. verdictLine 과 verdictReason 을 쓰면서 그 말의 근거가 된 자료를 그 문장 끝에 [n] 으로 답니다(n 은 findings 의 순서, 첫 항목이 1). 한 자료를 여러 문장에 달아도 됩니다. 문장마다 다 달지는 않습니다 — 근거를 댈 만한 문장에만 달고, 이어지는 문장이 같은 자료를 말하면 묶어서 마지막 문장에 한 번 답니다. 문장에 단 것은 citations 에도 번호와 이름으로 함께 적습니다.",
    "",
    // 6차 하이브리드 라이브 실측 — 모델이 JSON 을 답변에 적는 대신 `write_file` 로 M4 에 파일을 썼다.
    // 그래서 그 단계는 결과가 비었다(2파가 조용히 물러났고 1파 결과가 남았다 — 설계대로지만 호출은 버려졌다).
    // 산출 지시로 번역해 적는다: **이 JSON 을 본문에 적는 것이 이 단계의 끝**이라고 말한다.
    "이 JSON 을 답변 본문에 그대로 적으면 이 단계가 끝납니다 — 본문에 적힌 것만 결과로 읽힙니다.",
    "마지막 응답은 아래 모양의 JSON 한 덩어리만 내놓습니다. 설명 문장과 코드펜스는 붙이지 않습니다.",
    JSON.stringify({
      verdict: "가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 쓸 만한 자료 없음",
      // 6차 step-7 — 화면에 서는 문장은 여기서 나온다. local 경로(`server/stage.mjs`)와 **같은 계약**이라야
      // 두 경로가 같은 화면을 만든다(그 파일의 SYSTEM_PROMPT 와 짝이다 — 한쪽만 고치지 않는다).
      verdictLine: "이 단계 결과를 사람에게 알리는 한 문장. 위 verdict 와 같은 뜻이어야 하고, 이 단계에서 실제로 무엇을 찾았는지가 드러납니다. 보기는 주제가 전혀 달라 그대로 옮겨 쓸 수 없습니다 — 모양만 따릅니다. (사진 모임) 「비슷한 모임을 여는 분들이 쓰는 안내문이 이미 나와 있어요 [1][2].」 (독서 모임) 「참고할 만한 운영 방식은 있지만 [3], 모임 규칙은 직접 정하셔야 합니다.」 (반찬 가게) 「위생과 신고 절차는 법령에 정해져 있고 [2], 메뉴 구성은 직접 짜는 자리입니다.」 (자전거 수리) 「이 대목은 참고할 만한 것이 잘 안 보여 직접 만들어 가야 합니다.」 — 보기마다 [n] 이 그 말의 근거가 된 자료 바로 뒤에 붙어 있습니다. 마지막 보기처럼 근거로 댈 자료가 없으면 안 붙입니다. 찾은 것도 못 찾은 것도 **그 종류 이름으로** 말합니다 — 법령·통계·공공데이터·오픈소스·후기·웹 문서. 보기: 「신고 기준은 법령에 나와 있고, 가격은 후기 몇 건으로 감을 잡았습니다」 · 「그 대목을 다룬 공개 안내나 후기는 이번에 찾지 못했습니다」 · 「비슷한 운영을 적어 둔 블로그 글이 둘 있었습니다」. 보기마다 맺는 말이 다릅니다 — 이 단계 내용에 맞는 말로 끝냅니다",
      verdictReason: "판정 근거의 **첫 한두 문장** — 무엇을 찾았는지. 무엇을 모아 왔는지는 그 종류 이름으로 적습니다 — 법령·통계·공공데이터·오픈소스·후기·웹 문서. 읽는 사람에게 설명하는 자리라 높임말로 적고, 근거가 된 자료는 그 문장 끝에 [n] 으로 답니다",
      // ⚠ 이유의 **층위는 스키마가 담당한다**(2026-09-15). 「줄을 나눠 적어라」를 산문으로 두 번 시켰고 두 번 다 0/6 이었다
      //    — `docs/skills/pathfind.md` F-12~14 와 같은 결이다. 배열로 받고 글머리표 조립은 코드가 한다(`server/stage.mjs` 와 짝).
      reasonPoints: [{ label: "무엇에 대한 이야기인지 서너 낱말 — 보기: 위생 신고 / 가격대 / 직접 정할 것", text: "그 한 줄 설명. 근거가 된 자료는 끝에 [n] 으로 답니다" }],

      findings: [{ kind: "도구|서비스|글|저장소", name: "이름", channel: "결과를 준 도구 이름", query: "썼던 검색어", evidence: "한 줄 근거", note: "쓸 때 주의", url: "https://" }],
      // 6차 step-9 — 근거를 문장에 단다. n 은 findings 순서(첫 항목이 1)이고, 이름을 함께 적어야 코드가 대조할 수 있다.
      citations: [{ n: "자료 번호", name: "그 자료의 name 을 그대로" }],
      options: ["선택지 한 줄"],
      todos: [{ task: "할 일", owner: "가져다 씀 | 직접 함", note: "한 줄. 참고할 것을 가리킬 때는 그 종류 이름으로 적습니다 — 법령·통계·공공데이터·오픈소스·후기·웹 문서. 보기: 「법령에 적힌 신고 기준을 먼저 확인한다」" }],
    }),
  ].join("\n")
}

/**
 * 이유 문단을 **하나의 문자열로 조립한다** (2026-09-15, `server/stage.mjs` 와 같은 자리).
 *
 * 모양은 스키마(`reasonPoints`)가 담당하고 조립은 코드가 한다. 조립을 여기서 끝내는 이유는
 * 하류(저장 문자열·`groundStageCitations`·`displayStageResult`·PATH.md)가 **문자열 하나**만 보게 두기 위해서다 —
 * 계약을 한 군데도 안 늘리고 모양만 얻는 길이다.
 */
function composeReason(reason: unknown, points: unknown): string {
  const leadRaw = typeof reason === "string" ? reason.trim() : ""
  const rows = (Array.isArray(points) ? points : [])
    .map((x) => {
      const p = x as { label?: unknown; text?: unknown }
      return { label: String(p?.label ?? "").trim(), text: String(p?.text ?? "").trim() }
    })
    .filter((x) => x.text)
    .slice(0, 5)
  /**
   * ⚠ 앞 문장에 **같은 말이 두 겹으로** 선다 (2026-09-15 라이브). `reasonPoints` 를 계약에 넣자
   *   모델이 배열을 채우면서 **산문 쪽에도 같은 목록을 한 번 더** 적었다(실측 한 단계에 글머리표 8줄 — 3줄 + 4줄).
   *   금지문으로 막지 않는다(Solar 가 잘 안 지킨다 — `CLAUDE.md`). **목록이 설 자리는 하나**라고 코드가 정한다:
   *   배열이 차 있으면 앞 문장의 글머리표 줄은 그 배열이 이미 말한 것이라 뺀다.
   *   배열이 비어 있으면 **그대로 둔다** — 모델이 쓴 목록이라도 없는 것보다 낫다.
   */
  const leadLines = leadRaw.split(/\r?\n/)
  const lead = (rows.length ? leadLines.filter((l) => !/^\s*[-*•]\s+/.test(l)) : leadLines).join("\n").replace(/\n\s*\n+/g, "\n\n").trim()
  const body = rows.map((x) => (x.label ? `- **${x.label}**: ${x.text}` : `- ${x.text}`)).join("\n")
  return [lead, body].filter(Boolean).join("\n\n")
}

/** 모델이 산문·코드펜스를 섞어도 JSON 을 건져 낸다. 못 건지면 null — 호출 측이 4함수로 되돌린다. */
export function parseStageJson(output: string): Partial<Stage> | null {
  const text = String(output ?? "").trim()
  const candidates = [text]
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.push(fence[1].trim())
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])
  for (const c of candidates) {
    try {
      const o = JSON.parse(c) as Record<string, unknown>
      if (!o || typeof o !== "object") continue
      const findings = Array.isArray(o.findings) ? (o.findings as Stage["findings"]) : []
      return {
        verdict: normalizeVerdict(o.verdict),
        citations: Array.isArray(o.citations) ? o.citations : undefined,
        verdictLine: typeof o.verdictLine === "string" ? o.verdictLine : "",
        verdictReason: composeReason(o.verdictReason, o.reasonPoints),
        findings,
        options: Array.isArray(o.options) ? (o.options as string[]) : [],
        todos: Array.isArray(o.todos) ? (o.todos as Stage["todos"]) : [],
        searched: true,
      }
    } catch {
      /* 다음 후보 */
    }
  }
  return null
}

/**
 * 이벤트 한 개 → 중앙에 흐를 활동 줄 한 개. 흘릴 게 없으면 null.
 *
 * 6차 step-6 — **도구 이름을 날것으로 흘리지 않는다.** 종전에는 `pathfind_law_search · 목공 안전` 처럼
 * 내부 식별자가 그대로 화면에 섰다. 사람이 읽는 자리라 채널 이름으로 옮긴다(`법령`).
 * 모르는 도구만 종전대로 이름을 보인다 — 새 도구가 늘었을 때 **아무 말도 안 하는 것보다는 낫다**.
 */
export function activityLine(event: hermes.HermesEvent): string | null {
  if (event.event !== "tool.started") return null
  const preview = String(event.preview ?? "").replace(/\s+/g, " ").trim()
  if (!event.tool) return null
  // 6차 step-16 — Hermes 는 MCP 도구를 `mcp__<서버>__<도구>` 로 부른다(라이브 완주 실측).
  // 앞가지를 안 떼면 조회가 빗나가 **내부 식별자가 그대로 화면에 흐른다**(`mcp__pathfind_channels__pathfind_web_search · 목공`).
  const channel = TOOL_TO_CHANNEL[stripMcpPrefix(event.tool)]
  if (channel) {
    const name = CHANNEL_NAME[channel] ?? channel
    return preview ? `${name}에서 「${preview.slice(0, 40)}」로 찾는 중…` : channelLine([channel], 0)
  }
  /**
   * 우리 채널 도구가 아니면 **줄을 만들지 않는다** (6차 하이브리드 라이브 실측).
   *
   * 5차·6차는 모르는 도구 이름을 그대로 찍었고, 그래서 화면에 `tool_search 실행 중…` 이 섰다 —
   * Hermes 가 자기 안에서 쓰는 도구(`tool_search`·`read_file`·`bash` …)이지 사용자에게 뜻이 있는 이름이 아니다.
   * `mcp__` 앞가지만 떼는 것으로는 못 막는다(그 이름들엔 앞가지가 없다).
   *
   * 「0건이 틀린 1건보다 낫다」 — 모르는 것을 그럴듯하게 옮겨 적기보다 말하지 않는다.
   * 이 때문에 잠시 조용해져도 침묵 타이머가 「조금 오래 걸리는 단계입니다」로 받는다.
   */
  return null
}

export const APPROVE_LABEL = "맞아요, 이대로 조사해 주세요"
export const REVISE_LABEL = "고칠 게 있어요"

let seq = 0
const nextId = () => `m${Date.now().toString(36)}-${seq++}`

function msg(role: ChatEntry["role"], text: string, extra: Partial<ChatEntry> = {}): ChatEntry {
  return { id: nextId(), role, text, ...extra }
}

/**
 * 단계 결과 한 줄 (M5 확장 2차 step-5).
 * 본문에 **`[n]` 마커를 심는다** — 패널의 인용 배지는 마커가 있을 때만 렌더되므로(`withCitations`),
 * `citationTitles` 만 채우면 배지가 안 나온다(실측으로 좁혀 둔 것).
 * 판정 이름은 `**굵게**` 로 싸서 결과 줄이 활동 줄과 한눈에 갈리게 한다.
 * ⚠ 여기 굳는 판정은 **계약 값**이다(3차 step-1). 화면 문구(「일부만 있음」)로의 변환은 저장이 아니라
 *    렌더 시점에 `derive.displayStageResult()` 가 한다 — 저장 시점에 바꾸면 옛 세션과 두 이름으로 섞인다.
 */
/**
 * 조사 전에 **미리 깔아 두는 자리** (6차 step-3b, 2026-09-15 사용자 육안).
 *
 * 조사는 3병렬이라 **먼저 끝난 단계부터** 결과가 붙었다 — 화면에 3단계 설명이 뜨고 그 다음 1단계가 떴다
 * (사용자 지적 「순서가 뒤죽박죽이네」). 순서는 조사가 끝나는 차례가 아니라 **단계 번호**여야 한다.
 *
 * 고치는 길이 둘이었다. ⓐ 렌더에서 정렬 ⓑ **자리를 미리 깔고 그 자리를 채운다.**
 * ⓐ 는 대화가 시간순이라는 전제를 깬다(사용자 말·진행 줄까지 같이 흔들린다). ⓑ 를 골랐다 —
 * 자리가 먼저 서면 **무엇을 아직 조사 중인지도 같이 보인다**(빈 자리가 곧 진행 표시다).
 *
 * `pinned` 가 필요하다 — 이 줄은 아직 `→ **판정**` 모양이 아니라서 `App.tsx` 의 `isFoldable` 이
 * 아코디언 안으로 접어 버린다(표식이 문구보다 먼저 판정된다).
 */
function stagePendingEntry(stage: Stage): ChatEntry {
  return msg("assistant", `${stage.no}. ${stage.title} · 자료를 찾는 중…`, {
    id: stageResultId(stage.no),
    kind: "progress",
    pinned: true,
  })
}

/** 결과 줄의 **고정 id**. 2파 보강이 같은 자리를 덮는다 — 줄을 새로 달면 같은 단계가 두 번 선다. */
export function stageResultId(no: number): string {
  return `stage-result-${no}`
}
function stageResultEntry(base: Stage, filled: Stage, ground: GroundedStage): ChatEntry {
  const findings = filled.findings ?? []
  // 6차 step-9 — 순서는 `groundStageCitations` 가 정한다(본문에 나온 차례 → 안 쓰인 것). 상한 3 은 없앴다.
  const found = ground.order.map((i) => findings[i]).filter(Boolean)
  // 결과 줄 끝 마커는 **본문에 안 달린 것만** 받는다. 본문에 달린 것은 그 문장 뒤에 이미 서 있다.
  const marks = found
    .map((_, i) => (i < ground.citedInBody ? "" : `[${i + 1}]`))
    .join("")
  // 채널별 자료 수를 결과 줄에 붙인다(2026-09-14) — 「웹 2 · 법령 1」. 폴더를 열지 않아도 어느 채널이 도왔는지 보인다.
  const tally = channelTally(filled.findings)
  const text = `${base.no}. ${base.title} → **${filled.verdict ?? "선례를 못 찾음"}**${tally ? ` (${tally})` : ""}${marks ? ` ${marks}` : ""}`
  return msg("assistant", text, {
    // ⚠ id 는 **단계 번호에서 나온다**(자동 증가가 아니다) — 2파 보강이 `replaceMessage` 로 이 줄을 갈아 끼운다.
    id: stageResultId(base.no),
    kind: "progress",
    citationTitles: found.length ? found.map((f) => String(f.name ?? "")) : undefined,
    // 배지 → 좌 패널 자료 문서 연결은 id 로(4차 step-1). `derive.findingToSourceDoc` 의 id 규약과 같은 자리다.
    // ⚠ id 는 **원래 `findings` 인덱스**로 만든다(`derive.findingToSourceDoc` 규약). 배지 번호 n → `order[n-1]` → 그 인덱스.
    citationIds: found.length ? ground.order.map((oi) => `stage-${base.no}-finding-${oi}`) : undefined,
  })
}

export function useFlow(session: Session, dispatch: (a: Action) => void) {
  // 상태는 비동기 중에 낡는다. 진행 중 루프가 읽는 값은 ref 로 들고 간다.
  const sessionRef = useRef(session)
  sessionRef.current = session
  const researchGeneration = useRef(0)
  const planningLock = useRef(false)
  const invalidateResearch = useCallback(() => {
    researchGeneration.current += 1
    planningLock.current = false
  }, [])

  const patch = useCallback((p: Partial<Session>) => dispatch({ type: "patch", patch: p }), [dispatch])
  const add = useCallback((m: ChatEntry) => dispatch({ type: "addMessage", message: m }), [dispatch])
  /**
   * 단계 결과를 **미리 깔아 둔 자리에** 넣는다. 자리가 없으면(옛 세션 이어받기·hermes 단독 경로) 그냥 붙인다.
   * ⚠ `pinned` 를 **지운다** — 자리 표시용 표식이고, 결과 줄은 제 모양(`→ **판정**`)으로 이미 밖에 선다.
   */
  const putStageResult = useCallback(
    (entry: ChatEntry) => {
      const has = sessionRef.current.messages.some((m) => m.id === entry.id)
      if (has) dispatch({ type: "replaceMessage", id: entry.id, message: { ...entry, pinned: undefined } })
      else dispatch({ type: "addMessage", message: entry })
    },
    [dispatch],
  )

  /**
   * 조사 끝난 뒤 로드맵 대화 (4차 step-6, 사용자 피드백 H6 — 「말 걸면 다시 조사할까요 승인 요청이 나오는 문제」).
   * `phase === "ready"` 의 입력은 인터뷰(`grill`)가 아니라 여기로 온다 — 입구가 셋(`handleSend`·`handleSuggestion`·`sendAnswer`)이라
   * `sendAnswer` 도 머리에서 이리로 넘긴다. 답변은 `kind: "chat"` + 후속 칩(`suggestions`) + 인용(`citationTitles`·`citationIds`).
   * 근거 없음(「이번 조사에는 없습니다」)은 서버가 코드로 판정해 `answer` 에 이미 담겨 온다.
   */
  const askRoadmap = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text) {
        patch({ error: "한 글자 이상 적어 주세요." })
        return
      }
      const s = sessionRef.current
      if (s.busy) return
      // 최근 대화만 — 진행 줄·인터뷰 질문은 빼고 사람 말과 답변(대화·노드 설명)만 6턴
      const history = s.messages
        .filter((m) => m.role === "user" || m.kind === "chat" || m.kind === "node-explain")
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }))
      add(msg("user", text))
      patch({ busy: true, error: null })
      try {
        const r = await api.chat({
          summary: s.summary,
          bigPicture: s.bigPicture,
          stages: s.stages.filter((x) => x.status === "done").map((x) => x.stage),
          history: [...history, { role: "user", text }],
        })
        add(
          msg("assistant", r.answer, {
            kind: "chat",
            suggestions: r.followups,
            citationTitles: r.citationTitles.length ? r.citationTitles : undefined,
            citationIds: r.citationIds.length ? r.citationIds : undefined,
          }),
        )
        patch({ busy: false })
      } catch (e) {
        patch({ busy: false, error: (e as Error).message })
      }
    },
    [add, patch],
  )

  /** 인터뷰 한 턴. 첫 턴은 답변이 곧 초기 아이디어다. */
  const sendAnswer = useCallback(
    async (raw: string) => {
      // 세 번째 입구 — 조사가 끝났으면 인터뷰가 아니라 로드맵 대화다(4차 step-6). 여기서 안 막으면 승인 게이트가 재발한다(H6).
      if (sessionRef.current.phase === "ready") return askRoadmap(raw)
      const answer = raw.trim()
      if (!answer) {
        patch({ error: "한 글자 이상 적어 주세요." })
        return
      }
      const s = sessionRef.current
      if (s.busy) return

      add(msg("user", answer))
      patch({ busy: true, error: null })

      const history = s.pending
        ? [
            ...s.history,
            {
              questionTitle: s.pending.questionTitle,
              questionBody: s.pending.questionBody,
              suggestion: s.pending.suggestion,
              exampleButtons: s.pending.exampleButtons,
              answer,
            },
          ]
        : s.history

      try {
        const r = await api.grill(
          s.turnCount === 0 && !s.pending
            ? { question: answer, history: [], turnCount: 0 }
            : { answer, history, turnCount: s.turnCount },
        )

        if (r.done) {
          const summary = (r.summary ?? "").trim()
          add(msg("assistant", `정리했습니다. 이게 맞나요?\n\n${summary}`, { kind: "summary-approval" }))
          // `opening` 은 이 응답에 얹혀 온다 — 조사 시작 줄을 위해 새 호출을 하지 않는다(5차 step-7)
          patch({ busy: false, phase: "confirm", summary, opening: (r.opening ?? "").trim() || undefined, history, turnCount: r.turnCount, pending: null })
          return
        }

        add(
          // 추천은 산문 줄이 아니라 **칩**이 든다(5차 step-6 · D3) — 추천 칩이 맨 위에 서고 표시가 붙는다.
          // `r.suggestion` 은 계약에 그대로 남지만 화면에는 쓰지 않는다(옛 저장본의 질문 본문은 그대로 산다).
          msg("assistant", `${r.questionTitle}\n\n${r.questionBody}`, {
            kind: "question",
          }),
        )
        patch({ busy: false, pending: r, history, turnCount: r.turnCount })
      } catch (e) {
        patch({ busy: false, error: (e as Error).message })
      }
    },
    [add, patch, askRoadmap],
  )

  /**
   * 단계가 끝나는 순간 소주제 트리를 채운다(4차 보강 step-13). 두 경로(4함수·Hermes) 공통. 완주를 막지 않는다 —
   * 결과가 오면 그 자리에서 마인드맵이 깊어지고, 실패하면 outline 없이 지금 모양 그대로다.
   */
  const outlineTried = useRef(new Set<number>())
  const fillOutline = useCallback(
    async (index: number, stage: Stage) => {
      const generation = researchGeneration.current
      outlineTried.current.add(index)
      try {
        const r = await api.outline({ stage, summary: sessionRef.current.summary })
        if (generation === researchGeneration.current && !r.degraded) dispatch({ type: "setStage", index, slot: { outline: r.topics } })
      } catch {
        /* outline 없이 간다 */
      }
    },
    [dispatch],
  )
  /**
   * `done` 인데 outline 이 없는 단계를 채운다 — 조사 중 새로고침으로 응답이 페이지와 함께 사라진 단계(실측: 5단계 중 1개),
   * 그리고 이 기능 전에 만든 옛 세션. 페이지당 단계마다 한 번만 시도한다(실패하면 3층 그대로).
   */
  const backfillOutlines = useCallback(() => {
    const s = sessionRef.current
    s.stages.forEach((x, i) => {
      if (x.status === "done" && x.outline === undefined && !outlineTried.current.has(i)) void fillOutline(i, x.stage)
    })
  }, [fillOutline])

  /** 단계 하나를 채운다. 실패해도 그 단계만 실패로 남기고 나머지를 죽이지 않는다. */
  const runStage = useCallback(
    async (index: number, summary: string, stageInput?: Stage) => {
      const generation = researchGeneration.current
      const current = () => generation === researchGeneration.current
      // ⚠ 승인 직후에는 `patch({stages})` 가 아직 커밋되지 않아 ref 가 비어 있다.
      //    그래서 첫 실행은 단계를 인자로 받는다 — ref 만 믿으면 전 단계가 조용히 건너뛰어진다(실측).
      const slot = sessionRef.current.stages[index]
      const base = stageInput ?? slot?.stage
      if (!base || slot?.status === "done") return
      dispatch({ type: "setStage", index, slot: { status: "running" } })
      // 4함수 경로도 지금 무엇을 하는지 말한다 — 이 줄이 없으면 조사 중 화면이 침묵한다(문구 정본 §2-5).
      // 6차 step-6 — **어디를 뒤지는지**까지 말한다. 채널 계획은 코드 규칙이라 모델을 안 부르고 빨리 온다.
      // 못 받아도 조사는 그대로 간다(실패는 빈 배열 → 일반 문구). 이 줄 때문에 단계가 막히면 안 된다.
      const planned = await api.channelPlan({ stage: base }).then((r) => r.planned.map((p) => p.channel)).catch(() => [])
      if (!current()) return
      add(msg("assistant", stageSearchLine(base.no, base.title, planned, index), { kind: "progress" }))
      try {
        const r = await api.stage({ stageIndex: index, stage: base, summary })
        if (!current()) return
        // 서버가 산문 판정(「리소스 탐색 중」)을 돌려주는 일이 있다(3차 step-1 실측). Hermes 경로의
        // `parseStageJson` 처럼 여기서도 계약 4종으로 접어 저장한다 — 안 접으면 말풍선은 산문, 점은 「못 찾음」으로 갈린다.
        const raw = { ...base, ...r.stage, verdict: normalizeVerdict(r.stage.verdict) }
        // 6차 step-9 — 본문 마커를 **자료 목록에 맞춰 다시 매긴 뒤** 저장한다. 저장본이 화면과 같아야
        // 새로고침·재접속에서 배지가 그대로 선다(렌더 때마다 다시 매기면 회차마다 번호가 흔들린다).
        const ground = groundStageCitations(raw)
        const filled = { ...raw, verdictLine: ground.verdictLine, verdictReason: ground.verdictReason }
        dispatch({ type: "setStage", index, slot: { status: "done", stage: filled, error: undefined } })
        putStageResult(stageResultEntry(base, filled, ground))
        void fillOutline(index, filled)
      } catch (e) {
        if (!current()) return
        if (e instanceof api.RateLimited) throw e // 풀이 강등 신호로 쓴다
        dispatch({ type: "setStage", index, slot: { status: "failed", error: (e as Error).message } })
        /**
         * ⚠ 미리 깐 자리에 **「찾는 중…」이 굳는 것을 막는다.** 그 문구는 상태라서, 조사가 끝났는데도
         *   남아 있으면 화면이 거짓말을 한다(2026-09-15 사용자 지적으로 한 번 고친 적 있는 자리다).
         */
        dispatch({
          type: "replaceMessage",
          id: stageResultId(base.no),
          message: { text: `${base.no}. ${base.title} · 이 단계는 자료를 모으지 못했습니다`, pinned: true },
        })
      }
    },
    [add, dispatch, patch, fillOutline, putStageResult],
  )

  /**
   * Hermes 경로 안에서 쓰는 4함수 폴백. 풀이 없으므로 429 를 여기서 직접 삼키고(순차라 이미 느리다),
   * 단계가 실패로 끝나면 그 한 줄을 남긴다 — 침묵하지 않는다(문구 정본 §2-5).
   */
  const runStageLocal = useCallback(
    async (index: number, summary: string, base: Stage) => {
      try {
        await runStage(index, summary, base)
      } catch {
        patch({ degraded: true })
        add(msg("assistant", BUSY_LINE, { kind: "progress" }))
        try {
          await runStage(index, summary, base)
        } catch {
          dispatch({ type: "setStage", index, slot: { status: "failed", error: "요청이 몰렸습니다" } })
        }
      }
      if (sessionRef.current.stages[index]?.status === "failed") {
        add(msg("assistant", STAGE_FAILED_LINE, { kind: "progress" }))
      }
    },
    [add, dispatch, patch, runStage],
  )

  /**
   * 단계 하나를 **Hermes run 으로** 조사한다. 이 함수가 이 milestone 의 심장이다 —
   * 도는 동안 중앙에 활동이 한 줄씩 흐르고(검색어 그대로), 끝나면 그 자리가 결과로 채워진다.
   * JSON 을 못 건지면 같은 단계를 4함수로 되돌려 완주를 지킨다(하이브리드).
   */
  const runStageViaHermes = useCallback(
    async (
      index: number,
      summary: string,
      stageInput?: Stage,
      resume?: { runId: string; cursor: number },
      /**
       * **2파 보강 모드** (6차 하이브리드 ⓐ). 이미 `done` 인 단계를 모델에게 다시 캐 오게 한다.
       * 평소 모드와 셋이 다르다:
       *   ① 끝난 단계에서 물러나지 않는다 ② 화면을 `running` 으로 되돌리지 않는다(사용자가 읽던 답이 사라진다)
       *   ③ 실패해도 4함수로 안 내려간다 — 1파 결과가 이미 자리에 있다.
       */
      reinforce = false,
    ) => {
      const slot = sessionRef.current.stages[index]
      const base = stageInput ?? slot?.stage
      if (!base || (slot?.status === "done" && !reinforce)) return
      if (!reinforce) dispatch({ type: "setStage", index, slot: { status: "running" } })

      // 새로고침으로 돌아왔는데 그 run 이 아직 서버에서 돌고 있으면 **새 run 을 만들지 않고 그 run 에 다시 붙는다**.
      let runId: string
      if (resume) {
        runId = resume.runId
        add(msg("assistant", `${base.no}. ${base.title} · 진행 중이던 조사에 다시 붙었습니다.`, { kind: "progress" }))
      } else
      try {
        // 규칙이 고른 채널을 먼저 받아 프롬프트에 싣는다 — 실패해도 조사는 종전 산문으로 이어진다(5차 step-18)
        const planned = await api.channelPlan({ stage: base }).then((r) => r.planned).catch(() => [])
        const started = await hermes.startRun(stagePrompt(base, summary, planned))
        runId = started.runId
      } catch (e) {
        // 게이트웨이가 run 을 안 받았다 — 이 단계는 4함수로 간다.
        if (e instanceof hermes.GatewayBusy) {
          patch({ degraded: true })
          add(msg("assistant", BUSY_LINE, { kind: "progress" }))
        }
        if (!reinforce) await runStageLocal(index, summary, base)
        return
      }
      patch({ runId, runStatus: "running", runCursor: resume?.cursor ?? 0 })
      if (!resume) add(msg("assistant", `${base.no}. ${base.title} · 조사를 시작합니다.`, { kind: "progress" }))

      const finished = await new Promise<hermes.HermesEvent | null>((resolve) => {
        // 스트림이 영영 조용해도 이 단계는 끝난다 — 시간이 지나면 폴링 결과로 판정하고 내려간다.
        const hardStop = setTimeout(() => resolve(null), STAGE_TIMEOUT_MS)
        let quiet: ReturnType<typeof setTimeout> | null = null
        let quietShown = false
        const bumpQuiet = () => {
          if (quiet) clearTimeout(quiet)
          quiet = setTimeout(() => {
            if (quietShown) return
            quietShown = true
            // 2파 보강 중에는 이미 「조사를 마쳤습니다」가 지나간 뒤다 — 같은 문구를 쓰면 답이 아직 없는 것처럼 읽힌다.
            add(
              msg(
                "assistant",
                reinforce ? "이 단계는 좀 더 뒤져 보는 중입니다." : "조금 오래 걸리는 단계입니다. 계속 기다리는 중이에요.",
                { kind: "progress" },
              ),
            )
          }, QUIET_MS)
        }
        bumpQuiet()
        hermes.streamEvents(runId, {
          cursor: resume?.cursor ?? 0,
          onEvent: (event, cursorNow) => {
            patch({ runCursor: cursorNow })
            bumpQuiet()
            const line = activityLine(event)
            if (line) add(msg("assistant", line, { kind: "progress" }))
            // 좌 카드의 「조사 중…」도 같이 살아 있어야 한다 — 검색 횟수와 마지막 검색어를 실어 준다.
            if (event.event === "tool.started" && event.tool === "web_search") {
              const prev = sessionRef.current.runActivity
              patch({
                runActivity: {
                  stageNo: base.no,
                  searches: (prev?.stageNo === base.no ? prev.searches : 0) + 1,
                  lastQuery: String(event.preview ?? "").trim(),
                },
              })
            }
            if (event.event?.startsWith("run.") && hermes.isTerminal(event.event.slice(4))) {
              if (quiet) clearTimeout(quiet)
              clearTimeout(hardStop)
              resolve(event)
            }
          },
          onClose: (reason) => {
            if (quiet) clearTimeout(quiet)
            if (reason !== "done") {
              clearTimeout(hardStop)
              resolve(null)
            }
          },
        })
      })

      // 스트림을 놓쳤어도 결과는 폴링으로 회수한다.
      let output = finished?.output ?? ""
      let status = finished?.event?.slice(4) ?? ""
      if (!output) {
        try {
          const state = await hermes.pollRun(runId)
          output = state.output ?? ""
          status = state.status
        } catch {
          /* 아래에서 4함수로 되돌린다 */
        }
      }
      patch({ runStatus: (status || "completed") as Session["runStatus"], runId: null, runActivity: null })

      const parsed = status === "completed" ? parseStageJson(output) : null
      if (!parsed) {
        // 보강이 실패한 것은 사용자에게 사건이 아니다 — 1파 결과가 그대로 자리에 있다. 조용히 물러난다.
        if (reinforce) return
        // 왜 떨어졌는지를 말한다 — 연결이 끊긴 것과 응답을 못 읽은 것은 사용자에게 다른 사건이다.
        add(
          msg(
            "assistant",
            status === "completed"
              ? `${base.no}. ${base.title} · 결과를 읽지 못해 다시 조사합니다.`
              : `${base.no}. ${base.title} · 연결이 끊겨 이어서 조사합니다. 지금까지 조사한 결과는 그대로 있습니다.`,
            { kind: "progress" },
          ),
        )
        await runStageLocal(index, summary, base)
        return
      }
      // 도구 이름(`web_search`)으로 온 채널을 앱의 채널 키(`web`)로 되돌린다 — 좌 패널·결과 줄 집계가 local 과 같은 모양이 되게(5차 step-18).
      // 등급은 서버가 매기는 값이라 hermes 결과에는 없다. 채널이 정해 주는 고정 등급만 채우고, 웹은 호스트를 모르므로 비워 둔다.
      const raw = { ...base, ...parsed, findings: (parsed.findings ?? []).map(normalizeHermesFinding).filter(hasSource) }
      // ⚠ **거른 뒤에 다시 매긴다.** 모델은 거르기 전 목록을 보고 번호를 적었는데 위에서 `hasSource`·채널 대조가
      //   자료를 걷어냈다(5차 실측 17건 중 9건). 그 순서 그대로 두면 배지가 다른 자료를 연다.
      const ground = groundStageCitations(raw)
      const filled = { ...raw, verdictLine: ground.verdictLine, verdictReason: ground.verdictReason }

      if (reinforce) {
        // 2파는 **더 나을 때만** 덮는다. 같거나 못하면 1파를 그대로 둔다 —
        // 사용자가 이미 읽은 답이 뒤로 가는 것은 느린 것보다 나쁘다(`derive.isBetterStage` 주석).
        const prev = sessionRef.current.stages[index]?.stage
        if (!prev || !isBetterStage(filled, prev)) return
        const note = reinforceNote(prev, filled)
        dispatch({ type: "setStage", index, slot: { status: "done", stage: filled, error: undefined } })
        // 결과 줄은 **새로 달지 않고 갈아 끼운다** — 같은 단계가 대화에 두 번 서면 어느 것이 정본인지 안 읽힌다.
        const next = stageResultEntry(base, filled, ground)
        dispatch({ type: "replaceMessage", id: stageResultId(base.no), message: next })
        // 판정이 뒤집힌 것은 사용자가 이미 읽고 판단한 것이 바뀌는 자리다 — 접히면 안 된다.
        if (note) add(msg("assistant", note, { kind: "progress", pinned: true }))
        void fillOutline(index, filled)
        return
      }

      dispatch({ type: "setStage", index, slot: { status: "done", stage: filled, error: undefined } })
      const top = (filled.findings ?? []).slice(0, 2)
      for (const f of top) add(msg("assistant", `${f.name} · ${f.evidence}`, { kind: "progress" }))
      add(stageResultEntry(base, filled, ground))
      void fillOutline(index, filled)
    },
    [add, dispatch, patch, runStage, runStageLocal, fillOutline],
  )

  /**
   * ── 2파: 약한 단계만 Hermes 가 다시 캐 온다 (6차 하이브리드 ⓐ) ──────────────────────────────
   *
   * 1파가 끝나 화면이 `ready` 가 된 **뒤에** 돈다 — 사용자는 이미 답을 다 읽을 수 있고 앱을 쓸 수 있다.
   * 이 구간에 흐르는 것은 Hermes 의 **실제 검색 활동 줄**(`3. 재료 구하기 · 국가법령정보에서 「…」 찾는 중…`)이라
   * 「에이전트가 뒤에서 더 캐온다」가 말이 아니라 화면으로 선다.
   *
   * 전 단계를 다시 돌리지 않는 이유는 비용이다 — 단계마다 Solar 를 5~10회 더 부른다.
   * 고르는 기준은 `derive.needsReinforce`(자료 0건 · 판정이 못 섰음 · 등급 높은 채널이 하나도 없음)이고,
   * 덮는 기준은 `derive.isBetterStage` 다 — **더 나을 때만** 갈아 끼운다.
   *
   * 게이트웨이가 꺼져 있으면 여기서 조용히 끝난다. **그것이 정상 동작이다** — 1파가 이미 답을 다 채웠다.
   */
  const reinforceWithHermes = useCallback(
    async (summary: string) => {
      const gateway = await hermes.health().catch(() => ({ enabled: false }))
      if (!gateway.enabled) return
      const targets = sessionRef.current.stages
        .map((x, i) => ({ x, i }))
        .filter(({ x }) => x.status === "done" && needsReinforce(x.stage))
      if (!targets.length) return

      patch({ reinforcing: true, researchPath: "hermes" })
      add(
        msg(
          "assistant",
          `자료가 얇은 단계 ${targets.length}개를 더 찾아보고 있습니다. 지금 보시는 결과는 그대로 쓰셔도 됩니다.`,
          // ⚠ `pinned` 가 있어야 「조사 과정」 아코디언 **밖**에 남는다(라이브 실측 — 없으면 접혀서,
          //    「조사를 마쳤습니다」 뒤에 활동 줄이 계속 흐르는 까닭을 사용자가 못 읽는다).
          { kind: "progress", pinned: true },
        ),
      )
      try {
        await api.runPool(
          targets.map((t) => t.i),
          STAGE_CONCURRENCY,
          (i) => runStageViaHermes(i, summary, sessionRef.current.stages[i]?.stage, undefined, true),
          () => patch({ degraded: true }),
        )
      } finally {
        patch({ reinforcing: false, runActivity: null })
      }
      add(msg("assistant", "추가 조사를 마쳤습니다.", { kind: "progress", pinned: true }))
    },
    [add, patch, runStageViaHermes],
  )

  /** 승인 뒤에만 불린다: 골격 → 단계 리서치 → 완료. */
  const startResearch = useCallback(async (onApproved?: () => void) => {
    const s0 = sessionRef.current
    if (planningLock.current || s0.busy || s0.phase !== "confirm" || !s0.summary) return
    planningLock.current = true
    const generation = ++researchGeneration.current
    const current = () => researchGeneration.current === generation
    const summary = s0.summary
    const retrying = s0.planningAttempt?.approved && s0.planningAttempt.summary === summary
    if (!retrying) {
      onApproved?.()
      add(msg("user", APPROVE_LABEL))
    }
    // 조사 시작 줄 — 인터뷰 마지막 응답이 지어 준 한 줄, 없으면 고정 문장(5차 step-7).
    // ⚠ `pinned` 가 있어야 「조사 과정」 아코디언 밖에 남는다 — 모델이 지은 문구는 `ALWAYS_VISIBLE` 허용목록에 걸릴 수 없다.
    if (!retrying) add(msg("assistant", "실행 순서와 먼저 해 본 사례를 찾아 단계를 정하고 있습니다.", { kind: "progress", pinned: true }))
    const planningAttempt = { approved: true as const, summary, status: "pending" as const }
    sessionRef.current = { ...s0, busy: true, phase: "skeleton", planningAttempt }
    patch({ busy: true, phase: "skeleton", error: null, planningAttempt })

    let slots: StageSlot[]
    try {
      const r = await api.pathfind({ summary })
      if (!current()) return
      slots = r.bigPicture.stages.map((stage) => ({ status: "pending" as const, stage }))
      /**
       * **단계 설명 파트** (6차 step-3b, 2026-09-15 사용자 육안 —
       * 「승인한 이후에 그 단계에 대한 설명 파트가 필요해. 지금은 바로 몇 단계 설명이 튀어나오네」).
       *
       * 종전에는 「단계 5개로 나눴습니다」 한 줄 뒤에 곧바로 **어느 단계인지 모르는 결과**가 떨어졌다.
       * 무엇을 어떤 차례로 볼지 먼저 펼쳐 놓고, 그 다음에 조사 상태가 이어져야 읽는 순서와 맞는다.
       *
       * 굵은 글씨·목록을 쓰는 이유는 이것이 **훑는 글**이기 때문이다(사용자 지적 「마크다운 문법들 활용해서
       * 가독성 늘릴 필요가 있어」). 설명은 모델이 이미 지은 `stage.desc` 를 옮길 뿐 **새로 짓지 않는다.**
       */
      const plan = r.bigPicture.stages
        .map((st) => `- **${st.no}. ${st.title}**${String(st.desc ?? "").trim() ? ` · ${String(st.desc).trim()}` : ""}`)
        .join("\n")
      add(
        msg(
          "assistant",
          `${r.bigPicture.intro}\n\n${planningExplanation(r.bigPicture)}\n\n**단계 ${slots.length}개로 나눴습니다.** 단계마다 웹·후기·국가통계·법령 같은 곳을 뒤져서, 이미 나와 있어 가져다 쓸 것과 직접 만들어야 할 것을 가립니다.\n\n${plan}`,
          { kind: "progress", pinned: true },
        ),
      )
      patch({ bigPicture: r.bigPicture, stages: slots, phase: "researching", expandedIds: ["root"], planningAttempt: { ...planningAttempt, status: "succeeded" } })
      // 결과가 설 **자리를 단계 번호 순서로 미리 깐다** — 먼저 끝난 단계가 순서를 앞지르지 않게(`stagePendingEntry` 주석).
      for (const st of r.bigPicture.stages) add(stagePendingEntry(st))
    } catch (e) {
      if (current()) {
        planningLock.current = false
        const failedAttempt = { ...planningAttempt, status: "failed" as const }
        sessionRef.current = { ...sessionRef.current, busy: false, phase: "confirm", planningAttempt: failedAttempt }
        patch({ busy: false, phase: "confirm", error: (e as Error).message, planningAttempt: failedAttempt })
      }
      return
    }

    /**
     * ── 1파: 빠른 경로로 **답을 다 채운다** (6차 하이브리드 ⓐ) ────────────────────────────────
     *
     * 5차까지는 게이트웨이가 살아 있으면 조사 전체를 Hermes 가 돌았다. 그런데 실측이 이랬다 —
     * local 7단계 **~2분**, hermes 7단계 **271초**(성능 3종 적용 후). 그러면서 hermes 가 더 나은 점은
     * 작다: 판정·문장·할 일·인용은 **두 경로 모두 Solar 가 쓰고** 채널 고르기는 5차에 이미 코드 규칙으로
     * 옮겼다. 남는 차이는 검색어를 누가 짓느냐와, 기다리는 동안 무엇이 보이느냐뿐이다.
     *
     * 그래서 빠른 쪽으로 먼저 끝까지 채운다. 여기서 화면은 **완성**된다 — 게이트웨이가 죽어 있어도
     * 사용자 경험이 달라지지 않는다는 뜻이고, 그게 이 순서를 고른 이유다(폴백이 사고가 아니게 된다).
     */
    patch({ researchPath: "local" })
    await api.runPool(
      slots.map((_, i) => i),
      STAGE_CONCURRENCY,
      (i) => current() ? runStage(i, summary, slots[i].stage) : Promise.resolve(),
      () => {
        if (!current()) return
        patch({ degraded: true })
        add(msg("assistant", "요청이 몰려 한 번에 하나씩 조사하도록 속도를 낮췄습니다. 결과는 그대로 쌓입니다.", { kind: "progress" }))
      },
    )

    if (!current()) return
    planningLock.current = false
    const after = sessionRef.current
    const failed = after.stages.filter((x) => x.status === "failed").length
    add(
      msg(
        "assistant",
        failed
          ? `🛠️ 조사를 마쳤습니다! ${after.stages.length - failed}개 단계가 채워졌고 ${failed}개는 실패했습니다. 오른쪽 마인드맵에서 궁금한 것을 누르면 설명해 드려요.`
          : "🛠️ 조사를 마쳤습니다! 오른쪽 마인드맵에서 궁금한 것을 누르면 설명해 드려요.",
        { kind: "progress" },
      ),
    )
    patch({ busy: false, phase: "ready" })

    // 화면은 여기서 이미 완성이다. 아래는 **덤**이라 실패해도 사용자에게 사건이 아니다.
    void reinforceWithHermes(summary)
  }, [add, patch, runStage, reinforceWithHermes])

  /**
   * 새로고침으로 끊긴 조사를 이어 받는다. 저장본은 `running` 을 `pending` 으로 되돌려 두므로
   * 남은 `pending`·`failed` 만 다시 돌리면 된다(이미 끝난 단계는 그대로 쓴다).
   */
  const resumeResearch = useCallback(async () => {
    const s = sessionRef.current
    if (s.busy || s.phase !== "researching") return
    const todo = s.stages.map((x, i) => ({ x, i })).filter(({ x }) => x.status !== "done")
    if (!todo.length) {
      patch({ phase: "ready" })
      return
    }
    patch({ busy: true, error: null })
    add(msg("assistant", `이어서 조사합니다. 남은 단계 ${todo.length}개.`, { kind: "progress" }))

    /**
     * 새로고침 시점에 돌고 있던 Hermes run 이 **서버에서 아직 살아 있으면** 새로 시작하지 않고 그 run 에 다시 붙는다.
     * 하이브리드에서 이 경우는 **2파가 끊긴 것**이다 — 1파는 이 창의 자바스크립트가 돌리므로 서버에 run 을 안 남긴다.
     * 그래서 다시 붙는 것도 보강 모드다: 이미 자리에 있는 1파 결과를 더 나을 때만 덮는다.
     */
    let resume: { runId: string; cursor: number } | undefined
    if (s.runId) {
      try {
        const state = await hermes.pollRun(s.runId)
        if (!hermes.isTerminal(state.status)) resume = { runId: s.runId, cursor: s.runCursor }
      } catch {
        /* 사라진 run — 없던 것으로 친다 */
      }
    }
    if (resume) {
      const at = todo.find(({ x }) => x.status !== "done") ?? todo[0]
      if (at) await runStageViaHermes(at.i, s.summary, at.x.stage, resume, at.x.status === "done")
    }

    // 남은 단계는 1파(빠른 경로)로 채운다 — 시작할 때와 같은 순서다.
    patch({ researchPath: "local" })
    const rest = sessionRef.current.stages.map((x, i) => ({ x, i })).filter(({ x }) => x.status !== "done")
    if (rest.length) {
      await api.runPool(
        rest,
        STAGE_CONCURRENCY,
        ({ x, i }) => runStage(i, s.summary, x.stage),
        () => {
          patch({ degraded: true })
          add(msg("assistant", "요청이 몰려 한 번에 하나씩 조사하도록 속도를 낮췄습니다.", { kind: "progress" }))
        },
      )
    }
    add(msg("assistant", "🛠️ 조사를 마쳤습니다! 오른쪽 마인드맵에서 궁금한 것을 누르면 설명해 드려요.", { kind: "progress" }))
    patch({ busy: false, phase: "ready" })
    void reinforceWithHermes(s.summary)
  }, [add, patch, runStage, runStageViaHermes, reinforceWithHermes])

  /** 요약을 고치겠다 — 인터뷰로 되돌린다. */
  const reviseSummary = useCallback(() => {
    invalidateResearch()
    add(msg("user", REVISE_LABEL))
    add(msg("assistant", "어디를 고칠까요? 바꿀 내용을 적어 주세요.", { kind: "question" }))
    patch({ phase: "interview", pending: null, error: null, busy: false, planningAttempt: undefined })
  }, [add, patch, invalidateResearch])

  /** 목표 흐름 5 — 노드 클릭이 곧 중앙 대화다. */
  const explainNode = useCallback(
    async (node: { id: string; label: string }, stageNo: number | null) => {
      const s = sessionRef.current
      if (s.busy) return
      const slot = stageNo == null ? null : s.stages.find((x) => x.stage.no === stageNo) ?? null

      add(msg("user", `「${node.label}」이 뭔가요?`))
      patch({ busy: true, error: null, selectedId: node.id })
      // 진한 바탕은 「지금 이 노드를 설명하는 중」 신호다 — 답이 오면(실패해도) 원래 색으로 돌아온다(4차 보강 step-8a, H7).
      try {
        const r = await api.explain({ node, stage: slot?.stage ?? null, summary: s.summary })
        // 후속 칩은 그 노드 것(4차 보강 2 step-19, H16) — 서버가 안 주면 App 이 기본 3 으로 채운다
        add(msg("assistant", r.explanation, { kind: "node-explain", citationTitles: r.citationTitles, citationIds: r.citationIds, suggestions: r.followups?.length ? r.followups : undefined }))
        patch({ busy: false, selectedId: null })
      } catch (e) {
        patch({ busy: false, error: (e as Error).message, selectedId: null })
      }
    },
    [add, patch],
  )

  /** 목표 흐름 6 — ROADMAP.md. PNG 는 마인드맵 부품이 자체 버튼으로 낸다. */
  const buildRoadmap = useCallback(async () => {
    const s = sessionRef.current
    if (!s.bigPicture || s.exportState.busy) return null
    patch({ exportState: { ...s.exportState, busy: true } })
    try {
      const r = await api.handoff({
        bigPicture: s.bigPicture,
        stages: s.stages.filter((x) => x.status === "done").map((x) => x.stage),
        summary: s.summary,
      })
      patch({ exportState: { roadmapMarkdown: r.handoffMarkdown, title: r.title, busy: false } })
      return r
    } catch (e) {
      patch({ exportState: { ...sessionRef.current.exportState, busy: false }, error: (e as Error).message })
      return null
    }
  }, [patch])

  const retry = useCallback(() => {
    const s = sessionRef.current
    patch({ error: null })
    if (s.phase === "confirm" && s.planningAttempt?.status === "failed") {
      void startResearch()
    } else if (s.phase === "researching" || s.phase === "ready") {
      const idx = s.stages.findIndex((x) => x.status === "failed" || x.status === "pending")
      if (idx >= 0) void runStage(idx, s.summary)
    }
  }, [patch, runStage, startResearch])

  return { invalidateResearch, sendAnswer, askRoadmap, startResearch, resumeResearch, reviseSummary, explainNode, buildRoadmap, retry, backfillOutlines }
}
