/* ============================================================
   labs-src/os/session.ts — the session lifecycle of one page load.

   On start it records lab.open with the page path (never the
   query string, which can carry what the visitor typed). While
   the page lives it counts visible time. Each time the page is
   hidden, and on pagehide, it records lab.leave with the
   session's visibleMs and totalMs so far. Mobile browsers often
   kill a hidden tab without a pagehide, so the hidden moment is
   the last one that reliably runs; the totals are cumulative and
   the last lab.leave of a session is its total.
   ============================================================ */

import type { Tracker } from './events.js';
import { systemClock } from './util.js';
import type { Clock } from './util.js';

export interface SessionClock {
  readonly start: number;
  visibleMs(): number;
  totalMs(): number;
}

export interface SessionLifecycle extends SessionClock {
  /** settles once lab.open is written (or refused) */
  readonly opened: Promise<void>;
  /** record lab.leave now (also called by the page events) */
  leave(final: boolean): Promise<void>;
  /** remove the listeners */
  stop(): void;
}

export function startSession(tracker: Tracker, lab: string, opts: { now?: Clock; doc?: Document; win?: Window } = {}): SessionLifecycle {
  const now = opts.now ?? systemClock;
  const doc = opts.doc ?? (typeof document !== 'undefined' ? document : undefined);
  const win = opts.win ?? (typeof window !== 'undefined' ? window : undefined);
  const start = now();
  let visibleSince: number | null = !doc || doc.visibilityState !== 'hidden' ? start : null;
  let visible = 0;
  let lastSent = '';

  const fold = () => { if (visibleSince !== null) { const t = now(); visible += t - visibleSince; visibleSince = t; } };
  const clock: SessionClock = {
    start,
    visibleMs: () => { fold(); return visible; },
    totalMs: () => now() - start,
  };

  const leave = async (final: boolean): Promise<void> => {
    fold();
    const data = { visibleMs: Math.round(visible), totalMs: Math.round(now() - start), final };
    const sig = `${data.visibleMs}|${data.totalMs}|${final}`;
    if (sig === lastSent) return;
    lastSent = sig;
    await tracker.track(lab, 'lab.leave', data);
  };

  const onVisibility = () => {
    if (!doc) return;
    if (doc.visibilityState === 'hidden') {
      fold();
      visibleSince = null;
      void leave(false);
    } else if (visibleSince === null) {
      visibleSince = now();
    }
  };
  const onPageHide = () => { fold(); visibleSince = null; void leave(true); };
  const onPageShow = (e: Event) => {
    // back from the back-forward cache: the same session continues
    if ((e as PageTransitionEvent).persisted && doc?.visibilityState !== 'hidden') visibleSince = now();
  };

  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);

  let path = '';
  try { path = globalThis.location?.pathname ?? ''; } catch { /* no location */ }
  const opened = tracker.track(lab, 'lab.open', path ? { path } : null).then(() => undefined);

  return {
    ...clock,
    opened,
    leave,
    stop() {
      doc?.removeEventListener('visibilitychange', onVisibility);
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
    },
  };
}
