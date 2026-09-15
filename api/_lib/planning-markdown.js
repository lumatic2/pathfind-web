// api/_lib/planning-markdown.js
// 내려받는 문서 — 조사 기록과 단계별 제안 절을 조립한다.
// 모델·외부 API 호출 없음.

/** bigPicture의 planning을 받아 내려받는 문서 한 절을 조립한다.
 * planning이 없으면 빈 문자열(옛 입력 보존), 자료가 없으면 초안 표시. */
export function buildPlanningMarkdown(bigPicture) {
  const planning = (bigPicture && bigPicture.planning) ? bigPicture.planning : null;
  if (!planning) return '';

  const sources = planning.sources || [];
  const researchNotes = planning.researchNotes || [];
  const stageBasis = planning.stageBasis || [];
  const trace = planning.trace || [];
  const warnings = planning.warnings || [];
  const basisSummary = planning.basisSummary || '';
  const stages = (bigPicture && bigPicture.stages) || [];

  const stageMap = new Map();
  for (const s of stages) {
    if (s && typeof s === 'object' && s.no != null) stageMap.set(s.no, s);
  }

  const hasMaterial = sources.length > 0 || researchNotes.length > 0;
  const lines = [];

  lines.push('# 내려받은 문서 — 조사 기록과 단계별 제안');
  lines.push('');

  if (planning.researchedAt) {
    lines.push(`**조사 일시:** ${planning.researchedAt}`);
    lines.push('');
  }

  // 참고 자료 — 실제 검색 자료(제목·링크·발췌)와 모델 제안 이유를 구분한다.
  lines.push('## 참고 자료');
  lines.push('');
  if (hasMaterial) {
    for (const src of sources) {
      if (!src || !src.id) continue;
      const title = src.title || '자료';
      const url = src.url && src.url.trim() ? src.url.trim() : null;
      const snippet = src.snippet || '';
      const channel = src.channel || '';
      if (url) {
        lines.push(`- [${title}](${url})`);
      } else {
        lines.push(`- ${title}`);
      }
      if (snippet) lines.push(`  ${snippet}`);
      if (channel) lines.push(`  채널: ${channel}`);
      lines.push('');
    }
    for (const note of researchNotes) {
      if (!note || !note.sourceId) continue;
      const excerpt = note.excerpt || '';
      if (excerpt) {
        lines.push(`- 발췌(직접 참고): ${excerpt}`);
        lines.push('');
      }
    }
  } else {
    lines.push('아직 조사 자료가 없습니다. 인터뷰 기반 초안입니다.');
    lines.push('');
  }

  // 전체 제안 이유
  if (basisSummary && basisSummary.trim()) {
    lines.push('## 전체 제안 이유');
    lines.push('');
    lines.push(basisSummary.trim());
    lines.push('');
  }

  // 단계별 제안 이유
  if (stageBasis.length > 0) {
    lines.push('## 단계별 제안 이유');
    lines.push('');
    for (const sb of stageBasis) {
      if (!sb || sb.stageNo == null) continue;
      const stage = stageMap.get(sb.stageNo);
      const stageTitle = (stage && stage.title) ? stage.title : `단계 ${sb.stageNo}`;
      lines.push(`### ${sb.stageNo}. ${stageTitle}`);
      lines.push('');
      const reason = sb.reason || '';
      if (reason) {
        lines.push(`- 제안 이유: ${reason}`);
        lines.push('');
      }
      const sourceIds = sb.sourceIds || [];
      if (sourceIds.length > 0) {
        lines.push('- 이 단계가 참고한 자료:');
        for (const id of sourceIds) {
          const src = sources.find(s => s && s.id === id);
          if (src) {
            const t = src.title || '자료';
            const u = src.url && src.url.trim() ? src.url.trim() : null;
            if (u) lines.push(`  - [${t}](${u})`);
            else lines.push(`  - ${t}`);
          } else {
            lines.push(`  - (자료 ${id})`);
          }
        }
        lines.push('');
      }
    }
  }

  // 조회 기록
  if (trace.length > 0) {
    lines.push('## 조회 기록');
    lines.push('');
    for (const t of trace) {
      if (!t) continue;
      const q = t.query || '';
      const ch = t.channel || '';
      const st = t.status || '';
      const cnt = t.count != null ? String(t.count) : '';
      const el = t.elapsedMs != null ? `${t.elapsedMs}ms` : '';
      lines.push(`- ${q} (${ch}) — 상태: ${st}, 결과: ${cnt}, 소요: ${el}`);
    }
    lines.push('');
  }

  // 한계
  if (warnings.length > 0) {
    lines.push('## 한계');
    lines.push('');
    for (const w of warnings) {
      if (w) lines.push(`- ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
