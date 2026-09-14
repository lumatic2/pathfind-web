import { useEffect, useRef } from 'react';
import { wireLights, wireParallax, wireReveal, wireTimeline, type ParallaxLayer } from '../lib/choreography';
import { content, img } from '../content';
import './parallax-hero.css';

/**
 * 히어로 차등 패럴랙스 — 수확 축 E 의 본체.
 * 카피·이미지·구름 배치는 `content.ts` `hero` 가 소유한다. 여기는 구조와 안무만.
 *
 * 레이어 값은 원본 라이브 실측이다(M119 — 20표본 전건 소수점 한 자리까지 일치).
 * 근거: `evidence/m119/reference-anatomy.md` §2
 *
 *   p = clamp(scrollY / 히어로높이, 0, 1)
 *   translateY = 끝 + (시작 − 끝) × (1 − p)²
 *
 *     판          시작     끝      이동   방향
 *     원경 far   −243  →    0     243   내려온다
 *     중경 mid    −67.5 → +94.5   162   **내려간다**
 *     근경 near  +135  →    0     135   올라간다
 *
 * 두 가지가 요점이다.
 *
 * 1. **무한 패럴랙스가 아니다.** p=1(히어로 높이)에서 전부 멈춰 고정된다. 스크롤이 끄는
 *    **입장 연출**이지 계속 흐르는 시차가 아니다.
 * 2. **판마다 방향이 다르다.** 깊이감은 「같은 방향 다른 속도」가 아니라 **흩어져 있던 판이
 *    제자리로 모이는 것**에서 나온다. 중경만 유일하게 아래로 내려가 끝난다.
 *
 * 값은 원본 1350px 히어로 기준이고 `wireParallax` 가 우리 높이에 비례 환산한다 —
 * 원본 높이를 그대로 박으면 우리 카피 길이·뷰포트와 어긋나 빈 띠가 생긴다(M119 결정 7).
 *
 * 진입 연출은 원본 `tlShow` (페이지 진입 타임라인 +0.3s 에 얹힘):
 *   구름 ①  opacity 0 · xPercent +100 · scale 1.2 → 제자리   expo.out 3.0s
 *   구름 ②③④  xPercent −100 …                                 expo.out 4.5 / 2.5 / 3.5s
 *   풍경 판  opacity 0→1 .5s @.3 · 그림 yPercent 20 → 0 expo.out 2s stagger .2 @.3
 *   제목 @.4 · 부제 @.5 · 액션 @.6  (y 20/50/50 → 0, expo.out 1s)
 *
 * 집 창문은 스크롤을 내리면 하나씩 켜지고 **올리면 다시 꺼진다**(`wireLights` — 순수 스크럽).
 * 원본은 창 5개가 p 0.13~0.63 안에서 0.10 간격·0.10 길이로 순차 점등한다(M120 양방향 실측 —
 * `research/2026-09-13-m120-glide-hero-anatomy.md` §4). 오버레이는 중경 판에서 **파생**시킨 것이라
 * 좌표를 맞출 일이 없다(`scripts/derive_window_lights.py`).
 *
 * **구름은 스크롤에 전혀 반응하지 않는다** — 원본 실측에서 transform 이 전 구간 0 이고
 * `animationName` 도 `none` 이다(M119 실측 6). 진입 슬라이드만 있고 그 뒤로는 가만히 있다.
 * 그리고 판보다 **앞**에 선다(z:1) — 판 뒤로 들어갈 수가 없다.
 */
const LAYERS: ParallaxLayer[] = [
  { fromPx: -243, toPx: 0, ease: 'power1-out' },
  { fromPx: -67.5, toPx: 94.5, ease: 'power1-out' },
  { fromPx: 135, toPx: 0, ease: 'power1-out' },
];

/** 구름 4장의 진입 — [xPercent 시작, 길이 s] (원본 실측, 구름 순서대로) */
const CLOUD_ENTER: Array<[number, number]> = [[100, 3], [-100, 4.5], [-100, 2.5], [-100, 3.5]];

