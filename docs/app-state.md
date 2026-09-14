# pathfind-web 앱 상태 모양

> 브라우저 쪽 상태의 유일한 정본. 서버 쪽 모양은 `docs/api-contract.md`가 소유하고 여기서는 타입 이름만 맞춘다.
> 구현 파일은 `frontend/src/state/types.ts`. 이 문서와 그 파일이 어긋나면 이 문서가 맞다.

## 0. 서버가 주는 모양 (타입 이름)

`docs/api-contract.md`의 응답을 그대로 타입으로 옮긴 것이다. 필드 이름·옵셔널 여부는 계약과 같다.

```ts
type Verdict = "가져다 써도 됨" | "직접 해야 함" | "섞어야 함" | "선례를 못 찾음"
const VERDICTS: readonly Verdict[]   // 위 순서 그대로 4개

type Finding = { kind: string; name: string; query: string; evidence: string; note: string; url: string; grade?: "E1"|"E2"|"E3"|"E4"|"E5"; channel?: "web"|"public_data"|"stats"|"law" }
type StageScope = { claimType: string; channels: string[]; calls: number; queries?: string[]; planned?: string[] } // planned = 코드 규칙이 미리 돌린 채널. channels 는 결과가 온 채널이라 다를 수 있다
type Task = { order: number; task: string; why: string }
type Todo = { task: string; owner: "가져다 씀" | "직접 함"; note: string }
type Stage = { no: number; title: string; desc: string; icon: string; tasks: Task[]; choices: string[]; verdict?: Verdict; verdictReason?: string; findings?: Finding[]; options?: string[]; todos?: Todo[]; searched?: boolean; scope?: StageScope }
type BigPicture = { title: string; intro: string; stages: Stage[]; prototypeLoop: string }
type GrillTurn = { questionTitle: string; questionBody: string; suggestion: string; exampleButtons: string[]; answer: string }
type GrillResponse = { questionTitle: string; questionBody: string; suggestion: string; exampleButtons: string[]; done: boolean; summary?: string; turnCount: number }
```

`grade`와 `channel`은 조사 채널이 붙은 뒤에만 채워진다. 없어도 화면은 돈다.

**판정 4종은 계약 값이다.** 저장할 때도 서버 응답에서도 이 문자열 그대로 둔다. 화면에 보여 줄 때만 바꾼다.

| 계약 값 | 화면 표시 |
| --- | --- |
| 가져다 써도 됨 | 이미 있음 |
| 직접 해야 함 | 없음 |
| 섞어야 함 | 일부만 있음 |
| 선례를 못 찾음 | 못 찾음 |

서버가 산문을 돌려주면 네 값 중 **앞부분이 일치**하는 것으로 접고, 못 접으면 `선례를 못 찾음`이다. 이 정규화는 `frontend/src/state/derive.ts`의 `normalizeVerdict`가 맡는다.

## 1. 앱이 정하는 모양

```ts
type Phase = "interview" | "confirm" | "skeleton" | "researching" | "ready"
type StageRunStatus = "pending" | "running" | "done" | "failed"
type OutlineTopic = { title: string; items: string[]; topics?: OutlineTopic[] }   // items 의 ref 는 finding-<i> | task-<i> | todo-<i>
type StageSlot = { status: StageRunStatus; stage: Stage; error?: string; outline?: OutlineTopic[] }
type ChatRole = "user" | "assistant"
type ChatEntry = { id: string; role: ChatRole; text: string; kind?: "question"|"summary-approval"|"progress"|"node-explain"|"chat"; suggestions?: string[]; citationTitles?: string[]; citationIds?: string[] }
type SourceDoc = { id: string; kind: "stage"|"folder"|"finding"|"item"|"summary"; stageNo: number; title: string; markdown: string; subtitle?: string; url?: string; evidence?: string; findingCount?: number; verdict?: Verdict; status: StageRunStatus; children?: SourceDoc[] }
type ExportState = { roadmapMarkdown: string | null; title: string | null; busy: boolean }
type HermesRunStatus = "queued" | "running" | "done" | "failed" | null

type Session = {
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

const INITIAL_SESSION: Session = { version: 5, phase: "interview", turnCount: 0, history: [], pending: null, summary: "", bigPicture: null, stages: [], messages: [], mapTitle: null, expandedIds: [], selectedId: null, runId: null, runStatus: null, runCursor: 0, runActivity: null, researchPath: null, degraded: false, error: null, busy: false, exportState: { roadmapMarkdown: null, title: null, busy: false } }
```

`Phase`의 뜻: `interview` 인터뷰 중 → `confirm` 정리 확인(승인 카드) → `skeleton` 골격 받는 중 → `researching` 단계 조사 중 → `ready` 완주.

## 2. id 규칙

마인드맵 노드와 왼쪽 패널 문서는 같은 번호를 쓴다. 접두어만 다르다.

| 대상 | 마인드맵 노드 id | 왼쪽 패널 문서 id |
| --- | --- | --- |
| 뿌리 | `root` | (없음) |
| 단계 | `s<no>` | `stage-<no>` (폴더) |
| 단계 요약 | (없음) | `stage-<no>-summary` |
| 소주제 | `s<no>-t<i>`, 중첩은 `s<no>-t<i>-<j>` | `stage-<no>-t<i>`, `stage-<no>-t<i>-<j>` (폴더) |
| 자료 잎 | `s<no>-finding-<i>` | `stage-<no>-finding-<i>` |
| 할 일 잎 | `s<no>-task-<i>` | `stage-<no>-task-<i>` |
| 역할 나눔 잎 | `s<no>-todo-<i>` | `stage-<no>-todo-<i>` |

`<i>`는 0부터. 잎 라벨은 18자 상한(구두점 → 공백 순으로 자르고 말줄임), 단계 라벨은 28자. 전문은 툴팁.

## 3. 저장 (localStorage)

```ts
const STORAGE_KEYS = { session: "pathfind.session.v5", roadmaps: "pathfind.roadmaps.v1", quota: "pathfind.quota.v1" }
```

- `pathfind.session.v5` — 현재 세션 1건. `version`이 5가 아니면 버린다.
- `pathfind.roadmaps.v1` — `{ items: SavedRoadmap[] }`, `SavedRoadmap { id, title, savedAt, stageCount, findingCount, session }`. 최대 40건, 최신이 앞.
- `pathfind.quota.v1` — `{ used }`. 브라우저당 총 2회. 다른 탭과 `storage` 이벤트로 동기화.

복원은 **리듀서 초기값 계산에서 동기로** 한다. effect로 읽으면 첫 저장이 빈 상태로 덮어쓴다.

복원할 때 정리하는 규칙:
- `stages[].status`가 `running`이면 `pending`
- `busy=false`, `error=null`, `selectedId=null`, `exportState.busy=false`
- `phase`가 `skeleton`이면 `confirm`
- `phase`가 `ready`인데 `done`이 아닌 단계가 있으면 `researching`
- `runId`·`runCursor`·`runStatus`는 그대로 둔다(재접속에 쓴다)
