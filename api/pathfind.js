// 긴 프롬프트는 별도 상수로 분리 (가독성)
const BIG_PICTURE_SYSTEM = `당신은 무언가를 만들려는 사람을 위한 "큰 그림 설계자"입니다.
사용자가 pathfind 정렬 인터뷰를 마친 후, 그 아이디어를 실제로 구현하기 위한 큰 단계와 각 단계의 할 일을 설계합니다.

규칙:
1. 큰 단계는 일반적으로 다음으로 구성됩니다 (상황에 따라 가감 가능):
   - 기획 (무엇을, 누구를 위해, 어떤 경험)
   - 설계 (기술 아키텍처, 데이터 모델, 핵심 루프)
   - 제작 (에셋·코드·콘텐츠 생산)
   - 통합 (부분들을 하나로 묶기)
   - 테스트·검증 (플레이테스트·버그·사용성)
   - 출시 (배포·공개)
   - 운영·개선 (피드백·반복)
2. 각 단계마다 할 일 2-4개를 나열합니다.
3. 병렬 가능한 리서치(예: 에셋 탐색 + 기술 대안 조사)는 함께 표시하고, 순서 의존이 있는 것(예: 기획이 먼저돼야 설계를 함)은 단계로 순서를 둡니다.
4. prototype → playtest → 수정 루프에 대한 언급을 포함합니다.
5. JSON만 출력합니다. 다른 텍스트 금지.

출력 형식 (JSON만):
{
  "bigPicture": {
    "title": "큰 그림 제목 (24자 이내)",
    "intro": "이 프로젝트의 큰 그림 한 문장",
    "stages": [
      {
        "no": 1,
        "title": "단계 제목 (24자 이내)",
        "desc": "이 단계에서 하는 일 (2-3문장)",
        "icon": "선택 아이콘 이름 (compass, code-xml, palette, flask-conical, rocket 등)",
        "tasks": [
          { "order": 1, "task": "할 일", "why": "이유" }
        ],
        "choices": ["선택지1", "선택지2"]
      }
    ],
    "prototypeLoop": "prototype → playtest → 수정 루프에 대한 한 줄 설명"
  }
}`;

function parseSolarJsonOrText(content, expectJson) {
  const trimmed = content.trim();
  if (expectJson) {
    try {
      return JSON.parse(trimmed);
    } catch {
      const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeMatch) {
        try { return JSON.parse(codeMatch[1].trim()); } catch {}
      }
      const lastBlock = trimmed.split('```').pop()?.trim();
      if (lastBlock) {
        try { return JSON.parse(lastBlock); } catch {}
      }
      throw new Error('Solar 응답이 유효한 JSON이 아닙니다: ' + trimmed.slice(0, 300));
    }
  }
  return trimmed;
}

async function callSolar(messages, temperature = 0.7, maxRetries = 3) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
  const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';

  if (!SOLAR_API_KEY) throw new Error('Solar API key not configured');

  let effectiveMaxRetries = maxRetries;
  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    const res = await fetch(SOLAR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SOLAR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SOLAR_MODEL,
        messages,
        temperature,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const msg = data.choices?.[0]?.message || {};
      // finish_reason이 length면 첫 시도에서만 재시도를 1회로 제한
      if (msg.finish_reason === 'length' && attempt === 0) {
        effectiveMaxRetries = 1;
      }
      const content = msg.content;
      if (!content) throw new Error('Solar 응답이 비어 있습니다');
      return content;
    }

    const errBody = await res.text().catch(() => '');
    const status = res.status;

    // 429 Rate Limit - exponential backoff with retry
    if (status === 429 && attempt < effectiveMaxRetries) {
      console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${effectiveMaxRetries}), 재시연 대기...`);
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }

  throw new Error('Solar API 호출 최대 재시연 횟수 초과');
}

function validateBigPicture(data) {
  if (!data || typeof data !== 'object') throw new Error('bigPicture가 객체가 아닙니다');
  if (!data.bigPicture || typeof data.bigPicture !== 'object') throw new Error('bigPicture.bigPicture가 없습니다');
  const bp = data.bigPicture;
  if (!bp.title || typeof bp.title !== 'string') throw new Error('bigPicture.title이 없습니다');
  if (!Array.isArray(bp.stages) || bp.stages.length === 0) throw new Error('bigPicture.stages가 비어 있습니다');
  for (const s of bp.stages) {
    if (!s.title) throw new Error('stage.title 없음');
    if (!Array.isArray(s.tasks)) throw new Error('stage.tasks 배열 아님: ' + s.title);
    if (!Array.isArray(s.choices)) throw new Error('stage.choices 배열 아님: ' + s.title);
    if (typeof s.no !== 'number') throw new Error('stage.no 없음: ' + s.title);
    if (typeof s.icon !== 'string') throw new Error('stage.icon 없음: ' + s.title);
  }
  return bp;
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
    const { summary, initialQuestion } = body || {};
    if (!summary && !initialQuestion) {
      return new Response(JSON.stringify({ error: 'summary 또는 initialQuestion 필요' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1단계: 큰 그림 생성 (Solar)
    const bigPictureMessages = [
      { role: 'system', content: BIG_PICTURE_SYSTEM },
      {
        role: 'user',
        content: `사용자는 다음 아이디어를 구현하려고 합니다.\n\n[정렬 인터뷰 요약]\n${summary || initialQuestion}\n\n위 아이디어를 바탕으로 큰 그림(stages)과 각 단계의 할 일, 리서치 결과(findings), 선택지를 설계해 주세요. JSON만 출력하세요.`,
      },
    ];

    const bpContent = await callSolar(bigPictureMessages, 0.6);
    const bpData = parseSolarJsonOrText(bpContent, true);
    const bigPicture = validateBigPicture(bpData);

    return new Response(JSON.stringify({
      bigPicture,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('pathfind.js 오류:', err.message);
    return new Response(JSON.stringify({ error: err.message || '서버 오류' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
