// api/_lib/pathfind-search.js — 두 검색어 × 세 채널 병렬 선행 검색
// 계약: docs/api-contract.md §planning.sources, §trace.
// export: searchPlanningSources.
// 기존 네이버 검색 인증만 읽어 쓰고 webkr·blog·cafearticle을 각각 두 번 병렬 호출한다.
// 각 호출은 결과 5개를 요청하고 제목·발췌만 수집한다. 주소 본문을 다시 읽지 않는다.
// 전체 묶음은 15초 안에 끝내고 일부 실패는 trace.error에 남긴다.

import { searchNaver } from '../_channels/naver.js';
import { collectPlanningSources } from './pathfind-sources.js';

const KINDS = ['webkr', 'blog', 'cafearticle'];
const DISPLAY = 5;
const BATCH_TIMEOUT_MS = 15_000;

/**
 * 두 검색어와 signal, timeoutMs를 받아 여섯 병렬 검색 후 자료를 수집한다.
 *
 * @param {string} query1
 * @param {string} query2
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs]
 * @returns {Promise<{sources, trace:{calls:Array, totalCalls, succeededCalls, failedCalls, totalElapsedMs}}>}
 *           전부 실패 시 throw { trace, message }.
 */
export async function searchPlanningSources(query1, query2, signal, timeoutMs) {
  const deadline = timeoutMs != null ? timeoutMs : BATCH_TIMEOUT_MS;
  const deadlineSignal = signal ?? new AbortController().signal;
  const deadlineMs = Date.now() + deadline;

  const channels = KINDS.flatMap((kind) => [
    { kind, query: query1, label: `${kind}:${query1}` },
    { kind, query: query2, label: `${kind}:${query2}` },
  ]);

  const results = await Promise.all(
    channels.map((ch) =>
      runCall(ch.kind, ch.query, ch.label, deadlineMs, deadlineSignal)
    )
  );

  const succeeded = results.filter((r) => r.status === 'ok');
  const failed = results.filter((r) => r.status === 'error');
  const now = Date.now();

  const trace = {
    calls: results.map((r) => ({
      label: r.label,
      kind: r.kind,
      status: r.status,
      count: r.status === 'ok' ? r.count : 0,
      elapsedMs: r.elapsedMs,
      error: r.error ?? null,
    })),
    totalCalls: results.length,
    succeededCalls: succeeded.length,
    failedCalls: failed.length,
    totalElapsedMs: Math.max(0, now - (deadlineMs - deadline)),
  };

  if (succeeded.length === 0) {
    trace.calls = trace.calls.map((c) => ({ ...c, status: 'error' }));
    throw { trace, message: '선행 검색 전량 실패' };
  }

  const sources = collectPlanningSources(
    query1,
    query2,
    succeeded.find((r) => r.kind === 'webkr' && r.query === query1)?.results ?? [],
    succeeded.find((r) => r.kind === 'blog' && r.query === query1)?.results ?? [],
    succeeded.find((r) => r.kind === 'cafearticle' && r.query === query1)?.results ?? [],
    succeeded.find((r) => r.kind === 'webkr' && r.query === query2)?.results ?? [],
    succeeded.find((r) => r.kind === 'blog' && r.query === query2)?.results ?? [],
    succeeded.find((r) => r.kind === 'cafearticle' && r.query === query2)?.results ?? [],
  );

  return { sources, trace };
}

async function runCall(kind, query, label, deadlineMs, signal) {
  const started = Date.now();
  try {
    const res = await Promise.race([
      searchNaver(query, kind, DISPLAY),
      timeout(deadlineMs - started, signal),
    ]);
    return {
      kind,
      query,
      label,
      status: 'ok',
      count: res.length,
      results: res,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    return {
      kind,
      query,
      label,
      status: 'error',
      count: 0,
      results: [],
      elapsedMs: Date.now() - started,
      error: err?.message ? String(err.message).slice(0, 200) : '알 수 없는 오류',
    };
  }
}

function timeout(ms, signal) {
  if (ms <= 0) {
    return Promise.reject(new Error('배치 시간 초과'));
  }
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('배치 시간 초과')), ms);
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new Error('신호 중단'));
      return;
    }
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('신호 중단'));
    }, { once: true });
  });
}
