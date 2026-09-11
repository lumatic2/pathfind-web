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
3. 각 단계마다 "이미 있는 것(오픈소스·무료 에셋·튜토리얼·유사 사례)"과 "직접 해야 하는 것"을 구분해 제시합니다.
4. 각 단계마다 참고 링크(URL)를 1-3개 포함시킵니다. URL은 유효해 보이는 실제 주소를 제시하되, 확인된 것만 확실하다고 하지 말고 "참고 후보"로 제시합니다.
5. 병렬 가능한 리서치(예: 에셋 탐색 + 기술 대안 조사)는 함께 표시하고, 순서 의존이 있는 것(예: 기획이 먼저돼야 설계를 함)은 단계로 순서를 둡니다.
6. prototype → playtest → 수정 루프에 대한 언급을 포함합니다.
7. JSON만 출력합니다. 다른 텍스트 금지.

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
        "verdict": "가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 선례를 못 찾음",
        "verdictReason": "판정 근거 한 줄",
        "findings": [
          {
            "kind": "오픈소스 | 무료 에셋 | 튜토리얼·블로그 | 참고 사례",
            "name": "자료 이름",
            "query": "이 자료를 찾는 데 쓴 검색어",
            "evidence": "근거 문장 한 줄",
            "note": "한 줄 메모",
            "url": "URL (빈 문자열 금지)"
          }
        ],
        "choices": ["선택지1", "선택지2"]  // 이 단계에서 갈 수 있는 선택 branch
      }
    ],
    "prototypeLoop": "prototype → playtest → 수정 루프에 대한 한 줄 설명"
  }
}`;

const HANDOFF_SYSTEM = `당신은 구현 에이전트로 넘길 "핸드오프 문서"를 작성하는 작성자입니다.
사용자가 pathfind 정렬 인터뷰 + 큰 그림·단계 리서치를 마친 후, 그 결과를 구현 에이전트(다른 코딩 에이전트)가 이어받을 수 있는 마크다운 문서로 만듭니다.

규칙:
1. 문서는 한국어로 작성합니다.
2. 다음 섹션을 포함합니다:
   - "# 핸드오프 — [프로젝트 제목]"
   - "## 1. 아이디어 요약" (사용자의 정리된 아이디어)
   - "## 2. 큰 그림" (단계 목록 + 각 단계의 핵심 할 일)
   - "## 3. 단계별 리서치 결과" (각 단계의 verdict, 찾은 자료, 선택지)
   - "## 4. prototype 루프 조언"
   - "## 5. 다음 액션" (가장 먼저 할 일 1-3개)
   - "## 6. 참고 링크" (전체 자료 링크 모음)
3. 각 자료의 출처 URL은 정확히 옮깁니다.
4. 없는 정보는 "확인 불가"로 표기합니다.
5. 추정하지 않습니다.

출력 형식: 마크다운 문자열만. 다른 텍스트 금지.`;

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

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
        max_tokens: 4096,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Solar 응답이 비어 있습니다');
      return content;
    }

    const errBody = await res.text().catch(() => '');
    const status = res.status;

    // 429 Rate Limit - exponential backoff with retry
    if (status === 429 && attempt < maxRetries) {
      console.warn(`Solar 429 rate limit (시도 ${attempt + 1}/${maxRetries}), 재시연 대기...`);
      // 지수 백오프: 1초, 2초, 4초
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
    if (!s.verdict) throw new Error('stage.verdict 없음: ' + s.title);
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

    // 2단계: handoff.md 생성 (Solar)
    const handoffPrompt = `# 핸드오프 문서 생성\n\n아래 큰 그림 데이터를 바탕으로 구현 에이전트가 이어받을 수 있는 마크다운 핸드오프 문서를 작성해 주세요.\n\n[큰 그림 데이터]\n${JSON.stringify(bigPicture, null, 2)}\n\n마크다운만 출력하세요. 다른 텍스트 금지.`;
    const handoffMessages = [
      { role: 'system', content: HANDOFF_SYSTEM },
      { role: 'user', content: handoffPrompt },
    ];
    const handoffContent = await callSolar(handoffMessages, 0.6);

    // 3단계: handoff 텍스트를 마크다운으로 정리 (Solar가 준 그대로)
    const handoffMarkdown = handoffContent.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/, '').trim();

    return new Response(JSON.stringify({
      bigPicture,
      handoffMarkdown,
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
