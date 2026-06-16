/* ============================================================
   AI Meme Lab — "The Taste Filter" (entry point).

   A reasoning model brainstorms comedic angles, drafts a slate of
   caption candidates, scores each against a named taste rubric, and
   commits to a winner — all streamed into the reasoning panel as the
   visible star. The meme is composited onto a same-origin
   event-horizon canvas (always exportable, offline-capable), with
   upload-your-own and an opt-in pollinations backdrop as alternates.

   This file is a thin boot: every concern lives in its own module
   (MemeLab controller, ComedyEngine, MemeParser, MemeCanvas,
   SlateView, BackgroundSource, Exporter, constants). The detector
   walks the shared tiered backend (ollama -> worker -> echo).
   ============================================================ */

import { MemeLab } from './MemeLab.js';

MemeLab.boot();
