/* ============================================================
   exoplanet/report.js — the survey note for the selected world.

   The deterministic engine writes it from the numbers on every
   selection. "Ask the model" sends ONE request (llm.js picks the
   route) with the same numbers as a JSON fact sheet, asks for a
   JSON reply, and checks every number in the reply against the
   fact sheet. Numbers it cannot trace are marked on the page.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { AI, PHYS, LIMIT_FIELDS } from './config.js';
import {
  forecastFor, equilibriumTemp, hzPosition, insolation, semiMajor, skyView, spectralType,
  transitGeometry, sizeClassOf, limitOf, limitKind, limitText, hasRadius, isNum,
} from './science.js';
import { groundingCheck } from './grounding.js';
import { fmt, fmtInt, esc, reducedMotion } from './views/common.js';

export { groundingCheck };

/* Every archive bound on this record, as words: "mass < 6.2 M⊕ (upper limit); ..." */
export function limitsLine(p) {
  return Object.entries(p.lim || {}).map(([k, L]) => {
    const [name, unit] = LIMIT_FIELDS[k] || [k, ''];
    return `${name} ${limitText(L)}${unit} (${limitKind(L)})`;
  }).join('; ');
}

/* The fact sheet: the only numbers either writer may use. */
export function facts(p, albedo) {
  const fc = forecastFor(p);
  const S = insolation(p).S;
  const a = semiMajor(p).a;
  const sky = skyView(p);
  const geo = transitGeometry(p);
  const hz = hzPosition(p);
  const teq = equilibriumTemp(p, albedo);
  const RL = limitOf(p, 'R'), ML = limitOf(p, 'M');
  const cls = sizeClassOf(p);
  const f = {
    name: p.name, host: p.host, star_type: spectralType(p.Teff),
    star_teff_K: r(p.Teff, 4), star_radius_Rsun: r(p.Rs, 3),
    distance_ly: isNum(p.dist) ? Math.round(p.dist * PHYS.PC_LY) : null,
    radius_Rearth: hasRadius(p) ? r(p.R, 3) : null, radius_err_Rearth: r(p.Rerr, 2),
    radius_kind: hasRadius(p) ? 'value' : RL ? limitKind(RL) : 'not measured',
    radius_limit_Rearth: RL ? r(RL.v, 3) : null,
    mass_Mearth: isNum(p.M) ? r(p.M, 3) : null,
    mass_kind: ML ? limitKind(ML) : !isNum(p.M) ? 'not measured' : p.Mprov === 'M-R relationship' ? 'derived by the archive from radius' : p.Mprov === 'Msini' ? 'minimum mass (M sin i)' : 'measured',
    mass_limit_Mearth: ML ? r(ML.v, 3) : null,
    mass_forecast_Mearth: fc ? r(fc.median, 2) : null, mass_forecast_68: fc ? [r(fc.lo, 2), r(fc.hi, 2)] : null,
    size_class: cls ? cls.label + (cls.fromLimit ? ' (from the radius limit)' : '') : 'unknown: no radius measured',
    archive_limits: limitsLine(p) || null,
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
  const size = f.radius_Rearth
    ? `is ${fmt(f.radius_Rearth, 3)} times Earth's radius and circles`
    : `has no measured radius${f.radius_limit_Rearth ? ` (the archive gives only a ${f.radius_kind} of ${fmt(f.radius_limit_Rearth, 3)} Earth radii)` : ''}; it circles`;
  s.push(`${f.name} ${size} ${star}${f.period_days ? ` every ${fmt(f.period_days, 3)} days` : ''}${f.orbit_AU ? ` at ${fmt(f.orbit_AU, 3)} AU` : ''}.`);
  if (f.insolation_Searth) s.push(`It receives ${fmt(f.insolation_Searth, 3)} times the sunlight Earth does, ${f.habitable_zone}.`);
  const lim = f.mass_kind === 'upper limit' || f.mass_kind === 'lower limit';
  if (f.mass_kind === 'measured') s.push(`Its mass is measured at ${fmt(f.mass_Mearth, 3)} Earth masses.`);
  else if (f.mass_forecast_Mearth) {
    const why = lim ? `the archive gives only a${f.mass_kind === 'upper limit' ? 'n' : ''} ${f.mass_kind} of ${fmt(f.mass_limit_Mearth, 3)} Earth masses` : f.mass_kind === 'derived by the archive from radius' ? 'no mass has been measured' : f.mass_kind === 'minimum mass (M sin i)' ? `only a minimum mass of ${fmt(f.mass_Mearth, 3)} Earth masses is known` : 'no mass has been measured';
    s.push(`Since ${why}, the Chen and Kipping relation forecasts ${fmt(f.mass_forecast_Mearth, 2)} Earth masses, with a 68% range of ${fmt(f.mass_forecast_68[0], 2)} to ${fmt(f.mass_forecast_68[1], 2)}${lim ? ', the limit cutting the forecast' : ''}.`);
  } else if (lim) {
    s.push(`The archive gives only a${f.mass_kind === 'upper limit' ? 'n' : ''} ${f.mass_kind} on its mass, ${fmt(f.mass_limit_Mearth, 3)} Earth masses: a bound, not a measurement${f.radius_Rearth ? '' : ', and with no radius there is nothing to forecast a mass from'}.`);
  } else if (!f.radius_Rearth) s.push('No mass is measured, and with no radius none can be forecast.');
  if (short) return s.join(' ');
  if (f.star_angular_size_deg) s.push(`From its surface the star would span ${fmt(f.star_angular_size_deg, 2)} degrees, ${fmt(f.star_size_vs_sun_from_earth, 2)} times the Sun's width in our sky.`);
  if (f.discovered) s.push(`It was found in ${f.discovered}${f.method ? ` by the ${f.method.toLowerCase()} method` : ''}${f.distance_ly ? `, ${fmtInt(f.distance_ly)} light-years away` : ''}.`);
  return s.join(' ');
}

/* groundingCheck (grounding.js): every figure in the model's text, read with its unit,
   must match a fact-sheet value after unit conversion (2% or the text's rounding). */

function markUngrounded(text, check) {
  let out = '', last = 0;
  for (const n of check.nums) {
    out += esc(text.slice(last, n.at));
    out += n.ok ? esc(n.raw) : `<mark class="ungrounded" title="${esc(n.why || 'not in the fact sheet')}">${esc(n.raw)}</mark>`;
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
    <div class="lab"><h2 class="st" id="note-h">Survey note</h2><span class="rp-lamp" id="route"></span></div>
    <p class="rp-h" data-k="head" hidden></p>
    <p class="rp-body" data-k="body" aria-live="polite"></p>
    <p class="rp-q" data-k="q" hidden></p>
    <div class="rp-acts"><button type="button" class="plain" data-k="ask">ask the model about this world</button><span class="rp-who sr" data-k="who">written by this page</span></div>
    <p class="rp-src" data-k="src">[REAL] written by this page from the numbers above</p>
    <details class="rp-rej" data-k="rej" hidden><summary>the model's reply that was set aside</summary><p data-k="rejtext"></p></details>`;
  const $ = (k) => host.querySelector(`[data-k="${k}"]`);
  const ask = $('ask');
  let ctrl = null;
  const cache = new Map();

  /* The note writes itself out when a world is opened, as this lab's first field report did. All of the text is
     in the page from the first frame; the part not yet written is there and unseen, so no line moves while it is
     written and a reader of the page's text has the whole note at once. A world already on screen is rewritten
     at once (the albedo slider changes its numbers many times a second), and so is every note where motion is
     turned off. */
  const CHARS_A_SECOND = 140;
  let typing = 0, writtenFor = null;
  function write(text, key) {
    const body = $('body');
    cancelAnimationFrame(typing);
    body.removeAttribute('aria-busy');
    if (key === writtenFor || reducedMotion() || window.__EXO_STILL__) { writtenFor = key; body.textContent = text; return; }
    writtenFor = key;
    const done = document.createElement('span'), rest = document.createElement('span');
    rest.className = 'rp-unwritten'; rest.textContent = text;
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(done, rest);
    const t0 = performance.now();
    const step = (t) => {
      const n = Math.min(text.length, Math.floor(((t - t0) / 1000) * CHARS_A_SECOND));
      done.textContent = text.slice(0, n); rest.textContent = text.slice(n);
      if (n < text.length) typing = requestAnimationFrame(step);
      else { body.textContent = text; body.removeAttribute('aria-busy'); }
    };
    typing = requestAnimationFrame(step);
  }

  function showDeterministic(p) {
    const f = facts(p, store.state.albedo());
    $('head').hidden = true; $('q').hidden = true; $('rej').hidden = true;
    $('who').textContent = 'written by this page'; host.classList.remove('is-model');
    write(deterministicNote(p, f, true), p.name);
    $('src').textContent = '[REAL] written by this page from the numbers above';
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
      $('src').textContent = `[REAL] ${res.model}'s reply was set aside: ${chk.total - chk.traced} of ${chk.total} numbers are not in the data, so this page's note stays`;
      return;
    }
    $('who').textContent = 'written by a model'; host.classList.add('is-model'); $('rej').hidden = true;
    $('head').hidden = !j.headline; $('head').textContent = String(j.headline || '').slice(0, 90);
    write(note, p.name + ' (model)');
    $('q').hidden = !j.question; $('q').textContent = j.question ? 'Open question: ' + String(j.question).slice(0, 240) : '';
    $('src').textContent = `[REAL] written by ${res.model} (${res.source}) in ${(res.ms / 1000).toFixed(1)} s; ${chk.traced} of ${chk.total} numbers traced to the data`;
  }

  ask.addEventListener('click', async () => {
    const p = store.state.sel; if (!p) return;
    actions.pauseTour && actions.pauseTour();   // a tour must not move on while the model writes
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const f = facts(p, store.state.albedo());
    const key = p.name + '|' + f.albedo_assumed;
    if (cache.has(key)) { showModel(cache.get(key), f, p); return; }
    ask.disabled = true; ask.textContent = 'asking the model'; ask.setAttribute('aria-busy', 'true');
    $('src').textContent = 'waiting for a model to answer';
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
        $('src').textContent = `[REAL] no model answered (${(res.errors || []).slice(-1)[0] || 'its reply could not be read'}), so this page's note stays`;
      } else { cache.set(key, res); showModel(res, f, p); }
    } catch (e) {
      if (e.name !== 'AbortError') { showDeterministic(p); $('src').textContent = 'The model call failed, so the note written by this page stays.'; }
    } finally { ask.disabled = false; ask.textContent = 'ask the model about this world'; ask.removeAttribute('aria-busy'); }
  });

  return {
    update(p) { if (ctrl) ctrl.abort(); ask.disabled = false; ask.textContent = 'ask the model about this world'; ask.removeAttribute('aria-busy'); showDeterministic(p); },
  };
}
