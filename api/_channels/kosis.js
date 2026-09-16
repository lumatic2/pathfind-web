// api/channels/kosis.js — KOSIS 국가통계포털 통계표 검색 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchKosis.
// 구현: KOSIS OpenAPI 통계표 검색(통계목록 → KOSIS통합검색)을 직접 호출한다.
//        엔드포인트: https://kosis.kr/openapi/statisticsSearch.do?method=getList
//        요청변수: apiKey(필수), searchNm(필수), format, jsonVD, startCount, resultCount, sort.
//        jsonVD=Y로 표준 JSON 배열을 받는다. JSON.parse로 바로 읽는다.
//        이 API는 짧은 검색어(통계표명에 들어갈 낱말 하나·둘)에 잘 답하고
//        문장형 검색어에는 0건이 나온다. 그래서 검색어를 단계적으로 줄여 다시 찾는다.
//
// 7차 보강(step-2): searchKosis가 stage(단계 문맥)를 받아 검색어 후보를 확장하고
//   단계 글 낱말을 실제로 공유하는 표가 나온 후보를 고른다.

const KOSIS_SEARCH_URL = 'https://kosis.kr/openapi/statisticsSearch.do';
const TIMEOUT_MS = 10000;

/** 채널 이름. 고정 문자열. */
export const name = 'kosis';

/**
 * KOSIS 통계표 검색 사용 가능 여부.
 * KOSIS_API_KEY가 있으면 true, 없으면 false.
 * 예외는 내지 않는다.
 */
export function available() {
  try {
    return !!(process.env.KOSIS_API_KEY);
  } catch {
    return false;
  }
}

// 단계 글의 한글 2자 이상 토막에서 통계 규칙에 걸리는 낱말(예산·시세·매출·추이 …).
// 법령 관문과 같은 잣대를 쓴다(stage.mjs의 stageContextWords와 같은 규칙).
const STATS_RULE = /비용|예산|시세|시장|수요|인구|매출|규모|통계|가격|단가|수익|고객층|연령|소득|성장|점유|추이/;

/**
 * 단계 객체의 글(토막)에서 한글 2자 이상 낱말을 중복 없이 뽑는다.
 * stage가 없으면 [], 배열이면 그대로 반환(이미 추출된 낱말 목록).
 */
function stageWords(stage) {
  if (!stage) return [];
  if (Array.isArray(stage)) return stage;
  const text = [
    stage.title,
    stage.desc,
    ...(stage.tasks ?? []).map((t) => `${t.task} ${t.why ?? ''}`),
    ...(stage.choices ?? []),
  ].join('\n');
  return [...new Set(String(text).match(/[가-힣]{2,}/g) ?? [])];
}

/**
 * KOSIS 통계표 검색을 수행한다.
 * query: 검색어(문장형일 수 있음).
 * options: { display?: number, stage?: StageObject | string[] } — display 기본값은 3.
 * 반환: Result[] = { id, title, url, snippet, host, form }. form은 'table'.
 *
 * 검색어 후보를 여러 개 만들어 각각 조회한 뒤, 단계 글 낱말을 실제로 공유하는 표가
 * 나온 후보를 고른다. 단계 글이 없으면 종전처럼 첫 결과의 첫 후보를 그대로 쓴다.
 * 고르기가 실패해도 잃는 것은 없다 — 첫 결과(firstHit)를 그대로 반환한다.
 * 키·네트워크 오류는 그대로 throw하고, "결과 없음"만 삼킨다.
 * 실패·타임아웃·파싱 실패는 빈 배열 반환, 예외 없음(채널 단위).
 */
