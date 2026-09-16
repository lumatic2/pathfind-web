// POST /api/chat — 조사 문서를 근거로 답하는 서버 함수
// 계약: docs/api-contract.md / roadmap/M07-대화인용/M07-스텝1.md
// 새로 만드는 건 이 파일뿐. 공용 Solar 호출은 _lib/solar.js 사용.
// 최대 실행 시간: Vercel 함수 maxDuration 90초 (vercel.json 확인 완료).

import { callSolar, SOLAR_MODEL } from './_lib/solar.js';
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

const DEFAULT_FOLLOWUPS = [
  '이 패스에서 먼저 할 일은?',
  '직접 만들 것만 순서대로 정리해 줘',
  'PATH.md 내려받기',
];
export { DEFAULT_FOLLOWUPS };

const NOT_IN_RESEARCH = '이번 조사에는 없습니다.';
const NOT_IN_RESEARCH_HINT = '이 패스의 단계나 찾은 자료에 대해 물어보시면 그 문서를 근거로 답합니다.';

const SYSTEM_PROMPT = `당신은 방금 끝난 조사 결과(패스)를 두고 사용자와 이야기하는 안내자입니다.
아래에 주어지는 조사 문서(요약·단계·판정·자료·할 일)만으로 답합니다.
답의 근거가 된 단계 번호를 basis 에 적습니다. 근거로 쓴 자료는 citations 에 **번호와 이름을 함께** 적습니다 — 이름은 [조사 문서] 의 자료 목록에 적힌 이름을 그대로 옮깁니다. 문서에 근거가 없는 질문이면 basis 와 citations 를 빈 배열로 두고 next 에 무엇을 더 조사하면 되는지 한 줄을 적습니다.

answer 는 한국어 마크다운으로 씁니다 — 문단·\`- \` 목록·**굵게**·\`### \` 소제목까지만(표·이미지·링크는 화면이 그리지 않습니다).
자료를 근거로 쓴 문장 끝에는 그 자료 번호를 [n] 으로 붙입니다(예: "… 공식 API 가 있습니다 [3]").
followups 는 사용자가 이어서 물을 만한 질문 2~3개, 각 20자 안팎입니다.

출력 형식 (JSON만, 다른 텍스트 없이):
{
  "answer": "마크다운 답",
  "basis": [단계 번호],
  "citations": [{"n": 자료 번호, "name": "자료 목록에 적힌 그 자료의 이름"}],
  "followups": ["후속 질문", "..."],
  "next": "근거가 없을 때만 — 무엇을 더 조사하면 되는지 한 줄"
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

// ---------- 목표 화면 ground: 근거 대조·재매김·근거 없음 판정 ----------

const nums = (v) => (Array.isArray(v) ? v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0) : []);

const normName = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function citationNameMatches(name, docName) {
  const a = normName(name);
  const b = normName(docName);
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const head = Math.min(a.length, b.length, 8);
  return head >= 4 && a.slice(0, head) === b.slice(0, head);
}

function stripCitationMarks(text, drop) {
  if (!drop.size) return String(text);
  const SENTINEL = '\u0000';
  return String(text)
    .replace(/\[(\d+)\]/g, (whole, n) => (drop.has(Number(n)) ? SENTINEL : whole))
    .replace(/ ?\u0000 ?/g, (m) => (m.startsWith(' ') && m.endsWith(' ') ? ' ' : ''))
    .trim();
}

function splitCitations(raw, byN) {
  const keep = [];
  const drop = [];
  const seen = new Set();
  for (const c of Array.isArray(raw) ? raw : []) {
    const obj = c && typeof c === 'object';
    const n = Number(obj ? (c.n ?? c.no ?? c.number) : c);
    if (!Number.isInteger(n) || n <= 0 || !byN.has(n) || seen.has(n)) continue;
    seen.add(n);
    (citationNameMatches(obj ? (c.name ?? c.title) : '', byN.get(n).name) ? keep : drop).push(n);
  }
  return { keep, drop };
}

function polishFollowups(list, defaults = DEFAULT_FOLLOWUPS) {
  const seen = new Set();
  const out = [];
  for (const f of Array.isArray(list) ? list : []) {
    const t = String(f ?? '').trim();
    if (!t || seen.has(t) || t.length > 30) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 3) break;
  }
  for (const d of defaults) {
    if (out.length >= 3) break;
    if (!seen.has(d)) { seen.add(d); out.push(d); }
  }
  return out;
}

// 목표 화면의 ground를 계약 응답 필드(basis, citationTitles, citationIds, followups, grounded, degraded, dropped)로 옮겨 반환한다.
// 근거 없음 판정·표기 재번호화·버린 인용 마커 제거는 목표 화면 ground 그대로.
// 계약의 `dropped`는 버린 인용 수, 폴백의 `degraded`는 true로 둔다(사용자가 읽는 derived.verdictLabel 판정값과 같은 계약 값).
function ground(parsed, docs, stages) {
  const stageNos = new Set(stages.map((s) => s.no));
  const basis = [...new Set(nums(parsed.basis).filter((n) => stageNos.has(n)))];
  const byN = new Map(docs.map((d) => [d.n, d]));
  const { keep: cited, drop: dropped } = splitCitations(parsed.citations, byN);
  let answer = String(parsed.answer ?? '').trim();
  const followups = polishFollowups(parsed.followups);

  // 「조사에 없다」 판정은 **거르기 전** 숫자로 한다 — 이름 대조가 실패해도 멀쩡한 답이 고정 문장으로 바뀌지 않게.
  if (!basis.length && !cited.length && !dropped.length) {
    const next = String(parsed.next ?? '').replace(/\s+/g, ' ').trim();
    return {
      answer: `${NOT_IN_RESEARCH} ${next || NOT_IN_RESEARCH_HINT}`,
      basis: [],
      citationTitles: [],
      citationIds: [],
      followups,
      grounded: false,
      degraded: false,
      dropped: 0,
    };
  }

  // 버린 인용은 본문 마커도 같이 뗀다 — 남겨 두면 다시 매기면서 엉뚱한 자료의 배지가 된다.
  answer = stripCitationMarks(answer, new Set(dropped));

  // 등장 순서 → 1..k. 본문의 [n] 중 자료 목록에 없는 번호는 글자 그대로 남긴다(패널도 그대로 둔다).
  const order = [];
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (byN.has(n) && !order.includes(n)) order.push(n);
  }
  for (const n of cited) if (!order.includes(n)) order.push(n);
  const local = new Map(order.map((n, i) => [n, i + 1]));
  answer = answer.replace(/\[(\d+)\]/g, (whole, s) => (local.has(Number(s)) ? `[${local.get(Number(s))}]` : whole));
  const tail = order.filter((n) => !new RegExp(`\\[${local.get(n)}\\]`).test(answer)).map((n) => `[${local.get(n)}]`);
  if (tail.length) answer = `${answer} ${tail.join('')}`;
  return {
    answer,
    basis,
    citationTitles: order.map((n) => byN.get(n).name),
    citationIds: order.map((n) => byN.get(n).id),
    followups,
    grounded: true,
    degraded: false,
    dropped: dropped.length,
  };
}

// ---------- 목표 화면 composeFallback: 폴백 응답 + 기본 칩 3 ----------

function composeFallback(stages, docs) {
  if (!stages.length) {
    return {
      answer: `${NOT_IN_RESEARCH} ${NOT_IN_RESEARCH_HINT}`,
      basis: [],
      citationTitles: [],
      citationIds: [],
      followups: [...DEFAULT_FOLLOWUPS],
      grounded: false,
      degraded: true,
      dropped: 0,
    };
  }
  const lines = ['지금 답을 만들 수 없어 조사 문서를 그대로 정리합니다.', ''];
  const used = [];
  for (const s of stages) {
    const mine = docs.filter((d) => d.stageNo === s.no).slice(0, 2);
    const marks = mine.map((d) => { used.push(d); return `[${used.length}]`; }).join('');
    lines.push(`- **${s.no}. ${s.title}** — 판정 ${s.verdict ? VERDICT_LABELS[s.verdict] ?? s.verdict : '미정'}${mine.length ? ` · ${mine.map((d) => d.name).join(', ')} ${marks}` : ''}`);
  }
  return {
    answer: lines.join('\n'),
    basis: stages.map((s) => s.no),
    citationTitles: used.map((d) => d.name),
    citationIds: used.map((d) => d.id),
    followups: [...DEFAULT_FOLLOWUPS],
    grounded: true,
    degraded: true,
    dropped: 0,
  };
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

  const docs = buildDocs(stages);

  // x-chat-force: empty → 키 유무와 무관하게 근거·인용 없는 답 강제
  if (force === 'empty') {
    return fallbackResponse(stages, docs, 'empty');
  }

  // x-chat-force: nokey → Solar 호출 없이 폴백
  if (force === 'nokey') {
    return fallbackResponse(stages, docs, 'nokey');
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
      return fallbackResponse(stages, docs, 'parse');
    }

    const answer = typeof parsed.answer === 'string' ? parsed.answer : '';

    const result = ground(parsed, docs, stages);

    logCall('chat.POST', 0, 200, { 'x-chat-source': 'solar' });
    return new Response(JSON.stringify({
      answer: result.answer,
      basis: result.basis,
      citationTitles: result.citationTitles,
      citationIds: result.citationIds,
      followups: result.followups,
      grounded: result.grounded,
      degraded: result.degraded,
      dropped: result.dropped,
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
      return fallbackResponse(stages, docs, 'nokey');
    }
    if (force === '429' || err.message.includes('429')) {
      logCall('chat.POST', 0, 200, { 'x-chat-source': 'fallback:429' });
      return fallbackResponse(stages, docs, '429');
    }
    logCall('chat.POST', 0, 200, { 'x-chat-source': 'fallback:error' });
    return fallbackResponse(stages, docs, 'error');
  }
}

// ---------- 폴백 응답 조립 (클라이언트가 읽는 contract 필드로만 내보낸다) ----------

function fallbackResponse(stages, docs, reason) {
  const fb = composeFallback(stages, docs);
  return new Response(JSON.stringify({
    answer: fb.answer,
    basis: fb.basis,
    citationTitles: fb.citationTitles,
    citationIds: fb.citationIds,
    followups: fb.followups,
    grounded: fb.grounded,
    degraded: fb.degraded,
    dropped: fb.dropped,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      [SOURCE_HEADER]: `fallback:${reason}`,
    },
  });
}
