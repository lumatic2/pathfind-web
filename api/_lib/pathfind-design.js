// api/_lib/pathfind-design.js — 모델 단계 제안 검사·정상화
// 계약: docs/api-contract.md §2 (bigPicture.planning, bigPicture.stages).
// export: normalizePlanningDesign.
//
// 모델이 설계 모양으로 요청한 필드(title·intro·basisSummary·steps·referenceIds·limitations)를
// 받아 실제 자료 목록과 대조해 검증하고, 정상이면 bigPicture.stages + planning.stageBasis로
// 바꿔 넣는다. 가짜 식별자·필수 설명 누락은 422 구분.

/**
 * @param {object} modelDesign - 모델 설계 입력
 *   { title, intro, basisSummary, steps, referenceIds, limitations, researchNotes? }
 * @param {Array<{id:string,title:string,url:string,snippet:string}>} sources - 실제 자료 목록
 * @returns {{ ok:boolean, status:number, error?:string, data?:object }}
 */
export function normalizePlanningDesign(modelDesign, sources) {
  const srcById = new Map((sources || []).map((s) => [s.id, s]));
  const errors = [];

  if (!modelDesign || typeof modelDesign !== 'object') {
    return { ok: false, status: 422, error: '설계 입력이 객체가 아닙니다' };
  }

  const title = modelDesign.title;
  if (typeof title !== 'string' || !title.trim()) {
    errors.push('title이 비어 있습니다');
  } else if (title.length > 24) {
    errors.push('title이 24자를 초과합니다');
  }

  const intro = modelDesign.intro;
  if (typeof intro !== 'string' || !intro.trim()) {
    errors.push('intro가 비어 있습니다');
  }

  const basisSummary = modelDesign.basisSummary;
  if (typeof basisSummary !== 'string' || !basisSummary.trim()) {
    errors.push('basisSummary가 비어 있습니다');
  } else if (basisSummary.length > 400) {
    errors.push('basisSummary가 400자를 초과합니다');
  }

  const steps = modelDesign.steps;
  if (!Array.isArray(steps) || steps.length < 4 || steps.length > 7) {
    errors.push('steps는 4~7개 단계 배열이어야 합니다');
  } else {
    steps.forEach((s, i) => {
      if (!s || typeof s !== 'object') {
        errors.push(`단계 ${i + 1}이 객체가 아닙니다`);
        return;
      }
      if (typeof s.no !== 'number' || !Number.isInteger(s.no) || s.no < 1) {
        errors.push(`단계 ${i + 1}의 no가 유효하지 않습니다`);
      }
      if (typeof s.title !== 'string' || !s.title.trim()) {
        errors.push(`단계 ${i + 1}의 title이 비어 있습니다`);
      } else if (s.title.length > 24) {
        errors.push(`단계 ${i + 1}의 title이 24자를 초과합니다`);
      }
      if (typeof s.desc !== 'string' || !s.desc.trim()) {
        errors.push(`단계 ${i + 1}의 desc가 비어 있습니다`);
      }
      if (typeof s.reason !== 'string' || !s.reason.trim()) {
        errors.push(`단계 ${i + 1}의 제안 이유(reason)가 비어 있습니다`);
      }
    });
  }

  // 참고 식별자: 실제 자료 목록에 있는 것만 허용
  const refIds = modelDesign.referenceIds;
  if (!Array.isArray(refIds)) {
    errors.push('referenceIds는 문자열 배열이어야 합니다');
  } else {
    for (const id of refIds) {
      if (typeof id !== 'string' || !id.trim()) {
        errors.push('referenceIds에 빈 식별자가 있습니다');
        continue;
      }
      if (!srcById.has(id)) {
        errors.push(`참고 식별자가 자료에 없습니다: ${id}`);
      }
    }
  }

  // 한계 설명 정상화: 문자열이면 한 항목 배열, 없으면 빈 배열
  let limitations = [];
  if (modelDesign.limitations !== undefined) {
    if (typeof modelDesign.limitations === 'string') {
      limitations = modelDesign.limitations.trim() ? [modelDesign.limitations.trim()] : [];
    } else if (Array.isArray(modelDesign.limitations)) {
      limitations = modelDesign.limitations.filter((l) => typeof l === 'string' && l.trim());
    } else {
      errors.push('limitations는 문자열 또는 문자열 배열이어야 합니다');
    }
  }

  if (errors.length > 0) {
    return { ok: false, status: 422, error: errors.join('; ') };
  }

  // researchNotes: 선택한 자료의 실제 발췌에서 조립
  const researchNotes = [];
  const notesRaw = modelDesign.researchNotes;
  if (Array.isArray(notesRaw)) {
    for (const n of notesRaw) {
      if (!n || typeof n !== 'object') continue;
      const sid = n.sourceId;
      if (typeof sid !== 'string' || !sid.trim()) continue;
      const src = srcById.get(sid);
      if (!src) continue;
      const excerpt = (n.excerpt && typeof n.excerpt === 'string') ? n.excerpt.trim() : '';
      if (!excerpt) continue;
      researchNotes.push({ sourceId: sid, excerpt: excerpt.slice(0, 800) });
    }
  }

  // stages: steps를 순서대로 번호 붙여 변환, tasks·choices는 빈 배열
  const stages = steps.map((s, idx) => ({
    no: idx + 1,
    title: s.title.trim(),
    desc: s.desc.trim(),
    icon: s.icon || 'compass',
    tasks: [],
    choices: [],
    verdict: '직접 해야 함',
    verdictReason: '',
    findings: [],
  }));

  // stageBasis: adaptation, sourceIds·support 빈 배열
  const stageBasis = steps.map((s, idx) => ({
    stageNo: idx + 1,
    basis: 'adaptation',
    reason: s.reason.trim(),
    sourceIds: [],
    support: [],
  }));

  const data = {
    bigPicture: {
      title: title.trim(),
      intro: intro.trim(),
      stages,
    },
    planning: {
      version: 1,
      mode: 'research-informed',
      basisSummary: basisSummary.trim(),
      sources: sources || [],
      researchNotes,
      stageBasis,
      warnings: limitations,
      events: [
        { name: 'request_received', elapsedMs: 0 },
        { name: 'design_finished', elapsedMs: 0 },
        { name: 'response_ready', elapsedMs: 0 },
      ],
      trace: [],
      groundingChecks: [],
    },
  };

  return { ok: true, status: 200, data };
}
