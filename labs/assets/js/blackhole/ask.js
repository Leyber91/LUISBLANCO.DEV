/* ============================================================
   blackhole/ask.js — the question box. One model call per
   question through labs/assets/js/ai/llm.js, with the live state
   and every derived number as context, asked for JSON. Numbers in
   the model's reply are checked against the instrument; a reply
   may propose a view the page can apply. The deterministic engine
   below answers first and on its own when no route answers.
   ============================================================ */

import { LLM, extractJSON } from '../ai/llm.js';
import { theoryShadow, shadowFor, predictedUas, sci, dur } from './physics.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATE_KEYS = { a: [0, 0.998], incl: [1, 179], view: ['cinematic', 'telescope', 'journey'], color: ['thermal', 'true', 'redshift', 'order', 'steps'],
  obj: ['m87', 'sgra', 'cygx1', 'primordial'], observer: ['zamo', 'faller', 'orbiter'], emit: ['thick', 'thin', 'off'] };

/** The live numbers, named, with units: the context for the model and the reference for checks. */
export function facts(app) {
  const s = app.store.all(), m = app.model;
  // the state (where a transition is going), not the eased display values; traced numbers
  // only from anchors traced for this view
  const incl = s.view === 'telescope' ? s.incl : (m.obj ? m.obj.incl : 90);
  const ts = shadowFor(s.a, incl, s.q);
  const pred = m.obj ? predictedUas(ts.mean, m.obj) : null;
  const an = app.ui?.liveAnchors?.();
  return {
    object: m.obj ? m.obj.name : 'custom', spin_a: s.a, inclination_deg: +s.incl.toFixed(1), view: s.view, colour_mode: s.color,
    observer: s.observer, observer_r_M: +s.rcam.toFixed(2),
    mass_Msun: m.massSun, horizon_radius_M: +m.rh.toFixed(4), horizon_radius_km: +(m.rh * m.rg / 1000).toPrecision(4),
    photon_orbit_prograde_M: +m.rph.toFixed(4), photon_orbit_retrograde_M: +m.rphr.toFixed(4), isco_M: +m.ri.toFixed(4),
    isco_km: +(m.ri * m.rg / 1000).toPrecision(4), efficiency_percent: +(m.eta * 100).toFixed(2), gas_speed_isco_c: +m.vIsco.toFixed(3),
    shadow_width_M: +ts.chords.width.toFixed(4), shadow_mean_diameter_M: +ts.mean.toFixed(4),
    shadow_uas: pred ? +pred.value.toFixed(2) : null, eht_ring_uas: m.obj?.eht?.ring ?? null, eht_ring_err_uas: m.obj?.eht?.ringErr ?? null,
    disk_peak_temperature_K: m.Tpeak ? +m.Tpeak.toPrecision(3) : null, eddington_ratio: m.edd, hawking_temperature_K: +m.hawkingK.toPrecision(3),
    tide_at_horizon_g_2m: +m.tidalHg.toPrecision(3), radius_tide_10g_M: +m.tide10g.toPrecision(3),
    fall_horizon_to_end_s: +m.interiorTauS.toPrecision(3), isco_period_s: +m.iscoPeriod.toPrecision(3),
    redshift_g_max: an?.gmax ? +an.gmax.toFixed(3) : null, redshift_g_min: an?.gmin ? +an.gmin.toFixed(3) : null,
  };
}

