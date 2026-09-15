import { useEffect, useMemo, useRef, useState } from 'react';
import { MindmapSpineTree, type MindmapNode } from '@/components/mindmap-spine-tree';
import { prefersReducedMotion } from '../lib/choreography';
import { content } from '../content';
import '../map.css';

/**
 * StartHelp 의 자라나는 로드맵 예시.
 *
 * 그리는 것은 앱과 같은 `MindmapSpineTree` 부품이고, 트리는 **처음부터 끝까지 다 펼쳐진 채**로 둔다. 자라는 연출은
 * 깊이별 `data-grow` 단계를 올리며 CSS 로 드러내는 것이다(`sections.css` — 깊이 n 노드·선은 grow ≥ n 일 때 보인다).
 * 펼침 집합으로 키우면 안 되는 이유 두 가지(사용자 판정 2차 2026-09-15): 부품 레이아웃이 보이는 부분트리 폭으로
 * 뿌리 x 를 정해 자라는 동안 뿌리가 왼쪽에서 가운데로 흘러가고, 뿌리를 접었다 펴면 카메라가 누른 노드로 가 아래 줄이
 * 상자 밖으로 나간다. 다 펼친 채 두면 부품의 첫 표시 전체 맞춤이 그대로 남아 뿌리는 처음부터 가운데고 카메라는 안 움직인다.
 *
 * 사람이 펼치기 원을 누르면 부품 대신 여기서 받는다(`onClickCapture`) — 그리고 **펼침 집합은 건드리지 않는다.**
 * 집합에서 빼면 부품이 레이아웃을 다시 계산해 트리 폭이 줄고 뿌리가 그 가운데로 옮겨 간다(사용자 판정 3차 2026-09-15:
 * 뿌리를 접자 뿌리가 왼쪽으로 갔다). 대신 접힌 노드 목록을 들고, 그 자손 노드·선에 `data-hidden` 을 붙여 CSS 로 숨긴다.
 * 레이아웃은 늘 최종 모양이라 아무것도 움직이지 않는다. 본체 클릭은 선택만(`select-only`).
 * 위치 고정 — 휠 줌·끌기 팬은 상자에서 끊어 페이지에 돌려준다. 조작 스택·테두리·버튼 기본 모양은 `sections.css` 가 지운다.
 *
 * 부품은 라벨 폭을 마운트 직후 한 번만 잰다 — 웹폰트보다 먼저 재면 대체 글꼴 폭이 굳는다. 그래서 라벨 글자 전부로
 * `document.fonts.load` 를 청해 받은 뒤 마운트한다(`fonts.status` 는 로딩 전에도 'loaded' 고, 글자 없이 청하면 공백
 * 서브셋만 온다 — 구글 폰트 KR 은 unicode-range 로 잘게 나뉜다). ⚠ 배율이 0.91↔0.84 로 달랐던 실측은 이게 아니라
 * 브라우저 뷰포트 폭(1280 vs 1000)이 원인이었다 — 배율은 상자 폭이 정한다.
 *
 * 노드 id 는 `d<깊이>-…` 로 시작한다 — 선 키가 `from→to` 라 CSS 가 `→d2-` 로 깊이를 고른다.
 */
const STEP_MS = 900; // 드러나는 전이 400ms + 다음 줄까지 숨 500ms(사용자 결정 2026-09-15)
const MAX_DEPTH = 3;
const ROOT_ID = 'd0-root';

type Stage = (typeof content.start.map.stages)[number];

function toTree(map: typeof content.start.map): MindmapNode {
  return {
    id: ROOT_ID,
    label: map.root,
    children: map.stages.map((s: Stage, i: number) => ({
      id: `d1-s${i + 1}`,
      label: s.label,
      children: s.children.map((c, j) => ({
        id: `d2-s${i + 1}-${j + 1}`,
        label: c.label,
        children: c.children?.map((leaf, k) => ({ id: `d3-s${i + 1}-${j + 1}-${k + 1}`, label: leaf })),
      })),
    })),
  };
}

function idsWithChildren(n: MindmapNode, out: string[] = []): string[] {
  if (n.children?.length) {
    out.push(n.id);
    n.children.forEach((c) => idsWithChildren(c, out));
  }
  return out;
}

