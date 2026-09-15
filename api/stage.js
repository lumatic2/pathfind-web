// /api/stage — 단계 1개 검색 리서치 (채널 5종, 규칙 기반 선택)
// 계약: docs/api-contract.md §3 · §7. 경로별 제공자 추상화 유지.
// 변경: 기존 단일 web_search 2회 상한 → 채널 5종(나이버·GitHub·법령·공공데이터·통계) 중
//       단계 텍스트 키워드로 코드 규칙 채널 선택 → 프리서치 병렬 병렬 → 분석 호출.

import { sendError, logCall } from './_lib/http.js';
import { available as naverAvailable, searchNaver, name as NAVER_NAME } from './_channels/naver.js';
import { available as githubAvailable, searchGithub, name as GITHUB_NAME } from './_channels/github.js';
import { lawAvailable, searchLaw, NAME as LAW_NAME, isRelevantHit } from './_channels/law.js';
import { available as publicDataAvailable, searchPublicData, name as PUBLIC_DATA_NAME } from './_channels/public-data.js';
import { available as kosisAvailable, searchKosis, name as KOSIS_NAME } from './_channels/kosis.js';
import { reviewFindings } from './_lib/review-findings.js';
import { selectFindings } from './_lib/select-findings.js';
import { renumberBody, countCitationMarks, stripCitationMarks, attachNumbersByMaterialName } from './_lib/citation-marks.js';
import { topicWords } from './_lib/topic-query.js';

// ---------- 상수 ----------

const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';
const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
const MAX_TOKENS_ANALYSIS = 3000;
const MAX_TOKENS_QUERY = 400;
const CALL_TIMEOUT_MS = 90_000;
const MODEL_REVIEW_TIMEOUT_MS = 15_000;
const MAX_CALLS_PER_STAGE = 8; // 프리서치 포함
const MAX_RESULTS_PER_CHANNEL = 3;
const MAX_FINDINGS = 6;

// ---------- 채널 레지스트리 ----------

const CHANNELS = [
  {
    name: 'web',
    available: true, // 항상 사용 가능 (키만 있으면)
    label: '웹 검색',
    search: null, // 아래 buildToolDefs에서 web_search 도구 정의에 대응
  },
  {
    name: 'oss',
    available: githubAvailable(),
    label: 'GitHub',
    search: githubAvailable() ? searchGithub : null,
  },
  {
    name: 'law',
    available: lawAvailable(),
    label: '법령',
    search: lawAvailable() ? searchLaw : null,
  },
  {
    name: 'public_data',
    available: publicDataAvailable(),
    label: '공공데이터',
    search: publicDataAvailable() ? searchPublicData : null,
  },
  {
    name: 'stats',
    available: kosisAvailable(),
    label: '통계',
    search: kosisAvailable() ? searchKosis : null,
  },
];

const AVAILABLE_CHANNEL_NAMES = CHANNELS.filter((c) => c.available).map((c) => c.name);

// ---------- 키워드 규칙 ----------

const LAW_KEYWORDS = [
  '허가', '신고', '등록', '계약', '세금', '세무', '개인정보', '임대차', '영업',
  '법령', '법적', '법률', '규제', '약관', '저작권', '사업자', '보험', '근로',
  '안전', '위생', '인증', '표시',
];

const STATS_KEYWORDS = [
  '비용', '예산', '시세', '시장', '수요', '인구', '매출', '규모', '통계',
  '가격', '단가', '수익', '고객층', '연령', '소득', '성장', '점유', '추이',
];

const PUBLIC_DATA_KEYWORDS = [
  '상권', '지역', '시설', '현황', '지자체', '공공', '행정', '동네', '주변',
  '위치', '입지', '교통', '학교', '병원', '관광', '기상', '날씨',
];

const OSS_KEYWORDS = [
  '앱', '서비스', '자동화', '도구', '시스템', '웹', '프로그램', '봇', 'api',
  '소프트웨어', '사이트', '플랫폼', '알림', '예약', '결제', '데이터베이스',
  '대시보드', '크롤',
];

