/**
 * 서버 호출 층. 계약은 `pathfind-web/docs/api-contract.md` 가 소유한다.
 * 4함수(`grill`·`pathfind`·`stage`·`handoff`)는 dev 서버가 프로덕션으로 릴레이하고,
 * `explain` 만 로컬 미들웨어가 받는다(`server/explain.mjs`).
 */
import type { BigPicture, Finding, GrillResponse, GrillTurn, OutlineTopic, Stage } from "@/state/types"
import { DEMO, playback } from "@/lib/demo-player"

/** 429 를 만났을 때만 던지는 오류 — 호출 측이 동시 실행을 낮추는 신호로 쓴다. */
export class RateLimited extends Error {
  constructor() {
    super("요청이 몰렸습니다")
    this.name = "RateLimited"
  }
}

async function post<T>(path: string, body: unknown, timeoutMs = 120_000, localPlanning = false): Promise<T> {
  /* 데모 빌드(`VITE_DEMO=1`)는 여기서 갈린다 — 서버가 없고 녹화된 응답을 돌려준다(M18).
     ⚠ 이 한 곳이 `/api/*` 를 부르는 **유일한 자리가 아니다** — `lib/hermes.ts` 의 `health()` 가
     `fetch` 를 직접 쓴다. 그쪽도 함께 막아야 「API 호출 0건」이 성립한다. */
  if (DEMO) return playback<T>(path, body)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error).name === "AbortError") throw new Error("서버 응답이 너무 오래 걸립니다. 다시 시도해 주세요.")
    throw new Error("서버에 닿지 못했습니다. 네트워크를 확인해 주세요.")
  }
  clearTimeout(timer)

  if (res.status === 429) throw new RateLimited()
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`서버가 JSON이 아닌 응답을 보냈습니다 (${res.status})`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error
    if (localPlanning) throw new Error(planningErrorMessage(msg))
    throw new Error(msg || `서버 오류 (${res.status})`)
  }
  if (localPlanning && res.headers.get("x-pathfind-source") !== "local-grounded-v1") throw new Error("선행 조사 결과를 확인하지 못했습니다. 다시 시도해 주세요.")
  return data as T
}

export function planningErrorMessage(code?: string): string {
  if (["planning_no_evidence", "planning_evidence", "planning_unsupported"].includes(code ?? "")) return "단계 설계를 뒷받침할 자료를 찾지 못했습니다. 조사 다시 시작을 눌러 주세요."
  if (code === "planning_timeout") return "단계를 정하는 데 시간이 오래 걸려 중단했습니다. 조사 다시 시작을 눌러 주세요."
  if (["planning_unavailable", "planning_upstream", "planning_search_failed"].includes(code ?? "")) return "검색·설계 서버에 연결하지 못했습니다. 잠시 후 조사 다시 시작을 눌러 주세요."
  return "단계 설계 결과를 확인하지 못했습니다. 조사 다시 시작을 눌러 주세요."
}

