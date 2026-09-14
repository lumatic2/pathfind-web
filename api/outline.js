// POST /api/outline — 단계 항목을 소주제로 묶는다
// 계약: docs/api-contract.md / roadmap/M05-조사결과패널/M05-스텝5.md

import { callSolar, SOLAR_MODEL, DEFAULT_MAX_TOKENS } from './_lib/solar.js';

const MAX_ITEMS_BEFORE_MODEL = 3; // 미만이면 모델 안 부름
const OUTLINE_MAX_TOKENS = 1024;
const FORCE_HEADER = 'x-outline-force';

function isPost(req) {
  return req.method === 'POST';
}

function parseBody(req) {
  return req.json().catch(() => null);
}

function buildStageItems(stage) {
  // stage 배열 순서를 그대로 순번(0-based)으로 쓴다.
  const items = [];
  if (Array.isArray(stage.findings)) {
    stage.findings.forEach((f, i) => items.push({ kind: 'finding', index: i }));
  }
  if (Array.isArray(stage.tasks)) {
    stage.tasks.forEach((t, i) => items.push({ kind: 'task', index: i }));
  }
  if (Array.isArray(stage.todos)) {
    stage.todos.forEach((t, i) => items.push({ kind: 'todo', index: i }));
  }
  return items;
}

function itemLabel(item) {
  // 모델에 보여 줄 항목 한 줄. 원본 필드 값을 함께 넣으면 clustering 품질이 오른다.
  const src = item.src ?? '';
  const short = typeof src === 'string' ? src.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return `${item.kind} #${item.index}: ${short}`;
}

function buildSystemPrompt() {
  return `당신은 단계 항목을 소주제로 묶는 어시스턴트입니다.

산출물:
- JSON 한 덩어리만 내놓습니다. 코드펜스(마커)나 앞뒤 설명 문장은 넣지 않습니다.
- 루트 객체: { "topics": [ { "title": "string", "items": [ { "kind": "finding"|"task"|"todo", "index": number } ] } ] }
- topics는 2개 이상 4개 이하. 항목이 적으면 한 층만 만든다(토픽 안에 topics를 두지 않는다).
- title: 해당 소주제를 나타내는 한 줄, 18자 안팎.
- items: 요청에서 준 항목 목록 중 이 소주제에 넣을 것. kind는 finding/task/todo, index는 요청에서 받은 배열 순서 그대로.
- 항목은 뜻이 가까운 것끼리 묶는다. 모든 항목을 한 번씩만 넣는다. 누락·중복 금지.
- 깊이 2를 넘지 않는다(topics 안에 topics를 두지 않는다).

언어: 한국어. 쌍따옴표는 반각만 사용합니다.`;
}

function buildUserPrompt(items) {
  const lines = items.map(itemLabel);
  return `아래 단계 항목을 뜻이 가까운 것끼리 2~4개 소주제로 묶어 주세요. 항목을 적은 경우에는 한 층만 만듭니다.

${lines.length}개 항목:
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

출력은 JSON 한 덩어리:
{ "topics": [ { "title": "...", "items": [ { "kind": "...", "index": 0 } ] } ] }`;
}

function parseOutlineReply(content) {
  if (!content) return null;
  const trimmed = content.trim();

  // 코드펜스 벗기기
  let text = trimmed;
  const fence = text.match(/^[\\s\\S]*?```(?:json)?\\s*([\\s\\S]*?)```[\\s\\S]*$/);
  if (fence) {
    text = fence[1].trim();
  } else {
    const parts = text.split('```');
    if (parts.length >= 3) {
      text = parts[parts.length - 1].trim();
    }
  }

  // JSON 덩어리 후보 추출
  const candidates = [text, ...[...text.matchAll(/\\{[\\s\\S]*\\}/g)].map((m) => m[0])];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

function validKind(k) {
  return k === 'finding' || k === 'task' || k === 'todo';
}

function sanitizeTopics(parsed, itemCount) {
  if (!parsed || !Array.isArray(parsed.topics)) return [];

  const used = new Set();
  const out = [];

  for (const topic of parsed.topics) {
    if (!topic || typeof topic !== 'object') continue;
    if (Array.isArray(topic.topics)) {
      // 깊이 2 초과 층 잘라냄 — topics 안의 topics는 버린다
      continue;
    }
    const title = typeof topic.title === 'string' ? topic.title.trim() : '';
    if (!title) continue;

    const rawItems = Array.isArray(topic.items) ? topic.items : [];
    const cleanedItems = [];
    for (const it of rawItems) {
      if (!it || typeof it !== 'object') continue;
      const kind = typeof it.kind === 'string' ? it.kind : '';
      const index = typeof it.index === 'number' && Number.isInteger(it.index) ? it.index : -1;
      if (!validKind(kind)) continue;
      if (index < 0 || index >= itemCount) continue; // 존재하지 않는 순번 버림
      const key = `${kind}:${index}`;
      if (used.has(key)) continue; // 중복 순번 버림
      used.add(key);
      cleanedItems.push({ kind, index });
    }
    if (cleanedItems.length === 0) continue; // 항목 하나도 안 남은 소주제 버림
    out.push({ title, items: cleanedItems });
  }

  return out;
}

function makeDegradedResponse(source) {
  return new Response(
    JSON.stringify({ topics: [], degraded: true }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-outline-source': source || 'fallback',
      },
    }
  );
}

function makeOkResponse(topics, source) {
  return new Response(
    JSON.stringify({ topics, degraded: false }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-outline-source': source || 'solar',
      },
    }
  );
}

export async function POST(request) {
  if (!isPost(request)) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const force = (request.headers.get(FORCE_HEADER) || '').trim().toLowerCase();
  const body = await parseBody(request).catch(() => null);
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: '요청 본문이 JSON이 아닙니다' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stage = body.stage;
  if (!stage || typeof stage !== 'object') {
    return new Response(JSON.stringify({ error: 'stage가 없습니다' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const items = buildStageItems(stage);
  const itemCount = items.length;

  // 항목 3개 미만 → 모델 안 부르고 빈 topics
  if (itemCount < MAX_ITEMS_BEFORE_MODEL) {
    return makeOkResponse([], 'solar');
  }

  // 시험 스위치: nokey → 키 없는 것처럼 동작
  if (force === 'nokey') {
    return makeDegradedResponse('fallback');
  }

  // messages 구성
  const system = buildSystemPrompt();
  const user = buildUserPrompt(items);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  try {
    const forceParse = force === 'parse';
    const content = await callSolar(messages, {
      maxTokens: OUTLINE_MAX_TOKENS,
      forceParse,
      force429: force === '429',
    });

    const parsed = parseOutlineReply(content);
    const topics = sanitizeTopics(parsed, itemCount);
    return makeOkResponse(topics, 'solar');
  } catch (err) {
    console.error('outline.js 오류:', err.message);
    if (err.code === 'NO_KEY') {
      return makeDegradedResponse('fallback');
    }
    // 429 포함 모든 호출 실패는 degraded true
    return makeDegradedResponse('fallback');
  }
}
