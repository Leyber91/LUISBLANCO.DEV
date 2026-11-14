/* ============================================================
   ai-health/view-ward.js — the focal living element: twelve beds
   over one shift. Each lane carries the NEWS2 aggregate as hourly
   columns and the model's risk as a line; whatever crosses its
   threshold turns gold. A deterioration is drawn when it happens.

   The canvas is decoration over real buttons: every bed is a button
   (keyboard and touch reachable), and the lane behind it takes a
   click to open that patient at that hour.
   ============================================================ */

import { WARD } from './config.js';
import { h, clock, reducedMotion } from './dom.js';

const RISK_LO = Math.log10(0.004);       // the model line is drawn on a log scale, 0.4% .. 100%
const yRisk = (r) => Math.max(0, Math.min(1, (Math.log10(Math.max(r, 0.004)) - RISK_LO) / -RISK_LO));

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function createWard({ stage, canvas, list, tier, onSelect, onTick, onEnd }) {
  const ctx = canvas.getContext('2d');
  const C = {
    line: css('--line'), lineB: css('--line-bright'), text: css('--text'), dim: css('--text-dim'), faint: css('--text-faint'),
    bright: css('--text-bright'), gold: css('--accretion'), goldS: css('--accretion-soft'), horizon: css('--horizon'), danger: css('--danger'),
    cat: { low: css('--cat-low'), red: css('--cat-red'), medium: css('--cat-medium'), high: css('--cat-high') },
  };
  const LETTER = { low: 'L', red: 'LM', medium: 'M', high: 'H' };
  const st = {
    beds: [], hours: WARD.hours, t: 0, playing: true, mode: 'watch', newsT: 5, thr: 0.08,
    calls: new Map(), sel: null, hover: -1, w: 0, hgt: 0, dpr: 1, endShown: false, holdUntil: 0, last: 0,
    lanes: [], intro: 0, filter: null,
  };
  const reduce = reducedMotion();

  /* ---------- layout ---------- */
  function layout() {
    const narrow = stage.clientWidth < 560;
    const laneH = narrow ? 28 : 31;
    const top = 28, bottom = 10;
    const hgt = top + bottom + laneH * Math.max(1, st.beds.length);
    stage.style.height = hgt + 'px';
    st.dpr = Math.min(window.devicePixelRatio || 1, tier === 'lite' ? 1.25 : 2);
    st.w = stage.clientWidth; st.hgt = hgt;
    canvas.width = Math.round(st.w * st.dpr); canvas.height = Math.round(hgt * st.dpr);
    canvas.style.height = hgt + 'px';
    const gl = narrow ? 66 : 92;
    const gr = st.mode === 'triage' ? (narrow ? 54 : 66) : 26;
    st.geo = { top, bottom, laneH, gl, gr, narrow, x0: gl + 8, x1: st.w - gr };
    st.lanes = st.beds.map((b, i) => ({ y: top + i * laneH, h: laneH }));
    [...list.children].forEach((li, i) => {
      li.style.top = st.lanes[i].y + 'px'; li.style.height = laneH + 'px';
      li.querySelector('.bed-btn').style.width = gl + 'px';
    });
    draw();
  }
  const X = (t) => st.geo.x0 + (t / st.hours) * (st.geo.x1 - st.geo.x0);
  const T = (x) => ((x - st.geo.x0) / (st.geo.x1 - st.geo.x0)) * st.hours;

  /* ---------- the bed buttons ---------- */
  function buildList() {
    list.replaceChildren(...st.beds.map((b, i) => {
      const btn = h('button', { type: 'button', class: 'bed-btn', 'aria-label': `Bed ${b.bed}, age ${b.age}. Open this patient.` },
        h('b', { text: 'BED ' + String(b.bed).padStart(2, '0') }), h('span', { text: b.age + 'y' + (b.copd ? ' copd' : '') + (b.bb ? ' bb' : '') }));
      btn.addEventListener('click', () => select(i, observedHour(i)));
      btn.addEventListener('keydown', (e) => keyNav(e, i));
      const lane = h('button', { type: 'button', class: 'bed-lane', tabindex: '-1', 'aria-hidden': 'true' });
      lane.addEventListener('click', (e) => {
        const r = lane.getBoundingClientRect();
        const t = Math.round(T(e.clientX - r.left + (r.left - stage.getBoundingClientRect().left)));
        select(i, Math.max(0, Math.min(observedHour(i), t)));
      });
      lane.addEventListener('pointerenter', () => { st.hover = i; draw(); });
      lane.addEventListener('pointerleave', () => { st.hover = -1; draw(); });
      const call = h('button', { type: 'button', class: 'bed-call', 'aria-pressed': 'false', hidden: true, 'aria-label': `Call outreach to bed ${b.bed}` }, 'call');
      call.addEventListener('click', () => toggleCall(i));
      return h('li', { class: 'bed' }, btn, lane, call);
    }));
  }

  function keyNav(e, i) {
    if (!st.sel) return;
    let { bed, hour } = st.sel;
    if (e.key === 'ArrowRight') hour = Math.min(observedHour(i), hour + 1);
    else if (e.key === 'ArrowLeft') hour = Math.max(0, hour - 1);
    else if (e.key === 'ArrowDown' && i < st.beds.length - 1) { list.children[i + 1].querySelector('.bed-btn').focus(); return select(i + 1, Math.min(hour, observedHour(i + 1))); }
    else if (e.key === 'ArrowUp' && i > 0) { list.children[i - 1].querySelector('.bed-btn').focus(); return select(i - 1, Math.min(hour, observedHour(i - 1))); }
    else return;
    e.preventDefault();
    select(i, hour);
  }

  const lastHour = (i) => st.beds[i].series.length - 1;
  const observedHour = (i) => Math.max(0, Math.min(lastHour(i), Math.floor(st.t + 1e-6)));

  function select(i, hour) {
    st.sel = { bed: i, hour };
    [...list.children].forEach((li, k) => li.classList.toggle('sel', k === i));
    draw();
    onSelect?.(i, hour);
  }

  function toggleCall(i) {
    if (st.mode !== 'triage') return;
    const b = st.beds[i];
    const now = Math.floor(st.t + 1e-6);
    if (b.eventHour != null && now >= b.eventHour) return;
    if (st.calls.has(i)) st.calls.delete(i);
    else if (st.calls.size < WARD.outreachCapacity) st.calls.set(i, now);
    syncCalls();
    draw();
    onTick?.(api.summary());
  }

  function syncCalls() {
    const full = st.calls.size >= WARD.outreachCapacity;
    [...list.children].forEach((li, i) => {
      const c = li.querySelector('.bed-call');
      const b = st.beds[i];
      const gone = b.eventHour != null && st.t >= b.eventHour;
      c.hidden = st.mode !== 'triage';
      c.setAttribute('aria-pressed', String(st.calls.has(i)));
      c.textContent = st.calls.has(i) ? 'called ' + clock(WARD.startHour, st.calls.get(i)).slice(0, 2) : 'call';
      c.disabled = st.t >= st.hours || gone || (!st.calls.has(i) && full);
    });
  }

  /* ---------- drawing ---------- */
  function draw() {
    if (!st.geo) return;
    const { top, laneH, gl, x0, x1, narrow } = st.geo;
    const W = st.w, H = st.hgt;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const now = st.t;
    const intro = st.intro;     // 0..1 assembly on load

    // hour grid and clock
    ctx.font = `10px ${css('--font-mono')}`;
    ctx.textBaseline = 'middle';
    for (let k = 0; k <= st.hours; k++) {
      const x = X(k);
      ctx.strokeStyle = C.line; ctx.globalAlpha = 0.7 * intro; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, top - 4); ctx.lineTo(x + 0.5, H - st.geo.bottom); ctx.stroke();
      const every = narrow ? 4 : 2;
      if (k % every === 0) {
        ctx.globalAlpha = intro; ctx.fillStyle = k <= now ? C.dim : C.faint; ctx.textAlign = 'center';
        ctx.fillText(clock(WARD.startHour, k), x, 13);
      }
    }
    ctx.globalAlpha = 1;

    // the future, veiled, under everything drawn after it
    if (now < st.hours) {
      const xp = X(now);
      ctx.fillStyle = 'rgba(6,8,13,0.55)';
      ctx.fillRect(xp, top - 4, x1 - xp + st.geo.gr, H - top);
      const g = ctx.createLinearGradient(xp - 18, 0, xp + 1, 0);
      g.addColorStop(0, 'rgba(159,179,214,0)'); g.addColorStop(1, 'rgba(159,179,214,0.10)');
      ctx.fillStyle = g; ctx.fillRect(xp - 18, top - 4, 19, H - top);
    }

    st.beds.forEach((b, i) => {
      const L = st.lanes[i];
      const dimmed = st.filter && !st.filter.has(i);
      const appear = Math.max(0, Math.min(1, intro * 1.6 - i * 0.035)) * (dimmed ? 0.22 : 1);
      if (appear <= 0) return;
      ctx.globalAlpha = appear;
      const yb = L.y + L.h - 5;        // lane baseline
      const hh = L.h - 11;             // drawable height
      if (st.hover === i || st.sel?.bed === i) { ctx.fillStyle = 'rgba(159,179,214,0.035)'; ctx.fillRect(gl, L.y, W - gl, L.h); }
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gl, L.y + L.h + 0.5); ctx.lineTo(W, L.y + L.h + 0.5); ctx.stroke();

      const last = b.series.length - 1;
      const ev = b.eventHour;
      const seen = Math.min(last, Math.floor(now + 1e-6));
      // model threshold, faint
      const yThr = yb - yRisk(st.thr) * hh;
      ctx.strokeStyle = C.gold; ctx.globalAlpha = 0.13 * appear; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(x0, yThr); ctx.lineTo(X(Math.min(now, ev ?? st.hours)), yThr); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = appear;

      // NEWS2 columns
      const cw = Math.max(4, Math.min(11, (x1 - x0) / st.hours * 0.3));
      for (let k = 0; k <= seen; k++) {
        const { news: n, cat, alertN } = b.series[k];
        const col = C.cat[cat];
        const ch = Math.max(1.5, (Math.min(n, 12) / 12) * hh);
        const x = X(k) - cw / 2;
        ctx.globalAlpha = appear * (alertN ? 0.34 : 0.16);
        ctx.fillStyle = col; ctx.fillRect(x, yb - ch, cw, ch);
        ctx.globalAlpha = appear * (alertN ? 1 : 0.7);
        ctx.strokeStyle = col;
        ctx.beginPath(); ctx.moveTo(x + 0.5, yb); ctx.lineTo(x + 0.5, yb - ch + 0.5); ctx.lineTo(x + cw - 0.5, yb - ch + 0.5); ctx.lineTo(x + cw - 0.5, yb); ctx.stroke();
        ctx.globalAlpha = appear;
        if (!narrow && (cat !== 'low' || k === seen)) {
          ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.font = `8.5px ${css('--font-mono')}`;
          ctx.fillText(n + (cat !== 'low' ? LETTER[cat] : ''), X(k), Math.max(L.y + 5, yb - ch - 5));
        }
      }

      // model risk line, interpolated up to the playhead
      const pts = [];
      const end = Math.min(now, last);
      for (let k = 0; k <= Math.floor(end); k++) pts.push([k, b.series[k].risk]);
      if (end > Math.floor(end) && Math.floor(end) + 1 <= last) {
        const k = Math.floor(end), f = end - k;
        pts.push([end, b.series[k].risk * (1 - f) + b.series[k + 1].risk * f]);
      }
      if (pts.length > 1) {
        const fired = pts.some(([, r]) => r >= st.thr);
        const g = ctx.createLinearGradient(0, L.y, 0, yb);
        g.addColorStop(0, fired ? 'rgba(212,162,76,0.16)' : 'rgba(159,179,214,0.10)');
        g.addColorStop(1, 'rgba(159,179,214,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(X(pts[0][0]), yb);
        for (const [tt, rr] of pts) ctx.lineTo(X(tt), yb - yRisk(rr) * hh);
        ctx.lineTo(X(pts[pts.length - 1][0]), yb); ctx.closePath(); ctx.fill();
      }
      for (let k = 1; k < pts.length; k++) {
        const [ta, ra] = pts[k - 1], [tb, rb] = pts[k];
        const fire = Math.max(ra, rb) >= st.thr;
        ctx.strokeStyle = fire ? C.gold : C.horizon;
        ctx.lineWidth = fire ? 1.6 : 1.1;
        if (fire && tier !== 'lite') { ctx.shadowColor = 'rgba(212,162,76,0.8)'; ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.moveTo(X(ta), yb - yRisk(ra) * hh); ctx.lineTo(X(tb), yb - yRisk(rb) * hh); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      if (pts.length) {
        const [tp, rp] = pts[pts.length - 1];
        ctx.fillStyle = rp >= st.thr ? C.goldS : C.text;
        ctx.beginPath(); ctx.arc(X(tp), yb - yRisk(rp) * hh, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineWidth = 1;

      // your call
      if (st.calls.has(i)) {
        const xc = X(st.calls.get(i));
        ctx.fillStyle = C.bright;
        ctx.beginPath(); ctx.moveTo(xc - 4, L.y + 3); ctx.lineTo(xc + 4, L.y + 3); ctx.lineTo(xc, L.y + 9); ctx.closePath(); ctx.fill();
      }

      // deterioration: drawn when it happens, then the lane is closed
      if (ev != null && now >= ev) {
        const xe = X(ev), ym = L.y + L.h / 2;
        ctx.strokeStyle = C.bright; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(xe, ym - 6); ctx.lineTo(xe + 6, ym); ctx.lineTo(xe, ym + 6); ctx.lineTo(xe - 6, ym); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xe - 2.5, ym - 2.5); ctx.lineTo(xe + 2.5, ym + 2.5); ctx.moveTo(xe + 2.5, ym - 2.5); ctx.lineTo(xe - 2.5, ym + 2.5); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.save(); ctx.beginPath(); ctx.rect(xe + 9, L.y + 2, x1 - xe - 9, L.h - 4); ctx.clip();
        ctx.strokeStyle = 'rgba(234,240,251,0.08)';
        for (let x = xe + 9 - L.h; x < x1; x += 7) { ctx.beginPath(); ctx.moveTo(x, L.y + L.h); ctx.lineTo(x + L.h, L.y); ctx.stroke(); }
        ctx.restore();
        const room = x1 - xe > 130;
        if (room || xe - x0 > 130) {
          ctx.fillStyle = C.bright; ctx.textAlign = room ? 'left' : 'right'; ctx.font = `9.5px ${css('--font-mono')}`;
          if (!room) { ctx.fillStyle = 'rgba(6,8,13,0.8)'; ctx.fillRect(xe - 128, ym - 7, 118, 14); ctx.fillStyle = C.bright; }
          ctx.fillText((narrow ? '' : 'deteriorated ') + clock(WARD.startHour, ev), room ? xe + 12 : xe - 12, ym);
        }
      }

      // selection reticle
      if (st.sel?.bed === i) {
        const xs = X(st.sel.hour), r = 9;
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1;
        const yt = L.y + 3, ybt = L.y + L.h - 3;
        ctx.beginPath();
        ctx.moveTo(xs - r, yt + 4); ctx.lineTo(xs - r, yt); ctx.lineTo(xs - r + 4, yt);
        ctx.moveTo(xs + r - 4, yt); ctx.lineTo(xs + r, yt); ctx.lineTo(xs + r, yt + 4);
        ctx.moveTo(xs - r, ybt - 4); ctx.lineTo(xs - r, ybt); ctx.lineTo(xs - r + 4, ybt);
        ctx.moveTo(xs + r - 4, ybt); ctx.lineTo(xs + r, ybt); ctx.lineTo(xs + r, ybt - 4);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    // the playhead
    if (now < st.hours) {
      const xp = X(now);
      ctx.strokeStyle = C.horizon; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(xp + 0.5, top - 6); ctx.lineTo(xp + 0.5, H - st.geo.bottom); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- time ---------- */
  function frame(ms) {
    const dt = st.last ? Math.min(100, ms - st.last) : 16;
    st.last = ms;
    if (st.intro < 1) st.intro = Math.min(1, st.intro + dt / 900);
    const before = Math.floor(st.t + 1e-6);
    if (st.playing && st.mode === 'watch' && st.t < st.hours) st.t = Math.min(st.hours, st.t + dt / WARD.playMsPerHour);
    if (st.mode === 'triage' && st.target != null && st.t < st.target) st.t = Math.min(st.target, st.t + dt / 520);
    if (Math.floor(st.t + 1e-6) !== before) { syncCalls(); onTick?.(api.summary()); }
    if (st.t >= st.hours && !st.endShown) { st.endShown = true; st.holdUntil = ms + 8000; onEnd?.(api.summary()); }
    if (st.mode === 'watch' && st.endShown && st.playing && !reduce && ms > st.holdUntil) api.onLoop?.();
    draw();
    requestAnimationFrame(frame);
  }

  const api = {
    st,
    setShift(beds, startAt = 0) {
      st.beds = beds; st.calls.clear(); st.endShown = false;
      st.t = reduce && st.mode === 'watch' ? st.hours : st.mode === 'watch' ? startAt : 0;
      st.target = null;
      buildList(); layout(); syncCalls();
      onTick?.(api.summary());
    },
    updateSeries(beds) { st.beds = beds; draw(); onTick?.(api.summary()); },
    setThresholds(newsT, thr) { st.newsT = newsT; st.thr = thr; draw(); onTick?.(api.summary()); },
    setFilter(set) { st.filter = set; draw(); },
    setMode(mode) {
      st.mode = mode; st.calls.clear(); st.endShown = false; st.target = null;
      st.t = mode === 'watch' ? (reduce ? st.hours : 0) : 0;
      st.playing = true;
      layout(); syncCalls(); onTick?.(api.summary());
    },
    nextHour() {
      if (st.mode !== 'triage' || st.t >= st.hours) return;
      const nxt = Math.min(st.hours, Math.floor(st.t + 1e-6) + 1);
      if (reduce) { st.t = nxt; syncCalls(); onTick?.(api.summary()); if (st.t >= st.hours && !st.endShown) { st.endShown = true; onEnd?.(api.summary()); } draw(); }
      else st.target = nxt;
    },
    togglePlay() { st.playing = !st.playing; if (st.playing && st.endShown && st.mode === 'watch') api.onLoop?.(); return st.playing; },
    select,
    hourNow: () => Math.floor(st.t + 1e-6),
    /* Who flagged which deteriorating bed, and how early. */
    summary() {
      const now = Math.floor(st.t + 1e-6);
      const systems = {
        news: (b) => { const k = b.series.findIndex((s, t) => t <= now && s.alertN); return k < 0 ? null : k; },
        model: (b) => { const k = b.series.findIndex((s, t) => t <= now && s.risk >= st.thr); return k < 0 ? null : k; },
        you: (b, i) => (st.calls.has(i) ? st.calls.get(i) : null),
      };
      const out = { hour: now, clock: clock(WARD.startHour, Math.min(now, st.hours)), done: st.t >= st.hours, mode: st.mode, events: 0, systems: {} };
      const evBeds = st.beds.map((b, i) => [b, i]).filter(([b]) => b.eventHour != null && b.eventHour <= now);
      out.events = evBeds.length;
      out.eventsTotal = st.beds.filter((b) => b.eventHour != null).length;
      for (const [name, first] of Object.entries(systems)) {
        let caught = 0, lead = 0, falseA = 0, flagged = 0, late = 0;
        st.beds.forEach((b, i) => {
          const f = first(b, i);
          if (f == null) return;
          flagged++;
          if (b.eventHour == null) { if (out.done) falseA++; return; }
          if (f < b.eventHour) { caught++; lead += b.eventHour - f; } else late++;
        });
        out.systems[name] = { flagged, caught, late, falseA, lead: caught ? lead / caught : null };
      }
      return out;
    },
    layout,
    start() { requestAnimationFrame(frame); },
  };
  window.addEventListener('resize', () => layout());
  return api;
}
