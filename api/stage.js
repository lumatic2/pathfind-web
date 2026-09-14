// /api/stage — 단계 1개 검색 리서치 (채널 5종, 규칙 기반 선택)
// 계약: docs/api-contract.md §3 · §7. 경로별 제공자 추상화 유지.
// 변경: 기존 단일 web_search 2회 상한 → 채널 5종(나이버·GitHub·법령·공공데이터·통계) 중
//       단계 텍스트 키워드로 코드 규칙 채널 선택 → 프리서치 병렬 병렬 → 분석 호출.

import { available as naverAvailable, searchNaver, name as NAVER_NAME } from './channels/naver.js';
import { available as githubAvailable, searchGithub, name as GITHUB_NAME } from './channels/github.js';
import { lawAvailable, searchLaw, NAME as LAW_NAME } from './channels/law.js';

// ---------- 상수 ----------

const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';
const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
const MAX_TOKENS_ANALYSIS = 3000;
const MAX_TOKENS_QUERY = 400;
const CALL_TIMEOUT_MS = 90_000;
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
    available: false, // 모듈 없음 → 항상 스킵
    label: '공공데이터',
    search: null,
  },
  {
    name: 'stats',
    available: false, // 모듈 없음 → 항상 스킵
    label: '통계',
    search: null,
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

// ---------- 근거 등급 (코드 결정) ----------

function gradeFor(host, channel) {
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

const VERDICT_PREFIX = {
  [VERDICT_CAN]: VERDICT_CAN,
  [VERDICT_MUST]: VERDICT_MUST,
  [VERDICT_MIX]: VERDICT_MIX,
  [VERDICT_NONE]: VERDICT_NONE,
};

function normalizeVerdict(raw, findingsCount) {
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
네 가지 고정 값 중 하나로 verdict를 냅니다: 가져가 써도 됨 / 직접 해야 함 / 섞어야 함 / 선례를 못 찾음.
- 자료가 0건이면 "직접 해야 함"만 인정합니다. 그 외엔 "선례를 못 찾음".
- 자료가 있는데 "선례를 못 찾음"이면 "직접 해야 함"으로, 넷 어느 것도 아니면 "가져다 써도 됨"으로 정상화합니다(코드 정규화 대상이지만 모델도 예측 가능).

최종 출력은 아래 스키마를 정확히 따르는 JSON 객체 하나입니다. 마크다운·설명 텍스트 없이 JSON만 출력합니다.

{
  "claimType": "기술"|"정량/법적"|"맥락",
  "verdict": "가져다 써도 됨"|"직접 해야 함"|"섞어야 함"|"선례를 못 찾음",
  "verdictReason": "판정 근거 한 줄",
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

async function callSolar(messages, { tools = false, tool_choice = 'auto', maxTokens = MAX_TOKENS_ANALYSIS } = {}) {
  const key = process.env.SOLAR_API_KEY;
  if (!key) throw new Error('Solar API key not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
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

async function runChannelSearch(channelName, query) {
  const ch = CHANNELS.find((c) => c.name === channelName);
  if (!ch || !ch.search) return [];
  try {
    if (channelName === 'web') {
      // 기존 searchWeb 함수 재사용 (SEARCH_API_KEY 기반)
      return await searchWeb(query);
    }
    if (channelName === 'oss') {
      const results = await searchGithub(query, MAX_RESULTS_PER_CHANNEL);
      return results.map(r => ({ ...r, channel: 'oss' }));
    }
    if (channelName === 'law') {
      const results = await searchLaw(query, MAX_RESULTS_PER_CHANNEL);
      return results.map(r => ({ ...r, channel: 'law' }));
    }
    return [];
  } catch (e) {
    console.warn(`채널 ${channelName} 검색 중 오류:`, e.message);
    return [];
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
    console.warn('쿼리 생성 호출 실패:', e.message);
    // 단계 제목에서 같은 상한으로 대체
    const fallbackWords = clampWords(stage.title, 3);
    if (!fallbackWords) return [];
    // 계획된 채널 각각에 같은 대체 검색어
    return plannedChannels.map((ch) => ({ channel: ch, query: fallbackWords }));
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
    const grade = gradeFor(host, channel);
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
  const verdictReason = modelOutput?.verdictReason || (findingsCount ? '검색 자료 확인' : '검색 상한 내 유효한 선례를 못 찾음');

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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
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
  const hasSearchKey = !!(process.env.SEARCH_API_KEY);
  const isEmptyEnv = !hasSolarKey && !hasSearchKey;

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
      return new Response(JSON.stringify({ error: 'stage.title 필요' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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

    // 3) 프리서치: 규칙 채널 병렬 실행
    const preResults = [];
    let calls = 0;
    const prePromises = plannedFinal.map(async (ch) => {
      const q = queryMap.get(ch) || stage.title;
      const results = await runChannelSearch(ch, q);
      calls++;
      return { channel: ch, results, query: q };
    });

    const preResultsList = await Promise.all(prePromises);
    for (const { channel, results, query } of preResultsList) {
      for (const r of results.slice(0, MAX_RESULTS_PER_CHANNEL)) {
        preResults.push({ ...r, query });
      }
    }

    // 4) 분석 호출 (tool_choice auto)
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildAnalysisPrompt(stage, summary, preResults, plannedFinal) },
    ];

    let analysisResult;
    try {
      analysisResult = await callSolar(messages, { tools: tools.length ? tools : false, tool_choice: 'auto', maxTokens: MAX_TOKENS_ANALYSIS });
    } catch (e) {
      console.warn('분석 호출 실패:', e.message);
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

    // 도구 호출 처리 (상한 MAX_CALLS_PER_STAGE)
    const toolMessages = messages.slice();
    let toolCallCount = 0;
    const toolResults = [];
    let toolResult = analysisResult;

    while (toolCallCount < MAX_CALLS_PER_STAGE) {
      const tcs = toolResult?.toolCalls;
      if (!tcs?.length) break;

      const tc = tcs[0];
      if (!tc || tc.function?.name !== 'web_search' && tc.function?.name !== 'github_search' && tc.function?.name !== 'law_search') break;

      try {
        const args = JSON.parse(tc.function.arguments || '{}');
        const q = args.query || '';
        if (!q) break;

        let results = [];
        let chname = 'web';
        if (tc.function.name === 'github_search') {
          results = await searchGithub(q, MAX_RESULTS_PER_CHANNEL);
          chname = 'oss';
        } else if (tc.function.name === 'law_search') {
          results = await searchLaw(q, MAX_RESULTS_PER_CHANNEL);
          chname = 'law';
        } else {
          results = await searchWeb(q);
        }

        // 낱말 상한 적용
        const clamped = clampWords(q, tc.function.name === 'law_search' || tc.function.name === 'stats' ? 2 : tc.function.name === 'public_data' ? 3 : 4);
        calls++;
        toolCallCount++;

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
        console.warn('도구 실행 중 오류:', e.message);
        break;
      }
    }

    // 5) id 카탈로그 구축
    const catalog = buildCatalog(preResults, toolResults);

    // 모델 findings 조립 (카탈로그 없는 id 버림)
    const parsed = parseSolarJson(toolResult.content || '');
    const findings = assembleFindings(parsed, catalog);
    const calledChannels = new Set();
    for (const f of findings) calledChannels.add(f.channel);

    // scope
    const scopeCalls = calls + toolCallCount;
    const scope = {
      claimType: parsed?.claimType || '기술',
      channels: [...calledChannels],
      calls: scopeCalls,
      queries: queries.map((q) => `${q.channel}:${q.query}`),
      planned: plannedFinal,
    };

    const verdict = normalizeVerdict(parsed?.verdict, findings.length);
    const verdictReason = parsed?.verdictReason || (findings.length ? '검색 자료 확인' : '검색 상한 내 유효한 선례를 못 찾음');

    let options = parsed?.options || stage.choices || [];
    let todos = (parsed?.todos || []).map((t) => ({
      task: t.task,
      owner: t.owner === '직접 함' ? '직접 함' : '가져다 씀',
      note: t.note || '',
    }));

    if (todos.length === 0 && findings.length === 0) {
      for (const t of stage.tasks || []) {
        todos.push({ task: t.task, owner: '직접 함', note: t.why || '' });
      }
    }

    options = options.slice(0, 5);
    todos = todos.slice(0, 5);

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
      verdictReason,
      findings: frontendFindings,
      choices: stage.choices || [],
      options,
      todos,
      searched: true,
      scope,
    };

    return new Response(JSON.stringify({ stage: stagePayload }), {
      headers: stageHeaders(source, [...calledChannels], forceMode),
    });
  } catch (err) {
    console.error('stage.js 오류:', err.message);
    return new Response(JSON.stringify({ error: err.message || '서버 오류' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
      return new Response(JSON.stringify({ error: 'stage.title 필요' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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
          verdictReason: 'Solar 호출 단계에서 오류가 발생해 검색 상한 내 유효한 선례를 못 찾음',
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
    console.error('폴백 처리 중 오류:', err.message);
    return new Response(JSON.stringify({ error: err.message || '서버 오류' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
