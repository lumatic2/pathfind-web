/**
 * 참조 구현의 상태 모양. 로드맵(`docs/dev-roadmap-for-hermes.md` §상태)이 이 파일의 이름·필드·타입을
 * 그대로 서술한다 — 여기를 고치면 로드맵도 같이 고친다.
 */

/** 서버 계약(`pathfind-web/docs/api-contract.md`)이 소유하는 모양 — 우리가 정하지 않는다. */
export type Verdict = "가져다 써도 됨" | "직접 해야 함" | "섞어야 함" | "선례를 못 찾음"

/**
 * `grade`·`channel` 은 옵셔널(4차 보강 2 step-20 — 로컬 `/api/stage` 가 채운다. 프로덕션 응답에는 없다).
 * `grade` = 근거 등급 E1~E5(리서치 플레이북 §1 — E1 법령·통계·공공데이터, E2 공식 1차, E3 2차·뉴스, E4 블로그·개인, E5 커뮤니티).
 * `channel` = `web` | `public_data` | `stats` | `law`.
 */
export type Finding = { kind: string; name: string; query: string; evidence: string; note: string; url: string; grade?: string; channel?: string }
/**
 * 조사 범위(옵셔널, step-20) — 모델이 고른 claim 유형과 실제로 부른 채널·호출 수. 단계 요약 문서의 「조사 범위」 줄이 된다.
 * `planned` = 코드 규칙이 미리 돌린 채널(2026-09-14 — 채널 선택은 모델이 아니라 규칙). `channels` 는 결과가 온 채널이라 `planned` 와 다를 수 있다.
 */
/**
 * 채널 한 줄 집계 (7차 step-7). `returned` 는 채널이 준 수, `gated` 는 **관련성 관문이 버린 수**(step-4),
 * `picked` 는 최종 자료로 선 수다. 셋이 갈라져 있어야 「0건이라 안 나온 것」과 「받았는데 버려진 것」이 구분된다.
 */
export type ChannelTally = { channel: string; calls: number; returned: number; gated: number; picked: number }
/** 본문 마커가 0이라 **한 번 더 물었을 때**의 결과 (7차 step-5). `null`(안 함)은 필드 자체가 없다. */
export type CiteRetry = "ok" | "failed"
/**
 * `vetRejected` 는 뜻 판정(E1 자료·최소 보장 후보)이 버린 자료 수 (8차 step-1) — 7차까지 롤백 방아쇠가 읽던 `dropped` 는 저장본에 없는 필드였다.
 * `vetTimeout` 은 그 판정이 **한도에 걸려** 잃은 자료 수 (8차 step-2). 0 이 아니면 그 단계는 판정 때문에 자료를 잃었다.
 */
export type StageScope = { claimType: string; channels: string[]; calls: number; queries?: string[]; planned?: string[]; channelTally?: ChannelTally[]; vetRejected?: number; vetTimeout?: number; citeRetry?: CiteRetry }
export type Task = { order: number; task: string; why: string }
export type Todo = { task: string; owner: "가져다 씀" | "직접 함"; note: string }

export type Stage = {
  no: number
  title: string
  desc: string
  icon: string
  tasks: Task[]
  choices: string[]
  verdict?: Verdict
  /**
   * 화면에 굵게 서는 **판정 문장** — 모델이 쓴다 (6차 step-7, 사용자 피드백 E).
   * ⚠ `verdict`(계약 값 4종)와 **다른 층이다.** 계약 값은 저장·마인드맵 점·옛 세션 호환이 걸린 값이라 안 바꾸고,
   *   이 필드는 그 뜻을 사람 말로 옮긴 한 문장이다. 없으면 `derive.VERDICT_SENTENCE` 의 고정 문장으로 내려간다
   *   (옛 세션이 그 경로로 그려진다 — 5차까지의 저장본에는 이 필드가 없다).
   */
  verdictLine?: string
  verdictReason?: string
  /**
   * 모델이 댄 근거 목록 (6차 step-9). `n` 은 **모델이 본 `findings` 순서**이고 `name` 은 대조용이다.
   * 저장되기 전에 `derive.groundStageCitations` 가 이름을 대조해 못 믿을 번호를 버리고 남은 것을 다시 매기므로,
   * 저장본의 이 값은 **기록용**이다(화면은 본문의 `[n]` 만 본다).
   */
  citations?: Array<{ n?: unknown; name?: unknown }>
  findings?: Finding[]
  options?: string[]
  todos?: Todo[]
  searched?: boolean
  scope?: StageScope
}

