/**
 * 로고 — Pathfinder 락업(마크 + 워드마크). 원본 Glide 예제는 집 모양 SVG 마크 + 텍스트 워드마크였다.
 *
 * pathfind 국소 수정(2026-09-14): 브랜드 자산은 M7 영상 워크트리가 쓰는 것과 **같은 PNG** 를 쓴다 —
 * `public/pathfinder-mark.png`(경로 노드 + 화살표, 투명 배경) · `public/pathfinder-wordmark.png`(Pathfinder 글자).
 * 원본 락업 `pathfinder-logo-src.png` 을 M7 의 `scripts/split-logo.py` 가 갈라 낸 것이라 형태는 손대지 않았다.
 * SVG 원본이 없어 이미지로 세운다. 크기는 navbar.css 의 `--logo-mark`(마크 높이)·`--logo-fs`(워드마크 높이 기준)를 그대로 따른다.
 * 푸터(보라 색면)에서는 footer.css 가 `filter` 로 흰색으로 뒤집는다.
 */
import { content } from '../content';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`logo ${className}`.trim()}>
      <img className="logo__mark" src="/pathfinder-mark.png" alt="" aria-hidden="true" style={{ width: 'auto' }} />
      <img className="logo__word" src="/pathfinder-wordmark.png" alt={content.brand.wordmark} style={{ height: '0.72em', width: 'auto' }} />
    </span>
  );
}