function keywordMatch(text, keywords) {
  const lower = (text || '').toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function selectChannels(title, desc, tasks, choices) {
  const combined = [title, desc, ...tasks.map((t) => t.task || ''), ...tasks.map((t) => t.why || ''), ...(choices || [])]
    .filter(Boolean)
    .join('\n');
  const selected = new Set();

  if (keywordMatch(combined, LAW_KEYWORDS)) selected.add('law');
  if (keywordMatch(combined, STATS_KEYWORDS)) selected.add('stats');
  if (keywordMatch(combined, PUBLIC_DATA_KEYWORDS)) selected.add('public_data');
  if (keywordMatch(combined, OSS_KEYWORDS)) selected.add('oss');

  // 웹은 키만 있으면 항상
  if (naverAvailable()) selected.add('web');

  // available 아닌 채널 제거
  for (const name of selected.values()) {
    const ch = CHANNELS.find((c) => c.name === name);
    if (!ch || !ch.available) selected.delete(name);
  }

  return [...selected];
}

// ---------- 낱말 길이 제약 ----------

function clampWords(text, maxWords) {
  if (!text) return '';
  const tokens = (text || '')
    .split(/[ \t,·\/\u200B]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.slice(0, maxWords).join(' ');
}

// ---------- 단계 낱말 추출 ----------

/**
 * 단계의 제목과 설명을 붙여, 한글·숫자·영문이 아닌 것으로 자르고,
 * 두 글자 이상만 남기고 중복을 없앤 낱말 목록을 반환한다.
 *
 * @param {object} stage  - { title?: string, desc?: string }
 * @returns {string[]}
 */
export function extractStageWords(stage) {
  const raw = [stage?.title, stage?.desc].filter(Boolean).join('\n');
  if (!raw) return [];

  const tokens = raw
    .split(/[^가-힣0-9a-zA-Z]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  return [...new Set(tokens)];
}

// ---------- 관문: 통계·공공데이터 결과 관련성 필터 ----------

/**
 * 채널이 통계나 공공데이터가 아니거나, 단계가 없거나, 결과가 비면 그대로 돌려준다.
 * 그 외에는 단계 낱말을 뽑아 결과마다 isRelevantHit 을 부르고 참인 것만 남긴다.
 *
 * @param {string} channelName
 * @param {string} query        - 모델이 지은 검색어(이 관문 안에서는 law 쪽과 같은 의미론 없이 isRelevantHit 에 그대로 넘긴다)
 * @param {object} stage        - { title?, desc?, ... }
 * @param {object[]} results    - 검색 결과 목록
 * @param {string[]} stageWords - extractStageWords 결과
 * @returns {{ kept: object[], dropped: number }}
 */
function gateResultsIfNeeded(channelName, query, stage, results, stageWords) {
  if (channelName !== 'stats' && channelName !== 'public_data') {
    return { kept: results.slice(), dropped: 0 };
  }
  if (!stage || !stage.title && !stage.desc) {
    return { kept: results.slice(), dropped: 0 };
  }
  if (!results || results.length === 0) {
    return { kept: [], dropped: 0 };
  }

  const kept = [];
  let dropped = 0;
  for (const r of results) {
    try {
      const relevant = isRelevantHit(r, [], stageWords, { query: String(query || '') });
      if (relevant) {
        kept.push(r);
      } else {
        dropped++;
      }
    } catch (e) {
      // isRelevantHit 이 던진 오류는 이 관문만 죽이지 않게 삼키고, 해당 결과는 버린다.
      dropped++;
      logCall('stage.gate.unexpected', 0, 0, { channel: channelName, err: String(e) });
    }
  }

  return { kept, dropped };
}

// ---------- 근거 등급 (코드 결정) ----------

function gradeFor(host, channel, form) {
  if (channel === 'web_review') {
    if (form === 'blog') return 'E4';
    if (form === 'cafe') return 'E5';
    return 'E3';
  }
  const h = ((host || '')).toLowerCase();
  if (channel === 'law' || channel === 'stats' || channel === 'public_data') return 'E1';
  if (channel === 'oss') return 'E2';
  if (
    h.startsWith('go.kr') ||
    h.startsWith('or.kr') ||
    h.startsWith('re.kr') ||
    h.startsWith('ac.kr') ||
    h.startsWith('gov') ||
    h.startsWith('edu') ||
    h.startsWith('github') ||
    h.startsWith('gitlab') ||
    h.startsWith('npmjs') ||
    h.startsWith('pypi') ||
    h.startsWith('docs') ||
    h.startsWith('developers')
  )
    return 'E2';
  if (
    h.startsWith('cafe.naver') ||
    h.startsWith('kin.naver') ||
    h.startsWith('reddit') ||
    h.startsWith('dcinside') ||
    h.startsWith('clien') ||
    h.startsWith('fmkorea') ||
    h.startsWith('stackoverflow') ||
    h.startsWith('ruliweb') ||
    h.startsWith('ppomppu')
  )
    return 'E5';
  if (
    h.startsWith('blog') ||
    h.startsWith('tistory') ||
    h.startsWith('velog') ||
    h.startsWith('medium') ||
    h.startsWith('brunch') ||
    h.startsWith('dev.to') ||
    h.startsWith('post.naver')
  )
    return 'E4';
  return 'E3';
}

// ---------- Finding.kind (코드 결정, 채널별 고정) ----------

function kindForChannel(channel) {
  switch (channel) {
    case 'web':
      return '참고 사례'; // 웹은 모델이 나중에 호스트 기반 4분류? — 스펙: 웹 호스트별 4분류는 코드.
    case 'web_review':
      return '참고 사례';
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

// 웹 호스트 기반 4분류 (스펙 판정 규칙에 맞춤)
function kindForWebByHost(host) {
  const h = ((host || '')).toLowerCase();
  if (
    h.includes('github.com') ||
    h.includes('gitlab.com') ||
    h.includes('sourceforge.net')
  )
    return '오픈소스';
  if (
    h.includes('freepik') ||
    h.includes('asset') ||
    h.includes('icon') ||
    h.includes('font') ||
    h.includes('unsplash') ||
    h.includes('pexels')
  )
    return '무료 에셋';
  if (
    h.includes('blog') ||
    h.includes('tutorial') ||
    h.includes('guide') ||
    h.includes('medium.com') ||
    h.includes('dev.to') ||
    h.includes('tistory') ||
    h.includes('velog')
  )
    return '튜토리얼·블로그';
  return '참고 사례';
}

// ---------- verdict 정규화 (코드) ----------

const VERDICT_CAN = '가져다 써도 됨';
const VERDICT_MUST = '직접 해야 함';
const VERDICT_MIX = '섞어야 함';
const VERDICT_NONE = '선례를 못 찾음';

// 모델이 프롬프트에서 보는 이름(쓸 만한 자료 없음)을 저장·응답 값(선례를 못 찾음)으로 되돌린다.
// 옛 이름(선례를 못 찾음)이 그대로 와도 아래 표가 그대로 통과시킨다.
const VERDICT_MODEL_TO_STORED = {
  '쓸 만한 자료 없음': VERDICT_NONE,
  '선례를 못 찾음': VERDICT_NONE,
};

const VERDICT_PREFIX = {
  [VERDICT_CAN]: VERDICT_CAN,
  [VERDICT_MUST]: VERDICT_MUST,
  [VERDICT_MIX]: VERDICT_MIX,
  [VERDICT_NONE]: VERDICT_NONE,
};

function mapModelVerdict(raw) {
  if (!raw) return raw;
  return VERDICT_MODEL_TO_STORED[raw] ?? raw;
}

function normalizeVerdict(raw, findingsCount) {
  raw = mapModelVerdict(raw);
  if (!raw) {
    if (findingsCount === 0) return VERDICT_MUST;
    return VERDICT_NONE;
  }
  const trimmed = (raw || '').trim();
  // 앞부분 일치로 폴드
  for (const [key, val] of Object.entries(VERDICT_PREFIX)) {
    if (trimmed.startsWith(val)) return val;
  }
  // 자료가 있는데 선례를 못 찾음 → 직접 해야 함
  if (findingsCount > 0 && trimmed.includes('선례')) return VERDICT_MUST;
  // 자료가 있는데 판결 이상 → 가져다 써도 됨
  if (findingsCount > 0) return VERDICT_CAN;
  return VERDICT_NONE;
}

// ---------- 시스템 프롬프트 ----------

const SYSTEM_PROMPT = `당신은 특정 구현 단계의 리서치 결과를 정리하는 어시스턴트입니다.
사용자의 프로젝트 단계 하나와, 미리 조사한 결과(채널별)를 받아 아래 5단계 산출 지시를 따라 JSON으로 답합니다.

## 1단계 — 물음 유형 선택
먼저 이 단계의 물음이 다음 셋 중 어디에 가까운지 고릅니다.
- 기술: 구현 방법·아키텍처·도구·코드 수준의 물음
- 정량/법적: 비용·시장·규제·법령·통계 등 숫자나 규칙이 중심인 물음
- 맥락: 상권·지역·시설·현황 등 주변 정황 중심 물음

## 2단계 — 밖에 이미 있는 걸 먼저 본다
사용자에게 주어진 "미리 조사한 결과" 절을 먼저 읽고, 그 자료로 이 단계 실현에 충분한지 판단합니다.
이미 충분한 자료가 있으면 새 검색 없이 findings로 바로 정리합니다.

## 3단계 — 부족한 물음만 도구로
미리 조사한 결과만으로 부족할 때만 도구를 더 부릅니다.
- 이미 돌린 채널을 같은 뜻의 검색어로 거듭 부르지 않습니다.
- 한 번의 도구 호출에 검색어 하나입니다.
- 검색어는 간결하게: 법령·통계는 핵심 낱말 1~2개, 공공데이터는 2~3개, 웹은 한국어 핵심 명사 2~4개, GitHub는 영문 키워드 2~4개.

## 4단계 — 도구 결과에 있는 항목만 findings로
- findings는 도구 결과에서 실제 확인된 항목만 담습니다. id 값으로만 가리킵니다(사용자가 준 미리 조사 결과 id 포함).
- note 한 줄을 각 findings에 붙입니다.
- 법령·통계·공공데이터 채널 결과가 있으면 최소 1건 이상 담습니다(없으면 0건 가능).
- 전체 findings 상한은 6건입니다.

## 5단계 — 판정
네 가지 고정 값 중 하나로 verdict를 냅니다: 가져가 써도 됨 / 직접 해야 함 / 섞어야 함 / 쓸 만한 자료 없음.
- 자료가 0건이면 "직접 해야 함"만 인정합니다. 그 외엔 "쓸 만한 자료 없음".
- 자료가 있는데 "쓸 만한 자료 없음"이면 "직접 해야 함"으로, 넷 어느 것도 아니면 "가져다 써도 됨"으로 정상화합니다(코드 정규화 대상이지만 모델도 예측 가능).

최종 출력은 아래 스키마를 정확히 따르는 JSON 객체 하나입니다. 마크다운·설명 텍스트 없이 JSON만 출력합니다.

{
  "claimType": "기술"|"정량/법적"|"맥락",
  "verdict": "가져다 써도 됨"|"직접 해야 함"|"섞어야 함"|"쓸 만한 자료 없음",
  "verdictReason": "판정 근거의 첫 한두 문장. 사람에게 설명하는 자리이므로 합니다·입니다로 끝맺습니다.",
  "verdictLine": "판정 첫 문장. verdict를 한 줄로 짧게 다시 말한다. 사람이 가장 먼저 읽는 한 줄.",
  "reasonPoints": [
    { "label": "무엇에 대한 이야기인지 서너 낱말", "text": "그 한 줄 설명" }
  ] — 항목은 둘에서 넷. label과 text를 적고 빈 text 항목은 넣지 않습니다.
  "findings": [
    {
      "id": "채널-번호 형태의 항목 식별자 (예: naver-web-0)",
      "name": "발견 항목 이름",
      "kind": "오픈소스|무료 에셋|튜토리얼·블로그|참고 사례|법령|통계|공공데이터",
      "note": "한 줄 메모/판단 근거"
    }
  ],
  "options": ["이 단계에서 갈 수 있는 선택지"],
  "todos": [{ "task": "할 일", "owner": "가져다 씀|직접 함", "note": "메모" }]
}

규칙:
- verdict 4종은 고정 값. 다른 값 금지.
- findings는 0~6건. 빈 findings도 정상.
- 각 findings는 실제 확인된 id로만 존재. 도구는 한 번에 검색어 하나.
- 이미 돌린 채널을 같은 뜻으로 다시 부르지 않습니다.
- 마크다운·설명 텍스트 없이 JSON 객체만 출력.
`;

// ---------- 도구 정의 (Solar tool calling용) ----------

function buildToolDefs() {
  const defs = [];

  // web_search (기존 형태 유지, 키워드: 한국어 명사 2~4)
  defs.push({
    type: 'function',
    function: {
      name: 'web_search',
      description: '네이버 검색(웹 kr)으로 한국어 자료를 검색합니다. 검색어 하나를 받아 결과 목록을 반환합니다. 검색어는 한국어 핵심 명사 2~4개로 간결하게.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색어. 한국어 핵심 명사 2~4개, 간결하게.' },
        },
        required: ['query'],
      },
    },
  });

  // GitHub 검색 도구
  if (githubAvailable()) {
    defs.push({
      type: 'function',
      function: {
        name: 'github_search',
        description: 'GitHub 저장소 검색. 영문 키워드 2~4개로 검색. stars 정렬.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '영문 키워드 2~4개. 예: "react dashboard template".' },
          },
          required: ['query'],
        },
      },
    });
  }

  // 법령 검색 도구
  if (lawAvailable()) {
    defs.push({
      type: 'function',
      function: {
        name: 'law_search',
        description: '국가법령정보센터 현행 법령 검색. 법령 이름에 들어갈 낱말 1~2개로 검색.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '법령 이름 핵심 낱말 1~2개. 예: "개인정보 보호".' },
          },
          required: ['query'],
        },
      },
    });
  }

  // 공공데이터 도구 (모듈 없으므로 등록 안 함 — 규칙상 걸리면 planned에만 넣고 skip)
  // 통계 도구 (모듈 없으므로 등록 안 함)

  return defs;
}

