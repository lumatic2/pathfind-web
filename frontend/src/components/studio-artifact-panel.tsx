/**
 * Studio Artifact Panel — 생성물 패널. 위에는 「무엇을 만들 수 있나」(타일 격자 3×3), 아래에는 「무엇을 만들었나」(생성물 목록),
 * 하단에 항상 닿는 1차 액션(메모 추가). 생성물을 열면 같은 패널이 **상세 모드**로 바뀌고 셸이 그 열을 넓힌다.
 *
 * 관측 원천: Google Gemini Notebook 스튜디오 패널 — `evidence/m117/2026-09-12-notebook-shell-live-observation.md` §4·§4-1·§1-1·§5.
 * 장부 `research/2026-09-12-m117-shell-ledger.md` M117-030~036·054 (자산 명세 §3).
 *   - 타일 격자 `grid-cols-3 gap-8` · 타일 196×56 `r 12` 패딩 8 8 8 12 · 좌 세로(아이콘 16 위 / 라벨 12/16 500 아래) 우 chevron 20
 *   - tint 는 **묶음**을 가르고 아이콘·라벨이 개체를 가른다(원본 9타일에 bg 6색, 3쌍 같은 색 — M117-031). tone 6종(원본과 같은
 *     6 hue: indigo·amber·green·plum·red·sky)을 semantic foreground 씨앗에서 `color-mix` 로 **파생**한다 — bg = 씨앗 12% + 카드,
 *     fg = 씨앗 60% + 먹. 라이트에선 파스텔 바탕 + 어두운 탁한 글자, 다크에선 카드가 어둡고 먹이 밝아 저절로 「hue 유지 + 명도 강등,
 *     fg 파스텔 반전」이 된다(관측 §5). amber·plum 은 테마에 씨앗이 없어 danger/emphasis 의 hue 만 돌린 값(상대 색 문법)
 *   - 생성물 행 64h `r 16` 패딩 8 · 아이콘 32 + 제목 14/16 500 + 부제 12/16(「소스 N개 · M시간 전」= 근거 수 + 신선도) · 피치 72
 *   - 하단 고정 「메모 추가」 검은 pill 40h(`bg-foreground text-background`, 다크에서 반전) · 접힘 = 56 레일에 kind 9 × 40 원(tint 유지)
 *   - 상세 = 브레드크럼 `스튜디오 › 앱` + 닫기 · 제목 22/36 + 아이콘 슬롯 · 「프롬프트 및 소스 N개 보기」 32h pill · children · 피드백 쌍 40h pill
 * 형태는 원본을 따른다(pill — 2026-09-12 사용자 취향 판정: rounded-md 재색칠이 원본과 멀었다). 생성·열기·메모·피드백은 **콜백만**.
 */
