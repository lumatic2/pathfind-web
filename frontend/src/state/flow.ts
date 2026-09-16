import { useCallback, useRef } from 'react'

import { useSession } from './store'
import {
  chat,
  downloadText,
  explain,
  grill,
  handoff,
  pathfind,
  outline,
  runPool,
  stage,
  RateLimited,
  type ChatRequest,
  type PoolItem,
} from '../lib/api'
import { consumeQuota, readQuota } from './quota'
import { normalizeVerdict, channelTally, channelShort } from './derive'
import type { Finding, GrillChoice, GrillResponse, GrillTurn, StageSlot, Stage } from './types'

const CONCURRENCY = 3

let nextId = 1

function msgId(): string {
  return `msg-${nextId++}`
}

/** GrillTurn → api.grill의 history 행(답변 필드 제거) */
function questionMeta(turn: GrillTurn) {
  const { answer: _a, ...meta } = turn
  const exampleButtons:
    | string[]
    | { questionTitle: string; questionBody: string; suggestion: string; exampleButtons: string[]; }
    = Array.isArray(meta.exampleButtons)
      ? meta.exampleButtons.map((b) =>
          typeof b === 'string' ? b : (b as GrillChoice).label
        )
      : []
  return { ...meta, exampleButtons }
}

export function useFlow() {
  const { session, patch } = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session
  const generationRef = useRef(0)
  const retryingRef = useRef(false)

  /** 상한이 1로 내려갈 때 한 번만 불린다. degraded를 남기고 강등 말풍선을 붙인다. */
  const onDegrade = useCallback((_newConcurrency: number) => {
    patch({
      degraded: true,
      messages: [
        ...sessionRef.current.messages,
        {
          id: msgId(),
          role: 'assistant',
          text: '요청이 몰려 한 번에 하나씩 조사합니다. 조금 느려도 결과는 그대로 쌓입니다.',
          kind: 'progress',
          suggestions: [],
        },
      ],
    })
  }, [patch])

  /** 단계 1개 조사. 요약·슬롯을 갱신하고 결과 줄을 진행한다. */
  async function runStage(index: number, summary: string, currentStage: Stage, gen: number): Promise<void> {
    if (generationRef.current !== gen) return
    const latest = sessionRef.current
    const slot = latest.stages[index]
    if (slot == null) return

    // 1) status → running + 마지막 활동 줄
    patch({
      stages: latest.stages.map((s, i) => (i === index ? { ...s, status: 'running' as const } : s)),
      runActivity: `${index + 1}. ${currentStage.title} 자료를 찾는 중…`,
    })

    // 2) 서버 호출 (6분 타임아웃은 api.stage의 기본값과 같다)
    let res: Awaited<ReturnType<typeof stage>>
    try {
      res = await stage({ stageIndex: index, stage: currentStage, summary })
    } catch (err) {
      if (err instanceof RateLimited) throw err
      const message =
        err instanceof Error
          ? err.message
          : '이 단계는 자료를 못 찾았습니다. 나머지는 계속합니다.'
      patch({
        stages: latest.stages.map((s, i) =>
          i === index ? { ...s, status: 'failed' as const, error: message } : s,
        ),
        messages: [
          ...latest.messages,
          {
            id: msgId(),
            role: 'assistant',
            text: message,
            kind: 'progress',
            suggestions: [],
          },
        ],
      })
      return
    }

    // 3) 판정 정규화
    const verdict = normalizeVerdict(res.stage.verdict)

    // 4) findings 정리
    const rawFindings: unknown = res.stage.findings
    const findings: Finding[] =
      Array.isArray(rawFindings)
        ? rawFindings.filter((f): f is Finding => typeof f !== 'string') as Finding[]
        : []

    // 5) 원본 유지 필드만 남기고 나머지 교체
    const kept: Stage = {
      no: currentStage.no,
      title: currentStage.title,
      desc: currentStage.desc,
      icon: currentStage.icon,
      tasks: currentStage.tasks,
      choices: currentStage.choices,
    }
    const merged: Stage = {
      ...res.stage,
      ...kept,
      verdict,
      findings,
    }

    // 6) 슬롯 상태 done, stage 교체
    const nextStages = latest.stages.map((s, i) =>
      i === index ? { ...s, status: 'done' as const, stage: merged } : s,
    )
    patch({ stages: nextStages })

    // 7) 이 단계만 outline 불러서 채운다 (빈 배열이면 필드를 두지 않고, 실패해도 done 유지)
    outline({ stage: merged, summary })
      .then((res) => {
        if (res.topics.length > 0) {
          patch({
            stages: sessionRef.current.stages.map((s, i) =>
              i === index ? { ...s, outline: res.topics } : s,
            ),
          })
        } else {
          // 빈 배열이면 필드를 아예 두지 않는다
          patch({
            stages: sessionRef.current.stages.map((s, i) =>
              i === index ? { ...s, outline: undefined } : s,
            ),
          })
        }
      })
      .catch(() => {
        // 실패해도 단계 상태는 done 그대로
      })

    // 8) 결과 줄 (kind progress) — 미리 깔아둔 stage-result-${index} 자리를 덮는다
    const citationTitles = findings.map((f) => (typeof f === 'object' && f != null ? (f as { name?: string }).name ?? '' : ''))
    const citationIds = findings.map((_f, i) => `stage-${currentStage.no}-finding-${i}`)
    const markerSuffix =
      findings.length > 0 ? ` [${findings.map((_f, i) => i + 1).join('][')}]` : ''
    const tally = channelTally(findings)
    const tallySuffix = tally.length > 0
      ? ` (${tally.map((t) => `${channelShort[t.channel]} ${t.count}`).join('·')})`
      : ''
    const text = `${index + 1}. ${merged.title}\n\n**${verdict}**${tallySuffix}${markerSuffix}`

    const placeholderId = `stage-result-${index}`
    const currentMessages = sessionRef.current.messages
    const existingIdx = currentMessages.findIndex((m) => m.id === placeholderId)

    if (existingIdx >= 0) {
      const nextMessages = [...currentMessages]
      nextMessages[existingIdx] = {
        id: placeholderId,
        role: 'assistant',
        text,
        kind: 'progress',
        suggestions: [],
        citationTitles,
        citationIds,
      }
      patch({ messages: nextMessages })
    } else {
      patch({
        messages: [
          ...currentMessages,
          {
            id: placeholderId,
            role: 'assistant',
            text,
            kind: 'progress',
            suggestions: [],
            citationTitles,
            citationIds,
          },
        ],
      })
    }
  }

  const sendAnswer = useCallback(
    (text: string) => {
      const current = sessionRef.current

      // phase가 ready이면 입력 무시
      if (current.phase === 'ready') return

      // 1) 사용자 말풍선 먼저 붙이고 busy true, error null
      patch({
        messages: [
          ...current.messages,
          {
            id: msgId(),
            role: 'user',
            text,
            kind: 'chat',
            suggestions: [],
          },
        ],
        busy: true,
        error: null,
      })

      // 2) api.grill 호출
      const body: Parameters<typeof grill>[0] = {
        history: current.history.map(questionMeta),
        turnCount: current.turnCount,
      }
      if (current.turnCount === 0) {
        body.question = text
      } else {
        body.answer = text
      }

      grill(body)
        .then((res: GrillResponse) => {
          if (!res.done) {
            // 이전 pending + 이번 answer 로 한 줄 완성
            const completed: GrillTurn = current.pending
              ? {
                  questionTitle: current.pending.questionTitle,
                  questionBody: current.pending.questionBody,
                  suggestion: current.pending.suggestion,
                  exampleButtons: current.pending.exampleButtons,
                  answer: text,
                }
              : {
                  questionTitle: res.questionTitle,
                  questionBody: res.questionBody,
                  suggestion: res.suggestion,
                  exampleButtons: res.exampleButtons,
                  answer: text,
                }

            const questionText = [
              res.questionTitle,
              res.questionBody,
              `추천: ${res.suggestion}`,
            ].join('\n\n')

            const latest = sessionRef.current
            patch({
              messages: [
                ...latest.messages,
                {
                  id: msgId(),
                  role: 'assistant',
                  text: questionText,
                  kind: 'question',
                  suggestions: res.exampleButtons ?? [],
                },
              ],
              history: [...latest.history, completed],
              pending: res,
              turnCount: res.turnCount,
            })
          } else {
            const remaining = readQuota().remaining
            const chipConfirm =
              remaining > 0
                ? {
                    label: "맞아요, 이대로 조사해 주세요",
                    note: "패스 1회 소진",
                  }
                : null
            const chipEdit = {
              label: "고칠 게 있어요",
              note: "요약·큰 그림 수정",
            }

            const approvalSuggestions: string[] = [
              ...(chipConfirm ? [chipConfirm.label] : []),
              chipEdit.label,
              "직접 입력",
            ]

            const guidanceLine = remaining > 0
              ? `이렇게 이해했습니다. 맞나요?\n\n${res.summary}\n\n이러면 조사를 시작할까요?\n\n**남은 ${remaining}회 중 1회를 씁니다.**`
              : `이렇게 이해했습니다. 맞나요?\n\n${res.summary}\n\n**패스 2회를 모두 쓰셨습니다.**\n만든 패스는 계속 보실 수 있고, 마인드맵과 PATH.md도 그대로 내려받을 수 있어요.`

            const latest = sessionRef.current
            patch({
              messages: [
                ...latest.messages,
                {
                  id: msgId(),
                  role: "assistant",
                  text: guidanceLine,
                  kind: "summary-approval",
                  suggestions: approvalSuggestions,
                },
              ],
              summary: res.summary ?? "",
              phase: "confirm",
              busy: false,
            })
          }
        })
        .catch(() => {
          patch({
            error: '잠시 문제가 있었습니다. 다시 시도해 주세요.',
            busy: false,
          })
        })
    },
    [patch],
  )

  const approve = useCallback(() => {
    const current = sessionRef.current
    if (current.phase !== "confirm") return
    if (current.pending == null) return
    if (readQuota().remaining === 0) return

    const existingAttempt = current.planningAttempt
    if (existingAttempt == null || !existingAttempt.approved || existingAttempt.summary !== current.summary) {
      consumeQuota()
    }
    patch({
      phase: "skeleton",
      pending: null,
      planningAttempt: {
        approved: true,
        summary: current.summary,
        status: "pending",
      },
    })
    startResearch()
  }, [patch])

  const reviseSummary = useCallback(() => {
    const current = sessionRef.current
    patch({
      messages: [
        ...current.messages,
        {
          id: msgId(),
          role: "user",
          text: "고칠 게 있어요",
          kind: "chat",
          suggestions: [],
        },
        {
          id: msgId(),
          role: "assistant",
          text: "어디를 고칠까요? 바꿀 내용을 적어 주세요.",
          kind: "question",
          suggestions: [],
        },
      ],
      phase: "interview",
      pending: null,
      planningAttempt: undefined,
    })
  }, [patch])

  const retry = useCallback(() => {
    const current = sessionRef.current
    if (current.phase === 'skeleton') {
      patch({ error: '새 패스가 만들어지는 중입니다. 잠시 기다려 주세요.' })
      return
    }
    if (current.phase === 'confirm' && current.planningAttempt?.status === 'failed') {
      if (retryingRef.current) return
      retryingRef.current = true
      startResearch()
      return
    }
    const failedOrPending = current.stages.find((s) => s.status === 'failed' || s.status === 'pending')
    if (failedOrPending == null) return
    patch({ error: null })
    const idx = current.stages.indexOf(failedOrPending)
    if (idx < 0) return
    const gen = generationRef.current
    runStage(idx, current.summary, failedOrPending.stage, gen)
  }, [patch])

  /** 완주 말풍선 텍스트. startResearch 완료 핸들러와 resumeResearch 완료 핸들러가 공유한다. */
  function buildCompletionText(completed: ReturnType<typeof useSession>['session']): string {
    const failedCount = completed.stages.filter((s) => s.status === 'failed').length
    return failedCount === 0
      ? `🧰 조사를 마쳤습니다! 오른쪽 마인드맵에서 궁금한 것을 누르면 설명해 드려요.`
      : `🧰 조사를 마쳤습니다! 전체 슬롯 수에서 실패 수를 뺀 개수만큼 단계가 채워졌고 실패 수만큼은 자료를 못 찾았습니다(둘 다 굵게). 오른쪽 마인드맵에서 노드를 누르면 설명해 드려요.`
  }

  const startResearch = useCallback(() => {
    const current = sessionRef.current

    // 캡처한 세대가 여전히 현재인지 확인. 새 요청이 시작돼 세대가 바뀌었으면 이 요청은 무효다.
    const gen = ++generationRef.current
    patch({
      messages: [
        ...current.messages,
        {
          id: msgId(),
          role: 'user',
          text: "맞아요, 이대로 조사해 주세요",
          kind: 'chat',
          suggestions: [],
        },
        {
          id: msgId(),
          role: 'assistant',
          text: current.pending?.opening ?? '먼저 이 일이 보통 어떤 단계로 이뤄지는지 알아봅니다.',
          kind: 'progress',
          suggestions: [],
        },
      ],
      busy: true,
      phase: 'skeleton',
      error: null,
    })

    // 2) 큰 그림 + 단계 골격 요청
    pathfind({ summary: current.summary })
      .then((res) => {
        // 마지막 시작 세대가 아니면 이 응답을 처리하지 않는다
        if (generationRef.current !== gen) return
        // 응답 검사: 큰 그림과 단계 목록이 있어야 골격을 만든다
        if (res.bigPicture == null || !Array.isArray(res.bigPicture.stages) || res.bigPicture.stages.length === 0) {
          patch({
            planningAttempt: current.planningAttempt != null
              ? { ...current.planningAttempt, status: "failed" }
              : { approved: true, summary: current.summary, status: "failed" },
            busy: false,
            phase: "confirm",
            error: "조사 큰 그림을 가져오지 못했습니다.",
          })
          return
        }

        // 같은 승인으로 다시 조사한 것이면 횟수를 또 빼지 않도록 승인 기록을 성공으로 남긴다
        patch({
          planningAttempt: current.planningAttempt != null
            ? { ...current.planningAttempt, status: "succeeded" }
            : { approved: true, summary: current.summary, status: "succeeded" },
        })

        // 골격을 만드는 부분은 상태를 다시 읽지 않고 응답에서 바로 만든다
        const stages: StageSlot[] = res.bigPicture.stages.map((stage) => ({
          status: 'pending',
          stage,
        }))

        const n = stages.length

        // 3) 진행 말풍선: intro + 조사 참고 요약·제안 이유·한계 + 단계 n개 + 단계 목록
        const afterPathfind = sessionRef.current
        const stageListLines = stages.map((s, i) => {
          const desc = s.stage.desc ?? ''
          return `- ${i + 1}. ${s.stage.title}${desc ? ` · ${desc}` : ''}`
        }).join('\n')
        const planning = res.bigPicture.planning
        const hasMaterials = planning != null &&
          (planning.sources.length > 0 || planning.researchNotes.length > 0)
        const msgParts: string[] = [
          res.bigPicture.intro,
          '',
          `단계를 ${n}개로 나눴습니다. 이제 단계마다 자료를 찾습니다.`,
        ]
        if (planning?.basisSummary?.trim()) {
          msgParts.push(planning.basisSummary.trim().slice(0, 400))
        }
        if (hasMaterials) {
          if (planning?.warnings?.length) {
            msgParts.push(planning.warnings[0].trim().slice(0, 180))
          }
        } else {
          msgParts.push(
            '참고한 자료나 조사 메모가 없어 인터뷰 기반 초안입니다. 자세한 내용은 왼쪽 문서를 열어 확인하세요.',
          )
        }
        msgParts.push('', stageListLines)
        patch({
          messages: [
            ...afterPathfind.messages,
            {
              id: msgId(),
              role: 'assistant',
              text: msgParts.join('\n'),
              kind: 'progress',
              suggestions: [],
            },
          ],
          bigPicture: res.bigPicture,
          stages,
          phase: 'researching',
          expandedIds: ['root'],
          researchPath: 'local',
        })

        const afterSkeleton = sessionRef.current

        // 5) 단계 결과 자리 표시: 단계 수만큼 stage-result-${i} 진행 말풍선을 미리 깐다
        const placeholderMessages: typeof afterSkeleton.messages = stages.map((s, i) => ({
          id: `stage-result-${i}`,
          role: 'assistant',
          text: `${i + 1}. ${s.stage.title}\n\n자료를 찾는 중…`,
          kind: 'progress',
          suggestions: [],
        }))
        patch({
          messages: [...afterSkeleton.messages, ...placeholderMessages],
        })

        // 6) 단계 조사 풀 실행
        const items: PoolItem<number>[] = stages.map((s, i) => ({
          key: `stage-${i}`,
          payload: i,
        }))
        runPool({
          items,
          concurrency: CONCURRENCY,
          worker: (item) =>
            runStage(item.payload, current.summary, stages[item.payload].stage, gen),
          onDegrade,
        }).then(() => {
          // startResearch가 출발시킨 세대가 아니면 완료 단계를 건너뛰고 정리만 한다
          if (generationRef.current !== gen) {
            retryingRef.current = false
            return
          }
          const completed = sessionRef.current
          patch({
            messages: [
              ...completed.messages,
              {
                id: msgId(),
                role: 'assistant',
                text: buildCompletionText(completed),
                kind: 'progress',
                suggestions: [],
              },
            ],
            busy: false,
            phase: 'ready',
            selectedId: null,
          })
        })
      })
      .catch((err) => {
        retryingRef.current = false
        // pathfind 실패 → 승인 카드로 되돌림 (횟수는 되돌리지 않음)
        patch({
          planningAttempt: current.planningAttempt != null
            ? { ...current.planningAttempt, status: "failed" }
            : { approved: true, summary: current.summary, status: "failed" },
          busy: false,
          phase: "confirm",
          error:
            err instanceof Error
              ? err.message
              : "조사 큰 그림을 가져오지 못했습니다.",
        })
      })
  }, [patch])

  /** 새로고침으로 끊긴 조사를 이어 받는다. 복원 규칙이 phase를 researching으로 만든 뒤에만 유효하다. */
  const resumeResearch = useCallback(() => {
    const current = sessionRef.current
    const gen = generationRef.current

    // busy이거나 phase가 researching이 아니면 아무것도 하지 않는다
    if (current.busy || current.phase !== 'researching') return

    // 남은 슬롯: status가 done이 아닌 것들
    const remaining = current.stages.filter((s) => s.status !== 'done')

    if (remaining.length === 0) {
      // 남은 단계가 없으면 phase만 ready로 바꾼다
      patch({ phase: 'ready' })
      return
    }

    // 뒤에 남은 단계 수를 붙인 진행 말풍선을 붙이고 이어서 조사한다
    const remainingCount = remaining.length
    patch({
      messages: [
        ...current.messages,
        {
          id: msgId(),
          role: 'assistant',
          text: `이어서 조사합니다. ${remainingCount}개 단계가 남아 있습니다.`,
          kind: 'progress',
          suggestions: [],
        },
      ],
      busy: true,
      error: null,
    })

    const items: PoolItem<number>[] = remaining.map((s, i) => ({
      key: `resume-${i}`,
      payload: current.stages.indexOf(s),
    }))

    runPool({
      items,
      concurrency: CONCURRENCY,
      worker: (item) =>
        runStage(item.payload, current.summary, current.stages[item.payload].stage, gen),
      onDegrade,
    }).then(() => {
      // resumeResearch가 불을 붙인 세대가 아니면 완료 핸들러를 건너뛴다
      if (generationRef.current !== gen) return
      const completed = sessionRef.current
      patch({
        messages: [
          ...completed.messages,
          {
            id: msgId(),
            role: 'assistant',
            text: buildCompletionText(completed),
            kind: 'progress',
            suggestions: [],
          },
        ],
        busy: false,
        phase: 'ready',
        selectedId: null,
      })
      // 단계가 모두 끝난 뒤 빠진 outline을 채운다
      fillMissingOutlines()
    })
  }, [patch])

  /** phase가 ready이고 busy가 아닐 때, done이고 outline이 없는 단계 중
   *  항목이 3개 이상인 것만 하나씩 outlines를 채운다.
   *  빈 결과를 받은 단계는 outline: []로 표시해 재호출을 막는다.
   */
  function fillMissingOutlines() {
    const current = sessionRef.current
    if (current.phase !== 'ready' || current.busy) return

    const pending = current.stages
      .map((slot, index) => ({ slot, index }))
      .filter(
        ({ slot }) =>
          slot.status === 'done' &&
          slot.outline === undefined &&
          (slot.stage.findings?.length ?? 0) +
            (slot.stage.tasks?.length ?? 0) +
            (slot.stage.todos?.length ?? 0) >=
            3,
      )

    if (pending.length === 0) return

    // 한 번에 하나씩만 채운다
    const item = pending[0]
    outline({ stage: item.slot.stage, summary: current.summary })
      .then((res) => {
        if (res.topics.length > 0) {
          patch({
            stages: sessionRef.current.stages.map((s, i) =>
              i === item.index ? { ...s, outline: res.topics } : s,
            ),
          })
        } else {
          // 빈 결과 — outline: [] 로 표시해서 다시 묻지 않는다
          patch({
            stages: sessionRef.current.stages.map((s, i) =>
              i === item.index ? { ...s, outline: [] } : s,
            ),
          })
        }
      })
      .catch(() => {
        // 실패해도 이 단계에서는 더 채우지 않는다 (다음 새로고침에서 재시도)
      })
      .finally(() => {
        // 하나를 처리했으니 나머지도 채운다
        fillMissingOutlines()
      })
  }

  const sendChat = useCallback(
    (text: string) => {
      const current = sessionRef.current

      if (current.phase !== 'ready') return

      const history: ChatRequest['history'] = [
        ...current.messages
          .filter((m) => m.kind === 'chat' || m.kind === 'node-explain')
          .map((m) => ({ role: m.role, text: m.text, kind: m.kind })),
        { role: 'user', text, kind: 'chat' },
      ]

      patch({
        messages: [
          ...current.messages,
          {
            id: msgId(),
            role: 'user',
            text,
            kind: 'chat',
            suggestions: [],
          },
        ],
        busy: true,
        error: null,
      })

      chat({
        summary: current.summary,
        bigPicture: current.bigPicture ?? undefined,
        stages: current.stages.map((s) => s.stage),
        history,
      })
        .then((res) => {
          const latest = sessionRef.current
          const followupChips: string[] =
            res.followups.length > 0
              ? res.followups
              : ['이 패스에서 먼저 할 일은', '직접 만들 것만 순서대로 정리해 줘', 'PATH.md 내려받기']

          patch({
            messages: [
              ...latest.messages,
              {
                id: msgId(),
                role: 'assistant',
                text: res.answer,
                kind: 'chat',
                citationTitles: res.citationTitles,
                citationIds: res.citationIds,
                suggestions: [...followupChips, '직접 입력'],
              },
            ],
            busy: false,
          })
        })
        .catch(() => {
          patch({
            error: '잠시 문제가 있었습니다. 다시 시도해 주세요.',
            busy: false,
          })
        })
    },
    [patch],
  )

  const explainNode = useCallback(
    (node: { id: string; label: string }, stageIndex: number) => {
      const current = sessionRef.current
      if (current.busy) return

      // 단계 번호로 슬롯을 찾는다. 뿌리처럼 단계가 없으면 stage는 null.
      const slot = current.stages[stageIndex]
      const stage = slot?.stage ?? null

      // 사용자 말풍선: 라벨을 따옴표로 감싸고 "이 뭔가요"를 붙인다.
      patch({
        messages: [
          ...current.messages,
          {
            id: msgId(),
            role: 'user',
            text: `"${node.label}"이 뭔가요`,
            kind: 'chat',
            suggestions: [],
          },
        ],
        busy: true,
        selectedId: node.id,
        error: null,
      })

      explain({ node, stage, summary: current.summary })
        .then((res) => {
          patch({
            messages: [
              ...sessionRef.current.messages,
              {
                id: msgId(),
                role: 'assistant',
                text: res.explanation,
                kind: 'node-explain',
                citationTitles: res.citationTitles,
                suggestions: res.followups,
              },
            ],
            busy: false,
            selectedId: null,
          })
        })
        .catch(() => {
          patch({
            error: '노드 설명을 가져오지 못했습니다.',
            busy: false,
            selectedId: null,
          })
        })
    },
    [patch],
  )

  const downloadRoadmap = useCallback(() => {
    const current = sessionRef.current
    if (current.bigPicture == null) return
    handoff({
      bigPicture: current.bigPicture,
      stages: current.stages.map((s) => s.stage),
      summary: current.summary,
    }).then((res) => {
      downloadText('ROADMAP.md', res.handoffMarkdown)
    })
  }, [patch])

  const buildRoadmap = useCallback(() => {
    const current = sessionRef.current
    if (current.bigPicture == null || current.exportState.busy) return

    patch({
      exportState: { ...current.exportState, busy: true, title: null, roadmapMarkdown: null },
    })

    handoff({
      bigPicture: current.bigPicture,
      stages: current.stages
        .filter((s) => s.status === 'done')
        .map((s) => s.stage),
      summary: current.summary,
    })
      .then((res) => {
        if (!res.handoffMarkdown.startsWith('#')) {
          patch({
            exportState: {
              roadmapMarkdown: null,
              title: current.exportState.title,
              busy: false,
            },
            error: 'PATH.md를 만들지 못했습니다. 다시 시도해 주세요.',
          })
          return
        }
        patch({
          exportState: {
            roadmapMarkdown: res.handoffMarkdown,
            title: res.title ?? current.exportState.title,
            busy: false,
          },
          error: null,
        })
      })
      .catch(() => {
        patch({
          exportState: {
            roadmapMarkdown: null,
            title: current.exportState.title,
            busy: false,
          },
          error: 'PATH.md를 만들지 못했습니다. 다시 시도해 주세요.',
        })
      })
  }, [patch])

  return {
    sendAnswer,
    approve,
    reviseSummary,
    startResearch,
    retry,
    resumeResearch,
    fillMissingOutlines,
    sendChat,
    explainNode,
    downloadRoadmap,
    buildRoadmap,
  }
}
