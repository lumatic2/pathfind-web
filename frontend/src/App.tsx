/**
 * pathfind 참조 구현 — 3패널 노트북.
 *   좌 「출처」  단계 결과 md 카드가 쌓인다(사용자 소스 추가 없음 — showAdd/showSearch false)
 *   중앙 「대화」 인터뷰 → 승인 카드 → 진행 중계 → 노드 설명
 *   우 「로드맵」 마인드맵. 골격 즉시 → 채움 → 펼침·접기 → 전체화면 → PNG
 * 셸·패널은 어스큐리 레지스트리 자산(`src/components/`)이고 룩은 이 프로젝트가 소유한다(`src/tokens.css`).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Download, FileText, Library, Plus } from "lucide-react"
import { NotebookWorkspaceShell, NotebookTopbar, MindmapPanel } from "@/components/notebook-workspace-shell"

/**
 * 세 칸 비율(좌 조사 결과 · 중 대화 · 우 마인드맵). 자산 기본값 `MINDMAP_SHELL_RATIOS`(22·43·35)는 1280 폭에서 왼쪽이 268px 이라
 * 폴더 부제 「가져다 쓸 것 n · 직접 만들 것 m」(157px)이 140px 칸에서 잘렸다(2026-09-14 실측 — 문안 축의 주어 「직접 만들 것 m」이 화면에서 안 보이던 결함).
 * 왼쪽을 25% 로 올리고 오른쪽에서 뺀다 — 마인드맵은 1280 에서도 여백이 남는다.
 */
const SHELL_RATIOS: [number, number, number] = [25, 42, 33]
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { EditableText } from "@/components/editable-text"
import { deleteRoadmap, getRoadmap, listRoadmaps, newRoadmapId, renameRoadmap, saveRoadmap, toCurrentSession, type SavedRoadmap } from "@/state/roadmaps"
import { GroundedSourcePanel, type GroundedSource } from "@/components/grounded-source-panel"
import { ChatConversationPanel, renderMarkdown, type ChatCitation, type ChatMessage, type ChatStatus } from "@/components/chat-conversation-panel"
import * as api from "@/lib/api"
import { DEMO, activeScenario, allowedChoices, loadScenarios, selectScenarioByOpening, type DemoScenario } from "@/lib/demo-player"
import type { MindmapNode } from "@/components/mindmap-spine-tree"
import { useSession } from "@/state/store"
import { APPROVE_LABEL, REVISE_LABEL, useFlow } from "@/state/flow"
import { CHANNEL_NAME } from "@/state/waiting-lines"
import { applyGlobalCitations, buildMindmap, buildSourceDocs, planningSourceDoc, channelTallyLine, displayStageResult, globalCitationNumbers, mindmapLegend, normalizeChoices, sourceAncestors, splitLabel, stageFoundList, stageNoFromNodeId } from "@/state/derive"
import { phaseLine } from "@/state/waiting-lines"
import { useQuota } from "@/state/quota"
import type { ChatEntry, SourceDoc, Stage, StageSlot } from "@/state/types"
import solarMark from "@/assets/solar-mark.png"

/**
 * 접히지 **않는** 진행 줄 (M5 확장 2차 step-5).
 * 사람이 놓치면 안 되는 사건들이다 — 경로 안내·강등·실패·재개·완주.
 * 이 목록에 없고 인용도 없는 `progress` 줄은 전부 「조사 과정」 아코디언으로 접는다.
 * (접을 것을 나열하지 않고 남길 것을 나열한다 — 활동 줄 문구는 늘어나지만 사건 종류는 잘 안 는다.)
 */
const ALWAYS_VISIBLE =
  /(조사를 마쳤습니다|단계마다 직접 웹을|요청이 몰려|자료를 못 찾았습니다|이어서 조사합니다|다시 붙었습니다|결과를 읽지 못해|연결이 끊겨|오래 걸리는 단계|단계로 이뤄지는지|단계 \d+개로 나눴습니다)/

/** 검색 줄인지 — 아코디언 안 아이콘을 가른다. */
const SEARCH_LINE = /(로 찾는 중…|찾는 중…|실행 중…)/

/**
 * 결과 줄에 붙는 인용 배지 — **옛 세션은 3개로 굳어 있다** (2026-09-15 사용자 지적).
 *
 * 5차까지 `stageResultEntry` 가 `citationTitles` 를 `.slice(0, 3)` 으로 잘라 **메시지에 저장**했다.
 * 6차가 그 상한을 없앴지만 그건 **새로 저장되는 줄에만** 듣는다 — 이미 저장된 세션을 열면
 * 자료가 6건이어도 배지는 영영 `1 2 3` 이다(사용자가 본 그 모양이다).
 *
 * 자료 자체는 `stage.findings` 에 다 남아 있으므로 **렌더에서 되살린다.**
 * 저장본을 고쳐 쓰지 않는 이유는 record 동결이다 — 화면만 바로잡는다.
 *
 * ⚠ **저장된 것이 더 많거나 같으면 저장본이 이긴다.** 6차 저장본의 순서는 `groundStageCitations`
 *   가 본문 등장 순서로 매긴 것이라 findings 순서와 다르고, 그게 배지 번호의 정본이다.
 */
function stageCitations(m: ChatEntry, stage?: Stage) {
  const saved = m.citationTitles ?? []
  const findings = stage?.findings ?? []
  if (saved.length >= findings.length || !findings.length) {
    return saved.length ? saved.map((t, i) => ({ n: i + 1, title: t, id: m.citationIds?.[i] })) : undefined
  }
  // 잘려 저장된 옛 줄 — 그 단계의 자료 전부로 다시 세운다(순서는 `findings` 그대로).
  return findings.map((f, i) => ({ n: i + 1, title: String(f.name ?? ""), id: `stage-${stage?.no}-finding-${i}` }))
}

/**
 * 단계 결과 줄의 생김새 — `n. 제목 → **판정**`.
 * ⚠ 자료가 **0건인 단계**는 `citationTitles` 가 비므로 인용 유무로는 못 가른다.
 *    그걸로만 갈랐더니 「3. 추천 로직과 화면 설계 → **섞어야 함**」이 아코디언 안으로
 *    접혀 들어갔다(실측). 결과는 결론이라 언제나 밖에 있어야 한다.
 */
const STAGE_RESULT = /→ \*\*/

/**
 * 단계 결과 줄(`n. 제목 → **판정**`)이 가리키는 단계를 찾는다 (5차 step-9).
 * 줄 머리의 번호가 `stage.no` 다(`flow.ts` `stageResultEntry` 가 그렇게 굳힌다). 못 찾으면 `undefined` —
 * 그때 `displayStageResult` 는 이유 없이 문장만 돌려준다(옛 세션·다른 진행 줄이 여기로 빠진다).
 */
function stageOfResultLine(m: ChatEntry, stages: StageSlot[]): Stage | undefined {
  if (m.kind !== "progress") return undefined
  const no = Number(/^(\d+)\.\s/.exec(m.text)?.[1])
  if (!Number.isInteger(no)) return undefined
  return stages.find((x) => x.stage.no === no)?.stage
}

function isFoldable(m: ChatEntry): boolean {
  if (m.role !== "assistant") return false
  if (m.kind !== "progress") return false
  // 표식이 먼저다 — 문구를 모델이 지어 허용목록에 걸릴 수 없는 줄(조사 시작 줄)이 여기로 빠진다(5차 step-7)
  if (m.pinned) return false
  if (m.citationTitles?.length) return false // 단계 결과 줄 — 배지가 붙는다
  if (STAGE_RESULT.test(m.text)) return false // 자료 0건인 단계 결과
  return !ALWAYS_VISIBLE.test(m.text)
}

/**
 * 인용 배지 (M5 확장 2차 step-5 → 3차 step-8) — 본문 `[n]` 자리에 끼는 작은 원.
 * **올리기만 해도** 자료 제목이 뜨고(사용자 피드백 A9 — 클릭해야 뜨던 것), 클릭·키보드 포커스로도 뜬다.
 * 등재 자산은 미등재 자산을 import 하지 않으므로(레지스트리 순수성) 패널이 슬롯으로 받고 **여기서** 그린다.
 *
 * 열림 상태는 **배지 전체가 하나를 나눠 갖는다** — 배지 사이를 빠르게 지나가도 팝오버가 여러 개 남지 않는다.
 * 컨텍스트 대신 모듈 상태 + `useSyncExternalStore` 인 이유: 배지는 패널의 렌더 슬롯 안에서 만들어져 App 트리의 훅을 못 받는다.
 */
let openBadgeId: string | null = null
const badgeListeners = new Set<() => void>()
function setOpenBadge(id: string | null) {
  if (openBadgeId === id) return
  openBadgeId = id
  badgeListeners.forEach((l) => l())
}
function useOpenBadge() {
  return useSyncExternalStore(
    (cb) => {
      badgeListeners.add(cb)
      return () => badgeListeners.delete(cb)
    },
    () => openBadgeId,
  )
}

/**
 * 인용 카드 = 자료 문서 카드 (4차 step-1, 사용자 확정 H1′·H1″ — 제미나이 문법 그대로: hover=미리보기 · click=원문으로 이동).
 * 카드에는 좌 패널 자료 문서(`SourceDoc kind: "finding"`)의 제목·종류·근거 한 줄과 「소스 보기」가 선다.
 * 배지 클릭·「소스 보기」= 좌 패널에 그 문서를 연다(접혀 있으면 펼친다). 문서를 못 찾은 인용(옛 세션·제목 불일치)은
 * 카드에 제목만 보이고 클릭은 카드 토글뿐이다 — 에러를 내지 않는다.
 *
 * hover 는 **래퍼**가 받는다 — 배지에서 카드로 마우스를 옮기는 동안 닫히지 않아야 「소스 보기」를 누를 수 있다
 * (3차까지는 `onMouseLeave` 가 버튼에 붙고 간격 4px 이라 바로 닫혔다). 그래서 배지·카드 사이 간격은 0 이다.
 * 포커스도 래퍼 단위로 판단한다(Tab 으로 배지 → 「소스 보기」 이동 중에는 열려 있다).
 */
