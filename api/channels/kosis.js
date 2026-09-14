// api/channels/kosis.js — KOSIS 국가통계포털 통계표 검색 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchKosis.
// 구현: KOSIS OpenAPI 통계표 검색(통계목록 → KOSIS통합검색)을 직접 호출한다.
//        엔드포인트: https://kosis.kr/openapi/statisticsSearch.do?method=getList
//        요청변수: apiKey(필수), searchNm(필수), format, jsonVD, startCount, resultCount, sort.
//        jsonVD=Y로 표준 JSON 배열을 받는다. JSON.parse로 바로 읽는다.
//        이 API는 짧은 검색어(통계표명에 들어갈 낱말 하나·둘)에 잘 답하고
//        문장형 검색어에는 0건이 나온다. 그래서 검색어를 단계적으로 줄여 다시 찾는다.

const KOSIS_SEARCH_URL = 'https://kosis.kr/openapi/statisticsSearch.do';
const TIMEOUT_MS = 10000;
const DISPLAY = 3;

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

/**
 * KOSIS 통계표 검색을 수행한다.
 * query: 검색어(문장형일 수 있음).
 * 반환: Result[] = { id, title, url, snippet, host, form }.
 *       form은 'table'.
 * 검색 결과가 0건이면 검색어를 줄여(최대 2회 폴백) 다시 찾는다.
 * 키·네트워크 오류는 그대로 throw하고, "결과 없음" 오류만 삼킨다.
 * 실패·타임아웃·파싱 실패는 빈 배열 반환, 예외 없음(채널 단위).
 */
export async function searchKosis(query) {
  if (!query || typeof query !== 'string') return [];
  if (!process.env.KOSIS_API_KEY) return [];

  const tried = await trySearchKm(query);
  if (tried.length > 0) return tried;

  // 0건이면 검색어를 줄여 다시 시도
  return fallbackSearch(query);
}

// --- 내부: 단일 검색 시도 (throw 없이 결과만 반환) ---

async function trySearchKm(searchNm) {
  const params = new URLSearchParams({
    method: 'getList',
    apiKey: process.env.KOSIS_API_KEY,
    searchNm,
    format: 'json',
    jsonVD: 'Y',
    startCount: '1',
    resultCount: String(DISPLAY),
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
    const rows = extractRows(data);

    if (rows.length === 0) {
      return [];
    }

    return rows.map((row, idx) => {
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
    });
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

// --- 내부: 검색 결과 없음일 때만 검색어를 줄여 재시도 ---

async function fallbackSearch(originalQuery) {
  // 문장형·긴 검색어 대응: 공백 기준 분할 → 3자 이상 낱말만 → 앞 둘 → 앞 한 단어.
  const words = originalQuery.split(/[\s\u0020\u3000]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  // 전체 검색어 자체를 한 번 더 확인하는 건 trySearchKm에서 이미 했으므로
  // 여기서는 단어 기반 축소만 수행한다.
  const meaningful = words.filter((w) => w.length >= 3);
  const candidates = [];

  if (meaningful.length >= 2) {
    candidates.push(meaningful.slice(0, 2).join(' '));
  }
  if (meaningful.length >= 1) {
    candidates.push(meaningful[0]);
  }

  // 후보 중 앞쪽부터 시도하고, 결과가 나오면 바로 반환.
  for (const cand of candidates) {
    const result = await trySearchKm(cand);
    if (result.length > 0) return result;
  }

  // 모든 후보가 0건이면 빈 배열.
  return [];
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
