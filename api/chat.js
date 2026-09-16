// POST /api/chat — 조사 문서를 근거로 답하는 서버 함수
// 계약: docs/api-contract.md / roadmap/M07-대화인용/M07-스텝1.md
// 새로 만드는 건 이 파일뿐. 공용 Solar 호출은 _lib/solar.js 사용.
// 최대 실행 시간: Vercel 함수 maxDuration 90초 (vercel.json 확인 완료).

import { callSolar, SOLAR_MODEL, DEFAULT_MAX_TOKENS } from './_lib/solar.js';
import { logCall, sendError } from './_lib/http.js';

const CHAT_MAX_TOKENS = 2048;
const FORCE_HEADER = 'x-chat-force';
const SOURCE_HEADER = 'x-chat-source';

// 판정 4종 → 화면 문구 (계약 값을 저장·응답에 그대로 두고, 프롬프트용 표시만 바꿈)
const VERDICT_LABELS = {
  '가져다 써도 됨': '이미 있음',
  '직접 해야 함': '없음',
  '섞어야 함': '일부만 있음',
  '선례를 못 찾음': '못 찾음',
};

const DEFAULT_FOLLOW_UPS = [
  '이 로드맵에서 먼저 할 일은',
  '직접 만들 것만 순서대로 정리해 줘',
  'ROADMAP.md 내려받기',
];

const NO_EVIDENCE_ANSWER = '이번 조사에는 없습니다.';
const NO_EVIDENCE_HELPFUL = '이 로드맵의 단계나 찾은 자료에 대해 물어보시면 그 문서를 근거로 답합니다.';
const FALLBACK_INTRO = '지금 답을 만들 수 없어 조사 문서를 그대로 정리합니다.';

const SYSTEM_PROMPT = `당신은 방금 끝난 조사 결과(패스)를 두고 사용자와 이야기하는 안내자입니다.
아래에 주어지는 조사 문서(요약·단계·판정·자료·할 일)만으로 답합니다.
답의 근거가 된 단계 번호를 evidenceStageNos에 적습니다. 근거로 쓴 자료는 citationNumbers와 citationNames에 번호와 이름을 함께 적습니다 — 이름은 자료 목록의 이름을 그대로 옮깁니다. 문서에 근거가 없는 질문이면 둘 다 빈 배열로 둡니다.

answer는 한국어 마크다운으로 씁니다 — 문단·- 목록·**굵게**·### 소제목까지만(표·이미지·링크는 화면이 그리지 않습니다).
자료를 근거로 쓴 문장 끝에는 그 자료 번호를 [n]으로 붙입니다(예: "... 공식 API가 있습니다 [3]").
followUpQuestions는 2~3개입니다.

출력 형식 (JSON만, 다른 텍스트 없이):
{
  "answer": "마크다운 답",
  "evidenceStageNos": [단계 번호],
  "citationNumbers": [자료 번호],
  "citationNames": [{"n": 자료 번호, "name": "자료 목록에 적힌 그 자료의 이름"}],
  "furtherResearch": "근거가 없을 때만 — 무엇을 더 조사하면 되는지 한 줄",
  "followUpQuestions": ["후속 질문", "..."]
}`;

// ---------- 자료 번호 매기기: 전역 n(1부터) ↔ 문서 id ----------

function buildDocs(stages) {
  const docs = [];
  for (const s of stages) {
    (Array.isArray(s.findings) ? s.findings : []).forEach((f, i) => {
      const name = String(f?.name ?? '');
      docs.push({
        n: docs.length + 1,
        number: docs.length + 1,
        id: `stage-${s.no}-finding-${i}`,
        stageNo: s.no,
        findingIndex: i,
        name,
        kind: String(f?.kind ?? ''),
        evidence: String(f?.evidence ?? ''),
        url: String(f?.url ?? ''),
      });
    });
  }
  return docs;
}

// ---------- 프롬프트: 조사 문서 직렬화에 단계·판정·자료·할 일·최근 대화 ----------

function buildContext({ summary, bigPicture, stages, docs }) {
  const lines = [`[프로젝트 요약]\n${summary || '(없음)'}`];
  if (bigPicture?.title) lines.push(`[패스 제목]\n${bigPicture.title}${bigPicture.intro ? `\n${bigPicture.intro}` : ''}`);

  const verdictLabel = (v) =>
    ({ '가져다 써도 됨': '이미 있음', '직접 해야 함': '없음', '섞어야 함': '일부만 있음', '선례를 못 찾음': '못 찾음' }[v] ?? v ?? '확인 불가');

  for (const s of stages) {
    const items = [
      `[단계 ${s.no}] ${s.title}`,
      s.desc ? `설명: ${s.desc}` : '',
      `이 단계 판정: ${s.verdict ? verdictLabel(s.verdict) : '미정'}${s.verdictReason ? ` — ${s.verdictReason}` : ''}`,
    ];
    const mine = docs.filter((d) => d.stageNo === s.no);
    items.push(
      mine.length
        ? `자료:\n${mine.map((d) => `  [${d.n}] ${d.name} (${d.kind}) ${d.url}\n      ${d.evidence}`).join('\n')}`
        : '자료: (없음)',
    );
    const tasks = Array.isArray(s.tasks) ? s.tasks : [];
    if (tasks.length) items.push(`할 일:\n${tasks.map((t) => `  - ${t.task}${t.why ? ` (${t.why})` : ''}`).join('\n')}`);
    const todos = Array.isArray(s.todos) ? s.todos : [];
    if (todos.length) items.push(`이미 있는 것 / 직접 해야 하는 것:\n${todos.map((t) => `  - [${t.owner}] ${t.task}`).join('\n')}`);
    lines.push(items.filter(Boolean).join('\n'));
  }
  return lines.join('\n\n');
}

