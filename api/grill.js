const SYSTEM_PROMPT = `당신은 사용자의 아이디어를 명료화하는 인터뷰어입니다.
막연한 생각을 구체적인 계획으로 정리하도록 돕습니다.

산출물:
- 매 턴 하나의 질문을 JSON 한 덩어리로만 내놓습니다. 코드펜스(마커)나 앞뒤 설명 문장은 넣지 않습니다.
- questionTitle: 한 줄 질문 제목, 24자 이내.
- questionBody: 선택지를 고르는 기준 한두 문장.
- suggestion: 추천 방향 한 줄.
- exampleButtons: 서로 다른 방향 2~3개를 각각 25자 안팎 완결된 구로. 마지막은 항상 "직접 입력"입니다. done이면 exampleButtons는 빈 배열입니다.
- 진행 중이면 done은 false.
- 종료면 done true, summary는 지금까지의 대화를 바탕으로 사용자의 아이디어를 3~5문장으로 정리한 글.

종료 규칙:
- 요청의 turnCount가 5 이상이면 질문을 만들지 말고, 지금까지 대화로 3~5문장 요약을 done true, summary로만 내놓습니다.
- 그래도 summary가 비면 history의 답들을 이어 붙인 요약을 대신 씁니다.

언어: 한국어. 쌍따옴표는 반각만 사용합니다.`;

function buildHistoryMessages(history) {
  return history.flatMap((h) => [
    {
      role: 'user',
      content: `[질문]\n제목: ${h.questionTitle}\n\n${h.questionBody}\n\n[추천] ${h.suggestion}\n\n[예시 버튼]\n${h.exampleButtons.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
    },
    { role: 'assistant', content: `[내 답변] ${h.answer}` },
  ]);
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

function cleanExampleButtons(buttons, done) {
  if (!Array.isArray(buttons)) return done ? [] : ['직접 입력'];
  const cleaned = [...new Set(buttons.filter((b) => typeof b === 'string' && b.trim()))]
    .map((b) => b.trim());
  if (done) return [];
  if (cleaned.length > 4) cleaned.length = 4;
  if (!cleaned.includes('직접 입력')) cleaned.push('직접 입력');
  return cleaned;
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
      console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${opts.maxRetries}), ${Math.pow(2, attempt)}초 대기 후 재시도...`);
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }

    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }

  throw new Error('Solar API 호출 최대 재시연 횟수 초과');
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!process.env.SOLAR_API_KEY) {
    return new Response(JSON.stringify({ error: 'Solar API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
        { role: 'user', content: '인터뷰가 5턴으로 끝났습니다. 지금까지의 대화를 바탕으로 사용자의 아이디어를 3~5문장으로 요약해 주세요. JSON 형식({ "done": true, "summary": "..." })으로만 출력하세요. 다른 텍스트 금지.' },
      ];
      try {
        const summaryContent = await callSolarWithRetry(summaryMessages, { maxRetries: 2 });
        const parsed = polish(summaryContent) || {};
        const summary = parsed.summary
          ? String(parsed.summary)
          : fallbackSummary(history);

        return new Response(
          JSON.stringify({
            questionTitle: '',
            questionBody: '',
            suggestion: '',
            exampleButtons: [],
            done: true,
            summary,
            turnCount: turnCount + 1,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-grill-source': 'solar',
            },
          }
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
            turnCount: turnCount + 1,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-grill-source': 'fallback:no-summary',
            },
          }
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
    if (!parsed || (typeof parsed !== 'object')) {
      return new Response(
        JSON.stringify({
          questionTitle: '조금 더 여쭤볼게요',
          questionBody: '아까 나눈 이야기를 바탕으로, 가장 먼저 확인하고 싶은 한 가지를 골라 주세요.',
          suggestion: '지금까지 나온 답변을 한 문장으로 정리해 방향을 좁혀 보세요.',
          exampleButtons: ['핵심 목표 다시 묻기', '대상 사용자 좁히기', '직접 입력'],
          done: false,
          summary: '',
          turnCount: turnCount + 1,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-grill-source': 'fallback:parse',
          },
        }
      );
    }

    const isEnd = parsed.done === true || turnCount >= 5;
    const buttons = cleanExampleButtons(parsed.exampleButtons, isEnd);

    return new Response(
      JSON.stringify({
        questionTitle: parsed.questionTitle || '',
        questionBody: parsed.questionBody || '',
        suggestion: parsed.suggestion || '',
        exampleButtons: buttons,
        done: isEnd,
        summary: parsed.summary || '',
        turnCount: turnCount + 1,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-grill-source': 'solar',
        },
      }
    );
  } catch (err) {
    console.error('grill.js 오류:', err.message);
    return new Response(JSON.stringify({ error: err.message || '서버 오류' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
