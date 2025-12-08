// layout.js
// Absolute-position layout engine (columns by depth)

import { threads, getThread } from "./state.js";

export let THREAD_WIDTH = 340;

const COLUMN_GAP = 20;
const MIN_VERTICAL_GAP = 14;
const ROOT_GAP = 40;
const TOP_MARGIN = 40;

let containerEl = null;

export function initLayout(container) {
  containerEl = container;
}

export function setThreadWidth(px) {
  THREAD_WIDTH = px;
}

// where column starts
export function getColumnLeft(depth) {
  return depth * (THREAD_WIDTH + COLUMN_GAP);
}

export function getTopMargin() {
  return TOP_MARGIN;
}

// main layout recompute
export function recomputeLayout({ centerParents = false } = {}) {
  if (!containerEl) return;
  if (!threads.length) return;

  // measure heights
  const heights = {};
  threads.forEach((t) => {
    const el = containerEl.querySelector(`.thread[data-thread-id="${t.id}"]`);
    heights[t.id] = el ? el.offsetHeight || 200 : 200;
  });

  // ---- Step 1: roots preferred positions
  const roots = threads
    .filter((t) => t.depth === 0)
    .sort((a, b) => a.createdAt - b.createdAt);

  let currentRootY = TOP_MARGIN;
  for (const r of roots) {
    if (r.prefY == null) {
      r.prefY = currentRootY;
      r.y = currentRootY;
    }
    currentRootY = (r.prefY ?? TOP_MARGIN) + (heights[r.id] || 200) + ROOT_GAP;
  }

  // ---- Step 2: children prefY from parents (unless manual)
  const maxDepth = Math.max(...threads.map((t) => t.depth));
  for (let d = 1; d <= maxDepth; d++) {
    const lane = threads.filter((t) => t.depth === d);
    for (const t of lane) {
      if (t.manual) continue;
      const parent = getThread(t.parentId);
      if (!parent) continue;
      const parentY = parent.y ?? parent.prefY ?? TOP_MARGIN;
      const parentH = heights[parent.id] || 200;
      const frac =
        t.branchSource && typeof t.branchSource.anchorFrac === "number"
          ? t.branchSource.anchorFrac
          : 0.5;
      const center = parentY + frac * parentH;
      const h = heights[t.id] || 200;
      t.prefY = center - h / 2;
    }
  }

  // ---- Step 3: pack each depth column
  const depths = Array.from(new Set(threads.map((t) => t.depth))).sort(
    (a, b) => a - b
  );

  for (const depth of depths) {
    const lane = threads.filter((t) => t.depth === depth);

    const sorted = lane.slice().sort((a, b) => {
      function key(t) {
        const parent = getThread(t.parentId);
        const parentY = parent ? parent.y ?? parent.prefY ?? 0 : t.prefY ?? 0;
        const frac =
          t.branchSource && typeof t.branchSource.anchorFrac === "number"
            ? t.branchSource.anchorFrac
            : 0.5;
        return { parentY, frac, createdAt: t.createdAt };
      }

      const ka = key(a);
      const kb = key(b);
      if (ka.parentY !== kb.parentY) return ka.parentY - kb.parentY;
      if (ka.frac !== kb.frac) return ka.frac - kb.frac;
      return ka.createdAt - kb.createdAt;
    });

    let prevBottom = -Infinity;
    for (const t of sorted) {
      const h = heights[t.id] || 200;
      let cand = t.prefY ?? TOP_MARGIN;
      if (cand < prevBottom + MIN_VERTICAL_GAP) {
        cand = prevBottom + MIN_VERTICAL_GAP;
      }
      t.y = cand;
      prevBottom = cand + h;

      const el = containerEl.querySelector(`.thread[data-thread-id="${t.id}"]`);
      if (el) {
        el.style.top = `${cand}px`;
        el.style.left = `${getColumnLeft(t.depth)}px`;
        el.style.width = THREAD_WIDTH + "px";
      }
    }
  }

  // ---- Step 4: center parents over child clusters if requested
  if (centerParents) {
    const childrenByParent = new Map();

    threads.forEach((child) => {
      if (!child.parentId) return;
      const pId = child.parentId;
      const h = heights[child.id] || 200;
      const top = child.y ?? child.prefY ?? TOP_MARGIN;
      const bottom = top + h;
      const existing = childrenByParent.get(pId);
      if (!existing) {
        childrenByParent.set(pId, { top, bottom });
      } else {
        existing.top = Math.min(existing.top, top);
        existing.bottom = Math.max(existing.bottom, bottom);
      }
    });

    childrenByParent.forEach((cluster, parentId) => {
      const parent = getThread(parentId);
      if (!parent || parent.manual) return;
      const h = heights[parent.id] || 200;
      const center = (cluster.top + cluster.bottom) / 2;
      parent.prefY = center - h / 2;
    });

    // re-pack columns once with updated parent prefY
    for (const depth of depths) {
      const lane = threads.filter((t) => t.depth === depth);
      const sorted = lane.slice().sort((a, b) => {
        function key(t) {
          const parent = getThread(t.parentId);
          const parentY = parent ? parent.y ?? parent.prefY ?? 0 : t.prefY ?? 0;
          const frac =
            t.branchSource && typeof t.branchSource.anchorFrac === "number"
              ? t.branchSource.anchorFrac
              : 0.5;
          return { parentY, frac, createdAt: t.createdAt };
        }

        const ka = key(a);
        const kb = key(b);
        if (ka.parentY !== kb.parentY) return ka.parentY - kb.parentY;
        if (ka.frac !== kb.frac) return ka.frac - kb.frac;
        return ka.createdAt - kb.createdAt;
      });

      let prevBottom = -Infinity;
      for (const t of sorted) {
        const h = heights[t.id] || 200;
        let cand = t.prefY ?? TOP_MARGIN;
        if (cand < prevBottom + MIN_VERTICAL_GAP) {
          cand = prevBottom + MIN_VERTICAL_GAP;
        }
        t.y = cand;
        prevBottom = cand + h;

        const el = containerEl.querySelector(`.thread[data-thread-id="${t.id}"]`);
        if (el) {
          el.style.top = `${cand}px`;
          el.style.left = `${getColumnLeft(t.depth)}px`;
          el.style.width = THREAD_WIDTH + "px";
        }
      }
    }
  }

  // ---- Step 5: normalize global Y so the topmost is at TOP_MARGIN
  let minY = Infinity;
  threads.forEach((t) => {
    if (typeof t.y === "number" && t.y < minY) minY = t.y;
  });

  if (minY !== Infinity && minY !== TOP_MARGIN) {
    const shift = TOP_MARGIN - minY;
    threads.forEach((t) => {
      t.y += shift;
      if (typeof t.prefY === "number") t.prefY += shift;
      const el = containerEl.querySelector(`.thread[data-thread-id="${t.id}"]`);
      if (el) el.style.top = `${t.y}px`;
    });
  }
}

// used by drag logic
export function updateThreadManualPosition(threadId, newTop) {
  const t = getThread(threadId);
  if (!t) return;
  t.manual = true;
  t.prefY = newTop;
  t.y = newTop;
}