import { useId, useState, type CSSProperties, type ReactNode } from "react"
import { ChartColumn, ChevronRight, CircleHelp, FileText, Headphones, Layers, MoreVertical, Network, PanelRightClose, PanelRightOpen, Presentation, Shrink, StickyNote, Table, ThumbsDown, ThumbsUp, Video, WandSparkles, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { EditableText } from "@/components/editable-text"
import { cn } from "@/lib/utils"

export type StudioTone = "indigo" | "sky" | "green" | "red" | "amber" | "plum"
export type StudioKind = { id: string; label: string; icon: ReactNode; tone: StudioTone; badge?: string }
export type StudioArtifact = { id: string; kindId: string; title: string; sourceCount: number; updatedLabel: string }
export type StudioDetail = {
  id: string
  title: string
  /** 브레드크럼 두 번째 마디 — 기본 「앱」 */
  breadcrumb?: string
  backLabel: string
  /** 근거로 되돌아가는 통로 — 「프롬프트 및 소스 N개 보기」 */
  sourcesLabel: string
  onBack: () => void
  onShowSources?: () => void
  onFeedback?: (v: "up" | "down") => void
  /** 제목 편집(원본 §4-1: 제목은 편집 가능한 input) — 주면 제자리 편집, 안 주면 읽기 전용 */
  onTitleChange?: (title: string) => void
  /** 제목 우측 아이콘 버튼 자리(원본 40×3) — 빈 슬롯 */
  actionsSlot?: ReactNode
  /**
   * 전체 화면 뷰어(원본 「펼치기」 — 2026-09-13 관측): 창 안쪽 16px 여백의 흰 카드가 무대 위에 뜨고, 제목·근거 통로·`actionsSlot`·
   * 패널로 돌아가기·닫기·본체·피드백이 그 안에 다시 선다. 본체는 뷰어에만 그린다(패널 뒤는 비운다). Escape = 패널로.
   */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  children: ReactNode
}
export type StudioArtifactPanelLabels = {
  title: string
  root: string
  addNote: string
  collapse: string
  expand: string
  menu: string
  emptyTitle: string
  emptyBody: string
  feedbackUp: string
  feedbackDown: string
  sourceCount: (n: number) => string
}
const DEFAULT_LABELS: StudioArtifactPanelLabels = {
  title: "스튜디오",
  root: "스튜디오",
  addNote: "메모 추가",
  collapse: "스튜디오 패널 접기",
  expand: "스튜디오 패널 펼치기",
  menu: "더보기",
  emptyTitle: "스튜디오 결과물이 여기에 저장됩니다",
  emptyBody: "위 타일에서 오디오 개요·마인드맵·보고서 같은 생성물을 만들면 목록에 쌓입니다.",
  feedbackUp: "도움이 됐다",
  feedbackDown: "도움이 안 됐다",
  sourceCount: (n) => `소스 ${n}개`,
}

export type StudioArtifactPanelProps = {
  kinds: StudioKind[]
  artifacts: StudioArtifact[]
  onCreate?: (kindId: string) => void
  onOpen?: (artifactId: string) => void
  onArtifactMenu?: (artifactId: string) => void
  onAddNote?: () => void
  /** 제공되면 상세 모드 — 목록을 교체한다. 셸은 이때 열 폭을 넓힌다(`detail="right"`) */
  detail?: StudioDetail | null
  /** 패널 머리 안내 밴드 자리 — 빈 슬롯(색 없음) */
  banner?: ReactNode
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  labels?: Partial<StudioArtifactPanelLabels>
  className?: string
}

// ── 치수 (관측 §4·§4-1·§1-1 — px 리터럴은 여기 한 곳) ───────────────────────────
export const HEADER_PX = 49
export const RAIL_PX = 56
export const TILE_H_PX = 56
export const TILE_GAP_PX = 8
/** 타일 최소 폭 — 632 패널(내용 600)에서 3열 = 196 이 되고, 그보다 좁으면 2열로 흐른다 */
export const TILE_MIN_PX = 150
export const ARTIFACT_ROW_PX = 64
export const ARTIFACT_GAP_PX = 8 // 피치 72
export const NOTE_BUTTON_PX = 40
export const RAIL_ICON_PX = 40
export const RAIL_GAP_PX = 16 // 피치 56
export const TITLE_PX = 22
export const TITLE_LINE_PX = 36
export const SOURCES_BUTTON_PX = 32
export const FEEDBACK_PX = 40
export const BADGE_FONT_PX = 11
export const BANNER_PX = 56
export const NOTE_BOTTOM_PX = 38
/** 전체 화면 뷰어 카드의 창 안쪽 여백 */
export const VIEWER_INSET_PX = 16
const ICON_BUTTON_PX = 36
const BIG_HIT_PX = 40
/** tint 파생 비율 — bg 는 씨앗을 카드에 12%, fg 는 씨앗을 먹에 60% 섞는다(원본 라이트 bg L≈0.95 / fg L≈0.33 · 다크 bg L≈0.3 / fg L≈0.88) */
export const TINT_BG_MIX = 12
export const TINT_FG_MIX = 60

/** tone → hue 씨앗. 테마 semantic foreground 4 + hue 만 돌린 파생 2(amber = danger 의 85° · plum = emphasis 의 335°). 값은 `tokens.css` 가 소유한다. */
export const TONE_SEED: Record<StudioTone, string> = {
  indigo: "var(--emphasis-foreground)",
  sky: "var(--info-foreground)",
  green: "var(--success-foreground)",
  red: "var(--danger-foreground)",
  amber: "oklch(from var(--danger-foreground) l c 85)",
  plum: "oklch(from var(--emphasis-foreground) l c 335)",
}
/** tone → 타일 bg/fg (씨앗에서 color-mix 파생 — 라이트·다크 모두 같은 식) */
export const TONE_VARS: Record<StudioTone, { bg: string; fg: string }> = Object.fromEntries(
  (Object.keys(TONE_SEED) as StudioTone[]).map((t) => [t, { bg: `color-mix(in oklab, ${TONE_SEED[t]} ${TINT_BG_MIX}%, var(--card))`, fg: `color-mix(in oklab, ${TONE_SEED[t]} ${TINT_FG_MIX}%, var(--foreground))` }]),
) as Record<StudioTone, { bg: string; fg: string }>
function toneStyle(tone: StudioTone): CSSProperties {
  const t = TONE_VARS[tone]
  return { ["--tile-bg" as string]: t.bg, ["--tile-fg" as string]: t.fg }
}
// hover = tint 위에 먹 8% 덮기 (원본 240,233,239 → 221,214,220 ≈ 8%) · 150ms 상태층 전이
const TILE_CLASS = "bg-(--tile-bg) text-(--tile-fg) motion-safe:transition-colors motion-safe:duration-150 hover:bg-[color-mix(in_oklab,var(--tile-bg)_92%,var(--foreground)_8%)]"
const PILL_OUTLINED = "inline-flex items-center gap-2 rounded-full border border-border text-sm font-medium outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2"

function IconButton({ label, size = ICON_BUTTON_PX, className, ...rest }: { label: string; size?: number } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2 [&>svg]:shrink-0", className)}
      style={{ width: size, height: size }}
      {...rest}
    />
  )
}

