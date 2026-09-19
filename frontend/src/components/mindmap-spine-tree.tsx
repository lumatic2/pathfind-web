/**
 * Mindmap Spine Tree — 두 레이아웃.
 *
 *   `roadmap`(기본) — **뿌리(최종 목표) 아래 단계 노드가 한 줄로 좌→우 서는 위→아래 트리.** 단계 사이 가로선은 없고
 *     뿌리의 `⌄` 에서 단계로 세로 S 곡선이 갈라진다(사용자 확정 2026-09-13). 각 단계는 다시 **위→아래 계층 트리의 루트**다:
 *     `⌄` 를 누르면 자식이 부모 아래 한 줄에 가로로 펼쳐지고 부모는 자식 묶음의 가운데에 앉는다(고전 tidy tree —
 *     같은 깊이 = 같은 줄, 토글은 노드 아래 가운데, 연결선은 토글 원 중심에서 자식 상단 중앙으로 세로 S 곡선).
 *     사용자 확정 구조(2026-09-12, 3차).
 *   `fan` — Google Gemini Notebook(구 NotebookLM) 마인드맵 관측에서 이식한 부챗살 트리: 루트에서 오른쪽으로
 *     갈라지는 후위순회 트리 + 부모 접힘 버튼 한 점에서 나는 베지어 + `<`/`>` 방향 어포던스.
 *
 * 공통 (원본 실조작 관측 — `evidence/m116/2026-09-12-mindmap-screenshot-observation.md` §11, 회수일 2026-09-12):
 *   - 깊이별 **색상(hue) 램프** — 노드 바탕·그 노드의 어포던스 원·그 노드로 들어오는 선이 같은 깊이 색.
 *     원본 팔레트는 가져오지 않고 우리 semantic 토큰(primary → emphasis → info → accent → success)으로 잇는다.
 *   - **생성·소멸 애니메이션** — 펼치면 자식이 부모 위치에서 생겨나 제자리로 이동하고, 접으면 부모 위치로 되돌아가며
 *     사라진다. 형제·조상은 동시에 재배치된다.
 *   - **카메라** — 토글을 누르면 **그 노드(와 드러난 자식)가 뷰포트 중앙**에 오도록 팬이 노드 이동과 **동시에** 움직인다.
 *     배율은 가독 배율(1×) 아래로 내려가지 않고, 한 번 올라간 배율은 유지한다(사용자 결정 2026-09-12 — 원본은 이동 뒤
 *     전체 맞춤이었으나 깊게 펼칠수록 줌아웃되어 기각). 첫 표시만 전체 맞춤(≤1×).
 * 좌표계 3겹 분리 (`cookbook/layouts/horizontal-tree-layout.md`): 1) 트리 좌표(줌을 모른다) → 2) 컨테이너 하나의
 * `translate(pan) scale(zoom)` → 3) DOM(`transform: translate(x, y)` + svg path 하나).
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDownUp, ChevronsUpDown, Download, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * 노드가 지금 어떤 상태인가 — **트리가 살아서 채워지는 동안** 쓴다(M121).
 * 없으면 상태 없음(정적 트리). 이름은 도메인 중립이다: 조사·생성·동기화 어느 쪽이든 같은 세 값으로 읽힌다.
 */
export type MindmapNodeStatus = "busy" | "done" | "failed"

export type MindmapNode = {
  id: string
  label: string
  children?: MindmapNode[]
  /**
   * 진행 상태(M121). 표시는 **부품이 소유한다** — 라벨에 「· 조사 중」 같은 꼬리표를 이어 붙이지 않는다.
   * 라벨은 폭 측정의 입력이라, 상태 문자열을 얹으면 그만큼 레이아웃 예산을 먹고 fit 줌이 내려간다(소비자 실측).
   */
  status?: MindmapNodeStatus
  /**
   * 호버 설명(M5 확장 2차 step-2 — 참조 구현 국소 추가, 상류 등재 대상).
   * 라벨에 이어 붙이면 폭 측정 예산을 먹는 부가 정보(수량 등)를 여기로 뺀다.
   * 네이티브 `title` 로 나가므로 키보드 포커스로는 뜨지 않는다 — 라벨만으로 뜻이 서야 한다.
   */
  hint?: string
  /**
   * 라벨 앞 색 점(M5 확장 2차 step-3 — 참조 구현 국소 추가, 상류 등재 대상).
   * 라벨 꼬리에 판정을 산문으로 이어 붙이는 대신 한 글자 크기의 신호로 낸다.
   * `title` 이 그 뜻을 말하므로 **색만으로 뜻이 서야 한다고 가정하지 않는다**.
   * `hollow` 는 아직 판정이 없다는 뜻 — 채운 점과 섞이면 거짓 판정으로 읽힌다.
   */
  /**
   * `split`(0~1, 참조 구현 국소 추가 M5 4차 보강 3) — 두 색 분할 점: 시계 방향으로 `color` 가 `split` 비율만큼, 나머지는 `color2`.
   * 단계처럼 「항목의 합」인 노드가 항목 색 두 개로 비율을 보인다. 없으면 한 색 점.
   */
  dot?: { verdict: string; color: string; title: string; hollow?: boolean; split?: number; color2?: string }
  /** 소비자 payload — 부품은 읽지 않는다. `onNodeSelect`/`onSelectedChange` 뒤 소비자가 꺼내 쓴다(M117 결정 3). */
  data?: unknown
}

/** 노드 본체 클릭·Enter 의 뜻. 어포던스 원은 어느 모드에서든 펼침/접힘이다. */
export type MindmapClickBehavior = "toggle-and-select" | "select-only"

export type MindmapLayout = "roadmap" | "fan"

export type MindmapSpineTreeProps = {
  layout?: MindmapLayout
  /**
   * 트리 뿌리 — 두 레이아웃 공통. `roadmap` 은 뿌리 = 최종 목표, `root.children` = 단계(좌→우 순서), 그 아래가 작업 트리다
   * (사용자 확정 2026-09-13 — 단계 사이 가로선 없음, 뿌리에서 단계로 세로 S 곡선).
   */
  root?: MindmapNode
  /** @deprecated `roadmap` 호환 — 뿌리 없이 단계만 주면 `aria-label` 을 라벨로 한 뿌리를 만들어 얹는다. `root` 를 쓴다. */
  stages?: MindmapNode[]
  /** `fan` 기본 펼침 깊이(원본 실측 = 루트 + 1단계). `roadmap` 에서는 열린 단계 트리의 기본 펼침 깊이. */
  defaultExpandedDepth?: number
  /** `roadmap` 에서 처음부터 열어 둘 단계 id. 기본은 전부 닫힘. */
  defaultOpenStages?: string[]
  /** 노드 클릭·Enter. 목적지(질의 생성·원문 점프·팝오버)는 소비자가 정한다. */
  onNodeSelect?: (node: MindmapNode) => void
  /**
   * 펼침 집합 제어(M117). 주면 제어 모드 — 부품은 내부 state 를 쓰지 않고 `onExpandedChange` 로만 알린다.
   * 안 주면 M116 그대로 비제어(`defaultExpandedDepth`/`defaultOpenStages` 가 초기값).
   */
  expandedIds?: ReadonlySet<string> | readonly string[]
  onExpandedChange?: (ids: string[]) => void
  /** 선택 노드 제어(M117). 안 주면 내부 state. 선택 시각 = 바탕 한 단계 진하게(`data-selected`) — 포커스 링과 다른 신호. */
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
  /**
   * 노드 본체 클릭의 뜻(M117 결정 3). 기본 `toggle-and-select` = M116 사후 변경 6(본체 클릭 = 펼침/접힘 + 선택).
   * `select-only` = 본체 클릭은 선택만, 펼침/접힘은 어포던스 원·방향키가 한다 — 셸처럼 「노드 = 질문 생성기」로 쓸 때.
   */
  clickBehavior?: MindmapClickBehavior
  /** 우하단 조작 스택 아래의 빈 자리 — 소비자 액션. */
  controlsSlot?: ReactNode
  /**
   * 우하단 조작 스택 **왼쪽** 범례 자리(M5 4차 보강 2 step-17 — 「점 색의 뜻을 바로 읽게」). 부품은 자리만 준다 —
   * 점이 무엇을 뜻하는지는 소비자가 안다(데이터 그래프의 범례처럼 상시). 캔버스 끌기를 막지 않게 포인터를 통과시킨다.
   */
  legendSlot?: ReactNode
  /**
   * 다운로드(원본 관측 2026-09-13: 우하단 4번째 원). 기본은 부품이 현재 트리를 **투명 배경 PNG(2×)** 로 내보낸다(보이는 노드·선·
   * 어포던스, 색은 computed 값으로 굳힘 — 다크면 다크 그대로; SVG → canvas 래스터). 콜백을 주면 SVG 문자열을 넘기고 저장은
   * 소비자 몫(서버 저장·다른 포맷). `false` 면 버튼 없음.
   */
  onDownload?: ((svg: string) => void) | false
  /** 내보내는 파일 이름(확장자 제외) — 기본 aria-label */
  downloadName?: string
  "aria-label"?: string
  className?: string
}

