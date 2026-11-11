/* ============================================================
   views/plot.js — the catalogue as a navigable space. Every
   planet on a real diagram: radius against insolation (the
   radius valley), radius against period, mass against radius
   with the Chen & Kipping relation and the Seager et al. 2007
   composition curves, discoveries per year by method, and the
   host stars on the sky. Hover names a point; click flies the
   survey to it; drag a box to filter every view.
   ============================================================ */

import { PLOTS, PLOT_ORDER, SOLAR, VALLEY, METHOD_GROUPS, CHEN_KIPPING, LIMITS, RV } from '../config.js';
import { insolation, valleyHistogram, radiusFromMass, seagerRadius, SEAGER_MATERIALS } from '../science.js';
import { tokens, alpha, surface, logScale, linScale, isNum, fmt, fmtInt, esc } from './common.js';

const M = { l: 40, r: 12, t: 12, b: 26 };

/* the value a diagram plots for a planet on one axis */
export function plotValue(p, key) {
  if (key === 'S') return insolation(p).S;
  if (key === 'R') return p.R;
  if (key === 'P') return p.P;
  // a mass limit is a bound, not a point (catalog.js already moved it out of p.M)
  if (key === 'M') return isNum(p.M) && !p.Mlim && p.Mprov !== 'M-R relationship' ? p.M : null;
  return null;
}

const methodInk = (m) => (METHOD_GROUPS.find((g) => g.key === m) || METHOD_GROUPS[METHOD_GROUPS.length - 1]).ink;

