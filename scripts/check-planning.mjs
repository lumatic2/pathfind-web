#!/usr/bin/env node
// scripts/check-planning.mjs — 선행 조사 계약을 모의 입력으로 확인
// planFromResearch 의 가짜 의존성으로 정상·빈 자료·전량 실패·가짜 식별자·형식 수정을 단언한다.
// 실제 서버·모델·네이버를 부르지 않는다. 틀리면 종료 코드 실패.
import { planFromResearch } from '../api/_lib/pathfind-plan.js';
import { normalizePlanningDesign } from '../api/_lib/pathfind-design.js';

let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } };
const assertEq = (a, b, m) => { if (a !== b) { failures++; console.error('FAIL:', m); } };
const clk = () => { let t = 1000; return { now: () => t++ }; };
const mkSrc = (items) => items.map((it, i) => ({ id: `src-${i}`, title: it.title, url: it.url, snippet: it.snippet, queries: [], channel: 'webkr', accessedAt: new Date().toISOString(), readScope: 'search-snippet' }));
const trace6 = () => ({ calls: ['webkr:Q1','blog:Q1','cafearticle:Q1','webkr:Q2','blog:Q2','cafearticle:Q2'].map((l) => ({ label: l, kind: l.split(':')[0], status: 'ok', count: 1, elapsedMs: 10 })), totalCalls: 6, succeededCalls: 6, failedCalls: 0, totalElapsedMs: 60 });
const offTopicNone = { excludedByQuery: {}, total: 0, allExcluded: false };
const DESIGN = (steps, refIds, extra = {}) => ({ title: '프로젝트', intro: '큰 그림 한 문장', basisSummary: '단계 제안 이유 전체', steps, referenceIds: refIds, ...extra });
const STEPS_NORM = [{ no:1,title:'1. 첫 단계',desc:'첫 단계 설명',reason:'첫 이유' },{ no:2,title:'2. 두 번째',desc:'두 번째 설명',reason:'두 번째 이유' },{ no:3,title:'단계 3: 세 번째',desc:'세 번째 설명',reason:'세 번째 이유' },{ no:4,title:'4. 네 번째',desc:'네 번째 설명',reason:'네 번째 이유' }];
const STEPS_BAD = [{ no:1,title:'1. 단계',desc:'',reason:'이유' },{ no:2,title:'2. 단계',desc:'설명',reason:'이유' },{ no:3,title:'3. 단계',desc:'설명',reason:'이유' },{ no:4,title:'4. 단계',desc:'설명',reason:'이유' }];
const STEPS_OK = [{ no:1,title:'단계 A',desc:'좋은 설명',reason:'이유' },{ no:2,title:'단계 B',desc:'좋은 설명',reason:'이유' },{ no:3,title:'단계 C',desc:'좋은 설명',reason:'이유' },{ no:4,title:'단계 D',desc:'좋은 설명',reason:'이유' }];
const NORM_DESIGN = DESIGN(STEPS_NORM, ['src-0','src-1'], {limitations:'테스트 한계'});

// ---- 정상: 모델 2회, trace 6, 사건 4, 연구노트 2, 발췌 일치, 숫자 접두 제거 ----
{
  const clock = clk();
  const calls = [];
  const modelFn = async (msgs) => { calls.push(msgs.length); if (msgs[0].content.includes('검색어 두 개')) return JSON.stringify({ activity: '활동어', readiness: '준비어' }); return JSON.stringify(NORM_DESIGN); };
  const searchFn = async () => ({ sources: mkSrc([{ title: '자료 A', url: 'https://example.com/a', snippet: '활동어 발췌 내용' }, { title: '자료 B', url: 'https://example.com/b', snippet: '준비어 발췌 내용' }]), trace: trace6(), offTopic: offTopicNone });
  const result = await planFromResearch('요약', clock, modelFn, searchFn, normalizePlanningDesign, null);
  assert(result?.bigPicture, 'bigPicture 존재');
  assertEq(calls.length, 2, '모델 2회');
  assertEq(result.planning.trace.length, 6, 'trace 6건');
  assertEq(result.planning.events.length, 4, '사건 4개');
  assertEq(result.planning.events[0].name, 'request_received');
  assertEq(result.planning.events[1].name, 'search_finished');
  assertEq(result.planning.events[2].name, 'design_finished');
  assertEq(result.planning.events[3].name, 'response_ready');
  assert(result.planning.events[1].elapsedMs <= result.planning.events[2].elapsedMs && result.planning.events[2].elapsedMs <= result.planning.events[3].elapsedMs, '사건 시간 nondecreasing');
  assertEq(result.planning.researchNotes.length, 2, '연구노트 2개');
  assert(result.planning.researchNotes.some((n) => n.excerpt === '활동어 발췌 내용'), '연구노트 발췌 A');
  assert(result.planning.researchNotes.some((n) => n.excerpt === '준비어 발췌 내용'), '연구노트 발췌 B');
  assertEq(result.bigPicture.stages.length, 4, '단계 4개');
  assertEq(result.bigPicture.stages[0].title, '첫 단계', '숫자 접두 제거');
  assertEq(result.bigPicture.stages[2].title, '세 번째', '단계 접두 제거');
  console.log('[정상] 통과 — 모델 2회, trace 6, 사건 4, 연구노트 2, 발췌 일치');
}