// ---------- Solar 호출 ----------

async function callSolar(messages, { tools = false, tool_choice = 'auto', maxTokens = MAX_TOKENS_ANALYSIS, timeoutMs = CALL_TIMEOUT_MS } = {}) {
  const key = process.env.SOLAR_API_KEY;
  if (!key) throw new Error('Solar API key not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SOLAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SOLAR_MODEL,
        messages,
        ...(tools ? { tools: buildToolDefs(), tool_choice } : {}),
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Solar API 오류 (${res.status}): ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    return {
      content: msg.content,
      toolCalls: msg.tool_calls,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 채널별 실제 검색 실행 ----------

async function runChannelSearch(channelName, query, stage = null) {
  const ch = CHANNELS.find((c) => c.name === channelName);
  if (!ch || !ch.search) return { results: [], calls: 0 };
  try {
    if (channelName === 'web') {
      // 웹은 서브타입 3종을 한 단계 안에서 직렬로 돈다 (외부 API 429 회피).
      const results = [];
      const webSubtypes = ['webkr', 'blog', 'cafearticle'];
      for (let i = 0; i < webSubtypes.length; i++) {
        const subResults = await searchNaver(query, webSubtypes[i], MAX_RESULTS_PER_CHANNEL);
        results.push(
          ...subResults.map((r, idx) => {
            const ch =
              i === 0 ? 'web' : 'web_review';
            return { ...r, channel: ch };
          }),
        );
      }
      return { results, calls: 3 };
    }
    if (channelName === 'oss') {
      const results = await searchGithub(query, MAX_RESULTS_PER_CHANNEL);
      return { results: results.map((r) => ({ ...r, channel: 'oss' })), calls: 1 };
    }
    if (channelName === 'law') {
      const results = await searchLaw(query, MAX_RESULTS_PER_CHANNEL);
      return { results: results.map((r) => ({ ...r, channel: 'law' })), calls: 1 };
    }
    if (channelName === 'stats') {
      const results = await searchKosis(query, MAX_RESULTS_PER_CHANNEL);
      return { results, calls: 1 };
    }
    if (channelName === 'public_data') {
      const results = await searchPublicData(query);
      return { results, calls: 1 };
    }
    return { results: [], calls: 0 };
  } catch (e) {
    logCall('stage.runChannelSearch', 0, 0, {});
    return { results: [], calls: 0 };
  }
}

// 기존 searchWeb 재사용 (SEARCH_API_KEY 기반)
async function searchWeb(query) {
  const key = process.env.SEARCH_API_KEY;
  if (!key) throw new Error('SEARCH_API_KEY not configured');
  const url = process.env.SEARCH_API_URL || 'https://api.tavily.com/search';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, api_key: key, max_results: MAX_RESULTS_PER_CHANNEL }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`검색 API 오류 (${res.status}): ${errBody.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.results || []).map((r, idx) => ({
    id: `naver-web-${idx}`,
    title: r.title || '검색 결과',
    url: r.url || '',
    host: (() => { try { return new URL(r.url || '').hostname; } catch { return ''; } })(),
    snippet: (r.content || '').slice(0, 300),
    channel: 'web',
  }));
}

// ---------- id 카탈로그 (모델이 id로만 가리키게) ----------

function buildCatalog(preResults, toolResults) {
  const catalog = new Map();
  for (const r of preResults) {
    if (r.id) catalog.set(r.id, r);
  }
  for (const r of toolResults) {
    if (r.id) catalog.set(r.id, r);
  }
  return catalog;
}

// ---------- 프리서치 결과를 사용자 프롬프트용 문장으로 ----------

function preResultsSection(preResults) {
  if (!preResults.length) return '';
  const byChannel = {};
  for (const r of preResults) {
    (byChannel[r.channel] ||= []).push(r);
  }
  const parts = [];
  for (const [ch, items] of Object.entries(byChannel)) {
    const label = CHANNELS.find((c) => c.name === ch)?.label || ch;
    parts.push(`### ${label} 채널 미리 조사한 결과`);
    for (const item of items) {
      parts.push(`- id: ${item.id}`);
      parts.push(`  제목: ${item.title || '제목 없음'}`);
      parts.push(`  검색어: ${item.query || ''}`);
      parts.push(`  건수: ${items.length}건`);
      parts.push(`  URL: ${item.url || '없음'}`);
      parts.push(`  요약: ${(item.snippet || '').slice(0, 200)}`);
      parts.push('');
    }
  }
  return parts.join('\n');
}

// ---------- 분석 호출용 프롬프트 빌드 ----------

function buildAnalysisPrompt(stage, summary, preResults, plannedChannels) {
  const pre = preResultsSection(preResults);

  const prompt = `다음 프로젝트 단계의 자료를 찾습니다.

[프로젝트 요약]
${summary || ''}

[단계]
번호: ${stage.no}
제목: ${stage.title}
설명: ${stage.desc}
할 일:
${
  (stage.tasks || [])
    .map((t) => `- ${t.order}. ${t.task} (${t.why})`)
    .join('\n') || '없음'
}
선택지: ${stage.choices?.join(', ') || '없음'}

${pre ? `--- 미리 조사한 결과 (위 채널을 미리 돌려둔 결과) ---\n${pre}\n--- 끝 ---\n` : ''}

위 단계의 실현을 도울 수 있는 자료를 찾으세요. 이미 조사된 결과를 먼저 보고, 부족한 물음이 있을 때만 도구를 더 부릅니다.
`;

  return prompt;
}

// ---------- 쿼리 생성 호출 (작은 호출, max_tokens 400) ----------

async function generateQueries(stage, summary, plannedChannels) {
  const planningPrompt = `다음 단계 정보를 보고, 아래 채널 목록에 채널마다 검색어 하나씩을 JSON 배열로 제시합니다.
출력은 이 스키마 그대로 JSON 배열 하나만: [{"channel":"채널이름","query":"검색어"}]
채널별 검색어 지침:
- web: 한국어 핵심 명사 2~4개
- oss: 영문 키워드 2~4개
- law: 법령 이름에 들어갈 낱말 1~2개
- stats: 통계표 이름에 들어갈 낱말 1~2개
- public_data: 데이터셋 이름에 들어갈 낱말 2~3개

대상 채널: ${plannedChannels.join(', ')}

[단계]
제목: ${stage.title}
설명: ${stage.desc}
할 일:
${(stage.tasks || []).map((t) => `- ${t.order}. ${t.task} (${t.why})`).join('\n') || '없음'}
선택지: ${stage.choices?.join(', ') || '없음'}
`;
  const messages = [
    { role: 'system', content: '당신은 검색어 기획자입니다. JSON 배열만 출력합니다.' },
    { role: 'user', content: planningPrompt },
  ];

  try {
    const res = await callSolar(messages, { tools: false, tool_choice: 'auto', maxTokens: MAX_TOKENS_QUERY });
    if (!res.content) return [];
    const parsed = JSON.parse(res.content.trim());
    if (!Array.isArray(parsed)) return [];
    // 채널에서 요구하는 낱말 상한으로 다시 자르기
    return parsed
      .filter((item) => item && typeof item === 'object' && item.channel && typeof item.query === 'string')
      .map((item) => {
        let q = item.query.trim();
        if (!q) return null;
        // 채널별 상한
        switch (item.channel) {
          case 'web':
            q = clampWords(q, 4);
            break;
          case 'oss':
            q = clampWords(q, 4);
            break;
          case 'law':
            q = clampWords(q, 2);
            break;
          case 'stats':
            q = clampWords(q, 2);
            break;
          case 'public_data':
            q = clampWords(q, 3);
            break;
          default:
            break;
        }
        return { channel: item.channel, query: q };
      })
      .filter(Boolean);
  } catch (e) {
    logCall('stage.generateQueries', 0, 0, {});
    // 단계 제목에서 같은 상한으로 대체
    const fallbackWords = clampWords(stage.title, 3);
    if (!fallbackWords) return [];
    // 계획된 채널 각각에 같은 대체 검색어
    return plannedChannels.map((ch) => ({ channel: ch, query: fallbackWords }));
  }
}

// ---------- verdictReason 조립 ----------

function composeReason(leading, points) {
  const list = Array.isArray(points) ? points : [];
  const trimmed = list
    .slice(0, 5)
    .filter((p) => typeof p === 'object' && p && typeof p.text === 'string' && p.text.trim() !== '');
  if (trimmed.length === 0) return leading || '';

  const lines = [];
  if (leading != null && leading !== '') {
    const kept = leading
      .split('\n')
      .filter((line) => {
        const s = line.trim();
        return !(s.startsWith('-') || s.startsWith('*') || s.startsWith('·'));
      })
      .join('\n');
    if (kept !== '') lines.push(kept);
  }

  lines.push('');
  for (const p of trimmed) {
    const label = (p.label && typeof p.label === 'string' && p.label.trim()) || '';
    const text = (p.text || '').trim();
    if (label !== '') {
      lines.push(`- **${label}**: ${text}`);
    } else {
      lines.push(`- ${text}`);
    }
  }
  return lines.join('\n');
}

/**
 * 자료가 있는데 본문 인용 번호가 하나도 없으면, 같은 내용으로 한 번만 다시 요청해
 * 근거 번호만 [n] 형태로 받는다.
 *
 * @param {string} originalBody      - composeReason 원본 문장 (마크 포함 가능)
 * @param {string} renumberedBody    - renumberBody를 통과한 문장
 * @param {Array}  findings          - 최종 선정 자료 (id 확인용)
 * @returns {Promise<string>}
 */
async function retryMissingCitationNumbers(originalBody, renumberedBody, findings) {
  // 근거가 될 자료 ids
  const ids = findings.map((f) => f.id).filter(Boolean);
  if (ids.length === 0) return renumberedBody;

  // 원문에서 마크를 뺀 것 — 모델과 비교할 때 마크는 의미 없음
  const originalStripped = stripCitationMarks(originalBody);

  const prompt = [
    '아래 문장에 근거가 되는 자료 번호를 붙여 주세요.',
    '자료는 아래 id 목록입니다. 각 자료에 순서대로 [1], [2], ... 번호를 붙입니다.',
    '문장 안에서 근거가 되는 곳마다 해당 자료의 번호 마크를 붙이되,',
    '문장 내용은 절대 바꾸지 마세요.',
    '결과에는 마크가 붙은 문장 하나만 출력하고, 다른 설명은 넣지 마세요.',
    '',
    '자료 id: ' + ids.join(', '),
    '',
    '원문:',
    originalBody,
  ].join('\n');

  try {
    const messages = [
      { role: 'system', content: '당신은 근거 번호를 문장에 붙이는 어시스턴트입니다. JSON 없이 문장만 출력합니다.' },
      { role: 'user', content: prompt },
    ];
    const res = await callSolar(messages, { tools: false, tool_choice: 'auto', maxTokens: 1500, timeoutMs: 60_000 });
    if (!res.content) return renumberedBody;

    const returned = res.content.trim();
    const returnedStripped = stripCitationMarks(returned);
    // 마크를 뺀 문장이 원문과 같아야 채택
    if (returnedStripped !== originalStripped) return renumberedBody;

    // 살아 있는 마크 개수가 원문보다 많아야 채택 (재요청 목적 달성)
    const returnedMarks = countCitationMarks(returned);
    if (returnedMarks === 0) return renumberedBody;

    return returned;
  } catch (e) {
    logCall('stage.retryMissingCitationNumbers', 0, 0, { err: String(e) });
    return renumberedBody;
  }
}

// ---------- verdictReason / findings 조립 ----------

function assembleFindings(modelOutput, catalog) {
  const rawFindings = (modelOutput?.findings || []).slice(0, MAX_FINDINGS);
  const findings = [];
  for (const f of rawFindings) {
    const id = f.id;
    if (!id || !catalog.has(id)) continue; // 카탈로그에 없는 id는 버림 (URL 지어내기 방지)
    const item = catalog.get(id);
    const channel = item.channel || 'web';
    const host = item.host || extractHost(item.url);
    const form = item.form || '';
    const grade = gradeFor(host, channel, form);
    const kind = channel === 'web' ? kindForWebByHost(host) : kindForChannel(channel);
    findings.push({
      id: f.id || item.id,
      name: f.name || item.title || '항목',
      kind,
      note: f.note || '',
      grade,
      channel,
      url: item.url || '',
      evidence: (item.snippet || '').slice(0, 300),
    });
  }
  return findings;
}

function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ---------- 응답 빌드 ----------

function buildResponse(stage, modelOutput, findings, queries, plannedChannels, calledChannels, calls, source) {
  const findingsCount = findings.length;
  const verdict = normalizeVerdict(modelOutput?.verdict, findingsCount);
  const verdictLine = modelOutput?.verdictLine || '';
  const verdictReason = composeReason(
    modelOutput?.verdictReason,
    modelOutput?.reasonPoints,
  ) || (findingsCount ? '자료를 확인했습니다.' : '조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다.');

  let options = modelOutput?.options || stage.choices || [];
  let todos = (modelOutput?.todos || []).map((t) => ({
    task: t.task,
    owner: t.owner === '직접 함' ? '직접 함' : '가져다 씀',
    note: t.note || '',
  }));

  if (todos.length === 0 && findingsCount === 0) {
    for (const t of stage.tasks || []) {
      todos.push({ task: t.task, owner: '직접 함', note: t.why || '' });
    }
  }

  options = options.slice(0, 5);
  todos = todos.slice(0, 5);

  // scope 구성
  const scope = {
    claimType: modelOutput?.claimType || '기술',
    channels: [...new Set(calledChannels)],
    calls: calls,
    queries: queries.map((q) => `${q.channel}:${q.query}`),
    planned: plannedChannels,
  };

  // findings에서 grade/channel/id 빼고 프론트가 쓰는 형태로
  const frontendFindings = findings.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
    note: f.note,
    url: f.url,
    evidence: f.evidence,
    grade: f.grade,
    channel: f.channel,
  }));

  const stagePayload = {
    no: stage.no,
    title: stage.title,
    desc: stage.desc,
    icon: stage.icon || '',
    tasks: stage.tasks,
    verdict,
    verdictLine,
    verdictReason,
    findings: frontendFindings,
    choices: stage.choices || [],
    options,
    todos,
    searched: true,
    scope,
  };

  return stagePayload;
}

