/* ============================================================
   exoplanet/main.js: entry for exomania-survey.html. Owns the
   state (selection, diagram, filters, query, tour, pins), wires
   the renderer and the sheets to it, keeps the URL in step, and
   runs the opening. The page is laid out as the bar sheet of
   level 2 draws it (BAR_L2.md): sheet A the planet, B the numbers,
   the tours, C the catalogue, D the system, E the signal. Its
   controls are the kit's (kit/controls.js).

   Load order: the PSCompPars snapshot paints the page; the weekly
   roster joins in the background and marks measured radii.
   ============================================================ */

import { Exoplanet } from './exoplanet.js';
import { toParams, classify, lockRadiusAU, LOOKS } from './data.js';
import { loadSnapshot, joinRoster, provisionalMeasured } from './catalog.js';
import { LANDMARKS, PLOTS, SIZE_CLASSES, METHOD_GROUPS, TOURS, DATA, PHYS } from './config.js';
import {
  sizeClass, sizeClassOf, hzPosition, validateAgainstArchive, valleyHistogram, transitValidation, teqValidation, withholdingTest,
  insolation, monteCarlo, skyView, starColour, isNum,
} from './science.js';
import { createPlot, plotValue } from './views/plot.js';
import { createSystem, drawInset } from './views/system.js';
import { bandsHTML, bindEdges, drawHist, classCounts, classTable } from './views/bands.js';
import { createTransit } from './views/transit.js';
import { createTarget } from './views/target.js';
import { createReport } from './report.js';
import { createTours, tourStops } from './tours.js';
import { exportPlate, exportCSV, copyLink } from './export.js';
import { parseQuestion, askModel, needsModel, say, PAGE, RANGE_FIELDS, KINDS, COLD_WORDS, HOT_WORDS, LOCKED_WORDS } from './query.js';
import { COLD_K, HOT_K, hasKind, isLocked, isCold, isHot, rank, orderFor, sortWords, orderWords, hitFact } from './find.js';
import { chainHTML, compareHTML, methodHTML } from './panels.js';
import { createLog } from './log.js';
import { viaOf } from './record.js';
import { fmt, fmtInt, esc, reducedMotion } from './views/common.js';
import { mountRoutePanel } from '../ai/route-panel.js';
import { keycap, keyHint, switchCtl, setSwitch, bindSwitch, isOn, scale, bindScale, setScale } from '../kit/controls.js';
import { el } from '../kit/dom.js';
import { day, fromIso, isoDay } from '../kit/format.js';

const params = new URLSearchParams(location.search);
window.__EXO_STILL__ = params.has('still');
const $ = (id) => document.getElementById(id);
const store_ = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } return null; };

/* ---------------- state ---------------- */
const emptyFilter = () => ({ cls: 'all', method: 'all', year: null, box: null, upTo: null, ranges: {}, zone: null, looks: null, locked: null, cold: null, hot: null, set: null, newOnly: false, query: null });
const store = {
  state: {
    list: [], byName: new Map(), sel: null, system: [], plot: PLOTS[params.get('plot')] ? params.get('plot') : 'valley',
    filter: emptyFilter(), filterFn: () => true, filterActive: false, tour: null, colorBy: 'none',
    albedo: () => 0.3, pins: [], newNames: new Set(), plain: false,
  },
};
const methodGroup = (m) => (METHOD_GROUPS.some((g) => g.key === m) ? m : 'other');
const rangeValue = (p, k) => (k === 'S' ? insolation(p).S : k === 'dist' ? (isNum(p.dist) ? p.dist * PHYS.PC_LY : null) : p[k]);
const kindWords = (looks) => looks.map((l) => KINDS.find((k) => k.look === l).label).join(' or ');
function rebuildFilter() {
  const f = store.state.filter, st = store.state;
  const rk = Object.entries(f.ranges).filter(([, r]) => r && (r[0] !== null || r[1] !== null));
  // the worlds of the log (saved) or of a link (shared), as they are when the filter is built
  const inSet = f.set && log ? new Set(f.set === 'saved' ? log.saved() : log.shared()) : null;
  st.filterFn = (p) => {
    if (inSet && !inSet.has(p.name)) return false;
    if (f.cls !== 'all' && sizeClass(p.R)?.key !== f.cls) return false;
    if (f.method !== 'all' && methodGroup(p.method) !== f.method) return false;
    if (f.year !== null && p.year !== f.year) return false;
    if (f.newOnly && !st.newNames.has(p.name)) return false;
    for (const [k, [lo, hi]] of rk) {
      const v = rangeValue(p, k);
      if (!isNum(v) || (lo !== null && v < lo) || (hi !== null && v > hi)) return false;
    }
    if (f.zone && !f.zone.includes(hzPosition(p).key)) return false;
    // by what the world is like: the rules are in find.js
    if (f.looks && !hasKind(p, f.looks)) return false;
    if (f.locked && !isLocked(p)) return false;
    if (f.cold && !isCold(p)) return false;
    if (f.hot && !isHot(p)) return false;
    if (f.box) {
      const x = plotValue(p, f.box.xKey), y = plotValue(p, f.box.yKey);
      if (!isNum(x) || !isNum(y) || x < f.box.x[0] || x > f.box.x[1] || y < f.box.y[0] || y > f.box.y[1]) return false;
    }
    return true;
  };
  st.filterActive = f.cls !== 'all' || f.method !== 'all' || f.year !== null || f.newOnly || rk.length > 0 || !!f.zone || !!f.looks || !!f.locked || !!f.cold || !!f.hot || !!f.box || !!inSet;
}

/* ---------------- renderer ---------------- */
const canvas = $('exo-canvas');
const engine = new Exoplanet(canvas);
const glOk = engine.ok();
// what the renderer prepares is said on the fixed line under the name, where it covers nothing; a failure stands over
// the planet; the wheel scrolls the page until the planet has been pressed
engine.noteHost = $('sheet-msg'); engine.failHost = $('exo-stage'); engine.wheelNeedsFocus = true;
window.__exoEngine = engine;   // tools/drives/shapes.mjs shows a notice through it
// The page opens on LANDMARKS[0], a temperate world, unless a link names another: start building that
// look's shader now, while the catalogue loads, instead of after it.
if (glOk && !new URLSearchParams(location.search).get('p')) engine.prepare(LOOKS.temperate);
/* Low-power tier: on a software rasteriser every composited frame is expensive (backdrop blur
   over the canvas costs about 0.3 s a frame in SwiftShader), so the 2D views draw on demand
   and the glass panels drop their blur. Measured 2026-11-11. */
window.__EXO_LOWPOWER__ = !!engine.software;
if (engine.software) document.documentElement.classList.add('tier-software');
const desktop = () => window.matchMedia('(min-width: 1101px)').matches;
/* Fit the world to the free middle of sheet A: on a desk, between the name above and the key and title block below,
   across the sheet; on a phone, the middle three fifths of its own frame. Centre it there (a principal-point shift)
   and choose the camera distance that makes it fill that region. The line under the planet stands just below it. */
function placeWorld() {
  const cv = canvas.getBoundingClientRect();
  if (!cv.height) return;
  const left = cv.left, right = cv.right;
  let top, bottom;
  if (desktop()) {
    const ll = $('key').getBoundingClientRect(), lr = $('tblock').getBoundingClientRect();
    top = $('ul').getBoundingClientRect().bottom + 8;
    bottom = Math.min(ll.top, lr.top) - 26;
  } else {
    top = cv.top + cv.height * 0.2; bottom = cv.bottom - cv.height * 0.2;
  }
  const cx = (left + right) / 2 - cv.left, cy = (top + bottom) / 2 - cv.top;
  const r = Math.max(60, Math.min((bottom - top) / 2, (right - left) / 2 * 0.9));
  const rho = r / cv.height, fov = engine.camera.fov || 1.5;
  const home = Math.min(14, Math.max(2.2, 1 / Math.sin(Math.atan(rho / fov))));
  engine.frame([cx - cv.width / 2, cv.height / 2 - cy], home);
  $('exo-stage').style.setProperty('--bezel-y', `${Math.round(cy + r + 10)}px`);
}

