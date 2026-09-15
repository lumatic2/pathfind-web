import { useEffect, useId, useState } from 'react';
import { Logo } from './Logo';
import { content } from '../content';
import { Linkedin } from 'lucide-react';
/* 업스테이지 공식 워드마크 — 출처 `upstage.ai` 브랜드 리소스 센터의 `Logo_Black`(2026-09-15 취득),
   여백만 잘라 냈다. 색면 위에서는 흰색 단색으로 뒤집어 쓴다(그쪽도 흰 심벌을 함께 배포한다). */
import upstageWordmark from '../../assets/upstage-wordmark.png';
import './footer.css';

/**
 * 푸터 — 같은 마크업 한 벌로 두 모드.
 * 정본: recipes/navigation/two-mode-footer-nav.md
 *
 * 데스크톱은 4열이 항상 펼쳐져 있고, 모바일은 같은 묶음이 접혀 버튼으로 여닫힌다.
 * 두 벌을 만들어 하나를 숨기면 링크가 DOM 에 두 번 들어가 스크린리더가 전부 두 번 읽는다.
 *
 * 원본은 버튼에 aria-label 만 있고 aria-expanded 가 없다(13페이지 전건 0건). 그건 뒤집었다.
 */

/** `href` 는 선택이다 — 밖으로 나가는 링크 묶음의 제목은 갈 곳이 없다(2026-09-15) */
type Col = { title: string; href?: string; links: { label: string; href: string }[] };

/** 열·문구는 `content.footer` 가 소유한다 */
const COLUMNS: Col[] = content.footer.columns;

function FooterCol({ col }: { col: Col }) {
  const [open, setOpen] = useState(false);
  const [collapsible, setCollapsible] = useState(false);
  const listId = useId();

  // 시각은 CSS 가, 시맨틱은 JS 가 맞춘다. 어긋나면 데스크톱에서
  // 존재하지 않는 "펼치기" 버튼이 탭 순서에 남는다.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => { setCollapsible(mq.matches); if (!mq.matches) setOpen(false); };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <div className={['tmfn__col', open && '-open'].filter(Boolean).join(' ')}>
      <div className="tmfn__head">
        {col.href
          ? <a className="tmfn__title" href={col.href}>{col.title}</a>
          : <span className="tmfn__title">{col.title}</span>}
        <button
          type="button"
          className="tmfn__toggle"
          aria-expanded={open}
          aria-controls={listId}
          {...(collapsible ? {} : { tabIndex: -1, 'aria-hidden': true })}
          onClick={() => setOpen(v => !v)}
        >
          <span className="sr-only">
            {col.title} submenu, {open ? 'collapse' : 'expand'}
          </span>
        </button>
      </div>
      <ul id={listId} className="tmfn__links">
        {col.links.map(l => (
          <li key={l.label}>
            <a
              className="tmfn__link"
              href={l.href}
              tabIndex={collapsible && !open ? -1 : undefined}
            >{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="ft">
      <div className="container">
        <div className="ft__main">
          {/* 문장이 아니라 **크레딧**이다 — 마크를 달고 만든 쪽으로 나간다 */}
          <a
            className="ft__powered"
            href={content.footer.powered.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content.footer.powered.label}
            <img src={upstageWordmark} alt={content.footer.powered.alt} />
          </a>
          <nav className="tmfn" aria-label="Footer">
            {COLUMNS.map(c => <FooterCol key={c.title} col={c} />)}
          </nav>
        </div>
        {/* 아래 줄은 로고 / 저작권 / 약관 세 칸이다 — 원본도 그렇다.
            두 칸으로 줄이면 가운데가 비어 줄이 양끝으로 찢어진다. */}
        <div className="ft__bottom">
          <span className="ft__logo"><Logo /></span>
          <span className="ft__copy">
            {content.footer.copyright}
            <a
              href="https://www.linkedin.com/in/askewly/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="ft__linkedin"
            >
              <Linkedin size={20} />
            </a>
          </span>
          {/* 출처 고지는 문장이지 링크가 아니다 — 갈 곳이 없는데 링크로 두면 헛클릭이 난다 */}
          <span className="ft__terms">
            {content.footer.terms.map((t) => <span key={t.label}>{t.label}</span>)}
          </span>
        </div>
      </div>
    </footer>
  );
}
