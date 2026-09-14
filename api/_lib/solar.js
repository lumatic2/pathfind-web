// api/_lib/solar.js — 공용 Solar 호출
// 호출 규약은 api/grill.js 와 동일. 키·주소는 process.env에서만 읽는다.

const SOLAR_MODEL = 'solar-pro4';
const DEFAULT_MAX_TOKENS = 2048;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callSolar(messages, opts = {}) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const maxRetries = opts.maxRetries ?? 2;
  const force429 = opts.force429 === true;

  if (!SOLAR_API_KEY) {
    const err = new Error('Solar API key not configured');
    err.code = 'NO_KEY';
    throw err;
  }

  const body = {
    model: SOLAR_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
    response_format: opts.forceParse ? undefined : { type: 'json_object' },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 시험 스위치: 첫 시도를 429로 강제
    if (force429 && attempt === 0) {
      const fake = new Response(JSON.stringify({ error: 'rate limit' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
      console.warn(`[outline] x-outline-force=429 시험 분기 (시도 ${attempt + 1}/${maxRetries})`);
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      throw new Error('Solar API 오류 (429): rate limit');
    }

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
      console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${maxRetries}), ${Math.pow(2, attempt)}초 대기 후 재시도...`);
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }

    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }

  throw new Error('Solar API 호출 최대 재시도 횟수 초과');
}

export { SOLAR_MODEL, DEFAULT_MAX_TOKENS };
