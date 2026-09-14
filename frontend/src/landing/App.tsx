import { useEffect, useRef } from 'react';
import { ParallaxHero } from './components/ParallaxHero';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Trust, Quote, Compare, Team, CtaCard, StartHelp } from './components/Sections';
import { wireReveal } from './lib/choreography';

/**
 * M115 랜딩 — Glide 채집 자산으로 세운 B2B 제품 랜딩 한 채.
 *
 * 섹션 순서는 2026-09-12 live 역설계로 다시 맞췄다. 원본 `.gl-bound` 의 자식 순서 그대로다:
 *
 *   gl-navbar → gl-hero → gl-radar → gl-feedback → gl-package → gl-service → gl-cta → gl-start → gl-footer
 *   navbar    → hero    → Trust    → Quote       → Compare    → Team       → CtaCard → StartHelp → footer
 *
 * 근거: `evidence/m115/reference-shots/live-measure.json` (섹션 높이·컨테이너·타이포 실측)
 *       `evidence/m115/reference-shots/live-00..09.png` (1440 스크롤 연속 캡처)
 *
 * **요금 블록은 여기 없다.** 원본 랜딩에도 없고 `/plans/` 페이지의 것이다 —
 * feature row·비교표를 내린 것과 같은 이유다(결정 D11). 자산은 `recipes/` 에 남아 있다.
 *
 * 연속 섹션의 위 패딩은 `-ct` 로 상쇄한다 — 정본 `recipes/marketing/section-padding-collapse.md`.
 * 배경이 바뀌는 경계(색면 앞뒤)에서는 상쇄하지 않는다. 경계에는 여백이 필요하다.
 */
export function App() {
  const rest = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rest.current) return;
    return wireReveal(rest.current, { threshold: 0.6 });
  }, []);

  return (
    <>
      <Navbar />
      <ParallaxHero />
      <div ref={rest}>
        <section className="section" id="trust">
          <div className="container"><Trust /></div>
        </section>

        <section className="section -ct" id="quote">
          <div className="container"><Quote /></div>
        </section>

        {/* 배경이 바뀐다 — 앞뒤로 상쇄하지 않는다. 색면은 자기 패딩을 직접 쓴다. */}
        <Compare />

        <section className="section" id="team">
          <div className="container"><Team /></div>
        </section>

        <section className="section -ct" id="cta">
          <div className="container"><CtaCard /></div>
        </section>

        <section className="section" id="start">
          <div className="container"><StartHelp /></div>
        </section>
      </div>
      <Footer />
    </>
  );
}
