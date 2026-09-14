/**
 * Notebook Workspace Shell — 3열 **부동 카드** 셸. 무대 위에 카드 세 장(근거 · 대화 · 생성물)이 갭을 두고 뜨고, 좌·우 열은
 * 각각 56px 아이콘 레일로 접히며, 우측 열은 생성물 상세에서 960 으로 넓어진다(나머지가 수축). 접힘은 200ms ease-in-out,
 * 펼침은 즉시 — 비대칭이 관측값이다.
 *
 * 관측 원천: Google Gemini Notebook 노트북 화면 — `evidence/m117/2026-09-12-notebook-shell-live-observation.md` §1·§1-1·§4-1·§5.
 * 장부 `research/2026-09-12-m117-shell-ledger.md` M117-001~005·007·040·052 (자산 명세 §1).
 *   - 무대 bg-muted(다크 bg-background) · 상단 바 64 투명 · 컨테이너 `flex mx-4 gap-4` · 카드 `bg-card r 16 overflow hidden` 테두리·그림자 0
 *   - 열 비율 `0 1 25% / 0 1 48% / 0 1 25%` → 2560 에서 632/1213/632 · 접힘 = inline-size 56 + 가운데 `1 1 0%` → 1808 · 양쪽 → 2384
 *   - 전이: 접힘 200ms ease-in-out(rAF 실측) / 펼침 0ms · 가운데 열은 전이 없이 flex 로 동행 · reduced-motion 0
 *   - 상세: 우측 `0 0 960px`, 좌·중앙은 basis 비로 초과분을 나눠 526/1010 (관측 526·1010·960 일치)
 *   - 하단 면책 22 슬롯 12px 중앙(선택 — 데모는 사용자 판정으로 뺐다 2026-09-13)
 *   - 열 사이 갭 16 = 리사이즈 손잡이: hover `col-resize` 커서, 드래그로 양옆 basis(%) 조절(최소 280), 더블클릭 복귀, 방향키 16px
 * 셸은 폭·접힘 폭·전이·리사이즈만 갖는다. 레일 내용·헤더·접기 버튼은 각 패널이 그린다(`collapsed` 를 같은 state 로 묶는다).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChartNoAxesCombined, Copy, Grip, Maximize2, MoreVertical, Network, PanelRightClose, PanelRightOpen, Plus, Settings, Share2, Shrink } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { EditableText } from "@/components/editable-text"
import { cn } from "@/lib/utils"
import { CitationBadge, type Citation } from "@/components/citation-ladder"
import { GroundedSourcePanel, groundedSourceDemoFilters, groundedSourceDemoSources, type GroundedSourcePanelProps } from "@/components/grounded-source-panel"
import { ChatConversationPanel, chatGroundedDemoReasoningSteps, chatGroundedDemoSuggestions, chatGroundedDemoZero, type ChatMessage, type ChatStatus } from "@/components/chat-conversation-panel"
import { StudioArtifactPanel, StudioDemoBanner, studioDemoArtifacts, studioDemoKinds } from "@/components/studio-artifact-panel"
import { MindmapSpineTree, mindmapRoadmapTree, mindmapSampleTree, type MindmapLayout, type MindmapNode } from "@/components/mindmap-spine-tree"

export type NotebookWorkspaceShellProps = {
  /** 64h 슬롯 — 바탕 투명(무대색). 브랜드·액션은 소비자 몫 */
  topbar?: ReactNode
  left: ReactNode
  center: ReactNode
  right: ReactNode
  leftCollapsed: boolean
  rightCollapsed: boolean
  onLeftCollapsedChange: (collapsed: boolean) => void
  onRightCollapsedChange: (collapsed: boolean) => void
  /** 우측 열을 960 으로 고정 — 생성물 상세. 좌·중앙은 수축한다 */
  detail?: "right" | null
  /** 22h 면책 슬롯, 12px 중앙 */
  footer?: ReactNode
  /** 열 basis (%) — 기본 [25, 48, 25]. 초기값이며, 갭을 끌면 셸 안에서 바뀐다(더블클릭으로 복귀) */
  ratios?: [number, number, number]
  /** 드래그·키보드 리사이즈 결과(%) */
  onRatiosChange?: (ratios: [number, number, number]) => void
  className?: string
}

// ── 치수 (관측 §1·§1-1·§4-1 — px 리터럴은 여기 한 곳) ───────────────────────────
export const TOPBAR_PX = 64
export const FOOTER_PX = 22
export const GAP_PX = 16
export const MARGIN_PX = 16
export const RAIL_PX = 56
export const DETAIL_PX = 960
/** 접힘 — rAF 실측 200ms ease-in-out (`motion.duration.overlay`) */
export const COLLAPSE_MS = 200
/** 펼침 — 즉시(관측: 10ms 샘플에 이미 632). 양방향 같은 ms 로 두면 펼칠 때 내용이 잘린 채 넓어진다 */
export const EXPAND_MS = 0
const DEFAULT_RATIOS: [number, number, number] = [25, 48, 25]
const EASE = "ease-in-out"

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

/**
 * 열 접힘 폭 전이 — flex 가 정한 폭(auto)에서 56 으로는 CSS 가 보간하지 못하므로, 접히는 순간 현재 폭을 px 로 고정한 뒤
 * 다음 프레임에 56 으로 보낸다(200ms). 펼침은 인라인 값을 즉시 지워 flex 로 돌아간다(0ms). 첫 마운트는 전이 없음.
 */
