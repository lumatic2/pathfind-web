import { useCallback, useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react'

import { FileText } from 'lucide-react'
import { useSession } from '../state/store'
import { useQuota, readQuota } from '../state/quota'
import { useFlow } from '../state/flow'
import type { ChatEntry, GrillChoice } from '../state/types'
import type { ChatMessage, ChatCitation, ChatStatus } from '../components/chat-conversation-panel'
import { ChatConversationPanel } from '../components/chat-conversation-panel'
import { isFoldLine, isSearchLine } from './chatRelevance'
import { renumberCitations } from './chatCitations'
import { renderMarkdown } from '../components/chat-conversation-panel'
import { sourceTree, mindmapTree, mindmapLegend, resolveCitation, sourceAncestors, displayStageResult } from '../state/derive'
import type { Finding, Stage, SourceDoc } from '../state/types'
import { downloadText, sourceCard } from '../lib/api'
import { saveRoadmap, newRoadmapId, getRoadmap, toCurrentSession } from '../state/roadmaps'
import { listRoadmaps, renameRoadmap, deleteRoadmap } from '../state/roadmaps'
import type { SavedRoadmap } from '../state/roadmaps'
import type { GroundedSource } from '../components/grounded-source-panel'
import { GroundedSourcePanel } from '../components/grounded-source-panel'
import {
  NotebookWorkspaceShell,
  NotebookTopbar,
  MindmapPanel,
} from '../components/notebook-workspace-shell'
import type { MindmapNode } from '../components/mindmap-spine-tree'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { EditableText } from '@/components/editable-text'
import { AppDialogContent } from './AppDialogContent'
import { PathPreviewDialog } from './PathPreviewDialog'


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
  const { session, patch, replace, reset } = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session
  const quota = useQuota()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [footerAlert, setFooterAlert] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [leftPanelKey, setLeftPanelKey] = useState(0)
  const [archiveItems, setArchiveItems] = useState<SavedRoadmap[]>([])
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const pendingArchiveIdRef = useRef<string | null>(null)

  const loadArchive = useCallback(() => {
    setArchiveItems(listRoadmaps())
  }, [])

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
      aria-label={`남은 횟수 ${quota.remaining}회`}
    >
      남은 횟수 {quota.remaining}회
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

  const leftPanelRef = useRef<LeftPanelHandle>(null)
  const [openCitationN, setOpenCitationN] = useState<number | null>(null)

  const { buildRoadmap } = useFlow()
  const previewBuildingRef = useRef(false)

  const handleRoadmapDownload = useCallback(() => {
    setPreviewDialogOpen(true)
  }, [])

  const handlePreviewOpen = useCallback(() => {
    setPreviewDialogOpen(true)
    const md = session.exportState.roadmapMarkdown
    if (md != null && md.trim().length > 0) {
      setPreviewText(md)
      setPreviewBusy(false)
      setPreviewError(null)
      return
    }
    if (previewBuildingRef.current) return
    previewBuildingRef.current = true
    setPreviewBusy(true)
    setPreviewError(null)
    buildRoadmap()
  }, [session.exportState.roadmapMarkdown, buildRoadmap])

  useEffect(() => {
    if (!previewDialogOpen) return
    const es = session.exportState
    if (es.busy) {
      setPreviewBusy(true)
      setPreviewError(null)
      return
    }
    if (previewBuildingRef.current) {
      previewBuildingRef.current = false
      if (es.roadmapMarkdown != null && es.roadmapMarkdown.trim().length > 0) {
        setPreviewText(es.roadmapMarkdown)
        setPreviewBusy(false)
        setPreviewError(null)
      } else {
        setPreviewBusy(false)
        setPreviewError('PATH.md를 만들지 못했습니다. 다시 시도해 주세요.')
      }
    }
  }, [session.exportState, previewDialogOpen])

  const handlePreviewDownload = useCallback(() => {
    const md = previewText
    if (md != null && md.trim().length > 0) {
      downloadText('PATH.md', md)
    }
  }, [previewText])

  const handlePreviewClose = useCallback(() => {
    setPreviewDialogOpen(false)
    setPreviewText(null)
    setPreviewBusy(false)
    setPreviewError(null)
    previewBuildingRef.current = false
  }, [])

  const handlePreviewRetry = useCallback(() => {
    setPreviewError(null)
    setPreviewText(null)
    previewBuildingRef.current = true
    setPreviewBusy(true)
    buildRoadmap()
  }, [buildRoadmap])

  const archiveCurrent = useCallback(() => {
    const current = sessionRef.current
    if (current.bigPicture == null) return

    const id =
      current.id ??
      pendingArchiveIdRef.current ??
      newRoadmapId()
    if (current.id == null) {
      pendingArchiveIdRef.current = id
    }

    const result = saveRoadmap(current, id)
    if (!result.ok) {
      setFooterAlert(
        '이 패스를 보관하지 못했습니다. 브라우저 저장 공간이 찼습니다.'
      )
      return
    }

    setFooterAlert(null)
    if (current.id == null) {
      patch({ id: result.id })
    }
  }, [patch])

  const handleItemOpen = useCallback(
    (id: string) => {
      archiveCurrent()
      const item = getRoadmap(id)
      if (item == null) return
      const next = toCurrentSession(item)
      replace(next)
      pendingArchiveIdRef.current = id
      setDialogOpen(false)
    },
    [archiveCurrent, replace],
  )

  const handleNewRoadmapAsk = useCallback(() => {
    setNewDialogOpen(true)
  }, [])

  const handleNewRoadmapConfirm = useCallback(() => {
    setNewDialogOpen(false)
    if (quota.remaining === 0) {
      setFooterAlert(
        '2회를 모두 쓰셨습니다. 만든 패스는 계속 보실 수 있고, 마인드맵과 PATH.md 도 그대로 내려받을 수 있어요',
      )
      return
    }
    archiveCurrent()
    pendingArchiveIdRef.current = null
    reset()
  }, [quota.remaining, archiveCurrent, reset])

  const handleRename = useCallback(
    (id: string, next: string) => {
      renameRoadmap(id, next)
      setArchiveItems(listRoadmaps())
    },
    [],
  )

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteSecond, setConfirmDeleteSecond] = useState<boolean>(false)

  const handleDeleteAsk = useCallback(
    (id: string) => {
      setDeletingId(id)
      setConfirmDeleteSecond(true)
    },
    [],
  )

  const handleDeleteCancel = useCallback(() => {
    setDeletingId(null)
    setConfirmDeleteSecond(false)
  }, [])

  const handleDeleteConfirm = useCallback(() => {
    if (deletingId == null) return
    const id = deletingId
    setDeletingId(null)
    deleteRoadmap(id)
    setArchiveItems(listRoadmaps())
  }, [deletingId])

  useEffect(() => {
    if (session.phase === 'ready') {
      archiveCurrent()
    }
  }, [session.phase, archiveCurrent])

  const renderCitation = useCallback((citation: ChatCitation, index: number) => {
    const doc = resolveCitation(sourceTree(session), citation)
    let bodyNode: React.ReactNode | null = null
    if (doc != null) {
      const cards = session.sourceCards ?? {}
      const raw =
        cards[doc.id] ??
        doc.markdown ??
        doc.evidence ??
        ''
      if (raw.trim().length > 0) {
        const firstLineEnd = raw.indexOf('\n')
        const content = firstLineEnd >= 0 ? raw.slice(firstLineEnd + 1) : ''
        bodyNode = content.trim().length > 0
          ? renderMarkdown(content, { staged: false })
          : null
      }
    }
    return (
      <CitationBadge
        citation={citation}
        doc={doc}
        bodyNode={bodyNode}
        open={openCitationN === citation.n}
        onOpenChange={(n) => setOpenCitationN(n)}
        onOpen={(id) => leftPanelRef.current?.openSourceDoc(id)}
      />
    )
  }, [session])

  return (
    <div
      className="app-shell"
      data-phase={session.phase}
      data-stage-count={session.stages.length}
      data-notebook-shell
    >
      <NotebookWorkspaceShell
        ratios={[22, 43, 35]}
        left={<LeftPanel key={leftPanelKey} ref={leftPanelRef} collapsed={leftCollapsed} onCollapsedChange={setLeftCollapsed} />}
        center={<CenterPanel renderCitation={renderCitation} onPreviewOpen={handlePreviewOpen} />}
        right={<RightPanel />}
        leftCollapsed={leftCollapsed}
        onLeftCollapsedChange={setLeftCollapsed}
        rightCollapsed={rightCollapsed}
        onRightCollapsedChange={setRightCollapsed}
        topbar={
          <NotebookTopbar
            title={topTitle}
            onTitleChange={handleTitleChange}
            actions={[
                          {
                            id: 'path',
                            label: session.exportState.busy ? '만드는 중' : 'PATH.md',
                            onClick: handlePreviewOpen,
                            disabled:
                              session.phase !== 'ready' ||
                              session.stages.filter((s) => s.status === 'done').length === 0 ||
                              session.busy,
                          },
                          {
                            id: 'library',
                            label: '목록',
                            onClick: () => {
                              loadArchive()
                              setDialogOpen(true)
                            },
                          },
                          {
                            id: 'new-roadmap',
                            label: '새 패스',
                            onClick: handleNewRoadmapAsk,
                          },
                        ]}
            statusSlot={topStatusSlot}
          />
        }
        footer={footerAlert}
      />
      <ArchiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        items={archiveItems}
        currentSessionId={session.id ?? null}
        onItemOpen={handleItemOpen}
        onRename={handleRename}
        onDeleteAsk={handleDeleteAsk}
        deletingId={deletingId}
        confirmDeleteSecond={confirmDeleteSecond}
        onDeleteCancel={handleDeleteCancel}
        onDeleteConfirm={handleDeleteConfirm}
      />
      <NewPathDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onConfirm={handleNewRoadmapConfirm}
      />
      <PathPreviewDialog
        open={previewDialogOpen}
        onOpenChange={(v) => {
          if (!v) handlePreviewClose()
          else setPreviewDialogOpen(true)
        }}
        text={previewText}
        busy={previewBusy}
        error={previewError}
        onRetry={handlePreviewRetry}
        onDownload={handlePreviewDownload}
      />
    </div>
  )
}

