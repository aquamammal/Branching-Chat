// ui.js
// Rendering, selection/branching, drag, backend calls, markdown

import {
  threads,
  getThread,
  createRootThread,
  createThread,
  addUserMessage,
  addAssistantMessage,
  addThinkingMessage,
  addHighlight,
  setActiveThreadId,
  getActiveThreadId,
  consumePendingFocusThreadId,
  ensureActiveThread,
  DEFAULT_MODEL_SPEC,
  setThreadModel,
} from "./state.js";

import {
  initLayout,
  recomputeLayout,
  getColumnLeft,
  setThreadWidth,
  updateThreadManualPosition,
} from "./layout.js";

import { initSvg, redrawConnections } from "./svg.js";

// DOM refs (will be filled in setupUI)
let containerEl;
let selectionBranchBtn;
let newRootBtn;
let refreshBtn;
let widthSlider;

let dragState = null;

// Available models (edit this list as you like)
const MODEL_OPTIONS = [
  // Local Ollama models from your screenshot
  { value: "ollama/qwen2.5:7b", label: "Qwen2.5 7B (local)" },
  { value: "ollama/qwen2.5:latest", label: "Qwen2.5 (latest, local)" },
  { value: "ollama/qwen2.5:14b", label: "Qwen2.5 14B (local)" },
  { value: "ollama/qwen3:14b", label: "Qwen3 14B (local)" },
  { value: "ollama/qwen3:30b", label: "Qwen3 30B (local)" },
  { value: "ollama/llama3.1:latest", label: "Llama 3.1 (local)" },
  { value: "ollama/dolphin-mistral:latest", label: "Dolphin Mistral (local)" },
  { value: "ollama/dolphin-mixtral:latest", label: "Dolphin Mixtral (local)" },
  { value: "ollama/dolphin-llama3:latest", label: "Dolphin Llama3 (local)" },
  { value: "ollama/dolphin-llama3:70b", label: "Dolphin Llama3 70B (local)" },
  { value: "ollama/dolphin-llama3:70b-v2.9-q4_K_M", label: "Dolphin Llama3 70B v2.9 Q4_K_M (local)" },
  { value: "ollama/dolphin70:latest", label: "Dolphin 70B (local)" },
  { value: "ollama/mistral-small:24b-instruct-2501-q4_K_M", label: "Mistral Small 24B Instruct Q4_K_M (local)" },
  { value: "ollama/mixtral:8x7b", label: "Mixtral 8x7B (local)" },
  { value: "ollama/wizardlm-uncensored:latest", label: "WizardLM Uncensored (local)" },
  { value: "ollama/wizard-vicuna-uncensored:latest", label: "Wizard Vicuna Uncensored (local)" },
  { value: "ollama/llama2-uncensored:latest", label: "Llama2 Uncensored (local)" },

  // Cloud: OpenAI & DeepSeek
  { value: "openai/gpt-4.1-mini", label: "GPT-4.1-mini (OpenAI)" },
  { value: "openai/gpt-4.1", label: "GPT-4.1 (OpenAI)" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat (cloud)" },
];

// ---------- Public entry ----------
export function setupUI() {
  containerEl = document.getElementById("thread-container");
  selectionBranchBtn = document.getElementById("selection-branch-btn");
  newRootBtn = document.getElementById("new-root-btn");
  refreshBtn = document.getElementById("refresh-layout-btn");
  widthSlider = document.getElementById("width-slider");

  initLayout(containerEl);
  initSvg(containerEl);

  wireHeader();
  wireSelectionHandling();
}

export function renderAll() {
  ensureActiveThread();

  const prevScrollTop = containerEl.scrollTop;
  const prevScrollLeft = containerEl.scrollLeft;

  // clear threads but keep SVG (will be redrawn)
  const keepSvg = containerEl.querySelector("#connection-layer");
  containerEl.innerHTML = "";
  if (keepSvg) containerEl.appendChild(keepSvg);

  threads.forEach((thread) => {
    const el = buildThreadElement(thread);
    containerEl.appendChild(el);
  });

  // layout + SVG after DOM ready
  requestAnimationFrame(() => {
    recomputeLayout({ centerParents: false });
    redrawConnections();

    containerEl.scrollTop = prevScrollTop;
    containerEl.scrollLeft = prevScrollLeft;

    const focusId = consumePendingFocusThreadId();
    if (focusId) focusInputForThread(focusId);
  });
}

// ---------- Header wiring ----------

function wireHeader() {
  newRootBtn.onclick = () => {
    createRootThread();
    renderAll();
    scrollToRight();
  };

  refreshBtn.onclick = () => {
    requestAnimationFrame(() => {
      recomputeLayout({ centerParents: true });
      redrawConnections();
    });
  };

  widthSlider.addEventListener("input", () => {
    const v = parseInt(widthSlider.value, 10) || 340;
    setThreadWidth(v);
    document.querySelectorAll(".thread").forEach((el) => {
      el.style.width = v + "px";
    });
    renderAll();
  });
}

// ---------- Build thread & messages ----------

function buildThreadElement(thread) {
  const threadEl = document.createElement("div");
  threadEl.className = "thread";
  threadEl.dataset.threadId = thread.id;

  const left = getColumnLeft(thread.depth);
  const top = thread.y ?? thread.prefY ?? 40;
  threadEl.style.left = `${left}px`;
  threadEl.style.top = `${top}px`;

  if (thread.id === getActiveThreadId()) {
    threadEl.classList.add("active");
  }

  threadEl.addEventListener("click", (e) => {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.toString().trim()) return;
    if (e.target.closest("input") || e.target.closest("button") || e.target.closest("select")) return;
    setActiveThreadId(thread.id);
    renderAll();
  });

  // header
  const headerEl = document.createElement("div");
  headerEl.className = "thread-header";

  const titleSpan = document.createElement("span");
  titleSpan.className = "thread-title";
  titleSpan.textContent = thread.title || thread.id;

  const metaSpan = document.createElement("span");
  metaSpan.className = "thread-meta";
  metaSpan.textContent = thread.depth === 0 ? "Root" : `Depth ${thread.depth}`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "thread-close-btn";
  closeBtn.textContent = "×";
  closeBtn.title = "Close this node and its branches";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeThreadCascade(thread.id);
  });

  headerEl.appendChild(titleSpan);
  headerEl.appendChild(metaSpan);
  headerEl.appendChild(closeBtn);
  headerEl.addEventListener("mousedown", (e) =>
    startDrag(thread, headerEl, e)
  );

  threadEl.appendChild(headerEl);

  // body
  const bodyEl = document.createElement("div");
  bodyEl.className = "thread-body";

  for (const msg of thread.messages) {
    const msgEl = document.createElement("div");
    msgEl.className = "msg " + msg.role;
    msgEl.dataset.messageId = msg.id;

    const metaEl = document.createElement("div");
    metaEl.className = "msg-meta";
    const roleSpan = document.createElement("span");
    roleSpan.className = "msg-role";
    roleSpan.textContent = msg.role;
    metaEl.appendChild(roleSpan);
    msgEl.appendChild(metaEl);

    const textEl = document.createElement("div");
    textEl.className = "msg-text";
    renderMessageText(msg, textEl);

    msgEl.appendChild(textEl);
    bodyEl.appendChild(msgEl);
  }

  threadEl.appendChild(bodyEl);

  // footer
  const footerEl = document.createElement("div");
  footerEl.className = "thread-footer";

  // model select (per-thread)
  const modelSelect = document.createElement("select");
  modelSelect.className = "model-select";

  MODEL_OPTIONS.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    modelSelect.appendChild(o);
  });

  const initialModel =
    thread.modelSpec ||
    DEFAULT_MODEL_SPEC ||
    (MODEL_OPTIONS[0] && MODEL_OPTIONS[0].value);

  if (!thread.modelSpec) {
    setThreadModel(thread.id, initialModel);
  }

  modelSelect.value = initialModel;
  modelSelect.addEventListener("change", (e) => {
    setThreadModel(thread.id, e.target.value);
  });

  const inputEl = document.createElement("input");
  inputEl.type = "text";
  inputEl.placeholder = `Type in ${thread.id}…`;

  inputEl.addEventListener("focus", () => {
    if (getActiveThreadId() === thread.id) return;
    setActiveThreadId(thread.id);
    renderAll();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const text = inputEl.value;
      inputEl.value = "";
      handleUserSend(thread.id, text);
    }
  });

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send";
  sendBtn.onclick = () => {
    const text = inputEl.value;
    inputEl.value = "";
    handleUserSend(thread.id, text);
  };

  footerEl.appendChild(modelSelect);
  footerEl.appendChild(inputEl);
  footerEl.appendChild(sendBtn);
  threadEl.appendChild(footerEl);

  return threadEl;
}