/* ---------------- the deterministic engine: answers from the live state ---------------- */
const TOPICS = [
  { id: 'eht', re: /\beht\b|event horizon telescope|m87|sgr|sagittarius/i },
  { id: 'horizon', re: /(event )?horizon|point of no return|in km|kilomet/i },
  { id: 'shadow', re: /shadow|dark (region|circle|disc|disk)|black (circle|region)|how (big|large|wide)/i },
  { id: 'isco', re: /isco|innermost|last stable|inner edge|disk end|where.*disk (stop|end|begin)/i },
  { id: 'photon', re: /photon (sphere|orbit)|light (orbit|circle)|orbit.*light/i },
  { id: 'ring', re: /ring|sub-?ring|n ?= ?1|thin (gold|line)|lensed (image|copy)|underside|bottom arc|arc/i },
  { id: 'beaming', re: /bright(er)? side|one side|asymmetr|doppler|beam|left side|why.*(bright|dim)/i },
  { id: 'colour', re: /colou?r|orange|white|blue|hue|true colou?r|look like/i },
  { id: 'spin', re: /spin|rotat|frame.?drag|flatten|kerr|d.?shape/i },
  { id: 'eht2', re: /measur|real image|photo/i },
  { id: 'temp', re: /temperat|how hot|kelvin|x-?ray|spectrum/i },
  { id: 'eff', re: /efficien|energy|fusion|power|luminos/i },
  { id: 'fall', re: /fall|time|clock|how long|proper time|freeze|slow/i },
  { id: 'tide', re: /tide|tidal|spaghett|stretch|torn|survive/i },
  { id: 'hawking', re: /hawking|evapor|radiat.*hole|quantum/i },
  { id: 'mass', re: /mass|heav|weigh|same (image|picture)|scale/i },
  { id: 'incl', re: /inclin|angle|edge.?on|face.?on|tilt|view from/i },
  { id: 'lensing', re: /lens|star|bend|einstein|sky|distort/i },
  { id: 'ergo', re: /ergo|penrose|extract/i },
  { id: 'how', re: /how.*(comput|made|render|work|trace)|accura|real or|simulat|equation|code/i },
];

