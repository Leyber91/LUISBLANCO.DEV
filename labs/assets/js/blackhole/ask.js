/* ============================================================
   blackhole/ask.js — the question box. One model call per
   question through labs/assets/js/ai/llm.js, with the live state
   and every derived number as context, asked for JSON. Numbers in
   the model's reply are checked against the instrument; a reply
   may propose a view the page can apply. The deterministic engine
   below answers first and on its own when no route answers.
   ============================================================ */

import { LLM, extractJSON } from '../ai/llm.js';
import * as K from './kerr.js';
import { measurement, compareSentence, ringGamma, cmbCrossover, fusionPercent, ergosurface, RULING, SHADOW_HOW, MEAN_DEF, BODY_M, TIDE_G, sigNum, s3, sci, dur, deg, spinText, pmText, ASCII } from './physics.js';
import { COPY, CITE, EHT_RES } from './config.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATE_KEYS = { a: [0, 0.998], incl: [1, 179], view: ['cinematic', 'telescope', 'journey'], color: ['thermal', 'true', 'redshift', 'order', 'steps'],
  obj: ['m87', 'sgra', 'cygx1', 'primordial'], observer: ['zamo', 'faller', 'orbiter'], emit: ['thick', 'thin', 'off'] };

/** The live numbers, named, with units: the context for the model and the reference for checks. Every number
 *  keeps 4 significant figures (physics.js sigNum; 3 for a sigma), never fixed decimals: at two decimals Cygnus
 *  X-1's 9.1e-4 uas was 0 (review_s2 P1-2). A key names its quantity and its unit, and a reply quotes numbers
 *  by these keys (checkNumbers). Every shadow number is physics.measurement's and comes with the inclination it
 *  was measured at, apart from the camera's (fix_s2_p1 K1); the comparison carries only what the ruling allows for
 *  the object, its errors, and its scale with that scale's source (K2, K3). A null is a quantity that does not
 *  exist for this object. */
export function facts(app) {
  const s = app.store.all(), m = app.model;
  // the state (where a transition is going), not the eased display values; traced numbers
  // only from anchors traced for this view
  const ms = measurement(s), ts = ms.th;
  // the comparison with the EHT is compareShadow's, worded by compareSentence (ledger row 2)
  const cmp = ms.cmp;
  const pred = cmp ? cmp.pred : null;
  const an = app.ui?.liveAnchors?.();
  const n = sigNum;
  return {
    object: m.obj ? m.obj.name : 'custom', spin_a: s.a, camera_inclination_deg: n(s.incl), view: s.view, colour_mode: s.color, emitter: s.emit,
    observer: s.observer, observer_r_M: n(s.rcam),
    mass_Msun: n(m.massSun), mass_from: m.obj?.massBy ?? null,
    horizon_radius_M: n(m.rh), horizon_radius_km: n(m.rh * m.rg / 1000),
    photon_orbit_prograde_M: n(m.rph), photon_orbit_retrograde_M: n(m.rphr), isco_M: n(m.ri),
    isco_km: n(m.ri * m.rg / 1000), efficiency_percent: n(m.eta * 100), gas_speed_isco_c: n(m.vIsco),
    shadow_inclination_deg: n(ms.incl), shadow_from: SHADOW_HOW[ts.how].label, shadow_mean_definition: MEAN_DEF,
    shadow_width_M: n(ts.chords.width), shadow_height_M: n(ts.chords.height), shadow_mean_diameter_M: n(ts.mean), shadow_to_horizon: n(ms.toHorizon),
    shadow_uas: pred ? n(pred.value) : null, shadow_uas_err_plus: pred ? n(pred.errP) : null, shadow_uas_err_minus: pred ? n(pred.errM) : null,
    shadow_scale_uas_per_M: pred ? n(pred.thetaG) : null, shadow_scale_err_plus: pred ? n(pred.thetaErrP) : null, shadow_scale_err_minus: pred ? n(pred.thetaErrM) : null,
    shadow_scale_by: pred && pred.by ? pred.by : 'its mass and distance', shadow_scale_source: pred ? pred.src : null,
    eht_ring_uas: cmp?.ring?.value ?? null, eht_ring_err_uas: cmp?.ring?.err ?? null,
    eht_shadow_uas: cmp?.shadow?.value ?? null, eht_shadow_err_uas: cmp?.shadow?.err ?? null, sigma_shadow: cmp?.shadow ? n(cmp.shadow.sigma, 3) : null,
    eht_resolution_uas: EHT_RES.uas, eht_resolution_source: `${CITE[EHT_RES.src]}, ${EHT_RES.where}`,
    eht_sentence: compareSentence(cmp, m.obj ? m.obj.name : 'this hole'), eht_ruling: RULING,
    disk_peak_temperature_K: m.Tpeak ? n(m.Tpeak) : null, eddington_ratio: n(m.edd), hawking_temperature_K: n(m.hawkingK),
    tide_body_m: BODY_M, tide_at_horizon_g: n(m.tidalHg), lethal_tide_g: TIDE_G, radius_lethal_tide_M: n(m.tide10g),
    fall_horizon_to_end_s: n(m.interiorTauS), isco_period_s: n(m.iscoPeriod),
    redshift_g_max: an?.gmax ? n(an.gmax) : null, redshift_g_min: an?.gmin ? n(an.gmin) : null,
  };
}

