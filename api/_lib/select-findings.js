// api/_lib/select-findings.js — 자료 여섯 칸을 정할 때 웹 상한·비웹 우선·밀린 웹 보존을 적용한다
// stage.js 최종 목록 결정 시점에 부른다. 계약: docs/api-contract.md §7.

const MAX_FINDINGS = 6;
const WEB_CAP = 4;
const NON_WEB_CHANNELS = new Set(['law', 'stats', 'public_data']);

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
export function normalizeCandidate(c) {
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
 * - 법령·통계·공공데이터 후보가 전체 후보에 있으면 web 상한을 4로 적용하고 비웹을 먼저 두는 round-robin 정렬을 한다 (orderPicksWithWebCap).
 * - 상한에 밀린 웹은 버리지 않고 deferredWeb으로 남긴다.
 * - 비웹 후보가 없거나 다 채우지 못하면 빈 칸에 웹을 다시 넣는다.
 * - 같은 자료를 두 번 넣지 않는다(id 기준).
 * - 뜻 판정을 안 받은 세 채널(law/stats/public_data) 자료는 채우지 않는다(이미 선택된 것까지만 존재).
 *
 * @param {object[]} selected   - 현재 고른 자료 (검토 통과, finding 형태)
 * @param {object[]} candidates - 전체 후보 (카탈로그 값 전체, raw 형태)
 * @param {object[]} deferredWeb - 상한에 밀려 보류된 웹 자료 (finding 형태)
 * @returns {{ findings: object[], deferredWeb: object[] }}
 */
export function selectFindings(selected, candidates, deferredWeb = []) {
  // E1 채널(법령·통계·공공데이터) 후보 존재 여부 — orderPicksWithWebCap의 fillable 기준
  const hasE1Candidate = candidates.some((c) => NON_WEB_CHANNELS.has(c.channel));

  // selected 중복 제거 (id 기준) — missingChannelPicks와 같은 접근
  const seen = new Set();
  const deduped = [];
  for (const f of selected) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    deduped.push(f);
  }

  const allSelectedIds = new Set(deduped.map((f) => f.id));

  // round-robin 정렬 + 웹 상한 (orderPicksWithWebCap)
  const groups = new Map();
  for (const f of deduped) {
    const ch = f.channel;
    if (!groups.has(ch)) groups.set(ch, []);
    groups.get(ch).push(f);
  }

  // 채널 순서: 비웹 먼저, 그다음 web (orderPicksWithWebCap 기준 — web_review는 비웹 tier로)
  const chOrder = [...groups.keys()].sort((a, b) => (a === 'web') - (b === 'web'));

  const effCap = hasE1Candidate ? WEB_CAP : Infinity;
  const order = [];
  const deferred = [];
  let webCount = 0;
  const maxLen = Math.max(0, ...[...groups.values()].map((g) => g.length));

  for (let i = 0; i < maxLen; i++) {
    for (const ch of chOrder) {
      const item = groups.get(ch)[i];
      if (!item) continue;
      // 웹 상한은 'web' 채널에만 적용 (orderPicksWithWebCap 기준)
      if (ch === 'web' && webCount >= effCap) {
        deferred.push(item);
        continue;
      }
      if (ch === 'web') webCount += 1;
      order.push(item);
    }
  }

  let result = order;
  let heldDeferred = [...deferred, ...deferredWeb];

  // 새 후보 중 쓸 수 없는 비웹(E1, 뜻 판정 대상)은 제외 — 남은 것만 채우기 후보로 둔다
  const fillable = candidates.filter((c) => {
    if (!c || !c.id) return false;
    // 원본 selected에 이미 있던 자료는 다시 넣지 않는다(밀려난 웹 포함)
    if (allSelectedIds.has(c.id)) return false;
    // E1 채널(법령·통계·공공데이터)은 뜻 판정을 받지 않으면 채우지 않는다
    if (NON_WEB_CHANNELS.has(c.channel)) return false;
    return true;
  });

  // 빈 칸 채우기: 비웹(oss) 먼저, 그다음 웹. 여전히 모자라면 미뤄 둔 웹으로 복구한다.
  if (result.length < MAX_FINDINGS) {
    const nonWebFill = fillable.filter((c) => c.channel === 'oss');
    const webFill = fillable.filter((c) => c.channel === 'web' || c.channel === 'web_review');
    for (const c of [...nonWebFill, ...webFill]) {
      if (result.length >= MAX_FINDINGS) break;
      result.push(normalizeCandidate(c));
    }
  }

  // 그래도 빈 칸이 남으면 보류한 웹(deferredWeb)으로 복구한다. 이미 들어간 id와 겹치지 않게.
  if (result.length < MAX_FINDINGS && heldDeferred.length > 0) {
    const resultIds = new Set(result.map((f) => f.id));
    for (const d of heldDeferred) {
      if (result.length >= MAX_FINDINGS) break;
      if (resultIds.has(d.id)) continue;
      result.push(d);
      resultIds.add(d.id);
    }
    heldDeferred = heldDeferred.filter((d) => !resultIds.has(d.id));
  }

  return { findings: result, deferredWeb: heldDeferred };
}

// ---------- 보충 후보 고르기 ----------

const SUPPLEMENT_MAX = 3;

/**
 * 카탈로그 값 목록에서, 이미 선택된 채널에 없고 대상 채널(law / stats / public_data)인
 * 후보를 채널별로 하나씩 골라 반환한다 (missingChannelPicks 방식).
 *
 * @param {object[]} catalogValues     - 카탈로그 값 전체 (raw 형태)
 * @param {Set<string>} selectedIds    - 이미 고른 자료 id 집합
 * @param {Set<string>} targetChannels - 대상 채널 (기본: NON_WEB_CHANNELS)
 * @returns {object[]}
 */
export function pickSupplementCandidates(catalogValues, selectedIds, targetChannels = NON_WEB_CHANNELS) {
  // 선택된 자료가 이미 어떤 채널을 포함하는지 파악
  const selectedChannels = new Set();
  for (const c of catalogValues) {
    if (c && c.id && selectedIds.has(c.id)) {
      selectedChannels.add(c.channel);
    }
  }

  const picked = [];
  for (const ch of targetChannels) {
    if (selectedChannels.has(ch)) continue;
    if (picked.length >= SUPPLEMENT_MAX) break;
    // 해당 채널에서 첫 후보 (selectedIds에 없고, catalogValues 중 처음 나온 것)
    const cand = catalogValues.find((c) => c && c.id && c.channel === ch && !selectedIds.has(c.id));
    if (cand) picked.push(cand);
  }
  return picked;
}