function useCollapsibleColumn(ref: React.RefObject<HTMLDivElement | null>, collapsed: boolean, basis: string, animate: boolean, expandMs: number, collapseMs: number) {
  const mounted = useRef(false)
  // `flex`·`inline-size`·`transition` 은 전부 이 훅이 소유한다(React style 과 나눠 가지면 서로 지운다 — 첫 프로브 실측).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const first = !mounted.current
    mounted.current = true
    const setRail = () => {
      el.style.flex = "0 1 auto"
      el.style.inlineSize = `${RAIL_PX}px`
      el.style.minInlineSize = `${RAIL_PX}px`
    }
    const setOpen = () => {
      el.style.flex = basis
      el.style.inlineSize = ""
      el.style.minInlineSize = ""
    }
    if (collapsed) {
      if (first || !animate || collapseMs === 0) {
        el.style.transition = "none"
        setRail()
        return
      }
      // 현재(flex 가 정한) 폭을 px 로 고정 → reflow → 56 으로 전이. auto → px 는 CSS 가 보간하지 못한다.
      const w = el.getBoundingClientRect().width
      el.style.transition = "none"
      el.style.flex = "0 1 auto"
      el.style.inlineSize = `${w}px`
      el.style.minInlineSize = "0px"
      void el.offsetWidth
      el.style.transition = `inline-size ${collapseMs}ms ${EASE}, min-inline-size ${collapseMs}ms ${EASE}`
      el.style.inlineSize = `${RAIL_PX}px`
      el.style.minInlineSize = `${RAIL_PX}px`
      return
    }
    if (first || !animate || expandMs === 0) {
      el.style.transition = "none"
      setOpen() // 펼침 = 즉시 flex 로 복귀 (EXPAND_MS 0)
      return
    }
    // (사본·변형용) 펼침 전이 — 기본값 0ms 라 여기로 오지 않는다. 목표 폭은 flex 로 한 번 재서 되돌린다.
    const w = el.getBoundingClientRect().width
    el.style.transition = "none"
    setOpen()
    const target = el.getBoundingClientRect().width
    el.style.flex = "0 1 auto"
    el.style.inlineSize = `${w}px`
    el.style.minInlineSize = "0px"
    void el.offsetWidth
    el.style.transition = `inline-size ${expandMs}ms ${EASE}, min-inline-size ${expandMs}ms ${EASE}`
    el.style.inlineSize = `${target}px`
    const t = window.setTimeout(() => {
      el.style.transition = "none"
      setOpen()
    }, expandMs)
    return () => window.clearTimeout(t)
  }, [ref, collapsed, basis, animate, expandMs, collapseMs])
}

/** 열 최소 폭 — 이보다 좁게는 끌리지 않는다 */
export const MIN_COL_PX = 280
/** 상세 열 최소 폭 — 펼친 패널 기본 폭(632). 그 아래로는 상세 머리(제목 + 아이콘 3)·피드백 쌍이 깨진다 */
export const DETAIL_MIN_PX = 632
/** 키보드 리사이즈 한 걸음 */
const KEY_STEP_PX = 16

/**
 * 열 사이 갭(16)이 곧 리사이즈 손잡이다 — 마우스를 올리면 `col-resize` 커서, 잡고 끌면 양옆 열의 basis(%) 가 바뀐다.
 * 접힌 열(56 레일) 옆 손잡이는 잠긴다. 상세 모드에서는 우 손잡이가 상세 폭(px)을 끈다. 더블클릭 = 기본 비율·상세 폭 복귀. 방향키 = 16px 걸음.
 */
function Resizer({ onDrag, onStart, onReset, disabled, label }: { onDrag: (dx: number) => void; onStart: () => void; onReset: () => void; disabled?: boolean; label: string }) {
  const startX = useRef(0)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      data-shell-resizer
      className={cn("group relative shrink-0 select-none outline-none", disabled ? "cursor-default" : "cursor-col-resize")}
      style={{ width: GAP_PX }}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return
        e.preventDefault()
        startX.current = e.clientX
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.dataset.dragging = ""
        document.body.style.cursor = "col-resize"
        onStart()
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        onDrag(e.clientX - startX.current)
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        e.currentTarget.releasePointerCapture(e.pointerId)
        delete e.currentTarget.dataset.dragging
        document.body.style.cursor = ""
      }}
      onDoubleClick={() => !disabled && onReset()}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault()
          onStart()
          onDrag(e.key === "ArrowLeft" ? -KEY_STEP_PX : KEY_STEP_PX)
        }
        if (e.key === "Home") onReset()
      }}
    >
      {/* 손잡이 표시 — 평소엔 무대색 그대로, hover·드래그·포커스에서만 가운데 4px 선이 뜬다 */}
      {!disabled && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-foreground/0 motion-safe:transition-colors group-hover:bg-foreground/15 group-focus-visible:bg-foreground/30 group-data-dragging:bg-foreground/30" />
      )}
    </div>
  )
}

