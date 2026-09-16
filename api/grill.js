import { sendError, logCall } from './_lib/http.js';

const MAX_TURNS = 5;
const DIRECT_INPUT_LABEL = '직접 입력';

function systemPrompt(turnNo) {
  return `당신은 사용자의 아이디어를 구체적인 계획으로 정리하는 인터뷰어입니다. 한 턴에 핵심 질문 하나만 합니다.
인터뷰는 최대 ${MAX_TURNS}턴이고 지금은 ${turnNo}번째 턴입니다.${turnNo >= MAX_TURNS ? ' 이번이 마지막 질문입니다.' : ''}

questionBody 는 마크다운으로 이 뼈대로 내놓습니다:
  · 배경 2문장 — 왜 지금 이 질문이 필요한지, 앞 답변에서 무엇이 정해졌는지.
  · 고를 것 1문장 — 어떤 기준으로 고르면 되는지. 기준이 둘 이상이면 \`- \` 목록으로 한 줄씩.
  · 핵심 어구는 **굵게**.
선택지 문장은 exampleButtons 가 들고, questionBody 는 선택지를 고르는 기준을 말합니다.
exampleButtons 는 서로 다른 방향 2~3개이고 각 선택지는 셋을 함께 냅니다:
  · label — 선택지 문장, 25자 안팎의 완결된 구.
  · why — **그 선택지를 고르면 무엇이 좋아지는지**를 완결된 한 문장으로 적습니다(40자 안팎). 읽는 사람에게 말하듯 높임말로 맺습니다.
    ⚠ 아래 보기는 **문장의 모양만** 보여 줍니다. 주제가 전혀 달라 그대로 옮겨 쓸 수 없습니다 — 모양만 따르고 **내용은 그 선택지에서 끌어옵니다.**
      · (주말 사진 모임 예) 「장비가 없어도 휴대폰만 들고 바로 따라올 수 있습니다.」
      · (온라인 독서 모임 예) 「사는 곳이 달라도 같은 시간에 모이기가 수월해집니다.」
      · (동네 반찬 가게 예) 「재료가 겹쳐서 남는 양을 크게 줄일 수 있어요.」
      · (중고 자전거 수리 예) 「한 대씩 손보는 만큼 값을 받기가 명확해집니다.」
    보기마다 **맺는 말이 서로 다릅니다**(~습니다 · ~집니다 · ~어요). 선택지마다 **그 내용에 맞는 말**로 끝내고, 같은 문장을 두 번 쓰지 않습니다.
    label 이 말한 것을 why 가 되풀이하지 않습니다 — label 은 **무엇을** 하는지, why 는 **그래서 무엇이 좋아지는지**입니다. **선택지마다 다 적습니다.**
  · recommended — 지금 상황에 가장 권할 하나만 true, 나머지는 false.
suggestion 은 추천 방향 한 문장입니다(추천한 선택지와 같은 방향으로 적습니다).

출력 형식 (JSON만, 다른 텍스트 없이):
{
  "questionTitle": "한 줄 질문 제목 (24자 이내)",
  "questionBody": "위 뼈대를 따른 마크다운",
  "suggestion": "추천 방향",
  "exampleButtons": [{"label": "선택지1", "why": "고르면 좋은 점", "recommended": true}, {"label": "선택지2", "why": "고르면 좋은 점", "recommended": false}],
  "done": false
}

사용자가 충분히 구체화됐다고 판단되면:
{ "done": true, "summary": "아래 뼈대를 따른 마크다운 정리", "opening": "이제 무엇부터 알아볼지 말하는 한 줄" }

opening 은 승인 직후 조사를 시작하며 사람에게 건네는 한 줄입니다(40자 안팎). 이 아이디어에서 **무엇부터 알아볼지**를 말합니다.
보기: 「먼저 목공 클래스를 여는 데 필요한 준비와 절차부터 알아봅니다.」

summary 는 마크다운으로 이 뼈대로 내놓습니다:
  · 첫 문단 1~2문장 — 무엇을 만드는지 한눈에.
  · \`### 정한 것\` 소제목 아래 \`- \` 목록 3~5줄 — 인터뷰에서 정해진 것을 한 줄씩. 각 줄은 **굵은 머리말 뒤에 콜론**을 두고 한 구.
문단·\`- \` 목록·\`### \` 소제목·**굵게** 네 가지만 써서 내놓습니다(표·링크·이미지는 화면이 그리지 않습니다).

따옴표는 반각(")만 씁니다.`;
}