// ── 치수 (트리 좌표 px — 줌 적용 전) ────────────────────────────────────────────
const NODE_H = 36
const ROW_PITCH = 48
const ROW_GAP = ROW_PITCH - NODE_H // 12
const GAP_X = 56
const STAGE_GAP_X = 72
const AFF_D = 24 // 어포던스 원 지름
const AFF_HIT = 44 // 히트 영역 (dimension.size.touch-target-min)
const AFF_OFFSET = 8
const AFF_SPAN = AFF_OFFSET + AFF_D
const PAD_X = 14
/** 판정 점 지름과 라벨까지의 간격. 폭 산출(`estimateWidth`)·측정판·SVG 내보내기가 **같은 값**을 쓴다. */
const DOT_D = 8
const DOT_GAP = 7
const DOT_SPAN = DOT_D + DOT_GAP
const SIBLING_GAP = 24 // roadmap: 같은 줄 형제 사이
const LEVEL_PITCH = NODE_H + AFF_OFFSET + AFF_D + 24 // 92 — 깊이 한 줄(노드 36 + 아래 토글 원 32 + 여백 24)
const ZOOM_MIN = 0.25
const ZOOM_MAX = 2
const LEVEL_BTN = 1
const LEVEL_WHEEL = 0.25
const FIT_PADDING = 32
/** 원본 관측 ≈ 0.5~0.8초. 500 → 650 → 700ms(사용자 조정). 노드·선·카메라가 같은 시간을 달린다. */
export const MOTION_MS = 700
/** 가독 배율 — 토글 시 카메라가 이 아래로 내려가지 않는다. */
const READABLE_ZOOM = 1
const MOTION_EASE = "cubic-bezier(0.2, 0, 0, 1)"
const zoomOf = (level: number) => Math.pow(2, level / 2)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// 깊이 색상 램프 — 원본은 보라→파랑→민트→초록 hue 램프(가지별이 아니다). 우리 semantic 토큰으로 같은 구조를 잇는다.
// 5단 너머는 마지막 단계 유지. `wash` = 노드·어포던스 원 바탕, `line` = 그 깊이로 들어오는 연결선.
// ⚠ `in oklab` 이어야 한다 — 이 테마의 `--card` 는 `oklch(1 0 0)` 로 **hue 0 을 가진 흰색**이라 oklch 보간에서 모든 hue 를
// 0°(빨강·자홍) 쪽으로 끌어당긴다(실측: indigo 277° 가 338° 로 찍혔다). oklab 은 직교 좌표라 흰색이 hue 를 오염시키지 않는다.
const DEPTH_HUES: Array<{ wash: string; line: string }> = [
  { wash: "color-mix(in oklab, var(--card) 62%, var(--primary) 38%)", line: "color-mix(in oklab, var(--card) 45%, var(--primary) 55%)" },
  { wash: "color-mix(in oklab, var(--card) 74%, var(--emphasis-solid) 26%)", line: "color-mix(in oklab, var(--card) 50%, var(--emphasis-solid) 50%)" },
  { wash: "color-mix(in oklab, var(--card) 70%, var(--info-link) 30%)", line: "color-mix(in oklab, var(--card) 45%, var(--info-link) 55%)" },
  { wash: "var(--accent)", line: "color-mix(in oklab, var(--accent) 55%, var(--success-foreground) 45%)" },
  { wash: "color-mix(in oklab, var(--card) 74%, var(--success-foreground) 26%)", line: "color-mix(in oklab, var(--card) 50%, var(--success-foreground) 50%)" },
]
function hueStep(depth: number): number {
  return Math.min(Math.max(0, depth), DEPTH_HUES.length - 1)
}
export function nodeFill(depth: number): string {
  return DEPTH_HUES[hueStep(depth)].wash
}
export function edgeStroke(depth: number): string {
  return DEPTH_HUES[hueStep(depth)].line
}
/** 선택 노드 바탕 — 같은 깊이 색을 한 단계 진하게(먹 12% 덮기). 포커스 링(테두리)과 다른 신호라 둘이 겹쳐도 읽힌다. */
export function selectedFill(depth: number): string {
  return `color-mix(in oklab, ${nodeFill(depth)} 88%, var(--foreground) 12%)`
}

// ── 레이아웃 산출 형 ────────────────────────────────────────────────────────────
export type PlacedNode = {
  node: MindmapNode
  depth: number
  x: number
  y: number
  w: number
  parentId: string | null
  hasChildren: boolean
  expanded: boolean
  /** roadmap 단계 노드(깊이 0). */
  stage: boolean
  /** roadmap 에서 속한 단계 id (단계 자신이면 자기 id). */
  stageId: string | null
}
export type Edge = { fromId: string; toId: string; x0: number; y0: number; x1: number; y1: number; depth: number; vertical: boolean }
export type Layout = { nodes: PlacedNode[]; edges: Edge[]; width: number; height: number }
export type LayoutInput = { expanded: ReadonlySet<string>; widths: ReadonlyMap<string, number> }

function estimateWidth(n: MindmapNode): number {
  // 측정 전 임시값 — CJK 를 넉넉히 잡아 첫 프레임 겹침을 막는다.
  return Math.max(64, Math.round(n.label.length * 9 + PAD_X * 2 + (n.dot ? DOT_SPAN : 0)))
}

/** 부챗살 트리(`fan`) — 후위순회 y 배정 + 깊이별 x 누적. 접힌 서브트리는 계산에서 통째로 빠진다(재압축). */
export function layoutTree(root: MindmapNode, input: LayoutInput): Layout {
  const { expanded, widths } = input
  const widthOf = (n: MindmapNode) => widths.get(n.id) ?? estimateWidth(n)
  const isOpen = (n: MindmapNode) => Boolean(n.children?.length) && expanded.has(n.id)

  // pass 1 — 가시 노드로 깊이별 열 폭 (노드 폭 + 오른쪽 어포던스 원)
  const colWidth: number[] = []
  const visit = (n: MindmapNode, d: number) => {
    colWidth[d] = Math.max(colWidth[d] ?? 0, widthOf(n) + (n.children?.length ? AFF_SPAN : 0))
    if (isOpen(n)) for (const c of n.children!) visit(c, d + 1)
  }
  visit(root, 0)
  const colX: number[] = []
  let acc = 0
  for (let d = 0; d < colWidth.length; d++) {
    colX[d] = acc
    acc += colWidth[d] + GAP_X
  }

  // pass 2 — 후위순회 y
  const out: Layout = { nodes: [], edges: [], width: Math.max(0, acc - GAP_X), height: 0 }
  let cursor = 0
  const place = (n: MindmapNode, d: number, parentId: string | null): { y: number; x: number } => {
    const open = isOpen(n)
    const w = widthOf(n)
    let y: number
    let kids: Array<{ y: number; x: number; id: string; depth: number }> = []
    if (open) {
      kids = n.children!.map((c) => ({ ...place(c, d + 1, n.id), id: c.id, depth: d + 1 }))
      y = (kids[0].y + kids[kids.length - 1].y) / 2
    } else {
      y = cursor
      cursor += ROW_PITCH
    }
    const x = colX[d]
    out.nodes.push({ node: n, depth: d, x, y, w, parentId, hasChildren: Boolean(n.children?.length), expanded: open, stage: false, stageId: null })
    if (open) {
      // 기점 = 어포던스 원 중심 (노드 모서리가 아니다 — M116-004). 종점 = 자식 좌측 중앙.
      const x0 = x + w + AFF_OFFSET + AFF_D / 2
      const y0 = y + NODE_H / 2
      for (const k of kids) out.edges.push({ fromId: n.id, toId: k.id, x0, y0, x1: k.x, y1: k.y + NODE_H / 2, depth: k.depth, vertical: false })
    }
    return { y, x }
  }
  place(root, 0, null)
  out.height = Math.max(cursor - ROW_GAP, NODE_H)
  return out
}

