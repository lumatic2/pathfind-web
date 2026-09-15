// 경로가 대략 맞는 방향인지 판정하는 4가지 고정 값. 서버 계약·저장과 동일 문자열.
export type Verdict = "가져다 써도 됨" | "직접 해야 함" | "섞어야 함" | "선례를 못 찾음"

// Verdict를 계약 순서 그대로 담은 읽기 전용 배열.
export const VERDICTS: readonly Verdict[] = [
  "가져다 써도 됨",
  "직접 해야 함",
  "섞어야 함",
  "선례를 못 찾음",
] as const

// 조사 채널이 돌려준 하나의 자료 카드. grade, channel 은 조사 후 채워진다.
export type Finding = {
  kind: string
  name: string
  query: string
  evidence: string
  note: string
  url: string
  grade?: "E1" | "E2" | "E3" | "E4" | "E5"
  channel?: "web" | "oss" | "public_data" | "stats" | "law"
}

// 단계 조사할 때 서버가 쓰는 검색 범위. planned 는 코드 규칙이 미리 돌린 채널, channels 는 결과가 온 채널이라 다를 수 있다.
export type StageScope = {
  claimType: string
  channels: string[]
  calls: number
  queries?: string[]
  planned?: string[]
}

// 큰 그림에서 한 단계가 책임질 개별 할 일.
export type Task = { order: number; task: string; why: string }

// 단계 안에서 이미 있는 것과 직접 할 것을 owner 표기로 나눈 항목.
export type Todo = { task: string; owner: "가져다 씀" | "직접 함"; note: string }

// 한 단계의 골격. verdict·findings·options·todos·searched·scope 는 조사 후 채워진다.
export type Stage = {
  no: number
  title: string
  desc: string
  icon: string
  tasks: Task[]
  choices: string[]
  verdict?: Verdict
  verdictReason?: string
  findings?: Finding[]
  options?: string[]
  todos?: Todo[]
  searched?: boolean
  scope?: StageScope
}

// 인터뷰 요약을 받아 서버가 처음 주는 큰 그림과 단계 골격.
export type BigPicture = {
  title: string
  intro: string
  stages: Stage[]
  prototypeLoop: string
}

// 그릴 선택지 하나. 서버가 새 저장본에 주는 형태(label + why + recommended)와 옛 저장본의 문자열 둘 다 받을 수 있게 한다.
export type GrillChoice = {
  label: string
  why: string
  recommended: boolean
}
export type GrillTurn = {
  questionTitle: string
  questionBody: string
  suggestion: string
  exampleButtons: string[] | GrillChoice[]
  answer: string
}

// 그릴 한 턴 응답. done=true 이면 summary 가 들어온다. done 이면 opening 이 함께 올 수 있다.
export type GrillResponse = {
  questionTitle: string
  questionBody: string
  suggestion: string
  exampleButtons: string[] | GrillChoice[]
  done: boolean
  summary?: string
  opening?: string
  turnCount: number
}

// 앱이 거치는 화면 국면. interview → confirm → skeleton → researching → ready.
export type Phase = "interview" | "confirm" | "skeleton" | "researching" | "ready"

// 한 단계 조사 실행의 상태.
export type StageRunStatus = "pending" | "running" | "done" | "failed"

// 조사 후 단계 안에서 folder/leaf로 펼쳐진 개요 트리. items 의 ref 는 finding-<i> | task-<i> | todo-<i>.
export type OutlineTopic = {
  title: string
  items: string[]
  topics?: OutlineTopic[]
}

// 앱 좌측 패널이 한 단계를 담는 슬롯. status 로 조사 진행을, outline 으로 펼쳐진 개요를 함께 둔다.
export type StageSlot = {
  status: StageRunStatus
  stage: Stage
  error?: string
  outline?: OutlineTopic[]
}

// 대화창에 쌓이는 메시지 역할.
export type ChatRole = "user" | "assistant"

// 대화창 한 줄. kind 로 질문·승인·진행·노드 설명·일반 대화를 구분한다.
export type ChatEntry = {
  id: string
  role: ChatRole
  text: string
  kind?: "question" | "summary-approval" | "progress" | "node-explain" | "chat"
  suggestions?: string[] | GrillChoice[]
  citationTitles?: string[]
  citationIds?: string[]
}

// 왼쪽 패널에 쌓이는 문서·폴더 노드. children 이 있으면 폴더, 없으면 잎.
export type SourceDoc = {
  id: string
  kind: "stage" | "folder" | "finding" | "item" | "summary"
  stageNo: number
  title: string
  markdown: string
  subtitle?: string
  url?: string
  evidence?: string
  findingCount?: number
  verdict?: Verdict
  status: StageRunStatus
  children?: SourceDoc[]
}

// 내보내기 화면의 상태.
export type ExportState = {
  roadmapMarkdown: string | null
  title: string | null
  busy: boolean
}

// Hermes 게이트웨이에서 돌아간 런의 상태. queued / running / done / failed 또는 null.
export type HermesRunStatus = "queued" | "running" | "done" | "failed" | null

// 브라우저가 localStorage에 쓰는 키 이름.
export const STORAGE_KEYS = {
  session: "pathfind.session.v5",
  roadmaps: "pathfind.roadmaps.v1",
  quota: "pathfind.quota.v1",
} as const

/*
노드 id 규칙
------------

마인드맵 노드와 왼쪽 패널 문서는 같은 번호를 쓴다. 접두어만 다르다.

대상          마인드맵 노드 id        왼쪽 패널 문서 id
뿌리          root                    (없음)
단계          s<no>                   stage-<no> (폴더)
단계 요약     (없음)                  stage-<no>-summary
소주제        s<no>-t<i>, 중첩은 s<no>-t<i>-<j>   stage-<no>-t<i>, stage-<no>-t<i>-<j> (폴더)
자료 잎       s<no>-finding-<i>      stage-<no>-finding-<i>
할 일 잎      s<no>-task-<i>         stage-<no>-task-<i>
역할 나눔 잎  s<no>-todo-<i>         stage-<no>-todo-<i>

<i>는 0부터. 잎 라벨은 18자 상한(구두점 → 공백 순으로 자르고 말줄임), 단계 라벨은 28자. 전문은 툴팁.
*/

// 브라우저가 한 번 열어 들고 있는 세션 전체. version 이 5가 아니면 저장소에서 버린다.
export type Session = {
  version: 5
  phase: Phase
  turnCount: number
  history: GrillTurn[]
  pending: GrillResponse | null
  summary: string
  bigPicture: BigPicture | null
  stages: StageSlot[]
  messages: ChatEntry[]
  mapTitle: string | null
  expandedIds: string[]
  selectedId: string | null
  runId: string | null
  runStatus: HermesRunStatus
  runCursor: number
  runActivity: string | null
  researchPath: "hermes" | "local" | null
  degraded: boolean
  error: string | null
  busy: boolean
  exportState: ExportState
  sourceCards?: Record<string, string>
  sourceExpandedIds?: string[]
  id?: string
}

// 처음 앱을 열었을 때의 세션 값.
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
  degraded: false,
  error: null,
  busy: false,
  exportState: { roadmapMarkdown: null, title: null, busy: false },
}
