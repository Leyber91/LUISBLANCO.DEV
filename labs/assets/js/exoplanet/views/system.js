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

import { habitableZone, hzPosition, insolation, semiMajor, starColour, isNum } from '../science.js';
import { starlightText, zoneWords, extrapolatedWords, placedAt } from '../starlight.js';
import { PHYS, SOLAR } from '../config.js';
import { tokens, alpha, surface, fmt, fmtInt, esc, reducedMotion } from './common.js';
import { switchCtl, setSwitch, bindSwitch, isOn } from '../../kit/controls.js';

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

/* Sheet A's inset: the selected world's system in miniature, still. The habitable zone dashed, each orbit a circle
   (the selected one in the bright ink and heavier), the star, the world on its orbit. */
export function drawInset(canvas, sel, system) {
  const T = tokens(), dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  if (!sel) return;
  const orbits = system.map((p) => ({ p, a: semiMajor(p).a })).filter((o) => o.a);
  const hz = habitableZone(sel);
  const outer = Math.max(...orbits.map((o) => o.a), 1e-4);
  const reach = hz && hz.outer / outer < 6 ? Math.max(outer, hz.outer) * 1.08 : outer * 1.15;
  const c = w / 2, k = (Math.min(w, h) / 2 - 4) / reach;
  if (hz && hz.outer <= reach) {
    ctx.strokeStyle = alpha(T.horizon, 0.85); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.1;
    for (const d of [hz.inner, hz.outer]) { ctx.beginPath(); ctx.arc(c, h / 2, d * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  for (const o of orbits) {
    const on = o.p === sel;
    ctx.strokeStyle = on ? T.bright : alpha(T.text, 0.45); ctx.lineWidth = on ? 1.3 : 1;
    if (!isNum(o.p.ecc)) ctx.setLineDash([12, 3, 2, 3, 2, 3]);
    ctx.beginPath(); ctx.arc(c, h / 2, Math.max(1, o.a * k), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (on) { ctx.fillStyle = T.bright; ctx.beginPath(); ctx.arc(c + o.a * k * Math.cos(-0.7), h / 2 + o.a * k * Math.sin(-0.7), 3, 0, Math.PI * 2); ctx.fill(); }
  }
  const [rr, gg, bb] = starColour(sel.Teff).srgb.map((x) => Math.round(x * 255));
  ctx.fillStyle = `rgb(${rr},${gg},${bb})`; ctx.beginPath(); ctx.arc(c, h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
  canvas.setAttribute('aria-label', `The ${sel.host} system in miniature: ${orbits.length === 1 ? 'one orbit' : `${orbits.length} orbits`}${hz ? `, habitable zone ${fmt(hz.inner, 2)} to ${fmt(hz.outer, 2)} AU` : ''}`);
}

/* What view D draws and says, as data: pure, so tests/onesource.test.mjs reads it for every planet. The planets of
   the selected world's system with an orbit, each with its size a (AU), period, eccentricity and phase; the habitable
   zone of the selected world, in AU; how far the view reaches. */
export function systemModel(sel, system) {
  const planets = system.map((p) => {
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
  return { planets, hz, extent, hzOff, outer, sel, colour: starColour(sel.Teff), Rs: sel.Rs, ref, daysPerSec };
}

/* The other planets of the system that the drawing shows in another zone than their own: drawn against the selected
   world's zone, a planet the archive lists with other values for the star can fall on the other side of an edge. Each
   with its own place (hzPosition) and whether its star's row differs. */
export function strays(m) {
  if (!m || !m.hz) return [];
  const out = [];
  for (const o of m.planets) {
    if (o.p === m.sel) continue;
    const own = hzPosition(o.p);
    if (own.key === 'unknown' || placedAt(m.hz, o.a) === own.key) continue;
    out.push({ p: o.p, own, row: o.p.Teff !== m.sel.Teff || o.p.Rs !== m.sel.Rs });
  }
  return out;
}

/* The caption under view D, for a model and the scale shown. */
export function systemCaption(m, showSolar = false) {
  if (!m) return '';
  const hz = m.hz;
  const parts = [];
  if (hz) {
    // the rings are where this world's own starlight would be each edge's flux (starlight.js habitableZone)
    const by = hz.by === 'S' ? `the starlight at ${m.sel.name}'s orbit, ${starlightText(insolation(m.sel)).v} S⊕` : `the star's luminosity, ${fmt(hz.L, 3)} L☉`;
    parts.push(`[REAL] Habitable zone ${fmt(hz.inner, 2)}-${fmt(hz.outer, 2)} AU, filled; the optimistic edges, dotted, ${fmt(hz.innerOpt, 2)}-${fmt(hz.outerOpt, 2)} AU. Placed by ${by}, and the star's ${fmtInt(m.sel.Teff)} K (Kopparapu et al. 2013)${hz.extrapolated ? `, ${extrapolatedWords(m.sel.Teff)}` : ''}.`);
    parts.push(...strays(m).map(({ p, own, row }) => (row
      ? `The archive lists this star with other values for ${p.name} (${fmtInt(p.Teff)} K, ${fmt(p.Rs, 3)} R☉), which put it ${zoneWords(own, 'reticle')}.`
      : `${p.name}'s own starlight puts it ${zoneWords(own, 'reticle')}.`)));
  } else parts.push('[REAL] No habitable zone: the archive lacks this star\'s temperature, or the starlight to place its edges.');
  // said only while it is true: with the Solar System shown the view may reach the zone
  // a world with no orbit of its own is not drawn: the zone is set against the outermost orbit drawn instead
  if (m.hzOff && hz.outer > viewExtent(m.extent, showSolar)) parts.push(`The zone lies ${fmt(hz.inner / (m.ref ? m.ref.a : m.outer), 2)}x farther out than ${m.ref ? 'this orbit' : 'the outermost orbit drawn'}, off this view.`);
  if (showSolar) parts.push(solarWords(m.sel.host, m.outer));
  const unknownE = m.planets.filter((o) => !o.eKnown).length;
  parts.push(`[ILLUSTRATIVE] orbit orientations, dot sizes${unknownE ? `; e unknown for ${unknownE}, drawn circular and dashed` : ''}.`);
  return parts.join(' ');
}

export function createSystem(host, store, actions = {}) {
  host.innerHTML = `
    <div class="lab"><h2 class="st" id="d-h"><i>D</i>The system</h2><span class="meta" data-k="sysname"></span></div>
    <div class="sys-wrap"><canvas class="sys-cv" role="img" tabindex="0"></canvas></div>
    <div class="view-row" data-k="ctl"><span class="rate" data-k="rate"></span></div>
    <p class="note2" data-k="syscap"></p>
    <details class="twin"><summary>table</summary><div class="twin-b" data-k="systwin"></div></details>`;
  const cv = host.querySelector('canvas');
  const nameEl = host.querySelector('[data-k="sysname"]');
  const capEl = host.querySelector('[data-k="syscap"]');
  const rateEl = host.querySelector('[data-k="rate"]');
  const twinEl = host.querySelector('[data-k="systwin"]');
  /* time and scale: two switches, both states engraved */
  const playBtn = switchCtl({ name: 'time', words: ['running', 'stopped'], ariaLabel: 'Time stopped' });
  playBtn.dataset.k = 'play';
  const solarBtn = switchCtl({ name: 'scale', words: ['its own', 'the Solar System'], ariaLabel: 'Scale of the Solar System' });
  solarBtn.dataset.k = 'solar';
  host.querySelector('[data-k="ctl"]').prepend(playBtn, solarBtn);
  const T = tokens();
  let model = null, hits = [];
  const still = reducedMotion() || window.__EXO_STILL__ || window.__EXO_LOWPOWER__;
  let simDays = 0, lastT = 0, playing = !still, showSolar = false;
  let raf = 0, visible = true;
  let reach = 0, tween = 0;   // how far the view reaches now, in AU, and the frame request that is moving it
  setSwitch(playBtn, !playing);

  const surf = surface(cv, draw);

  bindSwitch(playBtn, (stopped) => { playing = !stopped; lastT = 0; kick(); surf.redraw(); });
  bindSwitch(solarBtn, (on) => {
    showSolar = on;
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
    model = systemModel(sel, st.system);
    const { planets, extent, daysPerSec } = model;
    cancelAnimationFrame(tween); tween = 0;
    reach = viewExtent(extent, showSolar);   // a new world opens at the scale the visitor left on
    nameEl.textContent = `${sel.host}, ${planets.length === 1 ? 'one planet' : `${planets.length} planets`}`;
    rateEl.textContent = `${fmt(daysPerSec, 2)} days a second`;
    twinEl.innerHTML = `<div class="twin-wrap"><table><thead><tr><th>planet</th><th class="num">orbit, AU</th><th class="num">period, d</th><th class="num">radius, R\u2295</th><th class="num">e</th></tr></thead><tbody>${st.system.map((p) => {
      const a = semiMajor(p).a;
      return `<tr><td>${esc(p.name)}${p === sel ? ' (open)' : ''}</td><td class="num">${a ? fmt(a, 3) : 'unknown'}</td><td class="num">${isNum(p.P) ? fmt(p.P, 4) : 'unknown'}</td><td class="num">${isNum(p.R) ? fmt(p.R, 3) : 'not measured'}</td><td class="num">${isNum(p.ecc) ? fmt(p.ecc, 2) : 'unknown'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    simDays = 0; lastT = 0;
    capEl.textContent = caption();
  }

  const caption = () => systemCaption(model, showSolar);

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
      if (m.hz.outer * s > 18) ctx.fillText('habitable zone', cx + m.hz.outer * s * 0.71 + 4, cy - m.hz.outer * s * 0.71 - 2);
    } else if (m.hz) {
      ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'right';
      ctx.fillText(`habitable zone ${fmt(m.hz.inner, 2)} to ${fmt(m.hz.outer, 2)} AU, farther out`, w - 6, 12);
    }
    ctx.font = T.fontSm;
    if (showSolar) {
      for (const sp of SOLAR) {
        const r = sp.a * s;
        if (r > Rpx * 1.6) continue;
        ctx.strokeStyle = alpha(T.text, sp.name === 'Earth' ? 0.42 : 0.26); ctx.setLineDash([1, 3]);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        if (r > 6) { ctx.fillStyle = T.dim; ctx.textAlign = 'right'; ctx.fillText(sp.short, cx - r * 0.71 - 2, cy + r * 0.71 + 9); }
      }
    } else if (s > 14 && s < Rpx * 1.25) {
      ctx.strokeStyle = alpha(T.text, 0.18); ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.dim; ctx.textAlign = 'left';
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
      ctx.strokeStyle = on ? alpha(T.bright, 0.9) : alpha(T.text, 0.28); ctx.lineWidth = on ? 1.6 : 1;
      if (!o.eKnown) ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.ellipse(-c, 0, Math.max(0.5, A), Math.max(0.5, B), 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const Mm = o.ph + (o.P ? 2 * Math.PI * simDays / o.P : 0);
      const E = kepler(((Mm % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), o.e);
      const x = A * (Math.cos(E) - o.e), y = B * Math.sin(E);
      const rad = Math.max(1.8, Math.min(5, Math.sqrt(o.p.R || 1) * 1.3));
      ctx.fillStyle = on ? T.bright : T.text;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = alpha(T.bright, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, rad + 4, 0, Math.PI * 2); ctx.stroke(); }
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
