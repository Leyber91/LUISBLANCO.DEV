/* ============================================================
   blackhole/worker.js — runs the jobs in probe.js off the main thread.
   ============================================================ */

import { anchors, subrings, shadow } from './probe.js';

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    const fn = { anchors, subrings, shadow }[type];
    self.postMessage({ id, result: fn(args) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
