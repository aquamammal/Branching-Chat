// state.js
// Data model for threads, messages, highlights

export const threads = [];

let threadCounter = 1;
let messageCounter = 1;
let highlightCounter = 1;

let activeThreadId = null;
let pendingFocusThreadId = null;

// Default model spec for new root nodes (should match your backend default)
export const DEFAULT_MODEL_SPEC = "ollama/qwen2.5:7b";

// exported so layout / main can read or modify
export function getActiveThreadId() {
  return activeThreadId;
}

export function setActiveThreadId(id) {
  activeThreadId = id;
  pendingFocusThreadId = id;
}

export function consumePendingFocusThreadId() {
  const id = pendingFocusThreadId;
  pendingFocusThreadId = null;
  return id;
}

export function getThread(id) {
  return threads.find((t) => t.id === id) || null;
}

// -------- Thread creation --------

export function createThread({
  title,
  depth,
  parentId = null,
  parentSnippet = null,
  visibleSnippet = null,
  branchSource = null,
  initialY = null,
  modelSpec = null, // e.g. "ollama/qwen2.5:7b", "openai/gpt-4.1-mini"
}) {
  const id = "t" + threadCounter++;
  const createdAt = Date.now() + Math.random();

  const messages = [];

  if (parentSnippet) {
    messages.push({
      id: "m" + messageCounter++,
      role: "system",
      content: parentSnippet,
      visibleSnippet,
    });
  } else {
    messages.push({
      id: "m" + messageCounter++,
      role: "system",
      content: "You are a helpful local assistant in a root conversation node.",
    });
  }

  const thread = {
    id,
    title,
    depth,
    parentId,
    messages,
    branchSource, // { parentThreadId, parentMessageId, globalPosition, anchorFrac }
    createdAt,
    manual: false,
    prefY: initialY,
    y: initialY,
    modelSpec: modelSpec ?? DEFAULT_MODEL_SPEC,
  };

  threads.push(thread);

  if (!activeThreadId) {
    activeThreadId = thread.id;
    pendingFocusThreadId = thread.id;
  }

  return thread;
}

export function createRootThread() {
  const t = createThread({
    title: "Root " + threadCounter,
    depth: 0,
    parentId: null,
    parentSnippet: null,
    visibleSnippet: null,
    branchSource: null,
    initialY: 40, // TOP_MARGIN, layout will normalize anyway
    modelSpec: DEFAULT_MODEL_SPEC,
  });
  setActiveThreadId(t.id);
  return t;
}

// -------- Messages --------

export function addUserMessage(threadId, text) {
  const t = getThread(threadId);
  if (!t || !text.trim()) return null;

  const msg = {
    id: "m" + messageCounter++,
    role: "user",
    content: text.trim(),
  };
  t.messages.push(msg);

  pendingFocusThreadId = threadId;
  return msg;
}

export function addAssistantMessage(threadId, text) {
  const t = getThread(threadId);
  if (!t) return null;

  const msg = {
    id: "m" + messageCounter++,
    role: "assistant",
    content: text ?? "",
  };
  t.messages.push(msg);
  pendingFocusThreadId = threadId;
  return msg;
}

export function addThinkingMessage(threadId) {
  const t = getThread(threadId);
  if (!t) return null;

  const msg = {
    id: "m" + messageCounter++,
    role: "assistant",
    content: "…",
  };
  t.messages.push(msg);
  pendingFocusThreadId = threadId;
  return msg;
}

// -------- Highlights / branching metadata --------

export function addHighlight(parentThreadId, parentMessageId, text, targetThreadId) {
  const parent = getThread(parentThreadId);
  if (!parent) return;

  const msg = parent.messages.find((m) => m.id === parentMessageId);
  if (!msg) return;

  if (!msg.highlights) msg.highlights = [];

  msg.highlights.push({
    id: "h" + highlightCounter++,
    text,
    targetThreadId,
  });
}

// -------- Position helpers used by layout / UI --------

export function setThreadY(threadId, y) {
  const t = getThread(threadId);
  if (!t) return;
  t.y = y;
  t.prefY = y;
}

export function markThreadManual(threadId, manual = true) {
  const t = getThread(threadId);
  if (!t) return;
  t.manual = manual;
}

export function ensureActiveThread() {
  if (!threads.length) return null;
  if (!activeThreadId) {
    activeThreadId = threads[0].id;
    pendingFocusThreadId = activeThreadId;
  }
  return getThread(activeThreadId);
}

// -------- Model helpers --------

export function setThreadModel(threadId, modelSpec) {
  const t = getThread(threadId);
  if (!t) return;
  t.modelSpec = modelSpec;
}