// ---------- 헤더 ----------

function stageHeaders(source, channelNames, forceMode) {
  const headers = {
    'Content-Type': 'application/json',
  };
  headers['x-stage-source'] = source; // local | proxy | fallback
  headers['x-stage-channels'] = channelNames.join(',');
  if (forceMode) headers['x-stage-force'] = forceMode;
  return headers;
}

// ---------- 페이로드 파싱 ----------

function parseSolarJson(content) {
  const trimmed = (content || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      try { return JSON.parse(codeMatch[1].trim()); } catch {}
    }
    const lastBlock = trimmed.split('```').pop()?.trim();
    if (lastBlock) {
      try { return JSON.parse(lastBlock); } catch {}
    }
    throw new Error('Solar 응답이 유효한 JSON이 아닙니다: ' + trimmed.slice(0, 200));
  }
}

// ---------- 메인 POST ----------

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  const forceMode = (request.headers.get('x-stage-force') || '').trim().toLowerCase();
  const isProxy = forceMode === 'proxy';
  const isWebOnly = forceMode === 'web-only';
  const isBreak = forceMode.startsWith('break-');
  const breakChannel = isBreak ? forceMode.slice(6) || '' : null;

  // force 모드에서 사용할 채널 집합 결정
  let activeChannels = AVAILABLE_CHANNEL_NAMES.slice();
  if (isWebOnly) {
    activeChannels = activeChannels.filter((c) => c === 'web');
  } else if (isBreak && breakChannel) {
    activeChannels = activeChannels.filter((c) => c !== breakChannel);
  }

  // 키 없는 환경 → proxy 취급
  const hasSolarKey = !!(process.env.SOLAR_API_KEY);
  const isEmptyEnv = !hasSolarKey;

  let source = 'local';
  if (isProxy || isEmptyEnv) source = 'proxy';
  if (isBreak && !hasSolarKey) source = 'fallback';

  // ---------- 기존 절차 폴백 (키 없음 + proxy / force=proxy) ----------

  if (isProxy || isEmptyEnv) {
    return runLegacyFallback(request, source);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { stageIndex, stage, summary } = body;

    if (!stage || !stage.title) {
      return sendError(400, 'stage.title 필요');
    }

    // 1) 채널 선택 (코드 규칙)
    const planned = selectChannels(stage.title, stage.desc, stage.tasks || [], stage.choices || []);
    // activeChannels 제약 반영
    const plannedActive = planned.filter((n) => activeChannels.includes(n));
    // web-only면 web만, break면 해당 채널 제외
    const plannedFinal = isWebOnly
      ? plannedActive.filter((n) => n === 'web')
      : isBreak
      ? plannedActive.filter((n) => n !== breakChannel)
      : plannedActive;

    // 사용 가능한 채널 정의
    const tools = buildToolDefs();

    // 2) 쿼리 생성 호출 (작은 호출)
    const queries = await generateQueries(stage, summary, plannedFinal);
    const queryMap = new Map(queries.map((q) => [q.channel, q.query]));

    // 3) 프리서치: 규칙 채널을 한 단계 안에서 직렬로 돈다 (외부 API 429 회피).
    const preResults = [];
    let calls = 0;
    const topicSummary = topicWords(summary) || [];
    const TOPIC_TARGET_CHANNELS = new Set(['law', 'stats', 'public_data']);

    // ---------- 채널 통계 ----------
    const channelStats = {};
    for (const ch of plannedFinal) {
      channelStats[ch] = { calls: 0, returned: 0, gated: 0, picked: 0 };
    }
    channelStats['web_review'] = { calls: 0, returned: 0, gated: 0, picked: 0 };
    function ensureStats(chname) {
      if (!channelStats[chname]) {
        channelStats[chname] = { calls: 0, returned: 0, gated: 0, picked: 0 };
      }
      return channelStats[chname];
    }

    for (const ch of plannedFinal) {
      if (calls >= MAX_CALLS_PER_STAGE) break; // 단계당 호출 상한 도달
      const q = queryMap.get(ch) || stage.title;
      let results = [];
      let chCalls = 0;
      const stageWords = extractStageWords(stage);
      const { results: chResults, calls: chSearchCalls } = await runChannelSearch(ch, q, stage);
      chCalls = chSearchCalls;
      const stats = ensureStats(ch);
      stats.calls += chSearchCalls;
      stats.returned += chResults.length;
      if (ch === 'stats' || ch === 'public_data') {
        const { kept, dropped } = gateResultsIfNeeded(ch, q, stage, chResults, stageWords);
        results = kept;
        stats.gated += dropped;
      } else {
        results = chResults;
      }
      const slotsLeft = MAX_CALLS_PER_STAGE - calls;
      const takeCalls = Math.min(chCalls, slotsLeft);
      stats.calls = stats.calls - chSearchCalls + takeCalls;
      preResults.push(
        ...results.slice(0, Math.min(MAX_RESULTS_PER_CHANNEL, slotsLeft)).map((r) => ({ ...r, query: q })),
      );
      calls += takeCalls;

      // 계획된 법령·통계·공공데이터 검색어에 주제 낱말이 하나도 없을 때, 주제어로 한 번 더
      if (
        TOPIC_TARGET_CHANNELS.has(ch) &&
        topicSummary.length > 0 &&
        calls < MAX_CALLS_PER_STAGE
      ) {
        const kwTokens = (q || '')
          .split(/[^\uAC00-\uD7A3]+/)
          .map((w) => w.trim())
          .filter(Boolean);
        const hasTopic = kwTokens.some((kw) => topicSummary.includes(kw));
        if (!hasTopic) {
          const topicQuery = topicSummary.slice(0, 2).join(' ');
          let topicResults = [];
          let topicCalls = 0;
          const { results: tResults, calls: tCalls } = await runChannelSearch(ch, topicQuery, stage);
          topicResults = tResults;
          topicCalls = tCalls;
          const tStats = ensureStats(ch);
          tStats.returned += topicResults.length;
          if (ch === 'stats' || ch === 'public_data') {
            const { kept, dropped } = gateResultsIfNeeded(ch, topicQuery, stage, topicResults, stageWords);
            topicResults = kept;
            tStats.gated += dropped;
          }
          const topicSlotsLeft = MAX_CALLS_PER_STAGE - calls;
          const topicTake = Math.min(topicCalls, topicSlotsLeft);
          tStats.calls = tStats.calls - topicCalls + topicTake;
          preResults.push(
            ...topicResults.slice(0, Math.min(MAX_RESULTS_PER_CHANNEL, topicSlotsLeft)).map(
              (r) => ({ ...r, query: topicQuery }),
            ),
          );
          calls += topicTake;
          logCall('stage.topicSupplement', 0, 0, { channel: ch, query: topicQuery });
        }
      }
    }

    const webReviewUsed = preResults.some((r) => r.channel === 'web_review');

    // 4) 분석 호출 (tool_choice auto)
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildAnalysisPrompt(stage, summary, preResults, plannedFinal) },
    ];

    let analysisResult;
    try {
      analysisResult = await callSolar(messages, { tools: tools.length ? tools : false, tool_choice: 'auto', maxTokens: MAX_TOKENS_ANALYSIS });
    } catch (e) {
      logCall('stage.analysis', 0, 200, {});
      // 모델 오류 → 200 폴백
      return new Response(
        JSON.stringify({
          stage: buildResponse(
            stage,
            { verdict: '선례를 못 찾음', claimType: '확인 불가' },
            [],
            queries,
            plannedFinal,
            [],
            0,
            source
          ),
        }),
        { headers: stageHeaders(source, plannedFinal, forceMode) }
      );
    }

    // 도구 호출 처리 (프리서치를 포함한 단계당 호출 상한 MAX_CALLS_PER_STAGE).
    const toolMessages = messages.slice();
    const toolResults = [];
    let toolResult = analysisResult;

    while (calls < MAX_CALLS_PER_STAGE) {
      const tcs = toolResult?.toolCalls;
      if (!tcs?.length) break;

      const tc = tcs[0];
      if (!tc || tc.function?.name !== 'web_search' && tc.function?.name !== 'github_search' && tc.function?.name !== 'law_search') break;

      let chname = 'web';
      if (tc.function.name === 'github_search') {
        chname = 'oss';
      } else if (tc.function.name === 'law_search') {
        chname = 'law';
      }

      try {
        calls++;
        ensureStats(chname).calls++;
        const args = JSON.parse(tc.function.arguments || '{}');
        const q = args.query || '';
        if (!q) break;

        let results = [];
        if (tc.function.name === 'github_search') {
          results = await searchGithub(q, MAX_RESULTS_PER_CHANNEL);
        } else if (tc.function.name === 'law_search') {
          results = await searchLaw(q, MAX_RESULTS_PER_CHANNEL);
        } else {
          results = await searchWeb(q);
        }
        ensureStats(chname).returned += results.length;

        // web 결과에서 stats/public_data로 분류된 항목도 관문을 지나게 한다
        if (chname === 'web' && stage && results.some((r) => r.channel === 'stats' || r.channel === 'public_data')) {
          const stageWords = extractStageWords(stage);
          const routed = [];
          for (const r of results) {
            if (r.channel === 'stats' || r.channel === 'public_data') {
              const { kept, dropped } = gateResultsIfNeeded(r.channel, q, stage, [r], stageWords);
              if (kept.length) routed.push(kept[0]);
              if (dropped > 0) {
                logCall('stage.toolRun.gate', 0, 0, { channel: r.channel, query: q, dropped });
              }
            } else {
              routed.push(r);
            }
          }
          results = routed;
        }

        // 낱말 상한 적용
        const clamped = clampWords(q, tc.function.name === 'law_search' || tc.function.name === 'stats' ? 2 : tc.function.name === 'public_data' ? 3 : 4);
        const enriched = results.map((r, idx) => ({
          ...r,
          id: `${chname}-${idx}`,
          query: clamped,
          channel: chname,
        }));

        toolResults.push(...enriched);

        toolMessages.push(
          { role: 'assistant', content: null, tool_calls: tcs },
          {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(
              enriched.map((r) => ({
                id: r.id,
                title: r.title,
                url: r.url,
                host: r.host,
                snippet: r.snippet,
                query: r.query,
                channel: r.channel,
              }))
            ),
          }
        );

        toolResult = await callSolar(toolMessages, { tools: false, maxTokens: MAX_TOKENS_ANALYSIS });
      } catch (e) {
        logCall('stage.toolRun', 0, 0, {});
        break;
      }
    }

    // 5) id 카탈로그 구축
    const catalog = buildCatalog(preResults, toolResults);

    // 모델 findings 조립 (카탈로그 없는 id 버림)
    const parsed = parseSolarJson(toolResult.content || '');
    const findings = assembleFindings(parsed, catalog);

    // ----- 고른 근거 자료를 뜻으로 다시 확인 (law / stats / public_data) -----
    const TARGET_CHANNELS = new Set(['law', 'stats', 'public_data']);
    const targetFindings = findings.filter((f) => TARGET_CHANNELS.has(f.channel));
    let reviewResult;
    if (targetFindings.length > 0) {
      try {
        reviewResult = await reviewFindings(stage, targetFindings, callSolar, MODEL_REVIEW_TIMEOUT_MS);
      } catch (e) {
        logCall('stage.reviewFindings', 0, 0, { err: String(e) });
        reviewResult = { kept: [], dropped: targetFindings.length, timedOut: false };
      }
    } else {
      reviewResult = { kept: [], dropped: 0, timedOut: false };
    }
    const reviewedFindings = [
      ...reviewResult.kept,
      ...findings.filter((f) => !TARGET_CHANNELS.has(f.channel)),
    ];

    // ----- 자료 여섯 칸 고르기: 웹 상한·비웹 우선·밀린 웹 보존 -----
    const { findings: findingsAfterReview, deferredWeb } = selectFindings(
      reviewedFindings,
      [...catalog.values()],
    );
    if (deferredWeb.length > 0) {
      logCall('stage.selectFindings.deferredWeb', 0, 0, {
        count: deferredWeb.length,
        ids: deferredWeb.map((f) => f.id),
      });
    }

    const calledChannels = new Set();
    for (const f of findingsAfterReview) {
      calledChannels.add(f.channel);
      const st = ensureStats(f.channel);
      st.picked++;
    }

    // ----- 뜻 판정 집계: vetRejected / vetTimeout -----
    const vetRejected = reviewResult?.dropped ?? 0;
    const vetTimeout = reviewResult?.timedOut ? 1 : 0;

    // scope 구성
    const scope = {
      claimType: parsed?.claimType || '기술',
      channels: [...new Set([...plannedFinal, ...calledChannels, ...(webReviewUsed ? ['web_review'] : [])])],
      calls,
      queries: queries.map((q) => `${q.channel}:${q.query}`),
      planned: webReviewUsed
        ? [...new Set([...plannedFinal, 'web_review'])]
        : plannedFinal,
      channelStats,
      vetRejected,
      vetTimeout,
    };

    const verdict = normalizeVerdict(parsed?.verdict, findingsAfterReview.length);
    const verdictLine = parsed?.verdictLine || '';
    const rawVerdictReason = composeReason(
      parsed?.verdictReason,
      parsed?.reasonPoints,
    ) || (findingsAfterReview.length ? '자료를 확인했습니다.' : '조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다.');

    // 최종 선정 자료로 본문 인용 번호를 다시 매긴다 (버린 자료 마크는 제거, 남은 자료는 최종 순서로).
    const fieldsByMark = (parsed?.findings || []).reduce((acc, f, idx) => {
      const mark = `[${idx + 1}]`;
      acc[mark] = { id: f.id };
      return acc;
    }, {});
    const verdictReason = renumberBody(rawVerdictReason, findingsAfterReview, fieldsByMark);

    // ----- 자료가 있는데 살아 있는 인용 번호가 0개면 한 번만 다시 묻는다 -----
    const markCount = countCitationMarks(verdictReason);
    const afterRetry = (markCount === 0 && findingsAfterReview.length > 0)
      ? await retryMissingCitationNumbers(rawVerdictReason, verdictReason, findingsAfterReview)
      : verdictReason;
    const finalVerdictReason = attachNumbersByMaterialName(
      afterRetry,
      findingsAfterReview,
    );

    let options = parsed?.options || stage.choices || [];
    let todos = (parsed?.todos || []).map((t) => ({
      task: t.task,
      owner: t.owner === '직접 함' ? '직접 함' : '가져다 씀',
      note: t.note || '',
    }));

    if (todos.length === 0 && findingsAfterReview.length === 0) {
      for (const t of stage.tasks || []) {
        todos.push({ task: t.task, owner: '직접 함', note: t.why || '' });
      }
    }

    options = options.slice(0, 5);
    todos = todos.slice(0, 5);

    const frontendFindings = findingsAfterReview.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      note: f.note,
      url: f.url,
      evidence: f.evidence,
      grade: f.grade,
      channel: f.channel,
    }));

    const stagePayload = {
      no: stage.no,
      title: stage.title,
      desc: stage.desc,
      icon: stage.icon || '',
      tasks: stage.tasks,
      verdict,
      verdictLine,
      verdictReason: finalVerdictReason,
      findings: frontendFindings,
      choices: stage.choices || [],
      options,
      todos,
      searched: true,
      scope,
    };

    return new Response(JSON.stringify({ stage: stagePayload }), {
      headers: stageHeaders(source, [...new Set([...plannedFinal, ...calledChannels])], forceMode),
    });
  } catch (err) {
    logCall('stage.POST', 0, 500, request.headers);
    return sendError(500, '서버 오류');
  }
}

