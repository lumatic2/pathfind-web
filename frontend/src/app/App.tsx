import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FileText } from 'lucide-react'
import { useSession } from '../state/store'
import { useQuota, readQuota } from '../state/quota'
import { useFlow } from '../state/flow'
import type { ChatEntry, GrillChoice } from '../state/types'
import type { ChatMessage, ChatStatus } from '../components/chat-conversation-panel'
import { ChatConversationPanel } from '../components/chat-conversation-panel'
import { isFoldLine, isSearchLine } from './chatRelevance'
import { renderMarkdown } from '../components/chat-conversation-panel'
import { sourceTree, mindmapTree } from '../state/derive'
import type { Finding, Stage, SourceDoc } from '../state/types'
import { sourceCard } from '../lib/api'
import type { GroundedSource } from '../components/grounded-source-panel'
import { GroundedSourcePanel } from '../components/grounded-source-panel'
import {
  NotebookWorkspaceShell,
  NotebookTopbar,
  MindmapPanel,
} from '../components/notebook-workspace-shell'

type AppChatMessage = ChatMessage & { kind?: ChatEntry['kind'] }

const LEFT_TITLE = '조사 결과'
const LEFT_EMPTY_TITLE = '조사 결과물이 여기에 정리됩니다'
const LEFT_EMPTY_BODY =
  '인터뷰 이후 조사를 시작해보세요'
const LEFT_COLLAPSE_LABEL = '조사 결과 패널 접기'
const LEFT_EXPAND_LABEL = '조사 결과 패널 펼치기'

const CENTER_GREETING = '무엇을 시작하려 하세요'
const CENTER_BODY =
  '그 길을 먼저 걸었던 사람들의 발자취를 살펴보세요. 간단한 인터뷰 후 말씀하신 것을 정리합니다'
const CENTER_PLACEHOLDER = '시작하려는 일을 한 문단으로 적어 주세요'

const RIGHT_TITLE = '패스'
const RIGHT_EMPTY_TITLE = '패스가 여기에 그려집니다'
const RIGHT_EMPTY_BODY =
  '인터뷰가 끝나고 조사를 시작하면 단계 골격이 먼저 서고 조사 결과가 아래로 붙습니다'

const QUOTA_TOOLTIP =
  '패스 하나를 만들 때마다 몇 분 동안 웹을 조사합니다. 이 브라우저에서 2번까지 해 보실 수 있어요'

function titleForSession(session: ReturnType<typeof useSession>['session']): string {
  if (session.mapTitle != null && session.mapTitle.trim().length > 0) {
    return session.mapTitle
  }
  if (session.bigPicture != null && session.bigPicture.title.trim().length > 0) {
    return session.bigPicture.title
  }
  return '제목 없는 패스'
}

export default function App() {
  const { session, patch } = useSession()
  const quota = useQuota()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const topTitle = titleForSession(session)

  const handleTitleChange = useCallback(
    (next: string) => {
      patch({ mapTitle: next.trim().length > 0 ? next : null })
    },
    [patch],
  )

  const quotaBadge = (
    <span
      className="app-quota-badge"
      title={QUOTA_TOOLTIP}
      aria-label={`남은 패스 ${quota.remaining}회`}
    >
      남은 패스 {quota.remaining}회
    </span>
  )

  const researchActiveApp = session.phase === "researching" && session.stages.length > 0

  const degradedChip =
    researchActiveApp && session.degraded
      ? (
        <span className="research-degraded-chip">순차 조사로 전환됨</span>
      )
      : null

  const topStatusSlot = (
    <span className="center-top-status">
      {quotaBadge}
      {degradedChip}
    </span>
  )

  return (
    <div
      className="app-shell"
      data-phase={session.phase}
      data-stage-count={session.stages.length}
      data-notebook-shell
    >
      <NotebookWorkspaceShell
        ratios={[22, 43, 35]}
        left={<LeftPanel collapsed={leftCollapsed} onCollapsedChange={setLeftCollapsed} />}
        center={<CenterPanel />}
        right={<RightPanel />}
        leftCollapsed={leftCollapsed}
        onLeftCollapsedChange={setLeftCollapsed}
        rightCollapsed={rightCollapsed}
        onRightCollapsedChange={setRightCollapsed}
        topbar={
          <NotebookTopbar
            title={topTitle}
            onTitleChange={handleTitleChange}
            actions={[]}
            statusSlot={topStatusSlot}
          />
        }
      />
    </div>
  )
}

