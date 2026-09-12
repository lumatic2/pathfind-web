// /api/handoff — handoff 마크다운 최종본
// 계약: docs/api-contract.md §4. 단계 리서치 결과를 모아 최종 handoff 마크다운을 만든다.
// 앱 우측 하단 "handoff 다운로드·복사" 버튼이 이 엔드포인트를 부른다.

const HANDOFF_SYSTEM = `당신은 구현 에이전트로 넘길 "핸드오프 문서" 최종본을 작성하는 작성자입니다.
사용자가 pathfind 정렬 인터뷰 + 큰 그림 + 단계별 리서치를 모두 마친 후,
그 결과를 구현 에이전트(다른 코딩 에이전트)가 바로 이어받을 수 있는 한국어 마크다운 문서로 만듭니다.

규칙:
1. 문서는 한국어로 작성합니다.
2. 다음 섹션을 순서대로 포함합니다:
   - "# 핸드오프 — [프로젝트 제목]"
   - "## 1. 아이디어 요약"
   - "## 2. 큰 그림" (단계 목록 + 각 단계의 핵심 할 일)
   - "## 3. 단계별 리서치 결과" (각 단계 verdict, 찾은 자료, 선택지, todos)
   - "## 4. prototype 루프 조언"
   - "## 5. 다음 액션" (가장 먼저 할 일 1-3개)
   - "## 6. 참고 링크" (전체 자료 링크 모음)
3. 각 자료의 출처 URL은 정확히 옮깁니다. URL이 없는 자료는 "URL: 없음"으로 표기합니다.
4. 없는 정보는 "확인 불가"로 표기합니다. 추정하지 않습니다.
5. 출력 형식: 마크다운 문자열만. 다른 텍스트 금지.
6. bigPicture.title을 문서 제목으로 사용합니다.
`;

