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
  if (phase === "skeleton") {
    phase = "confirm"
  } else if (phase === "ready") {
    const anyNotDone = stages.some((slot) => slot.status !== "done")
    if (anyNotDone) phase = "researching"
  }

  // 재접속용 값 정리
  return {
    ...session,
    phase,
    busy: false,
    error: null,
    selectedId: null,
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
    case "PATCH":
      next = { ...state, ...action.payload }
      break
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
