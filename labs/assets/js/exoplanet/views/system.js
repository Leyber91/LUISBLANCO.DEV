/* ============================================================
   views/system.js — the selected planet's system from above:
   every known planet of the host on its orbit, to scale, moving
   at its catalogue period (Kepler's equation for eccentric
   orbits), the habitable zone of Kopparapu et al. 2013 computed
   from the star, Earth's orbit, and the solar system on demand:
   the view then draws back until Neptune's orbit is inside it,
   so the two systems are seen whole at one scale.
   Click a planet to fly to it.
   ============================================================ */

import { habitableZone, semiMajor, starColour, isNum } from '../science.js';
import { PHYS, SOLAR } from '../config.js';
import { tokens, alpha, surface, fmt, fmtInt, reducedMotion } from './common.js';

function hash01(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h / 4294967296; }

/* eccentric anomaly from mean anomaly (Newton) */
function kepler(Mm, e) { let E = e < 0.8 ? Mm : Math.PI; for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - Mm) / (1 - e * Math.cos(E)); return E; }

/* How far the view reaches from the star, in AU. With the Solar System shown it reaches a little past
   Neptune, or past the system's own outermost orbit when that lies farther: every orbit of the Sun's planets
   is then inside the view, at the system's own scale. */
export const SOLAR_REACH = Math.max(...SOLAR.map((s) => s.a)) * 1.08;
export const viewExtent = (extent, solar) => (solar ? Math.max(extent, SOLAR_REACH) : extent);

/* Where a system's outermost orbit falls among the Sun's planets, as a sentence. outer: the farthest any
   known planet of the host gets from its star, in AU (its orbit drawn as a circle where the archive has no
   eccentricity). An orbit that prints at the same size as one of the Sun's planets' is "about as wide" as it. */
export function solarWords(host, outer) {
  const i = SOLAR.findIndex((s) => s.a > outer), out = i >= 0 ? SOLAR[i] : null, inn = i < 0 ? SOLAR[SOLAR.length - 1] : i > 0 ? SOLAR[i - 1] : null;
  const au = (s) => `${s.name} (${fmt(s.a, 2)} AU)`;
  const printed = (x) => Number(fmt(x, 2).replace(/,/g, ''));
  const same = SOLAR.find((p) => printed(p.a) === printed(outer));   // the two sizes print as one number: "between" would read as a mistake
  const where = same ? `about as wide as the orbit of ${au(same)}` : !out ? `beyond the orbit of ${au(inn)}` : !inn ? `inside the orbit of ${au(out)}` : `between the orbits of ${au(inn)} and ${au(out)}`;
  return `[REAL] On the scale of the Solar System, the outermost known orbit of ${host} reaches ${fmt(outer, 2)} AU, ${where}.`;
}

