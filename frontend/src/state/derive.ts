/**
 * 상태 → 화면 자료 변환. 순수 함수만 둔다(테스트·이식이 쉬운 자리).
 * 마인드맵 노드 id 규약: 이 규약이 노드 클릭 → 단계 역추적의 유일한 열쇠다.
 *   뿌리        `root`
 *   단계        `s<no>`                예: `s1`
 *   소주제      `s<no>-t<i>` · `s<no>-t<i>-<j>`   — 단계 아래 0~2층(4차 보강 step-13, outline 이 있을 때만)
 *   항목 잎     `s<no>-finding-<i>` · `s<no>-todo-<i>` · `s<no>-task-<i>`   — 소주제 아래 또는 단계 바로 아래(4차 step-3)
 * 옛 갈래 id(`-bring`·`-make`, 3차)와 옛 묶음 id(`-tasks`·`-findings`·`-todos`·`-choices`, 2차)는 저장 세션의
 * `expandedIds` 에 남아 있을 수 있다 — 부품은 id 를 집합 조회로만 쓰므로 죽지 않는다.
 */
import type { MindmapNode } from "@/components/mindmap-spine-tree"
import type { BigPicture, Finding, GrillChoice, OutlineTopic, SourceDoc, Stage, StageSlot, Task, Todo, Verdict } from "./types"

/**
 * 인터뷰 선택지 정규화 (5차 step-5). 서버가 내는 `{label, why, recommended}` 와 **옛 저장본의 문자열**을 둘 다 받는다.
 * 저장 모양을 갈아치우지 않고 여기 렌더 시점에서 흡수하는 것이 이 함수의 존재 이유다 — `types.ts` `GrillChoice` 주석 참조.
 * 추천은 **새 계약에서만** 정확히 하나로 맞춘다. ⚠ 옛 문자열 배열에는 추천을 **지어내지 않는다** —
 * 그 저장본의 질문 본문에는 산문 「추천 — …」 줄이 아직 살아 있어서, 첫 칩에 표시를 붙이면 그 줄과
 * 다른 것을 가리키는 두 개의 추천이 한 화면에 선다(2026-09-15 실측으로 잡았다).
 */
export function normalizeChoices(items: ReadonlyArray<string | GrillChoice> | undefined): GrillChoice[] {
  const out: GrillChoice[] = []
  let typed = false
  for (const it of items ?? []) {
    const isObj = typeof it === "object" && it !== null
    const label = String((isObj ? it.label : it) ?? "").trim()
    if (!label) continue
    if (isObj) typed = true
    out.push({
      label,
      why: isObj ? String(it.why ?? "").trim() : "",
      recommended: isObj ? Boolean(it.recommended) : false,
    })
  }
  if (!typed) return out
  const first = out.findIndex((c) => c.recommended)
  out.forEach((c, i) => { c.recommended = i === (first === -1 ? 0 : first) })
  return out
}

/** 계약이 고정한 4종. 서버가 산문 판정을 돌려주는 일이 있어(실측) 화면에 넣기 전에 여기서 접는다. */
const VERDICTS: Verdict[] = ["가져다 써도 됨", "직접 해야 함", "섞어야 함", "선례를 못 찾음"]
/**
 * 모델이 고르는 이름 → 계약 값. 두 경로가 같은 표를 써야 한다(`server/stage.mjs` 의 `VERDICT_ALIAS` 와 짝).
 * ⚠ **프롬프트에는 「선례」를 안 쓴다** — 모델이 그 낱말을 산문에 옮겨 적는다(6차 실측 7단계 5건).
 *    저장 값은 그대로 두는 이유는 `App.tsx` 의 결과 줄 정규식이 거기 걸려 있어서다.
 */
const VERDICT_ALIAS: Record<string, Verdict> = { "쓸 만한 자료 없음": "선례를 못 찾음" }
export function normalizeVerdict(raw: unknown): Verdict {
  const t = String(raw ?? "").trim()
  const aliased = Object.keys(VERDICT_ALIAS).find((k) => t.startsWith(k))
  if (aliased) return VERDICT_ALIAS[aliased]
  const hit = VERDICTS.find((v) => t.startsWith(v))
  return hit ?? "선례를 못 찾음"
}

/**
 * 판정 4종 → 화면 표시 문구 (M5 확장 3차 step-1, 사용자 피드백 B·확정 2026-09-13).
 * 계약 값(「섞어야 함」)은 **코드·저장·서버 응답에 그대로** 두고, 사람이 읽는 자리에서만 이 함수로
 * 바꾼다 — 저장 시점에 바꾸면 옛 세션과 새 세션이 두 이름으로 섞인다. 화면에 판정을 찍는
 * 곳은 전부 이 함수 하나를 지난다(문구 정본은 `docs/app-ux-copy.md` §3-A).
 */
const VERDICT_LABEL: Record<Verdict, string> = {
  "가져다 써도 됨": "이미 있음",
  "섞어야 함": "일부만 있음",
  "직접 해야 함": "없음",
  "선례를 못 찾음": "못 찾음",
}
export function verdictLabel(v: Verdict): string {
  return VERDICT_LABEL[normalizeVerdict(v)]
}

/**
 * 저장된 단계 결과 줄(`n. 제목 → **계약 값**`)을 표시 문구로. `flow.ts` 가 굳혀 저장한 문자열은
 * 계약 값 그대로이므로(옛 세션 호환) 렌더 직전에 여기서만 바꾼다.
 */
const STAGE_RESULT_VERDICT = /→ \*\*(가져다 써도 됨|섞어야 함|직접 해야 함|선례를 못 찾음)\*\*/
/**
 * 결과 줄의 판정을 **사람 말 한 문장**으로 (5차 step-9 · D5). 범례의 짧은 이름(`verdictLabel`)은
 * 마인드맵 점처럼 자리가 좁은 데서 쓰고, 대화의 결과 줄은 문장으로 말한다.
 *
 * ⚠ **「선례」로 뭉뚱그리지 않는다**(2026-09-15 사용자 지적). 이 단계가 모아 오는 것은 법령·통계·공공데이터·오픈소스·후기이고,
 * 그중 「선례」라고 부를 수 있는 것은 일부뿐이다. 계약 값 이름에는 선례가 남아 있지만(저장물이라 못 바꾼다) **화면 문구는 자료로 말한다.**
 */
const VERDICT_SENTENCE: Record<Verdict, string> = {
  "가져다 써도 됨": "이미 나와 있는 것을 가져다 쓰면 됩니다",
  "섞어야 함": "가져다 쓸 것과 직접 만들 것이 섞여 있습니다",
  "직접 해야 함": "직접 만들어야 하는 부분입니다",
  "선례를 못 찾음": "참고할 자료를 찾지 못했습니다",
}
/**
 * 화면 문장의 주인을 가르는 스위치 (6차 step-7 · 결정 로그 11).
 *
 * `model`(기본) — 모델이 쓴 `stage.verdictLine` 을 쓴다. 없으면 아래 고정 문장으로 내려간다.
 * `fixed`       — 고정 문장만 쓴다. **5차 동작 그대로**다.
 *
 * 왜 스위치를 남기나: 5차가 화면 문장을 코드 고정값으로 간 이유는 hermes 경로의 지어내기였다
 * (모델이 붙인 채널 라벨 17건 중 9건이 호스트와 어긋났다 — `evidence/m5/path-parity-2026-09-15.md`).
 * 6차는 그 자유도를 되돌려주는 방향이라, 제출 당일 완주에서 지어내기 지표가 그 기준선을 넘으면
 * **커밋을 되돌리는 것보다 스위치를 내리는 쪽이 빠르다.** 그래서 고정 매핑을 지우지 않고 남긴다.
 */
const VERDICT_SENTENCE_MODE = import.meta.env?.VITE_VERDICT_SENTENCE_MODE === "fixed" ? "fixed" : "model"

/** 결과 줄 꼬리의 채널 집계 `(웹 3 · 법령 1)` — 괄호 대신 사람 말로 편다 */
const STAGE_RESULT_TALLY = /\s*\(([^()]*?\d[^()]*?)\)/
/**
 * 저장된 단계 결과 줄(`n. 제목 → **계약 값** (웹 3) [1][2]`)을 표시 문구로.
 * `flow.ts` 가 굳혀 저장한 문자열은 계약 값 그대로이므로(옛 세션 호환) 렌더 직전에 여기서만 바꾼다.
 *
 * `stage` 를 주면 그 단계의 **판정 문장**(`verdictLine`)으로 계약 값 자리를 갈아끼우고, **판정 이유**(`verdictReason`)를
 * 다음 문단으로 붙인다 — 둘 다 이미 자료에 있는 값이고 새로 짓지 않는다.
 * 안 주면(또는 그 단계에 값이 없으면) 고정 문장으로 내려간다 — **옛 세션이 이 경로로 그려진다**(5차까지의 저장본에는 `verdictLine` 이 없다).
 */
/**
 * 한국어 문장 하나를 앞에서 떼어 낸다. 못 떼면 빈 문자열(부르는 쪽이 원래 길로 간다).
 *
 * ⚠ **마침표만 보고 자르면 안 된다** — 본문에 `[1]` 인용 마커가 마침표 앞뒤로 붙고(`…습니다 [1].`),
 *   소수점·약어도 섞인다. 그래서 **종결 어미 + 마침표**를 함께 보고, 뒤따르는 마커까지 데려간다.
 * ⚠ 너무 긴 첫 문장은 올리지 않는다 — 판정 자리는 한 줄이라 넘치면 제목처럼 안 읽힌다.
 */
