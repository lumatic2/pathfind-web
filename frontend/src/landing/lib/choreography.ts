/**
 * 스크롤 안무 — 배선과 안무의 분리
 *
 * M115 `www.glide.com` 역설계에서 가져온 구조다. 원본은 GSAP + ScrollTrigger 로 같은 일을 하는데,
 * 흡수한 것은 라이브러리가 아니라 **배선(언제 도는가)과 안무(무엇이 움직이는가)를 가르는 형태**다.
 * 근거: `evidence/m115/observation/scroll-choreography.md`
 *
 * 원본과 의도적으로 다른 점 두 가지:
 *
 * 1. 원본은 모션 차단을 UA 스니핑(`browser.mobile || /android/i`) 한 줄로 한다.
 *    `prefers-reduced-motion` 이 `bundle.js`·`site.css` 통틀어 **0건**이다.
 *    우리는 감소 모션 설정으로 건다 — 기기가 아니라 사용자 의사가 기준이다.
 * 2. 원본은 GSAP 타임라인이 필요하다. 진입 연출은 상태 하나만 토글하면 되므로
 *    IntersectionObserver 로 충분하고, 스크럽만 rAF 로 돈다.
 */

export type Ease = 'expo-out' | 'power1-out' | 'linear';

/** 감소 모션 질의 — 런타임 변경도 따라간다 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 진입 연출 배선 (원본 `magicShow`)
 *
 * 원본의 진입 문턱은 6단이었다 — `top 90% / 80% / 70% / 65% / 60% / center`.
 * ScrollTrigger 의 `start:"top 60%"` 는 "요소 윗변이 뷰포트 높이의 60% 지점에 닿을 때"라는 뜻이고,
 * IntersectionObserver 로는 `rootMargin` 의 아래쪽 음수 여백으로 같은 지점을 만든다.
 * `top 60%` → 뷰포트 아래 40% 를 잘라낸다 → `rootMargin: '0px 0px -40% 0px'`.
 *
 * 감소 모션이면 옵저버를 만들지 않고 **즉시 최종 상태**로 둔다.
 * 콘텐츠가 사라지면 안 되므로 `opacity: 0` 에 묶어 두지 않는다.
 */
export function wireReveal(
  root: HTMLElement,
  opts: { threshold?: number } = {},
): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (!items.length) return () => {};

  if (prefersReducedMotion()) {
    items.forEach((el) => el.setAttribute('data-revealed', 'true'));
    return () => {};
  }

  const pct = Math.round((1 - (opts.threshold ?? 0.6)) * 100);
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        (e.target as HTMLElement).setAttribute('data-revealed', 'true');
        obs.unobserve(e.target); // 한 번 보이면 유지 — 원본도 되감지 않는다
      });
    },
    { rootMargin: `0px 0px -${pct}% 0px` },
  );
  items.forEach((el) => obs.observe(el));
  return () => obs.disconnect();
}

/** 원본 히어로 높이 — 아래 이동 픽셀이 이 높이를 기준으로 잰 값이다 (M119 실측) */
export const REF_HERO_H = 1350;

export type ParallaxLayer = {
  /**
   * 이동 픽셀 — **원본 1350px 히어로 기준**이고, 우리 히어로 높이에 비례 환산된다.
   *
   * ⚠ M118 까지는 `yPercent`(요소 자기 높이 대비)였다. 같은 숫자가 판 높이에 따라 다른 픽셀이
   *   되므로 「판마다 높이가 다른 것이 깊이감의 재료」라는 설계였는데, 원본은 그렇게 만들어져
   *   있지 않다 — 판 셋이 **같은 캔버스**를 쓰고 이동량만 다르다(M119 실측 1·4).
   *   자기 높이 대비를 쓰면 자산을 갈 때마다 안무가 조용히 바뀐다.
   */
  fromPx: number;
  toPx: number;
  ease?: Ease;
};

