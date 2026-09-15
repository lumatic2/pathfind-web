// /api/explain — 마인드맵 노드 하나를 설명하는 문단·목록·후속 질문
// 새로 추가. 계약: docs/api-contract.md (solar-pro4, 키 process.env, max_tokens 명시)
// 노드 id 규칙: docs/app-state.md §2 (s<no>, s<no>-t<i>, s<no>-finding-<i>, s<no>-task-<i>, s<no>-todo-<i>)
// 판정 표시: 단계 노드 설명에서만 화면 문구 4개 중 하나만. 계약 값 원문은 이 파일 밖으로 안 냄.
import { logCall } from './_lib/http.js';

const SOLAR_MODEL = 'solar-pro4';
const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
const EXPLAIN_MAX_TOKENS = 2048;
const CALL_TIMEOUT_MS = 90_000;

const FORCE_HEADER = 'x-explain-force';
const SOURCE_HEADER = 'x-explain-source';

// 화면 문구 치환 — 단계 노드 설명에서만 쓰는 4구. 계약 값 원문과 1:1.
const VERDICT_DISPLAY = {
  '가져다 써도 됨': '이미 있음',
  '직접 해야 함': '없음',
  '섞어야 함': '일부만 있음',
  '선례를 못 찾음': '못 찾음',
};

// 판정 원문 상수는 프롬프트용(모델에게 단계 노드에 한해 화면 문구를 쓰라고 안내)만 쓴다.
// 응답 JSON에는 verdict 필드를 두지 않고, 계약 값 원문은 이 파일 밖으로 절대 안 낸다.
const VERDICT_CAN = '가져다 써도 됨';
const VERDICT_MUST = '직접 해야 함';
const VERDICT_MIX = '섞어야 함';
const VERDICT_NONE = '선례를 못 찾음';

const FOLLOWUP_FIXED = {
  finding: [
    '이 자료를 어떻게 가져다 쓰나요',
    '비슷한 다른 자료도 있나요',
  ],
  task: [
    '이 일은 무엇부터 시작하나요',
    '이 일에 쓸 수 있는 자료가 있나요',
  ],
  todo: [
    '직접 하는 부분은 어디까지인가요',
    '먼저 가져다 쓸 수 있는 건 뭔가요',
  ],
  topic: [
    '이 묶음에서 먼저 볼 것은',
    '이 묶음의 자료를 정리해 줘',
  ],
  stage: [
    '이 단계에서 먼저 할 일은',
    '이 단계의 자료를 정리해 줘',
  ],
};
const FOLLOWUP_ROADMAP = 'ROADMAP.md는 내려받아 두셨나요';

const MAX_FOLLOWUPS = 3;

// ---------- 노드 종류 판별 ----------

function nodeType(node) {
  if (!node || typeof node.id !== 'string') return null;
  const id = node.id;
  if (/^s\d+$/.test(id)) return 'stage';
  if (/^s\d+-t\d/.test(id)) return 'topic';
  if (/^s\d+-finding-\d+$/.test(id)) return 'finding';
  if (/^s\d+-task-\d+$/.test(id)) return 'task';
  if (/^s\d+-todo-\d+$/.test(id)) return 'todo';
  return null;
}

// ---------- 노드 → 왼쪽 패널 문서 id (app-state.md §2와 같음) ----------

function docIdFromNodeId(nodeId, stageNo) {
  const n = stageNo != null ? stageNo : 0;
  if (/^s\d+$/.test(nodeId)) {
    return `stage-${nodeId.slice(1)}`;
  }
  if (/^s\d+-t\d/.test(nodeId)) {
    // s1-t0 → stage-1-t0
    return `stage-${nodeId.slice(1)}`;
  }
  const finding = nodeId.match(/^s(\d+)-finding-(\d+)$/);
  if (finding) return `stage-${finding[1]}-finding-${finding[2]}`;
  const task = nodeId.match(/^s(\d+)-task-(\d+)$/);
  if (task) return `stage-${task[1]}-task-${task[2]}`;
  const todo = nodeId.match(/^s(\d+)-todo-(\d+)$/);
  if (todo) return `stage-${todo[1]}-todo-${todo[2]}`;
  return nodeId;
}

// ---------- 판정 화면 문구 ----------

