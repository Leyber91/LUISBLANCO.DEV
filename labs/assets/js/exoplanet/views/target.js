/* ============================================================
   views/target.js — the target plate: what the archive measured
   for the selected world (with the paper each value comes from),
   then what this engine infers from it, each line tagged M
   measured, D derived by formula, E estimated by a relation or
   Monte Carlo over the catalogue errors, I illustrative.
   ============================================================ */

import {
  forecastFor, massFromRadiusMean, hasTrueMass, sizeClassOf, hasRadius, limitOf, limitKind, limitText, hzPosition, insolation,
  semiMajor, luminosity, starColour, spectralType, skyView, earthLikeness, monteCarlo, isNum,
} from '../science.js';
import { TEQ, PHYS, VALLEY, MC, LIMIT_FIELDS } from '../config.js';
import { tokens, alpha, fmt, fmtInt, esc } from './common.js';

const TAG = { M: 'measured', D: 'derived by formula', E: 'estimated', I: 'illustrative' };
const tg = (t) => `<b class="tg tg-${t.toLowerCase()}" title="${TAG[t]}">${t}</b>`;
const row = (t, k, v, note = '') => `<div class="tp-row">${tg(t)}<span class="tp-k">${k}</span><span class="tp-v">${v}</span>${note ? `<span class="tp-n">${note}</span>` : ''}</div>`;
const ref = (r) => (r ? `<a class="ref" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a>` : '');
const pm = (v, e1, e2, d = 3) => {
  if (!isNum(v)) return '—';
  if (isNum(e1) && isNum(e2) && Math.abs(Math.abs(e1) - Math.abs(e2)) / Math.max(Math.abs(e1), 1e-9) < 0.15) return `${fmt(v, d)} <i>±${fmt(Math.abs(e1), 2)}</i>`;
  if (isNum(e1) && isNum(e2)) return `${fmt(v, d)} <i>+${fmt(Math.abs(e1), 2)} −${fmt(Math.abs(e2), 2)}</i>`;
  return fmt(v, d);
};
/* an archive bound, written as a bound: "< 6.2 M⊕ upper limit" */
const boundTxt = (p, k, d = 3) => {
  const L = limitOf(p, k); if (!L) return '';
  return `${esc(limitText(L, d))}${LIMIT_FIELDS[k][1]} <i>${limitKind(L)}</i>`;
};
const band = (s, d = 2, unit = '') => (s ? `${fmt(s.med, d)}${unit} <i>68%: ${fmt(s.lo, d)}-${fmt(s.hi, d)}</i>` : '—');

