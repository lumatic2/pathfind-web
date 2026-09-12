/* === 액션 함수 === */
import { dom, state, setMsg, q } from './state.js';
import { showQuestion, showResult, renderCards, showInputUI, markLoading, markError, enrichCard } from './render.js';

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
  dom.statusPill.textContent = '로드맵 생성 중…';
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
    setMsg(dom.resultMsg, '큰 그림 생성에 실패했습니다: ' + e.message, false);
    throw e;
  } finally {
    dom.statusPill.textContent = '준비';
  }
}

async function askStage(request) {
  dom.statusPill.textContent = '검색 중…';
  try {
    const res = await fetch('/api/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    dom.statusPill.textContent = '준비';
    throw e;
  } finally {
    dom.statusPill.textContent = '준비';
  }
}

async function askHandoff(bigPicture, stages, summary) {
  try {
    const res = await fetch('/api/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bigPicture, stages, summary }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '서버 응답 오류' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    setMsg(dom.resultMsg, 'handoff 생성에 실패했습니다: ' + e.message, false);
    throw e;
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
    saveState();
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
      state.stageIndex = 0;
      state.stageResults = [];
      renderCards(state.bigPicture);
      // 마인드맵 최초 렌더: 모든 단계 searching 상태
      state.stageStatus = state.bigPicture.stages.map(() => 'searching');
      state.stageChildren = state.bigPicture.stages.map(() => null);
      state.mindmapInst = renderRoadmapMindmap(
        'mindmapView',
        state.bigPicture.stages,
        state.stageStatus,
        state.stageChildren,
        () => {}
      );
      if (state.mindmapInst) {
        state.mindmapInst.setOnNodeDoubleClick((n) => {
          if (n.nodeType !== 'l0' || n.stageIdx == null || !dom.stageCards) return;
          const card = dom.stageCards.querySelector(`.card[data-stage-index="${n.stageIdx}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('selected');
            setTimeout(() => card.classList.remove('selected'), 1600);
          }
        });
        state.mindmapInst.fitToView();
      }
      for (let i = 0; i < state.bigPicture.stages.length; i++) {
        const stage = state.bigPicture.stages[i];
        const card = dom.stageCards.querySelector(`.card[data-stage-index="${i}"]`);
        if (card) markLoading(card);
        try {
          const stageRes = await askStage({
            stageIndex: i,
            stage,
            summary: data.summary || state.initialQuestion,
          });
          state.stageResults.push(stageRes);
          if (card) enrichCard(card, stageRes.stage);
          // 마인드맵 갱신: 해당 단계 done + 자식 붙이기
          state.stageStatus[i] = 'done';
          state.stageChildren[i] = {
            _stageNo: stage.no,
            findings: stageRes.stage.findings || [],
            choices: stageRes.stage.choices || [],
            todos: stageRes.stage.todos || [],
          };
          if (state.mindmapInst) state.mindmapInst.updateStage(i, 'done', state.stageChildren[i]);
        } catch (e) {
          if (card) markError(card, e.message);
          state.stageResults.push(null);
          state.stageStatus[i] = 'error';
          if (state.mindmapInst) state.mindmapInst.updateStage(i, 'error', null);
        }
      }
      state.handoff = '';
      dom.handoffPre.textContent = '';
      dom.copyHandoffBtn.disabled = true;
      dom.downloadHandoffBtn.disabled = true;
      dom.resultHint.textContent = '총 ' + state.bigPicture.stages.length + '개 단계 · handoff.md 생성 준비 중';
      const handoffData = await askHandoff(state.bigPicture, state.stageResults, data.summary || state.initialQuestion);
      state.handoff = handoffData.handoffMarkdown || '';
      dom.handoffPre.textContent = state.handoff;
      dom.copyHandoffBtn.disabled = false;
      dom.downloadHandoffBtn.disabled = false;
      dom.resultHint.textContent = '총 ' + state.bigPicture.stages.length + '개 단계 · handoff.md 다운로드 가능';
      showResult(data.summary);
      saveState();
    } else {
      showQuestion(data);
      saveState();
    }
  } catch (e) {
    setMsg(dom.interviewMsg, '답변을 제출하지 못했습니다: ' + e.message, false);
    dom.answerBtn.disabled = false;
    dom.statusPill.textContent = '준비';
  }
}

async function retryStage(index) {
  if (!state.bigPicture || !state.bigPicture.stages[index]) return;
  const card = dom.stageCards.querySelector(`.card[data-stage-index="${index}"]`);
  if (!card) return;
  markLoading(card);
  try {
    const stageRes = await askStage({
      stageIndex: index,
      stage: state.bigPicture.stages[index],
      summary: state.initialQuestion,
    });
    state.stageResults[index] = stageRes;
    enrichCard(card, stageRes.stage);
  } catch (e) {
    markError(card, e.message);
    state.stageResults[index] = null;
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
  state.stageResults = [];
  state.stageIndex = 0;
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
  if (state.mindmapInst) {
    const mv = dom.mindmapView;
    if (mv) mv.innerHTML = '';
    state.mindmapInst = null;
  }
}

function saveState() {
  try {
    const s = {
      mode: state.mode,
      initialQuestion: state.initialQuestion,
      turnCount: state.turnCount,
      history: state.history,
      currentQuestion: state.currentQuestion,
      summary: state.summary,
      bigPicture: state.bigPicture,
      handoff: state.handoff,
      stageResults: state.stageResults,
      stageIndex: state.stageIndex,
      inInterview: state.inInterview,
    };
    localStorage.setItem('pathfind_state', JSON.stringify(s));
  } catch (e) {
    localStorage.removeItem('pathfind_state');
  }
}

export { askGrill, askPathfind, askStage, askHandoff, setInitialQuestion, startInterview, submitAnswer, retryStage, handleExampleClick, copyHandoff, downloadHandoff, resetAll, saveState };
export { setMsg } from './state.js';
