/* === 렌더링 함수 === */
import { dom, state, exampleBtnHTML, setMsg, show, hide } from './state.js';

function renderCards(bp) {
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

  bp.stages.forEach((s, i) => {
    const icon = (s.icon && iconMap[s.icon]) ? s.icon : 'circle-dot';
    const card = document.createElement('div');
    card.className = 'card';
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
    h3.textContent = s.title;
    desc.textContent = s.desc;
    if (s.verdict === '가져다 써도 됨') { badge.textContent = '가져다 써도 됨'; badge.classList.add('ok'); }
    else if (s.verdict === '직접 해야 함') { badge.textContent = '직접 해야 함'; badge.classList.add('need'); }
    else if (s.verdict === '섞어야 함') { badge.textContent = '섞어야 함'; badge.classList.add('mix'); }
    else if (s.verdict === '선례를 못 찾음') { badge.textContent = '선례를 못 찾음'; badge.classList.add('none'); }
    else { badge.textContent = s.verdict; }

    if (s.findings && s.findings.length) {
      const section = document.createElement('div');
      section.className = 'card-section';
      section.textContent = '찾은 자료';
      card.appendChild(section);
      const ul = document.createElement('ul');
      ul.className = 'findings';
      s.findings.forEach((f) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = f.url;
        a.target = '_blank';
        a.textContent = f.name;
        li.appendChild(a);
        const meta = document.createElement('div');
        meta.style.cssText = 'color:#6b7686;font-size:11.5px;margin-top:2px;';
        meta.textContent = `[${f.kind}] ${f.note || ''}`;
        li.appendChild(meta);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    if (s.choices && s.choices.length) {
      const section = document.createElement('div');
      section.className = 'card-section';
      section.textContent = '선택지';
      card.appendChild(section);
      const choices = document.createElement('div');
      choices.className = 'choices';
      s.choices.forEach((c) => {
        const b = document.createElement('span');
        b.className = 'choice';
        b.textContent = c;
        choices.appendChild(b);
      });
      card.appendChild(choices);
    }

    if (s.tasks && s.tasks.length) {
      const section = document.createElement('div');
      section.className = 'card-section';
      section.textContent = '이 단계의 할 일';
      card.appendChild(section);
      const ul = document.createElement('ul');
      ul.style.cssText = 'list-style:none;padding:0;margin:0;font-size:12.5px;';
      s.tasks.forEach((t) => {
        const li = document.createElement('li');
        li.style.cssText = 'color:#cfd4dd;padding:3px 0;border-bottom:1px solid #1d2330;';
        li.textContent = `${t.order}. ${t.task} — ${t.why || ''}`;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    dom.stageCards.appendChild(card);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

export { renderCards, showQuestion, showResult };

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
  show(dom.interviewSection);
  hide(dom.inputSection);
  hide(dom.resultSection);
  setMsg(dom.interviewMsg, '', false);
  dom.answerBtn.disabled = false;
  dom.answerInput.focus();
}

function showResult(summary) {
  state.summary = summary || '';
  show(dom.resultSection);
  hide(dom.inputSection);
  hide(dom.interviewSection);
  dom.statusPill.textContent = '완료';
  setMsg(dom.interviewMsg, '', false);
  setMsg(dom.inputMsg, '', false);
}
