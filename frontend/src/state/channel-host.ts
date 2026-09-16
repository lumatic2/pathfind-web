/**
 * 채널 호스트 대조 (6차 step-10 — 메인 세션 코드 리뷰의 막는 지적).
 *
 * hermes 경로는 모델이 자기 결과에 `channel` 을 적는데 **그 말을 못 믿는다** — 5차 실측에서
 * 17건 중 9건이 호스트와 어긋났다(「KOSIS 통계」라면서 숨고 레슨 가격, 「공공데이터」라면서 서울 열린데이터).
 * 여기가 그 거짓말을 걸러 내는 관문이고, 통과한 것에는 **`E1`(공식 1차) 등급이 붙는다.**
 * 그래서 뚫리면 화면에 선 근거 등급이 그대로 거짓이 된다 — 랜딩이 「국가통계」를 약속하는 자리다.
 *
 * ⚠ 5차는 `host.endsWith(must)` 였다. **접미 일치라 뚫린다**:
 *   `easylaw.go.kr`.endsWith(`law.go.kr`) → true  (의도한 통과)
 *   `notkosis.kr`.endsWith(`kosis.kr`)    → true  (의도 **안 한** 통과)
 *   `law.go.kr.evil.com` 도 같은 구멍으로 들어온다 — 남의 도메인이 우리 것을 앞가지로 쓰면 그만이다.
 *
 * 그래서 **정확히 같거나 그 도메인의 하위 도메인**일 때만 통과시킨다.
 * 순수 함수만 두는 이유는 스크립트가 그대로 태워 전수로 잴 수 있게 하기 위해서다(`scripts/host-match-probe.mjs`).
 */

/** 채널마다 **와야 하는** 호스트. 여기 없는 채널(웹·후기)은 아무 호스트나 올 수 있어 검사하지 않는다. */
export const CHANNEL_HOST: Record<string, string> = {
  oss: "github.com",
  stats: "kosis.kr",
  law: "law.go.kr",
  public_data: "data.go.kr",
}

/**
 * 규칙을 좁히면서 **잃으면 안 되는 정상 출처**를 이름으로 적어 둔다.
 * `easylaw.go.kr`(찾기 쉬운 생활법령)은 5차 실측에서 실제로 걸린 국가법령정보 계열인데
 * `law.go.kr` 의 하위 도메인이 아니라 새 규칙에 안 걸린다.
 * 「스키마 거부의 거짓 양성은 거짓 음성보다 비싸다」 — 정상 자료가 증발하는 쪽이 더 비싸다.
 */
export const CHANNEL_HOST_ALLOW: Record<string, string[]> = {
  law: ["easylaw.go.kr"],
}

/** 이 호스트가 그 채널의 것인가. 빈 호스트(주소가 아니라 못 뽑은 경우)는 통과시키지 않는다. */
export function hostMatchesChannel(host: string, must: string, channel: string): boolean {
  if (!host || !must) return false
  if (host === must || host.endsWith(`.${must}`)) return true
  return (CHANNEL_HOST_ALLOW[channel] ?? []).some((a) => host === a || host.endsWith(`.${a}`))
}

/**
 * 호스트만 보고 **후기인지** 가른다 (6차 step-12).
 *
 * `pathfind_web_search` 는 웹문서와 블로그·카페를 함께 물어 오고 **항목마다 `channel` 을 실어 준다**
 * (`server/stage.mjs` `searchWebBundle`). 그런데 hermes 경로는 모델이 그 값을 옮겨 적어야 하고,
 * 5차 프롬프트가 「결과를 준 **도구 이름**을 channel 로 적으라」고 해서 그 갈래가 통째로 `web` 으로 뭉개졌다
 * — 실측에서 `web_review` 가 **0건**이었던 이유다(local 은 1건).
 *
 * 프롬프트도 고치지만(항목의 `channel` 을 그대로 옮기게) **모델 말을 안 믿는 층이 하나 더 있어야 한다.**
 * 호스트는 코드가 URL 에서 뽑는 값이라 틀릴 수가 없다.
 *
 * ⚠ 이 판정은 **웹으로 온 것을 후기로 올릴 때만** 쓴다. 반대(후기를 웹으로 내림)는 하지 않는다 —
 *   블로그가 아닌 호스트의 후기(개인 도메인 등)를 지워 버리게 된다.
 */