export function answerOffline(app, q) {
  const f = facts(app), s = app.store.all(), m = app.model;
  let topic = (TOPICS.find((t) => t.re.test(q)) || { id: 'what' }).id;
  if (topic === 'eht2') topic = 'eht';
  const kmH = sci(f.horizon_radius_km), kmI = sci(f.isco_km);
  const A = {
    shadow: `The dark region is the shadow: ${f.shadow_width_M.toFixed(2)} M across here, ${(f.shadow_mean_diameter_M / (2 * f.horizon_radius_M)).toFixed(1)} times the horizon's ${(2 * f.horizon_radius_M).toFixed(2)} M. Light aimed inside the critical curve spirals in past the photon orbits and never comes back, so the dark patch is larger than the horizon itself.`,
    horizon: `The outer horizon sits at r+ = ${f.horizon_radius_M.toFixed(3)} M, ${kmH} km for ${sci(f.mass_Msun)} solar masses. It is not drawn: what you see is the shadow, about 2.6 times wider.`,
    isco: `The disk ends at the innermost stable circular orbit, ${f.isco_M.toFixed(3)} M (${kmI} km). Inside it no circular orbit is stable and gas plunges without radiating much. Spin ${s.a.toFixed(3)} pulls it in from 6 M; there the gas moves at ${f.gas_speed_isco_c} c and has radiated ${f.efficiency_percent}% of its rest mass.`,
    photon: `Light can circle the hole at the photon orbits: ${f.photon_orbit_prograde_M.toFixed(3)} M moving with the spin, ${f.photon_orbit_retrograde_M.toFixed(3)} M against it. Those orbits are unstable, and the rays that skim them outline the shadow.`,
    ring: `The thin bright lines hugging the shadow are higher-order images: light from the disk that went around the hole once (n = 1) or twice (n = 2) before reaching you. Each extra half-orbit thins the image by e^-gamma, about 1/23 at zero spin (Johnson et al. 2020). The Measure panel traces them.`,
    beaming: `Gas on the approaching side moves toward you at up to ${f.gas_speed_isco_c} c. Its light arrives with redshift factor g up to ${f.redshift_g_max ?? '--'}, and intensity scales as g^4, so it is ${f.redshift_g_max ? Math.pow(f.redshift_g_max, 4).toFixed(1) : 'many'} times brighter; the receding side drops to g = ${f.redshift_g_min ?? '--'}. Switch colour to Redshift g to see the map.`,
    colour: `In Thermal mode each pixel's hue is a blackbody at its observed temperature g T, with the peak shown at ${s.tdisp} K so the shifts are visible. True colour uses the real temperature, ${f.disk_peak_temperature_K ? sci(f.disk_peak_temperature_K) + ' K' : 'set by mass and accretion rate'}; anything above about 10,000 K looks blue-white to an eye.`,
    spin: `Spin a = ${s.a.toFixed(3)} drags space around the hole. Light moving with the rotation can orbit closer (${f.photon_orbit_prograde_M.toFixed(2)} M) than light moving against it (${f.photon_orbit_retrograde_M.toFixed(2)} M), so the shadow is flattened on the approaching side and shifted. At high inclination the effect is strongest.`,
    eht: f.eht_ring_uas ? `For ${f.object}, the traced shadow is ${f.shadow_mean_diameter_M.toFixed(2)} M across; at the cited mass and distance that is ${f.shadow_uas} uas on the sky. The EHT measured a ring of ${f.eht_ring_uas} +- ${f.eht_ring_err_uas} uas. The ring is emission just outside the shadow edge, so a slightly larger ring is expected.`
      : `Pick M87* or Sgr A* to compare the traced shadow with the Event Horizon Telescope. ${f.shadow_uas ? `This object's shadow would be ${sci(f.shadow_uas)} uas on the sky, far below the EHT's roughly 20 uas resolution.` : ''}`,
    temp: f.disk_peak_temperature_K ? `With ${sci(f.mass_Msun)} solar masses at Eddington ratio ${sci(f.eddington_ratio)}, the Novikov-Thorne disk peaks at ${sci(f.disk_peak_temperature_K)} K locally. Temperature scales as M^-1/4, which is why stellar-mass holes shine in X-rays and giant ones in ultraviolet or optical light.`
      : 'This object has no accretion disk to speak of, so there is no disk temperature. Its own Hawking temperature is in the Instrument panel.',
    eff: `Gas reaching the ISCO at spin ${s.a.toFixed(3)} has radiated ${f.efficiency_percent}% of its rest-mass energy (1 - E at the ISCO, Bardeen, Press & Teukolsky 1972). Hydrogen fusion releases 0.7%.`,
    fall: `Falling from rest far away, you cross the horizon after a finite time on your own clock; a distant clock never sees you cross, your light redshifting by e every ${dur(m.efold)}. From the horizon to the end takes ${dur(f.fall_horizon_to_end_s)} of your time here. Press Fall in to watch both clocks.`,
    tide: f.radius_tide_10g_M > f.horizon_radius_M ? `At ${sci(f.mass_Msun)} solar masses the tide across a 2 m body reaches 10 g at ${f.radius_tide_10g_M.toFixed(1)} M, outside the horizon, and ${sci(f.tide_at_horizon_g_2m)} g at the horizon: you would be stretched apart before crossing it.`
      : `At ${sci(f.mass_Msun)} solar masses the tide at the horizon across a 2 m body is only ${sci(f.tide_at_horizon_g_2m)} g. Tides scale as M/r^3, so giant holes are gentle at the horizon and lethal only deep inside.`,
    hawking: `A hole of ${sci(f.mass_Msun)} solar masses radiates like a blackbody at the Hawking temperature, ${sci(f.hawking_temperature_K)} K (Hawking 1975). That is colder than the 2.7 K cosmic background for any hole above about 0.75% of the Moon's mass, so real astrophysical holes absorb more than they emit.`,
    mass: `In units of M every hole of the same spin looks identical: the shadow is ${f.shadow_width_M.toFixed(2)} M wide whether M is ${sci(f.mass_Msun)} or ten solar masses. Mass only sets the scale (here 1 M = ${sci(m.rg / 1000)} km) and the disk temperature.`,
    incl: `You are viewing at ${f.inclination_deg} deg from the spin axis. Near edge-on the far side of the disk appears lensed over the top, and the spin flattening is strongest; face-on the shadow is a circle.`,
    lensing: 'Each sky pixel is a star whose light was bent on the way. Near the critical curve the bending diverges, so the whole sky is copied into ever-thinner rings: switch the emitter off to see the lensed sky alone.',
    ergo: `Outside the horizon lies the ergoregion, out to 2 M at the equator (dashed in the cross-section). Inside it nothing can stay still relative to distant stars; in principle energy can be extracted from the spin there (Penrose process).`,
    how: 'Each pixel is a light ray integrated backward through the exact Kerr metric (Hamiltonian form in Kerr-Schild coordinates, fourth-order Runge-Kutta). The same equations run in JavaScript, where verify.mjs checks the shadow against Bardeen (1973) to within 0.002%, plus 37 other published values.',
    what: `You are looking at ${f.object}${m.obj ? '' : ' (custom)'}: a hole of spin ${s.a.toFixed(3)} whose light rays are traced through curved spacetime. The black region is the shadow (${f.shadow_width_M.toFixed(2)} M), the bright arc over the top is the far side of the disk bent into view, and the brighter side moves toward you.`,
  };
  // state requests the engine can act on
  let state = null;
  if (/edge.?on/i.test(q)) state = { ...(state || {}), incl: 88 };
  if (/face.?on|from above|top.?down/i.test(q)) state = { ...(state || {}), incl: 3 };
  if (/max(imal|imum)? spin|extreme|fastest/i.test(q)) state = { ...(state || {}), a: 0.998 };
  if (/no spin|schwarzschild|not spinning/i.test(q)) state = { ...(state || {}), a: 0 };
  if (/telescope|as the eht/i.test(q)) state = { ...(state || {}), view: 'telescope' };
  return { text: A[topic], topic, state };
}