const H = content.hero;

export function ParallaxHero() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const offParallax = wireParallax(el, LAYERS);
    const offLights = wireLights(el);
    const offReveal = wireReveal(el, { threshold: 0.9 });
    const clouds = Array.from(el.querySelectorAll('.hero__cloud'));
    const offEnter = wireTimeline(el, [
      ...clouds.map((c, i) => ({
        targets: c,
        from: { opacity: 0, transform: `translateX(${CLOUD_ENTER[i % CLOUD_ENTER.length][0]}%) scale(1.2)` },
        to: { opacity: 1, transform: 'translateX(0) scale(1)' },
        at: 0, duration: CLOUD_ENTER[i % CLOUD_ENTER.length][1], ease: 'expo.out' as const,
      })),
      { targets: el.querySelector('.hero__stage'), from: { opacity: 0 }, to: { opacity: 1 }, at: 0.3, duration: 0.5, ease: 'expo.out' },
      // 판의 `transform` 은 패럴랙스가 쥔다 — 진입은 `translate` 로 얹어 두 배선이 서로를 안 덮는다
      { targets: el.querySelectorAll('.hero__layer'), from: { translate: '0 20%' }, to: { translate: '0 0' }, at: 0.3, duration: 2, ease: 'expo.out', stagger: 0.2 },
    ], { immediate: true });
    return () => { offParallax(); offLights(); offReveal(); offEnter(); };
  }, []);

  return (
    <section className="hero" ref={ref} data-pilot="parallax-hero">
      <div className="hero__sky" aria-hidden="true">
        {H.clouds.map((c, i) => (
          <div
            key={i}
            className="hero__cloud"
            style={{
              ...img(c.src),
              '--cloud-w': `${c.width}px`,
              '--cloud-ratio': c.ratio,
              top: `${c.top}%`,
              left: 'left' in c ? `${c.left}%` : undefined,
              right: 'right' in c ? `${c.right}%` : undefined,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="hero__stage" aria-hidden="true">
        {/* 원경 → 중경 → 근경. **셋 다 같은 상자**(무대 캔버스)를 채운다 — 판별 높이가 없다.
            그림은 content.hero.layers 가 소유하고, 비율은 캔버스가 `--stage-ratio` 로 쥔다. */}
        {(['far', 'mid', 'near'] as const).map((k, i) => (
          <div
            key={k}
            className={`hero__layer hero__layer--${k}`}
            data-layer={i}
            style={img(H.layers[k].src)}
          >
            {/* 창문 점등은 **중경 판 안에** 산다 — 원본 `.gl-hero-bg-merge` 와 같은 자리다.
                같은 상자를 쓰므로 정합이 저절로 맞고, 판이 움직이면 불빛이 같이 간다. */}
            {k === 'mid' && H.lights.map((src, j) => (
              <div key={src} className="hero__light" data-light={j} style={img(src)} />
            ))}
          </div>
        ))}
      </div>

      <div className="container hero__content">
        <h1 className="hero__title" data-reveal style={{ '--reveal-y': '20px' } as React.CSSProperties}>
          {H.title.map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}
        </h1>
        <p className="hero__lede" data-reveal style={{ '--reveal-y': '50px', '--reveal-delay': '0.15s' } as React.CSSProperties}>
          {H.lede}
        </p>
        {/* 버튼은 문구 확대(×1.2)의 대상이 아니다 — 크기 그대로 (2026-09-13 사용자: 「버튼 빼고」는 편집 대상 제외라는 뜻) */}
        <div className="hero__actions" data-reveal style={{ '--reveal-y': '50px', '--reveal-delay': '0.3s' } as React.CSSProperties}>
          <a className="btn btn--primary" href={H.cta.href}>{H.cta.label}</a>
        </div>
      </div>
    </section>
  );
}