// ---------- Message rendering (markdown + highlights) ----------

function renderMessageText(msg, container) {
  // Base text used when there are no highlights or no full content
  const baseText = msg.visibleSnippet
    ? `Branch context: "${msg.visibleSnippet}"`
    : msg.content || "";

  const hasHighlights = msg.highlights && msg.highlights.length > 0;

  // No highlights → just render markdown / plain text like a normal ChatGPT message
  if (!hasHighlights) {
    if (typeof marked !== "undefined") {
      container.innerHTML = marked.parse(baseText);
    } else {
      container.textContent = baseText;
    }
    return;
  }

  // When highlights exist, we still want full markdown rendering (so code blocks,
  // lists, etc. keep their formatting). Then we walk the DOM and wrap the first
  // occurrence of each highlight text in a <span class="branch-highlight">.
  const text = msg.content || baseText;

  if (typeof marked !== "undefined") {
    container.innerHTML = marked.parse(text);
  } else {
    container.textContent = text;
  }

  const highlights = msg.highlights.slice();

  for (const h of highlights) {
    if (!h.text) continue;

    const target = h.text;

    // TreeWalker over text nodes to find the first occurrence of the highlight text
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    let foundNode = null;
    let foundIndex = -1;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.nodeValue.indexOf(target);
      if (idx !== -1) {
        foundNode = node;
        foundIndex = idx;
        break;
      }
    }

    if (!foundNode || foundIndex === -1) {
      // If we can't find it (e.g., spans multiple tags), we just skip;
      // SVG will fall back to the parent card center.
      continue;
    }

    const range = document.createRange();
    range.setStart(foundNode, foundIndex);
    range.setEnd(foundNode, foundIndex + target.length);

    const span = document.createElement("span");
    span.className = "branch-highlight";
    span.dataset.highlightId = h.id;
    span.dataset.targetThreadId = h.targetThreadId;
    span.onclick = (ev) => {
      ev.stopPropagation();
      setActiveThreadId(h.targetThreadId);
      renderAll();
    };

    try {
      range.surroundContents(span);
    } catch (err) {
      // If surroundContents fails for some reason, just ignore this highlight.
      console.warn("Failed to highlight selection", err);
    }
  }
}



