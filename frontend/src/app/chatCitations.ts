import type { ChatMessage, ChatCitation } from '../components/chat-conversation-panel'
import type { ChatEntry } from '../state/types'

type AppChatMessage = ChatMessage & { kind?: ChatEntry['kind'] }

/**
 * 대화 안 말풍선 목록을 받아, 같은 자료를 가리키는 인용은 같은 번호를 쓰도록
 * 본문 `[n]` 마커와 배지 `n` 을 함께 다시 매긴다.
 *
 * - 자료 식별자가 있으면 그것으로 같은 자료를 찾는다.
 * - 식별자가 없으면 제목으로 찾는다.
 * - 처음 나온 차례대로 1부터 번호를 매긴다.
 * - 저장된 본문과 서버 응답은 바꾸지 않고, 새 말풍선 목록을 돌려 준다.
 * - 자료를 여는 데 쓰는 식별자(`id`)는 그대로 남긴다.
 */
export function renumberCitations(messages: AppChatMessage[]): AppChatMessage[] {
  // 1차: 자료 키 → 처음 나온 차례대로 매긴 새 번호
  // 키는 식별자(id)가 있으면 id, 없으면 제목으로 만든다. 다만 같은 제목의 자료가
  // 식별자 유무만 다르게 등장하면 같은 자료로 본다 — 그래서 제목 단위로 먼저 번호를
  // 매기고, 식별자는 여는 용도로만 남긴다.
  const titleToNewN = new Map<string, number>()
  let next = 1
  for (const m of messages) {
    if (m.citations == null) continue
    for (const c of m.citations) {
      const title = c.title
      if (!titleToNewN.has(title)) {
        titleToNewN.set(title, next)
        next += 1
      }
    }
  }

  // 인용이 하나도 없으면 그대로 돌려 보낸다.
  if (next === 1) return messages

  const out: AppChatMessage[] = []
  for (const m of messages) {
    if (m.citations == null || m.citations.length === 0) {
      out.push(m)
      continue
    }

    // 이 말풍선 안에서만 쓰는 옛 번호 → 새 번호 표
    const oldToNew = new Map<number, number>()
    for (const c of m.citations) {
      const title = c.title
      oldToNew.set(c.n, titleToNewN.get(title)!)
    }

    let text = m.text
    // 1단계: [oldN] 을 고유 표식으로 바꾼다 (새 번호가 다른 옛 번호와 겹쳐도 안전)
    for (const [oldN, newN] of oldToNew) {
      if (oldN === newN) continue
      const token = `\x00CIT${oldN}→${newN}\x00`
      text = text.replace(new RegExp(`\\[${oldN}\\]`, 'g'), token)
    }
    // 2단계: 표식을 [newN] 으로 되돌린다
    for (const [oldN, newN] of oldToNew) {
      if (oldN === newN) continue
      const token = `\x00CIT${oldN}→${newN}\x00`
      text = text.replace(new RegExp(token, 'g'), `[${newN}]`)
    }

    const citations = m.citations.map((c) => {
      const title = c.title
      return { ...c, n: titleToNewN.get(title)! }
    })

    out.push({ ...m, text, citations })
  }

  return out
}
