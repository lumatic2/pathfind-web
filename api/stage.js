// /api/stage — 단계 1개 검색 리서치
// Solar Pro 4의 도구 호출(tool calling)로 웹 검색을 수행하고 verdict·findings·options·todos로 채운다.
// 계약: docs/api-contract.md §3. 검색 공급자 추상화: §7.

const SYSTEM_PROMPT = `당신은 특정 구현 단계의 리서치 결과를 정리하는 어시스턴트입니다.
사용자의 프로젝트 단계 하나를 받아, 웹 검색을 통해 관련 자료(오픈소스·무료 에셋·튜토리얼·유사 사례)를 찾고,
각 자료에 대해 verdict, findings, options, todos를 JSON으로 출력합니다.

출력 형식 (JSON만, 다른 텍스트 금지):
{
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
  "options": ["이 단계에서 갈 수 있는 선택지"],
  "todos": [
    { "task": "할 일", "owner": "가져다 씀 | 직접 함", "note": "메모" }
  ]
}

규칙:
- verdict 4종은 고정 값입니다. 다른 값을 쓰지 마세요.
- findings는 최소 0건, 각 url은 실제 http(s) 주소여야 합니다.
- 검색이 필요하면 web_search 도구를 호출하세요. 도구 없이도 답변할 수 있으면 바로 JSON을 출력합니다.
- 검색 결과는 최대 5건까지 findings에 담습니다.
- 답변에는 마크다운이나 설명 텍스트를 쓰지 말고 JSON만 출력하세요.
`;

const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: '웹에서 관련 자료를 검색합니다. 검색어 하나를 받아 결과 목록을 반환합니다.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어. 구체적이고 자연스럽게 작성하세요.' },
      },
      required: ['query'],
    },
  },
};

function parseSolarJson(content) {
  const trimmed = content.trim();
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
    throw new Error('Solar 응답이 유효한 JSON이 아닙니다: ' + trimmed.slice(0, 200));
  }
}

