/**
 * 세션 상태 + localStorage 복원. 새로고침해도 결과가 남고, 「다시 시작」이 지운다.
 * 저장 키·스키마 버전은 로드맵 §상태 가 서술한다.
 */
import { useCallback, useEffect, useMemo, useReducer } from "react"
import { INITIAL_SESSION, type ChatEntry, type Session, type StageSlot } from "./types"

export const STORAGE_KEY = "pathfind.session.v5"

export type Action =
  | { type: "restore"; session: Session }
  | { type: "reset" }
  | { type: "patch"; patch: Partial<Session> }
  | { type: "addMessage"; message: ChatEntry }
  | { type: "replaceMessage"; id: string; message: Partial<ChatEntry> }
  | { type: "setStage"; index: number; slot: Partial<StageSlot> }

export function reducer(state: Session, action: Action): Session {
  switch (action.type) {
    case "restore":
      return action.session
    case "reset":
      return { ...INITIAL_SESSION, messages: [] }
    case "patch":
      return { ...state, ...action.patch }
    case "addMessage":
      return { ...state, messages: [...state.messages, action.message] }
    case "replaceMessage":
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.id ? { ...m, ...action.message } : m)),
      }
    case "setStage":
      return {
        ...state,
        stages: state.stages.map((s, i) => (i === action.index ? { ...s, ...action.slot } : s)),
      }
    default:
      return state
  }
}

export function restoreSession(parsed: Session): Session {
  const stages = (parsed.stages ?? []).map(s => s.status === "running" ? { ...s, status: "pending" as const } : s)
  const interrupted = parsed.planningAttempt?.status === "pending"
  return {
    ...parsed, stages, busy: false, selectedId: null,
    error: interrupted ? "단계를 정하던 요청이 중단됐습니다. 조사 다시 시작을 눌러 주세요." : parsed.planningAttempt?.status === "failed" ? parsed.error : null,
    planningAttempt: interrupted ? { ...parsed.planningAttempt!, status: "failed" } : parsed.planningAttempt,
    exportState: { ...parsed.exportState, busy: false },
    phase: parsed.phase === "skeleton" || interrupted ? "confirm" : stages.some(s => s.status === "pending") && parsed.phase === "ready" ? "researching" : parsed.phase,
  }
}

export function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (parsed?.version !== INITIAL_SESSION.version) return null
    // ⚠ Hermes run 은 예외다 — 서버에서 계속 돌고 릴레이가 프레임을 쌓아 두므로
    //    `runId`·`runCursor` 를 그대로 들고 나가 다시 붙는다(App 이 복원 시 재접속한다).
    // 새로고침 시점에 날아간 진행 중 작업은 되살릴 수 없다 — 멈춘 자리로 되돌린다.
    return restoreSession(parsed)
  } catch {
    return null
  }
}

export function useSession() {
  // ⚠ 복원은 **리듀서 초기화에서 동기로** 한다. effect 로 불러오면 첫 커밋의 저장 effect 가
  //    빈 초기 상태를 먼저 써서 저장본을 지운다(실측 — 새로고침할 때마다 세션이 날아갔다).
  const [session, dispatch] = useReducer(reducer, undefined, () => load() ?? INITIAL_SESSION)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } catch {
      /* 용량 초과 — 저장만 못 할 뿐 화면은 계속 돈다 */
    }
  }, [session])

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* 무시 */
    }
    dispatch({ type: "reset" })
  }, [])

  return useMemo(() => ({ session, dispatch, reset }), [session, reset])
}