export async function searchKosis(query, { display = 3, stage } = {}) {
  if (!query || typeof query !== 'string') return [];
  if (!process.env.KOSIS_API_KEY) return [];

  const words = query.trim().split(/\s+/).filter(Boolean);
  const ctxWords = stageWords(stage);
  const ruleWords = ctxWords.filter((w) => STATS_RULE.test(w));

  // 검색어 후보: 전체 → 앞 둘 → (첫 낱말 + 규칙 낱말) → 첫 낱말.
  // 단계는 최대 5개까지.
  const forms = [...new Set([
    words.join(' '),
    words.slice(0, 2).join(' '),
    ...ruleWords.slice(0, 2).map((w) => `${words[0] ?? ''} ${w}`.trim()),
    words[0] ?? '',
  ].filter(Boolean))].slice(0, 5);

  // 얹은 규칙 낱말 자신은 상관성의 증거로 세지 않는다 —
  // 「공예 예산」이 「에너지 연구개발 공공예산」을 물어 온다(실측).
  const injected = new Map(
    ruleWords.slice(0, 2).map((w) => [`${words[0] ?? ''} ${w}`.trim(), w])
  );

  let lastErr = null;
  let firstHit = null;

  for (const q of forms) {
    try {
      const out = await trySearchKm(q, display);
      if (out.length === 0) continue;
      if (!firstHit) firstHit = out;
      // 단계 글이 없으면 고를 잣대가 없다 — 종전대로 첫 결과
      if (ctxWords.length === 0) return out;
      const skip = injected.get(q);
      if (out.some((r) =>
        ctxWords.some((w) => w !== skip && w.length >= 2 && String(r.title).includes(w))
      )) {
        return out;
      }
    } catch (e) {
      lastErr = e;
      if (!/kosis 30/.test(String(e.message))) throw e; // 30 = 결과 없음. 그 밖(키·네트워크)은 바로 올린다
    }
  }

  if (firstHit) return firstHit;
  if (lastErr && !/kosis 30/.test(String(lastErr.message))) throw lastErr;
  return [];
}

// --- 내부: 단일 검색 시도 (throw 없이 결과만 반환) ---

/**
 * KOSIS 통계표 검색을 한 번 시도한다.
 * searchNm: 검색할 통계표명(검색어).
 * display: 반환할 최대 결과 수.
 * 반환: Result[] (중복 제거된 최대 display건). 0건이면 [].
 * HTTP 오류(키·네트워크)는 throw, 타임아웃·파싱 실패·0건은 빈 배열.
 */
