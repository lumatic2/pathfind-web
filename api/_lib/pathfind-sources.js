// api/_lib/pathfind-sources.js — 선행 조사 자료 수집
// 계약: docs/api-contract.md §planning.sources, §trace.
// export: collectPlanningSources.
//
// 두 검색어와 세 채널(webkr, blog, cafearticle)의 결과 여섯 묶음을 받아
// 각 순위마다 검색어·채널 순으로 번갈아 담되 중복 URL은 합치고
// 최대 15개 자료를 남긴다. 제목 300자, 발췌 800자 제한.
// 안전한 웹 주소(http/https)만 남기고 서버에서 안정적인 자료 식별자를 붙인다.
// 같은 자료가 여러 검색어에 나오면 queries 배열에 모은다.

/** URL 해싱으로 안정적인 자료 식별자 생성. */
function makeId(url) {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return `src-${(h >>> 0).toString(36)}`;
}

/** 안전한 웹 주소만 남긴다 (http/https). */
function cleanUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

/** 문자열 길이 제한. */
function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * 두 검색어와 세 채널의 결과 여섯 묶음을 받아 중복을 제거하고 최대 15개 자료를 수집한다.
 *
 * @param {string} query1 - 첫 번째 검색어
 * @param {string} query2 - 두 번째 검색어
 * @param {Array<{id,title,url,snippet,host}>} webkr1 - 검색어1의 webkr 채널 결과
 * @param {Array<{id,title,url,snippet,host}>} blog1 - 검색어1의 blog 채널 결과
 * @param {Array<{id,title,url,snippet,host}>} cafearticle1 - 검색어1의 cafearticle 채널 결과
 * @param {Array<{id,title,url,snippet,host}>} webkr2 - 검색어2의 webkr 채널 결과
 * @param {Array<{id,title,url,snippet,host}>} blog2 - 검색어2의 blog 채널 결과
 * @param {Array<{id,title,url,snippet,host}>} cafearticle2 - 검색어2의 cafearticle 채널 결과
 * @returns {Array<{id,title,url,snippet,queries,channel,accessedAt,readScope}>}
 */
export function collectPlanningSources(query1, query2, webkr1, blog1, cafearticle1, webkr2, blog2, cafearticle2) {
  const sources = [];
  const urlIndex = new Map();

  // 채널 순서: 각 채널 내에서 검색어1, 검색어2 번갈아
  const channels = [
    { name: 'webkr', results: webkr1, query: query1 },
    { name: 'webkr', results: webkr2, query: query2 },
    { name: 'blog', results: blog1, query: query1 },
    { name: 'blog', results: blog2, query: query2 },
    { name: 'cafearticle', results: cafearticle1, query: query1 },
    { name: 'cafearticle', results: cafearticle2, query: query2 },
  ];

  // 최대 순위 (가장 긴 채널의 길이)
  const maxRank = Math.max(
    webkr1.length, webkr2.length, blog1.length, blog2.length,
    cafearticle1.length, cafearticle2.length
  );

  for (let rank = 0; rank < maxRank && sources.length < 15; rank++) {
    for (const ch of channels) {
      if (sources.length >= 15) break;
      const item = ch.results[rank];
      if (!item) continue;

      const url = cleanUrl(item.url);
      if (!url) continue;

      // 제목·발췌 길이 제한
      const title = truncate(item.title || '', 300);
      const snippet = truncate(item.snippet || '', 800);

      // 중복 URL 검사
      if (urlIndex.has(url)) {
        const existing = sources[urlIndex.get(url)];
        if (!existing.queries.includes(ch.query)) {
          existing.queries.push(ch.query);
        }
        continue;
      }

      // 새 자료 생성
      const source = {
        id: makeId(url),
        title,
        url,
        snippet,
        queries: [ch.query],
        channel: ch.name,
        accessedAt: new Date().toISOString(),
        readScope: 'search-snippet',
      };

      urlIndex.set(url, sources.length);
      sources.push(source);
    }
  }

  return sources;
}