/** 노드 아래 토글 원의 중심 (roadmap — 모든 깊이 공통, 노드 가로 중앙 아래). */
function belowToggleCenter(p: { x: number; y: number; w: number }): { x: number; y: number } {
  return { x: p.x + p.w / 2, y: p.y + NODE_H + AFF_OFFSET + AFF_D / 2 }
}

/**
 * roadmap — 단계 한 줄, 각 단계는 **위→아래 계층 트리의 루트**. 고전 tidy tree: 서브트리 폭 = max(노드 폭, 자식 서브트리
 * 폭 합 + 간격), 자식은 그 폭 안에 가로로 나열되고 부모는 그 가운데. 깊이 d 의 y = d × LEVEL_PITCH. 접힌 서브트리는
 * 자기 노드 폭만 차지한다(재압축). 열린 단계의 트리 폭만큼 다음 단계가 오른쪽으로 밀린다.
 */
export function layoutRoadmap(root: MindmapNode, input: LayoutInput): Layout {
  const widthOf = (n: MindmapNode) => input.widths.get(n.id) ?? estimateWidth(n)
  const isOpen = (n: MindmapNode) => Boolean(n.children?.length) && input.expanded.has(n.id)
  // 형제 간격 — 뿌리 바로 아래(단계 줄)만 넓다(72), 그 아래는 24
  const gapFor = (parentDepth: number) => (parentDepth === 0 ? STAGE_GAP_X : SIBLING_GAP)
  const subW = new Map<string, number>()
  const measure = (n: MindmapNode, depth: number): number => {
    let w = widthOf(n)
    if (isOpen(n)) {
      const kids = n.children!.map((c) => measure(c, depth + 1))
      w = Math.max(w, kids.reduce((a, b) => a + b, 0) + gapFor(depth) * (kids.length - 1))
    }
    subW.set(n.id, w)
    return w
  }
  const out: Layout = { nodes: [], edges: [], width: 0, height: NODE_H }
  const place = (n: MindmapNode, depth: number, left: number, parentId: string | null, stageId: string | null): PlacedNode => {
    const w = widthOf(n)
    const sw = subW.get(n.id)!
    const ny = depth * LEVEL_PITCH
    const has = Boolean(n.children?.length)
    const open = isOpen(n)
    const myStage = depth === 1 ? n.id : stageId
    // 자식을 먼저 놓고 부모는 첫/막내 자식 중심의 중앙에(fan 의 y 규칙과 같다). 자식이 없거나 접혔으면 서브트리 폭 가운데.
    let cx = left + sw / 2
    const kidsPlaced: PlacedNode[] = []
    if (open) {
      const kids = n.children!
      const gap = gapFor(depth)
      const kidsW = kids.reduce((a, c) => a + subW.get(c.id)!, 0) + gap * (kids.length - 1)
      let kl = left + (sw - kidsW) / 2
      for (const c of kids) {
        kidsPlaced.push(place(c, depth + 1, kl, n.id, myStage))
        kl += subW.get(c.id)! + gap
      }
      const first = kidsPlaced[0]
      const last = kidsPlaced[kidsPlaced.length - 1]
      cx = (first.x + first.w / 2 + last.x + last.w / 2) / 2
    }
    const placed: PlacedNode = { node: n, depth, x: cx - w / 2, y: ny, w, parentId, hasChildren: has, expanded: open, stage: depth === 1, stageId: myStage }
    out.nodes.push(placed)
    out.height = Math.max(out.height, ny + NODE_H)
    if (open) {
      const from = belowToggleCenter(placed)
      for (const cp of kidsPlaced) out.edges.push({ fromId: n.id, toId: cp.node.id, x0: from.x, y0: from.y, x1: cp.x + cp.w / 2, y1: cp.y, depth: depth + 1, vertical: true })
    }
    return placed
  }
  out.width = measure(root, 0)
  place(root, 0, 0, null, null)
  return out
}

export function edgePath(e: Edge): string {
  if (e.vertical) {
    const my = (e.y0 + e.y1) / 2
    return `M ${e.x0} ${e.y0} C ${e.x0} ${my}, ${e.x1} ${my}, ${e.x1} ${e.y1}`
  }
  const mx = (e.x0 + e.x1) / 2
  return `M ${e.x0} ${e.y0} C ${mx} ${e.y0}, ${mx} ${e.y1}, ${e.x1} ${e.y1}`
}
/** 생성·소멸 중간상태 — 기점 한 점으로 오그라든 선. */
function collapsedPath(e: Edge): string {
  return `M ${e.x0} ${e.y0} C ${e.x0} ${e.y0}, ${e.x0} ${e.y0}, ${e.x0} ${e.y0}`
}
const edgeKey = (e: Edge) => `${e.fromId}→${e.toId}`

function collectIds(n: MindmapNode, maxDepth: number, depth = 0, out: string[] = []): string[] {
  if (n.children?.length && depth < maxDepth) {
    out.push(n.id)
    for (const c of n.children) collectIds(c, maxDepth, depth + 1, out)
  }
  return out
}
function allNodes(n: MindmapNode, out: MindmapNode[] = []): MindmapNode[] {
  out.push(n)
  for (const c of n.children ?? []) allNodes(c, out)
  return out
}

/**
 * 생성·소멸 추적 — `current` 에 새로 들어온 키는 한 프레임 동안 「미정착」이라 시작 위치(부모)에 그려지고,
 * 빠진 키는 `MOTION_MS` 동안 「소멸 중」으로 남아 부모 위치로 되돌아간다. 원본 관측: 펼침 = 부모에서 생겨나
 * 이동, 접힘 = 부모로 되돌아가며 사라짐.
 *
 * ⚠ diff 는 **렌더 시점**에 한다(effect 가 아니라). effect 로 미루면 빠진 노드가 그 프레임에 한 번 언마운트된 뒤
 * 다시 마운트되어 전이가 안 걸린다 — 접힘 애니메이션이 안 보였던 원인(2026-09-12 실측).
 */
