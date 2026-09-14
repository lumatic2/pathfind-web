import { useCallback, useEffect, useRef, useState } from 'react'

import { useSession } from '../state/store'
import { useQuota, readQuota } from '../state/quota'
import { useFlow } from '../state/flow'
import type { ChatMessage, ChatStatus } from '../components/chat-conversation-panel'
import { ChatConversationPanel } from '../components/chat-conversation-panel'
import {
  NotebookWorkspaceShell,
  NotebookTopbar,
  MindmapPanel,
} from '../components/notebook-workspace-shell'

const LEFT_TITLE = '조사 결과'
const LEFT_EMPTY_TITLE = '조사 결과가 여기에 쌓입니다'
const LEFT_EMPTY_BODY =
  '승인하면 단계마다 자료를 찾아 마크다운 한 장씩 쌓아 둡니다'
const LEFT_COLLAPSE_LABEL = '조사 결과 패널 접기'
const LEFT_EXPAND_LABEL = '조사 결과 패널 펼치기'

const CENTER_GREETING = '무엇을 만들고 싶으세요'
const CENTER_BODY =
  '한 문단으로 적어 주세요, 몇 가지만 여쭙고 로드맵을 만들어 드립니다'
const CENTER_PLACEHOLDER = '오늘 어떤 로드맵을 그려볼까요'

const RIGHT_TITLE = '로드맵'
const RIGHT_EMPTY_TITLE = '로드맵이 여기에 그려집니다'
const RIGHT_EMPTY_BODY =
  '인터뷰가 끝나고 승인하면 단계 골격이 먼저 서고 조사 결과가 아래로 붙습니다'

const QUOTA_TOOLTIP =
  '로드맵 하나에 에이전트가 몇 분 동안 웹을 조사합니다, 이 브라우저에서 2번까지 돌려 보실 수 있어요'

function titleForSession(session: ReturnType<typeof useSession>['session']): string {
  if (session.mapTitle != null && session.mapTitle.trim().length > 0) {
    return session.mapTitle
  }
  if (session.bigPicture != null && session.bigPicture.title.trim().length > 0) {
    return session.bigPicture.title
  }
  return '제목 없는 로드맵'
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
      aria-label={`남은 로드맵 ${quota.remaining}회`}
    >
      남은 로드맵 {quota.remaining}회
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
        left={<LeftPanel />}
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

function LeftPanel() {
  return (
    <div className="panel-left">
      <MindmapPanel
        layout="roadmap"
        mapTitle={LEFT_TITLE}
        sourcesLabel=""
        onShowSources={undefined}
        onShare={undefined}
        onMore={undefined}
        collapsed={false}
        onCollapsedChange={undefined}
        labels={{
          title: LEFT_TITLE,
          collapse: LEFT_COLLAPSE_LABEL,
          expand: LEFT_EXPAND_LABEL,
          emptyTitle: LEFT_EMPTY_TITLE,
          emptyBody: LEFT_EMPTY_BODY,
          share: '',
          fullscreen: '',
          backToPanel: '',
          more: '',
        }}
        root={null}
        expandedIds={[]}
        onExpandedChange={undefined}
        selectedId={null}
        onSelectedChange={undefined}
        onNodeSelect={undefined}
      />
    </div>
  )
}

function CenterPanel() {
  const { sendAnswer, approve, reviseSummary, retry, resumeResearch } = useFlow()
  const { session, patch } = useSession()
  const resumeRef = useRef(false)

  useEffect(() => {
    if (resumeRef.current) return
    resumeRef.current = true
    resumeResearch()
  }, [resumeResearch])
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
        "맞아요, 이대로 조사해 주세요": remaining > 0 ? "로드맵 1회 소진" : "",
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
        <p className="research-foot">
          <span className="research-foot-strong">{doneCount}/{totalCount} 단계 조사 중</span>
          {' '}
         보통 3에서 5분 걸립니다. 이 창을 열어 두시면 이어서 진행됩니다.
        </p>
      )
      : null

  const errorFoot =
    session.error != null && researchActive
      ? (
        <p className="research-foot research-foot-error">
          잠시 문제가 있었습니다. 다시 시도해 주세요.
          {' '}
          <button type="button" className="research-foot-retry" onClick={retry}>다시 시도</button>
        </p>
      )
      : null

  const isBlankInterview =
    session.phase === "interview" &&
    session.turnCount === 0 &&
    session.messages.length === 0

  const suggestions: string[] =
    isBlankInterview
      ? [
          "동네 카페 사장님이 단골을 기억하게 돕는 앱을 만들고 싶어요",
          "학교 동아리 회비를 자동으로 정산하는 도구가 필요해요",
          "읽은 논문을 주제별로 묶어 주는 개인용 서비스를 만들고 싶어요",
          directInputLabel,
        ]
      : isApproval
        ? lastMessage.suggestions ?? []
        : session.pending?.exampleButtons ?? []

  const chatMessages: ChatMessage[] = session.messages.map((m) => ({
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
  }))

  const handleSend = (text: string) => {
    if (text === directInputLabel) return
    if (isApproval && !editIntent) {
      reviseSummary()
    }
    sendAnswer(text)
  }

  const handleSuggestion = (s: string) => {
    if (s === directInputLabel) return
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
        title="로드맵 만들기"
        messages={chatMessages}
        status={status}
        onSend={handleSend}
        onRetry={handleRetry}
        emptyTitle="무엇을 만들고 싶으세요?"
        emptyHint="한 문단으로 적어 주세요. 몇 가지만 여쭙고 로드맵을 만들어 드립니다."
        suggestions={suggestions}
        onSuggestion={handleSuggestion}
        directInputLabel={directInputLabel}
        composerPlaceholder="오늘 어떤 로드맵을 그려볼까요"
        onCopy={(m) => navigator.clipboard?.writeText(m.text)}
        onFeedback={() => {}}
        suggestionNotes={approvalNotes}
        waitingLabel={waitingLabel}
        renderAssistantMark={renderAssistantMark}
      />
      {session.phase === "interview" && session.busy ? (
        <div className="interview-progress" aria-live="polite">
          몇 가지만 여쭤볼게요 {session.turnCount}/5
        </div>
      ) : null}
      {researchFoot}
      {errorFoot}
    </div>
  )
}

function RightPanel() {
  return (
    <div className="panel-right">
      <MindmapPanel
        layout="roadmap"
        mapTitle={RIGHT_TITLE}
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
        root={null}
        expandedIds={[]}
        onExpandedChange={undefined}
        selectedId={null}
        onSelectedChange={undefined}
        onNodeSelect={undefined}
      />
    </div>
  )
}
