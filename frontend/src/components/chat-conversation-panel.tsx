import { useEffect, useRef, useState, type ReactNode } from "react"
import { AlertCircleIcon, ArrowRightIcon, BrainIcon, ChevronDownIcon, CopyIcon, FileSearchIcon, HandIcon, MoreVerticalIcon, PinIcon, SlidersHorizontalIcon, SparkleIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ChatCitation = { n: number; title: string }
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
  /** M117 — 입력창 우측 근거 범위(「소스 N개」) */
  scopeLabel?: string
  /** M117 — 입력창 초안 제어(밖에서 채우기 — 예: 마인드맵 노드 → 질의 문구). 안 주면 내부 state */
  draft?: string
  onDraftChange?: (draft: string) => void
  /** M117 grounded — 패널 머리(49h + 하단선): 제목 + 아이콘 버튼 2(구성·옵션). 주지 않으면 머리 없음 */
  title?: string
  /** M117 grounded — 빈 상태 인사 블록(👋 + 32px 제목). `emptyHint` 가 본문, `suggestionsPrompt` 가 칩 위 굵은 유도 문장 */
  emptyTitle?: string
  suggestionsPrompt?: string
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
function withCitations(text: string, citations: ChatCitation[], render?: (c: ChatCitation, i: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\[(\d+)\]/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const c = citations.find((x) => x.n === Number(m![1]))
    if (c) {
      out.push(<span key={`c-${m.index}`}>{render ? render(c, i) : <DefaultCitationBadge citation={c} />}</span>)
      i += 1
    } else out.push(m[0])
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
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
                <span className="break-keep">{st.title}</span>
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

function Suggestions({ items, onPick }: { items: string[]; onPick?: (s: string) => void }) {
  return (
    <div data-chat-suggestions className="flex flex-col items-start gap-2">
      {items.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick?.(s)}
          className={cn("inline-flex max-w-full items-center rounded-full border border-border px-5 text-left text-sm leading-6 outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2", STATE_LAYER)}
          style={{ minHeight: CHIP_PX }}
        >
          {s}
        </button>
      ))}
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
export function ChatConversationPanel({ messages, status, onSend, onRetry, emptyHint, variant = "default", renderCitation, suggestions, onSuggestion, scopeLabel, draft: draftProp, onDraftChange, title, emptyTitle, suggestionsPrompt, onSaveNote, onCopy, onFeedback, saveNoteLabel = "메모에 저장", className }: ChatConversationPanelProps) {
  const [draftState, setDraftState] = useState("")
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
          <div className="flex items-center">
            <GroundedIconButton label="노트북 구성">
              <SlidersHorizontalIcon size={20} aria-hidden />
            </GroundedIconButton>
            <GroundedIconButton label="채팅 옵션">
              <MoreVerticalIcon size={20} aria-hidden />
            </GroundedIconButton>
          </div>
        </header>
      ) : null}
      <div ref={threadRef} aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite">
        {zeroState ? (
          // 원본 §3 빈 상태 — 좌정렬 컨테이너(패딩 48 40 · max 672) · 👋 48 · 제목 32/40 400 · 본문 14/24 · 유도 14/24 500 · 칩 세로
          <div data-chat-zero className="flex flex-col items-start gap-4" style={{ padding: `${ZERO_PAD_Y_PX - 16}px ${ZERO_PAD_X_PX - 16}px`, maxWidth: ZERO_MAX_PX }}>
            <HandIcon aria-hidden className="size-12 text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-500" />
            <h1 className="font-normal" style={{ fontSize: ZERO_TITLE_PX, lineHeight: `${ZERO_TITLE_LINE_PX}px` }}>
              {emptyTitle}
            </h1>
            {emptyHint ? <p className="break-keep text-sm leading-6">{emptyHint}</p> : null}
            {suggestions?.length ? (
              <>
                {suggestionsPrompt ? <p className="text-sm font-medium leading-6">{suggestionsPrompt}</p> : null}
                <Suggestions items={suggestions} onPick={onSuggestion} />
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
        {messages.map((message) => {
          const body = message.citations?.length ? withCitations(message.text, message.citations, renderCitation) : message.text
          if (grounded && message.role === "assistant") {
            return (
              <div key={message.id} data-chat-grounded-answer className="flex flex-col items-start gap-1">
                {message.reasoning && <Reasoning reasoning={message.reasoning} />}
                <p className="max-w-full break-keep text-base leading-6 text-foreground motion-safe:animate-[chat-message-in_0.24s_cubic-bezier(0.2,0.8,0.25,1)] origin-bottom-left">
                  <span className="sr-only">Assistant: </span>
                  {body}
                </p>
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
            <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {message.reasoning && message.role === "assistant" ? <Reasoning reasoning={message.reasoning} /> : null}
              <p
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
              </p>
            </div>
          )
        })}
        {status === "waiting" ? (
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
        ) : null}
        {status === "error" ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2" role="alert">
            <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="break-keep text-sm text-foreground">The assistant could not respond. Your message was not lost.</p>
              <Button className="mt-1 h-auto p-0 text-foreground/70 hover:text-foreground underline-offset-2 hover:underline" size="sm" type="button" variant="default" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        {showTrailingSuggestions ? <Suggestions items={suggestions!} onPick={onSuggestion} /> : null}
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
              aria-label="Message"
              className="max-h-72 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-muted-foreground"
              placeholder="소스에 대해 물어보세요"
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