interface LeftPanelHandle {
  openSourceDoc: (id: string) => void
}

const LeftPanel = forwardRef<LeftPanelHandle, { collapsed: boolean; onCollapsedChange: (v: boolean) => void }>(({ collapsed, onCollapsedChange }, ref) => {
  const { session, patch } = useSession()
  const tree = sourceTree(session)
  const stageFolderIds = tree
    .filter((n): n is SourceDoc => n.kind === 'stage' && n.children != null)
    .map((n) => n.id)
  const expanded = session.sourceExpandedIds ?? stageFolderIds
  const [detailId, setDetailId] = useState<string | null>(null)
  const inflightRef = useRef<Set<string>>(new Set())
  const triedRef = useRef<Set<string>>(new Set())
  const prefillKeyRef = useRef<string | null>(null)
  const prefillRunningRef = useRef(false)

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

  const handleDetailChange = useCallback((id: string | null) => {
    setDetailId(id)
    if (id != null) handleSourceOpen(id)
  }, [handleSourceOpen])

  const openSourceDoc = useCallback((id: string) => {
    const ancestors = sourceAncestors(tree, id)
    const currentExpanded = new Set(session.sourceExpandedIds ?? [])
    for (const a of ancestors) currentExpanded.add(a)
    patch({ sourceExpandedIds: [...currentExpanded] })
    if (collapsed) onCollapsedChange(false)
    handleDetailChange(id)
  }, [tree, session.sourceExpandedIds, collapsed, onCollapsedChange, patch, handleDetailChange])

  useImperativeHandle(ref, () => ({ openSourceDoc }), [openSourceDoc])

  useEffect(() => {
    if (session.phase !== 'ready') return
    if (prefillRunningRef.current) return

    const cards = session.sourceCards ?? {}
    const inflight = inflightRef.current
    const toPrefill: string[] = []
    for (const slot of session.stages) {
      if (slot.status !== 'done') continue
      const stage = slot.stage
      const findings = stage.findings
      if (findings == null) continue
      for (let i = 0; i < findings.length; i++) {
        const id = `stage-${stage.no}-finding-${i}`
        if (cards[id] != null) continue
        if (inflight.has(id)) continue
        toPrefill.push(id)
      }
    }
    if (toPrefill.length === 0) return

    toPrefill.sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
    const key = toPrefill.join('\n')
    if (prefillKeyRef.current === key) return
    prefillKeyRef.current = key
    prefillRunningRef.current = true

    let index = 0
    async function drain() {
      if (index >= toPrefill.length) {
        prefillRunningRef.current = false
        return
      }
      const batch = toPrefill.slice(index, index + 2)
      index += batch.length
      await Promise.allSettled(
        batch.map(async (id) => {
          const m = id.match(/^stage-(\d+)-finding-(\d+)$/)
          if (m == null) return
          const stageNo = parseInt(m[1], 10)
          const idx = parseInt(m[2], 10)
          const slot = session.stages[stageNo - 1]
          if (slot == null) return
          const stage = slot.stage
          const finding = stage.findings?.[idx]
          if (finding == null) return
          try {
            const res = await sourceCard({ finding, stage, summary: session.summary ?? '' })
            if (!res.degraded && res.markdown.trim().length > 0) {
              patch({ sourceCards: { ...cards, [id]: res.markdown } })
            }
          } catch {
            // 실패는 조용히 넘기고 tried에는 넣지 않는다
          }
        }),
      )
      await drain()
    }
    drain().catch(() => {
      prefillRunningRef.current = false
    })
  }, [session.phase, session.stages, session.sourceCards, session.summary, patch])

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
        onDetailChange={handleDetailChange}
        showAdd={false}
        showSearch={false}
        showToolbar={false}
        showMenu={false}
      />
    </div>
  )
})