export function createTarget(host, store, actions) {
  host.innerHTML = `
    <div class="tp-kick"><span data-k="idx">TARGET</span><span data-k="src"></span></div>
    <h1 class="tp-name" data-k="name">—</h1>
    <p class="tp-sub" data-k="sub"></p>
    <section class="tp-sec"><h2 class="tp-h">Measured <span class="tag-r">[REAL] archive</span></h2><div data-k="meas"></div></section>
    <section class="tp-sec"><h2 class="tp-h">Inferred <span class="tag-r" data-k="mcn"></span></h2>
      <div data-k="inf"></div>
      <div class="tp-row tp-slider">${tg('D')}<label class="tp-k" for="albedo">Bond albedo</label>
        <input id="albedo" type="range" min="0" max="0.9" step="0.01" value="${TEQ.albedo}">
        <span class="tp-v" id="albedo-v">${TEQ.albedo.toFixed(2)}</span></div>
      <div class="tp-sky"><canvas class="tp-sky-cv" width="300" height="56" role="img"></canvas></div>
    </section>
    <div class="tp-actions">
      <button type="button" class="btn log-add" data-act="log" title="Save this world to your log" disabled>Add to log</button>
      <button type="button" class="btn" data-act="chain" title="Every input, equation and source for this world">How inferred</button>
      <button type="button" class="btn" data-act="pin" title="The log is being read" disabled>Pin</button>
      <button type="button" class="btn" data-act="plate" title="Save a survey plate as PNG">Save PNG</button>
      <button type="button" class="btn" data-act="csv" title="Export the filtered catalogue with this engine's inferences">CSV</button>
      <button type="button" class="btn" data-act="link" title="Copy a link to this exact view">Link</button>
    </div>
    <p class="tp-said" data-k="said" role="status"></p>`;
  const $ = (k) => host.querySelector(`[data-k="${k}"]`);
  const albedo = host.querySelector('#albedo');
  const albedoV = host.querySelector('#albedo-v');
  const skyCv = host.querySelector('.tp-sky-cv');
  const T = tokens();
  let A = TEQ.albedo;

  albedo.addEventListener('input', () => { A = +albedo.value; albedoV.textContent = A.toFixed(2); renderInferred(store.state.sel); });
  host.querySelector('.tp-actions').addEventListener('click', (e) => {
    const b = e.target.closest('button'); const act = b?.dataset.act;
    if (act) actions.exportAs(act, b);
  });

  function renderMeasured(p) {
    const L = luminosity(p), a = semiMajor(p), S = insolation(p);
    const rf = p.refs || {};
    let mass, mt = 'M';
    if (limitOf(p, 'M')) mass = boundTxt(p, 'M');
    else if (!isNum(p.M)) mass = '<span class="dim">not measured</span>';
    else if (p.Mprov === 'M-R relationship') { mass = `${fmt(p.M, 3)} M⊕ <i>archive estimate from radius</i>`; mt = 'E'; }
    else if (p.Mprov === 'Msini') mass = `${pm(p.M, p.Merr1, p.Merr2)} M⊕ <i>minimum</i>`;
    else mass = `${pm(p.M, p.Merr1, p.Merr2)} M⊕`;
    const starFlag = !isNum(p.Rs) ? 'stellar radius missing: the render scales it from Teff' : '';
    // one line of sources: each paper once, with the values it supplies
    const by = new Map();
    for (const [k, lab] of [['R', 'radius'], ['M', 'mass'], ['P', 'period'], ['star', 'star']]) {
      const r = rf[k]; if (!r) continue;
      if (!by.has(r.url)) by.set(r.url, { r, what: [] });
      by.get(r.url).what.push(lab);
    }
    const srcs = [...by.values()].map(({ r, what }) => `${what.join(', ')}: ${ref(r)}`).join(' · ');
    $('meas').innerHTML = [
      hasRadius(p)
        ? row(p.measuredR === false ? 'E' : 'M', 'Radius', `${pm(p.R, p.Rerr1, p.Rerr2)} R⊕`, p.measuredR === false ? 'archive estimate from mass' : '')
        : row('M', 'Radius', limitOf(p, 'R') ? boundTxt(p, 'R') : '<span class="dim">no radius measured</span>', limitOf(p, 'R') ? 'a bound, not a measurement' : ''),
      row(mt, 'Mass', mass, limitOf(p, 'M') ? 'a bound, not a measurement' : ''),
      row('M', 'Period', isNum(p.P) ? `${fmt(p.P, 4)} d` : limitOf(p, 'P') ? boundTxt(p, 'P', 4) : '—'),
      row(a.src === 'archive' ? 'M' : 'D', 'Orbit', `${a.a ? fmt(a.a, 3) + ' AU' : limitOf(p, 'a') ? boundTxt(p, 'a') : '—'}${isNum(p.ecc) ? ` · e ${fmt(p.ecc, 2)}` : limitOf(p, 'ecc') ? ` · e ${boundTxt(p, 'ecc', 2)}` : ' · e unknown'}`,
        a.src === "Kepler's third law" ? 'from P and the star\'s mass' : limitOf(p, 'ecc') ? 'e is a bound: orbits drawn circular' : ''),
      row(S.src === 'archive' ? 'M' : 'D', 'Insolation', S.S ? `${fmt(S.S, 3)} S⊕` : limitOf(p, 'S') ? boundTxt(p, 'S') : '—', S.src === 'L / a^2' ? 'from L / a²' : ''),
      row(isNum(p.Rs) ? 'M' : 'E', 'Star', `${isNum(p.Teff) ? fmtInt(p.Teff) + ' K' : limitOf(p, 'Teff') ? boundTxt(p, 'Teff', 4) : '—'} · ${isNum(p.Rs) ? fmt(p.Rs, 3) + ' R☉' : '—'} · ${L.L ? fmt(L.L, 3) + ' L☉' : '—'}`, starFlag),
      ...['Teq', 'b', 'depth', 'dur'].filter((k) => limitOf(p, k)).map((k) => row('M', { Teq: 'Teq', b: 'Impact b', depth: 'Depth', dur: 'Duration' }[k], boundTxt(p, k), 'archive bound, not used as a value')),
    ].join('') + (srcs ? `<p class="tp-srcs">Sources: ${srcs}</p>` : '');
  }

  function renderInferred(p) {
    if (!p) return;
    const out = [];
    const mc = monteCarlo(p, A);
    $('mcn').textContent = `[REAL] models · ${MC.draws} MC draws`;
    const fc = hasTrueMass(p) ? null : forecastFor(p);
    if (fc) {
      const det = massFromRadiusMean(p.R);
      let cmp = '';
      if (p.Mprov === 'M-R relationship' && isNum(p.M) && det) cmp = ` · archive ${fmt(p.M, 3)}, engine mean ${fmt(det, 3)}`;
      if (fc.bounded) cmp += ` · cut at the ${fmt(fc.bound, 3)} M⊕ ${fc.bounded} limit`;
      out.push(row('E', 'Mass model', `${fmt(fc.median, 2)} M⊕ <i>68%: ${fmt(fc.lo, 2)}-${fmt(fc.hi, 2)}</i>`, `${fc.regime} · Chen &amp; Kipping 2017${cmp}`));
    }
    if (mc.hasR) {
      out.push(row(fc ? 'E' : 'D', 'Gravity', band(mc.g, 2, ' g'), fc ? 'from the forecast mass' : 'from the measured mass and radius'));
      if (mc.rho && !fc) out.push(row('D', 'Density', band(mc.rho, 2, ' g/cm³'), 'Earth 5.51'));
      const probs = mc.probs.slice().sort((x, y) => y.p - x.p).map((c) => `${c.label} ${Math.round(c.p * 100)}%`).join(' · ');
      const valley = p.R < VALLEY.lo ? 'below the radius valley' : p.R <= VALLEY.hi ? 'inside the radius valley' : 'above the radius valley';
      out.push(row('D', 'Size class', `${sizeClassOf(p).label}`, `${probs} · ${valley}`));
    } else {
      // no radius: nothing that needs one is computed from a missing value
      const c = sizeClassOf(p), ML = limitOf(p, 'M');
      out.push(row('D', 'Size class', c ? c.label : '<span class="dim">no radius measured</span>',
        c ? 'every radius the archive bound allows is in this class' : 'so no size class, gravity, density or scale height'));
      if (c) out.push(row('D', 'Gravity', '<span class="dim">—</span>', 'needs a radius value; a bound gives none'));
      if (ML && !fc) out.push(row('E', 'Mass model', '<span class="dim">none</span>', `the mass is only a${ML.dir > 0 ? 'n' : ''} ${limitKind(ML)}, and there is no radius to forecast from`));
    }
    out.push(row('D', 'Teq', mc.teq ? `<span id="teq-out">${band(mc.teq, 3, ' K')}</span>` : '—', `albedo ${A.toFixed(2)} (slider), full redistribution${isNum(p.Teq) ? ` · published ${fmtInt(p.Teq)} K` : ''}`));
    if (mc.H) out.push(row('E', 'Scale ht', band(mc.H, 2, ' km'), `assumes μ ${p.R > 1.8 ? MC.muEnvelope + ' (hydrogen envelope)' : MC.muSecondary + ' (N₂-like air)'}`));
    const hz = hzPosition(p);
    const zshort = { cons: 'conservative HZ', opt: 'optimistic HZ', hot: 'too hot for the HZ', cold: 'too cold for the HZ', unknown: '—' }[hz.key];
    out.push(row('D', 'Zone', `${zshort}`, hz.hz ? `${hz.label} · zone ${fmt(hz.hz.sOuter, 2)}-${fmt(hz.hz.sInner, 2)} S⊕ · Kopparapu et al. 2013` : ''));
    const col = starColour(p.Teff);
    out.push(row('D', 'Star colour', `<span class="swatch" style="background:${col.hex};color:${col.hex}"></span>${col.hex} · ${spectralType(p.Teff)}-type`, 'Planck spectrum x CIE 1931 observer'));
    $('inf').innerHTML = out.join('');
    $('inf').querySelectorAll('.tp-n').forEach((n) => { n.title = n.textContent; });
  }

  function renderSky(p) {
    const ctx = skyCv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = skyCv.clientWidth || 300, h = skyCv.clientHeight || 56;
    skyCv.width = w * dpr; skyCv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sv = skyView(p);
    if (!sv) { skyCv.setAttribute('aria-label', 'The sky from its surface needs the radius of the star and the orbit.'); return; }
    const maxAng = Math.max(sv.angDeg, PHYS.SUN_ANG_DEG);
    const pxPerDeg = Math.min((h - 22) / maxAng, 30 / PHYS.SUN_ANG_DEG);
    const rSun = Math.max(1.2, PHYS.SUN_ANG_DEG * pxPerDeg / 2), rStar = Math.max(1.2, sv.angDeg * pxPerDeg / 2);
    const base = h - 10;
    ctx.strokeStyle = alpha(T.horizon, 0.3); ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(w, base + 0.5); ctx.stroke();
    const sun = starColour(PHYS.T_SUN).srgb.map((c) => Math.round(c * 255));
    const st = starColour(p.Teff).srgb.map((c) => Math.round(c * 255));
    const disc = (x, r, c, label) => {
      const y = base - 8 - Math.min(r, (base - 10) / 2);
      const g = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.5 + 5);
      g.addColorStop(0, `rgba(${c},0.35)`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.5 + 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = T.dim; ctx.font = T.fontSm; ctx.textAlign = 'center'; ctx.fillText(label, x, h - 1);
    };
    disc(w * 0.2, rSun, sun.join(','), `SUN FROM EARTH ${PHYS.SUN_ANG_DEG}°`);
    disc(w * 0.66, rStar, st.join(','), `ITS STAR THERE ${fmt(sv.angDeg, 2)}° · ${fmt(sv.vsSun, 2)}x`);
    skyCv.setAttribute('aria-label', `From the surface its star spans ${fmt(sv.angDeg, 2)} degrees, ${fmt(sv.vsSun, 2)} times the width of the Sun in our sky.`);
  }

  return {
    update(p) {
      if (!p) return;
      const st = store.state;
      $('idx').textContent = `TARGET ${fmtInt(p.idx + 1)} OF ${fmtInt(st.list.length)}`;
      $('src').textContent = p.source === 'roster' ? 'WEEKLY ROSTER' : 'ARCHIVE SNAPSHOT';
      $('name').textContent = p.name;
      $('said').textContent = '';   // what was said about the world before does not stand for this one
      $('said').classList.remove('quiet');
      const sp = spectralType(p.Teff);
      const rf = p.refs || {};
      const found = isNum(p.year) ? `Found ${p.year}${p.method ? ' by ' + p.method.toLowerCase() : ''}${p.facility ? ', ' + esc(p.facility) : ''}${rf.disc ? ' (' + ref(rf.disc) + ')' : ''}.` : 'Confirmed after the 2026-11-11 snapshot.';
      const overview = `<a class="ref" href="https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(p.name)}" target="_blank" rel="noopener">archive page</a>`;
      $('sub').innerHTML = `Orbits ${esc(p.host)}, ${sp === '?' ? 'a star of unknown type' : `a${'AFO'.includes(sp) ? 'n' : ''} ${sp}-type star`}${isNum(p.dist) ? `, ${fmtInt(p.dist * PHYS.PC_LY)} light-years (${fmt(p.dist, 3)} pc) away` : ''}. ${found} ${overview}`;
      renderMeasured(p);
      renderInferred(p);
      renderSky(p);
    },
    albedo: () => A,
    /* A line under the actions: what a press did. A success is for a screen reader only, because the button shows it;
       why a press did not do what it says is shown. The line is a status region and only its text changes. */
    say(text, ok = false) { const s = $('said'); s.classList.toggle('quiet', !!ok); s.textContent = text; },
  };
}
