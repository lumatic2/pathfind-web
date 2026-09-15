// /api/_lib/citation-marks — 본문 인용 번호를 최종 자료 순서로 다시 매김
// 계약: models가 고른 원래 자료 순서(originalFindings)와 최종 선정 자료를 id로 대조해
// 본문 속 [n] 마크를 새 번호로 바꾸거나, 버려진 자료 마크는 뺀다.
// 같은 자료의 번호는 같이 바뀌고, 인용 표시 바깥 글자는 건드리지 않는다.

/**
 * @param {string} body         - composeReason 등으로 만든 본문
 * @param {Array}  finalFindings - 최종 선정 자료 배열 (id, name 등)
 * @param {object} fieldsByMark  - { "[n]": { id, name, ... } } 본문 마크→원자료 정보
 * @returns {string} 다시 매겨진 본문
 */
export function renumberBody(body, finalFindings, fieldsByMark) {
  if (!body || typeof body !== 'string') return '';
  if (!finalFindings || !fieldsByMark) return body;

  const finalIds = new Set(finalFindings.map((f) => f.id));

  // 유지할 마크 → 원자료 id / 제거할 마크 목록
  const keptMarkToId = new Map();
  const removeMarks = [];
  for (const [mark, info] of Object.entries(fieldsByMark)) {
    if (!info || !info.id) continue;
    if (finalIds.has(info.id)) keptMarkToId.set(mark, info.id);
    else removeMarks.push(mark);
  }

  // 최종 자료 배열 순서 → 새 번호 (1부터)
  const idToNewNum = new Map();
  finalFindings.forEach((f, idx) => {
    if (f.id) idToNewNum.set(f.id, idx + 1);
  });

  let out = body;

  // 1) 버릴 마크를 먼저 제거
  for (const mark of removeMarks) {
    const escaped = mark.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'g'), '');
  }

  // 2) 유지 마크를 새 번호로 한 번에 치환 — 유지 마크끼리 서로의 치환 결과가 간섭하지 않게
  if (keptMarkToId.size > 0) {
    const markPattern = [...keptMarkToId.keys()]
      .map((m) => m.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'))
      .join('|');
    out = out.replace(new RegExp(markPattern, 'g'), (match) => {
      const id = keptMarkToId.get(match);
      const newNum = idToNewNum.get(id);
      if (newNum == null) return match;
      return `[${newNum}]`;
    });
  }

  return out;
}

/**
 * 본문에서 [n] 형태의 인용 마크 개수를 센다.
 * @param {string} body
 * @returns {number}
 */
export function countCitationMarks(body) {
  if (!body || typeof body !== 'string') return 0;
  const m = body.match(/\[\d+\]/g);
  return m ? m.length : 0;
}

/**
 * 본문에서 [n] 형태의 인용 마크를 모두 제거한 문자열을 반환한다.
 * @param {string} body
 * @returns {string}
 */
export function stripCitationMarks(body) {
  if (!body || typeof body !== 'string') return '';
  return body.replace(/\[\d+\]/g, '');
}