/* ---------------- the deterministic engine: answers from the live state ---------------- */
// Read in this order, first match wins; ask.test.mjs holds one question per topic. A topic whose words another
// topic also uses comes first: "Hawking temperature" is the Hawking topic, not the disk's (review_s2 P2-7).
const TOPICS = [
  { id: 'hawking', re: /hawking|evapor|radiat.*hole|quantum/i },
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
  // every number in the format of its kind (physics.js), from the function the readout beside it uses; every shadow
  // number is the measurement's and is said with the inclination it was measured at (fix_s2_p1 K1)
  const kmH = sci(f.horizon_radius_km), kmI = sci(f.isco_km), ratio = s3(f.shadow_to_horizon);
  const far = `seen from far away at ${deg(f.shadow_inclination_deg)} deg`;
  const onSky = f.shadow_uas != null ? `at ${pmText(f.shadow_scale_uas_per_M, f.shadow_scale_err_plus, f.shadow_scale_err_minus, ASCII)} uas per M, the scale from ${f.shadow_scale_by} (${f.shadow_scale_source}), that is ${pmText(f.shadow_uas, f.shadow_uas_err_plus, f.shadow_uas_err_minus, ASCII)} uas on the sky` : '';
  const gam = ringGamma(s.a, s.q), cmb = cmbCrossover();
  // an answer that describes the view is written for the emitter on screen; the telescope view's thick disk hides
  // the outer shadow (review_s2 P2-9)
  const disk = s.emit === 'thick', thin = s.emit === 'thin', tel = s.view === 'telescope';
  const g4 = f.redshift_g_max ? s3(Math.pow(f.redshift_g_max, 4)) : 'many';
  const A = {
    shadow: `The dark region is the shadow. ${far.charAt(0).toUpperCase() + far.slice(1)} it is ${s3(f.shadow_width_M)} M wide, and its mean diameter, ${MEAN_DEF}, is ${ratio} times the horizon's ${s3(2 * f.horizon_radius_M)} M. Light aimed inside the critical curve spirals in past the photon orbits and never comes back, so the dark patch is larger than the horizon itself.`,
    horizon: `The outer horizon sits at r+ = ${s3(f.horizon_radius_M)} M, ${kmH} km for ${sci(f.mass_Msun)} solar masses. It is not drawn: what you see is the shadow, ${ratio} times wider ${far}.`,
    isco: `The disk ends at the innermost stable circular orbit, ${s3(f.isco_M)} M (${kmI} km). Inside it no circular orbit is stable and gas plunges without radiating much. Spin ${spinText(s.a)} pulls it in from ${s3(K.isco(0, 1, s.q))} M, the non-spinning value; there the gas moves at ${s3(f.gas_speed_isco_c)} c and has radiated ${s3(f.efficiency_percent)}% of its rest mass.`,
    photon: `Light can circle the hole at the photon orbits: ${s3(f.photon_orbit_prograde_M)} M moving with the spin, ${s3(f.photon_orbit_retrograde_M)} M against it. Those orbits are unstable, and the rays that skim them outline the shadow.`,
    ring: `${disk ? 'The thin bright lines hugging the shadow are higher-order images: light from the disk that went around the hole once (n = 1) or twice (n = 2) before reaching you.' : thin ? 'The bright ring is light from the hot thin gas that skimmed the photon orbits on its way to you; it sits on the critical curve.' : 'With the emitter off, the rings hugging the shadow are copies of the sky, bent around the hole once, twice and more.'} ${gam == null ? 'Each extra half-orbit thins such an image by e^-gamma; for a charged hole no closed form is used here.' : `Each extra half-orbit thins the image by e^-gamma, 1/${s3(Math.exp(gam))} at this spin (Johnson et al. 2020).`} The Measure panel traces them.`,
    beaming: disk ? `Gas on the approaching side moves toward you at up to ${s3(f.gas_speed_isco_c)} c. Its light arrives with redshift factor g up to ${f.redshift_g_max == null ? '--' : s3(f.redshift_g_max)}, and intensity scales as g^4, so it is ${g4} times brighter; the receding side drops to g = ${f.redshift_g_min == null ? '--' : s3(f.redshift_g_min)}. Switch colour to Redshift g to see the map.`
      : 'There is no disk in this view, so no side of it is beamed toward you. Choose the thin disk (thick) as the emitter and Redshift g as the colour to see the approaching side brighten.',
    colour: `In Thermal mode each pixel's hue is a blackbody at its observed temperature g T, with the peak shown at ${sci(s.tdisp)} K so the shifts are visible. True colour uses the real temperature, ${f.disk_peak_temperature_K ? sci(f.disk_peak_temperature_K) + ' K' : 'set by mass and accretion rate'}; anything above about 10,000 K looks blue-white to an eye.`,
    spin: `Spin a = ${spinText(s.a)} drags space around the hole. Light moving with the rotation can orbit closer (${s3(f.photon_orbit_prograde_M)} M) than light moving against it (${s3(f.photon_orbit_retrograde_M)} M), so the shadow is flattened on the approaching side and shifted. At high inclination the effect is strongest.`,
    // the ring of emission is named only inside eht_sentence (checkNumbers reads the reply for it)
    eht: m.obj?.eht && f.shadow_uas != null ? `For ${f.object}, ${far}, the traced shadow is ${s3(f.shadow_mean_diameter_M)} M across, its mean diameter ${MEAN_DEF}; ${onSky}. ${f.eht_sentence}`
      : `Pick M87* or Sgr A* to compare the traced shadow with the Event Horizon Telescope. ${f.shadow_uas != null ? `${far.charAt(0).toUpperCase() + far.slice(1)}, this object's shadow is ${s3(f.shadow_mean_diameter_M)} M across; ${onSky}, far below the EHT's nominal resolution of ${f.eht_resolution_uas} uas (${f.eht_resolution_source}).` : m.obj ? 'This object has no distance, so no size on the sky.' : 'A custom hole has no measured mass and distance, so the lab gives it no size on the sky.'}`,
    temp: f.disk_peak_temperature_K ? `With ${sci(f.mass_Msun)} solar masses at Eddington ratio ${sci(f.eddington_ratio)}, the Novikov-Thorne disk peaks at ${sci(f.disk_peak_temperature_K)} K locally. Temperature scales as M^-1/4, which is why stellar-mass holes shine in X-rays and giant ones in ultraviolet or optical light.`
      : 'This object has no accretion disk to speak of, so there is no disk temperature. Its own Hawking temperature is in the Instrument panel.',
    eff: `Gas reaching the ISCO at spin ${spinText(s.a)} has radiated ${s3(f.efficiency_percent)}% of its rest-mass energy (1 - E at the ISCO, Bardeen, Press & Teukolsky 1972). Hydrogen fusing to helium releases ${s3(fusionPercent())}%.`,
    fall: `Falling from rest far away, you cross the horizon after a finite time on your own clock; a distant clock never sees you cross, your light redshifting by e every ${dur(m.efold)}. From the horizon to the end takes ${dur(f.fall_horizon_to_end_s)} of your time here. Press Fall in to watch both clocks.`,
    tide: f.radius_lethal_tide_M > f.horizon_radius_M ? `At ${sci(f.mass_Msun)} solar masses the tide across a ${BODY_M} m body reaches ${TIDE_G} g at ${s3(f.radius_lethal_tide_M)} M, outside the horizon, and ${sci(f.tide_at_horizon_g)} g at the horizon: you would be stretched apart before crossing it.`
      : `At ${sci(f.mass_Msun)} solar masses the tide at the horizon across a ${BODY_M} m body is only ${sci(f.tide_at_horizon_g)} g. Tides scale as M/r^3, so giant holes are gentle at the horizon and lethal only deep inside.`,
    // the crossover is computed, at a = 0 (review_s2 P2-6)
    hawking: `A hole of ${sci(f.mass_Msun)} solar masses radiates like a blackbody at the Hawking temperature, ${sci(f.hawking_temperature_K)} K (Hawking 1975). A non-spinning hole is colder than the ${cmb.T} K cosmic background above ${s3(cmb.moons)} Moon masses (${sci(cmb.kg)} kg), and spin or charge cools a hole further, so real astrophysical holes absorb more than they emit.`,
    mass: `In units of M every hole of the same spin looks identical: ${far} the shadow is ${s3(f.shadow_width_M)} M wide whether M is ${sci(f.mass_Msun)} or ten solar masses. Mass only sets the scale (here 1 M = ${sci(m.rg / 1000)} km) and the disk temperature.`,
    incl: `You are viewing at ${deg(s.incl)} deg from the spin axis. ${disk && !tel ? 'Near edge-on the far side of the disk appears lensed over the top, and the spin flattening is strongest; face-on the shadow is a circle.' : 'Near edge-on the spin flattens the shadow on its approaching side the most; face-on the shadow is a circle.'}`,
    lensing: 'Each sky pixel is a star whose light was bent on the way. Near the critical curve the bending diverges, so the whole sky is copied into ever-thinner rings: switch the emitter off to see the lensed sky alone.',
    ergo: `Outside the horizon lies the ergoregion, out to ${s3(ergosurface(s.a, s.q, 90))} M at the equator (dashed in the cross-section). Inside it nothing can stay still relative to distant stars; in principle energy can be extracted from the spin there (Penrose process).`,
    // the claim of what is checked is the Sources panel's own string, with no count (review_s2 P2-5)
    how: `Each pixel is a light ray integrated backward through the exact Kerr metric (Hamiltonian form in Kerr-Schild coordinates, fourth-order Runge-Kutta). The same equations run in JavaScript: ${COPY.verify}`,
    what: `You are looking at ${f.object}${m.obj ? '' : ' (custom)'}: a hole of spin ${spinText(s.a)} whose light rays are traced through curved spacetime. ${
      disk && tel ? `An opaque disk reaching the ISCO covers the outer shadow, so the dark patch is the inner shadow; the shadow itself is ${s3(f.shadow_width_M)} M wide ${far}.`
        : disk ? `The black region is the shadow (${s3(f.shadow_width_M)} M wide ${far}), the bright arc over the top is the far side of the disk bent into view, and the brighter side moves toward you.`
          : thin ? `The black region is the shadow (${s3(f.shadow_width_M)} M wide ${far}), seen through hot, optically thin gas as the EHT sees it; the bright ring is that gas's light bent around the hole.`
            : `The black region is the shadow (${s3(f.shadow_width_M)} M wide ${far}) against the sky, every star's light bent on its way to you.`}`,
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
/** The CONTEXT keys of the shadow and of the ring of emission: a reply that quotes one of each relates a shadow to a
 *  ring, which the ruling allows in no form (fix_s2_p1 K3). */
export const SHADOW_KEYS = ['shadow_width_M', 'shadow_height_M', 'shadow_mean_diameter_M', 'shadow_to_horizon', 'shadow_uas', 'shadow_uas_err_plus',
  'shadow_uas_err_minus', 'eht_shadow_uas', 'eht_shadow_err_uas', 'sigma_shadow'];
export const RING_KEYS = ['eht_ring_uas', 'eht_ring_err_uas'];

/** Whether a number stands in a text as a number of its own: 42 in "the 42 uas ring", not in 420 or 4.2. */
export function quotes(text, v) {
  const t = String(v).replace('.', '\\.');
  return new RegExp(`(^|[^\\d.])${t}${String(v).includes('.') ? '0*' : '(\\.0+)?'}(?![\\d])`).test(String(text));
}

/** A reply's numbers name the CONTEXT key each quotes ({"key": "shadow_uas", "value": 52.57}), and each is checked
 *  against that key's value, within 2% of it. A number that names no key, or a key whose value is text, is
 *  unchecked: never matched to a quantity by a word near it, which set the EHT's ring against the lab's shadow and
 *  its shadow against the horizon (review_s2 P1-1). The key carries its unit in its name.
 *  The reply as a whole is then read against the ruling (fix_s2_p1 K3, K1), and each break is an entry marked
 *  wrong with the reason the visitor reads:
 *  - a number quoted for a key the CONTEXT holds as null: that quantity does not exist for this object (M87*'s EHT
 *    shadow and its sigma), "not in the lab's facts";
 *  - a shadow number quoted with a ring of emission, by its key or by its value anywhere outside eht_sentence (the
 *    only place the ruling lets the ring stand beside the shadow): a sigma, a ratio, a percentage or a match alike;
 *  - a shadow number quoted with the camera's inclination when the shadow was measured at another and that one is
 *    not quoted. */
export function checkNumbers(nums, f, answer = '') {
  const out = [];
  for (const n of Array.isArray(nums) ? nums : []) {
    const key = String(n.key || ''), v = Number(n.value);
    if (!Number.isFinite(v)) continue;
    const has = Object.prototype.hasOwnProperty.call(f, key), ref = has ? f[key] : undefined;
    if (has && ref === null) { out.push({ name: key, v, status: 'wrong', why: `none for ${f.object}: not in the lab's facts` }); continue; }
    if (typeof ref !== 'number') { out.push({ name: key || String(n.name || ''), v, status: 'unchecked' }); continue; }
    const ok = Math.abs(v - ref) <= 0.02 * Math.abs(ref);   // relative to the value, so 0 is wrong for 9e-4
    out.push({ name: key, v, ref, status: ok ? 'ok' : 'mismatch' });
  }
  const keys = new Set(out.map((o) => o.name)), shadow = SHADOW_KEYS.some((k) => keys.has(k));
  const rest = f.eht_sentence ? String(answer).split(f.eht_sentence).join(' ') : String(answer);
  const ring = RING_KEYS.some((k) => keys.has(k)) || (typeof f.eht_ring_uas === 'number' && quotes(rest, f.eht_ring_uas));
  if (shadow && ring) out.push({ name: 'eht_ruling', rule: true, status: 'wrong', why: 'a shadow set against the ring of emission, which the ruling allows in no form' });
  if (shadow && keys.has('camera_inclination_deg') && !keys.has('shadow_inclination_deg') && f.camera_inclination_deg !== f.shadow_inclination_deg) {
    out.push({ name: 'shadow_inclination_deg', rule: true, status: 'wrong', why: `the shadow is measured at ${deg(f.shadow_inclination_deg)} deg, and the camera's ${deg(f.camera_inclination_deg)} deg is another view` });
  }
  return out;
}

