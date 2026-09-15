// api/_lib/select-findings.js — 자료 여섯 칸을 정할 때 웹 상한·비웹 우선·밀린 웹 보존을 적용한다
// stage.js 최종 목록 결정 시점에 부른다. 계약: docs/api-contract.md §7.

const MAX_FINDINGS = 6;
const WEB_CAP = 4;
const NON_WEB_CHANNELS = new Set(['law', 'stats', 'public_data']);
const WEB_CHANNELS = new Set(['web', 'web_review']);

/** 웹 호스트 기반 kind (웹만). */
function kindForWebByHost(host) {
  const h = ((host || '')).toLowerCase();
  if (h.includes('github.com') || h.includes('gitlab.com') || h.includes('sourceforge.net'))
    return '오픈소스';
  if (h.includes('freepik') || h.includes('asset') || h.includes('icon') || h.includes('font') || h.includes('unsplash') || h.includes('pexels'))
    return '무료 에셋';
  if (h.includes('blog') || h.includes('tutorial') || h.includes('guide') || h.includes('medium.com') || h.includes('dev.to') || h.includes('tistory') || h.includes('velog'))
    return '튜토리얼·블로그';
  return '참고 사례';
}

/** 채널별 kind (비웹만 여기서 결정, 웹은 위 함수로). */
function kindForChannel(channel) {
  switch (channel) {
    case 'oss':
      return '오픈소스';
    case 'public_data':
      return '공공데이터';
    case 'stats':
      return '통계';
    case 'law':
      return '법령';
    default:
      return '참고 사례';
  }
}

/** 등급 (코드 결정). */
function gradeFor(host, channel, form) {
  if (channel === 'web_review') {
    if (form === 'blog') return 'E4';
    if (form === 'cafe') return 'E5';
    return 'E3';
  }
  const h = ((host || '')).toLowerCase();
  if (channel === 'law' || channel === 'stats' || channel === 'public_data') return 'E1';
  if (channel === 'oss') return 'E2';
  if (h.startsWith('go.kr') || h.startsWith('or.kr') || h.startsWith('re.kr') || h.startsWith('ac.kr') || h.startsWith('gov') || h.startsWith('edu') || h.startsWith('github') || h.startsWith('gitlab') || h.startsWith('npmjs') || h.startsWith('pypi') || h.startsWith('docs') || h.startsWith('developers'))
    return 'E2';
  if (h.startsWith('cafe.naver') || h.startsWith('kin.naver') || h.startsWith('reddit') || h.startsWith('dcinside') || h.startsWith('clien') || h.startsWith('fmkorea') || h.startsWith('stackoverflow') || h.startsWith('ruliweb') || h.startsWith('ppomppu'))
    return 'E5';
  if (h.startsWith('blog') || h.startsWith('tistory') || h.startsWith('velog') || h.startsWith('medium') || h.startsWith('brunch') || h.startsWith('dev.to') || h.startsWith('post.naver'))
    return 'E4';
  return 'E3';
}

/** 후보 하나를 finding 형태로 만든다. */
function normalizeCandidate(c) {
  const channel = c.channel || 'web';
  const host =
    c.host ||
    ((() => {
      try {
        return new URL(c.url || '').hostname;
      } catch {
        return '';
      }
    })());
  return {
    id: c.id,
    name: c.title || '항목',
    kind: channel === 'web' ? kindForWebByHost(host) : kindForChannel(channel),
    note: c.note || '',
    url: c.url || '',
    evidence: (c.snippet || '').slice(0, 300),
    grade: gradeFor(host, channel, c.form || ''),
    channel,
  };
}

/**
 * 현재 고른 자료와 전체 후보를 받아 자료 여섯 칸을 정한다.
 * - 법령·통계·공공데이터 후보가 전체 후보에 있으면 web+web_review 합계를 4로 상한하고 비웹을 먼저 둔다.
 * - 상한에 밀린 웹은 버리지 않고 deferredWeb로 남긴다.
 * - 비웹 후보가 없거나 다 채우지 못하면 빈 칸에 웹을 다시 넣는다.
 * - 같은 자료를 두 번 넣지 않는다(id 기준).
 * - 뜻 판정을 안 받은 세 채널(law/stats/public_data) 자료는 채우지 않는다(이미 선택된 것까지만 존재).
 *
 * @param {object[]} selected   - 현재 고른 자료 (검토 통과, finding 형태)
 * @param {object[]} candidates - 전체 후보 (카탈로그 값 전체, raw 형태)
 * @returns {{ findings: object[], deferredWeb: object[] }}
 */
export function selectFindings(selected, candidates) {
  const hasNonWebCandidate = candidates.some((c) => NON_WEB_CHANNELS.has(c.channel));

  // selected 중복 제거 (id 기준)
  const seen = new Set();
  const deduped = [];
  for (const f of selected) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    deduped.push(f);
  }

  // 원본 selected에 있던 모든 id (상한 적용 전 기준) — 채울 때 중복 방지용
  const allSelectedIds = new Set(deduped.map((f) => f.id));

  let result = deduped;
  let deferredWeb = [];

  // 웹 상한 적용 (법령·통계·공공데이터 후보가 있을 때만)
  if (hasNonWebCandidate) {
    const webItems = result.filter((f) => WEB_CHANNELS.has(f.channel));
    const nonWebItems = result.filter((f) => !WEB_CHANNELS.has(f.channel));
    if (webItems.length > WEB_CAP) {
      deferredWeb = webItems.slice(WEB_CAP);
      result = [...nonWebItems, ...webItems.slice(0, WEB_CAP)];
    }
  }

  // 빈 칸 채우기
  if (result.length < MAX_FINDINGS) {
    const fillable = candidates.filter((c) => {
      // 원본 selected에 이미 있던 자료는 다시 넣지 않는다(밀려난 웹 포함)
      if (allSelectedIds.has(c.id)) return false;
      if (WEB_CHANNELS.has(c.channel)) return true;
      if (c.channel === 'oss') return true;
      return false;
    });
    const nonWebFill = fillable.filter((c) => c.channel === 'oss');
    const webFill = fillable.filter((c) => WEB_CHANNELS.has(c.channel));
    for (const c of [...nonWebFill, ...webFill]) {
      if (result.length >= MAX_FINDINGS) break;
      result.push(normalizeCandidate(c));
    }
  }

  return { findings: result, deferredWeb };
}