/* ---------------- views ---------------- */
let plot, system, transit, target, report, tours, log = null;
/* What follows the log on the page: the compare bench, the buttons on the world's panel, the chips, a filter by the
   log, the link. The bench is the log's: st.pins is set here, from the record the store returned last, and nowhere
   else. */
function syncLog() {
  const st = store.state, b = document.querySelector('[data-act="log"]'), pb = document.querySelector('[data-act="pin"]');
  if (log && log.loaded()) {
    const names = log.pins();
    if (names.join('|') !== st.pins.map((p) => p.name).join('|')) {
      st.pins = names.map((n) => st.byName.get(n)).filter(Boolean);
      if ($('compare').open) openCompare();
    }
  }
  if (b && log) {
    const on = !!st.sel && log.isSaved(st.sel.name), busy = !!st.sel && log.busy(st.sel.name);
    b.textContent = on ? 'In your log' : 'Add to log';
    b.classList.toggle('kept', on);   // the gold of a kept clock
    b.disabled = !log.loaded() || busy;   // nothing can be said about the log before it is read, or while the store answers
    if (busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
    b.title = !log.loaded() ? 'The log is being read' : on ? 'Take this world out of your log' : 'Save this world to your log';
  }
  if (pb && log) {
    pb.disabled = !log.loaded();          // the bench is in the log: it is not drawn, or changed, before the log is read
    pb.title = log.loaded() ? 'Pin to compare with Earth and other worlds' : 'The log is being read';
  }
  // the last saved world was taken out while the page showed only saved worlds: the filter goes with it
  const emptied = st.filter.set === 'saved' && !!log && !log.counts().saved;
  if (emptied) st.filter.set = null;
  if (st.filter.set || emptied) { rebuildFilter(); if (plot) plot.redraw(); }
  // the filter bar is drawn again only when what it shows of the log changed: a redraw takes the focus off it
  if (st.list.length && chipsOf() !== chipsKey) renderFilters();
}
/* What the filter bar shows of the log: whether anything is saved, how many worlds a link shared, which set is the
   filter, and with a set as the filter the count of its matches. */
let chipsKey = '';
function chipsOf() {
  const st = store.state;
  return JSON.stringify([!!log && log.counts().saved > 0, log ? log.shared().length : 0, st.filter.set, st.filter.set ? st.list.filter(st.filterFn).length : null]);
}
const actions = {
  select, setPlot, setFilter, startTour, pauseTour,
  exportAs(kind, btn) {
    const st = store.state;
    if (!st.sel) return;
    if (kind === 'plate') { exportPlate(st.sel, engine, { system: document.querySelector('.sys-cv'), transit: document.querySelector('.tr-cv') }, st.albedo()); flash(btn, 'Saved'); }
    else if (kind === 'csv') { const n = exportCSV(st.list, st.filterFn, st.filterActive, st.albedo(), filterLabel()); flash(btn, `${fmtInt(n)} rows`); }
    else if (kind === 'link') copyLink().then((ok) => flash(btn, ok ? 'Copied' : 'Copy failed'));
    else if (kind === 'chain') { $('chain-body').innerHTML = chainHTML(st.sel, st.albedo()); $('chain').showModal(); }
    else if (kind === 'pin' && log) log.pin(st.sel.name, (w) => { openCompare(); flash(btn, w.ok ? `${st.pins.length} pinned` : 'Not pinned'); });
    else if (kind === 'log' && log) log.toggle(st.sel, glOk ? engine.camera.mode : 'orbit', (text, ok) => target.say(text, ok));
  },
};
function flash(btn, text) { if (!btn) return; const t = btn.dataset.word || btn.textContent; btn.dataset.word = t; btn.textContent = text; setTimeout(() => { btn.textContent = t; }, 1600); }

function filterLabel() {
  const f = store.state.filter, parts = [];
  if (f.cls !== 'all') parts.push(SIZE_CLASSES.find((c) => c.key === f.cls).label);
  if (f.method !== 'all') parts.push(METHOD_GROUPS.find((g) => g.key === f.method).label);
  if (f.year !== null) parts.push(String(f.year));
  for (const [k, r] of Object.entries(f.ranges)) if (r) parts.push(`${k} ${r[0] ?? ''}-${r[1] ?? ''}`);
  if (f.zone) parts.push('habitable zone');
  if (f.looks) parts.push(kindWords(f.looks));
  if (f.locked) parts.push(LOCKED_WORDS);
  if (f.cold) parts.push(COLD_WORDS);
  if (f.hot) parts.push(HOT_WORDS);
  if (f.box) parts.push('box on ' + PLOTS[f.box.mode].label);
  if (f.newOnly) parts.push('new since last visit');
  if (f.set) parts.push(f.set === 'saved' ? 'your log' : 'shared log');
  return parts.join(', ');
}

/* ---------------- selection ---------------- */
function paramsFor(p) {
  const prm = toParams(p);
  if (store.state.plain) { prm.cloud = 0; prm.life = 0; }
  return prm;
}
/* self: the page opened this world with no action of the visitor (the world it starts on, a tour moving by
   itself). Such a world is shown and is not written to the log as a visit. */
function select(p, { from = 'ui', keepTour = false, self = false } = {}) {
  if (!p) return;
  const st = store.state;
  if (!keepTour && st.tour) endTour();
  const prev = st.sel;
  st.sel = p;
  st.system = st.list.filter((q) => q.host === p.host).sort((a, b) => (a.a ?? a.P ?? 0) - (b.a ?? b.P ?? 0));
  const apply = () => {
    setReticle(p); placeWorld();
    if (desktop()) drawInset($('inset'), p, st.system);
    const c = starColour(p.Teff).srgb.map((x) => Math.round(x * 255)).join(',');
    document.body.style.setProperty('--star-rgb', c);
  };
  if (glOk) engine.flyTo(paramsFor(p), { onSwap: apply, dur: prev ? 1500 : 10 });
  else apply();
  if (glOk) engine.setCamera({ lookYaw: 0, lookPitch: 0 });
  target.update(p);
  report.update(p);
  plot.redraw();
  system.update();
  transit.update();
  syncCamButtons();
  writeURL();
  selRev++;
  const via = viaOf(from, { self, results: !!(st.tour && st.tour.key === 'custom' && st.tour.auto === false) });
  if (log && prev !== p && via) log.visit(p, via);
  syncLog();
}

function setReticle(p) {
  $('ret-name').textContent = p.name;
  const hz = hzPosition(p);
  const hzWords = { cons: 'in the conservative habitable zone', opt: 'in the optimistic habitable zone', hot: 'hotter than the habitable zone', cold: 'colder than the habitable zone', unknown: 'its zone unknown' }[hz.key];
  const sc = sizeClassOf(p);
  $('ret-class').textContent = `${sc ? sc.label + (sc.fromLimit ? ' by its radius bound' : '') : 'No radius measured'}, ${hzWords}`;
  const cl = classify(p);
  $('ret-render').textContent = `procedural surface: ${cl.label.replace(/ · habitable zone/i, '').toLowerCase()}${cl.physics.radiusKnown ? '' : ' [illustrative size]'}`;
}

function setPlot(mode) { store.state.plot = mode; plot.redraw(); writeURL(); }

/* A change of filter. One made by hand (a chip, the method, a range, a box on the diagram) means the question
   in the note no longer says what is on screen, so the question goes: its order, its text in the field and in
   the link, and a tour of its results, and the note says so. With no question, the note is cleared: whatever it
   said was about the filter before. `asked` marks the change a question itself makes; `keep` one that leaves
   the question standing (the replay of discoveries, which only hides years). */
function setFilter(patch, { asked = false, keep = false } = {}) {
  const st = store.state;
  filterRev++;
  Object.assign(st.filter, patch);
  if (!asked && !keep) {
    const was = st.filter.query;
    if (was !== null) {
      if ($('q').value.trim() === was) $('q').value = '';
      st.filter.query = null; st.querySort = null;
    }
    setNote(was !== null ? `The filter was changed by hand. “${was}” no longer describes what is shown.` : '');
    if (st.tour && st.tour.key === 'custom') endTour();
  }
  rebuildFilter();
  renderFilters();
  renderRanges();
  plot.redraw();
  writeURL();   // the link carries the question that is on screen, and loses it with the question
}

let urlT = 0;
function writeURL() {
  clearTimeout(urlT);
  urlT = setTimeout(() => {
    const st = store.state; if (!st.sel) return;
    const u = new URLSearchParams();
    u.set('p', st.sel.name);
    if (st.plot !== 'valley') u.set('plot', st.plot);
    if (st.tour && st.tour.key !== 'custom') u.set('tour', st.tour.key);
    const c = engine.camera || {};
    if (c.mode && c.mode !== 'orbit') u.set('view', c.mode);
    if (glOk && !c.moving && (Math.abs(c.yaw - c.yaw0) > 0.01 || Math.abs(c.pitch - c.pitch0) > 0.01 || Math.abs(c.dist - (c.homeDist || c.dist)) > 0.05)) {
      u.set('cam', [c.yaw, c.pitch, c.dist / (c.homeDist || 1)].map((x) => (+x).toFixed(2)).join(','));
    }
    if (st.filter.query) u.set('q', st.filter.query);
    if (log && log.shared().length) u.set('log', log.shared().join('|'));
    if (params.get('os-fixture')) u.set('os-fixture', params.get('os-fixture'));
    if (window.__EXO_STILL__) u.set('still', '');
    history.replaceState(null, '', '?' + u.toString().replace(/=(&|$)/, '$1'));
  }, 120);
}

/* ---------------- filters, ranges, replay, changelog ---------------- */
/* how many planets of the catalogue fall in each size class: the bands' counts, counted once per catalogue */
let classN = null, classLen = -1;
const classesOfList = () => { const st = store.state; if (classLen !== st.list.length) { classN = classCounts(st.list); classLen = st.list.length; } return classN; };
/* a switch of the filter bar, drawn from the filter's state */
const fSwitch = (act, name, words, on, ariaLabel) => switchCtl({ name, words, checked: on, ariaLabel, attrs: { 'data-act': act } });
function renderFilters() {
  const st = store.state, f = st.filter;
  // the control that has the focus, found again once the bar is drawn
  const a = document.activeElement, bar = $('filters');
  const had = a && bar.contains(a) ? (a.id ? `#${CSS.escape(a.id)}` : ['cls', 'clear', 'act', 'edge'].map((k) => (a.dataset[k] ? `[data-${k}="${CSS.escape(a.dataset[k])}"]` : '')).join('')) : '';
  const shown = st.filterActive ? st.list.filter(st.filterFn) : st.list, n = shown.length;
  const tokens = [];
  const token = (k, text) => { const b = el('button', 'token', `${text} \u00d7`); b.type = 'button'; b.dataset.clear = k; b.setAttribute('aria-label', `Clear the filter ${text}`); tokens.push(b); };
  if (f.year !== null) token('year', String(f.year));
  if (f.box) token('box', 'box');
  if (f.zone) token('zone', 'habitable zone');
  if (f.looks) token('looks', kindWords(f.looks));
  if (f.locked) token('locked', 'one face to its star');
  if (f.cold) token('cold', `cold: under ${COLD_K} K`);
  if (f.hot) token('hot', `hot: ${fmtInt(HOT_K)} K or more`);
  if (Object.keys(f.ranges).length) token('ranges', `${Object.keys(f.ranges).length} range${Object.keys(f.ranges).length > 1 ? 's' : ''}`);
  if (f.newOnly) token('newOnly', 'new');
  // the bands on the radius axis, then the row: all sizes, the method, ranges, the replay, the log's sets, the tokens
  bar.innerHTML = bandsHTML(f, classesOfList());
  const all = el('button', 'plain all-sizes', 'all sizes'); all.type = 'button'; all.dataset.cls = 'all'; all.setAttribute('aria-pressed', String(f.cls === 'all'));
  const sel = document.createElement('select'); sel.id = 'f-method'; sel.className = 'pick';
  sel.append(new Option('all methods', 'all'), ...METHOD_GROUPS.map((g) => new Option(g.label, g.key, false, f.method === g.key)));
  const selL = el('label', 'sr', 'Discovery method'); selL.htmlFor = 'f-method';
  const rg = el('button', 'plain', 'ranges'); rg.type = 'button'; rg.dataset.act = 'ranges'; rg.setAttribute('aria-expanded', String(!$('ranges').hidden));
  const row = el('div', 'f-row');
  row.append(all, selL, sel, rg, fSwitch('replay', 'replay', ['still', 'by year'], isNum(f.upTo), 'Replay the discoveries by year'));
  if (log && log.counts().saved) row.append(fSwitch('set-saved', 'show', ['all worlds', 'your log'], f.set === 'saved', 'Show only the worlds in your log'));
  if (log && log.shared().length) row.append(fSwitch('set-shared', 'show', ['all worlds', 'the shared log'], f.set === 'shared', 'Show only the worlds the link shared'));
  if (st.newNames.size) row.append(fSwitch('new', `${fmtInt(st.newNames.size)} new since your last visit`, ['all', 'only new'], f.newOnly, 'Show only the worlds new since your last visit'));
  row.append(...tokens);
  if (st.filterActive && n > 0) { const t = el('button', 'plain', 'tour these'); t.type = 'button'; t.dataset.act = 'tourthese'; row.append(t); }
  bar.append(row);
  document.querySelector('.f-count').textContent = `${fmtInt(n)} ${st.filterActive ? (n === 1 ? 'match' : 'matches') : 'planets'}`;
  // C's table: each class, in the catalogue and in what is shown
  const m = classCounts(shown);
  document.querySelector('#twin-c .twin-b').innerHTML = classTable(classesOfList(), m);
  chipsKey = chipsOf();
  if (had) { const back = bar.querySelector(had); if (back) back.focus(); }
}
function renderRanges() {
  const f = store.state.filter;
  if ($('ranges').hidden) return;
  $('ranges').innerHTML = `<div class="rg-head"><span>Ranges</span><span>an empty end is open</span></div>` +
    RANGE_FIELDS.map((r) => {
      const v = f.ranges[r.key] || [null, null];
      return `<div class="rg-row"><label for="rg-${r.key}-lo">${r.label}${r.unit ? ` <i>${r.unit}</i>` : ''}</label>
        <input id="rg-${r.key}-lo" data-rg="${r.key}" data-end="0" type="number" step="any" inputmode="decimal" placeholder="min" value="${v[0] ?? ''}">
        <input id="rg-${r.key}-hi" data-rg="${r.key}" data-end="1" type="number" step="any" inputmode="decimal" placeholder="max" value="${v[1] ?? ''}" aria-label="${r.label} max"></div>`;
    }).join('');
}
let replayT = 0;
function replay() {
  const st = store.state;
  if (isNum(st.filter.upTo)) { clearInterval(replayT); setFilter({ upTo: null }, { keep: true }); return; }
  const years = st.list.map((p) => p.year).filter(isNum);
  const y0 = Math.max(1995, Math.min(...years)), y1 = Math.max(...years);
  let y = y0;
  setFilter({ upTo: y }, { keep: true });
  clearInterval(replayT);
  replayT = setInterval(() => {
    y += 1;
    if (y > y1) { clearInterval(replayT); setTimeout(() => setFilter({ upTo: null }, { keep: true }), 1600); return; }
    setFilter({ upTo: y }, { keep: true });
  }, reducedMotion() ? 900 : 420);
}
function bindFilters() {
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const f = store.state.filter;
    if (b.dataset.cls) setFilter({ cls: b.dataset.cls });
    else if (b.dataset.clear) { const k = b.dataset.clear; setFilter({ [k]: k === 'ranges' ? {} : k === 'newOnly' ? false : null }); }
    else if (b.dataset.act === 'ranges') { $('ranges').hidden = !$('ranges').hidden; renderFilters(); renderRanges(); placeWorld(); }
    else if (b.dataset.act === 'replay') replay();
    else if (b.dataset.act === 'new') setFilter({ newOnly: !f.newOnly });
    else if (b.dataset.act === 'tourthese') tourFromFilter();
    else if (b.dataset.act === 'set-saved') setFilter({ set: f.set === 'saved' ? null : 'saved' });
    else if (b.dataset.act === 'set-shared') setFilter({ set: f.set === 'shared' ? null : 'shared' });
  });
  $('filters').addEventListener('change', (e) => { if (e.target.id === 'f-method') setFilter({ method: e.target.value }); });
  // the edges of the chosen band, dragged or moved by the keys, set the radius range
  bindEdges($('filters'), () => {
    const f = store.state.filter, R = f.ranges.R;
    if (f.cls !== 'all') { let lo = 0.5; for (const c of SIZE_CLASSES) { if (c.key === f.cls) return [lo, Math.min(c.max, 25)]; lo = c.max; } }
    return R ? [isNum(R[0]) ? R[0] : 0.5, isNum(R[1]) ? R[1] : 25] : [0.5, 25];
  }, (range) => setFilter({ cls: 'all', ranges: { ...store.state.filter.ranges, R: range } }));
  $('ranges').addEventListener('change', (e) => {
    const i = e.target.closest('[data-rg]'); if (!i) return;
    const k = i.dataset.rg, end = +i.dataset.end;
    const ranges = { ...store.state.filter.ranges };
    const cur = ranges[k] ? ranges[k].slice() : [null, null];
    cur[end] = i.value === '' ? null : +i.value;
    if (cur[0] === null && cur[1] === null) delete ranges[k]; else ranges[k] = cur;
    setFilter({ ranges });
  });
}

