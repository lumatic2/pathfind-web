// /api/source-card — 자료 한 건을 설명 양식으로 채우는 함수
// 명세: roadmap/M05-조사결과패널/M05-스텝7.md
// 계약 값: docs/api-contract.md §1~§6 (finding 스키마, verdict 4종, solar-pro4, 키 process.env)
import { callSolar, SOLAR_MODEL, DEFAULT_MAX_TOKENS } from './_lib/solar.js';
import { logCall, sendError } from './_lib/http.js';

const SYSTEM_PROMPT = `당신은 조사에서 찾은 자료 1건을 프로젝트 팀이 바로 쓸 수 있는 카드로 정리하는 안내자입니다.
주어진 자료 사실(이름·종류·근거·주의·검색어·출처)과 프로젝트 요약·단계 맥락만으로 씁니다. 사실에 없는 것은 "확인 불가"라고 적습니다.

다섯 항목을 한국어로 채웁니다:
- oneLiner: 이 자료가 무엇인지 한 문장(40자 안팎).
- what: 무엇인가 — 이 자료가 하는 일과 성격 2~3문장. 핵심 어구는 **굵게**.
- use: 이 패스에서 어떻게 쓰나 — 프로젝트 요약과 이 단계의 할 일에 이어서, 무엇을 가져다 쓰고 무엇을 손봐야 하는지 \- ` 목록 2~4줄.
- avoid: 이럴 땐 피한다 — 이 자료가 맞지 않는 상황 `- ` 목록 1~3줄.
- constraints: 제약·주의 — 라이선스·비용·범위·의존성처럼 쓰기 전에 알아야 할 것 `- ` 목록 1~3줄(사실에 없으면 "- 확인 불가" 한 줄).

출력 형식 (JSON만, 다른 텍스트 없이):
{ "oneLiner": "...", "what": "...", "use": "- ...", "avoid": "- ...", "constraints": "- ..." }`;

const UNKNOWN = '확인 불가';

function t(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** 절 본문 정리 — 비면 「확인 불가」, 목록 절은 `- ` 로 시작하게. */
function section(v, list) {
  const s = String(v ?? '').trim();
  if (!s) return list ? `- ${UNKNOWN}` : UNKNOWN;
  if (!list) return s;
  return s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => (/^[-*]\s/.test(l) ? `- ${l.replace(/^[-*]\s+/, '')}` : `- ${l}`)).join('\n');
}

/** 카드 조립 — 사실은 축자, 모델 절은 정리해서. */
function buildCard({ finding: f, stage: s, model }) {
  const name = t(f?.name) || '이름 없는 자료';
  const lines = [`# ${name}`, ''];
  lines.push(section(model?.oneLiner, false));
  lines.push('', `**종류** — ${t(f?.kind) || '자료'} · **단계** — ${s?.no ?? '?'}. ${t(s?.title)}${t(f?.url) ? ` · **출처** — ${t(f.url)}` : ''}`);
  lines.push('', '## 무엇인가', section(model?.what, false));
  lines.push('', '## 이 패스에서 어떻게 쓰나', section(model?.use, true));
  lines.push('', '## 이럴 땐 피한다', section(model?.avoid, true));
  lines.push('', '## 제약·주의');
  if (t(f?.note)) lines.push(`- ${t(f.note)}`);
  const c = section(model?.constraints, true);
  if (c !== `- ${UNKNOWN}` || !t(f?.note)) lines.push(c);
  lines.push('', '## 근거');
  if (t(f?.evidence)) lines.push(`- ${t(f.evidence)}`);
  if (t(f?.query)) lines.push(`- 찾은 검색어 — ${t(f.query)}`);
  if (!t(f?.evidence) && !t(f?.query)) lines.push(`- ${UNKNOWN}`);
  // 관련 — 코드가 만든다(같은 단계의 다른 자료·할 일)
  const others = (Array.isArray(s?.findings) ? s.findings : []).map((x) => t(x?.name)).filter((n) => n && n !== name);
  const tasks = (Array.isArray(s?.tasks) ? s.tasks : []).map((x) => t(x?.task)).filter(Boolean);
  const todos = (Array.isArray(s?.todos) ? s.todos : []).map((x) => `[${t(x?.owner)}] ${t(x?.task)}`).filter((x) => x.length > 3);
  lines.push('', '## 관련');
  if (others.length) lines.push(`- 같은 단계 자료 — ${others.join(' · ')}`);
  if (tasks.length) lines.push(`- 이 단계 할 일 — ${tasks.join(' · ')}`);
  if (todos.length) lines.push(`- 이미 있는 것 / 직접 할 것 — ${todos.join(' · ')}`);
  if (!others.length && !tasks.length && !todos.length) lines.push('- 없음');
  return lines.join('\n');
}

