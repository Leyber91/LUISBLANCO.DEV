/* ============================================================
   Overdue — boot.

   One sheet, drawn at one date. The date is the only thing a
   visitor holds: the line of time under the sky is dragged, and
   the sky, the count in the corner and the one clock being read
   are all redrawn at the date under the line. A lamp on the sky
   is chosen with the pointer, by name, or from the night's list.

   Data in, one direction:
     ephemerides.json (planets, working clocks)        -> today's sky, tonight's crossings
     ephemerides-record.json (every published solution) -> the sky's past, the one clock's line, the tally
   Everything shown is computed here from those two files and the
   visitor's clock; nothing is fetched from anywhere else.

   The page stands on the labs' platform: the chosen planet and
   the visitor's place are the lab's progress record in Labs OS
   (in this browser; the privacy page exports and erases it), and
   a clock the visitor opens is a visit "from the sky" in the
   survey's log of that record, with the day the sky was at, so
   the log can reopen it there (record.js is the one client of the
   record). Usage is logged as which planet was opened, which year a drag
   on the line ended on, and whether a place was typed or taken
   from the device. The place itself is never in an event. Until
   a visitor sets a place the night is drawn for an example one,
   named as an example, and nothing is kept.

   A drawing is named by labels on it. What is under the pointer
   is named on the drawing too, so no sentence stands under a
   drawing to explain it.

   Deep links: ?planet=<name>   ?date=YYYY-MM-DD   ?still
   A link made by the survey before it moved to its own page
   (?p=, ?plot=, ?tour=, ?view=, ?cam=, ?q=) is passed on to it.
   ============================================================ */

import { LabsOS } from '../../os/index.js';
import { load as loadRecord, update as updateRecord, setOverdue, visit } from '../record.js';
import { el } from '../../kit/dom.js';
import { int, day, fromIso, isoDay, clock } from '../../kit/format.js';
import { setSwitch, switchCtl } from '../../kit/controls.js';
import { surface, reducedMotion } from '../views/common.js';
import { jdOfMs, msOfJd, sunAltitude } from './time.js';
import { epochAt, sigmaAt, lampAt, lostFrom, tally, grade, contested, stateOf, KEPT_LAMP, yearOfJd, jdOfYear } from './clock.js';
import { load, pairOf, durDays } from './data.js';
import { hammer, lens, historyOf, clockAt, lampOn, census, errorLine, isK2, densestField, FIRST_YEAR, LAST_YEAR } from './sky.js';
import { skyLayout, drawSky, drawLens, bandScale, stampOf, drawBand, drawCurve, drawOC, drawNight, nearestTrace, drawTally, pointsFor } from './views.js';
import { crossings, span, placeOf, shownMs, WATCH, EXAMPLE_PLACE } from './tonight.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const SURVEY_PARAMS = ['p', 'plot', 'tour', 'view', 'cam', 'q'];
const leaving = !q.has('planet') && SURVEY_PARAMS.some((k) => q.has(k));
if (leaving) location.replace('exomania-survey.html' + location.search + location.hash);

const still = reducedMotion() || q.has('still');
const LAB = 'exomania';
const DEFAULT_PLANET = 'HD 209458 b';
const MIN_JD = jdOfYear(FIRST_YEAR), MAX_JD = jdOfYear(LAST_YEAR);
const nowJd = () => jdOfMs(Date.now());
const clampJd = (jd) => Math.max(MIN_JD, Math.min(MAX_JD, jd));
const HALF_DAY = 0.5;

let os = null, cat = null;
const S = {
  jd: nowJd(), stars: [], star: null, hover: null, place: null, showAll: false, touched: false, record: false, igniting: false,
  census: null, spots: [], lensSpots: [], bandHits: [], nightHits: [], ocHits: [], L: null, sc: null, k2: null, k2note: null, shown: null,
  bandHover: null, ocHover: null, nightHover: null,
};

/* ---------------- the platform ---------------- */
function track(type, data) { if (os) void os.track(type, data); }
/* The lab's record (record.js). This page changes its own slice, where the sky was left, in the record as the
   store holds it at that moment, so the survey's log is left as it is. `opened`: the planet whose clock the visitor
   just opened, which is also a visit "from the sky" in that log, with the day the sky is at (the day it is going to,
   while the sheet ignites), unless recording is off on this site. A record a later version of the lab wrote is not
   written: the page keeps working on what it holds in memory. resume: where the labs' hub leads back to, written
   with the change. */
