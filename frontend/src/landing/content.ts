/** 랜딩의 **교체 가능한 것 전부**가 여기 산다 — 카피·이미지 경로·이미지 배치.
 *
 * 이 파일만 고치면 다른 제품의 랜딩이 된다. 컴포넌트(`components/*.tsx`)는 구조와 안무만 알고
 * 여기서 값을 받는다. CSS 는 이미지 경로를 모른다 — 컴포넌트가 `--img: url(...)` 로 넘긴다.
 *
 * 규칙
 * - 이미지는 `public/` 아래 경로. 같은 이름으로 덮어써도 되고, 여기 경로를 바꿔도 된다.
 * - 치수(`ratio`)는 자산의 가로/세로 픽셀이다. 바꾼 그림의 비율로 갱신해야 판이 안 찌그러진다.
 * - 배치(`top`/`left`/`right`)는 부모 대비 %. 그림을 바꾸면 자리도 같이 손볼 것.
 * - 안무 숫자(시각·길이·이징)는 여기 없다 — 그건 원본 실측이라 컴포넌트가 소유한다.
 */

export type Asset = { src: string; ratio: string };

export const content = {
  brand: {
    /** 접근성 라벨·저작권에 쓰는 이름 */
    name: 'Pathfinder',
    /** 로고 옆 워드마크 — 이미지 alt 로만 쓰임 */
    wordmark: 'Pathfinder',
  },

  nav: {
    /** 메가패널이 열리는 항목. `items` 가 패널 안 링크 */
    menus: [
      {
        label: '어떻게 되나요',
        href: '#compare',
        size: 'lg' as const,
        items: [
          { label: '인터뷰', href: '#compare', desc: '하려는 일을 묻고 정리합니다' },
          { label: '조사', href: '#compare', desc: '이미 있는 것을 찾습니다' },
          { label: '판정', href: '#compare', desc: '가져다 쓸지 직접 할지 가릅니다' },
          { label: '로드맵', href: '#compare', desc: '단계별로 그려 드립니다' },
        ],
      },
    ],
    /** 패널 없는 단순 링크 */
    links: [{ label: '누구에게 맞나요', href: '#start' }],
    /** 오른쪽 끝 — 두 번째만 밑줄 강조 */
    end: [
      { label: '무료 계정 없음', href: '#cta', marked: false },
      { label: '시작하기', href: '/app.html', marked: true },
    ],
  },

  hero: {
    /** 줄바꿈은 배열 원소로 */
    title: ['바퀴를 다시 만들지', '않게 합니다'],
    lede: '하려는 일을 한 문단 적어 주시면, 이미 있는 것과 직접 만들어야 하는 것을 갈라 로드맵으로 그려 드립니다.',
    cta: { label: '시작하기', href: '/app.html' },
    /**
     * 패럴랙스 풍경 3판 — 원경 → 중경 → 근경.
     * 셋 다 **같은 캔버스**(1920×1440, 4:3)를 쓰는 전체 장면이다 — 비율은 여기가 아니라
     * `--stage-ratio` 가 쥔다. 그래서 판마다 `ratio` 를 적지 않는다(M119 step-3).
     */
    layers: {
      far: { src: '/hero-far.png' },
      mid: { src: '/hero-mid.png' },
      near: { src: '/hero-near.png' },
    },
    /**
     * 집 창문 점등 오버레이 — 스크롤을 내리면 하나씩 켜진다.
     *
     * **중경 판에서 파생시킨 것이지 따로 그린 것이 아니다**(`scripts/derive_window_lights.py`).
     * 같은 캔버스에 창 하나씩만 그린 투명 PNG 라, 중경 판 안에 얹기만 하면 정합이 맞고
     * 판이 움직일 때 같이 움직인다 — 좌표 보정이 0 이다. 원본과 같은 공정이다(M119 실측 7·8).
     */
    lights: ['/hero-light-0.png', '/hero-light-1.png', '/hero-light-2.png', '/hero-light-3.png'],
    /**
     * 구름 4장 — 로드 시 좌우에서 슬라이드 인. `left` 또는 `right` 중 하나. 폭은 px.
     * M120: 판과 **같은 결**로 한 시트에서 뽑아 잘랐다(`scripts/prep_hero_plates.py --split-clouds`).
     * 폭은 원본 낱장(562 / 581 / 350 / 302 @1440)에 맞춘다 — 역설계 §3.
     */
    clouds: [
      // 원본처럼 좌우 가장자리에 붙인다(v1 은 x−101 로 화면 밖까지) — 먹선이 없어 잘려도 티가 안 난다.
      { src: '/cloud-0.png', ratio: '548 / 202', width: 540, left: -6, top: 12 },
      { src: '/cloud-1.png', ratio: '502 / 254', width: 500, right: -3, top: 5 },
      { src: '/cloud-2.png', ratio: '321 / 170', width: 330, left: 6, top: 50 },
      { src: '/cloud-3.png', ratio: '327 / 118', width: 300, right: 8, top: 56 },
    ],
  },

  trust: {
    /** "<b>4곳</b>에서 찾습니다" — 강조 숫자만 따로 */
    title: { before: '', number: '4곳', after: '에서 찾습니다', line2: '웹 검색, 국가법령, 국가통계, 공공데이터' },
    /** 아바타 시트 5열 × 2행. `idx` 0~9 로 칸을 고른다 */
    avatars: { src: '/avatars.png', cols: 5, rows: 2 },
    /** 동심원 위 아바타 9 — **극좌표**다.
     *  `angle` 은 12시에서 시계방향 도(deg), `r` 은 궤도 반지름 대비 %.
     *  위쪽 절반에만 몰아 두면 아래 절반이 빈 원호로 남는다(진단 D4) — 전주에 흩는다.
     *  아래쪽 것들은 인용 카드 뒤로 들어간다. 그게 두 블록을 꿰매는 장치다.
     *  ⚠ 데카르트 top/left 로 되돌리지 말 것 — 각도로 둬야 사분면 분포를 데이터로 읽을 수 있다. */
    nodes: [
      { angle: 0, r: 44, size: 66, idx: 3 },
      { angle: 40, r: 45, size: 66, idx: 4, bubble: 'b' as const },
      { angle: 76, r: 43, size: 66, idx: 5 },
      { angle: 112, r: 45, size: 58, idx: 6 },
      { angle: 152, r: 43, size: 58, idx: 7 },
      { angle: 196, r: 45, size: 66, idx: 8 },
      { angle: 242, r: 43, size: 58, idx: 9 },
      { angle: 286, r: 45, size: 76, idx: 1, bubble: 'a' as const },
      { angle: 322, r: 43, size: 76, idx: 0 },
    ],
    /** 말풍선에 타이핑되는 문구 */
    bubbles: { a: '이미 있네요', b: '이건 직접' },
  },

  /** 후기 — 7초마다 다음 장. `idx` 는 아바타 시트 칸 */
  quotes: [
    {
      idx: 9,
      text: '동네 카페 창업을 넣었더니 임대차·위생·간판 단계가 갈려서, 뭘 먼저 알아봐야 할지 보이더라고요.',
      name: '예시 로드맵: 동네 카페 창업',
      role: '예시 로드맵 · 6단계 · 12자료',
    },
    {
      idx: 7,
      text: '동아리 회비 정산을 넣었더니 회계를 직접 해야 하는 부분과 이미 있는 서식·툴을 가져다 쓸 부분이 나뉘었어요.',
      name: '예시 로드맵: 동아리 회비 정산',
      role: '예시 로드맵 · 4단계 · 8자료',
    },
    {
      idx: 2,
      text: '논문 정리 서비스를 넣었더니 문헌 검색과 목차 설계는 조사로, 편집 도구 선택은 판정으로 갈리더라고요.',
      name: '예시 로드맵: 논문 정리 서비스',
      role: '예시 로드맵 · 5단계 · 10자료',
    },
  ],

  compare: {
    title: ['찾은 것과 만들 것을', '한 화면에서 가릅니다'],
    lede: '혼자 찾을 때와 Pathfinder 로 찾을 때를 나란히 봅니다.',
    left: {
      heading: '혼자 찾을 때',
      /** 흩어진 도구 타일 — 위치는 패널 대비 %. `icon` 은 투명 PNG */
      tiles: [
        { label: '검색', icon: '/tile-0.png', left: 20, top: 20 },
        { label: '블로그', icon: '/tile-1.png', left: 54, top: 12 },
        { label: '법령', icon: '/tile-2.png', left: 80, top: 38 },
        { label: '통계', icon: '/tile-3.png', left: 34, top: 58 },
        { label: '카페 글', icon: '/tile-4.png', left: 66, top: 80 },
        { label: '메모', icon: '/tile-5.png', left: 16, top: 84 },
      ],
    },
    right: {
      heading: 'Pathfinder 로',
      hub: 'Pathfinder',
      /** 네 방위 스포크 — 위 → 오른쪽 → 아래 → 왼쪽 순 */
      spokes: [
        { label: '인터뷰', icon: '/tile-2.png', left: 50, top: 8 },
        { label: '조사', icon: '/tile-6.png', left: 82, top: 50 },
        { label: '판정', icon: '/tile-1.png', left: 50, top: 92 },
        { label: '로드맵', icon: '/tile-7.png', left: 18, top: 50 },
      ],
    },
    cta: { label: '누구에게 맞나요', href: '#start' },
  },

  team: {
    title: ['새 일을 시작하는 분께', '맞습니다'],
    /** 2×2 — `lead` 가 강조색 */
    items: [
      { icon: '/svc-0.png', lead: '처음 해 보는 일', rest: '어디서부터 손대야 할지 막막할 때, 단계로 나눠 드립니다.' },
      { icon: '/svc-1.png', lead: '동네 가게 준비', rest: '임대차·허가·설비처럼 챙길 것이 많은 일을 정리합니다.' },
      { icon: '/svc-2.png', lead: '작은 서비스 만들기', rest: '이미 있는 것과 직접 만들 것을 갈라 범위를 잡습니다.' },
      { icon: '/svc-3.png', lead: 'AI 가 익숙하지 않은 분', rest: '어려운 말 없이, 하려는 일부터 한 문단으로 시작합니다.' },
    ],
  },

  cta: {
    title: '오늘 오후에 첫 로드맵을 받아 보세요.',
    text: '하려는 일을 한 문단 적어 주시면, 이미 있는 것과 직접 만들어야 하는 것을 갈라 로드맵으로 그려 드립니다.',
    button: { label: '시작하기', href: '/app.html' },
    /** 오른쪽에 서는 인물 — 세로로 긴 투명 PNG, 아래를 물린다 */
    figure: { src: '/cta-figure.png', ratio: '760 / 1000' },
  },

  start: {
    title: ['처음이신가요?', '함께 정리합니다'],
    links: [
      { label: ['인터뷰 다섯 번으로', '정리한다는 것'], href: '/app.html', tone: 'solid' as const },
      { label: ['결과가 이 브라우저에 남고', '파일로 내려받는다는 것'], href: '#cta', tone: 'quiet' as const },
    ],
  },

  footer: {
    tagline: 'Solar Pro 4 로 만들었습니다.',
    columns: [
      {
        title: '서비스',
        href: '#compare',
        links: [
          { label: '시작하기', href: '/app.html' },
          { label: '어떻게 되나요', href: '#compare' },
          { label: '누구에게 맞나요', href: '#start' },
        ],
      },
      {
        title: '조사하는 곳',
        href: '#quote',
        links: [
          { label: '네이버 개발자', href: 'https://developers.naver.com' },
          { label: '국가법령정보센터', href: 'https://www.law.go.kr' },
          { label: 'KOSIS', href: 'https://kosis.kr' },
          { label: '공공데이터포털', href: 'https://www.data.go.kr' },
        ],
      },
      {
        title: '만든 것',
        href: '#cta',
        links: [
          { label: 'Upstage', href: 'https://upstage.ai' },
          { label: 'Hermes Agent', href: 'https://github.com/nousresearch/hermes-agent' },
          { label: 'ui.askewly.com', href: 'https://ui.askewly.com' },
        ],
      },
      {
        title: '만든 곳',
        href: '#cta',
        links: [{ label: 'askewly.com', href: 'https://askewly.com' }],
      },
    ],
    copyright: '© 2026 askewly Pathfinder.',
    terms: [{ label: '조사 자료의 저작권은 각 출처에 있습니다.', href: '#cta' }],
  },
};

/** 아바타 시트 칸 → CSS 변수. calc 안에서 `%` 는 나머지가 아니라서 JS 가 계산한다 */
export function avatarVars(idx: number) {
  const { cols } = content.trust.avatars;
  return { '--ax': idx % cols, '--ay': Math.floor(idx / cols) } as React.CSSProperties;
}

/** `url()` 로 감싼 이미지 변수 — CSS 는 `var(--img)` 만 안다 */
export function img(src: string, name = '--img') {
  return { [name]: `url('${src}')` } as React.CSSProperties;
}