export function createPlot(host, store, actions) {
  host.innerHTML = `
    <div class="view-head">
      <div class="tabs" role="tablist" aria-label="Catalogue diagram">${PLOT_ORDER.map((k) =>
        `<button type="button" role="tab" class="tab" data-plot="${k}">${PLOTS[k].label}</button>`).join('')}</div>
    </div>
    <div class="plot-wrap"><canvas class="plot-cv" tabindex="0" role="img"></canvas><div class="tip" hidden></div>
      <label class="sel cby"><span class="sr">Colour points by</span><select data-k="cby">
        <option value="none">ink</option><option value="method">by method</option><option value="year">by year</option></select></label></div>
    <p class="view-cap" aria-live="polite"></p>`;
  const cv = host.querySelector('canvas');
  const tip = host.querySelector('.tip');
  const cap = host.querySelector('.view-cap');
  const tabs = [...host.querySelectorAll('.tab')];
  const cby = host.querySelector('[data-k="cby"]');
  tabs.forEach((b) => b.addEventListener('click', () => actions.setPlot(b.dataset.plot)));
  cby.addEventListener('change', () => { store.state.colorBy = cby.value; surf.redraw(); });

  let pts = null;          // Float32Array [x, y, idx] of drawn points for hit tests
  let bars = [];           // timeline bars for hit tests
  let hover = null;
  let valleyStats = null;
  let box = null;          // the current plot rectangle
  let sx = null, sy = null, proj = null;
  let brush = null;        // {x0,y0,x1,y1} while dragging

  const T = tokens();
  const surf = surface(cv, draw);

  function inkFor(p, a) {
    const cb = store.state.colorBy;
    if (cb === 'method') return methodInk(p.method).replace(/[\d.]+\)$/, `${Math.min(1, a * 1.9)})`);
    if (cb === 'year' && isNum(p.year)) {
      const t = Math.max(0, Math.min(1, (p.year - 1995) / 31));
      const c = [86 + t * (234 - 86), 93 + t * (240 - 93), 114 + t * (251 - 114)].map(Math.round);
      return `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, a * 1.8)})`;
    }
    return alpha(T.text, a);
  }

  function axesLog(ctx, w, h, cfg) {
    const x0 = M.l, x1 = w - M.r, y0 = h - M.b, y1 = M.t;
    sx = cfg.xRev ? logScale(cfg.xRange[0], cfg.xRange[1], x1, x0) : logScale(cfg.xRange[0], cfg.xRange[1], x0, x1);
    sy = logScale(cfg.yRange[0], cfg.yRange[1], y0, y1);
    ctx.lineWidth = 1;
    ctx.font = T.fontSm; ctx.fillStyle = T.faint;
    const decades = (lo, hi) => { const a = []; for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) a.push(e); return a; };
    for (const e of decades(...cfg.xRange)) {
      for (let m = 1; m < 10; m++) {
        const v = m * Math.pow(10, e);
        if (v < cfg.xRange[0] || v > cfg.xRange[1]) continue;
        const x = Math.round(sx(v)) + 0.5;
        ctx.strokeStyle = m === 1 ? alpha(T.horizon, 0.10) : alpha(T.horizon, 0.035);
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y0); ctx.stroke();
        if (m === 1) { ctx.textAlign = 'center'; ctx.fillText(tickLabel(v), x, y0 + 13); }
      }
    }
    for (const e of decades(...cfg.yRange)) {
      for (let m = 1; m < 10; m++) {
        const v = m * Math.pow(10, e);
        if (v < cfg.yRange[0] || v > cfg.yRange[1]) continue;
        const y = Math.round(sy(v)) + 0.5;
        ctx.strokeStyle = m === 1 ? alpha(T.horizon, 0.10) : alpha(T.horizon, 0.035);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        if (m === 1 || (m === 3 && e === 0)) { ctx.textAlign = 'right'; ctx.fillText(tickLabel(v), x0 - 5, y + 3); }
      }
    }
    ctx.strokeStyle = alpha(T.horizon, 0.22);
    ctx.strokeRect(x0 + 0.5, y1 + 0.5, x1 - x0, y0 - y1);
    ctx.fillStyle = T.dim; ctx.font = T.fontSm;
    ctx.textAlign = 'right'; ctx.fillText(cfg.xLabel.toUpperCase(), x1, y0 + 23);
    ctx.save(); ctx.translate(10, y1); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right';
    ctx.fillText(cfg.yLabel.toUpperCase(), 0, 0); ctx.restore();
    return { x0, x1, y0, y1 };
  }

  function draw(ctx, w, h) {
    const st = store.state;
    const mode = st.plot;
    tabs.forEach((b) => { const on = b.dataset.plot === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    cby.value = st.colorBy || 'none';
    if (!st.list.length) return;
    bars = []; pts = null; proj = null; box = null;
    if (mode === 'time') drawTimeline(ctx, w, h, st);
    else if (mode === 'sky') drawSky(ctx, w, h, st);
    else drawScatter(ctx, w, h, st, mode);
    if (isNum(st.filter.upTo)) {
      ctx.fillStyle = alpha(T.gold, 0.9); ctx.font = '600 22px "IBM Plex Mono", ui-monospace, monospace'; ctx.textAlign = 'right';
      ctx.fillText(String(st.filter.upTo), w - M.r - 6, M.t + 26);
    }
    if (hover) drawHover(ctx, hover);
    if (brush) {
      ctx.strokeStyle = alpha(T.gold, 0.9); ctx.fillStyle = alpha(T.gold, 0.06); ctx.setLineDash([3, 3]);
      const x = Math.min(brush.x0, brush.x1), y = Math.min(brush.y0, brush.y1);
      ctx.fillRect(x, y, Math.abs(brush.x1 - brush.x0), Math.abs(brush.y1 - brush.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(brush.x1 - brush.x0), Math.abs(brush.y1 - brush.y0)); ctx.setLineDash([]);
    }
    cv.setAttribute('aria-label', ariaFor(st));
  }

  function drawScatter(ctx, w, h, st, mode) {
    const cfg = PLOTS[mode];
    box = axesLog(ctx, w, h, cfg);
    if (mode === 'valley') {
      const ya = sy(VALLEY.hi), yb = sy(VALLEY.lo);
      ctx.fillStyle = alpha(T.horizon, 0.07); ctx.fillRect(box.x0, ya, box.x1 - box.x0, yb - ya);
      ctx.strokeStyle = alpha(T.horizon, 0.3); ctx.setLineDash([3, 4]);
      for (const y of [ya, yb]) { ctx.beginPath(); ctx.moveTo(box.x0, Math.round(y) + 0.5); ctx.lineTo(box.x1, Math.round(y) + 0.5); ctx.stroke(); }
      ctx.setLineDash([]);
      drawValleyHistogram(ctx, box, st);
    }
    if (mode === 'mr') drawRelation(ctx, box);
    if (mode === 'rp') drawLimits(ctx, box);
    const f = st.filterFn;
    const sel = st.sel;
    const arr = [];
    const upTo = st.filter.upTo;
    // two passes: the dimmed field, then the matches on top
    for (let pass = 0; pass < 2; pass++) {
      for (const p of st.list) {
        if (isNum(upTo) && !(isNum(p.year) && p.year <= upTo)) continue;
        const match = f(p);
        if ((pass === 0) === match && st.filterActive) continue;
        if (pass === 1 && !st.filterActive) continue;
        const vx = plotValue(p, cfg.x), vy = plotValue(p, cfg.y);
        if (!isNum(vx) || !isNum(vy) || vx <= 0 || vy <= 0) continue;
        const x = sx(vx), y = sy(vy);
        if (x < box.x0 - 2 || x > box.x1 + 2 || y < box.y1 - 2 || y > box.y0 + 2) continue;
        const measured = p.measuredR !== false && !(mode === 'mr' && p.Mprov !== 'Mass');
        let a = measured ? 0.42 : 0.16;
        if (st.filterActive) a = match ? 0.85 : 0.06;
        const ink = inkFor(p, a);
        if (measured) { ctx.fillStyle = ink; ctx.fillRect(x - 1, y - 1, 2.2, 2.2); }
        else { ctx.strokeStyle = ink; ctx.strokeRect(x - 1.5, y - 1.5, 3, 3); }
        arr.push(x, y, p.idx);
      }
    }
    pts = new Float32Array(arr);
    if (mode === 'valley') {
      ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'left';
      ctx.fillText('RADIUS VALLEY 1.5-2.0 R⊕', box.x0 + 6, sy(VALLEY.hi) - 4);
    }
    // the selected planet's siblings
    if (sel) {
      for (const p of st.system) {
        if (p === sel) continue;
        const vx = plotValue(p, cfg.x), vy = plotValue(p, cfg.y);
        if (!isNum(vx) || !isNum(vy)) continue;
        ctx.strokeStyle = alpha(T.goldSoft, 0.55); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx(vx), sy(vy), 3.5, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // solar system
    ctx.font = T.fontSm;
    for (const s of SOLAR) {
      const vx = mode === 'valley' ? s.S : mode === 'rp' ? s.P : s.M;
      const x = sx(vx), y = sy(s.R);
      ctx.strokeStyle = alpha(T.horizon, 0.9); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = T.horizon; ctx.textAlign = 'left'; ctx.fillText(s.short, x + 5, y - 4);
    }
    if (sel) {
      const vx = plotValue(sel, cfg.x), vy = plotValue(sel, cfg.y);
      if (isNum(vx) && isNum(vy) && vx > 0) {
        const x = sx(vx), y = sy(vy);
        ctx.strokeStyle = alpha(T.gold, 0.35); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(box.x0, y); ctx.moveTo(x, y); ctx.lineTo(x, box.y0); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.gold; ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = alpha(T.gold, 0.8); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = T.goldSoft; ctx.font = T.font; ctx.textAlign = x > (box.x0 + box.x1) / 2 ? 'right' : 'left';
        ctx.fillText(sel.name, x + (ctx.textAlign === 'right' ? -12 : 12), y - 9);
      } else if (mode === 'mr' || !isNum(sel.R)) {
        // the selection is not a point here: say why, with the archive bound when there is one
        const lim = sel.lim || {};
        const why = !isNum(sel.R) ? (lim.R ? `radius ${lim.R.dir > 0 ? '<' : '>'} ${fmt(lim.R.v)} R⊕ is a bound, not plotted` : 'no radius, not plotted')
          : lim.M ? `mass ${lim.M.dir > 0 ? '<' : '>'} ${fmt(lim.M.v)} M⊕ is a bound, not plotted` : 'no measured mass';
        // bottom left, clear of the colour selector in the top right corner
        ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'left';
        ctx.fillText(`${sel.name}: ${why}`, box.x0 + 6, box.y0 - 6);
      }
    }
    // a brushed box from this diagram
    const b = st.filter.box;
    if (b && b.mode === mode) {
      const xa = sx(b.x[0]), xb = sx(b.x[1]), ya = sy(b.y[0]), yb = sy(b.y[1]);
      ctx.strokeStyle = alpha(T.gold, 0.7); ctx.setLineDash([3, 3]);
      ctx.strokeRect(Math.min(xa, xb) + 0.5, Math.min(ya, yb) + 0.5, Math.abs(xb - xa), Math.abs(yb - ya)); ctx.setLineDash([]);
    }
    caption(mode, st);
  }

  function drawValleyHistogram(ctx, bx, st) {
    if (!valleyStats || valleyStats.listLen !== st.list.length) { valleyStats = valleyHistogram(st.list); valleyStats.listLen = st.list.length; }
    const V = valleyStats, maxC = Math.max(...V.h), wMax = Math.min(70, (bx.x1 - bx.x0) * 0.2);
    for (let i = 0; i < V.bins; i++) {
      const r0 = Math.pow(10, V.lo + i * (V.hi - V.lo) / V.bins), r1 = Math.pow(10, V.lo + (i + 1) * (V.hi - V.lo) / V.bins);
      const y0 = sy(r1), y1 = sy(r0), bw = V.h[i] / maxC * wMax;
      const inV = V.centre(i) >= VALLEY.lo && V.centre(i) <= VALLEY.hi;
      ctx.fillStyle = alpha(T.horizon, inV ? 0.34 : 0.2);
      ctx.fillRect(bx.x1 - bw, y0 + 0.5, bw, Math.max(1, y1 - y0 - 1));
    }
    ctx.fillStyle = T.faint; ctx.font = T.fontSm; ctx.textAlign = 'right';
    ctx.fillText(`KEPLER, P<100 d, σR<10%: ${V.n}`, bx.x1 - 4, sy(6) - 4);
  }

  function drawRelation(ctx, bx) {
    const step = 0.02;
    // composition curves, Seager et al. 2007, up to 20 M_earth
    ctx.lineWidth = 1; ctx.font = T.fontSm; ctx.textAlign = 'left';
    SEAGER_MATERIALS.forEach((mat, j) => {
      ctx.strokeStyle = alpha(T.text, 0.45); ctx.setLineDash(j === 2 ? [2, 3] : j === 0 ? [6, 3] : []);
      ctx.beginPath();
      let last = null;
      for (let lm = Math.log10(0.1); lm <= Math.log10(20) + 1e-9; lm += step) {
        const m = Math.pow(10, lm), x = sx(m), y = sy(seagerRadius(m, mat));
        last ? ctx.lineTo(x, y) : ctx.moveTo(x, y); last = [x, y];
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.dim; ctx.fillText(mat.label, last[0] + 3, last[1] + 3);
    });
    ctx.strokeStyle = alpha(T.horizon, 0.85); ctx.lineWidth = 1.2; ctx.beginPath();
    let first = true;
    for (let lm = Math.log10(0.02); lm <= Math.log10(20000); lm += step) {
      const m = Math.pow(10, lm), r = radiusFromMass(m);
      const x = sx(m), y = sy(r);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = alpha(T.horizon, 0.07); ctx.beginPath();
    const up = [], dn = [];
    for (let lm = Math.log10(0.02); lm <= Math.log10(20000); lm += step) {
      const seg = CHEN_KIPPING.segments.find((s) => lm < Math.log10(s.upTo));
      const lr = seg.C + seg.S * lm;
      up.push([sx(Math.pow(10, lm)), sy(Math.pow(10, lr + seg.sigma))]);
      dn.push([sx(Math.pow(10, lm)), sy(Math.pow(10, lr - seg.sigma))]);
    }
    up.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    dn.reverse().forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = T.horizon; ctx.font = T.fontSm; ctx.textAlign = 'left';
    ctx.fillText('CHEN & KIPPING 2017 ±1σ', bx.x0 + 6, bx.y1 + 12);
    ctx.fillStyle = T.dim; ctx.fillText('SEAGER ET AL. 2007: IRON, ROCK, WATER', bx.x0 + 6, bx.y1 + 24);
  }

  /* where surveys can and cannot see: an empty region below a line is an instrument limit */
  function drawLimits(ctx, bx) {
    const L = LIMITS;
    ctx.lineWidth = 1; ctx.font = T.fontSm;
    // transit: SNR = depth / CDPP * sqrt(N * T / 6.5 h), N = baseline / P, T = 13 h (P / 365 d)^(1/3)
    ctx.strokeStyle = alpha(T.text, 0.5); ctx.setLineDash([5, 3]);
    ctx.beginPath(); let first = true, last = null;
    const pMax = L.baselineDays / L.minTransits;
    for (let lp = Math.log10(0.3); lp <= Math.log10(pMax); lp += 0.02) {
      const P = Math.pow(10, lp), N = L.baselineDays / P, Td = 13 * Math.cbrt(P / 365.25);
      const depth = L.snr * L.cdppPpm * 1e-6 / Math.sqrt(N * Td / 6.5);
      const R = Math.sqrt(depth) * L.rSunEarth;
      const x = sx(P), y = sy(R); first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false; last = [x, y];
    }
    ctx.lineTo(last[0], sy(30)); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.textAlign = 'right'; ctx.fillText('TRANSIT LIMIT', last[0] - 4, last[1] + 11);
    // radial velocity: K = 1 m/s around a Sun-like star -> M sin i, then radius from Chen & Kipping
    ctx.setLineDash([1, 3]); ctx.beginPath(); first = true;
    for (let lp = Math.log10(0.3); lp <= 5; lp += 0.02) {
      const P = Math.pow(10, lp);
      const M = L.rvFloor / RV.k0 * RV.mJupEarth * Math.cbrt(P / 365.25);
      const R = radiusFromMass(M);
      const x = sx(P), y = sy(R); first ? ctx.moveTo(x, y) : ctx.lineTo(x, y); first = false; last = [x, y];
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'right'; ctx.fillText('RV 1 m/s', bx.x1 - 4, Math.max(bx.y1 + 10, last[1] - 4));
  }

  function drawTimeline(ctx, w, h, st) {
    const counts = new Map();
    let y0 = Infinity, y1 = -Infinity, maxC = 0;
    for (const p of st.list) {
      if (!isNum(p.year)) continue;
      const g = METHOD_GROUPS.find((m) => m.key === p.method) ? p.method : 'other';
      if (!counts.has(p.year)) counts.set(p.year, {});
      const c = counts.get(p.year); c[g] = (c[g] || 0) + 1;
      y0 = Math.min(y0, p.year); y1 = Math.max(y1, p.year);
    }
    for (const c of counts.values()) maxC = Math.max(maxC, Object.values(c).reduce((s, x) => s + x, 0));
    const bx = { x0: M.l, x1: w - M.r, y0: h - M.b, y1: M.t + 14 };
    const sxl = linScale(y0 - 0.5, y1 + 0.5, bx.x0, bx.x1);
    const syl = linScale(0, maxC * 1.05, bx.y0, bx.y1);
    ctx.font = T.fontSm; ctx.lineWidth = 1;
    for (let v = 0; v <= maxC; v += maxC > 1200 ? 500 : 200) {
      const y = Math.round(syl(v)) + 0.5;
      ctx.strokeStyle = alpha(T.horizon, 0.07); ctx.beginPath(); ctx.moveTo(bx.x0, y); ctx.lineTo(bx.x1, y); ctx.stroke();
      ctx.fillStyle = T.faint; ctx.textAlign = 'right'; ctx.fillText(fmtInt(v), bx.x0 - 5, y + 3);
    }
    const bw = Math.max(2, (bx.x1 - bx.x0) / (y1 - y0 + 1) - 2);
    const upTo = st.filter.upTo;
    for (let yr = y0; yr <= y1; yr++) {
      const c = counts.get(yr) || {};
      let acc = 0;
      const x = sxl(yr) - bw / 2;
      ctx.globalAlpha = isNum(upTo) && yr > upTo ? 0.15 : 1;
      for (const g of METHOD_GROUPS) {
        const n = c[g.key] || 0; if (!n) continue;
        const ya = syl(acc), yb = syl(acc + n);
        ctx.fillStyle = g.ink; ctx.fillRect(x, yb, bw, ya - yb);
        acc += n;
      }
      ctx.globalAlpha = 1;
      bars.push({ yr, x, w: bw, top: syl(acc), c, total: acc });
      if (yr % 5 === 0) { ctx.fillStyle = T.faint; ctx.textAlign = 'center'; ctx.fillText(String(yr), sxl(yr), bx.y0 + 13); }
      if (st.filter.year === yr) { ctx.strokeStyle = T.goldSoft; ctx.strokeRect(x - 1.5, syl(acc) - 1.5, bw + 3, bx.y0 - syl(acc) + 1.5); }
    }
    ctx.strokeStyle = alpha(T.horizon, 0.22); ctx.beginPath(); ctx.moveTo(bx.x0, bx.y0 + 0.5); ctx.lineTo(bx.x1, bx.y0 + 0.5); ctx.stroke();
    let lx = bx.x0 + 4;
    ctx.textAlign = 'left';
    for (const g of METHOD_GROUPS) {
      ctx.fillStyle = g.ink; ctx.fillRect(lx, M.t - 2, 7, 7);
      ctx.fillStyle = T.dim; ctx.fillText(g.label, lx + 10, M.t + 5);
      lx += 14 + ctx.measureText(g.label).width + 8;
    }
    const sel = st.sel;
    if (sel && isNum(sel.year)) {
      const x = sxl(sel.year);
      ctx.strokeStyle = alpha(T.gold, 0.9); ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, bx.y1); ctx.lineTo(x, bx.y0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.goldSoft; ctx.font = T.font; ctx.textAlign = x > w * 0.6 ? 'right' : 'left';
      ctx.fillText(`${sel.name} · ${sel.year}`, x + (ctx.textAlign === 'right' ? -6 : 6), bx.y1 + 10);
    }
    caption('time', st, { counts });
  }

  /* Hammer-Aitoff, right ascension increasing to the left as on the sky. */
  function drawSky(ctx, w, h, st) {
    const cx = w / 2, cy = h / 2;
    const R = Math.min((w - 20) / (4 * Math.SQRT2), (h - 24) / (2 * Math.SQRT2));
    proj = (ra, dec) => {
      const l = (ra > 180 ? ra - 360 : ra) * Math.PI / 180, b = dec * Math.PI / 180;
      const d = Math.sqrt(1 + Math.cos(b) * Math.cos(l / 2));
      return [cx - R * 2 * Math.SQRT2 * Math.cos(b) * Math.sin(l / 2) / d, cy - R * Math.SQRT2 * Math.sin(b) / d];
    };
    ctx.lineWidth = 1;
    ctx.strokeStyle = alpha(T.horizon, 0.08);
    for (let ra = -150; ra <= 150; ra += 30) {
      ctx.beginPath();
      for (let dec = -90; dec <= 90; dec += 3) { const [x, y] = proj((ra + 360) % 360, dec); dec === -90 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (let dec = -60; dec <= 60; dec += 30) {
      ctx.beginPath();
      for (let ra = -179.9; ra <= 179.9; ra += 3) { const [x, y] = proj((ra + 360) % 360, dec); ra === -179.9 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = alpha(T.horizon, 0.22);
    ctx.beginPath(); ctx.ellipse(cx, cy, 2 * Math.SQRT2 * R, Math.SQRT2 * R, 0, 0, Math.PI * 2); ctx.stroke();
    const f = st.filterFn, arr = [], upTo = st.filter.upTo;
    for (const p of st.list) {
      if (!isNum(p.ra) || !isNum(p.dec)) continue;
      if (isNum(upTo) && !(isNum(p.year) && p.year <= upTo)) continue;
      const [x, y] = proj(p.ra, p.dec);
      const match = f(p);
      ctx.fillStyle = inkFor(p, st.filterActive ? (match ? 0.85 : 0.06) : 0.4);
      ctx.fillRect(x - 1, y - 1, 2, 2);
      arr.push(x, y, p.idx);
    }
    pts = new Float32Array(arr);
    ctx.fillStyle = T.faint; ctx.font = T.fontSm; ctx.textAlign = 'center';
    ctx.fillText('RA 0h', proj(0.001, 0)[0], cy + 11);
    ctx.textAlign = 'left'; ctx.fillText('Dec +60', proj(0, 60)[0] + 4, proj(0, 60)[1]);
    const sel = st.sel;
    if (sel && isNum(sel.ra)) {
      const [x, y] = proj(sel.ra, sel.dec);
      ctx.fillStyle = T.gold; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(T.gold, 0.8); ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = T.goldSoft; ctx.font = T.font; ctx.textAlign = x > cx ? 'right' : 'left';
      ctx.fillText(sel.host, x + (x > cx ? -12 : 12), y - 9);
    }
    caption('sky', st);
  }

  function drawHover(ctx, hv) {
    ctx.strokeStyle = T.bright; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hv.x, hv.y, 5.5, 0, Math.PI * 2); ctx.stroke();
  }

  function caption(mode, st, extra) {
    let t = '';
    if (mode === 'valley') {
      const V = valleyStats;
      t = V ? `[REAL] Bars: Kepler planets, P < 100 d, radius to 10% (${V.n}). The emptiest bin in 1.5-2.0 R⊕ holds ${V.valleyMin}, against ${V.peakBelow} below and ${V.peakAbove} above. ${VALLEY.ref}: a deficit of 2x or more.` : '';
    } else if (mode === 'rp') {
      t = '[REAL] A transit is seen with probability about R★/a, so close orbits dominate. [ILLUSTRATIVE] Dashed: what Kepler could detect around a Sun-like star (30 ppm, 4 yr, SNR 7.1, 3 transits); dotted: a 1 m/s velocity floor. Drag a box to filter.';
    } else if (mode === 'mr') {
      const nLim = st.list.filter((p) => p.lim && p.lim.M).length;
      t = `[REAL] Measured masses only (hollow: minimum mass); the ${fmtInt(nLim)} masses the archive gives only as limits are bounds, not points, and are left off. Below the rock line a world needs iron; above the water line, a gas envelope.`;
    } else if (mode === 'time') {
      const c2014 = extra.counts.get(2014), c2016 = extra.counts.get(2016);
      const s = (c) => c ? Object.values(c).reduce((a, b) => a + b, 0) : 0;
      t = `[REAL] Every confirmed planet by discovery year: ${fmtInt(s(c2014))} in 2014 and ${fmtInt(s(c2016))} in 2016, the Kepler validation years. Click a year to filter.`;
    } else if (mode === 'sky') {
      t = '[REAL] Host stars on the sky, Hammer projection. The dense patch near RA 19h, Dec +44 is the one field Kepler watched for four years.';
    }
    cap.textContent = t;
  }

  function ariaFor(st) {
    const sel = st.sel;
    return `${PLOTS[st.plot].label} diagram of ${st.list.length} planets` + (sel ? `, ${sel.name} highlighted` : '');
  }

  function nearest(mx, my) {
    if (!pts) return null;
    let best = null, bd = 64;
    for (let i = 0; i < pts.length; i += 3) {
      const dx = pts[i] - mx, dy = pts[i + 1] - my, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: pts[i], y: pts[i + 1], idx: pts[i + 2] }; }
    }
    return best;
  }

  function barAt(mx) { return bars.find((b) => mx >= b.x - 1 && mx <= b.x + b.w + 1) || null; }

  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const r = cv.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(4, x + 12), r.width - tw - 4) + 'px';
    tip.style.top = Math.max(4, y - 34) + 'px';
  }

  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let down = null;
  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = local(e);
    down = { x: mx, y: my, id: e.pointerId };
  });
  cv.addEventListener('pointermove', (e) => {
    const [mx, my] = local(e);
    const st = store.state;
    if (down && box && st.plot !== 'time' && st.plot !== 'sky' && e.pointerType === 'mouse' && Math.hypot(mx - down.x, my - down.y) > 5) {
      brush = { x0: down.x, y0: down.y, x1: mx, y1: my };
      try { cv.setPointerCapture(down.id); } catch (_) { /* ignore */ }
      tip.hidden = true; surf.redraw(); return;
    }
    if (st.plot === 'time') {
      const b = barAt(mx);
      hover = null;
      if (b) showTip(`<b>${b.yr}</b> · ${fmtInt(b.total)} planets<br>${METHOD_GROUPS.filter((g) => b.c[g.key]).map((g) => `${g.label} ${b.c[g.key]}`).join(' · ')}`, mx, my);
      else tip.hidden = true;
      cv.style.cursor = b ? 'pointer' : 'default';
      return;
    }
    const n = nearest(mx, my);
    const changed = (n && n.idx) !== (hover && hover.idx);
    hover = n;
    if (n) {
      const p = st.list[n.idx];
      const S = insolation(p).S;
      showTip(`<b>${esc(p.name)}</b><br>${fmt(p.R)} R⊕ · ${isNum(p.P) ? fmt(p.P) + ' d' : '—'} · ${isNum(S) ? fmt(S) + ' S⊕' : '—'}${isNum(p.year) ? ' · ' + p.year : ''}`, mx, my);
    } else tip.hidden = true;
    cv.style.cursor = n ? 'pointer' : 'crosshair';
    if (changed) surf.redraw();
  });
  cv.addEventListener('pointerleave', () => { if (brush) return; hover = null; tip.hidden = true; surf.redraw(); });
  cv.addEventListener('pointerup', (e) => {
    const [mx, my] = local(e);
    const st = store.state;
    const wasDown = down; down = null;
    if (brush) {
      const b = brush; brush = null;
      const cfg = PLOTS[st.plot];
      const xs = [sx.inv(b.x0), sx.inv(b.x1)].sort((p, q) => p - q), ys = [sy.inv(b.y0), sy.inv(b.y1)].sort((p, q) => p - q);
      actions.setFilter({ box: { mode: st.plot, xKey: cfg.x, yKey: cfg.y, x: xs, y: ys } });
      return;
    }
    if (!wasDown) return;
    if (st.plot === 'time') { const b = barAt(mx); if (b) actions.setFilter({ year: st.filter.year === b.yr ? null : b.yr }); return; }
    const n = nearest(mx, my);
    if (n) actions.select(st.list[n.idx], { from: 'plot' });
  });
  // keyboard: arrows step to the nearest planet in that direction; Enter is not needed (selection follows)
  cv.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !pts || !store.state.sel) return;
    e.preventDefault();
    const st = store.state, cur = st.sel;
    let me = null;
    for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] === cur.idx) me = [pts[i], pts[i + 1]];
    if (!me) return;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    let best = null, bs = Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      const dx = pts[i] - me[0], dy = pts[i + 1] - me[1];
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0.5) continue;
      const perp = Math.abs(dx * dir[1] - dy * dir[0]);
      const score = along + perp * 2.5;
      if (score < bs) { bs = score; best = pts[i + 2]; }
    }
    if (best !== null) actions.select(st.list[best], { from: 'plot' });
  });

  return { redraw: () => surf.redraw(), resetStats: () => { valleyStats = null; } };
}

function tickLabel(v) {
  if (v >= 1000) return (v / 1000) + 'k';
  return String(+v.toPrecision(2));
}
