// /api/source-card — 자료 한 건을 설명 양식으로 채우는 함수
// 명세: roadmap/M05-조사결과패널/M05-스텝7.md
// 계약 값: docs/api-contract.md §1~§6 (finding 스키마, verdict 4종, solar-pro4, 키 process.env)
import { callSolar, SOLAR_MODEL, DEFAULT_MAX_TOKENS } from './_lib/solar.js';
import { logCall, sendError } from './_lib/http.js';

const SYSTEM_PROMPT = `당신은 사용자가 조사한 자료 하나를 설명하는 어시스턴트입니다.
아래 "자료" 정보를 받아 설명 markdown을 위한 다섯 값만 JSON으로 출력합니다.
출력은 코드펜스나 설명 문장 없이 JSON 객체 하나만 내놓습니다.

출력 객체 스키마(고정, 다섯 키만):
{
  "oneLiner": "한 줄 요약 (30자 안팎, 이 자료가 무엇인지 한 문장)",
  "what": "무엇인가 — 이 자료의 정체·핵심 기능을 2~3문장",
  "use": "이 로드맵에서 어떻게 쓰나 — 사용자가 하려는 프로젝트에서 어느 단계에 어떻게 쓸 수 있는지 2~3문장",
  "avoid": "이럴 땐 피한다 — 이 자료를 쓰기 조심스러운 상황·제약 1~2문장",
  "constraints": "제약과 주의 — 원문 note를 그대로 두고, 아는 범위에서 라이선스·비용·범위·의존성 얘기를 덧붙임 (모르면 원문 note만)"
}

규칙:
- 위 다섯 값만 채웁니다. 다른 키는 넣지 않습니다.
- 모르는 절은 문자열 "확인 불가"로 채웁니다. 추정하지 않습니다.
- what/use/avoid/constraints는 한국어입니다.
- oneLiner는 한국어 한 문장입니다.`;

function escapeMarkdownLine(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function buildMarkdown(finding, stage, modelOut) {
  const name = (finding && finding.name) || '자료';
  const kind = (finding && finding.kind) || '';
  const query = (finding && finding.query) || '';
  const url = (finding && finding.url) || '';
  const evidence = (finding && finding.evidence) || '';
  const note = (finding && finding.note) || '';
  const stageTitle = (stage && stage.title) || '';

  const md = [];

  // 1. 이름 제목
  md.push(`# ${name}`);

  // 2. 한 줄 요약 (모델)
  md.push('');
  md.push(`## 한 줄 요약`);
  md.push('');
  md.push((modelOut && modelOut.oneLiner) || '확인 불가');

  // 3. 종류·단계·출처 줄 (고정)
  md.push('');
  md.push('## 종류·단계·출처');
  md.push('');
  const kindLine = kind ? `종류: ${kind}` : '종류: 확인 불가';
  const stageLine = stageTitle ? `단계: ${stageTitle}` : '단계: 확인 불가';
  const sourceLine = url ? `출처: ${url}` : '출처: 확인 불가';
  md.push(`- ${kindLine}`);
  md.push(`- ${stageLine}`);
  md.push(`- ${sourceLine}`);
  if (query) {
    md.push(`- 검색어: ${query}`);
  }

  // 4. 근거 등급이 있을 때만 채널 줄 (evidence가 있으면 근거가 있는 것으로 봄)
  if (evidence) {
    md.push('');
    md.push('## 근거 채널');
    md.push('');
    md.push(`- 근거: ${evidence}`);
  }

  // 5. 무엇인가 (모델)
  md.push('');
  md.push('## 무엇인가');
  md.push('');
  md.push((modelOut && modelOut.what) || '확인 불가');

  // 6. 이 로드맵에서 어떻게 쓰나 (모델)
  md.push('');
  md.push('## 이 로드맵에서 어떻게 쓰나');
  md.push('');
  md.push((modelOut && modelOut.use) || '확인 불가');

  // 7. 이럴 땐 피한다 (모델)
  md.push('');
  md.push('## 이럴 땐 피한다');
  md.push('');
  md.push((modelOut && modelOut.avoid) || '확인 불가');

  // 8. 제약과 주의 — 원문 note 그대로 + 모델이 덧붙임
  md.push('');
  md.push('## 제약과 주의');
  md.push('');
  if (note) {
    md.push(`- 원문 note: ${note}`);
  }
  if (modelOut && modelOut.constraints && modelOut.constraints !== '확인 불가') {
    md.push(`- 추가: ${modelOut.constraints}`);
  } else if (!note) {
    md.push('확인 불가');
  }

  // 9. 근거 — evidence 그대로 + 검색어 붙임
  md.push('');
  md.push('## 근거');
  md.push('');
  if (evidence) {
    md.push(evidence);
    if (query) {
      md.push('');
      md.push(`(검색어: ${query})`);
    }
  } else {
    md.push('확인 불가');
  }

  // 10. 관련 — 같은 단계의 다른 자료 이름 + 이 단계 할 일 + 가져다 쓸 것/직접 할 것
  md.push('');
  md.push('## 관련');
  md.push('');

  // 같은 단계 다른 자료
  const sameStageFindings = (stage && stage.findings) || [];
  const others = sameStageFindings.filter((f) => f && f.url && f.url !== url && f.name);
  if (others.length) {
    md.push('같은 단계 다른 자료:');
    for (const o of others) {
      md.push(`- ${o.name} (${o.kind || '자료'}) — ${o.url || '출처 없음'}`);
    }
  } else {
    md.push('같은 단계 다른 자료: 없음');
  }

  // 이 단계 할 일
  const tasks = (stage && stage.tasks) || [];
  if (tasks.length) {
    md.push('');
    md.push('이 단계 할 일:');
    for (const t of tasks) {
      const orderPrefix = t.order ? `${t.order}. ` : '';
      md.push(`- ${orderPrefix}${t.task}`);
    }
  }

  // verdict 기반 안내
  const verdict = (stage && stage.verdict) || '';
  if (verdict) {
    md.push('');
    md.push(`이 단계 판정: ${verdict}`);
    if (verdict === '가져다 써도 됨') {
      md.push('→ 이 자료는 가져다 쓸 후보로 둡니다.');
    } else if (verdict === '직접 해야 함') {
      md.push('→ 이 단계 핵심은 직접 해야 하므로 이 자료는 보조로만 씁니다.');
    } else if (verdict === '섞어야 함') {
      md.push('→ 이 자료는 뼈대로 쓰고 일부는 직접 채웁니다.');
    } else if (verdict === '선례를 못 찾음') {
      md.push('→ 이 단계에서 쓸 만한 자료를 찾지 못한 상태라 이 자료도 참고용입니다.');
    }
  }

  return md.join('\n');
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

    const markdown = buildMarkdown(finding, stage, modelOut);
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
