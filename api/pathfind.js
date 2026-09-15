import { sendError, logCall } from './_lib/http.js';

// 긴 프롬프트는 별도 상수로 분리 (가독성)
// pathfind 원본 스킬 이식: SKILL.md §단계 분해 (서비스화 수정 포함, 2026-09-12)

const BIG_PICTURE_SYSTEM = `당신은 무언가를 만들려는 사람을 위한 "큰 그림 설계자"입니다.
사용자가 pathfind 정렬 인터뷰를 마친 후, 그 아이디어를 실제로 구현하기 위한 큰 단계와 각 단계의 할 일을 설계합니다.

[원문: pathfind 스킬 SKILL.md §단계 분해]
- 단계 수는 주제에 맞게 4~7개 사이에서 정한다. 작은 일은 4개, 큰 일은 7개까지.
- 단계 제목은 카드 한 줄에 들어가도록 한글 기준 24자 이내로 적는다.
- 단계 분해는 만드는 일을 실제로 하는 일 순서대로 나눈다. 예를 들어 "방향 정하기 → 설계 → 구현 → 검증 → 배포"처럼, 각 단계가 실제로는 손이 가는 작업 단위가 되도록 나눈다.

[서비스화 수정 — pathfind-web 서비스에 맞춘 변경]
- 이 서비스의 /api/pathfind는 큰 그림(bigPicture.title·intro·stages[])과 prototypeLoop만 반환하고, 각 단계의 verdict·findings·choices·tasks 상세는 이후 /api/stage 호출에서 채운다(§2 계약). 따라서 bigPicture.stages[]에는 verdict/findings를 넣지 않고, no·title·desc·icon·tasks·choices만 담는다.
- stages[] 각 원소는 §2 계약의 bigPicture.stages 스키마를 정확히 따른다: no(number), title(string 24자 이내), desc(string 2-3문장), icon(string, 단계에 맞는 아이콘 이름), tasks([{order, task, why}]), choices([string]).
- tasks는 단계당 2~4개로 채운다(원문 "2~3개"보다 서비스 밀도에 맞춰 2~4개로 운용). 각 task는 order(number, 1부터), task(string 한 줄), why(string 한 줄)로 구성한다.
- desc는 그 단계에서 하는 일의 핵심 문장 2~3개로 쓴다. 각 문장은 짧고 독립적으로 쓴다.
- 큰 그림 생성 후에는 "prototype → playtest → 수정 루프" 언급을 prototypeLoop 한 줄(또는 intro/공정 설명)에 포함한다.
- JSON만 출력한다. 다른 텍스트 금지.

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
    "intro": "이 프로젝트의 큰 그림 한 문장입니다. 사람에게 처음 말을 거는 자리이므로 입니다/합니다로 끝냅니다. 바로 아래 단계 설명도 존댓말로 이어집니다. 금지문 대신 이렇게 하라고 알려 주는 편이 더 잘 지켜집니다.",
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
      logCall('pathfind.retry', 0, status, {});
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
    return sendError(405, 'Method not allowed');
  }

  if (!process.env.SOLAR_API_KEY) {
    return sendError(500, 'Solar API key not configured');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { summary, initialQuestion } = body || {};
    if (!summary && !initialQuestion) {
      return sendError(400, 'summary 또는 initialQuestion 필요');
    }

    // 1단계: 큰 그림 생성 (Solar)
    const bigPictureMessages = [
      { role: 'system', content: BIG_PICTURE_SYSTEM },
      {
        role: 'user',
        content: `사용자는 다음 아이디어를 구현하려고 합니다.\n\n[정렬 인터뷰 요약]\n${summary || initialQuestion}\n\n위 아이디어를 바탕으로 큰 그림(stages)과 각 단계의 할 일, 선택지(골격)를 설계해 주세요. bigPicture.stages[]에는 verdict·findings를 넣지 말고, 각 단계는 no·title·desc·icon·tasks·choices만 담으세요. JSON만 출력하세요.`,
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
    logCall('pathfind.POST', 0, 500, request.headers);
    return sendError(500, '서버 오류');
  }
}