/** `d3-s1-2-1` → 조상 `d2-s1-2`, `d1-s1`, `d0-root` — id 가 경로를 품고 있어 트리를 다시 걷지 않는다. */
function ancestorsOf(id: string): string[] {
  if (id === ROOT_ID) return []; // 뿌리는 조상이 없다 — 자기를 넣으면 뿌리를 접을 때 뿌리까지 숨는다(실측)
  const parts = id.slice(3).split('-'); // ['s1','2','1']
  const out: string[] = [];
  for (let d = parts.length - 1; d >= 1; d--) out.push(`d${d}-${parts.slice(0, d).join('-')}`);
  out.push(ROOT_ID);
  return out;
}

function labelsOf(n: MindmapNode): string {
  return n.label + (n.children ?? []).map(labelsOf).join('');
}

export function StartMap() {
  const host = useRef<HTMLDivElement>(null);
  const tree = useMemo(() => toTree(content.start.map), []);
  const expanded = useMemo(() => idsWithChildren(tree), [tree]); // 항상 다 펼친 채 — 레이아웃 고정
  const [grow, setGrow] = useState(() => (prefersReducedMotion() ? MAX_DEPTH : 0));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [fontsReady, setFontsReady] = useState(() => typeof document === 'undefined' || !document.fonts);

  useEffect(() => {
    if (fontsReady) return;
    let alive = true;
    // `fonts.status` 는 로딩을 시작하기 전에도 'loaded' 라 못 믿는다 — 라벨 글꼴을 직접 청해 기다린다.
    // ⚠ 글자를 안 주면 공백만 덮는 서브셋만 받는다(구글 폰트 KR 은 unicode-range 로 잘게 나뉜다) — 라벨 글자 전부를 준다.
    Promise.all([document.fonts.load('500 14px "Noto Sans KR"', labelsOf(tree)), document.fonts.ready]).finally(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, [fontsReady, tree]);

  useEffect(() => {
    const el = host.current;
    if (!el || !fontsReady) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; // 좁은 폭의 가로 스크롤 — 넓은 폭에서는 0
    if (prefersReducedMotion()) return;
    let timer: number | undefined;
    const step = () => {
      setGrow((g) => Math.min(g + 1, MAX_DEPTH));
      timer = window.setTimeout(step, STEP_MS);
    };
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        timer = window.setTimeout(step, 400);
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [fontsReady]);

  // 접힘 반영 — 부품 DOM 에 표식만 붙인다(부품은 자기가 준 prop 만 관리하므로 남는다). 숨김·전이는 sections.css.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const hidden = (id: string) => ancestorsOf(id).some((a) => collapsed.includes(a));
    for (const n of el.querySelectorAll<HTMLElement>('[data-mindmap-node]')) n.parentElement?.toggleAttribute('data-hidden', hidden(n.dataset.mindmapNode!));
    for (const e of el.querySelectorAll<SVGElement>('[data-mindmap-edge]')) e.toggleAttribute('data-hidden', hidden(e.getAttribute('data-mindmap-edge')!.split('→')[1]));
    for (const b of el.querySelectorAll<HTMLElement>('[data-mindmap-affordance]')) b.toggleAttribute('data-collapsed', collapsed.includes(b.dataset.mindmapAffordance!));
  }, [collapsed, fontsReady, grow]);

  return (
    <div
      ref={host}
      className="start__map"
      /* 제목보다 먼저 나타나면 순서가 뒤집힌다 — 제목 뒤에 뜨도록 같은 진입 연출에 태운다(2026-09-15) */
      data-reveal
      style={{ '--reveal-y': '30px', '--reveal-delay': '0.35s' } as React.CSSProperties}
      data-grow={grow}
      onWheelCapture={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => {
        // 여백 끌기 = 부품의 팬. 노드·버튼이 아니면 부품에 닿기 전에 끊는다.
        if (!(e.target as HTMLElement).closest('[data-mindmap-node],button')) e.stopPropagation();
      }}
      onClickCapture={(e) => {
        // 펼치기 원 — 부품의 토글(레이아웃·카메라 이동) 대신 접힌 목록만 바꾼다.
        const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-mindmap-affordance]');
        if (!btn) return;
        e.stopPropagation();
        const id = btn.dataset.mindmapAffordance!;
        setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      }}
    >
      {fontsReady && (
        <MindmapSpineTree
          layout="roadmap"
          root={tree}
          expandedIds={expanded}
          clickBehavior="select-only"
          onDownload={false}
          aria-label="로드맵 예시"
        />
      )}
    </div>
  );
}
