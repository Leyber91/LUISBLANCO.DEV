/* ============================================================
   Overdue — boot.

   One sheet, drawn at one date. The date is the only thing a
   visitor holds: the band under the sky is dragged, and the sky,
   the count in the corner and the one clock being read are all
   redrawn at the date under the line. A lamp on the sky is
   chosen with the pointer, by name, or from the night's list.

   Data in, one direction:
     ephemerides.json (planets, working clocks)        -> today's sky, tonight's crossings
     ephemerides-record.json (every published solution) -> the sky's past, the one clock's line, the tally
   Everything shown is computed here from those two files and the
   visitor's clock; nothing is fetched from anywhere else.

   The page stands on the labs' platform: the chosen planet and
   the visitor's place are the lab's progress record in Labs OS
   (in this browser; the privacy page exports and erases it), and
   usage is logged as which planet was opened, which year a drag
   on the band ended on, and whether a place was typed or taken
   from the device. The place itself is never in an event.

   Deep links: ?planet=<name>   ?date=YYYY-MM-DD   ?still
   A link made by the survey before it moved to its own page
   (?p=, ?plot=, ?tour=, ?view=, ?cam=, ?q=) is passed on to it.
   ============================================================ */

import { LabsOS } from '../../os/index.js';
import { el } from '../../kit/dom.js';
import { surface, reducedMotion } from '../views/common.js';
import { jdOfMs, msOfJd, sunAltitude } from './time.js';
import { epochAt, sigmaAt, lampAt, lostFrom, tally, grade, contested, yearOfJd, jdOfYear } from './clock.js';
import { load, pairOf, durDays } from './data.js';
import { hammer, lens, historyOf, clockAt, lampOn, census, errorLine, FIRST_YEAR, LAST_YEAR } from './sky.js';
import { skyLayout, drawSky, bandScale, drawBand, drawCurve, drawNight, drawTally, pointsFor } from './views.js';
import { crossings, span, placeOf, shownMs, stateOf, WATCH } from './tonight.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SURVEY_PARAMS = ['p', 'plot', 'tour', 'view', 'cam', 'q'];
const leaving = !q.has('planet') && SURVEY_PARAMS.some((k) => q.has(k));
if (leaving) location.replace('exomania-survey.html' + location.search + location.hash);

const still = reducedMotion() || q.has('still');
const LAB = 'exomania';
const DEFAULT_PLANET = 'HD 209458 b';
const FIRST_ROWS = 12;
const MIN_JD = jdOfYear(FIRST_YEAR), MAX_JD = jdOfYear(LAST_YEAR);
const nowJd = () => jdOfMs(Date.now());
const clampJd = (jd) => Math.max(MIN_JD, Math.min(MAX_JD, jd));

let os = null, cat = null;
const S = {
  jd: nowJd(), stars: [], star: null, hover: null, place: null, showAll: false, touched: false, record: false,
  census: null, spots: [], bandHits: [], nightHits: [], L: null, sc: null, marks: [],
};

/* ---------------- the platform ---------------- */
function track(type, data) { if (os) void os.track(type, data); }
function save() { if (os) os.progress.set({ planet: S.star ? S.star.p.name : null, place: S.place }, { v: 1 }).catch(() => {}); }

