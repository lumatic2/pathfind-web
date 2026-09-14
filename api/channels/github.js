// api/channels/github.js — GitHub 저장소 검색 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchGithub.

/**
 * 채널 이름. 고정 문자열.
 */
export const name = 'github';

/**
 * GitHub 저장소 검색 사용 가능 여부.
 * GITHUB_MCP_TOKEN은 선택. 없어도 익명 한도로 동작하므로 항상 true.
 * 예외는 내지 않는다.
 */
export function available() {
  return true;
}

/**
 * GitHub 저장소 검색 엔드포인트로 stars 정렬 검색.
 * query: 검색어, display: 기본값 3.
 * GITHUB_MCP_TOKEN이 있으면 헤더에 넣고, 없으면 익명 요청.
 * 요청 타임아웃 10초. 실패·타임아웃은 빈 배열 반환, 예외 없음.
 * 반환: Result[] = { id, title, url, snippet, host, form: 'repo' }
 */
export async function searchGithub(query, display = 3) {
  const token = process.env.GITHUB_MCP_TOKEN;
  const params = new URLSearchParams({
    q: query,
    sort: 'stars',
    order: 'desc',
    per_page: String(display),
  });
  const url = `https://api.github.com/search/repositories?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];

    const data = await res.json();
    const items = data.items || [];

    return items.slice(0, display).map((item, idx) => {
      const stars = item.stargazers_count != null ? item.stargazers_count : 0;
      const snippet = (item.description || '') + ` (⭐ ${stars})`;
      const rawUrl = item.html_url || '';
      let host = '';
      try {
        host = new URL(rawUrl).hostname;
      } catch {
        host = '';
      }
      return {
        id: `github-${idx}`,
        title: item.name || `저장소 ${idx}`,
        url: rawUrl,
        snippet,
        host,
        form: 'repo',
      };
    });
  } catch {
    clearTimeout(timer);
    return [];
  }
}