export function NotebookWorkspaceShell({ topbar, left, center, right, leftCollapsed, rightCollapsed, onLeftCollapsedChange: _onLeft, onRightCollapsedChange: _onRight, detail = null, footer, ratios: ratiosProp = DEFAULT_RATIOS, onRatiosChange, className }: NotebookWorkspaceShellProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const reduce = usePrefersReducedMotion()
  const animate = !reduce
  const rightCollapsedEff = rightCollapsed && detail !== "right"
  const anyCollapsed = leftCollapsed || rightCollapsedEff
  // 드래그로 바뀐 비율 — prop 은 초기값. 끌면 % 로 환산해 저장하므로 창 크기가 바뀌어도 비율이 남는다.
  const [ratios, setRatios] = useState<[number, number, number]>(ratiosProp)
  const dragStart = useRef<{ l: number; c: number; r: number; inner: number } | null>(null)
  const commit = (next: [number, number, number]) => {
    setRatios(next)
    onRatiosChange?.(next)
  }
  const startDrag = () => {
    const inner = (colsRef.current?.clientWidth ?? 0) - GAP_PX * 2
    dragStart.current = { l: leftRef.current?.getBoundingClientRect().width ?? 0, c: centerRef.current?.getBoundingClientRect().width ?? 0, r: rightRef.current?.getBoundingClientRect().width ?? 0, inner }
  }
  const pct = (px: number, inner: number) => (px / inner) * 100
  /** 좌 손잡이: 좌·중앙이 dx 를 주고받는다. 우 손잡이: 중앙·우. 접힌 쪽이 있으면 중앙은 `1 1 0%` 라 바깥 열만 바꾼다 */
  const dragLeft = (dx: number) => {
    const s = dragStart.current
    if (!s) return
    const d = Math.max(MIN_COL_PX - s.l, Math.min(s.c - MIN_COL_PX, dx))
    commit([pct(s.l + d, s.inner), anyCollapsed ? ratios[1] : pct(s.c - d, s.inner), ratios[2]])
  }
  // 상세 폭 — 기본 960(관측). 상세 모드에서도 우 손잡이는 살아 있고, 이때는 % 가 아니라 이 px 를 끈다(사용자 요구 2026-09-13)
  const [detailW, setDetailW] = useState(DETAIL_PX)
  const dragRight = (dx: number) => {
    const s = dragStart.current
    if (!s) return
    // 상세 열은 일반 열보다 큰 하한(632 = 펼친 패널 기본 폭) — 제목·아이콘 3·피드백 쌍이 깨지지 않는 폭에서 멈춘다(사용자 관측 2026-09-13)
    const d = Math.max(MIN_COL_PX - s.c, Math.min(s.r - (detail === "right" ? DETAIL_MIN_PX : MIN_COL_PX), dx))
    if (detail === "right") {
      setDetailW(Math.round(s.r - d))
      return
    }
    commit([ratios[0], anyCollapsed ? ratios[1] : pct(s.c + d, s.inner), pct(s.r - d, s.inner)])
  }
  const reset = () => {
    commit(ratiosProp)
    setDetailW(DETAIL_PX)
  }
  // 상세 = 우측 basis px 고정(수축 0). 좌·중앙은 자기 basis 비로 초과분을 나눠 먹는다 (결정 10)
  useCollapsibleColumn(leftRef, leftCollapsed, `0 1 ${ratios[0]}%`, animate, EXPAND_MS, COLLAPSE_MS)
  useCollapsibleColumn(rightRef, rightCollapsedEff, detail === "right" ? `0 0 ${detailW}px` : `0 1 ${ratios[2]}%`, animate, EXPAND_MS, COLLAPSE_MS)
  const card = "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-card"
  return (
    <div data-notebook-shell data-detail={detail ?? undefined} className={cn("flex h-full min-h-0 w-full flex-col bg-muted text-foreground dark:bg-background", className)}>
      <div data-shell-topbar className="flex shrink-0 items-center" style={{ height: TOPBAR_PX }}>
        {topbar}
      </div>
      {/* 갭 16 은 리사이즈 손잡이(Resizer)가 차지한다 — `gap` 대신 요소로 두어 커서·드래그를 받는다 */}
      <div ref={colsRef} data-shell-columns className="flex min-h-0 flex-1" style={{ marginInline: MARGIN_PX, marginBottom: footer == null ? MARGIN_PX : 0 }}>
        {/* 좌·우 열의 flex/inline-size/transition 은 useCollapsibleColumn 이 인라인으로 소유한다 */}
        <div ref={leftRef} data-shell-col="left" data-collapsed={leftCollapsed ? "" : undefined} className={card}>
          {left}
        </div>
        <Resizer label="출처 · 채팅 폭 조절" disabled={leftCollapsed} onStart={startDrag} onDrag={dragLeft} onReset={reset} />
        {/* 가운데 열 — 전이 없음. 양옆이 접히면 남는 폭을 전부 먹는다 (M117-052) */}
        <div ref={centerRef} data-shell-col="center" className={card} style={{ flex: anyCollapsed ? "1 1 0%" : `0 1 ${ratios[1]}%`, transition: "none" }}>
          {center}
        </div>
        <Resizer label="채팅 · 스튜디오 폭 조절" disabled={rightCollapsedEff} onStart={startDrag} onDrag={dragRight} onReset={reset} />
        <div ref={rightRef} data-shell-col="right" data-collapsed={rightCollapsedEff ? "" : undefined} className={card}>
          {right}
        </div>
      </div>
      {/* 면책 슬롯 — 주지 않으면 띠 자체가 없고 카드가 바닥 여백 16 까지 내려온다 */}
      {footer != null && (
        <div data-shell-footer className="flex shrink-0 items-center justify-center text-xs text-muted-foreground" style={{ height: FOOTER_PX }}>
          {footer}
        </div>
      )}
    </div>
  )
}