// ⚠ 마커는 **마침표 앞**에 붙는다 — 「…있어요 [1][2].」(프롬프트 예시가 그 모양이고 실측 산출도 그렇다)。
//   처음엔 뒤에 붙는 줄 알고 `…다\.(\[n\])*` 로 썼는데, 그러면 첫 문장에서 안 걸려
//   **두 번째 문장까지 통째로** 올라갔다(probe ⑤ 가 잡았다). 양쪽 다 받는다.
const SENTENCE_END = /^[\s\S]*?(?:다|요|죠|음|함)(?:\s*\[\d+\])*\.(?:\s*\[\d+\])*/
/**
 * **서버가 채워 넣은 문구는 올리지 않는다** (2026-09-15 실측으로 드러난 구멍).
 *
 * 모델이 `verdictLine` 과 `verdictReason` 을 **둘 다** 비우면 `server/stage.mjs` 가 이유 자리에
 * 고정 문구를 채운다. 그걸 첫 문장으로 올리면 판정 자리에 「찾은 자료를 확인했습니다」가 서서
 * **막으려던 판박이가 다른 문구로 되살아난다** — 실제로 화면에 그렇게 섰다.
 * 그런 단계는 올리지 말고 판정별 고정 문장으로 내려가는 쪽이 낫다. 적어도 그건 **판정을 말한다.**
 */
const SERVER_FILLED = ["찾은 자료를 확인했습니다.", "조사 상한 안에서는 쓸 만한 자료를 찾지 못했습니다.", "찾은 자료를 이렇게 쓸 수 있습니다."]
/** 글머리표 줄머리 — 서버가 `reasonPoints` 를 조립할 때 쓰는 모양(`- **라벨**: 글`)과 모델이 직접 쓴 것 둘 다 받는다. */
const BULLET = /^\s*[-*•]\s+/
function firstSentence(text: string): string {
  const m = SENTENCE_END.exec(text.trim())
  if (!m) return ""
  const got = m[0].trim()
  if (SERVER_FILLED.includes(got)) return ""
  return got.length <= 120 ? got : ""
}

export function displayStageResult(text: string, stage?: Stage): string {
  if (!STAGE_RESULT_VERDICT.test(text)) return text
  // 제목과 결과를 **다른 문단**으로 끊는다(2026-09-15 사용자 지적) — 한 줄에 이어 붙이면 제목이 결과에 묻힌다.
  // 이음표(—)는 쓰지 않는다.
  //
  // 6차 step-7 — 모델이 쓴 한 문장으로 계약 값 자리를 갈아끼운다(사용자 피드백 E 「LLM에게 어느정도 자유도를」).
  // ⚠ **저장 문자열의 모양(`n. 제목 → **계약값**`)은 안 바꾼다.** `App.tsx:50` 의 `STAGE_RESULT` 가 그 모양으로
  //   자료 0건 단계의 결과 줄이 아코디언에 접혀 사라지는 것을 막고(5차 실측 사고), `:57~62` 가 줄 머리 번호로
  //   단계를 찾는다. 갈아끼우는 일은 여기, **렌더 시점**에만 한다.
  const model = VERDICT_SENTENCE_MODE === "model"
  let line = model ? String(stage?.verdictLine ?? "").trim() : ""
  let reason = String(stage?.verdictReason ?? "").trim()
  /**
   * 모델이 `verdictLine` 을 **비우는 일이 있다** (6차 라이브 실측 — 6단계 중 1개). 그때 5차 고정 문장으로
   * 내려가면 그 단계만 「이미 나와 있는 것을 가져다 쓰면 됩니다」 같은 판박이가 되어, **여러 단계를
   * 나란히 읽을 때 같은 말이 반복되는 것으로 읽힌다**(2026-09-15 사용자 지적).
   *
   * 고정 문장을 여러 개 만들어 돌리는 것은 답이 아니다 — 그건 「강제로 설정」을 가짓수만 늘린 것이다.
   * 대신 **같은 단계의 `verdictReason` 첫 문장**을 올린다. 모델이 이 단계를 보고 쓴 문장이라 판박이가 아니고,
   * 새로 짓는 것도 아니다(이미 자료에 있는 값을 자리만 옮긴다).
   * 올린 문장은 이유 문단에서 **뺀다** — 안 빼면 같은 문장이 두 번 선다.
   *
   * 둘 다 비면 그때만 고정 문장이다 — **5차 저장본이 이 경로로 그려진다**(그 시절엔 두 필드가 없었다).
   */
  if (model && !line && reason) {
    const first = firstSentence(reason)
    if (first) {
      line = first
      reason = reason.slice(first.length).trim()
    }
  }
  /**
   * 한 층 더 (7차 step-6) — 첫 문장마저 못 쓸 때 **이유 항목의 첫 줄**을 올린다.
   *
   * 6차에 이 자리가 그대로 남았다: 모델이 `verdictLine`·`verdictReason` 을 비우고 `reasonPoints` 만 채우면,
   * 서버가 이유 자리에 고정 문구(「찾은 자료를 이렇게 쓸 수 있습니다.」)를 머리로 얹고 그 아래 글머리표를 단다.
   * 그러면 위 블록의 `firstSentence` 는 그 고정 문구를 보고 빈 문자열을 돌려주고(`SERVER_FILLED`),
   * 판정 자리는 **고정 4종**으로 내려간다 — 자료를 여섯 물고도 판박이 한 줄이 서는 그 모양이다.
   *
   * 글머리표 첫 줄은 **모델이 이 단계를 보고 쓴 말**이다. 지어내는 게 아니라 자리를 옮긴다(위와 같은 수법).
   * 올린 줄은 목록에서 **뺀다** — 안 빼면 같은 말이 판정과 이유에 두 번 선다.
   */
  if (model && !line && reason) {
    const lines = reason.split("\n")
    const at = lines.findIndex((l) => BULLET.test(l))
    if (at >= 0) {
      const raw = lines[at].replace(BULLET, "").replace(/^\*\*([^*]+)\*\*\s*:\s*/, "").trim()
      // 서버가 채운 문구는 올리지 않는다 — 막으려던 판박이가 다른 문구로 되살아난다(6차에 한 번 뚫린 구멍).
      if (raw && raw.length <= 120 && !SERVER_FILLED.includes(raw)) {
        line = raw
        lines.splice(at, 1)
        reason = lines.join("\n").replace(/\n\s*\n+/g, "\n\n").trim()
        // 글머리표를 다 올려 보내 고정 머리말만 남았으면 그 머리말도 지운다 — 혼자 서면 빈 말이다.
        if (SERVER_FILLED.includes(reason)) reason = ""
      }
    }
  }
  /**
   * 단계 제목을 **소제목으로** 세운다 (6차 step-13b, 2026-09-15 사용자 육안 —
   * 제미나이 노트북 캡처를 보이며 「단계별로 옅은 구분선도 표시가 되는 것 같네」).
   *
   * 여러 단계의 결과가 한 줄기로 이어 흐르면 어디서 단계가 갈리는지 눈으로 안 잡힌다.
   * ⚠ **구분선은 여기서 긋지 않는다.** 본문 맨 앞에 `---` 를 넣었더니 「조사 과정」 아코디언보다 **아래**에 서서
   *   아코디언이 앞 단계에 붙어 보였다(실측). 선은 말풍선 바깥이 자리라 `ChatMessage.sectionStart` 가 맡는다.
   * ⚠ **저장 문자열은 그대로다** — 이 함수는 렌더 직전에만 불린다(`App.tsx:561`).
   *   `##` 인 이유는 `chat-conversation-panel` 의 제목 규칙이 `#~##` 만 본문 크기로 두기 때문이다(`###` 는 작아진다).
   */
  /**
   * ⚠ **판정 문장을 통째로 굵게 감싸지 않는다** (8차 육안 1라운드 — 2026-09-16 사용자).
   *
   * 6차부터 이 자리는 문장 전체를 굵게 세웠다. 사용자 지적 원문:
   * 「단계별 제목 아래에 한 문단씩 얘기들이 붙는데 전부 Bold 처리되어 있는 게 어색함.
   *  강조 용어마다 bold 가 되는 게 맞지. 이건 LLM 의 판단에 맡기는 게 맞는 거고,
   *  규칙론적으로 bold 처리 해라는 말이 있으면 없애야 하는 거고.」
   * 그래서 **굵기는 모델이 문장 안에 쓴 마크업만** 남긴다 — 코드가 문단 전체를 굵게 만들지 않는다.
   * ⚠ 저장 문자열의 모양(`n. 제목 → **계약값**`)은 그대로다. 벗기는 것은 **렌더 출력**뿐이다.
   */
  let out = "## " + text.replace(STAGE_RESULT_VERDICT, (_, v: Verdict) => `\n\n${line || VERDICT_SENTENCE[normalizeVerdict(v)]}`)
  // 6차 step-8 — 채널 집계는 결과 줄에서 **뺀다**(사용자 피드백 F 「웹에서 자료 몇건, 후기 몇건 이라고 표시되는건
  // … 조사과정 1줄 아코디언 그 안에 들어가야 할 내용인거 같고」). 결과 줄은 결론과 인용만 든다.
  // ⚠ **저장 문자열에서 빼는 게 아니라 렌더에서 지운다** — 저장본은 `(웹 3 · 법령 1)` 을 그대로 갖고 있고,
  //   아코디언은 그 값을 `channelTallyLine` 으로 따로 그린다. 저장 모양을 바꾸면 `App.tsx` 의 소비처 셋이 어긋난다.
  out = out.replace(STAGE_RESULT_TALLY, "")
  out = fillMissingMarks(out, stage)
  return reason ? `${out}

${reason}` : out
}

