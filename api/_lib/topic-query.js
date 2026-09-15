// 요약 문자열에서 주제어를 뽑는다.
// 첫 굵은 구절(**...**)이 있으면 그곳을 우선하고, 없으면 첫 문장에서 낱말을 뽑는다.
// 뽑힌 낱말 중 서술형 끝말(합니다·입니다 등)을 빼고 뒤에서 두 개를 주제어로 삼는다.

const DESCRIPTIVE_ENDINGS = new Set([
  '합니다',
  '입니다',
  '아니다',
  '없다',
  '있다',
  '같다',
  '다수',
  '등이다',
  '이다',
]);

export function topicWords(summary) {
  if (!summary) return [];
  const raw = firstBoldOrFirstSentence(summary);
  if (!raw) return [];
  return pickTwoBack(raw);
}

function firstBoldOrFirstSentence(text) {
  const bold = text.match(/\*\*(.+?)\*\*/);
  if (bold) return bold[1];
  const ctx = text.split(/[.!?\n]+/).find((s) => s.trim().length > 0);
  return ctx ? ctx.trim() : '';
}

function pickTwoBack(text) {
  const words = text
    .split(/[^\uAC00-\uD7A3]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !DESCRIPTIVE_ENDINGS.has(w));
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];
  return words.slice(-2);
}
