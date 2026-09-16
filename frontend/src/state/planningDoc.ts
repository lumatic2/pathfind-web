import type { BigPicture, SourceDoc } from "./types"

const PLANNING_ID = "planning-sources"

function safe(s: string): string {
  return String(s).replace(/\s+/g, " ").replace(/[\\`*_{}[\\]<>#|]/g, "\\$&")
}

function link(s: { title: string; url: string }): string {
  if (!/^https?:\/\//.test(s.url)) return safe(s.title)
  return `[${safe(s.title)}](${s.url.replace(/[()<>\s]/g, c => encodeURIComponent(c).replace(/\(/g, "%28").replace(/\)/g, "%29"))}`
}

export function buildPlanningDoc(bigPicture: BigPicture | null): SourceDoc | null {
  if (bigPicture == null || bigPicture.planning == null) return null
  const p = bigPicture.planning

  const stageBasisArr = Object.entries(p.stageBasis).map(([no, b]) => [Number(no), b] as const)

  const out = [
    "# 단계를 정할 때 참고한 자료",
    "",
    safe(p.basisSummary),
    "",
    `선행 조사 자료 ${p.sources.length}건 · 조회 ${safe(p.researchedAt)}`,
    "",
    p.sources.length
      ? "검색 결과의 제목과 발췌를 읽었습니다. 링크의 본문 전체를 읽은 기록은 아닙니다."
      : "검색을 시도했지만 참고할 제목·발췌를 얻지 못했습니다.",
    "",
    "## 단계별 설계 이유",
    "",
  ]

  if (p.mode === "research-informed") {
    out.push(
      "단계와 순서는 인터뷰 목표에 맞춰 제안한 계획입니다. 아래 자료가 모든 단계나 순서를 직접 증명한다는 뜻은 아닙니다.",
      "",
      "## 참고한 조사 내용",
      "",
    )
    for (const note of p.researchNotes ?? []) {
      const source = p.sources.find(s => s.id === note.sourceId)
      if (source) out.push(`- ${link(source)}`, `  > ${safe(note.excerpt)}`, "")
    }
    if (!p.researchNotes?.length) out.push("직접 참고할 사례를 충분히 찾지 못했습니다.", "")
    out.push("## 제안한 단계와 이유", "")
  }

  for (const [no, b] of stageBasisArr) {
    const stage = bigPicture.stages.find(s => s.no === no)
    out.push(
      `### ${no}. ${safe(stage?.title ?? "단계")}`,
      "",
      `**${p.mode === "research-informed" ? "목표에 맞춘 제안" : b.basis === "source" ? "자료에 근거한 단계" : "상황에 맞춰 추가한 단계"}** · ${safe(b.reason)}`,
      "",
    )
    for (const support of b.support) {
      if (typeof support !== "object" || support === null || !("sourceId" in support)) continue
      const s = p.sources.find(s => s.id === support.sourceId)
      if (s) {
        const label = support.supports === "stage" ? "단계" : support.supports === "order" ? "순서" : "선행 조건"
        out.push(`- ${link(s)} · ${label} 근거`, `  > ${safe(support.excerpt)}`, "")
      }
    }
  }

  out.push("## 검색에서 확인한 자료", "")
  for (const s of p.sources) {
    out.push(`### ${safe(s.id)} · ${link(s)}`, "", safe(s.snippet), "", `검색어: ${s.queries.map(safe).join(" · ")} · 조회 ${safe(s.accessedAt)}`, "")
  }

  out.push("## 검색 기록", "")
  const channelLabel: Record<string, string> = { webkr: "웹", blog: "블로그", cafearticle: "카페" }
  const statusLabel: Record<string, string> = { success: "검색 완료", empty: "결과 없음", error: "연결 실패" }
  for (const t of p.trace) {
    out.push(`- ${safe(t.query)} · ${channelLabel[t.channel] ?? safe(t.channel)} · ${statusLabel[t.status] ?? safe(t.status)} · ${t.count}건`)
  }

  for (const warning of p.warnings) {
    out.push("", safe(warning))
  }

  return {
    id: PLANNING_ID,
    kind: "summary",
    stageNo: 0,
    title: "단계를 정할 때 참고한 자료",
    subtitle: `선행 조사 자료 ${p.sources.length}건`,
    markdown: out.join("\n"),
    status: "done",
  }
}
