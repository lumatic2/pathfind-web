/**
 * @fileoverview 프론트 API 모듈 — 순수 함수만.
 * 상태 전이(startInterview 등)·DOM 조작은 포함하지 않는다.
 * fetch 기반 /api/grill·/api/pathfind·/api/stage·/api/handoff 호출.
 *
 * 타입 정의는 docs/api-contract.md 기준.
 * localStorage(saveState)는 브라우저 API지만, 스모크 테스트용 모의 구현을 함께 제공한다.
 */

/* ============================================================
 * 타입 (JSDoc)
 * ============================================================ */

/**
 * @typedef {Object} GrillRequest
 * @property {string} [question] - 첫 턴에만 사용
 * @property {string} [answer] - 예시 버튼 선택 시 등
 * @property {Array<GrillHistoryEntry>} [history]
 * @property {number} [turnCount] - 0-based, 직전까지 진행 턴 수
 */

/**
 * @typedef {Object} GrillHistoryEntry
 * @property {string} questionTitle
 * @property {string} questionBody
 * @property {string} suggestion
 * @property {string[]} exampleButtons
 * @property {string} [answer]
 */

/**
 * @typedef {Object} GrillResponse
 * @property {string} questionTitle - 24자 이내, 종료 시 ''
 * @property {string} questionBody - 종료 시 ''
 * @property {string} suggestion - 종료 시 ''
 * @property {string[]} exampleButtons - 종료 시 []
 * @property {boolean} done
 * @property {number} [turnCount]
 * @property {string} [summary] - done=true일 때 3-5문장
 */

/**
 * @typedef {Object} PathfindRequest
 * @property {string} [summary] - grill summary 또는 초기 아이디어 문단
 * @property {string} [initialQuestion] - summary가 없을 때만 사용, 둘 중 하나 필요
 */

/**
 * @typedef {Object} StageTask
 * @property {number} order
 * @property {string} task
 * @property {string} why
 */

/**
 * @typedef {Object} StageFinding
 * @property {string} kind - 오픈소스 | 무료 에셋 | 튜토리얼·블로그 | 참고 사례
 * @property {string} name
 * @property {string} query
 * @property {string} evidence
 * @property {string} note
 * @property {string} url - 빈 문자열 금지
 */

/**
 * @typedef {Object} BigPictureStage
 * @property {number} no
 * @property {string} title - 24자 이내
 * @property {string} desc - 2-3문장
 * @property {string} icon - 컴포넌트 아이콘 이름
 * @property {StageTask[]} tasks
 * @property {string} verdict - 가져다 써도 됨 | 직접 해야 함 | 섞어야 함 | 선례를 못 찾음
 * @property {string} verdictReason
 * @property {StageFinding[]} findings
 * @property {string[]} choices
 * @property {string[]} [options]
 * @property {Array<{task: string, owner: string, note: string}>} [todos]
 * @property {boolean} [searched]
 */

/**
 * @typedef {Object} BigPicture
 * @property {string} title - 24자 이내
 * @property {string} intro - 프로젝트 큰 그림 한 문장
 * @property {BigPictureStage[]} stages
 * @property {string} prototypeLoop
 */

/**
 * @typedef {Object} PathfindResponse
 * @property {BigPicture} bigPicture
 * @property {string} [handoffMarkdown] - 아직 검색이 붙지 않은 초안
 */

/**
 * @typedef {Object} StageRequest
 * @property {number} stageIndex - bigPicture.stages 내 인덱스, 0-based
 * @property {Object} stage - 서버 응답 스펙에는 반영되지 않음, 프론트 렌더링·로깅용
 * @property {number} stage.no
 * @property {string} stage.title
 * @property {string} stage.desc
 * @property {string} stage.icon
 * @property {StageTask[]} stage.tasks
 * @property {string[]} stage.choices
 * @property {string} summary - 전체 요약, 검색 문맥용
 */

/**
 * @typedef {Object} StageResponse
 * @property {BigPictureStage} stage
 */

/**
 * @typedef {Object} HandoffRequest
 * @property {BigPicture} bigPicture - /api/pathfind 응답의 bigPicture
 * @property {StageResponse[]} stages - /api/stage 응답을 단계 순서대로 쌓은 배열
 * @property {string} summary
 */

/**
 * @typedef {Object} HandoffResponse
 * @property {string} handoffMarkdown - 한국어의 완전한 마크다운 문서
 * @property {string} [title]
 */

/* ============================================================
 * API 함수
 * ============================================================ */

/**
 * @param {GrillRequest} body
 * @returns {Promise<GrillResponse>}
 * @throws {Error} fetch 실패 또는 HTTP 오류
 */
export async function askGrill(body) {
  const res = await fetch('/api/grill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * @param {PathfindRequest} body
 * @returns {Promise<PathfindResponse>}
 * @throws {Error} fetch 실패 또는 HTTP 오류
 */
export async function askPathfind(body) {
  const res = await fetch('/api/pathfind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * @param {StageRequest} body
 * @returns {Promise<StageResponse>}
 * @throws {Error} fetch 실패 또는 HTTP 오류
 */
export async function askStage(body) {
  const res = await fetch('/api/stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * @param {HandoffRequest} body
 * @returns {Promise<HandoffResponse>}
 * @throws {Error} fetch 실패 또는 HTTP 오류
 */
export async function askHandoff(body) {
  const res = await fetch('/api/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * handoff 마크다운 텍스트를 클립보드에 복사.
 * navigator.clipboard 우선, 실패 시 textarea 폴백.
 * @param {string} text
 * @returns {Promise<void>}
 * @throws {Error} 복사 실패
 */
export async function copyHandoff(text) {
  if (!text) throw new Error('복사할 텍스트가 없습니다.');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // 폴백으로 진행
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    document.body.removeChild(ta);
    throw new Error('클립보드 복사에 실패했습니다: ' + e.message);
  }
  document.body.removeChild(ta);
}

/**
 * handoff 마크다운 텍스트를 파일로 다운로드.
 * @param {string} text
 * @param {string} [title] - 파일명에 사용, 없으면 'handoff'
 * @returns {void}
 * @throws {Error} 텍스트가 비어 있으면
 */
export function downloadHandoff(text, title) {
  if (!text) throw new Error('다운로드할 텍스트가 없습니다.');
  const safe = (title || 'handoff')
    .replace(/[^a-zA-Z0-9가-힣_\-\s]/g, '_')
    .slice(0, 40)
    .replace(/\s+/g, '_');
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `handoff-${safe}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 상태를 localStorage에 저장.
 * 브라우저 환경이 아니면 아무 작업도 하지 않는다(no-op).
 * @param {Object} state - 저장할 상태 객체
 * @param {string} [key='pathfind_state'] - localStorage 키
 * @returns {void}
 */
export function saveState(state, key) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key || 'pathfind_state', JSON.stringify(state));
  } catch (e) {
    localStorage.removeItem(key || 'pathfind_state');
  }
}

/**
 * 초기 질문 문자열을 결정.
 * @param {string} [raw] - questionInput 값 (dom.questionInput.value.trim() 대체)
 * @param {string} [selectedExample] - 선택된 예시 버튼 텍스트 (q('.example-btn.sel')[0].textContent 대체)
 * @returns {string | false} - 결정된 초기 질문, 없거나 빈 string이면 false
 */
export function setInitialQuestion(raw, selectedExample) {
  const val = (raw || '').trim();
  const sel = selectedExample ? selectedExample.replace(/^\d+\.\s*/, '').trim() || val : val;
  if (!sel) return false;
  return sel;
}
