import type { Stage } from "./types"
import { normalizeVerdict } from "./derive"

function composeReason(reason: unknown, points: unknown): string {
  const leadRaw = typeof reason === "string" ? reason.trim() : ""
  const rows = (Array.isArray(points) ? points : [])
    .map((x) => {
      const p = x as { label?: unknown; text?: unknown }
      return { label: String(p?.label ?? "").trim(), text: String(p?.text ?? "").trim() }
    })
    .filter((x) => x.text)
    .slice(0, 5)
  const leadLines = leadRaw.split(/\r?\n/)
  const lead = (rows.length
    ? leadLines.filter((l) => !/^\s*[-*•]\s+/.test(l))
    : leadLines
  )
    .join("\n")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim()
  const body = rows
    .map((x) => (x.label ? `- **${x.label}**: ${x.text}` : `- ${x.text}`))
    .join("\n")
  return [lead, body].filter(Boolean).join("\n\n")
}

export interface ChannelPlanItem {
  tool: string
  queryHint: string
  why?: string
}

export function stagePrompt(
  stage: Stage,
  summary: string,
  planned: ChannelPlanItem[] = [],
): string {
  const channelLines = planned.length
    ? [
        `아래 도구로 조사합니다 — 채널마다 검색어 모양이 다르니 안내를 그대로 따릅니다.`,
        ...planned.map(
          (p) =>
            `- ${p.tool}${p.why ? ` (이 단계에 걸린 말: ${p.why})` : ""} — 검색어: ${p.queryHint}`,
        ),
        `위 도구를 **한 번의 응답에서 모두 함께** 부릅니다 — 하나 부르고 결과를 본 뒤 다음을 부르지 않습니다. 도구마다 검색어는 하나입니다.`,
        `결과를 받으면 **그다음 응답에서 바로 최종 JSON** 을 냅니다. 결과가 0건인 도구는 0건이라고 적고 넘어갑니다. 도구가 준 것만 근거로 씁니다.`,
        `findings 의 각 항목에는 **그 결과 항목에 적힌 channel 값을 그대로** 옮깁니다(도구 결과 JSON 의 각 항목이 자기 channel 을 들고 옵니다). 항목에 없을 때만 부른 도구 이름을 적습니다 — 웹 검색은 웹문서와 블로그·카페 후기를 함께 물어 오므로, 도구 이름으로 뭉뚱그리면 후기 갈래가 통째로 사라집니다.`,
      ]
    : [
        `웹 검색 도구로 서로 다른 검색어 3개를 **한 번의 응답에서 함께** 써서 실제 자료를 찾아 주세요. 결과를 받으면 그다음 응답에서 바로 최종 JSON 을 냅니다.`,
      ]
  return [
    `당신은 「${summary}」를 만들려는 사람의 조사 담당자입니다.`,
    `이번에 맡은 단계는 「${stage.no}. ${stage.title}」입니다. 설명: ${stage.desc}`,
    ...channelLines,
    `찾은 것만 근거로 씁니다. 못 찾은 것은 찾지 못했다고 적습니다.`,
    `판정 근거는 두 자리에 나눠 냅니다 — verdictReason 에 한두 문장, 가려낸 것은 reasonPoints 배열에 2~4개. verdictLine 과 verdictReason 을 쓰면서 그 말의 근거가 된 자료를 그 문장 끝에 [n] 으로 답습니다(n 은 findings 의 순서, 첫 항목이 1). 한 자료를 여러 문장에 달아도 됩니다. 문장마다 다 달지는 않습니다 — 근거를 댈 만한 문장에만 달고, 이어지는 문장이 같은 자료를 말하면 묶어서 마지막 문장에 한 번 답니다. 문장에 단 것은 citations 에도 번호와 이름으로 함께 적습니다.`,
    ``,
    `이 JSON 을 답변 본문에 그대로 적으면 이 단계가 끝납니다 — 본문에 적힌 것만 결과로 읽힙니다.`,
    `마지막 응답은 아래 모양의 JSON 한 덩어리만 내놓습니다. 설명 문장과 코드펜스는 붙이지 않습니다.`,
    JSON.stringify({
      verdict: "가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 쓸 만한 자료 없음",
      verdictLine:
        "이 단계 결과를 사람에게 알리는 한 문장. 위 verdict 와 같은 뜻이어야 하고, 이 단계에서 실제로 무엇을 찾았는지가 드러납니다. 보기는 주제가 전혀 달라 그대로 옮겨 쓸 수 없습니다 — 모양만 따릅니다. (사진 모임) 「비슷한 모임을 여는 분들이 쓰는 안내문이 이미 나와 있어요 [1][2].」 (독서 모임) 「참고할 만한 운영 방식은 있지만 [3], 모임 규칙은 직접 정하셔야 합니다.」 (반찬 가게) 「위생과 신고 절차는 법령에 정해져 있고 [2], 메뉴 구성은 직접 짜는 자리입니다.」 (자전거 수리) 「이 대목은 참고할 만한 것이 잘 안 보여 직접 만들어 가야 합니다.」 — 보기마다 [n] 이 그 말의 근거가 된 자료 바로 뒤에 붙어 있습니다. 마지막 보기처럼 근거로 댈 자료가 없으면 안 붙입니다. 찾은 것도 못 찾은 것도 **그 종류 이름으로** 말합니다 — 법령·통계·공공데이터·오픈소스·후기·웹 문서. 보기: 「신고 기준은 법령에 나와 있고, 가격은 후기 몇 건으로 감을 잡았습니다」 · 「그 대목을 다룬 공개 안내나 후기는 이번에 찾지 못했습니다」 · 「비슷한 운영을 적어 둔 블로그 글이 둘 있었습니다」. 보기마다 맺는 말이 다릅니다 — 이 단계 내용에 맞는 말로 끝냅니다",
      verdictReason:
        "판정 근거의 **첫 한두 문장** — 무엇을 찾았는지. 무엇을 모아 왔는지는 그 종류 이름으로 적습니다 — 법령·통계·공공데이터·오픈소스·후기·웹 문서. 읽는 사람에게 설명하는 자리라 높임말로 적고, 근거가 된 자료는 그 문장 끝에 [n] 으로 답니다",
      reasonPoints: [
        {
          label: "무엇에 대한 이야기인지 서너 낱말 — 보기: 위생 신고 / 가격대 / 직접 정할 것",
          text: "그 한 줄 설명. 근거가 된 자료는 끝에 [n] 으로 답니다",
        },
      ],

      findings: [
        {
          kind: "도구|서비스|글|저장소",
          name: "이름",
          channel: "결과를 준 도구 이름",
          query: "썼던 검색어",
          evidence: "한 줄 근거",
          note: "쓸 때 주의",
          url: "https://",
        },
      ],
      citations: [{ n: "자료 번호", name: "그 자료의 name 을 그대로" }],
      options: ["선택지 한 줄"],
      todos: [
        {
          task: "할 일",
          owner: "가져다 씀 | 직접 함",
          note: "한 줄. 참고할 것을 가리킬 때는 그 종류 이름으로 적습니다 — 법령·통계·공공데이터·오픈소스·후기·웹 문서. 보기: 「법령에 적힌 신고 기준을 먼저 확인한다」",
        },
      ],
    }),
  ].join("\n")
}

export function parseStageJson(output: string): Partial<Stage> | null {
  const text = String(output ?? "").trim()
  const candidates = [text]
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) candidates.push(fence[1].trim())
  const brace = text.match(/\{[\s\S]*\}/)
  if (brace) candidates.push(brace[0])
  for (const c of candidates) {
    try {
      const o = JSON.parse(c) as Record<string, unknown>
      if (!o || typeof o !== "object") continue
      const findings = Array.isArray(o.findings) ? (o.findings as Stage["findings"]) : []
      return {
        verdict: normalizeVerdict(o.verdict),
        citations: Array.isArray(o.citations) ? o.citations : undefined,
        verdictLine: typeof o.verdictLine === "string" ? o.verdictLine : "",
        verdictReason: composeReason(o.verdictReason, o.reasonPoints),
        findings,
        options: Array.isArray(o.options) ? (o.options as string[]) : [],
        todos: Array.isArray(o.todos) ? (o.todos as Stage["todos"]) : [],
        searched: true,
      }
    } catch {
    }
  }
  return null
}
