/* ============================================================
   dashboard/chart.js — the daily trace: visitors and sessions
   per UTC day, two lines on one axis, drawn as inline SVG.

   What each mark encodes:
     a line        one count per day; visitors (distinct browsers)
                   in the brightest ink, sessions (page loads) one
                   rung colder. Both are counts of the same visits,
                   a visitor making one or more sessions, so they
                   share the axis and one hue: two steps of the ink
                   ladder, checked as an ordinal ramp on the void
                   (dataviz validate_palette --ordinal: lightness
                   steps apart, both far above 3:1).
     an end dot    the last day's value, with the number beside it.
     the gold tick today on the day axis: the one day still
                   counting. Gold marks what is live, so the tick
                   is drawn only when there is data to count.
     the hairline  the day under the pointer or the arrow keys,
                   warmed toward gold because it is being chosen;
                   the readout beside it lists both series.

   Nothing moves by itself: a dashboard is read. Every state draws
   the same frame at the same height; without data the frame is
   empty and says why. The table view holds every number the
   lines show.
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STEPS = [1, 2, 3, 7, 14, 28, 30, 45, 90];          // days between day labels
const MARGIN = { l: 36, r: 42, t: 16, b: 30 };
const LABEL_GAP = 14;                                     // closest two end labels may sit, px

export const SERIES = [
  { key: 'visitors', name: 'visitors', cls: 'dc-visitors' },
  { key: 'sessions', name: 'sessions', cls: 'dc-sessions' },
];

const el = (tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
};
const html = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const num = (n) => n.toLocaleString('en-US');

/** "7 Nov" for a YYYY-MM-DD day. */
export function dayLabel(day, withYear = false) {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** A count axis: whole-number ticks, at most five of them, the top at or above the largest value. */
export function countAxis(max) {
  const target = Math.max(1, max);
  const rough = target / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough));
  const top = step * Math.ceil(target / step);
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, step, ticks };
}

/** How many days apart the day labels sit, so they never touch. */
export function labelEvery(days, plotWidth) {
  const room = Math.max(2, Math.floor(plotWidth / 78));
  return STEPS.find((k) => Math.ceil(days / k) <= room) ?? days;
}

/**
 * @param {HTMLElement} host
 * @returns {{ update(next: { daily: {day: string, visitors: number, sessions: number}[], live: boolean, stamp: string }): void, destroy(): void }}
 */
