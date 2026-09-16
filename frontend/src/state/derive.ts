import type { MindmapNode } from "../components/mindmap-spine-tree"
import type { Verdict, StageRunStatus, Stage } from "./types"
import { VERDICTS } from "./types"
import type { Session, SourceDoc, StageSlot, Finding, Task, Todo, OutlineTopic } from "./types"
import { buildPlanningDoc } from "./planningDoc"

const CHANNEL_HOST: Record<string, string> = {
  stats: "kosis.kr",
  law: "law.go.kr",
  public_data: "data.go.kr",
  oss: "github.com",
}

function extractHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.host
  } catch {
    return null
  }
}

/**
 * 게이트웨이가 돌려준 조사 결과(findings)에서 주소 없는 항목과
 * 호스트가 채널과 맞지 않는 항목을 걸러 낸다.
 *
 * - url이 http로 시작하지 않으면 통째로 버린다.
 * - URL 파싱으로 호스트를 꺼내지 못하면 버린다.
 * - 남은 항목은 호스트를 꺼내 채널과 대조한다.
 *   stats → kosis.kr, law → law.go.kr, public_data → data.go.kr, oss → github.com
 *   web은 대조하지 않는다.
 * - 호스트가 기대 값이거나 그 값으로 끝나지 않으면 channel과 grade를 빼고 자료 자체는 남긴다.
 * - 원본 배열은 고치지 않고 새 배열을 반환한다.
 */
export function sanitizeHermesFindings(input: Finding[]): Finding[] {
  const out: Finding[] = []
  for (const f of input) {
    if (typeof f.url !== "string" || !f.url.startsWith("http")) {
      continue
    }
    const host = extractHost(f.url)
    if (host == null) {
      continue
    }
    const expectedHost = CHANNEL_HOST[f.channel ?? ""]
    if (expectedHost != null && f.channel != null) {
      if (host !== expectedHost && !host.endsWith(expectedHost)) {
        const { channel, grade, ...rest } = f
        out.push(rest)
        continue
      }
    }
    out.push(f)
  }
  return out
}

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
  oss: "오픈소스(GitHub)",
  public_data: "공공데이터포털",
  stats: "국가통계(KOSIS)",
  law: "국가법령정보",
  web_review: "블로그·카페 후기",
}

/** findings의 kind를 자료 행 부제(7종)로 정리 */
export function findingKindLabel(kind: string | undefined): string {
  if (kind == null) return ""
  if (kind === "튜토리얼·블로그") return "튜토리얼 블로그"
  return kind
}

const TITLE_BRING = "이미 있는 것, 가져다 쓰거나 손봐서 씁니다"
const TITLE_DIRECT = "직접 만들 것, 참고할 자료가 없어 직접 만듭니다"
const TITLE_BUSY = "아직 조사하고 있습니다"
const TITLE_FAILED = "이 단계는 자료를 못 찾았습니다"

const BRING_OWNER = "가져다 씀"
const ITEM_DOT: Record<"existing" | "need", NonNullable<MindmapNode["dot"]>> = {
  existing: { verdict: "existing", color: "var(--verdict-existing)", title: "이미 있는 것 — 가져다 쓰거나 손봐서 씁니다." },
  need: { verdict: "need", color: "var(--verdict-need)", title: "직접 만들 것 — 가져다 쓸 자료가 없어 직접 만듭니다." },
}

