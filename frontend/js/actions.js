/* === 액션 함수 === */
import { dom, state, setMsg, q } from './state.js';
import { showQuestion, showResult, renderCards, showInputUI } from './render.js';

async function askGrill(question, answer, history, turnCount) {
  dom.statusPill.textContent = '대기 중…';
  try {
    const res = await fetch('/api/grill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, history, turnCount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    setMsg(dom.interviewMsg, '인터뷰 질문 생성에 실패했습니다: ' + e.message, false);
    throw e;
  } finally {
    dom.statusPill.textContent = '준비';
  }
}

async function askPathfind(summary) {
  dom.statusPill.textContent = '큰 그림 생성 중…';
  try {
    const res = await fetch('/api/pathfind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    setMsg(dom.resultMsg, '큰 그림·핸드오프 생성에 실패했습니다: ' + e.message, false);
    throw e;
  } finally {
    dom.statusPill.textContent = '준비';
  }
}

function setInitialQuestion() {
  const val = dom.questionInput.value.trim();
  const sel = q('.example-btn.sel');
  if (sel.length) {
    state.initialQuestion = sel[0].textContent.replace(/^\d+\.\s*/, '').trim() || val;
  } else {
    state.initialQuestion = val;
  }
  if (!state.initialQuestion) {
    setMsg(dom.inputMsg, '무엇을 만들고 싶은지 한 줄이라도 적어 주세요.', false);
    return false;
  }
  return true;
}

async function startInterview() {
  if (!setInitialQuestion()) return;
  dom.startBtn.disabled = true;
  dom.statusPill.textContent = '인터뷰 시작 중…';
  try {
    const data = await askGrill(state.initialQuestion, null, [], 0);
    state.turnCount = data.turnCount;
    state.history = [];
    state.currentQuestion = data;
    showQuestion(data);
  } catch (e) {
    setMsg(dom.inputMsg, '인터뷰를 시작하지 못했습니다: ' + e.message, false);
    dom.startBtn.disabled = false;
    dom.statusPill.textContent = '준비';
  }
}

async function submitAnswer(answerText) {
  if (!state.currentQuestion) return;
  dom.answerBtn.disabled = true;
  dom.statusPill.textContent = '답변 처리 중…';
  try {
    const data = await askGrill(
      state.currentQuestion.questionTitle,
      answerText,
      state.history,
      state.turnCount,
    );
    state.history.push({
      questionTitle: state.currentQuestion.questionTitle,
      questionBody: state.currentQuestion.questionBody,
      suggestion: state.currentQuestion.suggestion,
      exampleButtons: state.currentQuestion.exampleButtons || [],
      answer: answerText,
    });
    state.turnCount = data.turnCount;
    if (data.done) {
      const bpData = await askPathfind(data.summary || state.initialQuestion);
      state.bigPicture = bpData.bigPicture;
      state.handoff = bpData.handoffMarkdown || '';
      renderCards(state.bigPicture);
      dom.handoffPre.textContent = state.handoff;
      dom.resultHint.textContent = '총 ' + state.bigPicture.stages.length + '개 단계 · handoff.md 다운로드 가능';
      showResult(data.summary);
    } else {
      showQuestion(data);
    }
  } catch (e) {
    setMsg(dom.interviewMsg, '답변을 제출하지 못했습니다: ' + e.message, false);
    dom.answerBtn.disabled = false;
    dom.statusPill.textContent = '준비';
  }
}

function handleExampleClick(e) {
  const btn = e.target.closest('.example-btn');
  if (!btn) return;
  if (btn === dom.startBtn) return;
  const text = btn.textContent.replace(/^\d+\.\s*/, '').trim();
  dom.answerInput.value = text;
  dom.questionInput.value = text;
  if (state.inInterview) {
    submitAnswer(text);
  } else {
    q('.example-btn.sel').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel');
  }
}

async function copyHandoff() {
  const text = dom.handoffPre.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setMsg(dom.resultMsg, '핸드오프 문서를 복사했습니다.', true);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    setMsg(dom.resultMsg, '핸드오프 문서를 복사했습니다.', true);
  }
}

function downloadHandoff() {
  const text = dom.handoffPre.textContent;
  if (!text) return;
  const title = state.bigPicture && state.bigPicture.title ? state.bigPicture.title : 'handoff';
  const safe = title.replace(/[^a-zA-Z0-9가-힣_\- ]/g, '_').slice(0, 40);
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `handoff-${safe}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setMsg(dom.resultMsg, 'handoff.md 다운로드 완료', true);
}

function resetAll() {
  localStorage.removeItem('pathfind_state');
  state.mode = 'input';
  state.initialQuestion = '';
  state.turnCount = 0;
  state.history = [];
  state.currentQuestion = null;
  state.summary = '';
  state.bigPicture = null;
  state.handoff = '';
  showInputUI();
  dom.questionInput.value = '';
  dom.statusPill.textContent = '준비';
  setMsg(dom.inputMsg, '', false);
  setMsg(dom.interviewMsg, '', false);
  setMsg(dom.resultMsg, '', false);
  dom.answerBtn.disabled = false;
  dom.startBtn.disabled = false;
  dom.answerInput.value = '';
  dom.exampleButtons.innerHTML = '';
  dom.qTitle.textContent = '';
  dom.qBody.textContent = '';
  dom.suggestion.textContent = '';
  dom.turnDisplay.textContent = '1';
}

export { askGrill, askPathfind, setInitialQuestion, startInterview, submitAnswer, handleExampleClick, copyHandoff, downloadHandoff, resetAll };
export { setMsg } from './state.js';