export type Planning = {
  version: 1
  mode?: "research-informed"
  researchNotes?: Array<{ sourceId: string; excerpt: string }>
  researchedAt: string
  basisSummary: string
  sources: Array<{ id: string; title: string; url: string; snippet: string; queries: string[]; channel: string; accessedAt: string; readScope: "search-snippet" }>
  stageBasis: Array<{ stageNo: number; reason: string; sourceIds: string[]; basis: "source" | "adaptation"; support: Array<{ sourceId: string; excerpt: string; supports: "stage" | "order" | "prerequisite" }> }>
  trace: Array<{ query: string; channel: string; status: "success" | "empty" | "error"; count: number; elapsedMs: number }>
  warnings: string[]
  requestId: string
  events: Array<{ name: string; elapsedMs: number }>
  groundingChecks: Array<{ stageNo: number; relevant: boolean; procedural: boolean; supported: boolean; orderClaim?: boolean; adaptationJustified?: boolean; constraintsMet: boolean; reason: string }>
}

export type BigPicture = {
  title: string
  intro: string
  stages: Stage[]
  prototypeLoop: string
  planning?: Planning
}

/**
 * 인터뷰 선택지 하나 (5차 step-5). 서버는 이 모양으로 내고 **추천은 정확히 하나**다.
 *
 * ⚠ `exampleButtons` 는 `Session.pending` 안에 있고 `store.ts` 가 세션을 통째로 `pathfind.session.v5` 로 저장한다.
 *   그래서 **좁히지 않고 넓혔다** — 옛 저장본의 `string[]` 이 그대로 읽히고, 흡수는 저장이 아니라 렌더에서 한다
 *   (`derive.ts` `normalizeChoices`). 모양을 갈아치웠으면 v5 스키마가 바뀌어 저장된 인터뷰가 죽는다.
 */
export type GrillChoice = {
  label: string
  /** 그 방향을 고르면 무엇이 좋은지 한 구. 모델이 빼먹을 수 있어 빈 문자열을 허용한다 */
  why?: string
  recommended?: boolean
}

export type GrillTurn = {
  questionTitle: string
  questionBody: string
  suggestion: string
  exampleButtons: Array<string | GrillChoice>
  answer: string
}

export type GrillResponse = {
  questionTitle: string
  questionBody: string
  suggestion: string
  exampleButtons: Array<string | GrillChoice>
  done: boolean
  summary?: string
  /**
   * 조사 시작 줄 (5차 step-7). 인터뷰가 끝나는 그 응답에 **얹어서** 온다 — 새 호출은 0 이다.
   * 비면 `flow.ts` 가 고정 문장(「먼저 이 일이 보통 어떤 단계로 …」)으로 돌아간다.
   */
  opening?: string
  turnCount: number
}

/** 여기부터는 참조 구현이 정하는 모양. */

/** 앱이 지나는 5단계. 화면 셋(좌·중·우)이 전부 이 값으로 갈린다. */
export type Phase =
  | "interview"    // 인터뷰 진행 중 (최대 5턴)
  | "confirm"      // 맥락 요약 승인 대기 — 승인 전에는 검색이 시작되지 않는다
  | "skeleton"     // /api/pathfind 진행 중 — 단계 골격을 받는 중
  | "researching"  // 단계별 /api/stage 진행 중 (동시 3 상한)
  | "ready"        // 전 단계 완료 — 노드 설명·내보내기 가능

export type StageRunStatus = "pending" | "running" | "done" | "failed"

/**
 * 소주제 트리(4차 보강 step-13) — 단계 항목(자료·할 일·역할 나눔)을 뜻이 가까운 것끼리 묶은 것. `items` 의 ref 는
 * `finding-<i>` · `task-<i>` · `todo-<i>` 로 항목 잎 id 규약(`s<no>-finding-<i>` …)과 같은 인덱스다. 최대 2층.
 */
export type OutlineTopic = { title: string; items: string[]; topics?: OutlineTopic[] }

