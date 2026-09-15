// /api/handoff — handoff 마크다운 최종본
// 계약: docs/api-contract.md §4. 단계 리서치 결과를 모아 최종 handoff 마크다운을 만든다.
// 앱 우측 하단 "handoff 다운로드·복사" 버튼이 이 엔드포인트를 부른다.
//
// M08 스텝1: 응답 마크다운 판정 → 재시도 → 직접 조립 경로 추가.
//   - 응답 본문이 제목 기호로 시작하지 않거나 200자 미만이면 한 번 재시도.
//   - 재시도 후에도 실패하면 단계 데이터로 서버가 직접 조립.
//   - 응답 헤더 x-handoff-source: solar | retry | assembled.
//   - 요청 헤더 x-handoff-force: json → 모델 응답을 짧은 성공 표시 문자열로 강제(시험용).

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

// 마크다운 본문 판정: 양끝 공백 제거 후 제목 기호로 시작하고 200자 이상.
function isValidHandoffMarkdown(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 200) return false;
  if (!t.startsWith('#')) return false;
  return true;
}

// 판정 4종 → 화면·출력 문구 (계약 값은 저장·비교에 그대로 쓰고, 표시만 바꾼다)
// chat.js와 동일한 표. 가져다 써도 됨 → 이미 있음, 직접 해야 함 → 없음,
// 섞어야 함 → 일부만 있음, 선례를 못 찾음 → 못 찾음.
const VERDICT_LABELS = {
  '가져다 써도 됨': '이미 있음',
  '직접 해야 함': '없음',
  '섞어야 함': '일부만 있음',
  '선례를 못 찾음': '못 찾음',
};

// 단계 데이터에서 마크다운 섹션 하나 조립.
function buildMarkdownSection(stageResult) {
  const s = stageResult;
  if (!s) return '';
  const lines = [];
  const verdict = s.verdict || '확인 불가';
  lines.push(`### ${s.no}. ${s.title} — ${VERDICT_LABELS[verdict] ?? verdict}`);
  lines.push('');
  lines.push(`- 설명: ${s.desc || '확인 불가'}`);
  lines.push(`- 판정 근거: ${s.verdictReason || '확인 불가'}`);
  lines.push('');
  if (s.findings && s.findings.length) {
    lines.push('**찾은 자료:**');
    for (const f of s.findings) {
      if (!f || !f.name) continue;
      const url = f.url || '';
      lines.push(`- [${f.name}](${url || 'URL: 없음'})`);
      if (f.evidence) lines.push(`  - ${f.evidence}`);
      if (f.note) lines.push(`  - ${f.note}`);
    }
    lines.push('');
  } else {
    lines.push('**찾은 자료:** 없음 (조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다)');
    lines.push('');
  }
  if (s.todos && s.todos.length) {
    lines.push('**할 일:**');
    for (const t of s.todos) {
      if (!t || !t.task) continue;
      lines.push(`- [${t.owner || '직접 함'}] ${t.task}${t.note ? ` (${t.note})` : ''}`);
    }
    lines.push('');
  }
  if (s.choices && s.choices.length) {
    lines.push('**선택지:**');
    s.choices.forEach((c, i) => {
      if (c) lines.push(`${i + 1}. ${c}`);
    });
    lines.push('');
  }
  return lines.join('\n');
}

// 단계 데이터로 handoff 마크다운을 직접 조립.
function assembleHandoff(bigPicture, stages) {
  const title = bigPicture && bigPicture.title ? bigPicture.title : '로드맵';
  const intro = bigPicture && bigPicture.intro ? bigPicture.intro : '확인 불가';
  const prototypeLoop = bigPicture && bigPicture.prototypeLoop ? bigPicture.prototypeLoop : '확인 불가';

  const parts = [];
  parts.push(`# 핸드오프 — ${title}`);
  parts.push('');
  parts.push(intro);
  parts.push('');

  // 단계 절
  const validStages = (stages || []).filter((s) => s && typeof s === 'object');
  for (const s of validStages) {
    parts.push(buildMarkdownSection(s));
  }
  if (validStages.length === 0) {
    parts.push('단계 리서치 결과가 아직 없습니다.');
    parts.push('');
  }

  // 프로토타입 루프 절
  parts.push('## prototype 루프');
  parts.push('');
  parts.push(prototypeLoop);
  parts.push('');

  return parts.join('\n');
}