const EASE: Record<Ease, (t: number) => number> = {
  // 원본 히어로 레이어가 쓰는 값
  'power1-out': (t) => 1 - Math.pow(1 - t, 2),
  'expo-out': (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  // 스크럽에 물린 연출에 이징을 걸지 않는다 — 스크롤 속도가 그대로 이동 속도가 된다
  linear: (t) => t,
};

/**
 * 레이어 패럴랙스 배선 (원본 `magicParallax`)
 *
 * 원본: `start:"top top", end:"bottom top", scrub:true` — 히어로가 화면을 완전히
 * 빠져나가는 동안이 진행도 0→1 에 대응한다. 그 구간 매핑을 그대로 옮겼다.
 *
 * 이징을 lerp 에 넣으면 원본 수식이 그대로 나온다:
 *   `from + (to − from) × (1 − (1−p)²)` = **`to + (from − to) × (1 − p)²`**
 * M119 가 원본에서 20표본을 재 확인했다(소수점 한 자리까지 일치).
 *
 * 이동 픽셀은 `data-shift-px` 로 노출한다 — 계측이 추측을 대신한다.
 */
export function wireParallax(
  section: HTMLElement,
  layers: ParallaxLayer[],
): () => void {
  const els = Array.from(section.querySelectorAll<HTMLElement>('[data-layer]'));
  if (!els.length) return () => {};

  // 감소 모션 — **끝값에 세운다**. 0 이 아니다.
  // 중경 판의 끝값은 +94.5 라 0 으로 두면 연출을 끈 게 아니라 다른 그림이 된다.
  if (prefersReducedMotion()) {
    const k = (section.getBoundingClientRect().height || REF_HERO_H) / REF_HERO_H;
    els.forEach((el, i) => {
      const px = (layers[i]?.toPx ?? 0) * k;
      el.style.transform = `translate3d(0, ${px.toFixed(1)}px, 0)`;
      el.setAttribute('data-shift-px', px.toFixed(1));
    });
    return () => {};
  }

  let frame = 0;
  let running = true;

  const apply = () => {
    frame = 0;
    const rect = section.getBoundingClientRect();
    // top top → bottom top : 섹션 윗변이 뷰포트 top 에 올 때 0, 아랫변이 top 에 닿을 때 1
    const total = rect.height || 1;
    const progress = Math.min(1, Math.max(0, -rect.top / total));

    // 원본 1350 기준 이동량을 우리 히어로 높이로 환산한다 (M119 결정 7 — 비율만 이식)
    const k = total / REF_HERO_H;

    els.forEach((el, i) => {
      const cfg = layers[i];
      if (!cfg) return;
      const t = EASE[cfg.ease ?? 'power1-out'](progress);
      const px = (cfg.fromPx + (cfg.toPx - cfg.fromPx) * t) * k;
      el.style.transform = `translate3d(0, ${px.toFixed(2)}px, 0)`;
      el.setAttribute('data-shift-px', px.toFixed(1));
    });
  };

  const onScroll = () => {
    if (!running || frame) return;
    frame = requestAnimationFrame(apply);
  };

  els.forEach((el) => { el.style.willChange = 'transform'; });
  apply();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  return () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    // 합성 레이어를 필요한 동안만 잡는다 — 원본도 타임라인 끝에서 auto 로 되돌린다
    els.forEach((el) => { el.style.willChange = 'auto'; });
  };
}

/* ─────────────────────────────────────────────────────────────
   타임라인 배선 (원본 `tlShow` 계열)

   원본은 섹션마다 GSAP 타임라인 하나를 만들고 ScrollTrigger `start:"top 60%"` 에 건다.
   여기서는 같은 형태를 Web Animations API 로 옮긴다 — 단계(step)마다 대상·from·to·
   시작 시각(at)·길이·이징·stagger 를 적고, 진입 문턱을 넘는 순간 한꺼번에 발화한다.

   배선 전에는 각 대상에 `from` 을 인라인으로 박아 둔다(안 그러면 관측 전에 완성 상태가 보인다).
   끝나면 `to` 를 인라인에 굽고 애니메이션 객체는 버린다 —
   그래야 뒤에 오는 다른 배선(예: 패럴랙스)이 같은 속성을 다시 쥘 수 있다.
   ───────────────────────────────────────────────────────────── */

/** GSAP 이징 이름 → cubic-bezier. 값은 gsap 3.10 소스의 근사치다. */
const BEZIER: Record<string, string> = {
  'expo.out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  'back.out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  'power3.out': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  'power1.out': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  linear: 'linear',
};

export type Step = {
  targets: Element | Element[] | NodeListOf<Element> | null;
  from: Keyframe;
  to: Keyframe;
  /** 타임라인 시작 기준 초 */
  at: number;
  /** 초 */
  duration: number;
  ease?: keyof typeof BEZIER;
  /** 대상이 여럿일 때 초 단위 간격 */
  stagger?: number;
  /** `from` 을 관측 전에 인라인으로 박지 않는다 — 다른 배선이 그 속성을 쥐고 있을 때 */
  noPreset?: boolean;
};

function list(t: Step['targets']): HTMLElement[] {
  if (!t) return [];
  if (t instanceof Element) return [t as HTMLElement];
  return Array.from(t as ArrayLike<Element>) as HTMLElement[];
}

function preset(el: HTMLElement, from: Keyframe) {
  for (const [k, v] of Object.entries(from)) {
    if (k === 'offset' || k === 'easing' || k === 'composite') continue;
    (el.style as unknown as Record<string, string>)[k] = String(v);
  }
}