/* worlds confirmed since this browser's last visit (localStorage, this device only) */
function changelog(list) {
  const key = 'exo:seen:v1';
  let prev = null;
  try { prev = JSON.parse(store_(key) || 'null'); } catch (_) { prev = null; }
  const names = list.map((p) => p.name);
  if (prev && Array.isArray(prev.names)) {
    const seen = new Set(prev.names);
    store.state.newNames = new Set(names.filter((n) => !seen.has(n)));
  }
  store_(key, JSON.stringify({ date: isoDay(Date.now()), names }));
}

/* ---------------- search and questions ---------------- */
/* What the visitor has done since a question was asked: a filter changed, a world opened, something typed. A
   model's reply that arrives after any of these is set aside. (A list of results is never open while a model
   reads: a model is asked only when the page's own rules filtered nothing.) */
let filterRev = 0, selRev = 0, typeRev = 0;
const stamp = () => `${filterRev}:${selRev}:${typeRev}`;
const countWords = (n) => `${fmtInt(n)} ${n === 1 ? 'match' : 'matches'}`;
/* The note under the search field. It is a live region that is always in the page, and is not drawn while empty. */
const setNote = (text) => { $('q-note').textContent = text; };

let showHits = () => {};   // set by bindSearch
function bindSearch() {
  const q = $('q'), box = $('q-results');
  let items = [], cur = -1, head = '';
  let hitsFor = null, hitsOrder = null;              // the question whose results the list shows, and their order
  let shut = null;                                   // the question whose list the visitor closed with Escape
  const close = () => { box.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); cur = -1; };
  const render = () => {
    // the heading row is for the eye; the same words are in the note under the field, which is announced
    box.innerHTML = (head ? `<li role="presentation" aria-hidden="true" class="head">${esc(head)}</li>` : '') + items.map((it, i) => it.ask
      ? `<li role="option" id="qr-${i}" class="ask${i === cur ? ' on' : ''}" aria-selected="${i === cur}" data-i="${i}"><b>Ask the catalogue</b><span>${esc(it.ask)}</span></li>`
      : it.hit
      ? `<li role="option" id="qr-${i}" class="${i === cur ? 'on' : ''}" aria-selected="${i === cur}" data-i="${i}"><b>${esc(it.hit.name)}</b><span>${esc(it.fact)}</span></li>`
      : `<li role="option" id="qr-${i}" class="${i === cur ? 'on' : ''}" aria-selected="${i === cur}" data-i="${i}">
      <b>${esc(it.name)}</b><span>${[isNum(it.R) ? fmt(it.R, 3) + ' R⊕' : '', it.year ? 'found ' + it.year : ''].filter(Boolean).join(', ')}</span></li>`).join('');
    box.hidden = !items.length; q.setAttribute('aria-expanded', String(!!items.length));
    const row = cur >= 0 && items[cur] ? $('qr-' + cur) : null;
    if (row) { q.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
  };
  // After a question: its first matches, in its order, in the list the names appear in. Choosing one opens that
  // world and hands the listed worlds to the tour bar, which steps through them when asked. A question that
  // filtered nothing, or matched nothing, opens no list: the note under the field says what happened.
  showHits = (text) => {
    const st = store.state;
    const r = st.filter.query === text && shut !== text && (st.filterActive || st.querySort) ? rankedMatches(8) : null;
    if (!r || !r.hits.length) { if (hitsFor === text || !items.some((it) => !it.hit)) { items = []; head = ''; hitsFor = null; close(); } return; }
    items = r.hits.map((p) => ({ hit: p, fact: hitFact(p, r.sort.key) }));
    head = `${st.filterActive ? countWords(r.total) : `${fmtInt(r.total)} planets`}, ${orderWords(r)}${r.total > r.hits.length ? `, the first ${r.hits.length}` : ''}`;
    hitsFor = text; hitsOrder = r; cur = 0;
    render();
    box.scrollIntoView({ block: 'nearest' });        // on a phone the field sits low on the page: bring the whole list into view
  };
  // the worlds and stars whose names match what is typed: those that start with it first
  const named = (s) => {
    const starts = [], has = [];
    for (const p of store.state.list) {
      const nm = p.name.toLowerCase(), h = p.host.toLowerCase();
      if (nm.startsWith(s) || h.startsWith(s)) starts.push(p); else if (nm.includes(s) || h.includes(s)) has.push(p);
      if (starts.length > 40) break;
    }
    return [...starts, ...has].slice(0, 7);
  };
  const suggest = () => {
    const s = q.value.trim().toLowerCase();
    head = ''; hitsFor = null; shut = null;
    if (!s) { items = []; close(); return; }
    items = named(s);
    if (s.includes(' ') || !items.length) items.push({ ask: q.value.trim() });
    cur = 0; render();
  };
  q.addEventListener('input', () => {
    typeRev++;
    pauseTour();                                     // a tour that moves by itself would open a world under what is being typed
    suggest();
  });
  const choose = (it) => {
    if (it.ask) { items = []; head = ''; close(); shut = null; runQuestion(it.ask, true); return; }   // the field keeps the focus: the results open under it
    const hits = items.filter((x) => x.hit).map((x) => x.hit), order = hitsOrder;
    close();
    if (it.hit) tourOf(hits, hits.indexOf(it.hit), order, false);
    else { q.value = ''; select(it, { from: 'search' }); }   // a name that was chosen has done its work; a question stays while it filters
    $('ret-name').focus();                           // the focus goes to the name of the world that opened, where a screen reader reads it
  };
  q.addEventListener('keydown', (e) => {
    // Escape closes the list and nothing else. Without preventDefault a search field also empties itself, which
    // would leave a question's filter and note on screen with no question in the field.
    if (e.key === 'Escape') { e.preventDefault(); if (!box.hidden) { shut = hitsFor; close(); } return; }
    if (e.key === 'Enter' && e.repeat) return;        // a key held down asks once
    if (box.hidden) {
      const s = q.value.trim();
      if (e.key !== 'Enter' || !s) return;
      // one word that is the start of a name: the names come back, as when it was typed
      if (!s.includes(' ') && named(s.toLowerCase()).length) suggest(); else { shut = null; runQuestion(s, true); }
      return;
    }
    if (e.key === 'ArrowDown') { if (items.length) { cur = Math.min(items.length - 1, cur + 1); render(); } e.preventDefault(); }
    else if (e.key === 'ArrowUp') { if (items.length) { cur = Math.max(0, cur - 1); render(); } e.preventDefault(); }
    else if (e.key === 'Enter' && items[cur]) choose(items[cur]);
  });
  box.addEventListener('mousedown', (e) => {
    e.preventDefault();                                // a press anywhere in the list, its heading included, keeps the focus in the field
    const li = e.target.closest('li[data-i]');
    if (li) choose(items[+li.dataset.i]);
  });
  q.addEventListener('blur', () => setTimeout(close, 120));
}