const known = (name) => !!cat && cat.byName.has(name);
function save(resume = null, opened = null) {
  if (!os) return;
  const sky = (r) => setOverdue(r, { planet: S.star ? S.star.p.name : null, place: S.place }, known);
  const at = dateOf(S.igniting ? nowJd() : S.jd);
  const change = opened && os.recording.on ? (r) => { const w = sky(r); return w.ok ? visit(w.record, { name: opened, t: Date.now(), via: 'sky', at }, known) : w; } : sky;
  updateRecord(os, change, { resume }).catch(() => {});
}

/* ---------------- words ---------------- */
/* Text is written only when it changes, so a live region speaks once and a drag does not rewrite the page. */
const put = (id, text) => { const n = $(id); if (n && n.textContent !== text) n.textContent = text; };
const say = (id, text) => { const n = $(id); if (n && n.getAttribute('aria-label') !== text) n.setAttribute('aria-label', text); };
const num = (n) => int(n);   // the kit's one convention for numbers
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const dateOf = (jd) => isoDay(msOfJd(jd));   // the ISO day, for an address and for the drive's probe; never shown as text
const longDate = (jd) => day(msOfJd(jd));   // the kit's one convention for a date: never broken between its day, its month and its year
function localTime(jd, windowS) {
  const t = shownMs(msOfJd(jd), windowS);
  return clock(t.ms, { weekday: true, seconds: !!t.seconds });
}
const hourOf = (jd, withDay = false) => clock(Math.round(msOfJd(jd) / 60000) * 60000, { weekday: withDay });      // to the nearest minute: a Julian date of a whole hour is a hair under it
/* A solution's paper. Before the record is here only the working clocks are known, and not yet by name. */
const refLabel = (s) => (cat.refs && s.ref != null && cat.refs[s.ref] ? cat.refs[s.ref][0]
  : s.flag === 2 ? 'a published solution' : s.flag === 1 ? 'the archive\'s composite row, from one paper' : 'the archive\'s composite row');
/* The paper with its year, once: the archive's names already end in one. */
const paperOf = (s) => { const name = refLabel(s); return /\b(19|20)\d\d[a-z]?$/.test(name) || s.pub == null ? name : `${name}, ${Math.floor(s.pub)}`; };
const stateWord = (lamp) => (lamp === null ? 'not yet timed' : stateOf(lamp));
const isLive = () => !S.igniting && Math.abs(S.jd - nowJd()) < 1 / 1440;      // the date shown is this instant, so a planet in front of its star can be marked

/* ---------------- the sky's lamps ---------------- */
const retrievedJd = () => jdOfMs(Date.parse(cat.meta.retrieved));
function starsOf(planets) {
  return planets.map((p) => ({ p, hist: historyOf(p, retrievedJd()), m: hammer(p.ra ?? 0, p.dec ?? 0), q: lens(p.ra ?? 0, p.dec ?? 0) }));
}
/* The K2 planets the count counts (those with a transit length), and the field where they stand closest. */
function k2Field(stars) {
  const mine = stars.filter((s) => isK2(s.p.name) && durDays(s.p)), field = densestField(mine);
  return field ? { ra: field.ra, dec: field.dec, stars: mine } : null;
}
const K2_WIDEST = ['K2 FIELDS', '000 OF 000 LOST'];      // the room the label asks of the sheet, whatever the count

