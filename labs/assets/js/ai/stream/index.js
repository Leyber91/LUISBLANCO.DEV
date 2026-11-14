/* ============================================================
   ai/stream/index.js — real token streaming, for any lab.

   What it is for: timing a model's reply as it streams, token by
   token, on the fast routes that can stream. Those are the
   visitor's local Ollama (when the page is served from localhost,
   or when the visitor has allowed the site in OLLAMA_ORIGINS) and an
   OpenAI-compatible endpoint with the visitor's own key. The public
   keyless route does not stream: llm.js notes its anonymous stream
   answered with a budget notice on 2026-11-11, so a lab that needs
   the public route uses LLM.complete() for one whole reply.

   It follows llm.js's route order and sources of truth: the Ollama
   base from AI_CONFIG, the visitor's key from LLM.ownKey(), the
   public window from LLM.publicReadyIn(). It does not change them.

   Every route is an adapter with one interface:
     record({ base, model, messages, options, think, key, signal,
              clock, onChunk, onHeaders }) -> raw trace
       chunks   [{ t, kind: 'a' | 't', text }], t = ms since the
                request was sent, stamped before any parsing
       final    the server's own counters (Ollama) or null
       usage    OpenAI-style usage or null
       tHeaders, tDone, reads, coalesced, handlerMs
   so a new wire format is one new file here. The adapters run in the
   browser and under Node 18+ (labs/assets/js/token-ekg/record-traces.mjs
   records the Token EKG lab's shipped traces with ollama.js).

   Usage:
     import { streamingRoutes } from '../ai/stream/index.js';
     const [route] = streamingRoutes({ ollamaUp: true });
     const raw = await route.adapter.record({ base: route.base, key: route.key,
       model: 'llama3.1:8b', messages: [{ role: 'user', content: 'hi' }],
       onChunk: (c) => draw(c) });
   ============================================================ */

import { LLM } from '../llm.js';
import { AI_CONFIG } from '../config.js';
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
