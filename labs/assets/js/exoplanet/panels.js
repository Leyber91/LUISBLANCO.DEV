/* ============================================================
   exoplanet/panels.js — the three explanation panels: how this
   world was inferred (every input, equation, source and result),
   the comparison of pinned worlds against Earth, and the page's
   method with its validation against the archive.
   ============================================================ */

import { SOURCES, DATA, VALLEY, CHEN_KIPPING, TEQ, MC, LIMB, KOPPARAPU } from './config.js';
import {
  luminosity, semiMajor, insolation, forecastFor, hasTrueMass, monteCarlo, equilibriumTemp, habitableZone, hzPosition,
  transitGeometry, rvSemiAmplitude, starColour, skyView, sizeClassOf, hasRadius, limitOf, limitKind, limitText, isNum,
} from './science.js';
import { limitsLine } from './report.js';
import { classify, physics } from './data.js';
import { airLine, OBSERVED } from './air.js';
import { fmt, fmtInt, esc } from './views/common.js';

const li = (k, eq, v, src) => `<li><b>${k}</b> <code>${eq}</code> <span class="ch-v">${v}</span>${src ? ` <span class="ch-s">${src}</span>` : ''}</li>`;

export function chainHTML(p, albedo, air = null) {
  const L = luminosity(p), a = semiMajor(p), S = insolation(p);
  const fc = hasTrueMass(p) ? null : forecastFor(p);
  const mc = monteCarlo(p, albedo);
  const hz = habitableZone(p), pos = hzPosition(p);
  const geo = transitGeometry(p), rv = rvSemiAmplitude(p), sky = skyView(p);
  const ph = physics(p, { air }), cl = classify(p, { air });
  const r = p.refs || {};
  const refTxt = (x) => (x ? esc(x.label) : 'archive');
  const inputs = [
    ['Radius', hasRadius(p) ? `${fmt(p.R, 3)} ± ${fmt(p.Rerr, 2)} R⊕` : limitOf(p, 'R') ? `${esc(limitText(limitOf(p, 'R')))} R⊕ (${limitKind(limitOf(p, 'R'))})` : 'no radius measured', refTxt(r.R)],
    ['Mass', limitOf(p, 'M') ? `${esc(limitText(limitOf(p, 'M')))} M⊕ (${limitKind(limitOf(p, 'M'))}, a bound, not a value)` : isNum(p.M) ? `${fmt(p.M, 3)} M⊕ (${p.Mprov || 'unknown'})` : 'not measured', refTxt(r.M)],
    ['Period', isNum(p.P) ? `${fmt(p.P, 5)} d` : '—', refTxt(r.P)],
    ['Orbit', a.a ? `${fmt(a.a, 3)} AU, e ${isNum(p.ecc) ? fmt(p.ecc, 2) : 'unknown'}` : '—', a.src],
    ['Star', `${fmtInt(p.Teff)} ± ${fmtInt(p.TeffErr)} K, ${fmt(p.Rs, 3)} ± ${fmt(p.RsErr, 2)} R☉, ${fmt(p.Ms, 3)} M☉`, refTxt(r.star)],
  ];
  if (Object.keys(p.lim || {}).length) inputs.push(['Archive bounds', esc(limitsLine(p)), 'limit flags: kept as bounds, never used as values']);
  const steps = [];
  steps.push(li('Luminosity', L.src === 'archive' ? 'L = 10^log L' : 'L = R★² (Teff / 5772 K)⁴', L.L ? `${fmt(L.L, 3)} L☉` : '—', L.src));
  steps.push(li('Insolation', S.src === 'archive' ? 'archive value' : 'S = L / a²', S.S ? `${fmt(S.S, 3)} S⊕` : '—', ''));
  if (fc) steps.push(li('Mass', 'log R = C + S log M, inverted with scatter, log-uniform prior' + (fc.bounded ? `, censored by the ${fc.bounded} limit (posterior cut ${fc.bounded === 'upper' ? 'above' : 'below'} ${fmt(fc.bound, 3)} M⊕)` : ''), `${fmt(fc.median, 2)} M⊕ (68%: ${fmt(fc.lo, 2)}-${fmt(fc.hi, 2)}), ${fc.regime}`, CHEN_KIPPING.ref));
  else if (hasTrueMass(p)) steps.push(li('Mass', 'measured', `${fmt(p.M, 3)} M⊕`, refTxt(r.M)));
  else steps.push(li('Mass', 'none: no measured mass, and no radius to forecast one from', '—', limitOf(p, 'M') ? `the ${limitKind(limitOf(p, 'M'))} is a bound, never drawn as a value` : ''));
  steps.push(li('Gravity', `g = M / R², ${MC.draws} draws over the errors`, mc.g ? `${fmt(mc.g.med, 2)} g (68%: ${fmt(mc.g.lo, 2)}-${fmt(mc.g.hi, 2)})` : mc.hasR ? '—' : 'none: no radius measured', ''));
  steps.push(li('Teq', `Teq = Teff √(R★ / 2a) (1 − A)^¼, A = ${albedo}`, mc.teq ? `${fmtInt(mc.teq.med)} K (68%: ${fmtInt(mc.teq.lo)}-${fmtInt(mc.teq.hi)})` : '—', 'full heat redistribution'));
  if (mc.H) steps.push(li('Scale height', `H = k T / (μ m_H g), μ = ${p.R > 1.8 ? MC.muEnvelope : MC.muSecondary}`, `${fmt(mc.H.med, 2)} km`, 'μ assumed from size'));
  const scl = sizeClassOf(p);
  steps.push(li('Size class', 'radius draws binned at 1.5, 2, 4, 8 R⊕', mc.hasR ? mc.probs.map((c) => `${c.label} ${Math.round(c.p * 100)}%`).join(', ') : scl ? `${scl.label}, from the radius bound` : 'none: no radius measured', ''));
  if (hz) steps.push(li('Habitable zone', 'S_eff = S₀ + aT + bT² + cT³ + dT⁴, T = Teff − 5780; d = √(L / S_eff)', `${fmt(hz.inner, 3)}-${fmt(hz.outer, 3)} AU; ${pos.label}`, KOPPARAPU.ref));
  if (geo) steps.push(li('Transit', `k = Rp/R★ = ${fmt(geo.k, 3)}; depth ≈ k² × limb darkening; T14 = (P/π) asin[(R★/a)√((1+k)² − b²) / sin i]`, `${fmtInt(geo.depthLD * 1e6)} ppm, ${fmt(geo.T14, 3)} h`, 'Seager & Mallén-Ornelas 2003; ' + LIMB.ref));
  if (rv) steps.push(li('Radial velocity', 'K = 28.4329 m/s (Mp sin i / M_J) (M★)^−⅔ (P / 1 yr)^−⅓ / √(1 − e²)', `${fmt(rv.K, 3)} m/s (${rv.massSrc} mass${rv.bounded ? `, cut by the ${rv.bounded} limit` : ''})${rv.eLimit ? `; e is only a bound (${esc(limitText(rv.eLimit, 2))}), so e = 0` : ''}`, 'Lovis & Fischer 2010'));
  if (sky) steps.push(li('Sky', 'θ = 2 atan(R★ / a)', `${fmt(sky.angDeg, 2)}° (Sun from Earth 0.53°)`, ''));
  steps.push(li('Star colour', 'Planck B(λ, Teff) through CIE 1931 x̄ ȳ z̄, to sRGB', starColour(p.Teff).hex, 'Wyman et al. 2013 fit'));
  if (cl.air && cl.air.fit) steps.push(li('Air', 'f_shore / f⊕ = f₀ (v_esc / v_esc,⊕)^p (L / L☉)^q; P = 1 / (1 + e^(Δ / w)), Δ = log₁₀(S / f_shore), averaged over 2,000 draws of the paper\'s posterior', `v_esc ${fmt(ph.vEscKms, 3)} km/s, chance of air ${fmt(cl.air.fit.P * 100, 2)}% (68%: ${fmt(cl.air.fit.lo * 100, 2)} to ${fmt(cl.air.fit.hi * 100, 2)}%), thin or thick by the survey's own rule${cl.air.fit.outside ? ', past the fit\'s sample' : ''}`, '[REAL] Berta-Thompson, Wachiraphan &amp; Murray 2026, extrapolated'));
  if (cl.air) steps.push(li('Air drawn', cl.air.observed ? 'this planet\'s own observation first' : 'no observation: the more probable of bare rock and air by the fit', esc(airLine(cl.air, cl.airKey)), `<a href="exomania-air.html#${cl.air.observed ? 'observed' : 'fit'}">How the survey decides</a>`));
  steps.push(li('Render inputs', 'the look from the size class, the scenario of air drawn, the flux against the habitable-zone limits, and a surface at or above 1,200 K', `${cl.label}; air ${ph.atmDensity >= 0.6 ? 'thick' : ph.atmDensity >= 0.15 ? 'thin' : 'none'}${cl.locked ? '; one face to its star' : ''}`, '[ILLUSTRATIVE] the drawn surface'));
  return `<p class="dim">${esc(p.name)} · every step below runs in your browser on the archive values.</p>
    <h3>Inputs</h3><ul class="chain">${inputs.map(([k, v, s]) => `<li><b>${k}</b> <span class="ch-v">${v}</span> <span class="ch-s">${s}</span></li>`).join('')}</ul>
    <h3>Steps</h3><ol class="chain">${steps.join('')}</ol>`;
}

