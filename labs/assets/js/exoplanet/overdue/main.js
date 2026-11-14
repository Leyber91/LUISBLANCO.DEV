/* ============================================================
   Overdue — boot.

   Data in, one direction:
     ephemerides.json (planets, working clocks)        -> tonight's crossings, the lost count
     ephemerides-record.json (every published solution) -> the record of one clock, the tally
   Everything shown is computed here from those two files and the
   visitor's clock; nothing is fetched from anywhere else.

   The page stands on the labs' platform: the chosen planet and
   the visitor's place are the lab's progress record in Labs OS
   (in this browser; the privacy page exports and erases it), and
   usage is logged as which planet was opened, which year a drag
   on the record ended on, and whether a place was typed or taken
   from the device. The place itself is never in an event.

   Deep links: ?planet=<name>   ?date=YYYY-MM-DD   ?clock=best|oldest   ?still
   A link made by the survey before it moved to its own page
   (?p=, ?plot=, ?tour=, ?view=, ?cam=, ?q=) is passed on to it.
   ============================================================ */

import { LabsOS } from '../../os/index.js';
import { el } from '../../kit/dom.js';
import { surface, reducedMotion } from '../views/common.js';
import { starColour } from '../science.js';
import { jdOfMs, msOfJd } from './time.js';
import { epochAt, sigmaAt, lampAt, lostFrom, tally, yearOfJd, jdOfYear } from './clock.js';
import { load, pairOf, durDays } from './data.js';
import { drawOrbit, drawRecord, recordScale, pointsFor, END_YEAR } from './views.js';
import { crossings, span, placeOf, shownMs, stateOf, WATCH } from './tonight.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SURVEY_PARAMS = ['p', 'plot', 'tour', 'view', 'cam', 'q'];
const leaving = !q.has('planet') && SURVEY_PARAMS.some((k) => q.has(k));
if (leaving) location.replace('exomania-survey.html' + location.search + location.hash);

const still = reducedMotion() || q.has('still');
const LAB = 'exomania';
const DEFAULT_PLANET = 'HD 209458 b';
const FIRST_ROWS = 40;
const LEGEND = 'Each point is another published solution of this planet: above the line it found the transit later than this clock predicts, below it earlier. Gold: a later paper that tests this clock and found the transit inside its 1-sigma window. White: a test that found it outside. A ring: no test. Point at one, or open the list, to read it.';
const nowJd = () => jdOfMs(Date.now());
const clampJd = (jd) => Math.max(jdOfYear(1990), Math.min(jdOfYear(END_YEAR), jd));

let os = null, cat = null;
const S = { planet: null, clock: null, which: 'oldest', jd: nowJd(), place: null, points: [], sc: null, hits: [], showAll: false, touched: false };

/* ---------------- the platform ---------------- */
function track(type, data) { if (os) void os.track(type, data); }
function save() { if (os) os.progress.set({ planet: S.planet ? S.planet.name : null, place: S.place }, { v: 1 }).catch(() => {}); }

