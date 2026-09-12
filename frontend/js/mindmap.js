/* === 로드맵 마인드맵 — mindmap-spine-tree roadmap 모드 === */

const LEVEL_PITCH = 92;
const NODE_H = 36;
const TOGGLE_R = 24;
const SIBLING_GAP = 24;
const NODE_PAD_X = 14;
const MIN_NODE_W = 120;

function measure(label, font) {
  const el = document.createElement('span');
  el.style.cssText = 'position:absolute;visibility:hidden;font:' + font + ';white-space:nowrap;';
  el.textContent = label;
  document.body.appendChild(el);
  const w = el.getBoundingClientRect().width;
  document.body.removeChild(el);
  return Math.max(MIN_NODE_W, w + NODE_PAD_X * 2);
}

// stages + stageStatus + stageChildren 을 받아 트리 구축
function buildTree(stages, stageStatus, stageChildren) {
  return stages.map((s) => {
    const idx = s.no - 1;
    const status = (stageStatus && stageStatus[idx]) || 'pending';
    const children = (stageChildren && stageChildren[idx]) || null;
    return {
      id: 'stage-' + s.no,
      label: s.title || '',
      nodeType: 'l0',
      stageIdx: idx,
      status,
      open: true,
      _w: 0,
      children: buildStageChildren(children),
    };
  });
}

function buildStageChildren(data) {
  if (!data) return [];
  const out = [];
  let order = 0;
  if (data.findings && data.findings.length) {
    data.findings.forEach((f) => {
      out.push({
        id: 's-' + (data._stageNo || 0) + '-finding-' + order,
        label: (f.name || '').slice(0, 40),
        nodeType: 'finding',
        open: null,
        _w: 0,
        children: [],
        _meta: f,
      });
      order++;
    });
  }
  if (data.choices && data.choices.length) {
    data.choices.forEach((c) => {
      out.push({
        id: 's-' + (data._stageNo || 0) + '-choice-' + order,
        label: c,
        nodeType: 'choice',
        open: null,
        _w: 0,
        children: [],
      });
      order++;
    });
  }
  if (data.todos && data.todos.length) {
    data.todos.forEach((t) => {
      out.push({
        id: 's-' + (data._stageNo || 0) + '-todo-' + order,
        label: t.task || '',
        nodeType: 'todo',
        open: null,
        _w: 0,
        children: [],
        _meta: t,
      });
      order++;
    });
  }
  return out;
}

function subWidth(n) {
  if (!n.open) return n._w;
  if (!n.children || !n.children.length) return n._w;
  const kids = n.children.filter((c) => c.open);
  if (!kids.length) return n._w;
  let kidsW = 0;
  for (const c of kids) kidsW += subWidth(c);
  return Math.max(n._w, kidsW + SIBLING_GAP * (kids.length - 1));
}

function layout(nodes) {
  let cursor = 0;
  for (const l0 of nodes) {
    const kids = (l0.children || []).filter((c) => c.open);
    const sw = subWidth(l0);
    const kidsW = kids.reduce((s, c) => s + c._w, 0);
    const firstLeft = cursor + (sw - kidsW) / 2;
    if (kids.length) {
      let x = firstLeft;
      for (const c of kids) {
        c._x = x;
        c._y = LEVEL_PITCH;
        c._cx = x + c._w / 2;
        x += c._w + SIBLING_GAP;
      }
      l0._cx = (kids[0]._cx + kids[kids.length - 1]._cx) / 2;
    } else {
      l0._cx = cursor + sw / 2;
    }
    l0._x = cursor;
    l0._y = 0;
    cursor += sw + SIBLING_GAP;
  }
  return cursor;
}

function statusClass(n) {
  if (!n.nodeType || n.nodeType === 'l0') {
    if (n.status === 'searching') return 'searching';
    if (n.status === 'done') return 'done';
    if (n.status === 'error') return 'error';
  }
  return '';
}

