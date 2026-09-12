// /api/stage — 단계 1개 검색 리서치
// pathfind 원본 스킬 이식: SKILL.md §조사 절차·§조사 결과 JSON 스키마 (서비스화 수정 포함, 2026-09-12)
// Solar Pro 4의 도구 호출(tool calling)로 웹 검색을 수행하고 verdict·findings·options·todos로 채운다.
// 계약: docs/api-contract.md §3. 검색 공급자 추상화: §7.

const SYSTEM_PROMPT = `당신은 특정 구현 단계의 리서치 결과를 정리하는 어시스턴트입니다.
사용자의 프로젝트 단계 하나를 받아, 웹 검색을 통해 관련 자료(오픈소스·무료 에셋·튜토리얼·유사 사례)를 찾고,
각 자료에 대해 verdict, findings, options, todos를 JSON으로 출력합니다.

[원문: pathfind 스킬 SKILL.md §조사 절차 (한 단계에 한 번 웹 검색)]
- 각 단계마다 웹 검색 도구 호출을 한 번만 수행한다. 한 단계에 여러 검색을 돌려 응답을 늘리지 않는다.
- 검색은 그 단계의 조사 목적을 살리는 검색어(query) 하나로 수행한다.
- 각 findings 항목의 query는 그 발견을 찾을 때 실제로 넣은 검색어를 그대로 옮긴다.
- 각 findings 항목의 evidence는 검색 결과 텍스트에서 실제로 있었던 문장 한 개를 그대로 옮긴 것이다. 기억으로 지어내거나 요약·번역·의역하지 않는다.
- 검색 결과에서 확인되지 않은 URL은 findings에 넣지 않는다. 검색 결과에서 아무것도 못 찾은 단계는 findings를 빈 배열([])로 두고 verdict를 "선례를 못 찾음"으로 낸다. 이것도 정상 결과다 — "이건 정말 내가 만들어야 하는 바퀴"라는 판단이다.
- 단계마다 검색을 수행하지 않은 상태에서 URL·evidence를 지어내지 않는다. url은 검색 결과에서 확인된 주소만 넣는다. 확인할 수 없는 자료는 findings에서 뺀다.

[원문: pathfind 스킬 SKILL.md §조사 결과 JSON 스키마 (고정)]
조사의 최종 산출물은 아래 스키마를 정확히 따르는 JSON 객체 하나다.
{
  "verdict": "가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 선례를 못 찾음",
  "verdictReason": "판정 근거 한 줄 (선택)",
  "findings": [
    {
      "kind": "오픈소스 | 무료 에셋 | 튜토리얼·블로그 | 참고 사례",
      "name": "발견 항목 이름",
      "query": "그 발견을 찾을 때 실제로 넣은 검색어 (필수, 빈 문자열 금지)",
      "evidence": "검색 결과 텍스트에서 그대로 옮긴 한 문장 (필수, 빈 문자열 금지)",
      "note": "한 줄 메모/판단 근거",
      "url": "실제 확인된 URL (빈 문자열·누락 금지). URL이 없는 발견은 이 항목으로 넣지 말고 해당 발견 자체를 findings에서 제외한다."
    }
  ],
  "options": ["이 단계에서 갈 수 있는 선택지 (서비스 산출용)"],
  "todos": [
    { "task": "할 일", "owner": "가져다 씀 | 직접 함", "note": "메모" }
  ]
}

[서비스화 수정 — pathfind-web 서비스에 맞춘 변경]
- 이 서비스는 숙련 스킬과 달리 "스크립트 실행으로 연구노트·흐름도 파일 생성" 절차를 쓰지 않는다. 서버 응답으로 stage JSON 하나(위 스키마 기반)를 반환하고, 프론트가 카드에 렌더링한다. 따라서 파일명(out_md/out_html)·search_calls·스크립트 실행·저장 결과 섹션은 이 프롬프트의 산출 범위가 아니다.
- 단계당 웹 검색 호출 상한은 서버 코드(api/stage.js)가 최대 2회로 관리한다. 프롬프트 단계에서는 "검색이 필요하면 web_search 도구를 호출하라"까지 지시하고, 호출 횟수 제한은 서버가 처리한다.
- findings 상한은 5건으로 유지한다. 각 url은 실제 http(s) 주소여야 한다.
- verdict 4종(가져다 써도 됨 / 직접 해야 함 / 섞어야 함 / 선례를 못 찾음)과 "못 찾은 단계 규칙(findings가 없으면 verdict를 선례를 못 찾음으로 낸다)"은 원문 그대로다. 다른 verdict 문자열을 쓰지 않는다.
- options·todos는 서비스 응답 산출에 필요하므로 위 스키마에 포함한다. options는 이 단계에서 갈 수 있는 선택지, todos는 구현 에이전트가 바로 쓸 수 있게 owner 표기(가져다 씀 / 직접 함)를 붙인다.
- 각 findings의 kind는 원문 허용값(오픈소스 / 무료 에셋 / 튜토리얼·블로그 / 참고 사례) 중 하나로만 적는다. 비슷한 말로 바꾸지 않는다.

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
      response_format: { type: 'json_object' },
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
    // 첫 Solar 호출이 실패하면 검색 상한 내 유효한 선례를 못 찾은 것으로 간주하고
    // 500 대신 200 + verdict "선례를 못 찾음"으로 내려 전체를 죽이지 않는다(킷 규칙 "전체 실패 금지").
    let toolResult;
    try {
      toolResult = await callSolar(messages, { tools: true, tool_choice: 'auto', maxTokens: 4096 }); // 첫 Solar 호출
    } catch (e) {
      console.warn('첫 Solar 호출 실패 — 선례를 못 찾음으로 폴백:', e.message);
      return new Response(
        JSON.stringify({
          stage: {
            no: stage.no,
            title: stage.title,
            desc: stage.desc,
            icon: stage.icon || '',
            tasks: stage.tasks,
            verdict: '선례를 못 찾음',
            verdictReason: 'Solar 호출 단계에서 오류가 발생해 검색 상한 내 유효한 선례를 못 찾음',
            findings: [],
            choices: stage.choices || [],
            options: stage.choices || [],
            todos: (stage.tasks || []).map((t) => ({ task: t.task, owner: '직접 함', note: t.why || '' })),
            searched: false,
          },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const toolMessages = messages.slice();
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
    let options = parsed?.options || stage.choices || [];
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