function CitationBadge({ citation, doc, cardText, onOpen }: { citation: ChatCitation; doc: SourceDoc | null; cardText?: string; onOpen: (id: string) => void }) {
  const id = useId()
  const open = useOpenBadge() === id
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  /**
   * ⚠⚠ **카드는 패널 밖에서 그린다** (8차 육안 1라운드 — 2026-09-16 사용자: 「패널에서 칩에 hovering 했을 때
   * 생기는 popover 가 패널 경계에서 잘리네? 안 잘리게 해주고」).
   *
   * 종전에는 배지 옆에 `absolute` 로 띄웠다. 그러면 조상 패널의 `overflow` 가 **카드를 잘라 낸다** —
   * 좌 패널처럼 좁고 스크롤되는 자리에서 제목·근거가 반 토막으로 보였다.
   * 그래서 `createPortal` 로 **body 에 그리고 `fixed` 좌표**를 준다. 자르는 조상이 없어진다.
   * ⚠ 좌표는 배지 위치에서 매번 잰다 — 스크롤·리사이즈에도 따라붙게 두 이벤트를 듣는다(`true` = 캡처, 안쪽 스크롤도 받는다).
   * ⚠ 화면 끝에서는 **가로로 물린다**(clamp) — 오른쪽 끝 배지의 카드가 뷰포트 밖으로 나가지 않게.
   * ⚠ 위에 자리가 없으면 아래로 뒤집는다. 배지와 카드 사이 간격은 **0** 이다 — 간격이 있으면 마우스를 옮기는 동안 닫혀
   *   「소스 보기」를 못 누른다(3차에 밟은 자리).
   */
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean; ready: boolean } | null>(null)
  /**
   * 자리 잡기 (8차 육안 2라운드 — 2026-09-16 사용자 지시 그대로):
   *   「사용자 화면 기준으로 공간이 아래에 있으면 아래로, 없으면 위로 나타나야 돼. 우측으로 위치 좀 옮겨야 하고.」
   * ⓐ **아래가 기본**이다 — 아래 공간이 카드 높이만큼 있으면 아래, 없으면 위.
   *    (종전에는 위가 기본이라 글 윗부분을 가렸다.)
   * ⓑ **오른쪽으로 편다** — 배지 왼쪽 모서리에 맞춰 시작한다. 가운데 정렬(-50%)은 글자를 양옆으로 덮었다.
   * ⓒ 화면 밖으로 나가면 **가로로 물린다**(clamp).
   */
  const place = (ready: boolean) => {
    const b = btnRef.current?.getBoundingClientRect()
    if (!b) return
    const margin = 8
    const gap = 6
    const w = popRef.current?.offsetWidth ?? 0
    const h = popRef.current?.offsetHeight ?? 0
    let left = b.left
    if (w) left = Math.min(Math.max(left, margin), Math.max(margin, window.innerWidth - w - margin))
    const roomBelow = window.innerHeight - b.bottom - margin
    const roomAbove = b.top - margin
    const below = h === 0 ? true : roomBelow >= h || roomBelow >= roomAbove
    setPos({ left, top: below ? b.bottom + gap : b.top - gap, below, ready })
  }
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    place(false)
    const again = () => place(true)
    window.addEventListener("scroll", again, true)
    window.addEventListener("resize", again)
    return () => {
      window.removeEventListener("scroll", again, true)
      window.removeEventListener("resize", again)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // 두 번째 패스 — 카드가 DOM 에 선 뒤라야 폭·높이를 잴 수 있다(첫 패스에는 `popRef` 가 비어 있다).
  useLayoutEffect(() => {
    if (open && pos && !pos.ready) place(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos])
  const openDoc = () => {
    if (!doc) return
    setOpenBadge(null)
    onOpen(doc.id)
  }
  /**
   * ⚠⚠ **닫기를 늦춘다** (8차 육안 4라운드 — 2026-09-16 사용자
   * 「마우스 포인터를 옮겨서 스크롤해서 더 볼 수도 있어야 돼. 지금은 마우스 포인터도 못 옮기더라. 사라져 버리니까」).
   *
   * 카드는 `portal` 로 body 에 나가 있어 배지의 **DOM 형제가 아니다.** 그래서 배지를 벗어나는 순간
   * `mouseleave` 가 먼저 터지고, 카드에 닿기도 전에 닫혔다 — 간격 6px 을 건너는 동안 카드가 사라진다.
   * 스크롤하려면 포인터가 카드 안으로 들어가야 하므로, 이 한 가지가 「스크롤이 안 된다」의 원인이었다.
   *
   * 그래서 **떠난 뒤 잠깐 기다렸다가** 닫고, 그 사이 배지나 카드에 다시 들어오면 취소한다.
   */
  const closeTimer = useRef<number | null>(null)
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const openNow = () => {
    cancelClose()
    setOpenBadge(id)
  }
  const close = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpenBadge(openBadgeId === id ? null : openBadgeId)
    }, 220)
  }
  useEffect(() => cancelClose, [])
  /**
   * **부드럽게 뜨고 진다** (8차 육안 2라운드 — 「카드 나타나고 사라지는 애니메이션도 부드럽게 넣어주고. fade in out 할 수 있으니」).
   * 사라지는 것을 보여 주려면 닫히자마자 지울 수 없다 — `open` 이 꺼진 뒤에도 잠깐 DOM 에 남겨 두고 투명도만 0 으로 보낸다.
   */
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = window.setTimeout(() => setMounted(false), 160)
    return () => window.clearTimeout(t)
  }, [open])
  const shown = open && Boolean(pos?.ready)
  const card =
    mounted && pos ? (
      <span
        ref={popRef}
        data-citation-popover
        data-citation-doc={doc?.id}
        onMouseEnter={openNow}
        onMouseLeave={close}
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          // ⚠ **움직임 없이 밝기만** 바꾼다 (8차 육안 3라운드 — 「fade in out 이었으면 해.
          //   지금은 위에서, 아래에서 올라오는 애니메이션이네. 위에 생길 때랑 아래에 생길 때랑 애니메이션도 통일했으면 해」).
          //   위로 뒤집힌 카드를 제자리에 놓는 `translateY(-100%)` 는 **배치**이지 연출이 아니라 그대로 두고,
          //   연출용으로 얹었던 4px 미끄러짐만 걷어낸다 — 그래야 위·아래가 같은 움직임(=없음)이 된다.
          transform: pos.below ? "translateY(0)" : "translateY(-100%)",
          opacity: shown ? 1 : 0,
          pointerEvents: shown ? "auto" : "none",
          transition: "opacity 140ms ease",
          // 카드가 더 커야 읽힌다(8차 육안 2·4라운드) — 좁은 화면에서는 화면에 맞춘다.
          // ⚠ `minHeight` 가 있어야 **근거를 읽을 자리**가 선다. 없으면 카드가 내용 높이로 쪼그라들어
          //   (실측 200px) 스크롤 막대가 설 자리도 없다.
          width: "min(28rem, calc(100vw - 16px))",
          minHeight: "min(22rem, calc(100vh - 24px))",
          maxHeight: "min(32rem, calc(100vh - 24px))",
        }}
        className="z-50 flex flex-col gap-1 overflow-hidden break-keep rounded-lg border border-border bg-popover px-3 py-2 text-left text-sm leading-6 text-foreground shadow-lg"
      >
        <span data-citation-card-title className="font-medium">
          {doc?.title ?? citation.title}
        </span>
        {doc ? (
          <span data-citation-card-kind className="text-xs leading-5 text-muted-foreground">
            {doc.subtitle}
          </span>
        ) : null}
        {/* ⚠ 잘라 내지 않고 **스크롤**한다 (8차 육안 2라운드 「스크롤 가능해야 하고」).
            ⚠ 보여 주는 것은 근거 한 줄이 아니라 **자료 문서 본문**이다 (8차 육안 4라운드 — 「세로 크기도 작고,
               내용을 스크롤하면서 더 볼 수도 없다」). 좌 패널 카드가 여는 것과 같은 내용이라 새로 짓는 말이 없고,
               채워진 카드(`sourceCards`)가 있으면 그것이 먼저다 — 없으면 사실 본문(근거·검색어·제약).
            ⚠ 맨 앞 `# 제목` 줄은 뗀다 — 카드 머리에 같은 제목이 이미 서 있다. */}
        {doc ? (
          <span data-citation-card-evidence className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 text-sm leading-6">
            {renderMarkdown(String(cardText ?? doc.markdown ?? doc.evidence ?? "").replace(/^#\s.*\n?/, "").trim(), { staged: false })}
          </span>
        ) : null}
        {doc ? (
          <button
            type="button"
            data-citation-open
            onClick={openDoc}
            className="mt-1 self-start rounded-md border border-border px-2 py-0.5 text-xs font-medium leading-5 text-foreground outline-none ring-ring ring-offset-2 ring-offset-popover hover:bg-muted focus-visible:ring-2"
          >
            소스 보기
          </button>
        ) : null}
      </span>
    ) : null
  return (
    <span
      className="relative inline-block align-baseline"
      onMouseEnter={openNow}
      onMouseLeave={close}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null
        // ⚠ 카드가 portal 로 나가 있어 **DOM 상 형제가 아니다** — 그 안으로 가는 포커스도 「안에 머문다」로 본다.
        if (!e.currentTarget.contains(to) && !(to && popRef.current?.contains(to))) close()
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpenBadge(null)
      }}
    >
      <button
        ref={btnRef}
        type="button"
        data-citation-badge={citation.n}
        data-citation-doc={doc?.id}
        aria-label={`자료 ${citation.n}: ${doc?.title ?? citation.title}`}
        aria-expanded={open}
        onFocus={openNow}
        onClick={() => (doc ? openDoc() : setOpenBadge(open ? null : id))}
        className="mx-0.5 inline-flex size-[18px] items-center justify-center rounded-full bg-muted align-[0.3em] text-[10px] font-medium text-muted-foreground outline-none ring-ring ring-offset-2 ring-offset-card hover:text-foreground focus-visible:ring-2"
      >
        {citation.n}
      </button>
      {card && typeof document !== "undefined" ? createPortal(card, document.body) : null}
    </span>
  )
}