function useEnterLeave<T>(current: ReadonlyMap<string, T>, animate: boolean) {
  const [, bump] = useState(0)
  const store = useRef<{ prev: ReadonlyMap<string, T>; leaving: Map<string, T>; settled: Set<string>; leaveAt: Map<string, number> }>({
    prev: current,
    leaving: new Map(),
    settled: new Set(current.keys()),
    leaveAt: new Map(),
  })
  const st = store.current
  if (st.prev !== current) {
    // 같은 current 로 다시 렌더되면 idempotent — 두 번째 통과에서는 prev === current 라 건너뛴다.
    if (animate) {
      const now = performance.now()
      for (const [k, v] of st.prev) {
        if (!current.has(k)) {
          st.leaving.set(k, v)
          st.leaveAt.set(k, now)
          st.settled.delete(k)
        }
      }
      for (const k of current.keys()) {
        st.leaving.delete(k)
        st.leaveAt.delete(k)
      }
    } else {
      st.leaving.clear()
      st.leaveAt.clear()
      st.settled = new Set(current.keys())
    }
    st.prev = current
  }
  const hasEntering = [...current.keys()].some((k) => !st.settled.has(k))
  const hasLeaving = st.leaving.size > 0
  useLayoutEffect(() => {
    if (!hasEntering) return
    const raf = requestAnimationFrame(() => {
      for (const k of current.keys()) st.settled.add(k)
      bump((n) => n + 1)
    })
    return () => cancelAnimationFrame(raf)
  }, [current, hasEntering, st])
  useEffect(() => {
    if (!hasLeaving) return
    const t = setTimeout(() => {
      const now = performance.now()
      for (const [k, at] of st.leaveAt) {
        if (now - at >= MOTION_MS - 5) {
          st.leaving.delete(k)
          st.leaveAt.delete(k)
        }
      }
      bump((n) => n + 1)
    }, MOTION_MS)
    return () => clearTimeout(t)
  }, [current, hasLeaving, st])
  return { settled: st.settled as ReadonlySet<string>, leaving: st.leaving as ReadonlyMap<string, T> }
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false))
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduce(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduce
}

const EMPTY_ROOT: MindmapNode = { id: "__empty__", label: "" }