/* ---------------- words ---------------- */
/* Text is written only when it changes, so a live region speaks once and a drag does not rewrite the page. */
const put = (id, text) => { const n = $(id); if (n.textContent !== text) n.textContent = text; };
const num = (n) => n.toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const dateOf = (jd) => new Date(msOfJd(jd)).toISOString().slice(0, 10);
function localTime(jd, windowS) {
  const t = shownMs(msOfJd(jd), windowS);
  return new Date(t.ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', ...(t.seconds ? { second: '2-digit' } : {}) });
}
/* A solution's paper. Before the record is here only the working clocks are known, and not yet by name. */
const refLabel = (s) => (cat.refs && s.ref != null && cat.refs[s.ref] ? cat.refs[s.ref][0]
  : s.flag === 2 ? 'a published solution' : s.flag === 1 ? 'the archive\'s composite row, from one paper' : 'the archive\'s composite row');
const stdName = (s) => cat.standards[s.std] || 'not stated';

/* ---------------- one clock ---------------- */
function pickClock(p) {
  const dated = (p.sols || []).filter((s) => s.pub != null);
  if (S.which === 'oldest' && dated.length > 1) return dated[0];
  return p.clock;
}
function openPlanet(p, { user = false, animate = true } = {}) {
  if (!p) return;
  S.planet = p;
  S.clock = pickClock(p);
  S.points = p.sols ? pointsFor(p, S.clock) : [];
  $('pick').value = p.name;
  fillClocks(); describeClock(); setScrubRange();
  if (user) { S.touched = true; save(); track('exomania.planet', { planet: p.name }); os?.progress.setResume(`exomania.html?planet=${encodeURIComponent(p.name)}`, p.name).catch(() => {}); }
  if (animate) ignite(); else render();
}
/* One other solution against the clock being shown, in words: under the pointer, and in the list under the record. */
function pointWords(pt) {
  const verdict = !pt.test ? `no test: ${pt.why}`
    : pt.blind ? 'no test: by then the two uncertainties together had reached a sixth of the orbit'
      : Math.abs(pt.z) < 1 ? 'a test, inside the window' : 'a test, outside the window';
  return `${pt.s.pub != null ? Math.floor(pt.s.pub) : 'undated'}, ${refLabel(pt.s)}: transit ${num(pt.n)} found ${span(Math.abs(pt.residual) * 86400)} ${pt.residual < 0 ? 'early' : 'late'}, ${Math.abs(pt.z).toFixed(1)} sigma; ${verdict}`;
}
function fillClocks() {
  const sel = $('clock');
  sel.textContent = '';
  const add = (value, text) => { const o = el('option', '', text); o.value = value; sel.append(o); };
  add('best', 'the working clock: the best one published, as this page chooses it');
  (S.planet.sols || []).forEach((s, i) => add(String(i), `${s.pub != null ? Math.floor(s.pub) : 'undated'} · ${refLabel(s)}`));
  const i = (S.planet.sols || []).indexOf(S.clock);
  sel.value = i >= 0 ? String(i) : 'best';
  sel.disabled = !S.planet.sols;
}

/* What does not change with the date: the clock's own numbers, when it is lost, and how later papers found it. */
function describeClock() {
  const p = S.planet, c = S.clock, dur = durDays(p);
  const disputed = c === p.clock && c.disputes > 0 ? ` ${plural(c.disputes, 'other published solution contradicts', 'other published solutions contradict')} it today by more than 3 sigma.` : '';
  put('r-clock', `${refLabel(c)}${c.pub != null ? `, ${Math.floor(c.pub)}` : ''}: mid-transit ${c.t0.toFixed(5)} ± ${span(c.sT * 86400)}, period ${c.P} d ± ${span(c.sP * 86400)}, dates stated as ${stdName(c)}.${disputed}`);
  const lostJd = dur ? lostFrom(c, dur) : NaN;
  put('r-lost', !dur ? 'not known' : lostJd <= c.t0 ? 'from its own epoch' : yearOfJd(lostJd) > 2200 ? 'after 2200' : `from ${dateOf(lostJd)}`);
  const tests = S.points.filter((x) => x.test), live = tests.filter((x) => !x.blind), inside = live.filter((x) => Math.abs(x.z) < 1).length, blind = tests.length - live.length;
  const past = 'after the two uncertainties together had reached a sixth of the orbit, where nothing can miss by 3 sigma';
  put('r-record', !p.sols ? 'loading the published record'
    : c.pub == null ? 'This clock has no publication date in the archive, so no later paper can be said to test it.'
      : live.length ? `${inside} of ${plural(live.length, 'later paper that tests', 'later papers that test')} this clock found the transit inside its 1-sigma window.${blind ? ` ${blind} more timed it ${past}, and test${blind === 1 ? 's' : ''} nothing.` : ''}`
        : blind ? `${plural(blind, 'later paper', 'later papers')} timed the transit ${past}: no test of this clock.`
          : 'No later paper tests this clock. A test is a different paper, two years or more on, timing a transit this clock\'s paper could not have used.');
  const ul = $('r-points');
  ul.textContent = '';
  for (const pt of [...S.points].sort((a, b) => a.s.t0 - b.s.t0)) ul.append(el('li', '', pointWords(pt)));
  put('r-count', p.sols ? `the ${plural(S.points.length, 'other published solution', 'other published solutions')} of ${p.name}, as a list` : 'the other published solutions, as a list');
  put('r-point', LEGEND);
}

/* The first look at a planet: the date runs from the clock's own epoch to today, so the window is seen opening.
   A date in the link is where the first planet opens, once; a planet opened after that opens today. */
let tween = 0;
let linkDate = q.get('date') && Number.isFinite(Date.parse(q.get('date'))) ? clampJd(jdOfMs(Date.parse(q.get('date')))) : null;
function ignite() {
  cancelAnimationFrame(tween);
  const target = linkDate ?? nowJd();
  linkDate = null;
  if (still) { S.jd = target; return render(); }
  const from = Math.min(S.clock.t0, target), t0 = performance.now(), ms = 2200;
  const step = (t) => {
    const f = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - f, 3);
    S.jd = from + (target - from) * e;
    render();
    if (f < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}

/* ---------------- drawing ---------------- */
let orbit = null, record = null;
function render() {
  if (!S.planet || !S.clock) return;
  orbit.redraw(); record.redraw();
  const p = S.planet, c = S.clock, dur = durDays(p);
  const n = epochAt(c, S.jd), sig = sigmaAt(c, n), lamp = dur ? lampAt(c, S.jd, dur) : NaN;
  const state = stateOf(lamp);
  put('r-date', dateOf(S.jd));
  put('r-window', `± ${span(sig * 86400)}`);
  put('r-window-note', sig >= c.P / 2 ? `that range covers the whole orbit of ${span(c.P * 86400)}` : `on an orbit of ${span(c.P * 86400)}`);
  put('r-lamp-note', dur ? `a transit of ${span(dur * 86400)}, over the 1-sigma error` : 'the archive gives no transit length');
  put('r-lamp', Number.isFinite(lamp) ? (lamp >= 100 ? num(Math.round(lamp)) : lamp.toFixed(lamp < 10 ? 2 : 1)) : 'none');
  put('r-state', state);
  $('r-state').dataset.state = state;
  put('r-orbits', `${plural(Math.abs(n), 'orbit', 'orbits')} ${n < 0 ? 'before' : 'after'} its epoch`);
  $('scrub').value = String(Math.round(S.jd));
  $('scrub').setAttribute('aria-valuetext', dateOf(S.jd));
  $('orbit').setAttribute('aria-label', `${p.name} on its orbit on ${dateOf(S.jd)}: the clock is ${state}. Its 1-sigma error is ${span(sig * 86400)}.`);
}

function mountViews() {
  orbit = surface($('orbit'), (ctx, w, h) => {
    if (!S.planet) return;
    const col = starColour(S.planet.stTeff || 5600);
    drawOrbit(ctx, w, h, { planet: S.planet, clock: S.clock, jd: S.jd, starRgb: col.srgb.map((c) => Math.round(c * 255)) });
  });
  record = surface($('record'), (ctx, w, h) => {
    if (!S.planet) return;
    const dur = durDays(S.planet);
    S.sc = recordScale(w, h, S.clock, S.points, dur);
    S.hits = drawRecord(ctx, w, h, { clock: S.clock, points: S.points, dur, jd: S.jd, nowJd: nowJd(), sc: S.sc });
  });
  // the date is set by dragging on the record, by the slider under it, or by the three buttons
  const cv = $('record');
  let dragging = false, touch = false, moved = false, downX = 0;
  const setDate = (jd) => { cancelAnimationFrame(tween); S.touched = true; S.jd = jd; render(); };
  const setFromX = (e) => {
    const r = cv.getBoundingClientRect();
    setDate(jdOfYear(Math.max(S.sc.y0, Math.min(END_YEAR, S.sc.yearAt(e.clientX - r.left)))));
  };
  const readAt = (e, reach) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = S.hits.find((hh) => (hh.x - x) ** 2 + (hh.y - y) ** 2 < reach * reach);
    put('r-point', hit ? pointWords(hit.p) : LEGEND);
  };
  // A mouse sets the date where it presses. A finger sets it by a tap or a sideways drag, never by touching down:
  // an up or down swipe over the record scrolls the page (the browser then cancels the pointer) and moves nothing.
  cv.addEventListener('pointerdown', (e) => {
    if (!S.sc) return;
    dragging = true; touch = e.pointerType !== 'mouse'; moved = false; downX = e.clientX;
    try { cv.setPointerCapture(e.pointerId); } catch { /* no capture for a synthetic pointer */ }
    if (!touch) { setFromX(e); readAt(e, 8); }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return readAt(e, 8);
    if (touch && !moved && Math.abs(e.clientX - downX) < 6) return;
    moved = true; setFromX(e);
  });
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') put('r-point', LEGEND); });
  const end = (e, cancelled) => {
    if (!dragging) return;
    dragging = false;
    if (cancelled) return;
    if (touch && !moved) { setFromX(e); readAt(e, 16); }
    track('exomania.scrub', { year: Math.round(yearOfJd(S.jd)) });
  };
  cv.addEventListener('pointerup', (e) => end(e, false)); cv.addEventListener('pointercancel', (e) => end(e, true));
  $('scrub').addEventListener('input', () => setDate(Number($('scrub').value)));
  $('to-epoch').addEventListener('click', () => setDate(S.clock.t0));
  $('to-today').addEventListener('click', () => setDate(nowJd()));
  $('to-end').addEventListener('click', () => setDate(jdOfYear(END_YEAR)));
  // another clock of the same planet is looked at on the date already shown
  $('clock').addEventListener('change', () => {
    const v = $('clock').value;
    cancelAnimationFrame(tween); S.touched = true;
    S.clock = v === 'best' ? S.planet.clock : S.planet.sols[Number(v)] || S.planet.clock;
    S.points = pointsFor(S.planet, S.clock);
    describeClock(); setScrubRange(); render();
  });
}
function setScrubRange() {
  const s = $('scrub');
  const min = Math.floor(Math.min(S.clock.t0, ...S.points.map((x) => x.s.t0)) - 150);
  s.min = String(min);
  s.max = String(Math.ceil(jdOfYear(END_YEAR)));
  S.jd = Math.max(min, Math.min(jdOfYear(END_YEAR), S.jd));
}

/* ---------------- the picker ---------------- */
const NO_PLANET = (name) => `No transiting planet named "${name}" in the archive's table.`;
function mountPicker() {
  const list = $('planets');
  for (const p of cat.planets) { const o = document.createElement('option'); o.value = p.name; list.append(o); }
  const go = () => {
    const name = $('pick').value.trim(), p = cat.byName.get(name);
    if (p) { openPlanet(p, { user: true }); put('pick-msg', ''); } else put('pick-msg', NO_PLANET(name));
  };
  $('pick-form').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  $('pick').addEventListener('change', go);
}
function chips() {
  const host = $('chips');
  host.textContent = '';
  const now = nowJd();
  const add = (label, p) => { if (!p) return; const b = el('button', 'chip', `${label}: ${p.name}`); b.type = 'button'; b.addEventListener('click', () => { openPlanet(p, { user: true }); put('pick-msg', ''); }); host.append(b); };
  add('the first transit seen', cat.byName.get('HD 209458 b'));
  add('a period that is shrinking', cat.byName.get('WASP-12 b'));
  const lost = cat.planets.filter((p) => p.clock && durDays(p) && lampAt(p.clock, now, durDays(p)) < 1 && Number.isFinite(p.vmag)).sort((a, b) => a.vmag - b.vmag)[0];
  add('lost, and the brightest star of those', lost);
  if (cat.planets[0].sols) {
    const tested = cat.planets.map((p) => ({ p, pr: pairOf(p) })).filter((x) => x.pr && x.pr.real && !x.pr.blind).sort((a, b) => b.pr.n - a.pr.n)[0];
    add('the longest test of an old clock', tested && tested.p);
  }
}

/* ---------------- tonight ---------------- */
function renderTonight() {
  const now = nowJd();
  const rows = crossings(cat.planets, cat.standards, now, 24, S.place);
  const watch = rows.filter((r) => r.watchable);
  const lost = rows.filter((r) => r.state === 'lost').length, disputed = rows.filter((r) => r.disputes > 0).length;
  put('t-count', `${plural(rows.length, 'transit has its', 'transits have their')} predicted middle in the next 24 hours. ${num(lost)} of those predictions come from a clock that is lost, and ${num(disputed)} from a clock that another published solution contradicts.`
    + (S.place ? ` ${plural(watch.length, 'transit', 'transits')} can be watched from ${S.place.lat.toFixed(2)}°, ${S.place.lon.toFixed(2)}°.` : ' Set a place to see which can be watched from it.'));
  const body = $('t-body');
  const held = body.contains(document.activeElement) ? document.activeElement.dataset.planet : null;      // the table is rebuilt: keep the reader's place in it
  body.textContent = '';
  $('t-table').classList.toggle('no-place', !S.place);
  const list = S.place && !S.showAll ? watch : rows;
  const show = S.place || S.showAll ? list : list.slice(0, FIRST_ROWS);
  $('t-wrap').classList.toggle('long', show.length > 60);
  for (const r of show) {
    const tr = el('tr', r.watchable ? 'watch' : '');
    const name = el('td'); const b = el('button', 'linkish', r.planet.name); b.type = 'button'; b.dataset.planet = r.planet.name;
    b.addEventListener('click', () => { openPlanet(r.planet, { user: true }); put('pick-msg', ''); $('plate-a').scrollIntoView({ block: 'start', behavior: still ? 'auto' : 'smooth' }); $('a-title').focus({ preventScroll: true }); });
    name.append(b);
    const alt = !Number.isFinite(r.altMin) ? 'none' : Math.round(r.altMin) === Math.round(r.altMax) ? `${Math.round(r.altMin)}°` : `${Math.round(r.altMin)}° to ${Math.round(r.altMax)}°`;
    tr.append(name, el('td', 'num', localTime(r.mid, r.windowS)), el('td', 'num', `± ${span(r.windowS)}`),
      el('td', `place${r.watchable ? ' yes' : ''}`, r.watchable ? 'can be watched' : (r.why || 'none')), el('td', 'num place', alt), el('td', 'place', r.sky || 'none'),
      el('td', '', r.disputes > 0 ? `${r.state}, disputed` : r.state),
      el('td', 'num', Number.isFinite(r.planet.durH) ? `${r.planet.durH.toFixed(1)} h` : 'none'),
      el('td', 'num', Number.isFinite(r.planet.depthPct) ? `${r.planet.depthPct.toFixed(r.planet.depthPct < 0.1 ? 3 : 2)} %` : 'none'),
      el('td', 'num', Number.isFinite(r.planet.vmag) ? r.planet.vmag.toFixed(1) : 'none'));
    body.append(tr);
  }
  if (!show.length) { const tr = el('tr'); const td = el('td', 'dim', S.place ? 'No transit in the next 24 hours meets the rule under the table. Show all to see each one and why.' : 'No transit in the next 24 hours.'); td.colSpan = 10; tr.append(td); body.append(tr); }
  if (held) { const again = [...body.querySelectorAll('button')].find((x) => x.dataset.planet === held); if (again) again.focus({ preventScroll: true }); }
  const more = $('t-all');
  more.hidden = !S.place && rows.length <= FIRST_ROWS;
  more.textContent = S.place
    ? (S.showAll ? `show only the ${num(watch.length)} that can be watched` : `show all ${num(rows.length)} transits, and why each of the others cannot be watched`)
    : (S.showAll ? `show the first ${FIRST_ROWS}` : `show all ${num(rows.length)}`);
  put('t-shown', `${num(show.length)} of ${num(rows.length)} listed`);
}
function mountTonight() {
  const setPlace = (pl, source) => {
    S.place = pl; S.showAll = false;
    $('lat').value = pl ? String(pl.lat) : ''; $('lon').value = pl ? String(pl.lon) : '';
    put('place-msg', pl ? '' : 'A latitude from -90 to 90 and a longitude from -180 to 180, east positive, as plain numbers.');
    save(); if (pl) track('exomania.place', { source });
    renderTonight();
  };
  $('place-form').addEventListener('submit', (e) => { e.preventDefault(); setPlace(placeOf($('lat').value, $('lon').value), 'typed'); });
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) { put('place-msg', 'This browser gives no location. Type a latitude and a longitude.'); return; }
    put('place-msg', 'asking this device for its location');
    navigator.geolocation.getCurrentPosition((pos) => setPlace(placeOf(pos.coords.latitude, pos.coords.longitude), 'device'),
      () => { put('place-msg', 'The location was not given. Type a latitude and a longitude.'); }, { maximumAge: 600000, timeout: 15000 });
  });
  $('forget').addEventListener('click', () => { S.place = null; S.showAll = false; $('lat').value = ''; $('lon').value = ''; put('place-msg', 'The place is forgotten.'); save(); renderTonight(); });
  $('t-all').addEventListener('click', () => { S.showAll = !S.showAll; renderTonight(); });
  put('t-rule', `Watchable, as this page counts it: from the beginning of the transit to its end the star is at least ${WATCH.minAlt}° up and the Sun at least ${-WATCH.maxSun}° below the horizon; the clock has a lamp of ${WATCH.minLamp} or more; and no other published solution contradicts it.`);
}

