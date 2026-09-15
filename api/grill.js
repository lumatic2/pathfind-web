import { sendError, logCall } from './_lib/http.js';

const SYSTEM_PROMPT = `당신은 사용자의 아이디어를 명료화하는 인터뷰어입니다.
막연한 생각을 구체적인 계획으로 정리하도록 돕습니다.

산출물:
- 매 턴 하나의 질문을 JSON 한 덩어리로만 내놓습니다. 코드펜스(마커)나 앞뒤 설명 문장은 넣지 않습니다.
- questionTitle: 한 줄 질문 제목, 24자 이내.
- questionBody: 선택지를 고르는 기준 한두 문장.
- suggestion: 추천 방향 한 줄.
- exampleButtons: 객체 배열. 각 객체는 { label, why, recommended }를 가집니다.
  - label: 서로 다른 방향 2~3개를 각각 25자 안팎 완결된 구.
  - why: 그 버튼을 고르면 좋은 점을 한 줄로. "도록", "라서", "기 때문에", "니까" 중 하나로 끝나는 까닭 문구.
  - recommended: 정확히 하나만 true. 가장 추천하는 방향 하나에 true, 나머지는 false.
  - 마지막 항목은 항상 label이 "직접 입력"이고 why는 빈 문자열(""), recommended는 false.
  - 모델이 exampleButtons를 문자열 배열로 답하면, 각 문자열을 { label: 문자열, why: "", recommended: false }로 감싼 것으로 간주합니다.
- opening: 주제에 맞는 조사 시작 한 줄. 단계마다 무엇을 먼저 찾을지 방향을 잡는 문장.
- 진행 중이면 done은 false.
- 종료면 done true, summary는 3~5문장 요약 문단 뒤에 빈 줄, "### 정한 것", 빈 줄, 목록(-)이 오는 마크다운 뼈대.
  - opening이 비어 있으면 서버가 기본 문구 "이제 단계마다 자료를 찾겠습니다"를 넣습니다.

종료 규칙:
- 요청의 turnCount가 5 이상이면 질문을 만들지 말고, 지금까지 대화로 3~5문장 요약을 done true, summary로만 내놓습니다.
- 그래도 summary가 비면 history의 답들을 이어 붙인 요약을 대신 씁니다.

언어: 한국어. 쌍따옴표는 반각만 사용합니다.`;

function buildHistoryMessages(history) {
  return history.flatMap((h) => {
    const buttons = Array.isArray(h.exampleButtons)
      ? h.exampleButtons.map((b, i) => {
          if (typeof b === 'string') return `${i + 1}. ${b}`;
          const label = typeof b.label === 'string' ? b.label : '';
          const why = typeof b.why === 'string' && b.why.trim() ? ` (${b.why})` : '';
          const mark = b.recommended === true ? ' ★' : '';
          return `${i + 1}. ${label}${why}${mark}`;
        }).join('\n')
      : '';
    return [
      {
        role: 'user',
        content: `[질문]\n제목: ${h.questionTitle}\n\n${h.questionBody}\n\n[추천] ${h.suggestion}\n\n[예시 버튼]\n${buttons}`,
      },
      { role: 'assistant', content: `[내 답변] ${h.answer}` },
    ];
  });
}

