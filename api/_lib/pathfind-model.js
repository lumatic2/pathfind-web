// api/_lib/pathfind-model.js — 단계 설계(planning) 모델 호출
// timeout·signal 연동, 재시도 없음.
// 오류 코드: 429=요청 제한, 503=설정 누락, 502=상류 실패, 504=시간 초과.
// 원본 응답·키는 오류 메시지에 담지 않는다.

import { SOLAR_MODEL, SOLAR_MAX_TOKENS_LIMITS } from './solar.js';

const MAX_TOKENS = SOLAR_MAX_TOKENS_LIMITS.pathfind;

export async function callPlanningModel(messages, timeoutMs, signal) {
  const apiKey = process.env.SOLAR_API_KEY;
  const apiUrl = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';

  if (!apiKey) {
    const err = new Error('Solar API key not configured');
    err.status = 503;
    err.statusCode = 503;
    throw err;
  }

  const controller = new AbortController();
  const timeoutTimer = timeoutMs != null && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  // 바깥 signal이 abort되면 내부 컨트롤러도 함께 abort
  if (signal) {
    if (signal.aborted) {
      const err = new Error('계획 모델 호출 시간 초과');
      err.status = 504;
      err.statusCode = 504;
      throw err;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const body = {
      model: SOLAR_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        const err = new Error('계획 모델 응답이 비어 있습니다');
        err.status = 502;
        err.statusCode = 502;
        throw err;
      }
      return content;
    }

    if (res.status === 429) {
      const err = new Error('계획 모델 요청 제한');
      err.status = 429;
      err.statusCode = 429;
      throw err;
    }

    const err = new Error('계획 모델 상류 오류');
    err.status = 502;
    err.statusCode = 502;
    throw err;
  } catch (err) {
    if (err.status && [429, 502, 503, 504].includes(err.status)) {
      throw err;
    }
    if (err.name === 'AbortError' || (typeof err.name === 'string' && err.name.includes('Abort'))) {
      const timeoutErr = new Error('계획 모델 호출 시간 초과');
      timeoutErr.status = 504;
      timeoutErr.statusCode = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    if (timeoutTimer) clearTimeout(timeoutTimer);
  }
}
