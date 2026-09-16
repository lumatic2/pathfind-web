// 경로: frontend/src/lib/api.ts
// 서버 호출 8종과 동시 실행 풀. 타입 정의는 types.ts를 그대로 쓴다.
// 서버 파일(api/*.js)은 건드리지 않는다.

import type {
  GrillChoice,
  GrillResponse,
  BigPicture,
  Stage,
  Finding,
  OutlineTopic,
  Planning,
} from '../state/types';

import { validatePlanningResponse, PlanningResponseError } from '../lib/planningResponse';

/* ============================================================
 * 오류
 * ============================================================ */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class RateLimited extends ApiError {
  constructor(message = 'rate limited') {
    super(429, message);
    this.name = 'RateLimited';
  }
}

/* ============================================================
 * 공통 POST
 * ============================================================ */

const DEFAULT_TIMEOUT = 90000; // 밀리초

async function post<T>(
  path: string,
  body: unknown,
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      let message: string;
      try {
        const json = (await res.json()) as { error?: string };
        message = json.error || '';
      } catch {
        message = '';
      }
      if (res.status === 429) {
        throw new RateLimited(message || 'rate limited');
      }
      const detail = message ? `${message} (${res.status})` : `서버 오류 (${res.status})`;
      throw new ApiError(res.status, detail);
    }

    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, 'timeout');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
 * 응답 보정 헬퍼
 * ============================================================ */

function normalizeGrillResponse(raw: unknown): GrillResponse {
  const r = raw as Record<string, unknown>;
  return {
    questionTitle: String(r.questionTitle ?? ''),
    questionBody: String(r.questionBody ?? ''),
    suggestion: String(r.suggestion ?? ''),
    exampleButtons: Array.isArray(r.exampleButtons) ? r.exampleButtons : [],
    done: Boolean(r.done),
    summary: r.summary ? String(r.summary) : undefined,
    turnCount:
      typeof r.turnCount === 'number' ? r.turnCount : 0,
    opening: r.opening ? String(r.opening) : undefined,
  } as GrillResponse;
}

/* ============================================================
 * 호출 8종
 * ============================================================ */

// 1. grill
export async function grill(
  body: {
    question?: string;
    answer?: string;
    history?: { questionTitle: string; questionBody: string; suggestion: string; exampleButtons: string[] | GrillChoice[]; answer?: string }[];
    turnCount?: number;
  },
): Promise<GrillResponse> {
  const raw = await post<Record<string, unknown>>('/api/grill', body);
  const r = normalizeGrillResponse(raw);

  // 요청 turnCount 가 있으면 보정: 숫자가 아니면 요청 turnCount + 1
  if (body.turnCount !== undefined && typeof raw.turnCount !== 'number') {
    r.turnCount = body.turnCount + 1;
  }

  return r;
}

// 2. pathfind
export interface PathfindRequest {
  summary?: string;
  initialQuestion?: string;
}

export interface PathfindResponse {
  bigPicture: BigPicture;
  handoffMarkdown?: string;
}

export async function pathfind(
  body: PathfindRequest,
): Promise<PathfindResponse> {
  const raw = await post<Record<string, unknown>>('/api/pathfind', body, 120000);
  try {
    validatePlanningResponse(raw);
  } catch (e) {
    if (e instanceof PlanningResponseError) {
      throw new ApiError(e.status, planningErrorToMessage(e));
    }
    throw e;
  }
  const bp = raw.bigPicture as Record<string, unknown>;
  return {
    bigPicture: {
      title: String(bp.title ?? ''),
      intro: String(bp.intro ?? ''),
      stages: (bp.stages as Stage[]) ?? [],
      prototypeLoop: String(bp.prototypeLoop ?? ''),
      planning: bp.planning ? (bp.planning as Planning) : undefined,
    },
    handoffMarkdown: typeof raw.handoffMarkdown === 'string' ? raw.handoffMarkdown : undefined,
  };
}

function planningErrorToMessage(e: PlanningResponseError): string {
  const msg = e.message;
  if (
    msg === '응답이 객체가 아닙니다' ||
    msg === 'bigPicture가 없습니다' ||
    msg === 'bigPicture.stages가 배열이 아닙니다' ||
    msg === 'planning 필드가 없습니다'
  ) {
    return '단계 설계 응답을 받지 못했습니다. 다시 시도해 주세요.';
  }
  return '단계 설계 자료를 확인하지 못했습니다. 다시 시도해 주세요.';
}

// 3. stage
export interface StageRequest {
  stageIndex: number;
  stage: Omit<Stage, 'verdict' | 'verdictReason' | 'findings' | 'options' | 'todos' | 'searched'>;
  summary: string;
}

export interface StageResponse {
  stage: Stage;
  meta?: {
    source?: string;
    channels?: string[];
  };
}