export function compareHTML(pins, earth, albedo) {
  const cols = [earth, ...pins];
  const rows = [
    ['Radius', (p) => (hasRadius(p) ? `${fmt(p.R, 3)} R⊕` : limitOf(p, 'R') ? `${esc(limitText(limitOf(p, 'R')))} R⊕ (${limitKind(limitOf(p, 'R'))})` : 'no radius measured')],
    ['Mass', (p) => {
      const L = limitOf(p, 'M'), fc = hasTrueMass(p) ? null : forecastFor(p);
      if (hasTrueMass(p)) return `${fmt(p.M, 3)} M⊕`;
      const bound = L ? `${esc(limitText(L))} M⊕ (${limitKind(L)})` : '';
      if (fc) return `~${fmt(fc.median, 2)} M⊕ (model${L ? ', cut by the limit' : ''})${bound ? '; archive ' + bound : ''}`;
      return bound || 'not measured';
    }],
    ['Gravity', (p) => { const m = monteCarlo(p, albedo); return m.g ? `${fmt(m.g.med, 2)} g` : m.hasR ? '—' : 'needs a radius'; }],
    ['Period', (p) => (isNum(p.P) ? `${fmt(p.P, 4)} d` : '—')],
    ['Insolation', (p) => (insolation(p).S ? `${fmt(insolation(p).S, 3)} S⊕` : '—')],
    ['Teq', (p) => { const t = equilibriumTemp(p, albedo); return t ? `${fmtInt(t)} K` : '—'; }],
    ['Zone', (p) => hzPosition(p).label],
    ['Size class', (p) => { const c = sizeClassOf(p); return c ? c.label + (c.fromLimit ? ' (by its bound)' : '') : 'no radius measured'; }],
    ['Star', (p) => `${fmtInt(p.Teff)} K`],
    ['Distance', (p) => (isNum(p.dist) ? `${fmtInt(p.dist * 3.26156)} ly` : 'here')],
  ];
  return `<div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>${cols.map((p, i) => `<th><div class="cmp-thumb" data-i="${i}"></div>${esc(p.name)}${i === 0 ? ' <i>reference</i>' : ` <button type="button" class="chip" data-unpin="${esc(p.name)}" aria-label="Unpin ${esc(p.name)}">×</button>`}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([k, f]) => `<tr><th>${k}</th>${cols.map((p) => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="dim">Every render is the same pipeline fed with that world's values; Earth's comes from its own numbers (NASA fact sheet). Teq at albedo ${albedo}.</p>`;
}