export function mountChart(host) {
  const root = html('div', 'dc');
  root.tabIndex = 0;
  root.setAttribute('role', 'group');
  const svg = el('svg', { class: 'dc-svg', 'aria-hidden': 'true', focusable: 'false' });
  const tip = html('div', 'dc-tip');
  tip.hidden = true;
  const live = html('p', 'dc-sr');
  live.setAttribute('aria-live', 'polite');
  root.append(svg, tip, live);
  host.replaceChildren(root);

  let state = { daily: [], live: false, stamp: '' };
  let geo = null;          // the last drawing's geometry, for the pointer
  let at = -1;             // the day under the hairline, or -1
  const hover = el('g', { class: 'dc-hover' });

  function draw() {
    const W = Math.max(280, Math.round(host.clientWidth));
    const H = W < 520 ? 220 : 260;
    const pw = W - MARGIN.l - MARGIN.r, ph = H - MARGIN.t - MARGIN.b;
    const { daily } = state;
    const n = daily.length;
    const axis = countAxis(state.live ? Math.max(0, ...daily.map((d) => Math.max(d.visitors, d.sessions))) : 4);
    const x = (i) => MARGIN.l + (n > 1 ? (i * pw) / (n - 1) : pw / 2);
    const y = (v) => MARGIN.t + ph - (v / axis.top) * ph;
    geo = { W, H, pw, ph, n, x, y };

    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.replaceChildren();

    // the count axis: hairlines, the baseline one step brighter, whole numbers
    for (const v of axis.ticks) {
      const gy = Math.round(y(v)) + 0.5;
      svg.append(el('line', { class: v === 0 ? 'dc-grid dc-base' : 'dc-grid', x1: MARGIN.l, x2: W - MARGIN.r, y1: gy, y2: gy }));
      if (state.live || v === 0) svg.append(el('text', { class: 'dc-tick', x: MARGIN.l - 8, y: gy, dy: '.32em', 'text-anchor': 'end' }, num(v)));
    }

    // the day axis: a label every k days counted back from today, and the gold tick on today
    const base = Math.round(y(0)) + 0.5;
    const every = labelEvery(n, pw);
    for (let i = n - 1; i >= 0; i -= every) {
      const gx = Math.round(x(i)) + 0.5;
      svg.append(el('line', { class: 'dc-grid dc-base', x1: gx, x2: gx, y1: base, y2: base + 4 }));
      svg.append(el('text', { class: 'dc-tick', x: gx, y: base + 19, 'text-anchor': 'middle' }, dayLabel(daily[i].day)));
    }
    if (n && state.live) {
      const tx = Math.round(x(n - 1)) + 0.5;
      svg.append(el('line', { class: 'dc-today', x1: tx, x2: tx, y1: base - 5, y2: base + 5 }));
    }

    if (!state.live) {
      // why the frame is empty, set in the middle of a band so no gridline runs through the words
      svg.append(el('text', { class: 'dc-stamp', x: MARGIN.l + pw / 2, y: MARGIN.t + ph * 0.375, dy: '.32em', 'text-anchor': 'middle' }, state.stamp));
      at = -1;
      tip.hidden = true;
      return;
    }

    // sessions under visitors: where the two meet, the brighter line stays whole
    const ends = [];
    for (const s of [...SERIES].reverse()) {
      const d = daily.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[s.key]).toFixed(1)}`).join(' ');
      svg.append(el('path', { class: `dc-line ${s.cls}`, d }));
      const last = daily[n - 1];
      ends.push({ s, v: last[s.key], dot: y(last[s.key]), label: y(last[s.key]) });
    }
    // the value beside each line's end; two that would touch are moved apart and tied back by a leader
    ends.sort((a, b) => a.dot - b.dot);
    if (ends.length === 2 && ends[1].label - ends[0].label < LABEL_GAP) {
      const mid = Math.min(Math.max((ends[0].dot + ends[1].dot) / 2, MARGIN.t + LABEL_GAP / 2), MARGIN.t + ph - LABEL_GAP / 2);
      ends[0].label = mid - LABEL_GAP / 2;
      ends[1].label = mid + LABEL_GAP / 2;
    }
    const ex = x(n - 1);
    for (const e of ends) {
      if (Math.abs(e.label - e.dot) > 0.5) svg.append(el('line', { class: 'dc-leader', x1: ex + 7, y1: e.dot, x2: ex + 12, y2: e.label }));
      svg.append(el('circle', { class: `dc-dot ${e.s.cls}`, cx: ex, cy: e.dot, r: 5 }));
      svg.append(el('text', { class: 'dc-end', x: ex + 14, y: e.label, dy: '.34em' }, num(e.v)));
    }

    svg.append(hover);
    // the whole plot is the target: the pointer picks the nearest day, it never has to land on a line
    const hit = el('rect', { class: 'dc-hit', x: MARGIN.l - 8, y: MARGIN.t, width: pw + 16, height: ph + MARGIN.b });
    svg.append(hit);
    if (at >= n) at = n - 1;
    show(at);
  }

  function show(i) {
    hover.replaceChildren();
    at = i;
    if (i < 0 || !state.live || !geo) { tip.hidden = true; return; }
    const p = state.daily[i];
    const gx = Math.round(geo.x(i)) + 0.5;
    hover.append(el('line', { class: 'dc-cross', x1: gx, x2: gx, y1: MARGIN.t, y2: MARGIN.t + geo.ph }));
    for (const s of [...SERIES].reverse()) hover.append(el('circle', { class: `dc-dot ${s.cls}`, cx: geo.x(i), cy: geo.y(p[s.key]), r: 5 }));

    const head = html('div', 'dc-tip-day', `${dayLabel(p.day, true)} · UTC`);
    const rows = SERIES.map((s) => {
      const row = html('div', 'dc-tip-row');
      row.append(html('i', `dc-key ${s.cls}`), html('b', '', num(p[s.key])), html('span', '', s.name));
      return row;
    });
    tip.replaceChildren(head, ...rows);
    tip.hidden = false;
    const w = tip.offsetWidth || 150;
    const left = gx + 12 + w > geo.W ? gx - 12 - w : gx + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${MARGIN.t}px`;
    live.textContent = `${dayLabel(p.day, true)}: ${SERIES.map((s) => `${num(p[s.key])} ${s.name}`).join(', ')}`;
  }

  const nearest = (e) => {
    if (!geo || geo.n < 1) return -1;
    const px = e.clientX - svg.getBoundingClientRect().left;
    const i = geo.n > 1 ? Math.round(((px - MARGIN.l) / geo.pw) * (geo.n - 1)) : 0;
    return Math.min(geo.n - 1, Math.max(0, i));
  };
  const onMove = (e) => { if (state.live && e.target instanceof Element && e.target.classList.contains('dc-hit')) show(nearest(e)); };
  const onLeave = () => { if (document.activeElement !== root) show(-1); };
  const onKey = (e) => {
    if (!state.live || !geo) return;
    const last = geo.n - 1;
    const to = e.key === 'ArrowLeft' ? Math.max(0, (at < 0 ? last : at) - 1)
      : e.key === 'ArrowRight' ? Math.min(last, (at < 0 ? last : at) + 1)
        : e.key === 'Home' ? 0 : e.key === 'End' ? last : e.key === 'Escape' ? -1 : null;
    if (to === null) return;
    e.preventDefault();
    show(to);
  };
  const onFocus = () => { if (state.live && at < 0 && geo) show(geo.n - 1); };
  const onBlur = () => show(-1);

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onMove);
  svg.addEventListener('pointerleave', onLeave);
  root.addEventListener('keydown', onKey);
  root.addEventListener('focus', onFocus);
  root.addEventListener('blur', onBlur);

  let width = 0;
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { const w = Math.round(host.clientWidth); if (w !== width) { width = w; draw(); } })
    : null;
  ro?.observe(host);

  return {
    update(next) {
      state = next;
      root.setAttribute('aria-label', next.live
        ? `Visitors and sessions per day, ${next.daily.length} days. The arrow keys read each day.`
        : `Visitors and sessions per day: ${next.stamp.toLowerCase()}.`);
      if (!next.live) live.textContent = '';
      width = Math.round(host.clientWidth);
      draw();
    },
    destroy() {
      ro?.disconnect();
      root.remove();
    },
  };
}

/** The table twin of the chart: every day of the range, newest first. */
export function dayTable(daily, live) {
  const table = html('table', 'dash-days');
  const head = table.createTHead().insertRow();
  for (const [text, cls] of [['Day (UTC)', ''], ['Visitors', 'n'], ['Sessions', 'n']]) {
    const th = html('th', cls, text);
    th.scope = 'col';
    head.append(th);
  }
  const body = table.createTBody();
  for (const p of [...daily].reverse()) {
    const tr = body.insertRow();
    tr.append(html('td', '', dayLabel(p.day, true)), html('td', 'n', live ? num(p.visitors) : '–'), html('td', 'n', live ? num(p.sessions) : '–'));
  }
  return table;
}