/* ---------------- checking a model reply against the instrument ---------------- */
const CHECKS = [
  [/horizon/i, (f) => f.horizon_radius_M, 'M'], [/isco|innermost|last stable/i, (f) => f.isco_M, 'M'],
  [/photon/i, (f) => f.photon_orbit_prograde_M, 'M'], [/shadow.*(uas|micro)/i, (f) => f.shadow_uas, 'uas'],
  [/shadow/i, (f) => f.shadow_mean_diameter_M, 'M'], [/efficien/i, (f) => f.efficiency_percent, '%'],
  [/temperat/i, (f) => f.disk_peak_temperature_K, 'K'], [/tide|tidal/i, (f) => f.tide_at_horizon_g_2m, 'g'],
  [/spin/i, (f) => f.spin_a, ''], [/inclin/i, (f) => f.inclination_deg, 'deg'], [/speed|velocity/i, (f) => f.gas_speed_isco_c, 'c'],
];
export function checkNumbers(nums, f) {
  const out = [];
  for (const n of Array.isArray(nums) ? nums : []) {
    const name = String(n.name || ''), v = Number(n.value);
    if (!Number.isFinite(v)) continue;
    const c = CHECKS.find(([re]) => re.test(name));
    if (!c) { out.push({ name, v, status: 'unchecked' }); continue; }
    const ref = c[1](f);
    if (ref == null) { out.push({ name, v, status: 'unchecked' }); continue; }
    // allow M vs km confusion only through the named unit
    const ok = Math.abs(v - ref) <= Math.max(0.02 * Math.abs(ref), 1e-3);   // flag differences over 2%
    out.push({ name, v, ref, status: ok ? 'ok' : 'mismatch' });
  }
  return out;
}

