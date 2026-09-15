// api/channels/law.js — 국가법령정보센터 오픈 API 채널
// 계약: docs/api-contract.md
// export: { name, lawAvailable, searchLaw }
// 결과: { id, title, url, snippet, host, form }[]  (form = 'law')

const NAME = 'law';

const LAW_SEARCH_BASE = 'https://www.law.go.kr/DRF/lawSearch.do';
const OC_PARAM = 'OC';
const PUBLIC_DETAIL_BASE = 'https://www.law.go.kr/LSW/lsInfoP.do';

// ---------- 가용성 ----------

/** LAW_API_OC 환경변수가 있으면 true. 예외는 내지 않는다. */
export function lawAvailable() {
  try {
    const v = process.env.LAW_API_OC;
    return typeof v === 'string' && v.trim().length > 0;
  } catch {
    return false;
  }
}

// ---------- 검색 ----------

/**
 * 국가법령정보센터 현행 법령 검색.
 * query: 검색어(문장형 가능, 내부적으로 힌트·낱말 폴백 적용)
 * display: 결과 개수(기본 15, 최대 20)
 * 반환: Result[] (form = 'law')
 */
export async function searchLaw(query, display = 15) {
  const oc = process.env.LAW_API_OC;
  if (!oc || !oc.trim()) return [];

  const clamped = Math.min(Math.max(1, display | 0), 20) || 15;

  // 1차: 원문 검색어로 시도
  let results = await searchOnce(query, oc, clamped);
  if (results.length > 0) {
    return sortResults(results);
  }

  // 2차: 이름 힌트 치환
  const hint = resolveLawHint(query);
  if (hint && hint !== query) {
    results = await searchOnce(hint, oc, clamped);
    if (results.length > 0) {
      return sortResults(results);
    }
  }

  // 3차: 낱말 폴백 (3자 이상 앞 두 개)
  const words = pickTwoLongWords(query);
  if (words) {
    results = await searchOnce(words, oc, clamped);
    if (results.length > 0) {
      return sortResults(results);
    }
  }

  return [];
}

// ---------- 내부: 1회 검색 ----------

async function searchOnce(query, oc, display) {
  const params = new URLSearchParams();
  params.set('target', 'law');
  params.set('type', 'JSON');
  params.set('query', query);
  params.set('display', String(display));
  params.set('search', '1'); // 법령명 검색
  params.set('mobileYn', 'Y');
  params.set(OC_PARAM, oc);

  const url = LAW_SEARCH_BASE + '?' + params.toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    return mapResults(data);
  } catch (err) {
    clearTimeout(timer);
    return [];
  }
}

// ---------- 응답 매핑 ----------

function mapResults(data) {
  const items = data?.results || data?.result || [];
  if (!Array.isArray(items)) return [];

  return items
    .map((item, idx) => {
      const rawTitle = item.법령명한글 || item.lawName || '';
      const title = (typeof rawTitle === 'string' ? rawTitle : String(rawTitle))
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!title) return null;

      const kind = item.법령구분명 || '';
      const org = item.소관부처명 || '';
      const effectiveRaw = item.시행일자 ?? item.efYd ?? '';
      const effective = formatDate(effectiveRaw);

      const rawDetail = item.법령상세링크 || '';
      const url = normalizeDetailUrl(rawDetail);

      const host = extractHost(url);

      const snippetParts = [kind, org, effective].filter(Boolean);
      const snippet = snippetParts.join(', ') || '';

      return {
        id: `law-${idx}`,
        title,
        url,
        snippet,
        host,
        form: 'law',
      };
    })
    .filter(Boolean);
}

// ---------- 상세 링크 정규화: OC 제거 + 공개 HTML URL ----------

/**
 * 법령상세링크에서 OC 파라미터와 그 값을 제거하고,
 * 공개 상세 조회 URL(type=HTML, mobileYn=Y) 형태로 되돌린다.
 * 상세 링크가 없으면 빈 문자열.
 */
function normalizeDetailUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  try {
    const parsed = new URL(raw);
    // OC 제거
    parsed.searchParams.delete(OC_PARAM);
    // 공개 상세 형태 보장: type=HTML, mobileYn=Y
    parsed.searchParams.set('type', 'HTML');
    parsed.searchParams.set('mobileYn', 'Y');
    return parsed.toString();
  } catch {
    // 상대경로·다른 형태면 그대로 두지 않고 빈 문자열 반환
    return '';
  }
}

// ---------- 호스트 추출 ----------

function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ---------- 날짜 포맷 (yyyymmdd → yyyy. mm. dd.) ----------

function formatDate(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  // yyyymmdd 또는 yyyy-mm-dd 형태 대응
  const digits = s.replace(/-/g, '');
  if (!/^\d{8}$/.test(digits)) return s;
  const yyyy = digits.slice(0, 4);
  const mm = digits.slice(4, 6);
  const dd = digits.slice(6, 8);
  return `${yyyy}. ${mm}. ${dd}.`;
}

// ---------- 정렬: 본법 우선, 이름 짧은 것 먼저 ----------

function sortResults(results) {
  return results.slice().sort((a, b) => {
    const aIsMain = isMainLaw(a.title);
    const bIsMain = isMainLaw(b.title);
    if (aIsMain && !bIsMain) return -1;
    if (!aIsMain && bIsMain) return 1;
    // 같은 층위에서는 이름 짧은 것부터
    return a.title.length - b.title.length;
  });
}

/**
 * 법령명이 '법' 또는 '법률'로 끝나면 본법(법률)으로 본다.
 * 예: '개인정보 보호법', '전자상거래 등에서의 소비자보호에 관한 법률'
 */
function isMainLaw(title) {
  if (!title) return false;
  return title.endsWith('법') || title.endsWith('법률');
}

// ---------- 이름 힌트 (8종) ----------

/**
 * 문장형 쿼리에서 법령 이름 힌트를 뽑아낸다.
 * 해당 주제가 감지되면 그 힌트 검색어로 치환해 다시 찾는다.
 * 순서: 전자상거래 → 개인정보 → 소상공인 → 식품위생 → 약관의 규제 → 저작권 → 상표 → 관광진흥
 */
function resolveLawHint(query) {
  const q = (query || '').toLowerCase();

  if (matchAny(q, ['통신판매', '온라인 판매', '전자상거래', '인터넷 판매', '온라인 예약'])) {
    return '전자상거래';
  }
  if (matchAny(q, ['개인정보', '프라이버시'])) {
    return '개인정보';
  }
  if (matchAny(q, ['소상공인', '자영업', '창업'])) {
    return '소상공인';
  }
  if (matchAny(q, ['식품', '음식', '카페', '음료', '위생'])) {
    return '식품위생';
  }
  if (matchAny(q, ['약관', '계약', '환불', '청약'])) {
    return '약관의 규제';
  }
  if (matchAny(q, ['저작권', '콘텐츠', '이미지 사용'])) {
    return '저작권';
  }
  if (matchAny(q, ['상표', '브랜드', '상호'])) {
    return '상표';
  }
  if (matchAny(q, ['숙박', '관광', '여행', '예약'])) {
    return '관광진흥';
  }

  return null;
}

function matchAny(text, candidates) {
  return candidates.some((c) => text.includes(c.toLowerCase()));
}

// ---------- 낱말 폴백: 3자 이상 앞 두 개 ----------

/**
 * 검색어를 공백/구분자로 나눠 3자 이상인 낱말 중 앞의 둘을 조합해 반환.
 * 두 글자 낱말은 '112신고'처럼 엉뚱한 법령을 끌어오므로 제외.
 * 조합할 낱말이 없으면 null.
 */
function pickTwoLongWords(query) {
  if (!query) return null;
  const tokens = query
    .split(/[ \t,·\/\\]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const long = tokens.filter((t) => t.length >= 3);
  if (long.length === 0) return null;
  const picked = long.slice(0, 2);
  return picked.join(' ');
}

// ---------- 채널 명 ----------

export { NAME };