function historyMessages(history) {
  return (Array.isArray(history) ? history : [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string')
    .slice(-6)
    .map((h) => ({ role: h.role, content: h.text }));
}

function buildPrompt({ summary, bigPicture, stages, history }) {
  const docs = buildDocs(stages);
  const context = buildContext({ summary, bigPicture, stages, docs });
  const messages = historyMessages(history);

  const parts = [`[조사 문서]\n${context}`];
  if (messages.length) parts.push('');

  return { context, prompts: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: parts.join('\n') }, ...messages] };
}

// ---------- 모델 응답 파싱 ----------

function parseChatResponse(content) {
  if (!content) return null;
  const trimmed = content.trim();

  // 코드 펜스 제거
  let text = trimmed;
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  } else {
    const parts = trimmed.split('```');
    if (parts.length >= 3) {
      text = parts[parts.length - 1].trim();
    }
  }

  // JSON 객체 추출 시도
  const candidates = [
    text,
    ...[...text.matchAll(/\{[\s\S]*\}/g)].map(m => m[0]),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // 다음 후보 시도
    }
  }

  return null;
}

// ---------- 코드 판정: 근거·인용 검증 + 인용 재매김 ----------

function validateAndRenumber(answer, evidenceStageNos, citationNumbers, citationNames, stages, furtherResearch) {
  // 실제 단계 번호 집합
  const actualStageNos = new Set(stages.map(s => s.no));
  const validStageNos = (evidenceStageNos || [])
    .filter(n => typeof n === 'number' && actualStageNos.has(n));

  // 자료 번호 → 정보 매핑 / 자료 이름 → 정보 매핑
  const materialMap = new Map();
  const nameToInfo = new Map();
  const materials = buildDocs(stages);
  for (const m of materials) {
    materialMap.set(m.n, m);
    const t = (m.name || '').trim();
    if (t && !nameToInfo.has(t)) nameToInfo.set(t, m);
  }

  let dropped = 0;
  let orderedNumbers = [];

  if (Array.isArray(citationNames) && citationNames.length > 0) {
    // 새 모양: n 번호 + name 자료 이름 객체 배열로 인용 검증
    const seen = new Set();
    for (const item of citationNames) {
      if (!item || typeof item !== 'object') { dropped++; continue; }
      const rawName = typeof item.name === 'string' ? item.name : '';
      const nameTrim = rawName.trim();
      const info = nameToInfo.get(nameTrim);
      if (!info) { dropped++; continue; }
      if (seen.has(info.n)) continue;
      seen.add(info.n);
      orderedNumbers.push(info.n);
    }
  } else {
    // 옛 모양: citationNumbers만으로 검증 (버리지 않음)
    dropped = 0;
    const validCitationNumbers = (citationNumbers || [])
      .filter(n => typeof n === 'number' && materialMap.has(n));

    if (validCitationNumbers.length === 0) {
      // 아래 빈 인용 처리를 위해 orderedNumbers는 빈 배열 유지
    } else {
      const mentionedNumbers = [];
      const seen = new Set();
      const regex = /자료\s*(\d+)/g;
      let match;
      while ((match = regex.exec(answer)) !== null) {
        const num = parseInt(match[1], 10);
        if (validCitationNumbers.includes(num) && !seen.has(num)) {
          mentionedNumbers.push(num);
          seen.add(num);
        }
      }

      const unmentionedNumbers = validCitationNumbers.filter(n => !seen.has(n));
      orderedNumbers = [...mentionedNumbers, ...unmentionedNumbers];
    }
  }

  // 둘 다 비어 있으면 "이번 조사에는 없습니다" 경로
  if (validStageNos.length === 0 && orderedNumbers.length === 0) {
    const fallbackAnswer = furtherResearch
      ? `${NO_EVIDENCE_ANSWER} ${furtherResearch}`
      : `${NO_EVIDENCE_ANSWER} ${NO_EVIDENCE_HELPFUL}`;
    return {
      answer: fallbackAnswer,
      evidenceStageNos: [],
      citationTitles: [],
      citationIds: [],
      hasEvidence: false,
      dropped,
    };
  }

  const citationTitles = [];
  const citationIds = [];
  for (const num of orderedNumbers) {
    const info = materialMap.get(num);
    if (info) {
      citationTitles.push(info.name);
      citationIds.push(info.id);
    }
  }

  return {
    answer,
    evidenceStageNos: validStageNos,
    citationTitles,
    citationIds,
    hasEvidence: true,
    dropped,
  };
}

