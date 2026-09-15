import type { MindmapNode } from "../components/mindmap-spine-tree"
import type { Verdict, StageRunStatus, Stage } from "./types"
import { VERDICTS } from "./types"
import type { Session, SourceDoc, StageSlot, Finding, Task, Todo, OutlineTopic } from "./types"

/**
 * 서버·저장 계약의 판정 문자열 네 값 가운데 하나로 접는다.
 * 앞부분이 일치하면 그 값으로, 어느 것과도 안 맞으면 "선례를 못 찾음"으로 접는다.
 * 판정 값 뒤에 설명이 붙은 산문(예: "가져다 써도 됨 — …")도 앞부분 일치로 접힌다.
 */
export function normalizeVerdict(v: unknown): Verdict {
  if (typeof v !== "string") return "선례를 못 찾음"
  const trimmed = v.trim()
  if (trimmed === "") return "선례를 못 찾음"
  for (const verdict of VERDICTS) {
    if (trimmed === verdict || trimmed.startsWith(verdict)) {
      return verdict
    }
  }
  return "선례를 못 찾음"
}

export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "가져다 써도 됨":
      return "이미 있음"
    case "직접 해야 함":
      return "없음"
    case "섞어야 함":
      return "일부만 있음"
    case "선례를 못 찾음":
      return "못 찾음"
  }
}

export const channelLabel: Record<string, string> = {
  web: "웹 검색",
  oss: "오픈소스 GitHub",
  public_data: "공공데이터포털",
  stats: "국가통계 KOSIS",
  law: "국가법령정보",
}

/** findings의 kind를 자료 행 부제(7종)로 정리 */
export function findingKindLabel(kind: string | undefined): string {
  if (kind == null) return ""
  if (kind === "튜토리얼·블로그") return "튜토리얼 블로그"
  return kind
}

export const channelShort: Record<string, string> = {
  web: "웹",
  oss: "GitHub",
  public_data: "공공데이터",
  stats: "통계",
  law: "법령",
}

export function channelTally(findings: Finding[]): { channel: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const f of findings) {
    const ch = f.channel
    if (ch == null) continue
    counts[ch] = (counts[ch] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([channel, count]) => ({ channel, count: count as number }))
    .sort((a, b) => b.count - a.count)
}

function stageSubtitle(stage: StageSlot["stage"], status: StageRunStatus): string | undefined {
  if (status === "pending") return undefined
  if (status === "running") return "조사 중"
  if (status === "done") {
    const findings = stage.findings ?? []
    const todos = stage.todos ?? []
    const taskCount = stage.tasks?.length ?? 0
    const 가져다쓸것 = findings.length + todos.filter((t) => t.owner === "가져다 씀").length
    const 직접만들것 = taskCount + todos.filter((t) => t.owner === "직접 함").length
    if (가져다쓸것 === 0 && 직접만들것 === 0) return undefined
    return `가져다 쓸 것 ${가져다쓸것}개, 직접 만들 것 ${직접만들것}개`
  }
  return undefined
}

const STAGEPREFIX = "stage-"

function stageDoc(stageNo: number, stage: StageSlot["stage"], status: StageRunStatus): SourceDoc {
  return {
    id: `${STAGEPREFIX}${stageNo}`,
    kind: "stage",
    stageNo,
    title: `${stageNo}. ${stage.title}`,
    markdown: "",
    status,
    findingCount: stage.findings?.length ?? 0,
    verdict: stage.verdict ?? undefined,
    children: [],
    subtitle: stageSubtitle(stage, status),
  }
}

function summaryDoc(stageNo: number, stage: StageSlot["stage"], status: StageRunStatus): SourceDoc {
  const markdown = summaryMarkdown(stage, status)
  return {
    id: `${STAGEPREFIX}${stageNo}-summary`,
    kind: "summary",
    stageNo,
    title: stageTitle(stage, status),
    markdown,
    status,
    findingCount: stage.findings?.length ?? 0,
    verdict: stage.verdict ?? undefined,
  }
}

function stageTitle(stage: StageSlot["stage"], status: StageRunStatus): string {
  const base = `${stage.no}. ${stage.title}`
  if (status === "running") return `${base} — 조사 중`
  if (status === "failed") return `${base} — 자료를 못 찾았습니다.`
  return base
}

