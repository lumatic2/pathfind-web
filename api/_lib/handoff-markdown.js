// api/_lib/handoff-markdown.js
// 조사 결과를 PATH.md 형식 마크다운으로 조립한다.
// 모델·외부 API 호출 없음.

import { buildPlanningMarkdown } from './planning-markdown.js';

const VERDICT_LINES = {
  '가져다 써도 됨': '이미 나와 있는 것을 가져다 쓰면 됩니다',
  '직접 해야 함': '직접 만들어야 하는 부분입니다',
  '섞어야 함': '가져다 쓸 것과 직접 만들 것이 섞여 있습니다',
  '선례를 못 찾음': '참고할 자료를 찾지 못했습니다',
};

const CHANNEL_LABELS = {
  web: '웹 문서',
  oss: '오픈소스',
  public_data: '공공데이터',
  stats: '국가통계',
  law: '국가법령',
  web_review: '후기',
};

function dateKorean() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}

function verdictLine(stage) {
  if (stage.verdictLine && stage.verdictLine.trim()) return stage.verdictLine.trim();
  const v = stage.verdict;
  if (!v) return null;
  const text = VERDICT_LINES[v] ?? null;
  if (!text) return null;
  return text;
}

function stageVerdictParagraph(stage) {
  const bring = stage.findings ? stage.findings.length : 0;
  const todos = stage.todos ? stage.todos.filter(t => t.owner === '가져다 씀').length : 0;
  const tasks = stage.tasks ? stage.tasks.length : 0;
  const directTodos = stage.todos ? stage.todos.filter(t => t.owner === '직접 함').length : 0;
  const bringCount = bring + todos;
  const directCount = tasks + directTodos;
  if (bringCount === 0 && directCount === 0) {
    return '아직 조사한 자료가 없습니다.';
  }
  const parts = [];
  if (bringCount > 0) parts.push(`가져다 쓸 것 ${bringCount}개`);
  if (directCount > 0) parts.push(`직접 만들 것 ${directCount}개`);
  return parts.join(', ') + '입니다.';
}

function findingLine(f) {
  const name = f.name || '자료';
  const url = f.url && f.url.trim() ? f.url.trim() : null;
  const kind = f.kind || '';
  const channelLabel = f.channel && CHANNEL_LABELS[f.channel]
    ? CHANNEL_LABELS[f.channel]
    : (f.channel || '');
  const grade = f.grade || '';
  const parts = [kind, channelLabel, grade].filter(Boolean);
  const middle = parts.length > 0 ? ` · ${parts.join(' · ')}` : '';
  const note = f.note && f.note.trim() ? f.note.trim() : '';
  const head = url
    ? `- [${name}](${url})`
    : `- ${name}`;
  if (note) {
    return `${head}${middle}
  - ${note}`;
  }
  return `${head}${middle}`;
}

/**
 * 큰 그림·단계 배열·요약 문자열을 받아 PATH.md 형식 마크다운을 조립한다.
 * 모델·외부 API 호출 없음. 계약 값의 날것 판정 문자열은 화면에 내지 않는다.
 */
export function buildPathMarkdown(bigPicture, stages, summary) {
  const title = (bigPicture && bigPicture.title) ? bigPicture.title : '패스';
  const intro = (bigPicture && bigPicture.intro) ? bigPicture.intro : '';
  const usedSummary = !intro && summary && summary.trim();
  const introText = usedSummary ? summary.trim() : intro;

  const d = new Date();
  const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const stageList = (stages || []).filter(s => s && typeof s === 'object');
  const totalStages = stageList.length;
  let totalFindings = 0;
  for (const s of stageList) {
    totalFindings += (s.findings || []).length;
  }

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  if (introText) {
    lines.push(introText);
    lines.push('');
  }
  lines.push(`> 작성일: ${isoDate} · 단계: ${totalStages}개 · 자료: ${totalFindings}건`);
  lines.push('');

  const planningMd = buildPlanningMarkdown(bigPicture);
  if (planningMd) {
    lines.push(planningMd);
    lines.push('');
  }

  if (summary && summary.trim() && !usedSummary) {
    lines.push('## 요약');
    lines.push('');
    lines.push(summary.trim());
    lines.push('');
  }

  if (stageList.length === 0) {
    lines.push('아직 조사 단계가 없습니다.');
    lines.push('');
  } else {
    for (const s of stageList) {
      lines.push(`## ${s.no}. ${s.title}`);
      lines.push('');
      const desc = s.desc || '확인 불가';
      lines.push(desc);
      lines.push('');

      const vLine = verdictLine(s);
      if (vLine) {
        lines.push(`**${vLine}**`);
        lines.push('');
        const reason = s.verdictReason && s.verdictReason.trim();
        if (reason) {
          lines.push(reason);
          lines.push('');
        }
      } else {
        lines.push(stageVerdictParagraph(s));
        lines.push('');
      }

      // 참고한 자료 — 세 번째 수준 headings, 항상 출력
      lines.push('### 참고한 자료');
      lines.push('');
      const findings = s.findings || [];
      if (findings.length > 0) {
        for (const f of findings) lines.push(findingLine(f));
      } else {
        lines.push('이 단계에서는 참고할 자료를 찾지 못했습니다.');
      }
      lines.push('');

      // 할 일 — tasks와 todos를 병합, 중복 없이, 체크상자와 owner·note 부착
      const todos = s.todos || [];
      const tasks = s.tasks || [];
      const byTask = new Map();
      for (const t of tasks) {
        if (!t || !t.task) continue;
        byTask.set(t.task, { task: t.task, owner: '직접 함', note: '' });
      }
      for (const t of todos) {
        if (!t || !t.task) continue;
        const note = t.note && t.note.trim() ? t.note.trim() : '';
        const owner = t.owner === '가져다 씀' ? '가져다 씀' : '직접 함';
        if (byTask.has(t.task)) {
          const existing = byTask.get(t.task);
          existing.owner = owner;
          if (note) existing.note = note;
        } else {
          byTask.set(t.task, { task: t.task, owner, note });
        }
      }
      const orderedTasks = [...byTask.values()];
      if (orderedTasks.length > 0) {
        lines.push('**할 일:**');
        for (const t of orderedTasks) {
          const notePart = t.note ? ` (${t.note})` : '';
          lines.push(`- [ ] ${t.task} [${t.owner}]${notePart}`);
        }
        lines.push('');
      }

      // 선택지 — options를 우선하고, options가 없으면 choices(옛)만 있는 경우도 보존
      const options = s.options || s.choices || [];
      const nonempty = options.filter(c => c && c.trim());
      if (nonempty.length > 0) {
        lines.push('**선택지:**');
        nonempty.forEach((c, i) => { lines.push(`${i + 1}. ${c.trim()}`); });
        lines.push('');
      }
    }
  }

  const loop = bigPicture && bigPicture.prototypeLoop;
  if (loop && typeof loop === 'object') {
    lines.push('## 다음 회차');
    lines.push('');
    if (typeof loop === 'string' && loop.trim()) {
      lines.push(loop.trim());
    } else if (loop.message && typeof loop.message === 'string') {
      lines.push(loop.message.trim());
      if (loop.items && Array.isArray(loop.items)) {
        lines.push('');
        loop.items.forEach(item => lines.push(`- ${item}`));
      }
    } else {
      lines.push(JSON.stringify(loop, null, 2));
    }
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}