function parseModelJson(content) {
  const trimmed = (content || '').trim();
  if (!trimmed) return null;

  // 코드펜스 벗기기
  let text = trimmed;
  let codeMatch = text.match(/^[\\s\\S]*?```(?:json)?\\s*([\\s\\S]*?)```[\\s\\S]*$/);
  if (codeMatch) {
    text = codeMatch[1].trim();
  } else {
    const parts = text.split('```');
    if (parts.length >= 3) {
      text = parts[parts.length - 1].trim();
    }
  }

  const candidates = [text, ...[...text.matchAll(/{[\\s\\S]*}/g)].map((m) => m[0])];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // 다섯 키만 취하고 나머지는 버림
        const out = {};
        for (const k of ['oneLiner', 'what', 'use', 'avoid', 'constraints']) {
          out[k] = typeof parsed[k] === 'string' ? parsed[k].trim() : '';
        }
        return out;
      }
    } catch {
      // 다음 후보
    }
  }
  return null;
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  const force = (request.headers.get('x-card-force') || '').trim().toLowerCase();

  // 요청 본문 읽기
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { finding, stage, summary } = body || {};

  if (!finding || !finding.name) {
    return sendError(400, 'finding.name 필요');
  }

  // 시험 스위치: nokey → 키 없이 호출해 NO_KEY 분기 확인
  if (force === 'nokey') {
    return new Response(
      JSON.stringify({ markdown: '', degraded: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-card-source': 'fallback:nokey',
        },
      },
    );
  }

  // messages 구성
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (summary) {
    messages.push({ role: 'user', content: `[프로젝트 요약]\n${summary}` });
  }
  messages.push({
    role: 'user',
    content: `[자료]\n이름: ${finding.name}\n종류: ${finding.kind || ''}\n검색어: ${finding.query || ''}\n근거(검색 결과 문장): ${finding.evidence || ''}\n원문 메모: ${finding.note || ''}\n출처 URL: ${finding.url || ''}\n\n위 자료를 설명 markdown용 다섯 값(oneLiner, what, use, avoid, constraints)만 JSON으로 출력하세요. 모르는 절은 "확인 불가"로 채웁니다.`,
  });
  if (stage && stage.title) {
    messages.push({
      role: 'user',
      content: `[이 자료가 속한 단계]\n제목: ${stage.title}\n설명: ${stage.desc || ''}\n판정: ${stage.verdict || ''}\n같은 단계 다른 자료 수: ${(stage.findings || []).filter((f) => f && f.url && f.url !== finding.url).length}\n할 일 수: ${(stage.tasks || []).length}`,
    });
  }

  try {
    const forceParse = force === 'parse';
    const force429 = force === '429';
    const content = await callSolar(messages, {
      maxTokens: 2048,
      forceParse,
      force429,
    });

    const modelOut = parseModelJson(content);

    if (!modelOut) {
      return new Response(
        JSON.stringify({ markdown: '', degraded: true }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-card-source': 'fallback:parse',
          },
        },
      );
    }

    const markdown = buildCard({ finding, stage, model: modelOut });
    logCall('source-card.POST', 0, 200, { 'x-card-source': 'solar' });
    return new Response(
      JSON.stringify({ markdown, degraded: false }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-card-source': 'solar',
        },
      },
    );
  } catch (err) {
    logCall('source-card.POST', 0, 200, { 'x-card-source': 'fallback:error' });
    const msg = String(err.message || '');
    const is429 = msg.toLowerCase().includes('429') || msg.toLowerCase().includes('rate limit');

    if (is429 || force === '429') {
      return new Response(
        JSON.stringify({ markdown: '', degraded: true }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-card-source': 'fallback:429',
          },
        },
      );
    }

    // 그 외 오류도 200 + 빈 markdown + degraded (스텝7 규정)
    return new Response(
      JSON.stringify({ markdown: '', degraded: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-card-source': 'fallback:error',
        },
      },
    );
  }
}
