// POST /api/chat — 조사 문서를 근거로 답하는 서버 함수
// 계약: docs/api-contract.md / roadmap/M07-대화인용/M07-스텝1.md
// 새로 만드는 건 이 파일뿐. 공용 Solar 호출은 _lib/solar.js 사용.
// 최대 실행 시간: Vercel 함수 maxDuration 90초 (vercel.json 확인 완료).

import { callSolar, SOLAR_MODEL, DEFAULT_MAX_TOKENS } from './_lib/solar.js';

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

const SYSTEM_PROMPT = `당신은 조사된 로드맵을 바탕으로 사용자 질문에 답하는 어시스턴트입니다.
아래 정보를 바탕으로 마지막 질문에 답하세요.
반드시 JSON 객체로만 답변하세요. 코드 펜스나 다른 텍스트는 넣지 마세요.
출력은 아래 다섯 키를 가진 JSON 객체 하나입니다.`;

// ---------- 자료 번호 매기기 ----------

function buildMaterialList(stages) {
  const materials = [];
  for (const stage of stages) {
    const findings = stage.findings || [];
    for (let i = 0; i < findings.length; i++) {
      materials.push({
        number: materials.length + 1,
        stageNo: stage.no,
        findingIndex: i,
        name: findings[i].name || '자료',
        evidence: findings[i].evidence || '',
        url: findings[i].url || '',
        kind: findings[i].kind || '',
      });
    }
  }
  return materials;
}

// ---------- 프롬프트 ----------

function buildPrompt({ summary, bigPicture, stages, history }) {
  const materials = buildMaterialList(stages);
  const lines = [];

  lines.push('## 요약');
  lines.push(summary || '없음');
  lines.push('');

  if (bigPicture) {
    lines.push('## 큰 그림');
    lines.push(`제목: ${bigPicture.title || '없음'}`);
    lines.push(`소개: ${bigPicture.intro || '없음'}`);
    lines.push('');
  }

  for (const stage of stages) {
    const label = VERDICT_LABELS[stage.verdict] || stage.verdict || '확인 불가';
    lines.push(`### 단계 ${stage.no}. ${stage.title}`);
    lines.push(`판정: ${label}`);
    if (stage.desc) lines.push(`설명: ${stage.desc}`);
    lines.push('');

    const tasks = stage.tasks || [];
    if (tasks.length > 0) {
      lines.push('할 일:');
      for (const t of tasks) {
        lines.push(`- ${t.order}. ${t.task} (${t.why || ''})`);
      }
      lines.push('');
    }

    if (materials.some(m => m.stageNo === stage.no)) {
      lines.push('자료:');
      for (const m of materials) {
        if (m.stageNo === stage.no) {
          lines.push(`${m.number}. ${m.name} — ${m.evidence || '근거 없음'}`);
        }
      }
      lines.push('');
    }

    const todos = stage.todos || [];
    if (todos.length > 0) {
      lines.push('역할 나눔:');
      for (const t of todos) {
        lines.push(`- [${t.owner}] ${t.task}${t.note ? ` (${t.note})` : ''}`);
      }
      lines.push('');
    }
  }

  // 마지막 사용자 질문을 추출
  const lastUserMessage = history
    .filter(h => h.role === 'user' && h.text)
    .pop();

  if (lastUserMessage) {
    lines.push('## 질문');
    lines.push(lastUserMessage.text);
    lines.push('');
  }

  lines.push('출력 형식 (JSON 객체 하나만):');
  lines.push('{');
  lines.push('  "answer": "답변",');
  lines.push('  "evidenceStageNos": [1, 2],');
  lines.push('  "citationNumbers": [1, 3],');
  lines.push('  "citationNames": [{"n": 1, "name": "자료 이름"}, {"n": 3, "name": "자료 이름"}],');
  lines.push('  "furtherResearch": "더 조사할 내용이 있으면 한 줄로, 없으면 빈 문자열",');
  lines.push('  "followUpQuestions": ["후속 질문 1", "후속 질문 2", "후속 질문 3"]');
  lines.push('}');
  lines.push('');
  lines.push('규칙:');
  lines.push('- answer는 자료에 근거한 내용으로 작성하세요.');
  lines.push('- evidenceStageNos는 근거로 사용한 단계 번호 목록입니다.');
  lines.push('- citationNumbers는 위 자료 번호를 인용한 목록입니다. 역호환을 위해 항상 함께 내세요.');
  lines.push('- citationNames는 인용한 각 자료의 번호(n)와 자료 이름(name)을 담은 객체 배열입니다. name은 요청에 주어진 자료 목록의 이름과 정확히 일치해야 하며, 공백 포함 차이까지 대비해 양쪽을 trim한 값이 같아야 합니다. 이름이 일치하지 않으면 서버가 그 인용을 버립니다.');
  lines.push('- followUpQuestions는 2~3개입니다.');
  lines.push('- 한국어만 사용하세요.');

  return lines.join('\n');
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
  const materials = buildMaterialList(stages);
  for (const m of materials) {
    materialMap.set(m.number, m);
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
      if (seen.has(info.number)) continue;
      seen.add(info.number);
      orderedNumbers.push(info.number);
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
      citationIds.push(`stage-${info.stageNo}-finding-${info.findingIndex}`);
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
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const force = (request.headers.get(FORCE_HEADER) || '').toLowerCase();

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '요청 본문이 JSON이 아닙니다' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      {
        maxTokens: CHAT_MAX_TOKENS,
        forceParse: force === 'parse',
        force429: force === '429',
      }
    );

    const parsed = parseChatResponse(content);

    if (!parsed) {
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
      return fallbackResponse(buildFallbackAnswer(stages), 'nokey');
    }
    if (force === '429' || err.message.includes('429')) {
      return fallbackResponse(buildFallbackAnswer(stages), '429');
    }
    return fallbackResponse(buildFallbackAnswer(stages), 'error');
  }
}
