/* === 상태·DOM refs·헬퍼 === */
const $ = (sel) => document.querySelector(sel);
const q = (sel) => document.querySelectorAll(sel);

const state = {
  mode: 'input',
  initialQuestion: '',
  turnCount: 0,
  history: [],
  currentQuestion: null,
  summary: '',
  bigPicture: null,
  handoff: '',
  inInterview: false,
  // 마인드맵 상태 (과제3)
  mindmapInst: null,
  stageStatus: [],       // stageIdx -> 'searching' | 'done' | 'error'
  stageChildren: [],     // stageIdx -> {findings, choices, todos}
};

// DOM refs
const dom = {
  inputSection: $('#inputSection'),
  interviewSection: $('#interviewSection'),
  resultSection: $('#resultSection'),
  // index.html 전용
  questionInput: $('#questionInput'),
  startBtn: $('#startBtn'),
  resetBtn: $('#resetBtn'),
  inputMsg: $('#inputMsg'),
  turnDisplay: $('#turnDisplay'),
  interviewHint: $('#interviewHint'),
  qTitle: $('#qTitle'),
  qBody: $('#qBody'),
  suggestion: $('#suggestion'),
  exampleButtons: $('#exampleButtons'),
  answerInput: $('#answerInput'),
  answerBtn: $('#answerBtn'),
  skipBtn: $('#skipBtn'),
  interviewMsg: $('#interviewMsg'),
  statusPill: $('#statusPill'),
  stageCards: $('#stageCards'),
  resultHint: $('#resultHint'),
  handoffPre: $('#handoffPre'),
  copyHandoffBtn: $('#copyHandoffBtn'),
  downloadHandoffBtn: $('#downloadHandoffBtn'),
  resultMsg: $('#resultMsg'),
  // app.html 전용
  inputArea: $('#inputArea'),
  askArea: $('#askArea'),
  questionCard: $('#questionCard'),
  suggestionCard: $('#suggestionCard'),
  panelLeft: $('#panelLeft'),
  panelRight: $('#panelRight'),
  interviewSummary: $('#interviewSummary'),
  summaryText: $('#summaryText'),
};

// 헬퍼
function show(el) { if (!el) return; el.classList.remove('hidden'); }
function hide(el) { if (!el) return; el.classList.add('hidden'); }
function setMsg(el, text, ok) {
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  el.classList.toggle('ok', !!ok);
}

function exampleBtnHTML(btn) {
  return `<button class="example-btn" type="button">${btn}</button>`;
}

export { $, q, state, dom, show, hide, setMsg, exampleBtnHTML };
