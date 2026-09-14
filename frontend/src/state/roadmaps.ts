import { STORAGE_KEYS } from "./types"

export type SavedRoadmap = {
  id: string
  title: string
  savedAt: string
  stageCount: number
  findingCount: number
  session: string
}

export const ROADMAPS_MAX = 40

type Stored = {
  id: string
  title: string
  savedAt: string
  stageCount: number
  findingCount: number
  session: string
}

function loadAll(): Stored[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.roadmaps)
    if (raw == null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (it): it is Stored =>
        typeof it === "object" &&
        it != null &&
        typeof it.id === "string" &&
        typeof it.title === "string" &&
        typeof it.savedAt === "string" &&
        typeof it.stageCount === "number" &&
        typeof it.findingCount === "number" &&
        typeof it.session === "string",
    )
  } catch {
    return []
  }
}

function persist(items: Stored[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.roadmaps, JSON.stringify(items))
  } catch {
    // quota exceeded 등
  }
}

function titleOf(session: unknown): string {
  if (session == null) return "제목 없는 로드맵"
  if (typeof session !== "object") return "제목 없는 로드맵"
  const mapTitle =
    (session as Record<string, unknown>).mapTitle
  if (typeof mapTitle === "string" && mapTitle.length > 0) return mapTitle

  const bp = (session as Record<string, unknown>).bigPicture
  if (bp && typeof bp === "object") {
    const bpTitle = (bp as Record<string, unknown>).title
    if (typeof bpTitle === "string" && bpTitle.length > 0) return bpTitle
  }

  return "제목 없는 로드맵"
}

function stageCountOf(session: unknown): number {
  if (session == null) return 0
  if (typeof session !== "object") return 0
  const bp = (session as Record<string, unknown>).bigPicture
  if (!bp || typeof bp !== "object") return 0
  const stages = (bp as Record<string, unknown>).stages
  if (!Array.isArray(stages)) return 0
  return stages.length
}

function findingCountOf(session: unknown): number {
  if (session == null) return 0
  if (typeof session !== "object") return 0
  const bp = (session as Record<string, unknown>).bigPicture
  if (!bp || typeof bp !== "object") return 0
  const stages = (bp as Record<string, unknown>).stages
  if (!Array.isArray(stages)) return 0
  let sum = 0
  for (const stage of stages) {
    if (stage && typeof stage === "object") {
      const findings = (stage as Record<string, unknown>).findings
      if (Array.isArray(findings)) sum += findings.length
    }
  }
  return sum
}

export function listRoadmaps(): SavedRoadmap[] {
  const all = loadAll()
  const sorted = all.slice().sort(
    (a, b) =>
      (b.savedAt < a.savedAt ? -1 : b.savedAt > a.savedAt ? 1 : 0) ||
      (b.id < a.id ? -1 : b.id > a.id ? 1 : 0),
  )
  return sorted as SavedRoadmap[]
}

export function saveRoadmap(
  session: unknown,
  id?: string,
): { id: string; ok: boolean } {
  const all = loadAll()
  const now = new Date().toISOString()
  const entry: Stored = {
    id: id ?? crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: titleOf(session),
    savedAt: now,
    stageCount: stageCountOf(session),
    findingCount: findingCountOf(session),
    session: typeof session === "object" && session != null
      ? JSON.stringify(session)
      : "",
  }

  if (id != null) {
    const idx = all.findIndex((it) => it.id === id)
    if (idx >= 0) {
      all[idx] = { ...entry, savedAt: now }
    } else {
      all.push(entry)
    }
  } else {
    all.push(entry)
  }

  if (all.length > ROADMAPS_MAX) {
    all.sort(
      (a, b) =>
        (a.savedAt < b.savedAt ? -1 : a.savedAt > b.savedAt ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    all.splice(0, all.length - ROADMAPS_MAX)
  }

  try {
    persist(all)
    return { id: entry.id, ok: true }
  } catch {
    return { id: entry.id, ok: false }
  }
}

export function getRoadmap(id: string): SavedRoadmap | null {
  const all = loadAll()
  const found = all.find((it) => it.id === id)
  return found ? (found as SavedRoadmap) : null
}
