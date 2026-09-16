// api/_lib/planning-markdown.js
// 내려받는 문서 — 조사 기록과 단계별 제안 절을 조립한다.
// 모델·외부 API 호출 없음.

/** 마크다운 특수 문자를 이스케이프한다(text에서만). */
function escapeMd(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\\`*_{}\\[\\]#>|]/g, '\\$&');
}

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
  const hasMaterial = sources.length > 0 || researchNotes.length > 0;
  const requiresDraft = sources.length === 0 || researchNotes.length === 0;

  const stageMap = new Map();
  for (const s of stages) {
    if (s && typeof s === 'object' && s.no != null) stageMap.set(s.no, s);
  }
  const sourceById = new Map();
  for (const src of sources) {
    if (src && src.id) sourceById.set(src.id, src);
  }

  const lines = [];
  if (planning.researchedAt) {
    lines.push(`**조사 일시:** ${planning.researchedAt}`);
    lines.push('');
  }

  // 단계를 정한 이유와 자료 — 2수준 제목 하나로
  lines.push('## 단계를 정한 이유와 자료');
  lines.push('');
  if (basisSummary && basisSummary.trim()) {
    lines.push(basisSummary.trim());
    lines.push('');
  }
  lines.push(`- 자료 수: ${sources.length}건`);
  if (planning.researchedAt) {
    lines.push(`- 조회 시각: ${planning.researchedAt}`);
  }
  lines.push('');
  lines.push('검색 결과의 제목과 발췌를 읽었고, 링크 본문 전체를 읽은 기록은 아닙니다.');
  lines.push('');

  // 단계별 제안 이유 — 3수준 제목으로 시작
  if (stageBasis.length > 0) {
    for (const sb of stageBasis) {
      if (!sb || sb.stageNo == null) continue;
      const stage = stageMap.get(sb.stageNo);
      const stageTitle = (stage && stage.title) ? stage.title : `단계 ${sb.stageNo}`;
      lines.push(`### ${sb.stageNo}. ${escapeMd(stageTitle)}`);
      lines.push('');
      const reason = sb.reason || '';
      if (reason) {
        lines.push(`- **목표에 맞춘 제안:** ${escapeMd(reason)}`);
        lines.push('');
      }
      const support = sb.support || [];
      const sourceIds = sb.sourceIds || [];
      const strIds = sourceIds.filter(id => typeof id === 'string');
      const objSupps = support.filter(s => s && typeof s === 'object' && s.sourceId && typeof s.excerpt === 'string');
      const allIds = [...strIds, ...objSupps.map(s => s.sourceId)];
      if (allIds.length > 0 || objSupps.length > 0) {
        lines.push('- 이 단계가 참고한 자료:');
        for (const id of strIds) {
          const src = sourceById.get(id);
          if (src) {
            const t = src.title || '자료';
            const u = src.url && src.url.trim() ? src.url.trim() : null;
            const tEsc = escapeMd(t);
            if (u) lines.push(`  - [${tEsc}](${u})`);
            else lines.push(`  - ${tEsc}`);
          } else {
            lines.push(`  - (자료 ${id})`);
          }
        }
        for (const obj of objSupps) {
          const src = sourceById.get(obj.sourceId);
          if (!src) continue;
          const excEsc = escapeMd(obj.excerpt);
          const sT = src.title || '자료';
          const sU = src.url && src.url.trim() ? src.url.trim() : null;
          const sTEsc = escapeMd(sT);
          if (sU) lines.push(`  - [${sTEsc}](${sU}) (자료 ${obj.sourceId})`);
          else lines.push(`  - ${sTEsc} (자료 ${obj.sourceId})`);
          if (excEsc) lines.push(`    > ${excEsc}`);
        }
        lines.push('');
      }
    }
  }

  // 참고한 조사 내용 — research-informed일 때만 3수준 제목으로
  if (hasMaterial) {
    lines.push('### 참고한 조사 내용');
    lines.push('');
    for (const src of sources) {
      if (!src || !src.id) continue;
      const title = src.title || '자료';
      const url = src.url && src.url.trim() ? src.url.trim() : null;
      const titleEsc = escapeMd(title);
      if (url) {
        lines.push(`- [${titleEsc}](${url})`);
      } else {
        lines.push(`- ${titleEsc}`);
      }
      if (src.accessedAt) lines.push(`  접근: ${src.accessedAt}`);
      if (src.snippet) lines.push(`  발췌: ${escapeMd(src.snippet)}`);
      if (src.queries && src.queries.length > 0) {
        lines.push(`  검색어: ${src.queries.map(escapeMd).join(', ')}`);
      }
      if (src.channel) lines.push(`  채널: ${src.channel}`);
      lines.push('');
    }
    for (const note of researchNotes) {
      if (!note || !note.sourceId || !note.excerpt) continue;
      const src = sourceById.get(note.sourceId);
      if (!src) continue;
      const excEsc = escapeMd(note.excerpt);
      const sTitle = src.title || '자료';
      const sUrl = src.url && src.url.trim() ? src.url.trim() : null;
      const sTitleEsc = escapeMd(sTitle);
      if (sUrl) lines.push(`- [${sTitleEsc}](${sUrl}) (자료 ${note.sourceId})`);
      else lines.push(`- ${sTitleEsc} (자료 ${note.sourceId})`);
      lines.push(`  > ${excEsc}`);
      lines.push('');
    }
  }

  // 초안 안내 — sources나 researchNotes 중 하나라도 없으면
  if (requiresDraft) {
    lines.push('### 초안 안내');
    lines.push('');
    lines.push('아직 조사 자료가 충분하지 않습니다. 인터뷰 기반으로 작성된 초안입니다.');
    lines.push('');
  }

  // 추가 조회 기록 — 3수준 제목으로 마지막
  if (trace.length > 0) {
    lines.push('### 추가 조회 기록');
    lines.push('');
    for (const t of trace) {
      if (!t) continue;
      const q = t.query || '';
      const ch = t.channel || '';
      const st = t.status || '';
      const cnt = t.count != null ? String(t.count) : '';
      const el = t.elapsedMs != null ? `${t.elapsedMs}ms` : '';
      lines.push(`- ${escapeMd(q)} (${escapeMd(ch)}) — 상태: ${st}, 결과: ${cnt}, 소요: ${el}`);
    }
    lines.push('');
  }

  // 한계 — 3수준 제목으로 마지막
  if (warnings.length > 0) {
    lines.push('### 한계');
    lines.push('');
    for (const w of warnings) {
      if (w) lines.push(`- ${escapeMd(w)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