export type StageSlot = {
  status: StageRunStatus
  stage: Stage
  /** 실패 사유 한 줄. 실패해도 다른 단계를 죽이지 않는다. */
  error?: string
  /** 소주제 트리(옵셔널 — 없으면 항목이 단계 바로 아래). 단계가 `done` 되는 순간 `/api/outline` 이 채운다 */
  outline?: OutlineTopic[]
}

/**
 * 좌 패널 문서 1장 (3차 step-3, 사용자 피드백 D — 「ClubPay 를 찾았으면 그 리서치 결과물 MD 가 있어야」).
 * `kind: "stage"` = 단계 요약 문서(그룹 행), `kind: "finding"` = 그 단계가 찾은 자료 1건의 문서(자료 행).
 * 단계 문서가 `children` 으로 자료 문서를 든다 — 목록은 단계로 묶이고 그 아래 자료마다 한 장씩 선다.
 */
export type SourceDoc = {
  id: string              // `stage-<no>` | `stage-<no>-finding-<i>` | `stage-<no>-task-<i>` | `stage-<no>-todo-<i>` | 폴더 `stage-<no>-t<i>[-<j>]`
  /**
   * `stage` = 폴더이자 요약 노트 · `folder` = 소주제 폴더(문서 없음, 4차 보강 step-14) · `finding` = 자료 노트 ·
   * `item` = 할 일·역할 나눔 노트(4차 보강 2 step-16 — 마인드맵 잎과 출처 노트를 1:1 로. 사실만, 카드 채움 없음)
   */
  kind: "stage" | "finding" | "folder" | "item" | "summary"
  // 4차 보강 3 step-24: 파일 시스템 하나 — `stage` 는 **폴더**(문서 없음), 그 첫 파일이 `summary`(단계 요약). 폴더는 폴더만, 파일은 파일만.
  stageNo: number
  title: string           // 단계: `<no>. <stage.title>` · 자료: `finding.name`
  markdown: string        // 카드를 열면 보이는 본문
  /** 자료 문서의 목록 행 부제 — `Finding.kind`(도구·서비스·글…). 판정·자료 수가 아니다. */
  subtitle?: string
  /** 자료 문서의 바깥 링크 */
  url?: string
  /** 자료 문서만 — 근거 한 줄(`Finding.evidence`). 인용 카드가 본문 대신 이것을 보여 준다(4차 step-1) */
  evidence?: string
  /** 단계 문서만 — 자료 문서에는 없어서 「못 찾음 · 자료 0건」이 자료 행에 붙지 않는다 */
  findingCount?: number
  verdict?: Verdict
  /** 카드가 채워졌나 — 「조사 중」 카드도 자리를 잡는다 */
  status: StageRunStatus
  /** 단계 문서 아래 자료 문서들 */
  children?: SourceDoc[]
}

export type ChatRole = "user" | "assistant"
export type ChatEntry = {
  id: string
  role: ChatRole
  text: string
  /** 승인 카드·노드 설명처럼 특별히 그려야 하는 말풍선의 종류. `chat` = 조사 끝난 뒤 로드맵 대화 답변(4차 step-6) */
  kind?: "question" | "summary-approval" | "progress" | "node-explain" | "chat"
  /** 이 말풍선 아래에 띄울 칩(예시 답변 버튼 · 승인/수정) */
  suggestions?: string[]
  citationTitles?: string[]
  /**
   * `citationTitles` 와 같은 순서의 좌 패널 자료 문서 id(`stage-<no>-finding-<i>`) — 4차 step-1.
   * 옵셔널이다(`version: 5` 유지): 없는 옛 세션은 제목 일치로 폴백한다.
   */
  citationIds?: string[]
  /**
   * 「조사 과정」 아코디언으로 **접지 않는다**는 표식 (5차 step-7).
   *
   * 접힘 판정은 원래 문자열 허용목록(`App.tsx` `ALWAYS_VISIBLE`)이 했는데, 그건 **문구를 미리 알 때만** 쓸 수 있다.
   * 조사 시작 줄이 모델이 짓는 문장으로 바뀌면서 허용목록에 걸릴 수가 없어졌다 — 그래서 그 한 줄만 표식으로 가른다.
   * 옵셔널이다(`version: 5` 유지): 없는 옛 세션은 종전대로 허용목록으로만 판정된다.
   */
  pinned?: boolean
}

