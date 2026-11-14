/* ============================================================
   Trending Topics — the signal line. Entry point: boots the
   controller. Everything else lives in Trending.js and the engine
   modules it composes (engine, lenses, score, topics, history,
   verify, explain) and the views (field, views, marks).
   ============================================================ */

import { Trending } from './Trending.js';

Trending.boot();