async function callSolar(messages, { tools = false, tool_choice = 'auto', maxTokens = 2048 } = {}) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
  const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';

  if (!SOLAR_API_KEY) throw new Error('Solar API key not configured');

  const res = await fetch(SOLAR_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SOLAR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: SOLAR_MODEL,
      messages,
      ...(tools ? { tools: [WEB_SEARCH_TOOL], tool_choice } : {}),
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Solar API 오류 (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  return {
    content: msg.content,
    toolCalls: msg.tool_calls,
  };
}

async function searchWeb(query) {
  // 검색 공급자 추상화: env SEARCH_API_URL + SEARCH_API_KEY 로 추상화(§7).
  // 기본 요청 형식은 Tavily 계열. 공급자 교체 시 이 함수의 요청 형식만 바꾼다.
  const key = process.env.SEARCH_API_KEY;
  if (!key) throw new Error('SEARCH_API_KEY not configured');

  const url =
    process.env.SEARCH_API_URL || 'https://api.tavily.com/search';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, api_key: key, max_results: 3 }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`검색 API 오류 (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  // Tavily 응답 형식: { results: [{ title, url, content, ... }] }
  // 다른 공급자 사용 시 data.results 가 아닌 다른 경로를 읽도록 조정한다.
  return data.results || [];
}

function buildFindingsFromSearchResults(results, query) {
  return results
    .map((r) => ({
      kind: guessKind(r),
      name: r.title || `검색 결과`,
      query: query || '',
      evidence: (r.content || '').slice(0, 200) || '',
      note: '',
      url: r.url || '',
    }))
    .filter((f) => f.url && f.url.startsWith('http'));
}

function guessKind(r) {
  const u = (r.url || '').toLowerCase();
  if (u.includes('github.com') || u.includes('gitlab.com') || u.includes('sourceforge.net'))
    return '오픈소스';
  if (
    u.includes('freepik') ||
    u.includes('asset') ||
    u.includes('icon') ||
    u.includes('font') ||
    u.includes('unsplash') ||
    u.includes('pexels')
  )
    return '무료 에셋';
  if (
    u.includes('blog') ||
    u.includes('tutorial') ||
    u.includes('guide') ||
    u.includes('medium.com') ||
    u.includes('dev.to')
  )
    // 위 리터럴은 예시. 실제 판정 규칙은 나중에 다듬는다.
    return '튜토리얼·블로그';
  return '참고 사례';
}

function determineVerdict(findings) {
  if (findings.length === 0) return '선례를 못 찾음';
  return '가져다 써도 됨';
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  if (!process.env.SOLAR_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Solar API key not configured' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { stageIndex, stage, summary } = body;

    if (!stage || !stage.title) {
      return new Response(
        JSON.stringify({ error: 'stage.title 필요' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    // --- 1회차: Solar에게 검색 지시 (도구 호출 유도) ---
    const prompt = `다음 프로젝트 단계의 자료를 웹 검색으로 찾아주세요.

[프로젝트 요약]
${summary || ''}

[단계]
번호: ${stage.no}
제목: ${stage.title}
설명: ${stage.desc}
할 일:
${stage.tasks?.map((t) => `- ${t.order}. ${t.task} (${t.why})`).join('\n') || '없음'}
선택지: ${stage.choices?.join(', ') || '없음'}

위 단계의 실현을 도울 수 있는 오픈소스·무료 에셋·튜토리얼·유사 사례를 검색하세요.
검색이 필요하면 web_search 도구를 호출하세요.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    // --- 도구 호출 처리 (상한 2회) ---
    // messages를 누적하면서 도구 호출 → 결과 피드백 → 다음 Solar 호출을 반복한다.
    // Solar가 한 응답에 여러 tool_call을 주거나, follow-up 응답에 다시 tool_call을 주는
    // 경우 모두 처리. 상한 2회면 중단.
    const toolMessages = messages.slice(); // 도구 응답을 누적할 메시지 버퍼
    let toolResult = result; // 현재 Solar 응답
    let toolCallCount = 0;
    const searchedQueries = [];

    while (toolCallCount < 2) {
      const tcs = toolResult.toolCalls;
      if (!tcs?.length) break;

      const tc = tcs[0];
      if (!tc || tc.function?.name !== 'web_search') break;

      try {
        const args = JSON.parse(tc.function.arguments || '{}');
        const q = args.query || '';
        if (!q) break;

        const searchResults = await searchWeb(q);
        searchedQueries.push(q);
        toolCallCount++;

        // 도구 결과 메시지를 버퍼에 누적
        toolMessages.push(
          { role: 'assistant', content: null, tool_calls: tcs },
          {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(
              searchResults.map((r) => ({
                title: r.title,
                url: r.url,
                content: r.content,
              })),
            ),
          },
        );

        // 도구 결과 반영 후 다시 Solar 호출
        toolResult = await callSolar(toolMessages, { tools: false, maxTokens: 4096 });
      } catch (e) {
        console.warn('검색 도구 실행 중 오류:', e.message);
        break;
      }
    }

    const finalResult = toolResult;

    // --- 최종 응답 파싱 ---
    let parsed = null;
    if (finalResult.content) {
      try {
        parsed = parseSolarJson(finalResult.content);
      } catch (e) {
        console.warn('최종 JSON 파싱 실패, 폴백:', e.message);
      }
    }

    // findings 구성: Solar findings + 검색 결과 병합
    const solarFindings = parsed?.findings || [];
    let findings = solarFindings.filter((f) => f.url && f.url.startsWith('http'));

    // 검색 결과에서 추가 (중복 제거: url 기준)
    if (searchedQueries.length && finalResult.content) {
      // 검색 결과는 tool 피드백 시점에 이미 확보. 여기서는 Solar가 검색 결과 기반으로
      // 생성한 findings를 우선하고, 빠진 검색 결과를 보충한다.
      const existingUrls = new Set(findings.map((f) => f.url));
      // 마지막 tool 결과 메시지는 messages에 들어있으나, 검색 결과 원데이터를 별도로
      // 보관하지 않았으므로, 재검색하지 않는다. Solar가 결과에 포함했을 것으로 신뢰.
    }

    // findings 상한 5건
    findings = findings.slice(0, 5);

    // verdict
    const verdict = parsed?.verdict || determineVerdict(findings);
    const verdictReason =
      parsed?.verdictReason || (findings.length ? '검색 자료 확인' : '검색 상한 내 유효한 선례를 못 찾음');

    // options / todos
    const options = parsed?.options || stage.choices || [];
    let todos = (parsed?.todos || []).map((t) => ({
      task: t.task,
      owner: t.owner === '직접 함' ? '직접 함' : '가져다 씀',
      note: t.note || '',
    }));

    // findings가 없으면 tasks 기반 기본 todos (직접 함 추정)
    if (todos.length === 0 && findings.length === 0) {
      for (const t of stage.tasks) {
        todos.push({ task: t.task, owner: '직접 함', note: t.why || '' });
      }
    }

    todos = todos.slice(0, 5);
    options = options.slice(0, 5);

    return new Response(
      JSON.stringify({
        stage: {
          no: stage.no,
          title: stage.title,
          desc: stage.desc,
          icon: stage.icon || '',
          tasks: stage.tasks,
          verdict,
          verdictReason,
          findings,
          choices: stage.choices || [],
          options,
          todos,
          searched: true,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('stage.js 오류:', err.message);
    return new Response(
      JSON.stringify({ error: err.message || '서버 오류' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
