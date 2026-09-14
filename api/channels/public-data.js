// api/channels/public-data.js — 공공데이터포털(data.go.kr) 데이터셋 검색 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchPublicData.
// 구현: 공공데이터포털에 목록 검색 API가 없으므로 네이버 웹 검색에
//        site:data.go.kr을 붙인 한 방으로 데이터셋 페이지를 찾는다.
//        DATA_GO_KR_KEY는 목록 찾기에 필요 없으므로 쓰지 않는다.

import { searchNaver } from './naver.js';

/** 채널 이름. 고정 문자열. */
export const name = 'public-data';

/**
 * 공공데이터포털 데이터셋 검색 사용 가능 여부.
 * NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 둘 다 있으면 true, 없으면 false.
 * public-data는 네이버 검색에 의존하므로 네이버 키가 있어야 쓸 수 있다.
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
 * 네이버 웹 검색으로 data.go.kr 데이터셋 페이지를 찾는다.
 * query: 검색어.
 * 반환: Result[] = { id, title, url, snippet, host, form }.
 *       form은 'dataset'.
 * 실패·타임아웃·키 없음은 빈 배열 반환, 예외 없음.
 */
export async function searchPublicData(query) {
  if (!query || typeof query !== 'string') return [];

  const prefixed = `site:data.go.kr ${query}`;
  const items = await searchNaver(prefixed, 'webkr', 3);

  // 공공데이터포털(dataset) 결과만 남긴다. 다른 호스트가 섞이면 제외.
  const filtered = items.filter((item) => {
    try {
      const host = new URL(item.url).hostname;
      return host === 'data.go.kr' || host.endsWith('.data.go.kr');
    } catch {
      return false;
    }
  });

  return filtered.map((item, idx) => ({
    ...item,
    id: `public-data-${idx}`,
    form: 'dataset',
  }));
}
