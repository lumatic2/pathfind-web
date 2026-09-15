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
  const idToNewNum = new Map();
  finalFindings.forEach((f, idx) => {
    if (f.id) idToNewNum.set(f.id, idx + 1);
  });

  // 본문 인용 마크를 한 번 훑으며 처리
  // - fieldsByMark에 없는 번호: 그대로 유지
  // - 원자료와 최종 자료 양쪽에서 식별자를 찾을 수 있을 때만 새 번호
  // - 못 찾는 번호(최종 자료에 없는 id): 제거
  // 먼저 바꾼 값이 다시 치환되지 않도록 단일 pass
  return body.replace(/\[(\d+)\]/g, (match) => {
    const info = fieldsByMark[match];
    if (!info || !info.id) return match;       // fieldsByMark에 없거나 id 없음 → 유지
    if (!finalIds.has(info.id)) return '';     // 최종 자료에 없는 id → 제거
    const newNum = idToNewNum.get(info.id);
    return newNum == null ? match : `[${newNum}]`;
  });
}

/***
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

/**
 * 재요청으로도 인용 번호가 안 붙은 본문에 대해,
 * 실제 자료 이름이 들어 있는 문장에만 그 자료의 인용 번호를 붙인다.
 * 이미 [n] 마크가 있는 문장, 이름이 없는 문장은 건드리지 않는다.
 * 원문의 공백·줄 구조는 바꾸지 않고 문장 끝에만 번호를 더한다.
 *
 * @param {string} body         - 재요청까지 거친 본문
 * @param {Array}  finalFindings - 최종 선정 자료 배열 ({ id, name })
 * @returns {string}
 */
export function attachNumbersByMaterialName(body, finalFindings) {
  if (!body || typeof body !== 'string') return '';
  if (!finalFindings || !finalFindings.length) return body;

  // 문장 단위 패턴: (앞 공백)(내용)(문장 종결 문자)(뒤 공백)
  // - 내용은 문장 종결 문자(. ! ? \n)를 포함하지 않는다 (greedy).
  // - 종결 문자가 없는 텍스트는 문장 경계로 보지 않고 원문 그대로 둔다.
  const sentenceRe = /(\s*)([^.!?\n]*)([.!?\n])(\s*)/g;

  let lastIndex = 0;
  const parts = [];
  let m;
  while ((m = sentenceRe.exec(body)) !== null) {
    // regex가前に 건너뛰은 원문 조각이 있으면 그대로 붙인다
    if (m.index > lastIndex) {
      parts.push(body.slice(lastIndex, m.index));
    }
    lastIndex = sentenceRe.lastIndex;

    const leading = m[1];
    const content = m[2];
    const punct = m[3];
    const trailing = m[4];

    // 이미 마크가 있으면 건드리지 않고 그대로 기록
    if (/\[\d+\]/.test(content)) {
      parts.push(leading + content + punct + trailing);
      continue;
    }

    // 자료 이름이 들어 있는 문장인지 확인 (첫 번째 매칭 자료만)
    let attached = false;
    for (let i = 0; i < finalFindings.length; i++) {
      const name = finalFindings[i]?.name;
      if (!name) continue;
      if (content.includes(name)) {
        // 문장 종결 문자 앞에 번호를 더한다 (예: "...봤다 [1].")
        parts.push(leading + content + ` [${i + 1}]` + punct + trailing);
        attached = true;
        break;
      }
    }
    if (!attached) {
      parts.push(leading + content + punct + trailing);
    }
  }

  // regex가 끝까지의 모든 문장을 잡았는지 확인
  if (lastIndex >= body.length) {
    return parts.join('');
  }

  // 잡히지 않은 꼬리(원문 뒷부분)가 있으면 그대로 덧붙인다
  return parts.join('') + body.slice(lastIndex);
}
