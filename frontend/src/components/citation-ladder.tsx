import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type Citation = {
  /** 본문에 보이는 번호 */
  n: number
  /** 소스 제목 — 팝오버 머리 + 배지 접근성 이름 */
  title: string
  /** 발췌 — 문단 여러 개면 `<p>` 여러 개. 길면 팝오버 본문 안에서 스크롤한다 */
  excerpt: ReactNode
  /** 「소스 보기」 가 돌려주는 id — 소비자가 원문 패널·하이라이트를 연다 */
  sourceId: string
}

// ── 치수 (관측 §3·§2-1 — px 리터럴은 여기 한 곳) ──────────────────────────────
export const BADGE_PX = 22
export const BADGE_FONT_PX = 11
export const BADGE_LINE_PX = 16
export const POPOVER_PX = 420
export const POPOVER_HEAD_PX = 49
export const POPOVER_OFFSET_PX = 8
/** hover 로 열기까지의 지연 — 스치는 커서에 안 열린다. 원본은 미계측(즉시로 보임). */
export const HOVER_DELAY_MS = 120
const CLOSE_DELAY_MS = 160
/** 원문 하이라이트로 스크롤할 때 위에 남기는 여백(원본 ≈216 — 패널 헤더·가이드가 위에 있어 우리 값은 작다) */
export const SCROLL_MARGIN_PX = 96

type OpenedBy = "hover" | "focus" | "key" | null

export type CitationBadgeProps = {
  citation: Citation
  /** 「소스 보기」 — 3단으로 내려가는 유일한 통로. 없으면 발 링크를 그리지 않는다 */
  onShowSource?: (sourceId: string) => void
  showSourceLabel?: string
  className?: string
}

/**
 * 1단 — 인라인 번호 배지. `inline-flex` + `align-middle` 라 본문 줄높이(24)를 벌리지 않는다(위첨자가 아니다).
 * hover(120ms) **와** focus 로 2단(팝오버)이 열리고, Enter/Space 는 팝오버 안으로 포커스를 옮긴다.
 */
export function CitationBadge({ citation, onShowSource, showSourceLabel = "소스 보기", className }: CitationBadgeProps) {
  const [open, setOpen] = useState(false)
  const openedBy = useRef<OpenedBy>(null)
  const timer = useRef<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  /** 닫힐 때의 열림 경로 — 키보드로 열었을 때만 포커스를 배지로 돌려준다(hover 닫힘에 포커스를 옮기면 배지가 다시 열린다). */
  const lastOpenedBy = useRef<OpenedBy>(null)
  /** 프로그램이 배지에 포커스를 돌려줄 때 그 focus 이벤트가 다시 팝오버를 열지 않게 하는 1회 가드 */
  const suppressFocusOpen = useRef(false)
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  const openAs = (by: OpenedBy) => {
    clear()
    openedBy.current = by
    setOpen(true)
  }
  const scheduleClose = () => {
    clear()
    timer.current = window.setTimeout(() => {
      openedBy.current = null
      setOpen(false)
    }, CLOSE_DELAY_MS)
  }
  const onPointerEnter = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || open) return
    clear()
    timer.current = window.setTimeout(() => openAs("hover"), HOVER_DELAY_MS)
  }
  const onPointerLeave = () => {
    if (openedBy.current === "key") return
    if (!open) clear()
    else scheduleClose()
  }
  const onBlur = (e: React.FocusEvent) => {
    if (contentRef.current?.contains(e.relatedTarget as Node | null)) return
    if (openedBy.current === "focus") scheduleClose()
  }
  // Radix Trigger 의 click 토글과 합성한다 — 이미 hover/focus 로 열려 있으면 닫지 않고 「키보드 열림」으로 승격해
  // 포커스를 팝오버 안으로 옮긴다(Enter 가 hover 열림을 닫아 버리지 않도록).
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (open && openedBy.current !== "key") {
      e.preventDefault()
      openedBy.current = "key"
      contentRef.current?.querySelector<HTMLElement>("a,button")?.focus()
      return
    }
    if (!open) openedBy.current = "key"
  }
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        clear()
        if (!v) {
          lastOpenedBy.current = openedBy.current
          openedBy.current = null
        }
        setOpen(v)
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-citation-badge={citation.n}
          aria-label={`${citation.n}: ${citation.title}`}
          className={cn(
            "ml-1 inline-flex shrink-0 items-center justify-center rounded-full bg-muted align-middle font-medium text-muted-foreground outline-none ring-ring ring-offset-1 ring-offset-background focus-visible:ring-2",
            className,
          )}
          style={{ width: BADGE_PX, height: BADGE_PX, fontSize: BADGE_FONT_PX, lineHeight: `${BADGE_LINE_PX}px` }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onFocus={() => {
            if (suppressFocusOpen.current) return
            if (!open) openAs("focus")
          }}
          onBlur={onBlur}
          onClick={onClick}
        >
          {citation.n}
        </button>
      </PopoverTrigger>
      <CitationPopover
        ref={contentRef}
        citation={citation}
        showSourceLabel={showSourceLabel}
        autoFocus={openedBy.current === "key"}
        onPointerEnter={clear}
        onPointerLeave={() => {
          if (openedBy.current === "hover") scheduleClose()
        }}
        // Radix(non-modal) 는 닫힐 때 트리거로 포커스를 돌린다 — 그 focus 가 우리 onFocus 를 타고 팝오버를 다시 연다.
        // 우리가 대신 한다: 키보드로 열었을 때만 배지로 돌려주고, hover·focus 열림은 포커스를 건드리지 않는다.
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (lastOpenedBy.current !== "key") return
          suppressFocusOpen.current = true
          triggerRef.current?.focus()
          suppressFocusOpen.current = false
        }}
        onShowSource={
          onShowSource &&
          ((id) => {
            lastOpenedBy.current = openedBy.current
            openedBy.current = null
            setOpen(false)
            onShowSource(id)
          })
        }
      />
    </Popover>
  )
}

