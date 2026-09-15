// api/_lib/handoff-markdown.js
// 조사 결과를 PATH.md 형식 마크다운으로 조립한다.
// 모델·외부 API 호출 없음.

const VERDICT_LINES = {
  '가져다 써도 됨': '이미 나와 있는 것을 가져다 쓰면 됩니다',
  '직접 해야 함': '직접 만들어야 하는 부분입니다',
  '섞어야 함': '가져다 쓸 것과 직접 만들 것이 섞여 있습니다',
  '선례를 못 찾음': '참고할 자료를 찾지 못했습니다',
};

const CHANNEL_LABELS = {
  web: '웹 검색',
  oss: '오픈소스 GitHub',
  public_data: '공공데이터포털',
  stats: '국가통계 KOSIS',
  law: '국가법령정보',
  web_review: '블로그·카페 후기',
};

function dateKorean() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}년 ${m}월 ${day}일`;
}

function verdictLine(stage) {
  const v = stage.verdict;
  if (!v) return null;
  const text = VERDICT_LINES[v] ?? null;
  if (!text) return null;
  const reason = (stage.verdictReason && stage.verdictReason.trim()) ? stage.verdictReason.trim() : null;
  if (reason) return `${text} — ${reason}`;
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
  const grade = f.grade ? ` · ${f.grade}` : '';
  const channel = f.channel && CHANNEL_LABELS[f.channel] ? CHANNEL_LABELS[f.channel] : (f.channel || '');
  const channelPart = channel ? ` · ${channel}` : '';
  const note = f.note && f.note.trim() ? ` — ${f.note.trim()}` : '';
  if (url) {
    return `- [${name}](${url})${grade}${channelPart}${note}`;
  }
  return `- ${name}${grade}${channelPart}${note}`;
}

/**
 * 큰 그림·단계 배열·요약 문자열을 받아 PATH.md 형식 마크다운을 조립한다.
 * 모델·외부 API 호출 없음. 계약 값의 날것 판정 문자열은 화면에 내지 않는다.
 */
export function buildPathMarkdown(bigPicture, stages, summary) {
  const title = (bigPicture && bigPicture.title) ? bigPicture.title : '로드맵';
  const intro = (bigPicture && bigPicture.intro) ? bigPicture.intro : '';
  const date = dateKorean();

  const stageList = (stages || []).filter(s => s && typeof s === 'object');
  const totalStages = stageList.length;

  let totalFindings = 0;
  for (const s of stageList) {
    totalFindings += (s.findings || []).length;
  }

  const lines = [];

  // 제목
  lines.push(`# ${title}`);
  lines.push('');

  // 소개
  if (intro) {
    lines.push(intro);
    lines.push('');
  }

  // 날짜와 통계
  lines.push(`**작성일:** ${date}`);
  lines.push(`**단계:** ${totalStages}개`);
  lines.push(`**자료:** ${totalFindings}건`);
  lines.push('');

  // 요약
  if (summary && summary.trim()) {
    lines.push('## 요약');
    lines.push('');
    lines.push(summary.trim());
    lines.push('');
  }

  // 단계별
  if (stageList.length === 0) {
    lines.push('아직 조사 단계가 없습니다.');
    lines.push('');
  } else {
    lines.push('## 단계별 조사 결과');
    lines.push('');
    for (const s of stageList) {
      lines.push(`### ${s.no}. ${s.title}`);
      lines.push('');
      lines.push(`- 설명: ${s.desc || '확인 불가'}`);
      lines.push('');

      // 판정 문장 (verdictLine 먼저)
      const vLine = verdictLine(s);
      if (vLine) {
        lines.push(vLine);
        lines.push('');
      } else {
        lines.push(stageVerdictParagraph(s));
        lines.push('');
      }

      // 찾은 자료
      const findings = s.findings || [];
      if (findings.length > 0) {
        lines.push('**찾은 자료:**');
        for (const f of findings) {
          lines.push(findingLine(f));
        }
        lines.push('');
      }

      // 선택지
      const choices = s.choices || [];
      if (choices.length > 0) {
        lines.push('**선택지:**');
        choices.forEach((c, i) => {
          if (c) lines.push(`${i + 1}. ${c}`);
        });
        lines.push('');
      }

      // 할 일 (todo + task)
      const todos = s.todos || [];
      const tasks = s.tasks || [];
      if (todos.length > 0 || tasks.length > 0) {
        lines.push('**할 일:**');
        for (const t of todos) {
          if (t) {
            const owner = t.owner === '가져다 씀' ? '[가져다 씀]' : '[직접 함]';
            const note = t.note && t.note.trim() ? ` (${t.note.trim()})` : '';
            lines.push(`- ${owner} ${t.task}${note}`);
          }
        }
        for (const t of tasks) {
          if (t) {
            lines.push(`- [할 일] ${t.task}`);
          }
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
