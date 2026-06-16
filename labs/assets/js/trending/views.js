/* ============================================================
   trending/views.js — the render-only classes. Each owns its own
   DOM node(s) and exposes explicit methods; none of them fetch,
   rank or decide — the controller drives them. Every live string is
   placed via el()/textContent (XSS-safe).
   ============================================================ */

import { TUNING, SNAPSHOT_DATE, LIVE_TEXT } from './constants.js';
import { el, fmt, pad, clockNow } from './dom.js';

/* ============================================================
   TraceView — the agent trace list (the visible star). A step is
   built from typed parts via a STRATEGY MAP (string | {b} | {dur})
   so new part kinds are a new entry, not a new branch.
   ============================================================ */
const PART_RENDERERS = {
  text: (p) => document.createTextNode(p),
  b:    (p) => el('b', null, p.b),
  dur:  (p) => el('span', 'dur', p.dur),
};
const partKind = (p) =>
  typeof p === 'string' ? 'text' : p.b != null ? 'b' : p.dur != null ? 'dur' : null;

export class TraceView {
  constructor(wrapNode, bodyNode, toggleNode) {
    this.wrap = wrapNode; this.body = bodyNode; this.toggle = toggleNode;
  }

  clear() { if (this.body) this.body.innerHTML = ''; }
  setActive(on) { if (this.wrap) this.wrap.dataset.active = String(on); }
  setExpanded(on) { this.toggle?.setAttribute('aria-expanded', String(on)); }
  isExpanded() { return this.toggle?.getAttribute('aria-expanded') === 'true'; }

  step(kind, ...parts) {
    const li = el('li', 'trace-step'); li.dataset.kind = kind;
    li.append(el('span', 'tk'));
    const tx = el('span', 'tx');
    for (const p of parts) {
      const k = partKind(p);
      if (k) tx.append(PART_RENDERERS[k](p));
    }
    li.append(tx);
    this.body.append(li);
    this.body.scrollTop = this.body.scrollHeight;
    return li;
  }
}

/* ============================================================
   MetaView — the live/snapshot pill + source + time stamp.
   ============================================================ */
export class MetaView {
  constructor(pillNode, textNode, srcNode, timeNode) {
    this.pill = pillNode; this.text = textNode; this.src = srcNode; this.time = timeNode;
  }

  render(live, lens) {
    const state = live ? 'live' : 'snapshot';
    this.pill.dataset.live = state;
    this.text.textContent = LIVE_TEXT[state];
    this.src.textContent = `${lens.source} · ${lens.endpointLabel}`;
    this.time.textContent = live ? `fetched ${clockNow()}` : `captured ${SNAPSHOT_DATE}`;
  }

  setTime(text) { this.time.textContent = text; }
}

/* ============================================================
   FeaturedView — the top rising signal card (badge/metric/link).
   ============================================================ */
export class FeaturedView {
  constructor(rootNode, badgeNode, metricNode, linkNode) {
    this.root = rootNode; this.badge = badgeNode; this.metric = metricNode; this.link = linkNode;
  }

  render(top, lens) {
    this.badge.textContent = lens.badge;
    this.metric.textContent =
      `${lens.rankLabel.split(' ')[0]} ${fmt(top.score)} · ${top.metricLabel} ${fmt(top.metricValue)}`;
    this.link.textContent = top.title;
    this.link.href = top.url;
    this.root.hidden = false;
  }

  hide() { this.root.hidden = true; }
}

/* ============================================================
   BoardView — the ranked rising board (rows + heat bars).
   ============================================================ */
export class BoardView {
  constructor(listNode, noteNode) { this.list = listNode; this.note = noteNode; }

  render(items) {
    this.list.innerHTML = '';
    const max = items[0].score || 1;
    items.forEach((it, i) => {
      const row = el('li', 'row');
      row.append(el('span', 'row-rank', pad(i + 1)));

      const main = el('div', 'row-main');
      const a = el('a', 'row-title', it.title);
      a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
      main.append(a, el('div', 'row-sub', it.sub));
      row.append(main);

      const right = el('div', 'row-right');
      right.append(el('div', 'row-metric', `${fmt(it.metricValue)} ${it.metricLabel}`));
      const heat = el('div', 'heat');
      const fill = el('span', 'fill');
      fill.style.width = Math.max(TUNING.heatMinPct, Math.round((it.score / max) * 100)) + '%';
      heat.append(fill);
      right.append(heat);
      row.append(right);

      this.list.append(row);
    });
  }

  clear() { this.list.innerHTML = ''; }
  showNote(text) { this.note.textContent = text; this.note.hidden = false; }
  hideNote() { this.note.hidden = true; }
}

/* ============================================================
   StatusView — the header AI dot + the backend note. Driven by a
   resolved STATUS_MODES descriptor ({ mode, label }) — no branching
   on data-mode at the call site.
   ============================================================ */
export class StatusView {
  constructor(statusNode, labelNode, noteNode) {
    this.status = statusNode; this.label = labelNode; this.note = noteNode;
  }

  paint(descriptor) {
    this.status.dataset.mode = descriptor.mode;
    this.label.textContent = descriptor.label;
  }

  setNote(text) { this.note.textContent = text; }
}
