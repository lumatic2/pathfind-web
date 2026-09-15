import { Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react"
import { AlertCircleIcon, ArrowRightIcon, BrainIcon, ChevronDownIcon, CopyIcon, FileSearchIcon, HandIcon, MoreVerticalIcon, PinIcon, SlidersHorizontalIcon, SparkleIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * ⚠ 이 부품은 프로젝트 CSS 에 **@keyframes 두 개**가 있어야 완성된다 (M122 — 실소비자 발견).
 * 레지스트리 페이로드는 이 `.tsx` 만 싣기 때문에, 이름만 부르고 정의가 없으면 **오류 없이 애니메이션만 죽는다**.
 * 이식하는 프로젝트의 전역 CSS 에 그대로 붙인다(문구 정본: `recipes/application-ui/chat-conversation-panel.md` Code):
 *
 *   @keyframes chat-message-in { from { opacity: 0; transform: translateY(8px) scale(0.96) } to { opacity: 1; transform: none } }
 *   @keyframes chat-block-in   { from { opacity: 0; transform: translateX(-8px) }           to { opacity: 1; transform: none } }
 */

/** `id` — 이 인용이 가리키는 소스 문서 식별자(옵셔널, M122). 배지 렌더 슬롯이 문서를 찾는 열쇠다. */
export type ChatCitation = { n: number; title: string; id?: string }
export type ReasoningStep = { title: string; body?: string; kind?: "think" | "search" }

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  /**
   * M117 — 답변 **위**에 접힌 추론 층(`Thoughts ⌄`). 기본 접힘. 열면 `steps`(원본 관측 2026-09-13: 단계마다 아이콘 + 제목,
   * 그 아래 세로 선을 낀 회색 본문 — `kind: "search"` 는 「소스에서 검색됨」 같은 도구 단계, 본문 없음)를 그린다.
   * `steps` 가 없으면 `content` 한 문단.
   */
  reasoning?: { label: string; content?: string; steps?: ReasoningStep[] }
  /** M117 — 본문의 `[n]` 마커를 배지로 바꿔 끼운다. 렌더는 `renderCitation` 슬롯, 미제공 시 패널 자신의 22px 원 배지 */
  citations?: ChatCitation[]
}

export type ChatStatus = "idle" | "waiting" | "error"

type ChatConversationPanelProps = {
  messages: ChatMessage[]
  status: ChatStatus
  onSend: (text: string) => void
  onRetry: () => void
  emptyHint?: string
  /**
   * M117 — 근거 기반 답변 변형. `grounded`: 사용자 버블은 `bg-muted` + 우하 꼬리(`rounded-br-none`), 어시스턴트 답변은
   * 버블 없는 16/24 산문(원본 관측: 답변은 버블이 아니다). 기본 `default` 는 M61 그대로.
   */
  variant?: "default" | "grounded"
  /** M117 — 인용 배지 슬롯. 등재 자산은 미등재 자산을 import 하지 않으므로(registry 순수성) 배지를 밖에서 받는다 */
  renderCitation?: (citation: ChatCitation, index: number) => ReactNode
  /** M117 — 제안 질문 칩(세로 스택, 좌정렬). 빈 상태와 마지막 답변 아래 둘 다 */
  suggestions?: string[]
  onSuggestion?: (suggestion: string) => void
  /**
   * 「직접 입력」 칩(M122). 이 라벨의 칩은 답으로 보내지 않고
   * **입력창에 포커스**만 준다 — 칩이 뜨는 모든 화면에 자유 입력의 문이 있어야 한다(실소비자 사용자 피드백 A7).
   */
  directInputLabel?: string
  /**
   * 칩 주석(M122). 라벨 옆에 작은 회색 글자 — 예: 승인 칩 옆 「로드맵 1회 소진」.
   * 누르면 무엇이 줄어드는지를 누르기 **전에** 말한다(실소비자 문구 정본 §3-2).
   */
  suggestionNotes?: Record<string, string>
  /**
   * 칩 아래 **고른 이유 한 줄**(M123 — 실소비자 승격, 참조 구현 5차 step-6). 라벨 → 이유. 이유가 있는 칩만 두 줄
   * 둥근 사각이 되고, 없는 칩은 종전대로 한 줄 알약으로 선다 — 승인 칩·후속 칩·첫 화면은 이 prop 을 비워 종전 모양 그대로다.
   */
  suggestionReasons?: Record<string, string>
  /** 「추천」 표시가 붙는 칩의 라벨(M123). 정확히 하나. 그 칩을 맨 위에 놓는 정렬은 호출 측이 한다 */
  recommendedSuggestion?: string
  /** M117 — 입력창 우측 근거 범위(「소스 N개」) */
  scopeLabel?: string
  /** M117 — 입력창 초안 제어(밖에서 채우기 — 예: 마인드맵 노드 → 질의 문구). 안 주면 내부 state */
  draft?: string
  onDraftChange?: (draft: string) => void
  /** M117 grounded — 패널 머리(49h + 하단선): 제목 + 아이콘 버튼 2(구성·옵션). 주지 않으면 머리 없음 */
  title?: string
  /** grounded 헤더의 「노트북 구성」·「채팅 옵션」 아이콘. 기능을 배선하지 않은 소비자는 끈다(M122) */
  showHeaderActions?: boolean
  /** M117 grounded — 빈 상태 인사 블록(👋 + 32px 제목). `emptyHint` 가 본문, `suggestionsPrompt` 가 칩 위 굵은 유도 문장 */
  emptyTitle?: string
  /** 빈 상태 인사 그림(M123). 안 주면 종전 lucide 손 아이콘 — 브랜드 그림체를 쓰려는 소비자가 넘긴다 */
  emptyIcon?: ReactNode
  suggestionsPrompt?: string
  /**
   * 입력창 안내 문구(M122 보강 — 실소비자 승격). 종전에는 「소스에 대해 물어보세요」가 박혀 있었다.
   * 이 패널은 문서 Q&A 말고 다른 대화에도 쓰이므로 문구를 소비자가 정한다. 안 주면 종전 문구 그대로.
   */
  composerPlaceholder?: string
  /**
   * 어시스턴트 마크(M122 — 실소비자 승격). `grounded` 답변은 버블 없는 산문이라 「누가 말하는가」가 화면에 없다.
   * **연속한 어시스턴트 줄에는 그 구간에 한 번만 그린다** — 줄마다 반복하면 조사 중계처럼 줄이 길게 쌓일 때
   * 아바타가 화면을 잡아먹는다(실측: 어시스턴트 9줄 → 마크 6개).
   * `status === "waiting"` 이면 점 3개 스피너 대신 **이 마크 + `waitingLabel`** 이 그 자리에 선다.
   */
  renderAssistantMark?: () => ReactNode
  /**
   * 마크를 구간의 **어디**에 두는가 (M122 — 계약 옵션).
   * `leading`(기본) = 구간 첫 줄 **위**. 말하는 주체를 먼저 세우는 보통의 대화 화면.
   * `trailing` = 구간 마지막 줄 **아래** — 생각 중 스피너와 같은 자리라 「진행 중계」 화면에서 마크가 한 자리에
   * 머문다(실소비자가 계약을 뒤집어야 했던 자리). `trailing` 이고 대기 중이면 맨 끝 구간의 아래 마크는
   * 그리지 않는다 — 대기 줄이 그 마크를 대신 들고 있어 마크 2개가 겹친다.
   */
  assistantMarkPlacement?: "leading" | "trailing"
  /**
   * 생각 중 한 줄(M122) — 스피너 자리에 마크와 함께 뜨는 「지금 하는 일」. 조사 중계의 마지막 활동 줄이
   * 여기로 들어온다. 안 주면 기본 문구. `renderAssistantMark` 가 없으면 종전 점 3개 스피너 그대로다.
   */
  waitingLabel?: string
  /** M117 grounded — 답변 아래 액션 바(「메모에 저장」 pill + 복사·👍·👎). 하나라도 주면 바를 그린다 */
  onSaveNote?: (message: ChatMessage) => void
  onCopy?: (message: ChatMessage) => void
  onFeedback?: (message: ChatMessage, v: "up" | "down") => void
  saveNoteLabel?: string
  className?: string
}

const ROOT_CLASS = "flex h-[24rem] w-full max-w-md flex-col overflow-hidden rounded-lg border bg-background"
// M117 — 원본 관측(evidence §3): 사용자 버블 max-width 700 · 인용 배지 22 원 11px · Thoughts 36h · 제안 칩 40h ·
// 머리 49h · 빈 상태 패딩 48 40 max 672 · 제목 32/40 · 입력창 r16 패딩 16 + 전송 원 40 · 액션 pill 32
const BUBBLE_MAX_PX = 700
const BADGE_PX = 22
const BADGE_FONT_PX = 11
const REASONING_PX = 36
const REASONING_STEP_PX = 32
const CHIP_PX = 40
const HEADER_PX = 49
const ZERO_PAD_Y_PX = 48
const ZERO_PAD_X_PX = 40
const ZERO_MAX_PX = 672
const ZERO_TITLE_PX = 32
const ZERO_TITLE_LINE_PX = 40
const SEND_PX = 40
const ACTION_PX = 32
const ICON_BUTTON_PX = 36
/** 답변 블록 등장 간격·상한 (M122 — 사용자 확정 ~80ms). 상한이 없으면 긴 답변의 꼬리가 몇 초 뒤에 뜬다. */
const BLOCK_STAGGER_MS = 80
const BLOCK_STAGGER_MAX_MS = 800
const STATE_LAYER = "motion-safe:transition-colors hover:bg-foreground/8"

function GroundedIconButton({ label, size = ICON_BUTTON_PX, className, ...rest }: { label: string; size?: number } & React.ComponentProps<"button">) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2 [&>svg]:shrink-0", STATE_LAYER, className)} style={{ width: size, height: size }} {...rest} />
  )
}

