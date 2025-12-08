// svg.js
// SVG connection lines between parent and child threads

import { threads } from "./state.js";

const SVG_NS = "http://www.w3.org/2000/svg";

let containerEl = null;
let svgEl = null;

export function initSvg(container) {
  containerEl = container;
  ensureSvg();
}

function ensureSvg() {
  if (!containerEl) return;

  let svg = containerEl.querySelector("#connection-layer");
  if (!svg) {
    svg = document.createElementNS(SVG_NS, "svg");
    svg.id = "connection-layer";
    svg.style.position = "absolute";
    svg.style.inset = "0";
    svg.style.pointerEvents = "none";
    svgEl = svg;
    containerEl.prepend(svg);
  } else {
    svgEl = svg;
  }

  // Match SVG coordinate space to the scrollable area of the container
  svgEl.setAttribute("width", containerEl.scrollWidth);
  svgEl.setAttribute("height", containerEl.scrollHeight);
  svgEl.style.width = containerEl.scrollWidth + "px";
  svgEl.style.height = containerEl.scrollHeight + "px";
}

export function redrawConnections() {
  if (!containerEl) return;
  ensureSvg();
  if (!svgEl) return;

  // Clear any existing paths
  svgEl.innerHTML = "";

  const containerRect = containerEl.getBoundingClientRect();
  const scrollLeft = containerEl.scrollLeft;
  const scrollTop = containerEl.scrollTop;

  for (const thread of threads) {
    if (!thread.parentId) continue;

    const parentEl = containerEl.querySelector(
      `.thread[data-thread-id="${thread.parentId}"]`
    );
    const childEl = containerEl.querySelector(
      `.thread[data-thread-id="${thread.id}"]`
    );

    if (!parentEl || !childEl) continue;

    // --- START ANCHOR (parent → highlight span if present) ---
    const anchorHighlight = parentEl.querySelector(
      `.branch-highlight[data-target-thread-id="${thread.id}"]`
    );

    let x1, y1;
    if (anchorHighlight) {
      const hr = anchorHighlight.getBoundingClientRect();
      // Right edge, vertically centered on the highlighted phrase
      x1 = hr.right - containerRect.left + scrollLeft;
      y1 = hr.top + hr.height / 2 - containerRect.top + scrollTop;
    } else {
      // Fallback: center-right of the parent card
      const pr = parentEl.getBoundingClientRect();
      x1 = pr.right - containerRect.left + scrollLeft;
      y1 = pr.top + pr.height / 2 - containerRect.top + scrollTop;
    }

    // --- END ANCHOR (child → header center) ---
    const headerEl = childEl.querySelector(".thread-header") || childEl;
    const cr = headerEl.getBoundingClientRect();
    const x2 = cr.left - containerRect.left + scrollLeft;
    const y2 = cr.top + cr.height / 2 - containerRect.top + scrollTop;

    // Control points for a smooth cubic Bézier
    const dx = (x2 - x1) * 0.5;

    const path = document.createElementNS(SVG_NS, "path");
    const d = `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
    path.setAttribute("d", d);
    path.setAttribute("class", "thread-connection");
    svgEl.appendChild(path);
  }
}