/* ---------------- the catalogue's state, and the tally ---------------- */
function renderState() {
  const now = nowJd();
  const timed = cat.planets.filter((p) => p.clock && durDays(p));
  const lost = timed.filter((p) => lampAt(p.clock, now, durDays(p)) < 1).length;
  const fading = timed.filter((p) => { const l = lampAt(p.clock, now, durDays(p)); return l >= 1 && l < 3; }).length;
  const disputed = cat.planets.filter((p) => p.clock && p.clock.disputes > 0).length;
  const pc = (a, b) => `${((100 * a) / b).toFixed(1)} %`;
  put('s-planets', num(cat.planets.length));
  put('s-timed', num(timed.length));
  put('s-lost', `${num(lost)} (${pc(lost, timed.length)})`);
  put('s-fading', num(fading));
  put('s-disputed', `${num(disputed)} (${pc(disputed, cat.planets.length)})`);
  put('s-date', cat.meta.retrieved);
}
function renderTally() {
  const pairs = cat.planets.map(pairOf).filter(Boolean);
  const t = tally(pairs.filter((x) => x.real));
  const pc = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : 'none');
  put('y-pairs', num(pairs.length));
  put('y-real', num(t.real));
  put('y-blind', num(t.blind));
  put('y-inside', `${num(t.inside1)} (${pc(t.inside1, t.real)})`);
  put('y-beyond', `${num(t.beyond3)} (${pc(t.beyond3, t.real)})`);
  put('y-same', num(t.same));
  put('y-same-inside', `${num(t.sameInside1)} (${pc(t.sameInside1, t.same)})`);
  put('y-same-beyond', `${num(t.sameBeyond3)} (${pc(t.sameBeyond3, t.same)})`);
  put('y-top', t.topRef == null ? 'none' : `${num(t.topCount)} (${pc(t.topCount, t.real)})`);
  put('y-top-name', t.topRef == null ? 'the paper that is the newer one most often' : `tests whose newer paper is ${refLabel({ ref: t.topRef })}`);
  $('tally').dataset.ready = '1';
}