let qCtrl = null, reading = null;                      // the model call in flight, and the question it is reading
async function runQuestion(text, useModel, show = true) {
  if (reading === text) return;                        // the same question is being read already: asking again sends nothing
  if (qCtrl) qCtrl.abort();
  qCtrl = null; reading = null;
  const det = parseQuestion(text);
  applyQuery(det, text, PAGE);
  if (show) showHits(text);
  // The rules read every word: their reading stands and no model is asked. A model is for what they left unread.
  if (!useModel || !needsModel(det)) return;
  const ctrl = qCtrl = new AbortController();
  reading = text;
  const base = $('q-note').textContent, mark = stamp();
  const mine = () => !ctrl.signal.aborted && store.state.filter.query === text;
  setNote(`${base} A model is reading it.`);
  try {
    const { q, res } = await askModel(text, ctrl.signal);
    if (ctrl.signal.aborted) return;
    // the visitor changed a filter, opened a world or typed since asking: the reply does not undo that
    if (stamp() !== mark) { if (mine()) setNote(`${base} A model's reading arrived after you had moved on, and was set aside.`); return; }
    if (!q) { setNote(`${base} ${res.source === 'offline' ? 'No model answered.' : 'The model\'s reply failed its checks.'}`); return; }
    applyQuery(q, text, `${res.model} (${res.source})`);
    // a reading that matches no world is no answer: the note goes back to what this page read
    if (!store.state.list.some(store.state.filterFn)) { applyQuery(det, text, PAGE); setNote(`${$('q-note').textContent} ${res.model}'s reading matched no planet and was set aside.`); }
    if (show && document.activeElement === $('q')) showHits(text);   // the field still has the focus: the answer opens under it
  } catch (e) {
    if (e.name !== 'AbortError' && mine()) setNote(`${base} The model call failed.`);
  } finally {
    if (qCtrl === ctrl) { qCtrl = null; reading = null; }
  }
}
/* A reading is applied when a model made it or when the page's rules read every word (query.js). Otherwise
   nothing is filtered, and the note says which words stopped it. Either way a question starts from the whole
   catalogue: the filters of an earlier question or of the chips do not carry over, a replay stops, and a tour
   of an earlier question's results ends. */
