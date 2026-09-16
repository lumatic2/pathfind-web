// api/_lib/review-findings.js — 고른 근거 자료를 뜻으로 다시 확인
// 대상 채널: law, stats, public_data. 식별자·제목·근거를 모델로 확인하고 통과한 자료에 note를 붙인다.

import { logCall } from './http.js';

function parseReviewJson(content) {
  const t = String(content ?? '').trim();
  try { return JSON.parse(t); } catch { /* 코드 블록 */ }
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) { try { return JSON.parse(block[1].trim()); } catch { /* 아래로 */ } }
  const brace = t.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* 아래로 */ } }
  return null;
}

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

  const channelLabel = (ch) =>
    ch === 'law' ? 'law_search' : ch === 'stats' ? 'stats_search' : ch === 'public_data' ? 'public_data_search' : ch || '자료';

  const itemsBlock = findings
    .map(
      (f) =>
        `${channelLabel(f.channel)}: ${f.name || '제목 없음'} — ${(f.evidence || '').slice(0, 160)}`,
    )
    .join('\n');

  const systemText = (
  '아래 자료 각각이 이 단계에 **참고가 되는지** 판정합니다. 이 단계를 그대로 대신하지 못해도 비슷한 사례·안내·근거면 참고가 됩니다.\n' +
  '주제가 다른 분야의 자료(예: 목공 수업 단계에 수출 관세 법령, 게임 공략 글)는 고르지 않습니다.\n' +
  '고른 것마다 이 단계에서 어떻게 쓰는지 한 줄을 씁니다. 참고가 되는 것이 없으면 빈 배열입니다.\n' +
  '출력 형식 (JSON만): {"keep":[{"id":"r3","note":"이 단계에서 어떻게 쓰는지 한 줄"}]}'
);
const userContent = `[단계] ${stage.no}. ${stage.title}\n${stage.desc || ''}\n\n[자료]\n${itemsBlock}`;

const messages = [
  { role: 'system', content: systemText },
  { role: 'user', content: userContent },
];

  try {
    const res = await callSolar(messages, {
      tools: false,
      tool_choice: 'auto',
      maxTokens: 500,
      timeoutMs,
    });
    if (!res.content) {
      logCall('review-findings.empty', 0, 0, {});
      return { kept: [], dropped: findings.length, timedOut: false };
    }
    const parsed = parseReviewJson(res.content);
    if (!Array.isArray(parsed)) {
      logCall('review-findings.bad-json', 0, 0, { raw: res.content.slice(0, 200) });
      return { kept: [], dropped: findings.length, timedOut: false };
    }
    const keepMap = new Map(
      parsed
        .filter((item) => item && typeof item.id === 'string' && item.id.trim())
        .map((item) => [String(item.id).trim(), String(item.note ?? '').trim()]),
    );
    const kept = findings
      .filter((f) => keepMap.has(f.id))
      .map((f) => ({
        ...f,
        note: keepMap.get(f.id),
      }));
    return { kept, dropped: findings.length - kept.length, timedOut: false };
  } catch (e) {
    const timedOut = Boolean(e?.timeout);
    logCall('review-findings.error', 0, 0, { error: String(e?.message ?? e).slice(0, 200) });
    return {
      kept: [],
      dropped: findings.length,
      timedOut,
    };
  }
}
