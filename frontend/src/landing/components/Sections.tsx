import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, wireTimeline, type Step } from '../lib/choreography';
import { avatarVars, content, img } from '../content';
import './sections.css';

/**
 * 원본 `/` 의 블록을 하나씩 대응시킨 구성.
 *
 * **카피·이미지·배치는 전부 `content.ts` 가 소유한다.** 여기는 구조(마크업)와 안무(타임라인)만.
 * 다른 제품으로 바꾸려면 `content.ts` 만 고친다 — 이 파일은 손대지 않는다.
 *
 * 2026-09-12 live 역설계(Chrome DOM + Playwright 1440 계측):
 *   `evidence/m115/reference-shots/live-measure.json` · `live-00..09.png`
 *
 *   gl-navbar → gl-hero → gl-radar → gl-feedback → gl-package → gl-service → gl-cta → gl-start → gl-footer
 *
 * 안무는 원본 `bundle.js` 의 섹션별 `tlShow` 타임라인을 그대로 옮겼다 — 숫자(시각·길이·이징)는
 * 전부 실측이고, GSAP 대신 Web Animations API 로 돈다(`lib/choreography.ts` `wireTimeline`).
 * 근거: `evidence/m115/live-reverse-engineering.md` §10
 */

/** 줄바꿈 배열 → 줄 사이에 <br> */
const lines = (arr: readonly string[]) => arr.map((l, i) => <span key={i}>{i > 0 && <br />}{l}</span>);

/* ────────────────────────────────────────────────────────────
   Trust — 원본 `gl-radar`
   동심원 두 겹 위에 아바타 7개가 **위쪽 절반에만** 앉는다(원본 CSS top ≤ 42%).
   아래 절반은 다음 블록(인용 카드)이 덮는다 — 원이 카드 뒤로 이어지는 것이 의도다.

   원본 타임라인 (`tlShow`, trigger top 60%):
     원        scale .1 → 1   back.out  1.5s @0
     아바타    scale  0 → 1   back.out  1.0s @.4
     제목      y 50% → 0      power3.out 1s @.5
     말풍선 ②  scale 0 → 1   back.out  .5s @.8  → 점 3개 사라짐 @1.5 → 글자 stagger .05 @1.7
     말풍선 ①  scale 0 → 1   back.out  .5s @1.2 → 점 사라짐 @1.9 → 글자 @2.1
   ──────────────────────────────────────────────────────────── */

const T = content.trust;

