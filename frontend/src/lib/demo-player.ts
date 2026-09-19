/**
 * 데모 재생기 (M18 step-4) — **서버 없이** 앱을 완주시킨다.
 *
 * 왜: 대회가 끝나 공개 사이트에서 실 API·키를 걷어냈다. 화면과 흐름(`state/flow.ts`)은 그대로 두고
 * 데이터 진입점만 갈아끼워, 미리 녹화해 둔 응답을 같은 순서로 돌려준다.
 *
 * 매칭 축 — 순번으로 매칭할 수 있는 것은 셋뿐이다:
 *   순서   `grill`(turnCount 우선) · `pathfind` · `handoff`
 *   키     `stage`(stageIndex) · `channel-plan`·`outline`(stage.no) · `explain`(node.id)
 *          · `source-card`(finding.url ?? name)
 * 단계 조사는 동시 3 상한 풀로 돌아 **전역 호출 순번이 실행마다 달라진다** — 순번으로 맞추면
 * 5단계 결과가 2단계 칸에 들어가도 화면은 「완주」로 보인다(2026-09-20 검증자 지적, 코드 확인).
 */

export type DemoScenario = {
  id: string
  label: string
  hint: string
  opening: string | null
}

type Call = { key: string | null; ms: number; response: unknown }
type Bundle = DemoScenario & { allowed?: string[]; calls: Record<string, Call[]> }

export const DEMO = import.meta.env.VITE_DEMO === "1"

/** 재생 지연 — 실제 소요를 쓰되 기다림이 지루하지 않게 줄인다(하한은 흐름이 보이도록 둔다). */
const MIN_MS = 350
const MAX_MS = 2200
const SPEED = 0.45

let manifest: DemoScenario[] | null = null
let bundle: Bundle | null = null
/** 순서 매칭용 커서 — 엔드포인트마다 몇 번째 응답까지 썼나. */
const cursor: Record<string, number> = {}

export async function loadScenarios(): Promise<DemoScenario[]> {
  if (manifest) return manifest
  const res = await fetch("/demo/manifest.json")
  manifest = (await res.json()) as DemoScenario[]
  return manifest
}

/** 첫 발화로 시나리오를 고른다 — 카드 라벨이 곧 녹화의 첫 답이라 이것으로 갈린다. */
export async function selectScenarioByOpening(text: string): Promise<boolean> {
  const list = await loadScenarios()
  const hit = list.find((s) => s.opening && s.opening.trim() === text.trim())
  if (!hit) return false
  await selectScenario(hit.id)
  return true
}

export async function selectScenario(id: string): Promise<void> {
  if (bundle?.id === id) return
  const missing = new Error("이 예시는 데모에 담겨 있지 않습니다. 첫 화면에서 다른 예시를 골라 주세요.")
  const res = await fetch(`/demo/${encodeURIComponent(id)}.json`)
  if (!res.ok) throw missing
  /* ⚠ 없는 파일에도 **200 이 온다** — 정적 호스팅(vite preview·Vercel)이 SPA 폴백으로 `index.html` 을
     돌려주기 때문이다(2026-09-20 실측). 상태 코드로는 못 가리므로 파싱 실패를 「없음」으로 읽는다. */
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    throw missing
  }
  bundle = parsed as Bundle
  for (const k of Object.keys(cursor)) delete cursor[k]
}

export function activeScenario(): DemoScenario | null {
  return bundle
}

/**
 * 녹화가 실제로 밟은 선택지. 화면은 **이 목록에 없는 칩을 눌리지 않게 죽인다**
 * (2026-09-20 사용자 지시) — 데모는 이 길 하나만 재생할 수 있어서, 다른 칩을 누르면
 * 같은 응답이 나오고 묻는 말과 답이 어긋난다.
 * 화면이 스스로 처리하는 칩(승인·내려받기·다시 시작)은 여기 없고 호출 측이 따로 허용한다.
 */
export function allowedChoices(): string[] {
  return bundle?.allowed ?? []
}

export function resetScenario(): void {
  bundle = null
  for (const k of Object.keys(cursor)) delete cursor[k]
}

/** `/api/channel-plan` → `channel-plan` */
function endpointOf(path: string): string {
  return path.replace(/^\/api\//, "").replace(/\/.*$/, "")
}

function keyOf(endpoint: string, body: unknown): string | null {
  const req = (body ?? {}) as Record<string, any>
  switch (endpoint) {
    case "grill":
      return typeof req.turnCount === "number" ? String(req.turnCount) : null
    case "stage":
      return typeof req.stageIndex === "number" ? String(req.stageIndex) : null
    case "channel-plan":
    case "outline":
      return req.stage?.no != null ? String(req.stage.no) : null
    case "explain":
      return req.node?.id ?? req.node?.label ?? null
    case "source-card":
      return req.finding?.url || req.finding?.name || null
    default:
      return null
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 녹화된 응답 하나를 돌려준다. 네트워크를 타지 않는다.
 * 못 찾으면 그 엔드포인트의 첫 응답으로 떨어지고, 그것도 없으면 사람이 읽을 오류를 던진다.
 */
export async function playback<T>(path: string, body: unknown): Promise<T> {
  if (!bundle) throw new Error("데모에서는 첫 화면의 예시 가운데 하나를 골라 주세요.")

  const endpoint = endpointOf(path)
  const calls = bundle.calls[endpoint]
  if (!calls?.length) throw new Error("이 동작은 데모에 담겨 있지 않습니다. 첫 화면의 예시로 돌아가 주세요.")

  const key = keyOf(endpoint, body)
  let hit = key != null ? calls.find((c) => c.key === key) : undefined
  if (!hit && key != null && endpoint === "explain") {
    /* 노드 설명은 **아무거나 돌려주면 안 된다** — 키가 안 맞는데 첫 응답을 주면 5단계를 눌렀는데
       1단계 설명이 나온다(2026-09-20 실측). 없으면 없다고 말한다. */
    await wait(MIN_MS)
    return {
      explanation: "이 단계 설명은 데모 녹화에 담겨 있지 않습니다. 설명이 담긴 단계를 눌러 보세요.",
      citationTitles: [],
      citationIds: [],
      followups: [],
      degraded: true,
    } as T
  }
  if (!hit) {
    const n = cursor[endpoint] ?? 0
    hit = calls[Math.min(n, calls.length - 1)]
    cursor[endpoint] = n + 1
  }

  await wait(Math.min(MAX_MS, Math.max(MIN_MS, Math.round((hit.ms || 800) * SPEED))))
  return hit.response as T
}
