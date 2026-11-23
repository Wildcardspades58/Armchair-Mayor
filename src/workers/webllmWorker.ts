// ============================================================================
// ARMCHAIR MAYOR — Dedicated WebLLM Web Worker
// Offloads WebGPU token generation & weight caching off the main UI thread.
// ============================================================================

import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