// ── 컴포넌트 ───────────────────────────────────────────────────────────────────
export function MindmapSpineTree({
  layout = "roadmap",
  stages,
  root,
  defaultExpandedDepth = 1,
  defaultOpenStages,
  onNodeSelect,
  expandedIds,
  onExpandedChange,
  selectedId,
  onSelectedChange,
  clickBehavior = "toggle-and-select",
  controlsSlot,
  legendSlot,
  onDownload,
  downloadName,
  "aria-label": ariaLabel = layout === "roadmap" ? "Roadmap" : "Mind map",
  className,
}: MindmapSpineTreeProps) {
  const uid = useId()
  // 뿌리 하나 — `stages` 만 온 옛 호출은 aria-label 뿌리를 얹는다(호환)
  const fanRoot = useMemo<MindmapNode>(() => root ?? (stages ? { id: "roadmap-root", label: ariaLabel, children: stages } : EMPTY_ROOT), [root, stages, ariaLabel])
  const stageList = useMemo(() => (layout === "roadmap" ? fanRoot.children ?? [] : []), [layout, fanRoot])
  const reduceMotion = usePrefersReducedMotion()
  const animate = !reduceMotion
  // roadmap 기본: 뿌리 열림(단계 줄 노출) + `defaultOpenStages` 단계만 열림(그 안은 defaultExpandedDepth) · fan 기본: 루트 + defaultExpandedDepth
  const initialExpanded = () =>
    layout === "roadmap" && defaultOpenStages
      ? new Set([fanRoot.id, ...defaultOpenStages.flatMap((id) => {
          const s = stageList.find((st) => st.id === id)
          return s ? [s.id, ...collectIds(s, defaultExpandedDepth).filter((x) => x !== s.id)] : []
        })])
      : new Set(collectIds(fanRoot, defaultExpandedDepth))
  const [expandedState, setExpandedState] = useState<Set<string>>(initialExpanded)
  // 제어/비제어 — `expandedIds` 가 있으면 그것이 진실이고 내부 state 는 읽지 않는다.
  const expandedControlled = expandedIds !== undefined
  const expanded = useMemo<ReadonlySet<string>>(
    () => (expandedIds === undefined ? expandedState : expandedIds instanceof Set ? expandedIds : new Set(expandedIds)),
    [expandedIds, expandedState],
  )
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const commitExpanded = useCallback(
    (next: Set<string>) => {
      if (!expandedControlled) setExpandedState(next)
      onExpandedChange?.([...next])
    },
    [expandedControlled, onExpandedChange],
  )
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const selected = selectedId === undefined ? selectedState : selectedId
  const select = useCallback(
    (node: MindmapNode) => {
      if (selectedId === undefined) setSelectedState(node.id)
      onSelectedChange?.(node.id)
      onNodeSelect?.(node)
    },
    [selectedId, onSelectedChange, onNodeSelect],
  )
  const [widths, setWidths] = useState<Map<string, number>>(() => new Map())
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: FIT_PADDING, y: FIT_PADDING })
  const [cameraMoving, setCameraMoving] = useState(false)
  const [focusedId, setFocusedId] = useState<string>(fanRoot.id)
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; sx: number; sy: number; px: number; py: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  const everyNode = useMemo(() => allNodes(fanRoot), [fanRoot])

  // 라벨 폭 실측 — 숨은 span 의 rect (CJK·폰트 로딩 정합)
  useLayoutEffect(() => {
    const host = measureRef.current
    if (!host) return
    const next = new Map<string, number>()
    for (const el of host.querySelectorAll<HTMLElement>("[data-measure]")) next.set(el.dataset.measure!, Math.ceil(el.getBoundingClientRect().width))
    setWidths(next)
  }, [everyNode])
  const measured = widths.size > 0

  const lay = useMemo(
    () => (layout === "roadmap" ? layoutRoadmap(fanRoot, { expanded, widths }) : layoutTree(fanRoot, { expanded, widths })),
    [layout, fanRoot, expanded, widths],
  )
  const placedById = useMemo(() => new Map(lay.nodes.map((p) => [p.node.id, p])), [lay])
  const edgeById = useMemo(() => new Map(lay.edges.map((e) => [edgeKey(e), e])), [lay])
  const stageOrder = useMemo(() => stageList.map((s) => s.id), [stageList])
  // 가시 순서 — 두 레이아웃 다 줄(y) 우선, 같은 줄은 x (roadmap 도 뿌리 하나의 트리라 단계별 정렬이 필요 없다)
  const visibleOrder = useMemo(() => [...lay.nodes].sort((a, b) => a.y - b.y || a.x - b.x), [lay])

  // 생성·소멸 — 노드는 부모 위치에서 나고 부모 위치로 돌아간다. 선은 기점 한 점에서 자라고 한 점으로 오그라든다.
  const nodeMotion = useEnterLeave(placedById, animate)
  const edgeMotion = useEnterLeave(edgeById, animate)
  /** 노드의 「부모 자리」 — 현재 레이아웃에 살아 있는 가장 가까운 조상의 위치. 조상이 전부 없으면 자기 자리. */
  const anchorOf = (p: PlacedNode): { x: number; y: number } => {
    let cur: PlacedNode | undefined = p
    const seen = new Set<string>()
    while (cur?.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId)
      const parent: PlacedNode | undefined = placedById.get(cur.parentId) ?? nodeMotion.leaving.get(cur.parentId)
      if (!parent) break
      if (placedById.has(parent.node.id)) return { x: parent.x, y: parent.y }
      cur = parent
    }
    return { x: p.x, y: p.y }
  }

  // 토글 → 카메라의 주목 대상. 노드 id 또는 "all"(전부 펼침/접힘). 다음 레이아웃이 계산된 뒤 아래 효과가 소비한다.
  const focusRef = useRef<string | "all" | null>(null)
  const toggle = useCallback(
    (id: string) => {
      focusRef.current = id
      const next = new Set(expandedRef.current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      commitExpanded(next)
    },
    [commitExpanded],
  )

  const allIds = useMemo(() => collectIds(fanRoot, Infinity), [fanRoot])
  const allOpen = useMemo(() => allIds.length > 0 && allIds.every((id) => expanded.has(id)), [allIds, expanded])
  // 접은 상태 = 뿌리 + 단계 줄(단계가 로드맵의 정체라 그 아래로는 안 접는다 — 사용자 규칙 2026-09-13) · 펼친 상태 = 전부.
  // ⚠ 두 레이아웃 공통이다(참조 구현 국소 수정 4차 step-4, 상류 등재 대상) — 원본은 fan 에서 빈 집합(뿌리만)으로 접어 단계 줄이 사라졌다.
  const toggleAll = () => {
    focusRef.current = "all"
    commitExpanded(allOpen ? new Set([fanRoot.id]) : new Set(allIds))
  }

  // 카메라 — 주목 대상(누른 노드 + 드러난 자식, 또는 트리 전체)의 중심을 뷰포트 중앙에. 배율은 READABLE_ZOOM 아래로
  // 내려가지 않고 그 위면 유지한다. 노드 이동과 같은 프레임에 시작해 같은 시간에 끝난다(동시).
  const centerOn = useCallback(
    (box: { x: number; y: number; w: number; h: number }, z: number, moving: boolean) => {
      const vp = viewportRef.current
      if (!vp) return
      const { width: vw, height: vh } = vp.getBoundingClientRect()
      setCameraMoving(moving && animate)
      setZoom(z)
      setPan({ x: vw / 2 - (box.x + box.w / 2) * z, y: vh / 2 - (box.y + box.h / 2) * z })
    },
    [animate],
  )
  const fittedOnce = useRef(false)
  useLayoutEffect(() => {
    if (!measured) return
    const vp = viewportRef.current
    if (!vp) return
    const whole = { x: 0, y: 0, w: lay.width + AFF_SPAN, h: lay.height + AFF_SPAN }
    if (!fittedOnce.current) {
      // 첫 표시 — 전체 맞춤(≤1×), 전이 없음.
      fittedOnce.current = true
      const { width: vw, height: vh } = vp.getBoundingClientRect()
      const z = clamp(Math.min((vw - 2 * FIT_PADDING) / whole.w, (vh - 2 * FIT_PADDING) / whole.h), ZOOM_MIN, READABLE_ZOOM)
      centerOn(whole, z, false)
      return
    }
    const focus = focusRef.current
    if (!focus) return
    focusRef.current = null
    const z = clamp(Math.max(zoom, READABLE_ZOOM), ZOOM_MIN, ZOOM_MAX)
    if (focus === "all") {
      centerOn(whole, z, true)
      return
    }
    const p = placedById.get(focus)
    if (!p) return
    // 주목 상자 = 노드 + (펼쳤으면) 직계 자식 줄
    const kids = p.expanded ? lay.nodes.filter((n) => n.parentId === focus) : []
    const xs = [p.x, p.x + p.w, ...kids.flatMap((k) => [k.x, k.x + k.w])]
    const ys = [p.y, p.y + NODE_H, ...kids.flatMap((k) => [k.y, k.y + NODE_H])]
    const x0 = Math.min(...xs)
    const y0 = Math.min(...ys)
    centerOn({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, z, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom 은 읽기만 한다(줌 변경이 카메라를 다시 움직이면 안 된다)
  }, [lay, measured, centerOn, placedById])

  // 줌 — 커서(또는 뷰포트 중심) 고정점. 버튼은 정수 레벨로 스냅한다(level 2 = 정확히 2×).
  const zoomTo = useCallback((next: number, cx?: number, cy?: number) => {
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const px = cx ?? rect.width / 2
    const py = cy ?? rect.height / 2
    setCameraMoving(false)
    setZoom((z) => {
      const nz = clamp(next, ZOOM_MIN, ZOOM_MAX)
      const k = nz / z
      setPan((p) => ({ x: px - (px - p.x) * k, y: py - (py - p.y) * k }))
      return nz
    })
  }, [])
  // 첫 표시의 연속 줌(예: 0.85×)에서 버튼은 그 방향의 다음 정수 레벨로 스냅한다 — 확대 1회면 정확히 1×.
  const zoomStep = (dir: 1 | -1) => {
    const l = 2 * Math.log2(zoom)
    const near = Math.round(l)
    const base = Math.abs(l - near) < 1e-6 ? near : dir > 0 ? Math.floor(l) : Math.ceil(l)
    zoomTo(zoomOf(base + dir * LEVEL_BTN))
  }
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    zoomTo(zoom * zoomOf(e.deltaY < 0 ? LEVEL_WHEEL : -LEVEL_WHEEL), e.clientX - rect.left, e.clientY - rect.top)
  }

  // 팬 — 여백 드래그. 노드·버튼 위에서 시작한 드래그는 팬이 아니다.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-mindmap-node],button")) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setCameraMoving(false)
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const nx = d.px + (e.clientX - d.sx)
    const ny = d.py + (e.clientY - d.sy)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setPan({ x: nx, y: ny }))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null
  }
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  // 키보드 — roving tabindex.
  //   단계 노드: →/← 단계 이동 · ↓ 트리 열기(열려 있으면 첫 자식으로) · ↑ 트리 닫기
  //   트리 노드(roadmap): ↓ 펼침/첫 자식 · ↑ 접힘/부모 · ←→ 가시 순서 · (fan): → 펼침 · ← 접힘 · ↑↓ 가시 순서
  const focusNode = (id: string) => {
    setFocusedId(id)
    viewportRef.current?.querySelector<HTMLElement>(`[data-mindmap-node="${CSS.escape(id)}"]`)?.focus()
  }
  // 노드 본체 클릭 · Enter/Space 의 뜻 — 모드로 갈린다. 어포던스 원·방향키는 모드와 무관하게 토글이다.
  const activate = (p: PlacedNode) => {
    setFocusedId(p.node.id)
    if (clickBehavior === "toggle-and-select" && p.hasChildren) toggle(p.node.id)
    select(p.node)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = placedById.get(focusedId)
    if (!cur) return
    const idx = visibleOrder.findIndex((p) => p.node.id === focusedId)
    if (cur.stage) {
      const si = stageOrder.indexOf(cur.node.id)
      switch (e.key) {
        case "ArrowRight":
          if (si < stageOrder.length - 1) focusNode(stageOrder[si + 1])
          break
        case "ArrowLeft":
          if (si > 0) focusNode(stageOrder[si - 1])
          break
        case "ArrowDown":
          if (cur.hasChildren && !cur.expanded) toggle(cur.node.id)
          else if (cur.expanded) focusNode(cur.node.children![0].id)
          break
        case "ArrowUp":
          if (cur.expanded) toggle(cur.node.id)
          else if (cur.parentId) focusNode(cur.parentId)
          break
        case "Home":
          focusNode(stageOrder[0])
          break
        case "End":
          focusNode(stageOrder[stageOrder.length - 1])
          break
        case "Enter":
        case " ":
          activate(cur)
          break
        default:
          return
      }
      e.preventDefault()
      return
    }
    // 트리 노드 — roadmap(위→아래)은 ↓ 펼침/첫 자식 · ↑ 접힘/부모 · ←/→ 가시 순서, fan(좌→우)은 축이 반대다.
    const openKey = layout === "roadmap" ? "ArrowDown" : "ArrowRight"
    const closeKey = layout === "roadmap" ? "ArrowUp" : "ArrowLeft"
    const nextKey = layout === "roadmap" ? "ArrowRight" : "ArrowDown"
    const prevKey = layout === "roadmap" ? "ArrowLeft" : "ArrowUp"
    switch (e.key) {
      case openKey:
        if (cur.hasChildren && !cur.expanded) toggle(cur.node.id)
        else if (cur.expanded) focusNode(cur.node.children![0].id)
        break
      case closeKey:
        if (cur.expanded) toggle(cur.node.id)
        else if (cur.parentId) focusNode(cur.parentId)
        break
      case nextKey:
        if (idx < visibleOrder.length - 1) focusNode(visibleOrder[idx + 1].node.id)
        break
      case prevKey:
        if (idx > 0) focusNode(visibleOrder[idx - 1].node.id)
        break
      case "Home":
        focusNode(visibleOrder[0].node.id)
        break
      case "End":
        focusNode(visibleOrder[visibleOrder.length - 1].node.id)
        break
      case "Enter":
      case " ":
        activate(cur)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const motionStyle = animate ? { transitionDuration: `${MOTION_MS}ms`, transitionTimingFunction: MOTION_EASE } : { transitionProperty: "none" as const }
  // DOM 순서는 키 순으로 고정한다 — 소멸 노드를 목록 끝으로 옮기면 DOM 재삽입으로 전이가 끊긴다.
  const renderNodes: Array<{ p: PlacedNode; phase: "entering" | "settled" | "leaving" }> = [
    ...lay.nodes.map((p) => ({ p, phase: nodeMotion.settled.has(p.node.id) ? ("settled" as const) : ("entering" as const) })),
    ...[...nodeMotion.leaving.values()].filter((p) => !placedById.has(p.node.id)).map((p) => ({ p, phase: "leaving" as const })),
  ].sort((a, b) => (a.p.node.id < b.p.node.id ? -1 : a.p.node.id > b.p.node.id ? 1 : 0))
  const renderEdges: Array<{ e: Edge; phase: "entering" | "settled" | "leaving" }> = [
    ...lay.edges.map((e) => ({ e, phase: edgeMotion.settled.has(edgeKey(e)) ? ("settled" as const) : ("entering" as const) })),
    ...[...edgeMotion.leaving.values()].filter((e) => !edgeById.has(edgeKey(e))).map((e) => ({ e, phase: "leaving" as const })),
  ].sort((a, b) => (edgeKey(a.e) < edgeKey(b.e) ? -1 : edgeKey(a.e) > edgeKey(b.e) ? 1 : 0))

  return (
    <div className={cn("relative h-full w-full min-h-[320px] overflow-hidden rounded-xl border border-border bg-background", className)}>
      {/* 라벨 폭 측정판 — `invisible` 이 숨김을 맡고 오프스크린은 레이아웃 간섭만 막는다.
          ⚠ `-left-[9999px]` 만으로는 못 숨긴다: 측정 행은 노드 수만큼 옆으로 길어져
          총폭이 9999 를 넘으면 꼬리가 캔버스 안으로 들어온다(소비자 실측 23,846px).
          `visibility:hidden` 은 레이아웃 상자를 유지하므로 getBoundingClientRect 폭은 그대로 나온다. */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute -left-[9999px] top-0 whitespace-nowrap text-sm font-medium">
        {everyNode.map((n) => (
          <span key={n.id} data-measure={n.id} className="inline-flex items-center px-3.5">
            {/* 점도 폭을 먹는다 — 측정판에 없으면 라벨이 상자를 넘어 잘린다(PNG 내보내기까지 따라 깨진다). */}
            {n.dot && <span className="inline-block shrink-0" style={{ width: DOT_D, height: DOT_D, marginRight: DOT_GAP }} />}
            {n.label}
          </span>
        ))}
      </div>

      <div
        ref={viewportRef}
        role="tree"
        aria-label={ariaLabel}
        aria-describedby={`${uid}-hint`}
        data-mindmap-viewport
        data-layout={layout}
        data-zoom={zoom}
        data-camera-moving={cameraMoving ? "" : undefined}
        className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {/* 2겹 — 뷰포트 변환은 여기 한 번뿐이다. 토글 카메라일 때만 전이한다(드래그·휠·버튼은 즉시). */}
        <div
          data-mindmap-canvas
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: lay.width,
            height: lay.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: cameraMoving ? `transform ${MOTION_MS}ms ${MOTION_EASE}` : "none",
          }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget) setCameraMoving(false)
          }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={lay.width} height={lay.height} aria-hidden>
            {renderEdges.map(({ e, phase }) => (
              <path
                key={edgeKey(e)}
                data-mindmap-edge={edgeKey(e)}
                data-phase={phase}
                d={phase === "settled" ? edgePath(e) : collapsedPath(e)}
                fill="none"
                stroke={edgeStroke(e.depth)}
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={phase === "leaving" ? 0 : 1}
                className="transition-[d,opacity] motion-reduce:transition-none"
                style={motionStyle}
              />
            ))}
          </svg>

          {renderNodes.map(({ p, phase }) => {
            const at = phase === "settled" ? { x: p.x, y: p.y } : anchorOf(p)
            const below = layout === "roadmap"
            return (
              <div
                key={p.node.id}
                data-phase={phase}
                className="absolute left-0 top-0 transition-[transform,opacity] motion-reduce:transition-none"
                style={{ ...motionStyle, transform: `translate(${at.x}px, ${at.y}px)`, opacity: phase === "leaving" ? 0 : 1, pointerEvents: phase === "leaving" ? "none" : undefined }}
              >
                <div
                  role="treeitem"
                  aria-level={p.depth + 1}
                  aria-expanded={p.hasChildren ? p.expanded : undefined}
                  aria-selected={focusedId === p.node.id ? true : undefined}
                  tabIndex={focusedId === p.node.id ? 0 : -1}
                  data-mindmap-node={p.node.id}
                  data-depth={p.depth}
                  title={p.node.hint}
                  data-mindmap-stage={p.stage ? "" : undefined}
                  data-selected={selected === p.node.id ? "" : undefined}
                  // M121 — 진행 상태. `busy` 는 스크린 리더에도 알린다(시각 펄스만으로는 안 전달된다).
                  data-status={p.node.status}
                  aria-busy={p.node.status === "busy" ? true : undefined}
                  onFocus={() => setFocusedId(p.node.id)}
                  // 기본 모드: 본체 클릭도 펼침/접힘(사용자 지시 2026-09-12) + 선택. `select-only`: 선택만.
                  onClick={() => activate(p)}
                  className={cn(
                    "flex cursor-pointer items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium text-foreground outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2",
                    (p.stage || (layout === "roadmap" && p.depth === 0)) && "font-semibold",
                    // 채워지는 중 — 숨쉬듯 옅어졌다 돌아온다. 글리프를 더하지 않는 이유는 라벨 폭이
                    // 이미 측정된 값이라, 아이콘을 끼우면 상자와 실제 내용이 어긋나기 때문이다.
                    p.node.status === "busy" && "motion-safe:animate-pulse",
                    // 실패 — 색을 빼서 물러나게 한다. 남은 가지가 계속 읽혀야 하므로 경고색을 크게 쓰지 않는다.
                    p.node.status === "failed" && "text-muted-foreground opacity-70",
                  )}
                  style={{ height: NODE_H, width: p.w, backgroundColor: selected === p.node.id ? selectedFill(p.depth) : nodeFill(p.depth) }}
                >
                  {p.node.dot && (
                    <span
                      data-verdict={p.node.dot.verdict}
                      title={p.node.dot.title}
                      aria-label={p.node.dot.title}
                      role="img"
                      className="inline-block shrink-0 rounded-full"
                      // ⚠ 색은 `color` 에 싣고 바탕·테두리는 `currentColor` 로 받는다.
                      // 내보내기 SVG 는 `data:` 독립 문서라 `var(--verdict-*)` 가 **거기서 풀리지 않는다** —
                      // `getComputedStyle(...).color` 로 굳혀야 PNG 에 같은 색이 나온다(실측: var() 를 그대로
                      // 실었더니 SVG 에 `fill="var(--verdict-mix)"` 가 박혔다).
                      data-split={p.node.dot.split != null ? p.node.dot.split : undefined}
                      style={{
                        width: DOT_D,
                        height: DOT_D,
                        marginRight: DOT_GAP,
                        color: p.node.dot.color,
                        backgroundColor: p.node.dot.hollow ? "transparent" : "currentColor",
                        // 두 색 분할 점 — 계산된 `background-image` 에 두 색이 rgb 로 풀려 나오므로 내보내기가 거기서 색을 읽는다
                        backgroundImage: p.node.dot.split != null && !p.node.dot.hollow ? `conic-gradient(${p.node.dot.color} ${Math.round(p.node.dot.split * 100)}%, ${p.node.dot.color2 ?? p.node.dot.color} 0)` : undefined,
                        boxShadow: p.node.dot.hollow ? "inset 0 0 0 1.5px currentColor" : undefined,
                      }}
                    />
                  )}
                  {p.node.label}
                </div>
                {p.hasChildren && (
                  // 어포던스 원 = 그 노드의 깊이 색 (원본 실측). roadmap 은 전 깊이 아래(`⌄`/`⌃`), fan 은 오른쪽(`>`/`<`).
                  <Affordance
                    label={p.expanded ? `${p.node.label} 접기` : `${p.node.label} 펼치기`}
                    fill={nodeFill(p.depth)}
                    data-mindmap-affordance={p.node.id}
                    onClick={() => toggle(p.node.id)}
                    style={
                      below
                        ? { left: p.w / 2 - AFF_HIT / 2, top: NODE_H + AFF_OFFSET - (AFF_HIT - AFF_D) / 2 }
                        : { left: p.w + AFF_OFFSET - (AFF_HIT - AFF_D) / 2, top: NODE_H / 2 - AFF_HIT / 2 }
                    }
                  >
                    {below ? (
                      p.expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />
                    ) : p.expanded ? (
                      <ChevronLeft size={14} aria-hidden />
                    ) : (
                      <ChevronRight size={14} aria-hidden />
                    )}
                  </Affordance>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 우하단 조작 스택 — 캔버스 조작만 (M116-010). 형태는 원본 관측(2026-09-13): 무대색 원(전부 펼침/접기) · 세로 pill 안에
          +/− 두 칸(가운데 구분선) · 원(다운로드). 테두리 0, 옅은 그림자. */}
      {legendSlot != null && (
        <div
          data-mindmap-legend-slot
          className="pointer-events-none absolute bottom-4 flex justify-end"
          // 조작 스택(원 48, 우측 16) 왼쪽에 붙고, 좁은 패널에서는 남은 폭 안에서 줄을 바꾼다 — 스택을 가리지 않는다.
          style={{ right: 16 + CONTROL_PX + CONTROL_GAP, maxWidth: `calc(100% - ${16 + CONTROL_PX + CONTROL_GAP + 16}px)` }}
        >
          {legendSlot}
        </div>
      )}
      <div className="absolute bottom-4 right-4 flex flex-col items-center" data-mindmap-controls style={{ gap: CONTROL_GAP }}>
        <ControlButton label={allOpen ? "전부 접기" : "전부 펼치기"} onClick={toggleAll}>
          {allOpen ? <ChevronsDownUp size={20} aria-hidden /> : <ChevronsUpDown size={20} aria-hidden />}
        </ControlButton>
        <div className="flex flex-col overflow-hidden rounded-full bg-muted shadow-sm" data-mindmap-zoom>
          <ControlButton label="확대" onClick={() => zoomStep(1)} grouped>
            <Plus size={20} aria-hidden />
          </ControlButton>
          <div aria-hidden className="mx-2 border-t border-foreground/15" />
          <ControlButton label="축소" onClick={() => zoomStep(-1)} grouped>
            <Minus size={20} aria-hidden />
          </ControlButton>
        </div>
        {onDownload !== false && (
          <ControlButton label="다운로드" data-mindmap-download onClick={() => {
            const svg = exportSvg(viewportRef.current, lay, layout)
            if (onDownload) onDownload(svg)
            else void exportPng(svg).then((png) => saveBlob(`${downloadName ?? ariaLabel}.png`, png))
          }}>
            <Download size={20} aria-hidden />
          </ControlButton>
        )}
        {controlsSlot != null && <div className="flex flex-col" style={{ gap: CONTROL_GAP }}>{controlsSlot}</div>}
      </div>
      <span id={`${uid}-hint`} className="sr-only">
        {layout === "roadmap"
          ? "좌우 화살표로 이동, 아래 화살표로 펼치기, 위 화살표로 접기"
          : "방향키로 이동, 오른쪽 화살표로 펼치기, 왼쪽 화살표로 접기"}
      </span>
    </div>
  )
}

type AffordanceProps = {
  label: string
  fill: string
  onClick: () => void
  style: { left: number; top: number }
  children: ReactNode
  "data-mindmap-affordance"?: string
}
function Affordance({ label, fill, onClick, style, children, ...rest }: AffordanceProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      {...rest}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="absolute flex items-center justify-center"
      style={{ ...style, width: AFF_HIT, height: AFF_HIT }}
    >
      <span className="flex items-center justify-center rounded-full text-foreground" style={{ width: AFF_D, height: AFF_D, backgroundColor: fill }}>
        {children}
      </span>
    </button>
  )
}

/** 조작 버튼 — 원 48(`bg-muted`, 테두리 0, 그림자) · `grouped` 면 pill 그룹 안의 한 칸(자기 바탕·그림자 없음) */
const CONTROL_PX = 48
const CONTROL_GAP = 12
function ControlButton({ label, onClick, grouped, children, ...rest }: { label: string; onClick: () => void; grouped?: boolean; children: ReactNode } & Record<`data-${string}`, unknown>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...rest}
      className={cn(
        "flex items-center justify-center text-foreground outline-none ring-ring ring-offset-2 ring-offset-background motion-safe:transition-colors focus-visible:ring-2",
        grouped ? "hover:bg-foreground/8" : "rounded-full bg-muted shadow-sm hover:bg-[color-mix(in_oklab,var(--muted)_92%,var(--foreground)_8%)]",
      )}
      style={{ width: CONTROL_PX, height: CONTROL_PX }}
    >
      {children}
    </button>
  )
}

// ── 내보내기 — 보이는 트리를 독립 SVG 로 (색은 DOM computed 값으로 굳힌다) ────────────
function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/** 내보내기 PNG 배율 — 2× (원본 다운로드가 화면보다 큰 해상도) */
export const EXPORT_SCALE = 2
/** SVG 문자열 → 투명 배경 PNG. 폰트는 SVG 안 `font-family` 가 가리키는 설치 폰트로 그려진다(웹폰트는 내장하지 않는다). */
export function exportPng(svg: string, scale = EXPORT_SCALE): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/)
    const w = m ? Number(m[1]) : 0
    const h = m ? Number(m[2]) : 0
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(w * scale)
      canvas.height = Math.ceil(h * scale)
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("canvas 2d unavailable"))
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
    }
    img.onerror = () => reject(new Error("svg rasterize failed"))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