function displayVerdict(raw) {
  if (typeof raw !== 'string') return '';
  for (const [원문, 화면] of Object.entries(VERDICT_DISPLAY)) {
    if (raw.startsWith(원문)) return 화면;
  }
  return '';
}

// ---------- 단계 기재 문장 ----------

function stageLines(stage, includeVerdict) {
  const out = [];
  if (!stage || typeof stage !== 'object') return out;
  const title = typeof stage.title === 'string' ? stage.title : '';
  const desc = typeof stage.desc === 'string' ? stage.desc : '';
  const tasks = Array.isArray(stage.tasks) ? stage.tasks : [];
  const findings = Array.isArray(stage.findings) ? stage.findings : [];
  const todos = Array.isArray(stage.todos) ? stage.todos : [];
  const verdict = typeof stage.verdict === 'string' ? stage.verdict : '';

  if (title) out.push(`## ${title}`);
  if (desc) out.push(desc);

  if (tasks.length) {
    out.push('');
    out.push('할 일:');
    for (const t of tasks) {
      const order = typeof t.order === 'number' ? t.order : 0;
      const task = typeof t.task === 'string' ? t.task : '';
      if (task) out.push(`- ${order}. ${task}`);
    }
  }

  if (todos.length) {
    out.push('');
    out.push('역할 나눔:');
    for (const t of todos) {
      const task = typeof t.task === 'string' ? t.task : '';
      const owner = typeof t.owner === 'string' ? t.owner : '';
      if (task) out.push(`- [${owner}] ${task}`);
    }
  }

  if (findings.length) {
    out.push('');
    out.push('자료 목록:');
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const name = typeof f?.name === 'string' ? f.name : `자료 ${i + 1}`;
      const url = typeof f?.url === 'string' ? f.url : '';
      out.push(`- ${i + 1}. ${name}${url ? ` (${url})` : ''}`);
    }
  }

  if (includeVerdict && displayVerdict(verdict)) {
    out.push('');
    out.push(`이 단계는 ${displayVerdict(verdict)}에 가깝습니다.`);
  }

  return out;
}

// ---------- 자료 잎 폴백 설명 (첫 문장 끝에 [1] + 문서 id) ----------

function findingFallbackText(stage, idx) {
  const findings = Array.isArray(stage?.findings) ? stage.findings : [];
  const f = findings[idx];
  if (!f) return null;
  const name = typeof f?.name === 'string' ? f.name : '자료';
  const url = typeof f?.url === 'string' ? f.url : '';
  const evidence = typeof f?.evidence === 'string' ? f.evidence : '';
  const note = typeof f?.note === 'string' ? f.note : '';
  const kind = typeof f?.kind === 'string' ? f.kind : '';
  const id = docIdFromNodeId(`s${stage?.no || 0}-finding-${idx}`, stage?.no);
  const parts = [];
  parts.push(`이 자료는 ${name}입니다.${evidence ? ' ' + evidence : ''}`);
  // 첫 문장 끝에 마커 [1]
  parts.push(`[1]`);
  if (url) parts.push(`- 출처: ${url}`);
  if (kind) parts.push(`- 종류: ${kind}`);
  if (note) parts.push(`- 메모: ${note}`);
  return { text: parts.join('\n'), id };
}

// ---------- 소주제/단계 폴백: 먼저 볼 자료 2건에 [1][2] ----------

function topicOrStageFallback(stage, includeVerdict) {
  const findings = Array.isArray(stage?.findings) ? stage.findings : [];
  const firstTwo = findings.slice(0, 2);
  const lines = stageLines(stage, includeVerdict);
  if (firstTwo.length) {
    const ids = firstTwo.map((f, i) => docIdFromNodeId(`s${stage?.no || 0}-finding-${i}`, stage?.no));
    const names = firstTwo.map((f) => (typeof f?.name === 'string' ? f.name : `자료 ${i + 1}`));
    // 첫 줄 끝에 마커
    const marker = firstTwo.map((_, i) => `[${i + 1}]`).join(' ');
    if (lines.length) {
      const first = lines[0];
      const rest = lines.slice(1);
      lines[0] = first + ' ' + marker;
      // citationTitles, citationIds는 첫 두 자료
      return {
        text: lines.join('\n'),
        citationTitles: names,
        citationIds: ids,
      };
    }
  }
  return {
    text: lines.join('\n'),
    citationTitles: [],
    citationIds: [],
  };
}