/** 신규 API 응답만 엄격히 확인한다. 저장된 옛 v5 세션에는 적용하지 않는다. */
export function validatePlanningResponse(r: { bigPicture: BigPicture }) {
  const p = r?.bigPicture?.planning
  const stages = r?.bigPicture?.stages
  if (p?.mode === "research-informed") {
    const events = p.events?.map(e => e.name) ?? []
    if (p.version !== 1 || !p.requestId || !p.basisSummary || !p.researchedAt || !Array.isArray(p.sources) ||
        !Array.isArray(stages) || stages.length < 4 || stages.length > 7 || stages.some((s, i) => s.no !== i + 1 || !s.title || !s.desc) ||
        !Array.isArray(p.trace) || p.trace.length !== 6 || !["webkr", "blog", "cafearticle"].every(channel => p.trace.filter(t => t.channel === channel).length === 2) ||
        p.trace.some(t => typeof t.query !== "string" || !t.query.trim() || !["success", "empty", "error"].includes(t.status) || !Number.isInteger(t.count) || t.count < 0 || !Number.isFinite(t.elapsedMs) || t.elapsedMs < 0) || !p.trace.some(t => t.status === "success" || t.status === "empty") ||
        events.join(",") !== "request_received,search_finished,design_finished,response_ready" || p.events.some((e, i) => !Number.isFinite(e.elapsedMs) || e.elapsedMs < 0 || (i > 0 && e.elapsedMs < p.events[i - 1].elapsedMs)) ||
        events.indexOf("search_finished") < 0 || events.indexOf("design_finished") <= events.indexOf("search_finished") || events.indexOf("response_ready") <= events.indexOf("design_finished") ||
        p.sources.some(s => !/^https?:\/\//.test(s.url) || !s.id || !s.snippet || s.readScope !== "search-snippet") ||
        !Array.isArray(p.researchNotes) || p.researchNotes.some(n => !n.excerpt || !p.sources.some(s => s.id === n.sourceId && s.snippet === n.excerpt)) ||
        !Array.isArray(p.stageBasis) || p.stageBasis.length !== stages.length || p.stageBasis.some((b, i) => b.stageNo !== i + 1 || b.basis !== "adaptation" || !b.reason || b.sourceIds?.length !== 0 || b.support?.length !== 0) ||
        !Array.isArray(p.groundingChecks) || p.groundingChecks.length !== 0 ||
        !Array.isArray(p.warnings) || (!p.researchNotes.length && !p.warnings.length)) throw new Error("선행 조사 기록이 빠진 응답입니다. 조사 다시 시작을 눌러 주세요.")
    return r
  }
  if (!p || p.version !== 1 || !p.requestId || !p.basisSummary || !p.researchedAt || !Array.isArray(p.sources) || !p.sources.length ||
      !Array.isArray(stages) || stages.length < 4 || stages.length > 7 || !Array.isArray(p.stageBasis) || p.stageBasis.length !== stages.length ||
      !Array.isArray(p.trace) || !p.trace.length || !Array.isArray(p.events) || !p.events.some(e => e.name === "grounding_checked") ||
      !Array.isArray(p.groundingChecks) || p.groundingChecks.length !== stages.length ||
      p.sources.some(s => !/^https?:\/\//.test(s.url) || !s.id || !s.snippet || s.readScope !== "search-snippet") ||
      p.stageBasis.some((b, i) => b.stageNo !== stages[i].no || !b.reason || !Array.isArray(b.sourceIds) || b.sourceIds.some(id => !p.sources.some(s => s.id === id))) ||
      p.groundingChecks.some((c, i) => c.stageNo !== stages[i].no || !c.constraintsMet || typeof c.orderClaim !== "boolean" || (p.stageBasis[i].basis === "source" && c.orderClaim && !p.stageBasis[i].support.some(s => s.supports === "order" || s.supports === "prerequisite")) || (p.stageBasis[i].basis === "source" ? !c.supported : !c.adaptationJustified))) {
    throw new Error("선행 조사 근거가 빠진 응답입니다. 조사 다시 시작을 눌러 주세요.")
  }
  return r
}

export function grill(input: { question?: string; answer?: string; history: GrillTurn[]; turnCount: number }) {
  return post<GrillResponse>("/api/grill", input)
}

/** 이 단계에 부를 채널 목록 (5차 step-18) — 규칙은 서버에만 있고 화면은 복제하지 않는다. 로컬 미들웨어. */
export type ChannelPlanItem = { channel: string; tool: string; why: string; queryHint: string }
export function channelPlan(input: { stage: Stage }) {
  return post<{ planned: ChannelPlanItem[] }>("/api/channel-plan", input, 15_000)
}

export async function pathfind(input: { summary?: string; initialQuestion?: string }) {
  return validatePlanningResponse(await post<{ bigPicture: BigPicture }>("/api/pathfind", input, 120_000, true))
}

export function stage(input: { stageIndex: number; stage: Stage; summary: string }) {
  return post<{ stage: Stage }>("/api/stage", input)
}

export function handoff(input: { bigPicture: BigPicture; stages: Stage[]; summary: string }) {
  return post<{ handoffMarkdown: string; title: string }>("/api/handoff", input)
}

export type ExplainRequest = {
  node: { id: string; label: string; depth?: number }
  stage: Stage | null
  summary: string
}
/** `followups` — 그 노드를 두고 이어서 물을 후속 질문 2~3개(4차 보강 2 step-19). 옛 서버가 안 주면 빈 배열로 본다. */
export type ExplainResponse = { explanation: string; citationTitles: string[]; citationIds?: string[]; followups?: string[]; degraded: boolean }

export function explain(input: ExplainRequest) {
  return post<ExplainResponse>("/api/explain", input, 90_000)
}

/**
 * 조사 끝난 뒤 로드맵 대화(4차 step-5) — 로컬 미들웨어 `server/chat.mjs`. 근거가 조사 문서에 없으면 서버가
 * `grounded: false` + 고정 문장으로 답한다(코드 판정). `citationIds` 는 좌 패널 자료 문서 id 와 같은 규약.
 */
export type ChatRequest = {
  summary: string
  bigPicture: BigPicture | null
  stages: Stage[]
  history: { role: "user" | "assistant"; text: string }[]
}
export type ChatResponse = {
  answer: string
  basis: number[]
  citationTitles: string[]
  citationIds: string[]
  followups: string[]
  grounded: boolean
  degraded: boolean
}

export function chat(input: ChatRequest) {
  return post<ChatResponse>("/api/chat", input, 90_000)
}

/** 소주제 트리(4차 보강 step-13) — 로컬 `server/outline.mjs`. `degraded` 거나 `topics` 가 비면 항목이 단계 바로 아래에 선다. */
export type OutlineRequest = { stage: Stage; summary: string }
export type OutlineResponse = { topics: OutlineTopic[]; degraded: boolean }
export function outline(input: OutlineRequest) {
  return post<OutlineResponse>("/api/outline", input, 60_000)
}

/** 자료 카드(4차 보강 step-12) — 로컬 `server/source-card.mjs`. `degraded` 면 `markdown` 이 비고 화면은 사실 본문을 그대로 둔다. */
export type SourceCardRequest = { finding: Finding; stage: Stage; summary: string }
export type SourceCardResponse = { markdown: string; degraded: boolean }
export function sourceCard(input: SourceCardRequest) {
  return post<SourceCardResponse>("/api/source-card", input, 60_000)
}

/**
 * 동시 실행 상한을 지키며 작업을 돌린다. 하나라도 429 를 만나면 **상한을 1로 내리고**
 * 남은 작업을 순차로 이어 간다(브리프: "동시 3 상한, 429 면 순차 강등").
 * 429 를 맞은 항목은 큐 앞으로 되돌려 다시 시도하고, 그 밖의 실패는 worker 가
 * 이미 상태에 적었으므로 삼킨다 — 한 단계 실패가 전체를 죽이지 않는다.
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  onDegrade?: () => void,
): Promise<void> {
  const queue = items.map((_, i) => i)
  let degraded = false

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const pump = async (slot: number): Promise<void> => {
    for (;;) {
      // 강등되면 0번 러너 하나만 남아 순차로 마저 돈다
      if (degraded && slot > 0) return
      const i = queue.shift()
      if (i === undefined) return
      try {
        await worker(items[i], i)
      } catch (e) {
        if (e instanceof RateLimited) {
          if (!degraded) {
            degraded = true
            onDegrade?.()
          }
          queue.unshift(i) // 되돌려 다시 시도한다
          await sleep(1500)
          if (slot > 0) return
        }
        // 그 밖의 실패는 worker 가 상태에 적었다 — 다음 항목으로 간다
      }
    }
  }

  const width = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: width }, (_, k) => pump(k)))

  // 강등 시점에 0번 러너가 이미 큐를 비우고 빠져나갔을 수 있다. 남은 것을 순차로 마저 비운다.
  while (queue.length) {
    await pump(0)
  }
}
