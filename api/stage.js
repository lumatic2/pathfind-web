// /api/stage — 단계 1개 검색 리서치 (채널 5종, 규칙 기반 선택)
// 계약: docs/api-contract.md §3 · §7. 경로별 제공자 추상화 유지.
// 변경: 기존 단일 web_search 2회 상한 → 채널 5종(나이버·GitHub·법령·공공데이터·통계) 중
//       단계 텍스트 키워드로 코드 규칙 채널 선택 → 프리서치 병렬 병렬 → 분석 호출.
//
// 7차 step-28 보강: 검색 채널의 인자와 결과를 단계 조사에 연결.
//  - channelOpts: 목표화면 channelOpts를 그대로 계산(law→{extraTerms,contextWords}, stats→{stage})
//  - runChannelSearch: display·stage·extraTerms·contextWords·trace를 채널 함수에 전달
//  - searchWeb → searchWebBundle: 네이버 webkr·blog·cafearticle 병렬 + rankReviews 연결
//  - 도구 호출부(github_search·law_search·web_search)도 runChannelSearch + channelOpts로 통일

import { sendError, logCall } from './_lib/http.js';
import { available as naverAvailable, rankReviews, searchNaver, name as NAVER_NAME } from './_channels/naver.js';
import { available as githubAvailable, searchGithub, name as GITHUB_NAME } from './_channels/github.js';
import { lawAvailable, searchLaw, NAME as LAW_NAME, isRelevantHit } from './_channels/law.js';
import { available as publicDataAvailable, searchPublicData, name as PUBLIC_DATA_NAME } from './_channels/public-data.js';
import { available as kosisAvailable, searchKosis, name as KOSIS_NAME } from './_channels/kosis.js';
import { reviewFindings } from './_lib/review-findings.js';
import { selectFindings, normalizeCandidate, pickSupplementCandidates } from './_lib/select-findings.js';
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

// ---------- 채널 계획 전용 도구 이름 (목표화면 assembly 대응) ----------

const PLAN_TOOL_BY_CHANNEL = {
  web: 'pathfind_web_search',
  oss: 'pathfind_oss_search',
  law: 'pathfind_law_search',
  stats: 'pathfind_stats_search',
  public_data: 'pathfind_public_data_search',
};

// ---------- 키워드 규칙 ----------

function stageText(stage) {
  return [stage.title, stage.desc, ...(stage.tasks ?? []).map((t) => `${t.task} ${t.why ?? ''}`), ...(stage.choices ?? [])].join('\n');
}

const OSS_STRONG = /앱|API|소프트웨어|사이트|데이터베이스|대시보드|크롤|봇|웹|자동화|오픈소스|라이브러리|코드|개발|서버|배포|스키마/;
const OSS_WEAK = /도구|서비스|예약|결제|알림|프로그램|시스템|플랫폼/;
const OSS_CONTEXT = new RegExp(`${OSS_STRONG.source}|구현|데이터|추출|저장`);
function ossApplies(text) {
  if (OSS_STRONG.test(text)) return true;
  return OSS_WEAK.test(text) && OSS_CONTEXT.test(text);
}

const CHANNEL_RULES = {
  law: /허가|신고|등록|계약|세금|세무|개인정보|임대차|영업|법령|법적|법률|규제|약관|저작권|사업자|보험|근로|안전|위생|인증|표시/,
  stats: /비용|예산|시세|시장|수요|인구|매출|규모|통계|가격|단가|수익|고객층|연령|소득|성장|점유|추이/,
  public_data: /상권|지역|시설|현황|지자체|공공|행정|동네|주변|위치|입지|교통|학교|병원|관광|기상|날씨/,
  oss: new RegExp(`${OSS_STRONG.source}|${OSS_WEAK.source}`),
};

/** 키 있는 채널 가운데 규칙에 걸린 것. 웹은 키만 있으면 항상. */
function planChannels(stage, keys) {
  const text = stageText(stage);
  return keys.filter((k) => k === 'web' || (k === 'oss' ? ossApplies(text) : CHANNEL_RULES[k] && CHANNEL_RULES[k].test(text)));
}