async function trySearchKm(searchNm, display = DISPLAY) {
  const params = new URLSearchParams({
    method: 'getList',
    apiKey: process.env.KOSIS_API_KEY,
    searchNm,
    format: 'json',
    jsonVD: 'Y',
    startCount: '1',
    resultCount: String(display),
    sort: 'RANK',
  });

  const url = `${KOSIS_SEARCH_URL}?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      // HTTP 오류: 키·네트워크 오류로 보고 그대로 throw.
      throw new Error(`KOSIS 검색 요청 실패 (${res.status})`);
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // 파싱 실패: 빈 배열 반환 (예외 없음, 채널 단위).
      return [];
    }

    const rawRows = extractRows(data);
    if (rawRows.length === 0) return [];

    // TBL_ID 기준 중복 제거 후 display건까지만.result로 변환.
    const seen = new Set();
    const out = [];
    for (const raw of rawRows) {
      const key = raw.tableId;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const row = statRowToResult(raw, out.length);
      out.push(row);
      if (out.length >= display) break;
    }
    return out;
  } catch (err) {
    clearTimeout(timer);
    // AbortError(타임아웃)·네트워크 실패는 빈 배열로 처리.
    if (err.name === 'AbortError' || err.code === 'AbortError') {
      return [];
    }
    // 그 외 오류는 키·네트워크 오류로 보고 그대로 throw.
    throw err;
  }
}

// --- 내부: KOSIS 응답 파싱 ---

/**
 * KOSIS 통계표 검색 JSON 응답에서 통계표 행 배열을 뽑는다.
 * 응답 구조가 여러 형태일 수 있어 방어적으로 파싱한다.
 * 각 행은 { title, org, tableId, snippet } 정도로 정규화한다.
 */
function extractRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map((r) => mapRow(r)).filter(Boolean);
  }
  if (typeof data !== 'object') return [];

  // 객체 응답: 여러 후보 키에서 행 배열을 찾는다.
  const top = data.StatisticsSearch || data.statisticsSearch || data;
  if (!top || typeof top !== 'object') return [];

  let rows = null;
  if (Array.isArray(top.row)) rows = top.row;
  else if (Array.isArray(top.rows)) rows = top.rows;
  else if (Array.isArray(top.result)) rows = top.result;
  else if (Array.isArray(top.list)) rows = top.list;
  else if (Array.isArray(top.searchList)) rows = top.searchList;
  else if (Array.isArray(data.row)) rows = data.row;
  else if (Array.isArray(data.rows)) rows = data.rows;

  if (!rows) return [];
  return rows.map(mapRow).filter(Boolean);
}

function mapRow(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const title =
    raw.TBL_NM || raw.tblNm || raw.tableName || raw.table_title || raw.title || '';
  if (!title) return null;

  const org =
    raw.ORG_NM || raw.ORG_NAME || raw.orgName || raw.org_nm || '';
  const statName =
    raw.STAT_NM || raw.statName || raw.STATISTICS_NAME || raw.statisticsName || '';
  const start = raw.STRT_PRD_DE || '';
  const end = raw.END_PRD_DE || '';
  const prdDe = (start || end) ? [start, end].filter(Boolean).join('~') : '';

  const tableId =
    raw.TBL_ID || raw.tblId || raw.tableId || '';
  const linkUrl =
    raw.LINK_URL || raw.linkUrl || raw.LINKURL || '';
  const viewUrl =
    raw.TBL_VIEW_URL || raw.tblViewUrl || raw.TBL_VIEWURL || '';

  const snippet = [org, statName, prdDe].filter(Boolean).join(' · ') || '';

  return {
    title: String(title).trim(),
    org: String(org).trim(),
    tableId: String(tableId).trim(),
    linkUrl: String(linkUrl).trim(),
    viewUrl: String(viewUrl).trim(),
    snippet: String(snippet).trim(),
  };
}

// --- 내부: 통계표 행 → Result 변환 ---

/**
 * 정규화된 통계표 행 하나를 Result 객체로 변환한다.
 * id와 form은 반환 직전에만 붙인다.
 */
function statRowToResult(row, idx) {
  const url = buildTableUrl(row);
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  return {
    id: `kosis-${idx}`,
    title: row.title || '',
    url,
    snippet: row.snippet || '',
    host,
    form: 'table',
  };
}

// --- 내부: 통계표 URL 구성 ---

/**
 * KOSIS 통계표 상세 URL을 구성한다.
 * tblId가 있으면 통계표 상세 페이지 URL을, 없으면 KOSIS 검색 결과 URL을 쓴다.
 */
function buildTableUrl(row) {
  const linkUrl = row.linkUrl;
  if (linkUrl) {
    try {
      const parsed = new URL(linkUrl);
      // 호스트가 KOSIS면 그대로 사용
      if (parsed.hostname.endsWith('kosis.kr')) return parsed.toString();
    } catch {}
  }
  const tblId = row.tableId;
  if (tblId) {
    return `https://kosis.kr/statHtml/statHtml.do?tblId=${encodeURIComponent(tblId)}`;
  }
  const viewUrl = row.viewUrl;
  if (viewUrl) {
    try {
      const parsed = new URL(viewUrl);
      if (parsed.hostname.endsWith('kosis.kr')) return parsed.toString();
    } catch {}
  }
  const q = encodeURIComponent(row.title);
  return `https://kosis.kr/statisticsList/statisticsListIndex.do?menuId=M_01_01&vwcd=MT_ZTITLE&parmTabId=M_01_01&searchNm=${q}`;
}
