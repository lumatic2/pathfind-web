/**
 * Grounded Source Panel — 근거 소스 패널. 답변이 어떤 소스 위에서 만들어지는지를 고르고(체크 = 근거 범위), 한 소스의
 * 원문을 같은 패널 안에서 연다(목록 → 상세 교체). 인용 사다리의 3단(원문 하이라이트)이 여기로 착지한다.
 *
 * 관측 원천: Google Gemini Notebook 출처 패널 — `evidence/m117/2026-09-12-notebook-shell-live-observation.md` §2·§2-1·§1-1.
 * 장부 `research/2026-09-12-m117-shell-ledger.md` M117-010~016·053 (자산 명세 §2).
 *   - 소스 행 52h `r 8` 패딩 0 8 gap 4 · 파비콘 20(칸 24) · 제목 14/24 1줄 말줄임 · 체크 18(히트 32) · 행 간 0
 *   - 행 hover = 무대색(`bg-muted`) + ⋮ 32 노출 · 정지 상태엔 메뉴 없음
 *   - `+ 소스 추가` 전폭 32h outlined · 웹 검색 블록 `r 16` 패딩 8(드롭다운은 빈 슬롯) · 툴바 48(아이콘 2 | 모두 선택 + 체크)
 *   - 상세 = 같은 패널 안 교체(폭 유지) · 헤더 좌 버튼이 「목록으로」 · 제목 22/36 + 새 탭 40 · 소스 가이드 `bg-muted r 16`
 *     아코디언(머리 40h) + 키워드 칩 32h · 본문 16/24 문단 · 인용 하이라이트(`HighlightedPassage`)
 *   - 접힘 = 56 레일: 접기 버튼 + `+` 32
 * 형태는 원본을 따른다(pill·체크 회청 — 2026-09-12 사용자 취향 판정: rounded-md 재색칠이 원본과 멀었다). 파랑 브랜드색은 0.
 * 소스 추가·검색·정렬·라벨은 **콜백만** — 다이얼로그·메뉴는 소비자 몫.
 */
import { useId, useState, type ReactNode } from "react"
import { ArrowDownUp, ArrowLeft, ChevronDown, ChevronRight, ExternalLink, FileText, Folder, FolderOpen, Globe, MoreVertical, PanelLeftClose, PanelLeftOpen, Plus, Search, Sparkles, Tag, BookOpen, Newspaper, Video, Link2 } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { HighlightedPassage } from "@/components/citation-ladder"
import { cn } from "@/lib/utils"

export type GroundedSource = {
  id: string
  title: string
  /** 파비콘 슬롯 — 없으면 `Globe` 20. 이미지를 넣으려면 소비자가 `<img>` 를 준다 */
  favicon?: ReactNode
  url?: string
  guide?: { summary: string; keywords: string[] }
  /** 원문 문단 — `HighlightedPassage` 로 그려지며 `highlightIds` 가 켠다 */
  passages?: { id: string; text: ReactNode }[]
  /** `passages` 대신 자유 본문 */
  body?: ReactNode
  /**
   * 목록 행 부제(M5 확장 3차 step-3 — 참조 구현 국소 추가, 상류 등재 대상). 제목 아래 한 줄(12/16, 회색).
   * 원본은 제목 한 줄뿐이지만, 자료 종류(도구·서비스·글)처럼 제목이 말하지 않는 분류가 있을 때 쓴다.
   */
  subtitle?: string
  /**
   * 그룹 행(M5 확장 3차 step-3 → 4차 보강 step-14 재귀화 — 참조 구현 국소 추가, 상류 등재 대상). 이 소스 아래 들여쓴 자식 행들.
   * 원본은 평평한 목록만 그린다 — 단계 → 소주제 → 자료처럼 깊어지는 노트북에는 접고 펼치는 트리가 필요했다.
   * 어느 깊이든 받는다. 자식이 있는 행은 왼쪽 화살표로 접고 펼친다(`expandedIds`).
   */
  children?: GroundedSource[]
  /**
   * 행의 성격(4차 보강 step-14): `folder` 는 **문서가 없는 폴더** — 본문을 눌러도 상세가 열리지 않고 접기/펼치기만 한다.
   * 기본(`doc`)은 문서 — 본문 클릭이 상세다. 자식이 있는 문서(단계)는 「폴더이자 노트」로, 화살표는 접기·본문은 열기다.
   */
  kind?: "doc" | "folder"
}

