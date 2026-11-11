/* ============================================================
   exoplanet/report.js — the survey note for the selected world.

   The deterministic engine writes it from the numbers on every
   selection. "Ask the model" sends ONE request (llm.js picks the
   route) with the same numbers as a JSON fact sheet, asks for a
   JSON reply, and checks every number in the reply against the
   fact sheet. Numbers it cannot trace are marked on the page.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { AI, PHYS } from './config.js';
import {
  forecastFor, equilibriumTemp, hzPosition, insolation, semiMajor, skyView, spectralType,
  transitGeometry, sizeClass, isNum,
} from './science.js';
import { fmt, fmtInt, esc } from './views/common.js';

/* The fact sheet: the only numbers either writer may use. */
export function facts(p, albedo) {
  const fc = forecastFor(p);
  const S = insolation(p).S;
  const a = semiMajor(p).a;
  const sky = skyView(p);
  const geo = transitGeometry(p);
  const hz = hzPosition(p);
  const teq = equilibriumTemp(p, albedo);
  const f = {
    name: p.name, host: p.host, star_type: spectralType(p.Teff),
    star_teff_K: r(p.Teff, 4), star_radius_Rsun: r(p.Rs, 3),
    distance_ly: isNum(p.dist) ? Math.round(p.dist * PHYS.PC_LY) : null,
    radius_Rearth: r(p.R, 3), radius_err_Rearth: r(p.Rerr, 2),
    mass_Mearth: isNum(p.M) ? r(p.M, 3) : null,
    mass_kind: !isNum(p.M) ? 'not measured' : p.Mlim === 1 ? 'upper limit' : p.Mprov === 'M-R relationship' ? 'derived by the archive from radius' : p.Mprov === 'Msini' ? 'minimum mass (M sin i)' : 'measured',
    mass_forecast_Mearth: fc ? r(fc.median, 2) : null, mass_forecast_68: fc ? [r(fc.lo, 2), r(fc.hi, 2)] : null,
    size_class: sizeClass(p.R).label,
    period_days: r(p.P, 4), orbit_AU: r(a, 3), eccentricity: r(p.ecc, 2),
    insolation_Searth: r(S, 3),
    teq_published_K: isNum(p.Teq) ? Math.round(p.Teq) : null,
    teq_this_page_K: teq ? Math.round(teq) : null, albedo_assumed: albedo,
    habitable_zone: hz.label,
    star_angular_size_deg: sky ? r(sky.angDeg, 2) : null, star_size_vs_sun_from_earth: sky ? r(sky.vsSun, 2) : null,
    transit_depth_ppm: geo ? Math.round(geo.depthLD * 1e6) : null, transit_duration_h: geo ? r(geo.T14, 3) : null,
    discovered: p.year || null, method: p.method || null, facility: p.facility || null,
  };
  return f;
}
const r = (v, s) => (isNum(v) ? +(+v).toPrecision(s) : null);

/* The deterministic note. Plain sentences, every number from the fact sheet. */
export function deterministicNote(p, f, short = false) {
  const s = [];
  const star = f.star_type === '?' ? 'its star' : `a${'AFO'.includes(f.star_type) ? 'n' : ''} ${f.star_type}-type star${f.star_teff_K ? ` of ${fmtInt(f.star_teff_K)} K` : ''}`;
  s.push(`${f.name} is ${fmt(f.radius_Rearth, 3)} times Earth's radius and circles ${star}${f.period_days ? ` every ${fmt(f.period_days, 3)} days` : ''}${f.orbit_AU ? ` at ${fmt(f.orbit_AU, 3)} AU` : ''}.`);
  if (f.insolation_Searth) s.push(`It receives ${fmt(f.insolation_Searth, 3)} times the sunlight Earth does, ${f.habitable_zone}.`);
  if (f.mass_kind === 'measured') s.push(`Its mass is measured at ${fmt(f.mass_Mearth, 3)} Earth masses.`);
  else if (f.mass_forecast_Mearth) {
    const why = f.mass_kind === 'upper limit' ? `the archive gives only an upper limit of ${fmt(f.mass_Mearth, 3)} Earth masses` : f.mass_kind === 'derived by the archive from radius' ? 'no mass has been measured' : f.mass_kind === 'minimum mass (M sin i)' ? `only a minimum mass of ${fmt(f.mass_Mearth, 3)} Earth masses is known` : 'no mass has been measured';
    s.push(`Since ${why}, the Chen and Kipping relation forecasts ${fmt(f.mass_forecast_Mearth, 2)} Earth masses, with a 68% range of ${fmt(f.mass_forecast_68[0], 2)} to ${fmt(f.mass_forecast_68[1], 2)}.`);
  }
  if (short) return s.join(' ');
  if (f.star_angular_size_deg) s.push(`From its surface the star would span ${fmt(f.star_angular_size_deg, 2)} degrees, ${fmt(f.star_size_vs_sun_from_earth, 2)} times the Sun's width in our sky.`);
  if (f.discovered) s.push(`It was found in ${f.discovered}${f.method ? ` by the ${f.method.toLowerCase()} method` : ''}${f.distance_ly ? `, ${fmtInt(f.distance_ly)} light-years away` : ''}.`);
  return s.join(' ');
}

