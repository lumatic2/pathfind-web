// api/channels/github.js — GitHub 저장소 검색 채널
// 계약: docs/api-contract.md §조사 채널.
// export: name, available, searchGithub.

/** * 채널 이름. 고정 문자열. */
export const name = 'github';

/** * GitHub 저장소 검색 사용 가능 여부. * GITHUB_MCP_TOKEN은 선택. 없어도 익명 한도로 동작하므로 항상 true. * 예외는 내지 않는다. */
export function available() {
  return true;
}

/** * GitHub 저장소 검색 엔드포인트로 stars 정렬 검색. * query: 검색어, options: { display?: number } (기본 3). * GITHUB_MCP_TOKEN이 있으면 헤더에 넣고, 없으면 익명 요청. * 요청 타임아웃 15초. 한국어 검색어는 에러 던짐, 실패는 던짐. * 반환: Result[] = { id, title, url, snippet, host, form: 'repo' } */
export async function searchGithub(query, options = {}) {
  const display = options.display ?? 3;

  // 한국어 검색어는 0건이 난다(실측 — 모델이 한국어로 부르면 결과 0). 오류를 돌려주면 모델이 도구 결과에서 보고 영문으로 다시 부른다.
  if (/[가-힣]/.test(String(query))) throw new Error('oss_search 는 영문 키워드만 받습니다 — 예: cafe reservation booking');

  // readme 까지 넣으면 「awesome-*」목록이 별 수로 앞에 선다(실측) — 이름·설명만 본다
  const q = `${query} in:name,description`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${display}`;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'pathfind-reference-app' };
  if (process.env.GITHUB_MCP_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_MCP_TOKEN}`;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`github ${r.status}`);
  const data = await r.json();
  return (data.items ?? []).slice(0, display).map((it, idx) => ({
    id: `github-${idx}`,
    title: it.full_name,
    url: it.html_url,
    snippet: [it.description ?? '', `★ ${it.stargazers_count ?? 0}`, it.language ? `언어 ${it.language}` : '', it.pushed_at ? `최근 push ${String(it.pushed_at).slice(0, 10)}` : '', it.license?.spdx_id && it.license.spdx_id !== 'NOASSERTION' ? `라이선스 ${it.license.spdx_id}` : ''].filter(Boolean).join(' · '),
    host: 'github.com',
    form: 'repo',
  }));
}