function Feedback({ detail, L }: { detail: StudioDetail; L: StudioArtifactPanelLabels }) {
  return (
    <div data-studio-feedback className="flex shrink-0 flex-wrap items-center justify-start gap-4 border-t border-border px-4 py-4">
      <button type="button" onClick={() => detail.onFeedback?.("up")} className={cn(PILL_OUTLINED, "px-6")} style={{ height: FEEDBACK_PX }}>
        <ThumbsUp size={18} aria-hidden />
        {L.feedbackUp}
      </button>
      <button type="button" onClick={() => detail.onFeedback?.("down")} className={cn(PILL_OUTLINED, "px-6")} style={{ height: FEEDBACK_PX }}>
        <ThumbsDown size={18} aria-hidden />
        {L.feedbackDown}
      </button>
    </div>
  )
}

export function StudioArtifactPanel({ kinds, artifacts, onCreate, onOpen, onArtifactMenu, onAddNote, detail, banner, collapsed, onCollapsedChange, labels: labelsProp, className }: StudioArtifactPanelProps) {
  const L = { ...DEFAULT_LABELS, ...labelsProp }
  const [collapsedState, setCollapsedState] = useState(false)
  const isCollapsed = collapsed === undefined ? collapsedState : collapsed
  const setCollapsed = (v: boolean) => {
    if (collapsed === undefined) setCollapsedState(v)
    onCollapsedChange?.(v)
  }
  const kindOf = (id: string) => kinds.find((k) => k.id === id)

  // ── 접힘 레일 — 접혀도 tint 가 남는다 (M117-054) ────────────────────────────
  if (isCollapsed) {
    return (
      <section data-studio-panel data-collapsed aria-label={L.title} className={cn("flex h-full min-h-0 flex-col items-center bg-card text-foreground", className)} style={{ width: RAIL_PX, minWidth: RAIL_PX }}>
        <div className="flex w-full shrink-0 items-center justify-center border-b border-border" style={{ height: HEADER_PX }}>
          <IconButton label={L.expand} data-studio-expand onClick={() => setCollapsed(false)}>
            <PanelRightOpen size={20} aria-hidden />
          </IconButton>
        </div>
        <div data-studio-rail className="mt-3 flex min-h-0 flex-1 flex-col items-center overflow-y-auto" style={{ gap: RAIL_GAP_PX }}>
          {kinds.map((k) => {
            const toneVars = TONE_VARS[k.tone]
            return (
              <button
                key={k.id}
                type="button"
                data-studio-rail-kind={k.id}
                aria-label={k.label}
                title={k.label}
                onClick={() => onCreate?.(k.id)}
                className={cn("inline-flex shrink-0 items-center justify-center rounded-full outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2 [&>svg]:size-5", TILE_CLASS)}
                style={{ width: RAIL_ICON_PX, height: RAIL_ICON_PX, ["--tile-bg" as string]: toneVars.bg, ["--tile-fg" as string]: toneVars.fg }}
              >
                {k.icon}
              </button>
            )
          })}
        </div>
        <button type="button" aria-label={L.addNote} title={L.addNote} data-studio-rail-note onClick={onAddNote} className="mb-4 mt-4 inline-flex shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2" style={{ width: RAIL_ICON_PX, height: RAIL_ICON_PX }}>
          <StickyNote size={20} aria-hidden />
        </button>
      </section>
    )
  }

  // ── 상세 모드 — 목록을 교체(셸이 폭을 넓힌다) ────────────────────────────────
  if (detail) {
    return (
      <section data-studio-panel data-view="detail" aria-label={L.title} className={cn("flex h-full min-h-0 flex-col bg-card text-foreground", className)}>
        <header data-studio-header className="flex shrink-0 items-center justify-between border-b border-border pl-4 pr-2" style={{ height: HEADER_PX }}>
          {/* 첫 마디 「스튜디오」 = 목록으로 돌아가는 링크(원본: 밑줄 링크), 둘째 마디는 현재 위치 */}
          <nav aria-label="breadcrumb" data-studio-breadcrumb className="flex min-w-0 items-center text-base leading-6">
            <button type="button" data-studio-breadcrumb-root onClick={detail.onBack} className="truncate rounded-sm underline-offset-4 outline-none ring-ring ring-offset-2 ring-offset-card hover:underline focus-visible:ring-2">
              {L.root}
            </button>
            <ChevronRight size={20} aria-hidden className="mx-1 shrink-0 text-muted-foreground" />
            <span className="truncate" aria-current="page">{detail.breadcrumb ?? "앱"}</span>
          </nav>
          <IconButton label={detail.backLabel} data-studio-close onClick={detail.onBack}>
            <Shrink size={20} aria-hidden />
          </IconButton>
        </header>
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
          {detail.onTitleChange ? (
            <EditableText as="h3" value={detail.title} onChange={detail.onTitleChange} aria-label="생성물 제목" data-studio-detail-title className="min-w-0 flex-1 truncate font-normal focus:overflow-visible focus:whitespace-normal" style={{ fontSize: TITLE_PX, lineHeight: `${TITLE_LINE_PX}px` }} />
          ) : (
            <h3 data-studio-detail-title className="min-w-0 flex-1 truncate rounded-sm font-normal" style={{ fontSize: TITLE_PX, lineHeight: `${TITLE_LINE_PX}px` }}>
              {detail.title}
            </h3>
          )}
          {detail.actionsSlot != null && (
            <div data-studio-detail-actions className="flex shrink-0 items-center" style={{ minHeight: BIG_HIT_PX }}>
              {detail.actionsSlot}
            </div>
          )}
        </div>
        <div className="shrink-0 px-4 pt-2">
          <button type="button" data-studio-sources onClick={detail.onShowSources} className={cn(PILL_OUTLINED, "px-6")} style={{ height: SOURCES_BUTTON_PX }}>
            {detail.sourcesLabel}
          </button>
        </div>
        <div data-studio-detail-body className="mt-4 min-h-0 flex-1 px-4">
          {detail.expanded ? null : detail.children}
        </div>
        {/* 바닥 피드백 쌍 — 좌정렬 + 위 구분선 (원본 §4-1) */}
        <Feedback detail={detail} L={L} />
        {/* 전체 화면 뷰어 — 「펼치기」. 같은 상세를 창 크기 카드로 다시 세운다 */}
        <Dialog open={Boolean(detail.expanded)} onOpenChange={(v) => detail.onExpandedChange?.(v)}>
          <DialogContent
            showCloseButton={false}
            data-studio-viewer
            className="inset-4 top-4 left-4 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-card p-0 text-foreground shadow-xl data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none"
            style={{ inset: VIEWER_INSET_PX }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-3">
              <div className="min-w-0">
                {detail.onTitleChange ? (
                  <>
                    <DialogTitle className="sr-only">{detail.title}</DialogTitle>
                    <EditableText as="h2" value={detail.title} onChange={detail.onTitleChange} aria-label="생성물 제목" data-studio-viewer-title className="truncate font-normal focus:overflow-visible focus:whitespace-normal" style={{ fontSize: TITLE_PX, lineHeight: `${TITLE_LINE_PX}px` }} />
                  </>
                ) : (
                  <DialogTitle data-studio-viewer-title className="truncate font-normal" style={{ fontSize: TITLE_PX, lineHeight: `${TITLE_LINE_PX}px` }}>
                    {detail.title}
                  </DialogTitle>
                )}
                <DialogDescription className="sr-only">{detail.sourcesLabel}</DialogDescription>
                <button type="button" data-studio-sources onClick={detail.onShowSources} className={cn(PILL_OUTLINED, "mt-2 px-6")} style={{ height: SOURCES_BUTTON_PX }}>
                  {detail.sourcesLabel}
                </button>
              </div>
              <div data-studio-viewer-actions className="flex shrink-0 items-center" style={{ minHeight: BIG_HIT_PX }}>
                {detail.actionsSlot}
                <IconButton label={detail.backLabel} size={BIG_HIT_PX} data-studio-viewer-close onClick={detail.onBack}>
                  <X size={20} aria-hidden />
                </IconButton>
              </div>
            </div>
            <div data-studio-viewer-body className="mt-2 min-h-0 flex-1 px-4">
              {detail.expanded ? detail.children : null}
            </div>
            <Feedback detail={detail} L={L} />
          </DialogContent>
        </Dialog>
      </section>
    )
  }

  // ── 목록 모드 ──────────────────────────────────────────────────────────────
  return (
    <section data-studio-panel data-view="list" aria-label={L.title} className={cn("flex h-full min-h-0 flex-col bg-card text-foreground", className)}>
      <header data-studio-header className="flex shrink-0 items-center justify-between border-b border-border pl-4 pr-2" style={{ height: HEADER_PX }}>
        <h2 className="truncate text-base font-normal leading-6">{L.title}</h2>
        <IconButton label={L.collapse} data-studio-collapse onClick={() => setCollapsed(true)}>
          <PanelRightClose size={20} aria-hidden />
        </IconButton>
      </header>
      <div data-studio-scroll className="relative min-h-0 flex-1 overflow-y-auto">
        {banner != null && (
          <div data-studio-banner className="mx-4 mt-4 flex items-center rounded-lg" style={{ minHeight: BANNER_PX }}>
            {banner}
          </div>
        )}
        {/* 타일 격자 — 3×3, tint 는 묶음 신호, 아이콘·라벨이 개체를 가른다 (M117-030·031) */}
        {/* 3열이 기본. 패널이 좁아지면(드래그 리사이즈) 타일 최소 폭을 지키며 2열·1열로 흐른다 — 열 수가 아니라 타일 폭이 계약 */}
        <div data-studio-grid className="mx-4 my-4 grid" style={{ gap: TILE_GAP_PX, gridTemplateColumns: `repeat(auto-fit, minmax(${TILE_MIN_PX}px, 1fr))` }}>
          {kinds.map((k) => {
            const toneVars = TONE_VARS[k.tone]
            return (
              <button
                key={k.id}
                type="button"
                data-studio-tile={k.id}
                data-tone={k.tone}
                onClick={() => onCreate?.(k.id)}
                className={cn("flex items-center justify-between rounded-xl pb-2 pl-3 pr-2 pt-2 text-left outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2", TILE_CLASS)}
                style={{ height: TILE_H_PX, ...toneStyle(k.tone), ["--tile-bg" as string]: toneVars.bg, ["--tile-fg" as string]: toneVars.fg }}
              >
                <span className="flex h-10 min-w-0 flex-col justify-between">
                  <span className="[&>svg]:size-4">{k.icon}</span>
                  <span className="flex items-center gap-1 text-xs font-medium leading-4">
                    <span className="truncate">{k.label}</span>
                    {k.badge && (
                      <span data-studio-badge className="inline-flex shrink-0 items-center rounded-full bg-foreground px-1.5 font-medium leading-4 text-background" style={{ fontSize: BADGE_FONT_PX }}>
                        {k.badge}
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRight size={20} aria-hidden className="shrink-0 text-foreground" />
              </button>
            )
          })}
        </div>
        <div className="mx-1.5 border-t border-border" />
        {artifacts.length === 0 ? (
          <div data-studio-empty className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <WandSparkles size={24} aria-hidden className="text-muted-foreground" />
            <p className="text-sm font-medium">{L.emptyTitle}</p>
            <p className="break-keep text-sm text-muted-foreground">{L.emptyBody}</p>
          </div>
        ) : (
          <ul data-studio-artifacts className="mt-4 px-4" style={{ display: "grid", gap: ARTIFACT_GAP_PX }}>
            {artifacts.map((a) => {
              const k = kindOf(a.kindId)
              return (
                <li key={a.id} data-studio-artifact={a.id} className="group flex cursor-pointer items-center gap-2 rounded-2xl p-2 motion-safe:transition-colors hover:bg-muted" style={{ height: ARTIFACT_ROW_PX }} onClick={() => onOpen?.(a.id)}>
                  {/* 원본: 아이콘 32 칸에 먹색 아이콘 — 목록 행은 tint 없음(tint 는 「무엇을 만들 수 있나」 타일의 것) */}
                  <span className="flex size-8 shrink-0 items-center justify-center text-foreground [&>svg]:size-5">
                    {k?.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span data-studio-artifact-title className="truncate text-sm font-medium leading-4">{a.title}</span>
                    <span data-studio-artifact-sub className="truncate text-xs leading-4 text-muted-foreground">
                      {L.sourceCount(a.sourceCount)} · {a.updatedLabel}
                    </span>
                  </span>
                  <IconButton
                    label={L.menu}
                    size={BIG_HIT_PX}
                    onClick={(e) => {
                      e.stopPropagation()
                      onArtifactMenu?.(a.id)
                    }}
                  >
                    <MoreVertical size={18} aria-hidden />
                  </IconButton>
                </li>
              )
            })}
          </ul>
        )}
        {/* 하단 고정 1차 액션 — 목록 스크롤과 무관하게 항상 닿는다 (M117-033). 목록 하단 여백 48 이 이 자리를 비운다 */}
        <div className="pointer-events-none sticky bottom-0 flex justify-center pt-8" style={{ paddingBottom: NOTE_BOTTOM_PX }}>
          <button type="button" data-studio-note onClick={onAddNote} className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background shadow-sm outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-[background-color,transform] hover:bg-foreground/90 active:scale-[0.98] focus-visible:ring-2" style={{ height: NOTE_BUTTON_PX }}>
            <StickyNote size={18} aria-hidden />
            {L.addNote}
          </button>
        </div>
      </div>
    </section>
  )
}

// ── 데모 (갤러리·프로브용, zero-prop) ──────────────────────────────────────────
/** kind 9 — 원본과 같은 9종·같은 색 배치(bg 6색, 오디오=데이터 표 · 슬라이드=보고서 · 마인드맵=인포그래픽 이 같은 색) · 아이콘은 lucide */
export const studioDemoKinds: StudioKind[] = [
  { id: "audio", label: "오디오 개요", icon: <Headphones aria-hidden />, tone: "indigo" },
  { id: "slides", label: "슬라이드", icon: <Presentation aria-hidden />, tone: "amber" },
  { id: "video", label: "동영상 개요", icon: <Video aria-hidden />, tone: "green" },
  { id: "mindmap", label: "마인드맵", icon: <Network aria-hidden />, tone: "plum" },
  { id: "report", label: "보고서", icon: <FileText aria-hidden />, tone: "amber", badge: "New!" },
  { id: "flashcards", label: "플래시카드", icon: <Layers aria-hidden />, tone: "red" },
  { id: "quiz", label: "퀴즈", icon: <CircleHelp aria-hidden />, tone: "sky" },
  { id: "infographic", label: "인포그래픽", icon: <ChartColumn aria-hidden />, tone: "plum" },
  { id: "table", label: "데이터 표", icon: <Table aria-hidden />, tone: "indigo" },
]

/** 배너 아이콘 — 단색이 아니라 세 hue 가 흐르는 네 꼭짓점 별(원본 「새로운 기능」 배너의 그라디언트 스파클). 씨앗은 테마 토큰 */
function GradientSparkle({ size = 20 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--info-foreground)" />
          <stop offset="0.55" stopColor="var(--emphasis-foreground)" />
          <stop offset="1" stopColor="var(--danger-foreground)" />
        </linearGradient>
      </defs>
      <path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10z" fill={`url(#${id})`} />
    </svg>
  )
}

/** 데모 배너 — 「새로운 기능」 안내 밴드. 바탕은 단색이 아니라 두 semantic surface 가 가로로 흐르는 그라디언트 + 그라디언트 스파클 (원본 §4 배너 — computed 로 안 잡힌 레이어를 이렇게 재현) */
export function StudioDemoBanner({ onDismiss }: { onDismiss?: () => void }) {
  return (
    // 좁은 패널(드래그 리사이즈)에서는 글이 한 글자씩 꺾이지 않게 `break-keep` + 액션이 아래 줄로 흐른다(flex-wrap)
    <div data-studio-demo-banner className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg p-3" style={{ minHeight: BANNER_PX, background: "linear-gradient(90deg, var(--emphasis-surface), var(--info-surface) 60%, var(--success-surface))" }}>
      <GradientSparkle />
      <span className="min-w-32 flex-1 break-keep text-xs font-medium leading-4">데모 배너 — 소비자가 문구와 액션을 넣는 슬롯이다.</span>
      <button type="button" className="inline-flex h-8 shrink-0 items-center rounded-full bg-foreground/8 px-3 text-xs font-medium text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/12 focus-visible:ring-2">
        열기
      </button>
      <button type="button" aria-label="닫기" onClick={onDismiss} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card motion-safe:transition-colors hover:bg-foreground/8 focus-visible:ring-2">
        <X size={18} aria-hidden />
      </button>
    </div>
  )
}
export const studioDemoArtifacts: StudioArtifact[] = [
  { id: "a-mindmap", kindId: "mindmap", title: "디자인 시스템 토큰 지도", sourceCount: 10, updatedLabel: "4시간 전" },
  { id: "a-roadmap", kindId: "mindmap", title: "자산 제작 로드맵 — 채집에서 배포까지", sourceCount: 10, updatedLabel: "6시간 전" },
  { id: "a-audio", kindId: "audio", title: "다크 모드 표면 위계 — 오디오 개요", sourceCount: 10, updatedLabel: "어제" },
  { id: "a-report", kindId: "report", title: "인용 관습 비교 보고서", sourceCount: 6, updatedLabel: "3일 전" },
]

export default function StudioArtifactPanelDemo() {
  const [banner, setBanner] = useState(true)
  return (
    <div className="flex h-[600px] w-full justify-center rounded-2xl bg-muted p-4 dark:bg-background">
      <div className="h-full w-full max-w-[632px] overflow-hidden rounded-2xl bg-card">
        <StudioArtifactPanel kinds={studioDemoKinds} artifacts={studioDemoArtifacts} banner={banner ? <StudioDemoBanner onDismiss={() => setBanner(false)} /> : null} />
      </div>
    </div>
  )
}
