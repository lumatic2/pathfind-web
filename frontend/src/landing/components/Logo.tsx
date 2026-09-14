/** 로고 — Pathfinder 마크 + 워드마크 이미지.
 *
 * 마크는 public/pathfinder-mark.png, 워드마크는 public/pathfinder-wordmark.png 를 그대로 세운다.
 * 색은 currentColor 를 따른다 — 내비에서는 브랜드색, 푸터 색면 위에서는 흰색으로 뒤집힌다.
 */

import { content } from '../content';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`logo ${className}`.trim()}>
      <img
        className="logo__mark"
        src="/pathfinder-mark.png"
        alt=""
        aria-hidden={true}
        style={{ width: 'auto' }}
      />
      <img
        className="logo__word"
        src="/pathfinder-wordmark.png"
        alt={content.brand.wordmark}
        style={{ height: '0.72em', width: 'auto' }}
      />
    </span>
  );
}