/** 트리를 펼친 평평한 목록 — 상세 조회·선택 집합은 모든 깊이를 본다 */
function flattenSources(sources: GroundedSource[]): GroundedSource[] {
  return sources.flatMap((s) => [s, ...flattenSources(s.children ?? [])])
}

export type GroundedSourcePanelLabels = {
  title: string
  add: string
  searchPlaceholder: string
  selectAll: string
  backToList: string
  guide: string
  emptyTitle: string
  emptyBody: string
  emptyLink: string
  collapse: string
  expand: string
  menu: string
  openInNewTab: string
  search: string
  sort: string
  label: string
}
const DEFAULT_LABELS: GroundedSourcePanelLabels = {
  title: "출처",
  add: "소스 추가",
  searchPlaceholder: "소스를 검색",
  selectAll: "모두 선택",
  backToList: "목록으로",
  guide: "소스 가이드",
  emptyTitle: "저장된 소스가 여기에 표시됩니다",
  emptyBody: "PDF·웹사이트·텍스트·오디오 파일을 추가하면 답변이 그 위에서 만들어집니다.",
  emptyLink: "소스를 추가하세요",
  collapse: "출처 패널 접기",
  expand: "출처 패널 펼치기",
  menu: "더보기",
  openInNewTab: "새 탭에서 열기",
  search: "검색",
  sort: "정렬",
  label: "라벨",
}

export type GroundedSourcePanelProps = {
  sources: GroundedSource[]
  /** 체크 = 이번 답변의 근거 범위 */
  selectedIds: string[]
  onSelectedChange: (ids: string[]) => void
  /**
   * 행 체크박스와 「모두 선택」을 그릴지 (M5 확장 2차 보강, 사용자 지시 2026-09-13).
   * 끄면 목록이 **읽는 문서 목록**이 된다 — 고른 것만 대화에 넣는 기능이 없는 소비자에게는
   * 체크가 조작할 수 있다는 거짓 약속이 된다. 기본값은 종전 동작(켬).
   */
  selectable?: boolean
  /** 상세로 열린 소스 — 주면 제어, 안 주면 내부 state */
  detailId?: string | null
  onDetailChange?: (id: string | null) => void
  /** 상세 뷰에서 켤 문단 id (인용 사다리 3단) */
  highlightIds?: string[]
  onAddSource?: () => void
  onSearch?: (query: string) => void
  /** 검색 블록 아래 행의 드롭다운 자리 — 빈 슬롯(제품 기능 결합은 소비자 몫) */
  filtersSlot?: ReactNode
  onSourceMenu?: (id: string) => void
  onSort?: () => void
  onLabel?: () => void
  /**
   * 펼쳐 둔 행(자식이 있는 행) id — 주면 제어, 안 주면 내부 state(기본: 최상위 그룹 펼침·그 아래 폴더 접힘). 4차 보강 step-14.
   */
  expandedIds?: string[]
  onExpandedChange?: (ids: string[]) => void
  /** 접힘 — 주면 제어, 안 주면 내부 state. 접힌 패널은 56 레일이 된다 */
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  /** 헤더 제목 오른쪽 자리 */
  headerSlot?: ReactNode
  /**
   * 「+ 소스 추가」 행과 웹 검색 블록 — 기본 켜짐(원본). 소스를 사람이 넣지 않고 다른 면(예: 채팅의 에이전트)이 쌓는
   * 노트북에서는 `false` 로 뺀다(사용자 주문 2026-09-13, 마인드맵 변형). 빈 상태의 「소스를 추가하세요」 링크도 같이 빠진다.
   */
  showAdd?: boolean
  showSearch?: boolean
  /** 정렬·라벨 툴바 줄. 기능을 배선하지 않은 소비자는 끈다(참조 구현 국소 추가 M5 4차 보강 3 — 상류 등재 대상) */
  showToolbar?: boolean
  /** 행 호버 「⋯」 메뉴(아이콘이 메뉴로 바뀌는 것 포함). `onSourceMenu` 를 배선하지 않으면 끈다 */
  showMenu?: boolean
  labels?: Partial<GroundedSourcePanelLabels>
  className?: string
}