/**
 * 저장된 줄에 **빠진 `[n]` 을 꼬리에 채운다** (2026-09-15 사용자 지적 「1,2,3 만 일괄로 붙는다」).
 *
 * 5차는 결과 줄 꼬리 마커를 `.slice(0, 3)` 으로 잘라 **글에 저장**했다. 배지는 그 마커에서 나오므로
 * 자료가 6건이어도 **영영 세 개**다 — 인용 목록만 되살려서는 안 는다(실측: 목록을 6으로 늘려도 배지 3개).
 *
 * 그래서 **표시할 글에** 빠진 번호를 붙인다. 뜻은 6차 새 세션과 같다 —
 * 「본문에 안 달린 자료는 결과 줄 끝이 받는다」. 저장본은 안 고친다(record 동결).
 *
 * ⚠ 새 세션에서는 **아무 일도 안 한다** — 6차 `stageResultEntry` 가 이미 전부 채워 저장하므로
 *   빠진 번호가 없다. 그래서 이 보정은 옛 줄에만 발현된다.
 */
function fillMissingMarks(text: string, stage?: Stage): string {
  const total = stage?.findings?.length ?? 0
  if (!total) return text
  const seen = new Set((text.match(/\[(\d+)\]/g) ?? []).map((m) => Number(m.slice(1, -1))))
  const missing: string[] = []
  for (let n = 1; n <= total; n += 1) if (!seen.has(n)) missing.push(`[${n}]`)
  return missing.length ? `${text}${missing.join("")}` : text
}

/**
 * 판정 4종 → 라벨 앞 색 점 (M5 확장 2차 step-3, 사용자 피드백 6·확정 2026-09-13).
 * 라벨 꼬리에 「· 섞어야 함」을 산문으로 이어 붙이던 것을 대신한다 — 그 꼬리는 폭 예산을
 * 먹으면서도 일곱 단계를 훑을 때 눈에 안 들어왔다.
 * **색만으로 뜻이 서지 않는다**는 전제라 `title` 이 뜻을 그대로 말한다(문구 정본은
 * `docs/app-ux-copy.md` §마인드맵 판정 점). 문장 머리는 **표시 문구**(3차 step-1)로 시작한다.
 * 색은 `tokens.css` 의 `--verdict-*` 4종. 판정 전·실패는 **테두리만 있는 회색 빈 점**이라
 * 채운 점과 섞이지 않는다(빈 점을 채운 회색으로 두면 「못 찾음」으로 읽힌다).
 */
/**
 * 마인드맵 색 어휘는 **2색 하나**다(4차 보강 3 step-22, 사용자 H18 「단계랑 항목이랑 표현이 달라? … 개념이 명료하지 않다」 → 추천 A 확정).
 * 화면이 답하는 질문은 하나 — 「남이 만든 게 있나, 내가 만들어야 하나」. 그 질문은 항목에 성립하고 단계는 항목의 합이다.
 * 판정 4종(계약 값)은 데이터·문서·대화 문장에 그대로 남고(`verdictLabel`), 마인드맵 색에서만 뺐다.
 */
/** 단계 항목의 두 색 개수 — 초록 = 자료 + 「가져다 씀」 항목, 주황 = 할 일 + 「직접 함」 항목(§3-B 와 같은 규칙) */
export function itemSplit(s: Stage): { existing: number; need: number } {
  const todos = s.todos ?? []
  const bring = todos.filter((t) => asText(t.owner) === BRING_OWNER).length
  return { existing: (s.findings?.length ?? 0) + bring, need: (s.tasks?.length ?? 0) + (todos.length - bring) }
}
/** 단계 부제·툴팁 문구 — 「가져다 쓸 것 n · 직접 만들 것 m」 */
export function splitLabel(s: Stage): string {
  const { existing, need } = itemSplit(s)
  return `가져다 쓸 것 ${existing} · 직접 만들 것 ${need}`
}

/**
 * 마인드맵 범례(4차 보강 2 step-17 → 보강 3 step-22: 3줄). 문구·색은 아래 `ITEM_DOT` 을 **그대로 참조**한다 — 범례가 따로 문장을
 * 갖지 않아 툴팁과 어긋날 수 없다. `verdict` 는 지도 위 점의 `data-verdict` 와 같다.
 */
export type LegendItem = { verdict: string; label: string; title: string; color: string; hollow?: boolean }
export function mindmapLegend(): LegendItem[] {
  const items: LegendItem[] = (["existing", "need"] as const).map((k) => ({ label: ITEM_DOT[k].title.split(" — ")[0], ...ITEM_DOT[k] }))
  items.push({ verdict: "pending", label: "조사 중", title: "아직 조사하고 있습니다.", color: "var(--verdict-none)", hollow: true })
  return items
}

/**
 * 단계 점 = 항목 비율의 두 색 분할 점(`split` = 초록 비율). 항목이 없거나 아직 조사 중·실패면 빈 점.
 * 색은 항목 점과 같은 두 토큰이라 새 색이 없다.
 */
export function verdictDot(slot: StageSlot): MindmapNode["dot"] {
  if (slot.status === "failed") {
    return { verdict: "failed", color: "var(--verdict-none)", title: "이 단계는 자료를 못 찾았습니다.", hollow: true }
  }
  if (slot.status !== "done") {
    return { verdict: "pending", color: "var(--verdict-none)", title: "아직 조사하고 있습니다.", hollow: true }
  }
  const { existing, need } = itemSplit(slot.stage)
  const total = existing + need
  if (!total) return { verdict: "empty", color: "var(--verdict-none)", title: "이 단계에는 항목이 없습니다.", hollow: true }
  return { verdict: "split", color: ITEM_DOT.existing.color, color2: ITEM_DOT.need.color, split: existing / total, title: splitLabel(slot.stage) }
}

/**
 * 마인드맵 노드 라벨 길이 상한. 부품은 라벨을 `whitespace-nowrap` 으로 재서 폭을 잡으므로
 * 문장을 그대로 넣으면 레이아웃이 폭발하고 fit 줌이 트리를 점만 하게 줄인다(실측).
 * 전문은 `data.full` 에 남겨 노드 설명이 쓴다.
 */
export const LABEL_MAX = 28

/**
 * 계약은 `string[]` 인데 서버가 객체를 돌려주는 일이 있다(실측 — `choices`/`options`).
 * 화면 문자열을 만드는 자리는 전부 이 함수를 거친다. 여기서 안 막으면 렌더가 통째로 죽는다.
 */
export function asText(v: unknown): string {
  if (typeof v === "string") return v
  if (v == null) return ""
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    for (const k of ["label", "title", "name", "task", "text", "option", "choice"]) {
      if (typeof o[k] === "string") return o[k] as string
    }
    try {
      return JSON.stringify(v)
    } catch {
      return ""
    }
  }
  return String(v)
}

export function shortLabel(text: unknown, max = LABEL_MAX): string {
  const t = asText(text).replace(/\s+/g, " ").trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/**
 * 잎 라벨 상한 (M5 확장 4차 step-2, 사용자 피드백 H2 「노드 제목이 이렇게 긴 게 이상하다」 · 확정 「규칙 먼저」).
 * 18 은 튜닝값 — fan 레이아웃에서 잎이 오른쪽으로 쌓이므로 우 패널 폭(≈600px)에서 한 줄에 서야 한다.
 * 단계 노드는 종전 `LABEL_MAX`(28, 번호 + 제목) 그대로다.
 */
export const LEAF_LABEL_MAX = 18

/** 구두점 앞에서 자르는 자리 — `(` · ` — ` · `: ` · `|`. 부제·괄호 설명·경로 꼬리가 이 뒤에 온다(실측 라벨: 「Strava Clubs V3 API (/clubs/:id/activities)」). */
const LEAF_CUT = /\(| — |: |\|/g
/** 구두점이 이 안(앞 3자)에서 시작하면 그 규칙은 건너뛴다 — 「(가칭) …」처럼 머리 괄호를 자르면 빈 라벨이 된다. */
const LEAF_CUT_MIN = 3

/**
 * 잎 라벨 축약 규칙 — 순수 함수. 전문은 호출부가 `hint`(호버)·`data.full`(노드 설명)에 따로 든다.
 *   1) 첫 구두점(`(`·` — `·`: `·`|`) 앞에서 자른다. 단 그 구두점이 앞 3자 안이면 건너뛴다.
 *   2) 그래도 `max` 를 넘으면 `max` 이전 마지막 공백에서 자르고 말줄임표를 붙인다(공백이 앞 3자 안이면 글자 단위로).
 *   결과 길이 ≤ max + 1(말줄임표). 빈 문자열은 내지 않는다 — 규칙이 전부 비우면 원문 앞을 그대로 쓴다.
 * 규칙으로 어색한 라벨은 finding 큐(LLM 축약) 몫이다 — 여기서 하지 않는다.
 */
export function nodeLabel(text: unknown, max = LEAF_LABEL_MAX): string {
  const full = asText(text).replace(/\s+/g, " ").trim()
  let t = full
  LEAF_CUT.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LEAF_CUT.exec(full))) {
    if (m.index >= LEAF_CUT_MIN) {
      t = full.slice(0, m.index).trim()
      break
    }
  }
  if (!t) t = full
  if (t.length <= max) return t
  const space = t.lastIndexOf(" ", max)
  const head = space >= LEAF_CUT_MIN ? t.slice(0, space) : t.slice(0, max - 1)
  return `${head.trim()}…`
}