// ---------- 호출 ----------

async function callSolar(messages) {
  const key = process.env.SOLAR_API_KEY;
  if (!key) throw new Error('NO_KEY');
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
        max_tokens: EXPLAIN_MAX_TOKENS,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Solar API 오류 (${res.status})`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Solar 응답이 비어 있습니다');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function parseExplainJson(content) {
  const trimmed = (content || '').trim();
  if (!trimmed) throw new Error('빈 응답');
  let text = trimmed;
  const fence = text.match(/^[\\s\\S]*?```(?:json)?\\s*([\\s\\S]*?)```[\\s\\S]*$/);
  if (fence) {
    text = fence[1].trim();
  } else {
    const parts = text.split('```');
    if (parts.length >= 3) text = parts[parts.length - 1].trim();
  }
  const candidates = [
    text,
    ...[...text.matchAll(/{[\\s\\S]*}/g)].map((m) => m[0]),
  ];
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // 다음 후보
    }
  }
  throw new Error('Solar 응답이 유효한 JSON이 아닙니다: ' + trimmed.slice(0, 200));
}

// ---------- 인용 재번호화 ----------

// 본문 대괄호 번호 등장 순서대로 1부터 다시 매기고,
// 같은 순서의 citationTitles·citationIds(codings)를 재배열한다.
// 본문에 없는 번호는 꼬리에 붙이고, 자료 목록에 없는 번호는 그대로 둔다.
function renumber(body, titles, ids) {
  if (!Array.isArray(titles) || !Array.isArray(ids) || titles.length !== ids.length) {
    return { body, citationTitles: [], citationIds: [] };
  }

  // 등장 순서 추출: [숫자] (중복 없이 처음 나온 순서)
  const order = [];
  const seen = new Set();
  const re = /\[(\d+)\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (!seen.has(n)) {
      order.push(n);
      seen.add(n);
    }
  }

  // 대괄호 번호를 등장 순서로 치환
  const newBody = body.replace(/\[(\d+)\]/g, (_match, oldNum) => {
    const idx = order.indexOf(parseInt(oldNum, 10));
    if (idx === -1) return `[${oldNum}]`;
    return `[${idx + 1}]`;
  });

  // 모델이 준 titles/ids를 등장 순서대로 재배열 (모델이 1..N 순서로 줬다고 가정)
  const rearrangedTitles = [];
  const rearrangedIds = [];
  for (const n of order) {
    const idx = n - 1;
    if (idx >= 0 && idx < titles.length) {
      rearrangedTitles.push(titles[idx]);
      rearrangedIds.push(ids[idx]);
    }
  }

  // 본문 마커에 없는 나머지 번호는 꼬리에 붙인다
  const usedSet = new Set(order);
  for (let i = 0; i < titles.length; i++) {
    if (!usedSet.has(i + 1)) {
      rearrangedTitles.push(titles[i]);
      rearrangedIds.push(ids[i]);
    }
  }

  // 자료 목록에 없는 번호가 본문에 있으면 그대로 남는다(위 치환에서 order 밖은 유지됨).

  return { body: newBody, citationTitles: rearrangedTitles, citationIds: rearrangedIds };
}

// ---------- 후속 질문 ----------

function followups(node, modelOut) {
  const type = nodeType(node);
  const fixed = FOLLOWUP_FIXED[type] || FOLLOWUP_FIXED.finding;

  const custom = Array.isArray(modelOut?.followups) ? modelOut.followups : null;
  if (custom && custom.length >= 2) {
    const picked = custom.slice(0, 2).map((s) => String(s).slice(0, 40));
    picked.push(FOLLOWUP_ROADMAP);
    return picked.slice(0, MAX_FOLLOWUPS);
  }
  return [...fixed, FOLLOWUP_ROADMAP].slice(0, MAX_FOLLOWUPS);
}

// ---------- 설명 조립 (모델 응답) ----------