let lastRead = null;                                   // the reading the note was last written from, and the words it wrote
function applyQuery(r, text, by) {
  const st = store.state;
  clearInterval(replayT);
  if (st.tour && st.tour.key === 'custom') endTour();
  const use = by !== PAGE || r.complete;
  const patch = { ...emptyFilter(), query: text };
  if (use) Object.assign(patch, { ranges: { ...r.ranges }, zone: r.zone, looks: r.looks || null, locked: r.locked || null, cold: r.cold || null, hot: r.hot || null });
  if (use && r.method) patch.method = r.method;
  st.querySort = use ? r.sort : null;
  setFilter(patch, { asked: true });
  lastRead = { r, text, by, use, said: '' };
  setNote(lastRead.said = sayRead());
  if ($('ranges').hidden && use && Object.keys(r.ranges).length) { $('ranges').hidden = false; renderFilters(); renderRanges(); }
}
/* The note for the last reading, with the count and the order as they are on screen now. */
function sayRead() {
  const st = store.state, { r, text, by, use } = lastRead;
  const n = st.filterActive ? st.list.filter(st.filterFn).length : st.list.length;
  return say({ r, text, by, count: n, order: use ? orderWords(rankedMatches(1)) : sortWords(orderFor(r.sort, true)) });
}
/* The catalogue grew under a question (the weekly roster joined): its note is written again, when the note still
   holds the words this page wrote and nothing a model call added to them. */
function resay() {
  if (lastRead && store.state.filter.query === lastRead.text && $('q-note').textContent === lastRead.said) setNote(lastRead.said = sayRead());
}
/* The matches of the current filter in order (find.js rank): the order the question asked for; nearest first
   for a question that named none; most Earth-like first for the chips alone. */
const rankedMatches = (limit) => rank(store.state.list, store.state.filterFn, orderFor(store.state.querySort, !!store.state.filter.query), limit);
/* A tour of results. Its stops are the worlds given, in the order given, so a result opened from the list is
   the one that was listed. Opened from the list it waits for the visitor (auto false); started with "Tour
   these" it advances by itself as the other tours do. */
function tourOf(hits, i, r, auto) {
  const st = store.state;
  if (!hits.length) return;
  const among = st.filterActive ? countWords(r.total) : `${fmtInt(r.total)} planets`;
  const stops = hits.map((p) => ({ p, cap: `${hitFact(p, r.sort.key)}; ${orderWords(r)}, among ${among}.` }));
  st.tour = { key: 'custom', stops, i: Math.max(0, Math.min(i, stops.length - 1)), label: st.filter.query ? `“${st.filter.query}”` : 'Your filter', auto };
  showStop();
}
function tourFromFilter() { const r = rankedMatches(8); tourOf(r.hits, 0, r, true); }

