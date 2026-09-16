// 경로: frontend/src/lib/planningResponse.ts
// 네트워크에서 받은 단계 설계 응답을 검사한다. 가짜 식별자와 비어 있어야 할
// 의미 검증 기록은 거절한다. 단계 제안에 원문 직접 증명은 요구하지 않는다.
// 옛 저장본을 이 함수로 검사하지 않는다.

import type { Planning, PlanningSource } from '../state/types';

/* ============================================================
 * 오류
 * ============================================================ */

export class PlanningResponseError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlanningResponseError';
    this.status = status;
  }
}

/* ============================================================
 * 공개 검사 함수
 * ============================================================ */

export function validatePlanningResponse(raw: unknown): Planning {
  const r = raw as Record<string, unknown>;

  // ── 최상위 필드 존재 확인 ──────────────────────────────
  if (r === null || typeof r !== 'object') {
    throw new PlanningResponseError(422, '응답이 객체가 아닙니다');
  }
  const bp = r.bigPicture;
  if (bp === undefined || bp === null || typeof bp !== 'object') {
    throw new PlanningResponseError(422, 'bigPicture가 없습니다');
  }
  const stagesRaw = (bp as Record<string, unknown>).stages;
  if (!Array.isArray(stagesRaw)) {
    throw new PlanningResponseError(422, 'bigPicture.stages가 배열이 아닙니다');
  }

  const planning = (bp as Record<string, unknown>).planning;
  if (planning === undefined || planning === null || typeof planning !== 'object') {
    throw new PlanningResponseError(422, 'bigPicture.planning이 없습니다');
  }

  const p = planning as Record<string, unknown>;

  // ── version / mode ──────────────────────────────────────
  if (p.version !== 1) {
    throw new PlanningResponseError(422, 'planning.version이 1이 아닙니다');
  }
  if (p.mode !== 'research-informed') {
    throw new PlanningResponseError(422, 'planning.mode이 research-informed가 아닙니다');
  }

  // ── researchedAt / requestId (문자열 존재만) ────────────
  if (typeof p.researchedAt !== 'string' || p.researchedAt === '') {
    throw new PlanningResponseError(422, 'planning.researchedAt이 비어 있습니다');
  }
  if (typeof p.requestId !== 'string' || p.requestId === '') {
    throw new PlanningResponseError(422, 'planning.requestId이 비어 있습니다');
  }

  // ── basisSummary ────────────────────────────────────────
  if (typeof p.basisSummary !== 'string') {
    throw new PlanningResponseError(422, 'planning.basisSummary가 문자열이 아닙니다');
  }

  // ── sources ─────────────────────────────────────────────
  const sourcesRaw = p.sources;
  if (!Array.isArray(sourcesRaw)) {
    throw new PlanningResponseError(422, 'planning.sources가 배열이 아닙니다');
  }
  const sources: PlanningSource[] = [];
  const sourceIds = new Set<string>();
  for (let i = 0; i < sourcesRaw.length; i++) {
    const s = sourcesRaw[i];
    if (s === null || typeof s !== 'object') {
      throw new PlanningResponseError(422, `sources[${i}]가 객체가 아닙니다`);
    }
    const sr = s as Record<string, unknown>;
    const id = typeof sr.id === 'string' ? sr.id : '';
    if (id === '') {
      throw new PlanningResponseError(422, `sources[${i}].id가 비어 있습니다 (가짜 식별자)`);
    }
    if (sourceIds.has(id)) {
      throw new PlanningResponseError(422, `sources[${i}].id가 중복입니다: ${id}`);
    }
    sourceIds.add(id);

    const title = typeof sr.title === 'string' ? sr.title : '';
    const url = typeof sr.url === 'string' ? sr.url : '';
    const snippet = typeof sr.snippet === 'string' ? sr.snippet : '';
    const queries = Array.isArray(sr.queries) ? sr.queries.filter((q): q is string => typeof q === 'string') : [];
    const channel = typeof sr.channel === 'string' ? sr.channel : '';
    const accessedAt = typeof sr.accessedAt === 'string' ? sr.accessedAt : '';
    const readScope = sr.readScope;
    if (readScope !== 'search-snippet') {
      throw new PlanningResponseError(422, `sources[${i}].readScope가 search-snippet이 아닙니다`);
    }
    sources.push({ id, title, url, snippet, queries, channel, accessedAt, readScope: 'search-snippet' });
  }

  // ── researchNotes ───────────────────────────────────────
  const notesRaw = p.researchNotes;
  if (!Array.isArray(notesRaw)) {
    throw new PlanningResponseError(422, 'planning.researchNotes가 배열이 아닙니다');
  }
  const researchNotes: { sourceId: string; excerpt: string }[] = [];
  for (let i = 0; i < notesRaw.length; i++) {
    const n = notesRaw[i];
    if (n === null || typeof n !== 'object') {
      throw new PlanningResponseError(422, `researchNotes[${i}]가 객체가 아닙니다`);
    }
    const nr = n as Record<string, unknown>;
    const sourceId = typeof nr.sourceId === 'string' ? nr.sourceId : '';
    if (sourceId === '') {
      throw new PlanningResponseError(422, `researchNotes[${i}].sourceId가 비어 있습니다`);
    }
    if (!sourceIds.has(sourceId)) {
      throw new PlanningResponseError(422, `researchNotes[${i}].sourceId가 sources에 없습니다: ${sourceId}`);
    }
    const excerpt = typeof nr.excerpt === 'string' ? nr.excerpt : '';
    if (excerpt === '') {
      throw new PlanningResponseError(422, `researchNotes[${i}].excerpt가 비어 있습니다`);
    }
    researchNotes.push({ sourceId, excerpt });
  }

  // ── stages (네 개~일곱 개, no 연속) ─────────────────────
  if (stagesRaw.length < 4 || stagesRaw.length > 7) {
    throw new PlanningResponseError(422, `stages 길이가 ${stagesRaw.length}입니다 (4~7 필요)`);
  }
  const stageNos = new Set<number>();
  for (let i = 0; i < stagesRaw.length; i++) {
    const st = stagesRaw[i];
    if (st === null || typeof st !== 'object') {
      throw new PlanningResponseError(422, `stages[${i}]가 객체가 아닙니다`);
    }
    const sr = st as Record<string, unknown>;
    const no = typeof sr.no === 'number' && Number.isInteger(sr.no) ? sr.no : -1;
    if (no < 1) {
      throw new PlanningResponseError(422, `stages[${i}].no가 유효하지 않습니다`);
    }
    if (stageNos.has(no)) {
      throw new PlanningResponseError(422, `stages[${i}].no ${no}가 중복입니다`);
    }
    stageNos.add(no);
    if (typeof sr.title !== 'string') {
      throw new PlanningResponseError(422, `stages[${i}].title가 문자열이 아닙니다`);
    }
    if (typeof sr.desc !== 'string') {
      throw new PlanningResponseError(422, `stages[${i}].desc가 문자열이 아닙니다`);
    }
    if (typeof sr.icon !== 'string') {
      throw new PlanningResponseError(422, `stages[${i}].icon가 문자열이 아닙니다`);
    }
    const tasks = Array.isArray(sr.tasks) ? sr.tasks : [];
    const choices = Array.isArray(sr.choices) ? sr.choices : [];
    // store는 stages를 쓰지 않고 bigPicture.stages를 그대로 유지하므로 여기서 별도 반환은 필요 없음
  }
  // no가 1부터 연속인지 확인
  const sortedNos = [...stageNos].sort((a, b) => a - b);
  for (let i = 0; i < sortedNos.length; i++) {
    if (sortedNos[i] !== i + 1) {
      throw new PlanningResponseError(422, `단계 번호가 연속이 아닙니다 (1부터 시작하지 않거나 중간 누락)`);
    }
  }

  // ── stageBasis ──────────────────────────────────────────
  const stageBasisRaw = p.stageBasis;
  if (stageBasisRaw === undefined || stageBasisRaw === null) {
    throw new PlanningResponseError(422, 'planning.stageBasis가 없습니다');
  }
  let stageBasis: Record<string, unknown>;
  if (Array.isArray(stageBasisRaw)) {
    // 배열을 stageNo 키를 갖는 Record로 한 번 바꿔 쓴다 (참조 구현 api.ts 와 동일).
    const arr = stageBasisRaw as unknown[];
    stageBasis = {};
    for (const item of arr) {
      if (item === null || typeof item !== 'object') {
        throw new PlanningResponseError(422, 'stageBasis 배열 항목이 객체가 아닙니다');
      }
      const r = item as Record<string, unknown>;
      const no = typeof r.stageNo === 'number' && Number.isInteger(r.stageNo) ? r.stageNo : -1;
      if (no < 1 || !stageNos.has(no)) {
        throw new PlanningResponseError(422, `stageBasis 배열 항목에 유효하지 않은 stageNo가 있습니다: ${no}`);
      }
      stageBasis[String(no)] = item;
    }
  } else if (typeof stageBasisRaw === 'object') {
    stageBasis = stageBasisRaw as Record<string, unknown>;
  } else {
    throw new PlanningResponseError(422, 'planning.stageBasis가 객체가 아닙니다');
  }
  for (const key of Object.keys(stageBasis)) {
    const no = Number(key);
    if (!Number.isInteger(no) || no < 1) {
      throw new PlanningResponseError(422, `stageBasis 키에 유효하지 않은 단계 번호가 있습니다: ${key}`);
    }
    if (!stageNos.has(no)) {
      throw new PlanningResponseError(422, `stageBasis 키가 stages에 없는 단계 번호입니다: ${no}`);
    }
    const v = stageBasis[key];
    if (v === null || typeof v !== 'object') {
      throw new PlanningResponseError(422, `stageBasis[${no}]가 객체가 아닙니다`);
    }
    const vb = v as Record<string, unknown>;
    if (typeof vb.basis !== 'string') {
      throw new PlanningResponseError(422, `stageBasis[${no}].basis가 문자열이 아닙니다`);
    }
    if (typeof vb.reason !== 'string') {
      throw new PlanningResponseError(422, `stageBasis[${no}].reason가 문자열이 아닙니다`);
    }
    const sourceIdsArr = Array.isArray(vb.sourceIds) ? vb.sourceIds : [];
    const supportArr = Array.isArray(vb.support) ? vb.support : [];
    for (const sid of sourceIdsArr) {
      if (typeof sid !== 'string' || sid === '') {
        throw new PlanningResponseError(422, `stageBasis[${no}].sourceIds에 빈 식별자가 있습니다`);
      }
      if (!sourceIds.has(sid)) {
        throw new PlanningResponseError(422, `stageBasis[${no}].sourceIds의 ${sid}가 sources에 없습니다`);
      }
    }
    for (const sup of supportArr) {
      if (typeof sup === 'string') {
        if (sup === '') {
          throw new PlanningResponseError(422, `stageBasis[${no}].support에 빈 문자열이 있습니다`);
        }
      } else if (sup !== null && typeof sup === 'object') {
        const o = sup as Record<string, unknown>;
        const sourceId = typeof o.sourceId === 'string' ? o.sourceId : '';
        if (sourceId === '') {
          throw new PlanningResponseError(422, `stageBasis[${no}].support 객체의 sourceId가 비어 있습니다`);
        }
        if (!sourceIds.has(sourceId)) {
          throw new PlanningResponseError(422, `stageBasis[${no}].support 객체의 sourceId(${sourceId})가 sources에 없습니다`);
        }
        const excerpt = typeof o.excerpt === 'string' ? o.excerpt : '';
        if (excerpt === '') {
          throw new PlanningResponseError(422, `stageBasis[${no}].support 객체의 excerpt가 비어 있습니다`);
        }
        const supports = typeof o.supports === 'string' ? o.supports : '';
        if (!['stage', 'order', 'prerequisite'].includes(supports)) {
          throw new PlanningResponseError(422, `stageBasis[${no}].support 객체의 supports가 유효하지 않습니다: ${supports}`);
        }
      } else {
        throw new PlanningResponseError(422, `stageBasis[${no}].support 항목이 문자열/객체가 아닙니다`);
      }
    }
  }

  // ── trace (검색 호출 여섯 개, 채널별 두 개) ─────────────
  const traceRaw = p.trace;
  if (!Array.isArray(traceRaw)) {
    throw new PlanningResponseError(422, 'planning.trace가 배열이 아닙니다');
  }
  if (traceRaw.length !== 6) {
    throw new PlanningResponseError(422, `planning.trace 길이가 ${traceRaw.length}입니다 (6 필요)`);
  }
  const trace: { query: string; channel: string; status: string; count: number; elapsedMs: number }[] = [];
  const channelCounts: Record<string, number> = {};
  for (let i = 0; i < traceRaw.length; i++) {
    const t = traceRaw[i];
    if (t === null || typeof t !== 'object') {
      throw new PlanningResponseError(422, `trace[${i}]가 객체가 아닙니다`);
    }
    const tr = t as Record<string, unknown>;
    const query = typeof tr.query === 'string' ? tr.query : '';
    const channel = typeof tr.channel === 'string' ? tr.channel : '';
    const status = typeof tr.status === 'string' ? tr.status : '';
    if (query === '') {
      throw new PlanningResponseError(422, `trace[${i}].query가 비어 있습니다`);
    }
    if (channel === '') {
      throw new PlanningResponseError(422, `trace[${i}].channel이 비어 있습니다`);
    }
    if (status !== 'success' && status !== 'empty' && status !== 'error') {
      throw new PlanningResponseError(422, `trace[${i}].status가 유효한 값이 아닙니다: ${status}`);
    }
    const count = typeof tr.count === 'number' && Number.isInteger(tr.count) && tr.count >= 0 ? tr.count : -1;
    if (count < 0) {
      throw new PlanningResponseError(422, `trace[${i}].count가 유효하지 않습니다`);
    }
    const elapsedMs = typeof tr.elapsedMs === 'number' && tr.elapsedMs >= 0 ? tr.elapsedMs : -1;
    if (elapsedMs < 0) {
      throw new PlanningResponseError(422, `trace[${i}].elapsedMs가 음수입니다`);
    }
    trace.push({ query, channel, status, count, elapsedMs });
    channelCounts[channel] = (channelCounts[channel] || 0) + 1;
  }
  // 채널별 두 개씩인지 확인
  for (const ch of Object.keys(channelCounts)) {
    if (channelCounts[ch] !== 2) {
      throw new PlanningResponseError(422, `trace에서 채널 ${ch}의 기록이 ${channelCounts[ch]}개입니다 (채널별 2개 필요)`);
    }
  }

  // ── events (네 사건, 순서, 단조 증가 시각) ──────────────
  const eventsRaw = p.events;
  if (!Array.isArray(eventsRaw)) {
    throw new PlanningResponseError(422, 'planning.events가 배열이 아닙니다');
  }
  const requiredOrder = ['request_received', 'search_finished', 'design_finished', 'response_ready'];
  if (eventsRaw.length !== 4) {
    throw new PlanningResponseError(422, `planning.events 길이가 ${eventsRaw.length}입니다 (4 필요)`);
  }
  const events: { name: string; elapsedMs: number }[] = [];
  let prevElapsed = -1;
  for (let i = 0; i < eventsRaw.length; i++) {
    const e = eventsRaw[i];
    if (e === null || typeof e !== 'object') {
      throw new PlanningResponseError(422, `events[${i}]가 객체가 아닙니다`);
    }
    const er = e as Record<string, unknown>;
    const name = typeof er.name === 'string' ? er.name : '';
    if (name === '') {
      throw new PlanningResponseError(422, `events[${i}].name이 비어 있습니다`);
    }
    if (name !== requiredOrder[i]) {
      throw new PlanningResponseError(422, `events[${i}].name이 예상 순서(${requiredOrder[i]})와 다릅니다: ${name}`);
    }
    const elapsedMs = typeof er.elapsedMs === 'number' && er.elapsedMs >= 0 ? er.elapsedMs : -1;
    if (elapsedMs < 0) {
      throw new PlanningResponseError(422, `events[${i}].elapsedMs가 음수입니다`);
    }
    if (elapsedMs < prevElapsed) {
      throw new PlanningResponseError(422, `events[${i}].elapsedMs가 이전 사건보다 작습니다`);
    }
    prevElapsed = elapsedMs;
    events.push({ name, elapsedMs });
  }

  // ── warnings ────────────────────────────────────────────
  const warningsRaw = p.warnings;
  if (!Array.isArray(warningsRaw)) {
    throw new PlanningResponseError(422, 'planning.warnings가 배열이 아닙니다');
  }
  for (let i = 0; i < warningsRaw.length; i++) {
    if (typeof warningsRaw[i] !== 'string' || warningsRaw[i] === '') {
      throw new PlanningResponseError(422, `warnings[${i}]가 빈 문자열이 아닙니다`);
    }
  }

  // ── groundingChecks (빈 배열이어야 함) ──────────────────
  const gcRaw = p.groundingChecks;
  if (!Array.isArray(gcRaw) || gcRaw.length !== 0) {
    throw new PlanningResponseError(422, 'planning.groundingChecks가 빈 배열이 아닙니다 (의미 검증 기록은 없어야 함)');
  }

  // ── offTopic (선택, 있으면 숫자) ────────────────────────
  if (p.offTopic !== undefined && (typeof p.offTopic !== 'number' || !Number.isInteger(p.offTopic) || p.offTopic < 0)) {
    throw new PlanningResponseError(422, 'planning.offTopic가 유효한 숫자가 아닙니다');
  }

  return {
    version: 1,
    mode: 'research-informed',
    researchedAt: p.researchedAt as string,
    requestId: p.requestId as string,
    basisSummary: p.basisSummary as string,
    sources,
    researchNotes,
    stageBasis: stageBasis as Planning['stageBasis'],
    trace,
    warnings: warningsRaw as string[],
    events,
    groundingChecks: [],
    offTopic: p.offTopic !== undefined ? p.offTopic as number : undefined,
  };
}