function buildFromModel(node, stage, modelOut) {
  const explanation = typeof modelOut?.explanation === 'string' ? modelOut.explanation : '';
  // 새 모양: [{n, name}, ...] / 옛 모양: ["이름", ...] 양쪽을 받는다.
  const rawCitations = Array.isArray(modelOut?.citationTitles) ? modelOut.citationTitles : [];
  const rawIds = Array.isArray(modelOut?.citations) ? modelOut.citations : [];

  // 새 모양이면 먼저 이름 대조로 어긋난 것을 버리고 제목 배열을 만든다.
  const { citationTitles: namedTitles, dropped } = filterCitationsByName(rawCitations, rawIds, stage);

  // 이름을 거친 뒤의 제목 배열로 본문 재번호화를 한다(옛 모양이면 namedTitles===rawCitations).
  const { body, citationTitles, citationIds } = renumber(explanation, namedTitles, rawIds);

  // citationIds를 실제 문서 id로 채운다(매칭은 stage.findings 기준).
  const filledIds = fillIds(citationTitles, stage);

  return {
    explanation: body,
    citationTitles,
    citationIds: filledIds,
    followups: followups(node, modelOut),
    fallback: false,
    dropped,
  };
}

// ---------- 자료 라벨 목록 (1-based) ----------

function findingLabelsForNode(node, stage) {
  if (!stage || !Array.isArray(stage.findings)) return [];
  if (nodeType(node) !== 'finding') return [];
  const m = node.id.match(/^s\d+-finding-(\d+)$/);
  if (!m) return [];
  const idx = parseInt(m[1], 10);
  if (!Number.isFinite(idx)) return [];
  return stage.findings.map((f, i) => {
    return typeof f?.name === 'string' ? f.name : `자료 ${i + 1}`;
  });
}

// ---------- citationTitles → 실제 문서 id ----------

function fillIds(titles, stage) {
  if (!Array.isArray(stage?.findings) || !Array.isArray(titles)) return titles.map(() => '');
  return titles.map((title) => {
    const idx = stage.findings.findIndex((f) => {
      const name = typeof f?.name === 'string' ? f.name : '';
      return name === title;
    });
    if (idx === -1) return '';
    return docIdFromNodeId(`s${stage?.no || 0}-finding-${idx}`, stage?.no);
  });
}

// ---------- 이름 대조로 어긋난 인용 버리기 ----------

// citationTitles가 객체 배열({n, name})이면, 요청에 담긴 자료 목록 이름과
// trim() 결과로 대조해 일치하는 것만 남긴다. 일치하지 않는 것은 버리고 개수를 센다.
// citationTitles가 문자열 배열(옛 모양)이면 그대로 두고 dropped=0을 반환한다.
function filterCitationsByName(citations, ids, stage) {
  if (!Array.isArray(citations) || !Array.isArray(ids) || citations.length === 0) {
    return { citationTitles: citations, citationIds: ids, dropped: 0 };
  }

  // 첫 요소가 객체면 새 모양으로 간주
  const first = citations[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) {
    return { citationTitles: citations, citationIds: ids, dropped: 0 };
  }

  if (!Array.isArray(stage?.findings)) {
    return { citationTitles: [], citationIds: [], dropped: citations.length };
  }

  const findingNames = stage.findings.map((f) => {
    const name = typeof f?.name === 'string' ? f.name : '';
    return name.trim();
  });
  const findingSet = new Set(findingNames);

  const keptTitles = [];
  const keptIds = [];
  let dropped = 0;

  for (let i = 0; i < citations.length; i++) {
    const c = citations[i];
    const nameRaw = typeof c?.name === 'string' ? c.name : '';
    const name = nameRaw.trim();
    if (!name || !findingSet.has(name)) {
      dropped++;
      continue;
    }
    keptTitles.push(name);
    keptIds.push(Array.isArray(ids) && ids[i] != null ? ids[i] : '');
  }

  return { citationTitles: keptTitles, citationIds: keptIds, dropped };
}

// ---------- 폴백 설명 ----------

