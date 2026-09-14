import { useCallback, useRef } from 'react'

import { useSession } from './store'
import {
  grill,
  pathfind,
  outline,
  runPool,
  stage,
  RateLimited,
  type PoolItem,
} from '../lib/api'
import { consumeQuota, readQuota } from './quota'
import { normalizeVerdict, channelTally, channelShort } from './derive'
import type { Finding, GrillResponse, GrillTurn, StageSlot, Stage } from './types'

let nextId = 1

function msgId(): string {
  return `msg-${nextId++}`
}

/** GrillTurn → api.grill의 history 행(답변 필드 제거) */
function questionMeta(turn: GrillTurn) {
  const { answer: _a, ...meta } = turn
  return meta
}


export function useFlow() {
  const { session, patch } = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session

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
  async function runStage(index: number, summary: string, currentStage: Stage): Promise<void> {
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

    // 8) 결과 줄 (kind progress)
    const top = findings.slice(0, 3)
    const citationTitles = top.map((f) => (typeof f === 'object' && f != null ? (f as { name?: string }).name ?? '' : ''))
    const citationIds = top.map((_f, i) => `stage-${index}-finding-${i}`)
    const markerSuffix =
      top.length > 0 ? ` [${top.map((_f, i) => i + 1).join(', ')}]` : ''
    const tally = channelTally(findings)
    const tallySuffix = tally.length > 0
      ? ` (${tally.map((t) => `${channelShort[t.channel]} ${t.count}`).join('·')})`
      : ''
    const text = `${index + 1}. ${merged.title}\n\n**${verdict}**${tallySuffix}${markerSuffix}`

    patch({
      messages: [
        ...latest.messages,
        {
          id: msgId(),
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
                    note: "로드맵 1회 소진",
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
              : `이렇게 이해했습니다. 맞나요?\n\n${res.summary}\n\n**로드맵 2회를 모두 쓰셨습니다.**\n만든 로드맵은 계속 보실 수 있고, 마인드맵과 ROADMAP.md도 그대로 내려받을 수 있어요.`

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

    consumeQuota()
    patch({
      phase: "skeleton",
      pending: null,
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
    })
  }, [patch])

  const retry = useCallback(() => {
    const current = sessionRef.current
    const failedOrPending = current.stages.find((s) => s.status === 'failed' || s.status === 'pending')
    if (failedOrPending == null) return
    patch({ error: null })
    const idx = current.stages.indexOf(failedOrPending)
    if (idx < 0) return
    runStage(idx, current.summary, failedOrPending.stage)
  }, [patch])

  /** 완주 말풍선 텍스트. startResearch 완료 핸들러와 resumeResearch 완료 핸들러가 공유한다. */
  function buildCompletionText(completed: ReturnType<typeof useSession>['session']): string {
    const failedCount = completed.stages.filter((s) => s.status === 'failed').length
    return failedCount === 0
      ? `조사를 마쳤습니다. 오른쪽 마인드맵에서 노드를 누르면(굵게) 제가 그 노드를 설명해 드립니다.`
      : `조사를 마쳤습니다. 전체 슬롯 수에서 실패 수를 뺀 개수만큼 단계가 채워졌고 실패 수만큼은 자료를 못 찾았습니다(둘 다 굵게). 오른쪽 마인드맵에서 노드를 누르면 설명해 드립니다.`
  }

  const startResearch = useCallback(() => {
    const current = sessionRef.current

    // 1) 사용자 확인 말풍선 + 진행 말풍선 + 상태
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
          text: '먼저 이 일이 보통 어떤 단계로 이뤄지는지 알아봅니다.',
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
        // 골격을 만드는 부분은 상태를 다시 읽지 않고 응답에서 바로 만든다
        const stages: StageSlot[] = res.bigPicture.stages.map((stage) => ({
          status: 'pending',
          stage,
        }))

        const n = stages.length

        // 3) 진행 말풍선: bigPicture.intro + 단계 n개
        const afterPathfind = sessionRef.current
        patch({
          messages: [
            ...afterPathfind.messages,
            {
              id: msgId(),
              role: 'assistant',
              text: [res.bigPicture.intro, '', `단계를 ${n}개로 나눴습니다. 이제 단계마다 자료를 찾습니다.`].join(
                '\n',
              ),
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

        // 4) 진행 말풍선: 기본 경로 안내
        const afterSkeleton = sessionRef.current
        patch({
          messages: [
            ...afterSkeleton.messages,
            {
              id: msgId(),
              role: 'assistant',
              text: '지금은 기본 경로로 조사합니다. 이 창을 열어 두시면 끝까지 진행됩니다.',
              kind: 'progress',
              suggestions: [],
            },
          ],
        })

        // 5) 단계 조사 풀 실행
        const items: PoolItem<number>[] = stages.map((s, i) => ({
          key: `stage-${i}`,
          payload: i,
        }))
        runPool({
          items,
          concurrency: 3,
          worker: (item) =>
            runStage(item.payload, current.summary, stages[item.payload].stage),
          onDegrade,
        }).then(() => {
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
        // pathfind 실패 → 승인 카드로 되돌림 (횟수는 되돌리지 않음)
        patch({
          busy: false,
          phase: 'confirm',
          error:
            err instanceof Error
              ? err.message
              : '조사 큰 그림을 가져오지 못했습니다.',
        })
      })
  }, [patch])

  /** 새로고침으로 끊긴 조사를 이어 받는다. 복원 규칙이 phase를 researching으로 만든 뒤에만 유효하다. */
  const resumeResearch = useCallback(() => {
    const current = sessionRef.current

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
      concurrency: 3,
      worker: (item) =>
        runStage(item.payload, current.summary, current.stages[item.payload].stage),
      onDegrade,
    }).then(() => {
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

  return { sendAnswer, approve, reviseSummary, startResearch, retry, resumeResearch, fillMissingOutlines }
}