function normalizeExampleButtons(buttons, done) {
  if (done) return [];

  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [{ label: '직접 입력', why: '', recommended: true }];
  }

  const parsed = buttons
    .map((b) => {
      if (typeof b === 'string') {
        return { label: b.trim(), why: '', recommended: false };
      }
      if (typeof b === 'object' && b !== null) {
        const label = typeof b.label === 'string' ? b.label.trim() : '';
        const why = typeof b.why === 'string' ? b.why.trim() : '';
        const recommended = b.recommended === true;
        return { label, why, recommended };
      }
      return null;
    })
    .filter((b) => b && typeof b.label === 'string' && b.label);

  if (parsed.length === 0) {
    return [{ label: '직접 입력', why: '', recommended: true }];
  }

  const last = parsed[parsed.length - 1];
  if (last.label !== '직접 입력') {
    parsed.push({ label: '직접 입력', why: '', recommended: false });
  } else {
    last.why = '';
    last.recommended = false;
  }

  if (!parsed.some((b) => b.recommended === true)) {
    parsed[0].recommended = true;
  }

  let found = false;
  for (const b of parsed) {
    if (b.recommended === true) {
      if (found) {
        b.recommended = false;
      } else {
        found = true;
      }
    }
  }

  if (parsed.length > 4) {
    const withoutDirect = parsed.filter((b) => b.label !== '직접 입력');
    if (withoutDirect.length > 3) {
      withoutDirect.length = 3;
      const kept = [...withoutDirect, { label: '직접 입력', why: '', recommended: false }];
      if (!kept.some((b) => b.recommended === true)) {
        kept[0].recommended = true;
      }
      return kept;
    }
  }

  return parsed;
}

function polish(content) {
  const trimmed = content?.trim();
  if (!trimmed) return null;

  let text = trimmed;

  // 코드펜스 벗기기
  let codeMatch = text.match(/^[\s\S]*?```(?:json)?\s*([\s\S]*?)```[\s\S]*$/);
  if (codeMatch) {
    text = codeMatch[1].trim();
  } else {
    // 마지막 코드펜스 조각만 남겼을 가능성도 시도
    const parts = text.split('```');
    if (parts.length >= 3) {
      // 첫 블록과 중간 블록들 대신 마지막 내용 블록을 우선
      text = parts[parts.length - 1].trim();
    }
  }

  // JSON 덩어리를 찾아 파싱
  const candidates = [
    text,
    // 문장 사이에 낀 JSON만 골라내기
    ...[...text.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]),
  ];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackSummary(history) {
  const answers = history
    .filter((h) => typeof h.answer === 'string' && h.answer.trim())
    .map((h) => h.answer.trim())
    .join('\n');
  if (!answers) return '인터뷰를 통해 정리된 아이디어를 요약해 주세요.';
  return `지금까지 나눈 답변입니다.\n\n${answers}`;
}

const DEFAULT_OPENING = '이제 단계마다 자료를 찾겠습니다.';

