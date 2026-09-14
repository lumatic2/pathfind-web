import { useCallback, useRef } from 'react'

import { useSession } from './store'
import { grill, pathfind, runPool, type PoolItem } from '../lib/api'
import { consumeQuota, readQuota } from './quota'
import type { GrillResponse, GrillTurn, StageSlot } from './types'

let nextId = 1

function msgId(): string {
  return `msg-${nextId++}`
}

/** GrillTurn → api.grill의 history 행(답변 필드 제거) */
function questionMeta(turn: GrillTurn) {
  const { answer: _a, ...meta } = turn
  return meta
}

/** 단계 1개 조사 워커 — 아직 구현 없음, 서명만 둔다. */
async function runStage(index: number): Promise<void> {
  // TODO: stage 리서치 실행
}

/** runPool이 동시성 상한을 낮출 때 호출 — 아직 구현 없음. */
function onDegrade(_newConcurrency: number): void {
  // TODO: 상한 하향 처리
}

export function useFlow() {
  const { session, patch } = useSession()
  const sessionRef = useRef(session)
  sessionRef.current = session

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
        const items: PoolItem<number>[] = stages.map((_, i) => ({
          key: `stage-${i}`,
          payload: i,
        }))
        runPool({
          items,
          concurrency: 3,
          worker: (item) => runStage(item.payload),
          onDegrade,
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

  return { sendAnswer, approve, reviseSummary, startResearch }
}