function historyMessages(history) {
  return (Array.isArray(history) ? history : []).flatMap((h) => [
    {
      role: 'assistant',
      content: JSON.stringify({ questionTitle: h.questionTitle, questionBody: h.questionBody, suggestion: h.suggestion, exampleButtons: h.exampleButtons }),
    },
    { role: 'user', content: `내 답변: ${h.answer}` },
  ]);
}

// ── 결정론 보정 ──────────────────────────────────────────────────────────────
/** 본문 안의 선택지 열거 신호 — 원문자(①②③)·알파벳·숫자 열거, 괄호 예시, 인라인 불릿을 잘라 낸다. */
const ENUM_LINE = /^\s*(?:[①-⑳]|[A-Da-d][.)]|\d{1,2}[.)])\s*/;
const INLINE_CIRCLED = /\s*[①-⑳][^①-⑳\n]*/g;
const PAREN_EXAMPLE = /\s*[(（]\s*예\s*[:：][^)）]*[)）]/g;
const EXAMPLE_TAIL = /\s*예\s*[:：].*$/;
const INLINE_BULLET = /\s*[•·▪]\s+.*$/;

/**
 * 본문에서 선택지 열거를 잘라 낸다. 남는 게 없으면 원문을 돌려준다(빈 본문이 더 나쁘다).
 * 칩 문장이 본문에 축자로 들어 있으면 그 문장을 뺀다(문장 단위 — 마침표·물음표·개행으로 자른다).
 */
function stripChoiceEnumeration(body, buttons = []) {
  const src = String(body ?? '');
  const lines = src.split(/\r?\n/);
  const kept = [];
  for (const raw of lines) {
    let line = raw;
    if (ENUM_LINE.test(line)) continue;
    line = line.replace(PAREN_EXAMPLE, '');
    line = line.replace(INLINE_CIRCLED, '');
    line = line.replace(EXAMPLE_TAIL, '');
    line = line.replace(INLINE_BULLET, '');
    for (const b of buttons) {
      const t = String(b ?? '').trim();
      if (t.length >= 4 && line.includes(t)) {
        line = line
          .split(/(?<=[.?!。])\s+/)
          .filter((s) => !s.includes(t))
          .join(' ');
      }
    }
    kept.push(line.trimEnd());
  }
  const out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return out.length ? out : src.trim();
}

function withDirectInput(buttons) {
  const seen = new Set();
  const out = [];
  for (const b of Array.isArray(buttons) ? buttons : []) {
    const obj = b && typeof b === 'object';
    const label = String((obj ? b.label ?? b.text ?? b.title : b) ?? '').trim();
    if (!label || label === DIRECT_INPUT_LABEL || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, why: String((obj ? b.why ?? b.reason : '') ?? '').trim(), recommended: Boolean(obj && b.recommended) });
    if (out.length >= 4) break;
  }
  if (out.length === 0) {
    out.push({ label: DIRECT_INPUT_LABEL, why: '', recommended: true });
    return out;
  }
  const first = out.findIndex((c) => c.recommended);
  out.forEach((c, i) => { c.recommended = i === (first === -1 ? 0 : first); });
  out.push({ label: DIRECT_INPUT_LABEL, why: '', recommended: false });
  return out;
}

