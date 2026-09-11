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
};

// DOM refs
const dom = {
  inputSection: $('#inputSection'),
  interviewSection: $('#interviewSection'),
  resultSection: $('#resultSection'),
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
};

// 헬퍼
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function setMsg(el, text, ok) {
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  el.classList.toggle('ok', !!ok);
}

function exampleBtnHTML(btn) {
  return `<button class="example-btn" type="button">${btn}</button>`;
}

export { $, q, state, dom, show, hide, setMsg, exampleBtnHTML };
