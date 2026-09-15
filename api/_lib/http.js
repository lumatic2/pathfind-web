// api/_lib/http.js — 공통 오류 응답·로그 헬퍼
// 키·업스트림 원문·요청/응답 본문은 절대 싣지 않는다.

/**
 * error 필드 하나짜리 JSON 응답을 만든다.
 * 상태 코드와 한 줄 메시지만 넣는다. 스택·업스트림 본문·URL·헤더는 넣지 않는다.
 */
export function sendError(status, message) {
  const body = JSON.stringify({ error: message });
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 함수 이름, 소요 ms, 상태 코드, x- 접두 소스 헤더 값만 한 줄로 console.log 한다.
 * 요청 본문·응답 본문·키·Authorization 헤더는 받지도 찍지도 않는다.
 *
 * @param fnName   함수 이름 (예: 'grill.POST')
 * @param elapsedMs 소요 시간(ms)
 * @param status   HTTP 상태 코드
 * @param sourceHeaders Headers 객체 또는 { 이름: 값 } 객체. x-로 시작하는 항목만 로그에 싣는다.
 */
export function logCall(fnName, elapsedMs, status, sourceHeaders) {
  const headerParts = [];
  if (sourceHeaders && typeof sourceHeaders.forEach === 'function') {
    // Headers 객체
    sourceHeaders.forEach((value, name) => {
      if (name.toLowerCase().startsWith('x-')) {
        headerParts.push(`${name}=${value}`);
      }
    });
  } else if (sourceHeaders && typeof sourceHeaders === 'object') {
    // 일반 객체
    for (const [name, value] of Object.entries(sourceHeaders)) {
      if (typeof name === 'string' && name.toLowerCase().startsWith('x-')) {
        headerParts.push(`${name}=${value}`);
      }
    }
  }
  const headerStr = headerParts.length ? ' ' + headerParts.join(' ') : '';
  console.log(`[${fnName}] status=${status} elapsed=${elapsedMs}ms${headerStr}`);
}