/** 기본 인용 배지 — 패널 자급(`citation-ladder` 를 import 하지 않는다). 22 원, 행간을 벌리지 않는 인라인. */
function DefaultCitationBadge({ citation }: { citation: ChatCitation }) {
  return (
    <span
      data-chat-citation={citation.n}
      aria-label={`${citation.n}: ${citation.title}`}
      className="ml-1 inline-flex shrink-0 items-center justify-center rounded-full bg-muted align-middle font-medium text-muted-foreground"
      style={{ width: BADGE_PX, height: BADGE_PX, fontSize: BADGE_FONT_PX, lineHeight: 1 }}
    >
      {citation.n}
    </span>
  )
}

/** 본문 `[n]` 마커 → 배지 (해당 citation 이 없으면 문자열 그대로 둔다 — 조용히 사라지지 않는다) */
/**
 * 답변 본문 렌더 (M122 — 실소비자 승격).
 *
 * 모델은 **마크다운으로 답한다** — 제목·목록·굵게·문단으로 구조를 만들어 보낸다.
 * 그걸 평문으로 흘리면 별표와 붙임표가 그대로 보이고, 무엇보다 **답변 안의 구획이 사라진다**.
 * 사용자 지시(2026-09-13): 「턴마다 가로선」이 아니라 **답변 안에서** 갈려야 한다.
 *
 * 전체 마크다운을 구현하지 않는다 — 답변에 실제로 나오는 블록만 받는다:
 *   `#`~`####` 제목 · `-`/`*`/`1.` 목록 · `---` 구분선 · 빈 줄로 나뉘는 문단.
 * 인라인은 `**굵게**` · `` `코드` `` · `[n]` 인용. 표·이미지·링크는 받지 않는다(답변 패널이
 * 문서 렌더러가 되는 순간 유지비가 본문보다 커진다).
 */