/* ---------------- tours ---------------- */
let tourTimer = 0;
/* at: the stop the tour opens at (a tour link names it). */
function startTour(key, self = false, at = 0) {
  const stops = tourStops(key, store.state.list);
  if (!stops.length) return;
  store.state.tour = { key, stops, i: Math.max(0, Math.min(at, stops.length - 1)), label: TOURS.find((t) => t.key === key).label };
  showStop(self);
}
function pauseTour() {
  if (!store.state.tour) return;
  clearTimeout(tourTimer);
  $('tour-prog').classList.remove('run');
}
function showStop(self = false) {
  const t = store.state.tour; if (!t) return;
  const s = t.stops[t.i];
  select(s.p, { from: 'tour', keepTour: true, self });
  (t.seen || (t.seen = new Set())).add(t.i);
  $('tour-k').textContent = `${t.label}, stop ${t.i + 1} of ${t.stops.length}`;
  $('tour-cap').textContent = s.cap;
  $('tourbar').hidden = false;
  tours.sync(tourKeys, $('tour-keys'));
  writeURL();
  clearTimeout(tourTimer);
  const bar = $('tour-prog');
  bar.classList.remove('run'); void bar.offsetWidth;
  if (t.auto !== false && !reducedMotion() && !window.__EXO_STILL__) { bar.classList.add('run'); tourTimer = setTimeout(() => stepTour(1, true), 11000); }
}
function stepTour(d, self = false) {
  const t = store.state.tour; if (!t) return;
  t.i = (t.i + d + t.stops.length) % t.stops.length;
  showStop(self);
}
function endTour() {
  clearTimeout(tourTimer);
  store.state.tour = null;
  $('tourbar').hidden = true;
  tours && tours.sync(tourKeys, $('tour-keys'));
}

/* ---------------- compare ---------------- */
const EARTH = {
  name: 'Earth', host: 'Sun', idx: -1, R: 1, Rerr: 0, M: 1, Mprov: 'Mass', Mlim: 0, P: 365.25, a: 1, ecc: 0.0167, S: 1, Teq: 255,
  Teff: 5772, Rs: 1, Ms: 1, logL: 0, dist: null, method: null, year: null, refs: {}, measuredR: true,
  pl_name: 'Earth', hostname: 'Sun', pl_rade: 1, pl_masse: 1, pl_orbsmax: 1, pl_orbper: 365.25, pl_eqt: 255, st_teff: 5772, st_rad: 1, st_mass: 1, sy_dist: null,
};
const thumbs = new Map();
/* The bench as the log holds it (st.pins, set by syncLog). Its controls are off until the log is read. */
function openCompare() {
  const st = store.state, off = !log || !log.loaded();
  $('compare-body').innerHTML = compareHTML(st.pins, EARTH, st.albedo());
  document.querySelectorAll('#compare-body [data-unpin]').forEach((b) => { b.disabled = off; });
  $('cmp-clear').disabled = off;
  document.querySelectorAll('.cmp-thumb').forEach((el) => {
    const i = +el.dataset.i, p = i === 0 ? EARTH : st.pins[i - 1];
    // a thumbnail whose look is still being built comes back null and is asked for again from engine.onReady
    if (!thumbs.has(p.name) && glOk) { const t = engine.snapshot(toParams(p), 150); if (t) thumbs.set(p.name, t); }
    const c = thumbs.get(p.name);
    if (c) { const img = new Image(); img.alt = `${p.name}, rendered`; img.src = c.toDataURL(); el.appendChild(img); }
  });
  if (!$('compare').open) $('compare').showModal();
}

/* ---------------- camera, ground, bezel ---------------- */
function syncCamButtons() {
  const mode = glOk ? engine.camera.mode : 'orbit';
  setScale($('distance'), mode);
  $('sheet-a').dataset.view = mode;   // on the ground the sky is bright: the corners take a dark ground of their own
  const sel = store.state.sel;
  const giant = sel && classify(sel).klass >= 2;
  const sb = document.querySelector('[data-cam="surface"] .sc-w');
  if (sb) sb.textContent = giant ? 'into the clouds' : 'surface';
  $('ground').hidden = mode !== 'surface';
  if (mode === 'surface' && sel) renderGround(sel);
}
function renderGround(p) {
  const mc = monteCarlo(p, store.state.albedo());
  const sky = skyView(p);
  const cl = classify(p), locked = cl.locked;   // the rule the picture itself is drawn by
  $('ground-sites').innerHTML = locked
    ? `<span>Drawn with one face to its star (${fmt(cl.physics.a, 3)} AU, inside the ${fmt(lockRadiusAU(cl.physics.Mstar), 2)} AU lock radius). Land at</span> <button type="button" class="plain" data-elev="80">the point under the star</button><button type="button" class="plain" data-elev="0">the terminator</button><button type="button" class="plain" data-elev="-10">the night side</button>`
    : `<span>The time of day: move the star's elevation</span>`;
  const lt = (k) => `<span class="lt ${k}" aria-hidden="true"></span>`;
  const grav = mc.g ? `gravity ${fmt(mc.g.med, 2)} g` : mc.hasR ? 'gravity unknown' : 'gravity unknown: no radius measured';
  $('ground-read').innerHTML = `${lt(mc.massFrom === 'measured' ? 'd' : 'e')}${grav}, ${lt('d')}equilibrium ${mc.teq ? fmtInt(mc.teq.med) + ' K' : 'unknown'}, ${lt('d')}its star ${sky ? fmt(sky.angDeg, 2) + '\u00b0' : 'of unknown size'} wide (the Sun 0.53\u00b0)${locked ? `, ${lt('i')}lock radius at 4.5 Gyr` : ''}, ${lt('i')}the terrain`;
}
function setCam(mode) {
  if (!glOk) return;
  if (mode === 'surface') engine.surface(true);
  else engine.setCamera({ mode });
  syncCamButtons(); writeURL(); placeWorld();
}
function bezel() {
  if (!glOk) return;
  const c = engine.camera, mode = c.mode;
  const fovDeg = Math.round(2 * Math.atan(0.5 / (mode === 'surface' ? 1.0 : mode === 'closeorbit' ? 1.25 : c.fov)) * 180 / Math.PI);
  $('bezel').textContent = mode === 'surface'
    ? `on the surface, the star ${Math.round(c.sunElev)}\u00b0 up, looking ${Math.round((c.lookYaw * 180 / Math.PI) % 360)}\u00b0, field ${fovDeg}\u00b0`
    : `${mode === 'closeorbit' ? 'low pass' : 'orbit'}, ${fmt(mode === 'closeorbit' ? c.closeR : c.dist, 3)} planet radii from its centre, field ${fovDeg}\u00b0, ray-traced now`;
}

function randomWorld() {
  const st = store.state;
  const pool = st.filterActive ? st.list.filter(st.filterFn) : st.list.filter((p) => p.measuredR);
  if (pool.length) { select(pool[Math.floor(Math.random() * pool.length)], { from: 'random' }); return; }
  // nothing matches the filter: say so where the search speaks, once
  const none = 'No world matches the filter, so there is none to open.';
  if (!$('q-note').textContent.endsWith(none)) setNote(`${$('q-note').textContent} ${none}`.trim());
}

/* ---------------- footer: data, mechanism, performance ---------------- */
let methodData = null;
function renderMethod(extra = {}) {
  methodData = { ...methodData, ...extra };
  $('method-body').innerHTML = methodHTML(methodData);
}
function perfLine() {
  const s = engine.stats || {};
  const tier = engine.tier === 'software' ? 'software GL, drawn on demand' : engine.tier === 'still' ? 'a still frame' : `${s.fps ? s.fps + ' frames a second' : 'GPU'}, scale ${(engine.camera.resScale || 0).toFixed(2)}`;
  $('perf').textContent = glOk ? `${engine.buffer}, ${tier}` : 'WebGL unavailable';
  $('perf').title = glOk ? `Renderer: ${engine.renderer}` : '';
}

/* ---------------- keyboard ---------------- */
/* The keys the keycaps show: R another world, / the finder, H the instruments, the arrows a tour's stops, Esc the end of
   a tour. None of them acts while a field has the focus (they are letters there), or while a dialog is open; the
   arrows belong to a control that takes them itself (a scale, the diagrams, a band's edge, a canvas). */