/**
 * 맨 위는 **대표 시나리오**다 — 「퇴직 후 동네 원데이 목공 클래스」(2026-09-14 참조 앱 2회 완주로
 * 검증된 주제, 법령·통계 채널까지 실제로 물린 유일한 주제다. `changesets/…/README.md` 판정 참조).
 * 셋의 축을 섞는다: 오프라인 창업 / 소프트웨어 / 개인 도구 — 「앱 만들기」 셋이면 우리가 소프트웨어
 * 전용으로 읽힌다.
 */
const EXAMPLE_STARTERS = [
  "퇴직하고 동네에서 원데이 목공 클래스를 열어 보고 싶어요",
  "동네 카페 사장님이 단골을 기억하게 돕는 앱을 만들고 싶어요",
  "읽은 논문을 주제별로 묶어 주는 개인용 서비스를 만들고 싶어요",
]
/**
 * 「직접 입력」 — 칩이 뜨는 **모든** 화면의 꼬리 칩(3차 step-7, 사용자 피드백 A7). 누르면 보내지 않고 입력창에 포커스.
 * 인터뷰 칩은 서버(`server/grill.mjs` `DIRECT_INPUT_LABEL`)가 붙여 보내고, grill 을 지나지 않는 첫 화면·승인 칩은 여기서 붙인다.
 * 값은 서버 상수와 같아야 한다(클라이언트가 서버 모듈을 import 하지 않으므로 여기 한 번 더 적는다).
 */
const DIRECT_INPUT_LABEL = "직접 입력"
/** 승인 칩 옆 주석 — 누르기 전에 무엇이 줄어드는지 말한다(피드백 A8 · 문구 정본 §2-4). */
const APPROVE_NOTE = "횟수 1회 소진"
/**
 * 조사 끝난 뒤(ready) 기본 후속 칩 3 (4차 step-6, 사용자 확정 H6′ 「이후 대화할 때도 선택지 버튼들은 항상 나와야 함」).
 * 완주 직후·노드 설명 뒤·서버가 후속을 비워 보낸 뒤 전부 이 셋이 선다. 값은 `server/chat.mjs` `DEFAULT_FOLLOWUPS` 와 같아야 한다(문구 정본 §2-10).
 */
const DEFAULT_FOLLOWUPS = ["이 패스에서 먼저 할 일은?", "직접 만들 것만 순서대로 정리해 줘", "PATH.md 내려받기"]
/** 이 칩은 보내지 않고 내려받기를 실행한다 — 승인 칩과 같은 클라이언트 처리(메시지 추가 0). */
const DOWNLOAD_LABEL = DEFAULT_FOLLOWUPS[2]
/** 보관 실패 한 줄(문구 정본 §2-14) — 저장 공간이 찼을 때. 새 로드맵·열기는 그대로 진행된다. */
const SAVE_FAILED = "이 패스를 보관하지 못했습니다 — 브라우저 저장 공간이 찼습니다."
const formatSavedAt = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "확인 불가"
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
/* 데모 빌드에서는 「직접 입력」을 붙이지 않는다(M18) — 녹화에 없는 자유 입력에 답할 응답이 없다. */
const withDirectInput = (items: string[]) =>
  DEMO
    ? items.filter((i) => i !== DIRECT_INPUT_LABEL) // 서버 녹화가 붙여 보낸 칩도 걷어낸다 — 데모에는 자유 입력이 없다
    : items[items.length - 1] === DIRECT_INPUT_LABEL
      ? items
      : [...items, DIRECT_INPUT_LABEL]

/**
 * 좌 패널 문서 본문 — 마크다운을 **그려서** 보여 준다(4차 보강 step-12 — `<pre>` 로 별표가 그대로 보이던 것을 채팅 답변과 같은 렌더러로).
 * 자료 문서는 채워진 카드(`session.sourceCards[id]`)가 있으면 그것, 없으면 사실 본문. 채우는 동안 한 줄이 선다(문구 정본 §2-11).
 */
function SourceBody({ doc, card, loading }: { doc: SourceDoc; card?: string; loading?: boolean }) {
  return (
    <div data-source-body data-source-card={card ? "filled" : loading ? "loading" : undefined} className="flex flex-col gap-2 break-keep text-sm leading-6 text-foreground">
      {renderMarkdown(card ?? doc.markdown, {})}
      {loading ? (
        <p data-source-card-loading className="text-muted-foreground">
          카드를 채우는 중…
        </p>
      ) : null}
    </div>
  )
}

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 마인드맵 우하단 범례(4차 보강 2 step-17, 사용자 H13). 항목·문구·색은 `derive.mindmapLegend()` 가 툴팁과 같은 표에서 뽑는다 —
 * 점 그리기는 지도 위 점과 같은 규칙(색은 `color`, 채움은 `currentColor`, 빈 점은 안쪽 테두리)이라 계산값이 일치한다.
 * 부품(`MindmapSpineTree.legendSlot`)은 자리만 주고 포인터를 통과시킨다.
 */
