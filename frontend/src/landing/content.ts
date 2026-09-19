/**
 * 랜딩의 **교체 가능한 것 전부**가 여기 산다 — 카피·이미지 경로·이미지 배치.
 *
 * 원본은 ui-dictionary `examples/glide-landing/src/content.ts`(Deskwork 영어 mock). Pathfinder(서비스 표기, 도메인·스킬명은 pathfind) 용으로 이 파일만 바꿨다 —
 * 컴포넌트(`components/*.tsx`)는 구조와 안무만 알고 여기서 값을 받는다. CSS 는 이미지 경로를 모른다(컴포넌트가 `--img: url(...)` 로 넘긴다).
 *
 * 규칙
 * - 이미지는 `public/` 아래 경로. 그림은 원본 것을 그대로 쓴다(풍경 3판·구름·아바타·타일·인물).
 * - 치수(`ratio`)는 자산의 가로/세로 픽셀이다. 그림을 바꾸면 비율도 같이 갱신해야 판이 안 찌그러진다.
 * - 배치(`top`/`left`/`right`)는 부모 대비 %.
 * - 안무 숫자(시각·길이·이징)는 여기 없다 — 그건 원본 실측이라 컴포넌트가 소유한다.
 * - 문구: 존댓말, 느낌표·이모지 없음, 싸이클·세션·런 대신 「로드맵」(문구 정본 `docs/app-ux-copy.md`).
 * - 후기 칸은 가짜 인물을 세우지 않는다 — 캡션 자리에 **로드맵의 주제**만 한 줄로 둔다.
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
        label: '서비스 흐름',
        href: '#compare',
        size: 'lg' as const,
        items: [
          /* 문구는 결선 레포(2026-09-15), 앵커는 실제로 가는 곳만(참조 결정) */
          { label: '인터뷰', href: '#start', desc: '하려는 일을 묻고 정리합니다' },
          { label: '조사', href: '#trust', desc: '이미 있는 것을 찾습니다' },
          { label: '판정', href: '#compare', desc: '가져다 쓸 것과 만들 것을 판단합니다' },
          { label: '패스', href: '#team', desc: '단계별로 그려 드립니다' },
        ],
      },
    ],
    /** 패널 없는 단순 링크 */
    links: [{ label: '누구에게 필요한가요', href: '#team' }],
    /** 오른쪽 끝 — 두 번째만 밑줄 강조 */
    end: [
      { label: '로그인', href: '#cta', marked: false },
      { label: '시작하기', href: '/app.html', marked: true },
    ],
  },

  hero: {
    /** 줄바꿈은 배열 원소로 */
    title: ['거인의 어깨 위에서', '길을 찾는 방법'],
    lede: [
      '모든 걸 처음부터 만들 필요는 없죠.',
      '패스파인더가 "진짜 해야 할 일"을 보여드립니다.',
    ],
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
    /** "<b>다섯 곳</b>에서 찾습니다" — 강조 낱말만 따로, `line2` 는 작은 부제로 한 줄에 선다.
     *  ⚠ 곳의 수와 이름은 **`server/stage.mjs` 의 `CHANNELS` 가 정본**이다. 채널을 늘리거나 줄이면 여기도 같이 고친다.
     *  2026-09-15 정정: 넷이 아니라 다섯이고, 빠져 있던 하나가 하필 오픈소스(GitHub)였다 —
     *  「가져다 쓸 것」이라는 주장을 가장 곧장 받치는 채널이다.
     *  「단계마다」는 쓰지 않는다: 채널은 규칙에 걸린 단계에만 붙어 빈도 서술이 거짓이 된다(2026-09-14). */
    /** `line2` 는 **묶음 배열**이다 — 넓은 화면은 한 줄로 이어 붙이고, 좁은 화면은 묶음마다 줄을 바꾼다.
     *  한 문자열로 두면 좁은 화면에서 아무 데나 접혀 「·」 하나가 다음 줄 맨 앞에 남는다(2026-09-15).
     *  묶음은 민간(웹·코드) / 나라(법령·통계·공공데이터)로 가른다. */
    title: { before: '', number: '다섯 곳', after: '에서 찾습니다', line2: ['웹 검색 · 오픈소스', '국가법령 · 국가통계 · 공공데이터'] },
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

  /** 후기 — 7초마다 다음 장. `idx` 는 아바타 시트 칸.
   *  캡션은 **주제 한 줄뿐**이다. 「예시 로드맵」이라는 라벨도, 「6단계 · 12자료」 같은 수치도
   *  읽는 사람에게는 쓸모가 없다(2026-09-15 사용자 판정). */
  quotes: [
    {
      idx: 9,
      text: '동네 카페 창업을 넣었더니 임대차·위생·간판 단계가 갈려서, 뭘 먼저 알아봐야 할지 보이더라고요.',
      name: '동네 카페 창업',
    },
    {
      idx: 7,
      text: '동아리 회비 정산을 넣었더니 회계를 직접 해야 하는 부분과 이미 있는 서식·툴을 가져다 쓸 부분이 나뉘었어요.',
      name: '동아리 회비 정산',
    },
    {
      idx: 2,
      text: '논문 정리 서비스를 넣었더니 문헌 검색과 목차 설계는 조사로, 편집 도구 선택은 판정으로 갈리더라고요.',
      name: '논문 정리 서비스',
    },
  ],

  compare: {
    title: ['가져다 쓸 것과 직접 만들 것을', '정리해드립니다'],
    lede: '여러분의 돈과 시간을 절약하세요!',
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
      heading: '패스파인더와 함께',
      hub: 'Pathfinder',
      /** 네 방위 스포크 — 위 → 오른쪽 → 아래 → 왼쪽 순.
       *  좌표 기준은 **정사각 궤도 칸**(`.band__orbit`)이고 반지름 40% 가 파선 원과 같은 값이다.
       *  네 값이 어긋나면 아이콘이 원에서 떠 보인다 — 10/90 대칭을 깨지 않는다. */
      spokes: [
        { label: '인터뷰', icon: '/tile-2.png', left: 50, top: 10 },
        { label: '조사', icon: '/tile-6.png', left: 90, top: 50 },
        { label: '판정', icon: '/tile-1.png', left: 50, top: 90 },
        { label: '패스', icon: '/tile-7.png', left: 10, top: 50 },
      ],
    },
    /** 버튼이 아니라 아래로 잇는 힌트 — 문구도 이어지는 말투로 */
    cta: { label: '그럼 누구에게 필요할까요?', href: '#team' },
  },

  team: {
    title: ['새 일을 시작하는 분께', '필요합니다'],
    /** 2×2 — `lead` 가 강조색.
     *  네 칸은 「~하는 분」과 「~할 때」를 섞는다(2026-09-15 사용자 결정) — 제목이 둘을 다 받는다.
     *  칸마다 **서로 다른 값 하나**를 맡는다: 순서 / 이미 있는 것 / 놓치면 곤란한 것 / 낮은 문턱.
     *  종전 1·3 칸은 같은 말을 해 하나가 놀았고, 「갈라 범위를 잡는다」는 어색한 한국어였다.
     *  아이콘은 이 넷을 위해 새로 뽑았다(2026-09-15, GPT Image 2). 기존 그림체에서 실측한 색 다섯으로 고정했다 —
     *  먹선 #14110D · 흰 면 #FCFCFC · 연라벤더 #D8C7EE · 보라 #A05FCA · 진보라 #6F2DBD.
     *  파일 이름은 번호가 아니라 뜻이다 — 칸 순서가 바뀌어도 어느 그림인지 읽힌다. */
    items: [
      { icon: '/svc-map.png', lead: '어디부터 손대야 할지 막막할 때', rest: '첫걸음부터 마무리까지 그림으로 보여드립니다.' },
      { icon: '/svc-parts.png', lead: '직접 다 만들 생각이었다면', rest: '이미 있는 부품을 찾아, 직접 만들 일을 줄여 드립니다.' },
      { icon: '/svc-shop.png', lead: '자영업을 준비하는 분', rest: '임대차·허가·위생처럼 빠뜨리면 곤란한 것을 미리 짚어 드립니다.' },
      { icon: '/svc-interview.png', lead: 'AI가 낯선 분', rest: '클릭만으로 인터뷰를 진행하고 아이디어를 시각화해보세요.' },
    ],
  },

  cta: {
    title: ['오늘 오후에', '첫 패스를 받아 보세요.'],
    text: [
      '모든 걸 처음부터 만들 필요는 없죠.',
      '패스파인더가 "진짜 해야 할 일"을 보여드립니다.',
    ],
    button: { label: '시작하기', href: '/app.html' },
    /** 오른쪽에 서는 인물 — 세로로 긴 투명 PNG, 아래를 물린다 */
    figure: { src: '/cta-figure.png', ratio: '760 / 1000' },
  },

  start: {
    title: ['처음 해보는 일인가요?', '패스파인더와 큰 그림을 그려봅시다'],
    /** 자라나는 로드맵 예시 — 뿌리 아래 단계, 단계 아래 소주제, 소주제 아래 항목. 라벨은 18자 안(마인드맵 라벨 규칙). */
    map: {
      root: '동네 카페 단골 앱',
      stages: [
        { label: '무엇을 만드나', children: [{ label: '단골 기억 기능', children: ['방문 기록', '취향 메모'] }, { label: '사장님 화면' }] },
        { label: '먼저 살펴볼 것', children: [{ label: '비슷한 앱 사례' }, { label: '개인정보 규정' }] },
        { label: '만드는 순서', children: [{ label: '첫 시제품', children: ['화면 스케치', '2주 실험'] }, { label: '손님 테스트' }] },
      ] as { label: string; children: { label: string; children?: string[] }[] }[],
    },
  },

  footer: {
    /** 크레딧 — 「Powered by」 + 업스테이지 워드마크. 워드마크는 번들 자산이라 여기 없다(`Footer.tsx` 가 가져온다).
     *  모델 이름은 아래 「쓴 것」이 들고 있다 — 대회 규정이 보는 것은 모델이라 어느 한쪽에는 남아 있어야 한다. */
    powered: { label: 'Powered by', alt: 'Upstage', href: 'https://www.upstage.ai' },
    columns: [
      {
        title: '서비스',
        href: '#compare',
        links: [
          { label: '시작하기', href: '/app.html' },
          { label: '무엇을 해 주나요', href: '#compare' },
          { label: '누구에게 필요한가요', href: '#team' },
        ],
      },
      /* 밖으로 나가는 묶음은 제목에 링크를 걸지 않는다 — 걸 곳이 없어 엉뚱한 앵커로 갔었다 */
      {
        /* ⚠ 다섯과 그 순서는 신뢰 섹션 `trust.title.line2` 와 **같아야** 한다. 한쪽만 고치면
           바로 위에서 「다섯 곳」이라 해 놓고 푸터가 넷이 된다(2026-09-15 적발).
           링크는 API 를 받는 개발자 포털이 아니라 **자료가 사는 곳**으로 보낸다. */
        title: '조사하는 곳',
        links: [
          { label: '네이버 검색', href: 'https://search.naver.com' },
          { label: 'GitHub', href: 'https://github.com' },
          { label: '국가법령정보센터', href: 'https://www.law.go.kr' },
          { label: '국가통계포털 KOSIS', href: 'https://kosis.kr' },
          { label: '공공데이터포털', href: 'https://www.data.go.kr' },
        ],
      },
      {
        /* Upstage·Hermes·askewly 는 우리가 만든 게 아니라 **쓴** 것이다.
           이름은 도메인이 아니라 그것이 무엇인지로 적는다 — `ui.askewly.com` 은 안 읽힌다.
           회사 이름은 위 크레딧의 워드마크가 말하므로 여기서는 **모델 이름**을 둔다. */
        title: '쓴 것',
        links: [
          { label: 'Solar Pro 4', href: 'https://www.upstage.ai/solar-llms' },
          { label: 'Hermes Agent', href: 'https://github.com/nousresearch/hermes-agent' },
          { label: 'askewly 디자인 시스템', href: 'https://ui.askewly.com' },
        ],
      },
    ],
    /* 만든 주체는 칸 하나를 채우지 못한다 — 아래 줄이 제자리다(한 줄짜리 열이 4열의 오른쪽을 비웠다) */
    copyright: '© 2026 askewly · Made by Luka',
    /** 고지 문장 — 링크가 아니다. 「저작권은 각 출처에」는 두 군데서 틀린다(2026-09-15):
     *  법령·고시는 저작권법 제7조로 보호 대상이 아니고, 공공데이터·KOSIS 는 저작권보다
     *  공공누리 이용 조건이 실제로 지킬 것이다. 권리와 조건을 함께 가리킨다. */
    terms: [{ label: '자료의 권리와 이용 조건은 각 출처를 따릅니다.' }],
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
