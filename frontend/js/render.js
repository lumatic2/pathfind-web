/* === 렌더링 함수 === */
import { dom, state, exampleBtnHTML, setMsg, show, hide } from './state.js';

const ALLOWED_VERDICTS = ['가져다 써도 됨', '직접 해야 함', '섞어야 함', '선례를 못 찾음'];

const VERDICT_KEYS = new Map();
ALLOWED_VERDICTS.forEach((v) => {
  const key = v.replace(/[.｡。、・･]/g, '').replace(/\s+/g, '').replace(/『|»|»|「|『|’|”|\"|'|=/g, '').toLowerCase();
  VERDICT_KEYS.set(key, v);
});

function normalizeVerdict(raw) {
  if (!raw) return '선례를 못 찾음';
  const cleaned = String(raw).trim();
  if (ALLOWED_VERDICTS.includes(cleaned)) return cleaned;
  const key = cleaned.replace(/[.｡。、・･]/g, '').replace(/\s+/g, '').replace(/『|»|「|’|”|\"|'|=/g, '').toLowerCase();
  if (VERDICT_KEYS.has(key)) return VERDICT_KEYS.get(key);
  return '선례를 못 찾음';
}

function showInterviewUI() {
  state.inInterview = true;
  show(dom.questionCard);
  show(dom.suggestionCard);
  show(dom.exampleButtons);
  hide(dom.inputArea);
  hide(dom.askArea);
  hide(dom.resultSection);
  if (dom.panelLeft) { show(dom.panelLeft); hide(dom.panelRight); }
  if (dom.interviewSummary) hide(dom.interviewSummary);
}

function showResultUI() {
  state.inInterview = false;
  hide(dom.questionCard);
  hide(dom.suggestionCard);
  hide(dom.exampleButtons);
  show(dom.resultSection);
  hide(dom.inputArea);
  hide(dom.askArea);
  if (dom.panelLeft) show(dom.panelLeft);
  if (dom.panelRight) show(dom.panelRight);
  if (dom.interviewSummary) {
    show(dom.interviewSummary);
    dom.summaryText.textContent = state.summary || '';
  }
}

function showInputUI() {
  state.inInterview = false;
  show(dom.inputArea);
  hide(dom.askArea);
  hide(dom.resultSection);
  hide(dom.interviewSummary);
  if (dom.panelLeft) { show(dom.panelLeft); hide(dom.panelRight); }
}

function markLoading(card) {
  card.classList.add('card-loading');
  const badge = card.querySelector('.badge');
  if (badge) { badge.textContent = '검색 중…'; badge.classList.add('loading'); }
  const desc = card.querySelector('.desc');
  if (desc) desc.textContent = '검색 중…';
  if (!card.querySelector('.card-footer')) {
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;';
    const status = document.createElement('span');
    status.className = 'card-status';
    status.style.cssText = 'color:var(--muted);font-size:12px;';
    status.textContent = '로드맵 생성 중…';
    footer.appendChild(status);
    card.appendChild(footer);
  }
}

function markError(card, message) {
  card.classList.add('card-error');
  const badge = card.querySelector('.badge');
  if (badge) { badge.textContent = '선례를 못 찾음'; badge.classList.remove('loading'); badge.classList.add('none'); }
  const desc = card.querySelector('.desc');
  if (desc) desc.textContent = message || '이 단계의 검색 결과를 가져오지 못했습니다.';
  if (!card.querySelector('.card-footer')) {
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.style.cssText = 'margin-top:10px;display:flex;gap:8px;align-items:center;';
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn.sm';
    retryBtn.textContent = '다시 시도';
    retryBtn.addEventListener('click', () => {
      card.dispatchEvent(new CustomEvent('retry-stage', { detail: true }));
    });
    footer.appendChild(retryBtn);
    const note = document.createElement('span');
    note.className = 'card-status';
    note.style.cssText = 'color:var(--warn);font-size:12px;';
    note.textContent = message || '이 단계의 검색 결과를 가져오지 못했습니다.';
    footer.appendChild(note);
    card.appendChild(footer);
  }
}

function enrichCard(card, stage) {
  const h3 = card.querySelector('h3');
  const desc = card.querySelector('.desc');
  const badge = card.querySelector('.badge');
  if (h3 && stage.title) h3.textContent = stage.title;
  if (desc && stage.desc) desc.textContent = stage.desc;
  if (badge) {
    badge.classList.remove('loading');
    const v = normalizeVerdict(stage.verdict);
    badge.textContent = v;
    badge.classList.remove('ok', 'need', 'mix', 'none');
    if (v === '가져다 써도 됨') badge.classList.add('ok');
    else if (v === '직접 해야 함') badge.classList.add('need');
    else if (v === '섞어야 함') badge.classList.add('mix');
    else if (v === '선례를 못 찾음') badge.classList.add('none');
  }
  card.classList.remove('card-loading', 'card-error');
  const footer = card.querySelector('.card-footer');
  if (footer) footer.remove();

  if (stage.findings && stage.findings.length) {
    let section = card.querySelector('.card-section.findings-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'card-section findings-section';
      section.textContent = '찾은 자료';
      card.appendChild(section);
      const ul = document.createElement('ul');
      ul.className = 'findings';
      section.appendChild(ul);
    }
    const ul = section.querySelector('ul');
    ul.innerHTML = '';
    stage.findings.forEach((f) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = f.url || '';
      a.target = '_blank';
      a.textContent = f.name || '';
      li.appendChild(a);
      const meta = document.createElement('div');
      meta.style.cssText = 'color:#6b7686;font-size:11.5px;margin-top:2px;';
      meta.textContent = `[${f.kind || ''}] ${f.note || ''}`;
      li.appendChild(meta);
      ul.appendChild(li);
    });
  } else {
    const section = card.querySelector('.card-section.findings-section');
    if (section) section.remove();
  }

  if (stage.choices && stage.choices.length) {
    let section = card.querySelector('.card-section.choices-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'card-section choices-section';
      section.textContent = '선택지';
      card.appendChild(section);
      const choices = document.createElement('div');
      choices.className = 'choices';
      section.appendChild(choices);
    }
    const choices = section.querySelector('.choices');
    choices.innerHTML = '';
    stage.choices.forEach((c) => {
      const b = document.createElement('span');
      b.className = 'choice';
      b.textContent = c;
      choices.appendChild(b);
    });
    const todoSection = card.querySelector('.card-section.todos-section');
    if (todoSection) todoSection.remove();
  } else {
    const section = card.querySelector('.card-section.choices-section');
    if (section) section.remove();
  }

  if (stage.tasks && stage.tasks.length) {
    let section = card.querySelector('.card-section.tasks-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'card-section tasks-section';
      section.textContent = '이 단계의 할 일';
      card.appendChild(section);
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;font-size:12.5px;';
      section.appendChild(ul);
    }
    const ul = section.querySelector('ul');
    ul.innerHTML = '';
    stage.tasks.forEach((t) => {
      const li = document.createElement('li');
      li.style.cssText = 'color:#cfd4dd;padding:3px 0;border-bottom:1px solid #1d2330;';
      li.textContent = `${t.order}. ${t.task} — ${t.why || ''}`;
      ul.appendChild(li);
    });
  } else {
    const section = card.querySelector('.card-section.tasks-section');
    if (section) section.remove();
  }

  if (stage.todos && stage.todos.length) {
    let section = card.querySelector('.card-section.todos-section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'card-section todos-section';
      section.textContent = '실행 항목';
      card.appendChild(section);
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;font-size:12.5px;';
      section.appendChild(ul);
    }
    const ul = section.querySelector('ul');
    ul.innerHTML = '';
    stage.todos.forEach((t) => {
      const li = document.createElement('li');
      li.style.cssText = 'color:#cfd4dd;padding:3px 0;border-bottom:1px solid #1d2330;';
      const owner = document.createElement('span');
      owner.style.cssText = 'color:var(--accent);font-weight:600;';
      owner.textContent = `[${t.owner || ''}] `;
      li.appendChild(owner);
      li.appendChild(document.createTextNode(`${t.task} — ${t.note || ''}`));
      ul.appendChild(li);
    });
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCards(bp, stages) {
  dom.stageCards.innerHTML = '';
  const iconMap = {
    compass: 'compass', target: 'target', 'pencil-ruler': 'pencil-ruler',
    'layout-dashboard': 'layout-dashboard', 'code-xml': 'code-xml',
    database: 'database', server: 'server', cpu: 'cpu', wifi: 'wifi',
    smartphone: 'smartphone', 'gamepad-2': 'gamepad-2', palette: 'palette',
    image: 'image', video: 'video', film: 'film', mic: 'mic', headphones: 'headphones',
    'pen-line': 'pen-line', 'file-text': 'file-text', 'book-open': 'book-open',
    users: 'users', 'message-square': 'message-square', bot: 'bot',
    bell: 'bell', calendar: 'calendar', 'credit-card': 'credit-card',
    'shopping-cart': 'shopping-cart', map: 'map', globe: 'globe',
    shield: 'shield', 'flask-conical': 'flask-conical', 'search-check': 'search-check',
    rocket: 'rocket', package: 'package', settings: 'settings', wrench: 'wrench',
    'chart-bar': 'chart-bar',
  };
  const arr = bp && bp.stages ? bp.stages : [];
  arr.forEach((s, i) => {
    const icon = (s.icon && iconMap[s.icon]) ? s.icon : 'circle-dot';
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.stageIndex = i;
    card.innerHTML = `
      <div class="card-header">
        <span class="card-num">${i + 1}</span>
        <i data-lucide="${icon}" style="width:16px;height:16px;color:var(--accent);"></i>
        <h3></h3>
      </div>
      <p class="desc"></p>
      <div><span class="badge"></span></div>
    `;
    const h3 = card.querySelector('h3');
    const desc = card.querySelector('.desc');
    const badge = card.querySelector('.badge');
    h3.textContent = s.title || '';
    desc.textContent = s.desc || '';
    if (s.verdict) {
      const v = normalizeVerdict(s.verdict);
      badge.textContent = v;
      badge.classList.remove('ok', 'need', 'mix', 'none');
      if (v === '가져다 써도 됨') badge.classList.add('ok');
      else if (v === '직접 해야 함') badge.classList.add('need');
      else if (v === '섞어야 함') badge.classList.add('mix');
      else if (v === '선례를 못 찾음') badge.classList.add('none');
    }
    dom.stageCards.appendChild(card);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showQuestion(data) {
  state.currentQuestion = data;
  dom.qTitle.textContent = data.questionTitle || '';
  dom.qBody.textContent = data.questionBody || '';
  dom.suggestion.textContent = data.suggestion || '';
  dom.exampleButtons.innerHTML = '';
  if (data.exampleButtons && data.exampleButtons.length) {
    data.exampleButtons.forEach((b) => {
      dom.exampleButtons.innerHTML += exampleBtnHTML(b);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  dom.answerInput.value = '';
  dom.turnDisplay.textContent = state.turnCount + 1;
  dom.interviewHint.textContent = '예시 버튼을 누르거나 답변을 적고 제출하세요.';
  showInterviewUI();
  setMsg(dom.interviewMsg, '', false);
  dom.answerBtn.disabled = false;
  dom.answerInput.focus();
}

function showResult(summary) {
  state.summary = summary || '';
  showResultUI();
  dom.statusPill.textContent = '완료';
  setMsg(dom.interviewMsg, '', false);
  setMsg(dom.inputMsg, '', false);
}

export { renderCards, showQuestion, showResult, showInputUI, markLoading, markError, enrichCard };
