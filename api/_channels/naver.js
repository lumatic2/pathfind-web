// api/channels/naver.js — 네이버 검색 OpenAPI 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchNaver.

/**
 * 채널 이름. 고정 문자열.
 */
export const name = 'naver';

/**
 * 네이버 검색 OpenAPI 사용 가능 여부.
 * NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 둘 다 있으면 true, 없으면 false.
 * 예외는 내지 않는다.
 */
export function available() {
  try {
    return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  } catch {
    return false;
  }
}

/**
 * 네이버 검색 OpenAPI로 검색.
 * query: 검색어, kind: webkr | blog | cafearticle, display: 기본값 3. 기본 kind는 webkr.
 * 요청 타임아웃 10초. 실패·타임아웃은 빈 배열 반환, 예외 없음.
 * 반환: Result[] = { id, title, url, snippet, host, form }
 * blog 결과는 form: 'blog', cafearticle 결과는 form: 'cafe', webkr 결과는 form: undefined(생략).
 */
export async function searchNaver(query, kind = 'webkr', display = 3) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  if (kind !== 'webkr' && kind !== 'blog' && kind !== 'cafearticle') return [];

  const params = new URLSearchParams({ query, display: String(display), start: '1' });
  const url = `https://openapi.naver.com/v1/search/${kind}.json?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': id,
        'X-Naver-Client-Secret': secret,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const data = await res.json();
    const items = data.items || [];

    return items.slice(0, display).map((item, idx) => {
      const title = stripTags(item.title || '');
      const snippet = stripTags(item.description || '');
      const rawUrl = item.link || '';
      let host = '';
      try {
        host = new URL(rawUrl).hostname;
      } catch {
        host = '';
      }
      const result = {
        id: `naver-${kind}-${idx}`,
        title,
        url: rawUrl,
        snippet,
        host,
      };
      if (kind === 'blog') result.form = 'blog';
      else if (kind === 'cafearticle') result.form = 'cafe';
      return result;
    });
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** HTML 태그 제거 (b, br 등) 및 &nbsp; 처리. */
function stripTags(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}