function summaryMarkdown(stage: StageSlot["stage"], status: StageRunStatus): string {
  const lines: string[] = []
  lines.push(`# ${stageTitle(stage, status)}`)
  lines.push("")
  lines.push(stage.desc)
  lines.push("")

  if (status === "running") {
    lines.push("아직 조사하고 있습니다.")
    lines.push("")
  } else if (status === "failed") {
    lines.push("이 단계는 자료를 못 찾았습니다.")
    lines.push("")
    return lines.join("\n")
  }

  if (stage.verdict != null) {
    lines.push(`**${verdictLabel(stage.verdict)}**`)
    if (stage.verdictReason != null && stage.verdictReason.trim().length > 0) {
      lines.push(stage.verdictReason)
    }
    lines.push("")
  }

  if (stage.scope != null) {
    const channelNames = stage.scope.channels
      .map((c) => channelLabel[c] ?? c)
      .join(", ")
    const plannedLine =
      stage.scope.planned && stage.scope.planned.length > 0
        ? ` · 규칙으로 미리 돌린 채널: ${stage.scope.planned.map((p) => channelLabel[p] ?? p).join(", ")}`
        : ""
    lines.push(`조사 범위: ${stage.scope.claimType} · ${channelNames} · ${stage.scope.calls}회 호출${plannedLine}`)
    lines.push("")
  }

  const tasks = stage.tasks ?? []
  if (tasks.length > 0) {
    lines.push("## 할 일")
    lines.push("")
    for (const t of tasks) {
      lines.push(`- ${t.task}`)
    }
    lines.push("")
  }

  const findings = stage.findings ?? []
  if (findings.length > 0) {
    lines.push("## 찾은 자료")
    lines.push("")
    for (const f of findings) {
      const grade = f.grade ? ` · ${f.grade}` : ""
      lines.push(`- ${f.name}${grade}`)
      if (f.channel != null) {
        lines.push(`  - ${channelLabel[f.channel] ?? f.channel}`)
      }
      lines.push(`  - ${f.evidence}`)
      if (f.query.trim().length > 0) {
        lines.push(`  - 검색어: ${f.query}`)
      }
    }
    lines.push("")
  }

  const todos = stage.todos ?? []
  if (todos.length > 0) {
    lines.push("## 역할 나눔")
    lines.push("")
    for (const t of todos) {
      lines.push(`- ${t.task} — 역할 나눔: ${t.owner}`)
      if (t.note.trim().length > 0) {
        lines.push(`  - ${t.note}`)
      }
    }
    lines.push("")
  }

  const choices = stage.choices ?? []
  if (choices.length > 0) {
    lines.push("## 갈림길")
    lines.push("")
    for (const c of choices) {
      lines.push(`- ${c}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

function findingDoc(stageNo: number, idx: number, f: Finding): SourceDoc {
  const lines: string[] = []
  lines.push(`# ${f.name}`)
  lines.push("")
  if (f.grade) {
    lines.push(`**근거 등급**: ${f.grade}`)
    lines.push("")
  }
  const chLabel = f.channel != null ? (channelLabel[f.channel] ?? f.channel) : "—"
  lines.push(`종류: ${f.kind} · 단계: ${stageNo} · 출처: ${chLabel}`)
  lines.push("")
  if (f.grade != null) {
    const parts: string[] = []
    parts.push(`근거 등급: ${f.grade}`)
    if (f.channel != null) parts.push(`채널: ${chLabel}`)
    lines.push(parts.join(", "))
    lines.push("")
  }
  lines.push("## 근거")
  lines.push("")
  lines.push(f.evidence)
  if (f.query.trim().length > 0) {
    lines.push("")
    lines.push(`검색어: ${f.query}`)
  }
  lines.push("")
  lines.push("## 제약 주의")
  lines.push("")
  lines.push(f.note)
  return {
    id: `${STAGEPREFIX}${stageNo}-finding-${idx}`,
    kind: "finding",
    stageNo,
    title: f.name,
    subtitle: f.kind,
    url: f.url,
    evidence: f.evidence,
    markdown: lines.join("\n"),
    status: "done",
  }
}

function taskDoc(stageNo: number, idx: number, t: Task): SourceDoc {
  const lines: string[] = []
  lines.push(`# ${t.task}`)
  lines.push("")
  lines.push(`단계: ${stageNo}`)
  lines.push("")
  lines.push(`**왜**: ${t.why}`)
  lines.push("")
  lines.push(`순서: ${t.order}`)
  return {
    id: `${STAGEPREFIX}${stageNo}-task-${idx}`,
    kind: "item",
    stageNo,
    title: t.task,
    subtitle: "할 일",
    markdown: lines.join("\n"),
    status: "done",
  }
}

function todoDoc(stageNo: number, idx: number, t: Todo): SourceDoc {
  const lines: string[] = []
  lines.push(`# ${t.task}`)
  lines.push("")
  lines.push(`**누가**: ${t.owner}`)
  lines.push("")
  if (t.note.trim().length > 0) {
    lines.push(`**메모**: ${t.note}`)
  }
  return {
    id: `${STAGEPREFIX}${stageNo}-todo-${idx}`,
    kind: "item",
    stageNo,
    title: t.task,
    subtitle: `역할 나눔 ${t.owner}`,
    markdown: lines.join("\n"),
    status: "done",
  }
}

function buildFolder(stageNo: number, title: string, children: SourceDoc[], status: StageRunStatus): SourceDoc {
  return {
    id: `${STAGEPREFIX}${stageNo}${title}`,
    kind: "folder",
    stageNo,
    title,
    markdown: "",
    status,
    children,
  }
}

/** 왼쪽 패널에 보여 줄 조사 결과 폴더·파일 트리를 세션에서 파생한다. */
export function sourceTree(session: Session): SourceDoc[] {
  if (!session.bigPicture) return []

  const stages = session.stages
  return stages.map((slot) => buildStage(slot)) as SourceDoc[]
}

function buildStage(slot: StageSlot): SourceDoc {
  const stage = slot.stage
  const stageNo = stage.no
  const status = slot.status

  const children: SourceDoc[] = []

  // 1) 요약 파일
  children.push(summaryDoc(stageNo, stage, status))

  // 2) 소주제 폴더들
  const outline = slot.outline
  const outlineItems: OutlineItem[] = []
  if (outline) {
    collectOutlineItems(outline, outlineItems)
  }

  const topicFolders = outline
    ? outline
        .map((topic, i) => buildTopicFolder(stageNo, stage, topic, i, outlineItems, status))
        .filter((f): f is SourceDoc => f !== null)
    : []

  children.push(...topicFolders)

  // 3) 소주제에 배치되지 않은 항목 (단계 폴더 바로 아래)
  const orphanFindings = stage.findings ?? []
  const orphanTasks = stage.tasks ?? []
  const orphanTodos = stage.todos ?? []

  const placed: { findings: Set<string>; tasks: Set<string>; todos: Set<string> } = {
    findings: new Set(),
    tasks: new Set(),
    todos: new Set(),
  }
  for (const it of outlineItems) {
    placed[it.kind].add(it.ref)
  }

  const placedFindingIds = placed.findings
  const placedTaskIds = placed.tasks
  const placedTodoIds = placed.todos

  const remainingFindings = orphanFindings.filter((_, i) => !placedFindingIds.has(`finding-${i}`))
  const remainingTasks = orphanTasks.filter((_, i) => !placedTaskIds.has(`task-${i}`))
  const remainingTodos = orphanTodos.filter((_, i) => !placedTodoIds.has(`todo-${i}`))

  const orphans: SourceDoc[] = [
    ...remainingFindings.map((f, i) => findingDoc(stageNo, i, f)),
    ...remainingTodos.filter((t) => t.owner === "가져다 씀").map((t, i) => todoDoc(stageNo, i, t)),
    ...remainingTasks.map((t, i) => taskDoc(stageNo, i, t)),
    ...remainingTodos.filter((t) => t.owner === "직접 함").map((t, i) => todoDoc(stageNo, i, t)),
  ]

  children.push(...orphans)

  return {
    ...stageDoc(stageNo, stage, status),
    children,
  }
}

type OutlineItem = { kind: "finding" | "task" | "todo"; ref: string; idx: number }

function collectOutlineItems(topics: OutlineTopic[], out: OutlineItem[]): void {
  for (const topic of topics) {
    for (const ref of topic.items) {
      const [kind, idxStr] = ref.split("-")
      const idx = parseInt(idxStr, 10)
      if (kind && !isNaN(idx)) {
        out.push({ kind: kind as OutlineItem["kind"], ref, idx })
      }
    }
    if (topic.topics) {
      collectOutlineItems(topic.topics, out)
    }
  }
}

function buildTopicFolder(
  stageNo: number,
  stage: StageSlot["stage"],
  topic: OutlineTopic,
  topicIndex: number,
  outlineItems: OutlineItem[],
  status: StageRunStatus,
): SourceDoc | null {
  if (topic.items.length === 0) return null

  const folderId = `${STAGEPREFIX}${stageNo}-t${topicIndex}`
  const depth = countDepth(topic)

  if (depth === 0) {
    // 평평한 소주제 폴더
    const children = topicItemsToDocs(stageNo, stage, topic.items, outlineItems, status)
    return {
      ...buildFolder(stageNo, `-t${topicIndex}`, children, status),
      id: folderId,
    }
  }

  // 2층: 소주제 폴더 안에 하위 토픽 폴더
  const children: SourceDoc[] = []
  if (topic.topics) {
    for (let j = 0; j < topic.topics.length; j++) {
      const subtopic = topic.topics[j]
      if (subtopic.items.length === 0) continue
      const subChildren = topicItemsToDocs(stageNo, stage, subtopic.items, outlineItems, status)
      const subFolder: SourceDoc = {
        id: `${folderId}-${j}`,
        kind: "folder",
        stageNo,
        title: subtopic.title,
        markdown: "",
        status,
        children: subChildren,
      }
      children.push(subFolder)
    }
  }

  return {
    ...buildFolder(stageNo, `-t${topicIndex}`, children, status),
    id: folderId,
    title: topic.title,
  }
}

function countDepth(topic: OutlineTopic): number {
  if (!topic.topics || topic.topics.length === 0) return 0
  let max = 0
  for (const sub of topic.topics) {
    max = Math.max(max, 1 + countDepth(sub))
  }
  return max
}

function topicItemsToDocs(
  stageNo: number,
  stage: StageSlot["stage"],
  refs: string[],
  _outlineItems: OutlineItem[],
  status: StageRunStatus,
): SourceDoc[] {
  const findings = stage.findings ?? []
  const tasks = stage.tasks ?? []
  const todos = stage.todos ?? []

  const docs: SourceDoc[] = []
  for (const ref of refs) {
    const [kind, idxStr] = ref.split("-")
    const idx = parseInt(idxStr, 10)
    if (!kind || isNaN(idx)) continue
    if (kind === "finding" && idx >= 0 && idx < findings.length) {
      docs.push(findingDoc(stageNo, idx, findings[idx]))
    } else if (kind === "task" && idx >= 0 && idx < tasks.length) {
      docs.push(taskDoc(stageNo, idx, tasks[idx]))
    } else if (kind === "todo" && idx >= 0 && idx < todos.length) {
      docs.push(todoDoc(stageNo, idx, todos[idx]))
    }
  }
  return docs
}

/** 문서 id의 조상 폴더 id 목록. 인용 배지가 문서를 열 때 조상을 펼치는 데 쓴다. */
export function sourceAncestors(tree: SourceDoc[], id: string): string[] {
  const result: string[] = []
  walkAncestors(tree, id, result)
  return result
}

function walkAncestors(nodes: SourceDoc[], id: string, acc: string[]): boolean {
  for (const node of nodes) {
    const isFolder = node.kind === "stage" || node.kind === "folder"
    if (isFolder && node.children) {
      acc.push(node.id)
      if (node.id === id) {
        return true
      }
      if (walkAncestors(node.children, id, acc)) {
        return true
      }
      acc.pop()
    } else if (node.children) {
      if (walkAncestors(node.children, id, acc)) {
        return true
      }
    } else if (node.id === id) {
      return true
    }
  }
  return false
}

/** 트리에서 id에 해당하는 문서를 재귀적으로 찾는다. */
export function findDoc(tree: SourceDoc[], id: string): SourceDoc | null {
  for (const node of tree) {
    if (node.id === id) return node
    if (node.children) {
      const found = findDoc(node.children, id)
      if (found) return found
    }
  }
  return null
}

function trimmedNonEmpty(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = s.trim()
  return t.length > 0 ? t : null
}

function shortLabel(text: string, maxLen: number): string {
  const t = text.trim()
  return t.length > maxLen ? t.slice(0, maxLen) + "…" : t
}

export function mindmapTree(session: Session): MindmapNode {
  const rootLabel =
    trimmedNonEmpty(session.mapTitle) ??
    trimmedNonEmpty(session.bigPicture?.title) ??
    "제목 없는 로드맵"

  const root: MindmapNode = {
    id: "root",
    label: rootLabel,
    hint: rootLabel,
    data: { full: rootLabel },
    children: session.bigPicture != null ? session.stages.map((slot) => stageNode(session, slot)) : [],
  }
  return root
}

function stageNode(session: Session, slot: StageSlot): MindmapNode {
  const stage = slot.stage
  const no = stage.no
  const status: MindmapNode["status"] =
    slot.status === "running"
      ? "busy"
      : slot.status === "done"
        ? "done"
        : slot.status === "failed"
          ? "failed"
          : undefined

  const labelRaw = `${no}. ${stage.title}`
  const label = shortLabel(labelRaw, 28)
  const hint = stage.desc
  const dot =
    stage.verdict != null
      ? { verdict: stage.verdict, color: verdictColor(stage.verdict), title: verdictTitle(stage.verdict) }
      : undefined

  const children = buildStageChildren(session, slot, no, stage)
  return {
    id: `s${no}`,
    label,
    status,
    hint,
    data: { full: hint },
    dot,
    children: children.length > 0 ? children : undefined,
  }
}

function buildStageChildren(session: Session, slot: StageSlot, no: number, stage: Stage): MindmapNode[] {
  const outline = slot.outline
  const topicNodes: MindmapNode[] = []
  const placed = new Set<string>()

  if (outline) {
    for (let i = 0; i < outline.length; i++) {
      const topicNode = buildTopicNode(session, slot, no, stage, outline[i], i, outline, placed)
      if (topicNode != null) topicNodes.push(topicNode)
    }
  }

  // 소주제에 안 붙은 잎 — 왼쪽 패널 orphan 배치 순서와 동일하게
  const orphan = orphanLeaves(session, slot, no, placed)
  return [...topicNodes, ...orphan]
}

function buildTopicNode(
  session: Session,
  slot: StageSlot,
  no: number,
  stage: Stage,
  topic: OutlineTopic,
  topicIndex: number,
  outline: OutlineTopic[],
  placed: Set<string>,
): MindmapNode | null {
  if (topic.items.length === 0) return null

  const id = `s${no}-t${topicIndex}`
  const label = shortLabel(topic.title, 18)
  const hint = topic.title

  const depth = countDepth(topic)
  let children: MindmapNode[] = []

  if (depth === 0) {
    // 평평한 소주제 — items를 그대로 잎으로
    children = topicItemsToMindmap(session, slot, no, stage, topic.items, placed)
  } else {
    // 중첩 소주제
    if (topic.topics) {
      for (let j = 0; j < topic.topics.length; j++) {
        const sub = topic.topics[j]
        if (sub.items.length === 0) continue
        const subId = `${id}-${j}`
        const subLabel = shortLabel(sub.title, 18)
        const subChildren = topicItemsToMindmap(session, slot, no, stage, sub.items, placed)
        if (subChildren.length > 0) {
          children.push({
            id: subId,
            label: subLabel,
            hint: sub.title,
            data: { full: sub.title },
            children: subChildren,
          })
        }
      }
    }
  }

  if (children.length === 0) return null

  return {
    id,
    label,
    hint,
    data: { full: hint },
    children: children.length > 0 ? children : undefined,
  }
}

function topicItemsToMindmap(
  session: Session,
  slot: StageSlot,
  no: number,
  stage: Stage,
  refs: string[],
  placed: Set<string>,
): MindmapNode[] {
  const out: MindmapNode[] = []
  const findings = stage.findings ?? []
  const tasks = stage.tasks ?? []
  const todos = stage.todos ?? []

  // 소주제 안 항목은 출처 그대로 — 왼쪽 패널과 같은 번호 체계를 쓴다
  for (const ref of refs) {
    const [kind, idxStr] = ref.split("-")
    const idx = parseInt(idxStr, 10)
    if (!kind || isNaN(idx)) continue
    placed.add(ref)

    if (kind === "finding" && idx >= 0 && idx < findings.length) {
      const f = findings[idx]
      out.push(findingLeaf(no, idx, f))
    } else if (kind === "task" && idx >= 0 && idx < tasks.length) {
      const t = tasks[idx]
      out.push(taskLeaf(no, idx, t))
    } else if (kind === "todo" && idx >= 0 && idx < todos.length) {
      const t = todos[idx]
      out.push(todoLeaf(no, idx, t))
    }
  }
  return out
}

function orphanLeaves(session: Session, slot: StageSlot, no: number, placed: Set<string>): MindmapNode[] {
  const stage = slot.stage
  const findings = stage.findings ?? []
  const tasks = stage.tasks ?? []
  const todos = stage.todos ?? []
  const out: MindmapNode[] = []

  // 1) 자료 중 소주제에 안 붙은 것
  for (let i = 0; i < findings.length; i++) {
    const key = `finding-${i}`
    if (!placed.has(key)) out.push(findingLeaf(no, i, findings[i]))
  }
  // 2) 가져다 쓰는 역할 나눔
  for (let i = 0; i < todos.length; i++) {
    const key = `todo-${i}`
    if (!placed.has(key) && todos[i].owner === "가져다 씀") out.push(todoLeaf(no, i, todos[i]))
  }
  // 3) 할 일
  for (let i = 0; i < tasks.length; i++) {
    const key = `task-${i}`
    if (!placed.has(key)) out.push(taskLeaf(no, i, tasks[i]))
  }
  // 4) 직접 하는 역할 나눔
  for (let i = 0; i < todos.length; i++) {
    const key = `todo-${i}`
    if (!placed.has(key) && todos[i].owner === "직접 함") out.push(todoLeaf(no, i, todos[i]))
  }
  return out
}

function findingLeaf(no: number, idx: number, f: Finding): MindmapNode {
  const label = shortLabel(f.name, 18)
  const full = [f.name, f.evidence, f.url].filter(Boolean).join("\n")
  return {
    id: `s${no}-finding-${idx}`,
    label,
    hint: full,
    data: { full },
  }
}

function taskLeaf(no: number, idx: number, t: Task): MindmapNode {
  const label = shortLabel(t.task, 18)
  return {
    id: `s${no}-task-${idx}`,
    label,
    hint: t.why,
    data: { full: t.why },
  }
}

function todoLeaf(no: number, idx: number, t: Todo): MindmapNode {
  const label = shortLabel(t.task, 18)
  return {
    id: `s${no}-todo-${idx}`,
    label,
    hint: t.note,
    data: { full: t.note },
  }
}

function verdictColor(v: Verdict): string {
  switch (v) {
    case "가져다 써도 됨":
      return "var(--verdict-가져다-써도-됨)"
    case "직접 해야 함":
      return "var(--verdict-직접-해야-함)"
    case "섞어야 함":
      return "var(--verdict-섞어야-함)"
    case "선례를 못 찾음":
      return "var(--verdict-선례를-못-찾음)"
  }
}

function verdictTitle(v: Verdict): string {
  switch (v) {
    case "가져다 써도 됨":
      return "이미 있음"
    case "직접 해야 함":
      return "없음"
    case "섞어야 함":
      return "일부만 있음"
    case "선례를 못 찾음":
      return "못 찾음"
  }
}

/** 트리와 노드 id를 받아 그 노드의 조상 id 목록을 돌려준다(펼침 처리용). */
export function mindmapAncestors(tree: MindmapNode, id: string): string[] {
  const result: string[] = []
  walkMindmapAncestors(tree, id, result)
  return result
}

function walkMindmapAncestors(node: MindmapNode, id: string, acc: string[]): boolean {
  if (node.id === id) return true
  const kids = node.children
  if (kids) {
    for (const c of kids) {
      acc.push(node.id)
      if (walkMindmapAncestors(c, id, acc)) return true
      acc.pop()
    }
  }
  return false
}