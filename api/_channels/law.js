// api/channels/law.js — 국가법령정보센터 오픈 API 채널
// 계약: docs/api-contract.md
// export: { name, lawAvailable, searchLaw, isRelevantHit }
// 결과: { id, title, url, snippet, host, form }[]  (form = 'law')
// 구현 근거: roadmap/목표화면/기준코드/server/channels/law.mjs searchLaw

const NAME = 'law';

const LAW_SEARCH_BASE = 'https://www.law.go.kr/DRF/lawSearch.do';
const OC_PARAM = 'OC';

// ---------- 가용성 ----------

export function lawAvailable() {
  try {
    const v = process.env.LAW_API_OC;
    return typeof v === 'string' && v.trim().length > 0;
  } catch {
    return false;
  }
}

// ---------- 법령 이름 힌트 (8종) ----------

const LAW_HINTS = [
  [/통신판매|온라인 판매|전자상거래|인터넷 판매|온라인 예약/, '전자상거래'],
  [/개인정보|프라이버시/, '개인정보'],
  [/소상공인|자영업|창업/, '소상공인'],
  [/식품|음식|카페|음료|위생/, '식품위생'],
  [/약관|계약|환불|청약/, '약관의 규제'],
  [/저작권|콘텐츠|이미지 사용/, '저작권'],
  [/상표|브랜드|상호/, '상표'],
  [/숙박|관광|여행|예약/, '관광진흥'],
];

// ---------- 뼈대말 (관련성 증거에서 제외) ----------

const TITLE_SKELETON = new Set([
  '기본', '특별', '관한', '관리', '진흥', '지원', '촉진', '육성', '법률', '시행',
  '규정', '등에', '조정', '현황', '구성', '형태', '전체', '일반', '분류', '기타', '규칙',
]);

// ---------- 검색 (공개 시그니처) ----------

/** 국가법령정보센터 현행 법령 검색.
 * query: 검색어(문장형 가능, 내부적으로 힌트·낱말 폴백 적용)
 * display: 결과 개수 — 숫자 그대로 전달하거나 options.display로 전달(기존 호출 호환)
 * options: { display?, extraTerms?, contextWords?, trace? }
 * 반환: Result[] (form = 'law')
 */
export async function searchLaw(query, displayOrOptions = 15) {
  const display = typeof displayOrOptions === 'number' ? displayOrOptions : (displayOrOptions?.display ?? 15);
  const extraTerms = Array.isArray(displayOrOptions?.extraTerms) ? displayOrOptions.extraTerms : [];
  const contextWords = Array.isArray(displayOrOptions?.contextWords) ? displayOrOptions.contextWords : [];
  const trace = Array.isArray(displayOrOptions?.trace) ? displayOrOptions.trace : null;
  const clamped = Math.min(Math.max(1, display | 0), 3) || 3;
  return searchLawImpl(query, clamped, extraTerms, contextWords, trace);
}

// ---------- 내부 검색 로직 (목표코드 searchLaw 그대로) ----------

async function searchLawImpl(query, display, extraTerms, contextWords, trace) {
  const note = (path, q, rows, kept) => {
    if (Array.isArray(trace)) trace.push({ path, query: q, hits: rows.map((x) => x.title), kept: kept.map((x) => x.title) });
  };

  const first = await searchLawOnce(query, display);
  note('full', query, first, first);
  if (first.length) return first;

  const ctx = contextWords;
  const hintHay = [String(query), ...ctx].join(' ');
  const orderedHints = [
    ...LAW_HINTS.filter(([re]) => re.test(String(query))),
    ...LAW_HINTS.filter(([re]) => !re.test(String(query))),
  ];

  for (const [re, name] of orderedHints) {
    if (!re.test(hintHay)) continue;
    const r = await searchLawOnce(name, display);
    const kept = r.filter((x) => isRelevantLaw(x, name, contextWords));
    note('hint', name, r, kept);
    if (kept.length) return kept;
  }

  const words = String(query)
    .split(/\s+/)
    .map((w) => w.replace(/[^가-힣A-Za-z0-9]/g, ''))
    .filter((w) => w.length >= 3)
    .filter((w) => !ctx.length || ctx.some((c) => c.length >= 2 && (w.includes(c) || c.includes(w))));

  for (const w of words.slice(0, 2)) {
    const r = await searchLawOnce(w, display);
    const kept = r.filter((x) => isRelevantLaw(x, w, contextWords));
    note('word', w, r, kept);
    if (kept.length) return kept;
  }

  for (const t of (Array.isArray(extraTerms) ? extraTerms : []).slice(0, 4)) {
    const w = String(t ?? '').trim();
    if (!w || words.includes(w)) continue;
    const r = await searchLawOnce(w, display);
    const kept = r.filter((x) => isRelevantLaw(x, w, contextWords));
    note('extra', w, r, kept);
    if (kept.length) return kept;
  }

  return [];
}

// ---------- 1회 검색 ----------

export async function searchLawOnce(query, display = 3) {
  const url =
    `https://www.law.go.kr/DRF/lawSearch.do?OC=${encodeURIComponent(process.env.LAW_API_OC)}&target=law&type=JSON&query=${encodeURIComponent(query)}&display=10`;
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`law ${r.status}`);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('law: JSON 이 아닌 응답(이용자 ID 미등록이면 HTML 이 온다)'); }
  const rows = data?.LawSearch?.law;
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const mapped = list
    .map((row) => ({
      title: String(row['법령명한글'] ?? '').trim(),
      url: row['법령명한글'] ? encodeURI(`https://www.law.go.kr/법령/${String(row['법령명한글']).trim()}`) : '',
      snippet: [row['법령구분명'], row['소관부처명'], row['시행일자'] ? `시행 ${row['시행일자']}` : '', row['현행연혁코드']].filter(Boolean).join(' · '),
      host: 'www.law.go.kr',
    }))
    .filter((x) => x.title && x.url);
  return rank(mapped).slice(0, display);
}

// ---------- 보조: relevance ----------

export function isRelevantHit(hit, terms, contextWords, { query } = {}) {
  if (!Array.isArray(contextWords) || !contextWords.length) return true;
  const title = String(hit?.title ?? '');
  const q = String(query ?? '').trim();
  if (q.length >= 3 && title.includes(q)) return true;
  const skip = new Set(
    (Array.isArray(terms) ? terms : [terms])
      .flatMap((t) => String(t ?? '').split(/\s+/))
      .filter(Boolean),
  );
  return contextWords.some((w) => !skip.has(w) && w.length >= 2 && !TITLE_SKELETON.has(w) && title.includes(w));
}

function isRelevantLaw(hit, term, contextWords) {
  return isRelevantHit(hit, term, contextWords);
}

// ---------- 보조: 정렬 ----------

const SUB_LAW = /(시행령|시행규칙|규정|규칙|훈령|예규|고시|지침)$/;
function rank(rows) {
  return [...rows].sort((a, b) => {
    const sa = SUB_LAW.test(a.title) ? 1 : 0;
    const sb = SUB_LAW.test(b.title) ? 1 : 0;
    return sa - sb || a.title.length - b.title.length;
  });
}