export function stageNoFromNodeId(id: string): number | null {
  const m = /^s(\d+)/.exec(id)
  return m ? Number(m[1]) : null
}

/**
 * 단계 아래는 **항목 잎이 바로** 선다 (M5 확장 4차 step-3, 사용자 피드백 H5 「가져다 쓸 것·직접 만들 것 노드가 있는 게 어색하다」).
 * 3차의 갈래 노드(`-bring`·`-make`)를 없앴다 — 제미나이 트리처럼 **전부 내용 노드**(뿌리 → 단계 → 항목, 3층)다.
 * 가져다 씀/직접 함은 노드가 아니라 **잎 앞 점 색**으로 가른다(색만으로 뜻이 서지 않으므로 `title` 이 말한다 — 문구 정본 §3-B):
 *   초록(`--verdict-existing`) = 이미 있는 것   — 찾은 자료 + `owner === "가져다 씀"` 인 항목
 *   주황(`--verdict-need`)     = 직접 만들 것   — `tasks` + `owner === "직접 함"` 인 항목
 * 순서는 자료 → 가져다 씀 → 할 일 → 직접 함. **번호는 단계 노드에만** 붙고 잎은 수량 꼬리표 없는 명사형이다(2차 규칙 승계).
 * `owner` 가 곧 점이므로 라벨의 `[가져다 씀]`·`[직접 함]` 접두사는 뗀다. `choices`/`options` 는 마인드맵에 안 올린다.
 * 점 색은 단계 판정 점의 두 색을 **재사용**한다 — 새 색을 만들지 않는다(디자인 결정).
 */
const BRING_OWNER = "가져다 씀"
const ITEM_DOT: Record<"existing" | "need", NonNullable<MindmapNode["dot"]>> = {
  existing: { verdict: "existing", color: "var(--verdict-existing)", title: "이미 있는 것 — 가져다 쓰거나 손봐서 씁니다." },
  need: { verdict: "need", color: "var(--verdict-need)", title: "직접 만들 것 — 가져다 쓸 자료가 없어 직접 만듭니다." },
}
/**
 * 소주제 트리(4차 보강 step-13, 사용자 H8)를 따라 항목 잎을 단계 아래에 배치한다 — 단계 → 소주제(0~2층) → 항목.
 * 소주제 노드 id 는 `s<no>-t<i>[-<j>]`, 점 없이 라벨(18자 규칙)만. 항목 잎 id 는 그대로다(인용·설명·역추적 규약 무변경).
 * **코드 보정**: outline 이 가리키지 않은 항목은 단계 바로 아래에 이어 붙이고, 두 번 가리킨 항목은 첫 자리만 — 잎 수는 항상 보존된다.
 * outline 이 없으면(옛 세션·폴백) 항목이 단계 바로 아래에 선다(3층).
 */
export function outlineChildren(no: number, outline: OutlineTopic[] | undefined, items: MindmapNode[]): MindmapNode[] {
  if (!outline?.length) return items
  const byRef = new Map(items.map((n) => [n.id.slice(`s${no}-`.length), n]))
  const used = new Set<string>()
  const build = (topics: OutlineTopic[], prefix: string): MindmapNode[] =>
    topics.flatMap((tp, i) => {
      const id = `${prefix}-t${i}`
      const kids: MindmapNode[] = []
      for (const ref of tp.items ?? []) {
        const n = byRef.get(ref)
        if (!n || used.has(ref)) continue
        used.add(ref)
        kids.push(n)
      }
      if (tp.topics?.length) kids.push(...build(tp.topics, id))
      if (!kids.length) return []
      const title = asText(tp.title)
      return [{ id, label: nodeLabel(title), hint: title, children: kids, data: { kind: "topic", full: title } }]
    })
  const topics = build(outline, `s${no}`)
  const rest = items.filter((n) => !used.has(n.id.slice(`s${no}-`.length)))
  return [...topics, ...rest]
}

/** 단계 하나를 마인드맵 가지로. 아직 안 채워진 단계는 자식 없이 단계 노드만 선다(골격 즉시). */
export function stageToNode(slot: StageSlot): MindmapNode {
  const s = slot.stage

  const todos = s.todos ?? []
  // 잎 라벨은 짧게(`nodeLabel`, 4차 step-2), 전문은 `hint`(호버)와 `data.full`(노드 설명)이 든다.
  const leaf = (id: string, kind: string, text: unknown, own: "existing" | "need", extra: Record<string, unknown>): MindmapNode => {
    const full = asText(text)
    return { id, label: nodeLabel(full), hint: full, dot: ITEM_DOT[own], data: { kind, full, own, ...extra } }
  }
  const items: MindmapNode[] = [
    ...(s.findings ?? []).map((f, i) => leaf(`s${s.no}-finding-${i}`, "finding", f.name, "existing", { f })),
    ...todos.flatMap((t, i) => (asText(t.owner) === BRING_OWNER ? [leaf(`s${s.no}-todo-${i}`, "todo", t.task, "existing", { t })] : [])),
    ...(s.tasks ?? []).map((t, i) => leaf(`s${s.no}-task-${i}`, "task", t.task, "need", { t })),
    ...todos.flatMap((t, i) => (asText(t.owner) === BRING_OWNER ? [] : [leaf(`s${s.no}-todo-${i}`, "todo", t.task, "need", { t })])),
  ]
  const children = outlineChildren(s.no, slot.outline, items)

  // 진행 상태는 부품이 그린다(M121 `status`). 라벨에 「· 조사 중」을 이어 붙이지 않는다 —
  // 라벨은 폭 측정의 입력이라 그만큼 레이아웃 예산을 먹는다.
  // **판정도 라벨에서 뺐다**(step-3) — 라벨 앞 색 점 + 호버 설명이 그 자리를 대신한다.
  const full = `${s.no}. ${asText(s.title)}`
  return {
    id: `s${s.no}`,
    label: shortLabel(full, LABEL_MAX),
    dot: verdictDot(slot),
    status: slot.status === "running" ? "busy" : slot.status === "failed" ? "failed" : slot.status === "done" ? "done" : undefined,
    children: children.length ? children : undefined,
    data: { kind: "stage", no: s.no, status: slot.status, full },
  }
}

export function buildMindmap(bigPicture: BigPicture | null, stages: StageSlot[]): MindmapNode | null {
  if (!bigPicture) return null
  return { id: "root", label: shortLabel(bigPicture.title, LABEL_MAX + 8), children: stages.map(stageToNode) }
}

/**
 * 단계 1개 → 좌 패널 카드 1장.
 * **완료를 기다리지 않는다** — 단계가 시작되면 카드가 먼저 자리를 잡고(「조사 중」),
 * 결과가 오면 그 자리에서 채워진다(`docs/app-ux-copy.md` §2-5 「실시간이 지켜야 할 선」 1).
 */
/**
 * 찾은 자료 1건 → 문서 1장 (3차 step-3). 이름·종류·근거·주의·검색어·출처 URL — 단계 요약에 한 줄로 눌려 있던
 * 자료가 제 문서를 갖는다. 부제는 `kind` 다.
 */
/** 조사 채널 표시 이름(4차 보강 2 step-20) — 서버 `stage.mjs` 의 채널 키를 사람 말로 */
export const CHANNEL_LABEL: Record<string, string> = { web: "웹 검색", web_review: "블로그·카페 후기", oss: "오픈소스(GitHub)", public_data: "공공데이터포털", stats: "국가통계(KOSIS)", law: "국가법령정보" }
/**
 * 단계 결과 줄에 붙는 채널별 자료 수 — 「웹 2 · 법령 1」(2026-09-14, 사용자 결정 「네 곳을 돕는다」가 첫 화면에서 보여야 한다).
 * 폴더를 열어야 보이던 채널 사용을 대화의 결과 줄로 끌어올린다. 자료가 하나도 없는 채널은 세지 않는다 — 검색만 하고 못 찾은 것은 단계 요약의 조사 범위 줄이 말한다.
 */