export function looksLikeReview(host: string): boolean {
  const h = String(host ?? "").toLowerCase()
  if (!h) return false
  // 등급표(`gradeWeb`)가 E4·E5 로 매기는 것과 같은 계열이다 — 두 곳이 갈라지지 않게 같은 낱말을 쓴다.
  return /(^|\.)cafe\.naver\.com$|(^|\.)blog\.naver\.com$|(^|\.)post\.naver\.com$|tistory\.com$|velog\.io$|brunch\.co\.kr$|(^|\.)medium\.com$/.test(h)
}

/**
 * 모델이 적은 채널 이름 → 앱의 채널 키 (6차 step-16 라이브 hermes 완주에서 발견).
 *
 * ⚠ **모델은 세 가지를 뒤섞어 적는다.** 실측에서 이렇게 나왔다:
 *   · `mcp__pathfind_channels__pathfind_web_search`  — Hermes 가 MCP 도구에 붙이는 **앞가지 이름**
 *   · `web` · `law`                                   — 우리 채널 키(시킨 대로)
 *   · `웹문서` · `블로그·카페 후기`                    — **한국어 표시 이름**(도구 설명에서 옮겨 적은 것)
 *
 * 5차의 `TOOL_TO_CHANNEL` 은 가운데 것만 알았고, **모르는 값은 그대로 통과**시켰다(`if (!channel) return f`).
 * 그래서 `channel: "웹문서"` 인 자료가 7건 섰다 — 집계표(`CHANNEL_SHORT`)에 없는 이름이라 화면에서 겉돈다.
 *
 * 여기서 셋을 다 받고, **그래도 모르면 빈 문자열**을 돌려준다 — 부르는 쪽이 채널을 **지운다**.
 * 지어낸 이름을 달고 서는 것보다 채널 없는 웹 자료로 서는 쪽이 낫다(「0건이 틀린 1건보다 낫다」와 같은 규칙).
 */
const DISPLAY_TO_CHANNEL: Record<string, string> = {
  // 화면·문서가 쓰는 이름 전부 (derive.CHANNEL_LABEL · CHANNEL_SHORT · waiting-lines.CHANNEL_NAME)
  "웹": "web", "웹 검색": "web", "웹문서": "web", "웹 문서": "web", "네이버 웹문서": "web",
  "후기": "web_review", "블로그·카페 후기": "web_review", "블로그": "web_review", "카페": "web_review", "시행착오 후기": "web_review",
  "오픈소스": "oss", "오픈소스(GitHub)": "oss", "github": "oss",
  "공공데이터": "public_data", "공공데이터포털": "public_data",
  "통계": "stats", "국가통계": "stats", "국가통계(KOSIS)": "stats", "kosis": "stats",
  "법령": "law", "국가법령정보": "law",
}

/** `mcp__<서버>__<도구>` 의 앞가지를 뗀다. 안 붙어 있으면 그대로 돌려준다. */
export function stripMcpPrefix(name: string): string {
  return String(name ?? "").replace(/^mcp__[A-Za-z0-9_]+?__/, "")
}

/**
 * 모델이 적은 값을 채널 키로. 못 알아보면 **빈 문자열**(부르는 쪽이 채널을 지운다).
 * `toolMap` 은 `flow.ts` 의 `TOOL_TO_CHANNEL` 을 그대로 받는다 — 도구 이름표를 두 벌로 만들지 않는다.
 */
/** 앱이 아는 채널 키. 모델이 시킨 대로 키를 적었을 때 그것을 못 알아보면 안 된다(probe 가 잡았다). */
const CHANNEL_KEYS = new Set(["web", "web_review", "oss", "public_data", "stats", "law"])

export function resolveChannel(raw: unknown, toolMap: Record<string, string>): string {
  const t = stripMcpPrefix(String(raw ?? "").trim())
  if (!t) return ""
  // 채널 키를 **먼저** 본다 — `toolMap` 은 도구 이름표라 키가 없다(5차엔 `flow.ts` 가 뒤에서 덮고 있어 안 드러났다).
  if (CHANNEL_KEYS.has(t)) return t
  if (toolMap[t]) return toolMap[t]
  const lower = t.toLowerCase()
  if (toolMap[lower]) return toolMap[lower]
  if (DISPLAY_TO_CHANNEL[t]) return DISPLAY_TO_CHANNEL[t]
  if (DISPLAY_TO_CHANNEL[lower]) return DISPLAY_TO_CHANNEL[lower]
  return ""
}