export async function stage(
  body: StageRequest,
): Promise<StageResponse> {
  const res = await fetch('/api/stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message: string;
    try {
      const json = (await res.json()) as { error?: string };
      message = json.error || '';
    } catch {
      message = '';
    }
    if (res.status === 429) {
      throw new RateLimited(message || 'rate limited');
    }
    throw new ApiError(res.status, message ? `${message} (${res.status})` : `서버 오류 (${res.status})`);
  }

  const data = (await res.json()) as StageResponse;

  // meta는 응답 헤더에서 가져온다
  const source = res.headers.get('x-stage-source');
  const channels = res.headers.get('x-stage-channels');
  if (source || channels) {
    data.meta = {
      source: source ?? undefined,
      channels: channels ? channels.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    };
  }

  return data;
}

// 4. handoff
export interface HandoffRequest {
  bigPicture: BigPicture;
  stages: Stage[];
  summary: string;
}

export interface HandoffResponse {
  handoffMarkdown: string;
  title?: string;
}

export async function handoff(
  body: HandoffRequest,
): Promise<HandoffResponse> {
  return post<HandoffResponse>('/api/handoff', body);
}

// 5. explain
export interface ExplainRequest {
  node: { id: string; label: string; depth?: number };
  stage: Stage | null;
  summary: string;
}

export interface ExplainResponse {
  explanation: string;
  citationTitles: string[];
  followups: string[];
  degraded: boolean;
}

export async function explain(
  body: ExplainRequest,
): Promise<ExplainResponse> {
  return post<ExplainResponse>('/api/explain', body);
}

// 6. chat
export interface ChatRequest {
  summary: string;
  bigPicture?: BigPicture;
  stages: Stage[];
  history: { role: 'user' | 'assistant'; text: string; kind?: string }[];
}

export interface ChatResponse {
  answer: string;
  basis: string;
  citationTitles: string[];
  citationIds: string[];
  followups: string[];
  grounded: boolean;
  degraded: boolean;
}

export async function chat(
  body: ChatRequest,
): Promise<ChatResponse> {
  return post<ChatResponse>('/api/chat', body);
}

// 7. outline
export interface OutlineRequest {
  stage: Stage;
  summary: string;
}

export interface OutlineResponse {
  topics: OutlineTopic[];
  degraded: boolean;
}

export async function outline(
  body: OutlineRequest,
): Promise<OutlineResponse> {
  return post<OutlineResponse>('/api/outline', body);
}

// 8. sourceCard
export interface SourceCardRequest {
  finding: Finding;
  stage: Stage;
  summary: string;
}

export interface SourceCardResponse {
  markdown: string;
  degraded: boolean;
}

export async function sourceCard(
  body: SourceCardRequest,
): Promise<SourceCardResponse> {
  return post<SourceCardResponse>('/api/source-card', body);
}

/* ============================================================
 * 동시 실행 풀
 * ============================================================ */

export interface PoolItem<T> {
  key: string;
  payload: T;
}

export interface PoolWorker<T, R> {
  (item: PoolItem<T>): Promise<R>;
}

export interface RunPoolOptions<T, R> {
  items: PoolItem<T>[];
  concurrency: number;
  worker: PoolWorker<T, R>;
  onDegrade?: (newConcurrency: number) => void;
}

/**
 * 항목을 동시성 상한까지 돌려 실행한다.
 * worker가 RateLimited를 던지면 상한을 1로 낮추고 해당 항목을 큐 앞으로 되돌려 재시도한다.
 * onDegrade는 상한이 내려갈 때 한 번만 호출된다.
 * 그 밖의 오류는 worker가 스스로 처리한다 — 풀은 멈추지 않는다.
 */
export async function runPool<T, R>(opts: RunPoolOptions<T, R>): Promise<void> {
  const { items, concurrency: initialConcurrency, worker, onDegrade } = opts;
  let concurrency = initialConcurrency;
  let degraded = false;
  const queue = [...items];

  async function workerWrapper(item: PoolItem<T>): Promise<R | null> {
    try {
      return await worker(item);
    } catch (e) {
      if (e instanceof RateLimited) {
        if (!degraded) {
          degraded = true;
          concurrency = 1;
          onDegrade?.(1);
        }
        // 현재 항목을 큐 앞으로 되돌려 재시도
        queue.unshift(item);
        return null;
      }
      // 그 밖의 오류는 caller가 알아서 처리하도록 그대로 던짐 — 풀은 계속됨
      throw e;
    }
  }

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const results = await Promise.allSettled(batch.map(workerWrapper));

    for (const result of results) {
      if (result.status === 'rejected') {
        // worker가 던진 그 밖의 오류 — 풀은 그대로 계속
        console.error('pool worker error:', (result as PromiseRejectedResult).reason);
      }
    }
  }
}

/* ============================================================
 * 다운로드
 * ============================================================ */

export function downloadText(filename: string, text: string): void {
  if (!text) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
