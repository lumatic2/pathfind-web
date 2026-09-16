import type { BigPicture, SourceDoc } from "./types"

const PLANNING_ID = "planning"

export function buildPlanningDoc(bigPicture: BigPicture | null): SourceDoc | null {
  if (bigPicture == null || bigPicture.planning == null) return null

  const p = bigPicture.planning
  const lines: string[] = []

  lines.push("# 단계를 정할 때 참고한 자료")
  lines.push("")

  // 전체 제안 이유
  if (p.basisSummary.trim().length > 0) {
    lines.push("## 전체 제안 이유")
    lines.push("")
    lines.push(p.basisSummary)
    lines.push("")
  }

  // 실제 자료
  lines.push("## 실제 자료")
  lines.push("")
  if (p.sources.length > 0) {
    for (const s of p.sources) {
      lines.push(`- [${s.title}](${s.url})`)
      lines.push(`  - 채널: ${s.channel} · 접근: ${s.accessedAt}`)
      if (s.snippet.trim().length > 0) {
        lines.push(`  - ${s.snippet}`)
      }
      lines.push("")
    }
  } else {
    lines.push("자료가 없습니다. 인터뷰 기반 초안입니다.")
    lines.push("")
  }

  // 검색 발췌
  if (p.researchNotes.length > 0) {
    lines.push("## 검색 발췌")
    lines.push("")
    for (const n of p.researchNotes) {
      lines.push(`- 출처 ${n.sourceId}`)
      lines.push(`  - ${n.excerpt}`)
      lines.push("")
    }
  }

  // 단계별 제안 이유
  const stageKeys = Object.keys(p.stageBasis)
  if (stageKeys.length > 0) {
    lines.push("## 단계별 제안 이유")
    lines.push("")
    for (const key of stageKeys) {
      const no = Number(key)
      const sb = p.stageBasis[key as unknown as keyof typeof p.stageBasis]
      lines.push(`### ${no}단계`)
      lines.push("")
      lines.push(`- 근거: ${sb.basis}`)
      lines.push(`- 이유: ${sb.reason}`)
      if (sb.sourceIds.length > 0) {
        lines.push(`- 참고: ${sb.sourceIds.join(", ")}`)
      }
      if (sb.support.length > 0) {
        lines.push(`- 보조: ${sb.support.join(", ")}`)
      }
      lines.push("")
    }
  }

  // 조회 기록
  if (p.trace.length > 0) {
    lines.push("## 조회 기록")
    lines.push("")
    for (const t of p.trace) {
      lines.push(`- 검색어: ${t.query} · 채널: ${t.channel} · ${t.status} · ${t.count}건 · ${t.elapsedMs}ms`)
    }
    lines.push("")
  }

  // 한계
  const limits: string[] = []
  for (const w of p.warnings) {
    limits.push(w)
  }
  if (p.offTopic != null && p.offTopic > 0) {
    limits.push(`주제와 맞지 않아 제외한 검색 결과 ${p.offTopic}건`)
  }
  if (limits.length > 0) {
    lines.push("## 한계")
    lines.push("")
    for (const l of limits) {
      lines.push(`- ${l}`)
    }
    lines.push("")
  }

  return {
    id: PLANNING_ID,
    kind: "planning",
    stageNo: 0,
    title: "단계를 정할 때 참고한 자료",
    markdown: lines.join("\n"),
    status: "done",
    subtitle: p.mode,
  }
}
