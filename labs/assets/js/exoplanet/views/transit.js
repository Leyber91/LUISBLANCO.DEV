/* ============================================================
   views/transit.js — what the planet does to its star's light
   and motion. Transit: depth from (Rp/Rs)^2 with quadratic limb
   darkening (Claret & Bloemen 2011), integrated over the planet's
   disc; duration from Seager & Mallen-Ornelas 2003, eq. 3; drawn
   against the archive's measured depth and duration, with the
   host's other transiting planets overlaid. Radial velocity: the
   star's reflex motion, K from Lovis & Fischer 2010, eq. 14.
   The discovery method decides which one leads. Drag to scrub.
   ============================================================ */

import { transitGeometry, lightCurve, fluxAt, transitCheck, starColour, rvCurve, isNum } from '../science.js';
import { LIMB } from '../config.js';
import { tokens, alpha, surface, fmt, reducedMotion } from './common.js';

export function createTransit(host, store) {
  host.innerHTML = `
    <div class="view-head"><span class="view-k">Signal</span>
      <div class="tabs" role="tablist" aria-label="Signal"><button type="button" role="tab" class="tab" data-sig="transit">Transit</button><button type="button" role="tab" class="tab" data-sig="rv">Radial velocity</button></div>
      <span class="view-v" data-k="tv">—</span></div>
    <div class="tr-wrap"><canvas class="tr-cv" role="img" tabindex="0"></canvas></div>
    <p class="view-cap" data-k="tcap"></p>`;
  const cv = host.querySelector('canvas');
  const vEl = host.querySelector('[data-k="tv"]');
  const capEl = host.querySelector('[data-k="tcap"]');
  const tabs = [...host.querySelectorAll('[data-sig]')];
  const T = tokens();
  const still = reducedMotion() || window.__EXO_STILL__ || window.__EXO_LOWPOWER__;
  let m = null, raf = 0, visible = true, t0 = performance.now();
  let mode = 'transit', userMode = null, scrub = null;   // scrub: phase 0..1 held by the visitor
  const surf = surface(cv, draw);

  tabs.forEach((b) => b.addEventListener('click', () => { userMode = b.dataset.sig; mode = userMode; build(); surf.redraw(); }));

  function build() {
    const sel = store.state.sel;
    m = null; scrub = null;
    if (!sel) return;
    // the discovery method leads, unless the visitor chose
    if (!userMode) mode = sel.method === 'Radial Velocity' ? 'rv' : 'transit';
    tabs.forEach((b) => { const on = b.dataset.sig === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    if (mode === 'rv') return buildRV(sel);
    const geo = transitGeometry(sel);
    if (!geo) { vEl.textContent = 'not computable'; capEl.textContent = !isNum(sel.R) ? '[REAL] No planet radius measured: no light curve.' :'[REAL] The archive lacks the stellar radius, orbit or period needed for a light curve.'; return; }
    const span = Math.max(geo.T14 * 0.85, 0.6);
    const curve = lightCurve(geo, sel.P, span, 180);
    const chk = transitCheck(sel, geo);
    // the host's other transiting planets, aligned at mid-transit, for comparison
    const sibs = store.state.system.filter((q) => q !== sel && q.method === 'Transit').map((q) => {
      const g = transitGeometry(q); return g ? { q, curve: lightCurve(g, q.P, span, 120) } : null;
    }).filter(Boolean);
    m = { kind: 'transit', sel, geo, span, curve, chk, sibs, colour: starColour(sel.Teff) };
    const ppm = geo.depthLD * 1e6;
    vEl.textContent = `${fmt(ppm >= 1e4 ? ppm / 1e4 : ppm, 3)} ${ppm >= 1e4 ? '%' : 'ppm'} · ${fmt(geo.T14, 3)} h`;
    let txt;
    if (geo.transits) {
      const meas = [chk && chk.depth ? `${fmt(chk.depth.measured * 1e4, 3)} ppm` : null, chk && chk.dur ? `${fmt(chk.dur.measured, 3)} h` : null].filter(Boolean);
      const lim = (k, u) => (sel.lim && sel.lim[k] ? `${sel.lim[k].dir > 0 ? '<' : '>'} ${fmt(sel.lim[k].v, 3)}${u} (${sel.lim[k].dir > 0 ? 'upper' : 'lower'} limit)` : null);
      const measAll = [...meas, lim('depth', '%'), lim('dur', ' h')].filter(Boolean);
      const bTxt = geo.bMeasured ? fmt(geo.b, 2) : geo.bLimit ? `${fmt(geo.b, 2)} (assumed; archive gives only ${lim('b', '')})` : '0 (assumed)';
      txt = `[REAL] Model ${fmt(ppm, 3)} ppm, ${fmt(geo.T14, 3)} h · measured ${measAll.length ? measAll.join(', ') : 'none in the archive'} · b ${bTxt}, circular orbit.${sibs.length ? ` Faint: ${sibs.length} sibling${sibs.length > 1 ? 's' : ''}.` : ''}`;
    } else {
      txt = `[ILLUSTRATIVE] Not seen in transit: a random orientation transits ${fmt(geo.geomProb * 100, 2)}% of the time. This is the curve if it did.`;
    }
    capEl.textContent = txt;
    t0 = performance.now();
  }

  function buildRV(sel) {
    const rv = rvCurve(sel);
    if (!rv) { vEl.textContent = 'not computable'; capEl.textContent = '[REAL] The archive lacks the stellar mass or the period needed for a velocity curve.'; return; }
    m = { kind: 'rv', sel, rv, colour: starColour(sel.Teff) };
    vEl.textContent = `K ${fmt(rv.K, 3)} m/s`;
    const src = rv.massSrc === 'measured' ? 'the measured mass' : rv.massSrc === 'minimum' ? 'the minimum mass (M sin i)' : rv.bounded ? `the forecast mass, cut by the archive's ${rv.bounded} limit` : 'the forecast mass';
    const eTxt = rv.eLimit ? `e only a bound (${rv.eLimit.dir > 0 ? '<' : '>'} ${fmt(rv.eLimit.v, 2)}), drawn 0` : `e ${fmt(rv.e, 2)}`;
    capEl.textContent = `[REAL] Semi-amplitude from ${src}, P and the star's mass (Lovis & Fischer 2010, eq. 14), ${eTxt}. [ILLUSTRATIVE] periastron angle 90°. The best spectrographs reach about 1 m/s.`;
    t0 = performance.now();
  }

  function phaseNow() { return scrub !== null ? scrub : still ? 0.5 : (((performance.now() - t0) / 7000) % 1); }

  function draw(ctx, w, h) {
    if (!m) return;
    if (m.kind === 'rv') return drawRV(ctx, w, h);
    const { geo, span, curve } = m;
    const topH = Math.round(h * 0.42);
    const sR = Math.min(topH / 2 - 4, w / 4);
    const scx = w / 2, scy = topH / 2 + 2;
    const [r, g, b] = m.colour.srgb.map((c) => Math.round(c * 255));
    const grad = ctx.createRadialGradient(scx, scy, 0, scx, scy, sR);
    for (let i = 0; i <= 8; i++) {
      const rr = i / 8, mu = Math.sqrt(Math.max(0, 1 - rr * rr));
      const I = 1 - LIMB.u1 * (1 - mu) - LIMB.u2 * (1 - mu) * (1 - mu);
      grad.addColorStop(Math.min(rr, 0.999), `rgba(${Math.round(r * I)},${Math.round(g * I)},${Math.round(b * I)},1)`);
    }
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(scx, scy, sR, 0, Math.PI * 2); ctx.fill();
    const chordY = scy + geo.b * sR;
    ctx.strokeStyle = alpha(T.text, 0.35); ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(scx - sR * 1.6, chordY); ctx.lineTo(scx + sR * 1.6, chordY); ctx.stroke(); ctx.setLineDash([]);
    const tH = -span + 2 * span * phaseNow();
    const ph = 2 * Math.PI * (tH / 24) / m.sel.P;
    const px = scx + geo.aRs * Math.sin(ph) * sR;
    const pr = Math.max(1.2, geo.k * sR);
    if (Math.abs(px - scx) < sR * 1.7) {
      ctx.fillStyle = '#05070B'; ctx.beginPath(); ctx.arc(px, chordY, pr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = alpha(T.gold, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, chordY, pr + 2.5, 0, Math.PI * 2); ctx.stroke();
    }
    const bx = { x0: 44, x1: w - 10, y0: h - 20, y1: topH + 12 };
    const depth = 1 - Math.min(...curve.map((c) => c[1]));
    const measuredDepth = m.chk && m.chk.depth ? m.chk.depth.measured / 100 : null;
    const sibDepth = Math.max(0, ...m.sibs.map((s) => 1 - Math.min(...s.curve.map((c) => c[1]))));
    const ymax = Math.max(depth, measuredDepth || 0, Math.min(sibDepth, depth * 3)) * 1.25 || 1e-4;
    const X = (t) => bx.x0 + (t + span) / (2 * span) * (bx.x1 - bx.x0);
    const Y = (f) => Math.min(bx.y0, bx.y1 + (1 - f) / ymax * (bx.y0 - bx.y1));
    ctx.lineWidth = 1; ctx.font = T.fontSm;
    ctx.strokeStyle = alpha(T.horizon, 0.22); ctx.strokeRect(bx.x0 + 0.5, bx.y1 + 0.5, bx.x1 - bx.x0, bx.y0 - bx.y1);
    ctx.fillStyle = T.faint; ctx.textAlign = 'right';
    const unit = ymax > 0.01 ? '%' : 'ppm', k = unit === '%' ? 100 : 1e6;
    for (const f of [0, 0.5, 1]) {
      const v = depth * f, y = Y(1 - v);
      ctx.fillText(fmt(v * k, 2), bx.x0 - 4, y + 3);
      ctx.strokeStyle = alpha(T.horizon, 0.06); ctx.beginPath(); ctx.moveTo(bx.x0, Math.round(y) + 0.5); ctx.lineTo(bx.x1, Math.round(y) + 0.5); ctx.stroke();
    }
    ctx.textAlign = 'left'; ctx.fillText(`−${unit}`, 2, bx.y1 + 8);
    ctx.textAlign = 'center';
    for (const t of [-span, 0, span]) ctx.fillText(`${t > 0 ? '+' : ''}${fmt(t, 2)} h`, X(t), bx.y0 + 13);
    // siblings, faint
    ctx.save(); ctx.beginPath(); ctx.rect(bx.x0, bx.y1, bx.x1 - bx.x0, bx.y0 - bx.y1); ctx.clip();
    for (const s of m.sibs) {
      ctx.strokeStyle = alpha(T.text, 0.22); ctx.lineWidth = 1; ctx.beginPath();
      s.curve.forEach(([t, f], i) => (i ? ctx.lineTo(X(t), Y(f)) : ctx.moveTo(X(t), Y(f))));
      ctx.stroke();
    }
    ctx.restore();
    if (measuredDepth) {
      const y = Y(1 - measuredDepth);
      ctx.strokeStyle = alpha(T.text, 0.55); ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(bx.x0, y); ctx.lineTo(bx.x1, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.dim; ctx.textAlign = 'right'; ctx.fillText('MEASURED DEPTH', bx.x1 - 4, y - 3);
    }
    if (m.chk && m.chk.dur) {
      const half = m.chk.dur.measured / 2;
      ctx.strokeStyle = alpha(T.text, 0.45);
      for (const t of [-half, half]) { const x = X(t); ctx.beginPath(); ctx.moveTo(x, bx.y0 - 6); ctx.lineTo(x, bx.y0); ctx.stroke(); }
    }
    ctx.strokeStyle = T.bright; ctx.lineWidth = 1.3; ctx.beginPath();
    curve.forEach(([t, f], i) => (i ? ctx.lineTo(X(t), Y(f)) : ctx.moveTo(X(t), Y(f))));
    ctx.stroke();
    const fNow = Math.cos(ph) > 0 ? fluxAt(Math.hypot(geo.aRs * Math.sin(ph), geo.b * Math.cos(ph)), geo.k) : 1;
    ctx.strokeStyle = alpha(T.gold, 0.35); ctx.beginPath(); ctx.moveTo(X(tH), bx.y1); ctx.lineTo(X(tH), bx.y0); ctx.stroke();
    ctx.fillStyle = T.gold; ctx.beginPath(); ctx.arc(X(tH), Y(fNow), 3, 0, Math.PI * 2); ctx.fill();
    cv.setAttribute('aria-label', `Transit light curve of ${m.sel.name}: depth ${fmt(depth * 1e6, 3)} ppm, duration ${fmt(geo.T14, 3)} hours`);
  }

  function drawRV(ctx, w, h) {
    const { rv } = m;
    const bx = { x0: 44, x1: w - 10, y0: h - 20, y1: 14 };
    const K = Math.max(...rv.curve.map((c) => Math.abs(c[1])), 1e-6) * 1.2;
    const X = (u) => bx.x0 + u * (bx.x1 - bx.x0), Y = (v) => (bx.y0 + bx.y1) / 2 - v / K * (bx.y0 - bx.y1) / 2;
    ctx.lineWidth = 1; ctx.font = T.fontSm;
    ctx.strokeStyle = alpha(T.horizon, 0.22); ctx.strokeRect(bx.x0 + 0.5, bx.y1 + 0.5, bx.x1 - bx.x0, bx.y0 - bx.y1);
    ctx.strokeStyle = alpha(T.horizon, 0.1); ctx.beginPath(); ctx.moveTo(bx.x0, Y(0)); ctx.lineTo(bx.x1, Y(0)); ctx.stroke();
    // 1 m/s precision band
    if (1 < K) { ctx.fillStyle = alpha(T.horizon, 0.07); ctx.fillRect(bx.x0, Y(1), bx.x1 - bx.x0, Y(-1) - Y(1)); }
    ctx.fillStyle = T.faint; ctx.textAlign = 'right';
    for (const v of [rv.K, 0, -rv.K]) ctx.fillText(fmt(v, 2), bx.x0 - 4, Y(v) + 3);
    ctx.textAlign = 'left'; ctx.fillText('m/s', 2, bx.y1 + 8);
    ctx.textAlign = 'center';
    ctx.fillText('0', X(0), bx.y0 + 13); ctx.fillText(`${fmt(m.sel.P, 3)} d`, X(1) - 14, bx.y0 + 13); ctx.fillText('ORBITAL PHASE', X(0.5), bx.y0 + 13);
    ctx.strokeStyle = T.bright; ctx.lineWidth = 1.3; ctx.beginPath();
    rv.curve.forEach(([u, v], i) => (i ? ctx.lineTo(X(u), Y(v)) : ctx.moveTo(X(u), Y(v))));
    ctx.stroke();
    const u = phaseNow();
    const v = rv.curve[Math.min(rv.curve.length - 1, Math.round(u * (rv.curve.length - 1)))][1];
    ctx.strokeStyle = alpha(T.gold, 0.35); ctx.beginPath(); ctx.moveTo(X(u), bx.y1); ctx.lineTo(X(u), bx.y0); ctx.stroke();
    ctx.fillStyle = T.gold; ctx.beginPath(); ctx.arc(X(u), Y(v), 3, 0, Math.PI * 2); ctx.fill();
    cv.setAttribute('aria-label', `Radial velocity curve of ${m.sel.host}: semi-amplitude ${fmt(rv.K, 3)} metres per second`);
  }

  /* scrub: hold and drag across the curve to move the planet (or the star's velocity) by hand */
  const toPhase = (e) => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left - 44) / Math.max(1, r.width - 54))); };
  cv.addEventListener('pointerdown', (e) => { if (!m) return; scrub = toPhase(e); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } surf.redraw(); });
  cv.addEventListener('pointermove', (e) => { if (scrub === null || !(e.buttons & 1)) return; scrub = toPhase(e); surf.redraw(); });
  cv.addEventListener('pointerup', () => { if (scrub === null) return; t0 = performance.now() - scrub * 7000; scrub = still ? scrub : null; });
  cv.addEventListener('keydown', (e) => {
    if (!m || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault(); scrub = Math.max(0, Math.min(1, (scrub ?? phaseNow()) + (e.key === 'ArrowRight' ? 0.02 : -0.02))); surf.redraw();
  });

  function loop() { raf = 0; if (!visible || still || !m) return; surf.redraw(); raf = requestAnimationFrame(loop); }
  const kick = () => { if (!raf && visible && !still) raf = requestAnimationFrame(loop); };
  if (typeof IntersectionObserver === 'function') new IntersectionObserver((es) => { visible = es[0].isIntersecting && !document.hidden; kick(); }).observe(cv);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });

  return { update() { userMode = null; build(); surf.redraw(); kick(); } };
}
