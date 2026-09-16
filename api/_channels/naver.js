// api/channels/naver.js — 네이버 검색 OpenAPI 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchNaver, stripHtml, reviewScore, rankReviews.

/** * 채널 이름. 고정 문자열. */
export const name = 'naver';

/** * 네이버 검색 OpenAPI 사용 가능 여부. * NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 둘 다 있으면 true, 없으면 false. * 예외는 내지 않는다. */
export function available() {
  return Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

/** 네이버 검색 결과의 `<b>`·엔티티를 벗긴다 — 근거는 축자로 실리므로 표시 태그가 남으면 안 된다 */
export function stripHtml(s) {
  return String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** * 네이버 검색 OpenAPI로 검색. * query: 검색어, options: { kind?: 'webkr'|'blog'|'cafearticle'|'news', display?: number }. * 기본 kind: 'webkr', 기본 display: 5. * 요청 타임아웃 15초. 실패·인증없음은 빈 배열 반환, HTTP 에러는 던짐. * 반환: Result[] = { id, title, url, snippet, host, form? } */
export async function searchNaver(query, options = {}) {
  // 기존 위치 인자 호출(searchNaver(query, kind, display))도 받는다 — 두 번째 인자가 문자열이면 kind, 숫자면 display였던 기존 계약을 options로 편입.
  let kind = 'webkr';
  let display = 5;
  if (typeof options === 'object' && options !== null) {
    kind = options.kind || 'webkr';
    display = options.display != null ? options.display : 5;
  } else if (typeof options === 'string') {
    kind = options;
  } else if (typeof options === 'number') {
    display = options;
  }
  if (!available()) return [];
  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=${display}`;
  const r = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`naver ${kind} ${r.status}`);
  const data = await r.json();
  return (data.items ?? [])
    .map((it) => {
      const link = String(it.link ?? it.originallink ?? '');
      let host = '';
      try { host = new URL(link).hostname; } catch { /* 링크가 아니면 버린다 */ }
      return { title: stripHtml(it.title), url: link, snippet: stripHtml(it.description), host };
    })
    .filter((x) => x.url.startsWith('http') && x.title);
}

/** * 후기다움 — 블로그·카페 결과가 실제로 「먼저 해 본 사람의 기록」인가. * ⚠️ 검색어를 고치는 처방이 아니다. 받은 뒤에 잰다. * ⚠️ 버리지 않는다. 순서만 바꾼다. */
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

/** * 후기다움 높은 것부터. 같은 점수면 원래 순서를 지킨다(안정 정렬). 건수는 손대지 않는다. * 후기다운 것이 하나도 없으면 순서를 손대지 않는다. */
export function rankReviews(items) {
  const list = [...(items ?? [])];
  if (!list.some((x) => reviewScore(x) > 0)) return list;
  return list
    .map((x, i) => ({ x, i, s: reviewScore(x) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ x }) => x);
}
