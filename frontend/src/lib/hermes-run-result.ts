import * as hermes from "./hermes"
import type { HermesEvent, HermesRunState } from "./hermes"

export interface CollectRunResultOpts {
  cursor?: number
  signal?: AbortSignal
  onEvent?: (event: HermesEvent, cursor: number) => void
  onQuiet?: () => void
}

const QUIET_MS = 30_000
const TOTAL_MS = 360_000

function makeFailure(runId: string, message: string): HermesRunState {
  return {
    runId,
    status: "failed",
    output: "",
    error: message,
    usage: null,
    lastEvent: null,
    eventCount: 0,
  }
}

export function collectRunResult(
  runId: string,
  opts: CollectRunResultOpts = {},
): Promise<HermesRunState> {
  const cursor = opts.cursor ?? 0
  const signal = opts.signal
  const onEvent = opts.onEvent
  const onQuiet = opts.onQuiet

  return new Promise<HermesRunState>((resolve, reject) => {
    let settled = false
    let handle: hermes.StreamHandle | null = null
    let quietTimer: ReturnType<typeof setTimeout> | null = null
    let hardTimer: ReturnType<typeof setTimeout> | null = null
    let quietShown = false
    let stopRunFired = false

    const clearTimers = () => {
      if (quietTimer) { clearTimeout(quietTimer); quietTimer = null }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null }
    }

    const close = () => {
      if (handle) { handle.close(); handle = null }
    }

    const cleanup = () => {
      clearTimers()
      close()
    }

    const finish = (state: HermesRunState) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(state)
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    const requestStopRun = () => {
      if (stopRunFired) return
      stopRunFired = true
      hermes.stopRun(runId).catch(() => {
        /* 이미 종료된 run 이면 무시 */
      })
    }

    const bumpQuiet = () => {
      if (quietTimer) clearTimeout(quietTimer)
      quietTimer = setTimeout(() => {
        if (quietShown || settled) return
        quietShown = true
        onQuiet?.()
      }, QUIET_MS)
    }

    const onAbort = () => {
      if (settled) return
      requestStopRun()
      fail("취소됨")
    }

    if (signal?.aborted) {
      requestStopRun()
      fail("취소됨")
      return
    }

    signal?.addEventListener("abort", onAbort, { once: true })

    hardTimer = setTimeout(() => {
      if (settled) return
      requestStopRun()
      fail("시간 초과")
    }, TOTAL_MS)

    bumpQuiet()

    handle = hermes.streamEvents(runId, {
      cursor,
      onEvent: (event, cursorNow) => {
        onEvent?.(event, cursorNow)
        bumpQuiet()
        if (event.event?.startsWith("run.")) {
          const status = event.event.slice(4)
          if (hermes.isTerminal(status)) {
            hermes.pollRun(runId).then(
              (state) => {
                if (!hermes.isTerminal(state.status)) {
                  fail("종료 상태 아님")
                  return
                }
                finish(state)
              },
              () => fail("결과 회수 실패"),
            )
          }
        }
      },
      onClose: (reason) => {
        if (settled) return
        hermes.pollRun(runId).then(
          (state) => {
            if (!hermes.isTerminal(state.status)) {
              fail("종료 상태 아님")
              return
            }
            finish(state)
          },
          () => {
            if (reason === "error") fail("스트림 오류")
            else fail("닫힘")
          },
        )
      },
    })
  })
}
