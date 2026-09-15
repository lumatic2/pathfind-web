import type { ChatEntry } from '../state/types'

/** 접기 기준이 되는 진행 줄 종류 판별 */

/** 결과 줄: "N. 제목\n\n**판정** …" 형태 */
export function isResultLine(line: string): boolean {
  if (!/^\d+\.\s/.test(line)) return false
  return /^\d+\.\s.+\n\n\*\*.+\*\*/.test(line)
}

/** 사건 줄: 본문에 아래 문구 중 하나가 들어 있는 줄 */
const EVENT_PHRASES = [
  '조사를 마쳤습니다',
  '단계마다 직접 웹을 찾습니다',
  '이 창을 열어 두시면 끝까지 진행됩니다',
  '요청이 몰려',
  '자료를 못 찾았습니다',
  '이어서 조사합니다',
  '다시 붙었습니다',
  '결과를 읽지 못해 다시 조사합니다',
  '연결이 끊겨 이어서 조사합니다',
  '오래 걸리는 단계',
  '단계로 이뤄지는지',
  '단계로 나눴습니다',
] as const

export function isEventLine(text: string): boolean {
  return EVENT_PHRASES.some((p) => text.includes(p))
}

/** 접을 줄 판별 */
export function isFoldLine(entry: ChatEntry): boolean {
  if (entry.role !== 'assistant') return false
  if (entry.id && entry.id.startsWith('stage-result-')) return false
  if (entry.kind === 'question') return false
  if (entry.kind === 'summary-approval') return false
  if (isResultLine(entry.text)) return false
  if (isEventLine(entry.text)) return false
  // 인용이 없는 assistant progress만 접음
  if (entry.kind === 'progress' && !entry.citationTitles?.length) return true
  return false
}

/** 검색 줄 판별: 본문에 '로 찾는 중', '찾는 중', '실행 중' 포함 */
const SEARCH_MARKERS = ['로 찾는 중', '찾는 중', '실행 중'] as const
export function isSearchLine(text: string): boolean {
  return SEARCH_MARKERS.some((m) => text.includes(m))
}
