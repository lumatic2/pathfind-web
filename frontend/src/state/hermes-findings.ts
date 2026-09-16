/**
 * hermes 경로의 finding 손질과 활동 줄을 한 곳에 모은다.
 *
 * flow.ts 에서 extends 하겠냐는 물음이 있었는데 — 활동 줄은 HersemEvent 를 받아 문자열 하나를 내고,
 * finding 손질은 Finding 을 받아 Finding 을 낸다. 둘은 쓰는 쪽의 인자·반환 타입이 다르고,
 * flow.ts 에 두면 useFlow 콜백 안에서만 보이게 된다. 조사·보강 양쪽 경로가 같은 손질·같은 활동 줄을
 * 보게 하려면 별도 모듈이 맞다.
 *
 * 가져온다(from flow.ts): TOOL_TO_CHANNEL, FIXED_GRADE, hasSource, normalizeHermesFinding, activityLine.
 * 가져온다(from channel-host.ts): CHANNEL_HOST, hostMatchesChannel, looksLikeReview, resolveChannel, stripMcpPrefix.
 * 가져온다(from waiting-lines.ts): CHANNEL_NAME, channelLine.
 */

import type { Finding } from "./types"
import type { HermesEvent } from "@/lib/hermes"
import { CHANNEL_HOST, hostMatchesChannel, looksLikeReview, resolveChannel, stripMcpPrefix } from "@/state/channel-host"
import { CHANNEL_NAME, channelLine } from "@/state/waiting-lines"

/** hermes 가 부르는 도구 이름 → 앱 채널 키 (5차 step-18 · 6차 step-16).
 *
 * 5차 step-19 에서 앞가지 붙은 MCP 이름과 맨 이름을 둘 다 받는다 — 앞가지는 Hermes 내장 `web_search` 와의 충돌을 피하려고 붙였다.
 */
export const TOOL_TO_CHANNEL: Record<string, string> = {
  pathfind_web_search: "web",
  pathfind_web_review_search: "web_review",
  pathfind_oss_search: "oss",
  pathfind_public_data_search: "public_data",
  pathfind_stats_search: "stats",
  pathfind_law_search: "law",
  web_search: "web",
  web_review_search: "web_review",
  oss_search: "oss",
  public_data_search: "public_data",
  stats_search: "stats",
  law_search: "law",
}

/** 채널이 **고정 등급**을 가진 것만 적어 둔다 (5차 step-19).
 *
 * `local` 경로(`server/stage.mjs`)와 같은 자리라야 두 경로가 같은 등급을 붙인다 — 한쪽만 고치지 않는다.
 * 웹은 호스트마다 등급이 갈려(`gradeWeb`) 서버만 매길 수 있다 — 여기서 지어내지 않고 비워 둔다.
 */
export const FIXED_GRADE: Record<string, string> = { oss: "E2", public_data: "E1", stats: "E1", law: "E1" }

/** 출처가 없는 finding 을 버린다 (5차 step-18 실측).
 *
 * 실제 run 에서 모델이 **0건 검색에도 finding 을 지어냈다** — 「0건 반환 — …을 찾지 못함」을 근거로 적고 `url` 은 빈 문자열이었다.
 * `local` 경로는 카탈로그에 있는 결과만 `addFinding` 이 받아 이런 것이 애초에 못 들어오는데, hermes 경로에는 그 관문이 없었다.
 * 출처 없는 자료는 좌 패널에서 열 수도 없고 인용 배지의 근거도 못 된다 — 「못 찾았다」는 판정으로 말할 일이지 자료로 세울 일이 아니다.
 */
export function hasSource(f: Finding): boolean {
  return /^https?:\/\//.test(String((f as { url?: unknown }).url ?? "").trim())
}

/** hermes 가 돌려준 finding 하나를 앱 모양으로 (5차 step-18).
 *
 * 모델은 도구 이름(`law_search`)을 적으므로 채널 키(`law`)로 되돌리고, 채널이 고정 등급을 가진 것만 `grade` 를 채운다.
 * ⚠ 웹은 호스트마다 등급이 갈려(`gradeWeb`) 서버만 매길 수 있다 — 여기서 지어내지 않고 비워 둔다.
 */
