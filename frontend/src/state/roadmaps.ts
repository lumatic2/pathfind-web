/**
 * 완주한 로드맵 보관 목록(4차 보강 2 step-18, 사용자 H14 「한 싸이클 돌면 저장은 어디에 돼? 다른 로드맵 돌리면 원래 했던 거 돌아와서 볼 수 있음?」).
 *
 * 세션 저장소(`pathfind.session.v5`)는 **지금 보는 로드맵 하나**만 든다 — 「새 로드맵」이 그 키를 지우면 되돌아올 길이 없었다.
 * 그래서 별도 키에 목록을 둔다. 보관 시점은 셋 — ① 조사가 끝나 `ready` 가 되는 순간 ② 「새 로드맵」을 누르는 순간(완주 전이라도
 * 큰 그림이 있으면) ③ 「내 로드맵」에서 다른 것을 여는 순간(지금 것을 먼저). 같은 세션은 `id` 로 덮어쓴다(upsert).
 *
 * ⚠ 브라우저 저장소(대개 5MB)라 세션 1건 ≈ 60~120KB 기준 수십 건이 한계 — 40건을 넘으면 오래된 것부터 버린다.
 * 남은 횟수(`pathfind.quota.v1`)는 여기와 무관하다 — 열기는 조사가 아니다.
 */
import type { Session } from "./types"
import { restoreSession } from "./store"

export const ROADMAPS_KEY = "pathfind.roadmaps.v1"
export const ROADMAPS_MAX = 40

export type SavedRoadmap = {
  id: string
  title: string
  /** ISO 시각 — 마지막으로 보관한 때 */
  savedAt: string
  stageCount: number
  findingCount: number
  session: Session
}

function read(): SavedRoadmap[] {
  try {
    const raw = localStorage.getItem(ROADMAPS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { items?: SavedRoadmap[] }
    return Array.isArray(parsed?.items) ? parsed.items.filter((r) => r && typeof r.id === "string" && r.session?.version === 5) : []
  } catch {
    return []
  }
}

function write(items: SavedRoadmap[]): boolean {
  try {
    localStorage.setItem(ROADMAPS_KEY, JSON.stringify({ items }))
    return true
  } catch {
    // 용량 초과 — 보관만 못 할 뿐 화면은 계속 돈다. 호출자가 한 줄로 알린다.
    return false
  }
}

/** 최신 것이 앞에 오는 목록 */
export function listRoadmaps(): SavedRoadmap[] {
  return read().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

export function newRoadmapId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 세션 하나를 보관한다(upsert). 큰 그림이 없는 세션(인터뷰 중)은 보관하지 않는다 — 되돌아가 볼 것이 없다.
 * `session.id` 가 없으면 만들어서 쓴다 — 호출자는 돌려받은 id 를 세션에 patch 해야 다음 보관이 덮어쓴다.
 * 돌려주는 값: 보관된 id, 저장에 실패하면 `null`.
 */
export function saveRoadmap(session: Session): string | null {
  if (!session.bigPicture) return null
  const id = session.id ?? newRoadmapId()
  const stored: Session = { ...session, id, busy: false, error: null, selectedId: null, exportState: { ...session.exportState, busy: false } }
  const entry: SavedRoadmap = {
    id,
    title: session.mapTitle ?? session.bigPicture.title ?? "제목 없는 패스",
    savedAt: new Date().toISOString(),
    stageCount: session.stages.length,
    findingCount: session.stages.reduce((a, x) => a + (x.stage.findings?.length ?? 0), 0),
    session: stored,
  }
  const rest = read().filter((r) => r.id !== id)
  const items = [entry, ...rest].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)).slice(0, ROADMAPS_MAX)
  return write(items) ? id : null
}

/** 보관본 하나를 지운다(2026-09-14 — 4차 finding 큐 「내 로드맵 삭제·이름 바꾸기」). 지금 보는 세션은 건드리지 않는다 — 보관본만 빠진다. */
export function deleteRoadmap(id: string): boolean {
  const items = read().filter((r) => r.id !== id)
  return write(items)
}

/** 보관본 제목을 바꾼다. 빈 제목은 무시한다(기존 제목 유지). 세션 안의 `mapTitle` 도 같이 바꿔 다시 열 때 그 제목이 뜬다. */
export function renameRoadmap(id: string, title: string): boolean {
  const next = title.trim()
  if (!next) return false
  const items = read().map((r) => (r.id === id ? { ...r, title: next, session: { ...r.session, mapTitle: next } } : r))
  return write(items)
}

export function getRoadmap(id: string): SavedRoadmap | null {
  return read().find((r) => r.id === id) ?? null
}

/** 보관본을 현재 세션으로 되살릴 때의 정리 — `store.load()` 와 같은 규칙(진행 중 표시·선택·오류는 되살리지 않는다) */
export function toCurrentSession(saved: SavedRoadmap): Session {
  const s = saved.session
  return restoreSession({ ...s, id: saved.id })
}