function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    const typing = /INPUT|SELECT|TEXTAREA/.test(a?.tagName || '') || !!a?.isContentEditable;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === '/' && !typing) { e.preventDefault(); $('q').focus(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const ownsArrows = !!a && (a.tagName === 'CANVAS' || !!a.closest('[role="radiogroup"], [role="tablist"], [role="slider"]'));
    if (e.key === 'r' || e.key === 'R') randomWorld();
    else if (e.key === 'h' || e.key === 'H') toggleClean();
    else if (store.state.tour && e.key === 'ArrowRight' && !ownsArrows) { e.preventDefault(); stepTour(1); }
    else if (store.state.tour && e.key === 'ArrowLeft' && !ownsArrows) { e.preventDefault(); stepTour(-1); }
    else if (e.key === 'Escape' && store.state.tour) endTour();
  });
}
/* the world alone: everything but the planet and this switch leaves, and comes back */
function toggleClean(on = !document.body.classList.contains('clean')) {
  document.body.classList.toggle('clean', on);
  setSwitch($('btn-clean'), on);
}

/* The route pill. On a page served from this machine, llm.js probes the local Ollama when the
   pill mounts; if that server hangs, the probe stays pending, and a headless capture under
   virtual time (which pauses while a fetch is pending) never finishes. So on localhost the
   pill mounts on the first touch, key or model request; on the public site, at once. */
function mountRouteWhenSafe() {
  const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  if (!local) { mountRoutePanel($('route')); return; }
  $('route').innerHTML = '<span class="route-wait" title="On this machine the model route is found the first time you touch the page"><i class="lamp-i" aria-hidden="true"></i>model: found on first use</span>';
  const go = () => {
    ['pointerdown', 'keydown'].forEach((t) => removeEventListener(t, go, true));
    $('route').innerHTML = ''; mountRoutePanel($('route'));
  };
  ['pointerdown', 'keydown'].forEach((t) => addEventListener(t, go, true));
}

/* ---------------- boot ---------------- */
function veil(text, frac) {
  $('veil-status').textContent = text;
  if (frac !== undefined) $('veil-fill').style.transform = `scaleX(${frac})`;
}

/* ---------------- the controls of the sheets, built once ---------------- */
let tourKeys = null;
function buildControls() {
  // the finder's key, and the key for another world
  const field = document.querySelector('.finder .field'), hint = keyHint('/');
  field.insertBefore(hint, $('q-results'));
  hint.addEventListener('click', () => $('q').focus());
  $('finder-acts').append(keycap('R', 'another world', { id: 'btn-random', ariaLabel: 'Another world' }));
  // sheet A's key: the distance scale, two switches, and on the ground the star's elevation
  const dist = scale({ name: 'distance', id: 'distance', ariaLabel: 'Camera distance', value: 'orbit',
    options: [{ value: 'orbit', label: 'orbit', attrs: { 'data-cam': 'orbit' } }, { value: 'closeorbit', label: 'low pass', attrs: { 'data-cam': 'closeorbit' } }, { value: 'surface', label: 'surface', attrs: { 'data-cam': 'surface' } }] });
  const sws = el('div', 'sws');
  const plain = switchCtl({ name: 'clouds', words: ['seeded', 'off'], id: 'btn-plain', ariaLabel: 'Clouds off: the data only' });
  plain.title = 'The clouds\' pattern is seeded by the name; so are continents, craters and bands.';
  const clean = switchCtl({ name: 'instruments', words: ['shown', 'hidden'], id: 'btn-clean', ariaLabel: 'Instruments hidden' });
  clean.setAttribute('aria-keyshortcuts', 'H');
  sws.append(plain, clean);
  const ground = el('div', 'ground'); ground.id = 'ground'; ground.hidden = true;
  ground.innerHTML = `<div class="ground-row"><label for="sun-elev">star elevation</label><input id="sun-elev" class="engraved" type="range" min="-10" max="80" step="1" value="14" /><span class="rv" id="sun-elev-v">14\u00b0</span></div>
    <p class="ground-sites" id="ground-sites"></p><p class="ground-read" id="ground-read"></p>`;
  $('key').append(dist, sws, ground);
  // the title block, its cells written when the catalogue is in
  $('tblock').innerHTML = `<div class="tb-h"><span>Sheet A, the planet</span><span>1 of 5</span></div>
    <div class="tb-c tb-cat"><span class="tb-k">catalogue</span><span class="tb-v" id="tb-cat">loading</span></div>
    <div class="tb-c"><span class="tb-k">render</span><span class="tb-v">illustrative</span></div>
    <div class="tb-c"><span class="tb-k">planets</span><span class="tb-v" id="tb-n">loading</span></div>
    <div class="tb-c"><span class="tb-k">take it</span><span class="tb-v take"><button type="button" class="plain" data-act="plate" title="Save this sheet as a PNG">PNG</button><button type="button" class="plain" data-act="csv" title="The filtered catalogue, with this page's inferences, as CSV">CSV</button><button type="button" class="plain" data-act="link" title="Copy a link to this exact view">link</button></span></div>`;
  $('tblock').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) actions.exportAs(b.dataset.act, b); });
  // B's label row: how each was inferred
  document.querySelector('#sheet-b .lab [data-act="chain"]').addEventListener('click', (e) => actions.exportAs('chain', e.currentTarget));
  // the tour's keys: back, on, end
  tourKeys = el('span', 'tour-keyset');
  tourKeys.append(keycap('\u2190', '', { id: 'tour-prev', ariaLabel: 'Previous stop' }), keycap('\u2192', '', { id: 'tour-next', ariaLabel: 'Next stop' }), keycap('Esc', 'end', { id: 'tour-end', ariaLabel: 'End the tour', attrs: { 'aria-keyshortcuts': 'Escape' } }));
  $('tour-keys').append(tourKeys);
  // each dialog closes with Esc, and says so on its key
  for (const slot of document.querySelectorAll('[data-close-slot]')) {
    const id = slot.dataset.closeSlot;
    slot.append(keycap('Esc', 'close', { id: id === 'method' ? 'method-close' : undefined, attrs: id === 'method' ? { 'aria-keyshortcuts': 'Escape' } : { 'data-close': id, 'aria-keyshortcuts': 'Escape' } }));
  }
}