function LeftPanel({ collapsed, onCollapsedChange }: { collapsed: boolean; onCollapsedChange: (v: boolean) => void }) {
  const { session, patch } = useSession()
  const tree = sourceTree(session)
  const stageFolderIds = tree
    .filter((n): n is SourceDoc => n.kind === 'stage' && n.children != null)
    .map((n) => n.id)
  const expanded = session.sourceExpandedIds ?? stageFolderIds
  const [detailId, setDetailId] = useState<string | null>(null)
  const inflightRef = useRef<Set<string>>(new Set())
  const triedRef = useRef<Set<string>>(new Set())

  function sourceDocToGrounded(node: SourceDoc): GroundedSource {
    const children = node.children != null ? node.children.map(sourceDocToGrounded) : undefined
    const kind: 'doc' | 'folder' = node.kind === 'stage' || node.kind === 'folder' ? 'folder' : 'doc'
    const isFolder = kind === 'folder'
    const cardMarkdown = session.sourceCards?.[node.id] ?? node.markdown
    const isInflight = inflightRef.current.has(node.id)
    const body =
      !isFolder && cardMarkdown.trim().length > 0
        ? renderMarkdown(cardMarkdown, {})
        : isInflight
          ? <p className="text-sm text-muted-foreground">카드를 채우는 중…</p>
          : undefined
    return {
      id: node.id,
      title: node.title,
      subtitle: node.subtitle,
      url: node.url,
      kind,
      children,
      favicon: isFolder ? undefined : <FileText size={20} aria-hidden />,
      body,
    }
  }

  function treeToSources(tree: SourceDoc[]): GroundedSource[] {
    return tree.map(sourceDocToGrounded)
  }

  const sources = treeToSources(tree)

  const handleSourceOpen = useCallback((id: string) => {
    const cards = session.sourceCards ?? {}
    if (cards[id] != null) return
    if (inflightRef.current.has(id) || triedRef.current.has(id)) return

    const m = id.match(/^stage-(\d+)-finding-(\d+)$/)
    if (m == null) return
    const stageNo = parseInt(m[1], 10)
    const idx = parseInt(m[2], 10)
    const slot = session.stages[stageNo - 1]
    if (slot == null) return
    const stage = slot.stage
    const finding = stage.findings?.[idx]
    if (finding == null) return

    inflightRef.current.add(id)
    ;(async () => {
      try {
        const res = await sourceCard({ finding, stage, summary: session.summary ?? '' })
        if (res.markdown.trim().length > 0) {
          patch({ sourceCards: { ...cards, [id]: res.markdown } })
        }
      } catch {
        // degraded 포함 실패 — 오류 문구 안 보임
      } finally {
        inflightRef.current.delete(id)
        triedRef.current.add(id)
      }
    })()
  }, [session.sourceCards, session.stages, session.summary, patch])

  return (
    <div className="panel-left">
      <GroundedSourcePanel
        sources={sources}
        selectedIds={[]}
        onSelectedChange={() => {}}
        selectable={false}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        labels={{
          title: LEFT_TITLE,
          collapse: LEFT_COLLAPSE_LABEL,
          expand: LEFT_EXPAND_LABEL,
          emptyTitle: LEFT_EMPTY_TITLE,
          emptyBody: LEFT_EMPTY_BODY,
          add: '',
          searchPlaceholder: '',
          selectAll: '',
          backToList: '',
          guide: '',
          emptyLink: '',
          menu: '',
          openInNewTab: '',
          search: '',
          sort: '',
          label: '',
        }}
        expandedIds={expanded}
        onExpandedChange={(ids) => patch({ sourceExpandedIds: ids })}
        detailId={detailId}
        onDetailChange={(id) => {
          setDetailId(id)
          if (id != null) handleSourceOpen(id)
        }}
        showAdd={false}
        showSearch={false}
        showToolbar={false}
        showMenu={false}
      />
    </div>
  )
}


