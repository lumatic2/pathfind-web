import { Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react"
import { AlertCircleIcon, ArrowRightIcon, LockIcon, BrainIcon, ChevronDownIcon, CopyIcon, FileSearchIcon, HandIcon, MoreVerticalIcon, PinIcon, SlidersHorizontalIcon, SparkleIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** `id` — 이 인용이 가리키는 소스 문서 식별자(옵셔널, 참조 구현 국소 추가 4차 step-1 — 상류 등재 대상). 배지 렌더 슬롯이 문서를 찾는 열쇠다. */
export type ChatCitation = { n: number; title: string; id?: string }
export type ReasoningStep = {
  title: string
  body?: string
  kind?: "think" | "search"
  /**
   * 그 단계에서 **실제로 건진 자료** — 채널 이름표 + 제목 (6차 step-8b, 2026-09-15 사용자 육안).
   * 집계 한 줄(`body`)이 「몇 건인지」를 말하고 이것이 「어느 것인지」를 말한다.
   * 이름표가 앞 줄과 같으면 렌더가 비운다 — 같은 말이 세로로 반복되면 목록이 안 읽힌다.
   */
  found?: Array<{ label: string; name: string }>
}

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
  /**
   * 이 답변 **앞에 옅은 구분선**을 긋는다 (2026-09-15 사용자 육안 ⑤ — 제미나이 노트북의 단계 구분선).
   *
   * ⚠ 본문 안(`---`)으로 그으면 **`reasoning` 아코디언보다 아래**에 선다. 아코디언은 답변 **위**에 서므로
   *   그러면 선이 「아코디언 | 제목」 사이에 끼어 아코디언이 **앞 단계에 붙어** 보인다(실측으로 잡았다).
   *   그래서 선은 본문이 아니라 **말풍선 바깥 맨 위**가 자리다.
   */
  sectionStart?: boolean
  /** M117 — 본문의 `[n]` 마커를 배지로 바꿔 끼운다. 렌더는 `renderCitation` 슬롯, 미제공 시 패널 자신의 22px 원 배지 */
  citations?: ChatCitation[]
}

export type ChatStatus = "idle" | "waiting" | "error"

type ChatConversationPanelProps = {
  messages: ChatMessage[]
  status: ChatStatus
  onSend: (text: string) => void
  onRetry: () => void
  errorMessage?: string
  retryLabel?: string
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
   * 「직접 입력」 칩(3차 step-7 — 참조 구현 국소 추가, 상류 등재 대상). 이 라벨의 칩은 답으로 보내지 않고
   * **입력창에 포커스**만 준다 — 칩이 뜨는 모든 화면에 자유 입력의 문이 있어야 한다(사용자 피드백 A7).
   */
  directInputLabel?: string
  /**
   * 칩 주석(3차 step-7 — 참조 구현 국소 추가, 상류 등재 대상). 라벨 옆에 작은 회색 글자 — 예: 승인 칩 옆 「로드맵 1회 소진」.
   * 누르면 무엇이 줄어드는지를 누르기 **전에** 말한다(문구 정본 §3-2).
   */
  suggestionNotes?: Record<string, string>
  /** 칩 아래 **고른 이유 한 줄**(5차 step-6 · D3). 라벨 → 이유. 없는 칩은 종전대로 한 줄 알약으로 선다 */
  suggestionReasons?: Record<string, string>
  /** 추천 표시가 붙는 칩의 라벨. 정확히 하나이고, 그 칩을 맨 위에 놓는 것은 호출 측이 한다 */
  recommendedSuggestion?: string
  /** M117 — 입력창 우측 근거 범위(「소스 N개」) */
  scopeLabel?: string
  /** M117 — 입력창 초안 제어(밖에서 채우기 — 예: 마인드맵 노드 → 질의 문구). 안 주면 내부 state */
  draft?: string
  onDraftChange?: (draft: string) => void
  /** M117 grounded — 패널 머리(49h + 하단선): 제목 + 아이콘 버튼 2(구성·옵션). 주지 않으면 머리 없음 */
  title?: string
  /** grounded 헤더의 「노트북 구성」·「채팅 옵션」 아이콘. 기능을 배선하지 않은 소비자는 끈다(참조 구현 국소 추가 M5 4차 보강 3 — 상류 등재 대상) */
  showHeaderActions?: boolean
  /** M117 grounded — 빈 상태 인사 블록(👋 + 32px 제목). `emptyHint` 가 본문, `suggestionsPrompt` 가 칩 위 굵은 유도 문장 */
  emptyTitle?: string
  /** 빈 상태 인사 그림. 안 주면 lucide 손 아이콘이 선다 — 브랜드 그림체를 쓰려면 앱이 넘긴다. */
  emptyIcon?: ReactNode
  suggestionsPrompt?: string
  /**
   * 입력창 안내 문구(M5 확장 2차 step-4 — 참조 구현 국소 추가, 상류 등재 대상).
   * 종전에는 「소스에 대해 물어보세요」가 박혀 있었다. 이 패널은 문서 Q&A 말고 다른 대화에도 쓰이므로
   * 문구를 소비자가 정한다. 안 주면 종전 문구 그대로.
   */
  composerPlaceholder?: string
  /**
   * 입력창을 잠근다(M18 — 데모 빌드). 잠그면 타자는 막히고 칩으로만 진행한다.
   * 데모는 미리 녹화한 시나리오를 재생하므로 자유 입력에 답할 응답이 없다.
   */
  composerLocked?: boolean
  /** 눌리지 않게 죽일 칩 목록(M18 데모) */
  disabledSuggestions?: string[]
  /**
   * 어시스턴트 마크(M5 확장 2차 step-4 → 3차 step-4 — 참조 구현 국소 추가, 상류 등재 대상).
   * **연속한 어시스턴트 줄에는 마지막 줄 아래에만 그린다**(사용자 재확인 2026-09-13 — 「답변 아래로」). 줄마다 반복하면
   * 조사 중계처럼 줄이 길게 쌓일 때 화면을 아바타가 잡아먹는다(설계 실측 전제).
   * `status === "waiting"` 이면 점 3개 스피너 대신 **이 마크 + `waitingLabel`** 이 그 자리에 선다 — 그동안 맨 끝
   * 구간의 아래 마크는 그리지 않는다(마크 2개·문구 2줄 겹침 방지).
   */
  renderAssistantMark?: () => ReactNode
  /**
   * 생각 중 한 줄(3차 step-4) — 스피너 자리에 마크와 함께 뜨는 「지금 하는 일」. 조사 중계의 마지막 활동 줄이
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
const BADGE_PX = 18
const BADGE_FONT_PX = 10
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
/** 답변 블록 등장 간격·상한 (3차 step-5 — 사용자 확정 ~80ms). 상한이 없으면 긴 답변의 꼬리가 몇 초 뒤에 뜬다. */
const BLOCK_STAGGER_MS = 80
const BLOCK_STAGGER_MAX_MS = 800
const STATE_LAYER = "motion-safe:transition-colors hover:bg-foreground/8"
/** 대화 줄의 등장 전환. 말풍선·답변 본문이 쓰던 것과 같은 것을 부속 줄(마크·조사 과정·진행 줄·칩)에도 준다 —
 *  이 넷이 빠져 있어 답변은 떠오르는데 그 아래 줄들만 튀어나왔다(2026-09-15 실측: 넷 다 `animation: none`). */
/**
 * 기다리는 동안의 경과 시간 (M5 확장 6차 step-5, 사용자 피드백 C
 * 「여기 우측에, 에이전트가 생각하는 시간이 표시되면 좋겠어. 0초부터 해서 분 30초~~ 뭐 이렇게」).
 *
 * `active` 가 켜지는 **그 순간부터** 0 으로 다시 센다 — 턴이 바뀌면 앞 회차 값이 남지 않는다.
 * 꺼지면 인터벌을 걷고 0 으로 되돌린다(값이 화면에 남는 자리는 없다 — 대기 줄 자체가 사라진다).
 * ⚠ `motion-safe` 밖이다. 이건 장식이 아니라 **얼마나 걸리는지**를 말하는 정보라 감소모션에서도 돈다.
 */
function useElapsedSeconds(active: boolean): number {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!active) { setSec(0); return }
    const started = Date.now()
    setSec(0)
    const id = setInterval(() => setSec(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [active])
  return sec
}

/** `12초` · `1분 0초` · `1분 30초`. 60초를 넘으면 분을 앞세우고 **초가 0 이어도 적는다**(숫자가 도는 게 보여야 한다). */
export function formatElapsed(sec: number): string {
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

const ENTER_IN = "motion-safe:animate-[chat-message-in_0.24s_cubic-bezier(0.2,0.8,0.25,1)]"

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
 * 답변 본문 렌더 (M5 확장 2차 step-5 → 2차 보강 2026-09-13 사용자 지시).
 *
 * 모델은 **마크다운으로 답한다** — 제목·목록·굵게·문단으로 구조를 만들어 보낸다.
 * 그걸 평문으로 흘리면 별표와 붙임표가 그대로 보이고, 무엇보다 **답변 안의 구획이 사라진다**.
 * 사용자 지시(2026-09-13): 「턴마다 가로선」이 아니라 **답변 안에서** 갈려야 한다.
 *
 * 전체 마크다운을 구현하지 않는다 — 답변에 실제로 나오는 블록만 받는다:
 *   `#`~`####` 제목 · `-`/`*`/`1.` 목록 · `---` 구분선 · 빈 줄로 나뉘는 문단.
 * 인라인은 `**굵게**` · `` `코드` `` · `[n]` 인용 · `[글](주소)` 링크 · `![대체글](주소)` 이미지.
 *
 * ⚠ **표·링크·이미지는 6차 step-13 에서 받기 시작했다.** 5차까지는 「답변 패널이 문서 렌더러가 되는 순간
 * 유지비가 본문보다 커진다」는 이유로 안 받았는데, 그 결과 **모델이 산출 지시를 어기고 표를 내면 화면에
 * `| 항목 | 값 |` 가 글자 그대로 섰다**(5차 finding). 6차는 step-7·9 로 모델 자유도를 늘리므로 그 결함이
 * 더 자주 발현된다 — 그래서 여기서 닫는다. 받는 것은 **이 셋뿐**이고 각주·인용문·중첩 표는 여전히 안 받는다.
 */
/**
 * ⚠ `staged` — 블록이 차례차례 뜨는 등장 연출을 켤지 (참조 구현 국소 추가, 8차 육안 5라운드 · 2026-09-16 사용자
 *   「카드 안에 텍스트 등장할 때 애니메이션 … 없애. 좌측 패널에선 있어도 되는데 여긴 있으면 어색함」).
 *   기본은 켜짐 — 대화 답변과 좌 패널 문서는 종전 그대로다. **hover 로 잠깐 뜨는 인용 카드에서만 끈다.**
 */
type InlineCtx = { citations?: ChatCitation[]; render?: (c: ChatCitation, i: number) => ReactNode; staged?: boolean }

/**
 * ⚠ **차례가 뜻을 정한다.** 이미지(`![…](…)`)를 링크보다 먼저, 링크(`[…](…)`)를 인용(`[n]`)보다 먼저 본다 —
 * 링크를 뒤에 두면 `[3](https://…)` 의 앞머리가 인용으로 먼저 잡혀 주소가 글자로 샌다.
 * ⚠ **맨 주소도 링크로 만든다** (8차 육안 6라운드 — 2026-09-16 사용자 「카드 안에 출처 링크가 클릭이 안 되네?
 *   하이퍼링크로 되도록 하자」). 자료 문서 본문은 `**출처** — https://…` 처럼 주소를 **그대로** 적는데,
 *   마크다운 링크가 아니라 글자로만 섰다. 맨 마지막에 둔다 — 앞의 어느 짝도 먹지 않게.
 */
const INLINE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\[(\d+)\]|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s<>()\[\]]+)/g

/**
 * 화면에 실을 수 있는 주소인가. **`javascript:` 같은 스킴을 막는다** — 모델이 낸 문자열이 그대로 `href` 가 되는 자리다.
 * 허용은 `http`·`https` 와 페이지 안 앵커뿐이다.
 */
function safeUrl(raw: string): string | null {
  const u = String(raw ?? "").trim()
  if (!u) return null
  if (u.startsWith("#")) return u
  return /^https?:\/\//i.test(u) ? u : null
}

/**
 * 인라인 조각을 그린다. `startN` 은 **배지 순번의 이어달리기**다 — 굵은 글씨 안을 재귀로 훑을 때
 * 번호가 1부터 다시 시작하면 같은 문단에 같은 번호가 두 번 선다.
 */
function renderInline(text: string, ctx: InlineCtx, keyPrefix: string): ReactNode[] {
  return renderInlineParts(text, ctx, keyPrefix, 0).nodes
}

function renderInlineParts(text: string, ctx: InlineCtx, keyPrefix: string, startN = 0): { nodes: ReactNode[]; used: number } {
  const out: ReactNode[] = []
  let last = 0
  let n = startN
  let m: RegExpExecArray | null
  /**
   * ⚠ **호출마다 제 정규식을 쓴다.** `INLINE_RE` 는 모듈 전역 `/g` 라 `lastIndex` 를 들고 있는데,
   *   굵은 글씨 안을 재귀로 훑으면 안쪽 호출이 그 값을 덮어써 **바깥 루프가 끝나지 않는다**
   *   (실측: probe 가 스택을 태우고 죽었다). 재귀를 넣는 순간 공유 상태가 사고가 된다.
   */
  const re = new RegExp(INLINE_RE.source, "g")
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyPrefix}-${m.index}`
    if (m[2] !== undefined) {
      // 이미지 — 주소가 안전할 때만 그린다. 아니면 대체글만 남긴다(주소를 글자로 흘리지 않는다).
      const src = safeUrl(m[2])
      const alt = m[1] ?? ""
      out.push(
        src ? (
          <img key={key} src={src} alt={alt} loading="lazy" className="my-1 max-h-72 max-w-full rounded-lg border border-border object-contain" />
        ) : (
          <span key={key}>{alt}</span>
        ),
      )
    } else if (m[4] !== undefined) {
      // 링크 — 막힌 스킴이면 **글만 남긴다**. 죽은 링크를 만드느니 글로 두는 쪽이 낫다.
      const href = safeUrl(m[4])
      const label = m[3] ?? ""
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-foreground">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        ),
      )
    } else if (m[5] !== undefined) {
      const c = ctx.citations?.find((x) => x.n === Number(m![5]))
      // 인용 목록에 없는 번호는 글자 그대로 둔다 — 없는 자료를 가리키는 배지를 만들지 않는다.
      if (c) {
        out.push(<span key={key}>{ctx.render ? ctx.render(c, n) : <DefaultCitationBadge citation={c} />}</span>)
        n += 1
      } else out.push(m[0])
    } else if (m[6] !== undefined) {
      /**
       * ⚠ **굵은 글씨 안도 다시 훑는다** (2026-09-15 실측 — 배지가 통째로 사라졌다).
       *
       * 6차가 판정 문장을 `**…**` 로 싸기 시작했는데, 그 문장에는 모델이 심은 `[n]` 이 들어 있다.
       * 안쪽을 그대로 뱉으면 그 마커가 **글자 그대로** 화면에 남는다 — 실측에서 배지 0개,
       * `[1][2][3]` 이 굵은 글씨 안에 날것으로 섰다. 5차까지는 굵은 자리에 계약 값만 들어가서 안 드러났다.
       *
       * `n`(배지 순번)은 재귀 호출과 **공유되어야** 번호가 이어진다 — 그래서 되돌려 받아 더한다.
       */
      const inner = renderInlineParts(m[6], ctx, `${key}-b`, n)
      n += inner.used
      out.push(
        <strong key={key} className="font-semibold">
          {inner.nodes}
        </strong>,
      )
    } else if (m[8] !== undefined) {
      // 맨 주소 — `safeUrl` 을 그대로 지난다(`javascript:` 는 애초에 이 짝에 안 걸린다).
      const href = safeUrl(m[8])
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-2 hover:text-foreground">
            {m[8]}
          </a>
        ) : (
          <span key={key}>{m[8]}</span>
        ),
      )
    } else {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
          {m[7]}
        </code>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return { nodes: out, used: n - startN }
}

const HEADING_RE = /^(#{1,4})\s+(.*)$/
/**
 * 파이프 표 (6차 step-13). 첫 줄이 `| a | b |`, 둘째 줄이 `|---|---|` 이면 표로 본다.
 * 둘째 줄(구분선)을 **함께 요구하는** 이유: 그것 없이 파이프만 보면 산문 속 `|` 가 표로 오인된다.
 */
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|\s*$/
/** `| a | b |` → `["a","b"]`. 양끝 파이프를 이미 뗀 몸통을 받는다. */
function tableCells(body: string): string[] {
  return body.split("|").map((c) => c.trim())
}
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/
const ORDERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/
const RULE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/

/** 본문 → 블록 노드들. 빈 줄이 문단을 가르고, 목록은 연속한 줄을 하나로 묶는다. */
/** export — 좌 패널 자료 카드도 같은 렌더러로 그린다(참조 구현 국소 4차 step-12, 상류 등재 대상). `ctx` 는 `{}` 여도 된다. */
export function renderMarkdown(text: string, ctx: InlineCtx): ReactNode {
  const lines = text.split("\n")
  const blocks: ReactNode[] = []
  let para: string[] = []
  // 번호 목록은 **원래 번호를 들고 다닌다** — `<ol>` 에 맡기면 1 부터 다시 센다.
  // `depth` 는 2단까지만 본다 (2026-09-16 사용자 지시 — 「2단 같이 표현할 수 있을거고(사용될 일 생길 경우에만)」).
  // 3단 이상은 화면에서 읽히지 않아 2단으로 접는다.
  let list: { ordered: boolean; items: { num: number; text: string; depth: number }[] } | null = null
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
    const cls = "flex flex-col gap-2 break-keep pl-5 " + (ordered ? "list-decimal" : "list-disc")
    /**
     * 2단 목록 (2026-09-16 사용자 지시). 종전에는 들여쓰기를 안 봐서 **하위 항목이 상위와 같은 줄에 평평하게** 섰다.
     * 깊은 항목은 **바로 앞 항목 안쪽**으로 넣는다 — 앞이 없으면(첫 줄부터 들여쓴 경우) 그냥 1단으로 둔다.
     * 하위 목록의 기호는 속이 빈 동그라미(`list-[circle]`)라 눈으로 단이 갈린다.
     */
    const tree: { it: { num: number; text: string; depth: number }; kids: { num: number; text: string; depth: number }[] }[] = []
    for (const it of items) {
      if (it.depth > 0 && tree.length) tree[tree.length - 1].kids.push(it)
      else tree.push({ it, kids: [] })
    }
    const renderItems = (key: string) =>
      tree.map((node, i) => (
        <li key={i}>
          {renderInline(node.it.text, ctx, `${key}-${i}`)}
          {node.kids.length ? (
            <ul className="mt-2 flex list-[circle] flex-col gap-2 break-keep pl-5">
              {node.kids.map((kid, j) => (
                <li key={j}>{renderInline(kid.text, ctx, `${key}-${i}-${j}`)}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))
    blocks.push(
      ordered ? (
        <ol key={`l${k++}`} className={cls} start={tree[0].it.num}>
          {renderItems(`l${k}`)}
        </ol>
      ) : (
        <ul key={`l${k++}`} className={cls}>{renderItems(`l${k}`)}</ul>
      ),
    )
    list = null
  }
  const flushAll = () => {
    flushPara()
    flushList()
  }

  // ⚠ 인덱스 루프다 — 표는 **다음 줄(구분선)** 을 봐야 시작을 알 수 있고, 먹은 줄만큼 건너뛰어야 한다.
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trimEnd()
    if (!line.trim()) {
      flushAll()
      continue
    }
    if (RULE_RE.test(line)) {
      flushAll()
      blocks.push(<hr key={`h${k++}`} className="my-5 border-0 border-t border-border" />)
      continue
    }
    // 표 — 이 줄이 표 행이고 **다음 줄이 구분선**이면 거기서부터 표가 시작된다.
    const asRow = TABLE_ROW_RE.exec(line)
    if (asRow && TABLE_SEP_RE.test((lines[li + 1] ?? "").trimEnd())) {
      flushAll()
      const header = tableCells(asRow[1])
      const rows: string[][] = []
      let j = li + 2
      while (j < lines.length) {
        const nextRow = TABLE_ROW_RE.exec(lines[j].trimEnd())
        if (!nextRow) break
        rows.push(tableCells(nextRow[1]))
        j += 1
      }
      li = j - 1 // 바깥 루프가 ++ 하므로 마지막으로 먹은 줄을 가리켜 둔다
      blocks.push(
        <div key={`tb${k++}`} className="my-1 overflow-x-auto">
          <table className="w-full border-collapse text-[0.95em]">
            <thead>
              <tr>
                {header.map((c, i) => (
                  <th key={i} className="border border-border bg-muted px-2 py-1 text-left font-medium break-keep">
                    {renderInline(c, ctx, `tb${k}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {/* 머리 칸 수에 맞춘다 — 모자라면 빈 칸, 넘치면 버린다. 어긋난 표가 레이아웃을 깨지 않게. */}
                  {header.map((_, ci) => (
                    <td key={ci} className="border border-border px-2 py-1 align-top break-keep">
                      {renderInline(r[ci] ?? "", ctx, `tb${k}-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
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
          className={cn("break-keep font-semibold", head[1].length <= 2 ? "text-base" : "text-[0.95em]", !first && "mt-5 border-t border-border pt-5")}
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
      // 들여쓴 칸 2개당 한 단 — 목록 기호 앞의 공백이 그대로 깊이다(탭은 2칸으로 친다).
      const indent = (ol ? ol[1] : ul![1]).replace(/	/g, "  ").length
      const depth = Math.min(1, Math.floor(indent / 2))
      list.items.push(ol ? { num: Number(ol[2]), text: ol[3], depth } : { num: 0, text: ul![2], depth })
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushAll()

  // 블록 단위 등장(3차 step-5, 사용자 피드백 A6) — i 번째 블록이 i×80ms 뒤에 좌→우로 뜬다(상한 800ms).
  // CSS 애니메이션이라 DOM 노드가 살아 있는 한 재렌더에 다시 돌지 않는다(키가 안정적이므로 이미 읽은 답변은 안 깜빡인다).
  // 움직임을 줄인 환경은 `index.css` 가 `animation: none` 으로 즉시 표시한다.
  const staged = ctx.staged === false ? blocks : blocks.map((b, i) =>
    isValidElement<{ className?: string; style?: CSSProperties }>(b)
      ? cloneElement(b as ReactElement<{ className?: string; style?: CSSProperties }>, {
          className: cn(b.props.className, "chat-block-in"),
          style: { ...b.props.style, ["--block-delay" as string]: `${Math.min(i * BLOCK_STAGGER_MS, BLOCK_STAGGER_MAX_MS)}ms` },
          ...({ "data-chat-block": i } as Record<string, unknown>),
        })
      : b,
  )

  if (staged.length === 1) return staged[0]
  return (
    <div data-chat-markdown className="flex flex-col gap-4">
      {staged}
    </div>
  )
}

function Reasoning({ reasoning }: { reasoning: NonNullable<ChatMessage["reasoning"]> }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-chat-reasoning className={cn("flex flex-col items-start origin-bottom-left", ENTER_IN)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        /**
         * 본문과 **같은 글자 크기·같은 왼쪽 선**에 세운다 (2026-09-15 사용자 지적, 실측으로 확인).
         *   잰 값: 본문 글자 16px/24 · left 293 / 아코디언 라벨 14px/20 · left 321(+28) / 펼친 단계 줄 left 333(+40)
         * `-ml-2` 는 버튼의 좌우 여백(`px-2`)을 상쇄해 **아이콘이 본문 첫 글자 자리에서 시작**하게 한다 —
         * 여백을 지우는 대신 상쇄하는 이유는 눌리는 면적(STATE_LAYER)을 그대로 두기 위해서다.
         */
        className={cn("-ml-2 inline-flex items-center gap-1 rounded-lg px-2 text-base leading-6 text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2", STATE_LAYER)}
        style={{ height: REASONING_PX }}
      >
        <SparkleIcon aria-hidden className="size-4" />
        {reasoning.label}
        <ChevronDownIcon aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && reasoning.steps?.length ? (
        // 원본 §3 Thoughts 펼침 — 단계: 아이콘 20 + 제목 16/24(먹), 본문 16/24(회색)이 아이콘 중심 아래 세로 선(1px)에 걸려 들여쓰기
        <ol data-chat-reasoning-steps className="mt-1 flex flex-col gap-1">
          {reasoning.steps.map((st, i) => (
            <li key={i} data-chat-reasoning-step={st.kind ?? "think"} className="flex flex-col">
              <div className="flex items-center gap-3 text-base leading-6 text-foreground" style={{ minHeight: REASONING_STEP_PX }}>
                {st.kind === "search" ? <FileSearchIcon aria-hidden className="size-5 shrink-0" /> : <BrainIcon aria-hidden className="size-5 shrink-0" />}
                <span className="break-keep">{renderInline(st.title, {}, `rs-${i}`)}</span>
              </div>
              {st.body ? (
                <p className="ml-2.5 break-keep border-l border-border pl-5 text-base leading-6 text-muted-foreground" style={{ paddingTop: 2, paddingBottom: 2 }}>
                  {st.body}
                </p>
              ) : null}
              {/**
                * 건진 자료의 **제목 목록** — 집계 줄 바로 아래, 같은 세로 선에 걸린다.
                * 이름표 칸을 고정 폭으로 두는 이유는 제목들의 왼쪽 끝을 맞추기 위해서다(들쭉날쭉하면 훑어지지 않는다).
                */}
              {st.found?.length ? (
                <ul className="mb-1 ml-2.5 flex flex-col border-l border-border pl-5 text-base leading-6">
                  {st.found.map((f, j) => (
                    <li key={j} className="flex gap-2 break-keep">
                      <span className="w-16 shrink-0 text-muted-foreground/60">{j > 0 && st.found![j - 1].label === f.label ? "" : f.label}</span>
                      <span className="min-w-0 flex-1 text-muted-foreground">{f.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : open ? (
        <p data-chat-reasoning-content className="mt-1 break-keep text-base leading-6 text-muted-foreground">
          {reasoning.content}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 칩 묶음. `reasons` 가 있는 칩만 아래에 **고른 이유 한 줄**이 붙고, `recommended` 칩에는 표시가 붙는다(5차 step-6 · D3).
 * ⚠ 이유가 없는 화면(승인 칩·완주 후 후속 칩·첫 화면)에서는 두 prop 이 비어 **종전 모양 그대로** 선다 —
 *   이 셋이 같은 부품을 쓰므로 한쪽을 고치면 세 화면이 같이 바뀐다.
 */
function Suggestions({
  items,
  onPick,
  notes,
  reasons,
  recommended,
  directInputLabel,
  disabled,
}: {
  items: string[]
  onPick?: (s: string) => void
  notes?: Record<string, string>
  reasons?: Record<string, string>
  recommended?: string
  directInputLabel?: string
  /** 눌리지 않는 칩(M18 데모) — 보이되 회색으로 죽인다. 녹화에 없는 갈래를 누르면 내용이 어긋난다. */
  disabled?: string[]
}) {
  return (
    <div data-chat-suggestions className={cn("flex flex-col items-start gap-2 origin-bottom-left", ENTER_IN)}>
      {items.map((s) => {
        const why = reasons?.[s]
        const isRecommended = recommended === s && s !== directInputLabel
        const isDisabled = disabled?.includes(s) ?? false
        return (
          <button
            key={s}
            type="button"
            data-chat-suggestion={s}
            data-chat-suggestion-recommended={isRecommended ? "" : undefined}
            data-chat-suggestion-disabled={isDisabled ? "" : undefined}
            data-direct-input={directInputLabel && s === directInputLabel ? "" : undefined}
            onClick={() => onPick?.(s)}
            disabled={isDisabled}
            title={isDisabled ? "데모에는 이 갈래가 담겨 있지 않습니다" : undefined}
            className={cn(
              "inline-flex max-w-full flex-col items-start justify-center border border-border px-5 text-left text-sm leading-6 outline-none ring-ring ring-offset-2 ring-offset-background focus-visible:ring-2",
              // 한 줄짜리는 종전 그대로 알약, 이유가 붙어 두 줄이 되면 둥근 사각이 된다(알약은 두 줄에서 양 끝이 뭉개진다)
              why ? "gap-0.5 rounded-2xl py-2" : "rounded-full",
              isRecommended && "border-foreground",
              // 죽은 칩 — 보이되 눌리지 않는다(M18 데모). 상태 레이어(hover)도 빼야 눌릴 것처럼 안 보인다.
              isDisabled ? "cursor-not-allowed border-border/50 text-muted-foreground/60 opacity-60" : STATE_LAYER,
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
export function ChatConversationPanel({ messages, status, onSend, onRetry, errorMessage = "The assistant could not respond. Your message was not lost.", retryLabel = "Retry", emptyHint, variant = "default", renderCitation, suggestions, onSuggestion, scopeLabel, draft: draftProp, onDraftChange, title, showHeaderActions = true, emptyTitle, emptyIcon, suggestionsPrompt, onSaveNote, onCopy, onFeedback, saveNoteLabel = "메모에 저장", composerPlaceholder = "소스에 대해 물어보세요", composerLocked = false, disabledSuggestions, renderAssistantMark, waitingLabel, directInputLabel, suggestionNotes, suggestionReasons, recommendedSuggestion, className }: ChatConversationPanelProps) {
  const waitingSeconds = useElapsedSeconds(status === "waiting")
  const [draftState, setDraftState] = useState("")
  const composerRef = useRef<HTMLTextAreaElement>(null)
  // 「직접 입력」은 답이 아니라 문이다 — 보내지 않고 입력창으로 포커스만 옮긴다(3차 step-7).
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

  const canSend = draft.trim().length > 0 && status !== "waiting" && !composerLocked

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
      {/* ⚠ `relative` 는 장식이 아니라 **스크롤 가둠의 조건**이다 (M5 확장 2차 step-6).
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
                <Suggestions items={suggestions} onPick={pick} notes={suggestionNotes} reasons={suggestionReasons} recommended={recommendedSuggestion} directInputLabel={directInputLabel} disabled={disabledSuggestions} />
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
          // 마크는 연속한 어시스턴트 구간의 **마지막 줄 아래**(3차 step-4). 지금 답을 만드는 중이면 맨 끝 구간의 마크는
          // 스피너 자리가 대신 들고 있으므로 여기서는 그리지 않는다.
          const endsAssistantRun = message.role === "assistant" && messages[index + 1]?.role !== "assistant"
          const trailingWhileWaiting = status === "waiting" && index === messages.length - 1
          const mark = renderAssistantMark && endsAssistantRun && !trailingWhileWaiting ? renderAssistantMark() : null
          if (grounded && message.role === "assistant") {
            return (
              <div key={message.id} data-chat-grounded-answer className="flex w-full flex-col items-start gap-1">
                {message.sectionStart ? <hr data-chat-section-rule className="mb-2 w-full border-0 border-t border-border" /> : null}
                {message.reasoning && <Reasoning reasoning={message.reasoning} />}
                {/* 블록(제목·목록·구분선)을 담아야 하므로 `p` 가 아니라 `div` 다 — `p` 안에 `ul`/`hr` 은 못 넣는다. */}
                <div className="max-w-full break-keep text-base leading-6 text-foreground motion-safe:animate-[chat-message-in_0.24s_cubic-bezier(0.2,0.8,0.25,1)] origin-bottom-left">
                  <span className="sr-only">Assistant: </span>
                  {body}
                </div>
                {mark ? (
                  <div data-chat-assistant-mark className={cn("flex items-center gap-2 pt-0.5 origin-bottom-left", ENTER_IN)}>
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
            {message.sectionStart ? <hr data-chat-section-rule className="my-2 w-full border-0 border-t border-border" /> : null}
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
              {mark ? (
                <div data-chat-assistant-mark className={cn("flex items-center gap-2 pt-0.5 origin-bottom-left", ENTER_IN)}>
                  {mark}
                </div>
              ) : null}
            </Fragment>
          )
        })}
        {status === "waiting" ? (
          renderAssistantMark ? (
            // 생각 중(3차 step-4) — 점 3개 대신 **마크 + 지금 하는 일 한 줄**. 마크가 숨 쉬듯 깜빡여 「살아 있다」를 말한다.
            <div data-chat-waiting className={cn("flex items-center gap-2 origin-bottom-left", ENTER_IN)} aria-live="polite">
              <span data-chat-assistant-mark className="flex shrink-0 items-center motion-safe:animate-pulse">
                {renderAssistantMark()}
              </span>
              <span data-chat-waiting-label className="break-keep text-sm leading-6 text-muted-foreground">
                {waitingLabel ?? "생각하는 중…"}
              </span>
              {/* 경과 시간 — 문구 오른쪽. `tabular-nums` 라 숫자가 바뀌어도 폭이 안 흔들린다(옆 문구가 밀리면 읽기 싫어진다). */}
              <span data-chat-waiting-elapsed className="shrink-0 text-sm leading-6 text-muted-foreground/70 tabular-nums">
                {formatElapsed(waitingSeconds)}
              </span>
              <span className="sr-only">Assistant is typing</span>
            </div>
          ) : (
          <div className="flex justify-start" aria-hidden="false">
            <div className={cn("flex items-center gap-1 rounded-lg rounded-bl-sm bg-muted px-3 py-2.5 origin-bottom-left", ENTER_IN)}>
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
              <p className="break-keep text-sm text-foreground">{errorMessage}</p>
              <Button className="mt-1 h-auto p-0" size="sm" type="button" variant="link" onClick={onRetry}>
                {retryLabel}
              </Button>
            </div>
          </div>
        ) : null}
        {showTrailingSuggestions ? (
          <>
            {suggestionsPrompt ? <p className="text-sm font-medium leading-6">{suggestionsPrompt}</p> : null}
            <Suggestions items={suggestions!} onPick={pick} notes={suggestionNotes} reasons={suggestionReasons} recommended={recommendedSuggestion} directInputLabel={directInputLabel} disabled={disabledSuggestions} />
          </>
        ) : null}
      </div>
      {grounded && composerLocked ? (
        /* 잠긴 입력창(M18 데모) — 타자 대신 **왜 못 치는지**를 한 줄로 세운다.
           빈 입력창을 회색으로 두면 「고장났나」로 읽히고, 없애 버리면 칩만 뜬 화면이 어색하다. */
        <div data-chat-composer data-chat-composer-locked className="shrink-0 px-4 pb-4 pt-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <LockIcon size={18} aria-hidden className="shrink-0" />
            <span>{composerPlaceholder}</span>
          </div>
        </div>
      ) : grounded ? (
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
              disabled={composerLocked}
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
