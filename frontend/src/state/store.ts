import { useCallback, useReducer } from "react"

import type { Session } from "./types"
import { INITIAL_SESSION, STORAGE_KEYS } from "./types"

// --- persistence -----------------------------------------------------------

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session)
    if (raw == null) return INITIAL_SESSION
    const parsed = JSON.parse(raw) as Session
    if (parsed == null || parsed.version !== 5) return INITIAL_SESSION
    return parsed as Session
  } catch {
    return INITIAL_SESSION
  }
}

export function sanitizeForRestore(session: Session): Session {
  // stages: running → pending
  const stages = session.stages.map((slot) =>
    slot.status === "running" ? { ...slot, status: "pending" as const } : slot,
  )

  // phase 규칙
  let phase = session.phase
  const interrupted =
    session.planningAttempt?.status === "pending" || phase === "skeleton"
  if (phase === "skeleton") {
    phase = "confirm"
  } else if (phase === "ready") {
    const anyNotDone = stages.some((slot) => slot.status !== "done")
    if (anyNotDone) phase = "researching"
  }

  // 계획 설계가 중단됐으면 확인 화면으로 돌리고 중단 안내를 남긴다
  if (interrupted) {
    phase = "confirm"
  }

  // 재접속용 값 정리
  return {
    ...session,
    phase,
    busy: false,
    error: interrupted
      ? "저장 당시 진행 중이던 계획 설계를 이어서 할 수 있습니다. 승인 화면에서 다시 선택하면 계획 설계를 다시 시도합니다."
      : null,
    selectedId: null,
    planningAttempt:
      interrupted && session.planningAttempt != null
        ? { ...session.planningAttempt, status: "failed" as const }
        : session.planningAttempt,
    exportState: { ...session.exportState, busy: false },
    // runId, runCursor, runStatus는 그대로 둠
  }
}

// --- storage write ---------------------------------------------------------

function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session))
  } catch {
    // quota exceeded 등 — 화면은 그대로 유지
  }
}

// --- reducer ---------------------------------------------------------------

type Action =
  | { type: "PATCH"; payload: Partial<Session> }
  | { type: "REPLACE"; payload: Session }
  | { type: "RESET" }

function reducer(state: Session, action: Action): Session {
  let next: Session
  switch (action.type) {
    case "PATCH": {
      const payload = action.payload
      let sourceCards: Session['sourceCards']
      if (payload.sourceCards != null) {
        sourceCards = {
          ...(state.sourceCards ?? {}),
          ...payload.sourceCards,
        }
      }
      next = { ...state, ...payload, sourceCards }
      break
    }
    case "REPLACE":
      next = action.payload
      break
    case "RESET":
      next = INITIAL_SESSION
      break
  }
  saveSession(next)
  return next
}

// --- hook -------------------------------------------------------------------

export function useSession(): {
  session: Session
  patch: (patch: Partial<Session>) => void
  replace: (session: Session) => void
  reset: () => void
} {
  const [session, dispatch] = useReducer(
    reducer,
    null,
    () => sanitizeForRestore(loadSession()),
  )

  const patch = useCallback((patch: Partial<Session>) => {
    dispatch({ type: "PATCH", payload: patch })
  }, [])

  const replace = useCallback((session: Session) => {
    dispatch({ type: "REPLACE", payload: session })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: "RESET" })
  }, [])

  return { session, patch, replace, reset }
}

// --- clear -----------------------------------------------------------------

export function clearSession(): Session {
  try {
    localStorage.removeItem(STORAGE_KEYS.session)
  } catch {
    // 무시
  }
  return INITIAL_SESSION
}