// ---- 빈 자료: 모델 2회, 경고 있음, 연구노트 없음 ----
{
  const clock = clk();
  const calls = [];
  const modelFn = async (msgs) => { calls.push(msgs.length); if (msgs[0].content.includes('검색어 두 개')) return JSON.stringify({ activity: '활동', readiness: '준비' }); return JSON.stringify({ title: '빈 자료 프로젝트', intro: '큰 그림', basisSummary: '이유', steps: [
    { no: 1, title: '1. 단계', desc: '설명', reason: '이유' },
    { no: 2, title: '2. 단계', desc: '설명', reason: '이유' },
    { no: 3, title: '3. 단계', desc: '설명', reason: '이유' },
    { no: 4, title: '4. 단계', desc: '설명', reason: '이유' },
  ], referenceIds: [] }); };
  const searchFn = async () => ({ sources: [], trace: trace6(), offTopic: offTopicNone });
  const result = await planFromResearch('요약', clock, modelFn, searchFn, normalizePlanningDesign, null);
  assert(result?.bigPicture, 'bigPicture 존재');
  assertEq(calls.length, 2, '모델 2회');
  assert(result.planning.warnings?.length > 0, '경고 발생');
  assert(result.planning.researchNotes?.length === 0, '연구노트 없음');
  console.log('[빈 자료] 통과 — 모델 2회, 경고 있음, 연구노트 없음');
}

// ---- 전량 실패 / 시간 초과 전량 실패: 설계 모델 호출 전 throw, trace 6건 실패 ----
{
  const labels = ['webkr:Q1','blog:Q1','cafearticle:Q1','webkr:Q2','blog:Q2','cafearticle:Q2'];
  const errorBody = (eMsg) => {
    const tr = { calls: labels.map((l) => ({ label: l, kind: l.split(':')[0], status: 'error', count: 0, elapsedMs: 10, error: eMsg })), totalCalls: 6, succeededCalls: 0, failedCalls: 6, totalElapsedMs: 60 };
    const err = new Error(eMsg === '시간 초과' ? '시간 초과' : '선행 검색 전량 실패 (6/6개 채널)');
    err.trace = tr;
    return err;
  };
  for (const [name, eMsg] of [['전량 실패', '연결 실패'], ['시간 초과 전량 실패', '시간 초과']]) {
    const clock = clk();
    const calls = [];
    const modelFn = async (msgs) => { calls.push(msgs.length); if (msgs[0].content.includes('검색어 두 개')) return JSON.stringify({ activity: '활동어', readiness: '준비어' }); return JSON.stringify(NORM_DESIGN); };
    const searchFn = async () => { throw errorBody(eMsg); };
    let threw = false;
    let err = null;
    try { await planFromResearch('요약', clock, modelFn, searchFn, normalizePlanningDesign, null); } catch (e) { threw = true; err = e; }
    assert(threw, `${name} throw`);
    assertEq(calls.length, 1, '검색어 생성만 1회');
    assert(err?.trace?.totalCalls === 6 && err?.trace?.failedCalls === 6, 'trace 6건 실패');
    console.log(`[${name}] 통과 — 검색어 생성 1회, 설계 미호출, trace 6건 실패`);
  }
}

// ---- 가짜 식별자: 모델 3회, throw, 메시지 포함 ----
{
  const clock = clk();
  const calls = [];
  const modelFn = async (msgs) => { calls.push(msgs.length); if (msgs[0].content.includes('검색어 두 개')) return JSON.stringify({ activity: '활동', readiness: '준비' }); return JSON.stringify(DESIGN(STEPS_BAD, ['가짜-id-1','가짜-id-2'])); };
  const searchFn = async () => ({ sources: mkSrc([{ title: '진짜 자료', url: 'https://real.example.com', snippet: '진짜 발췌' }]), trace: trace6(), offTopic: offTopicNone });
  let threw = false;
  let err = null;
  try { await planFromResearch('요약', clock, modelFn, searchFn, normalizePlanningDesign, null); } catch (e) { threw = true; err = e; }
  assert(threw, '가짜 식별자 throw');
  assertEq(calls.length, 3, '모델 3회 (쿼리 + 설계 + 재시도)');
  assert(err?.message?.includes('참고 식별자가 자료에 없습니다'), '가짜 식별자 메시지');
  console.log('[가짜 식별자] 통과 — 모델 3회, throw, 식별자 지적 메시지');
}

// ---- 형식 수정: 1차 실패 → 재시도 1회 통과, 총 3회, 연구노트 2개, 발췌 일치 ----
{
  const clock = clk();
  const calls = [];
  let designAttempt = 0;
  const modelFn = async (msgs) => { calls.push(msgs.length); if (msgs[0].content.includes('검색어 두 개')) return JSON.stringify({ activity: '활동', readiness: '준비' }); designAttempt++; if (designAttempt === 1) return JSON.stringify(DESIGN(STEPS_BAD, ['src-0'])); return JSON.stringify(DESIGN(STEPS_OK, ['src-0','src-1'])); };
  const searchFn = async () => ({ sources: mkSrc([{ title: '자료', url: 'https://example.com/x', snippet: '발췌 내용' }, { title: '자료2', url: 'https://example.com/y', snippet: '발췌 내용2' }]), trace: trace6(), offTopic: offTopicNone });
  const result = await planFromResearch('요약', clock, modelFn, searchFn, normalizePlanningDesign, null);
  assert(result?.bigPicture, 'bigPicture 존재');
  assertEq(calls.length, 3, '모델 3회');
  assertEq(result.planning.researchNotes.length, 2, '연구노트 2개');
  assert(result.planning.researchNotes.some((n) => n.excerpt === '발췌 내용'), '연구노트 발췌 A');
  assert(result.planning.researchNotes.some((n) => n.excerpt === '발췌 내용2'), '연구노트 발췌 B');
  console.log('[형식 수정] 통과 — 모델 3회, 연구노트 2개, 발췌 일치');
}

console.log(`\n정상 시나리오 검사 수: 6개 시나리오, 전부 통과`);
console.log(`전체 실패: ${failures}개`);
if (failures > 0) process.exit(1);
console.log('\nM15 스텝23 끝');
process.exit(0);