async function callSolarWithRetry(messages, opts = {}) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
  const SOLAR_MODEL = 'solar-pro4';
  const maxRetries = opts.maxRetries ?? 2;

  if (!SOLAR_API_KEY) throw new Error('Solar API key not configured');

  const body = {
    model: SOLAR_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
    response_format: opts.forceParse ? undefined : { type: 'json_object' },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const solarRes = await fetch(SOLAR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SOLAR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (solarRes.ok) {
      const solarData = await solarRes.json();
      const content = solarData.choices?.[0]?.message?.content;
      if (!content) throw new Error('Solar 응답이 비어 있습니다');
      return content;
    }

    const errBody = await solarRes.text().catch(() => '');
    const status = solarRes.status;

    if (status === 429 && attempt < maxRetries) {
      logCall('grill.retry', 0, status, {});
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }

    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }

  throw new Error('Solar API 호출 최대 재시연 횟수 초과');
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  if (!process.env.SOLAR_API_KEY) {
    return sendError(500, 'Solar API key not configured');
  }

  const force = (request.headers.get('x-grill-force') || '').trim().toLowerCase();

  try {
    const body = await request.json().catch(() => ({}));
    const { question, answer, history = [], turnCount = 0 } = body || {};

    // 강제 종료 분기: 요청 turnCount >= 5
    if (turnCount >= 5) {
      const summaryMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...buildHistoryMessages(history),
        {
          role: 'user',
          content:
            '인터뷰가 5턴으로 끝났습니다. 지금까지의 대화를 바탕으로 사용자의 아이디어를 3~5문장으로 요약해 주세요. 요약 문단 뒤에 빈 줄, "### 정한 것", 빈 줄, 목록(-)을 이어 붙인 마크다운 뼈대로 출력하세요. JSON 형식({ "done": true, "summary": "...", "opening": "..." })으로만 출력하세요. 다른 텍스트 금지.',
        },
      ];
      try {
        const summaryContent = await callSolarWithRetry(summaryMessages, { maxRetries: 2 });
        const parsed = polish(summaryContent) || {};
        const summary = parsed.summary ? String(parsed.summary) : fallbackSummary(history);
        const opening =
          typeof parsed.opening === 'string' && parsed.opening.trim()
            ? parsed.opening.trim()
            : DEFAULT_OPENING;

        return new Response(
          JSON.stringify({
            questionTitle: '',
            questionBody: '',
            suggestion: '',
            exampleButtons: [],
            done: true,
            summary,
            opening,
            turnCount: turnCount + 1,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-grill-source': 'solar',
            },
          },
        );
      } catch (e) {
        // Solar 호출 실패 시에도 종료 처리 — history 답 기반 폴백 요약
        return new Response(
          JSON.stringify({
            questionTitle: '',
            questionBody: '',
            suggestion: '',
            exampleButtons: [],
            done: true,
            summary: fallbackSummary(history),
            opening: DEFAULT_OPENING,
            turnCount: turnCount + 1,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-grill-source': 'fallback:no-summary',
            },
          },
        );
      }
    }

    // messages 구성
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...buildHistoryMessages(history),
    ];

    if (turnCount === 0 && question) {
      messages.push({ role: 'user', content: question });
    } else if (answer !== undefined && answer !== null && answer !== '') {
      messages.push({ role: 'user', content: `내 답변: ${answer}` });
    } else {
      messages.push({ role: 'user', content: `[예시 버튼 선택] ${question || '(버튼 선택)'}` });
    }

    // x-grill-force: parse 면 response_format을 끄고 산문 응답을 받아 polish 경로로
    const forceParse = force === 'parse';
    const content = await callSolarWithRetry(messages, { forceParse });

    // x-grill-force: error 면 여기서 500 강제
    if (force === 'error') {
      throw new Error('x-grill-force=error 테스트 경로');
    }

    const parsed = polish(content);

    // 파싱 실패: 500 대신 200 + 다시 여쭤볼게요 질문
    if (!parsed || typeof parsed !== 'object') {
      return new Response(
        JSON.stringify({
          questionTitle: '조금 더 여쭤볼게요',
          questionBody: '아까 나눈 이야기를 바탕으로, 가장 먼저 확인하고 싶은 한 가지를 골라 주세요.',
          suggestion: '지금까지 나온 답변을 한 문장으로 정리해 방향을 좁혀 보세요.',
          exampleButtons: [
            {
              label: '핵심 목표 다시 묻기',
              why: '핵심 목표를 다시 확인하면 방향이 선명해지기 때문입니다',
              recommended: true,
            },
            {
              label: '대상 사용자 좁히기',
              why: '누구를 위한 것인지 정하면 범위를 줄이기 쉽기 때문입니다',
              recommended: false,
            },
            { label: '직접 입력', why: '', recommended: false },
          ],
          done: false,
          summary: '',
          opening: DEFAULT_OPENING,
          turnCount: turnCount + 1,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-grill-source': 'fallback:parse',
          },
        },
      );
    }

    const isEnd = parsed.done === true || turnCount >= 5;
    const buttons = normalizeExampleButtons(parsed.exampleButtons, isEnd);
    const summary = parsed.summary || '';
    const opening =
      typeof parsed.opening === 'string' && parsed.opening.trim() ? parsed.opening.trim() : DEFAULT_OPENING;

    return new Response(
      JSON.stringify({
        questionTitle: parsed.questionTitle || '',
        questionBody: parsed.questionBody || '',
        suggestion: parsed.suggestion || '',
        exampleButtons: buttons,
        done: isEnd,
        summary,
        opening,
        turnCount: turnCount + 1,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-grill-source': 'solar',
        },
      },
    );
  } catch (err) {
    logCall('grill.POST', 0, 500, request.headers);
    return sendError(500, '서버 오류');
  }
}