export function exportSvg(viewport: HTMLElement | null, lay: Layout, layout: MindmapLayout): string {
  const PAD = 24
  const W = lay.width + AFF_SPAN + PAD * 2
  const H = lay.height + AFF_SPAN + PAD * 2
  const cs = (el: Element | null | undefined, prop: string, fallback: string) => (el ? getComputedStyle(el).getPropertyValue(prop) || fallback : fallback)
  const font = cs(viewport, "font-family", "sans-serif")
  const out: string[] = []
  // 바탕 없음 — 투명(원본 다운로드 PNG 가 투명 배경, 사용자 관측 2026-09-13)
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(font)}" font-size="14" font-weight="500">`)
  out.push(`<g transform="translate(${PAD},${PAD})">`)
  for (const e of lay.edges) {
    const el = viewport?.querySelector(`[data-mindmap-edge="${CSS.escape(edgeKey(e))}"]`)
    out.push(`<path d="${edgePath(e)}" fill="none" stroke="${cs(el, "stroke", "currentColor")}" stroke-width="1.5" stroke-linecap="round"/>`)
  }
  for (const p of lay.nodes) {
    const el = viewport?.querySelector(`[data-mindmap-node="${CSS.escape(p.node.id)}"]`)
    const fill = el ? getComputedStyle(el).backgroundColor : "currentColor"
    const color = cs(el, "color", "currentColor")
    out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${NODE_H}" rx="8" fill="${fill}"/>`)
    // 판정 점 — 화면 렌더와 **같은 치수**로 그리고 텍스트를 그만큼 민다. 안 밀면 라벨이 상자를 넘는다.
    const dot = p.node.dot
    if (dot) {
      const dcx = p.x + PAD_X + DOT_D / 2
      const dcy = p.y + NODE_H / 2
      // `dot.color` 는 `var(--verdict-*)` 라 독립 SVG 에서 풀리지 않는다 — 화면의 점에서 computed 값을 굳힌다.
      const dotEl = el?.querySelector("[data-verdict]")
      const dotColor = cs(dotEl, "color", "currentColor")
      if (dot.hollow) {
        out.push(`<circle cx="${dcx}" cy="${dcy}" r="${DOT_D / 2 - 0.75}" fill="none" stroke="${esc(dotColor)}" stroke-width="1.5"/>`)
      } else if (dot.split != null && dot.split > 0 && dot.split < 1) {
        // 두 색 분할 점 — 두 번째 색은 계산된 conic-gradient 에서 읽는다(var() 는 독립 SVG 에서 안 풀린다)
        const bg = cs(dotEl, "background-image", "")
        const cols = bg.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|lab\([^)]*\)|oklab\([^)]*\))/g) ?? []
        const c2 = cols[1] ?? dotColor
        const r = DOT_D / 2
        const a = dot.split * Math.PI * 2
        const ex = dcx + r * Math.sin(a)
        const ey = dcy - r * Math.cos(a)
        out.push(`<circle cx="${dcx}" cy="${dcy}" r="${r}" fill="${esc(c2)}"/>`)
        out.push(`<path d="M ${dcx} ${dcy} L ${dcx} ${dcy - r} A ${r} ${r} 0 ${dot.split > 0.5 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z" fill="${esc(dotColor)}"/>`)
      } else {
        const bg = cs(dotEl, "background-image", "")
        const solid = dot.split === 0 ? (bg.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|lab\([^)]*\)|oklab\([^)]*\))/g) ?? [])[1] ?? dotColor : dotColor
        out.push(`<circle cx="${dcx}" cy="${dcy}" r="${DOT_D / 2}" fill="${esc(solid)}"/>`)
      }
    }
    out.push(`<text x="${p.x + PAD_X + (dot ? DOT_SPAN : 0)}" y="${p.y + NODE_H / 2}" dominant-baseline="central" fill="${color}"${p.stage || (layout === "roadmap" && p.depth === 0) ? ' font-weight="600"' : ""}>${esc(p.node.label)}</text>`)
    if (p.hasChildren) {
      const below = layout === "roadmap"
      const cx = below ? p.x + p.w / 2 : p.x + p.w + AFF_OFFSET + AFF_D / 2
      const cy = below ? p.y + NODE_H + AFF_OFFSET + AFF_D / 2 : p.y + NODE_H / 2
      out.push(`<circle cx="${cx}" cy="${cy}" r="${AFF_D / 2}" fill="${fill}"/>`)
      // 어포던스 chevron — 4px 꺾은 선
      const k = 3.5
      const d = below
        ? p.expanded ? `M ${cx - k} ${cy + k / 2} L ${cx} ${cy - k / 2} L ${cx + k} ${cy + k / 2}` : `M ${cx - k} ${cy - k / 2} L ${cx} ${cy + k / 2} L ${cx + k} ${cy - k / 2}`
        : p.expanded ? `M ${cx + k / 2} ${cy - k} L ${cx - k / 2} ${cy} L ${cx + k / 2} ${cy + k}` : `M ${cx - k / 2} ${cy - k} L ${cx + k / 2} ${cy} L ${cx - k / 2} ${cy + k}`
      out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`)
    }
  }
  out.push("</g></svg>")
  return out.join("\n")
}

// ── 데모 (갤러리·프로브용, zero-prop) ──────────────────────────────────────────
/** roadmap 데모 — Askewly Design 자산이 레포에 들어와 배포되기까지의 5단계 */
export const mindmapRoadmapStages: MindmapNode[] = [
  {
    id: "s1",
    label: "1 · 채집",
    children: [
      {
        id: "s1-a",
        label: "P1 페이지 지도",
        children: [
          { id: "s1-a1", label: "라우트 전수" },
          { id: "s1-a2", label: "존재 확인 스윕 5축", children: [{ id: "s1-a2-1", label: "sitemap · title · DOM" }, { id: "s1-a2-2", label: "soft-200 판정" }] },
        ],
      },
      { id: "s1-b", label: "P2 장부 — 관측경로 열" },
      { id: "s1-c", label: "P3 처분표 — 미처분 0", children: [{ id: "s1-c1", label: "코드화 · 지식 · 기법 · 제외" }] },
    ],
  },
  {
    id: "s2",
    label: "2 · 자산 제작",
    children: [
      { id: "s2-a", label: "recipe (draft)", children: [{ id: "s2-a1", label: "frontmatter 8필드" }, { id: "s2-a2", label: "본문 8섹션" }] },
      { id: "s2-b", label: "컴포넌트 — 의존 0", children: [{ id: "s2-b1", label: "purity gate 예행" }, { id: "s2-b2", label: "토큰만 — hex 0" }] },
      { id: "s2-c", label: "cookbook 기법 문서" },
    ],
  },
  {
    id: "s3",
    label: "3 · 기계 검증",
    children: [
      { id: "s3-a", label: "tsc -b · oxlint · lint-colors" },
      { id: "s3-b", label: "실구동 프로브 — 좌표 수치", children: [{ id: "s3-b1", label: "Failure probe 사본" }] },
    ],
  },
  {
    id: "s4",
    label: "4 · 사람 판정",
    children: [{ id: "s4-a", label: "통과 → stable 승격" }, { id: "s4-b", label: "보류 → 즉시 수리 · 재상정" }, { id: "s4-c", label: "기각 → 처분표로" }],
  },
  {
    id: "s5",
    label: "5 · 배포",
    children: [{ id: "s5-a", label: "생성물 재생성 1회", children: [{ id: "s5-a1", label: "registry.json" }, { id: "s5-a2", label: "llms.txt" }] }, { id: "s5-b", label: "갤러리 게재" }],
  },
]

/** roadmap 데모 뿌리 — 최종 목표 하나 아래 단계 5 */
export const mindmapRoadmapTree: MindmapNode = { id: "roadmap", label: "Askewly Design 자산 — 레포에 들어와 배포되기까지", children: mindmapRoadmapStages }

/** fan 데모 — 원본 관측 형태 */
export const mindmapSampleTree: MindmapNode = {
  id: "root",
  label: "Askewly Design 시스템",
  children: [
    {
      id: "tokens",
      label: "토큰",
      children: [
        { id: "tokens-color", label: "색 — 3-tier", children: [{ id: "tokens-color-p", label: "primitive" }, { id: "tokens-color-s", label: "semantic" }, { id: "tokens-color-c", label: "component" }] },
        { id: "tokens-type", label: "타이포 스케일" },
        { id: "tokens-space", label: "간격 · radius" },
      ],
    },
    {
      id: "assets",
      label: "자산",
      children: [
        { id: "assets-recipe", label: "recipe — 코드 자산", children: [{ id: "assets-recipe-draft", label: "draft" }, { id: "assets-recipe-stable", label: "stable" }] },
        { id: "assets-cookbook", label: "cookbook — 기법" },
        { id: "assets-knowledge", label: "knowledge — 판정 규칙" },
      ],
    },
    { id: "surfaces", label: "표면", children: [{ id: "s-web", label: "웹사이트" }, { id: "s-saas", label: "SaaS 대시보드" }, { id: "s-docs", label: "문서 사이트" }, { id: "s-print", label: "슬라이드 · 인쇄물" }] },
    { id: "gates", label: "게이트", children: [{ id: "g-review", label: "/review 판정" }, { id: "g-lint", label: "토큰 lint" }, { id: "g-contrast", label: "WCAG 대비" }] },
    { id: "agents", label: "에이전트 진입", children: [{ id: "a-llms", label: "llms.txt" }, { id: "a-skill", label: "/askewly-design" }] },
  ],
}

export function MindmapSpineTreeFanDemo() {
  return (
    <div className="h-[520px] w-full">
      <MindmapSpineTree layout="fan" root={mindmapSampleTree} aria-label="Askewly Design 시스템 마인드맵" />
    </div>
  )
}

export default function MindmapSpineTreeDemo() {
  return (
    <div className="h-[560px] w-full">
      <MindmapSpineTree layout="roadmap" root={mindmapRoadmapTree} defaultOpenStages={["s1", "s2"]} defaultExpandedDepth={2} aria-label="Askewly Design 자산 로드맵" />
    </div>
  )
}
