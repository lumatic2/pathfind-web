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
  }
}

function summaryDoc(stageNo: number, stage: StageSlot["stage"], status: StageRunStatus): SourceDoc {
  return {
    id: `${STAGEPREFIX}${stageNo}-summary`,
    kind: "summary",
    stageNo,
    title: `${stageNo}. ${stage.title}`,
    markdown: "",
    status,
    findingCount: stage.findings?.length ?? 0,
    verdict: stage.verdict ?? undefined,
  }
}

function findingDoc(stageNo: number, idx: number, f: Finding): SourceDoc {
  return {
    id: `${STAGEPREFIX}${stageNo}-finding-${idx}`,
    kind: "finding",
    stageNo,
    title: f.name,
    subtitle: f.kind,
    url: f.url,
    evidence: f.evidence,
    markdown: "",
    status: "done",
  }
}

function taskDoc(stageNo: number, idx: number, t: Task): SourceDoc {
  return {
    id: `${STAGEPREFIX}${stageNo}-task-${idx}`,
    kind: "item",
    stageNo,
    title: t.task,
    subtitle: "할 일",
    markdown: "",
    status: "done",
  }
}

function todoDoc(stageNo: number, idx: number, t: Todo): SourceDoc {
  return {
    id: `${STAGEPREFIX}${stageNo}-todo-${idx}`,
    kind: "item",
    stageNo,
    title: t.task,
    subtitle: `${t.owner} — ${t.owner === "가져다 씀" ? "가져다 써도 됨" : "직접 해야 함"}`,
    markdown: "",
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