/* ---------------- words ---------------- */
/* Text is written only when it changes, so a live region speaks once and a drag does not rewrite the page. */
const put = (id, text) => { const n = $(id); if (n && n.textContent !== text) n.textContent = text; };
const num = (n) => n.toLocaleString('en-US');
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const dateOf = (jd) => new Date(msOfJd(jd)).toISOString().slice(0, 10);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (jd) => { const d = new Date(msOfJd(jd)); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
function localTime(jd, windowS) {
  const t = shownMs(msOfJd(jd), windowS);
  return new Date(t.ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', ...(t.seconds ? { second: '2-digit' } : {}) });
}
const hourOf = (jd) => new Date(msOfJd(jd)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/* A solution's paper. Before the record is here only the working clocks are known, and not yet by name. */
const refLabel = (s) => (cat.refs && s.ref != null && cat.refs[s.ref] ? cat.refs[s.ref][0]
  : s.flag === 2 ? 'a published solution' : s.flag === 1 ? 'the archive\'s composite row, from one paper' : 'the archive\'s composite row');
const stateWord = (lamp) => (lamp === null ? 'not yet timed' : stateOf(lamp));

/* ---------------- the sky's lamps ---------------- */
const retrievedJd = () => jdOfMs(Date.parse(cat.meta.retrieved));
function starsOf(planets) {
  return planets.map((p) => ({ p, hist: historyOf(p, retrievedJd()), m: hammer(p.ra ?? 0, p.dec ?? 0), q: lens(p.ra ?? 0, p.dec ?? 0) }));
}
function marksOf() {
  const byName = (n) => S.stars.find((s) => s.p.name === n);
  const now = nowJd();
  const lost = S.stars.filter((s) => { const l = lampOn(s.p, s.hist, now); return l !== null && l < 1 && Number.isFinite(s.p.vmag); }).sort((a, b) => a.p.vmag - b.p.vmag)[0];
  return [
    { star: byName('HD 209458 b'), text: 'the first transit timed', dx: 34, dy: -30 },
    { star: byName('WASP-12 b'), text: 'a period that is shrinking', dx: 30, dy: 34 },
    { star: lost, text: 'lost, and the brightest star of those', dx: 28, dy: -30 },
  ].filter((m) => m.star);
}

/* ---------------- the date ---------------- */
let tween = 0;
function setDate(jd, { user = true } = {}) {
  cancelAnimationFrame(tween);
  if (user) S.touched = true;
  S.jd = clampJd(jd);
  render();
}
/* The sheet ignites: the date runs from the first transit timed to today, and the lamps come on as they were found. */
function ignite(target) {
  cancelAnimationFrame(tween);
  if (still) { S.jd = target; return render(); }
  const from = MIN_JD, t0 = performance.now(), ms = 2800;
  const step = (t) => {
    const f = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - f, 3);
    S.jd = from + (target - from) * e;
    render();
    if (f < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}

/* ---------------- one clock ---------------- */
function openStar(star, { user = false } = {}) {
  if (!star) return;
  S.star = star;
  $('pick').value = star.p.name;
  describeStar();
  if (S.record) put('band-note', BAND_NOTE());
  if (user) { S.touched = true; save(); track('exomania.planet', { planet: star.p.name }); os?.progress.setResume(`exomania.html?planet=${encodeURIComponent(star.p.name)}`, star.p.name).catch(() => {}); }
  render();
}
/* What does not change with the date: who the planet is, and how each published solution found its transit. */
function describeStar() {
  const p = S.star.p;
  put('c-name', p.name);
  const bits = [];
  if (Number.isFinite(p.vmag)) bits.push(`V ${p.vmag.toFixed(1)}`);
  if (p.clock) bits.push(`orbit ${span(p.clock.P * 86400)}`);
  if (durDays(p)) bits.push(`transit ${span(durDays(p) * 86400)}${Number.isFinite(p.depthPct) ? `, ${p.depthPct.toFixed(p.depthPct < 0.1 ? 3 : 2)} % deep` : ''}`);
  if (p.discYear) bits.push(`found ${p.discYear}`);
  put('c-meta', bits.join(' · '));
  const ul = $('r-points');
  ul.textContent = '';
  const dated = (p.sols || []).filter((s) => s.pub != null);
  const first = dated[0];
  if (p.sols && first) {
    ul.append(el('li', '', `${Math.floor(first.pub)}, ${refLabel(first)}: the first dated clock. Mid-transit ${first.t0.toFixed(5)} ± ${span(first.sT * 86400)}, period ${first.P} d ± ${span(first.sP * 86400)}.`));
    for (const pt of pointsFor(p, first).sort((a, b) => a.s.t0 - b.s.t0)) {
      const verdict = !pt.test ? `no test: ${pt.why}` : pt.blind ? 'no test: by then the two uncertainties together had reached a sixth of the orbit' : Math.abs(pt.z) < 1 ? 'a test, inside the first clock\'s window' : 'a test, outside it';
      ul.append(el('li', '', `${pt.s.pub != null ? Math.floor(pt.s.pub) : 'undated'}, ${refLabel(pt.s)}: transit ${num(pt.n)} found ${span(Math.abs(pt.residual) * 86400)} ${pt.residual < 0 ? 'early' : 'late'}, ${Math.abs(pt.z).toFixed(1)} sigma; ${verdict}`));
    }
  }
  put('r-count', p.sols ? `the ${plural(p.sols.length, 'published solution', 'published solutions')} of ${p.name}, against its first clock` : 'the published solutions, as a list');
}

/* ---------------- drawing ---------------- */
let sky = null, band = null, curve = null, night = null, tallyView = null;
function render() {
  if (!cat) return;
  sky.redraw(); band.redraw(); curve.redraw();
  // the count in the corner: clocks that can no longer be read on the date shown
  let lost = 0, timed = 0;
  for (const s of S.stars) { const l = lampOn(s.p, s.hist, S.jd); if (l === null || !Number.isFinite(l)) continue; timed++; if (l < 1) lost++; }
  put('n-lost', num(lost));
  put('n-of', `of ${plural(timed, 'transit clock', 'transit clocks')}`);
  put('n-date', longDate(S.jd) + (S.jd > nowJd() + 1 ? ', if nobody looks again' : ''));
  put('tb-date', dateOf(S.jd));
  $('scrub').value = String(Math.round(S.jd));
  $('scrub').setAttribute('aria-valuetext', dateOf(S.jd));
  // the one clock, on that date
  if (S.star) {
    const p = S.star.p, c = clockAt(S.star.hist, S.jd), dur = durDays(p);
    if (!c) {
      put('c-status', `No clock had been published for ${p.name} by ${dateOf(S.jd)}.`);
      put('c-curve', ' ');
    } else {
      const sig = sigmaAt(c, epochAt(c, S.jd)), lamp = dur ? dur / sig : NaN, state = stateOf(lamp);
      const lostJd = dur ? lostFrom(c, dur) : NaN;
      const when = !dur ? '' : lostJd <= S.jd ? ` Lost since ${lostJd <= c.t0 ? 'its own epoch' : dateOf(lostJd)}.` : yearOfJd(lostJd) > 2200 ? '' : ` Left alone it is lost from ${dateOf(lostJd)}.`;
      const doubt = c === p.clock && contested(c) ? ` Only ${c.agree} of ${plural(c.others, 'other published clock agrees', 'other published clocks agree')} with it: contested.` : '';
      put('c-status', `Read by ${refLabel(c)}${c.pub != null ? `, ${Math.floor(c.pub)}` : ''}. On ${dateOf(S.jd)} its transit is predicted to ± ${span(sig * 86400)}: ${dur ? `the clock is ${state}` : 'the archive gives no transit length to hold that against'}.${when}${doubt}`);
      const seen = curve.last;
      put('c-curve', seen && Number.isFinite(seen.expected) ? `The faint line is the transit itself, ${(seen.depth * 100).toPrecision(2)} % deep. The heavy line is what a telescope pointed at the predicted time would record on average: a dip of ${(seen.expected * 100).toPrecision(2)} %.` : ' ');
    }
    $('sky').setAttribute('aria-label', `The sky of transit clocks on ${dateOf(S.jd)}: ${num(lost)} of ${num(timed)} can no longer be read. ${p.name} is selected.`);
  }
}

function mountViews() {
  sky = surface($('sky'), (ctx, w, h) => {
    S.L = skyLayout(w, h);
    S.spots = drawSky(ctx, w, h, { L: S.L, stars: S.stars, jd: S.jd, selected: S.star, hover: S.hover, marks: S.marks });
    placeMarks();
  });
  band = surface($('band'), (ctx, w, h) => {
    S.sc = bandScale(w, h);
    const st = S.star;
    S.bandHits = drawBand(ctx, w, h, { sc: S.sc, census: S.census, line: st ? errorLine(st.hist) : null, hist: st ? st.hist : [], dur: st ? durDays(st.p) : null, jd: S.jd, nowJd: nowJd(), label: (s) => `${refLabel(s)}` });
  });
  curve = surface($('curve'), (ctx, w, h) => {
    if (!S.star) return;
    curve.last = drawCurve(ctx, w, h, { planet: S.star.p, clock: clockAt(S.star.hist, S.jd), jd: S.jd });
  });

  // the sky: point at a lamp to name it, press to read it
  const sk = $('sky'), tip = $('sky-tip');
  const nearest = (e) => {
    const r = sk.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 12 * 12;
    for (const sp of S.spots) { const d = (sp.x - x) ** 2 + (sp.y - y) ** 2; if (d < bd || (d === bd && sp.lens)) { bd = d; best = sp; } }
    return best;
  };
  sk.addEventListener('pointermove', (e) => {
    const sp = nearest(e), star = sp ? sp.star : null;
    if (star !== S.hover) { S.hover = star; sky.redraw(); }
    if (!sp) { tip.hidden = true; return; }
    const c = clockAt(star.hist, S.jd), lamp = lampOn(star.p, star.hist, S.jd);
    tip.textContent = `${star.p.name} · ${stateWord(lamp)}${c ? ` · ± ${span(sigmaAt(c, epochAt(c, S.jd)) * 86400)}` : ''}`;
    tip.hidden = false;
    const box = sk.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 220, Math.max(4, sp.x + 12))}px`;
    tip.style.top = `${Math.max(4, sp.y - 30)}px`;
  });
  sk.addEventListener('pointerleave', () => { tip.hidden = true; if (S.hover) { S.hover = null; sky.redraw(); } });
  // A press reads the lamp that is named under the pointer. A browser rounds the place of a click and not of a
  // move, and under the lens two lamps can be a pixel apart: without this a visitor read one name and opened another.
  sk.addEventListener('click', (e) => { const star = S.hover || (nearest(e) || {}).star; if (star) { openStar(star, { user: true }); put('pick-msg', ''); } });

  // the band: the date is set by dragging on it, by the slider under it, or by the button
  const cv = $('band');
  let dragging = false, touch = false, moved = false, downX = 0;
  const setFromX = (e) => { const r = cv.getBoundingClientRect(); setDate(jdOfYear(S.sc.yearAt(e.clientX - r.left))); };
  const readAt = (e, reach) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = S.bandHits.find((hh) => (hh.x - x) ** 2 + (hh.y - y) ** 2 < reach * reach);
    put('band-note', hit ? `${hit.s.pub != null ? Math.floor(hit.s.pub) : 'undated'} · ${refLabel(hit.s)} took over: mid-transit ± ${span(hit.s.sT * 86400)}, period ${hit.s.P} d ± ${span(hit.s.sP * 86400)}.` : BAND_NOTE());
  };
  // A mouse sets the date where it presses. A finger sets it by a tap or a sideways drag, never by touching down:
  // an up or down swipe over the band scrolls the page (the browser then cancels the pointer) and moves nothing.
  cv.addEventListener('pointerdown', (e) => {
    if (!S.sc) return;
    dragging = true; touch = e.pointerType !== 'mouse'; moved = false; downX = e.clientX;
    try { cv.setPointerCapture(e.pointerId); } catch { /* no capture for a synthetic pointer */ }
    if (!touch) setFromX(e);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return readAt(e, 9);
    if (touch && !moved && Math.abs(e.clientX - downX) < 6) return;
    moved = true; setFromX(e);
  });
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') put('band-note', BAND_NOTE()); });
  const end = (e, cancelled) => {
    if (!dragging) return;
    dragging = false;
    if (cancelled) return;
    if (touch && !moved) setFromX(e);
    track('exomania.scrub', { year: Math.round(yearOfJd(S.jd)) });
  };
  cv.addEventListener('pointerup', (e) => end(e, false)); cv.addEventListener('pointercancel', (e) => end(e, true));
  const sl = $('scrub');
  sl.min = String(Math.floor(MIN_JD)); sl.max = String(Math.ceil(MAX_JD));
  sl.addEventListener('input', () => setDate(Number(sl.value)));
  $('to-today').addEventListener('click', () => setDate(nowJd()));
}
const BAND_NOTE = () => (S.star ? `Above: the clocks that can be read, are fading and are lost, year by year. Below: the error of the best clock known for ${S.star.p.name}; a dot is the day a better paper took over. Drag to set the date.` : '');

/* The lamps the sheet names are real buttons, placed where the drawing put the end of each leader. */
function placeMarks() {
  const host = $('marks');
  S.marks.forEach((mk, i) => {
    let b = host.children[i];
    if (!b) { b = el('button', 'od-mark', `${mk.star.p.name} · ${mk.text}`); b.type = 'button'; b.addEventListener('click', () => { openStar(mk.star, { user: true }); put('pick-msg', ''); }); host.append(b); }
    const lit = mk.x !== undefined && !!clockAt(mk.star.hist, S.jd) && S.L.wide;
    b.hidden = !lit;
    if (lit) { b.style.left = `${mk.x}px`; b.style.top = `${mk.y}px`; b.dataset.side = mk.dx < 0 ? 'left' : 'right'; b.dataset.rise = mk.dy < 0 ? 'up' : 'down'; }
  });
}

/* ---------------- the picker ---------------- */
const NO_PLANET = (name) => `No transiting planet named "${name}" in the archive's table.`;
function mountPicker() {
  const list = $('planets');
  for (const p of cat.planets) { const o = document.createElement('option'); o.value = p.name; list.append(o); }
  const go = () => {
    const name = $('pick').value.trim(), star = S.stars.find((s) => s.p.name === name);
    if (star) { openStar(star, { user: true }); put('pick-msg', ''); } else put('pick-msg', NO_PLANET(name));
  };
  $('pick-form').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  $('pick').addEventListener('change', go);
}

/* ---------------- tonight ---------------- */
function nightSpans(place, from) {
  const out = []; let open = null;
  for (let i = 0; i <= 144; i++) {
    const t = from + i / 144, dark = sunAltitude(t, place.lat, place.lon) <= WATCH.maxSun;
    if (dark && open === null) open = t;
    if ((!dark || i === 144) && open !== null) { out.push([open, t]); open = null; }
  }
  return out;
}
function renderTonight() {
  const now = nowJd();
  const rows = crossings(cat.planets, cat.standards, now, 24, S.place);
  const watch = rows.filter((r) => r.watchable);
  const lost = rows.filter((r) => r.state === 'lost').length, doubted = rows.filter((r) => r.contested).length;
  put('t-count', `${plural(rows.length, 'transit has its', 'transits have their')} predicted middle in the next 24 hours. ${num(lost)} of those predictions come from a clock that is lost, and ${num(doubted)} from a clock most other papers disagree with.`
    + (S.place ? ` ${plural(watch.length, 'transit', 'transits')} can be watched from ${S.place.lat.toFixed(2)}°, ${S.place.lon.toFixed(2)}°.` : ' Set a place to see which can be watched from it.'));
  S.rows = rows; S.night = S.place ? nightSpans(S.place, now) : []; S.nightFrom = now;
  night.redraw();
  put('night-note', NIGHT_NOTE());
  const body = $('t-body');
  const held = body.contains(document.activeElement) ? document.activeElement.dataset.planet : null;      // the table is rebuilt: keep the reader's place in it
  body.textContent = '';
  $('t-table').classList.toggle('no-place', !S.place);
  $('t-table').classList.toggle('all-watch', !!S.place && !S.showAll);
  const list = S.place && !S.showAll ? watch : rows;
  const show = S.showAll ? list : list.slice(0, S.place ? 400 : FIRST_ROWS);
  $('t-wrap').classList.toggle('long', show.length > 40);
  for (const r of show) {
    const tr = el('tr', r.watchable ? 'watch' : '');
    const name = el('td'); const b = el('button', 'linkish', r.planet.name); b.type = 'button'; b.dataset.planet = r.planet.name;
    b.addEventListener('click', () => { openStar(S.stars[r.planet.i], { user: true }); put('pick-msg', ''); $('clock').scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' }); $('c-name').focus({ preventScroll: true }); });
    name.append(b);
    const alt = !Number.isFinite(r.altMin) ? 'none' : Math.round(r.altMin) === Math.round(r.altMax) ? `${Math.round(r.altMin)}°` : `${Math.round(r.altMin)}° to ${Math.round(r.altMax)}°`;
    tr.append(name, el('td', 'num', localTime(r.mid, r.windowS)), el('td', 'num', `± ${span(r.windowS)}`),
      el('td', `place why${r.watchable ? ' yes' : ''}`, r.watchable ? 'can be watched' : (r.why || 'none')), el('td', 'num place', alt), el('td', 'place', r.sky || 'none'),
      el('td', '', r.contested ? `${r.state}, contested` : r.state),
      el('td', 'num', Number.isFinite(r.planet.durH) ? `${r.planet.durH.toFixed(1)} h` : 'none'),
      el('td', 'num', Number.isFinite(r.planet.depthPct) ? `${r.planet.depthPct.toFixed(r.planet.depthPct < 0.1 ? 3 : 2)} %` : 'none'),
      el('td', 'num', Number.isFinite(r.planet.vmag) ? r.planet.vmag.toFixed(1) : 'none'));
    body.append(tr);
  }
  if (!show.length) { const tr = el('tr'); const td = el('td', 'dim', S.place ? 'No transit in the next 24 hours meets the rule under the table. Show all to see each one and why.' : 'No transit in the next 24 hours.'); td.colSpan = 10; tr.append(td); body.append(tr); }
  if (held) { const again = [...body.querySelectorAll('button')].find((x) => x.dataset.planet === held); if (again) again.focus({ preventScroll: true }); }
  const more = $('t-all');
  more.hidden = S.place ? false : rows.length <= FIRST_ROWS;
  more.textContent = S.place
    ? (S.showAll ? `show only the ${num(watch.length)} that can be watched` : `show all ${num(rows.length)} transits, and why each of the others cannot be watched`)
    : (S.showAll ? `show the first ${FIRST_ROWS}` : `show all ${num(rows.length)}`);
  put('t-shown', `${num(show.length)} of ${num(rows.length)} listed`);
}
const NIGHT_NOTE = () => (S.place
  ? `Each gold line is a transit that can be watched: its star's path over ${S.place.lat.toFixed(2)}°, ${S.place.lon.toFixed(2)}° from the transit's beginning to its end. Faint lines are transits that cannot. Point at one to read it.`
  : 'The next 24 hours. Each tick is a predicted transit: tall where the clock can be read, shorter where it is fading, shortest where it is lost.');
function mountTonight() {
  night = surface($('night'), (ctx, w, h) => {
    if (!S.rows) return;
    S.nightHits = drawNight(ctx, w, h, { rows: S.rows, place: S.place, fromJd: S.nightFrom, night: S.night, clock: hourOf });
  });
  const nv = $('night');
  nv.addEventListener('pointermove', (e) => {
    const r = nv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 18 * 18;
    for (const hh of S.nightHits) { const d = (hh.x - x) ** 2 + (hh.y - y) ** 2; if (d < bd) { bd = d; best = hh; } }
    put('night-note', best ? `${best.row.planet.name}: middle ${localTime(best.row.mid, best.row.windowS)} ± ${span(best.row.windowS)}, lasts ${span(durDays(best.row.planet) * 86400)}, star ${Math.round(best.row.altMin)}° to ${Math.round(best.row.altMax)}° up.` : NIGHT_NOTE());
  });
  nv.addEventListener('pointerleave', () => put('night-note', NIGHT_NOTE()));
  nv.addEventListener('click', (e) => {
    const r = nv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = S.nightHits.find((hh) => (hh.x - x) ** 2 + (hh.y - y) ** 2 < 18 * 18);
    if (hit) { openStar(S.stars[hit.row.planet.i], { user: true }); put('pick-msg', ''); }
  });
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
  put('t-rule', `Watchable, as this page counts it: from a window before the transit begins to a window after it ends, the star is at least ${WATCH.minAlt}° up and the Sun at least ${-WATCH.maxSun}° below the horizon; the transit is ${WATCH.minLamp} times its window or longer; and most other published clocks agree with this one.`);
}

/* ---------------- the catalogue's state, and the tally ---------------- */
function renderState() {
  const now = nowJd();
  const timed = cat.planets.filter((p) => p.clock && durDays(p));
  const lost = timed.filter((p) => lampAt(p.clock, now, durDays(p)) < 1).length;
  const fading = timed.filter((p) => { const l = lampAt(p.clock, now, durDays(p)); return l >= 1 && l < 3; }).length;
  const doubted = cat.planets.filter((p) => contested(p.clock)).length;
  const alone = cat.planets.filter((p) => p.clock && p.clock.others === 0).length;
  const pc = (a, b) => `${((100 * a) / b).toFixed(1)} %`;
  put('s-planets', num(cat.planets.length));
  put('s-timed', num(timed.length));
  put('s-lost', `${num(lost)} (${pc(lost, timed.length)})`);
  put('s-fading', num(fading));
  put('s-contested', `${num(doubted)} (${pc(doubted, cat.planets.length)})`);
  put('s-alone', num(alone));
  put('s-date', cat.meta.retrieved);
  put('tb-source', `NASA Exoplanet Archive · ${cat.meta.retrieved}`);
}
function renderTally() {
  const pairs = cat.planets.map(pairOf).filter(Boolean);
  const real = pairs.filter((x) => x.real);
  const t = tally(real);
  S.zs = real.filter((x) => !x.blind).map((x) => grade(x.older, x.newer).z);
  tallyView.redraw();
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
  put('y-headline', `${pc(t.inside1, t.real)} of the later papers found the transit inside the older clock's 1-sigma window, where honest errors would put 68 %. ${pc(t.beyond3, t.real)} found it more than 3 sigma away, where honest errors would put 0.3 %.`);
  $('tally').dataset.ready = '1';
}

/* ---------------- boot ---------------- */
async function boot() {
  try { os = await LabsOS.init({ lab: LAB }); } catch { os = null; }
  if (os) for (const [type, cls] of [['exomania.planet', 'action'], ['exomania.place', 'action'], ['exomania.scrub', 'action']]) { try { os.register(type, { cls, throttleMs: type === 'exomania.scrub' ? 5000 : 0 }); } catch { /* already registered on this page */ } }
  let saved = null;
  try { const rec = os && await os.progress.get(); saved = rec && rec.data && typeof rec.data === 'object' ? rec.data : null; } catch { saved = null; }
  const linkDate = q.get('date') && Number.isFinite(Date.parse(q.get('date'))) ? clampJd(jdOfMs(Date.parse(q.get('date')))) : null;
  mountViews(); mountTonight();
  tallyView = surface($('tally-view'), (ctx, w, h) => { if (S.zs) drawTally(ctx, w, h, { zs: S.zs }); });
  try {
    cat = await load((c) => {
      // the clocks are here: today's sky, the night, the count. The sky's past waits for the record.
      cat = c;
      S.stars = starsOf(cat.planets);
      S.place = saved && saved.place ? placeOf(saved.place.lat, saved.place.lon) : null;
      if (S.place) { $('lat').value = String(S.place.lat); $('lon').value = String(S.place.lon); }
      mountPicker(); renderState(); renderTonight();
      const asked = q.get('planet'), byName = (n) => S.stars.find((s) => s.p.name === n);
      const first = byName(asked || '') || byName((saved && saved.planet) || '') || byName(DEFAULT_PLANET) || S.stars[0];
      if (asked && !byName(asked)) put('pick-msg', `${NO_PLANET(asked.slice(0, 60))} Showing ${first.p.name}.`);
      S.jd = linkDate ?? nowJd();
      openStar(first);
      document.body.dataset.state = 'clocks';
      put('load-msg', 'loading the published record');
    });
  } catch (e) {
    put('load-msg', cat
      ? 'The published record could not be loaded, so the sky before today, the history of each clock and the tally cannot be drawn. Reload to try again.'
      : 'The clocks could not be loaded, so this page has nothing to draw. Reload to try again.');
    document.body.dataset.state = cat ? 'clocks' : 'error';
    console.error('overdue: data did not load', e);
    return;
  }
  // the full record is here: every lamp's history, the count through the years, the tally
  for (const s of S.stars) s.hist = historyOf(s.p, retrievedJd());
  S.census = census(S.stars);
  S.marks = marksOf();
  S.record = true;
  document.body.dataset.state = 'ready';
  put('load-msg', '');
  put('band-note', BAND_NOTE());
  describeStar(); renderTally();
  if (S.touched || linkDate !== null) render(); else ignite(nowJd());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!tween || still) render(); });      // the name on the sky is set in the display face once it is here
  setInterval(() => { if (!document.hidden) renderTonight(); }, 300000);        // the list is about the next 24 hours: it is recounted every five minutes
}
/* For tools/drives/exomania.mjs: where things are on the sheet, so a pointer can be put on them. */
if (!leaving) $('sky').probe = () => ({
  lens: S.L ? S.L.lens : null, wide: S.L ? S.L.wide : null, lamps: S.spots.length, star: S.star ? S.star.p.name : null,
  at: (name) => { const sp = S.spots.find((x) => x.star.p.name === name && !x.lens) || S.spots.find((x) => x.star.p.name === name); return sp ? { x: sp.x, y: sp.y } : null; },
});
if (!leaving) boot();