export const CHANNEL_SHORT: Record<string, string> = { web: "웹", web_review: "후기", oss: "GitHub", public_data: "공공데이터", stats: "통계", law: "법령" }
export function channelTally(findings: Finding[] | undefined): string {
  const counts = new Map<string, number>()
  for (const f of findings ?? []) {
    const c = asText(f.channel)
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const order = [...Object.keys(CHANNEL_SHORT), ...counts.keys()].filter((c, i, a) => counts.has(c) && a.indexOf(c) === i)
  return order.map((c) => `${CHANNEL_SHORT[c] ?? c} ${counts.get(c)}`).join(" · ")
}

/**
 * 조사 과정 아코디언 안에 서는 **자료 목록** (6차 step-8b, 2026-09-15 사용자 육안).
 *
 * 「웹에서 자료 3건 · 후기 1건 · 통계 2건」은 **몇 건인지만** 말한다. 사용자 지적이 정확했다 —
 * 「어느 자료·어느 후기·어느 통계인지까지 적히는 게 이 아코디언 속의 자세한 내용이 되어야 하는 거지」.
 * 집계 줄은 **머리말로 남기고**(한눈에 규모가 읽힌다) 그 아래 **실제 제목**을 채널별로 세운다.
 *
 * ⚠ 제목은 `findings` 에서 그대로 온다 — **다시 짓지 않는다.** 아코디언은 「무엇을 봤나」의 기록이지
 *   요약하는 자리가 아니고, 여기서 줄이면 배지가 여는 문서와 이름이 어긋난다.
 * 채널 순서는 `CHANNEL_SHORT` 의 선언 순서를 따른다 — 집계 줄과 **같은 차례**여야 둘이 한 덩이로 읽힌다.
 */
export function stageFoundList(findings: Finding[] | undefined): Array<{ label: string; name: string }> {
  const rows: Array<{ label: string; name: string }> = []
  const seen = new Set<string>()
  const list = findings ?? []
  const order = [...Object.keys(CHANNEL_SHORT), ...list.map((f) => asText(f.channel))]
  for (const c of order) {
    if (!c || seen.has(c)) continue
    seen.add(c)
    for (const f of list) {
      if (asText(f.channel) !== c) continue
      const name = String(f.name ?? "").trim()
      if (name) rows.push({ label: CHANNEL_SHORT[c] ?? c, name })
    }
  }
  // 채널이 안 붙은 자료도 빠뜨리지 않는다 — 호스트 대조에서 채널이 지워진 것이 여기로 온다(「0건이 틀린 1건보다 낫다」).
  for (const f of list) {
    if (asText(f.channel)) continue
    const name = String(f.name ?? "").trim()
    if (name) rows.push({ label: "웹", name })
  }
  return rows
}

/**
 * 조사 과정 아코디언 안에 서는 **채널 집계 한 줄** (6차 step-8).
 * `channelTally` 의 짧은 표기(`웹 3 · 법령 1`)를 사람 말로 편다 — 「자료」는 첫 채널에만 붙인다(채널마다 붙이면 줄이 길어진다).
 * 자료가 0건이면 빈 문자열이고, 그러면 줄을 만들지 않는다 — 「0건」을 굳이 적으면 결과 줄의 판정과 두 번 말하게 된다.
 */
export function channelTallyLine(findings: Finding[] | undefined): string {
  const tally = channelTally(findings)
  if (!tally) return ""
  const parts = tally
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p, i) => {
      const m = /^(.*?)\s+(\d+)$/.exec(p)
      return m ? `${m[1]}${i === 0 ? "에서 자료 " : " "}${m[2]}건` : p
    })
  return parts.join(" · ")
}

/**
 * ── 하이브리드 보강 판정 (6차 · 사용자 결정 ⓐ 「local 로 즉시 채우고 hermes 가 뒤에서 보강」) ──────────
 *
 * 왜 두 경로를 섞나. 실측이 이렇다:
 *   · local  — 단계마다 코드 규칙(`planChannels`)이 채널을 고르고 서버가 직접 검색한다. 7단계 **~2분**.
 *   · hermes — 모델이 채널·검색어를 직접 고르고 MCP 도구를 부른다. 7단계 **271초**(성능 3종 적용 후).
 * 그런데 **사용자가 읽는 글은 두 경로 모두 Solar 가 쓴다** — 판정·문장·할 일·인용이 같은 계약 JSON 이다.
 * 갈리는 것은 「어디를 뒤졌나」와 「기다리는 동안 무엇이 보이나」뿐이다.
 *
 * 그래서 빠른 쪽으로 먼저 답을 다 채우고(1파), 약한 단계만 모델에게 다시 캐 오게 한다(2파).
 * 게이트웨이가 죽어 있으면 2파가 통째로 생략된다 — **폴백이 사고가 아니라 정상 동작**이 된다.
 *
 * ⚠ 이 함수들이 순수한 이유는 `scripts/hybrid-probe.mjs` 가 그대로 태워 전수로 재기 위해서다.
 *   보강 판정이 틀리면 둘 중 하나가 난다 — 멀쩡한 답을 나쁜 답으로 덮거나(비쌈), 약한 답이 그대로 남거나.
 */

/** 근거 등급이 높은 채널. 이것이 하나도 없으면 「웹에서만 봤다」는 뜻이라 보강 값이 크다. */
const STRONG_CHANNELS = new Set(["law", "stats", "public_data", "oss"])

/**
 * 단계 결과의 **세기**. 큰 쪽이 낫다. 세 가지만 본다 — 늘리면 두 경로 비교가 설명 불가능해진다.
 *   ① 판정이 섰나 (「선례를 못 찾음」은 0점 — 자료가 단계를 못 덮었다는 뜻)
 *   ② 자료 건수 (상한 6 — 더 모아 온다고 계속 나아지지 않는다. 계약이 최대 6이다)
 *   ③ 등급 높은 채널 가짓수 (법령·통계·공공데이터·오픈소스 — 랜딩이 약속하는 자리다)
 *
 * ⚠ **문장 길이·문체는 안 센다.** 모델이 길게 쓰면 이기는 점수는 말을 늘리는 쪽으로 몰아간다.
 */
export function stageStrength(stage: Stage | undefined): number {
  if (!stage) return -1
  const findings = stage.findings ?? []
  const verdictPoint = normalizeVerdict(stage.verdict) === "선례를 못 찾음" ? 0 : 2
  const strong = new Set(findings.map((f) => asText(f.channel)).filter((c) => STRONG_CHANNELS.has(c)))
  return verdictPoint + Math.min(findings.length, 6) + strong.size * 2
}

/**
 * 이 단계를 모델에게 다시 캐 오게 할 값이 있나 (2파 대상 고르기).
 *
 * 전부 다시 돌리지 않는 이유는 비용이다 — 단계마다 Solar 를 5~10회 더 부른다.
 * 그리고 이미 법령·통계까지 짚은 단계는 모델이 다시 돌아도 나아질 여지가 작다(실측 채널 분포 기준).
 */
export function needsReinforce(stage: Stage | undefined): boolean {
  if (!stage) return true
  const findings = stage.findings ?? []
  if (!findings.length) return true
  if (normalizeVerdict(stage.verdict) === "선례를 못 찾음") return true
  // 등급 높은 채널이 하나도 없다 = 웹·후기로만 답했다. 여기가 모델이 가장 크게 보태는 자리다.
  return !findings.some((f) => STRONG_CHANNELS.has(asText(f.channel)))
}

/**
 * 2파 결과로 **덮을 것인가**. 같거나 못하면 1파를 그대로 둔다.
 *
 * ⚠ 이 문턱이 이 설계의 안전장치다. 「나중 것이 최신이니 맞다」로 두면 모델이 한 번 헛돌 때
 *   사용자가 이미 읽은 멀쩡한 답이 나쁜 답으로 바뀐다 — 화면이 뒤로 가는 것은 느린 것보다 나쁘다.
 */
export function isBetterStage(next: Stage | undefined, prev: Stage | undefined): boolean {
  return stageStrength(next) > stageStrength(prev)
}

/**
 * 보강으로 무엇이 달라졌는지 사람에게 알리는 한 줄. 바뀐 게 없으면 빈 문자열(줄을 만들지 않는다).
 * 판정이 뒤집힌 것은 **반드시 말한다** — 사용자가 이미 읽고 판단한 것이 바뀌는 자리라 조용히 넘기면 안 된다.
 */
export function reinforceNote(prev: Stage, next: Stage): string {
  const before = normalizeVerdict(prev.verdict)
  const after = normalizeVerdict(next.verdict)
  const gained = (next.findings?.length ?? 0) - (prev.findings?.length ?? 0)
  const parts: string[] = []
  if (before !== after) parts.push(`판정이 「${VERDICT_LABEL[before]}」에서 「${VERDICT_LABEL[after]}」으로 바뀌었습니다`)
  if (gained > 0) parts.push(`자료 ${gained}건이 늘었습니다`)
  if (!parts.length) return ""
  return `${next.no}. ${asText(next.title)} · 더 찾아본 결과 ${parts.join("고, ")}.`
}

export function findingToSourceDoc(s: Stage, f: Finding, i: number): SourceDoc {
  // 사실 먼저(4차 보강 step-12 — 카드 양식의 뼈대). 나머지 절(무엇인가·어떻게 쓰나·피한다·제약)은 처음 열 때
  // `/api/source-card` 가 채워 `session.sourceCards` 에 굳는다. 이 본문은 그 전과 폴백에 보인다.
  const lines: string[] = [`# ${asText(f.name)}`, ""]
  lines.push(`**종류** — ${asText(f.kind) || "자료"} · **단계** — ${s.no}. ${asText(s.title)}${f.url ? ` · **출처** — ${asText(f.url)}` : ""}`)
  // 근거 등급·채널(4차 보강 2 step-20) — 로컬 조사가 채운 자료만 갖는다. 프로덕션 자료는 이 줄이 없다.
  if (f.grade || f.channel) lines.push(`**근거 등급** — ${asText(f.grade) || "확인 불가"}${f.channel ? ` · **채널** — ${CHANNEL_LABEL[asText(f.channel)] ?? asText(f.channel)}` : ""}`)
  lines.push("", "## 근거")
  if (f.evidence) lines.push(`- ${asText(f.evidence)}`)
  if (f.query) lines.push(`- 찾은 검색어 — ${asText(f.query)}`)
  if (!f.evidence && !f.query) lines.push("- 확인 불가")
  if (f.note) lines.push("", "## 제약·주의", `- ${asText(f.note)}`)
  return {
    id: `stage-${s.no}-finding-${i}`,
    kind: "finding",
    stageNo: s.no,
    title: asText(f.name),
    subtitle: asText(f.kind) || "자료",
    url: asText(f.url) || undefined,
    evidence: asText(f.evidence) || undefined,
    markdown: lines.join("\n"),
    status: "done",
  }
}

