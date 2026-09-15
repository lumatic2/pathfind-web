// api/_lib/review-findings.js — 고른 근거 자료를 뜻으로 다시 확인
// 대상 채널: law, stats, public_data. 식별자·제목·근거를 모델로 확인하고 통과한 자료에 note를 붙인다.

import { logCall } from './http.js';

const REVIEW_SYSTEM = `당신은 통계·공공데이터·법령 근거 자료를 뜻으로 확인하는 어시스턴트입니다.
아래 각 자료에 대해 식별자와 제목, 근거를 읽고 이 단계 실현에 실제로 도움이 되는지 판정합니다.
도움이 되는 자료만 고르고, 각 자료에 한 줄 note를 붙입니다.
출력은 JSON 배열 하나입니다. 각 항목은 { "id": "...", "note": "..." } 형태입니다.
도움되지 않는 자료는 배열에 넣지 않습니다.
마크다운 없이 JSON 배열만 출력합니다.`;

/**
 * @param {object} stage  - { title?: string, desc?: string }
 * @param {object[]} findings - 검토할 finding 목록 (law/stats/public_data)
 * @param {Function} callSolar - (messages, options) => Promise<{content, toolCalls}>
 * @param {number} timeoutMs
 * @returns {{ kept: object[], dropped: number, timedOut: boolean }}
 */
export async function reviewFindings(stage, findings, callSolar, timeoutMs) {
  if (!findings || findings.length === 0) {
    return { kept: [], dropped: 0, timedOut: false };
  }

  const itemsBlock = findings
    .map(
      (f, i) =>
        `${i + 1}. id: ${f.id}\n   제목: ${f.name || '제목 없음'}\n   근거: ${(f.evidence || '').slice(0, 300)}\n   URL: ${f.url || '없음'}`,
    )
    .join('\n\n');

  const prompt = `이 단계 제목: ${stage.title || ''}
이 단계 설명: ${stage.desc || ''}

[검토할 자료]
${itemsBlock}

위 자료를 뜻으로 확인하고, 이 단계 실현에 실제로 도움이 되는 자료의 id와 한 줄 note를 JSON 배열로 답하세요.
도움되지 않는 자료는 넣지 않습니다.
답변: `;

  const messages = [
    { role: 'system', content: REVIEW_SYSTEM },
    { role: 'user', content: prompt },
  ];

  try {
    const res = await callSolar(messages, {
      tools: false,
      tool_choice: 'auto',
      maxTokens: 2000,
      timeoutMs,
    });
    if (!res.content) {
      logCall('review-findings.empty', 0, 0, {});
      return { kept: [], dropped: findings.length, timedOut: false };
    }
    const parsed = JSON.parse(res.content.trim());
    if (!Array.isArray(parsed)) {
      logCall('review-findings.bad-json', 0, 0, { raw: res.content.slice(0, 200) });
      return { kept: [], dropped: findings.length, timedOut: false };
    }
    const keptIds = new Set(
      parsed
        .filter((item) => item && typeof item.id === 'string' && item.id.trim())
        .map((item) => item.id.trim()),
    );
    const kept = findings
      .filter((f) => keptIds.has(f.id))
      .map((f) => {
        const match = parsed.find((item) => item.id === f.id);
        return {
          ...f,
          note: match && typeof match.note === 'string' ? match.note.slice(0, 300) : f.note || '',
        };
      });
    return { kept, dropped: findings.length - kept.length, timedOut: false };
  } catch (e) {
    logCall('review-findings.error', 0, 0, { err: String(e) });
    return { kept: [], dropped: findings.length, timedOut: false };
  }
}
