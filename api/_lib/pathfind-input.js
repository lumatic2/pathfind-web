// api/_lib/pathfind-input.js — 선행 조사 요청 본문 읽기
// 빈 값·잘못된 JSON → 400, 8000자 초과 요약 → 400, 본문 64KB 초과 → 413.
// Content-Length를 믿지 않고 실제 읽은 바이트로 제한한다.
// 키나 요청 본문은 오류에 포함하지 않는다.

const MAX_BODY_BYTES = 64 * 1024;   // 64KB
const MAX_SUMMARY_CHARS = 8000;

export async function readPlanningInput(req) {
  const body = req.body;
  if (!body) {
    throw makeError(400, '요청 본문이 비어 있습니다.');
  }

  if (body.bodyUsed) {
    throw makeError(400, '요청 본문이 이미 소비되었습니다.');
  }

  const text = await readBodyText(body);
  if (!text) {
    throw makeError(400, '요청 본문이 비어 있습니다.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw makeError(400, '요청 본문이 올바른 JSON이 아닙니다.');
  }

  if (typeof parsed.summary !== 'string' || parsed.summary.length === 0) {
    throw makeError(400, '요청 본문에 요약이 없습니다.');
  }

  if (parsed.summary.length > MAX_SUMMARY_CHARS) {
    throw makeError(400, '요약이 너무 깁니다.');
  }

  return parsed.summary;
}

function readBodyText(body) {
  const reader = body.getReader ? body.getReader() : null;
  if (!reader) {
    // ReadableStream이 없으면 text()로 폴백
    return body.text ? body.text() : '';
  }

  const chunks = [];
  let bytesRead = 0;
  let settled = false;

  const pump = () => {
    reader.read().then(({ done, value }) => {
      if (settled) return;
      if (done) {
        settled = true;
        const text = chunks.length ? concatChunks(chunks) : '';
        resolve(text);
        return;
      }

      const byteCount = byteLength(value);
      bytesRead += byteCount;
      if (bytesRead > MAX_BODY_BYTES) {
        settled = true;
        reader.cancel && reader.cancel();
        reject(makeError(413, '요청 본문이 너무 큽니다.'));
        return;
      }

      chunks.push(value);
      pump();
    }).catch(err => {
      if (settled) return;
      settled = true;
      reject(err && err.status === 413 ? err : makeError(400, '요청 본문을 읽는 중 오류가 발생했습니다.'));
    });
  };

  return new Promise((resolve, reject) => {
    pump();
  });
}

function byteLength(chunk) {
  if (typeof chunk === 'string') return new TextEncoder().encode(chunk).length;
  if (chunk && typeof chunk.byteLength === 'number') return chunk.byteLength;
  if (chunk && typeof chunk.size === 'number') return chunk.size;
  return 0;
}

function concatChunks(chunks) {
  const decoded = [];
  for (const chunk of chunks) {
    decoded.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
  }
  return decoded.join('');
}

function makeError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}
