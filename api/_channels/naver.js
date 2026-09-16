// api/channels/naver.js — 네이버 검색 OpenAPI 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchNaver, stripHtml, reviewScore, rankReviews.

/** 채널 이름. 고정 문자열. */
export const name = 'naver';

/** 네이버 검색 OpenAPI 사용 가능 여부. NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 둘 다 있으면 true, 없으면 false. 예외는 내지 않는다. */
export function available() {
  try {
    return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  } catch {
    return false;
  }
}

/** HTML 태그·엔티티 제거(&quot; &amp; &lt; &gt; &#39; &nbsp; 포함) 및 공백 정규화. 근거는 축자로 실리므로 표시 태그가 남으면 안 된다. */
export function stripHtml(s) {
  return String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 네이버 검색 OpenAPI로 검색.
 * 인수: (query, options) 또는 레거시 (query, kind, display).
 * options: { kind?: 'webkr'|'blog'|'cafearticle'|'news', display?: number }
 * 기본 kind: 'webkr', 기본 display: 5. 요청 타임아웃 15초.
 * 인증 없으면 빈 배열 반환. HTTP 실패는 상태를 포함한 오류를 던짐, 네트워크 오류도 호출부로 전달.
 * 반환: Result[] = { id, title, url, snippet, host, form? }
 * blog 결과는 form: 'blog', cafearticle 결과는 form: 'cafe', webkr 결과는 form: undefined(생략).
 */
export async function searchNaver(query, options = {}) {
  // 레거시 위치 인자 호출(searchNaver(query, kind), searchNaver(query, kind, display))도 받는다.
  let kind = 'webkr';
  let display = 5;
  if (typeof options === 'string') {
    kind = options;
  } else if (typeof options === 'number') {
    display = options;
  } else if (typeof options === 'object' && options !== null) {
    kind = options.kind || 'webkr';
    display = options.display != null ? options.display : 3;
  }

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  if (kind !== 'webkr' && kind !== 'blog' && kind !== 'cafearticle' && kind !== 'news') return [];

  const params = new URLSearchParams({ query, display: String(display), start: '1' });
  const url = `https://openapi.naver.com/v1/search/${kind}.json?${params.toString()}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Naver-Client-Id': id,
        'X-Naver-Client-Secret': secret,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`naver ${kind} ${res.status}`);

    const data = await res.json();
    const items = data.items || [];

    return items.slice(0, display).map((item, idx) => {
      const title = stripHtml(item.title || '');
      const snippet = stripHtml(item.description || '');
      const rawUrl = item.link || item.originallink || '';
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
    }).filter(x => x.url.startsWith('http') && x.title);
  } catch (e) {
    throw e;
  }
}

/** 후기다움 — 블로그·카페 결과가 실제로 「먼저 해 본 사람의 기록」인가. ⚠️ 검색어를 고치는 처방이 아니다. 받은 뒤에 잰다. ⚠️ 버리지 않는다. 순서만 바꾼다. */
const REVIEW_MARKS = /후기|리뷰|체험기|방문기|다녀왔|다녀온|해봤|해본|배웠|들어봤|솔직|경험|수강|참가|가봤|먹어봤|만들어\s?봤/;
const NOT_REVIEW_MARKS = /나무위키|위키백과|백과사전|리스트|목록|모집\s?안내|공지|주요업무|계획서|최저가|쿠폰|판매|구매|세트|원단|해외선물|종목|신고가|알라딘서재/;

/** 제목·본문에서 후기다움 점수를 낸다. 높을수록 후기답다(0 이 기본, 음수면 후기가 아닐 만한 신호가 있다). */
export function reviewScore(item) {
  const hay = `${item?.title ?? ''} ${item?.snippet ?? ''}`;
  let score = 0;
  if (REVIEW_MARKS.test(hay)) score += 2;
  if (NOT_REVIEW_MARKS.test(hay)) score -= 2;
  const title = String(item?.title ?? '');
  if (title && (title.match(/[0-9]/g) ?? []).length / title.length > 0.25) score -= 1;
  return score;
}

/** 후기다움 높은 것부터. 같은 점수면 원래 순서를 지킨다(안정 정렬). 건수는 손대지 않는다. 후기다운 것이 하나도 없으면 순서를 손대지 않는다. */
export function rankReviews(items) {
  const list = [...(items ?? [])];
  if (!list.some((x) => reviewScore(x) > 0)) return list;
  return list
    .map((x, i) => ({ x, i, s: reviewScore(x) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ x }) => x);
}