// ── 데모 — 노트북 전체 (갤러리·프로브용, zero-prop) ─────────────────────────────
function withData(n: MindmapNode): MindmapNode {
  return { ...n, data: { query: `「${n.label}」에 대해 소스가 뭐라고 하는지 정리해 줘.` }, children: n.children?.map(withData) }
}
const demoTree = withData(mindmapSampleTree)
const demoRoadmap = withData(mindmapRoadmapTree)
const P1 = "디자인 시스템의 토큰은 세 층으로 나뉜다. primitive 는 값이고, semantic 은 역할이며, component 는 자리다. 컴포넌트가 primitive 를 직접 부르면 다크 모드에서 역할이 끊긴다."
const P2 = "라이트에서 무대 위에 흰 카드가 뜨는 관계는 다크에서도 명도 순서로 유지돼야 한다. 무대가 카드보다 어둡고, 선은 라이트보다 오히려 밝아진다."
/** 인용 번호 → 소스·문단 — 채팅의 `[n]` 이 어느 원문 문단으로 가는지 */
const citationTargets: Record<number, Citation & { passageId: string }> = {
  1: { n: 1, title: "토큰 3계층 — 디자인 시스템 계약 v2", sourceId: "src-tokens", passageId: "src-tokens-p0", excerpt: <><p>{P1}</p><p>{P2}</p><p>{P1}</p><p>{P2}</p></> },
  2: { n: 2, title: "다크 모드 표면 위계 실측 노트", sourceId: "src-dark", passageId: "src-dark-p0", excerpt: <><p>{P2}</p><p>{P1}</p><p>{P2}</p></> },
}
const demoMessages: ChatMessage[] = [
  { id: "n-1", role: "user", text: "토큰을 세 층으로 나누는 이유가 뭐야? 다크 모드랑도 관계가 있어?" },
  {
    id: "n-2",
    role: "assistant",
    text: "토큰은 primitive·semantic·component 세 층으로 나뉘고, 컴포넌트는 semantic 만 참조한다[1]. 그래야 다크 모드에서 역할이 끊기지 않는다 — 무대가 카드보다 어둡고 선은 오히려 밝아지는 관계가 토큰 정의 한 곳에서 뒤집힌다[2].",
    reasoning: { label: "Thoughts", steps: chatGroundedDemoReasoningSteps },
    citations: [
      { n: 1, title: citationTargets[1].title },
      { n: 2, title: citationTargets[2].title },
    ],
  },
]
let demoId = 100

