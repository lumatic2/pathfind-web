/* === 이벤트 리스너 === */
import { dom } from './state.js';
import { startInterview, submitAnswer, handleExampleClick, resetAll, copyHandoff, downloadHandoff, setMsg } from './actions.js';

dom.startBtn.addEventListener('click', startInterview);

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.example-btn');
  if (!btn) return;
  handleExampleClick(e);
});

dom.answerBtn.addEventListener('click', () => {
  const text = dom.answerInput.value.trim();
  if (!text) {
    setMsg(dom.interviewMsg, '답변을 적거나 예시 버튼을 눌러 주세요.', false);
    return;
  }
  submitAnswer(text);
});

dom.skipBtn.addEventListener('click', () => {
  submitAnswer('(건너뜀 — 다음 질문으로)');
});

dom.answerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    dom.answerBtn.click();
  }
});

dom.copyHandoffBtn.addEventListener('click', copyHandoff);
dom.downloadHandoffBtn.addEventListener('click', downloadHandoff);
dom.resetBtn.addEventListener('click', resetAll);