/* Every number in the model's text must match a number in the facts (2% or rounding). */
export function groundingCheck(text, f) {
  const pool = [];
  const walk = (v) => { if (typeof v === 'number') pool.push(v); else if (Array.isArray(v)) v.forEach(walk); };
  Object.values(f).forEach(walk);
  pool.push(1, 2, 3, 68, 100, 1931, 2017);  // counts, the 68% band, and cited years
  const nums = [];
  // names carry digits (Kepler-62, TRAPPIST-1): blank them out, keeping positions
  let scan = text;
  for (const n of [f.name, f.host, f.facility].filter(Boolean)) scan = scan.split(n).join(' '.repeat(n.length));
  const re = /(?<![\w.\-])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\w])/g;
  let m;
  while ((m = re.exec(scan))) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    const ok = pool.some((q) => Math.abs(q - v) <= Math.max(0.02 * Math.abs(q), 0.051) || Math.abs(Math.round(q) - v) < 1e-9);
    nums.push({ v, raw: m[1], ok, at: m.index });
  }
  return { nums, traced: nums.filter((n) => n.ok).length, total: nums.length };
}

function markUngrounded(text, check) {
  let out = '', last = 0;
  for (const n of check.nums) {
    out += esc(text.slice(last, n.at));
    out += n.ok ? esc(n.raw) : `<mark class="ungrounded" title="not in the fact sheet">${esc(n.raw)}</mark>`;
    last = n.at + n.raw.length;
  }
  return out + esc(text.slice(last));
}

const SYSTEM = 'You write a short survey note about one exoplanet for a public science page. ' +
  'Use only the numbers in the FACTS object; never introduce a number that is not there, and keep its units. ' +
  'Say plainly what is measured and what is inferred. No lists, no markdown, no exclamation marks. ' +
  'Reply as JSON: {"headline": "under 9 words", "note": "3 sentences", "question": "one open question this world raises, one sentence"}.';

export function createReport(host, store, actions = {}) {
  host.innerHTML = `
    <div class="rp-head"><span class="view-k">Survey note</span><span class="rp-who" data-k="who">ENGINE</span><span class="rp-src" data-k="src">deterministic engine</span>
      <button type="button" class="btn btn-gold" data-k="ask">Ask the model</button></div>
    <p class="rp-h" data-k="head" hidden></p>
    <p class="rp-body" data-k="body" aria-live="polite"></p>
    <p class="rp-q" data-k="q" hidden></p>
    <details class="rp-rej" data-k="rej" hidden><summary>rejected model reply</summary><p data-k="rejtext"></p></details>`;
  const $ = (k) => host.querySelector(`[data-k="${k}"]`);
  const ask = $('ask');
  let ctrl = null;
  const cache = new Map();

  function showDeterministic(p) {
    const f = facts(p, store.state.albedo());
    $('head').hidden = true; $('q').hidden = true; $('rej').hidden = true;
    $('who').textContent = 'ENGINE'; host.classList.remove('is-model');
    $('body').textContent = deterministicNote(p, f, true);
    $('src').textContent = '[REAL] deterministic engine · every number from the data';
  }

  /* A reply whose numbers do not all trace to the fact sheet is not shown as the note:
     the engine's note stays, and the rejected reply is kept below with the culprits marked. */
  function showModel(res, f, p) {
    const j = res.json || {};
    const note = String(j.note || '').slice(0, 900);
    const all = [j.headline, note, j.question].filter(Boolean).join(' ');
    const chk = groundingCheck(all, f);
    if (chk.traced < chk.total) {
      showDeterministic(p);
      $('rej').hidden = false;
      $('rejtext').innerHTML = markUngrounded(all, chk);
      $('src').textContent = `[REAL] ${res.model} reply rejected: ${chk.total - chk.traced} of ${chk.total} numbers are not in the data; engine note kept`;
      return;
    }
    $('who').textContent = 'MODEL TEXT'; host.classList.add('is-model'); $('rej').hidden = true;
    $('head').hidden = !j.headline; $('head').textContent = String(j.headline || '').slice(0, 90);
    $('body').textContent = note;
    $('q').hidden = !j.question; $('q').textContent = j.question ? 'Open question: ' + String(j.question).slice(0, 240) : '';
    $('src').textContent = `[REAL] ${res.source} · ${res.model} · ${(res.ms / 1000).toFixed(1)} s · grounding: ${chk.traced} of ${chk.total} numbers traced to the data`;
  }

  ask.addEventListener('click', async () => {
    const p = store.state.sel; if (!p) return;
    actions.pauseTour && actions.pauseTour();   // a tour must not move on while the model writes
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const f = facts(p, store.state.albedo());
    const key = p.name + '|' + f.albedo_assumed;
    if (cache.has(key)) { showModel(cache.get(key), f, p); return; }
    ask.disabled = true; ask.textContent = 'Asking';
    $('src').textContent = 'waiting for a model route';
    try {
      const res = await LLM.complete({
        system: SYSTEM, prompt: 'FACTS = ' + JSON.stringify(f), json: true, temperature: AI.temperature, timeoutMs: AI.timeoutMs,
        maxWaitMs: AI.maxWaitMs, signal: ctrl.signal,
        fallback: () => ({ headline: '', note: deterministicNote(p, f), question: '' }),
      });
      if (store.state.sel !== p) return;
      const ok = res.json && typeof res.json.note === 'string' && res.json.note.length > 20;
      if (res.source === 'offline' || !ok) {
        showDeterministic(p);
        $('src').textContent = `[REAL] no model answered (${(res.errors || []).slice(-1)[0] || 'invalid reply'}); engine note kept`;
      } else { cache.set(key, res); showModel(res, f, p); }
    } catch (e) {
      if (e.name !== 'AbortError') { showDeterministic(p); $('src').textContent = 'model call failed; deterministic engine'; }
    } finally { ask.disabled = false; ask.textContent = 'Ask the model'; }
  });

  return {
    update(p) { if (ctrl) ctrl.abort(); ask.disabled = false; ask.textContent = 'Ask the model'; showDeterministic(p); },
  };
}
