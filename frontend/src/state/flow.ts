import { useCallback, useRef } from 'react'

import { useSession } from './store'
import { grill } from '../lib/api'
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
            patch({
              messages: [
                ...sessionRef.current.messages,
                {
                  id: msgId(),
                  role: 'assistant',
                  text: res.summary ?? '',
                  kind: 'summary-approval',
                  suggestions: [],
                },
              ],
              summary: res.summary ?? '',
              phase: 'confirm',
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

  return { sendAnswer }
}
