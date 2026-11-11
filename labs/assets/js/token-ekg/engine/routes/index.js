/* ============================================================
   token-ekg/engine/routes/index.js — the streaming routes, in the
   site's route order.

   llm.js (labs/assets/js/ai/) is the site's one route to a model:
   the visitor's Ollama, then the visitor's own key, then a worker,
   then the public keyless route, then a lab's offline engine. It
   returns whole replies. This module is its streaming sibling: the
   same order, the same sources of truth (AI_CONFIG for the Ollama
   base, LLM.ownKey() for the visitor's key, LLM.publicReadyIn() for
   the public window), each route an adapter with one record()
   interface. The public route is not streamed (llm.js notes its
   anonymous stream answered with a budget notice on 2026-11-11), so
   a public measurement goes through LLM.complete() as one reply.

   Written to move unchanged into labs/assets/js/ai/ if other labs
   want stream timing; it stays in this lab's folder because a lab
   pass may not edit the shared ai/ folder.
   ============================================================ */

import { LLM } from '../../../ai/llm.js';
import { AI_CONFIG } from '../../../ai/config.js';
import * as Ollama from './ollama.js';
import * as SSE from './openai-sse.js';

export const ADAPTERS = { ollama: Ollama, sse: SSE };

/** Streaming routes available now, in llm.js order. ollamaUp: whether /api/tags answered. */
export function streamingRoutes({ ollamaUp }) {
  const base = AI_CONFIG.ollama?.base || 'http://localhost:11434';
  const out = [];
  if (ollamaUp) {
    out.push({ id: 'ollama', label: 'Ollama /api/chat (NDJSON)', adapter: Ollama, base });
    out.push({ id: 'ollama-v1', label: 'Ollama /v1 (OpenAI SSE)', adapter: SSE, base: base + '/v1' });
  }
  const own = LLM.ownKey();
  if (own) out.push({ id: 'own-key', label: `your key: ${own.base}`, adapter: SSE, base: own.base, key: own.key, model: own.model });
  return out;
}

/** Seconds until the public route can answer again (shared with every lab on this origin). */
export const publicReadyIn = () => LLM.publicReadyIn();
