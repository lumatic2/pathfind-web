// api/hermes.js — 배포본에서 Hermes 중계로 가는 짧은 요청 경위
// 스트림(SSE)은 배포본에서 다루지 않는다(events.json 커서 폴링만).
// 키는 이 파일에서만 읽고, 브라우저 인증 헤더·임의 목적지는 전달하지 않는다.

import { sendError } from './_lib/http.js';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function parseRoute(raw) {
  if (typeof raw !== 'string') return null;
  const r = raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!r) return null;
  if (r === 'health') return { kind: 'health', id: null, sub: null };
  if (r === 'runs') return { kind: 'runs', id: null, sub: null };
  const m = r.match(/^runs\/([^\/]+)\/(events\.json|stop)$/);
  if (m) return { kind: 'runs:id', id: m[1], sub: m[2] };
  if (/^runs\/[^\/]+\/events$/.test(r)) return { kind: 'sse-unavailable', id: null, sub: null };
  return null;
}

function relayTarget(route) {
  const base = process.env.HERMES_RELAY_URL;
  const path = '/' + route.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return base + path;
}

async function fetchRelay(method, route, body) {
  const target = relayTarget(route);
  if (!process.env.HERMES_RELAY_URL || !process.env.HERMES_RELAY_KEY) {
    return new Response(JSON.stringify({ error: '중계 설정 누락' }), { status: 503, headers: HEADERS });
  }
  const h = new Headers();
  h.set('Authorization', 'Bearer ' + process.env.HERMES_RELAY_KEY);
  h.set('Content-Type', 'application/json');
  let res;
  try {
    res = await fetch(target, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
  } catch {
    return new Response(JSON.stringify({ error: '중계 연결 실패' }), { status: 503, headers: HEADERS });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: HEADERS });
}

export async function GET(request) {
  const url = new URL(request.url);
  const routes = url.searchParams.getAll('route');
  if (routes.length !== 1) return sendError(400, '경로가 애매함');
  const route = routes[0];
  const parsed = parseRoute(route);
  if (!parsed) return sendError(404, '지원하지 않는 경로');
  if (parsed.kind === 'sse-unavailable') return sendError(404, '공개 events 스트림은 지원하지 않음');
  if (parsed.kind === 'health') return handleHealth();
  if (parsed.kind === 'runs:id' && parsed.sub === 'events.json') {
    const cursorRaw = url.searchParams.get('cursor');
    if (cursorRaw !== null) {
      const n = Number(cursorRaw);
      if (!Number.isInteger(n) || n < 0) return sendError(400, 'cursor는 0 이상 정수만 허용');
    }
    return fetchRelay('GET', route, null);
  }
  if (parsed.kind === 'runs:id' && parsed.sub === 'stop') return fetchRelay('POST', route, null);
  return sendError(405, 'Method not allowed');
}

export async function POST(request) {
  const url = new URL(request.url);
  const routes = url.searchParams.getAll('route');
  if (routes.length !== 1) return sendError(400, '경로가 애매함');
  const route = routes[0];
  const parsed = parseRoute(route);
  if (!parsed) return sendError(404, '지원하지 않는 경로');
  if (parsed.kind === 'runs') {
    let body;
    try { body = await request.json(); } catch { body = null; }
    if (!body || body.input === undefined || body.input === null || (typeof body.input === 'string' && body.input.trim() === ''))
      return sendError(400, 'input이 필요');
    return fetchRelay('POST', route, body);
  }
  if (parsed.kind === 'health') return sendError(405, 'Method not allowed');
  return sendError(405, 'Method not allowed');
}

async function handleHealth() {
  const base = process.env.HERMES_RELAY_URL;
  const key = process.env.HERMES_RELAY_KEY;
  if (!base || !key) {
    return new Response(JSON.stringify({ enabled: false, reason: '설정되지 않음', version: '1.0.0' }), { status: 200, headers: HEADERS });
  }
  const target = relayTarget('health');
  const h = new Headers();
  h.set('Authorization', 'Bearer ' + key);
  try {
    const res = await fetch(target, { method: 'GET', headers: h, signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));
    const enabled = data && typeof data.enabled === 'boolean' ? data.enabled : false;
    const reason = data && typeof data.reason === 'string' ? data.reason : '';
    const version = data && typeof data.version === 'string' ? data.version : '1.0.0';
    return new Response(JSON.stringify({ enabled, reason, version }), { status: 200, headers: HEADERS });
  } catch {
    return new Response(JSON.stringify({ enabled: false, reason: '연결 실패', version: '1.0.0' }), { status: 200, headers: HEADERS });
  }
}
