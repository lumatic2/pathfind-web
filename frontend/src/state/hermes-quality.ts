import type { Stage } from "./types"
import { normalizeVerdict } from "./derive"

function asText(v: unknown): string {
  if (typeof v === "string") return v
  if (v == null) return ""
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    for (const k of ["label", "title", "name", "task", "text", "option", "choice"]) {
      if (typeof o[k] === "string") return o[k] as string
    }
    try {
      return JSON.stringify(v)
    } catch {
      return ""
    }
  }
  return String(v)
}

const STRONG_CHANNELS = new Set(["law", "stats", "public_data", "oss"])

const VERDICT_LABEL: Record<string, string> = {
  "가져다 써도 됨": "이미 있음",
  "섞어야 함": "일부만 있음",
  "직접 해야 함": "없음",
  "선례를 못 찾음": "못 찾음",
}

export function stageStrength(stage: Stage | undefined): number {
  if (!stage) return -1
  const findings = stage.findings ?? []
  const verdictPoint = normalizeVerdict(stage.verdict) === "선례를 못 찾음" ? 0 : 2
  const strong = new Set(findings.map((f) => asText(f.channel)).filter((c) => STRONG_CHANNELS.has(c)))
  return verdictPoint + Math.min(findings.length, 6) + strong.size * 2
}

export function needsReinforce(stage: Stage | undefined): boolean {
  if (!stage) return true
  const findings = stage.findings ?? []
  if (!findings.length) return true
  if (normalizeVerdict(stage.verdict) === "선례를 못 찾음") return true
  return !findings.some((f) => STRONG_CHANNELS.has(asText(f.channel)))
}

export function isBetterStage(next: Stage | undefined, prev: Stage | undefined): boolean {
  return stageStrength(next) > stageStrength(prev)
}

export function reinforceNote(prev: Stage, next: Stage): string {
  const before = normalizeVerdict(prev.verdict)
  const after = normalizeVerdict(next.verdict)
  const gained = (next.findings?.length ?? 0) - (prev.findings?.length ?? 0)
  const parts: string[] = []
  if (before !== after) parts.push(`판정이 「${VERDICT_LABEL[before]}」에서 「${VERDICT_LABEL[after]}」으로 바뀌었습니다`)
  if (gained > 0) parts.push(`자료 ${gained}건이 늘었습니다`)
  if (!parts.length) return ""
  return `${next.no}. ${asText(next.title)} · 더 찾아본 결과 ${parts.join("고, ")}.`
}