type CitationPopoverProps = {
  citation: Citation
  showSourceLabel: string
  autoFocus: boolean
  onShowSource?: (sourceId: string) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onCloseAutoFocus: (e: Event) => void
  ref: React.Ref<HTMLDivElement>
}

/**
 * 2단 — 420×420 **고정** 카드, 화살표 없음, 배지 좌정렬 아래 8px. 세로 flex 3영역: 머리(제목 1줄) / 본문(내부 스크롤) /
 * 발(「소스 보기」). 높이를 고정하는 이유: 발췌 길이에 따라 팝오버가 널뛰면 연속 배지를 훑을 때 화면이 흔들린다.
 */
export function CitationPopover({ citation, showSourceLabel, autoFocus, onShowSource, onPointerEnter, onPointerLeave, onCloseAutoFocus, ref }: CitationPopoverProps) {
  const headId = useId()
  return (
    <PopoverContent
      ref={ref}
      align="start"
      sideOffset={POPOVER_OFFSET_PX}
      aria-labelledby={headId}
      data-citation-popover={citation.n}
      onOpenAutoFocus={(e) => {
        if (!autoFocus) e.preventDefault()
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onCloseAutoFocus={onCloseAutoFocus}
      className="flex w-auto flex-col overflow-hidden rounded-lg border-0 bg-popover p-0 text-foreground shadow-md"
      style={{ width: POPOVER_PX, height: POPOVER_PX }}
    >
      <div id={headId} data-citation-popover-head className="shrink-0 truncate px-4 py-3 text-sm font-medium" style={{ height: POPOVER_HEAD_PX }}>
        {citation.title}
      </div>
      <div data-citation-popover-body tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-4 text-base leading-6 outline-none [&>p]:mb-2">
        {citation.excerpt}
      </div>
      {onShowSource && (
        <div className="shrink-0 p-4">
          <button
            type="button"
            data-citation-show-source
            onClick={() => onShowSource(citation.sourceId)}
            className="text-sm text-foreground underline underline-offset-4 outline-none ring-ring ring-offset-2 ring-offset-popover hover:text-muted-foreground focus-visible:ring-2"
          >
            {showSourceLabel}
          </button>
        </div>
      )}
    </PopoverContent>
  )
}

export type HighlightedPassageProps = {
  id: string
  /** 켜지면 배경 + 굵기 두 신호로 표시하고, 켜지는 순간 스크롤 영역 상단(여백 `SCROLL_MARGIN_PX`)으로 온다 */
  active: boolean
  children: ReactNode
  className?: string
}

/** 3단 — 원문 문단 하이라이트. 발췌를 복사해 보여주는 게 아니라 원문 안의 **위치**를 밝힌다(문단 단위, 여백·radius 0). */
export function HighlightedPassage({ id, active, children, className }: HighlightedPassageProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!active) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ref.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })
  }, [active])
  return (
    <p
      ref={ref}
      data-citation-target={id}
      data-active={active ? "" : undefined}
      className={cn("mb-2 text-base leading-6", active && "bg-muted font-bold", className)}
      style={{ scrollMarginTop: SCROLL_MARGIN_PX }}
    >
      {children}
    </p>
  )
}

