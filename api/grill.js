const SYSTEM_PROMPT = `당신은 사용자의 아이디어를 명료화하는 인터뷰어입니다.
사용자가 "무엇을 만들고 싶다"는 막연한 생각을 구체적인 계획으로 정리하도록 돕습니다.

규칙:
1. 최대 5턴까지 진행합니다. (이미 N턴 진행 중이면 남은 턴 내에서 마무리)
2. 각 턴마다 사용자에게 하나의 핵심 질문을 합니다.
3. 질문 제목, 질문 본문, 추천 방향, 예시 답변 버튼 2-3개를 제공합니다.
4. 사실 확인은 당신이 직접 합니다 (사용자에게 시키지 않습니다).
5. 5턴이 끝나거나 사용자가 충분히 구체화되었다고 판단되면 종료하고 요약합니다.
6. 사용자는 게임·서비스·앱·문서 등 무엇이든 만들 수 있습니다. 특정 주제로 한정하지 마세요.

출력 형식 (JSON만, 다른 텍스트 금지):
{
  "questionTitle": "한 줄 질문 제목 (24자 이내)",
  "questionBody": "질문 내용 (선택지 포함 가능)",
  "suggestion": "추천 방향",
  "exampleButtons": ["예시1", "예시2", "예시3"],
  "done": false
}

5턴 종료 또는 충분히 구체화되면:
{
  "done": true,
  "summary": "사용자의 정리된 아이디어를 3-5문장으로 요약 (구현 단계 설계에 쓸 수 있게)"
}

주의: 한국어 키보드에서 쌍따옴표 입력 시 \u201c\u201d(전각)가 들어갈 수 있으니, JSON 파싱이 깨지지 않게 반각 따옴표만 사용하라.
`;

function buildHistoryMessages(history) {
  return history.flatMap((h) => [
    {
      role: 'user',
      content: `[질문]\n제목: ${h.questionTitle}\n\n${h.questionBody}\n\n[추천] ${h.suggestion}\n\n[예시 버튼]\n${h.exampleButtons.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
    },
    { role: 'assistant', content: `[내 답변] ${h.answer}` },
  ]);
}

function parseSolarJson(content) {
  const trimmed = content.trim();
  // JSON이 그대로 오면 바로 파싱
  try {
    return JSON.parse(trimmed);
  } catch {
    // 마크다운 코드 블록에서 추출
    const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      try {
        return JSON.parse(codeMatch[1].trim());
      } catch {
        // 코드 블록 안에서도 실패
      }
    }
    // 마지막 ``` 닫힘 이후 텍스트가 있으면 거기서 시도
    const lastBlock = trimmed.split('```').pop()?.trim();
    if (lastBlock) {
      try {
        return JSON.parse(lastBlock);
      } catch {
        // 실패
      }
    }
    throw new Error('Solar 응답이 JSON이 아닙니다: ' + trimmed.slice(0, 200));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callSolarWithRetry(messages, maxRetries = 3) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
  const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';

  if (!SOLAR_API_KEY) throw new Error('Solar API key not configured');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const solarRes = await fetch(SOLAR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SOLAR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SOLAR_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (solarRes.ok) {
      const solarData = await solarRes.json();
      const content = solarData.choices?.[0]?.message?.content;
      if (!content) throw new Error('Solar 응답이 비어 있습니다');
      return content;
    }

    const errBody = await solarRes.text().catch(() => '');
    const status = solarRes.status;

    // 429 Rate Limit - exponential backoff with retry
    if (status === 429 && attempt < maxRetries) {
      console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${maxRetries}), ${Math.pow(2, attempt)}초 대기 후 재시도...`);
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

  try {
    const body = await request.json().catch(() => ({}));
    const { question, answer, history = [], turnCount = 0 } = body || {};

    if (!question && !answer && turnCount === 0) {
      return new Response(JSON.stringify({ error: 'Initial question required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // messages 구성
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...buildHistoryMessages(history),
    ];

    if (turnCount === 0 && question) {
      // 첫 턴: 사용자 초기 입력
      messages.push({ role: 'user', content: question });
    } else if (answer !== undefined && answer !== null && answer !== '') {
      messages.push({ role: 'user', content: `내 답변: ${answer}` });
    } else {
      // 답변 없이 다시 호출된 경우 (예: 예시 버튼 클릭 후)
      messages.push({ role: 'user', content: `[예시 버튼 선택] ${question || '(버튼 선택)'}` });
    }

    const content = await callSolarWithRetry(messages);
    const parsed = parseSolarJson(content);

    // 필수 필드 검증
    if (!parsed.questionTitle && !parsed.done) {
      throw new Error('Solar 응답에 questionTitle 또는 done이 없습니다: ' + JSON.stringify(parsed).slice(0, 200));
    }

    const isMaxTurn = turnCount >= 4; // 0-based, 4회면 5턴째
    const done = parsed.done === true || isMaxTurn;

    return new Response(JSON.stringify({
      questionTitle: parsed.questionTitle || '',
      questionBody: parsed.questionBody || '',
      suggestion: parsed.suggestion || '',
      exampleButtons: Array.isArray(parsed.exampleButtons) ? parsed.exampleButtons : [],
      done: done,
      summary: parsed.summary || '',
      turnCount: turnCount + 1,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('grill.js 오류:', err.message);
    return new Response(JSON.stringify({ error: err.message || '서버 오류' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