function play(steps: Step[]) {
  steps.forEach((s) => {
    list(s.targets).forEach((el, i) => {
      const anim = el.animate([s.from, s.to], {
        delay: (s.at + (s.stagger ?? 0) * i) * 1000,
        duration: s.duration * 1000,
        easing: BEZIER[s.ease ?? 'expo.out'],
        fill: 'both',
      });
      anim.finished.then(() => {
        // `commitStyles()` 를 쓰지 않는다 — 같은 요소에 두 애니메이션이 겹치면 먼저 끝난 쪽의
        // 커밋이 조용히 빠진다(2026-09-12 실측: 말풍선 점이 안 사라졌다). `to` 를 직접 굽는다.
        preset(el, s.to);
        anim.cancel();
      }).catch(() => {});
    });
  });
}

/**
 * @param trigger  진입 문턱을 재는 요소(원본의 `trigger`)
 * @param threshold 원본 `start:"top N%"` 의 N/100 — 0.6 이면 뷰포트 60% 지점
 * @param immediate 스크롤 문턱 없이 즉시(히어로 — 원본은 페이지 진입 타임라인에 얹는다)
 */
export function wireTimeline(
  trigger: HTMLElement,
  steps: Step[],
  opts: { threshold?: number; immediate?: boolean } = {},
): () => void {
  if (prefersReducedMotion()) {
    // 최종 상태로 즉시 — 콘텐츠를 숨긴 채 두지 않는다
    steps.forEach((s) => list(s.targets).forEach((el) => preset(el, s.to)));
    return () => {};
  }

  steps.forEach((s) => { if (!s.noPreset) list(s.targets).forEach((el) => preset(el, s.from)); });

  if (opts.immediate) {
    play(steps);
    return () => {};
  }

  const pct = Math.round((1 - (opts.threshold ?? 0.6)) * 100);
  const obs = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      play(steps);
    },
    { rootMargin: `0px 0px -${pct}% 0px` },
  );
  obs.observe(trigger);
  return () => obs.disconnect();
}

/**
 * 점등 일정 — 원본 양방향 실측(M120 `research/2026-09-13-m120-glide-hero-anatomy.md` §4):
 * 창 i 는 `0.13 + 0.10i` 에서 시작해 **정확히 0.10 동안 선형**으로 켜진다.
 * (M119 의 0.11 간격 · 0.13 길이는 휠 75px 격자에서 읽은 근사였다.)
 */
export const LIGHT_START = 0.13;
export const LIGHT_STAGGER = 0.10;
export const LIGHT_DURATION = 0.10;

/** 창 i 의 opacity — **p 의 순수 함수**. 이력·방향에 의존하지 않는다. */
export function lightOpacity(progress: number, i: number): number {
  const t = (progress - (LIGHT_START + LIGHT_STAGGER * i)) / LIGHT_DURATION;
  return Math.min(1, Math.max(0, t));
}

/**
 * 집 창문 순차 점등 (원본 `.gl-hero-bg-addon` 5장의 크로스페이드)
 *
 * 원본은 중경 판과 **같은 상자 안**에 전체 캔버스 오버레이를 넣고 opacity 만 올린다 —
 * 그래서 좌표 보정이 0 이고 판이 움직이면 불빛도 같이 움직인다(M119 실측 7).
 * 우리도 오버레이를 `.hero__layer--mid` 안에 넣으므로 이 함수는 **opacity 만** 만진다.
 *
 * **순수 스크럽이다 — 올리면 다시 꺼진다.** 원본을 내림·올림 양방향으로 재면 같은 p 에서 같은
 * opacity 가 나온다(1440·390 전 표본 Δ0.000). M119 는 프로브가 휠을 내리기만 해서 「한 번 켜지면
 * 안 꺼진다」로 잘못 읽고 표본별 최댓값을 들고 갔다 — 그게 사용자 기각 사유 ①이었다.
 */
export function wireLights(section: HTMLElement): () => void {
  const els = Array.from(section.querySelectorAll<HTMLElement>('[data-light]'));
  if (!els.length) return () => {};

  // 감소 모션 — 연출 없이 켜진 상태로 둔다. 끄면 「불이 켜진다」는 사실 자체가 사라진다.
  if (prefersReducedMotion()) {
    els.forEach((el) => { el.style.opacity = '1'; });
    return () => {};
  }

  let frame = 0;
  let running = true;

  const apply = () => {
    frame = 0;
    const rect = section.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, -rect.top / (rect.height || 1)));
    els.forEach((el, i) => {
      el.style.opacity = lightOpacity(progress, i).toFixed(3);
    });
  };

  const onScroll = () => {
    if (!running || frame) return;
    frame = requestAnimationFrame(apply);
  };

  apply();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  return () => {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}