/** 단계 글에서 그 채널 규칙에 실제로 걸린 낱말을 뽑는다(5차 step-12). */
function matchedRuleWords(stage, channel) {
  const re = CHANNEL_RULES[channel];
  if (!re) return [];
  const hits = stageText(stage).match(new RegExp(re.source, 'g')) ?? [];
  return [...new Set(hits)].sort((a, b) => b.length - a.length);
}

/** 단계 글의 내용 낱말 — 한글 2자 이상 토막만 쓴다. */
function stageContextWords(stage) {
  const hits = String(stageText(stage)).match(/[가-힣]{2,}/g) ?? [];
  return [...new Set(hits)];
}

/**
 * 목표화면 channelOpts와 같은 값. law는 extraTerms·contextWords, stats는 stage를 돌려 준다.
 * buildCatalog가 받는 결선 형식으로만 반환한다.
 */
function channelOpts(channel, stage) {
  if (!stage) return undefined;
  if (channel === 'law') return { extraTerms: matchedRuleWords(stage, 'law'), contextWords: stageContextWords(stage) };
  if (channel === 'stats') return { stage };
  return undefined;
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

// ---------- 웹 번들 (목표화면 searchWebBundle) ----------

/**
 * 네이버 webkr·blog·cafearticle을 병렬로 호출하고, 블로그·카페 결과에 rankReviews를 연결해
 * web Review 1건씩만 남긴다(목표화면 searchWebBundle·channelOpts 반영).
 *
 * opts.display는 webkr에만 쓰고, 블로그·카페는 최대 3건 받아 rankReviews로 1건씩 추린다.
 * 채널 실패는 캐치하지 않고 호출부로 올린다 — webkr 실패만 표면화된다.
 */
async function searchWebBundle(query, opts = {}) {
  const display = opts.display ?? MAX_RESULTS_PER_CHANNEL;
  const [web, blog, cafe] = await Promise.all([
    searchNaver(query, { kind: 'webkr', display }),
    searchNaver(query, { kind: 'blog', display: 3 }).catch(() => []),
    searchNaver(query, { kind: 'cafearticle', display: 3 }).catch(() => []),
  ]);
  const reviews = [
    ...rankReviews(blog).slice(0, 1),
    ...rankReviews(cafe).slice(0, 1),
  ];
  return [...web, ...reviews.map((r) => ({ ...r, channel: 'web_review' }))];
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
      const relevant = isRelevantHit(r, String(query || ''), stageWords, { query: String(query || '') });
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

/** 모델이 고르는 이름 → 계약 값 (6차 · 「선례」 낱말 제거).
 *
 * 모델에게는 「선례」라는 낱말을 한 번도 보여 주지 않는다. 5차·6차 실측에서 모델이
 * verdictLine 산문에 그 낱말을 그대로 옮겨 적었다 — 프롬프트가 「종류 이름으로 적어라」고
 * 지시해도 못 이겼다. 계약 값 이름이 세 군데에서 그 낱말을 가르치고 있었기 때문이다.
 *
 * 그래서 모델이 고르는 이름만 바꾸고 저장되는 계약 값은 그대로 둔다.
 */
const VERDICTS = ['가져다 써도 됨', '직접 해야 함', '섞어야 함', '선례를 못 찾음'];
const VERDICT_ALIAS = { '쓸 만한 자료 없음': '선례를 못 찾음' };

/** 판정은 자료가 뒷받침해야 한다 — 자료 0건이면 「가져다 써도 됨」·「섞어야 함」이 성립하지 않는다. */
function normalizeVerdict(v, findingsCount) {
  const t = String(v ?? '').trim();
  const aliased = Object.keys(VERDICT_ALIAS).find((k) => t.startsWith(k));
  const hit = aliased ? VERDICT_ALIAS[aliased] : VERDICTS.find((k) => t.startsWith(k));
  if (!findingsCount) return hit === '직접 해야 함' ? hit : '선례를 못 찾음';
  // 자료가 있는데 「못 찾음」은 모순 — 「참고는 되지만 직접 만든다」가 계약 값으로는 「직접 해야 함」이다
  if (!hit || hit === '선례를 못 찾음') return hit ? '직접 해야 함' : '가져다 써도 됨';
  return hit;
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
            query: { type: 'string', description: '영문 키워드 2~4개. 예: \"react dashboard template\".' },
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
            query: { type: 'string', description: '법령 이름 핵심 낱말 1~2개. 예: \"개인정보 보호\".' },
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

/**
 * 채널을 실제로 부른다. display·stage·extraTerms·contextWords·trace를 채널 함수에 전달.
 * web은 searchWebBundle(네이버 병렬 + rankReviews), 나머지는 각 채널 함수를 opts와 함께 호출.
 * 채널 실패는 부분 실패로 남기고 전체 성공으로 숨기지 않는다.
 */
async function runChannelSearch(channelName, query, stage = null, opts = {}) {
  const ch = CHANNELS.find((c) => c.name === channelName);
  if (!ch || !ch.search) return { results: [], calls: 0 };
  try {
    if (channelName === 'web') {
      const results = await searchWebBundle(query, opts);
      return { results, calls: 1 };
    }
    if (channelName === 'oss') {
      const results = await searchGithub(query, { display: opts.display ?? MAX_RESULTS_PER_CHANNEL, stage: opts.stage ?? stage });
      return { results: results.map((r) => ({ ...r, channel: 'oss' })), calls: 1 };
    }
    if (channelName === 'law') {
      const results = await searchLaw(query, {
        display: opts.display ?? MAX_RESULTS_PER_CHANNEL,
        extraTerms: opts.extraTerms,
        contextWords: opts.contextWords,
        trace: opts.trace,
        stage: opts.stage ?? stage,
      });
      return { results: results.map((r) => ({ ...r, channel: 'law' })), calls: 1 };
    }
    if (channelName === 'stats') {
      const results = await searchKosis(query, {
        display: opts.display ?? MAX_RESULTS_PER_CHANNEL,
        stage: opts.stage ?? stage,
      });
      return { results, calls: 1 };
    }
    if (channelName === 'public_data') {
      const results = await searchPublicData(query, { display: opts.display ?? MAX_RESULTS_PER_CHANNEL });
      return { results, calls: 1 };
    }
    return { results: [], calls: 0 };
  } catch (e) {
    logCall('stage.runChannelSearch', 0, 0, { 'x-channel': channelName });
    return { results: [], calls: 1, error: true };
  }
}

// ---------- searchWeb: 네이버 searchWebBundle을 경유 ----------

/**
 * 기존 searchWeb 자리. 이제 네이버 searchWebBundle을 돌려 web·web_review 결과를 받는다.
 * display·trace 등 opts를 searchWebBundle에 전달한다.
 */
async function searchWeb(query, opts = {}) {
  return searchWebBundle(query, opts);
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

const QUERY_HINT = {
  web: '한국어 핵심 명사 2~4개(예: 카페 예약 시스템 사례)',
  oss: '영문 키워드 2~4개(예: cafe reservation booking)',
  law: '법령 이름에 들어갈 낱말 1~2개(예: 식품위생, 전자상거래)',
  stats: '통계표 이름에 들어갈 낱말 1~2개(예: 소상공인, 온라인쇼핑)',
  public_data: '데이터셋 이름에 들어갈 낱말 2~3개(예: 상권 정보, 인구 현황)',
};
const QUERY_MAX_WORDS = { web: 4, oss: 4, law: 2, stats: 2, public_data: 3 };
const QUERY_SYSTEM = `아이디어 패스의 한 단계를 조사하려고 채널별 검색어를 정합니다. 요청한 채널마다 검색어 하나씩을 냅니다. 채널마다 검색어 모양이 다릅니다 — 안내를 그대로 따릅니다.
출력 형식 (JSON만, 다른 텍스트 금지): {"<채널>": "<검색어>", ...} — 요청한 채널 키만 씁니다.`;
const HANGUL = /[가-힣]/;

function trimQuery(channel, q) {
  const words = String(q ?? '').replace(/[\",.]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, QUERY_MAX_WORDS[channel] ?? 4).join(' ');
}

/** 규칙에 걸린 채널의 검색어를 모델에게 한 번에 받는다. */
async function planQueries(key, stage, summary, planned) {
  let parsed = null;
  try {
    const r = await callSolar([
      { role: 'system', content: QUERY_SYSTEM },
      { role: 'user', content: `[프로젝트 요약]\n${summary || '(없음)'}\n\n[조사할 단계]\n${stageText(stage)}\n\n[채널]\n${planned.map((k) => `- ${k}: ${QUERY_HINT[k]}`).join('\n')}` },
    ], { maxTokens: MAX_TOKENS_QUERY });
    parsed = parseSolarJson(r.content);
  } catch { /* 아래 폴백 */ }
  const out = Object.fromEntries(planned.map((k) => [k, trimQuery(k, parsed?.[k]) || trimQuery(k, stage.title)]));
  if (planned.includes('oss') && HANGUL.test(out.oss)) out.oss = await toEnglishQuery(key, out.oss || stage.title);
  return out;
}

/** 한국어 검색어 → GitHub 용 영문 키워드 2~4개. 실패하면 빈 문자열. */
async function toEnglishQuery(key, text) {
  try {
    const r = await callSolar([
      { role: 'system', content: 'GitHub 저장소를 찾기 위한 영문 키워드 2~4개만 출력합니다. 소문자 영문과 공백만 씁니다. 다른 텍스트는 쓰지 않습니다.' },
      { role: 'user', content: String(text) },
    ], { maxTokens: 40 });
    const ascii = String(r.content ?? '').replace(/[^A-Za-z0-9 +._-]/g, ' ').replace(/\s+/g, ' ').trim();
    return ascii ? trimQuery('oss', ascii) : '';
  } catch {
    return '';
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
  if (!findings.length) return renumberedBody;
  const originalStripped = stripCitationMarks(originalBody);
  const N = findings.length;
  const prompt = `아래 문장에 근거가 되는 자료 번호를 붙여 주세요.
자료는 아래 목록입니다. 각 자료에 순서대로 번호를 붙입니다.
문장 내용은 절대 바꾸지 말고, 근거가 되는 곳마다 해당 자료 번호 마크를 붙이세요.
결과에는 마크가 붙은 문장 하나만 출력하고 다른 설명은 넣지 마세요.

자료 (번호와 이름, 같은 순서):
${findings.map((f, i) => `${i + 1}. ${f.name || f.id}`).join('\n')}

원문:
${originalBody}`;
  try {
    const res = await callSolar(
      [{ role: 'system', content: '당신은 근거 번호를 문장에 붙이는 어시스턴트입니다. JSON 없이 문장만 출력합니다.' }, { role: 'user', content: prompt }],
      { tools: false, tool_choice: 'auto', maxTokens: 1500, timeoutMs: 60_000 },
    );
    if (!res.content) return renumberedBody;
    const returnedText = res.content.trim();
    if (typeof returnedText !== 'string') return renumberedBody;
    if (returnedText.length === 0) return renumberedBody;
    const normalizeForCompare = (s) =>
      s.replace(/[\s]+/g, ' ').replace(/\s+([.!?。])/g, '$1').trim();
    if (normalizeForCompare(stripCitationMarks(returnedText)) !== normalizeForCompare(stripCitationMarks(originalBody))) {
      return renumberedBody;
    }
    const markRegex = /\[(\d+)\]/g;
    const markNums = [];
    let m;
    while ((m = markRegex.exec(returnedText)) !== null) {
      const n = +m[1];
      if (!Number.isInteger(n) || n < 1 || n > N) return renumberedBody;
      markNums.push(n);
    }
    if (markNums.length === 0) return renumberedBody;
    // 번호가 하나라도 있으면 그 문장을 쓴다. '없는 번호'는 최종 자료 개수(N) 밖의 번호만 뜻한다.
    // 범위 안의 번호가 일부 빠져 있어도, 모델이 문장 내용에 맞춰 선택적으로 붙인 것으로 본다.
    return returnedText;
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

    // ---------- planOnly: 단계 조사 전 채널 계획(검색·모델 호출 없이 계획만 반환) ----------
    if (body.planOnly === true) {
      const planned = planChannels(stage, AVAILABLE_CHANNEL_NAMES).map((channel) => ({
        channel,
        tool: PLAN_TOOL_BY_CHANNEL[channel] ?? `pathfind_${channel}_search`,
        why: channel === 'web' ? '어느 주제에나 먼저 본다' : matchedRuleWords(stage, channel).slice(0, 5).join(', '),
        queryHint: QUERY_HINT[channel] ?? '핵심 명사 2~4개',
      }));
      return new Response(JSON.stringify({ planned }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1) 채널 선택 (코드 규칙)
    const planned = planChannels(stage, activeChannels);
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
    const plannedQueries = await planQueries(/* key= */ null, stage, summary, plannedFinal);
    const queryMap = new Map(Object.entries(plannedQueries));
    const queries = [];

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
      const stageWords = stageContextWords(stage);
      const opts = channelOpts(ch, stage);
      const { results: chResults, calls: chSearchCalls, error: channelFailed } = await runChannelSearch(ch, q, stage, opts);
      queries.push({ channel: ch, query: q });
      if (channelFailed) logCall('stage.preSearch.failed', 0, 502, { 'x-channel': ch });
      chCalls = chSearchCalls;
      const stats = ensureStats(ch);
      stats.calls += chSearchCalls;
      stats.returned += chResults.length;
      results = chResults;
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
          // 호출 전에 주제 검색 예상 호출 수를 더했을 때 상한을 넘으면 건너뛴다.
          const predictedTopicCalls = ch === 'web' ? 3 : 1;
          if (calls + predictedTopicCalls > MAX_CALLS_PER_STAGE) {
            logCall('stage.topicSupplement.skipped', 0, 0, {
              channel: ch,
              query: topicQuery,
              reason: 'callLimit',
            });
          } else {
            queries.push({ channel: ch, query: topicQuery });
            const { results: tResults, calls: tCalls, error: channelFailed } = await runChannelSearch(
              ch,
              topicQuery,
              stage,
              channelOpts(ch, stage),
            );
            if (channelFailed) logCall('stage.topicSupplement.failed', 0, 502, { 'x-channel': ch });
            const tStats = ensureStats(ch);
            tStats.returned += tResults.length;
            tStats.calls += tCalls; // 실제 부른 횟수를 채널 통계에 더한다
            const topicSlotsLeft = MAX_CALLS_PER_STAGE - calls;
            preResults.push(
              ...tResults
                .slice(0, Math.min(MAX_RESULTS_PER_CHANNEL, topicSlotsLeft))
                .map((r) => ({ ...r, query: topicQuery })),
            );
            calls += tCalls;
            logCall('stage.topicSupplement', 0, 0, { channel: ch, query: topicQuery });
          }
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
        queries.push({ channel: chname, query: q });
        const opts = channelOpts(chname, stage);
        const { results, error: channelFailed } = await runChannelSearch(chname, q, stage, opts);
        if (channelFailed) logCall('stage.toolRun.failed', 0, 502, { 'x-channel': chname });
        ensureStats(chname).returned += results.length;

        // web 결과에서 stats/public_data로 분류된 항목도 관문을 지나게 한다
        if (chname === 'web' && stage && results.some((r) => r.channel === 'stats' || r.channel === 'public_data')) {
          const stageWords = stageContextWords(stage);
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

    const TARGET_CHANNELS = new Set(['law', 'stats', 'public_data']);

    // 대상 채널 finding만 골라낸다 (처음 모델이 고른 법령·통계·공공데이터)
    const targetFindings = findings.filter((f) => TARGET_CHANNELS.has(f.channel));

    // 카탈로그에서 아직 고르지 않은 대상 채널 후보를 상한 내로 고른다
    const selectedIds = new Set(findings.map((f) => f.id));
    const supplementRaw = pickSupplementCandidates([...catalog.values()], selectedIds, TARGET_CHANNELS);
    // reviewFindings가 읽는 필드(id/name/evidence/url/channel)에 맞춰 보충 후보를 정리한다
    const supplementForReview = supplementRaw.map((c) => ({
      id: c.id,
      name: c.title || '항목',
      evidence: (c.snippet || '').slice(0, 300),
      url: c.url || '',
      channel: c.channel,
    }));

    // 처음 고른 대상 + 보충 후보를 합쳐 한 번만 뜻으로 확인한다
    const toReview = [...targetFindings, ...supplementForReview];
    let reviewResult;
    if (toReview.length > 0) {
      try {
        reviewResult = await reviewFindings(stage, toReview, callSolar, MODEL_REVIEW_TIMEOUT_MS);
      } catch (e) {
        logCall('stage.reviewFindings', 0, 0, { err: String(e) });
        reviewResult = { kept: [], dropped: toReview.length, timedOut: false };
      }
    } else {
      reviewResult = { kept: [], dropped: 0, timedOut: false };
    }

    // 리뷰 결과를 호출부가 정리한다: 시간 초과 신호를 확실히 세워
    // vetTimeout을 "뜻 판정 시간 초과로 못 세운 자료 수"로 쓰게 한다.
    const reviewTimedOut =
      reviewResult && reviewResult.timedOut ? true : false;
    reviewResult = { ...reviewResult, timedOut: reviewTimedOut };

    // 통과된 것만 추려 최종 선택 앞단계로 넘긴다
    const reviewedIds = new Set(reviewResult.kept.map((f) => f.id));
    const supplementOriginallySelectedIds = new Set(supplementForReview.map((c) => c.id));
    // 통과된 보충 후보는 kind/grade를 채워 프론트 표시 형태로 맞춘다 (이미 note는 붙어 있음)
    const preparedSupplement = reviewResult.kept
      .filter((f) => supplementOriginallySelectedIds.has(f.id))
      .map((f) => {
        const norm = normalizeCandidate({ ...f, title: f.name, snippet: f.evidence, form: f.form || '' });
        return { ...norm, note: f.note || '' };
      });
    const reviewedFindings = [
      ...preparedSupplement,
      ...reviewResult.kept.filter((f) => !supplementOriginallySelectedIds.has(f.id)),
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
    const vetRejected = reviewResult?.timedOut ? 0 : reviewResult?.dropped ?? 0;
    const vetTimeout = reviewResult?.timedOut ? (reviewResult?.dropped ?? 0) : 0;

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

    /** 모델 산출 → 화면에 설 문자열 둘. 재요청 뒤 같은 조립을 다시 태우려고 함수로 묶었다.
     *  `srcToFinal` 은 재요청은 내용을 그대로 두고 근거만 달아 달라는 요청이라 자료 목록이 안 바뀐다. */
    const assembleText = (p) => {
      // verdictLine 도 최종 자료 순번으로 다시 매긴다 — 현재는 verdictLine을 안건드렸으나 목표화면은 여기도 renumberMarks를 태운다.
      const verImporterNumberMarks = (text) => {
        const finalIds = new Set(findingsAfterReview.map((f) => f.id));
        const idToNewNum = new Map();
        findingsAfterReview.forEach((f, idx) => {
          if (f.id) idToNewNum.set(f.id, idx + 1);
        });
        return String(text ?? '').replace(/(\s*)\[(\d{1,2})\]/g, (_whole, space, raw) => {
          const src = (parsed?.findings || []).find((f, i) => i + 1 === Number(raw));
          const id = src?.id;
          if (!id || !finalIds.has(id)) return '';
          const to = idToNewNum.get(id);
          return to ? `${space}[${to}]` : '';
        });
      };

      const verdictLine = verImporterNumberMarks(parsed?.verdictLine).trim();
      /** 이유 문단의 층위는 스키마가 담당한다 — 산문 대신 배열로 받고 글머리표 조립은 코드가 한다. */
      const reasonPoints = (Array.isArray(parsed?.reasonPoints) ? parsed.reasonPoints : [])
        .map((x) => ({ label: String(x?.label ?? '').trim(), text: String(x?.text ?? '').trim() }))
        .filter((x) => x.text)
        .slice(0, 5);
      const leadRaw = String(parsed?.verdictReason ?? '').trim();
      const leadLines = leadRaw.split(/\r?\n/);
      const lead = (reasonPoints.length ? leadLines.filter((l) => !/^\s*[-*•]\s+/.test(l)) : leadLines).join('\n').replace(/\n\s*\n+/g, '\n\n').trim();
      const reasonBody = [lead, ...(reasonPoints.length ? [reasonPoints.map((x) => (x.label ? `- **${x.label}**: ${x.text}` : `- ${x.text}`)).join('\n')] : [])]
        .filter(Boolean)
        .join('\n\n');
      /** 모델이 이유 문장들을 통째로 비우면 — 찾은 자료 note 를 글머리표로 옮긴다(지어내는 게 아니라 자리 이동). */
      const fromNotes = findingsAfterReview
        .map((f, i) => ({ name: String(f.name ?? '').trim(), note: String(f.note ?? '').trim(), n: i + 1 }))
        .filter((x) => x.name && x.note)
        .slice(0, 4)
        .map((x) => `- **${x.name}**: ${x.note} [${x.n}]`)
        .join('\n');
      const verdictReason = verImporterNumberMarks(reasonBody).trim() || (fromNotes ? '찾은 자료를 이렇게 쓸 수 있습니다.\n\n' + fromNotes : '');
      return { verdictLine, verdictReason };
    };
    let { verdictLine, verdictReason } = assembleText(parsed);

    /** 본문 마커가 0인 단계만 한 번 더 묻는다(재요청은 도구를 안 부르고 이미 쓴 말에 근거만 달아 달라고 한다). */
    const countMarks = (parsed) => {
      const texts = [
        String(parsed?.verdictLine ?? ''),
        String(parsed?.verdictReason ?? ''),
        ...(Array.isArray(parsed?.reasonPoints) ? parsed.reasonPoints.map((x) => String(x?.text ?? '')) : []),
      ];
      return (texts.join('\n').match(/\[\d{1,2}\]/g) ?? []).length;
    };
    if (!countMarks({ verdictLine, verdictReason }) && findingsAfterReview.length) {
      try {
        const lastContent = parsed ? String(parsed?.content || '') : '';
        const messagesForRetry = [
          { role: 'assistant', content: lastContent || null },
          { role: 'user', content: `같은 내용을 그대로 두고, 근거가 된 자료를 그 문장 끝에 [n] 으로 달아 최종 JSON 만 다시 출력합니다. n 은 findings 의 순서(첫 항목이 1)이고 1~${findingsAfterReview.length} 만 씁니다. 근거로 댈 자료가 없는 문장에는 달지 않습니다.` },
        ];
        const again = await callSolar(messagesForRetry, { tools: false, maxTokens: 3000, timeoutMs: 90000 });
        const reparsed = parseSolarJson(again.content || '');
        const redone = reparsed ? assembleText(reparsed) : null;
        if (redone && countMarks(redone) > 0) {
          verdictLine = redone.verdictLine;
          verdictReason = redone.verdictReason;
          parsed = reparsed;
        }
      } catch (e) {
        // 재요청 실패 — 원래 결과를 그대로 쓴다(폴백은 아래 이름 대조).
      }
    }

    /** 재요청도 실패했으면 꼬리 배지로 내려가기 전에 이름 대조로 한 번 더 붙잡는다. */
    if (!countMarks({ verdictLine, verdictReason }) && findingsAfterReview.length) {
      const names = findingsAfterReview.map((f, i) => ({ n: i + 1, name: String(f.name ?? '') }));
      const attachMarksByName = (text, cites) => {
        const src = String(text ?? '');
        const list = (cites ?? [])
          .map((c) => ({ n: Number(c?.n), name: String(c?.name ?? '').trim() }))
          .filter((c) => Number.isInteger(c.n) && c.n > 0 && c.name.length >= 2);
        if (!src.trim() || !list.length) return src;
        const parts = src.split(/(?<=[.!?])(?=\s)|(?=\n)/);
        const used = new Set();
        return parts
          .map((part) => {
            if (/\[\d{1,2}\]/.test(part)) return part;
            const hit = list.find((c) => !used.has(c.n) && part.includes(c.name));
            if (!hit) return part;
            used.add(hit.n);
            const m = /^([\s\S]*?)([.!?]\s*)$/.exec(part);
            return m ? `${m[1]} [${hit.n}]${m[2]}` : `${part} [${hit.n}]`;
          })
          .join('');
      };
      const lined = {
        verdictLine: attachMarksByName(verdictLine, names),
        verdictReason: attachMarksByName(verdictReason, names),
      };
      const got = countMarks(lined);
      if (got > 0) {
        verdictLine = lined.verdictLine;
        verdictReason = lined.verdictReason;
      }
    }

    let options = (Array.isArray(parsed?.options) ? parsed.options : stage.choices ?? []).map(String).slice(0, 5);
    let todos = (Array.isArray(parsed?.todos) ? parsed.todos : [])
      .filter((t) => t && typeof t.task === 'string' && t.task.trim())
      .map((t) => ({ task: t.task.trim(), owner: t.owner === '직접 함' ? '직접 함' : '가져다 씀', note: String(t.note ?? '') }))
      .slice(0, 5);
    if (!todos.length && !findingsAfterReview.length) {
      for (const t of stage.tasks ?? []) todos.push({ task: t.task, owner: '직접 함', note: t.why || '' });
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
      verdictReason,
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