// 원본 §1-2 상단 바 — outlined pill 32h(아이콘 + 라벨 14/20 500, 패딩 0 12 0 8, 간격 12) · CTA 검은 pill(`+` + 라벨, 패딩 0 16 0 12)
function TopbarButton({ children, icon, primary }: { children: ReactNode; icon: ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full text-sm outline-none ring-ring ring-offset-2 ring-offset-background motion-safe:transition-[background-color,transform] active:scale-[0.98] focus-visible:ring-2 [&>svg]:size-4",
        primary ? "bg-foreground pl-3 pr-4 font-normal text-background hover:bg-foreground/90" : "border border-border pl-2 pr-3 font-medium text-foreground hover:bg-foreground/8",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
/** 사람 대면 캐릭터 아바타 — 브랜드 규약(line art, 보라는 바탕에만, 선은 먹). 이미지 자산 없이 SVG 한 조각 */
function CharacterAvatar({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="15" fill="color-mix(in oklab, var(--primary) 28%, var(--card))" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="18" r="8" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 15 C 9 8, 23 8, 23.5 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="13" cy="18" r="1.2" fill="currentColor" />
      <circle cx="19" cy="18" r="1.2" fill="currentColor" />
      <path d="M13.5 21.5 Q 16 23.5 18.5 21.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
const TOPBAR_ICON_PX = 40
const AVATAR_PX = 32
export type DemoUser = { name: string }
/**
 * 상단 바 데모 — 제목(제자리 편집) · 검은 CTA · outlined pill 4 · 앱 격자 · **로그인 상태**: 로그아웃이면 「로그인」 pill,
 * 로그인이면 캐릭터 아바타(원본 §1-2 의 구글 아바타 자리 — 사진 대신 브랜드 캐릭터, 사용자 주문 2026-09-13). 아바타 클릭 = 로그아웃(데모).
 */
function DemoTopbar({ title, onTitleChange, user, onSignIn, onSignOut }: { title: string; onTitleChange: (t: string) => void; user: DemoUser | null; onSignIn: () => void; onSignOut: () => void }) {
  return (
    <div className="flex w-full items-center justify-between gap-4 px-4">
      <EditableText as="h1" value={title} onChange={onTitleChange} fallback="제목 없는 노트북" aria-label="노트북 제목" data-shell-title className="min-w-0 max-w-[40%] truncate font-normal focus:overflow-visible focus:whitespace-normal" style={{ fontSize: 22, lineHeight: "36px" }} />
      <div className="flex shrink-0 items-center gap-3">
        <TopbarButton primary icon={<Plus aria-hidden />}>노트북 만들기</TopbarButton>
        <TopbarButton icon={<Copy aria-hidden />}>복사</TopbarButton>
        <TopbarButton icon={<ChartNoAxesCombined aria-hidden />}>분석</TopbarButton>
        <TopbarButton icon={<Share2 aria-hidden />}>공유</TopbarButton>
        <TopbarButton icon={<Settings aria-hidden />}>설정</TopbarButton>
        <button type="button" aria-label="앱" title="앱" className="inline-flex items-center justify-center rounded-full text-foreground outline-none ring-ring ring-offset-2 ring-offset-background motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2" style={{ width: TOPBAR_ICON_PX, height: TOPBAR_ICON_PX }}>
          <Grip size={20} aria-hidden />
        </button>
        {user ? (
          <button type="button" data-shell-avatar aria-label={`${user.name} — 로그아웃`} title={`${user.name} · 로그아웃`} onClick={onSignOut} className="inline-flex items-center justify-center rounded-full text-foreground outline-none ring-2 ring-primary/40 ring-offset-2 ring-offset-background motion-safe:transition-[box-shadow] hover:ring-primary focus-visible:ring-ring">
            <CharacterAvatar size={AVATAR_PX} />
          </button>
        ) : (
          <button type="button" data-shell-signin onClick={onSignIn} className="inline-flex h-8 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground outline-none ring-ring ring-offset-2 ring-offset-background motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2">
            로그인
          </button>
        )}
      </div>
    </div>
  )
}

// ── 데모 공통 배선 — 출처·채팅 + 인용 사다리 + 마인드맵 펼침 보존. 두 셸 데모(스튜디오 / 마인드맵 변형)가 같이 쓴다 ──
function useDemoNotebook(empty: boolean, sourcePanel: Partial<Pick<GroundedSourcePanelProps, "showAdd" | "showSearch" | "labels">> = {}) {
  const sources = empty ? [] : groundedSourceDemoSources
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>(sources.map((s) => s.id))
  const [detailSource, setDetailSource] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>(empty ? [] : demoMessages)
  const [status, setStatus] = useState<ChatStatus>("idle")
  const [draft, setDraft] = useState("")
  const [mindmapSelected, setMindmapSelected] = useState<string | null>(null)
  const [title, setTitle] = useState(empty ? "제목 없는 노트북" : "디자인 시스템 노트북")
  const [user, setUser] = useState<DemoUser | null>({ name: "유성" })
  const topbar = <DemoTopbar title={title} onTitleChange={setTitle} user={user} onSignIn={() => setUser({ name: "유성" })} onSignOut={() => setUser(null)} />
  // 마인드맵 펼침 상태는 생성물별로 남는다 — 닫고 스튜디오로 갔다 돌아와도 마지막 펼침/접힘 그대로(사용자 요구 2026-09-13).
  // 첫 열람은 최상위만: 두 얼굴 다 뿌리만 펼침 — roadmap = 목표 + 단계 5(전부 접힘), fan = 루트 + 1단계(원본 관측 형태).
  const [mindmapExpanded, setMindmapExpanded] = useState<Record<string, string[]>>({})
  const expandedOf = (id: string) => mindmapExpanded[id] ?? [id === "a-roadmap" ? demoRoadmap.id : demoTree.id]
  const rememberExpanded = (id: string) => (ids: string[]) => setMindmapExpanded((cur) => ({ ...cur, [id]: ids }))

  // 인용 사다리 3단 배선 — 「소스 보기」 → 출처 패널 상세 + 하이라이트 (접혀 있으면 펼친다)
  const showSource = (n: number) => {
    const t = citationTargets[n]
    if (!t) return
    setLeftCollapsed(false)
    setDetailSource(t.sourceId)
    setHighlight([t.passageId])
  }
  const send = (text: string) => {
    demoId += 1
    setMessages((cur) => [...cur, { id: `n-${demoId}`, role: "user", text }])
    setStatus("waiting")
    window.setTimeout(() => {
      demoId += 1
      setMessages((cur) => [...cur, { id: `n-${demoId}`, role: "assistant", text: `「${text}」에 대해 소스 ${selectedIds.length}개를 근거로 답합니다[1].`, citations: [{ n: 1, title: citationTargets[1].title }] }])
      setStatus("idle")
    }, 900)
  }
  const left = (
    <GroundedSourcePanel
      sources={sources}
      selectedIds={selectedIds}
      onSelectedChange={setSelectedIds}
      detailId={detailSource}
      onDetailChange={setDetailSource}
      highlightIds={highlight}
      collapsed={leftCollapsed}
      onCollapsedChange={setLeftCollapsed}
      filtersSlot={groundedSourceDemoFilters}
      {...sourcePanel}
    />
  )
  const center = (
    <ChatConversationPanel
      variant="grounded"
      className="h-full max-w-none rounded-none border-0 bg-card"
      title="채팅"
      messages={messages}
      status={status}
      onSend={send}
      onRetry={() => setStatus("idle")}
      suggestions={empty ? chatGroundedDemoZero.suggestions : chatGroundedDemoSuggestions}
      suggestionsPrompt={empty ? chatGroundedDemoZero.prompt : undefined}
      onSuggestion={send}
      scopeLabel={`소스 ${selectedIds.length}개`}
      draft={draft}
      onDraftChange={setDraft}
      emptyTitle={empty ? chatGroundedDemoZero.title : undefined}
      emptyHint={empty ? chatGroundedDemoZero.hint : undefined}
      onSaveNote={() => {}}
      onCopy={(m) => navigator.clipboard?.writeText(m.text)}
      onFeedback={() => {}}
      // 배지 슬롯 — 셸에서는 인용 사다리(hover 팝오버 → 소스 보기)가 배지를 그린다
      renderCitation={(c) => {
        const t = citationTargets[c.n]
        return t ? <CitationBadge citation={t} onShowSource={() => showSource(c.n)} /> : null
      }}
    />
  )
  return { left, center, topbar, leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed, setDraft, mindmapSelected, setMindmapSelected, expandedOf, rememberExpanded, sourceCount: selectedIds.length }
}

export function NotebookWorkspaceShellDemo({ empty = false }: { empty?: boolean }) {
  const d = useDemoNotebook(empty)
  const [openArtifact, setOpenArtifact] = useState<string | null>(null)
  const [artifactExpanded, setArtifactExpanded] = useState(false)
  const [banner, setBanner] = useState(true)
  const [titles, setTitles] = useState<Record<string, string>>({})
  const artifacts = (empty ? [] : studioDemoArtifacts).map((a) => (titles[a.id] ? { ...a, title: titles[a.id] } : a))
  const artifact = openArtifact ? artifacts.find((a) => a.id === openArtifact) ?? null : null

  return (
    <NotebookWorkspaceShell
      topbar={d.topbar}
      leftCollapsed={d.leftCollapsed}
      rightCollapsed={d.rightCollapsed}
      onLeftCollapsedChange={d.setLeftCollapsed}
      onRightCollapsedChange={d.setRightCollapsed}
      detail={artifact ? "right" : null}
      left={d.left}
      center={d.center}
      right={
        <StudioArtifactPanel
          kinds={studioDemoKinds}
          artifacts={artifacts}
          collapsed={d.rightCollapsed}
          onCollapsedChange={d.setRightCollapsed}
          onOpen={(id) => setOpenArtifact(id)}
          banner={banner ? <StudioDemoBanner onDismiss={() => setBanner(false)} /> : null}
          detail={
            artifact
              ? {
                  id: artifact.id,
                  title: artifact.title,
                  backLabel: "닫기",
                  sourcesLabel: `프롬프트 및 소스 ${artifact.sourceCount}개 보기`,
                  onBack: () => {
                    setOpenArtifact(null)
                    setArtifactExpanded(false)
                  },
                  onShowSources: () => d.setLeftCollapsed(false),
                  onTitleChange: (t) => setTitles((cur) => ({ ...cur, [artifact.id]: t })),
                  expanded: artifactExpanded,
                  onExpandedChange: setArtifactExpanded,
                  // 원본 §4-1 제목 우측 아이콘(공유·펼치기·옵션) — 「펼치기」가 전체 화면 뷰어를 연다
                  actionsSlot: (
                    <>
                      {(
                        [
                          { label: "공유", icon: <Share2 size={20} aria-hidden /> },
                          { label: artifactExpanded ? "패널로 돌아가기" : "펼치기", icon: artifactExpanded ? <Shrink size={20} aria-hidden /> : <Maximize2 size={20} aria-hidden />, onClick: () => setArtifactExpanded((v) => !v), action: "expand" },
                          { label: "옵션 더보기", icon: <MoreVertical size={20} aria-hidden /> },
                        ] as { label: string; icon: ReactNode; onClick?: () => void; action?: string }[]
                      ).map((b) => (
                        <button key={b.action ?? b.label} type="button" aria-label={b.label} title={b.label} onClick={b.onClick} data-studio-action={b.action} className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2">
                          {b.icon}
                        </button>
                      ))}
                    </>
                  ),
                  children:
                    // 마인드맵 자산의 두 얼굴 — fan(수평 트리, 원본 관측 형태) / roadmap(목표 뿌리 + 단계 줄 + 수직 트리, 사용자 확정 구조).
                    // 캔버스는 틀 없이(테두리·회색 바탕 0) 패널 카드 위에 바로 선다(원본 §4-1). 노드 본체 클릭 = 선택 + 입력창 질의 채움(전송 아님)
                    artifact.id === "a-roadmap" ? (
                      <MindmapSpineTree
                        layout="roadmap"
                        root={demoRoadmap}
                        expandedIds={d.expandedOf(artifact.id)}
                        onExpandedChange={d.rememberExpanded(artifact.id)}
                        clickBehavior="select-only"
                        selectedId={d.mindmapSelected}
                        onSelectedChange={d.setMindmapSelected}
                        onNodeSelect={(n) => d.setDraft((n.data as { query: string }).query)}
                        aria-label={artifact.title}
                        className="h-full rounded-none border-0 bg-transparent"
                      />
                    ) : artifact.kindId === "mindmap" ? (
                      <MindmapSpineTree
                        layout="fan"
                        root={demoTree}
                        expandedIds={d.expandedOf(artifact.id)}
                        onExpandedChange={d.rememberExpanded(artifact.id)}
                        clickBehavior="select-only"
                        selectedId={d.mindmapSelected}
                        onSelectedChange={d.setMindmapSelected}
                        onNodeSelect={(n) => d.setDraft((n.data as { query: string }).query)}
                        aria-label={artifact.title}
                        className="h-full rounded-none border-0 bg-transparent"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">이 생성물 종류의 미리보기는 데모에 없습니다.</div>
                    ),
                }
              : null
          }
        />
      }
    />
  )
}

export function NotebookWorkspaceShellEmptyDemo() {
  return (
    <div className="h-[720px] w-full overflow-hidden rounded-2xl">
      <NotebookWorkspaceShellDemo empty />
    </div>
  )
}

export default function NotebookWorkspaceShellGalleryDemo() {
  return (
    <div className="h-[720px] w-full overflow-hidden rounded-2xl">
      <NotebookWorkspaceShellDemo />
    </div>
  )
}

// ── 변형: 마인드맵 패널 — 우측 카드가 생성물 목록이 아니라 마인드맵 하나다 (사용자 주문 2026-09-13, 재사용 부품) ──────────
export type MindmapPanelLabels = { title: string; collapse: string; expand: string; emptyTitle: string; emptyBody: string; share: string; fullscreen: string; backToPanel: string; more: string }
const MINDMAP_PANEL_LABELS: MindmapPanelLabels = {
  title: "마인드맵",
  collapse: "마인드맵 패널 접기",
  expand: "마인드맵 패널 펼치기",
  emptyTitle: "마인드맵이 여기에 표시됩니다",
  emptyBody: "채팅에서 소스가 쌓이면 그 내용으로 마인드맵이 만들어집니다.",
  share: "공유",
  fullscreen: "펼치기",
  backToPanel: "패널로 돌아가기",
  more: "옵션 더보기",
}
export type MindmapPanelProps = {
  /** 뿌리 — `null` 이면 빈 상태 */
  root: MindmapNode | null
  layout?: MindmapLayout
  /** 제목 행(22/36) — 없으면 제목 행·근거 통로를 그리지 않는다 */
  mapTitle?: string
  /** 제목 제자리 편집 — 주면 클릭해서 고칠 수 있다(원본: 편집 input) */
  onMapTitleChange?: (title: string) => void
  /** 근거로 되돌아가는 통로 pill(「프롬프트 및 소스 N개 보기」) */
  sourcesLabel?: string
  onShowSources?: () => void
  onShare?: () => void
  onMore?: () => void
  expandedIds?: readonly string[]
  onExpandedChange?: (ids: string[]) => void
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
  onNodeSelect?: (node: MindmapNode) => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** 헤더 제목 오른쪽 자리 */
  headerSlot?: ReactNode
  labels?: Partial<MindmapPanelLabels>
  className?: string
}
const PANEL_HEADER_PX = 49
const PANEL_ICON_PX = 36
const MAP_TITLE_PX = 22
const MAP_TITLE_LINE_PX = 36
const MAP_ACTION_PX = 40
const MAP_SOURCES_PX = 32
const VIEWER_INSET_PX = 16
const MAP_PILL = "inline-flex items-center rounded-full border border-border px-6 text-sm font-medium outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2"
const MAP_ICON_BUTTON = "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2"

/**
 * 마인드맵 패널 — 스튜디오 패널의 자리에 서는 변형. 머리(49h · 「마인드맵」 · 접기) 아래 **제목 행**(22/36 + 공유·펼치기·옵션 40)
 * 과 **근거 통로 pill**(「프롬프트 및 소스 N개 보기」)이 원본 상세 모드 그대로 서고, 본체는 마인드맵 자산(틀 없이).
 * 「펼치기」= 창 안쪽 16 카드 뷰어(dialog — 본체는 뷰어에만, Escape/⤡ 로 복귀). 빈 상태는 아이콘 + 안내 두 줄. 접힘 = 56 레일.
 * 펼침·선택 상태는 소비자가 쥔다(셸 데모가 보존).
 */
export function MindmapPanel({ root, layout = "roadmap", mapTitle, onMapTitleChange, sourcesLabel, onShowSources, onShare, onMore, expandedIds, onExpandedChange, selectedId, onSelectedChange, onNodeSelect, collapsed, onCollapsedChange, headerSlot, labels: labelsProp, className }: MindmapPanelProps) {
  const L = { ...MINDMAP_PANEL_LABELS, ...labelsProp }
  const [collapsedState, setCollapsedState] = useState(false)
  const isCollapsed = collapsed === undefined ? collapsedState : collapsed
  const setCollapsed = (v: boolean) => {
    if (collapsed === undefined) setCollapsedState(v)
    onCollapsedChange?.(v)
  }
  const [fullscreen, setFullscreen] = useState(false)
  const map = root ? (
    <MindmapSpineTree
      layout={layout}
      root={root}
      expandedIds={expandedIds}
      onExpandedChange={onExpandedChange}
      selectedId={selectedId}
      onSelectedChange={onSelectedChange}
      onNodeSelect={onNodeSelect}
      clickBehavior="select-only"
      aria-label={mapTitle ?? L.title}
      downloadName={mapTitle}
      className="h-full rounded-none border-0 bg-transparent"
    />
  ) : null
  // 제목 우측 아이콘 3 — 공유 · 펼치기(⇄ 패널로 돌아가기) · 옵션 (원본 §4-1)
  const actions = (
    <div data-mindmap-panel-actions className="flex shrink-0 items-center" style={{ minHeight: MAP_ACTION_PX }}>
      <button type="button" aria-label={L.share} title={L.share} onClick={onShare} className={MAP_ICON_BUTTON} style={{ width: MAP_ACTION_PX, height: MAP_ACTION_PX }}>
        <Share2 size={20} aria-hidden />
      </button>
      <button type="button" aria-label={fullscreen ? L.backToPanel : L.fullscreen} title={fullscreen ? L.backToPanel : L.fullscreen} data-mindmap-panel-fullscreen onClick={() => setFullscreen((v) => !v)} className={MAP_ICON_BUTTON} style={{ width: MAP_ACTION_PX, height: MAP_ACTION_PX }}>
        {fullscreen ? <Shrink size={20} aria-hidden /> : <Maximize2 size={20} aria-hidden />}
      </button>
      <button type="button" aria-label={L.more} title={L.more} onClick={onMore} className={MAP_ICON_BUTTON} style={{ width: MAP_ACTION_PX, height: MAP_ACTION_PX }}>
        <MoreVertical size={20} aria-hidden />
      </button>
    </div>
  )
  const titleBlock = (viewer: boolean) =>
    mapTitle != null ? (
      <div className="flex shrink-0 items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          {viewer && onMapTitleChange ? (
            <>
              <DialogTitle className="sr-only">{mapTitle}</DialogTitle>
              <EditableText as="h2" value={mapTitle} onChange={onMapTitleChange} aria-label="마인드맵 제목" data-mindmap-panel-title className="truncate font-normal focus:overflow-visible focus:whitespace-normal" style={{ fontSize: MAP_TITLE_PX, lineHeight: `${MAP_TITLE_LINE_PX}px` }} />
            </>
          ) : viewer ? (
            <DialogTitle data-mindmap-panel-title className="truncate font-normal" style={{ fontSize: MAP_TITLE_PX, lineHeight: `${MAP_TITLE_LINE_PX}px` }}>
              {mapTitle}
            </DialogTitle>
          ) : onMapTitleChange ? (
            <EditableText as="h3" value={mapTitle} onChange={onMapTitleChange} aria-label="마인드맵 제목" data-mindmap-panel-title className="truncate font-normal focus:overflow-visible focus:whitespace-normal" style={{ fontSize: MAP_TITLE_PX, lineHeight: `${MAP_TITLE_LINE_PX}px` }} />
          ) : (
            <h3 data-mindmap-panel-title className="truncate font-normal" style={{ fontSize: MAP_TITLE_PX, lineHeight: `${MAP_TITLE_LINE_PX}px` }}>
              {mapTitle}
            </h3>
          )}
          {sourcesLabel && (
            <button type="button" data-mindmap-panel-sources onClick={onShowSources} className={cn(MAP_PILL, "mt-2")} style={{ height: MAP_SOURCES_PX }}>
              {sourcesLabel}
            </button>
          )}
        </div>
        {actions}
      </div>
    ) : null
  if (isCollapsed) {
    return (
      <section data-mindmap-panel data-collapsed aria-label={L.title} className={cn("flex h-full min-h-0 flex-col items-center bg-card text-foreground", className)} style={{ width: RAIL_PX, minWidth: RAIL_PX }}>
        <div className="flex w-full shrink-0 items-center justify-center border-b border-border" style={{ height: PANEL_HEADER_PX }}>
          <button type="button" aria-label={L.expand} title={L.expand} data-mindmap-panel-expand onClick={() => setCollapsed(false)} className={MAP_ICON_BUTTON} style={{ width: PANEL_ICON_PX, height: PANEL_ICON_PX }}>
            <PanelRightOpen size={20} aria-hidden />
          </button>
        </div>
        <Network size={20} aria-hidden className="mt-4 text-muted-foreground" />
      </section>
    )
  }
  return (
    <section data-mindmap-panel data-view={root ? "map" : "empty"} aria-label={L.title} className={cn("flex h-full min-h-0 flex-col bg-card text-foreground", className)}>
      <header data-mindmap-panel-header className="flex shrink-0 items-center justify-between border-b border-border pl-4 pr-2" style={{ height: PANEL_HEADER_PX }}>
        <h2 className="truncate text-base font-normal leading-6">{L.title}</h2>
        <div className="flex items-center gap-1">
          {headerSlot}
          <button type="button" aria-label={L.collapse} title={L.collapse} data-mindmap-panel-collapse onClick={() => setCollapsed(true)} className={MAP_ICON_BUTTON} style={{ width: PANEL_ICON_PX, height: PANEL_ICON_PX }}>
            <PanelRightClose size={20} aria-hidden />
          </button>
        </div>
      </header>
      {root ? (
        <>
          {titleBlock(false)}
          <div data-mindmap-panel-body className="mt-2 min-h-0 flex-1 px-2 pb-2">
            {fullscreen ? null : map}
          </div>
          <Dialog open={fullscreen} onOpenChange={setFullscreen}>
            <DialogContent showCloseButton={false} data-mindmap-panel-viewer className="inset-4 top-4 left-4 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-card p-0 text-foreground shadow-xl data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none" style={{ inset: VIEWER_INSET_PX }}>
              {mapTitle == null && <DialogTitle className="sr-only">{L.title}</DialogTitle>}
              <DialogDescription className="sr-only">{sourcesLabel ?? L.title}</DialogDescription>
              {titleBlock(true)}
              <div data-mindmap-panel-viewer-body className="mt-2 min-h-0 flex-1 px-4 pb-4">
                {fullscreen ? map : null}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <div data-mindmap-panel-empty className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <Network size={32} aria-hidden className="text-muted-foreground" />
          <p className="text-sm font-medium">{L.emptyTitle}</p>
          <p className="break-keep text-sm text-muted-foreground">{L.emptyBody}</p>
        </div>
      )}
    </section>
  )
}

/** 마인드맵 변형의 열 비율 — 마인드맵 카드가 기본보다 넓다(사용자 주문 2026-09-13): 2560 에서 ≈ 549 / 1073 / 874 */
export const MINDMAP_SHELL_RATIOS: [number, number, number] = [22, 43, 35]

/** 마인드맵 변형 노트북 — 출처(에이전트가 쌓는 마크다운 — 추가·검색 없음) · 채팅 · 마인드맵. `empty` = 첫 진입(소스 0 · 인사 · 빈 마인드맵) */
export function NotebookMindmapShellDemo({ empty = false }: { empty?: boolean }) {
  const d = useDemoNotebook(empty, { showAdd: false, showSearch: false, labels: { emptyBody: "채팅의 에이전트가 만든 마크다운 문서가 여기에 쌓입니다." } })
  const [mapTitle, setMapTitle] = useState("자산 제작 로드맵 — 채집에서 배포까지")
  return (
    <NotebookWorkspaceShell
      topbar={d.topbar}
      ratios={MINDMAP_SHELL_RATIOS}
      leftCollapsed={d.leftCollapsed}
      rightCollapsed={d.rightCollapsed}
      onLeftCollapsedChange={d.setLeftCollapsed}
      onRightCollapsedChange={d.setRightCollapsed}
      left={d.left}
      center={d.center}
      right={
        <MindmapPanel
          root={empty ? null : demoRoadmap}
          layout="roadmap"
          mapTitle={empty ? undefined : mapTitle}
          onMapTitleChange={setMapTitle}
          sourcesLabel={empty ? undefined : `프롬프트 및 소스 ${d.sourceCount}개 보기`}
          onShowSources={() => d.setLeftCollapsed(false)}
          expandedIds={d.expandedOf("a-roadmap")}
          onExpandedChange={d.rememberExpanded("a-roadmap")}
          selectedId={d.mindmapSelected}
          onSelectedChange={d.setMindmapSelected}
          onNodeSelect={(n) => d.setDraft((n.data as { query: string }).query)}
          collapsed={d.rightCollapsed}
          onCollapsedChange={d.setRightCollapsed}
        />
      }
    />
  )
}
export function NotebookMindmapShellEmptyDemo() {
  return (
    <div className="h-[720px] w-full overflow-hidden rounded-2xl">
      <NotebookMindmapShellDemo empty />
    </div>
  )
}
export function NotebookMindmapShellGalleryDemo() {
  return (
    <div className="h-[720px] w-full overflow-hidden rounded-2xl">
      <NotebookMindmapShellDemo />
    </div>
  )
}
