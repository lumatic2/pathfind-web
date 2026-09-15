import { buildPathMarkdown } from './_lib/handoff-markdown.js';
import { sendError, logCall } from './_lib/http.js';

// /api/handoff — handoff 마크다운 최종본 (내려받기·복사)
// 계약: docs/api-contract.md §4. 단계 리서치 결과를 모아 최종 handoff 마크다운을 만든다.
// 앱 우측 하단 "handoff 다운로드·복사" 버튼이 이 엔드포인트를 부른다.
//
// M14 스텝71: 유효한 요청이면 단계에서 만든 문서를 그대로 돌려주고, 외부 모델 호출과
// 재시도는 이 경로에서 하지 않는다. 문서 조립은 api/_lib/handoff-markdown.js의
// buildPathMarkdown에 위임한다. 응답 모양({ handoffMarkdown, title })과
// x-handoff-source: assembled 는 그대로 둔다.

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { bigPicture, stages = [], summary = '' } = body || {};

    if (!bigPicture || typeof bigPicture !== 'object') {
      return sendError(400, 'bigPicture 필요');
    }

    if (!bigPicture.title) {
      return sendError(400, 'bigPicture.title 필요');
    }

    const title = bigPicture.title;

    const markdown = buildPathMarkdown(bigPicture, stages, summary);
    return new Response(
      JSON.stringify({ handoffMarkdown: markdown, title }),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-handoff-source': 'assembled',
        },
      }
    );
  } catch (err) {
    logCall('handoff.POST', 0, 500, request.headers);
    return sendError(500, '서버 오류');
  }
}