/**
 * 단계 = **폴더**(4차 보강 3 step-24, 사용자 H21 「폴더들이 있고 그 아래에 폴더와 md 파일들이 있는 게 내 머릿속 개념」).
 * 폴더는 문서를 갖지 않는다(`markdown: ""`). 단계 요약은 폴더의 **첫 파일** `stage-<no>-summary`(`kind: "summary"`)이고,
 * 그 뒤에 소주제 폴더·자료·할 일·역할 나눔 파일이 선다. 폴더는 폴더만, 파일은 파일만 — 어떤 행도 둘 다가 아니다.
 */
export function stageToSourceDoc(slot: StageSlot): SourceDoc {
  const s = slot.stage
  const title = `${s.no}. ${asText(s.title)}`
  const summary = (markdown: string): SourceDoc => ({ id: `stage-${s.no}-summary`, kind: "summary", stageNo: s.no, title: "단계 요약", subtitle: title, markdown, status: slot.status })
  if (slot.status !== "done") {
    const label = slot.status === "failed" ? "자료를 못 찾았습니다." : "조사 중…"
    return {
      id: `stage-${s.no}`,
      kind: "stage",
      stageNo: s.no,
      title,
      markdown: "",
      findingCount: 0,
      status: slot.status,
      children: [summary([`# ${title}`, "", s.desc ? `${asText(s.desc)}\n` : "", label].join("\n"))],
    }
  }
  const lines: string[] = []
  lines.push(`# ${s.no}. ${asText(s.title)}`, "")
  if (s.desc) lines.push(asText(s.desc), "")
  lines.push(`**판정** — ${verdictLabel(normalizeVerdict(s.verdict))}`)
  if (s.verdictReason) lines.push("", asText(s.verdictReason))
  // 조사 범위(4차 보강 2 step-20) — 로컬 조사가 채운 단계만. 어떤 물음으로 어느 채널을 몇 번 불렀나.
  if (s.scope) {
    const channels = (s.scope.channels ?? []).map((c) => CHANNEL_LABEL[asText(c)] ?? asText(c))
    const planned = (s.scope.planned ?? []).map((c) => CHANNEL_LABEL[asText(c)] ?? asText(c))
    lines.push("", `**조사 범위** — ${asText(s.scope.claimType) || "확인 불가"} · 채널 ${channels.length ? channels.join(" · ") : "없음"} · 호출 ${s.scope.calls ?? 0}회${planned.length ? ` · 규칙으로 미리 돌린 채널 ${planned.join(" · ")}` : ""}`)
  }
  if (s.findings?.length) {
    lines.push("", "## 찾은 자료", "")
    for (const f of s.findings) {
      lines.push(`- **${asText(f.name)}** (${asText(f.kind)})`)
      if (f.evidence) lines.push(`  - ${asText(f.evidence)}`)
      if (f.url) lines.push(`  - ${asText(f.url)}`)
    }
  }
  if (s.todos?.length) {
    lines.push("", "## 이미 있는 것 / 직접 해야 하는 것", "")
    for (const t of s.todos) lines.push(`- [${asText(t.owner)}] ${asText(t.task)}${t.note ? ` — ${asText(t.note)}` : ""}`)
  }
  return {
    id: `stage-${s.no}`,
    kind: "stage",
    stageNo: s.no,
    title,
    // 부제는 마인드맵 점과 같은 2색 어휘(보강 3 step-22) — 「가져다 쓸 것 n · 직접 만들 것 m」
    subtitle: splitLabel(s),
    markdown: "",
    findingCount: s.findings?.length ?? 0,
    verdict: normalizeVerdict(s.verdict),
    status: "done",
    // 폴더 안: 「단계 요약」 파일 먼저(step-24), 그 뒤 소주제 폴더·자료·할 일·역할 나눔 파일(3차 step-3 · 4차 보강 step-14·16)
    children: [summary(lines.join("\n")), ...sourceTree(s, slot.outline)],
  }
}

/**
 * 할 일·역할 나눔 1건 → 짧은 노트 1장 (4차 보강 2 step-16, 사용자 H12 「없는 건 담고 있는 md 가 없는 건가? 마인드맵에는 하위 노드들이 보이는데」).
 * 마인드맵 잎과 출처 노트를 1:1 로 맞춘다 — 자료 0건인 단계도 잎이 있으면 접고 펼 수 있다.
 * 사실만 싣고(무엇을·왜/메모·누가) Solar 를 부르지 않는다. id 는 잎 규약 그대로(`stage-<no>-task-<i>` · `stage-<no>-todo-<i>`).
 */
export function itemToSourceDoc(s: Stage, kind: "task" | "todo", t: Task | Todo, i: number): SourceDoc {
  const task = asText(t.task)
  const stageLine = `**단계** — ${s.no}. ${asText(s.title)}`
  const lines: string[] = [`# ${task}`, ""]
  if (kind === "task") {
    const why = asText((t as Task).why)
    lines.push(`**종류** — 할 일 · ${stageLine}`, "", "## 무엇을", `- ${task}`, "", "## 왜", `- ${why || "확인 불가"}`)
  } else {
    const td = t as Todo
    const owner = asText(td.owner)
    lines.push(`**종류** — 역할 나눔 · **누가** — ${owner || "확인 불가"} · ${stageLine}`, "", "## 무엇을", `- ${task}`)
    if (td.note) lines.push("", "## 메모", `- ${asText(td.note)}`)
  }
  const related = (s.findings ?? []).slice(0, 3).map((f) => asText(f.name)).filter(Boolean)
  if (related.length) lines.push("", "## 관련", `- 같은 단계 자료 — ${related.join(" · ")}`)
  return {
    id: `stage-${s.no}-${kind}-${i}`,
    kind: "item",
    stageNo: s.no,
    title: task,
    subtitle: kind === "task" ? "할 일" : `역할 나눔 · ${asText((t as Todo).owner) || "확인 불가"}`,
    markdown: lines.join("\n"),
    status: "done",
  }
}

/**
 * 좌 패널 트리(4차 보강 step-14, 사용자 H9) — 단계 = 폴더이자 요약 노트, 소주제 = 폴더만, 자료·할 일·역할 나눔 = 노트만.
 * outline 을 따라 노트를 소주제 폴더 아래에 두고, 항목이 하나도 없는 소주제만 폴더를 만들지 않는다 —
 * 빈 폴더는 열어도 아무것도 없어 혼동만 준다. outline 이 없거나 가리키지 않은 노트는 단계 바로 아래에 선다.
 * 노트 순서는 마인드맵 잎 순서와 같다(자료 → 가져다 씀 → 할 일 → 직접 함) — 두 패널이 같은 것을 같은 순서로 보인다(step-16).
 */
function sourceTree(s: Stage, outline: OutlineTopic[] | undefined): SourceDoc[] {
  const todos = s.todos ?? []
  const entries: Array<[string, SourceDoc]> = [
    ...(s.findings ?? []).map((f, i): [string, SourceDoc] => [`finding-${i}`, findingToSourceDoc(s, f, i)]),
    ...todos.flatMap((t, i): Array<[string, SourceDoc]> => (asText(t.owner) === BRING_OWNER ? [[`todo-${i}`, itemToSourceDoc(s, "todo", t, i)]] : [])),
    ...(s.tasks ?? []).map((t, i): [string, SourceDoc] => [`task-${i}`, itemToSourceDoc(s, "task", t, i)]),
    ...todos.flatMap((t, i): Array<[string, SourceDoc]> => (asText(t.owner) === BRING_OWNER ? [] : [[`todo-${i}`, itemToSourceDoc(s, "todo", t, i)]])),
  ]
  const docs = entries.map(([, d]) => d)
  if (!outline?.length) return docs
  const byRef = new Map(entries)
  const used = new Set<string>()
  const build = (topics: OutlineTopic[], prefix: string): SourceDoc[] =>
    topics.flatMap((tp, i) => {
      const id = `${prefix}-t${i}`
      const kids: SourceDoc[] = []
      for (const ref of tp.items ?? []) {
        const d = byRef.get(ref)
        if (!d || used.has(ref)) continue
        used.add(ref)
        kids.push(d)
      }
      if (tp.topics?.length) kids.push(...build(tp.topics, id))
      if (!kids.length) return []
      return [{ id, kind: "folder" as const, stageNo: s.no, title: asText(tp.title), markdown: "", status: "done" as const, children: kids }]
    })
  const folders = build(outline, `stage-${s.no}`)
  const rest = entries.filter(([ref]) => !used.has(ref)).map(([, d]) => d)
  return [...folders, ...rest]
}

/** 문서 id 의 조상 행 id 들(단계·폴더) — 인용 배지로 문서를 열 때 접힌 폴더를 펼치는 데 쓴다. */
export function sourceAncestors(docs: SourceDoc[], id: string): string[] {
  const walk = (list: SourceDoc[], path: string[]): string[] | null => {
    for (const d of list) {
      if (d.id === id) return path
      if (d.children?.length) {
        const r = walk(d.children, [...path, d.id])
        if (r) return r
      }
    }
    return null
  }
  return walk(docs, []) ?? []
}