/* ---------------- boot ---------------- */
async function boot() {
  try { os = await LabsOS.init({ lab: LAB }); } catch { os = null; }
  if (os) for (const [type, cls] of [['exomania.planet', 'action'], ['exomania.place', 'action'], ['exomania.scrub', 'action']]) { try { os.register(type, { cls, throttleMs: type === 'exomania.scrub' ? 5000 : 0 }); } catch { /* already registered on this page */ } }
  let saved = null;
  try { const rec = os && await os.progress.get(); saved = rec && rec.data && typeof rec.data === 'object' ? rec.data : null; } catch { saved = null; }
  S.which = q.get('clock') === 'best' ? 'best' : 'oldest';
  mountViews(); mountTonight();
  try {
    cat = await load((c) => {
      cat = c;
      S.place = saved && saved.place ? placeOf(saved.place.lat, saved.place.lon) : null;
      if (S.place) { $('lat').value = String(S.place.lat); $('lon').value = String(S.place.lon); }
      mountPicker(); renderState(); renderTonight(); chips();
      const asked = q.get('planet');
      const first = cat.byName.get(asked || '') || cat.byName.get((saved && saved.planet) || '') || cat.byName.get(DEFAULT_PLANET) || cat.planets[0];
      if (asked && !cat.byName.get(asked)) put('pick-msg', `${NO_PLANET(asked.slice(0, 60))} Showing ${first.name}.`);
      S.planet = first; S.clock = first.clock; S.points = [];
      $('pick').value = first.name; fillClocks(); describeClock(); setScrubRange(); S.jd = linkDate ?? nowJd(); render();
      document.body.dataset.state = 'clocks';
      put('load-msg', 'loading the published record');
    });
  } catch (e) {
    put('load-msg', cat
      ? 'The published record could not be loaded, so no clock can be drawn against its history and the tally cannot be counted. Reload to try again.'
      : 'The clocks could not be loaded, so this page has nothing to draw. Reload to try again.');
    if (cat) put('r-record', 'The published record did not load.');
    document.body.dataset.state = cat ? 'clocks' : 'error';
    console.error('overdue: data did not load', e);
    return;
  }
  // the full record is here: the planet's own history, and the tally across all of them
  document.body.dataset.state = 'ready';
  put('load-msg', '');
  if (S.touched) {                                   // the visitor has already chosen a planet or a date: keep both
    linkDate = null;
    S.points = pointsFor(S.planet, S.clock);
    fillClocks(); describeClock(); setScrubRange(); render();
  } else openPlanet(S.planet);
  chips(); renderTally();
  setInterval(() => { if (!document.hidden) renderTonight(); }, 300000);        // the list is about the next 24 hours: it is recounted every five minutes
}
if (!leaving) boot();
