// POST /api/outline — 단계 항목을 소주제로 묶는다
// 계약: docs/api-contract.md / roadmap/M05-조사결과패널/M05-스텝5.md
// 기준: roadmap/목표화면/기준코드/server/outline.mjs (M5 확장 4차 보강 step-13, 사용자 H8)

import { callSolar } from './_lib/solar.js';
import { logCall, sendError } from './_lib/http.js';

const MAX_ITEMS_BEFORE_MODEL = 3;
const OUTLINE_MAX_TOKENS = 1024;
const FORCE_HEADER = 'x-outline-force';
const MAX_DEPTH = 2;

const t = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// 항목 목록 — 모델에게 주는 번호표. ref 는 finding-<i>·task-<i>·todo-<i> 그대로.
function listItems(stage) {
  const out = [];
  (Array.isArray(stage?.findings) ? stage.findings : []).forEach((f, i) =>
    out.push({ ref: `finding-${i}`, text: `${t(f?.name)} (자료·${t(f?.kind) || '자료'})` }));
  (Array.isArray(stage?.tasks) ? stage.tasks : []).forEach((x, i) =>
    out.push({ ref: `task-${i}`, text: `${t(x?.task)} (할 일)` }));
  (Array.isArray(stage?.todos) ? stage.todos : []).forEach((x, i) =>
    out.push({ ref: `todo-${i}`, text: `${t(x?.task)} (${t(x?.owner) || '역할 나눔'})` }));
  return out;
}

const SYSTEM_PROMPT = `당신은 조사 결과 한 단계의 항목들을 마인드맵용 소주제로 정리하는 편집자입니다.
주어진 항목(자료·할 일·역할 나눔)을 뜻이 가까운 것끼리 소주제로 묶습니다. 소주제 제목은 12자 안팎의 명사형이고, 항목의 내용을 대표합니다.
항목이 많고 결이 갈리면 소주제 안에 하위 소주제를 한 층 더 둘 수 있습니다(최대 2층). 항목이 적거나 결이 하나면 topics 를 빈 배열로 냅니다.
각 항목은 정확히 한 소주제에 한 번만 넣습니다. 항목 ref 는 주어진 번호표 그대로 씁니다.

출력 형식 (JSON만, 다른 텍스트 없이):
{ "topics": [ { "title": "소주제", "items": ["finding-0", "task-1"], "topics": [ { "title": "하위 소주제", "items": ["todo-0"] } ] } ] }`;

function parseJson(content) {
  const s = String(content).trim();
  try { return JSON.parse(s); } catch { /* 아래로 */ }
  const block = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) { try { return JSON.parse(block[1].trim()); } catch { /* 아래로 */ } }
  const brace = s.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* 아래로 */ } }
  throw new Error('parse');
}

// 결정론 보정 — 유효 ref · 1회 · 빈 소주제 제거 · 깊이 상한 · 하나뿐이면 평평하게.
function normalizeTopics(rawTopics, stage) {
  const valid = new Set(listItems(stage).map((x) => x.ref));
  const used = new Set();
  const walk = (list, depth) => {
    if (!Array.isArray(list) || depth > MAX_DEPTH) return [];
    const out = [];
    for (const tp of list) {
      const title = t(tp?.title);
      const items = [];
      for (const r of Array.isArray(tp?.items) ? tp.items : []) {
        const ref = t(r);
        if (!valid.has(ref) || used.has(ref)) continue;
        used.add(ref);
        items.push(ref);
      }
      const topics = depth < MAX_DEPTH ? walk(tp?.topics, depth + 1) : [];
      if (!title || (!items.length && !topics.length)) continue;
      out.push(topics.length ? { title, items, topics } : { title, items });
    }
    return out;
  };
  const topics = walk(rawTopics, 1);
  if (topics.length === 1 && !topics[0].topics?.length) return [];
  return topics;
}

function makeResponse(topics, source, degraded) {
  return new Response(
    JSON.stringify({ topics, degraded }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'x-outline-source': source,
      },
    }
  );
}

function parseBody(request) {
  return request.json().catch(() => null);
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  const force = (request.headers.get(FORCE_HEADER) || '').trim().toLowerCase();
  const body = await parseBody(request).catch(() => null);
  if (!body || typeof body !== 'object') {
    return sendError(400, '요청 본문이 JSON이 아닙니다');
  }

  const stage = body.stage;
  if (!stage || typeof stage.no !== 'number') {
    return sendError(400, 'stage.no 가 필요합니다');
  }

  const items = listItems(stage);
  if (items.length < MAX_ITEMS_BEFORE_MODEL) {
    return makeResponse([], 'local:flat', false);
  }

  if (force === 'nokey') {
    return makeResponse([], 'fallback:no-key', true);
  }

  try {
    const context = [
      `[프로젝트 요약]\n${t(body.summary) || '(없음)'}`,
      `[단계 ${stage.no}] ${t(stage.title)}\n${t(stage.desc)}`,
      `[항목 번호표]\n${items.map((x) => `${x.ref}: ${x.text}`).join('\n')}`,
    ].join('\n\n');

    const content = await callSolar(
      [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: context }],
      { maxTokens: OUTLINE_MAX_TOKENS, forceParse: force === 'parse', force429: force === '429' }
    );

    const parsed = parseJson(content);
    const topics = normalizeTopics(parsed.topics, stage);
    return makeResponse(topics, 'local', false);
  } catch (e) {
    logCall('outline.POST', 0, 200, { 'x-outline-source': 'fallback' });
    const reason = String(e.message || e).replace(/[^\x20-\x7e]/g, '?');
    return makeResponse([], `fallback:${reason}`, true);
  }
}
