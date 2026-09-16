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

/** 접미사로만 쓰이는 낱말 — 주제 낱말에서 제외. */
const TOPIC_SUFFIXES = new Set([
  '만들기', '튜토리얼', '제작순서', '준비과정', '사용법',
  '운영방법', '안전교육', '준비물', '체크리스트', '시행착오',
]);

/** 검색어에서 주제 낱말을 뽑는다. 접미사·두 글자 미만 제외, 중복 제거. */
function queryTopicWords(query) {
  if (typeof query !== 'string') return new Set();
  const trimmed = query.trim();
  if (!trimmed) return new Set();

  // 끝에서부터 접미사를 반복 제거
  let cleaned = trimmed;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of TOPIC_SUFFIXES) {
      if (cleaned.endsWith(suffix)) {
        const prev = cleaned.slice(0, -suffix.length).trim();
        if (prev.length >= 2) {
          cleaned = prev;
          changed = true;
          break;
        } else {
          // 접미사만 남은 경우 — 주제 낱말 없음
          return new Set();
        }
      }
    }
  }

  // 공백 기준 낱말 분할 → 2글자 이상, 접미사 아닌 것만 남김
  const out = new Set();
  for (const t of cleaned.split(/\s+/)) {
    if (t.length < 2) continue;
    if (TOPIC_SUFFIXES.has(t)) continue;
    out.add(t);
  }
  return out;
}

/** 제목 또는 제목+발췌에 주제 낱말이 규칙에 맞게 있는지 검사한다. */
function isOnTopic(item, topicWords) {
  if (topicWords.size === 0) return true;
  const combined = ((item.title || '') + (item.snippet || '')).replace(/\s+/g, '');
  let hit = 0;
  for (const word of topicWords) {
    if (combined.includes(word)) hit += 1;
  }
  if (topicWords.size === 1) return hit >= 1;
  return hit >= 2;
}

/**
 * 두 검색어와 signal, timeoutMs를 받아 여섯 병렬 검색 후 자료를 수집한다.
 *
 * @param {string} query1
 * @param {string} query2
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs]
 * @returns {Promise<{sources, trace:{calls:Array, totalCalls, succeededCalls, failedCalls, totalElapsedMs}, offTopic:{excludedByQuery:Object, total:number, allExcluded:boolean}}>}
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

  // 각 검색어의 주제 낱말을 뽑아 두고, 채널별 결과에서 주제와 맞지 않는 항목을 거른다.
  const topic1 = queryTopicWords(query1);
  const topic2 = queryTopicWords(query2);

  const filterResults = (items, topicWords, queryLabel) => {
    if (topicWords.size === 0) return { kept: items, discarded: 0 };
    const kept = [];
    let discarded = 0;
    for (const item of items) {
      if (!isOnTopic(item, topicWords)) {
        discarded += 1;
        continue;
      }
      kept.push(item);
    }
    return { kept, discarded };
  };

  const webkr1f = filterResults(
    succeeded.find((r) => r.kind === 'webkr' && r.query === query1)?.results ?? [],
    topic1,
    query1,
  );
  const blog1f = filterResults(
    succeeded.find((r) => r.kind === 'blog' && r.query === query1)?.results ?? [],
    topic1,
    query1,
  );
  const cafearticle1f = filterResults(
    succeeded.find((r) => r.kind === 'cafearticle' && r.query === query1)?.results ?? [],
    topic1,
    query1,
  );
  const webkr2f = filterResults(
    succeeded.find((r) => r.kind === 'webkr' && r.query === query2)?.results ?? [],
    topic2,
    query2,
  );
  const blog2f = filterResults(
    succeeded.find((r) => r.kind === 'blog' && r.query === query2)?.results ?? [],
    topic2,
    query2,
  );
  const cafearticle2f = filterResults(
    succeeded.find((r) => r.kind === 'cafearticle' && r.query === query2)?.results ?? [],
    topic2,
    query2,
  );

  const offTopic = {
    excludedByQuery: {
      [query1]: webkr1f.discarded + blog1f.discarded + cafearticle1f.discarded,
      [query2]: webkr2f.discarded + blog2f.discarded + cafearticle2f.discarded,
    },
    total: 0,
    allExcluded: false,
  };
  offTopic.total = offTopic.excludedByQuery[query1] + offTopic.excludedByQuery[query2];

  const totalQuery1 = (succeeded.find((r) => r.kind === 'webkr' && r.query === query1)?.count ?? 0) +
    (succeeded.find((r) => r.kind === 'blog' && r.query === query1)?.count ?? 0) +
    (succeeded.find((r) => r.kind === 'cafearticle' && r.query === query1)?.count ?? 0);
  const totalQuery2 = (succeeded.find((r) => r.kind === 'webkr' && r.query === query2)?.count ?? 0) +
    (succeeded.find((r) => r.kind === 'blog' && r.query === query2)?.count ?? 0) +
    (succeeded.find((r) => r.kind === 'cafearticle' && r.query === query2)?.count ?? 0);
  if ((totalQuery1 > 0 && offTopic.excludedByQuery[query1] === totalQuery1) ||
    (totalQuery2 > 0 && offTopic.excludedByQuery[query2] === totalQuery2)) {
    offTopic.allExcluded = true;
  }

  const sources = collectPlanningSources(
    query1,
    query2,
    webkr1f.kept,
    blog1f.kept,
    cafearticle1f.kept,
    webkr2f.kept,
    blog2f.kept,
    cafearticle2f.kept,
  );

  return { sources, trace, offTopic };
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