/* ---------------- the date ---------------- */
let tween = 0;
function setDate(jd, { user = true } = {}) {
  cancelAnimationFrame(tween); S.igniting = false;
  if (user) S.touched = true;
  S.jd = clampJd(jd);
  render();
}
/* The sheet ignites: the date runs from the first transit timed to today, and the lamps come on as they were found. */
function ignite(target) {
  cancelAnimationFrame(tween);
  if (still) { S.jd = target; return render(); }
  const from = MIN_JD, t0 = performance.now(), ms = 2800;
  S.igniting = true;
  const step = (t) => {
    const f = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - f, 3);
    S.jd = from + (target - from) * e;
    if (f >= 1) S.igniting = false;
    render();
    if (f < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}

/* ---------------- one clock ---------------- */
function openStar(star, { user = false } = {}) {
  if (!star) return;
  S.star = star; S.shown = null; S.bandHover = null; S.ocHover = null;
  $('pick').value = '';
  describeStar();
  if (user) { S.touched = true; save({ url: `exomania.html?planet=${encodeURIComponent(star.p.name)}`, label: star.p.name }, star.p.name); track('exomania.planet', { planet: star.p.name }); }
  render();
}
/* What does not change with the date: who the planet is. */
function describeStar() {
  const p = S.star.p;
  put('c-name', p.name);
  const bits = [];
  if (Number.isFinite(p.vmag)) bits.push(`V ${p.vmag.toFixed(1)}`);
  if (p.clock) bits.push(`orbit ${span(p.clock.P * 86400)}`);
  if (durDays(p)) bits.push(`transit ${span(durDays(p) * 86400)}${Number.isFinite(p.depthPct) ? ` and ${p.depthPct.toFixed(p.depthPct < 0.1 ? 3 : 2)} % deep` : ''}`);
  if (p.discYear) bits.push(`found ${p.discYear}`);
  put('c-meta', bits.join(', '));
  $('c-world').href = `exomania-survey.html?p=${encodeURIComponent(p.name)}`;      // from a clock to the planet itself, on the survey's page
}
/* What changes only when another paper takes over: every other published clock against the one in use, as the
   drawing shows them and as a list anybody can open. */
function describePapers(c) {
  const p = S.star.p, ul = $('r-points');
  ul.textContent = '';
  if (!p.sols || !c) { put('r-count', 'published clocks'); return; }
  ul.append(el('li', '', `${paperOf(c)}, the clock in use. Mid-transit ${c.t0.toFixed(5)} ± ${span(c.sT * 86400)}, period ${c.P} d ± ${span(c.sP * 86400)}.`));
  const orbit = (n) => (n === 0 ? 'on the clock\'s own orbit' : `${plural(Math.abs(n), 'orbit', 'orbits')} ${n < 0 ? 'before' : 'after'} it`);
  for (const pt of pointsFor(p, c).sort((a, b) => a.s.t0 - b.s.t0)) {
    ul.append(el('li', '', `${paperOf(pt.s)} timed a transit ${orbit(pt.n)} and found it ${span(Math.abs(pt.residual) * 86400)} ${pt.residual < 0 ? 'early' : 'late'}, ${Math.abs(pt.z).toFixed(1)} sigma of the two errors together.`));
  }
  put('r-count', plural(p.sols.length, 'published clock', 'published clocks'));
}
/* The sentence of the reading: which paper, to what error, in which state, and when that changes. */
function sayClock(p, c, jd) {
  const now = nowJd(), dur = durDays(p), sig = sigmaAt(c, epochAt(c, jd)), state = stateOf(dur ? dur / sig : NaN);
  const past = jd < now - HALF_DAY, ahead = jd > now + HALF_DAY, err = `± ${span(sig * 86400)}`;
  const verdict = dur ? `so the clock ${past ? 'was' : 'is'} ${state}` : 'and the archive gives no transit length to hold that against';
  const lead = past ? `By the archive's table the best clock on ${longDate(jd)} was from ${paperOf(c)}. It predicted the transit to ${err}, ${verdict}.`
    : ahead ? `The clock in use is from ${paperOf(c)}. If nobody looks again, on ${longDate(jd)} it predicts the transit to ${err}, ${verdict}.`
    : `The clock in use is from ${paperOf(c)}. Today it predicts the transit to ${err}, ${verdict}.`;
  let when = '';
  if (dur) {
    const slipJd = lostFrom(c, dur / KEPT_LAMP), lostJd = lostFrom(c, dur), far = (x) => yearOfJd(x) > 2200, since = (x) => (x <= c.t0 ? 'its own epoch' : longDate(x));
    const had = past ? 'had' : 'has', then = ahead ? 'It' : 'If nobody looks again it';
    if (state === 'lost') when = ` It ${had} been lost since ${since(lostJd)}.`;
    else if (state === 'slipping') when = ` It ${had} been past a twelfth of the transit since ${since(slipJd)}.${past || far(lostJd) ? '' : ` ${then} is lost from ${longDate(lostJd)}.`}`;
    else if (!past && !far(slipJd)) when = ` ${then} slips past a twelfth of the transit on ${longDate(slipJd)}${far(lostJd) ? '' : ` and is lost from ${longDate(lostJd)}`}.`;
  }
  const doubt = c === p.clock && contested(c) ? ` Only ${c.agree} of ${plural(c.others, 'other published clock agrees', 'other published clocks agree')} with it, so it is contested.` : '';
  return lead + when + doubt;
}

/* ---------------- drawing ---------------- */
let sky = null, lens2 = null, band = null, curve = null, oc = null, night = null, tallyView = null;
function render() {
  if (!cat) return;
  const now = nowJd(), atNow = Math.abs(S.jd - now) < HALF_DAY;
  // the K2 fields on the date shown, for the one label on the map
  if (S.k2) {
    let lost = 0, of = 0;
    for (const s of S.k2.stars) { const l = lampOn(s.p, s.hist, S.jd); if (l === null) continue; of++; if (l < 1) lost++; }
    S.k2note = { ra: S.k2.ra, dec: S.k2.dec, lines: of ? ['K2 FIELDS', `${num(lost)} OF ${num(of)} LOST`] : [], sample: K2_WIDEST, lost, of };
  }
  sky.redraw(); lens2.redraw(); band.redraw(); curve.redraw();
  $('key-live').style.visibility = isLive() ? 'visible' : 'hidden';      // the key names the arc only while the sky shows it, and keeps its place either way
  put('k2', S.k2note && S.k2note.of ? `${num(S.k2note.lost)} of ${num(S.k2note.of)} K2 clocks lost, the rings along the ecliptic` : '');
  $('k2').classList.toggle('on-sheet', !!(S.k2note && S.k2note.fits));
  // the count in the corner: clocks that are lost on the date shown
  let lost = 0, slipping = 0, kept = 0;
  for (const s of S.stars) { const l = lampOn(s.p, s.hist, S.jd); if (l === null || !Number.isFinite(l)) continue; if (l < 1) lost++; else if (l < KEPT_LAMP) slipping++; else kept++; }
  const timed = lost + slipping + kept;
  put('n-lost', num(lost));
  put('n-of', `of ${plural(timed, 'transit clock', 'transit clocks')}`);
  put('n-verb', atNow ? `${lost === 1 ? 'is' : 'are'} lost today` : S.jd < now ? `${lost === 1 ? 'was' : 'were'} lost on ${longDate(S.jd)}` : `lost by ${longDate(S.jd)}`);
  put('n-if', S.jd > now + HALF_DAY ? 'if nobody looks again' : '');
  $('scrub').value = String(Math.round(S.jd));
  $('scrub').setAttribute('aria-valuetext', longDate(S.jd));
  // the one clock, on that date
  if (S.star) {
    const p = S.star.p, c = clockAt(S.star.hist, S.jd);
    put('c-status', c ? sayClock(p, c, S.jd) : `No clock had been published for ${p.name} by ${longDate(S.jd)}.`);
    if (S.shown !== (c || 0)) { S.shown = c || 0; S.ocHover = null; describePapers(c); oc.redraw(); }
    const seen = curve.last;
    say('curve', seen && Number.isFinite(seen.expected)
      ? `The transit of ${p.name} as its clock lets it be seen on ${longDate(S.jd)}, a dip of ${(seen.expected * 100).toPrecision(2)} %, where the transit itself is ${(seen.depth * 100).toPrecision(2)} % deep.`
      : `The transit of ${p.name} cannot be drawn on ${longDate(S.jd)}, because ${c ? 'the archive gives no transit length' : 'no clock had been published'}.`);
    say('sky', `The sky of transit clocks on ${longDate(S.jd)}. Of ${num(timed)}, ${num(kept)} are kept, ${num(slipping)} slipping and ${num(lost)} lost. ${p.name} is selected.`);
  }
}

function mountViews() {
  sky = surface($('sky'), (ctx, w, h) => {
    S.L = skyLayout(w, h);
    S.spots = drawSky(ctx, w, h, { L: S.L, stars: S.stars, jd: S.jd, selected: S.star, hover: S.hover, live: isLive(), note: S.k2note });
  });
  // where the sheet is too narrow to hold the lens beside the map, the lens has a canvas of its own under the line of time
  lens2 = surface($('lens2'), (ctx, w, h) => {
    S.lensSpots = S.L && !S.L.lens && S.stars.length ? drawLens(ctx, w, h, { stars: S.stars, jd: S.jd, selected: S.star, live: isLive() }) : [];
  });
  band = surface($('band'), (ctx, w, h) => {
    S.sc = bandScale(w, h);
    const st = S.star;
    S.bandHits = drawBand(ctx, w, h, { sc: S.sc, census: S.census, line: st ? errorLine(st.hist) : null, hist: st ? st.hist : [], dur: st ? durDays(st.p) : null,
      jd: S.jd, nowJd: nowJd(), stamp: stampOf(msOfJd(S.jd)), paper: refLabel, hover: S.bandHover });
  });
  curve = surface($('curve'), (ctx, w, h) => {
    if (!S.star) return;
    curve.last = drawCurve(ctx, w, h, { planet: S.star.p, clock: clockAt(S.star.hist, S.jd), jd: S.jd });
  });
  oc = surface($('oc'), (ctx, w, h) => {
    S.ocHits = S.star && S.record ? drawOC(ctx, w, h, { planet: S.star.p, clock: clockAt(S.star.hist, S.jd), paper: refLabel, hover: S.ocHover }) : [];
  });
  const near = (hits, canvas, e, reach) => {
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = reach * reach;
    for (const hh of hits) { const d = (hh.x - x) ** 2 + (hh.y - y) ** 2; if (d < bd || (d === bd && hh.lens)) { bd = d; best = hh; } }
    return best;
  };
  // a paper under the pointer is named on the drawing
  const ov = $('oc');
  const ocHover = (s) => { if (s !== S.ocHover) { S.ocHover = s; oc.redraw(); } };
  ov.addEventListener('pointermove', (e) => { const hit = near(S.ocHits, ov, e, 14); ocHover(hit ? hit.pt.s : null); });
  ov.addEventListener('pointerleave', () => ocHover(null));

  // the sky: point at a lamp to name it, press to read it
  const sk = $('sky'), tip = $('sky-tip');
  sk.addEventListener('pointermove', (e) => {
    const sp = near(S.spots, sk, e, 12), star = sp ? sp.star : null;
    if (star !== S.hover) { S.hover = star; sky.redraw(); }
    if (!sp) { tip.hidden = true; return; }
    const c = clockAt(star.hist, S.jd), lamp = lampOn(star.p, star.hist, S.jd);
    tip.textContent = `${star.p.name}, ${stateWord(lamp)}${c ? `, ± ${span(sigmaAt(c, epochAt(c, S.jd)) * 86400)}` : ''}`;
    tip.hidden = false;
    const box = sk.getBoundingClientRect();      // the drawing does not start at the sheet's corner where the name stands above it
    tip.style.left = `${sk.offsetLeft + Math.min(box.width - 220, Math.max(4, sp.x + 12))}px`;
    tip.style.top = `${sk.offsetTop + Math.max(4, sp.y - 30)}px`;
  });
  sk.addEventListener('pointerleave', () => { tip.hidden = true; if (S.hover) { S.hover = null; sky.redraw(); } });
  // A press reads the lamp that is named under the pointer. A browser rounds the place of a click and not of a
  // move, and under the lens two lamps can be a pixel apart: without this a visitor read one name and opened another.
  sk.addEventListener('click', (e) => { const star = S.hover || (near(S.spots, sk, e, 12) || {}).star; if (star) { openStar(star, { user: true }); put('pick-msg', ''); } });
  const l2 = $('lens2');
  l2.addEventListener('click', (e) => { const sp = near(S.lensSpots, l2, e, 16); if (sp) { openStar(sp.star, { user: true }); put('pick-msg', ''); } });

  // the line of time: the date is set by dragging on it, by the arrow keys once it has the focus, or by the button
  const cv = $('band');
  let dragging = false, touch = false, moved = false, downX = 0;
  const setFromX = (e) => { const r = cv.getBoundingClientRect(); setDate(jdOfYear(S.sc.yearAt(e.clientX - r.left))); };
  const bandHover = (s) => { if (s !== S.bandHover) { S.bandHover = s; band.redraw(); } };
  // A mouse sets the date where it presses. A finger sets it by a tap or a sideways drag, never by touching down:
  // an up or down swipe over the line scrolls the page (the browser then cancels the pointer) and moves nothing.
  cv.addEventListener('pointerdown', (e) => {
    if (!S.sc) return;
    dragging = true; touch = e.pointerType !== 'mouse'; moved = false; downX = e.clientX; S.bandHover = null;
    try { cv.setPointerCapture(e.pointerId); } catch { /* no capture for a synthetic pointer */ }
    if (!touch) setFromX(e);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) { const hit = near(S.bandHits, cv, e, 9); return bandHover(hit ? hit.s : null); }      // a paper's dot under the pointer is named on the line
    if (touch && !moved && Math.abs(e.clientX - downX) < 6) return;
    moved = true; setFromX(e);
  });
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') bandHover(null); });
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
/* The place the night is drawn for: the visitor's, or the example until they set one. */
const placeNow = () => S.place || EXAMPLE_PLACE;
const placeWords = () => (S.place ? `${S.place.lat.toFixed(2)}°, ${S.place.lon.toFixed(2)}°` : `${EXAMPLE_PLACE.name} (${EXAMPLE_PLACE.lat.toFixed(2)}°, ${EXAMPLE_PLACE.lon.toFixed(2)}°), an example place`);
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
  const now = nowJd(), place = placeNow();
  const rows = crossings(cat.planets, cat.standards, now, 24, place);
  const up = rows.filter((r) => r.watchable);
  put('t-count', `${plural(rows.length, 'transit has its', 'transits have their')} predicted middle in the next 24 hours. ${plural(up.length, 'is', 'are')} up in the dark over ${placeWords()}.`);
  S.rows = rows; S.up = up.length; S.night = nightSpans(place, now); S.nightFrom = now; S.nightHover = null;
  night.redraw();
  say('night', `The dark hours of the next 24 over ${placeWords()}. ${plural(up.length, 'transit is', 'transits are')} up in the dark, each drawn as the height of its star from the transit's beginning to its end. The table under the drawing lists them.`);
  const body = $('t-body');
  const held = body.contains(document.activeElement) ? document.activeElement.dataset.planet : null;      // the table is rebuilt: keep the reader's place in it
  body.textContent = '';
  $('t-table').classList.toggle('all-up', !S.showAll);
  const show = S.showAll ? rows : up;
  $('t-wrap').classList.toggle('long', show.length > 40);
  for (const r of show) {
    const tr = el('tr', r.watchable ? 'up' : '');
    const name = el('td'); const b = el('button', 'linkish', r.planet.name); b.type = 'button'; b.dataset.planet = r.planet.name;
    b.addEventListener('click', () => { openStar(S.stars[r.planet.i], { user: true }); put('pick-msg', ''); $('clock').scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' }); $('c-name').focus({ preventScroll: true }); });
    name.append(b);
    const alt = !Number.isFinite(r.altMin) ? 'none' : Math.round(r.altMin) === Math.round(r.altMax) ? `${Math.round(r.altMin)}°` : `${Math.round(r.altMin)}° to ${Math.round(r.altMax)}°`;
    tr.append(name, el('td', 'num', localTime(r.mid, r.windowS)), el('td', 'num', `± ${span(r.windowS)}`),
      el('td', `why${r.watchable ? ' yes' : ''}`, r.watchable ? 'up in the dark' : (r.why || 'none')), el('td', 'num', alt), el('td', '', r.sky || 'none'),
      el('td', '', r.contested ? `${r.state}, contested` : r.state),
      el('td', 'num', Number.isFinite(r.planet.durH) ? `${r.planet.durH.toFixed(1)} h` : 'none'),
      el('td', 'num', Number.isFinite(r.planet.depthPct) ? `${r.planet.depthPct.toFixed(r.planet.depthPct < 0.1 ? 3 : 2)} %` : 'none'),
      el('td', 'num', Number.isFinite(r.planet.vmag) ? r.planet.vmag.toFixed(1) : 'none'));
    body.append(tr);
  }
  if (!show.length) { const tr = el('tr'); const td = el('td', 'dim', 'No transit in the next 24 hours is up in the dark here. Show all to see each one and why.'); td.colSpan = 10; tr.append(td); body.append(tr); }
  if (held) { const again = [...body.querySelectorAll('button')].find((x) => x.dataset.planet === held); if (again) again.focus({ preventScroll: true }); }
  // the shared switch (kit/controls.js): two short states engraved, the lever on the side of the rows shown; the counts
  // and what "all" adds are said beside it, where they can wrap
  setSwitch($('t-all'), S.showAll);
  put('t-shown', `${num(show.length)} of ${num(rows.length)} listed, earliest first${S.showAll ? '; "from here" says why each one not up in the dark is not' : ', the ones up in the dark'}`);
  put('t-cap', plural(rows.length, 'transit', 'transits'));
}
function mountTonight() {
  night = surface($('night'), (ctx, w, h) => {
    if (!S.rows) return;
    S.nightHits = drawNight(ctx, w, h, { rows: S.rows, place: placeNow(), fromJd: S.nightFrom, night: S.night, clock: hourOf, hover: S.nightHover });
  });
  const nv = $('night');
  const nearRow = (e) => { const r = nv.getBoundingClientRect(); return nearestTrace(S.nightHits, e.clientX - r.left, e.clientY - r.top, 10); };      // anywhere along its line, not at its middle alone
  // a transit under the pointer is named on the drawing, with its hour
  const nightHover = (planet) => { if (planet !== S.nightHover) { S.nightHover = planet; night.redraw(); } };
  nv.addEventListener('pointermove', (e) => { const best = nearRow(e); nightHover(best ? best.row.planet : null); });
  nv.addEventListener('pointerleave', () => nightHover(null));
  nv.addEventListener('click', (e) => { const hit = nearRow(e); if (hit) { openStar(S.stars[hit.row.planet.i], { user: true }); put('pick-msg', ''); } });
  const setPlace = (pl, source) => {
    if (!pl) { put('place-msg', 'A latitude from -90 to 90 and a longitude from -180 to 180, east positive, as plain numbers.'); return; }
    S.place = pl; S.showAll = false;
    $('lat').value = String(pl.lat); $('lon').value = String(pl.lon);
    put('place-msg', '');
    save(); track('exomania.place', { source });
    renderTonight();
  };
  $('place-form').addEventListener('submit', (e) => { e.preventDefault(); setPlace(placeOf($('lat').value, $('lon').value), 'typed'); });
  $('locate').addEventListener('click', () => {
    if (!navigator.geolocation) { put('place-msg', 'This browser gives no location. Type a latitude and a longitude.'); return; }
    put('place-msg', 'asking this device for its location');
    navigator.geolocation.getCurrentPosition((pos) => setPlace(placeOf(pos.coords.latitude, pos.coords.longitude), 'device'),
      () => { put('place-msg', 'The location was not given. Type a latitude and a longitude.'); }, { maximumAge: 600000, timeout: 15000 });
  });
  $('forget').addEventListener('click', () => { S.place = null; S.showAll = false; $('lat').value = ''; $('lon').value = ''; put('place-msg', 'The place is forgotten. The night is drawn for the example again.'); save(); renderTonight(); });
  $('t-all-slot').replaceWith(switchCtl({ name: 'rows', words: ['up in the dark', 'all'], id: 't-all', ariaLabel: 'Rows: all the transits, with why each is not up' }));
  $('t-all').addEventListener('click', () => { S.showAll = !S.showAll; renderTonight(); });
  $('lat').placeholder = String(EXAMPLE_PLACE.lat); $('lon').placeholder = String(EXAMPLE_PLACE.lon);
  put('t-rule', `From ${WATCH.baselineH * 60} minutes before the transit begins to ${WATCH.baselineH * 60} minutes after it ends, and a window further on each side, the star is ${WATCH.minAlt}° up or more and the Sun ${-WATCH.maxSun}° down or more; the transit is ${WATCH.minLamp} windows long or more; and most other published clocks agree with this one.`);
}

/* ---------------- the catalogue's state, and the tally ---------------- */
function renderState() {
  const now = nowJd();
  const timed = cat.planets.filter((p) => p.clock && durDays(p));
  const of = (state) => timed.filter((p) => stateOf(lampAt(p.clock, now, durDays(p))) === state).length;
  const lost = of('lost'), slipping = of('slipping'), kept = of('kept');
  const doubted = cat.planets.filter((p) => contested(p.clock)).length;
  const alone = cat.planets.filter((p) => p.clock && p.clock.others === 0).length;
  const pc = (a, b) => `${((100 * a) / b).toFixed(1)} %`;
  put('s-planets', num(cat.planets.length));
  put('s-timed', num(timed.length));
  put('s-kept', `${num(kept)} (${pc(kept, timed.length)})`);
  put('s-slipping', `${num(slipping)} (${pc(slipping, timed.length)})`);
  put('s-lost', `${num(lost)} (${pc(lost, timed.length)})`);
  put('s-contested', `${num(doubted)} (${pc(doubted, cat.planets.length)})`);
  put('s-alone', num(alone));
  put('s-date', day(fromIso(cat.meta.retrieved), cat.meta.retrieved));
  put('tb-source', `NASA Exoplanet Archive, ${day(fromIso(cat.meta.retrieved), cat.meta.retrieved)}`);
}
function renderTally() {
  const pairs = cat.planets.map(pairOf).filter(Boolean);
  const real = pairs.filter((x) => x.real);
  const t = tally(real);
  S.zs = real.filter((x) => !x.blind).map((x) => grade(x.older, x.newer).z); S.tally = t;
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
  say('tally-view', `Where later papers found the transit, in sigmas of the older clock, one dot for each of ${num(t.real)} tests. ${pc(t.inside1, t.real)} found it inside the older clock's 1-sigma window, where honest errors would put 68 %. ${pc(t.beyond3, t.real)} found it more than 3 sigma away, where honest errors would put 0.3 %. The counts are in the list under the drawing.`);
  $('tally').dataset.ready = '1';
}

/* ---------------- boot ---------------- */
async function boot() {
  try { os = await LabsOS.init({ lab: LAB }); } catch { os = null; }
  if (os) for (const [type, cls] of [['exomania.planet', 'action'], ['exomania.place', 'action'], ['exomania.scrub', 'action']]) { try { os.register(type, { cls, throttleMs: type === 'exomania.scrub' ? 5000 : 0 }); } catch { /* already registered on this page */ } }
  let saved = null;
  try { saved = os ? (await loadRecord(os)).overdue : null; } catch { saved = null; }
  const linkDate = q.get('date') && Number.isFinite(Date.parse(q.get('date'))) ? clampJd(jdOfMs(Date.parse(q.get('date')))) : null;
  mountViews(); mountTonight();
  tallyView = surface($('tally-view'), (ctx, w, h) => { if (S.zs) drawTally(ctx, w, h, { zs: S.zs, t: S.tally }); });
  try {
    cat = await load((c) => {
      // the clocks are here: today's sky, the night, the count. The sky's past waits for the record.
      cat = c;
      S.stars = starsOf(cat.planets);
      S.k2 = k2Field(S.stars);
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
  S.record = true; S.shown = null;
  document.body.dataset.state = 'ready';
  put('load-msg', '');
  renderTally();
  if (S.touched || linkDate !== null) render(); else ignite(nowJd());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!S.igniting) { render(); oc.redraw(); night.redraw(); tallyView.redraw(); } });      // names are set in the display face once it is here
  setInterval(() => { if (!document.hidden) { renderTonight(); if (isLive()) { sky.redraw(); lens2.redraw(); } } }, 300000);        // the night is about the next 24 hours, and the arcs on the sky about this instant: both are redrawn every five minutes
}
/* For tools/drives/exomania.mjs: where things are on the sheet, so a pointer can be put on them. */
if (!leaving) $('sky').probe = () => ({
  lens: S.L ? S.L.lens : null, wide: S.L ? S.L.wide : null, lamps: S.spots.length, lensLamps: S.lensSpots.length, star: S.star ? S.star.p.name : null,
  date: dateOf(S.jd), k2: S.k2note ? { lost: S.k2note.lost, of: S.k2note.of, drawn: !!S.k2note.fits && S.k2note.of > 0, fits: !!S.k2note.fits } : null,
  named: S.nightHits.named || [], up: S.up || 0, papers: S.ocHits.length, same: S.ocHits.same || 0,
  nightHover: S.nightHover ? S.nightHover.name : null, live: isLive(),
  trace: (name) => { const hh = S.nightHits.find((x) => x.row.planet.name === name); return hh ? hh.pts : null; },
  at: (name) => { const sp = S.spots.find((x) => x.star.p.name === name && !x.lens) || S.spots.find((x) => x.star.p.name === name); return sp ? { x: sp.x, y: sp.y } : null; },
});
if (!leaving) boot();
