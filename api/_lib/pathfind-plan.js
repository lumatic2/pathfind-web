// api/_lib/pathfind-plan.js — 선행 조사(검색)와 단계 설계(planning) 연결
// 계약: docs/api-contract.md §2 (bigPicture.planning, bigPicture.stages).
// export: planFromResearch.
// 전체 105초, 응답 여유 5초. 검색어 생성 8초, 검색 15초, 설계 40초, 형식 수정 25초 상한.
// 각 호출에 남은 시간을 전달. 의미 대조나 원문 직접 증명 모델 호출은 하지 않는다.
// 의존 함수는 파라미터로 받아 가짜로 교체할 수 있다(기본은 실제 import).

import { searchPlanningSources } from './pathfind-search.js';
import { callPlanningModel } from './pathfind-model.js';
import { normalizePlanningDesign } from './pathfind-design.js';

const TOTAL_MS = 105_000;
const RESPONSE_RESERVE_MS = 5_000;
const QUERY_GEN_MS = 8_000;
const SEARCH_MS = 15_000;
const DESIGN_MS = 40_000;
const RETRY_MS = 25_000;

function requestIdFn() {
  try {
    return `req-${crypto.randomUUID()}`;
  } catch {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

const QUERY_SYSTEM = `당신은 선행 조사에 쓸 검색어 두 개를 만드는 역할입니다.

산출물:
- JSON 한 덩어리만 내놓습니다. 코드펜스나 앞뒤 설명 문장은 넣지 않습니다.
- 루트 객체: { "activity": "string", "readiness": "string" }
- activity: 활동과 역할 관점의 검색어(한 줄, 60자 안팎). 무엇을 어떤 역할로 하는지 중심.
- readiness: 준비와 경험 관점의 검색어(한 줄, 60자 안팎). 준비할 것, 해 본 사람·사례 중심.

언어: 한국어. 쌍따옴표는 반각만 사용합니다.`;

const DESIGN_SYSTEM = `당신은 사용자의 목표와 조건, 선행 조사 자료를 바탕으로 작업 단계를 제안하는 역할입니다.

산출물:
- JSON 한 덩어리만 내놓습니다. 코드펜스나 앞뒤 설명 문장은 넣지 않습니다.
- 루트 객체:
  - title: 프로젝트 한 줄 이름(24자 이내)
  - intro: 프로젝트 큰 그림 한 문장
  - basisSummary: 단계 제안 이유 전체(400자 이내)
  - steps: 4~7개 단계 배열. 각 단계:
    - no: number(1부터 연속)
    - title: string(24자 이내)
    - desc: string(2-3문장)
    - reason: string(이 단계를 이 순서로 제안한 이유 한 줄)
    - icon: string(컴퍼스, 코드, 팔레트 등 아이콘 이름, 생략 가능)
  - referenceIds: string[] — 실제 자료 id만. 없으면 빈 배열.
  - limitations: string 또는 string[] — 없으면 생략. 문자열이면 한 항목.

규칙:
- steps는 4개 이상 7개 이하입니다.
- stages의 실제 verdict·findings·tasks는 서버가 자료에서 채웁니다. 이 응답에는 넣지 않습니다.
- referenceIds는 서버가 준 sources.id만 씁니다. 새 주소나 인용문을 만들지 않습니다.
- limitations가 문자열 하나면 그대로, 여러 개면 배열로 내놓습니다.

언어: 한국어. 쌍따옴표는 반각만 사용합니다.`;

function designUserPrompt(summary, sources) {
  const srcLines = (sources || []).map(
    (s) => `id=${s.id} 제목=${s.title} 발췌=${s.snippet}`
  );
  return `사용자 목표·조건 요약:
${summary}

선행 조사에서 확인한 자료(${sources ? sources.length : 0}건):
${srcLines.length ? srcLines.join('\n') : '(확인한 자료 없음)'}

위 목표와 자료를 바탕으로 작업 단계 4~7개를 제안하세요.
출력은 JSON 한 덩어리:
{
  "title": "...",
  "intro": "...",
  "basisSummary": "...",
  "steps": [
    { "no": 1, "title": "...", "desc": "...", "reason": "..." }
  ],
  "referenceIds": ["..."],
  "limitations": "..."
}`;
}

function queryUserPrompt(summary) {
  return `사용자 목표·조건 요약:
${summary}

위 목표를 실제 작업으로 옮길 때 참고할 검색어 두 개를 위에 정한 형식으로 내놓으세요.
출력은 JSON 한 덩어리:
{ "activity": "...", "readiness": "..." }`;
}

function parseJsonContent(content) {
  if (!content) return null;
  const trimmed = content.trim();
  let text = trimmed;
  const fence = text.match(/^[\\s\\S]*?```(?:json)?\\s*([\\s\\S]*?)```[\\s\\S]*$/);
  if (fence) {
    text = fence[1].trim();
  } else {
    const parts = text.split('```');
    if (parts.length >= 3) {
      text = parts[parts.length - 1].trim();
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {string} approvalSummary - grill summary 또는 초기 아이디어 문단
 * @param {object} clock           - { now(): number }
 * @param {function} modelFn       - (messages, timeoutMs, signal) => Promise<string>
 * @param {function} searchFn      - (query1, query2, signal, timeoutMs) => Promise<{sources, trace}>
 * @param {function} normalizeFn   - (modelDesign, sources) => {ok, status, error?, data?}
 * @param {AbortSignal} [outerSignal]
 * @returns {Promise<{bigPicture, planning, handoffMarkdown:string}>}
 */
export async function planFromResearch(
  approvalSummary,
  clock,
  modelFn,
  searchFn,
  normalizeFn,
  outerSignal,
) {
  const startedAt = clock.now();
  const deadlineAt = startedAt + TOTAL_MS;
  const reserveAt = deadlineAt - RESPONSE_RESERVE_MS;

  const overall = outerSignal ?? new AbortController();
  const timeLeft = () => Math.max(0, Math.min(deadlineAt, reserveAt) - clock.now());

  // 1) 검색어 생성 (8초 상한)
  const queryTimeout = Math.min(QUERY_GEN_MS, timeLeft());
  if (queryTimeout <= 0) {
    throw new Error('시간 초과: 검색어 생성 단계');
  }
  const queryMessages = [
    { role: 'system', content: QUERY_SYSTEM },
    { role: 'user', content: queryUserPrompt(approvalSummary) },
  ];
  const queryContent = await modelFn(queryMessages, queryTimeout, overall.signal);
  const queries = parseJsonContent(queryContent);
  if (!queries || typeof queries.activity !== 'string' || typeof queries.readiness !== 'string') {
    throw new Error('검색어 생성 응답이 예상한 형식이 아닙니다');
  }

  // 2) 검색 (15초 상한)
  const searchTimeout = Math.min(SEARCH_MS, timeLeft());
  if (searchTimeout <= 0) {
    throw new Error('시간 초과: 검색 단계');
  }
  let sources = [];
  let trace = null;
  try {
    const result = await searchFn(queries.activity, queries.readiness, overall.signal, searchTimeout);
    sources = result.sources || [];
    trace = result.trace;
  } catch (err) {
    // 전량 실패해도 빈 자료로 설계 호출까지 진행한다.
    sources = [];
    trace = err.trace ?? { calls: [], totalCalls: 0, succeededCalls: 0, failedCalls: 0, totalElapsedMs: 0 };
  }

  // 3) 단계 설계 (40초 상한)
  const designTimeout = Math.min(DESIGN_MS, timeLeft());
  if (designTimeout <= 0) {
    throw new Error('시간 초과: 단계 설계 단계');
  }
  const designMessages = [
    { role: 'system', content: DESIGN_SYSTEM },
    { role: 'user', content: designUserPrompt(approvalSummary, sources) },
  ];
  let designContent = await modelFn(designMessages, designTimeout, overall.signal);
  let parsed = parseJsonContent(designContent);
  if (!parsed || typeof parsed !== 'object') {
    parsed = { raw: designContent };
  }
  let check = normalizeFn(parsed, sources);
  let retries = 0;

  // 4) 형식 수정 (실패 시 1회, 25초 상한)
  if (!check.ok && retries === 0) {
    const retryTimeout = Math.min(RETRY_MS, timeLeft());
    if (retryTimeout > 0) {
      retries += 1;
      const retryMessages = [
        { role: 'system', content: DESIGN_SYSTEM },
        { role: 'user', content: `앞 응답이 검증에 통과하지 못했습니다: ${check.error}

다시 같은 형식으로 응답하세요. 출력 전에 설명 문장을 넣지 마세요.` },
      ];
      designContent = await modelFn(retryMessages, retryTimeout, overall.signal);
      parsed = parseJsonContent(designContent);
      if (!parsed || typeof parsed !== 'object') {
        parsed = { raw: designContent };
      }
      check = normalizeFn(parsed, sources);
    }
  }

  if (!check.ok) {
    throw new Error('단계 설계 응답이 검증에 통과하지 못했습니다: ' + check.error);
  }

  // 5) 조회 기록과 제안 이유를 같은 응답에 담는다 (계약 §planning)
  const searchFinishedAt = clock.now();
  const designFinishedAt = clock.now();
  const responseReadyAt = clock.now();

  const traceRows = (trace?.calls || []).map((c) => {
    const label = c.label ?? '';
    const colonIdx = label.indexOf(':');
    return {
      query: colonIdx >= 0 ? label.slice(colonIdx + 1) : label,
      channel: colonIdx >= 0 ? label.slice(0, colonIdx) : (c.kind ?? ''),
      status: c.status === 'ok' ? (c.count > 0 ? 'success' : 'empty') : 'error',
      count: c.count ?? 0,
      elapsedMs: c.elapsedMs ?? 0,
    };
  });

  const warnings = [
    ...(check.data.planning.warnings?.filter(Boolean) ?? []),
  ];
  if (sources.length === 0) {
    warnings.push('모든 검색이 연결 실패하여 인터뷰 기반 초안입니다.');
  } else if (!check.data.planning.researchNotes?.length) {
    warnings.push('직접 참고한 자료가 없어 인터뷰 기반 초안입니다.');
  }

  const planning = {
    ...check.data.planning,
    requestId: requestIdFn(),
    researchedAt: new Date().toISOString(),
    trace: traceRows,
    events: [
      { name: 'request_received', elapsedMs: 0 },
      { name: 'search_finished', elapsedMs: Math.max(0, searchFinishedAt - startedAt) },
      { name: 'design_finished', elapsedMs: Math.max(0, designFinishedAt - startedAt) },
      { name: 'response_ready', elapsedMs: Math.max(0, responseReadyAt - startedAt) },
    ],
    warnings,
  };

  // handoffMarkdown은 이 연결 단계에서 채우지 않는다(다른 단계 관할).
  return {
    bigPicture: check.data.bigPicture,
    planning,
    handoffMarkdown: '',
  };
}
