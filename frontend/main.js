// main.js
// Entry point – sets up initial root and UI

import { createRootThread } from "./state.js";
import { setupUI, renderAll } from "./ui.js";
import { recomputeLayout } from "./layout.js";
import { redrawConnections } from "./svg.js";

setupUI();

// create first root conversation
createRootThread();

// initial render + layout
renderAll();
recomputeLayout({ centerParents: false });
redrawConnections();