// ── 치수 (관측 §2·§2-1·§1-1 — px 리터럴은 여기 한 곳) ───────────────────────────
export const HEADER_PX = 49
export const RAIL_PX = 56
export const ROW_PX = 52
export const TOOLBAR_PX = 48
export const ADD_ROW_PX = 48
export const ADD_BUTTON_PX = 32
export const GUIDE_HEAD_PX = 40
export const CHIP_PX = 32
export const TITLE_PX = 22
export const TITLE_LINE_PX = 36
export const FILTER_PILL_PX = 33
const ICON_BUTTON_PX = 36
const HIT_PX = 32
const BIG_HIT_PX = 40
/** 트리 행(4차 보강 step-14) — 깊이당 들여쓰기·접기 화살표 칸 */
const INDENT_PX = 20
const TOGGLE_PX = 24
/** 체크박스 — 원본은 회청 2px 테두리, 체크 상태도 같은 회청 채움 + 먹 체크(파랑 0). 프리미티브의 primary 채움을 덮는다 */
const CHECK_CLASS = "size-4.5 border-2 border-border shadow-none data-[state=checked]:border-border data-[state=checked]:bg-border data-[state=checked]:text-foreground dark:bg-transparent dark:data-[state=checked]:bg-border"

function IconButton({ label, size = ICON_BUTTON_PX, icon = 20, className, ...rest }: { label: string; size?: number; icon?: number } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2 [&>svg]:shrink-0", className)}
      style={{ width: size, height: size, ["--icon" as string]: `${icon}px` }}
      {...rest}
    />
  )
}