export const channelShort: Record<string, string> = {
  web: "웹",
  oss: "GitHub",
  public_data: "공공데이터",
  stats: "통계",
  law: "법령",
  web_review: "후기",
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

export function asText(v: unknown): string {
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
    title: "단계 요약",
    subtitle: `${stage.no}. ${asText(stage.title)}`,
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
  if (status !== "done") {
    const title = `${stage.no}. ${asText(stage.title)}`
    const label = status === "failed" ? "자료를 못 찾았습니다." : "조사 중…"
    return [`# ${title}`, "", stage.desc ? `${asText(stage.desc)}\n` : "", label].join("\n")
  }
  const lines: string[] = []
  lines.push(`# ${stage.no}. ${asText(stage.title)}`, "")
  if (stage.desc) lines.push(asText(stage.desc), "")
  lines.push(`**판정** — ${verdictLabel(normalizeVerdict(stage.verdict))}`)
  if (stage.verdictReason) lines.push("", asText(stage.verdictReason))
  if (stage.scope != null) {
    const channels = (stage.scope.channels ?? []).map((c) => channelLabel[asText(c)] ?? asText(c))
    const planned = (stage.scope.planned ?? []).map((c) => channelLabel[asText(c)] ?? asText(c))
    lines.push("", `**조사 범위** — ${asText(stage.scope.claimType) || "확인 불가"} · 채널 ${channels.length ? channels.join(" · ") : "없음"} · 호출 ${stage.scope.calls ?? 0}회${planned.length ? ` · 규칙으로 미리 돌린 채널 ${planned.join(" · ")}` : ""}`)
  }
  const findings = stage.findings ?? []
  const todos = stage.todos ?? []
  if (findings.length) {
    lines.push("", "## 찾은 자료", "")
    for (const f of findings) {
      lines.push(`- **${asText(f.name)}** (${asText(f.kind)})`)
      if (f.evidence) lines.push(`  - ${asText(f.evidence)}`)
      if (f.url) lines.push(`  - ${asText(f.url)}`)
    }
  }
  if (todos.length) {
    lines.push("", "## 이미 있는 것 / 직접 해야 하는 것", "")
    for (const t of todos) lines.push(`- [${asText(t.owner)}] ${asText(t.task)}${t.note ? ` — ${asText(t.note)}` : ""}`)
  }
  return lines.join("\n")
}

function findingDoc(stage: Stage, idx: number, f: Finding): SourceDoc {
  const lines: string[] = [`# ${f.name}`, ""]
  lines.push(`**종류** — ${f.kind || "자료"} · **단계** — ${stage.no}. ${stage.title}${f.url ? ` · **출처** — ${f.url}` : ""}`)
  if (f.grade || f.channel) lines.push(`**근거 등급** — ${f.grade || "확인 불가"}${f.channel ? ` · **채널** — ${channelLabel[f.channel] ?? f.channel}` : ""}`)
  lines.push("", "## 근거")
  if (f.evidence) lines.push(`- ${f.evidence}`)
  if (f.query) lines.push(`- 찾은 검색어 — ${f.query}`)
  if (!f.evidence && !f.query) lines.push("- 확인 불가")
  if (f.note) lines.push("", "## 제약·주의", `- ${f.note}`)
  return {
    id: `stage-${stage.no}-finding-${idx}`,
    kind: "finding",
    stageNo: stage.no,
    title: f.name,
    subtitle: f.kind || "자료",
    url: f.url,
    evidence: f.evidence,
    markdown: lines.join("\n"),
    status: "done",
  }
}

function taskDoc(stage: Stage, idx: number, t: Task): SourceDoc {
  const task = t.task
  const lines: string[] = [`# ${task}`, ""]
  const why = t.why
  lines.push(`**종류** — 할 일 · **단계** — ${stage.no}. ${stage.title}`, "", "## 무엇을", `- ${task}`, "", "## 왜", `- ${why || "확인 불가"}`)
  const related = (stage.findings ?? []).slice(0, 3).map((f) => f.name).filter(Boolean)
  if (related.length) lines.push("", "## 관련", `- 같은 단계 자료 — ${related.join(" · ")}`)
  return {
    id: `stage-${stage.no}-task-${idx}`,
    kind: "item",
    stageNo: stage.no,
    title: task,
    subtitle: "할 일",
    markdown: lines.join("\n"),
    status: "done",
  }
}

function todoDoc(stage: Stage, idx: number, t: Todo): SourceDoc {
  const task = t.task
  const lines: string[] = [`# ${task}`, ""]
  const owner = t.owner
  lines.push(`**종류** — 역할 나눔 · **누가** — ${owner || "확인 불가"} · **단계** — ${stage.no}. ${stage.title}`, "", "## 무엇을", `- ${task}`)
  if (t.note) lines.push("", "## 메모", `- ${t.note}`)
  const related = (stage.findings ?? []).slice(0, 3).map((f) => f.name).filter(Boolean)
  if (related.length) lines.push("", "## 관련", `- 같은 단계 자료 — ${related.join(" · ")}`)
  return {
    id: `stage-${stage.no}-todo-${idx}`,
    kind: "item",
    stageNo: stage.no,
    title: task,
    subtitle: `역할 나눔 · ${owner || "확인 불가"}`,
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
  const stageDocs = stages
    .filter((slot) => slot.status !== "pending")
    .map((slot) => buildStage(slot)) as SourceDoc[]

  const planningDoc = buildPlanningDoc(session.bigPicture)
  if (planningDoc) {
    return [planningDoc, ...stageDocs]
  }
  return stageDocs
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
    placed[it.kind + "s"].add(it.ref)
  }

  const placedFindingIds = placed.findings
  const placedTaskIds = placed.tasks
  const placedTodoIds = placed.todos

  const orphans: SourceDoc[] = [
    ...orphanFindings.flatMap((f, i) =>
      placedFindingIds.has(`finding-${i}`) ? [] : [findingDoc(stage, i, f)]
    ),
    ...orphanTodos.flatMap((t, i) =>
      placedTodoIds.has(`todo-${i}`) ? [] : t.owner === "가져다 씀" ? [todoDoc(stage, i, t)] : []
    ),
    ...orphanTasks.flatMap((t, i) =>
      placedTaskIds.has(`task-${i}`) ? [] : [taskDoc(stage, i, t)]
    ),
    ...orphanTodos.flatMap((t, i) =>
      placedTodoIds.has(`todo-${i}`) ? [] : t.owner === "직접 함" ? [todoDoc(stage, i, t)] : []
    ),
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
    const children = topicItemsToDocs(stage, topic.items, outlineItems, status)
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
      const subChildren = topicItemsToDocs(stage, subtopic.items, outlineItems, status)
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
      docs.push(findingDoc(stage, idx, findings[idx]))
    } else if (kind === "task" && idx >= 0 && idx < tasks.length) {
      docs.push(taskDoc(stage, idx, tasks[idx]))
    } else if (kind === "todo" && idx >= 0 && idx < todos.length) {
      docs.push(todoDoc(stage, idx, todos[idx]))
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

/**
 * 마인드맵 노드 라벨 길이 상한. 부품은 라벨을 `whitespace-nowrap` 으로 재서 폭을 잡으므로
 * 문장을 그대로 넣으면 레이아웃이 폭발하고 fit 줌이 트리를 점만 하게 줄인다(실측).
 * 전문은 `data.full` 에 남겨 노드 설명이 쓴다.
 */
export const LABEL_MAX = 28

export function shortLabel(text: unknown, max = LABEL_MAX): string {
  const t = asText(text).replace(/\s+/g, " ").trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/**
 * 잎 라벨 상한 (M5 확장 4차 step-2, 사용자 피드백 H2 「노드 제목이 이렇게 긴 게 이상하다」 · 확정 「규칙 먼저」).
 * 18 은 튜닝값 — fan 레이아웃에서 잎이 오른쪽으로 쌓이므로 우 패널 폭(≈600px)에서 한 줄에 서야 한다.
 * 단계 노드는 종전 `LABEL_MAX`(28, 번호 + 제목) 그대로다.
 */
export const LEAF_LABEL_MAX = 18

/** 구두점 앞에서 자르는 자리 — `(` · ` — ` · `: ` · `|`. 부제·괄호 설명·경로 꼬리가 이 뒤에 온다(실측 라벨: 「Strava Clubs V3 API (/clubs/:id/activities)」). */
const LEAF_CUT = /\(|\b — |\b: |\|/g
/** 구두점이 이 안(앞 3자)에서 시작하면 그 규칙은 건너뛴다 — 「(가칭) …」처럼 머리 괄호를 자르면 빈 라벨이 된다. */
const LEAF_CUT_MIN = 3

/**
 * 잎 라벨 축약 규칙 — 순수 함수. 전문은 호출부가 `hint`(호버)·`data.full`(노드 설명)에 따로 든다.
 *   1) 첫 구두점(`(`·` — `·`: `·`|`) 앞에서 자른다. 단 그 구두점이 앞 3자 안이면 건너뛴다.
 *   2) 그래도 `max` 를 넘으면 `max` 이전 마지막 공백에서 자르고 말줄임표를 붙인다(공백이 앞 3자 안이면 글자 단위로).
 *   결과 길이 ≤ max + 1(말줄임표). 빈 문자열은 내지 않는다 — 규칙이 전부 비우면 원문 앞을 그대로 쓴다.
 * 규칙으로 어색한 라벨은 finding 큐(LLM 축약) 몫이다 — 여기서 하지 않는다.
 */
export function nodeLabel(text: unknown, max = LEAF_LABEL_MAX): string {
  const full = asText(text).replace(/\s+/g, " ").trim()
  let t = full
  LEAF_CUT.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LEAF_CUT.exec(full))) {
    if (m.index >= LEAF_CUT_MIN) {
      t = full.slice(0, m.index).trim()
      break
    }
  }
  if (!t) t = full
  if (t.length <= max) return t
  const space = t.lastIndexOf(" ", max)
  const head = space >= LEAF_CUT_MIN ? t.slice(0, space) : t.slice(0, max - 1)
  return `${head.trim()}…`
}

export function mindmapTree(session: Session): MindmapNode {
  const rootLabel =
    trimmedNonEmpty(session.mapTitle) ??
    trimmedNonEmpty(session.bigPicture?.title) ??
    "제목 없는 패스"

  const root: MindmapNode = {
    id: "root",
    label: shortLabel(rootLabel, LABEL_MAX + 8),
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

  const labelRaw = `${no}. ${asText(stage.title)}`
  const label = shortLabel(labelRaw, LABEL_MAX)
  const hint = stage.desc

  const dot = verdictDot(slot)

  const children = buildStageChildren(session, slot, no, stage)
  return {
    id: `s${no}`,
    label,
    status,
    hint,
    data: { kind: "stage", no, status: slot.status, full: labelRaw },
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
  const label = nodeLabel(topic.title)
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
        const subLabel = nodeLabel(sub.title)
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
  const full = asText(f.name)
  return {
    id: `s${no}-finding-${idx}`,
    label: nodeLabel(full),
    hint: full,
    dot: ITEM_DOT.existing,
    data: { kind: "finding", full, own: "existing", f },
  }
}

function taskLeaf(no: number, idx: number, t: Task): MindmapNode {
  const full = asText(t.task)
  return {
    id: `s${no}-task-${idx}`,
    label: nodeLabel(full),
    hint: full,
    dot: ITEM_DOT.need,
    data: { kind: "task", full, own: "need", t },
  }
}

function todoLeaf(no: number, idx: number, t: Todo): MindmapNode {
  const full = asText(t.task)
  const own = asText(t.owner) === BRING_OWNER ? "existing" : "need"
  return {
    id: `s${no}-todo-${idx}`,
    label: nodeLabel(full),
    hint: full,
    dot: ITEM_DOT[own],
    data: { kind: "todo", full, own, t },
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

export function mindmapLegend() {
  const items: LegendItem[] = (["existing", "need"] as const).map((k) => ({ label: ITEM_DOT[k].title.split(" — ")[0], ...ITEM_DOT[k] }))
  items.push({ verdict: "pending", label: "조사 중", title: "아직 조사하고 있습니다.", color: "var(--verdict-none)", hollow: true })
  return items
}

const VERDICT_TO_HUMAN: Record<Verdict, string> = {
  "가져다 써도 됨": "이미 나와 있는 것을 가져다 쓰면 됩니다",
  "직접 해야 함": "직접 만들어야 하는 부분입니다",
  "섞어야 함": "가져다 쓸 것과 직접 만들 것이 섞여 있습니다",
  "선례를 못 찾음": "참고할 자료를 찾지 못했습니다",
}

// 서버가 고정으로 채워 넣는 판정 이유 문장. models 이 비운 reason을 서버가 대신 넣은 것.
// displayStageResult에서 이것과 같으면 셋째 문단을 붙이지 않는다 — 같은 말이 단계마다 반복돼 보이지 않게.
const SERVER_FILLED_VERDICT_REASONS = [
  "자료를 확인했습니다.",
  "조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다.",
  "Solar 호출 단계에서 오류가 발생해 조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다.",
] as const

/** 이유 문단에서 판정 줄에 올릴 첫 문장과 남는 이유를 고른다. */
function pickVerdictSentence(
  reason: string | undefined,
): { verdictSentence: string | null; remainingReason: string | null } {
  if (reason == null) return { verdictSentence: null, remainingReason: null }
  const trimmed = reason.trim()
  if (trimmed.length === 0) return { verdictSentence: null, remainingReason: null }

  if (SERVER_FILLED_VERDICT_REASONS.includes(trimmed as (typeof SERVER_FILLED_VERDICT_REASONS)[number])) {
    return { verdictSentence: null, remainingReason: null }
  }

  const stripped = trimBoldWrapper(trimmed)
  const text = stripped !== null ? stripped : trimmed

  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  let candidateText: string
  if (lines.length > 0 && /^[-*]\s/.test(lines[0])) {
    const allItems = lines.every((l) => /^[-*]\s/.test(l))
    if (allItems) {
      candidateText = lines[0].replace(/^[-*]\s+/, '')
    } else {
      candidateText = text
    }
  } else {
    candidateText = text
  }

  const firstSentence = extractFirstSentence(candidateText)
  if (firstSentence == null) {
    return { verdictSentence: null, remainingReason: text }
  }
  if (firstSentence.length > 120) {
    return { verdictSentence: null, remainingReason: text }
  }

  const remaining = candidateText.slice(firstSentence.length).trim()
  return {
    verdictSentence: firstSentence,
    remainingReason: remaining.length > 0 ? remaining : null,
  }
}

function trimBoldWrapper(text: string): string | null {
  const m = text.match(/^\*\*(.+)\*\*$/)
  if (m) return m[1]
  return null
}

function extractFirstSentence(text: string): string | null {
  const m = text.match(/^[^\n.!?]*[.!?]/)
  if (m) return m[0]
  const line = text.split('\n')[0]
  if (line.trim().length > 0) return line.trim()
  return null
}

/** 본문에 자료 인용 마커([1] 형태)가 이미 붙어 있는지 본다. */
function hasCitationMarkers(text: string): boolean {
  return /\[\d+\]/.test(text)
}

/**
 * 단계 표시 본문(판정 문장·이유 문단)에, findings에서 본문과 그대로 겹치는 자료 이름 앞에
 * 1기반 순서 번호를 붙인다. 저장본·서버 응답은 바꾸지 않고 표시용 문자열만 수정한다.
 * - 본문에 이미 인용 마커가 하나라도 있으면 건드리지 않는다.
 * - 같은 이름이 findings에 두 번 이상 있으면 모호하므로 건너뛴다.
 * - 이름 글자열이 단어 경계에 맞게 그대로 나오는 첫 자리에만 붙인다(부분 겹침은 건너뛴다).
 */
function attachFindingCitationsToBody(text: string, findings: readonly Finding[]): string {
  if (!text || !findings || findings.length === 0) return text
  if (hasCitationMarkers(text)) return text

  const nameCounts: Record<string, number> = {}
  for (const f of findings) {
    if (!f.name) continue
    nameCounts[f.name] = (nameCounts[f.name] ?? 0) + 1
  }

  const candidates: { name: string; idx: number }[] = []
  for (let i = 0; i < findings.length; i++) {
    const name = findings[i].name
    if (!name) continue
    if (nameCounts[name] === 1) {
      candidates.push({ name, idx: i + 1 })
    }
  }
  candidates.sort((a, b) => b.name.length - a.name.length)

  let result = text
  for (const { name, idx } of candidates) {
    const pos = findLiteralPosition(result, name)
    if (pos === -1) continue
    result =
      result.slice(0, pos + name.length) + ` [${idx}]` + result.slice(pos + name.length)
  }
  return result
}

/** 텍스트에서 이름이 단어 경계에 맞게 그대로 나오는 첫 위치를 찾는다. 없으면 -1. */
function findLiteralPosition(text: string, name: string): number {
  let pos = 0
  while (true) {
    const idx = text.indexOf(name, pos)
    if (idx === -1) return -1
    const before = idx > 0 ? text[idx - 1] : ''
    const after = idx + name.length < text.length ? text[idx + name.length] : ''
    if (!isWordChar(before) && !isWordChar(after)) return idx
    pos = idx + 1
  }
}



/** 텍스트에서 이름이 단어 경계에 맞게 그대로 나오는 첫 위치를 찾는다. 없으면 -1. */
function isWordChar(c: string): boolean {
  if (!c) return false
  const code = c.charCodeAt(0)
  return (
    (code >= 0x1100 &&
      (code <= 0x11ff ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7af) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x20000 && code <= 0x2fffd) ||
        (code >= 0x30000 && code <= 0x3fffd) ||
        code === 0x3001 ||
        code === 0x3002 ||
        code === 0x002e ||
        code === 0x002c ||
        code === 0x003a ||
        code === 0x003b)) ||
    (code >= 0x0030 && code <= 0x0039) ||
    (code >= 0x0041 && code <= 0x005a) ||
    (code >= 0x0061 && code <= 0x007a)
  )
}

const CHANNEL_HUMAN: Record<string, string> = {
  web: "웹",
  oss: "GitHub",
  public_data: "공공데이터",
  stats: "통계",
  law: "법령",
  web_review: "후기",
}

/**
 * 채널 집계를 사람 말로 편다. 예: [{channel:'web',count:2},{channel:'law',count:1}]
 * → "웹에서 자료 2건 · 법령에서 자료 1건"
 */
function channelTallyHuman(tally: { channel: string; count: number }[]): string {
  if (tally.length === 0) return ""
  return tally
    .map((t) => {
      const name = CHANNEL_HUMAN[t.channel] ?? t.channel
      return `${name}에서 자료 ${t.count}건`
    })
    .join(" · ")
}

/**
 /** 저장된 결과 줄·진행 줄을 사람 말로 바꿔 돌려준다.
  * 결과 줄도 진행 줄도 아니면 입력 그대로 돌려준다.
  *
  * 결과 줄 저장 형식(flow.ts runStage §8):
  *   `${번호}. ${제목}\n\n**${verdict}**${tal리Suffix}${마커Suffix}`
  *   tallySuffix = ` (웹 2·법령 1)` 형태, markerSuffix = ` [1, 2]` 형태
  *
  * 진행 줄 저장 형식:
  *   `${번호}. ${제목} · ${상태}` — 이음표(·)로 제목과 상태를 잇는다
  */
 function stageResultLine(
   numStr: string,
   title: string,
   verdict: string,
   markerRaw: string | undefined,
   stage?: Stage,
 ): string {
   const first = `## ${numStr}. ${title}`
   const humanVerdict = VERDICT_TO_HUMAN[verdict as Verdict]
   let second = `**${humanVerdict}**`
   if (markerRaw) {
     const inner = markerRaw.slice(1, -1).trim()
     if (inner.length > 0) {
       const nums = inner.split(',').map((s) => s.trim()).filter(Boolean)
       if (nums.length > 0) {
         second += ' ' + nums.map((n) => `[${n}]`).join(' ')
       }
     }
   }
   const out = [first, second]
   if (stage?.verdictReason && stage.verdictReason.trim().length > 0) {
     const { verdictSentence, remainingReason } = pickVerdictSentence(stage.verdictReason)
     if (stage.verdictLine && stage.verdictLine.trim().length > 0) {
       out.push(stage.verdictLine.trim())
       if (verdictSentence && verdictSentence.trim() === stage.verdictLine.trim()) {
         if (remainingReason && remainingReason.trim().length > 0) {
           out.push(remainingReason)
         }
       } else if (verdictSentence && verdictSentence.trim().length > 0) {
         out.push(verdictSentence)
         if (remainingReason && remainingReason.trim().length > 0) {
           out.push(remainingReason)
         }
       } else if (remainingReason && remainingReason.trim().length > 0) {
         out.push(remainingReason)
       }
     } else {
       const parts: string[] = []
       if (verdictSentence) {
         parts.push(`**${verdictSentence}**`)
       }
       if (remainingReason != null && remainingReason.trim().length > 0) {
         parts.push(remainingReason)
       }
       if (parts.length > 0) {
         out.push(parts.join('\n\n'))
       }
     }
   }
   return out.join('\n\n')
 }

 export function displayStageResult(text: string, stage?: Stage): string {
  // 결과 줄: "번호. 제목\n\n**계약값** (채널집계)[마커]" — 두 문단+α로 폰다
  const resultRe =
    /^(\d+)\. (.+)\n\n\*\*(가져다 써도 됨|직접 해야 함|섞어야 함|선례를 못 찾음)\*\*\s*(\(.*?\))?(\[.*?\])?$/
  const resultMatch = text.match(resultRe)
  if (resultMatch) {
    const [, numStr, title, verdict, , markerRaw] = resultMatch
    return stageResultLine(numStr, title, verdict, markerRaw, stage)
  }

  // 결과 줄(구형): "번호. 제목 → **계약값** (채널집계)[마커]" — 한 줄에 화살표+계약값
  const arrowResultRe =
    /^(\d+)\. (.+) → \*\*(가져다 써도 됨|직접 해야 함|섞어야 함|선례를 못 찾음)\*\*\s*(\(.*?\))?(\[.*?])?$/
  const arrowResultMatch = text.match(arrowResultRe)
  if (arrowResultMatch) {
    const [, numStr, title, verdict, , markerRaw] = arrowResultMatch
    return stageResultLine(numStr, title, verdict, markerRaw, stage)
  }

  // 진행 줄: "번호. 제목 · 상태" — 이음표를 두고 한 줄로 편다
  const progressRe = /^(\d+)\. (.+) · (.+)$/
  const progressMatch = text.match(progressRe)
  if (progressMatch) {
    const [, numStr, title, status] = progressMatch
    return `${numStr}. ${title} · ${status}`
  }

  return text
}

/**
 * 왼쪽 패널 문서 트리에서 인용 하나를 자료 문서(SourceDoc)로 되찾는다.
 * 인용 id가 있으면 findDoc으로 찾고, 없거나 못 찾으면 트리를 어느 깊이든 훑어
 * kind가 finding이고 제목(트리 안 title, 앞뒤 공백 제거)이 인용 title과 같은 문서를 찾는다.
 * 어느 경로도 예외를 던지지 않는다 — 답변 렌더가 죽으면 안 된다.
 */
export function resolveCitation(
  tree: SourceDoc[] | null | undefined,
  citation: { n: number; title: string; id?: string },
  index?: { byTitle: Map<string, SourceDoc> },
): SourceDoc | null {
  if (!tree || tree.length === 0) return null
  try {
    if (citation.id) {
      const byId = findDoc(tree, citation.id)
      if (byId) return byId
    }
    const idx = index ?? findingIndex(tree)
    const title = citation.title.trim()
    return idx.byTitle.get(title) ?? null
  } catch {
    return null
  }
}

/**
 * sourceTree 결과 트리를 한 번 훑어, 문서 id와 문서 제목(트리 안 title, trim)으로
 * 자료를 찾을 수 있는 맵 두 개를 만든다. resolveCitation이 재사용할 수 있다.
 */
export function findingIndex(
  tree: SourceDoc[] | null | undefined,
): { byId: Map<string, SourceDoc>; byTitle: Map<string, SourceDoc> } {
  const byId = new Map<string, SourceDoc>()
  const byTitle = new Map<string, SourceDoc>()
  if (!tree) return { byId, byTitle }
  walkForCitations(tree, byId, byTitle)
  return { byId, byTitle }
}

function walkForCitations(
  nodes: SourceDoc[],
  byId: Map<string, SourceDoc>,
  byTitle: Map<string, SourceDoc>,
): void {
  for (const node of nodes) {
    if (node.kind === "finding") {
      if (node.id) byId.set(node.id, node)
      const t = node.title.trim()
      if (t.length > 0 && !byTitle.has(t)) {
        byTitle.set(t, node)
      }
    }
    if (node.children) {
      walkForCitations(node.children, byId, byTitle)
    }
  }
}

const CITATION_MODE = import.meta.env?.VITE_CITATION_MODE === "tail" ? "tail" : "model"

/** 이름 비교용 정규화 — 공백·문장부호를 걷고 소문자로. `chat.mjs` 의 `normName` 과 같은 뜻이다. */
function normCiteName(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[\s·,.()[\]{}「」『』"'`_\-–—]/g, "")
}
/** 느슨하게 맞춰 본다 — 한쪽이 비면 통과(맞춰 볼 거리가 없다), 포함 관계나 앞머리 4자 이상 일치면 같은 것으로 본다. */
function citeNameMatches(name: unknown, docName: unknown): boolean {
  const a = normCiteName(name)
  const b = normCiteName(docName)
  if (!a || !b) return true
  if (a === b || a.includes(b) || b.includes(a)) return true
  const head = Math.min(a.length, b.length, 8)
  return head >= 4 && a.slice(0, head) === b.slice(0, head)
}

export type GroundedStage = {
  /** 본문 마커가 **최종 번호로 다시 매겨진** 문장들 */
  verdictLine: string
  verdictReason: string
  /** `[n]` 의 n-1 이 가리키는 자료의 **원래 `findings` 인덱스**. 배지 id·제목이 이 순서를 따른다. */
  order: number[]
  /** 이름이 안 맞거나 없는 번호라서 버린 마커 수 — 지어내기 지표로 센다(step-16) */
  dropped: number
  /** `order` 중 **본문에 실제로 달린** 개수. 나머지(꼬리)는 결과 줄 끝의 마커가 받는다. */
  citedInBody: number
}

export function attachMarksByName(text: string, cites: Array<{ n: number; name: string }>): string {
  const src = String(text ?? "")
  const list = cites.filter((c) => Number.isInteger(c.n) && c.n > 0 && String(c.name ?? "").trim().length >= 2)
  if (!src.trim() || !list.length) return src
  const used = new Set<number>()
  return src
    .split(/(?<=[.!?])(?=\s)|(?=\n)/)
    .map((part) => {
      if (/[\[\]\d{1,2}\]/.test(part)) return part
      const hit = list.find((c) => !used.has(c.n) && part.includes(c.name))
      if (!hit) return part
      used.add(hit.n)
      const m = /^([\s\S]*?)([.!?]\s*)$/.exec(part)
      return m ? `${m[1]} [${hit.n}]${m[2]}` : `${part} [${hit.n}]`
    })
    .join("")
}