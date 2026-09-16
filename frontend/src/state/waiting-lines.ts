/**
 * 기다리는 동안 보이는 문구 (M5 확장 6차 step-6).
 *
 * 사용자 피드백(2026-09-15): 「이런 문구들도, 다양했으면 좋겠고, **조사하는거에 따라서 바뀌고** 그랬으면 좋겠어.
 * 어디를 조사하는 중.. 무엇을 찾는 중.. 종류 여러가지 있을거잖아.」
 *
 * 5차까지는 `App.tsx` 에 **하드코딩 3분기**였다 — 어느 회차든 같은 세 문장만 섰다.
 * 여기서 두 축으로 가른다:
 *   ① **단계**(인터뷰·뼈대·조사·설명) — 무엇을 하는 중인가
 *   ② **채널**(웹·후기·통계·법령·공공데이터·오픈소스) — 어디를 뒤지는 중인가
 *
 * ⚠ **문구를 바꿀 때 `App.tsx` 의 `SEARCH_LINE`·`ALWAYS_VISIBLE` 정규식을 같이 본다.**
 *   활동 줄인지·접으면 안 되는 줄인지를 그 둘이 **문구 모양으로** 가른다. 여기 문구가 그 모양을 벗어나면
 *   아코디언 아이콘이 틀리거나 결론 줄이 접혀 사라진다(5차에서 실제로 밟은 사고).
 *   그래서 **조사 계열 문구는 전부 `찾는 중…` 으로 끝낸다** — 이것이 이 파일과 그 정규식 사이의 계약이다.
 */

/** 채널 키 → 사람이 읽는 이름. 화면이 채널을 부르는 이름의 정본은 `docs/app-ux-copy.md` §3-A-2. */
export const CHANNEL_NAME: Record<string, string> = {
  web: "웹",
  web_review: "블로그·카페 후기",
  stats: "국가통계",
  law: "법령",
  public_data: "공공데이터",
  oss: "오픈소스",
}

/**
 * 채널마다 두 가지 말. 같은 채널이 두 단계에 걸쳐 나와도 같은 문장이 연달아 서지 않게 한다.
 * 전부 `찾는 중…` 으로 끝난다(위 계약).
 */
const CHANNEL_LINES: Record<string, string[]> = {
  web: ["웹에서 비슷한 사례를 찾는 중…", "웹 문서를 훑어 참고할 것을 찾는 중…"],
  web_review: ["먼저 해 본 사람의 후기를 찾는 중…", "블로그·카페에서 실제로 해 본 이야기를 찾는 중…"],
  stats: ["국가통계에서 숫자를 찾는 중…", "통계로 규모를 가늠할 자료를 찾는 중…"],
  law: ["관련 법령을 찾는 중…", "지켜야 할 규정이 있는지 법령에서 찾는 중…"],
  public_data: ["공공데이터에서 쓸 자료를 찾는 중…", "공공데이터포털을 뒤져 볼 만한 것을 찾는 중…"],
  oss: ["가져다 쓸 오픈소스를 찾는 중…", "이미 만들어 둔 코드가 있는지 찾는 중…"],
}

/** 채널을 모를 때(계획 조회 실패 등) 쓰는 말. 침묵보다 낫고, 거짓말은 아니다. */
const GENERIC_SEARCH = ["자료를 찾는 중…", "쓸 만한 것이 있는지 찾는 중…"]

/**
 * 단계별 대기 문구. 조사(`researching`)는 채널 계획이 있으면 그쪽을 쓰고, 여기 것은 계획이 비었을 때의 바닥이다.
 * ⚠ 「단계로 이뤄지는지」·「단계마다 직접 웹을」은 `ALWAYS_VISIBLE` 이 잡는 말이라 그 모양을 지킨다.
 */
const PHASE_LINES: Record<string, string[]> = {
  interview: [
    "다음 질문을 고르는 중…",
    "무엇을 더 여쭤볼지 고르는 중…",
    "지금까지 답해 주신 것을 정리하는 중…",
  ],
  skeleton: [
    "이 일이 보통 어떤 단계로 이뤄지는지 찾는 중…",
    "먼저 한 사람들이 어떤 순서로 했는지 찾는 중…",
    "큰 그림을 단계로 나눠 보는 중…",
  ],
  researching: [
    "단계마다 자료를 찾는 중…",
    "이 단계에 쓸 만한 것이 있는지 찾는 중…",
    "가져다 쓸 것과 직접 만들 것을 가르는 중…",
  ],
  explain: [
    "노드를 설명할 말을 고르는 중…",
    "이 항목이 무엇인지 풀어 쓰는 중…",
    "여쭤보신 것에 답할 말을 고르는 중…",
  ],
}

/**
 * 풀에서 하나를 고른다 — **회전**이지 무작위가 아니다.
 * 무작위면 같은 문장이 연달아 두 번 나올 수 있고, 그러면 「안 바뀌네」로 읽힌다.
 * `seed` 가 1 씩 오르면 문장도 한 칸씩 돈다.
 */
export function rotate(pool: string[], seed: number): string {
  if (!pool.length) return ""
  const i = ((Math.trunc(seed) % pool.length) + pool.length) % pool.length
  return pool[i]
}

/**
 * `Session.phase` → 문구 풀 이름.
 * ⚠ `types.ts` 의 `Phase` 는 다섯이고(`interview`·`confirm`·`skeleton`·`researching`·`ready`) 풀은 넷이다 —
 *   `ready` 에서 기다리고 있으면 그건 **노드 설명**이고, `confirm` 에서 기다리면 아직 인터뷰 꼬리다.
 *   풀 이름을 phase 와 같게 두지 않는 이유가 이것이다(화면이 하는 일과 상태 이름이 1:1 이 아니다).
 */
const PHASE_POOL: Record<string, keyof typeof PHASE_LINES> = {
  interview: "interview",
  confirm: "interview",
  skeleton: "skeleton",
  researching: "researching",
  ready: "explain",
}

/** 단계(phase)에 맞는 대기 문구. `seed` 로 회전한다. */
export function phaseLine(phase: string, seed: number): string {
  const pool = PHASE_LINES[PHASE_POOL[phase] ?? "explain"]
  return rotate(pool, seed)
}

/**
 * 조사 중 한 줄 — **어디를 뒤지는 중인지**를 말한다.
 * `channels` 는 `/api/channel-plan` 이 준 이 단계의 채널 키 목록이고, 비면 일반 문구로 내려간다.
 */
export function channelLine(channels: string[], seed: number): string {
  const known = channels.filter((c) => CHANNEL_LINES[c])
  if (!known.length) return rotate(GENERIC_SEARCH, seed)
  const channel = rotate(known, seed)
  // 채널을 고른 뒤 그 안에서 또 한 번 돈다 — 같은 채널이 다시 걸려도 같은 문장이 안 선다.
  return rotate(CHANNEL_LINES[channel], Math.trunc(seed / known.length))
}

/** 조사 시작 줄 — 이 단계가 어느 채널을 볼지 미리 알린다(`n. 제목 · 웹·법령을 찾는 중…`). */
export function stageSearchLine(no: number, title: string, channels: string[], seed: number): string {
  const names = channels.map((c) => CHANNEL_NAME[c]).filter(Boolean)
  if (!names.length) return `${no}. ${title} · ${rotate(GENERIC_SEARCH, seed)}`
  const head = names.slice(0, 3).join("·")
  return `${no}. ${title} · ${head}${names.length > 3 ? " 등" : ""}에서 찾는 중…`
}
