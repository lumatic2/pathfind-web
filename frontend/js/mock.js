/* === mock 데이터 (app.html?mock=1 일 때만 로드) === */
(function () {
  if (new URLSearchParams(location.search).get('mock') !== '1') return;
  window.__useMock = true;
  window.__mockData = {
    /* §1 grill — 턴 시퀀스 */
    grillTurns: [
      {
        questionTitle: '야구 매니저 게임에서 제일 먼저 정할 것',
        questionBody: '풋볼매니저처럼 선수 데이터·전략·시즌 운영을 하는 야구 매니저를 만들고 싶다고 했다. 코딩 경험이 거의 없는 상황에서, 제일 먼저 어떤 범위로 시작할지 한 문단으로 적어 주세요.',
        suggestion: '먼저 "한 경기만 돌아가는 최소 프로토타입"까지로 범위를 좁히고, 엔진·에셋은 그 뒤에 찾는 식으로 답하면 흐름이 깔끔하다.',
        exampleButtons: [
          '한 경기만 돌아가는 최소 프로토타입부터 시작하고, 엔진·에셋은 그 뒤에 찾는다.',
          '선수 데이터보다 경기 시뮬레이션 규칙을 먼저 만든다.',
        ],
      },
      {
        questionTitle: 'MVP에서 뺄 것 하나 고르기',
        questionBody: '범위를 좁힐 때 가장 먼저 뺄 수 있는 것은 무엇인가? 예를 들어 선수 육성 시뮬레이션, 트레이드/FA, 실시간 경기 연출, 시즌 리그 운영 중 하나를 빼 본다면?',
        suggestion: '초반에는 "실시간 경기 연출"을 빼고 텍스트/카드 기반 시뮬레이션으로 시작하면 구현 부담이 크게 줄어든다.',
        exampleButtons: [
          '실시간 경기 연출을 빼고 결과만 요약해서 보여주는 식으로 간다.',
          '트레이드/FA를 빼고 단일 시즌 고정 로스터로 시작한다.',
        ],
        done: true,
        summary: '야구 매니저 게임을 풋볼매니저식 루프(선수 영입·훈련·라인업·시뮬레이션 결과 피드백)로 만들되, 코딩 경험이 거의 없으므로 첫 버전은 한 경기만 돌아가는 최소 프로토타입으로 시작한다. 엔진·에셋·야구 에셋은 먼저existing 자료를 확인하고, 경기 시뮬레이션 규칙은 확률 기반 단순 모델로 시작한다. 시즌·리그 구조는 MVP 뒤로 미룬다.',
      },
    ],

    /* §2 pathfind — bigPicture */
    bigPicture: {
      title: '야구 매니저 게임 만들기',
      intro: '풋볼매니저처럼 선수 데이터·전략·시즌 운영을 하는 야구 매니저 게임을 만든다. 코딩 경험이 거의 없어서, 먼저 어떤 엔진·에셋·사례가 있는지 찾아보고 시작한다.',
      stages: [
        {
          no: 1,
          title: '무엇을 만들 건지 범위 잡기',
          desc: '야구 매니저 게임의 핵심 루프(경기→보상→선수 성장→시즌)를 한 문장으로 정리하고, 어디까지 직접 만들고 어디부터 참고할지 범위를 잡는다.',
          icon: 'compass',
          tasks: [
            { order: 1, task: '핵심 루프 한 문장 정의', why: '범위가 커지면 처음부터 흩어짐' },
            { order: 2, task: 'MVP 범위 vs 나중에 붙일 것 분리', why: '첫 버전을 너무 크게 잡지 않기 위함' },
          ],
          verdict: '직접 해야 함',
          verdictReason: '게임의 목표와 범위는 외부 자료로 대신 정할 수 없다.',
          findings: [
            {
              kind: '참고 사례',
              name: 'Football Manager — 게임 플레이 루프 개요',
              query: 'Football Manager gameplay loop',
              evidence: '선수 영입·훈련·경기 라인업·시뮬레이션 결과 피드백이 한 시즌 루프를 이룬다.',
              note: '야구 매니저 게임도 이 루프 구조를 참고할 수 있다.',
              url: 'https://www.si.com/footballmanager',
            },
          ],
          choices: ['선수 운영 중심', '경기 시뮬레이션 중심', '둘 다'],
        },
        {
          no: 2,
          title: '게임 엔진·플랫폼 고르기',
          desc: '코딩 경험이 거의 없는 상황에서 시작하기 좋은 엔진을 고른다. 2D/3D 필요성, 무료 여부, 튜토리얼 풍부함을 함께 본다.',
          icon: 'code-xml',
          tasks: [
            { order: 1, task: '후보 엔진 2~3개 추리기', why: '처음부터 하나로 좁히면 비교가 안 됨' },
            { order: 2, task: '각 엔진의 야구/시뮬레이션 튜토리얼 존재 확인', why: '튜토리얼이 없으면 시작 자체가 멀어짐' },
          ],
          verdict: '가져다 써도 됨',
          verdictReason: '엔진 선택은 기존 문서·튜토리얼로 대부분 결정할 수 있다.',
          findings: [
            {
              kind: '튜토리얼·블로그',
              name: 'Godot 공식 사이트',
              query: 'Godot engine features',
              evidence: '무료·오픈소스 2D/3D 엔진. 공식 문서에 튜토리얼이 풍부하다.',
              note: '비코딩 초보자에게 첫 후보로 자주 언급된다.',
              url: 'https://godotengine.org/',
            },
            {
              kind: '참고 사례',
              name: 'Unity 공식 사이트',
              query: 'Unity game engine',
              evidence: '2D/3D 모두 지원, 학습 자료가 많다. 무료 구간 존재.',
              note: '야구 게임 튜토리얼도 검색해 볼 수 있다.',
              url: 'https://unity.com/',
            },
          ],
          choices: ['Godot', 'Unity', '그 외 액션 기반 엔진'],
        },
        {
          no: 3,
          title: '무료·저렴한 야구 에셋 찾기',
          desc: '선수·포수·미트·공·배팅 케이지 등 야구 게임에 필요한 시각/음향 에셋을 무료로 구할 수 있는지 먼저 확인한다.',
          icon: 'palette',
          tasks: [
            { order: 1, task: '필요한 에셋 목록화', why: '찾는 범위가 넓으면 시간을 많이 씀' },
            { order: 2, task: '무료/오픈소스 에셋 사이트 확인', why: '처음부터 직접 그리면 시작이 늦어짐' },
          ],
          verdict: '가져다 써도 됨',
          verdictReason: '무료 에셋·스프라이트는 기존 사이트에서 상당 부분 구할 수 있다.',
          findings: [
            {
              kind: '무료 에셋',
              name: 'OpenGameArt.org',
              query: 'baseball sprite assets',
              evidence: '게임용 2D/음향 에셋을 무료로 공유하는 사이트.',
              note: '야구 전용은 제한적일 수 있으니 검색 필요.',
              url: 'https://opengameart.org/',
            },
            {
              kind: '참고 사례',
              name: 'itch.io — 야구 태그 게임',
              query: 'itch.io baseball games',
              evidence: '인디 개발자가 올린 야구 관련 게임·에셋이 있다.',
              note: '에셋보다 사례 참고에 유용.',
              url: 'https://itch.io/games/tag-baseball',
            },
          ],
          choices: ['무료 에셋 우선 사용', '일부만 직접 제작', '에셋보다 프로토타입 먼저'],
        },
        {
          no: 4,
          title: '경기 시뮬레이션 규칙 설계',
          desc: '타석·투수전·수비·주루 등 야구 경기 흐름을 어떻게 시뮬레이션할지 규칙을 정한다. 실제 야구 규칙과 게임 재미를 분리해서 본다.',
          icon: 'flask-conical',
          tasks: [
            { order: 1, task: '핵심 이벤트 리스트에 우선순위', why: '모든 야구 규칙을 한 번에 구현하면 늪에 빠짐' },
            { order: 2, task: '간단한 확률 기반 모델 먼저 프로토타입', why: '복잡도는 나중에 붙일 수 있음' },
          ],
          verdict: '섞어야 함',
          verdictReason: '기존 야구 시뮬레이션 아이디어가 참고가 되지만, 게임만의 규칙은 직접 설계해야 한다.',
          findings: [
            {
              kind: '튜토리얼·블로그',
              name: 'Baseball Reference',
              query: 'baseball statistics',
              evidence: '실제 야구 통계 데이터가 풍부해 시뮬레이션 규칙 참고에 쓸 수 있다.',
              note: '확률 모델의 현실성 검증용.',
              url: 'https://www.baseball-reference.com/',
            },
          ],
          choices: ['확률 기반 단순 모델', '카드/주사위 비유', '실제 야구 규칙 최대한 반영'],
        },
        {
          no: 5,
          title: '시즌·리그 구조 만들기',
          desc: '팀 생성·일정·순위·플레이오프 등 시즌 운영 구조를 만든다. 이게 있어야 "매니저를 한다"는 느낌이 난다.',
          icon: 'database',
          tasks: [
            { order: 1, task: '리그 규모·팀 수 결정', why: '일정·순위 계산량이 달라짐' },
            { order: 2, task: '선수 풀과 트레이드/FA 구조 구상', why: '시즌 운영의 재미가 여기서 결정됨' },
          ],
          verdict: '직접 해야 함',
          verdictReason: '리그 구조와 게임만의 시즌 운영 방식은 직접 설계해야 한다.',
          findings: [],
          choices: ['간단한 단일 리그', '승강제 포함 리그', '컵대회 병행'],
        },
      ],
      prototypeLoop: '먼저 Godot(또는 Unity)로 한 경기만 돌아가는 최소 프로토타입을 만든다. 선수 데이터는 하드코딩된 몇 명만으로 시작하고, 경기 결과 화면까지 나오는 것을 목표로 한다. 시즌 구조는 그 다음 단계.',
    },

    /* §3 stage — 단계별 enrich (mock) */
    stages: [
      {
        stage: {
          no: 1,
          title: '무엇을 만들 건지 범위 잡기',
          desc: '야구 매니저 게임의 핵심 루프(경기→보상→선수 성장→시즌)를 한 문장으로 정리하고, 어디까지 직접 만들고 어디부터 참고할지 범위를 잡는다.',
          icon: 'compass',
          tasks: [
            { order: 1, task: '핵심 루프 한 문장 정의', why: '범위가 커지면 처음부터 흩어짐' },
            { order: 2, task: 'MVP 범위 vs 나중에 붙일 것 분리', why: '첫 버전을 너무 크게 잡지 않기 위함' },
          ],
          verdict: '직접 해야 함',
          verdictReason: '게임의 목표와 범위는 외부 자료로 대신 정할 수 없다.',
          findings: [
            {
              kind: '참고 사례',
              name: 'Football Manager — 게임 플레이 루프 개요',
              query: 'Football Manager gameplay loop',
              evidence: '선수 영입·훈련·경기 라인업·시뮬레이션 결과 피드백이 한 시즌 루프를 이룬다.',
              note: '야구 매니저 게임도 이 루프 구조를 참고할 수 있다.',
              url: 'https://www.si.com/footballmanager',
            },
          ],
          choices: ['선수 운영 중심', '경기 시뮬레이션 중심', '둘 다'],
          options: ['선수 운영 중심으로 MVP', '경기 시뮬레이션 중심 MVP'],
          todos: [
            { task: '핵심 루프 한 문장 정의', owner: '직접 함', note: '예: "선수를 영입하고 훈련시키고 라인업에 넣어 시즌을 돌린다"' },
          ],
          searched: true,
        },
      },
      {
        stage: {
          no: 2,
          title: '게임 엔진·플랫폼 고르기',
          desc: '코딩 경험이 거의 없는 상황에서 시작하기 좋은 엔진을 고른다. 2D/3D 필요성, 무료 여부, 튜토리얼 풍부함을 함께 본다.',
          icon: 'code-xml',
          tasks: [
            { order: 1, task: '후보 엔진 2~3개 추리기', why: '처음부터 하나로 좁히면 비교가 안 됨' },
            { order: 2, task: '각 엔진의 야구/시뮬레이션 튜토리얼 존재 확인', why: '튜토리얼이 없으면 시작 자체가 멀어짐' },
          ],
          verdict: '가져다 써도 됨',
          verdictReason: '엔진 선택은 기존 문서·튜토리얼로 대부분 결정할 수 있다.',
          findings: [
            {
              kind: '튜토리얼·블로그',
              name: 'Godot 공식 사이트',
              query: 'Godot engine features',
              evidence: '무료·오픈소스 2D/3D 엔진. 공식 문서에 튜토리얼이 풍부하다.',
              note: '비코딩 초보자에게 첫 후보로 자주 언급된다.',
              url: 'https://godotengine.org/',
            },
            {
              kind: '참고 사례',
              name: 'Unity 공식 사이트',
              query: 'Unity game engine',
              evidence: '2D/3D 모두 지원, 학습 자료가 많다. 무료 구간 존재.',
              note: '야구 게임 튜토리얼도 검색해 볼 수 있다.',
              url: 'https://unity.com/',
            },
          ],
          choices: ['Godot', 'Unity', '그 외 액션 기반 엔진'],
          options: ['Godot으로 시작', 'Unity로 시작'],
          todos: [
            { task: 'Godot 공식 튜토리얼 확인', owner: '가져다 씀', note: '공식 문서가 풍부하므로 먼저 본다' },
          ],
          searched: true,
        },
      },
      {
        stage: {
          no: 3,
          title: '무료·저렴한 야구 에셋 찾기',
          desc: '선수·포수·미트·공·배팅 케이지 등 야구 게임에 필요한 시각/음향 에셋을 무료로 구할 수 있는지 먼저 확인한다.',
          icon: 'palette',
          tasks: [
            { order: 1, task: '필요한 에셋 목록화', why: '찾는 범위가 넓으면 시간을 많이 씀' },
            { order: 2, task: '무료/오픈소스 에셋 사이트 확인', why: '처음부터 직접 그리면 시작이 늦어짐' },
          ],
          verdict: '가져다 써도 됨',
          verdictReason: '무료 에셋·스프라이트는 기존 사이트에서 상당 부분 구할 수 있다.',
          findings: [
            {
              kind: '무료 에셋',
              name: 'OpenGameArt.org',
              query: 'baseball sprite assets',
              evidence: '게임용 2D/음향 에셋을 무료로 공유하는 사이트.',
              note: '야구 전용은 제한적일 수 있으니 검색 필요.',
              url: 'https://opengameart.org/',
            },
            {
              kind: '참고 사례',
              name: 'itch.io — 야구 태그 게임',
              query: 'itch.io baseball games',
              evidence: '인디 개발자가 올린 야구 관련 게임·에셋이 있다.',
              note: '에셋보다 사례 참고에 유용.',
              url: 'https://itch.io/games/tag-baseball',
            },
          ],
          choices: ['무료 에셋 우선 사용', '일부만 직접 제작', '에셋보다 프로토타입 먼저'],
          options: ['OpenGameArt 우선 검색', 'itch.io 사례 참고'],
          todos: [
            { task: '필요한 에셋 목록 먼저 작성', owner: '직접 함', note: '선수·포수·미트·공·배팅 케이지 등' },
          ],
          searched: true,
        },
      },
      {
        stage: {
          no: 4,
          title: '경기 시뮬레이션 규칙 설계',
          desc: '타석·투수전·수비·주루 등 야구 경기 흐름을 어떻게 시뮬레이션할지 규칙을 정한다. 실제 야구 규칙과 게임 재미를 분리해서 본다.',
          icon: 'flask-conical',
          tasks: [
            { order: 1, task: '핵심 이벤트 리스트에 우선순위', why: '모든 야구 규칙을 한 번에 구현하면 늪에 빠짐' },
            { order: 2, task: '간단한 확률 기반 모델 먼저 프로토타입', why: '복잡도는 나중에 붙일 수 있음' },
          ],
          verdict: '섞어야 함',
          verdictReason: '기존 야구 시뮬레이션 아이디어가 참고가 되지만, 게임만의 규칙은 직접 설계해야 한다.',
          findings: [
            {
              kind: '튜토리얼·블로그',
              name: 'Baseball Reference',
              query: 'baseball statistics',
              evidence: '실제 야구 통계 데이터가 풍부해 시뮬레이션 규칙 참고에 쓸 수 있다.',
              note: '확률 모델의 현실성 검증용.',
              url: 'https://www.baseball-reference.com/',
            },
          ],
          choices: ['확률 기반 단순 모델', '카드/주사위 비유', '실제 야구 규칙 최대한 반영'],
          options: ['확률 기반 단순 모델 먼저', '카드/주사위 비유 먼저'],
          todos: [
            { task: '타석 결과 확률표 초안 작성', owner: '직접 함', note: '현실성은 Baseball Reference로 검증' },
          ],
          searched: true,
        },
      },
      {
        stage: {
          no: 5,
          title: '시즌·리그 구조 만들기',
          desc: '팀 생성·일정·순위·플레이오프 등 시즌 운영 구조를 만든다. 이게 있어야 "매니저를 한다"는 느낌이 난다.',
          icon: 'database',
          tasks: [
            { order: 1, task: '리그 규모·팀 수 결정', why: '일정·순위 계산량이 달라짐' },
            { order: 2, task: '선수 풀과 트레이드/FA 구조 구상', why: '시즌 운영의 재미가 여기서 결정됨' },
          ],
          verdict: '직접 해야 함',
          verdictReason: '리그 구조와 게임만의 시즌 운영 방식은 직접 설계해야 한다.',
          findings: [],
          choices: ['간단한 단일 리그', '승강제 포함 리그', '컵대회 병행'],
          options: ['단일 리그 MVP', '승강제 포함 구조'],
          todos: [
            { task: '리그 규모·팀 수 결정', owner: '직접 함', note: '일정 생성 난이도와 직결' },
          ],
          searched: true,
        },
      },
    ],

    /* §4 handoff — 최종 마크다운 */
    handoffMarkdown: `# 핸드오프 — 야구 매니저 게임 만들기

## 1. 아이디어 요약
풋볼매니저처럼 선수 데이터·전략·시즌 운영을 하는 야구 매니저 게임을 만들고 싶다. 코딩 경험이 거의 없어서, 먼저 어떤 엔진·에셋·사례가 있는지 찾아보고 시작하고 싶다.

## 2. 큰 그림
1. 무엇을 만들 건지 범위 잡기 — 핵심 루프 한 문장 정의, MVP 범위 분리
2. 게임 엔진·플랫폼 고르기 — Godot/Unity 등 후보 비교, 튜토리얼 확인
3. 무료·저렴한 야구 에셋 찾기 — 필요한 에셋 목록화, 무료 사이트 확인
4. 경기 시뮬레이션 규칙 설계 — 핵심 이벤트 우선순위, 단순 확률 모델 먼저
5. 시즌·리그 구조 만들기 — 리그 규모·팀 수, 선수 풀과 트레이드/FA 구조 구상

## 3. 단계별 리서치 결과
1. 무엇을 만들 건지 범위 잡기 — verdict: 직접 해야 함. 참고 사례: Football Manager 플레이 루프.
2. 게임 엔진·플랫폼 고르기 — verdict: 가져다 써도 됨. Godot, Unity 후보.
3. 무료·저렴한 야구 에셋 찾기 — verdict: 가져다 써도 됨. OpenGameArt, itch.io.
4. 경기 시뮬레이션 규칙 설계 — verdict: 섞어야 함. Baseball Reference 참고.
5. 시즌·리그 구조 만들기 — verdict: 직접 해야 함. 외부 선례만으로 대체 불가.

## 4. prototype 루프 조언
먼저 Godot(또는 Unity)로 한 경기만 돌아가는 최소 프로토타입을 만든다. 선수 데이터는 하드코딩된 몇 명만으로 시작하고, 경기 결과 화면까지 나오는 것을 목표로 한다. 시즌 구조는 그 다음 단계.

## 5. 다음 액션
1. 핵심 루프 한 문장 정의 (예: "선수를 영입하고 훈련시키고 라인업에 넣어 시즌을 돌린다")
2. Godot 공식 사이트와 Unity 공식 사이트에서 초보자 튜토리얼 확인
3. 필요한 에셋 목록 먼저 적기 (선수·포수·미트·공·배팅 케이지 등)

## 6. 참고 링크
- https://godotengine.org/
- https://unity.com/
- https://opengameart.org/
- https://itch.io/games/tag-baseball
- https://www.baseball-reference.com/
- https://www.si.com/footballmanager
`,
    title: '야구 매니저 게임 만들기',
  };

  window.__startMockFlow = function () {
    const data = window.__mockData || {};
    window.__mockFlowNext = 0;
    window.__mockFlowData = data;
  };
})();
