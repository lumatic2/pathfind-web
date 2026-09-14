import { useEffect, useId, useRef, useState } from 'react';
import { Logo } from './Logo';
import { content } from '../content';
import './navbar.css';

/**
 * 전역 내비 + 메가패널 — 랜딩 적용본.
 * 정본: recipes/navigation/mega-panel-hover-bridge.md
 *
 * 원본(Glide)은 `:hover` 전용이라 키보드로 열 수 없고 `aria-expanded` 가 13페이지 전건 0건이다.
 * 시각 구조(전이·브리지·꼭지·폭 계열)만 가져오고 상호작용 모델은 뒤집었다.
 */

type Item = { label: string; href: string; desc: string };

function MegaPanel({
  label,
  href,
  size = 'md',
  items,
}: {
  label: string;
  href: string;
  size?: 'md' | 'lg';
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      setPinned(false);
      // 포커스를 트리거로 돌려준다 — 빠지면 포커스가 문서 처음으로 튄다
      triggerRef.current?.focus();
    };
    const outside = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={['mphb', open && '-open'].filter(Boolean).join(' ')}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => { if (!pinned) setOpen(false); }}
      data-recipe="mega-panel-hover-bridge"
    >
      <button
        ref={triggerRef}
        type="button"
        className="mphb__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => { const n = !open; setOpen(n); setPinned(n); }}
      >
        {label}
      </button>

      <div
        id={panelId}
        className={['mphb__panel', size === 'lg' && '-lg'].filter(Boolean).join(' ')}
        hidden={!open}
      >
        <div className="mphb__inner">
          <a className="mphb__overview" href={href}>{label} overview</a>
          <div className="mphb__grid">
            {items.map((it) => (
              <a key={it.label} className="mphb__item" href={it.href}>
                <span className="mphb__item-title">{it.label}</span>
                <span className="mphb__item-desc">{it.desc}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 항목·링크는 `content.nav` 가 소유한다 — 여기는 구조만 */
export function Navbar() {
  const N = content.nav;
  return (
    <header className="nav">
      <div className="container nav__inner">
        <a className="nav__logo" href="/" aria-label={`${content.brand.name} home`}><Logo /></a>
        <nav className="nav__menu" aria-label="Main">
          {N.menus.map((m) => (
            <MegaPanel key={m.label} label={m.label} href={m.href} size={m.size} items={m.items} />
          ))}
          {N.links.map((l) => (
            <a key={l.label} className="nav__link" href={l.href}>{l.label}</a>
          ))}
        </nav>
        {/* 원본의 오른쪽은 **버튼이 아니다** — 텍스트 링크 둘이고 두 번째만 밑줄이 있다.
            여기 버튼을 두면 히어로의 CTA 와 같은 것이 화면에 둘 생긴다. */}
        <div className="nav__end">
          {N.end.map((l) => (
            <a key={l.label} className={`nav__link${l.marked ? ' -marked' : ''}`} href={l.href}>{l.label}</a>
          ))}
        </div>
      </div>
    </header>
  );
}