function buildMarkdownSection(stageResult) {
  const s = stageResult;
  const lines = [];
  lines.push(`### ${s.no}. ${s.title}`);
  lines.push('');
  lines.push(`- 설명: ${s.desc}`);
  lines.push(`- 판정: **${s.verdict}** — ${s.verdictReason}`);
  lines.push(`- 선택지: ${s.options && s.options.length ? s.options.join(' / ') : '없음'}`);
  lines.push('');
  if (s.findings && s.findings.length) {
    lines.push('**찾은 자료:**');
    for (const f of s.findings) {
      lines.push(`- [${f.name}](${f.url}) (${f.kind})`);
      if (f.evidence) lines.push(`  - ${f.evidence}`);
      if (f.note) lines.push(`  - ${f.note}`);
    }
    lines.push('');
  } else {
    lines.push('**찾은 자료:** 없음 (검색 상한 내 유효한 선례를 못 찾음)');
    lines.push('');
  }
  if (s.todos && s.todos.length) {
    lines.push('**할 일:**');
    for (const t of s.todos) {
      lines.push(`- [${t.owner}] ${t.task}${t.note ? ` (${t.note})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { bigPicture, stages = [], summary = '' } = body || {};

    if (!bigPicture || typeof bigPicture !== 'object') {
      return new Response(
        JSON.stringify({ error: 'bigPicture 필요' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!bigPicture.title) {
      return new Response(
        JSON.stringify({ error: 'bigPicture.title 필요' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // 1. Solar에게 최종 handoff 마크다운 생성을 요청
    const title = bigPicture.title;
    const bigPictureSection = [
      `**큰 그림 제목:** ${title}`,
      "",
      `**한 문장:** ${bigPicture.intro || '확인 불가'}`,
      "",
      "**단계:**",
    ].join('\n');

    const stageSections = stages.map((s) => buildMarkdownSection(s)).join('\n');

    const handoffPrompt = [
      "# 핸드오프 문서 생성 요청",
      "",
      bigPictureSection,
      stageSections,
      "",
      "위 내용을 바탕으로 아래 6개 섹션을 갖춘 한국어 마크다운 문서를 작성하세요:",
      "1. # 핸드오프 — [프로젝트 제목]",
      "2. ## 1. 아이디어 요약",
      "3. ## 2. 큰 그림",
      '4. ## 3. 단계별 리서치 결과 (각 단계 verdict, 찾은 자료, 선택지, todos)',
      "5. ## 4. prototype 루프 조언",
      "6. ## 5. 다음 액션 (가장 먼저 할 일 1-3개)",
      "7. ## 6. 참고 링크 (전체 자료 링크 모음)",
      "",
      "규칙:",
      '- 한국어 작성.',
      '- URL은 정확히 옮기고, 없으면 "URL: 없음"으로 표기.',
      '- 없는 정보는 "확인 불가"로 표기. 추정 금지.',
      '- 마크다운만 출력. 다른 텍스트 금지.',
    ].join('\n');

    const messages = [
      { role: 'system', content: HANDOFF_SYSTEM },
      { role: 'user', content: handoffPrompt },
    ];

    const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
    const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
    const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';

    if (!SOLAR_API_KEY) {
      // 키가 없으면 Solar 호출 없이 구조적 mock을 반환한다 (계약 필드 일치 확인용).
      const mockMarkdown = [
        `# 핸드오프 — ${title}`,
        '',
        '## 1. 아이디어 요약',
        '',
        (summary || '확인 불가'),
        '',
        '## 2. 큰 그림',
        '',
        bigPictureSection,
        '',
        stageSections || '단계 리서치 결과가 아직 없습니다.',
        '',
        '## 3. 단계별 리서치 결과',
        '',
        stageSections || '(아직 채워지지 않음)',
        '',
        '## 4. prototype 루프 조언',
        '',
        (bigPicture.prototypeLoop || '확인 불가'),
        '',
        '## 5. 다음 액션',
        '',
        '- 1. 1단계의 첫 할 일부터 시작하세요.',
        '- 2. 각 단계 리서치 결과를 참고해 가져다 쓸 것과 직접 할 것을 구분하세요.',
        '- 3. prototype → playtest → 수정 루프를 짧게 돌리세요.',
        '',
        '## 6. 참고 링크',
        '',
        '(단계별 findings의 URL 모음 — 아직 수집 전)',
        '',
      ].join('\n');

      return new Response(
        JSON.stringify({
          handoffMarkdown: mockMarkdown,
          title,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    let content;
    try {
      const res = await fetch(SOLAR_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SOLAR_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SOLAR_MODEL,
          messages,
          temperature: 0.6,
          max_tokens: 8192,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Solar API 오류 (${res.status}): ${errBody.slice(0, 300)}`);
      }

      const data = await res.json();
      content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Solar 응답이 비어 있습니다');
    } catch (err) {
      // Solar 호출 실패 시에도 계약 필드를 유지하며 구조적 폴백을 반환한다.
      const mockMarkdown = [
        `# 핸드오프 — ${title}`,
        '',
        '## 1. 아이디어 요약',
        '',
        (summary || '확인 불가'),
        '',
        '## 2. 큰 그림',
        '',
        bigPictureSection,
        '',
        stageSections || '단계 리서치 결과가 아직 없습니다.',
        '',
        '## 3. 단계별 리서치 결과',
        '',
        stageSections || '(아직 채워지지 않음)',
        '',
        '## 4. prototype 루프 조언',
        '',
        (bigPicture.prototypeLoop || '확인 불가'),
        '',
        '## 5. 다음 액션',
        '',
        '- 1. 1단계의 첫 할 일부터 시작하세요.',
        '- 2. 각 단계 리서치 결과를 참고해 가져다 쓸 것과 직접 할 것을 구분하세요.',
        '- 3. prototype → playtest → 수정 루프를 짧게 돌리세요.',
        '',
        '## 6. 참고 링크',
        '',
        '(단계별 findings의 URL 모음 — 아직 수집 전)',
        '',
      ].join('\n');

      return new Response(
        JSON.stringify({
          handoffMarkdown: mockMarkdown,
          title,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Solar 응답에서 마크다운 블록 추출
    const trimmed = content.trim();
    let markdown = trimmed;
    const codeMatch = trimmed.match(/^```(?:markdown)?\s*([\s\S]*?)```$/);
    if (codeMatch) {
      markdown = codeMatch[1].trim();
    } else {
      markdown = trimmed.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    return new Response(
      JSON.stringify({
        handoffMarkdown: markdown,
        title,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('handoff.js 오류:', err.message);
    return new Response(
      JSON.stringify({ error: err.message || '서버 오류' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