function CenterPanel() {
  const { sendAnswer, approve, reviseSummary, retry, resumeResearch, fillMissingOutlines, sendChat } = useFlow()
  const { session, patch } = useSession()
  const resumeRef = useRef(false)

  useEffect(() => {
    if (resumeRef.current) return
    resumeRef.current = true
    resumeResearch()
  }, [resumeResearch])

  // 새로고침 뒤 phase가 ready이고 busy가 아니면 빠진 outline을 하나씩 채운다
  useEffect(() => {
    if (session.phase === 'ready' && !session.busy) {
      fillMissingOutlines()
    }
  }, [session.phase, session.busy, fillMissingOutlines])
  const directInputLabel = "직접 입력"

  const lastMessage = session.messages[session.messages.length - 1]
  const isApproval = lastMessage?.kind === "summary-approval"
  const lastUserText = session.messages
    .filter((m) => m.role === "user")
    .at(-1)?.text
  const editIntent = lastUserText === "고칠 게 있어요"

  const remaining = readQuota().remaining
  const approvalNotes: Record<string, string> = isApproval
    ? {
        "맞아요, 이대로 조사해 주세요": "횟수 1회 소진",
        "고칠 게 있어요": "요약·큰 그림 수정",
      }
    : {}

  const researchActive =
    session.phase === "researching" && session.stages.length > 0
  const doneCount = session.stages.filter((s) => s.status === "done").length
  const totalCount = session.stages.length
  const anyRunning = session.stages.some((s) => s.status === "running")

  const status: ChatStatus =
    session.error != null ? "error" : researchActive && anyRunning ? "waiting" : session.busy ? "waiting" : "idle"

  const researchFoot =
    researchActive && totalCount > 0
      ? (
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">{doneCount}/{totalCount} 단계 조사 중</span>
          {' '}
         보통 3에서 5분 걸립니다. 이 창을 열어 두시면 이어서 진행됩니다.
        </p>
      )
      : null

  const errorFoot =
    session.error != null && researchActive
      ? (
        <p className="mt-2 text-sm text-destructive leading-relaxed">
          잠시 문제가 있었습니다. 다시 시도해 주세요.
          {' '}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={retry}>다시 시도</button>
        </p>
      )
      : null

  const isBlankInterview =
    session.phase === "interview" &&
    session.turnCount === 0 &&
    session.messages.length === 0

  const pendingButtons = session.pending?.exampleButtons ?? []
  const pendingLabels: string[] = []
  const pendingReasons: Record<string, string> = {}
  let pendingRecommended: string | undefined

  for (const b of pendingButtons) {
    if (typeof b === "string") {
      pendingLabels.push(b)
    } else {
      const label = b.label
      pendingLabels.push(label)
      if (b.why != null) pendingReasons[label] = b.why
      if (b.recommended) pendingRecommended = label
    }
  }
  pendingLabels.sort((a, b) => (a === pendingRecommended ? -1 : 0) - (b === pendingRecommended ? -1 : 0))

  const suggestions: string[] =
    isBlankInterview
      ? [
          "퇴직하고 동네에서 원데이 목공 클래스를 열어 보고 싶어요",
          "학교 동아리 회비를 자동으로 정산하는 도구가 필요해요",
          "읽은 논문을 주제별로 묶어 주는 개인용 서비스를 만들고 싶어요",
          directInputLabel,
        ]
      : session.phase === "ready"
        ? lastMessage.suggestions == null
          ? [
              "이 패스에서 먼저 할 일은",
              "직접 만들 것만 순서대로 정리해 줘",
              "PATH.md 내려받기",
              directInputLabel,
            ]
          : lastMessage.suggestions.map((s): string =>
              typeof s === "string" ? s : (s as GrillChoice).label
            )
        : isApproval
          ? lastMessage.suggestions == null
            ? []
            : lastMessage.suggestions.map((s): string =>
                typeof s === "string" ? s : (s as GrillChoice).label
              )
          : pendingLabels.length > 0
            ? pendingLabels
            : []

  const suggestionReasons = isApproval ? {} : pendingReasons
  const recommendedSuggestion = isApproval ? undefined : pendingRecommended
  const suggestionsPrompt =
    session.pending?.exampleButtons != null
      ? `이대로 조사를 시작할까요? 남은 ${remaining}회 중 1회를 씁니다`
      : undefined

  const chatMessages: AppChatMessage[] = (() => {
    const out: AppChatMessage[] = []
    const buffer: ChatEntry[] = []

    const entryToMessage = (m: ChatEntry): AppChatMessage => ({
      id: m.id,
      role: m.role,
      text: m.text,
      kind: m.kind,
      citations:
        m.citationTitles != null
          ? m.citationTitles.map((t, i) => ({
              n: i + 1,
              title: t,
              id: m.citationIds?.[i] ?? undefined,
            }))
          : undefined,
    })

    const flushBuffer = (attachLast: boolean) => {
      if (buffer.length === 0) return
      const steps = buffer.map((m) => ({
        title: m.text,
        kind: isSearchLine(m.text) ? ('search' as const) : ('think' as const),
      }))
      if (out.length > 0) {
        out[out.length - 1] = {
          ...out[out.length - 1],
          reasoning: { label: `조사 과정 ${steps.length}줄`, steps },
        }
      } else if (attachLast && buffer.length > 0) {
        const m = buffer[buffer.length - 1]
        out.push({
          ...entryToMessage(m),
          reasoning: { label: `조사 과정 ${steps.length}줄`, steps },
        })
      }
      buffer.length = 0
    }

    for (const m of session.messages) {
      if (isFoldLine(m)) {
        buffer.push(m)
        continue
      }
      flushBuffer(false)
      out.push(entryToMessage(m))
    }
    flushBuffer(true)
    return out
  })()

  const handleSend = (text: string) => {
    if (text === directInputLabel) return
    if (session.phase === "ready") {
      sendChat(text)
      return
    }
    if (isApproval && !editIntent) {
      reviseSummary()
    }
    sendAnswer(text)
  }

  const handleSuggestion = (s: string) => {
    if (s === directInputLabel) return
    if (session.phase === "ready") {
      sendChat(s)
      return
    }
    if (isApproval) {
      if (s === "맞아요, 이대로 조사해 주세요") {
        approve()
        return
      }
      if (s === "고칠 게 있어요") {
        reviseSummary()
        return
      }
    }
    sendAnswer(s)
  }

  const handleRetry = () => patch({ error: null })

  const lastMsgTime = session.messages.length > 0
    ? new Date(session.messages[session.messages.length - 1].id).getTime()
    : 0

  const silenceRef = useRef<{ lastMsgAt: number; showedLongStep: boolean }>({
    lastMsgAt: 0,
    showedLongStep: false,
  })
  silenceRef.current = { lastMsgAt: lastMsgTime, showedLongStep: silenceRef.current.showedLongStep }

  const [onSilence, setOnSilence] = useState(false)
  const waitingLabel: string | undefined =
    session.pending != null
      ? "다음 질문을 고르는 중…"
      : session.phase === "ready" && session.busy
        ? "조사 문서에서 찾는 중이야"
        : researchActive && session.runActivity != null
          ? onSilence
            ? "조금 오래 걸리는 단계입니다. 계속 기다리는 중이에요."
            : session.runActivity
          : undefined

  const renderAssistantMark = researchActive && session.runActivity != null
    ? () => <span className="research-run-mark">{session.runActivity}</span>
    : undefined

  useEffect(() => {
    const now = Date.now()
    const elapsed = now - silenceRef.current.lastMsgAt
    if (researchActive && elapsed >= 30000 && !silenceRef.current.showedLongStep) {
      setOnSilence(true)
      silenceRef.current = { ...silenceRef.current, showedLongStep: true }
    }
  }, [researchActive, onSilence])

  return (
    <div className="panel-center">
      <ChatConversationPanel
        variant="grounded"
        className="h-full max-w-none rounded-none border-0 bg-card"
        title="패스 만들기"
        messages={chatMessages}
        status={status}
        onSend={handleSend}
        onRetry={handleRetry}
        emptyTitle="무엇을 시작하려 하세요"
        emptyHint="그 길을 먼저 걸었던 사람들의 발자취를 살펴보세요. 간단한 인터뷰 후 말씀하신 것을 정리합니다."
        suggestions={suggestions}
        onSuggestion={handleSuggestion}
        directInputLabel={directInputLabel}
        composerPlaceholder="시작하려는 일을 한 문단으로 적어 주세요"
        onCopy={(m) => navigator.clipboard?.writeText(m.text)}
        onFeedback={() => {}}
        suggestionNotes={approvalNotes}
        suggestionReasons={suggestionReasons}
        recommendedSuggestion={recommendedSuggestion}
        suggestionsPrompt={suggestionsPrompt}
        waitingLabel={waitingLabel}
        renderAssistantMark={renderAssistantMark}
      />
      {session.phase === "interview" && session.busy ? (
        <div className="interview-progress" aria-live="polite">
          {session.turnCount === 1 ? "조사 시작 확인" : `몇 가지만 여쭤볼게요, 지금 턴 ${session.turnCount}/5`}
        </div>
      ) : null}
      {researchFoot}
      {errorFoot}
    </div>
  )
}

function RightPanel() {
  const { session, patch } = useSession()
  const root = useMemo(() => mindmapTree(session), [session])

  const expandedIds = session.expandedIds?.length > 0 ? session.expandedIds : ['root']

  return (
    <div className="panel-right">
      <MindmapPanel
        layout="fan"
        mapTitle={session.mapTitle ?? undefined}
        onMapTitleChange={(title) => patch({ mapTitle: title.trim().length > 0 ? title : null })}
        sourcesLabel=""
        onShowSources={undefined}
        onShare={undefined}
        onMore={undefined}
        collapsed={false}
        onCollapsedChange={undefined}
        labels={{
          title: RIGHT_TITLE,
          collapse: '',
          expand: '',
          emptyTitle: RIGHT_EMPTY_TITLE,
          emptyBody: RIGHT_EMPTY_BODY,
          share: '',
          fullscreen: '',
          backToPanel: '',
          more: '',
        }}
        root={root}
        expandedIds={expandedIds}
        onExpandedChange={(ids) => patch({ expandedIds: ids })}
        selectedId={session.selectedId}
        onSelectedChange={(id) => patch({ selectedId: id })}
        onNodeSelect={undefined}
      />
    </div>
  )
}