type InlineCtx = { citations?: ChatCitation[]; render?: (c: ChatCitation, i: number) => ReactNode }

const INLINE_RE = /\[(\d+)\]|\*\*([^*]+)\*\*|`([^`]+)`/g

function renderInline(text: string, ctx: InlineCtx, keyPrefix: string): ReactNode[] {
  return renderInlineInner(text, ctx, keyPrefix, 0)[0]
}

function renderInlineInner(
  text: string,
  ctx: InlineCtx,
  keyPrefix: string,
  startN: number,
): [ReactNode[], number] {
  if (!text) return [[], 0]
  const out: ReactNode[] = []
  // 모듈 전역 INLINE_RE는 g 플래그라 lastIndex를 건드린다. 재귀 호출이 그 값을 덮어쓰면
  // 바깥 반복문이 안 끝나므로, 함수 안에서 source로 새 정규식을 매번 만든다(전역은 그대로).
  const re = new RegExp(INLINE_RE.source, "g")
  let last = 0
  let n = startN
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}-${k++}`
    if (m[1] !== undefined) {
      const n1 = Number(m[1])
      const c = ctx.citations?.find((x) => x.n === n1)
      // 인용 목록에 없는 번호는 글자 그대로 둔다 — 없는 자료를 가리키는 배지를 만들지 않는다.
      if (c) {
        out.push(
          <span key={key}>
            {ctx.render ? ctx.render(c, n) : <DefaultCitationBadge citation={c} />}
          </span>,
        )
        n += 1
      } else out.push(m[0])
    } else if (m[2] !== undefined) {
      // 굵은 글씨 안쪽도 다시 훑는다 — 모델이 심은 [n] 이 배지 로 나오게.
      const [inner, used] = renderInlineInner(m[2], ctx, `${keyPrefix}-b`, n)
      out.push(<strong key={key} className="font-semibold">{inner}</strong>)
      n += used
    } else {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {m[3]}
        </code>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return [out, n - startN]
}

const HEADING_RE = /^(#{1,4})\s+(.*)$/
const BULLET_RE = /^\s*[-*]\s+(.*)$/
const ORDERED_RE = /^\s*(\d+)[.)]\s+(.*)$/
const RULE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