/**
 * 좌 패널이 그릴 카드 전부. 아직 시작 안 한 단계(`pending`)만 빼고 **진행 중인 것도 포함**한다 —
 * 완료를 기다렸다가 한꺼번에 나타나면 실시간이 아니다(`docs/app-ux-copy.md` §2-5).
 */
export function buildSourceDocs(stages: StageSlot[]): SourceDoc[] {
  return stages.filter((x) => x.status !== "pending").map(stageToSourceDoc)
}

/** 중앙 에이전트 설명: 설계 요지와 대표 근거를 읽고 상세 문서로 이어간다. */
export function planningExplanation(bp: BigPicture): string {
  const p = bp.planning
  if (!p) return ""
  const brief = (text: string, limit: number) => text.length > limit ? text.slice(0, limit) + "…" : text
  if (p.mode === "research-informed") return [p.researchNotes?.length ? "**사례를 참고해 목표에 맞는 실행 단계를 제안했습니다.**" : "**인터뷰 내용을 바탕으로 실행 단계 초안을 제안했습니다.**", "", brief(p.basisSummary, 400),
    "", "단계와 순서는 사용자 상황에 맞춘 제안입니다. 참고 자료와 단계별 설계 이유는 왼쪽 **단계를 정할 때 참고한 자료**에서 볼 수 있습니다.",
    ...(p.warnings.length ? ["", brief(p.warnings[0], 180)] : [])].join("\n")
  const source = p.stageBasis.find(b => b.basis === "source")
  const adaptation = p.stageBasis.find(b => b.basis === "adaptation")
  const out = ["**조사한 내용을 바탕으로 실행 순서를 정했습니다.**", "", p.basisSummary, ""]
  if (source) {
    const title = p.sources.find(s => source.sourceIds.includes(s.id))?.title
    out.push(`- **자료에서 확인한 점:** ${source.reason}${title ? ` (참고: ${title})` : ""}`)
  }
  if (adaptation) out.push(`- **상황에 맞춰 조정한 점:** ${adaptation.reason}`)
  out.push("", "단계별 근거 구절과 출처는 왼쪽 **단계를 정할 때 참고한 자료**에서 자세히 볼 수 있습니다.")
  return out.join("\n")
}

/** 선행 조사는 단계 findings/인용 번호와 별개인 문서 한 장이다. */
export function planningSourceDoc(bp: BigPicture | null): SourceDoc | null {
  const p = bp?.planning
  if (!p) return null
  const safe = (s: string) => String(s).replace(/\s+/g, " ").replace(/[\\`*_{}\[\]<>#|]/g, "\\$&")
  const link = (s: { title: string; url: string }) => /^https?:\/\//.test(s.url)
    ? `[${safe(s.title)}](${s.url.replace(/[()<>\s]/g, c => encodeURIComponent(c).replace(/\(/g, "%28").replace(/\)/g, "%29"))})` : safe(s.title)
  const out = ["# 단계를 정할 때 참고한 자료", "", safe(p.basisSummary), "",
    `선행 조사 자료 ${p.sources.length}건 · 조회 ${safe(p.researchedAt)}`, "", p.sources.length ? "검색 결과의 제목과 발췌를 읽었습니다. 링크의 본문 전체를 읽은 기록은 아닙니다." : "검색을 시도했지만 참고할 제목·발췌를 얻지 못했습니다.", "", "## 단계별 설계 이유", ""]
  if (p.mode === "research-informed") {
    out.push("단계와 순서는 인터뷰 목표에 맞춰 제안한 계획입니다. 아래 자료가 모든 단계나 순서를 직접 증명한다는 뜻은 아닙니다.", "", "## 참고한 조사 내용", "")
    for (const note of p.researchNotes ?? []) {
      const source = p.sources.find(s => s.id === note.sourceId)
      if (source) out.push(`- ${link(source)}`, `  > ${safe(note.excerpt)}`, "")
    }
    if (!p.researchNotes?.length) out.push("직접 참고할 사례를 충분히 찾지 못했습니다.", "")
    out.push("## 제안한 단계와 이유", "")
  }
  for (const b of p.stageBasis) {
    out.push(`### ${b.stageNo}. ${safe(bp!.stages.find(s => s.no === b.stageNo)?.title ?? "단계")}`, "",
      `**${p.mode === "research-informed" ? "목표에 맞춘 제안" : b.basis === "source" ? "자료에 근거한 단계" : "상황에 맞춰 추가한 단계"}** · ${safe(b.reason)}`, "")
    for (const support of b.support) {
      const s = p.sources.find(s => s.id === support.sourceId)
      if (s) out.push(`- ${link(s)} · ${support.supports === "stage" ? "단계" : support.supports === "order" ? "순서" : "선행 조건"} 근거`, `  > ${safe(support.excerpt)}`, "")
    }
  }
  out.push("## 검색에서 확인한 자료", "")
  for (const s of p.sources) out.push(`### ${safe(s.id)} · ${link(s)}`, "", safe(s.snippet), "", `검색어: ${s.queries.map(safe).join(" · ")} · 조회 ${safe(s.accessedAt)}`, "")
  out.push("## 검색 기록", "")
  for (const t of p.trace) out.push(`- ${safe(t.query)} · ${{ webkr: "웹", blog: "블로그", cafearticle: "카페" }[t.channel] ?? safe(t.channel)} · ${{ success: "검색 완료", empty: "결과 없음", error: "연결 실패" }[t.status]} · ${t.count}건`)
  for (const warning of p.warnings) out.push("", safe(warning))
  return { id: "planning-sources", kind: "summary", stageNo: 0, title: "단계를 정할 때 참고한 자료", subtitle: `선행 조사 자료 ${p.sources.length}건`, markdown: out.join("\n"), status: "done" }
}

/**
 * 인용 배치 — 모델이 심고 코드가 검사·보완한다 (6차 step-9, 사용자 확정 「둘 다」).
 *
 * 5차까지는 코드가 `findings.slice(0, 3)` 으로 앞 셋을 골라 `[1][2][3]` 을 **줄 끝에 몰아** 붙였다.
 * 사용자 판정 — 「관련된 문장의 뒤에 칩이 붙는 게 맞고, 같은 칩이 여러 문장에 붙을 수도 있는거고.
 * 3까지만 있을 이유도 없고. 다만 매 문장 다 붙는건 괴상하니까 좀 묶일 건 묶어서」.
 *
 * ⚠ **번호를 그대로 믿으면 배지가 엉뚱한 자료를 연다.** hermes 경로는 모델이 번호를 적은 **뒤에**
 *   `normalizeHermesFinding`·`hasSource` 가 자료를 걸러낸다(5차 실측 17건 중 9건). 모델의 `[3]` 이
 *   걸러진 목록의 셋째와 같을 이유가 없다. 그래서 여기서 **이름으로 대조하고 위치로 다시 매긴다.**
 *   `server/chat.mjs` 의 `splitCitations`·`stripCitationMarks` 와 같은 규칙이고, 그쪽은 서버(대화 경로),
 *   이쪽은 클라이언트(단계 경로)다 — 두 경로가 같은 계약을 쓴다.
 */
const CITATION_MODE = import.meta.env?.VITE_CITATION_MODE === "tail" ? "tail" : "model"