// ---------- 폴백 응답 ----------

function buildFallbackAnswer(stages) {
  const lines = [FALLBACK_INTRO];
  for (const stage of stages) {
    const label = VERDICT_LABELS[stage.verdict] || stage.verdict || '확인 불가';
    const findingNames = (stage.findings || [])
      .map(f => f.name)
      .filter(Boolean);
    const materials = findingNames.length > 0 ? findingNames.join(', ') : '없음';
    lines.push(`단계 ${stage.no}. ${stage.title} — ${label}`);
    lines.push(`  자료: ${materials}`);
  }
  return lines.join('\n');
}

function fallbackResponse(answer, reason) {
  return new Response(JSON.stringify({
    answer,
    evidenceStageNos: [],
    citationTitles: [],
    citationIds: [],
    followUpQuestions: DEFAULT_FOLLOW_UPS,
    hasEvidence: false,
    dropped: 0,
    fallback: true,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      [SOURCE_HEADER]: `fallback:${reason}`,
    },
  });
}

// ---------- POST ----------

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  const force = (request.headers.get(FORCE_HEADER) || '').toLowerCase();

  let body;
  try {
    body = await request.json();
  } catch {
    return sendError(400, '요청 본문이 JSON이 아닙니다');
  }

  const { summary = '', bigPicture = null, stages = [], history = [] } = body;

  // x-chat-force: empty → 키 유무와 무관하게 근거·인용 없는 답 강제
  if (force === 'empty') {
    return fallbackResponse(
      `${NO_EVIDENCE_ANSWER} ${NO_EVIDENCE_HELPFUL}`,
      'empty'
    );
  }

  // x-chat-force: nokey → Solar 호출 없이 폴백
  if (force === 'nokey') {
    return fallbackResponse(buildFallbackAnswer(stages), 'nokey');
  }

  const prompt = buildPrompt({ summary, bigPicture, stages, history });

  try {
    const content = await callSolar(
      prompt.prompts,
      {
        maxTokens: CHAT_MAX_TOKENS,
        forceParse: force === 'parse',
        force429: force === '429',
      }
    );

    const parsed = parseChatResponse(content);

    if (!parsed) {
      logCall('chat.POST', 0, 200, { 'x-chat-source': 'fallback:parse' });
      return fallbackResponse(buildFallbackAnswer(stages), 'parse');
    }

    let answer = typeof parsed.answer === 'string' ? parsed.answer : '';
    let evidenceStageNos = Array.isArray(parsed.evidenceStageNos) ? parsed.evidenceStageNos : [];
    let citationNumbers = Array.isArray(parsed.citationNumbers) ? parsed.citationNumbers : [];
    let citationNames = Array.isArray(parsed.citationNames)
      ? parsed.citationNames.filter(c => c && typeof c === 'object')
      : [];
    let furtherResearch = typeof parsed.furtherResearch === 'string' ? parsed.furtherResearch : '';
    let followUpQuestions = Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [];

    // x-chat-force: empty → 근거·인용 강제 빈 값
    if (force === 'empty') {
      evidenceStageNos = [];
      citationNumbers = [];
      citationNames = [];
    }

    const result = validateAndRenumber(answer, evidenceStageNos, citationNumbers, citationNames, stages, furtherResearch);

    const finalFollowUps = followUpQuestions.length > 0
      ? followUpQuestions.slice(0, 3)
      : [...DEFAULT_FOLLOW_UPS];

    logCall('chat.POST', 0, 200, { 'x-chat-source': 'solar' });
    return new Response(JSON.stringify({
      answer: result.answer,
      evidenceStageNos: result.evidenceStageNos,
      citationTitles: result.citationTitles,
      citationIds: result.citationIds,
      followUpQuestions: finalFollowUps,
      hasEvidence: result.hasEvidence,
      dropped: result.dropped,
      fallback: false,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        [SOURCE_HEADER]: 'solar',
      },
    });
  } catch (err) {
    if (err.code === 'NO_KEY') {
      logCall('chat.POST', 0, 200, { 'x-chat-source': 'fallback:nokey' });
      return fallbackResponse(buildFallbackAnswer(stages), 'nokey');
    }
    if (force === '429' || err.message.includes('429')) {
      logCall('chat.POST', 0, 200, { 'x-chat-source': 'fallback:429' });
      return fallbackResponse(buildFallbackAnswer(stages), '429');
    }
    logCall('chat.POST', 0, 200, { 'x-chat-source': 'fallback:error' });
    return fallbackResponse(buildFallbackAnswer(stages), 'error');
  }
}
