/* ============================================================
   hub/os/Handoffs.js — records which lab a visitor opens from
   the hub, as a lab.handoff event (data: the lab id and where
   the link sat: card, rail or welcome).

   A plain click waits up to OS_HUB.handoffWaitMs for the record
   to be written before it navigates, because a page that is
   unloading may drop an unfinished IndexedDB write. A click that
   opens a new tab, a modified click and a middle click navigate
   at once; this page stays open, so their write completes.
   ============================================================ */

import { OS_HUB } from '../constants.js';
import { catalogue } from './catalogue.js';

const VIA = [['.los-welcome', 'welcome'], ['.card', 'card'], ['.rail', 'rail']];

export class Handoffs {
  constructor(osReady) { this.osReady = osReady; this.os = null; }

  mount() {
    this.byPath = new Map(catalogue().map((c) => [c.href, c]));
    this.osReady.then((os) => { this.os = os; });
    this.onClick = (e) => { void this.handle(e); };
    document.addEventListener('click', this.onClick);
    document.addEventListener('auxclick', this.onClick);
  }

  async handle(e) {
    const os = this.os;
    if (!os || e.defaultPrevented) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!a) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    const lab = this.byPath.get(url.pathname);
    if (!lab) return;

    const via = VIA.find(([sel]) => a.closest(sel))?.[1] || 'link';
    const write = os.track('lab.handoff', { to: lab.id, via });
    const plain = e.type === 'click' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey &&
      (!a.target || a.target === '_self') && !a.hasAttribute('download');
    if (!plain) return;
    e.preventDefault();
    await Promise.race([write, new Promise((r) => setTimeout(r, OS_HUB.handoffWaitMs))]);
    location.assign(url.href);
  }

  destroy() {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('auxclick', this.onClick);
  }
}