function computeMaxTokens(bodyText, stageCount) {
  // 입력 크기에 맞춰 넉넉히 잡는다. 7단계 기준 응답 약 20KB를 감당할 정도.
  const base = 8192;
  const stageAllowance = stageCount * 1200;
  const bodyAllowance = Math.ceil(bodyText.length / 3);
  return Math.max(base, Math.min(20000, base + stageAllowance + bodyAllowance));
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

    const title = bigPicture.title;

    // 요청 헤더에서 시험 스위치 확인
    const forceMode = request.headers.get('x-handoff-force');
    const forceJson = forceMode === 'json';

    // 큰 그림 섹션 텍스트
    const bigPictureSection = [
      `**큰 그림 제목:** ${title}`,
      '',
      `**한 문장:** ${bigPicture.intro || '확인 불가'}`,
      '',
      '**단계:**',
    ].join('\n');

    const stageSections = stages.map((s) => buildMarkdownSection(s)).join('\n');

    const handoffPrompt = [
      '# 핸드오프 문서 생성 요청',
      '',
      bigPictureSection,
      stageSections,
      '',
      '위 내용을 바탕으로 아래 6개 섹션을 갖춘 한국어 마크다운 문서를 작성하세요:',
      '1. # 핸드오프 — [프로젝트 제목]',
      '2. ## 1. 아이디어 요약',
      '3. ## 2. 큰 그림',
      '4. ## 3. 단계별 리서치 결과 (각 단계 verdict, 찾은 자료, 선택지, todos)',
      '5. ## 4. prototype 루프 조언',
      '6. ## 5. 다음 액션 (가장 먼저 할 일 1-3개)',
      '7. ## 6. 참고 링크 (전체 자료 링크 모음)',
      '',
      '규칙:',
      '- 한국어 작성.',
      '- URL은 정확히 옮기고, 없으면 "URL: 없음"으로 표기.',
      '- 없는 정보는 "확인 불가"로 표기. 추정 금지.',
      '- 마크다운만 출력. 다른 텍스트 금지.',
      '- 출력의 첫 줄은 반드시 "#"으로 시작하는 제목 형식이어야 합니다.',
      '- 마크다운 본문은 제목 기호로 시작하고 전체 길이가 200자 이상이어야 합니다.',
    ].join('\n');

    const messages = [
      { role: 'system', content: HANDOFF_SYSTEM },
      { role: 'user', content: handoffPrompt },
    ];

    const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
    const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
    const SOLAR_MODEL = process.env.SOLAR_MODEL || 'solar-pro4';

    const maxTokens = computeMaxTokens(handoffPrompt, stages.length);

    // Solar 호출 없이 직접 조립하는 폴백 (키 없음 / 호출 실패 / 형식 실패).
    function buildFallbackMarkdown() {
      return assembleHandoff(bigPicture, stages);
    }

    // Solar 호출 없이 키 없음 폴백
    if (!SOLAR_API_KEY) {
      const markdown = buildFallbackMarkdown();
      return new Response(
        JSON.stringify({ handoffMarkdown: markdown, title }),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-handoff-source': 'assembled',
          },
        }
      );
    }

    // Solar 호출 → 판정 → 재시도 → 조립
    let content;
    let lastError;
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
          max_tokens: maxTokens,
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
      lastError = err;
      content = null;
    }

    // 시험용 스위치: 모델 응답을 짧은 성공 표시 문자열로 강제 → 조립 경로 확정.
    if (forceJson) {
      content = 'OK';
    }

    // 마크다운 추출 + 판정 → 통과하면 solar 반환.
    let source = 'solar';
    let markdown = extractMarkdown(content);

    if (isValidHandoffMarkdown(markdown)) {
      return new Response(
        JSON.stringify({ handoffMarkdown: markdown, title }),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-handoff-source': source,
          },
        }
      );
    }

    // 통과 못 함 → 한 번 재시도. 같은 요청에 마크다운 문서만 내놓으라는 지시와
    // 첫 줄은 제목 형식으로 하라는 지시를 덧붙인다.
    source = 'retry';
    const retryPrompt = handoffPrompt + '\n\n[MANDATORY] 위 내용을 바탕으로 한국어 마크다운 문서만 출력하세요.\n- 다른 텍스트·설명·JSON·전후 맥락 금지.\n- 출력의 첫 줄은 반드시 "#"으로 시작하는 제목 형식이어야 합니다.\n- 마크다운 본문은 제목 기호로 시작하고 200자 이상이어야 합니다.\n- 코드 블록으로 감싸지 말고 마크다운 원문만 출력하세요.';

    const retryMessages = [
      { role: 'system', content: HANDOFF_SYSTEM },
      { role: 'user', content: retryPrompt },
    ];

    try {
      const res = await fetch(SOLAR_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SOLAR_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SOLAR_MODEL,
          messages: retryMessages,
          temperature: 0.6,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Solar 재시도 API 오류 (${res.status}): ${errBody.slice(0, 300)}`);
      }

      const data = await res.json();
      const retryContent = data.choices?.[0]?.message?.content;
      if (!retryContent) throw new Error('Solar 재시도 응답이 비어 있습니다');
      markdown = extractMarkdown(retryContent);

      if (isValidHandoffMarkdown(markdown)) {
        return new Response(
          JSON.stringify({ handoffMarkdown: markdown, title }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-handoff-source': source,
            },
          }
        );
      }
    } catch (err) {
      // 재시도 실패는 조용히 조립 경로로 넘긴다.
    }

    // 재시도 후에도 실패 → 서버가 모델 없이 단계 데이터로 직접 조립.
    const assembled = buildFallbackMarkdown();
    return new Response(
      JSON.stringify({ handoffMarkdown: assembled, title }),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-handoff-source': 'assembled',
        },
      }
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

// Solar 응답 콘텐츠에서 마크다운 텍스트를 추출.
function extractMarkdown(content) {
  if (typeof content !== 'string') return '';
  const trimmed = content.trim();
  if (!trimmed) return '';

  // JSON 응답에서 마크다운 추출 (response_format: json_object)
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      // 여러 필드 중 가장 긴 문자열 필드를 마크다운 후보로 사용
      const candidates = [];
      for (const key of Object.keys(parsed)) {
        const val = parsed[key];
        if (typeof val === 'string' && val.trim().length > 50) {
          candidates.push(val);
        }
      }
      if (candidates.length) {
        trimmed = candidates.reduce((a, b) => (a.length >= b.length ? a : b));
      } else {
        trimmed = '';
      }
    }
  } catch {
    // JSON 파싱 실패 → 원문 유지
  }

  // 코드 블록 처리
  const codeMatch = trimmed.match(/^```(?:markdown)?\s*([\s\S]*?)```$/);
  if (codeMatch) {
    return codeMatch[1].trim();
  }
  return trimmed.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
}