/** 본문 안 `[n]` 마커를 배지로 바꿔 끼우는 도우미 — 채팅 패널 같은 소비자가 쓴다. */
export function renderWithCitations(text: string, citations: Citation[], onShowSource?: (sourceId: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const c = citations.find((x) => x.n === Number(m![1]))
    if (c) out.push(<CitationBadge key={`${m.index}-${c.n}`} citation={c} onShowSource={onShowSource} />)
    else out.push(m[0])
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// ── 데모 (갤러리·프로브용, zero-prop) ──────────────────────────────────────────
const LOREM = [
  "디자인 시스템의 토큰은 세 층으로 나뉜다. primitive 는 값이고, semantic 은 역할이며, component 는 자리다. 컴포넌트가 primitive 를 직접 부르면 다크 모드에서 역할이 끊긴다.",
  "라이트에서 무대 위에 흰 카드가 뜨는 관계는 다크에서도 명도 순서로 유지돼야 한다. 무대가 카드보다 어둡고, 선은 라이트보다 오히려 밝아진다 — 어둠 속에서 경계가 사라지기 때문이다.",
  "타일의 배경 tint 는 분류의 유일한 수단이 아니다. 아홉 종류에 여섯 색이면 세 쌍은 같은 색을 나눠 갖는다 — 색은 묶음을 가르고 아이콘과 라벨이 개체를 가른다.",
  "인용은 세 단으로 열린다. 배지는 근거가 있다는 신호이고, 팝오버는 무슨 근거인지 보여 주며, 원문 하이라이트는 어디서 왔는지 밝힌다. 단마다 비용과 정보가 함께 오른다.",
  "접힘은 200ms 로 어디로 갔는지 보여 주고, 펼침은 즉시 열려 바로 쓰게 한다. 양방향을 같은 시간으로 두면 펼칠 때 내용이 잘린 채 넓어진다.",
  "제안 칩은 세로로 쌓는다. 가로로 나열하면 긴 한국어 질문이 잘리고, 세로면 각 질문이 한 줄 전체를 쓴다.",
]
const SOURCES = [
  { id: "src-tokens", title: "토큰 3계층 — 디자인 시스템 계약 v2", passages: [0, 1] },
  { id: "src-dark", title: "다크 모드 표면 위계 실측 노트", passages: [2, 3] },
  { id: "src-shell", title: "노트북 셸 라이브 관측 2026-09-12", passages: [4, 5] },
]
const CITATIONS: Citation[] = [
  { n: 1, title: SOURCES[0].title, sourceId: "src-tokens", excerpt: <>{[0, 1, 0, 1].map((i, k) => <p key={k}>{LOREM[i]}</p>)}</> },
  { n: 2, title: SOURCES[1].title, sourceId: "src-dark", excerpt: <>{[2, 3, 2].map((i, k) => <p key={k}>{LOREM[i]}</p>)}</> },
  { n: 3, title: SOURCES[2].title, sourceId: "src-shell", excerpt: <>{[4, 5, 4, 5].map((i, k) => <p key={k}>{LOREM[i]}</p>)}</> },
  { n: 4, title: SOURCES[0].title, sourceId: "src-tokens", excerpt: <>{[1, 0].map((i, k) => <p key={k}>{LOREM[i]}</p>)}</> },
]
const ANSWER = [
  "토큰은 세 층이고 컴포넌트는 semantic 만 참조한다[1]. 그래야 다크 모드에서 역할이 끊기지 않는다[1][2].",
  "다크에서는 무대가 카드보다 어둡고, 선은 오히려 밝아진다[2]. 타일 tint 는 분류의 유일한 수단이 아니라 묶음의 신호다[2].",
  "셸의 접힘은 200ms, 펼침은 즉시다[3]. 제안 칩은 세로로 쌓는다[3][4].",
]

export default function CitationLadderDemo() {
  const [activeSource, setActiveSource] = useState<string | null>(null)
  const firstPassageOf = (sourceId: string) => SOURCES.find((s) => s.id === sourceId)?.passages[0] ?? null
  const activePassage = activeSource ? firstPassageOf(activeSource) : null
  return (
    <div className="grid w-full gap-4 md:grid-cols-2">
      <section aria-label="답변" className="rounded-2xl bg-card p-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">답변 — 배지에 마우스를 올리거나 Tab 으로 가면 근거가 열린다</p>
        {ANSWER.map((t, i) => (
          <p key={i} className="mb-2 text-base leading-6 text-foreground">
            {renderWithCitations(t, CITATIONS, setActiveSource)}
          </p>
        ))}
      </section>
      <section aria-label="원문" data-citation-source-panel className="flex h-80 flex-col rounded-2xl bg-card">
        <div className="shrink-0 truncate px-4 py-3 text-sm font-medium text-foreground">{activeSource ? SOURCES.find((s) => s.id === activeSource)?.title : "원문 — 「소스 보기」를 누르면 여기로 온다"}</div>
        <div data-citation-source-body className="min-h-0 flex-1 overflow-y-auto px-4 text-foreground">
          {LOREM.map((t, i) => (
            <HighlightedPassage key={i} id={`p${i}`} active={activePassage === i}>
              {t}
            </HighlightedPassage>
          ))}
          {LOREM.map((t, i) => (
            <p key={`tail-${i}`} className="mb-2 text-base leading-6 text-muted-foreground">
              {t}
            </p>
          ))}
        </div>
      </section>
    </div>
  )
}