function renderMindmap(container, stages, stageStatus, stageChildren, onNodeSelect, onNodeDoubleClick) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mindmap-wrap';
  const canvas = document.createElement('div');
  canvas.className = 'mindmap-canvas';
  const inner = document.createElement('div');
  inner.className = 'mindmap-inner';
  canvas.appendChild(inner);
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  // 조작 컨트롤 (우하단)
  const controls = document.createElement('div');
  controls.className = 'mindmap-controls';
  const zoomInBtn = document.createElement('button');
  zoomInBtn.type = 'button';
  zoomInBtn.className = 'btn btn.sm';
  zoomInBtn.textContent = '+';
  zoomInBtn.title = '확대';
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.type = 'button';
  zoomOutBtn.className = 'btn btn.sm';
  zoomOutBtn.textContent = '\u2212';
  zoomOutBtn.title = '축소';
  const fitBtn = document.createElement('button');
  fitBtn.type = 'button';
  fitBtn.className = 'btn btn.sm';
  fitBtn.textContent = '\u25CE';
  fitBtn.title = '전체 맞춤';
  controls.appendChild(zoomInBtn);
  controls.appendChild(zoomOutBtn);
  controls.appendChild(fitBtn);
  wrap.appendChild(controls);

  const roots = buildTree(stages, stageStatus, stageChildren);
  const flat = [];
  function walk(list) {
    for (const n of list) {
      const font = n.nodeType === 'l0' ? '600 13.5px "Noto Sans KR", sans-serif' : '400 13.5px "Noto Sans KR", sans-serif';
      n._w = measure(n.label, font);
      flat.push(n);
      walk(n.children || []);
    }
  }
  walk(roots);

  // ---- 조작 상태 ----
  let zoom = 1, panX = 0, panY = 0;
  let dragging = false, dragStartX = 0, dragStartY = 0, dragPanX = 0, dragPanY = 0;

  function applyTransform() {
    inner.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
  }

  function fitToView() {
    const totalW = layout(roots);
    const totalH = Math.max(240, (roots.length ? LEVEL_PITCH * 2 + 60 : 360));
    const vw = canvas.clientWidth - 48;
    const vh = canvas.clientHeight - 48;
    if (vw <= 0 || vh <= 0) return;
    let z = Math.min(vw / totalW, vh / totalH, 1);
    if (z < 0.3) z = 0.3;
    zoom = z;
    panX = Math.max(0, (vw - totalW * zoom) / 2) + 24;
    panY = Math.max(0, (vh - totalH * zoom) / 2) + 8;
    applyTransform();
  }

  // 휠 줌 (커서 기준, 연속)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const padL = 24;
    const mx = e.clientX - rect.left - padL;
    const my = e.clientY - rect.top;
    const treeX = (mx - panX) / zoom;
    const treeY = (my - panY) / zoom;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    let z = zoom * factor;
    if (z < 0.3) z = 0.3;
    if (z > 3) z = 3;
    zoom = z;
    panX = mx - treeX * zoom;
    panY = my - treeY * zoom;
    applyTransform();
  }, { passive: false });

  // 드래그 팬
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.mindmap-node') || e.target.closest('.mindmap-toggle') || e.target.closest('.mindmap-controls')) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanX = panX;
    dragPanY = panY;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panX = dragPanX + (e.clientX - dragStartX);
    panY = dragPanY + (e.clientY - dragStartY);
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      canvas.style.cursor = '';
    }
  });

  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const treeX = (cx - panX) / zoom;
    const treeY = (cy - panY) / zoom;
    zoom = Math.min(3, zoom * 1.4);
    panX = cx - treeX * zoom;
    panY = cy - treeY * zoom;
    applyTransform();
  });
  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const treeX = (cx - panX) / zoom;
    const treeY = (cy - panY) / zoom;
    zoom = Math.max(0.3, zoom / 1.4);
    panX = cx - treeX * zoom;
    panY = cy - treeY * zoom;
    applyTransform();
  });
  fitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fitToView();
  });

  function render(selectedId) {
    inner.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'mindmap-svg');
    inner.appendChild(svg);

    layout(roots);

    const l0s = flat.filter((n) => n.nodeType === 'l0');
    for (let i = 0; i < l0s.length - 1; i++) {
      const a = l0s[i], b = l0s[i + 1];
      const x1 = a._x + a._w;
      const y1 = a._y + NODE_H / 2;
      const x2 = b._x;
      const y2 = b._y + NODE_H / 2;
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('class', 'spine');
      p.setAttribute('d', 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2);
      svg.appendChild(p);
    }
    for (const l0 of l0s) {
      const gx = l0._x + l0._w / 2;
      const gy = l0._y + NODE_H + TOGGLE_R;
      for (const c of l0.children) {
        if (!c.open) continue;
        const x1 = gx, y1 = gy;
        const x2 = c._cx;
        const y2 = c._y;
        const midY = y1 + (y2 - y1) / 2;
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('class', 'branch');
        p.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2);
        svg.appendChild(p);
      }
    }

    for (const n of flat) {
      const el = document.createElement('div');
      const cls = 'mindmap-node ' + (n.nodeType === 'l0' ? 'l0' : 'l1') + ' ' + statusClass(n);
      el.className = cls;
      el.style.left = n._x + 'px';
      el.style.top = n._y + 'px';
      el.style.width = n._w + 'px';
      el.tabIndex = 0;
      const label = document.createElement('span');
      label.textContent = n.label;
      el.appendChild(label);

      const hasAnyChild = n.children && n.children.length > 0;
      if (n.nodeType === 'l0' && hasAnyChild) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'mindmap-toggle';
        toggle.setAttribute('aria-expanded', n.open ? 'true' : 'false');
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          n.open = !n.open;
          render(selectedId);
        });
        el.appendChild(toggle);
      }

      // 클릭
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (n.nodeType === 'l0' && hasAnyChild) {
          n.open = !n.open;
        }
        el.classList.toggle('selected');
        if (onNodeSelect) onNodeSelect(n);
      });

      // 더블클릭 — 목록 해당 카드로 이동
      if (onNodeDoubleClick) {
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          e.preventDefault();
          onNodeDoubleClick(n);
        });
      } else if (onNodeSelect) {
        // fallback: 싱글클릭을 더블클릭 핸들러로 재사용 (호환성)
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          e.preventDefault();
          onNodeSelect(n);
        });
      }

      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
      inner.appendChild(el);
    }

    const totalW = layout(roots);
    inner.style.width = (totalW + 48) + 'px';
    canvas.style.width = (totalW + 48) + 'px';
  }

  let selectedId = null;
  render(selectedId);

  function updateStage(stageIdx, status, children) {
    const root = roots[stageIdx];
    if (!root) return;
    root.status = status;
    root.children = buildStageChildren(children);
    root.children.forEach((c) => {
      c._w = measure(c.label, '400 13.5px "Noto Sans KR", sans-serif');
    });
    render(selectedId);
  }

  return {
    render,
    updateStage,
    setOnNodeSelect: (cb) => { onNodeSelect = cb; },
    setOnNodeDoubleClick: (cb) => { onNodeDoubleClick = cb; },
  };
}

function renderRoadmapMindmap(containerId, stages, stageStatus, stageChildren, onSelect, onDoubleClick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const inst = renderMindmap(container, stages, stageStatus || {}, stageChildren || {}, onSelect, onDoubleClick);
  inst.setOnNodeSelect(onSelect);
  inst.setOnNodeDoubleClick(onDoubleClick);
  return inst;
}

export { renderRoadmapMindmap, buildTree };