/** 이름 비교용 정규화 — 공백·문장부호를 걷고 소문자로. `chat.mjs` 의 `normName` 과 같은 뜻이다. */
function normCiteName(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[\s·,.()[\]{}「」『』"'`_\-–—]/g, "")
}
/** 느슨하게 맞춰 본다 — 한쪽이 비면 통과(맞춰 볼 거리가 없다), 포함 관계나 앞머리 4자 이상 일치면 같은 것으로 본다. */
function citeNameMatches(name: unknown, docName: unknown): boolean {
  const a = normCiteName(name)
  const b = normCiteName(docName)
  if (!a || !b) return true
  if (a === b || a.includes(b) || b.includes(a)) return true
  const head = Math.min(a.length, b.length, 8)
  return head >= 4 && a.slice(0, head) === b.slice(0, head)
}

export type GroundedStage = {
  /** 본문 마커가 **최종 번호로 다시 매겨진** 문장들 */
  verdictLine: string
  verdictReason: string
  /** `[n]` 의 n-1 이 가리키는 자료의 **원래 `findings` 인덱스**. 배지 id·제목이 이 순서를 따른다. */
  order: number[]
  /** 이름이 안 맞거나 없는 번호라서 버린 마커 수 — 지어내기 지표로 센다(step-16) */
  dropped: number
  /** `order` 중 **본문에 실제로 달린** 개수. 나머지(꼬리)는 결과 줄 끝의 마커가 받는다. */
  citedInBody: number
}

/**
 * 단계 하나의 인용을 정리한다.
 *
 * ① 본문(`verdictLine`·`verdictReason`)의 `[n]` 을 모은다 — 그 n 은 **모델이 본 `findings` 순서**다
 * ② 자료가 없는 번호, 이름이 안 맞는 번호는 **버리고 본문 마커도 뗀다**
 * ③ 살아남은 것을 **본문에 처음 나온 순서**로 다시 매긴다 — 읽는 순서와 배지 번호가 같아진다
 * ④ 한 번도 안 쓰인 자료는 `order` 꼬리에 붙는다 — 결과 줄 끝의 마커가 그것을 받는다
 *    (모델이 하나도 안 심어도 5차와 같은 모습이 된다 — 실패 모드 A)
 *
 * `CITATION_MODE=tail` 이면 본문 마커를 전부 떼고 앞 3개만 꼬리로 — **5차 동작 그대로**다.
 */
/**
 * **자료 이름이 그대로 적힌 문장에만 그 자료의 번호를 단다** (8차 마감 · 2026-09-16).
 *
 * ⚠ 왜 화면 쪽에도 있나 — 서버(`server/stage.mjs` `attachMarksByName`)가 같은 일을 하지만 그건 **로컬 조사 경로뿐**이다.
 *   2파 보강과 Hermes 경로는 그 코드를 안 지나서, 보강이 단계를 덮는 순간 본문 마커가 0이 됐다
 *   (2026-09-16 3회차 실측 — 보강이 덮은 1단계만 마커 0). 세 경로가 모두 지나는 자리가 여기다.
 * ⚠ 클라이언트는 서버 모듈을 import 하지 않는다(`APPROVE_LABEL` 과 같은 관례) — 계약이 같아야 하고,
 *   그 일치는 `citation-ground-probe` 가 두 파일을 같이 읽어 잰다.
 * ⚠ 지어내지 않는다: 이름이 문장에 없으면 안 붙이고, 한 자료는 한 번만 쓴다.
 */
export function attachMarksByName(text: string, cites: Array<{ n: number; name: string }>): string {
  const src = String(text ?? "")
  const list = cites.filter((c) => Number.isInteger(c.n) && c.n > 0 && String(c.name ?? "").trim().length >= 2)
  if (!src.trim() || !list.length) return src
  const used = new Set<number>()
  return src
    .split(/(?<=[.!?])(?=\s)|(?=\n)/)
    .map((part) => {
      if (/\[\d{1,2}\]/.test(part)) return part
      const hit = list.find((c) => !used.has(c.n) && part.includes(c.name))
      if (!hit) return part
      used.add(hit.n)
      const m = /^([\s\S]*?)([.!?]\s*)$/.exec(part)
      return m ? `${m[1]} [${hit.n}]${m[2]}` : `${part} [${hit.n}]`
    })
    .join("")
}

export function groundStageCitations(stage: Stage): GroundedStage {
  const findings = stage.findings ?? []
  let line = String(stage.verdictLine ?? "")
  let reason = String(stage.verdictReason ?? "")
  /**
   * ⑴ **마커가 하나도 없으면 이름 대조로 한 번 붙잡는다** (8차 마감 — 2026-09-16 3회차 실측).
   *   2파 보강이 단계를 덮으면 서버의 보정(`stage.mjs`)을 안 지나 본문 마커가 0이 된다.
   *   여기서 붙이면 **로컬·Hermes·보강 세 경로가 다 덮인다** — 아래 `pass()` 가 번호를 다시 매기므로
   *   원본 순번(1..n)으로 달아 두면 나머지는 기존 장치가 처리한다.
   * ⚠ 마커가 하나라도 있으면 **건드리지 않는다** — 모델이 심은 것을 존중한다.
   */
  if (findings.length && !/\[[^\]\s]{1,12}\]/.test(line) && !/\[[^\]\s]{1,12}\]/.test(reason)) {
    const cites = findings.map((f, i) => ({ n: i + 1, name: String(f.name ?? "") }))
    line = attachMarksByName(line, cites)
    reason = attachMarksByName(reason, cites)
  }
  if (CITATION_MODE === "tail") {
    const strip = (t: string) => t.replace(/\s*\[[^\]\s]{1,12}\]/g, "").trim()
    return { verdictLine: strip(line), verdictReason: strip(reason), order: findings.map((_, i) => i).slice(0, 3), dropped: 0, citedInBody: 0 }
  }
  // 모델이 `citations` 로 이름을 같이 냈으면 그것으로 대조한다. 안 냈으면 번호만으로 본다(옛 계약 호환).
  const claimed = new Map<number, unknown>()
  for (const c of stage.citations ?? []) {
    const n = Number((c as { n?: unknown })?.n)
    if (Number.isInteger(n) && n > 0 && !claimed.has(n)) claimed.set(n, (c as { name?: unknown })?.name)
  }
  const ok = new Set<number>()
  const bad = new Set<number>()
  const judge = (n: number): boolean => {
    if (!Number.isInteger(n) || n <= 0) return false // 숫자가 아닌 마커(`[r14]`)·0 이하 — 못 푼다
    if (ok.has(n)) return true
    if (bad.has(n)) return false
    const f = findings[n - 1]
    // 자료가 없는 번호는 지어낸 것이다. 이름을 같이 낸 번호는 그 이름이 맞아야 한다.
    const good = !!f && (!claimed.has(n) || citeNameMatches(claimed.get(n), f.name))
    ;(good ? ok : bad).add(n)
    return good
  }
  // ③ 본문에 처음 나온 순서로 새 번호를 준다
  const renumber = new Map<number, number>()
  const order: number[] = []
  let dropped = 0
  // ⚠ 앞 공백을 **따로 잡아 되돌려 준다.** `\s*` 를 그냥 소비하면 살린 마커에서 공백이 사라져
  //   「봤습니다 [1].」이 「봤습니다[1].」이 된다(6차 step-9 probe 가 잡았다). 버릴 때만 공백까지 먹는다 —
  //   그래야 「… 입니다 [5].」가 「… 입니다 .」로 남지 않는다(`server/chat.mjs` `stripCitationMarks` 와 같은 고민).
  // ⚠ **숫자가 아닌 마커도 잡는다.** 실측에서 모델이 `[r14]`·`[r20]` 처럼 **도구 결과 id** 를 마커로 썼다
  //   (프롬프트가 `findings[].id` 를 「도구 결과의 id」로 부르기 때문에 번호와 뒤섞인다).
  //   숫자만 잡으면 그것이 **화면에 그대로 글자로 남는다.** 못 푸는 마커는 버린 것으로 세고 뗀다.
  const pass = (t: string) =>
    t.replace(/(\s*)\[([^\]\s]{1,12})\]/g, (_whole, space: string, raw: string) => {
      const n = /^\d+$/.test(raw) ? Number(raw) : NaN
      if (!judge(n)) {
        dropped += 1
        return "" // 마커를 뗀다 — 남겨 두면 다시 매기면서 엉뚱한 자료의 배지가 된다
      }
      if (!renumber.has(n)) {
        order.push(n - 1)
        renumber.set(n, order.length)
      }
      return `${space}[${renumber.get(n)}]`
    })
  const outLine = pass(line)
  const outReason = pass(reason)
  // ④ 한 번도 안 쓰인 자료는 꼬리로 — 모델이 하나도 안 심어도 배지가 선다
  const citedInBody = order.length
  findings.forEach((_, i) => {
    if (!order.includes(i)) order.push(i)
  })
  return { verdictLine: outLine.trim(), verdictReason: outReason.trim(), order, dropped, citedInBody }
}

/**
 * 대화 인용 번호를 **세션 전역으로** (7차 step-8 · 5차 D4 의 대안).
 *
 * 무엇이 문제였나: `chat.mjs`·`explain.mjs` 가 답변마다 `[n]` 을 **1..k 로 다시** 매긴다.
 * 그래서 한 대화 안에서 `[1]` 이 답변마다 다른 자료를 가리키고, 앞 답변을 다시 읽는 사람은
 * 같은 번호가 같은 것을 뜻한다고 믿을 수가 없다.
 *
 * ⚠ **저장 문자열도 서버 계약도 안 바꾼다 — 렌더 시점에만 다시 매긴다.**
 *   저장본의 `[n]` 은 여전히 그 메시지의 `citationIds[n-1]` 을 가리키고, 그 짝이 배지가 무엇을 여는지의 정본이다.
 *   그래서 **옛 세션도 그대로 열린다**(5차·6차 저장본이 이 경로로 그려진다) — 번호만 이어져 보인다.
 *
 * 같은 자료는 **같은 번호**를 다시 쓴다(이어 세는 것이 아니라 전역 사전이다) — 그래야 번호가 자료의 이름 노릇을 한다.
 * 짝지을 값은 `id` 가 먼저고, 없으면 제목이다(옛 세션엔 `citationIds` 가 없다).
 */
export function globalCitationNumbers(
  messages: Array<{ citations?: Array<{ n: number; title: string; id?: string }> }>,
): Map<number, number>[] {
  const seen = new Map<string, number>()
  return messages.map((m) => {
    const map = new Map<number, number>()
    for (const c of m.citations ?? []) {
      const key = String(c.id ?? "") || `제목:${c.title}`
      if (!seen.has(key)) seen.set(key, seen.size + 1)
      map.set(c.n, seen.get(key)!)
    }
    return map
  })
}

/**
 * 본문의 `[n]` 과 인용 목록의 번호를 전역 번호로 갈아끼운다.
 * ⚠ **한 번에 바꾼다** — 하나씩 바꾸면 방금 쓴 번호를 다음 치환이 또 집는다(`[1]`→`[2]`→`[3]`).
 * 표에 없는 번호는 **건드리지 않는다** — 못 푸는 마커를 지우는 일은 이 함수의 몫이 아니다(`groundStageCitations` 가 한다).
 */
export function applyGlobalCitations<T extends { n: number; title: string; id?: string }>(
  text: string,
  citations: T[] | undefined,
  map: Map<number, number>,
): { text: string; citations: T[] | undefined } {
  if (!map.size) return { text, citations }
  const out = String(text).replace(/\[(\d{1,3})\]/g, (whole, d: string) => {
    const to = map.get(Number(d))
    return to ? `[${to}]` : whole
  })
  return { text: out, citations: citations?.map((c) => ({ ...c, n: map.get(c.n) ?? c.n })) }
}