function buildFallback(node, stage) {
  const type = nodeType(node);
  const includeVerdict = type === 'stage';

  if (type === 'finding') {
    const m = node.id.match(/^s\d+-finding-(\d+)$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (Number.isFinite(idx)) {
        const res = findingFallbackText(stage, idx);
        if (res) {
          return {
            explanation: res.text,
            citationTitles: [(typeof stage.findings[idx]?.name === 'string' ? stage.findings[idx].name : '자료')],
            citationIds: [res.id],
            followups: [...(FOLLOWUP_FIXED.finding || []), FOLLOWUP_ROADMAP].slice(0, MAX_FOLLOWUPS),
            fallback: true,
          };
        }
      }
    }
    return {
      explanation: '이 자료에 대한 설명을 준비하지 못했습니다.',
      citationTitles: [],
      citationIds: [],
      followups: [...(FOLLOWUP_FIXED.finding || []), FOLLOWUP_ROADMAP].slice(0, MAX_FOLLOWUPS),
      fallback: true,
    };
  }

  if (type === 'stage' || type === 'topic') {
    const res = topicOrStageFallback(stage, includeVerdict);
    const fixed = type === 'stage' ? FOLLOWUP_FIXED.stage : FOLLOWUP_FIXED.topic;
    return {
      explanation: res.text,
      citationTitles: res.citationTitles,
      citationIds: res.citationIds,
      followups: [...(fixed || []), FOLLOWUP_ROADMAP].slice(0, MAX_FOLLOWUPS),
      fallback: true,
    };
  }

  return {
    explanation: stageLines(stage, false).join('\n') || '이 노드에 대한 설명을 준비하지 못했습니다.',
    citationTitles: [],
    citationIds: [],
    followups: [...(FOLLOWUP_FIXED[type] || FOLLOWUP_FIXED.task), FOLLOWUP_ROADMAP].slice(0, MAX_FOLLOWUPS),
    fallback: true,
  };
}

// ---------- 프롬프트 ----------

function buildUserPrompt(node, stage, summary, findingLabels) {
  const parts = [];
  parts.push('## 노드');
  parts.push(`- id: ${node.id}`);
  parts.push(`- 라벨: ${typeof node.label === 'string' ? node.label : ''}`);
  parts.push(`- 깊이: ${node.depth != null ? node.depth : ''}`);
  parts.push(`- 종류: ${nodeType(node)}`);

  if (stage && typeof stage === 'object') {
    parts.push('## 단계');
    parts.push(`- 번호: ${stage.no}`);
    parts.push(`- 제목: ${typeof stage.title === 'string' ? stage.title : ''}`);
    parts.push(`- 설명: ${typeof stage.desc === 'string' ? stage.desc : ''}`);
    parts.push(`- 판정: ${typeof stage.verdict === 'string' ? stage.verdict : ''}`);
    parts.push('- 할 일:');
    if (Array.isArray(stage.tasks)) {
      for (const t of stage.tasks) {
        const order = typeof t.order === 'number' ? t.order : 0;
        const task = typeof t.task === 'string' ? t.task : '';
        if (task) parts.push(`  - ${order}. ${task}`);
      }
    }
    parts.push('- 역할 나눔(할 일 owner 표기):');
    if (Array.isArray(stage.todos)) {
      for (const t of stage.todos) {
        const task = typeof t.task === 'string' ? t.task : '';
        const owner = typeof t.owner === 'string' ? t.owner : '';
        if (task) parts.push(`  - [${owner}] ${task}`);
      }
    }
    parts.push('- 자료 목록 (번호는 이 순서대로 모델에 보임, 1부터):');
    if (Array.isArray(stage.findings)) {
      for (let i = 0; i < stage.findings.length; i++) {
        const f = stage.findings[i];
        const name = typeof f?.name === 'string' ? f.name : `자료 ${i + 1}`;
        const url = typeof f?.url === 'string' ? f.url : '';
        parts.push(`  - ${i + 1}. ${name}${url ? ` (${url})` : ''}`);
      }
    } else {
      parts.push('  (없음)');
    }
  }

  if (summary) {
    parts.push('## 프로젝트 요약');
    parts.push(summary);
  }

  // 재질 문서 id 규칙 안내
  parts.push('');
  parts.push('## 문서 id 규칙');
  parts.push('왼쪽 패널 문서 id와 같은 꼴로 적는다:');
  parts.push('- 단계: stage-<no>');
  parts.push('- 소주제: stage-<no>-t<i>');
  parts.push('- 자료: stage-<no>-finding-<i>');
  parts.push('- 할 일: stage-<no>-task-<i>');
  parts.push('- 역할 나눔: stage-<no>-todo-<i>');

  return parts.join('\n');
}

