/* ============================================================
   Trending Topics — a live, in-browser agentic scan.

   It reaches the open web from the page itself (no backend, no
   keys), pulls real signals, ranks what is actually rising, and
   asks a keyless model WHY — streaming every step as a visible
   agent trace. All sources are public and CORS-clean:
     - Tech    : hn.algolia.com  (front page, ranked by velocity)
     - Culture : wikimedia.org   (most-read articles, prior day)
     - Dev     : api.github.com  (new repos by stars)
     - Reason  : text.pollinations.ai (keyless LLM; local heuristic fallback)

   If the network is unreachable it falls back to a clearly-labelled
   snapshot captured 2026-06-16, so the page is never a dead box.
   Live data is rendered with textContent only (never innerHTML).

   This entry just boots the Trending controller; all behaviour
   lives in Trending.js and its views/services/lenses.
   ============================================================ */

import { Trending } from './Trending.js';

Trending.boot();