function CenterPanel({ renderCitation, onPreviewOpen }: { renderCitation?: (citation: ChatCitation, index: number) => React.ReactNode; onPreviewOpen?: () => void }) {
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

  const rawChatMessages: AppChatMessage[] = (() => {
    const out: AppChatMessage[] = []
    const buffer: ChatEntry[] = []

    const stageSlotByResultLine = (line: string): Stage | undefined => {
      const m = line.match(/^(\d+)\. /)
      if (!m) return undefined
      const idx = Number(m[1]) - 1
      return session.stages[idx]?.stage
    }

    const isStageResultLine = (text: string): boolean => {
      const verdictRe = /\*\*(가져다 써도 됨|직접 해야 함|섞어야 함|선례를 못 찾음)\*\*/
      return verdictRe.test(text)
    }

    const entryToMessage = (m: ChatEntry, sectionStart?: boolean): AppChatMessage => {
      const stage = isStageResultLine(m.text)
        ? stageSlotByResultLine(m.text)
        : undefined
      let citations: AppChatMessage['citations']
      if (m.citationTitles != null) {
        const saved = m.citationTitles
        if (
          stage != null &&
          stage.findings != null &&
          saved.length < stage.findings.length
        ) {
          const out: ChatCitation[] = []
          const used = new Set<number>()
          for (let i = 0; i < saved.length; i++) {
            const t = saved[i]
            const fidx = stage.findings.findIndex((f) => (f.name ?? '') === t)
            if (fidx >= 0) {
              used.add(fidx)
              out.push({
                n: out.length + 1,
                title: t,
                id: `stage-${stage.no}-finding-${fidx}`,
              })
            } else {
              out.push({
                n: out.length + 1,
                title: t,
                id: m.citationIds?.[i] ?? undefined,
              })
            }
          }
          for (let i = 0; i < stage.findings.length; i++) {
            if (!used.has(i)) {
              const f = stage.findings[i]
              out.push({
                n: out.length + 1,
                title: f.name ?? '',
                id: `stage-${stage.no}-finding-${i}`,
              })
            }
          }
          citations = out
        } else {
          citations = saved.map((t, i) => ({
            n: i + 1,
            title: t,
            id: m.citationIds?.[i] ?? undefined,
          }))
        }
      } else {
        citations = undefined
      }
      return {
        id: m.id,
        role: m.role,
        text: m.text,
        kind: m.kind,
        sectionStart,
        citations,
      }
    }

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
      if (m.role === 'assistant' && m.kind === 'progress') {
        const stage = stageSlotByResultLine(m.text)
        const isResult = isStageResultLine(m.text)
        const displayText = displayStageResult(m.text, stage)
        out.push({ ...entryToMessage(m, stage != null && isResult ? true : undefined), text: displayText })
      } else {
        out.push(entryToMessage(m))
      }
    }
    flushBuffer(true)
    return out
  })()

  const chatMessages = renumberCitations(rawChatMessages)

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
    if (s === 'PATH.md 내려받기') {
      onPreviewOpen?.()
      return
    }
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
    session.busy
      ? (() => {
          if (session.runActivity != null && session.runActivity.trim().length > 0) {
            const lastLine = session.runActivity.split('\n').filter((l) => l.trim().length > 0).at(-1)
            if (lastLine != null && lastLine.trim().length > 0) {
              return lastLine.trimEnd() + '…'
            }
          }
          const lastMsg = session.messages[session.messages.length - 1]
          switch (session.phase) {
            case 'interview':
              return '다음 질문을 고르는 중…'
            case 'skeleton':
              return '이 일이 보통 어떤 단계로 이뤄지는지 찾는 중…'
            case 'researching':
              return '단계마다 자료를 찾는 중…'
            case 'ready':
              if (lastMsg?.kind === 'node-explain') {
                return '노드를 설명할 말을 고르는 중…'
              }
              return '조사 문서에서 찾는 중…'
            default:
              return '준비하는 중…'
          }
        })()
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
        assistantMarkPlacement="trailing"
        showHeaderActions={false}
        scopeLabel={doneCount > 0 ? `소스 ${doneCount}개` : undefined}
        renderCitation={renderCitation}
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
  const { explainNode } = useFlow()
  const root = useMemo(() => mindmapTree(session), [session])

  const expandedIds = session.expandedIds?.length > 0 ? session.expandedIds : ['root']

  const handleNodeSelect = useCallback(
    (node: MindmapNode) => {
      if (node.id === 'root' || session.busy) {
        patch({ selectedId: null })
        return
      }
      const label = (node.data as { full?: string })?.full ?? node.label
      const m = node.id.match(/^s(\d+)/)
      if (m == null) return
      const stageIndex = parseInt(m[1], 10) - 1
      explainNode({ id: node.id, label }, stageIndex)
    },
    [session.busy, patch, explainNode],
  )

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
        onNodeSelect={handleNodeSelect}
        legend={<MindmapLegend />}
      />
    </div>
  )
}