export function cleanState(st) {
  if (!st || typeof st !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(st)) {
    const rule = STATE_KEYS[k];
    if (!rule) continue;
    if (typeof rule[0] === 'number') { const n = Number(v); if (Number.isFinite(n)) out[k] = Math.max(rule[0], Math.min(rule[1], n)); }
    else if (rule.includes(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function mountAsk(card, app) {
  card.innerHTML = `<h2>Ask about this view <em>one model call</em></h2>
    <form class="bh-ask" id="bh-askf"><input id="bh-askq" type="text" maxlength="240" placeholder="why is one side brighter?" aria-label="Your question about the black hole"><button class="bh-btn go" type="submit">Ask</button></form>
    <div class="bh-chips" id="bh-chips"></div><div class="bh-answer" id="bh-ans" aria-live="polite"></div>`;
  const chips = ['how big is the shadow?', 'where does the disk end?', 'would the tide kill me?', 'how does this compare with the EHT?', 'show me edge-on at maximum spin'];
  const chipBox = card.querySelector('#bh-chips');
  chips.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bh-chip'; b.textContent = c; b.addEventListener('click', () => { card.querySelector('#bh-askq').value = c; ask(c); }); chipBox.appendChild(b); });
  const ans = card.querySelector('#bh-ans');
  let ctrl = null;

  const render = (text, { src = '', checks = [], state = null, pending = false } = {}) => {
    const okN = checks.filter((c) => c.status === 'ok').length, bad = checks.filter((c) => c.status === 'mismatch');
    const chk = checks.length ? `<span class="src">checked against the instrument: <span class="chk">${okN} of ${checks.length} numbers match</span>${bad.length ? `; <span class="bad">${bad.map((b) => `${esc(b.name)} said ${b.v}, instrument ${b.ref}`).join('; ')}</span>` : ''}</span>` : '';
    ans.innerHTML = `${esc(text)}${chk}${state ? `<span class="src"><button class="bh-chip" type="button" id="bh-apply">apply: ${esc(Object.entries(state).map(([k, v]) => `${k} ${v}`).join(', '))}</button></span>` : ''}<span class="src">${pending ? 'asking a model for a fuller answer... ' : ''}${esc(src)}</span>`;
    if (state) ans.querySelector('#bh-apply').addEventListener('click', () => { app.tour?.stop(); app.store.set(state); });
  };

  async function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    ctrl?.abort();
    ctrl = new AbortController();
    const off = answerOffline(app, q);
    render(off.text, { src: 'instrument answer (deterministic, from the live state)', state: off.state, pending: true });
    const f = facts(app);
    try {
      const r = await LLM.complete({
        system: 'You explain a ray-traced Kerr black hole shown on a web page to a curious visitor. Use ONLY the numbers in CONTEXT; never invent or round them differently. Plain sentences, at most 90 words, no lists. ' +
          'Reply with one JSON object and nothing else: {"answer": string, "numbers": [{"name": string, "value": number, "unit": string}], "state": null or an object with any of a (0-0.998), incl (1-179), view (cinematic|telescope|journey), color (thermal|true|redshift|order|steps), obj (m87|sgra|cygx1|primordial), observer (zamo|faller|orbiter), emit (thick|thin|off) when the visitor asks to see something}.',
        prompt: `CONTEXT ${JSON.stringify(f)}\n\nQUESTION ${q}`,
        temperature: 0.2, maxWaitMs: 12000, timeoutMs: 40000, signal: ctrl.signal,
        fallback: () => JSON.stringify({ answer: off.text, numbers: [], state: off.state }),
      });
      if (r.source === 'offline') { render(off.text, { src: 'instrument answer: no model route answered', state: off.state }); return; }
      // the public route sometimes answers in prose instead of JSON: use the prose, unchecked
      const j = extractJSON(r.text) || {};
      const prose = String(r.text || '').replace(/```[\s\S]*?```/g, '').trim();
      const text = typeof j.answer === 'string' && j.answer.trim() ? j.answer.trim() : (prose && prose.length < 1200 ? prose : off.text);
      const checks = checkNumbers(j.numbers, f);
      render(text, { src: `answered by ${r.model} via ${r.source} in ${(r.ms / 1000).toFixed(1)} s`, checks, state: cleanState(j.state) || off.state });
      console.info('[ask]', r.source, r.model, `${checks.filter((c) => c.status === 'ok').length}/${checks.length} numbers match`, text.slice(0, 160));
    } catch (e) {
      if (e.name === 'AbortError') return;
      render(off.text, { src: 'instrument answer (model unavailable)', state: off.state });
    }
  }

  card.querySelector('#bh-askf').addEventListener('submit', (e) => { e.preventDefault(); ask(card.querySelector('#bh-askq').value); });
  return { ask };
}