export function createSystem(host, store, actions = {}) {
  host.innerHTML = `
    <div class="view-head"><span class="view-k">System</span>
      <span class="sys-ctl"><button type="button" class="chip" data-k="play" aria-pressed="true">Pause</button>
      <button type="button" class="chip" data-k="solar" aria-pressed="false">Solar system</button>
      <span class="view-v" data-k="rate"></span></span>
      <span class="view-v" data-k="sysname">—</span></div>
    <div class="sys-wrap"><canvas class="sys-cv" role="img" tabindex="0"></canvas></div>
    <p class="view-cap" data-k="syscap"></p>`;
  const cv = host.querySelector('canvas');
  const nameEl = host.querySelector('[data-k="sysname"]');
  const capEl = host.querySelector('[data-k="syscap"]');
  const rateEl = host.querySelector('[data-k="rate"]');
  const playBtn = host.querySelector('[data-k="play"]');
  const solarBtn = host.querySelector('[data-k="solar"]');
  const T = tokens();
  let model = null, hits = [];
  const still = reducedMotion() || window.__EXO_STILL__ || window.__EXO_LOWPOWER__;
  let simDays = 0, lastT = 0, playing = !still, showSolar = false;
  let raf = 0, visible = true;
  let reach = 0, tween = 0;   // how far the view reaches now, in AU, and the frame request that is moving it
  playBtn.textContent = playing ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-pressed', String(playing));

  const surf = surface(cv, draw);

  playBtn.addEventListener('click', () => {
    playing = !playing; lastT = 0;
    playBtn.textContent = playing ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', String(playing));
    kick(); surf.redraw();
  });
  solarBtn.addEventListener('click', () => {
    showSolar = !showSolar; solarBtn.classList.toggle('on', showSolar); solarBtn.setAttribute('aria-pressed', String(showSolar));
    if (model) capEl.textContent = caption();
    zoom();
  });

  /* Draw back to the Solar System's scale, or in again, over 0.7 s. The reach moves evenly in its logarithm,
     because the two scales can differ a thousand times. A still page takes the new scale at once. */
  function zoom() {
    cancelAnimationFrame(tween); tween = 0;
    if (!model) return;
    const from = reach || model.extent, to = viewExtent(model.extent, showSolar);
    if (still || from === to) { reach = to; surf.redraw(); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      reach = Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * e);
      surf.redraw();
      tween = k < 1 ? requestAnimationFrame(step) : 0;
    };
    tween = requestAnimationFrame(step);
  }

  function build() {
    const st = store.state, sel = st.sel;
    if (!sel) { model = null; return; }
    const planets = st.system.map((p) => {
      const { a } = semiMajor(p);
      const P = isNum(p.P) ? p.P : (a && isNum(p.Ms) ? 365.25 * Math.sqrt(a * a * a / p.Ms) : null);
      return { p, a, P, eKnown: isNum(p.ecc), e: isNum(p.ecc) ? Math.min(p.ecc, 0.97) : 0, w: hash01(p.name) * Math.PI * 2, ph: hash01(p.name + '#') * Math.PI * 2 };
    }).filter((o) => o.a);
    const hz = habitableZone(sel);
    const outer = Math.max(...planets.map((o) => o.a * (1 + o.e)), 1e-4);
    let extent = outer * 1.2, hzOff = false;
    if (hz) {
      if (hz.outer / outer < 6) extent = Math.max(extent, hz.outer * 1.08);
      else hzOff = true;
    }
    const ref = planets.find((o) => o.p === sel);
    const daysPerSec = ref && ref.P ? ref.P / 10 : 36.5;   // the selected orbit takes 10 s of screen time
    model = { planets, hz, extent, hzOff, outer, sel, colour: starColour(sel.Teff), Rs: sel.Rs, ref, daysPerSec };
    cancelAnimationFrame(tween); tween = 0;
    reach = viewExtent(extent, showSolar);   // a new world opens at the scale the visitor left on
    nameEl.textContent = `${sel.host} · ${planets.length} planet${planets.length === 1 ? '' : 's'}`;
    rateEl.textContent = `${fmt(daysPerSec, 2)} d/s`;
    simDays = 0; lastT = 0;
    capEl.textContent = caption();
  }

  function caption() {
    const m = model; if (!m) return '';
    const hz = m.hz;
    const parts = [];
    if (hz) parts.push(`[REAL] Habitable zone ${fmt(hz.inner, 2)}-${fmt(hz.outer, 2)} AU from Teff ${fmtInt(m.sel.Teff)} K, L ${fmt(hz.L, 2)} L☉${hz.extrapolated ? ' (Teff outside the fit, extrapolated)' : ''}.`);
    else parts.push('[REAL] No habitable zone: the archive lacks this star\'s temperature or luminosity.');
    // said only while it is true: with the Solar System shown the view may reach the zone
    if (m.hzOff && hz.outer > viewExtent(m.extent, showSolar)) parts.push(`The zone lies ${fmt(hz.inner / m.ref.a, 2)}x farther out than this orbit, off this view.`);
    if (showSolar) parts.push(solarWords(m.sel.host, m.outer));
    const unknownE = m.planets.filter((o) => !o.eKnown).length;
    parts.push(`[ILLUSTRATIVE] orbit orientations, dot sizes${unknownE ? `; e unknown for ${unknownE}, drawn circular and dashed` : ''}.`);
    return parts.join(' ');
  }

  function draw(ctx, w, h) {
    const m = model; if (!m) return;
    const cx = w / 2, cy = h / 2;
    const Rpx = Math.max(8, Math.min(w, h) / 2 - 10);
    const far = reach || m.extent;
    const s = Rpx / far;
    ctx.lineWidth = 1;
    if (m.hz && m.hz.outer <= far) {
      ctx.fillStyle = alpha(T.horizon, 0.10);
      ctx.beginPath(); ctx.arc(cx, cy, m.hz.outer * s, 0, Math.PI * 2); ctx.arc(cx, cy, m.hz.inner * s, 0, Math.PI * 2, true); ctx.fill();
      ctx.strokeStyle = alpha(T.horizon, 0.28); ctx.setLineDash([2, 4]);
      for (const r of [m.hz.innerOpt, m.hz.outerOpt]) { if (r * s < Rpx * 1.4) { ctx.beginPath(); ctx.arc(cx, cy, r * s, 0, Math.PI * 2); ctx.stroke(); } }
      ctx.setLineDash([]);
      ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'left';
      if (m.hz.outer * s > 18) ctx.fillText('HABITABLE ZONE', cx + m.hz.outer * s * 0.71 + 4, cy - m.hz.outer * s * 0.71 - 2);
    } else if (m.hz) {
      ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'right';
      ctx.fillText(`HZ ${fmt(m.hz.inner, 2)}-${fmt(m.hz.outer, 2)} AU  →`, w - 6, 12);
    }
    ctx.font = T.fontSm;
    if (showSolar) {
      for (const sp of SOLAR) {
        const r = sp.a * s;
        if (r > Rpx * 1.6) continue;
        ctx.strokeStyle = alpha(T.text, sp.name === 'Earth' ? 0.42 : 0.26); ctx.setLineDash([1, 3]);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (r > 6) { ctx.fillStyle = T.faint; ctx.textAlign = 'right'; ctx.fillText(sp.short, cx - r * 0.71 - 2, cy + r * 0.71 + 9); }
      }
    } else if (s > 14 && s < Rpx * 1.25) {
      ctx.strokeStyle = alpha(T.text, 0.18); ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.faint; ctx.textAlign = 'left';
      ctx.fillText('1 AU', cx + s * 0.71 + 3, cy + s * 0.71 + 10);
    }
    const starPx = (m.Rs || 0.5) * PHYS.R_SUN_KM / PHYS.AU_KM * s;
    const [r, g, b] = m.colour.srgb.map((c) => Math.round(c * 255));
    const gr = Math.max(showSolar ? 6 : 14, starPx * 3);   // the glow is not to scale; drawn back, it must not cover the inner orbits
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
    glow.addColorStop(0, `rgba(${r},${g},${b},0.9)`); glow.addColorStop(0.25, `rgba(${r},${g},${b},0.25)`); glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.5, starPx), 0, Math.PI * 2); ctx.fill();
    hits = [];
    for (const o of m.planets) {
      const on = o.p === m.sel;
      const A = o.a * s, B = A * Math.sqrt(1 - o.e * o.e), c = A * o.e;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.w);
      ctx.strokeStyle = on ? alpha(T.gold, 0.85) : alpha(T.text, 0.28); ctx.lineWidth = on ? 1.2 : 1;
      if (!o.eKnown) ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.ellipse(-c, 0, Math.max(0.5, A), Math.max(0.5, B), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const Mm = o.ph + (o.P ? 2 * Math.PI * simDays / o.P : 0);
      const E = kepler(((Mm % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), o.e);
      const x = A * (Math.cos(E) - o.e), y = B * Math.sin(E);
      const rad = Math.max(1.8, Math.min(5, Math.sqrt(o.p.R || 1) * 1.3));
      ctx.fillStyle = on ? T.gold : T.text;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = alpha(T.gold, 0.6); ctx.beginPath(); ctx.arc(x, y, rad + 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      const cw = Math.cos(o.w), sw = Math.sin(o.w);
      hits.push({ p: o.p, x: cx + x * cw - y * sw, y: cy + x * sw + y * cw, A });
    }
    const nice = niceLen(far * 0.35);
    const bw = nice * s;
    ctx.strokeStyle = alpha(T.text, 0.5); ctx.beginPath();
    ctx.moveTo(8, h - 10.5); ctx.lineTo(8 + bw, h - 10.5); ctx.moveTo(8.5, h - 14); ctx.lineTo(8.5, h - 7); ctx.moveTo(8 + bw + 0.5, h - 14); ctx.lineTo(8 + bw + 0.5, h - 7); ctx.stroke();
    ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'left';
    ctx.fillText(`${nice} AU`, 12 + bw, h - 7);
    ctx.textAlign = 'right'; ctx.fillText(`day ${fmtInt(simDays)}`, w - 6, h - 7);
    cv.setAttribute('aria-label', `Top view of the ${m.sel.host} system, ${m.planets.length} planets; the view reaches ${fmt(far, 2)} AU from the star` + (m.hz ? `, habitable zone ${fmt(m.hz.inner, 2)} to ${fmt(m.hz.outer, 2)} AU` : '') + (showSolar ? ', drawn back to the scale of the Solar System, with the orbits of the Sun\'s planets' : ''));
  }

  function niceLen(x) { const e = Math.pow(10, Math.floor(Math.log10(x))); const f = x / e; return +((f < 2 ? 1 : f < 5 ? 2 : 5) * e).toPrecision(1); }

  /* click a planet (or its orbit) to fly to it */
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = null, bd = 196;
    for (const hh of hits) { const d = (hh.x - mx) ** 2 + (hh.y - my) ** 2; if (d < bd) { bd = d; best = hh; } }
    if (!best) {
      const rr = Math.hypot(mx - r.width / 2, my - r.height / 2);
      let bo = 8; for (const hh of hits) { const d = Math.abs(hh.A - rr); if (d < bo) { bo = d; best = hh; } }
    }
    if (best && best.p !== store.state.sel && actions.select) actions.select(best.p, { from: 'system' });
  });
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    cv.style.cursor = hits.some((hh) => (hh.x - mx) ** 2 + (hh.y - my) ** 2 < 196) ? 'pointer' : 'default';
  });

  function loop(t) {
    raf = 0; if (!visible || !playing || !model) return;
    if (lastT) simDays += (t - lastT) / 1000 * model.daysPerSec;
    lastT = t;
    surf.redraw(); raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && visible && playing && !window.__EXO_STILL__) { lastT = 0; raf = requestAnimationFrame(loop); } };   // Play still works in the low-power tier: the visitor asked
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting && !document.hidden; kick(); }).observe(cv);
  }
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });

  return { update() { build(); surf.redraw(); kick(); } };
}