// ---------- POST ----------

export async function POST(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const force = (request.headers.get(FORCE_HEADER) || '').trim().toLowerCase();
  const isNokeyTest = force === 'nokey';

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: '요청 본문이 JSON이 아닙니다' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: '요청 본문이 없습니다' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const node = body.node;
  const stage = body.stage || null;
  const summary = typeof body.summary === 'string' ? body.summary : '';

  if (!node || typeof node.id !== 'string') {
    return new Response(JSON.stringify({ error: 'node.id 필요' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const type = nodeType(node);
  if (!type) {
    return new Response(JSON.stringify({ error: '알 수 없는 노드 종류' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (isNokeyTest) {
    const fb = buildFallback(node, stage);
    return new Response(JSON.stringify(fb), {
      status: 200,
      headers: { 'Content-Type': 'application/json', [SOURCE_HEADER]: 'fallback' },
    });
  }

  const hasKey = !!(process.env.SOLAR_API_KEY);
  if (!hasKey) {
    const fb = buildFallback(node, stage);
    return new Response(JSON.stringify(fb), {
      status: 200,
      headers: { 'Content-Type': 'application/json', [SOURCE_HEADER]: 'fallback' },
    });
  }

  const findingLabels = nodeType(node) === 'finding' ? findingLabelsForNode(node, stage) : [];

  const systemPrompt = `당신은 마인드맵의 노드 하나를 설명하는 어시스턴트입니다.
아래 노드 정보와 단계 정보를 받아, 마크다운 문단과 목록으로만 설명을 작성합니다.
소제목(수준 2 이상)은 넣지 않습니다. 설명 텍스트와 목록만 씁니다.
이어서 이 노드에서만 물을 만한 후속 질문 2~3개를 짧게요(약 20자 안팎) 씁니다.
단계 노드일 때만 마지막에 "이 단계는 이미 있음/없음/일부만 있음/못 찾음 중 하나"에 가깝다는 문장을 한 줄 넣을 수 있습니다.

출력은 아래 JSON 객체 하나만 반환합니다. 코드펜스 마커나 앞뒤 설명 문장은 넣지 않습니다.
{
  "explanation": "마크다운 문단+목록 (자료의 인용은 자료 목록 번호를 대괄호로, 예: [1], [2])",
  "citationTitles": [{"n": 1, "name": "자료1 이름"}, {"n": 2, "name": "자료2 이름"}, ...] — 인용한 각 자료의 자료 목록 번호(n)와 이름(name)을 함께 적은 객체 배열, 본문에서 실제 인용한 것만 인용 순서,
  "citations": ["문서 id1", "문서 id2", ...] (citationTitles와 같은 순서의 문서 id),
  "followups": ["후속 질문1", "후속 질문2", ...]
}

규칙:
- 자료 목록 번호는 아래 "자료 목록"의 순서(1부터) 그대로입니다. 본문에서는 이 번호를 대괄호로 인용합니다.
- citationTitles는 인용한 자료의 정보를 담은 객체 배열로 냅니다. 각 객체는 { "n": <자료 목록 번호(1부터)>, "name": "<자료 이름>" } 꼴입니다.
- 문서 id는 왼쪽 패널 문서 id와 같은 꼴로 적습니다(아래 문서 id 규칙 참조).
- 자료 목록에 없는 번호나 틀린 번호는 인용하지 마세요.
- 설명은 한국어입니다.
- 단계 노드가 아니면 판정 문구를 넣지 않습니다.`;

  const userPrompt = buildUserPrompt(node, stage, summary, findingLabels);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const content = await callSolar(messages);
    const parsed = parseExplainJson(content);
    const out = buildFromModel(node, stage, parsed);
    logCall('explain.POST', 0, 200, { 'x-explain-source': 'solar' });
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'Content-Type': 'application/json', [SOURCE_HEADER]: 'solar' },
    });
  } catch (err) {
    logCall('explain.POST', 0, 200, { 'x-explain-source': 'fallback' });
    const fb = buildFallback(node, stage);
    return new Response(JSON.stringify(fb), {
      status: 200,
      headers: { 'Content-Type': 'application/json', [SOURCE_HEADER]: 'fallback' },
    });
  }
}