// ---------- Selection → branch ----------

function wireSelectionHandling() {
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      selectionBranchBtn.style.display = "none";
      return;
    }

    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const msgEl =
      node.nodeType === 1
        ? node.closest(".msg")
        : node.parentElement && node.parentElement.closest(".msg");

    if (!msgEl) {
      selectionBranchBtn.style.display = "none";
      return;
    }

    const threadEl = msgEl.closest(".thread");
    if (!threadEl) {
      selectionBranchBtn.style.display = "none";
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText.length) {
      selectionBranchBtn.style.display = "none";
      return;
    }

    const rect = range.getBoundingClientRect();
    selectionBranchBtn.style.display = "block";
    selectionBranchBtn.style.left =
      rect.left + rect.width / 2 - 60 + window.scrollX + "px";
    selectionBranchBtn.style.top = rect.top - 30 + window.scrollY + "px";

    selectionBranchBtn.dataset.threadId = threadEl.dataset.threadId;
    selectionBranchBtn.dataset.messageId = msgEl.dataset.messageId;
  });

  selectionBranchBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const threadId = selectionBranchBtn.dataset.threadId;
    const messageId = selectionBranchBtn.dataset.messageId;
    if (!threadId || !messageId) return;

    const msgEl = document.querySelector(
      `.thread[data-thread-id="${threadId}"] .msg[data-message-id="${messageId}"]`
    );
    if (!msgEl) return;

    branchFromMessage(threadId, messageId, msgEl);
    selectionBranchBtn.style.display = "none";

    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  });
}

function branchFromMessage(parentThreadId, messageId, msgElement) {
  const parentThread = getThread(parentThreadId);
  if (!parentThread) return;

  const msg = parentThread.messages.find((m) => m.id === messageId);
  if (!msg) return;

  const sel = window.getSelection && window.getSelection();
  const rawSel = sel ? sel.toString() : "";
  const trimmedSel = rawSel.trim();

  // anchorFrac based on selection vertical center inside thread
  let anchorFrac = 0.5;
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const highlightRect = range.getBoundingClientRect();
    const threadEl = msgElement.closest(".thread");
    if (threadEl) {
      const tr = threadEl.getBoundingClientRect();
      const parentHeight = tr.height || 1;
      const centerInsideParent =
        highlightRect.top + highlightRect.height / 2 - tr.top;
      anchorFrac = Math.min(
        1,
        Math.max(0, centerInsideParent / parentHeight)
      );
    }
  }

  const visibleSnippet = trimmedSel || (msg.content || "").slice(0, 120);
  const fullContext = buildContextSnippet(msg, trimmedSel);
  const newDepth = parentThread.depth + 1;

  const childThread = createThread({
    title: visibleSnippet || "Branch",
    depth: newDepth,
    parentId: parentThread.id,
    parentSnippet: fullContext,
    visibleSnippet,
    branchSource: {
      parentThreadId: parentThread.id,
      parentMessageId: msg.id,
      anchorFrac,
    },
    initialY: null,
    // children inherit their parent's model choice
    modelSpec: parentThread.modelSpec || DEFAULT_MODEL_SPEC,
  });

  addHighlight(parentThread.id, msg.id, visibleSnippet, childThread.id);

  setActiveThreadId(childThread.id);
  renderAll();
  scrollToRight();
}