function MindmapLegend() {
  const items = mindmapLegend()
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              color: item.color,
              backgroundColor: item.hollow ? 'transparent' : 'currentColor',
              boxShadow: item.hollow ? `0 0 0 1.5px currentColor inset` : undefined,
            }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

function CitationBadge({ citation, doc, bodyNode, open, onOpenChange, onOpen }: { citation: ChatCitation; doc: SourceDoc | null; bodyNode?: React.ReactNode | null; open: boolean; onOpenChange: (n: number | null) => void; onOpen: (id: string) => void }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | null>(null)
  const openedBy = useRef<'hover' | 'focus' | 'key' | null>(null)

  const [popoverSide, setPopoverSide] = useState<'bottom' | 'top'>('bottom')

  const constraint = useMemo(
    () => ({
      width: Math.min(28 * 16, window.innerWidth - 16),
      height: Math.min(32 * 16, Math.max(22 * 16, window.innerHeight - 24)),
    }),
    [],
  )

  useEffect(() => {
    if (!open) {
      setPopoverSide('bottom')
      return
    }
    if (triggerRef.current == null) return
    const recompute = () => {
      if (triggerRef.current == null) return
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - 8
      setPopoverSide(spaceBelow < constraint.height ? 'top' : 'bottom')
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [open, constraint.height])

  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || open) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    timer.current = window.setTimeout(() => {
      openedBy.current = 'hover'
      onOpenChange(citation.n)
    }, 120)
  }

  const onPointerLeave = () => {
    if (openedBy.current === 'key') return
    if (!open) {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
    } else {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      timer.current = window.setTimeout(() => {
        openedBy.current = null
        onOpenChange(null)
      }, 220)
    }
  }

  const onTriggerPointerEnter = () => {
    if (!open || openedBy.current === 'key') return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }

  const onFocus = () => {
    if (!open) {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      openedBy.current = 'focus'
      onOpenChange(citation.n)
    }
  }

  const onBlur = (e: React.FocusEvent) => {
    if (contentRef.current?.contains(e.relatedTarget as Node | null)) return
    if (openedBy.current === 'focus') {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      timer.current = window.setTimeout(() => {
        openedBy.current = null
        onOpenChange(null)
      }, 220)
    }
  }

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open && openedBy.current !== 'key') {
      e.preventDefault()
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      openedBy.current = 'key'
      contentRef.current?.querySelector<HTMLElement>('a,button')?.focus()
      return
    }
    if (!open) {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      openedBy.current = 'key'
    }
    if (doc) onOpen(doc.id)
    onOpenChange(citation.n)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
        if (!v) {
          openedBy.current = null
          onOpenChange(null)
        } else {
          openedBy.current = 'key'
          onOpenChange(citation.n)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-citation-badge={citation.n}
          aria-label={`${citation.n}: ${citation.title}`}
          className={cn(
            'ml-1 inline-flex shrink-0 items-center justify-center rounded-full bg-muted align-middle font-medium text-muted-foreground outline-none ring-ring ring-offset-1 ring-offset-background focus-visible:ring-2',
          )}
          style={{ width: 18, height: 18, fontSize: 10, lineHeight: '14px' }}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onFocus={onFocus}
          onBlur={onBlur}
          onMouseEnter={onTriggerPointerEnter}
          onClick={onClick}
        >
          {citation.n}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        side={popoverSide}
        sideOffset={8}
        collisionPadding={0}
        aria-labelledby="citation-popover-head"
        onPointerEnter={() => {
          if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
        }}
        onPointerLeave={() => {
          if (openedBy.current === 'hover') {
            if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
            timer.current = window.setTimeout(() => {
              openedBy.current = null
              onOpenChange(null)
            }, 220)
          }
        }}
        className="flex w-auto flex-col overflow-hidden rounded-lg border-0 bg-popover p-0 text-foreground shadow-md data-[state=open]:fade-in-80 data-[state=closed]:fade-out-80 data-[state=open]:duration-[140ms] data-[state=closed]:duration-[140ms]"
        style={{ width: constraint.width, height: constraint.height }}
      >
        <div
          id="citation-popover-head"
          data-citation-popover-head
          className="shrink-0 px-4 py-3 text-sm font-medium"
          onPointerEnter={() => {
            if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
          }}
          onPointerLeave={() => {
            if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
            timer.current = window.setTimeout(() => {
              openedBy.current = null
              onOpenChange(null)
            }, 220)
          }}
        >
          {citation.title}
        </div>
        <div
          data-citation-popover-body
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-4 text-base leading-6 outline-none [&>p]:mb-2"
          onPointerEnter={() => {
            if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
          }}
          onPointerLeave={() => {
            if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
            timer.current = window.setTimeout(() => {
              openedBy.current = null
              onOpenChange(null)
            }, 220)
          }}
        >
          {doc ? (
            <>
              <p className="text-sm text-muted-foreground">{doc.subtitle ?? '자료'}</p>
              <div className="mt-1 text-sm leading-relaxed">
                {bodyNode ?? (doc.evidence ?? doc.markdown)}
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{citation.title}</span>
          )}
        </div>
        {doc && (
          <div className="shrink-0 p-4">
            <button
              type="button"
              data-citation-show-source
              onClick={() => onOpen(doc.id)}
              className="text-sm text-foreground underline underline-offset-4 outline-none ring-ring ring-offset-2 ring-offset-popover hover:text-muted-foreground focus-visible:ring-2"
              onPointerEnter={() => {
                if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
              }}
              onPointerLeave={() => {
                if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null }
                timer.current = window.setTimeout(() => {
                  openedBy.current = null
                  onOpenChange(null)
                }, 220)
              }}
            >
              소스 보기
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function NewPathDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-md" data-new-dialog showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>새 패스를 열시겠어요?</DialogTitle>
          <DialogDescription>
            현재 패스는 목록에 남고 화면은 처음부터 시작합니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              취소
            </button>
          </DialogClose>
          <DialogClose asChild>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex items-center justify-center rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              새 패스 열기
            </button>
          </DialogClose>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  )
}

