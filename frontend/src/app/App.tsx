import { useCallback, useState } from 'react'

import { useSession } from '../state/store'
import { useQuota } from '../state/quota'
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
            statusSlot={quotaBadge}
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
  const { sendAnswer } = useFlow()
  const { session, patch } = useSession()
  const directInputLabel = "직접 입력"

  const status: ChatStatus =
    session.error != null ? "error" : session.busy ? "waiting" : "idle"

  const isBlankInterview =
    session.phase === "interview" &&
    session.turnCount === 0 &&
    session.messages.length === 0

  const suggestions: string[] = isBlankInterview
    ? [
        "동네 카페 사장님이 단골을 기억하게 돕는 앱을 만들고 싶어요",
        "학교 동아리 회비를 자동으로 정산하는 도구가 필요해요",
        "읽은 논문을 주제별로 묶어 주는 개인용 서비스를 만들고 싶어요",
        directInputLabel,
      ]
    : session.pending?.exampleButtons ?? []

  const chatMessages: ChatMessage[] = session.messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    citations:
      m.citationTitles != null
        ? m.citationTitles.map((t, i) => ({
            n: i + 1,
            title: t,
            id: m.citationIds?.[i] ?? undefined,
          }))
        : undefined,
  }))

  const sendAnswerLocal = (text: string) => {
    if (text === directInputLabel) return
    sendAnswer(text)
  }

  const handleRetry = () => patch({ error: null })

  const waitingLabel = session.pending != null ? "다음 질문을 고르는 중…" : undefined

  return (
    <div className="panel-center">
      <ChatConversationPanel
        variant="grounded"
        className="h-full max-w-none rounded-none border-0 bg-card"
        title="로드맵 만들기"
        messages={chatMessages}
        status={status}
        onSend={sendAnswerLocal}
        onRetry={handleRetry}
        emptyTitle="무엇을 만들고 싶으세요?"
        emptyHint="한 문단으로 적어 주세요. 몇 가지만 여쭙고 로드맵을 만들어 드립니다."
        suggestions={suggestions}
        onSuggestion={sendAnswerLocal}
        directInputLabel={directInputLabel}
        composerPlaceholder="오늘 어떤 로드맵을 그려볼까요"
        onCopy={(m) => navigator.clipboard?.writeText(m.text)}
        onFeedback={() => {}}
        waitingLabel={waitingLabel}
      />
      {session.phase === "interview" && session.busy ? (
        <div className="interview-progress" aria-live="polite">
          몇 가지만 여쭤볼게요 {session.turnCount}/5
        </div>
      ) : null}
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
