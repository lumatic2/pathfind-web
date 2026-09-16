// api/_lib/handoff-markdown.js
// 조사 결과를 PATH.md 형식 마크다운으로 조립한다.
// 모델·외부 API 호출 없음.

import { buildPlanningMarkdown } from './planning-markdown.js';

const VERDICT_SENTENCE = {
  '가져다 써도 됨': '이미 나와 있는 것을 가져다 쓰면 됩니다',
  '섞어야 함': '가져다 쓸 것과 직접 만들 것이 섞여 있습니다',
  '직접 해야 함': '직접 만들어야 하는 부분입니다',
  '선례를 못 찾음': '참고할 자료를 찾지 못했습니다',
};

const CHANNEL_LABEL = {
  web: '웹 문서',
  web_review: '후기',
  oss: '오픈소스',
  law: '국가법령',
  stats: '국가통계',
  public_data: '공공데이터',
};

const t = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const block = (v) => String(v ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

function findingLine(f) {
  const name = t(f?.name) || '이름 없는 자료';
  const url = t(f?.url);
  const head = url ? `[${name}](${url})` : name;
  const tags = [t(f?.kind), CHANNEL_LABEL[t(f?.channel)] ?? t(f?.channel), t(f?.grade) && `근거 등급 ${t(f.grade)}`].filter(Boolean);
  const note = t(f?.note);
  return `- ${head}${tags.length ? ` — ${tags.join(' · ')}` : ''}${note ? `\n  ${note}` : ''}`;
}

function todoLine(x) {
  const task = t(x?.task);
  if (!task) return '';
  const owner = t(x?.owner) === '직접 함' ? '직접 함' : '가져다 씀';
  const note = t(x?.note);
  return `- [ ] ${task} — ${owner}${note ? ` · ${note}` : ''}`;
}

export function buildPathMarkdown(bigPicture, stages, summary) {
  const bp = bigPicture ?? {};
  const list = Array.isArray(stages) ? stages : [];
  const title = t(bp.title) || '패스';
  const total = list.reduce((a, s) => a + (Array.isArray(s?.findings) ? s.findings.length : 0), 0);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const out = [`# ${title}`, ''];
  const intro = block(bp.intro) || block(summary);
  if (intro) out.push(intro, '');
  out.push(`> 단계 ${list.length}개 · 참고 자료 ${total}건 · ${today} 에 만들었습니다.`, '');
  const planning = buildPlanningMarkdown(bp);
  if (planning) out.push(planning, '');

  for (const [i, s] of list.entries()) {
    const no = Number.isFinite(s?.no) ? s.no : i + 1;
    out.push(`## ${no}. ${t(s?.title) || '제목 없는 단계'}`, '');
    const desc = block(s?.desc);
    if (desc) out.push(desc, '');

    const line = block(s?.verdictLine) || VERDICT_SENTENCE[t(s?.verdict)] || '';
    if (line) out.push(`**${line}**`, '');
    const reason = block(s?.verdictReason);
    if (reason) out.push(reason, '');

    const findings = Array.isArray(s?.findings) ? s.findings : [];
    out.push('### 참고한 자료', '');
    out.push(findings.length ? findings.map(findingLine).join('\n') : '이 단계에서는 참고할 자료를 찾지 못했습니다.', '');

    const todos = (Array.isArray(s?.todos) ? s.todos : []).map(todoLine).filter(Boolean);
    if (todos.length) out.push('### 할 일', '', todos.join('\n'), '');

    const options = (Array.isArray(s?.options) ? s.options : []).map(t).filter(Boolean);
    if (options.length) out.push('### 고를 수 있는 것', '', options.map((o) => `- ${o}`).join('\n'), '');
  }

  const loop = block(bp.prototypeLoop);
  if (loop) out.push('## 다음 회차에 이어 갈 것', '', loop, '');

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