function ArchiveDialog({ open, onOpenChange, items, currentSessionId, onItemOpen, onRename, onDeleteAsk, deletingId, confirmDeleteSecond, onDeleteCancel, onDeleteConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: SavedRoadmap[]
  currentSessionId: string | null
  onItemOpen: (id: string) => void
  onRename: (id: string, next: string) => void
  onDeleteAsk: (id: string) => void
  deletingId: string | null
  confirmDeleteSecond: boolean
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="max-w-md" data-archive-dialog showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>내 패스 목록</DialogTitle>
          <DialogDescription className="sr-only">
            완주한 패스는 이 브라우저에 자동으로 보관됩니다. 골라서 열면 그 자리로 돌아갑니다.
            남은 횟수는 줄지 않아요. 제목을 누르면 고칠 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            보관된 패스가 아직 없습니다. 조사가 완주되면 여기에 쌓입니다.
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((item) => (
              <li key={item.id} className="border-t border-border pt-4 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <EditableText as="div" value={item.title} onChange={(next) => onRename(item.id, next)} className="font-medium text-foreground cursor-text" />
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {item.savedAt}
                      {' · '}
                      단계 {item.stageCount}개
                      {' · '}
                      자료 {item.findingCount}개
                      {item.session === currentSessionId ? (
                        <span className="ml-2 text-muted-foreground">지금 보는 중</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {item.session === currentSessionId ? (
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
                      >
                        닫기
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onItemOpen(item.id)}
                        className="text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
                      >
                        열기
                      </button>
                    )}
                    {confirmDeleteSecond && deletingId === item.id ? (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        이 패스를 지울까요
                        <button
                          type="button"
                          onClick={onDeleteConfirm}
                          className="text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
                        >
                          지우기
                        </button>
                        <button
                          type="button"
                          onClick={onDeleteCancel}
                          className="text-sm text-foreground underline underline-offset-2 hover:text-muted-foreground"
                        >
                          두기
                        </button>
                      </span>
                    ) : deletingId === item.id ? (
                      <button
                        type="button"
                        onClick={() => onDeleteAsk(item.id)}
                        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-muted-foreground"
                      >
                        이 패스를 지울까요
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppDialogContent>
    </Dialog>
  )
}
