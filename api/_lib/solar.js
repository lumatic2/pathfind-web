// api/_lib/solar.js — 공용 Solar 호출
// 호출 규약은 api/grill.js 와 동일. 키·주소는 process.env에서만 읽는다.
// maxTokens는 필수 인자. 빠지면 기본값으로 메꾸지 않고 예외를 낸다.

const SOLAR_MODEL = 'solar-pro4';

// 함수별 max_tokens 상한. 호출부가 이 값을 넘는지 별도 카드에서 확인한다.
export const SOLAR_MAX_TOKENS_LIMITS = {
  grill: 800,
  pathfind: 3000,
  stage: 2500,
  handoff: 4000,
  explain: 900,
  chat: 1200,
  outline: 600,
  'source-card': 1200,
};

// 429 backoff: 1초, 3초 두 번 재시도 후에도 429면 429 그대로 던진다.
const RETRY_DELAYS_429 = [1000, 3000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callSolar(messages, opts = {}) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';

  const maxTokens = opts.maxTokens;
  if (maxTokens === undefined || maxTokens === null) {
    const err = new Error('callSolar: maxTokens가 필요합니다. 생략된 호출입니다.');
    err.code = 'NO_MAX_TOKENS';
    throw err;
  }

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
      if (attempt < RETRY_DELAYS_429.length) {
        await sleep(RETRY_DELAYS_429[attempt]);
        continue;
      }
      const err = new Error('Solar API 오류 (429): rate limit');
      err.status = 429;
      throw err;
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

    if (status === 429) {
      if (attempt < RETRY_DELAYS_429.length) {
        console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${RETRY_DELAYS_429.length + 1}), ${RETRY_DELAYS_429[attempt] / 1000}초 대기 후 재시도...`);
        await sleep(RETRY_DELAYS_429[attempt]);
        continue;
      }
      // 두 번 재시도 후에도 429면 429 그대로 던진다
      const err = new Error(`Solar API 오류 (429): ${errBody.slice(0, 300)}`);
      err.status = 429;
      throw err;
    }

    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }

  throw new Error('Solar API 호출 최대 재시도 횟수 초과');
}

export { SOLAR_MODEL };