function MindmapLegend() {
  const items = mindmapLegend()
  return (
    // 카드 없이 배경 위 글자(4차 보강 3 step-22, 사용자 H19 「카드로 감싸지 말고 패널 하단 빈 공간에 배경 위에」). 먹 글자(대비 규칙).
    <div data-mindmap-legend className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-1 py-1 text-sm text-foreground">
      {items.map((it) => (
        <span key={it.verdict} data-legend-item data-legend-verdict={it.verdict} title={it.title} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            data-legend-dot
            aria-hidden
            className="inline-block shrink-0 rounded-full"
            style={{ width: 8, height: 8, color: it.color, backgroundColor: it.hollow ? "transparent" : "currentColor", boxShadow: it.hollow ? "inset 0 0 0 1.5px currentColor" : undefined }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

export default function App() {
  const { session, dispatch, reset } = useSession()
  const flow = useFlow(session, dispatch)
  const quota = useQuota()

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [draft, setDraft] = useState("")
  const [detailId, setDetailId] = useState<string | null>(null)
  /* 데모 빌드(M18) — 첫 화면 카드는 녹화된 시나리오 목록에서 온다. 실 빌드에서는 비어 있고 쓰이지 않는다. */
  const [demoScenarios, setDemoScenarios] = useState<DemoScenario[]>([])
  /** 재생기가 어느 녹화를 물고 있는지 — 값이 바뀌면 칩 잠금 계산이 다시 돈다. */
  const [demoBundleId, setDemoBundleId] = useState<string | null>(null)
  useEffect(() => {
    if (!DEMO) return
    void loadScenarios().then(setDemoScenarios).catch(() => setDemoScenarios([]))
  }, [])
  const demoStarters = useMemo(() => demoScenarios.map((s) => s.opening ?? s.label), [demoScenarios])
  /* 새로고침 복원(M18 2026-09-20 리뷰 지적 B2) — 세션은 localStorage 에서 돌아오지만 재생기의
     녹화(`bundle`)는 모듈 메모리에만 있어 함께 돌아오지 않는다. 그 상태에서는 모든 칩이 죽고
     입력창도 잠겨 **되돌아갈 입구가 화면에 없다**. 복원된 첫 사용자 발화로 시나리오를 다시 고른다. */
  useEffect(() => {
    if (!DEMO || activeScenario()) return
    const first = session.messages.find((m) => m.role === "user")
    if (!first?.text) return
    void selectScenarioByOpening(first.text).then((ok) => {
      if (ok) setDemoBundleId(activeScenario()?.id ?? null)
    })
  }, [session.messages])

  // 새로고침으로 끊긴 조사를 한 번만 이어 받는다
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    if (session.phase === "researching" && session.stages.length && !session.busy) {
      resumed.current = true
      void flow.resumeResearch()
    }
  }, [session.phase, session.stages.length, session.busy, flow])

  // 소주제가 빠진 done 단계를 한가할 때 채운다(4차 보강 step-13 — 조사 중 새로고침·옛 세션). 단계마다 페이지당 한 번.
  useEffect(() => {
    if (!session.busy) flow.backfillOutlines()
  }, [session.busy, session.stages, flow])

  const root = useMemo(() => buildMindmap(session.bigPicture, session.stages), [session.bigPicture, session.stages])
  // 좌 카드는 단계에서 파생한다 — 시작되는 순간 자리를 잡고(「조사 중」) 그 자리에서 채워진다
  const sources = useMemo(() => {
    const planning = planningSourceDoc(session.bigPicture)
    return [...(planning ? [planning] : []), ...buildSourceDocs(session.stages)]
  }, [session.stages, session.bigPicture])
  const doneCount = session.stages.filter((s) => s.status === "done").length

  // 인용 → 자료 문서 (4차 step-1). 세 경로 — id 일치 → 제목 일치 → 없음(카드에 제목만, 클릭 무동작).
  // 옛 세션(`citationIds` 없음)이 두 번째 경로를 탄다. 어느 경로도 예외를 던지지 않는다 — 답변 렌더가 죽으면 안 된다.
  const findingDocs = useMemo(() => {
    const byId = new Map<string, SourceDoc>()
    const byTitle = new Map<string, SourceDoc>()
    // 자료 문서는 소주제 폴더 안에도 있다(4차 보강 step-14) — 어느 깊이든 훑는다.
    const walk = (list: SourceDoc[]) => {
      for (const c of list) {
        if (c.kind === "finding") {
          byId.set(c.id, c)
          if (!byTitle.has(c.title)) byTitle.set(c.title, c)
        }
        if (c.children?.length) walk(c.children)
      }
    }
    walk(sources)
    return { byId, byTitle }
  }, [sources])
  const resolveCitation = (c: ChatCitation): SourceDoc | null =>
    (c.id ? findingDocs.byId.get(c.id) : undefined) ?? findingDocs.byTitle.get(c.title.trim()) ?? null
  // 좌 패널 트리 펼침(4차 보강 step-14) — 세션에 남는다. 없으면 단계는 펼침·소주제 폴더는 접힘.
  const sourceExpanded = useMemo(
    () => session.sourceExpandedIds ?? sources.filter((d) => d.children?.length).map((d) => d.id),
    [session.sourceExpandedIds, sources],
  )
  const setSourceExpanded = (ids: string[]) => dispatch({ type: "patch", patch: { sourceExpandedIds: ids } })
  /** 배지 클릭·「소스 보기」 — 좌 패널을 그 문서 상세로, 접혀 있으면 펼친다(H1″). 접힌 폴더 안의 문서면 그 조상 폴더도 펼친다. */
  const openSourceDoc = (id: string) => {
    const ancestors = sourceAncestors(sources, id).filter((a) => !sourceExpanded.includes(a))
    if (ancestors.length) setSourceExpanded([...sourceExpanded, ...ancestors])
    setDetailId(id)
    setLeftCollapsed(false)
  }

  // 자료 카드는 **처음 열 때** 채운다(4차 보강 step-12, 되읽기 ③). 채워지면 세션에 굳어 다시 열어도 호출 0.
  // 한 문서에 호출은 한 번뿐이다 — 열자마자 뒤로 갔다 다시 와도(`inflight`), 폴백으로 못 채웠어도(`tried`) 다시 부르지 않는다.
  const [cardLoadingId, setCardLoadingId] = useState<string | null>(null)
  const cardInflight = useRef(new Set<string>())
  const cardTried = useRef(new Set<string>())
  useEffect(() => {
    if (!detailId) return
    const doc = findingDocs.byId.get(detailId)
    if (!doc || session.sourceCards?.[detailId] || cardInflight.current.has(detailId) || cardTried.current.has(detailId)) return
    const m = /^stage-(\d+)-finding-(\d+)$/.exec(detailId)
    const slot = m ? session.stages.find((x) => x.stage.no === Number(m[1])) : undefined
    const finding = m ? slot?.stage.findings?.[Number(m[2])] : undefined
    if (!slot || !finding) return
    const id = detailId
    cardInflight.current.add(id)
    setCardLoadingId(id)
    void api
      .sourceCard({ finding, stage: slot.stage, summary: session.summary })
      .then((r) => {
        if (!r.degraded && r.markdown.trim()) {
          dispatch({ type: "patch", patch: { sourceCards: { ...(sessionRef.current.sourceCards ?? {}), [id]: r.markdown } } })
        }
      })
      .catch(() => {
        /* 폴백 — 사실 본문이 그대로 남는다. 오류 문구는 띄우지 않는다 */
      })
      .finally(() => {
        cardInflight.current.delete(id)
        cardTried.current.add(id)
        setCardLoadingId((cur) => (cur === id ? null : cur))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 문서를 열 때 한 번. 세션 갱신으로 다시 돌면 안 된다
  }, [detailId, findingDocs])
  const sessionRef = useRef(session)
  sessionRef.current = session

  /**
   * 조사 완주 직후 **백그라운드 선채움**(5차 step-4 · D2). 사용자가 자료 문서를 열었을 때 이미 채워져 있게 한다.
   *
   * ⚠ 「열 때 채우는」 위 경로를 **지우지 않는다**. 선채움이 실패해도 지금과 똑같이 동작해야 한다 —
   *    심사 중 새 실행 오류를 만들면 감점이 아니라 실격이다. 그래서 실패한 문서는 `cardTried` 에 **넣지 않는다**
   *    (넣으면 그 문서는 열어도 영영 안 채워진다). 도는 동안만 `cardInflight` 를 공유해 이중 호출을 막는다.
   *
   * 한 번에 둘씩만 띄운다 — 자료가 열다섯이면 동시 호출 15 가 되어 429 를 부른다.
   *
   * ⚠ **이 일은 렌더 수명에 매달지 않는다** (2026-09-15 완주 실측 두 번으로 잡았다).
   *   조사가 끝나 `phase` 가 `ready` 가 되면 이 효과가 도는데, 곧바로 `fillOutline` 이 단계를 patch 해 `session.stages` 가 새 객체가 되고
   *   → 효과가 다시 돈다. 여기서 cleanup 이 앞 회차를 끊게 해 두면 **완주 직후 선채움이 0 이 된다**(호출 2건이 뜨다 버려졌다).
   *   「끊기면 표식을 풀어 다음 렌더가 잇게」도 **안 통했다** — 표식을 푸는 것은 재시작을 **허락**할 뿐이고,
   *   조사가 끝난 뒤에는 의존값이 더 안 바뀌어 **다음 렌더 자체가 없다.**
   *   그래서 끊지 않는다. 이 일은 멱등이라 끊을 이유가 없다 — 중복은 `prefillRun`(회차)·`cardInflight`(문서)·`sourceCards`(이미 채움) 셋이 막는다.
   */
  const prefillRun = useRef("")
  useEffect(() => {
    if (session.phase !== "ready") return
    const ids = session.stages
      .filter((x) => x.status === "done")
      .flatMap((x) => (x.stage.findings ?? []).map((_, i) => `stage-${x.stage.no}-finding-${i}`))
    if (!ids.length) return
    const key = ids.join("|")
    if (prefillRun.current === key) return
    prefillRun.current = key

    const queue = ids.filter((id) => !sessionRef.current.sourceCards?.[id] && !cardInflight.current.has(id))
    let filled = 0
    const one = async (id: string) => {
      const m = /^stage-(\d+)-finding-(\d+)$/.exec(id)
      const slot = m ? sessionRef.current.stages.find((x) => x.stage.no === Number(m[1])) : undefined
      const finding = m ? slot?.stage.findings?.[Number(m[2])] : undefined
      if (!slot || !finding || cardInflight.current.has(id) || sessionRef.current.sourceCards?.[id]) return
      cardInflight.current.add(id)
      try {
        const r = await api.sourceCard({ finding, stage: slot.stage, summary: sessionRef.current.summary })
        if (!r.degraded && r.markdown.trim()) {
          filled += 1
          dispatch({ type: "patch", patch: { sourceCards: { ...(sessionRef.current.sourceCards ?? {}), [id]: r.markdown } } })
        }
      } catch {
        /* 선채움 실패는 조용히 넘긴다 — 열 때 채우는 경로가 그대로 남아 있다 */
      } finally {
        cardInflight.current.delete(id)
      }
    }
    const worker = async () => {
      for (;;) {
        const id = queue.shift()
        if (!id) return
        await one(id)
      }
    }
    void Promise.all([worker(), worker()]).then(() => console.info(`[source-card] 선채움 ${filled}/${ids.length}`))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 완주 1회. 세션 갱신(카드 저장 포함)으로 다시 돌면 안 된다
  }, [session.phase, session.stages])
  // 제목은 사람이 고칠 수 있고 세션에 남는다. 상단 바와 마인드맵 패널이 같은 값을 쓴다.
  const title = session.mapTitle ?? session.bigPicture?.title ?? "제목 없는 패스"
  const setMapTitle = (t: string) => dispatch({ type: "patch", patch: { mapTitle: t } })

  // ── 중앙 대화 ────────────────────────────────────────────────────────────────
  // 활동 줄(검색어·도구·중간 근거)은 **접힌 「Thoughts」 안으로** 넣는다. 스무 줄이 흐르면
  // 대화가 아니라 로그가 되기 때문이다. 다만 **지금 하는 일 한 줄은 아코디언 밖에 남긴다** —
  // 접힌 채 침묵하면 1차에서 얻은 「실시간 중계」를 그대로 잃는다.
  //
  // ⚠ 묶기는 `flow.ts` 가 아니라 **여기 파생에서** 한다. 저장 스키마(`ChatEntry`·`version: 5`)를
  //    건드리지 않아야 이미 저장된 세션이 살아남는다.
  const { messages, liveLine } = useMemo(() => {
    const out: ChatMessage[] = []
    let buffer: ChatEntry[] = []
    /**
     * 접힌 진행 줄을 어시스턴트 답변 위 아코디언으로 옮긴다.
     *
     * 6차 step-8 — 단계 결과 줄이면 **채널 집계 한 줄을 여기 더한다**(사용자 피드백 F
     * 「웹에서 자료 몇건, 후기 몇건 … 조사과정 1줄 아코디언 그 안에 들어가야 할 내용인거 같고」).
     * 집계는 저장 문자열을 파싱하지 않고 **그 단계의 `findings` 에서 코드가 다시 센다** — 화면에 서는 숫자가
     * 자료 목록과 어긋날 수 없다.
     */
    const flush = (target: ChatMessage, stage?: Stage) => {
      /**
       * ⚠ **끝난 조사에 「찾는 중…」을 남기지 않는다** (2026-09-15 사용자 지적).
       *   그 문구는 **상태**인데, 아코디언이 닫힌 뒤에도 그대로 굳어 있었다 —
       *   「찾았으면 그 과정으로 바뀌어 들어가야 한다」가 정확하다.
       *
       * 저장 문자열은 **안 바꾼다.** 진행 중에는 그 문구가 맞고, `waiting-lines` 의 계약
       * (검색 계열은 전부 `찾는 중…` 으로 끝난다)에 `SEARCH_LINE`·`isFoldable` 이 걸려 있다.
       * 지난 일로 바꾸는 것은 **이 렌더 한 곳**에서만 한다.
       */
      const done = !!stage
      const past = (t: string) => (done ? t.replace(/찾는 중…$/, "찾아봤습니다").replace(/실행 중…$/, "돌렸습니다") : t)
      /**
       * **그 단계의 줄만 그 단계 아코디언에 넣는다** (2026-09-15, 라이브 회귀로 한 번 더 고쳤다).
       *
       * 조사는 3병렬이라 활동 줄이 시간순으로 섞여 쌓인다. 버퍼를 통째로 쏟으면
       * 「3. 공구 준비」 아코디언에 1·4·5단계 줄이 같이 서고, 정작 3단계 줄은 남의 아코디언에 가 있다.
       *
       * 첫 판본은 **버퍼에서 골라 담고 나머지는 남기는** 방식이었다. 자리를 미리 까는 6차 step-3b 가
       * 그 전제를 깼다 — 결과 줄이 활동 줄보다 **앞**에 서므로 「지금까지 쌓인 것」에 그 줄이 아직 없다.
       * 그래서 고르는 자리를 위(`byStage`)로 올렸다. 여기서는 **자기 몫을 받아 쓰기만** 한다.
       */
      const take = [...buffer, ...(stage ? (byStage.get(stage.no) ?? []) : [])]
      const keep: ChatEntry[] = []
      const steps = take.map((b) => ({
        title: past(b.text),
        kind: SEARCH_LINE.test(b.text) ? ("search" as const) : ("think" as const),
        body: undefined as string | undefined,
        found: undefined as Array<{ label: string; name: string }> | undefined,
      }))
      const tally = stage ? channelTallyLine(stage.findings) : ""
      /**
       * 6차 step-8b (2026-09-15 사용자 육안) — 집계 줄 아래에 **어느 자료였는지**를 세운다.
       * 「웹에서 자료 3건」만으로는 아코디언을 열 이유가 없다. 여는 이유는 **무엇을 봤나**이고 그게 이 목록이다.
       */
      const found = stage ? stageFoundList(stage.findings) : []
      /**
       * 집계는 **따로 선 줄이 아니라 마지막 조사 줄의 본문**으로 넣는다 (같은 지적).
       * 제미나이 노트북이 「제목 + 그 아래 설명」 두 층인 것과 같은 모양이고,
       * 「어디를 뒤졌나」 바로 밑에 「무엇을 건졌나」가 오는 게 읽는 순서와 맞는다.
       * 마지막 조사 줄이 없으면(활동 줄이 하나도 없던 단계) 종전대로 한 줄을 만든다.
       */
      if (tally) {
        /**
         * ⚠ **그 단계의 줄에만 붙인다.** 조사는 3병렬이라 활동 줄이 단계끼리 **섞여서** 쌓인다 —
         *   「마지막 조사 줄」로 고르면 남의 단계 줄에 이 단계 집계가 붙는다(첫 판본이 그랬다:
         *   자료 3건짜리 집계가 6건인 단계의 줄에 붙었다). 줄 머리의 번호로 가른다.
         */
        const mine = stage ? new RegExp(`^${stage.no}\.`) : null
        const last = mine ? [...steps].reverse().find((x) => x.kind === "search" && mine.test(x.title)) : undefined
        if (last) {
          last.body = tally
          last.found = found.length ? found : undefined
        } else {
          /**
           * 그 단계의 조사 줄이 **이 버퍼에 없을 수 있다** — 조사가 3병렬이라 활동 줄이 다른 단계의
           * 아코디언으로 들어간다(실측: 5단계 중 1개만 자기 줄을 갖고 있었다).
           * 그때는 **단계가 실제로 돈 채널**(`scope.channels`)로 제목을 세워 두 층을 지킨다.
           *
           * ⚠ 0건인 채널도 그대로 둔다(2026-09-15 메인 세션 요청) — 「네 곳을 다 보고 이 주제에선
           *   둘이 걸렸다」의 물증이라 군더더기가 아니다. 그래서 제목은 **뒤진 곳**, 본문은 **건진 것**이고
           *   둘이 다른 것이 정상이다.
           */
          const names = (stage?.scope?.channels ?? []).map((c) => CHANNEL_NAME[c]).filter(Boolean)
          steps.push({
            title: names.length ? `${stage!.no}. ${stage!.title} · ${names.join("·")}에서 찾아봤습니다` : `이번 단계에서 모은 것`,
            kind: "search" as const,
            body: tally,
            found: found.length ? found : undefined,
          })
        }
      }
      buffer = keep
      if (!steps.length) return
      // 줄 수는 적지 않는다(2026-09-15 사용자 지적) — 몇 줄인지는 여는 이유가 못 되고,
      // 숫자가 붙으면 결론 줄 옆에서 또 하나의 수치처럼 읽힌다.
      target.reasoning = { label: "조사 과정", steps }
    }
    /**
     * ⚠ **번호가 붙은 활동 줄은 자리가 아니라 번호로 간다** (2026-09-15 라이브에서 잡은 회귀).
     *
     * 6차 step-3b 가 결과 자리를 **미리 깔면서** 순서가 뒤집혔다 — 결과 줄이 활동 줄보다 **앞**에 서게 되고,
     * 위치로 모으던 버퍼는 뒤에 오는 줄을 그 결과에 못 넣는다. 실측에서 여섯 단계의 활동 줄이
     * **통째로 꼬리 메시지 하나**에 붙어 「찾는 중…」인 채로 섰다(아코디언이 7개가 됐다).
     *
     * 그래서 줄 머리 번호가 있는 것은 **먼저 단계별로 모아 두고**, 위치 버퍼에는 번호 없는 줄만 남긴다
     * (「단계 6개로 나눴습니다」 같은 안내 — 그건 자리대로 흐르는 게 맞다).
     */
    const byStage = new Map<number, ChatEntry[]>()
    for (const m of session.messages) {
      if (!isFoldable(m)) continue
      const no = Number(/^(\d+)\.\s/.exec(m.text)?.[1])
      if (!Number.isInteger(no)) continue
      const got = byStage.get(no)
      if (got) got.push(m)
      else byStage.set(no, [m])
    }
    for (const m of session.messages) {
      if (isFoldable(m)) {
        if (!Number.isInteger(Number(/^(\d+)\.\s/.exec(m.text)?.[1]))) buffer.push(m)
        continue
      }
      // 이 줄이 가리키는 단계(결과 줄이 아니면 `undefined`). 아래 두 곳이 같은 값을 쓴다 —
      // 표시 문구 변환과 아코디언의 채널 집계(6차 step-8). 두 번 찾지 않는다.
      const stage = stageOfResultLine(m, session.stages)
      const next: ChatMessage = {
        id: m.id,
        role: m.role,
        // 단계 결과 줄의 판정은 **렌더 시점에** 표시 문구로 바꾼다 — 저장 문자열은 계약 값 그대로다(3차 step-1).
        // 판정 이유(`verdictReason`)는 `ChatEntry` 에 없다 — `m.text` 와 `session.stages` 를 둘 다 쥔 곳이
        // 이 파생 하나뿐이라 여기서 단계를 찾아 넘긴다(5차 step-9). 줄 머리의 번호가 단계 번호다.
        text: displayStageResult(m.text, stage),
        // 단계마다 옅은 구분선 하나 (2026-09-15 사용자 육안 ⑤). 선은 **말풍선 바깥**이 자리다 — 본문에 넣으면
        // 조사 과정 아코디언보다 아래에 서서 그 아코디언이 앞 단계에 붙어 보인다(부품 주석 `sectionStart` 참조).
        sectionStart: !!stage,
        // `citationIds` 는 옵셔널이다(4차 step-1) — 없는 옛 세션은 배지가 제목으로 문서를 찾는다.
        citations: stageCitations(m, stage),
      }
      // 접힌 층은 **어시스턴트 답변 위**에만 붙는다(사람 말풍선 위에 붙이면 내가 생각한 것처럼 읽힌다).
      if (next.role === "assistant") flush(next, stage)
      else buffer = buffer.length ? buffer : []
      out.push(next)
    }
    // 아직 안 닫힌 묶음 = 지금 도는 회차. 아코디언은 결과 줄이 올 때 닫히고, 그동안 **마지막 한 줄**은
    // 말풍선이 아니라 **스피너 자리**(마크 + 지금 하는 일)가 들고 있다(3차 step-4 — 2차의 「아코디언 밖 한 줄」이
    // 거처만 옮겼다). 원본 줄을 소비하지 않으므로 개수 검증은 그대로다.
    /**
     * 7차 step-8 — 인용 번호를 **세션 전역**으로 갈아끼운다.
     *
     * 서버는 답변마다 `[n]` 을 1..k 로 다시 매긴다(`chat.mjs`·`explain.mjs`). 그래서 한 대화 안에서
     * `[1]` 이 답변마다 다른 자료를 가리켰다. 여기서 **목록 전체를 한 번 훑어** 같은 자료에 같은 번호를 준다.
     *
     * ⚠ 저장 문자열도 서버 계약도 안 바꾼다 — 이 파생은 렌더 직전이고, 배지가 무엇을 여는지는
     *   여전히 그 메시지의 `citationIds` 가 정한다. **옛 세션도 그대로 열린다**(번호만 이어져 보인다).
     * ⚠ `displayStageResult` **뒤에** 적용한다 — 그 함수가 단계 안에서 번호를 먼저 정리한다.
     */
    const maps = globalCitationNumbers(out)
    const renumbered = out.map((m, i) => {
      const got = applyGlobalCitations(m.text, m.citations, maps[i])
      return got.text === m.text && got.citations === m.citations ? m : { ...m, text: got.text, citations: got.citations }
    })
    return { messages: renumbered, liveLine: buffer.length ? buffer[buffer.length - 1].text : undefined }
  }, [session.messages])

  const status: ChatStatus = session.error ? "error" : session.busy ? "waiting" : "idle"
  /**
   * 생각 중 한 줄 — 활동 줄이 있으면 그것, 없으면 지금 단계가 하는 일. 스피너가 침묵하지 않는다(문구 정본 §2-5).
   *
   * 6차 step-6 — 하드코딩 3분기를 **회전 풀**로 바꿨다(사용자 피드백 D 「다양했으면 좋겠고, 조사하는거에 따라서 바뀌고」).
   * 씨앗은 `turnCount + 완주한 단계 수` 다 — 대화가 나아가면 문구도 한 칸씩 돈다. **시계가 아니라 진행이 씨앗**이라
   * 같은 자리에 머무는 동안에는 문장이 안 흔들린다(0.5초마다 바뀌면 읽는 중에 글자가 달아난다).
   */
  const lineSeed = session.turnCount + session.stages.filter((s) => s.status === "done").length
  const waitingLabel = !session.busy
    ? undefined
    : session.phase === "skeleton" ? "실행 순서와 사례를 찾아 단계를 정하고 있습니다…" : liveLine ?? phaseLine(session.phase, lineSeed)

  /**
   * 인터뷰 선택지 — **추천이 맨 위**로 올라온다(5차 step-6 · D3). 옛 저장본(문자열 배열)은 `normalizeChoices` 가 흡수하고,
   * 그때는 추천이 첫 칩에 붙는다(원래 첫 칩이 모델의 첫 제안이라 순서가 바뀌지 않는다).
   * ⚠ 「직접 입력」은 꼬리를 지킨다 — 추천이 아니므로 정렬이 건드리지 않는다(안정 정렬).
   */
  const interviewChoices = useMemo(() => {
    const list = normalizeChoices(session.pending?.exampleButtons)
    return [...list].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)))
  }, [session.pending])
  /** 라벨 → 고른 이유. 이유를 낸 칩만 담는다 — 비면 칩이 종전 한 줄 모양으로 선다 */
  const suggestionReasons = useMemo(
    () => Object.fromEntries(interviewChoices.filter((c) => c.why).map((c) => [c.label, c.why!])),
    [interviewChoices],
  )
  const recommendedSuggestion = useMemo(
    () => (session.phase === "interview" ? interviewChoices.find((c) => c.recommended)?.label : undefined),
    [interviewChoices, session.phase],
  )
  const suggestions = useMemo(() => {
    if (session.busy) return undefined
    // 칩이 뜨는 세 화면(첫 화면·인터뷰·승인) 전부 「직접 입력」이 꼬리에 있다(3차 step-7).
    if (session.phase === "confirm") return withDirectInput([session.planningAttempt?.status === "failed" ? "조사 다시 시작" : APPROVE_LABEL, REVISE_LABEL])
    // 조사 끝난 뒤에는 칩이 **항상** 선다(4차 step-6, H6′) — 마지막 답변(대화·노드 설명)의 후속 칩, 없으면(완주 직후·옛 세션) 기본 3.
    // 노드 설명 뒤에는 그 노드에 맞는 칩이 선다(4차 보강 2 step-19, H16).
    if (session.phase === "ready") {
      const last = [...session.messages].reverse().find((m) => m.role === "assistant")
      const followups = (last?.kind === "chat" || last?.kind === "node-explain") && last.suggestions?.length ? last.suggestions : DEFAULT_FOLLOWUPS
      return withDirectInput(followups)
    }
    if (session.phase === "interview") {
      // 서버가 붙여 보내지만, 옛 저장 세션(로컬 grill 이전)의 칩에는 없을 수 있어 여기서도 보장한다.
      if (session.pending?.exampleButtons.length) return withDirectInput(interviewChoices.map((c) => c.label))
      if (session.messages.length === 0) return withDirectInput(DEMO ? demoStarters : EXAMPLE_STARTERS)
    }
    return undefined
  }, [session.busy, session.phase, session.pending, session.messages, session.planningAttempt, interviewChoices, demoStarters])

  /* 데모 빌드(M18 · 사용자 지시 2026-09-20): **녹화가 밟은 갈래만 눌린다.**
     나머지 칩은 보이되 회색으로 죽인다 — 누르면 같은 응답이 나와 묻는 말과 답이 어긋나기 때문이다.
     화면이 스스로 처리하는 칩(승인·내려받기·다시 시작)은 서버를 안 타므로 언제나 허용한다. */
  const disabledSuggestions = useMemo(() => {
    if (!DEMO || !suggestions?.length) return undefined
    const selfHandled = new Set([APPROVE_LABEL, DOWNLOAD_LABEL, "조사 다시 시작", ...demoStarters])
    const allowed = new Set(allowedChoices())
    return suggestions.filter((s) => !selfHandled.has(s) && !allowed.has(s))
  }, [suggestions, demoStarters, session.messages, demoBundleId])

  const handleSend = (text: string) => {
    setDraft("")
    /* 데모 빌드(M18): 첫 발화가 시나리오 선택이다 — 카드 라벨이 곧 녹화의 첫 답이라 이것으로 갈린다.
       고른 뒤에야 재생기가 어느 녹화를 틀지 알 수 있으므로, 고르고 나서 흐름에 넘긴다. */
    if (DEMO && session.messages.length === 0) {
      void selectScenarioByOpening(text).then((ok) => {
        if (!ok) return
        setDemoBundleId(activeScenario()?.id ?? null)
        void flow.sendAnswer(text)
      })
      return
    }
    // 첫 번째 입구 — 조사가 끝났으면 로드맵 대화다(4차 step-6, H6).
    if (session.phase === "ready") {
      void flow.askRoadmap(text)
      return
    }
    if (session.phase === "confirm") {
      // 승인 단계에서 자유 입력은 "고치겠다"는 뜻이다 — 그 문장을 새 인터뷰 답변으로 넘긴다.
      flow.reviseSummary()
      void flow.sendAnswer(text)
      return
    }
    void flow.sendAnswer(text)
  }

  const handleSuggestion = (s: string) => {
    if (s === DIRECT_INPUT_LABEL) return // 부품이 입력창 포커스로 처리한다 — 답으로 보내지 않는다
    /* 데모 빌드(M18): 첫 화면의 칩이 곧 시나리오 선택이다. 입력창 경로(`handleSend`)와 **같은 처리가
       여기에도 있어야 한다** — 칩은 이 함수로 들어오므로, 없으면 재생기가 어느 녹화인지 모른 채 불린다. */
    if (DEMO && session.messages.length === 0) {
      void selectScenarioByOpening(s).then((ok) => {
        if (!ok) return
        setDemoBundleId(activeScenario()?.id ?? null)
        void flow.sendAnswer(s)
      })
      return
    }
    // 두 번째 입구 — ready 의 칩은 인터뷰 답이 아니라 로드맵 질문이다(4차 step-6, 검증자 지적 ③). 「내려받기」 칩은 보내지 않는다.
    if (session.phase === "ready") {
      if (s === DOWNLOAD_LABEL) {
        void handleRoadmapDownload()
        return
      }
      void flow.askRoadmap(s)
      return
    }
    if (s === "조사 다시 시작") {
      flow.retry()
      return
    }
    if (s === APPROVE_LABEL) {
      void flow.startResearch(quota.consume) // 실행 잠금 안에서 최초 승인만 차감한다
      return
    }
    if (s === REVISE_LABEL) {
      flow.reviseSummary()
      return
    }
    void flow.sendAnswer(s)
  }

  // ── 우 마인드맵 ──────────────────────────────────────────────────────────────
  const handleNodeSelect = (n: MindmapNode) => {
    // 설명이 시작되지 않는 클릭(뿌리·이미 바쁨)은 부품이 방금 올린 선택도 되돌린다 — 진한 바탕이 남지 않게(step-8a).
    if (n.id === "root" || session.busy) {
      dispatch({ type: "patch", patch: { selectedId: null } })
      return
    }
    // 라벨은 화면용으로 잘려 있다 — 설명에는 `data.full` 전문을 넘긴다
    const full = (n.data as { full?: string } | undefined)?.full
    void flow.explainNode({ id: n.id, label: full ?? n.label }, stageNoFromNodeId(n.id))
  }

  /**
   * **PATH.md 는 바로 내려받지 않고 먼저 보여 준다** (8차 육안 3라운드 — 2026-09-16 사용자
   * 「PATH.md 도 누르면 모달 떠서 거기서 내용 확인하고 거기서 취소, 다운로드 버튼 있는 게 맞아」).
   * 종전에는 누르는 즉시 파일이 떨어져, 무엇을 받는지 모른 채 탐색기에서 열어 봐야 했다.
   */
  const [pathOpen, setPathOpen] = useState(false)
  const [pathText, setPathText] = useState<string | null>(null)
  const openPathPreview = async () => {
    setPathOpen(true)
    const existing = session.exportState.roadmapMarkdown
    if (existing) {
      setPathText(existing)
      return
    }
    setPathText(null) // 만드는 중 — 모달이 그 사실을 말한다
    const r = await flow.buildRoadmap()
    setPathText(r ? r.handoffMarkdown : "")
  }
  const handleRoadmapDownload = () => {
    if (pathText) downloadText("PATH.md", pathText)
    setPathOpen(false)
  }

  const canExport = session.phase === "ready" && doneCount > 0
  const [quotaNotice, setQuotaNotice] = useState(false)

  // 내 로드맵(4차 보강 2 step-18, 사용자 H14) — 완주한 로드맵은 자동으로 보관되고 우상단 「내 로드맵」에서 되돌아온다.
  const [roadmapsOpen, setRoadmapsOpen] = useState(false)
  const [roadmapList, setRoadmapList] = useState<SavedRoadmap[]>([])
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  // 세션에 아직 id 가 없을 때 만든 id 를 여기 먼저 굳힌다 — `patch({ id })` 가 커밋되기 전에 보관이 한 번 더 돌면(StrictMode 의
  // effect 2회 등) 새 id 로 **두 건**이 생겼다(step-18 실측). 같은 세션이면 같은 id 로 덮어쓴다.
  const pendingIdRef = useRef<string | null>(null)
  /** 지금 세션을 보관하고 id 를 세션에 굳힌다. 큰 그림이 없으면 아무것도 안 한다. 실패하면 한 줄 알림. */
  const archiveCurrent = () => {
    const s = sessionRef.current
    if (!s.bigPicture) return
    const id = s.id ?? pendingIdRef.current ?? newRoadmapId()
    pendingIdRef.current = id
    if (!saveRoadmap({ ...s, id })) {
      setSaveNotice(SAVE_FAILED)
      return
    }
    setSaveNotice(null)
    if (s.id !== id) dispatch({ type: "patch", patch: { id } })
  }
  // 보관 시점 ① — 조사가 끝나 ready 가 되는 순간(새로고침으로 다시 ready 가 돼도 같은 id 로 덮어쓴다)
  useEffect(() => {
    if (session.phase === "ready" && session.bigPicture) archiveCurrent()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phase 가 ready 로 바뀔 때 한 번. 대화·카드 갱신마다 목록 전체를 다시 쓰지 않는다(용량)
  }, [session.phase])
  const openRoadmapList = () => {
    setRoadmapList(listRoadmaps())
    setDeleteArmed(null)
    setRoadmapsOpen(true)
  }
  // 삭제는 두 번 누른다(finding 큐 「내 로드맵 삭제·이름 바꾸기」, 2026-09-14) — 첫 번째는 행 안에서 되묻고, 두 번째가 지운다. 브라우저 confirm 은 쓰지 않는다.
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null)
  const removeRoadmap = (id: string) => {
    if (deleteArmed !== id) {
      setDeleteArmed(id)
      return
    }
    deleteRoadmap(id)
    setDeleteArmed(null)
    setRoadmapList(listRoadmaps())
  }
  /** 제목 편집 — 보관본 제목을 바꾸고, 지금 보는 로드맵이면 화면 제목도 같이 바꾼다. */
  const retitleRoadmap = (id: string, title: string) => {
    if (!renameRoadmap(id, title)) return
    setRoadmapList(listRoadmaps())
    if (id === session.id) dispatch({ type: "patch", patch: { mapTitle: title.trim() } })
  }
  const openRoadmap = (id: string) => {
    if (id === session.id) {
      setRoadmapsOpen(false)
      return
    }
    archiveCurrent() // 보관 시점 ③ — 지금 것을 먼저
    const saved = getRoadmap(id)
    if (!saved) {
      setRoadmapList(listRoadmaps())
      return
    }
    flow.invalidateResearch()
    pendingIdRef.current = saved.id
    dispatch({ type: "restore", session: toCurrentSession(saved) })
    setDraft("")
    setDetailId(null)
    setRoadmapsOpen(false)
  }

  /**
   * **새 패스는 확인을 받고 연다** (8차 육안 3라운드 — 2026-09-16 사용자
   * 「새 패스 눌렀을 땐 모달 떠서 새 패스 열겠냐는 확인 창 떠야 하고」).
   * 지우는 동작이라 되돌릴 수 없다 — 지금 패스는 보관되지만 화면은 비워진다.
   */
  const [newAskOpen, setNewAskOpen] = useState(false)
  const askNewRoadmap = () => {
    if (quota.exhausted) {
      setQuotaNotice(true)
      return
    }
    setNewAskOpen(true)
  }
  const handleNewRoadmap = () => {
    setNewAskOpen(false)
    if (quota.exhausted) {
      setQuotaNotice(true)
      return
    }
    archiveCurrent() // 보관 시점 ② — 지우기 전에
    pendingIdRef.current = null
    flow.invalidateResearch()
    reset()
    setDraft("")
    setDetailId(null)
  }

  // 좌 패널 자식 행 — 자료 문서(노트)·할 일·역할 나눔 노트(step-16)와 소주제 폴더(문서 없음)를 재귀로(4차 보강 step-14).
  // 할 일·역할 나눔 노트는 `findingDocs` 에 들지 않으므로 인용 역추적·카드 채움이 닿지 않는다(사실만 보인다).
  // 아이콘은 둘뿐 — 폴더(부품 기본)와 파일(`FileText`). 종류는 부제가 말한다(보강 3 step-24, 사용자 H21).
  const toGroundedSource = (c: SourceDoc, stageDoc: SourceDoc): GroundedSource =>
    c.kind === "folder"
      ? { id: c.id, kind: "folder", title: c.title, children: c.children?.map((k) => toGroundedSource(k, stageDoc)) }
      : {
          id: c.id,
          favicon: <FileText size={20} aria-hidden />,
          title: c.title,
          subtitle: c.subtitle,
          url: c.url,
          guide: { summary: `${c.subtitle} · ${stageDoc.title}`, keywords: [] },
          body: <SourceBody doc={c} card={session.sourceCards?.[c.id]} loading={cardLoadingId === c.id} />,
        }

  // 상단 바는 레지스트리 자산이다(M121 로 export 됐다). 액션은 우리가 주입한다 —
  // 기능 없는 버튼은 넣지 않는다. 로그인은 이번 범위 밖이라 onSignIn 을 주지 않아 자리 자체가 안 선다.
  const topbar = (
    <div className="flex w-full items-center gap-3 pl-4">
      {/* 랜딩에서 넘어온 사람이 같은 자리에서 같은 로고를 만난다 — 크롬은 이 요소를 이어서 움직인다
          (`[data-app-logo]` ↔ 랜딩 `.nav__logo`, 이름 `pathfinder-logo`). 누르면 랜딩으로 돌아간다. */}
      <a href="/" aria-label="Pathfinder 홈" data-app-logo className="flex shrink-0 items-center gap-2">
        <img src="/pathfinder-mark.png" alt="" aria-hidden className="h-7 w-auto" />
        <img src="/pathfinder-wordmark.png" alt="Pathfinder" className="h-4 w-auto" />
      </a>
    <NotebookTopbar
      className="min-w-0 flex-1 pl-0"
      title={title}
      onTitleChange={setMapTitle}
      titleFallback="제목 없는 패스"
      actions={[
        { id: "new", label: "새 패스", icon: <Plus aria-hidden />, onClick: askNewRoadmap },
        { id: "roadmaps", label: "목록", icon: <Library aria-hidden />, onClick: openRoadmapList },
        {
          id: "roadmap-md",
          label: session.exportState.busy ? "만드는 중…" : "PATH.md",
          icon: <Download aria-hidden />,
          primary: true,
          onClick: openPathPreview,
          disabled: !canExport || session.exportState.busy,
        },
      ]}
      statusSlot={
        <>
          {session.degraded && (
            <span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">순차 조사로 전환됨</span>
          )}
          {saveNotice && (
            <span data-roadmap-save-notice className="rounded-full border border-border px-3 py-1 text-sm text-destructive">{saveNotice}</span>
          )}
          <span
            data-quota-badge
            title={quota.unlimited
              ? "패스 하나를 만들 때마다 몇 분 동안 웹을 조사합니다. 횟수 제한은 없습니다."
              : "패스 하나를 만들 때마다 몇 분 동안 웹을 조사합니다. 이 브라우저에서 2번까지 해 보실 수 있어요."}
            className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
          >
            {quota.unlimited ? "횟수 제한 없음" : `남은 횟수 ${quota.remaining}회`}
          </span>
        </>
      }
    />
    </div>
  )

  // 내 로드맵 목록(step-18) — 제목(제자리 편집) · 보관 시각 · 단계 n · 자료 n · 열기 · 삭제(2단계). 삭제·이름 바꾸기는 2026-09-14 추가(finding 큐).
  const roadmapsDialog = (
    <Dialog open={roadmapsOpen} onOpenChange={setRoadmapsOpen}>
      <DialogContent data-roadmaps-dialog contentClassName="mx-4 max-w-xl gap-3">
        <DialogTitle className="pr-8 text-lg font-normal">내 패스 목록</DialogTitle>
        {/* ⚠ 안내 문구는 뺐다 (8차 육안 3라운드 — 2026-09-16 사용자 「문구 삭제」). 목록이 스스로 설명한다. */}
        {roadmapList.length === 0 ? (
          <p data-roadmaps-empty className="py-6 text-center text-sm text-muted-foreground">보관된 패스가 아직 없습니다. 조사가 완주되면 여기에 쌓입니다.</p>
        ) : (
          <ul data-roadmaps-list className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {roadmapList.map((r) => {
              const current = r.id === session.id
              return (
                <li key={r.id} data-roadmap-row={r.id} data-roadmap-current={current || undefined} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <EditableText
                      as="div"
                      value={r.title}
                      fallback={r.title}
                      onChange={(t) => retitleRoadmap(r.id, t)}
                      aria-label="패스 제목"
                      data-roadmap-title={r.id}
                      className="truncate text-foreground"
                    />
                    <div className="text-sm text-muted-foreground">
                      {formatSavedAt(r.savedAt)} · 단계 {r.stageCount} · 자료 {r.findingCount}
                      {current ? " · 지금 보는 중" : ""}
                    </div>
                  </div>
                  {deleteArmed === r.id ? (
                    <span data-roadmap-delete-confirm={r.id} className="flex shrink-0 items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{current ? "보관본만 지웁니다. 화면은 그대로예요." : "이 패스를 지울까요?"}</span>
                      <button type="button" data-roadmap-delete-yes={r.id} onClick={() => removeRoadmap(r.id)} className="rounded-full border border-destructive px-3 py-1 text-destructive hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        지우기
                      </button>
                      <button type="button" data-roadmap-delete-no={r.id} onClick={() => setDeleteArmed(null)} className="rounded-full border border-border px-3 py-1 text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        두기
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-roadmap-open={r.id}
                        onClick={() => openRoadmap(r.id)}
                        className="shrink-0 rounded-full border border-border px-3 py-1 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {current ? "닫기" : "열기"}
                      </button>
                      <button
                        type="button"
                        data-roadmap-delete={r.id}
                        onClick={() => removeRoadmap(r.id)}
                        className="shrink-0 rounded-full px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )

  // 새 패스 확인 — 지우기 전에 한 번 묻는다(8차 육안 3라운드).
  const newAskDialog = (
    <Dialog open={newAskOpen} onOpenChange={setNewAskOpen}>
      <DialogContent data-new-dialog contentClassName="mx-4 max-w-md gap-3">
        <DialogTitle className="pr-8 text-lg font-normal">새 패스를 여시겠어요?</DialogTitle>
        <p className="text-sm text-muted-foreground">
          지금 보시는 패스는 목록에 보관되고 화면은 처음부터 다시 시작합니다. 보관한 패스는 「목록」에서 다시 여실 수 있어요.
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            data-new-cancel
            onClick={() => setNewAskOpen(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none ring-ring ring-offset-2 ring-offset-card hover:bg-muted focus-visible:ring-2"
          >
            취소
          </button>
          <button
            type="button"
            data-new-confirm
            onClick={handleNewRoadmap}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground outline-none ring-ring ring-offset-2 ring-offset-card hover:bg-primary-hover focus-visible:ring-2"
          >
            새 패스 열기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )

  // PATH.md 미리보기 — 무엇을 받는지 보고 나서 받는다(8차 육안 3라운드).
  const pathDialog = (
    <Dialog open={pathOpen} onOpenChange={setPathOpen}>
      <DialogContent data-path-dialog contentClassName="mx-4 max-w-3xl gap-3">
        <DialogTitle className="pr-8 text-lg font-normal">PATH.md</DialogTitle>
        {pathText === null ? (
          <p data-path-loading className="py-10 text-center text-sm text-muted-foreground">문서를 만드는 중입니다…</p>
        ) : pathText === "" ? (
          /* ⚠ **못 만든 것과 빈 것은 다르다.** 실측에서 `/api/handoff` 가 504 로 떨어졌는데 화면은
             「내보낼 내용이 없다」고 말해, 조사를 마쳤는데도 사용자를 자기 탓으로 돌렸다. 사유를 그대로 보인다. */
          <p data-path-empty className="py-10 text-center text-sm text-muted-foreground">
            {session.error ? `문서를 만들지 못했습니다 — ${session.error}` : "아직 내보낼 내용이 없습니다. 조사를 마친 뒤에 다시 눌러 주세요."}
          </p>
        ) : (
          <pre data-path-body className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-keep rounded-lg bg-muted px-3 py-2 text-sm leading-6">
            {pathText}
          </pre>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            data-path-cancel
            onClick={() => setPathOpen(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm outline-none ring-ring ring-offset-2 ring-offset-card hover:bg-muted focus-visible:ring-2"
          >
            취소
          </button>
          {pathText === "" ? (
            <button
              type="button"
              data-path-retry
              onClick={openPathPreview}
              className="rounded-md border border-border px-3 py-1.5 text-sm outline-none ring-ring ring-offset-2 ring-offset-card hover:bg-muted focus-visible:ring-2"
            >
              다시 만들기
            </button>
          ) : null}
          <button
            type="button"
            data-path-download
            onClick={handleRoadmapDownload}
            disabled={!pathText}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground outline-none ring-ring ring-offset-2 ring-offset-card hover:bg-primary-hover focus-visible:ring-2 disabled:opacity-50"
          >
            내려받기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <>
    {roadmapsDialog}
    {newAskDialog}
    {pathDialog}
    <NotebookWorkspaceShell
      topbar={topbar}
      ratios={SHELL_RATIOS}
      leftCollapsed={leftCollapsed}
      rightCollapsed={rightCollapsed}
      onLeftCollapsedChange={setLeftCollapsed}
      onRightCollapsedChange={setRightCollapsed}
      left={
        <GroundedSourcePanel
          // 고른 것만 대화에 넣는 기능이 없다 — 체크는 조작할 수 있다는 거짓 약속이라 끈다(사용자 지시 2026-09-13).
          selectable={false}
          sources={sources.map((d) => d.id === "planning-sources" ? toGroundedSource(d, d) : ({
            id: d.id,
            // 단계 = **폴더**(4차 보강 3 step-24, 사용자 H21). 행 클릭은 접기/펼치기, 문서는 폴더 안 첫 파일 「단계 요약」이 갖는다.
            kind: "folder" as const,
            // 아직 쓰이는 중인 폴더라는 사실은 목록에서 보여야 한다(§2-5) — 그때만 꼬리표가 붙는다.
            title: d.status === "done" ? d.title : d.status === "failed" ? `${d.title} · 자료를 못 찾았습니다` : `${d.title} · 조사 중…`,
            // 부제는 마인드맵과 같은 2색 어휘(step-22) — 「가져다 쓸 것 n · 직접 만들 것 m」. 조사 중이면 지금 몇 번째 검색인지(§2-5).
            subtitle:
              d.status === "done"
                ? d.subtitle
                : d.status === "failed"
                  ? "자료를 못 찾았습니다."
                  : session.runActivity?.stageNo === d.stageNo
                    ? `조사 중… · 검색 ${session.runActivity.searches}건`
                    : "조사 중…",
            // 폴더 안: 단계 요약 파일 → 소주제 폴더 → 자료·할 일·역할 나눔 파일(3차 step-3 · 4차 보강 step-14·16 · 보강 3 step-24)
            children: d.children?.map((c) => toGroundedSource(c, d)),
          }))}
          expandedIds={sourceExpanded}
          onExpandedChange={setSourceExpanded}
          selectedIds={sources.flatMap((d) => [d.id, ...(d.children ?? []).map((c) => c.id)])}
          onSelectedChange={() => {
            /* 이번 범위에서 근거 범위 고르기는 하지 않는다 — 전부가 근거다 */
          }}
          detailId={detailId}
          onDetailChange={setDetailId}
          collapsed={leftCollapsed}
          onCollapsedChange={setLeftCollapsed}
          showAdd={false}
          showSearch={false}
          // 정렬·라벨 툴바와 행 호버 「⋯」는 기능이 없다 — 껍데기는 뺀다(4차 보강 3 step-23, 사용자 H20)
          showToolbar={false}
          showMenu={false}
          labels={{
            title: "조사 결과",
            collapse: "조사 결과 패널 접기",
            expand: "조사 결과 패널 펼치기",
            emptyTitle: "조사 결과물이 여기에 정리됩니다",
            emptyBody: "인터뷰 이후 조사를 시작해보세요.",
          }}
        />
      }
      center={
        <ChatConversationPanel
          variant="grounded"
          title="대화"
          showHeaderActions={false}
          // 이 화면은 문서 Q&A 가 아니라 「무엇을 만들지」를 같이 정하는 자리다 — 문구 정본 `docs/app-ux-copy.md`
          composerPlaceholder={DEMO ? "데모입니다. 위 버튼으로 체험해보세요!" : "시작하려는 일을 한 문단으로 적어 주세요"}
          composerLocked={DEMO}
          disabledSuggestions={disabledSuggestions}
          renderCitation={(citation) => { const d = resolveCitation(citation); return <CitationBadge citation={citation} doc={d} cardText={d ? session.sourceCards?.[d.id] : undefined} onOpen={openSourceDoc} /> }}
          // 「얘와 나누는 대화」로 읽히게 — 연속한 답변 구간의 **마지막 줄 아래**에 붙고(부품이 판단한다),
          // 생각 중에는 스피너 자리에 「지금 하는 일」과 함께 선다. 28px(3차 step-4 — 22px 는 작다는 피드백 A3).
          renderAssistantMark={() => <img src={solarMark} alt="Solar" width={28} height={28} className="shrink-0" />}
          waitingLabel={waitingLabel}
          messages={messages}
          status={status}
          onSend={handleSend}
          onRetry={flow.retry}
          errorMessage={session.planningAttempt?.status === "failed" ? session.error ?? undefined : undefined}
          retryLabel={session.planningAttempt?.status === "failed" ? "조사 다시 시작" : undefined}
          draft={draft}
          onDraftChange={setDraft}
          suggestions={suggestions}
          onSuggestion={handleSuggestion}
          directInputLabel={DIRECT_INPUT_LABEL}
          suggestionNotes={{ [APPROVE_LABEL]: APPROVE_NOTE }}
          suggestionReasons={suggestionReasons}
          recommendedSuggestion={recommendedSuggestion}
          suggestionsPrompt={
            session.phase === "confirm"
              ? session.planningAttempt?.status === "failed"
                ? quota.unlimited ? "같은 요약으로 다시 조사합니다." : "같은 요약으로 다시 조사합니다. 이용 횟수는 추가로 차감하지 않습니다."
                : quota.unlimited ? "이대로 조사를 시작할까요? 몇 분 동안 웹을 살펴봅니다." : `이대로 조사를 시작할까요? 남은 ${quota.remaining}회 중 1회를 씁니다.`
              : session.phase === "interview" && session.turnCount > 0
                ? `몇 가지만 여쭤볼게요 · ${Math.min(session.turnCount + 1, 5)}/5`
                : undefined
          }
          // 빈 상태 그림 — 랜딩 team 아이콘과 같은 그림체(굵은 먹선 + 라벤더 면, 투명 배경)다.
          // lucide 손 아이콘은 얇은 선이라 랜딩에서 넘어오면 그림체가 끊겼고(2026-09-15 사용자 지적),
          // 인사보다 「만든다」가 이 질문의 뜻이라 공구 상자로 갈았다(같은 날 사용자 제안).
          emptyIcon={<img src="/app-toolbox.png" alt="" aria-hidden className="h-16 w-auto" />}
          emptyTitle="무엇을 시작하려 하세요?"
          emptyHint="그 길을 먼저 걸었던 사람들의 발자취를 살펴보세요. 간단한 인터뷰 후 말씀하신 것을 정리합니다."
          scopeLabel={doneCount ? `소스 ${doneCount}개` : undefined}
          onSaveNote={undefined}
          className="h-full max-w-none rounded-none border-0"
        />
      }
      right={
        <MindmapPanel
          root={root}
          // fan(세로) — 뿌리 왼쪽, 단계가 아래로 쌓이고 항목이 오른쪽으로 갈라진다(4차 step-4, 사용자 확정 H4 「세로 버전」).
          // roadmap 은 전부 펼치면 잎 45개가 한 줄에 누워 fit 배율이 0.25 까지 떨어졌다(4차 step-0 기준선). 토글은 두지 않는다.
          layout="fan"
          legend={<MindmapLegend />}
          mapTitle={root ? title : undefined}
          onMapTitleChange={setMapTitle}
          expandedIds={session.expandedIds}
          onExpandedChange={(ids) => dispatch({ type: "patch", patch: { expandedIds: ids } })}
          selectedId={session.selectedId}
          onSelectedChange={(id) => dispatch({ type: "patch", patch: { selectedId: id } })}
          onNodeSelect={handleNodeSelect}
          collapsed={rightCollapsed}
          onCollapsedChange={setRightCollapsed}
          labels={{
            emptyTitle: "그림이 여기에 그려집니다",
            emptyBody: "인터뷰가 끝나면 조사를 시작하여 마인드맵을 그려보세요.",
          }}
        />
      }
      footer={
        quotaNotice ? (
          <span>
            {quota.total}회를 모두 쓰셨습니다. 만든 패스는 계속 보실 수 있고, 마인드맵과 PATH.md 도 그대로 내려받을 수 있어요.
          </span>
        ) : session.error ? (
          <span className="text-destructive">{session.error}</span>
        ) : session.phase === "researching" ? (
          // ⚠ 「창을 닫아도 진행은 계속돼요」는 **Hermes 경로에서만 참이다** — 그 경로는 게이트웨이가
          //    run 을 들고 돌지만, 4함수 경로는 이 창의 자바스크립트가 호출을 이어 간다.
          <span>
            {`${doneCount}/${session.stages.length} 단계 조사 중 — 보통 3~5분 걸립니다. ` +
              (session.researchPath === "hermes"
                ? "창을 닫아도 진행은 계속돼요."
                : "이 창을 열어 두시면 이어서 진행됩니다.")}
          </span>
        ) : session.reinforcing ? (
          // 2파 보강 (6차 하이브리드 ⓐ) — 답은 이미 다 차 있다. 그래서 「조사 중」이 아니라 「더 찾는 중」이라고 말한다.
          // 이 줄이 없으면 완료 뒤에 흐르는 Hermes 활동 줄이 까닭 없이 움직이는 것으로 보인다.
          <span>자료가 얇은 단계를 더 찾아보는 중입니다 — 지금 결과는 그대로 쓰셔도 됩니다.</span>
        ) : null
      }
    />
    </>
  )
}
