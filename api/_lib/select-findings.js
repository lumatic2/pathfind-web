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
 * - 채울 때 쓸 수 없는 비웹 후보(예: 법령 검토 탈락)는 건너뛰고, 빈 칸은 미뤄 둔 웹(deferredWeb)으로 먼저 복구한다.
 *
 * @param {object[]} selected   - 현재 고른 자료 (검토 통과, finding 형태)
 * @param {object[]} candidates - 전체 후보 (카탈로그 값 전체, raw 형태)
 * @param {object[]} deferredWeb - 상한에 밀려 보류된 웹 자료 (finding 형태)
 * @returns {{ findings: object[], deferredWeb: object[] }}
 */
export function selectFindings(selected, candidates, deferredWeb = []) {
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
  let heldDeferred = deferredWeb;

  // 웹 상한 적용 (법령·통계·공공데이터 후보가 있을 때만)
  if (hasNonWebCandidate) {
    const webItems = result.filter((f) => WEB_CHANNELS.has(f.channel));
    const nonWebItems = result.filter((f) => !WEB_CHANNELS.has(f.channel));
    if (webItems.length > WEB_CAP) {
      heldDeferred = [...webItems.slice(WEB_CAP), ...heldDeferred];
      result = [...nonWebItems, ...webItems.slice(0, WEB_CAP)];
    }
  }

  // 새 후보 중 쓸 수 없는 비웹(예: 검토 탈락 법령)은 제외 — 남은 것만 채우기 후보로 둔다
  const fillable = candidates.filter((c) => {
    // 원본 selected에 이미 있던 자료는 다시 넣지 않는다(밀려난 웹 포함)
    if (allSelectedIds.has(c.id)) return false;
    // 쓸 수 없는 비웹(뜻 판정 대상 중 검토 통과 못 한 채널)은 채우지 않는다
    if (c.channel === 'law' || c.channel === 'stats' || c.channel === 'public_data') return false;
    if (WEB_CHANNELS.has(c.channel)) return true;
    if (c.channel === 'oss') return true;
    return false;
  });

  // 빈 칸 채우기: 비웹(oss) 먼저, 그다음 웹. 여전히 모자라면 미뤄 둔 웹으로 복구한다.
  if (result.length < MAX_FINDINGS) {
    const nonWebFill = fillable.filter((c) => c.channel === 'oss');
    const webFill = fillable.filter((c) => WEB_CHANNELS.has(c.channel));
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
    // 복구에 쓴 것은 deferred에서 뺀다
    heldDeferred = heldDeferred.filter((d) => !resultIds.has(d.id));
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
    // 복구에 쓴 것은 deferred에서 뺀다
    heldDeferred = heldDeferred.filter((d) => !resultIds.has(d.id));
  }

  return { findings: result, deferredWeb: heldDeferred };
}

// ---------- 보충 후보 고르기 ----------

const SUPPLEMENT_MAX = 3;

/**
 * 카탈로그 값 목록에서, 이미 선택된 ids에 없고 대상 채널(law / stats / public_data)인
 * 후보를 상한(SUPPLEMENT_MAX) 내로 골라 반환한다.
 *
 * @param {object[]} catalogValues     - 카탈로그 값 전체 (raw 형태)
 * @param {Set<string>} selectedIds    - 이미 고른 자료 id 집합
 * * @param {Set<string>} targetChannels - 대상 채널 (기본: NON_WEB_CHANNELS)
 * @returns {object[]}
 */
export function pickSupplementCandidates(catalogValues, selectedIds, targetChannels = NON_WEB_CHANNELS) {
  const picked = [];
  for (const c of catalogValues) {
    if (!c || !c.id) continue;
    if (selectedIds.has(c.id)) continue;
    if (!targetChannels.has(c.channel)) continue;
    if (picked.length >= SUPPLEMENT_MAX) break;
    picked.push(c);
  }
  return picked;
}