/** 본문 → 블록 노드들. 빈 줄이 문단을 가르고, 목록은 연속한 줄을 하나로 묶는다. */
/** export — 좌 패널 자료 카드도 같은 렌더러로 그린다(M122). `ctx` 는 `{}` 여도 된다. */
export function renderMarkdown(text: string, ctx: InlineCtx): ReactNode {
  const lines = text.split("\n")
  const blocks: ReactNode[] = []
  let para: string[] = []
  // 번호 목록은 **원래 번호를 들고 다닌다** — `<ol>` 에 맡기면 1 부터 다시 센다.
  let list: { ordered: boolean; items: { num: number; text: string }[] } | null = null
  let k = 0

  const flushPara = () => {
    if (!para.length) return
    const body = para.join(" ")
    blocks.push(
      <p key={`p${k++}`} className="break-keep">
        {renderInline(body, ctx, `p${k}`)}
      </p>,
    )
    para = []
  }
  const flushList = () => {
    if (!list) return
    const { ordered, items } = list
    // ⚠ 번호 한 줄짜리는 목록이 아니다. 「3. 추천 로직과 화면 설계 → **섞어야 함**」 같은
    //    단계 결과 줄이 `<ol>` 로 바뀌면 번호가 **전부 1 로 다시 매겨진다**(실측으로 밟았다).
    //    여러 줄일 때만 목록으로 세우고, 그때도 `start` 로 원래 번호에서 시작한다.
    if (ordered && items.length === 1) {
      const only = items[0]
      blocks.push(
        <p key={`p${k++}`} className="break-keep">
          {renderInline(`${only.num}. ${only.text}`, ctx, `p${k}`)}
        </p>,
      )
      list = null
      return
    }
    const cls = "flex flex-col gap-1 break-keep pl-5 " + (ordered ? "list-decimal" : "list-disc")
    blocks.push(
      ordered ? (
        <ol key={`l${k++}`} className={cls} start={items[0].num}>
          {items.map((it, i) => (
            <li key={i}>{renderInline(it.text, ctx, `l${k}-${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`l${k++}`} className={cls}>
          {items.map((it, i) => (
            <li key={i}>{renderInline(it.text, ctx, `l${k}-${i}`)}</li>
          ))}
        </ul>
      ),
    )
    list = null
  }
  const flushAll = () => {
    flushPara()
    flushList()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flushAll()
      continue
    }
    if (RULE_RE.test(line)) {
      flushAll()
      blocks.push(<hr key={`h${k++}`} className="my-1 border-0 border-t border-border" />)
      continue
    }
    const head = HEADING_RE.exec(line)
    if (head) {
      flushAll()
      // 제목 위에 선을 얹어 **답변 안에서** 구획이 갈리게 한다(사용자 레퍼런스 관측).
      // 첫 블록이면 선을 생략한다 — 답변 머리에 선이 뜨면 앞 말풍선과 붙어 보인다.
      const first = blocks.length === 0
      blocks.push(
        <h3
          key={`t${k++}`}
          className={cn("break-keep font-semibold", head[1].length <= 2 ? "text-base" : "text-[0.95em]", !first && "mt-2 border-t border-border pt-3")}
        >
          {renderInline(head[2], ctx, `t${k}`)}
        </h3>,
      )
      continue
    }
    const ol = ORDERED_RE.exec(line)
    const ul = BULLET_RE.exec(line)
    if (ol || ul) {
      flushPara()
      const ordered = Boolean(ol)
      if (list && list.ordered !== ordered) flushList()
      if (!list) list = { ordered, items: [] }
      list.items.push(ol ? { num: Number(ol[1]), text: ol[2] } : { num: 0, text: ul![1] })
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushAll()

  // 블록 단위 등장(M122) — i 번째 블록이 i×80ms 뒤에 좌→우로 뜬다(상한 800ms). 진행 중계처럼 줄이 계속 붙는
  // 대화에서 새 줄이 튀어 보이지 않게 한다. CSS 애니메이션이라 DOM 노드가 살아 있는 한 재렌더에 다시 돌지 않는다
  // (키가 안정적이므로 이미 읽은 답변은 안 깜빡인다). `motion-safe:` 가 감소모션을 맡는다.
  const staged = blocks.map((b, i) =>
    isValidElement<{ className?: string; style?: CSSProperties }>(b)
      ? cloneElement(b as ReactElement<{ className?: string; style?: CSSProperties }>, {
          className: cn(b.props.className, "motion-safe:animate-[chat-block-in_0.32s_cubic-bezier(0.2,0.8,0.25,1)_both]"),
          style: { ...b.props.style, animationDelay: `${Math.min(i * BLOCK_STAGGER_MS, BLOCK_STAGGER_MAX_MS)}ms` },
          ...({ "data-chat-block": i } as Record<string, unknown>),
        })
      : b,
  )

  if (staged.length === 1) return staged[0]
  return (
    <div data-chat-markdown className="flex flex-col gap-2">
      {staged}
    </div>
  )
}

function Reasoning({ reasoning }: { reasoning: NonNullable<ChatMessage["reasoning"]> }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-chat-reasoning className="flex flex-col items-start">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2", STATE_LAYER)}
        style={{ height: REASONING_PX }}
      >
        <SparkleIcon aria-hidden className="size-4" />
        {reasoning.label}
        <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && reasoning.steps?.length ? (
        // 원본 §3 Thoughts 펼침 — 단계: 아이콘 20 + 제목 16/24(먹), 본문 16/24(회색)이 아이콘 중심 아래 세로 선(1px)에 걸려 들여쓰기
        <ol data-chat-reasoning-steps className="mt-1 flex flex-col gap-1 pl-2">
          {reasoning.steps.map((st, i) => (
            <li key={i} data-chat-reasoning-step={st.kind ?? "think"} className="flex flex-col">
              <div className="flex items-center gap-3 text-base leading-6 text-foreground" style={{ minHeight: REASONING_STEP_PX }}>
                {st.kind === "search" ? <FileSearchIcon aria-hidden className="size-5 shrink-0" /> : <BrainIcon aria-hidden className="size-5 shrink-0" />}
                <span className="break-keep">{renderInline(st.title, {}, `rs-${i}`)}</span>
              </div>
              {st.body ? (
                <p className="mb-1 ml-2.5 break-keep border-l border-border pl-5 text-base leading-6 text-muted-foreground" style={{ paddingTop: 2, paddingBottom: 2 }}>
                  {st.body}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : open ? (
        <p data-chat-reasoning-content className="mt-1 break-keep px-2 text-sm leading-6 text-muted-foreground">
          {reasoning.content}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 칩 묶음. `reasons` 가 있는 칩만 아래에 **고른 이유 한 줄**이 붙고, `recommended` 칩에는 「추천」 표시가 붙는다(M123).
 * ⚠ 두 prop 이 비면 종전 모양 그대로 선다 — 빈 상태·마지막 답변 아래·인터뷰 칩이 같은 부품이라 한쪽만 바뀌지 않는다.
 */
function Suggestions({
  items,
  onPick,
  notes,
  reasons,
  recommended,
  directInputLabel,
}: {
  items: string[]
  onPick?: (s: string) => void
  notes?: Record<string, string>
  reasons?: Record<string, string>
  recommended?: string
  directInputLabel?: string
}) {
  return (
    <div data-chat-suggestions className="flex flex-col items-start gap-2">
      {items.map((s) => {
        const why = reasons?.[s]
        const isRecommended = recommended === s && s !== directInputLabel
        return (
          <button
            key={s}
            type="button"
            data-chat-suggestion={s}
            data-chat-suggestion-recommended={isRecommended ? "" : undefined}
            data-direct-input={directInputLabel && s === directInputLabel ? "" : undefined}
            onClick={() => onPick?.(s)}
            className={cn(
              "inline-flex max-w-full flex-col items-start justify-center border border-border px-5 text-left text-sm leading-6 outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2",
              // 한 줄짜리는 종전 그대로 알약, 이유가 붙어 두 줄이 되면 둥근 사각 — 알약은 두 줄에서 양 끝이 뭉개진다
              why ? "gap-0.5 rounded-2xl py-2" : "rounded-full",
              isRecommended && "border-foreground",
              STATE_LAYER,
            )}
            style={{ minHeight: CHIP_PX }}
          >
            <span className="flex max-w-full items-center gap-2">
              {isRecommended ? (
                <span data-chat-suggestion-badge className="shrink-0 rounded-full bg-foreground px-2 text-xs font-medium leading-5 text-background">
                  추천
                </span>
              ) : null}
              <span className="min-w-0">{s}</span>
              {notes?.[s] ? (
                <span data-chat-suggestion-note className="shrink-0 text-xs text-muted-foreground">
                  {notes[s]}
                </span>
              ) : null}
            </span>
            {why ? (
              <span data-chat-suggestion-why className="max-w-full break-keep text-xs leading-5 text-muted-foreground">
                {why}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Chat conversation panel: a bounded message thread (`role="log"` polite live
 * region) above a single input bar. The thread owns its own scroll and pins to
 * the newest message; waiting and error are explicit thread entries — a
 * typing indicator with a screen-reader mirror, and a tinted error row whose
 * only action is Retry. `break-keep` keeps CJK sentences from splitting
 * mid-word inside narrow bubbles.
 *
 * M117 보강(옵트인 — 기본 렌더 무변경): `reasoning`·`citations` + `renderCitation` 슬롯 · `suggestions` 세로 칩 ·
 * `scopeLabel` 근거 범위 · `draft` 제어 · `variant="grounded"`. 관측 근거 `evidence/m117/…observation.md` §3.
 */
export function ChatConversationPanel({ messages, status, onSend, onRetry, emptyHint, variant = "default", renderCitation, suggestions, onSuggestion, scopeLabel, draft: draftProp, onDraftChange, title, showHeaderActions = true, emptyTitle, suggestionsPrompt, onSaveNote, onCopy, onFeedback, saveNoteLabel = "메모에 저장", composerPlaceholder = "소스에 대해 물어보세요", renderAssistantMark, assistantMarkPlacement = "leading", waitingLabel, directInputLabel, suggestionNotes, suggestionReasons, recommendedSuggestion, emptyIcon, className }: ChatConversationPanelProps) {
  const [draftState, setDraftState] = useState("")
  const composerRef = useRef<HTMLTextAreaElement>(null)
  // 「직접 입력」은 답이 아니라 문이다 — 보내지 않고 입력창으로 포커스만 옮긴다(M122).
  const pick = (s: string) => {
    if (directInputLabel && s === directInputLabel) {
      composerRef.current?.focus()
      return
    }
    onSuggestion?.(s)
  }
  const draft = draftProp === undefined ? draftState : draftProp
  const setDraft = (v: string) => {
    if (draftProp === undefined) setDraftState(v)
    onDraftChange?.(v)
  }
  const threadRef = useRef<HTMLDivElement>(null)
  const grounded = variant === "grounded"

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    thread.scrollTo({ top: thread.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }, [messages, status])

  const canSend = draft.trim().length > 0 && status !== "waiting"

  const send = () => {
    if (!canSend) return
    onSend(draft.trim())
    setDraft("")
  }

  const hasActions = Boolean(onSaveNote || onCopy || onFeedback)
  const zeroState = grounded && emptyTitle != null && messages.length === 0 && status === "idle"
  const showTrailingSuggestions = Boolean(suggestions?.length) && status !== "waiting" && !zeroState

  return (
    <div className={className ? cn(ROOT_CLASS, className) : ROOT_CLASS}>
      {grounded && title != null ? (
        <header data-chat-header className="flex shrink-0 items-center justify-between border-b border-border pl-4 pr-2" style={{ height: HEADER_PX }}>
          <h2 className="truncate text-base font-normal leading-6">{title}</h2>
          {showHeaderActions && (
          <div className="flex items-center">
            <GroundedIconButton label="노트북 구성">
              <SlidersHorizontalIcon size={20} aria-hidden />
            </GroundedIconButton>
            <GroundedIconButton label="채팅 옵션">
              <MoreVerticalIcon size={20} aria-hidden />
            </GroundedIconButton>
          </div>
          )}
        </header>
      ) : null}
      {/* ⚠ `relative` 는 장식이 아니라 **스크롤 가둠의 조건**이다 (M122 보강 — 실소비자 승격).
          말풍선마다 든 `sr-only` 스팬은 `position:absolute` 인데, 위치 기준 조상이 없으면
          컨테이닝 블록이 최초 컨테이닝 블록(뷰포트)이 된다 — 그러면 이 상자의 `overflow-y-auto`
          가 **그 스팬들을 못 자르고** 문서 전체가 말풍선 수만큼 길어진다(실측 1280×800·80줄에서
          `documentElement.scrollHeight` 7992, 페이지 스크롤 7192px). 이 한 단어가 그 사슬을 닫는다. */}
      <div ref={threadRef} aria-label="Conversation" className="relative flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">
        {zeroState ? (
          // 원본 §3 빈 상태 — 좌정렬 컨테이너(패딩 48 40 · max 672) · 👋 48 · 제목 32/40 400 · 본문 14/24 · 유도 14/24 500 · 칩 세로
          <div data-chat-zero className="flex flex-col items-start gap-4" style={{ padding: `${ZERO_PAD_Y_PX - 16}px ${ZERO_PAD_X_PX - 16}px`, maxWidth: ZERO_MAX_PX }}>
            <div aria-hidden className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-500">
              {emptyIcon ?? <HandIcon className="size-12 text-muted-foreground" />}
            </div>
            <h1 className="font-normal" style={{ fontSize: ZERO_TITLE_PX, lineHeight: `${ZERO_TITLE_LINE_PX}px` }}>
              {emptyTitle}
            </h1>
            {emptyHint ? <p className="break-keep text-sm leading-6">{emptyHint}</p> : null}
            {suggestions?.length ? (
              <>
                {suggestionsPrompt ? <p className="text-sm font-medium leading-6">{suggestionsPrompt}</p> : null}
                <Suggestions items={suggestions} onPick={pick} notes={suggestionNotes} reasons={suggestionReasons} recommended={recommendedSuggestion} directInputLabel={directInputLabel} />
              </>
            ) : null}
          </div>
        ) : messages.length === 0 && status === "idle" ? (
          <p className="pt-12 text-center text-sm text-muted-foreground">{emptyHint ?? "No messages yet. Ask anything to start the conversation."}</p>
        ) : null}
        {/* 말풍선은 인스타 DM 관례를 따른다 (2026-08-20 보류 수리 — 원 관측 대상 분석):
            꼬리 없는 완전 라운드(rounded-2xl), 내 것은 우측 정렬 + 채운 액센트,
            상대는 좌측 + 옅은 회색. 새 말풍선은 아래에서 살짝 떠오르며 등장한다
            (transform-origin 은 각자 붙은 모서리 쪽).
            M117 `grounded` 변형: 사용자 = bg-muted + 우하 꼬리(원본 r 20 20 0 20 → 시스템 radius), 어시스턴트 = 버블 없는 산문. */}
        {messages.map((message, index) => {
          // 사람 말풍선은 입력 그대로 보여 준다 — 내가 친 별표가 굵게 바뀌면 내 말이 아니게 된다.
          const body =
            message.role === "assistant"
              ? renderMarkdown(message.text, { citations: message.citations, render: renderCitation })
              : message.text
          // 마크는 연속한 어시스턴트 구간에 한 번만 (M122). `leading` = 구간 첫 줄 위, `trailing` = 마지막 줄 아래.
          // `trailing` 인데 지금 답을 만드는 중이면 맨 끝 구간의 마크는 대기 줄이 대신 들고 있으므로 여기서는 그리지 않는다.
          const trailing = assistantMarkPlacement === "trailing"
          const atRunEdge =
            message.role === "assistant" && (trailing ? messages[index + 1]?.role !== "assistant" : messages[index - 1]?.role !== "assistant")
          const suppressed = trailing && status === "waiting" && index === messages.length - 1
          const mark = renderAssistantMark && atRunEdge && !suppressed ? renderAssistantMark() : null
          if (grounded && message.role === "assistant") {
            return (
              <div key={message.id} data-chat-grounded-answer className="flex flex-col items-start gap-1">
                {mark && !trailing ? (
                  <div data-chat-assistant-mark className="flex items-center gap-2 pb-0.5">
                    {mark}
                  </div>
                ) : null}
                {message.reasoning && <Reasoning reasoning={message.reasoning} />}
                {/* 블록(제목·목록·구분선)을 담아야 하므로 `p` 가 아니라 `div` 다 — `p` 안에 `ul`/`hr` 은 못 넣는다. */}
                <div className="max-w-full break-keep text-base leading-6 text-foreground motion-safe:animate-[chat-message-in_0.24s_cubic-bezier(0.2,0.8,0.25,1)] origin-bottom-left">
                  <span className="sr-only">Assistant: </span>
                  {body}
                </div>
                {mark && trailing ? (
                  <div data-chat-assistant-mark className="flex items-center gap-2 pt-0.5">
                    {mark}
                  </div>
                ) : null}
                {hasActions ? (
                  // 원본 §3 액션 바 — 「메모에 저장」 outlined pill 32h + 복사·👍·👎 아이콘 버튼
                  <div data-chat-actions className="mt-1 flex flex-wrap items-center gap-1">
                    <button type="button" onClick={() => onSaveNote?.(message)} className={cn("inline-flex items-center gap-1.5 rounded-full border border-border pl-2.5 pr-3 text-sm font-medium outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2", STATE_LAYER)} style={{ height: ACTION_PX }}>
                      <PinIcon aria-hidden className="size-4" />
                      {saveNoteLabel}
                    </button>
                    <GroundedIconButton label="복사" size={ACTION_PX} onClick={() => onCopy?.(message)}>
                      <CopyIcon size={16} aria-hidden />
                    </GroundedIconButton>
                    <GroundedIconButton label="만족스러운 답변" size={ACTION_PX} onClick={() => onFeedback?.(message, "up")}>
                      <ThumbsUpIcon size={16} aria-hidden />
                    </GroundedIconButton>
                    <GroundedIconButton label="불만족스러운 답변" size={ACTION_PX} onClick={() => onFeedback?.(message, "down")}>
                      <ThumbsDownIcon size={16} aria-hidden />
                    </GroundedIconButton>
                  </div>
                ) : null}
              </div>
            )
          }
          return (
            <Fragment key={message.id}>
              {mark && !trailing ? (
                <div data-chat-assistant-mark className="flex items-center gap-2 pb-0.5">
                  {mark}
                </div>
              ) : null}
              <div className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {message.reasoning && message.role === "assistant" ? <Reasoning reasoning={message.reasoning} /> : null}
              <div
                className={cn(
                  "max-w-[85%] break-keep rounded-2xl px-3.5 py-2 text-sm",
                  "motion-safe:animate-[chat-message-in_0.24s_cubic-bezier(0.2,0.8,0.25,1)]",
                  message.role === "user"
                    ? grounded
                      ? "origin-bottom-right rounded-br-none bg-muted text-foreground"
                      : "origin-bottom-right bg-primary text-primary-foreground"
                    : "origin-bottom-left bg-muted text-foreground",
                  grounded && message.role === "user" && "px-5 py-3 text-base leading-6", // 원본 §3 사용자 버블 16/24 · 패딩 12 20
                )}
                style={grounded && message.role === "user" ? { maxWidth: BUBBLE_MAX_PX } : undefined}
              >
                <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
                {body}
              </div>
            </div>
              {mark && trailing ? (
                <div data-chat-assistant-mark className="flex items-center gap-2 pt-0.5">
                  {mark}
                </div>
              ) : null}
            </Fragment>
          )
        })}
        {status === "waiting" ? (
          renderAssistantMark ? (
            // 생각 중(M122) — 점 3개 대신 **마크 + 지금 하는 일 한 줄**. 마크가 숨 쉬듯 깜빡여 「살아 있다」를 말한다.
            <div data-chat-waiting className="flex items-center gap-2" aria-live="polite">
              <span data-chat-assistant-mark className="flex shrink-0 items-center motion-safe:animate-pulse">
                {renderAssistantMark()}
              </span>
              <span data-chat-waiting-label className="break-keep text-sm leading-6 text-muted-foreground">
                {waitingLabel ?? "생각하는 중…"}
              </span>
              <span className="sr-only">Assistant is typing</span>
            </div>
          ) : (
          <div className="flex justify-start" aria-hidden="false">
            <div className="flex items-center gap-1 rounded-lg rounded-bl-sm bg-muted px-3 py-2.5">
              <span className="sr-only">Assistant is typing</span>
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-bounce motion-reduce:opacity-60"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          </div>
          )
        ) : null}
        {status === "error" ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2" role="alert">
            <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="break-keep text-sm text-foreground">The assistant could not respond. Your message was not lost.</p>
              <Button className="mt-1 h-auto p-0" size="sm" type="button" variant="link" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        {showTrailingSuggestions ? (
          <>
            {suggestionsPrompt ? <p className="text-sm font-medium leading-6">{suggestionsPrompt}</p> : null}
            <Suggestions items={suggestions!} onPick={pick} notes={suggestionNotes} reasons={suggestionReasons} recommended={recommendedSuggestion} directInputLabel={directInputLabel} />
          </>
        ) : null}
      </div>
      {grounded ? (
        // 원본 §3 입력창 — r16 · 패딩 16 · 선은 무대보다 진하다(입력창만 선이 어둡다) · 우측 「소스 N개」 + 전송 원 40(빈 입력 = 먹 8% 비활성, 채우면 먹 채움)
        <form
          data-chat-composer
          className="shrink-0 px-4 pb-4 pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          {/* 세로 정렬: 한 줄일 때 textarea(24 + 상하 8 = 40)·「소스 N개」·전송 원 40 이 같은 높이의 중앙에 선다. 여러 줄이면 바닥 정렬 */}
          <div className="flex items-end gap-3 rounded-2xl border border-muted-foreground/60 bg-card px-4 py-3 motion-safe:transition-[border-color,box-shadow] focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground">
            <textarea
              ref={composerRef}
              aria-label="Message"
              className="max-h-72 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-muted-foreground"
              placeholder={composerPlaceholder}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            {scopeLabel ? (
              <span data-chat-scope className="flex shrink-0 items-center text-xs leading-5 text-muted-foreground" style={{ height: SEND_PX }}>
                {scopeLabel}
              </span>
            ) : null}
            <button
              aria-label="Send message"
              data-chat-send
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-full outline-none ring-ring ring-offset-2 ring-offset-card focus-visible:ring-2",
                "motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 active:scale-95",
                canSend ? "bg-foreground text-background hover:bg-foreground/90" : "bg-foreground/8 text-muted-foreground",
              )}
              style={{ width: SEND_PX, height: SEND_PX }}
              disabled={!canSend}
              type="submit"
            >
              <ArrowRightIcon size={20} aria-hidden />
            </button>
          </div>
        </form>
      ) : (
      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        {/* 컴포저는 인스타 DM 방식이다 (2026-08-20 보류 수리 — "send 버튼 위치·크기가
            이상함. 인스타 분석해서 구현"): 필드는 알약형 한 덩어리이고, 보낼 것이
            생기면 알약 **안쪽 오른쪽에 색 있는 "Send" 텍스트 버튼**이 나타난다.
            빈 상태에서는 버튼 자리가 아예 없어 조용한 필드 하나로 읽힌다 —
            네모난 아이콘 버튼을 필드 밖에 세워 두던 이전 구조가 지적받은 지점이다. */}
        <div className="flex items-end gap-1 rounded-3xl border border-input bg-background px-3 py-1 transition-shadow focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={composerRef}
            aria-label="Message"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground sm:min-h-9 sm:py-2"
            placeholder="Message…"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
          />
          {scopeLabel ? (
            <span data-chat-scope className="mb-2.5 shrink-0 text-xs text-muted-foreground">
              {scopeLabel}
            </span>
          ) : null}
          {draft.trim().length > 0 && (
            <button
              aria-label="Send message"
              className={cn(
                "mb-1 shrink-0 rounded-full px-2 py-1.5 text-sm font-semibold text-primary",
                "motion-safe:animate-[chat-message-in_0.15s_ease-out]",
                "transition-opacity hover:opacity-80 active:opacity-60",
                !canSend && "pointer-events-none opacity-40"
              )}
              disabled={!canSend}
              type="submit"
            >
              Send
            </button>
          )}
        </div>
      </form>
      )}
    </div>
  )
}

let demoMessageId = 0

/**
 * Colocated demo: replies to each sent message after a short waiting state,
 * and fails every third turn so the error row and its Retry path stay
 * observable in the gallery.
 */
export function ChatConversationPanelDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>("idle")
  const turnRef = useRef(0)
  const lastUserTextRef = useRef("")

  const reply = (userText: string) => {
    setStatus("waiting")
    window.setTimeout(() => {
      turnRef.current += 1
      if (turnRef.current % 3 === 0) {
        setStatus("error")
        return
      }
      demoMessageId += 1
      setMessages((current) => [
        ...current,
        { id: `m-${demoMessageId}`, role: "assistant", text: `Echoing back: "${userText}" — 한국어 문장도 단어 중간에서 잘리지 않고 줄바꿈됩니다.` },
      ])
      setStatus("idle")
    }, 900)
  }

  const send = (text: string) => {
    demoMessageId += 1
    lastUserTextRef.current = text
    setMessages((current) => [...current, { id: `m-${demoMessageId}`, role: "user", text }])
    reply(text)
  }

  return <ChatConversationPanel messages={messages} status={status} onSend={send} onRetry={() => reply(lastUserTextRef.current)} />
}

/** 추론 단계 데모 — 원본 §3 Thoughts 펼침 형태(분석 단계 + 도구 단계 + 검토 단계) */
export const chatGroundedDemoReasoningSteps: ReasoningStep[] = [
  { title: "소스 분석", body: "제공된 소스가 토큰 계층에 대해 무엇을 말하는지, 더 넓은 맥락을 염두에 두고 다시 살피고 있습니다." },
  { title: "질문 의도 확인", body: "대화 이력과 현재 질문을 검토해 왜 다크 모드를 함께 물었는지, 어떤 답이 필요한지 정리하고 있습니다." },
  { title: "소스에서 검색됨", kind: "search" },
  { title: "근거 대조", body: "3계층 계약 문서는 참조 방향을, 다크 모드 실측 노트는 그 방향이 다크에서 왜 필요한지를 말합니다. 두 소스가 같은 규칙을 가리키는지 확인하고 있습니다." },
  { title: "답변 구성", body: "참조 방향 규칙을 먼저 말하고, 그 규칙이 다크 모드에서 무대·카드·선의 관계를 어떻게 지키는지로 잇겠습니다." },
]

/** M117 — 근거 기반 답변 데모: 추론층 + 인용 배지 2(자급 기본 배지) + 세로 제안 칩 3 + 「소스 10개」. */
export const chatGroundedDemoMessages: ChatMessage[] = [
  { id: "g-1", role: "user", text: "토큰을 세 층으로 나누는 이유가 뭐야? 다크 모드랑도 관계가 있어?" },
  {
    id: "g-2",
    role: "assistant",
    text: "토큰은 primitive·semantic·component 세 층으로 나뉘고, 컴포넌트는 semantic 만 참조한다[1]. 그래야 다크 모드에서 역할이 끊기지 않는다 — 무대가 카드보다 어둡고 선은 오히려 밝아지는 관계가 토큰 정의 한 곳에서 뒤집힌다[2].",
    reasoning: { label: "Thoughts", steps: chatGroundedDemoReasoningSteps },
    citations: [
      { n: 1, title: "토큰 3계층 — 디자인 시스템 계약 v2" },
      { n: 2, title: "다크 모드 표면 위계 실측 노트" },
    ],
  },
]
export const chatGroundedDemoSuggestions = ["semantic 토큰만 참조하면 다크 모드에서 무엇이 달라지나요?", "무대와 카드의 명도 순서를 라이트·다크에서 비교해 주세요", "타일 tint 가 다크에서 hue 를 유지해야 하는 이유는?"]

export function ChatConversationPanelGroundedDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>(chatGroundedDemoMessages)
  const [status, setStatus] = useState<ChatStatus>("idle")
  const send = (text: string) => {
    demoMessageId += 1
    setMessages((current) => [...current, { id: `m-${demoMessageId}`, role: "user", text }])
    setStatus("waiting")
    window.setTimeout(() => {
      demoMessageId += 1
      setMessages((current) => [...current, { id: `m-${demoMessageId}`, role: "assistant", text: `「${text}」에 대해 소스 10개를 근거로 답합니다[1].`, citations: [{ n: 1, title: "토큰 3계층 — 디자인 시스템 계약 v2" }] }])
      setStatus("idle")
    }, 900)
  }
  return (
    <ChatConversationPanel
      variant="grounded"
      className="h-[32rem] max-w-2xl bg-card"
      title="채팅"
      messages={messages}
      status={status}
      onSend={send}
      onRetry={() => setStatus("idle")}
      suggestions={chatGroundedDemoSuggestions}
      onSuggestion={send}
      scopeLabel="소스 10개"
      emptyHint="소스에 대해 물어보세요."
      onSaveNote={() => {}}
      onCopy={(m) => navigator.clipboard?.writeText(m.text)}
      onFeedback={() => {}}
    />
  )
}

/** 빈 노트북 인사 문안 — 원본 §3 빈 상태(제목·본문·유도 문장) */
export const chatGroundedDemoZero = {
  title: "노트북을 시작해 보세요...",
  hint: "새로운 것을 이해하고, 만들고, 발전시킬 수 있는 나만의 빈 캔버스입니다. 시작을 도와드릴 수도 있고 아니면 직접 소스를 추가해도 됩니다.",
  prompt: "이 노트북이 어떤 도움을 주기를 바라시나요?",
  suggestions: ["새로운 주제에 관해 알아보기", "새로운 항목 만들기", "프로젝트 진행하기"],
}