export function GroundedSourcePanel({
  sources,
  selectedIds,
  onSelectedChange,
  selectable = true,
  detailId,
  onDetailChange,
  expandedIds,
  onExpandedChange,
  highlightIds,
  onAddSource,
  onSearch,
  filtersSlot,
  onSourceMenu,
  onSort,
  onLabel,
  collapsed,
  onCollapsedChange,
  headerSlot,
  showAdd = true,
  showSearch = true,
  showToolbar = true,
  showMenu = true,
  labels: labelsProp,
  className,
}: GroundedSourcePanelProps) {
  const L = { ...DEFAULT_LABELS, ...labelsProp }
  const uid = useId()
  const [detailState, setDetailState] = useState<string | null>(null)
  const detail = detailId === undefined ? detailState : detailId
  const setDetail = (id: string | null) => {
    if (detailId === undefined) setDetailState(id)
    onDetailChange?.(id)
  }
  const [collapsedState, setCollapsedState] = useState(false)
  const isCollapsed = collapsed === undefined ? collapsedState : collapsed
  const setCollapsed = (v: boolean) => {
    if (collapsed === undefined) setCollapsedState(v)
    onCollapsedChange?.(v)
  }
  const [query, setQuery] = useState("")
  const selected = new Set(selectedIds)
  const flat = flattenSources(sources)
  // 펼침 — 제어/비제어. 기본은 최상위 그룹만 펼침(그 아래 폴더는 접힘).
  const [expandedState, setExpandedState] = useState<string[]>(() => sources.filter((s) => s.children?.length).map((s) => s.id))
  const expandedList = expandedIds === undefined ? expandedState : expandedIds
  const expandedSet = new Set(expandedList)
  const toggleExpanded = (id: string) => {
    const next = expandedSet.has(id) ? expandedList.filter((x) => x !== id) : [...expandedList, id]
    if (expandedIds === undefined) setExpandedState(next)
    onExpandedChange?.(next)
  }
  // 보이는 행 — 펼친 가지만 깊이 우선으로
  const rows: { s: GroundedSource; depth: number }[] = []
  const walkRows = (list: GroundedSource[], depth: number) => {
    for (const s of list) {
      rows.push({ s, depth })
      if (s.children?.length && expandedSet.has(s.id)) walkRows(s.children, depth + 1)
    }
  }
  walkRows(sources, 0)
  const allChecked = flat.length > 0 && flat.every((s) => selected.has(s.id))
  const toggleOne = (id: string, on: boolean) => onSelectedChange(on ? [...selectedIds.filter((x) => x !== id), id] : selectedIds.filter((x) => x !== id))
  const detailSource = detail ? flat.find((s) => s.id === detail) ?? null : null
  const hl = new Set(highlightIds ?? [])

  // ── 접힘 레일 ──────────────────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <section data-source-panel data-collapsed aria-label={L.title} className={cn("flex h-full min-h-0 flex-col items-center bg-card text-foreground", className)} style={{ width: RAIL_PX, minWidth: RAIL_PX }}>
        <div className="flex w-full shrink-0 items-center justify-center border-b border-border" style={{ height: HEADER_PX }}>
          <IconButton label={L.expand} data-source-expand onClick={() => setCollapsed(false)}>
            <PanelLeftOpen size={20} aria-hidden />
          </IconButton>
        </div>
        {showAdd && (
          <IconButton label={L.add} size={HIT_PX} data-source-rail-add className="mt-3" onClick={onAddSource}>
            <Plus size={20} aria-hidden />
          </IconButton>
        )}
      </section>
    )
  }

  return (
    <section data-source-panel data-view={detailSource ? "detail" : "list"} aria-label={L.title} className={cn("flex h-full min-h-0 flex-col bg-card text-foreground", className)}>
      {/* 헤더 49 + 하단선 — 세 패널이 같은 머리 높이를 갖는다 (M117-005) */}
      <header data-source-header className="flex shrink-0 items-center justify-between border-b border-border pl-4 pr-2" style={{ height: HEADER_PX }}>
        {detailSource ? (
          <IconButton label={L.backToList} data-source-back className="-ml-2" onClick={() => setDetail(null)}>
            <ArrowLeft size={20} aria-hidden />
          </IconButton>
        ) : (
          <h2 className="truncate text-base font-normal leading-6">{L.title}</h2>
        )}
        <div className="flex items-center gap-1">
          {headerSlot}
          <IconButton label={L.collapse} data-source-collapse onClick={() => setCollapsed(true)}>
            <PanelLeftClose size={20} aria-hidden />
          </IconButton>
        </div>
      </header>

      {detailSource ? (
        // ── 상세 뷰 — 목록을 교체한다(폭 유지) ─────────────────────────────────
        <div data-source-detail className="flex min-h-0 flex-1 flex-col px-4">
          <div className="flex shrink-0 items-start gap-2 pt-3">
            {detailSource.url ? (
              <a href={detailSource.url} target="_blank" rel="noreferrer" data-source-detail-title className="min-w-0 flex-1 font-normal text-foreground underline-offset-4 hover:underline" style={{ fontSize: TITLE_PX, lineHeight: `${TITLE_LINE_PX}px` }}>
                {detailSource.title}
              </a>
            ) : (
              <h3 data-source-detail-title className="min-w-0 flex-1 font-normal" style={{ fontSize: TITLE_PX, lineHeight: `${TITLE_LINE_PX}px` }}>
                {detailSource.title}
              </h3>
            )}
            {detailSource.url && (
              <IconButton label={L.openInNewTab} size={BIG_HIT_PX} onClick={() => window.open(detailSource.url, "_blank", "noopener")}>
                <ExternalLink size={20} aria-hidden />
              </IconButton>
            )}
          </div>
          <div data-source-detail-body className="min-h-0 flex-1 overflow-y-auto pb-4">
            {detailSource.guide && (
              <Accordion type="single" collapsible defaultValue="guide" data-source-guide className="mt-3 rounded-2xl bg-muted px-4">
                <AccordionItem value="guide" className="border-b-0">
                  <AccordionTrigger className="items-center py-0 text-sm font-medium hover:no-underline" style={{ minHeight: GUIDE_HEAD_PX }}>
                    <span className="inline-flex items-center gap-2">
                      <Sparkles size={18} aria-hidden className="text-muted-foreground" />
                      {L.guide}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <p className="text-sm leading-6">{detailSource.guide.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detailSource.guide.keywords.map((k) => (
                        <span key={k} data-source-keyword className="inline-flex items-center rounded-full border border-border bg-card px-3 text-xs font-medium" style={{ height: CHIP_PX }}>
                          {k}
                        </span>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
            <div className="mt-4">
              {detailSource.passages?.map((p) => (
                <HighlightedPassage key={p.id} id={p.id} active={hl.has(p.id)}>
                  {p.text}
                </HighlightedPassage>
              ))}
              {detailSource.body}
            </div>
          </div>
        </div>
      ) : sources.length === 0 ? (
        // ── 빈 상태 ────────────────────────────────────────────────────────────
        <div data-source-empty className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <FileText size={32} aria-hidden className="text-muted-foreground" />
          <p className="text-sm font-medium">{L.emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{L.emptyBody}</p>
          {showAdd && (
            <button type="button" onClick={onAddSource} className="text-sm text-foreground underline underline-offset-4 outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2">
              {L.emptyLink}
            </button>
          )}
        </div>
      ) : (
        // ── 목록 뷰 ────────────────────────────────────────────────────────────
        <div data-source-list className="min-h-0 flex-1 overflow-y-auto px-4">
          {showAdd && (
          <div className="flex items-center" style={{ height: ADD_ROW_PX }}>
            <button
              type="button"
              data-source-add
              onClick={onAddSource}
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-border pl-2 pr-3 text-sm font-medium outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2"
              style={{ height: ADD_BUTTON_PX }}
            >
              <Plus size={18} aria-hidden />
              {L.add}
            </button>
          </div>
          )}
          {showSearch && (
          <form
            data-source-search
            className="rounded-2xl border border-border bg-muted/40 p-2 dark:bg-background"
            onSubmit={(e) => {
              e.preventDefault()
              onSearch?.(query)
            }}
          >
            <label htmlFor={`${uid}-q`} className="sr-only">
              {L.search}
            </label>
            <textarea
              id={`${uid}-q`}
              rows={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={L.searchPlaceholder}
              className="block w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-end justify-between gap-2 pt-1">
              <div data-source-filters className="flex min-h-8 min-w-0 flex-wrap items-center gap-1">{filtersSlot}</div>
              <IconButton label={L.search} size={HIT_PX} type="submit" className="bg-foreground/8 text-foreground hover:bg-foreground/12">
                <Search size={18} aria-hidden />
              </IconButton>
            </div>
          </form>
          )}
          {showToolbar && (
          <div data-source-toolbar className="flex items-center justify-between px-2" style={{ height: TOOLBAR_PX }}>
            <div className="flex items-center gap-1">
              <IconButton label={L.sort} size={HIT_PX} onClick={onSort}>
                <ArrowDownUp size={18} aria-hidden />
              </IconButton>
              <IconButton label={L.label} size={HIT_PX} onClick={onLabel}>
                <Tag size={18} aria-hidden />
              </IconButton>
            </div>
            {selectable ? (
            <label className="flex cursor-pointer items-center gap-1 text-sm leading-6">
              {L.selectAll}
              <span className="flex items-center justify-center" style={{ width: HIT_PX, height: HIT_PX }}>
                <Checkbox data-source-select-all checked={allChecked} onCheckedChange={(v) => onSelectedChange(v ? flat.map((s) => s.id) : [])} className={CHECK_CLASS} />
              </span>
            </label>
            ) : null}
          </div>
          )}
          {/* 행 높이는 min — 제목이 한 줄(말줄임)이면 정확히 52, 말줄임이 빠지면 행이 자라서 검사에 잡힌다.
              트리(4차 보강 step-14): 자식이 있는 행은 왼쪽 화살표로 접고 펼친다. 화살표 = 접기, 본문 = 열기(폴더는 본문도 접기/펼치기).
              깊이마다 20px 들여쓴다 — 3층이 280px 패널에 서야 한다. */}
          <ul data-source-rows className="pb-4">
            {rows.map(({ s, depth }) => {
              const hasKids = Boolean(s.children?.length)
              const folder = s.kind === "folder"
              const open = expandedSet.has(s.id)
              return (
              <li
                key={s.id}
                data-source-row={s.id}
                data-source-depth={depth}
                data-source-group={depth === 0 && hasKids ? "" : undefined}
                data-source-folder={folder ? "" : undefined}
                data-source-child={depth > 0 && !folder ? "" : undefined}
                data-source-expanded={hasKids ? (open ? "true" : "false") : undefined}
                className="group flex cursor-pointer items-center gap-1 rounded-lg px-2 motion-safe:transition-colors hover:bg-muted"
                style={{ minHeight: ROW_PX, paddingLeft: 8 + depth * INDENT_PX }}
                onClick={() => (folder ? toggleExpanded(s.id) : setDetail(s.id))}
              >
                {hasKids ? (
                  <button
                    type="button"
                    data-source-toggle={s.id}
                    aria-expanded={open}
                    aria-label={open ? "접기" : "펼치기"}
                    className="flex shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card hover:text-foreground focus-visible:ring-2"
                    style={{ width: TOGGLE_PX, height: TOGGLE_PX }}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleExpanded(s.id)
                    }}
                  >
                    {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                  </button>
                ) : (
                  <span className="shrink-0" style={{ width: TOGGLE_PX, height: TOGGLE_PX }} aria-hidden />
                )}
                <span className="relative flex shrink-0 items-center justify-center" style={{ width: HIT_PX, height: HIT_PX }}>
                  <span data-source-favicon className={cn("flex size-6 items-center justify-center text-muted-foreground [&>svg]:size-5", showMenu && "motion-safe:transition-opacity group-focus-within:opacity-0 group-hover:opacity-0")}>
                    {s.favicon ?? (folder ? open ? <FolderOpen size={20} aria-hidden /> : <Folder size={20} aria-hidden /> : <Globe size={20} aria-hidden />)}
                  </span>
                  {showMenu && (
                  <IconButton
                    label={L.menu}
                    size={HIT_PX}
                    icon={18}
                    data-source-menu
                    tabIndex={-1}
                    className="absolute inset-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSourceMenu?.(s.id)
                    }}
                  >
                    <MoreVertical size={18} aria-hidden />
                  </IconButton>
                  )}
                </span>
                {s.subtitle ? (
                  <span className="min-w-0 flex-1 py-1">
                    <span data-source-title className="block truncate text-sm leading-5">
                      {s.title}
                    </span>
                    <span data-source-subtitle className="block truncate text-xs leading-4 text-muted-foreground">
                      {s.subtitle}
                    </span>
                  </span>
                ) : (
                <span data-source-title className="min-w-0 flex-1 truncate text-sm leading-6">
                  {s.title}
                </span>
                )}
                {selectable ? (
                <span className="flex shrink-0 items-center justify-center" style={{ width: HIT_PX, height: HIT_PX }} onClick={(e) => e.stopPropagation()}>
                  <Checkbox data-source-check={s.id} aria-label={s.title} checked={selected.has(s.id)} onCheckedChange={(v) => toggleOne(s.id, v === true)} className={CHECK_CLASS} />
                </span>
                ) : null}
              </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── 데모 (갤러리·프로브용, zero-prop) ──────────────────────────────────────────
const P = [
  "디자인 시스템의 토큰은 세 층으로 나뉜다. primitive 는 값이고, semantic 은 역할이며, component 는 자리다. 컴포넌트가 primitive 를 직접 부르면 다크 모드에서 역할이 끊긴다.",
  "라이트에서 무대 위에 흰 카드가 뜨는 관계는 다크에서도 명도 순서로 유지돼야 한다. 무대가 카드보다 어둡고, 선은 라이트보다 오히려 밝아진다.",
  "타일의 배경 tint 는 분류의 유일한 수단이 아니다. 아홉 종류에 여섯 색이면 세 쌍은 같은 색을 나눠 갖는다 — 색은 묶음을 가르고 아이콘과 라벨이 개체를 가른다.",
  "인용은 세 단으로 열린다. 배지는 근거가 있다는 신호이고, 팝오버는 무슨 근거인지 보여 주며, 원문 하이라이트는 어디서 왔는지 밝힌다.",
  "접힘은 200ms 로 어디로 갔는지 보여 주고, 펼침은 즉시 열려 바로 쓰게 한다. 양방향을 같은 시간으로 두면 펼칠 때 내용이 잘린 채 넓어진다.",
  "제안 칩은 세로로 쌓는다. 가로로 나열하면 긴 한국어 질문이 잘리고, 세로면 각 질문이 한 줄 전체를 쓴다.",
]
const passagesOf = (prefix: string, idx: number[]) => idx.map((i, k) => ({ id: `${prefix}-p${k}`, text: P[i] }))

/** 파비콘 자리 — 원본은 사이트 로고(색 있음). 데모는 lucide 아이콘을 semantic 색으로 칠해 목록에 색점을 준다 */
const Favicon = ({ icon, tone }: { icon: ReactNode; tone: string }) => (
  <span className="flex size-5 items-center justify-center rounded-full [&>svg]:size-3.5" style={{ background: `color-mix(in oklab, ${tone} 14%, var(--card))`, color: `color-mix(in oklab, ${tone} 70%, var(--foreground))` }}>
    {icon}
  </span>
)
/** 데모 소스 6 — 파비콘은 이미지 대신 색 원 안의 lucide 아이콘 6종(도메인 종류를 흉내낸다) */
export const groundedSourceDemoSources: GroundedSource[] = [
  { id: "src-tokens", title: "토큰 3계층 — 디자인 시스템 계약 v2 (primitive · semantic · component 를 가르는 규칙과 다크 모드에서 역할이 끊기지 않게 하는 참조 순서를 적은 긴 제목의 문서)", favicon: <Favicon icon={<FileText aria-hidden />} tone="var(--emphasis-foreground)" />, url: "https://example.com/tokens", guide: { summary: "토큰을 primitive·semantic·component 세 층으로 나누고 컴포넌트는 semantic 만 참조하도록 하는 계약 문서다.", keywords: ["토큰", "3-tier", "semantic", "다크 모드", "계약"] }, passages: passagesOf("src-tokens", [0, 1, 2, 3, 4, 5, 0, 1]) },
  { id: "src-dark", title: "다크 모드 표면 위계 실측 노트", favicon: <Favicon icon={<Globe aria-hidden />} tone="var(--danger-foreground)" />, url: "https://example.com/dark", guide: { summary: "라이트의 무대·카드 명도 관계가 다크에서 어떻게 유지되는지 실측한 노트.", keywords: ["다크", "표면 2단", "명도", "선"] }, passages: passagesOf("src-dark", [1, 2, 1, 4, 5, 3]) },
  { id: "src-shell", title: "노트북 셸 라이브 관측 2026-09-12", favicon: <Favicon icon={<BookOpen aria-hidden />} tone="var(--success-foreground)" />, url: "https://example.com/shell", guide: { summary: "3열 부동 카드 셸의 접힘·상세 모드·전이를 계측한 관측 기록.", keywords: ["셸", "접힘", "200ms", "상세 모드"] }, passages: passagesOf("src-shell", [4, 5, 0, 3, 2]) },
  { id: "src-news", title: "생성물 UI 동향 — 근거 기반 답변의 인용 관습", favicon: <Favicon icon={<Newspaper aria-hidden />} tone="var(--info-foreground)" />, url: "https://example.com/news", guide: { summary: "인용 배지·팝오버·원문 점프의 3단 관습을 정리한 기사.", keywords: ["인용", "팝오버", "하이라이트"] }, passages: passagesOf("src-news", [3, 0, 5]) },
  { id: "src-video", title: "강연: 디자인 토큰을 제품 팀에 이식하기", favicon: <Favicon icon={<Video aria-hidden />} tone="oklch(from var(--danger-foreground) l c 85)" />, url: "https://example.com/talk", guide: { summary: "토큰 이식의 실패 사례와 순서를 다룬 강연 녹취.", keywords: ["이식", "제품 팀", "실패 사례"] }, passages: passagesOf("src-video", [0, 2, 4]) },
  { id: "src-link", title: "제안 칩 세로 스택에 관한 짧은 메모", favicon: <Favicon icon={<Link2 aria-hidden />} tone="oklch(from var(--emphasis-foreground) l c 335)" />, guide: { summary: "긴 한국어 질문이 잘리지 않게 제안 칩을 세로로 쌓는 이유.", keywords: ["제안 칩", "세로", "한국어"] }, passages: passagesOf("src-link", [5, 3]) },
]

/** 검색 블록 아래 행의 드롭다운 pill 2(원본은 같은 자리에 범위·모드 pill 둘 — 문구는 우리 것. 흰 바탕 outlined 33h). 메뉴는 열지 않는다(콜백 없음) */
function FilterPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 rounded-full border border-border bg-card pl-2 pr-1.5 text-sm font-medium outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2 [&>svg]:size-4" style={{ height: FILTER_PILL_PX }}>
      {icon}
      {children}
      <ChevronDown aria-hidden className="text-muted-foreground" />
    </button>
  )
}
export const groundedSourceDemoFilters = (
  <>
    <FilterPill icon={<Globe aria-hidden />}>웹</FilterPill>
    <FilterPill icon={<Sparkles aria-hidden />}>빠른 조사</FilterPill>
  </>
)

export default function GroundedSourcePanelDemo() {
  const [selected, setSelected] = useState<string[]>(groundedSourceDemoSources.map((s) => s.id))
  return (
    <div className="flex h-[600px] w-full justify-center rounded-2xl bg-muted p-4 dark:bg-background">
      <div className="h-full w-full max-w-[632px] overflow-hidden rounded-2xl bg-card">
        <GroundedSourcePanel sources={groundedSourceDemoSources} selectedIds={selected} onSelectedChange={setSelected} filtersSlot={groundedSourceDemoFilters} />
      </div>
    </div>
  )
}