export function methodHTML({ meta, val, valley, transit, teq, hold, rosterNote }) {
  const pc = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
  return `
    <p>Every number on this page comes from the NASA Exoplanet Archive or from a published model applied to it in your browser. The planet image is the exception: its surface is procedural, driven by the measured radius, temperature and star, and is illustrative.</p>
    <h3>Data</h3>
    <p>[REAL] ${esc(DATA.snapshotLabel)}: ${fmtInt(meta.rows)} confirmed planets with the archive's composite values, error bars, mass provenance and limit flags, discovery facts, stellar parameters and the reference for each value. ${esc(rosterNote)}</p>
    <h3>Models</h3>
    <p>[REAL] Mass from radius: the ${esc(CHEN_KIPPING.ref)} relation, inverted on a grid with its intrinsic scatter and the radius error under a log-uniform mass prior (the prior is this page's choice). A catalogue mass limit is a censoring bound: an upper limit cuts the posterior above it, a lower limit below it; a limit is never used as a mass.</p>
    <p>[REAL] Limits: every value the archive flags as a limit (mass, radius, eccentricity, period, orbit, impact parameter, Teq, depth, duration, stellar temperature) is shown as a bound with its sign and never enters a computation as a value. A world with no measured radius gets no size class, gravity, density or scale height; its image is drawn at a stand-in size, labelled on the reticle [ILLUSTRATIVE].</p>
    <p>[REAL] ${MC.draws} Monte Carlo draws carry the radius, mass, stellar and orbit errors into gravity, Teq, scale height and the size-class probabilities.</p>
    <p>[REAL] Habitable zone: ${esc(KOPPARAPU.ref)}, from the star's temperature and luminosity; conservative edges are runaway and maximum greenhouse, optimistic edges recent Venus and early Mars.</p>
    <p>[REAL] Transit: depth from (Rp/R★)² with quadratic limb darkening (${esc(LIMB.ref)}, Sun-like coefficients for every star), integrated numerically over the planet's disc; duration from Seager &amp; Mallén-Ornelas 2003, eq. 3, at the archive's impact parameter, circular orbit. Radial velocity from Lovis &amp; Fischer 2010, eq. 14.</p>
    <p>[REAL] Composition curves on the mass-radius diagram: Seager et al. 2007, eq. 23 and Table 4 (iron, silicate, water ice), drawn to 20 M⊕.</p>
    <p>[REAL] Star colour: the Planck spectrum at the star's temperature through the CIE 1931 colour-matching functions (Wyman, Sloan &amp; Shirley 2013 fit) to sRGB.</p>
    <h3>Checked against the archive</h3>
    <p>[REAL] Mass relation: for the ${fmtInt(val.n)} masses the archive itself derived from radius with Chen &amp; Kipping, this engine's mean inverse differs by a median of ${fmt(val.median * 100, 2)}% (95th percentile ${fmt(val.p95 * 100, 2)}%).</p>
    <p>[REAL] Transit model against published values: depth within 10% for ${pc(transit.depth.rate)} of ${fmtInt(transit.depth.n)} planets (median ratio ${fmt(transit.depth.median, 3)}); duration within 10% for ${pc(transit.dur.rate)} of ${fmtInt(transit.dur.n)} (median ratio ${fmt(transit.dur.median, 3)}). The medians sit near 1, so the model is unbiased; the scatter comes largely from the composite table mixing references, and from eccentric orbits drawn circular. Below the 90% a strict check would ask for.</p>
    <p>[REAL] Withholding test, run in your browser on ${esc(meta.retrieved)} data: for the ${fmtInt(hold.n)} planets with a measured mass (error under 30%) and a published Teq, both are hidden and recomputed. The measured mass falls inside the forecaster's 68% interval for ${pc(hold.massIn68)} of them (${pc(hold.massIn68Small)} of the ${fmtInt(hold.nSmall)} below 6 R⊕; giants over-cover because the relation is nearly flat there, so their interval is wide). A calibrated 68% interval should hold about 68%.</p>
    <p>[REAL] Equilibrium temperature at zero albedo against the published Teq: within 10% for ${pc(teq.rate)} of ${fmtInt(teq.n)} planets (median ratio ${fmt(teq.median, 3)}); papers differ in albedo and heat redistribution.</p>
    <p>[REAL] Radius valley: ${fmtInt(valley.n)} Kepler planets with periods under 100 days and radii known to 10% (one homogeneous survey, as in ${esc(VALLEY.ref)}) put ${valley.valleyMin} in the emptiest bin inside ${VALLEY.lo}-${VALLEY.hi} R⊕ (near ${fmt(valley.valleyAt, 2)} R⊕), against peaks of ${valley.peakBelow} below and ${valley.peakAbove} above. No completeness correction, so the depth is indicative.</p>
    <h3>What the render takes from data</h3>
    <p>[REAL] The kind of world drawn follows from its numbers. The size class comes from the radius, and from the density when a mass is measured. Whether a rock has air is decided in two steps. The ${OBSERVED.length} rocky planets with their own published observation (JWST, and Spitzer for two) are drawn as their papers found, each scenario's status derived from the paper's own bounds: excluded only where a bound rules it out for every composition the paper considers, or by energy balance. Every other rocky planet is drawn by the fit of Berta-Thompson, Wachiraphan &amp; Murray 2026 (ApJ 1011, 123), averaged over the paper's posterior: the probability that it kept an atmosphere, from its escape speed, its sunlight and its star's luminosity. The fit learns from Solar System bodies with any air and from exoplanets whose eclipses show a thick one, so it does not say how thick: thin or thick is the survey's own rule, illustrative. That probability is extrapolated, and the line under the planet says so. Each rocky world carries three scenarios (bare rock, thin air, thick air), each allowed, disfavoured, excluded by an observation, or observed, and any scenario that is not excluded can be drawn from the scenarios and sources under the planet's name. <a href="exomania-air.html">How the survey decides which rocky worlds keep air</a>. Its sunlight is set against the habitable-zone limits of Kopparapu et al. 2013: past the recent-Venus limit a world with full air is drawn as one cloud deck, past the early-Mars limit as ice. A rock whose surface reaches 1,200 K is drawn molten; inside 0.1 AU its day side, 1.19 times hotter, is what counts. The 1,200 K is this page's threshold, inside the 850 to 1,473 K over which rock melts in Essack, Seager &amp; Pajusalu 2020. A world inside the tidal-lock radius of Kasting, Whitmire &amp; Reynolds 1993 (0.46 AU for one solar mass at 4.5 Gyr) is drawn with one face to its star.</p>
    <p>[REAL] The air is drawn by single scattering from gas and haze along each ray. A temperate world carries Earth's Rayleigh optical depth (0.097 at 550 nm, Hansen &amp; Travis 1974) times the share of air it keeps. Sunlit ground follows Lambert's law under a star drawn at its angular size, never under a quarter of a degree. A molten or airless rock, or the cloud tops of a world with no surface, gives its own light when its hottest point is above 750 K (the cut this page uses): Wien's law per channel, as bright against the starlight as a surface in equilibrium with its star. A bare rock with one face to its star takes its hottest point from the star at Bond albedo 0.1 and has a night side of 50 K (Kite et al. 2016); a world whose day side has been measured is drawn at that measured temperature. On a lava world the melt is open where the ground passes 1,673 K (Kite et al. 2016).</p>
    <p>[ILLUSTRATIVE] The positions of continents, mountains, craters, clouds and bands are seeded by the planet's name. Ground colours are constants chosen by hand; the light they return is checked on the Solar System drawn by this same pipeline, where seven of the eight planets come within 30% of their measured geometric albedo. Cloud tops follow the temperature classes of Sudarsky, Burrows &amp; Pinto 2000, anchored on Neptune, Saturn and Jupiter, on HD 189733 b near 1,200 K (Evans et al. 2013) and on WASP-12 b above 1,500 K (Bell et al. 2017). The archive holds no surface pressure, no water inventory and few ages. How much air a rock with air has is not known for any exoplanet: the amount drawn is the share of air kept by escape speed against insolation, held inside the band of the scenario drawn. The gas and haze of every kind of world but the temperate one are chosen amounts. The waterline is set so that the median temperate world is 70% under water, as Earth is; from world to world the share runs from about 55% to 88%. Every system is taken as 4.5 Gyr old for the lock radius. The shell of air is not drawn to scale: a thin one is stretched to cover a pixel (Earth's 4 times, Jupiter's 11), which keeps its brightness seen from above and makes twilight brighter than it would be. No world is drawn with life; "Data only" turns the clouds off. The light is white-balanced three quarters of the way from the star's colour to white. The Earth-likeness score is this page's own measure. Orbit orientations in the system view are arbitrary.</p>
    <h3>Instruments and their tokens</h3>
    <table class="cmp sheet"><tbody>
      <tr><th>Window</th><td>full-bleed WebGL render behind the instruments; glass tinted by the host star (--star-rgb from Teff); bezel line in --text-faint shows camera mode, range and field of view</td></tr>
      <tr><th>Reticle</th><td>name in --text-bright, class in --horizon; brackets in --accretion because they mark the selected world; re-acquire 460 ms, render cross-fade 520 ms, --ease-out</td></tr>
      <tr><th>Target plate</th><td>--panel over --void, --hair rules; tags M D E I as hairline boxes; values --text-bright, notes --text-faint; albedo thumb in --accretion (a live value)</td></tr>
      <tr><th>Catalogue diagram</th><td>points in --text ink (or the method / year ladder), grid and solar system in --horizon, the selection and a brushed box in --accretion</td></tr>
      <tr><th>System and signal</th><td>orbits in --text, the selected orbit and the time cursor in --accretion, habitable zone in --horizon; stars in their computed colour</td></tr>
      <tr><th>Survey note</th><td>ENGINE badge in --line-bright; MODEL TEXT badge and rule in --accretion-dim; rejected numbers in --danger</td></tr>
      <tr><th>Controls</th><td>hairline buttons and chips (--hair, --line); --accretion only when on; IBM Plex Mono (--font-mono) throughout; assembly 700 ms staggered, none under reduced motion</td></tr>
    </tbody></table>
    <h3>Sources</h3><ul>${SOURCES.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    <p class="dim">This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program. The archive states no licence beyond that acknowledgement.</p>`;
}