async function boot() {
  buildControls();
  rebuildFilter();
  target = createTarget($('col-l'), store, actions);
  store.state.albedo = target.albedo;
  report = createReport($('report'), store, actions);
  plot = createPlot($('v-plot'), store, actions);
  system = createSystem($('v-sys'), store, actions);
  transit = createTransit($('v-tr'), store);
  tours = createTours($('tours'), store, actions);
  mountRouteWhenSafe();
  // the note under the finder (#q-note) is in the page from the start and empty, so that its first words are announced
  bindFilters(); bindSearch(); bindKeys();
  bindScale($('distance'), (mode) => setCam(mode));
  $('btn-random').addEventListener('click', randomWorld);
  $('btn-clean').addEventListener('click', () => toggleClean(!document.body.classList.contains('clean')));
  bindSwitch($('btn-plain'), (off) => {
    const st = store.state; st.plain = off;
    if (st.sel && glOk) { const prm = paramsFor(st.sel); engine.setLayers({ cloud: prm.cloud, life: prm.life }); }
  });
  $('sun-elev').addEventListener('input', (e) => { engine.setCamera({ sunElev: +e.target.value }); $('sun-elev-v').textContent = `${e.target.value}°`; });
  $('ground-sites').addEventListener('click', (e) => {
    const b = e.target.closest('[data-elev]'); if (!b) return;
    engine.setCamera({ sunElev: +b.dataset.elev }); $('sun-elev').value = b.dataset.elev; $('sun-elev-v').textContent = `${b.dataset.elev}°`;
  });
  $('tour-prev').addEventListener('click', () => stepTour(-1));
  $('tour-next').addEventListener('click', () => stepTour(1));
  $('tour-end').addEventListener('click', endTour);
  $('btn-method').addEventListener('click', () => $('method').showModal());
  $('method-close').addEventListener('click', () => $('method').close());
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $(b.dataset.close).close()));
  $('compare').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unpin]'); if (!b || !log) return;
    log.unpin(b.dataset.unpin, () => openCompare());
  });
  $('cmp-clear').addEventListener('click', () => { if (log) log.clearPins(() => openCompare()); });
  engine.onCamera = () => writeURL();
  engine.onMode = () => syncCamButtons();
  engine.onReady = () => { if ($('compare').open) openCompare(); };
  document.addEventListener('visibilitychange', () => engine.setVisible && engine.setVisible(!document.hidden));
  if (typeof IntersectionObserver === 'function') new IntersectionObserver((es) => engine.setVisible && engine.setVisible(es[0].isIntersecting && !document.hidden)).observe($('exo-stage'));
  window.addEventListener('resize', () => { placeWorld(); });
  if (typeof ResizeObserver === 'function') {
    let t = 0;
    // the canvas follows sheet A's size (not the window's), and the world its free middle
    const ro = new ResizeObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(() => { if (glOk) engine.resize(); placeWorld(); const s = store.state.sel; if (s && desktop()) drawInset($('inset'), s, s ? store.state.system : []); if (store.state.list.length) drawHist($('bands-cv'), store.state.list); }); });
    ['exo-stage', 'ul', 'key', 'tblock', 'bands'].forEach((id) => ro.observe($(id)));
  }
  placeWorld();

  veil('Contacting the NASA Exoplanet Archive snapshot', 0.02);
  let snap;
  try {
    snap = await loadSnapshot((got, total) => veil(`Receiving ${(got / 1048576).toFixed(2)} MB of the catalogue`, total ? got / total : Math.min(0.9, got / 1300000)));
  } catch (e) {
    console.error('[exomania] snapshot failed', e);
    veil('The catalogue did not load. Check the connection and reload.', 0);
    $('veil').classList.add('fail');
    return;
  }
  const st = store.state;
  st.list = snap.list;
  provisionalMeasured(st.list);
  st.byName = new Map(st.list.map((p) => [p.name, p]));
  veil(`Charted ${fmtInt(st.list.length)} worlds`, 1);

  log = createLog({
    host: { line: $('log-line'), dialog: $('log'), body: $('log-body'), said: $('log-said') }, byName: st.byName, sharedParam: params.get('log'), fixture: params.get('os-fixture'),
    open: (p, view) => { select(p, { from: 'log' }); if (glOk && view && view !== 'orbit') setCam(view); },
    onChange: syncLog,
  });
  const sharedWorlds = log.shared().map((n) => st.byName.get(n));
  const want = params.get('p') && st.byName.get(params.get('p'));
  // A tour's address names the stop it was at. That stop is the world the link opens, and the tour opens there; a
  // world that is no stop of the tour is not opened, so no visit is written to a world the page does not show.
  const tourKey = params.get('tour');
  const linkTour = tourKey && TOURS.some((t) => t.key === tourKey) ? tourStops(tourKey, st.list) : [];
  const tourAt = want ? linkTour.findIndex((s) => s.p === want) : -1;
  const linked = want && (!linkTour.length || tourAt >= 0) ? want : null;
  const first = linked || sharedWorlds[0] || LANDMARKS.map((n) => st.byName.get(n)).find(Boolean) || st.list[0];
  renderFilters();
  const arrived = ((performance.getEntriesByType('navigation')[0] || {}).type || 'navigate') === 'navigate';
  select(first, { from: linked ? 'link' : 'boot', self: !(linked && arrived) });
  // a link that carries a log: its worlds are the ones shown, and the note says where they are listed
  if (sharedWorlds.length) {
    setFilter({ set: 'shared' }, { keep: true });
    setNote(`This link carries a log of ${fmtInt(sharedWorlds.length)} ${sharedWorlds.length === 1 ? 'world' : 'worlds'}. They are the ones on the diagram now, and the log lists them under “Shared with you”.`);
  }
  const view = params.get('view');
  if (glOk && (view === 'surface' || view === 'closeorbit')) setCam(view);
  const cam = (params.get('cam') || '').split(',').map(Number);
  if (glOk && cam.length === 3 && cam.every(Number.isFinite)) engine.setCamera({ yaw: cam[0], pitch: cam[1], dist: cam[2] * (engine.camera.homeDist || 5) });
  // a shared question replays with the page's own rules: it goes back into the field, no model is called and no list opens on load
  if (params.get('q')) { $('q').value = params.get('q'); runQuestion(params.get('q'), false, false); }

  renderMethod({ meta: snap.meta, val: validateAgainstArchive(st.list), valley: valleyHistogram(st.list), transit: transitValidation(st.list), teq: teqValidation(st.list), hold: withholdingTest(st.list), rosterNote: 'The weekly roster is joining in the background.' });
  const retrieved = day(fromIso(snap.meta.retrieved), snap.meta.retrieved);
  $('tb-cat').textContent = `NASA archive, ${retrieved}`;
  $('tb-n').textContent = fmtInt(st.list.length);
  drawHist($('bands-cv'), st.list);
  tours.setCounts(Object.fromEntries(TOURS.map((t) => [t.key, tourStops(t.key, st.list).length])));

  // ignition: the world arrives from deep space, the instruments assemble around it
  if (glOk) { engine.start(); if (!cam.every(Number.isFinite) || cam.length !== 3) engine.arrive(); }
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    $('veil').classList.add('gone');
  });
  if (linkTour.length) startTour(tourKey, true, Math.max(0, tourAt));   // the link started it, the visitor did not

  setInterval(perfLine, 2000); perfLine();
  setInterval(bezel, 300); bezel();
  // the five thumbnails of sheet C, the page's heaviest drawing, once the page is idle and no shader is being built
  whenQuiet(() => { const building = glOk ? engine.building() : false; plot.drawThumbs(); window.__exoThumbs = { at: Math.round(performance.now()), building, idle: true }; });

  try {
    const { added, rosterCount } = await joinRoster(st.list);
    for (const p of added) st.byName.set(p.name, p);
    plot.resetStats(); plot.redraw();
    const note = `The weekly roster (${DATA.rosterLabel}) lists ${fmtInt(rosterCount)} planets with a measured radius${added.length ? ` and added ${fmtInt(added.length)} confirmed after the snapshot` : '; none are newer than the snapshot'}.`;
    renderMethod({ val: validateAgainstArchive(st.list), valley: valleyHistogram(st.list), rosterNote: note });
    $('tb-n').textContent = `${fmtInt(st.list.length)}, ${fmtInt(rosterCount)} with a radius`;
    tours.setCounts(Object.fromEntries(TOURS.map((t) => [t.key, tourStops(t.key, st.list).length])));
    drawHist($('bands-cv'), st.list);
    if (st.sel) target.update(st.sel);
  } catch (e) {
    console.warn('[exomania] weekly roster unavailable; radius provenance is provisional', e.message);
  }
  changelog(st.list);
  renderFilters();
  resay();
  if (log) log.reread();
}

/* Run fn when the page is idle and the renderer is not building a program: a page that holds its thread while a
   shader is built breaks what runs under it (Labs OS gave up on its store once, 2026-11-15). */
function whenQuiet(fn) {
  const idle = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 8000 }) : (f) => setTimeout(f, 300);
  const go = () => { if (glOk && engine.building()) { setTimeout(go, 500); return; } idle(() => { if (glOk && engine.building()) { setTimeout(go, 500); return; } fn(); }); };
  go();
}

boot();
