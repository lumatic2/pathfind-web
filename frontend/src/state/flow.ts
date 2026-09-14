import { useCallback, useRef } from 'react'

import { useSession } from './store'
import { grill } from '../lib/api'
import { consumeQuota, readQuota } from './quota'
import type { GrillResponse, GrillTurn } from './types'

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
    patch({ phase: "skeleton" })
  }, [patch])

  return { sendAnswer, approve, reviseSummary, startResearch }
}