function buildContextSnippet(msg, selectedText) {
  const full = msg.content || "";
  const s = selectedText || "";

  if (!s) return full.slice(0, 1000);

  const idx = full.indexOf(s);
  if (idx === -1) return full.slice(0, 1000);

  const before = full.lastIndexOf("\n\n", idx);
  const after = full.indexOf("\n\n", idx + s.length);
  const paraStart = before === -1 ? 0 : before + 2;
  const paraEnd = after === -1 ? full.length : after;
  const paragraph = full.slice(paraStart, paraEnd).trim();

  const rest = (full.slice(0, paraStart) + "\n" + full.slice(paraEnd)).trim();
  const restTrunc = rest.slice(0, 400);

  let snippet = "";
  snippet += `Paragraph context:\n"${paragraph}"\n\n`;
  snippet += `Focused selection:\n"${s}"\n\n`;
  if (restTrunc.length) {
    snippet += `Other context (truncated):\n"${restTrunc}"`;
  }
  return snippet;
}

// ---------- Dragging ----------

function startDrag(thread, headerEl, e) {
  if (e.button !== 0) return;
  if (e.target.closest(".thread-close-btn")) return;

  e.preventDefault();
  dragState = {
    threadId: thread.id,
    startY: e.clientY,
    originalTop: thread.y ?? thread.prefY ?? 40,
  };
  headerEl.classList.add("dragging");

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
}

function onDragMove(e) {
  if (!dragState) return;
  const dy = e.clientY - dragState.startY;
  const newTop = dragState.originalTop + dy;

  updateThreadManualPosition(dragState.threadId, newTop);

  const el = containerEl.querySelector(
    `.thread[data-thread-id="${dragState.threadId}"]`
  );
  if (el) el.style.top = `${newTop}px`;

  redrawConnections();
}

function onDragEnd() {
  if (!dragState) return;
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);

  dragState = null;

  recomputeLayout({ centerParents: false });
  redrawConnections();
}

// ---------- Backend interaction ----------

async function handleUserSend(threadId, text) {
  const msg = addUserMessage(threadId, text);
  if (!msg) return;
  renderAll();
  keepThreadScrolledToBottom(threadId);

  const thinking = addThinkingMessage(threadId);
  renderAll();
  keepThreadScrolledToBottom(threadId);

  try {
    const thread = getThread(threadId);
    const payloadMessages = thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const modelSpec = thread.modelSpec || DEFAULT_MODEL_SPEC;

    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: threadId,
        messages: payloadMessages,
        model: modelSpec,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      thinking.content = "Error: " + txt;
    } else {
      const data = await resp.json();
      thinking.content = data.reply ?? "(no reply)";
    }
  } catch (err) {
    thinking.content = "Error: " + err;
  }

  renderAll();
  keepThreadScrolledToBottom(threadId);
}

// ---------- Utility ----------

function keepThreadScrolledToBottom(threadId) {
  const el = containerEl.querySelector(
    `.thread[data-thread-id="${threadId}"] .thread-body`
  );
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function focusInputForThread(threadId) {
  const inputEl = containerEl.querySelector(
    `.thread[data-thread-id="${threadId}"] input[type="text"]`
  );
  if (!inputEl) return;
  try {
    inputEl.focus({ preventScroll: true });
  } catch {
    inputEl.focus();
  }
  const v = inputEl.value;
  inputEl.value = "";
  inputEl.value = v;
}

// Close a thread and all descendants
function closeThreadCascade(threadId) {
  const toDelete = new Set([threadId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const t of threads) {
      if (!toDelete.has(t.id) && t.parentId && toDelete.has(t.parentId)) {
        toDelete.add(t.id);
        changed = true;
      }
    }
  }

  // remove highlight links to deleted threads
  threads.forEach((t) => {
    t.messages.forEach((m) => {
      if (m.highlights) {
        m.highlights = m.highlights.filter(
          (h) => !toDelete.has(h.targetThreadId)
        );
      }
    });
  });

  for (let i = threads.length - 1; i >= 0; i--) {
    if (toDelete.has(threads[i].id)) {
      threads.splice(i, 1);
    }
  }

  if (toDelete.has(getActiveThreadId())) {
    if (threads.length) setActiveThreadId(threads[0].id);
  }

  renderAll();
}

function scrollToRight() {
  containerEl.scrollLeft = containerEl.scrollWidth;
}
