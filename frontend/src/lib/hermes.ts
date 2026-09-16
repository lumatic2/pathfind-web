/** Hermes run 생애주기 클라이언트. 브라우저는 **같은 출처의 `/api/hermes/*` 만** 부른다 —
 * 게이트웨이 주소도 키도 이쪽에 없다(릴레이가 소유한다: `server/hermes.mjs`).
 *
 * 새로고침 복원이 성립하는 이유: 게이트웨이 SSE 는 1회용 단일 구독이지만, 릴레이가 그 하나를
 * 붙들고 프레임을 쌓아 두므로 브라우저는 `cursor` 를 주고 몇 번이든 처음부터 다시 읽을 수 있다.
 * 계약 정본 → `research/2026-09-13-hermes-gateway-contract.md`
 */

export type HermesEvent = {
  event: string
  run_id?: string
  timestamp?: number
  /** tool.started / tool.completed */
  tool?: string
  preview?: string
  duration?: number
  error?: boolean | string
  /** message.delta */
  delta?: string
  /** reasoning.available */
  text?: string
  /** run.<status> */
  output?: string
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number }
}

export type HermesHealth = { enabled: boolean; reason: string; version?: string | null }

export type HermesRunState = {
  runId: string
  status: string
  output: string
  error: string | null
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null
  lastEvent: string | null
  eventCount: number
  /** 터널이 내려가 릴레이 버퍼로만 답한 응답 */
  degraded?: boolean
}

export const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "interrupted"]
export const isTerminal = (status: string | null | undefined) =>
  TERMINAL_STATUSES.includes(String(status ?? ""))

/** 게이트웨이가 몰렸다(429). 제출 트랙과 Tier 0 를 나눠 쓰므로 실제로 난다 — 호출 측이 강등 신호로 쓴다. */
export class GatewayBusy extends Error {
  constructor() {
    super("요청이 몰렸습니다")
    this.name = "GatewayBusy"
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (res.status === 429) throw new GatewayBusy()
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`게이트웨이 경로가 JSON이 아닌 응답을 보냈습니다 (${res.status})`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error
    throw new Error(msg || `게이트웨이 오류 (${res.status})`)
  }
  return data as T
}

/** 게이트웨이가 지금 쓸 수 있나. 이 한 번의 판정이 Hermes 경로와 4함수 경로를 가른다. */
export async function health(): Promise<HermesHealth> {
  try {
    return await json<HermesHealth>("/api/hermes/health")
  } catch {
    return { enabled: false, reason: "unreachable" }
  }
}

export async function startRun(
  input: string,
  opts?: { sessionId?: string; instructions?: string },
): Promise<{ runId: string; status: string }> {
  return json<{ runId: string; status: string }>("/api/hermes/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input,
      ...(opts?.sessionId ? { session_id: opts.sessionId } : {}),
      ...(opts?.instructions ? { instructions: opts.instructions } : {}),
    }),
  })
}

/** 폴링 1회. 이벤트를 놓쳐도 이 경로로 결과(`output`)까지 회수된다. */
export function pollRun(runId: string): Promise<HermesRunState> {
  return json<HermesRunState>(`/api/hermes/runs/${encodeURIComponent(runId)}`)
}

export async function stopRun(runId: string): Promise<{ runId: string; status: string; stopped: boolean }> {
  return json<{ runId: string; status: string; stopped: boolean }>(
    `/api/hermes/runs/${encodeURIComponent(runId)}/stop`,
    { method: "POST" },
  )
}

export type StreamHandle = {
  /** 지금까지 받은 프레임 수 — 새로고침 뒤 이어 붙을 커서다 */
  readonly cursor: number
  close: () => void
}

/**
 * 이벤트 스트림에 붙는다. `cursor` 부터 재생되므로 **새로고침해도 흘러간 줄이 돌아온다**.
 * 끊기면(네트워크·dev 서버 재시작) 마지막 커서에서 몇 번 더 붙어 본다.
 */
export function streamEvents(
  runId: string,
  opts: {
    cursor?: number
    onEvent: (event: HermesEvent, index: number) => void
    onClose?: (reason: "done" | "aborted" | "error") => void
  },
): StreamHandle {
  let cursor = opts.cursor ?? 0
  let closed = false
  let retries = 0
  const ctrl = new AbortController()

  const handle: StreamHandle = {
    get cursor() {
      return cursor
    },
    close: () => {
      if (closed) return
      closed = true
      ctrl.abort()
      opts.onClose?.("aborted")
    },
  }

  const pump = async () => {
    while (!closed) {
      let res: Response
      try {
        res = await fetch(`/api/hermes/runs/${encodeURIComponent(runId)}/events?cursor=${cursor}`, {
          signal: ctrl.signal,
          headers: { Accept: "text/event-stream" },
        })
      } catch {
        if (closed) return
        if (++retries > 3) return void opts.onClose?.("error")
        await new Promise((r) => setTimeout(r, 1000 * retries))
        continue
      }
      if (!res.ok || !res.body) {
        if (++retries > 3) return void opts.onClose?.("error")
        await new Promise((r) => setTimeout(r, 1000 * retries))
        continue
      }
      retries = 0
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx: number
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            for (const line of chunk.split("\n")) {
              if (!line.startsWith("data:")) continue // `: keepalive` 는 버린다
              const payload = line.slice(5).trim()
              if (!payload) continue
              try {
                const event = JSON.parse(payload) as HermesEvent
                cursor += 1
                opts.onEvent(event, cursor)
                if (event.event?.startsWith("run.") && isTerminal(event.event.slice(4))) {
                  closed = true
                }
              } catch {
                /* 깨진 프레임 하나가 스트림을 죽이지 않는다 */
              }
            }
          }
        }
      } catch {
        if (closed) return
        continue // 커서를 들고 다시 붙는다
      }
      if (closed) return void opts.onClose?.("done")
      // 스트림이 조용히 닫혔다 — 종료됐는지 폴링으로 확인하고, 아니면 다시 붙는다.
      try {
        const state = await pollRun(runId)
        if (isTerminal(state.status)) {
          closed = true
          return void opts.onClose?.("done")
        }
      } catch {
        /* 아래에서 재접속 */
      }
    }
  }

  void pump()
  return handle
}