// ---------- 기존 절차 폴백 (키 없는 환경 / proxy force) ----------

async function runLegacyFallback(request, source) {
  // 기존 stage.js 동작 그대로: Solar 키 없으면 500 대신 "선례를 못 찾음" 200
  // force=proxy 일 때도 이 경로
  try {
    const body = await request.json().catch(() => ({}));
    const { stageIndex, stage, summary } = body;

    if (!stage || !stage.title) {
      return sendError(400, 'stage.title 필요');
    }

    // 기존 절차 그대로: 도구 없이 판단 → 선례를 못 찾음
    return new Response(
      JSON.stringify({
        stage: {
          no: stage.no,
          title: stage.title,
          desc: stage.desc,
          icon: stage.icon || '',
          tasks: stage.tasks,
          verdict: '선례를 못 찾음',
          verdictReason: 'Solar 호출 단계에서 오류가 발생해 조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다.',
          findings: [],
          choices: stage.choices || [],
          options: stage.choices || [],
          todos: (stage.tasks || []).map((t) => ({
            task: t.task,
            owner: '직접 함',
            note: t.why || '',
          })),
          searched: false,
        },
      }),
      { headers: stageHeaders(source, [], request.headers.get('x-stage-force') || '') }
    );
  } catch (err) {
    logCall('stage.legacyFallback', 0, 500, {});
    return sendError(500, '서버 오류');
  }
}

export { composeReason };
