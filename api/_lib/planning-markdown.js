// api/_lib/planning-markdown.js
// 내려받는 문서 — 조사 기록과 단계별 제안 절을 조립한다.
// 모델·외부 API 호출 없음.

/** bigPicture의 planning을 받아 내려받는 문서 한 절을 조립한다.
 * planning이 없으면 빈 문자열(옛 입력 보존), 자료가 없으면 초안 표시.
 * 출력 순서와 문구는 기준코드 server/handoff.mjs의 planningMarkdown을 그대로 따른다. */
export function buildPlanningMarkdown(bigPicture) {
  const p = (bigPicture && bigPicture.planning) || null;
  if (!p) return '';

  const t = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const safe = v => t(v).replace(/[\\`*_{}\\[\\]<>#|]/g, '\\$&');
  const link = s => /^https?:\/\//.test(s.url) ? `[${safe(s.title)}](${s.url.replace(/[()<>\s]/g, c => encodeURIComponent(c).replace(/\(/g, '%28').replace(/\)/g, '%29'))})` : safe(s.title);

  // stageBasis가 Record(객체)이면 stageNo를 가진 배열로 읽는다
  const stageBasisArr = Array.isArray(p.stageBasis)
    ? p.stageBasis
    : typeof p.stageBasis === 'object' && p.stageBasis !== null
      ? Object.entries(p.stageBasis).map(([no, b]) => ({ stageNo: Number(no), ...b }))
      : [];

  const out = ['## 단계를 정한 이유와 자료', '', safe(p.basisSummary), '',
    `선행 조사 자료 ${p.sources.length}건 · 조회 ${safe(p.researchedAt)}`, '', p.sources.length ? '검색 결과의 제목과 발췌를 읽었습니다. 링크의 본문 전체를 읽은 기록은 아닙니다.' : '검색을 시도했지만 참고할 제목·발췌를 얻지 못했습니다.', ''];

  if (p.mode === 'research-informed') {
    out.push(
      '단계와 순서는 사용자 목표에 맞춘 제안이며 출처가 직접 증명한 순서는 아닙니다.',
      '',
      '### 참고한 조사 내용',
      ''
    );
    for (const note of p.researchNotes ?? []) {
      const source = p.sources.find((s) => s.id === note.sourceId);
      if (source) out.push(`- ${link(source)}`, `  > ${safe(note.excerpt)}`, '');
    }
  }

  for (const b of stageBasisArr) {
    if (!b || b.stageNo == null) continue;
    out.push(`### ${b.stageNo}. ${safe(bigPicture.stages?.find(s => s.no === b.stageNo)?.title || '단계')}`, '',
      `**${p.mode === 'research-informed' ? '목표에 맞춘 제안' : b.basis === 'source' ? '자료에 근거한 단계' : '상황에 맞춰 추가한 단계'}** · ${safe(b.reason)}`, '');
    for (const support of b.support) {
      const source = p.sources.find(s => s.id === support.sourceId);
      if (source) out.push(`- ${link(source)}`, `  > ${safe(support.excerpt)}`, '');
    }
  }

  out.push('### 선행 조사 출처', '');
  for (const s of p.sources) {
    out.push(
      `- ${link(s)} · 조회 ${safe(s.accessedAt)}`,
      `  ${safe(s.snippet)}`,
      `  검색어: ${s.queries.map(safe).join(' · ')}`,
      ''
    );
  }

  for (const warning of p.warnings) {
    out.push(safe(warning), '');
  }

  return out.join('\n');
}