/** The line under a model's answer: how many quoted numbers match, then each one that does not and each break of
 *  the ruling, with its reason (fix_s2_p1 K3: the visitor reads why). Rows marked wrong are counted with the rest. */
export function badge(checks, escape = (x) => String(x)) {
  if (!checks.length) return '';
  const nums = checks.filter((c) => !c.rule);
  const okN = nums.filter((c) => c.status === 'ok').length;
  const bad = checks.filter((c) => c.status === 'mismatch' || c.status === 'wrong').map((b) => (b.status === 'mismatch'
    ? `${b.name} said ${b.v}, instrument ${b.ref}` : b.rule ? b.why : `${b.name} said ${b.v}: ${b.why}`));
  return `<span class="src">checked against the instrument: <span class="chk">${okN} of ${nums.length} numbers match</span>${bad.length ? `; <span class="bad">${bad.map(escape).join('; ')}</span>` : ''}</span>`;
}

/** The patch the guide's "apply" sets: an object it names comes with its preset for the view, as the object button
 *  gives it, so the state never pairs a name with another object's mass (fix_s2_p1 K5). */
export function applyPatch(store, st) {
  return st.obj ? { ...store.objectPatch(st.obj, st.view ?? store.get('view')), ...st } : st;
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

/** What the model is told: the ruling in full, not only its sigma (fix_s2_p1 K3, S4), the meaning of a null (S5),
 *  and which inclination the shadow's numbers are measured at (K1). ask.test.mjs reads it. */
export const SYSTEM = 'You explain a ray-traced Kerr black hole shown on a web page to a curious visitor. Use ONLY the numbers in CONTEXT; never invent or round them differently. A null in CONTEXT is a quantity that does not exist for this object: give no number for it. ' +
  'Follow eht_ruling in full: never relate a shadow number to a ring of emission in any form, not by a sigma, a ratio, a percentage, "matches" or "within"; for the comparison with the Event Horizon Telescope quote eht_sentence word for word and list none of its numbers. ' +
  'The shadow numbers are measured at shadow_inclination_deg, seen from far away; camera_inclination_deg is the view on screen: name the inclination beside every shadow number. Plain sentences, at most 90 words, no lists. ' +
  'Reply with one JSON object and nothing else: {"answer": string, "numbers": [{"key": the CONTEXT key of each number the answer quotes, "value": number}], "state": null or an object with any of a (0-0.998), incl (1-179), view (cinematic|telescope|journey), color (thermal|true|redshift|order|steps), obj (m87|sgra|cygx1|primordial), observer (zamo|faller|orbiter), emit (thick|thin|off) when the visitor asks to see something}.';

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
    ans.innerHTML = `${esc(text)}${badge(checks, esc)}${state ? `<span class="src"><button class="bh-chip" type="button" id="bh-apply">apply: ${esc(Object.entries(state).map(([k, v]) => `${k} ${v}`).join(', '))}</button></span>` : ''}<span class="src">${pending ? 'asking a model for a fuller answer... ' : ''}${esc(src)}</span>`;
    // an object named by the reply arrives with its own preset, as its button gives it (fix_s2_p1 K5)
    if (state) ans.querySelector('#bh-apply').addEventListener('click', () => { app.tour?.stop(); app.store.set(applyPatch(app.store, state)); });
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
        system: SYSTEM,
        prompt: `CONTEXT ${JSON.stringify(f)}\n\nQUESTION ${q}`,
        temperature: 0.2, maxWaitMs: 12000, timeoutMs: 40000, signal: ctrl.signal,
        fallback: () => JSON.stringify({ answer: off.text, numbers: [], state: off.state }),
      });
      if (r.source === 'offline') { render(off.text, { src: 'instrument answer: no model route answered', state: off.state }); return; }
      // the public route sometimes answers in prose instead of JSON: use the prose, unchecked
      const j = extractJSON(r.text) || {};
      const prose = String(r.text || '').replace(/```[\s\S]*?```/g, '').trim();
      const text = typeof j.answer === 'string' && j.answer.trim() ? j.answer.trim() : (prose && prose.length < 1200 ? prose : off.text);
      const checks = checkNumbers(j.numbers, f, text);
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