export function Trust() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const q = (s: string) => root.querySelectorAll(s);

    const typing = (bubble: Element | null, at: number): Step[] => {
      if (!bubble) return [];
      const text = bubble.querySelector<HTMLElement>('.trust__bubble-text');
      const chars = bubble.querySelectorAll('.trust__bubble-text span');
      // 말풍선이 글자 폭만큼 늘어난다 — 원본 `width: auto` 를 실측 폭으로 옮긴다
      const w = text ? `${text.scrollWidth}px` : 'auto';
      return [
        { targets: bubble, from: { transform: 'scale(0)' }, to: { transform: 'scale(1)' }, at, duration: 0.5, ease: 'back.out' },
        { targets: bubble.querySelector('.trust__bubble-dots'), from: { opacity: 1 }, to: { opacity: 0 }, at: at + 0.7, duration: 0.2 },
        { targets: text, from: { width: '0px' }, to: { width: w }, at: at + 0.9, duration: 0.5 },
        { targets: chars, from: { opacity: 0 }, to: { opacity: 1 }, at: at + 0.9, duration: 0.5, stagger: 0.05 },
      ];
    };

    return wireTimeline(root, [
      { targets: q('.trust__ring'), from: { transform: 'scale(0.1)' }, to: { transform: 'scale(1)' }, at: 0, duration: 1.5, ease: 'back.out' },
      { targets: q('.trust__node'), from: { transform: 'scale(0)' }, to: { transform: 'scale(1)' }, at: 0.4, duration: 1, ease: 'back.out' },
      { targets: root.querySelector('.trust__title'), from: { opacity: 0, transform: 'translateY(50%)' }, to: { opacity: 1, transform: 'translateY(0)' }, at: 0.5, duration: 1, ease: 'power3.out' },
      ...typing(root.querySelector('.trust__bubble.-b'), 0.8),
      ...typing(root.querySelector('.trust__bubble.-a'), 1.2),
    ], { threshold: 0.6 });
  }, []);

  return (
    <div className="trust" ref={ref} style={img(T.avatars.src, '--avatars')}>
      <div className="trust__orbit" aria-hidden="true">
        <span className="trust__ring trust__ring--outer" />
        <span className="trust__ring trust__ring--inner" />
        {T.nodes.map((n) => (
          <span
            key={n.idx}
            className="trust__node"
            style={{
              ...avatarVars(n.idx),
              // 극좌표 → 궤도 상자 안의 백분율. 12시에서 시계방향이다.
              // 중심 맞춤은 CSS 의 `translate` 가 한다 — `transform` 은 진입 연출(scale)이 쥔다.
              left: `${50 + n.r * Math.sin((n.angle * Math.PI) / 180)}%`,
              top: `${50 - n.r * Math.cos((n.angle * Math.PI) / 180)}%`,
              '--size': `${n.size}px`,
            } as React.CSSProperties}
          >
            {'bubble' in n && n.bubble && (
              <span className={`trust__bubble -${n.bubble}`}>
                <span className="trust__bubble-dots"><i /><i /><i /></span>
                <span className="trust__bubble-text">
                  {T.bubbles[n.bubble].split('').map((c, i) => <span key={i}>{c}</span>)}
                </span>
              </span>
            )}
          </span>
        ))}
      </div>

      <h2 className="trust__title">
        {T.title.before}<b>{T.title.number}</b>{T.title.after}<br />{T.title.line2}
      </h2>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Quote — 원본 `gl-feedback`
   후기 여러 장이 **7초 자동 넘김** 캐러셀로 돈다(원본 owl-carousel autoplayTimeout 7000,
   smartSpeed 500). 점 내비를 누르면 그 장으로 간다. 아바타가 카드 윗변을 물고 걸터앉는다.
   ──────────────────────────────────────────────────────────── */

const QUOTES = content.quotes;

export function Quote() {
  const [active, setActive] = useState(0);
  const still = prefersReducedMotion();

  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % QUOTES.length), 7000);
    return () => window.clearInterval(id);
  }, [still, active]);

  return (
    <div className="quote-wrap" data-reveal style={{ ...img(T.avatars.src, '--avatars'), '--reveal-y': '30px', '--reveal-delay': '0.2s' } as React.CSSProperties}>
      <div className="quote__viewport">
        <div className="quote__track" style={{ '--i': active } as React.CSSProperties}>
          {QUOTES.map((qt, i) => (
            <figure className="quote" key={qt.name} aria-hidden={i !== active}>
              <span className="quote__avatar" aria-hidden="true" style={avatarVars(qt.idx)} />
              <span className="quote__mark" aria-hidden="true">&ldquo;</span>
              <blockquote className="quote__text">{qt.text}</blockquote>
              <figcaption className="quote__who">
                <span className="quote__name">{qt.name}</span>
                <span className="quote__role">{qt.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="quote__nav" role="tablist" aria-label="Testimonials">
        {QUOTES.map((qt, i) => (
          <button
            key={qt.name}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Testimonial ${i + 1}`}
            className="quote__dot"
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Compare — 원본 `gl-package`
   브랜드 색면 위에 흰 카드가 얹히고, **카드가 색면의 아랫변을 넘어 흰 바탕까지 내려간다**.

   원본 타임라인 (trigger top 60%):
     카드·제목  y 50% → 0  expo.out 1s @0 · 부제 @.1
     왼쪽 타일  각자 다른 방향에서 날아듦  expo.out 1.5s @.6  (아래 CHAOS_FROM, xPercent/yPercent)
     오른쪽 휠  rotate −90 → 0  linear .7s @.6  /  스포크 rotate +90 → 0 (역회전해 바로 선다)
   ──────────────────────────────────────────────────────────── */

/** 원본 실측 — 타일 i 가 날아오는 출발점. 타일이 더 많으면 순환한다 */
const CHAOS_FROM = [[-70, 0], [-80, 100], [80, 65], [100, 100], [-70, -80], [-90, -100], [-80, -100]];
const C = content.compare;

export function Compare() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const q = (s: string) => root.querySelectorAll(s);
    const rise: Pick<Step, 'from' | 'to' | 'duration' | 'ease'> = {
      from: { opacity: 0, transform: 'translateY(50%)' }, to: { opacity: 1, transform: 'translateY(0)' }, duration: 1, ease: 'expo.out',
    };
    const tiles = Array.from(q('.band__tile'));
    return wireTimeline(root, [
      { targets: root.querySelector('.band__title'), ...rise, at: 0 },
      { targets: root.querySelector('.band__lede'), ...rise, at: 0.1 },
      { targets: root.querySelector('.band__card'), ...rise, at: 0 },
      ...tiles.map((t, i): Step => {
        const [x, y] = CHAOS_FROM[i % CHAOS_FROM.length];
        return { targets: t, from: { transform: `translate(${x}%, ${y}%)` }, to: { transform: 'translate(0, 0)' }, at: 0.6, duration: 1.5, ease: 'expo.out' };
      }),
      { targets: root.querySelector('.band__wheel-rotor'), from: { transform: 'rotate(-90deg)' }, to: { transform: 'rotate(0deg)' }, at: 0.6, duration: 0.7, ease: 'linear' },
      { targets: q('.band__spoke'), from: { transform: 'rotate(90deg)' }, to: { transform: 'rotate(0deg)' }, at: 0.6, duration: 0.7, ease: 'linear' },
    ], { threshold: 0.6 });
  }, []);

  const place = (t: { left: number; top: number }) => ({ left: `${t.left}%`, top: `${t.top}%` });

  return (
    <section className="band" id="compare" ref={ref}>
      <div className="container">
        <h2 className="band__title">{lines(C.title)}</h2>
        <p className="band__lede">{C.lede}</p>

        <div className="band__card">
          <div className="band__grid">
            <div className="band__col">
              <p className="band__col-title"><span className="band__mood -low" aria-hidden="true" />{C.left.heading}</p>
              <div className="band__scatter">
                <svg className="band__threads" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <path d="M60 210 C120 60 250 40 330 120 S250 260 140 230 S30 120 120 90" />
                  <path d="M90 120 C170 200 300 190 340 90" />
                  <path d="M70 160 C160 250 230 80 330 200" />
                </svg>
                {C.left.tiles.map((t) => (
                  <span key={t.label} className="band__tile" style={{ ...img(t.icon), ...place(t) }}>
                    <span className="band__tile-label">{t.label}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="band__col">
              <p className="band__col-title"><span className="band__mood -high" aria-hidden="true" />{C.right.heading}</p>
              <div className="band__wheel">
                <svg className="band__threads" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <circle cx="200" cy="150" r="118" />
                </svg>
                <span className="band__hub">{C.right.hub}</span>
                {/* 회전은 스포크를 담은 로터에 걸고, 스포크는 역회전한다 — 원본 `-v2` 와 같은 2단 구조 */}
                <div className="band__wheel-rotor">
                  {C.right.spokes.map((t) => (
                    <span key={t.label} className="band__spoke" style={{ ...img(t.icon), ...place(t) }}>
                      <span className="band__tile-label">{t.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="band__action">
            <a className="btn btn--primary" href={C.cta.href}>
              {C.cta.label} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   Team — 원본 `gl-service`
   제목은 왼쪽 정렬이고 2×2 는 셀 사이에 실선 십자를 긋는다.
   원본 타임라인: 제목 y50%→0 @0 · 아이템 y20%→0 expo.out 1.2s stagger .07 @.3
   원본은 hover 시 아이콘을 `.animation.png` 로 바꿔 움직인다 — 여기서는 CSS 로 흔든다.
   ──────────────────────────────────────────────────────────── */

export function Team() {
  const M = content.team;
  return (
    <div className="team">
      <h2 className="team__title" data-reveal style={{ '--reveal-y': '50%' } as React.CSSProperties}>
        {lines(M.title)}
      </h2>
      <div className="team__grid">
        {M.items.map((t, i) => (
          <div
            key={t.lead}
            className="team__cell"
            data-reveal
            style={{ '--reveal-y': '20%', '--reveal-delay': `${0.3 + i * 0.07}s` } as React.CSSProperties}
          >
            <span className="team__icon" aria-hidden="true" style={img(t.icon)} />
            <p className="team__text">
              <b>{t.lead}</b><br />{t.rest}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   CtaCard — 원본 `gl-cta`
   색면 카드 안에 **카드보다 큰 원 세 장**이 겹쳐 잘리고, 인물이 오른쪽에 선다.
   원본 타임라인: 카드 y30→0 expo.out 1s @0
   ──────────────────────────────────────────────────────────── */

export function CtaCard() {
  const K = content.cta;
  return (
    <div className="cta" data-reveal style={{ '--reveal-y': '30px' } as React.CSSProperties}>
      <div className="cta__bg" aria-hidden="true">
        <span className="cta__circle -c1" />
        <span className="cta__circle -c2" />
        <span className="cta__circle -c3" />
      </div>
      <span className="cta__figure" aria-hidden="true" style={{ ...img(K.figure.src), '--ratio': K.figure.ratio } as React.CSSProperties} />
      <span className="cta__paper -p1" aria-hidden="true" />
      <span className="cta__paper -p2" aria-hidden="true" />
      <span className="cta__paper -p3" aria-hidden="true" />

      <div className="cta__body">
        <h2 className="cta__title">{lines(K.title)}</h2>
        <p className="cta__text">{lines(K.text)}</p>
        <a className="btn btn--white" href={K.button.href}>
          {K.button.label} <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   StartHelp — 원본 `gl-start`
   왼쪽 제목 / 오른쪽 정사각에 가까운 카드 2장. 화살표는 라벨 아래 줄에 따로 선다.
   원본 타임라인: 제목 y50%→0 @0 · 링크 y30→0 stagger .05 @0
   ──────────────────────────────────────────────────────────── */

export function StartHelp() {
  const S = content.start;
  return (
    <div className="start">
      <h2 className="start__title" data-reveal style={{ '--reveal-y': '50%' } as React.CSSProperties}>
        {lines(S.title)}
      </h2>
      <div className="start__links">
        {S.links.map((l, i) => (
          <a
            key={l.href + i}
            className={`start__link -${l.tone}`}
            href={l.href}
            data-reveal
            style={{ '--reveal-y': '30px', '--reveal-delay': `${i * 0.05}s` } as React.CSSProperties}
          >
            <span className="start__label">{lines(l.label)}</span>
            <span className="start__arrow" aria-hidden="true">→</span>
          </a>
        ))}
      </div>
    </div>
  );
}