function polish(content) {
  const trimmed = content?.trim();
  if (!trimmed) return null;

  let text = trimmed;

  // 코드펜스 벗기기
  let codeMatch = text.match(/^[\s\S]*?```(?:json)?\s*([\s\S]*?)```[\s\S]*$/);
  if (codeMatch) {
    text = codeMatch[1].trim();
  } else {
    // 마지막 코드펜스 조각만 남겼을 가능성도 시도
    const parts = text.split('```');
    if (parts.length >= 3) {
      // 첫 블록과 중간 블록들 대신 마지막 내용 블록을 우선
      text = parts[parts.length - 1].trim();
    }
  }

  // JSON 덩어리를 찾아 파싱
  const candidates = [
    text,
    // 문장 사이에 낀 JSON만 골라내기
    ...[...text.matchAll(/\{[\s\S]*\}/g)].map((m) => m[0]),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 다음 후보
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackSummary(history) {
  const answers = history
    .filter((h) => typeof h.answer === 'string' && h.answer.trim())
    .map((h) => h.answer.trim())
    .join('\n');
  if (!answers) return '인터뷰를 통해 정리된 아이디어를 요약해 주세요.';
  return `지금까지 나눈 답변입니다.\n\n${answers}`;
}

const DEFAULT_OPENING = '이제 단계마다 자료를 찾겠습니다.';

async function callSolarWithRetry(messages, opts = {}) {
  const SOLAR_API_KEY = process.env.SOLAR_API_KEY;
  const SOLAR_API_URL = process.env.SOLAR_API_URL || 'https://api.upstage.ai/v1/chat/completions';
  const SOLAR_MODEL = 'solar-pro4';
  const maxRetries = opts.maxRetries ?? 2;

  if (!SOLAR_API_KEY) throw new Error('Solar API key not configured');

  const body = {
    model: SOLAR_MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2048,
    response_format: opts.forceParse ? undefined : { type: 'json_object' },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const solarRes = await fetch(SOLAR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SOLAR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (solarRes.ok) {
      const solarData = await solarRes.json();
      const content = solarData.choices?.[0]?.message?.content;
      if (!content) throw new Error('Solar 응답이 비어 있습니다');
      return content;
    }

    const errBody = await solarRes.text().catch(() => '');
    const status = solarRes.status;

    if (status === 429 && attempt < maxRetries) {
      logCall('grill.retry', 0, status, {});
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }

    throw new Error(`Solar API 오류 (${status}): ${errBody.slice(0, 300)}`);
  }

  throw new Error('Solar API 호출 최대 재시연 횟수 초과');
}

export async function POST(request) {
  if (request.method !== 'POST') {
    return sendError(405, 'Method not allowed');
  }

  if (!process.env.SOLAR_API_KEY) {
    return sendError(500, 'Solar API key not configured');
  }

  const force = (request.headers.get('x-grill-force') || '').trim().toLowerCase();

  try {
    const body = await request.json().catch(() => ({}));
    const { question, answer, history = [], turnCount = 0 } = body || {};

    // 강제 종료 분기: 요청 turnCount >= 5
    if (turnCount >= 5) {
      const summaryMessages = [
        { role: 'system', content: systemPrompt(Math.min(turnCount + 1, MAX_TURNS)) },
        ...historyMessages(history),
        {
          role: 'user',
          content:
            '인터뷰가 5턴으로 끝났습니다. 지금까지의 대화를 바탕으로 사용자의 아이디어를 3~5문장으로 요약해 주세요. 요약 문단 뒤에 빈 줄, "### 정한 것", 빈 줄, 목록(-)을 이어 붙인 마크다운 뼈대로 출력하세요. JSON 형식({ "done": true, "summary": "...", "opening": "..." })으로만 출력하세요. 다른 텍스트 금지.',
        },
      ];
      try {
        const summaryContent = await callSolarWithRetry(summaryMessages, { maxRetries: 2 });
        const parsed = polish(summaryContent) || {};
        const summary = parsed.summary ? String(parsed.summary) : fallbackSummary(history);
        const opening =
          typeof parsed.opening === 'string' && parsed.opening.trim()
            ? parsed.opening.trim()
            : DEFAULT_OPENING;

        return new Response(
          JSON.stringify({
            questionTitle: '',
            questionBody: '',
            suggestion: '',
            exampleButtons: [],
            done: true,
            summary,
            opening,
            turnCount: turnCount + 1,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-grill-source': 'solar',
            },
          },
        );
      } catch (e) {
        // Solar 호출 실패 시에도 종료 처리 — history 답 기반 폴백 요약
        return new Response(
          JSON.stringify({
            questionTitle: '',
            questionBody: '',
            suggestion: '',
            exampleButtons: [],
            done: true,
            summary: fallbackSummary(history),
            opening: DEFAULT_OPENING,
            turnCount: turnCount + 1,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              'x-grill-source': 'fallback:no-summary',
            },
          },
        );
      }
    }

    // messages 구성
    const messages = [
      { role: 'system', content: systemPrompt(Math.min(turnCount + 1, MAX_TURNS)) },
      ...historyMessages(history),
    ];

    if (turnCount === 0 && question) {
      messages.push({ role: 'user', content: question });
    } else if (answer !== undefined && answer !== null && answer !== '') {
      messages.push({ role: 'user', content: `내 답변: ${answer}` });
    } else {
      messages.push({ role: 'user', content: `[예시 버튼 선택] ${question || '(버튼 선택)'}` });
    }

    // x-grill-force: parse 면 response_format을 끄고 산문 응답을 받아 polish 경로로
    const forceParse = force === 'parse';
    const content = await callSolarWithRetry(messages, { forceParse });

    // x-grill-force: error 면 여기서 500 강제
    if (force === 'error') {
      throw new Error('x-grill-force=error 테스트 경로');
    }

    const parsed = polish(content);

    // 파싱 실패: 500 대신 200 + 다시 여쭤볼게요 질문
    if (!parsed || typeof parsed !== 'object') {
      return new Response(
        JSON.stringify({
          questionTitle: '조금 더 여쭤볼게요',
          questionBody: '아까 나눈 이야기를 바탕으로, 가장 먼저 확인하고 싶은 한 가지를 골라 주세요.',
          suggestion: '지금까지 나온 답변을 한 문장으로 정리해 방향을 좁혀 보세요.',
          exampleButtons: [
            {
              label: '핵심 목표 다시 묻기',
              why: '핵심 목표를 다시 확인하면 방향이 선명해지기 때문입니다',
              recommended: true,
            },
            {
              label: '대상 사용자 좁히기',
              why: '누구를 위한 것인지 정하면 범위를 줄이기 쉽기 때문입니다',
              recommended: false,
            },
            { label: '직접 입력', why: '', recommended: false },
          ],
          done: false,
          summary: '',
          opening: DEFAULT_OPENING,
          turnCount: turnCount + 1,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-grill-source': 'fallback:parse',
          },
        },
      );
    }

    const isEnd = parsed.done === true || turnCount >= 5;
    const buttons = isEnd ? [] : withDirectInput(parsed.exampleButtons);
    const questionBody = isEnd ? '' : stripChoiceEnumeration(parsed.questionBody || '', buttons);
    const summary = parsed.summary || '';
    const opening =
      typeof parsed.opening === 'string' && parsed.opening.trim() ? parsed.opening.trim() : DEFAULT_OPENING;

    return new Response(
      JSON.stringify({
        questionTitle: parsed.questionTitle || '',
        questionBody,
        suggestion: parsed.suggestion || '',
        exampleButtons: buttons,
        done: isEnd,
        summary,
        opening,
        turnCount: turnCount + 1,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'x-grill-source': 'solar',
        },
      },
    );
  } catch (err) {
    logCall('grill.POST', 0, 500, request.headers);
    return sendError(500, '서버 오류');
  }
}