export type ExportState = { roadmapMarkdown: string | null; title: string | null; busy: boolean }

/** Hermes run 의 상태값 — 게이트웨이 계약 그대로다(`research/2026-09-13-hermes-gateway-contract.md` §5). */
export type HermesRunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"

export type Session = {
  /** localStorage 스키마 버전. 올리면 옛 저장본은 버린다. */
  version: 5
  phase: Phase
  /** 인터뷰 */
  turnCount: number
  history: GrillTurn[]
  pending: GrillResponse | null   // 화면에 떠 있는 현재 질문
  summary: string
  /** 결과 */
  bigPicture: BigPicture | null
  stages: StageSlot[]
  /** 대화 */
  messages: ChatEntry[]
  /** 사람이 고친 노트북 제목. null 이면 bigPicture.title 을 쓴다 */
  mapTitle: string | null
  /** 마인드맵 */
  expandedIds: string[]
  selectedId: string | null
  /** 지금 붙어 있는 Hermes run. 새로고침하면 이 값으로 다시 붙는다(없으면 4함수 경로) */
  runId: string | null
  runStatus: HermesRunStatus | null
  /** 이 run 에서 이미 읽은 이벤트 수 — 재접속 커서다 */
  runCursor: number
  /** 지금 조사 중인 단계의 실시간 활동. 좌 카드가 이 값으로 「조사 중」을 채운다 */
  runActivity: { stageNo: number; searches: number; lastQuery: string } | null
  /** 이번 조사가 어느 경로로 도나. 소요 안내 문구가 여기서 갈린다(§2-5) */
  researchPath: "hermes" | "local" | null
  /**
   * **2파 보강이 도는 중인가** (6차 하이브리드 ⓐ).
   * 1파(4함수)가 끝나면 답은 이미 다 차 있고 화면은 `ready` 다 — 그 뒤로 Hermes 가 약한 단계만
   * 다시 캐 오는 구간이 이 값이다. `busy` 와 다르다: 사용자는 이 동안 앱을 그대로 쓸 수 있다.
   */
  reinforcing: boolean
  /** 429 를 만나 동시 호출을 1로 내렸나 */
  degraded: boolean
  /** 화면 전역 오류 한 줄 (재시도 버튼이 붙는다) */
  error: string | null
  busy: boolean
  exportState: ExportState
  /**
   * 자료 카드 본문(4차 보강 step-12) — 자료 문서 id → 채워진 마크다운. 문서를 처음 열 때 `/api/source-card` 가 채우고
   * 여기 굳는다(다시 열면 호출 0). 옵셔널이라 `version: 5` 그대로.
   */
  sourceCards?: Record<string, string>
  /** 좌 패널에서 펼쳐 둔 행 id(단계·소주제 폴더). 없으면 단계는 펼침·소주제는 접힘(4차 보강 step-14). 옵셔널 — v5 유지 */
  sourceExpandedIds?: string[]
  /**
   * 조사 시작 줄 (5차 step-7) — 인터뷰 마지막 응답이 얹어 보낸 한 줄. 승인 → 조사 시작 사이를 건너야 해서 세션에 둔다.
   * 옵셔널 — v5 유지. 없으면 고정 문장으로 돌아간다
   */
  opening?: string
  /** 보관 목록(`pathfind.roadmaps.v1`)에서 이 로드맵을 가리키는 id — 처음 보관될 때 생긴다(4차 보강 2 step-18). 옵셔널 — v5 유지 */
  planningAttempt?: { approved: true; summary: string; status: "pending" | "failed" | "succeeded" }
  id?: string
}

export const INITIAL_SESSION: Session = {
  version: 5,
  phase: "interview",
  turnCount: 0,
  history: [],
  pending: null,
  summary: "",
  bigPicture: null,
  stages: [],
  messages: [],
  mapTitle: null,
  expandedIds: [],
  selectedId: null,
  runId: null,
  runStatus: null,
  runCursor: 0,
  runActivity: null,
  researchPath: null,
  reinforcing: false,
  degraded: false,
  error: null,
  busy: false,
  exportState: { roadmapMarkdown: null, title: null, busy: false },
}