export function normalizeHermesFinding(f: Finding): Finding {
  const raw = String((f as { channel?: unknown }).channel ?? "").trim()
  // 6차 step-16 — 모델은 **도구 앞가지 이름·채널 키·한국어 표시 이름**을 뒤섞어 적는다(라이브 완주 실측).
  // `resolveChannel` 이 셋을 다 받고, 못 알아보면 빈 문자열을 준다.
  const channel = resolveChannel(raw, TOOL_TO_CHANNEL) || (raw in FIXED_GRADE || raw === "web" || raw === "web_review" ? raw : "")
  if (!channel) {
    // ⚠ **모르는 이름을 그대로 통과시키지 않는다.** 5차는 `return f` 였고, 그래서 `channel: "웹문서"` 인 자료가
    //   7건 섰다 — 집계표에 없는 이름이라 화면에서 겉돈다. 채널을 지우면 채널 없는 웹 자료로 정상히 선다.
    const { channel: _unknown, grade: _unknownGrade, ...rest } = f as Finding & { channel?: string; grade?: string }
    return rest as Finding
  }
  const must = CHANNEL_HOST[channel]
  if (must) {
    let host = ""
    try { host = new URL(String((f as { url?: unknown }).url ?? "")).hostname } catch { /* 주소가 아니면 검사도 못 한다 */ }
    if (!hostMatchesChannel(host, must, channel)) {
      // 모델이 잘못 붙인 이름이다 — 지우고 등급도 달지 않는다. 자료 자체는 남는다(출처가 있으면 웹 자료로 선다).
      const { channel: _drop, grade: _dropGrade, ...rest } = f as Finding & { channel?: string; grade?: string }
      return rest as Finding
    }
  }
  // 6차 step-12 — **웹으로 온 것 중 후기 호스트는 후기로 올린다.** 모델이 갈래를 뭉개도(5차 실측 `web_review` 0건)
  // 호스트는 코드가 URL 에서 뽑는 값이라 틀릴 수가 없다. 반대 방향(후기 → 웹)은 하지 않는다.
  let finalChannel = channel
  if (channel === "web") {
    let host = ""
    try { host = new URL(String((f as { url?: unknown }).url ?? "")).hostname } catch { /* 주소가 아니면 그대로 */ }
    if (looksLikeReview(host)) finalChannel = "web_review"
  }
  const grade = String((f as { grade?: unknown }).grade ?? "").trim() || FIXED_GRADE[finalChannel] || ""
  return { ...f, channel: finalChannel, ...(grade ? { grade } : {}) }
}

/** 이벤트 한 개 → 중앙에 흐를 활동 줄 한 개. 흘릴 게 없으면 null.
 *
 * 6차 step-6 — **도구 이름을 날것으로 흘리지 않는다.** 종전에는 `pathfind_law_search · 목공 안전` 처럼
 * 내부 식별자가 그대로 화면에 섰다. 사람이 읽는 자리라 채널 이름으로 옮긴다(`법령`).
 * 모르는 도구만 종전대로 이름을 보인다 — 새 도구가 늘었을 때 **아무 말도 안 하는 것보다는 낫다**.
 */
export function activityLine(event: HermesEvent): string | null {
  if (event.event !== "tool.started") return null
  const preview = String(event.preview ?? "").replace(/\s+/g, " ").trim()
  if (!event.tool) return null
  // 6차 step-16 — Hermes 는 MCP 도구를 `mcp__<서버>__<도구>` 로 부른다(라이브 완주 실측).
  // 앞가지를 안 떼면 조회가 빗나가 **내부 식별자가 그대로 화면에 흐른다**(`mcp__pathfind_channels__pathfind_web_search · 목공`).
  const channel = TOOL_TO_CHANNEL[stripMcpPrefix(event.tool)]
  if (channel) {
    const name = CHANNEL_NAME[channel] ?? channel
    return preview ? `${name}에서 「${preview.slice(0, 40)}」로 찾는 중…` : channelLine([channel], 0)
  }
  /** 우리 채널 도구가 아니면 **줄을 만들지 않는다** (6차 하이브리드 라이브 실측). */
  return null
}
