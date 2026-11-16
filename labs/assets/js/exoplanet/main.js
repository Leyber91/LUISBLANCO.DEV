/* ============================================================
   exoplanet/main.js — entry for exomania.html. Owns the state
   (selection, diagram, filters, query, tour, pins), wires the
   renderer and the linked views to it, keeps the URL in step,
   and runs the opening.

   Load order: the PSCompPars snapshot paints the page; the weekly
   roster joins in the background and marks measured radii.
   ============================================================ */

import { Exoplanet } from './exoplanet.js';
import { toParams, classify, lockRadiusAU, LOOKS } from './data.js';
import { airParts, airShort, SCENARIOS, SCENARIO_LABEL } from './air.js';
import { loadSnapshot, joinRoster, provisionalMeasured } from './catalog.js';
import { LANDMARKS, PLOTS, SIZE_CLASSES, METHOD_GROUPS, TOURS, DATA, PHYS } from './config.js';
import {
  sizeClass, sizeClassOf, hzPosition, validateAgainstArchive, valleyHistogram, transitValidation, teqValidation, withholdingTest,
  insolation, monteCarlo, skyView, starColour, isNum,
} from './science.js';
import { createPlot, plotValue } from './views/plot.js';
import { createSystem } from './views/system.js';
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
    // a scenario of the selected world's air the visitor chose (air.js); null draws the survey's own. A link may carry one.
    air: SCENARIOS.includes(params.get('air')) ? params.get('air') : null,
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
// The page opens on LANDMARKS[0], a temperate world, unless a link names another: start building that
// look's shader now, while the catalogue loads, instead of after it.
if (glOk && !new URLSearchParams(location.search).get('p')) engine.prepare(LOOKS.temperate);
/* Low-power tier: on a software rasteriser every composited frame is expensive (backdrop blur
   over the canvas costs about 0.3 s a frame in SwiftShader), so the 2D views draw on demand
   and the glass panels drop their blur. Measured 2026-11-11. */
window.__EXO_LOWPOWER__ = !!engine.software;
if (engine.software) document.documentElement.classList.add('tier-software');
const desktop = () => window.matchMedia('(min-width: 1101px)').matches;
/* Fit the world to the free region between the instruments: centre it there (a
   principal-point shift) and choose the camera distance that makes it fill that region. */
function placeWorld() {
  const cv = canvas.getBoundingClientRect();
  if (!cv.height) return;
  let left, right, top, bottom;
  if (desktop()) {
    left = $('col-l').getBoundingClientRect().right; right = $('col-r').getBoundingClientRect().left;
    top = document.querySelector('.reticle').getBoundingClientRect().bottom + 2;
    bottom = document.querySelector('.cam').getBoundingClientRect().top - 6;
  } else {
    left = cv.left; right = cv.right;
    top = cv.top + 64; bottom = document.querySelector('.cam').getBoundingClientRect().top - 6;
  }
  const cx = (left + right) / 2 - cv.left, cy = (top + bottom) / 2 - cv.top;
  const r = Math.max(60, Math.min((bottom - top) / 2, (right - left) / 2 * 0.9));
  const rho = r / cv.height, fov = engine.camera.fov || 1.5;
  const home = Math.min(14, Math.max(2.2, 1 / Math.sin(Math.atan(rho / fov))));
  engine.frame([cx - cv.width / 2, cv.height / 2 - cy], home);
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
    b.classList.toggle('on', on);
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
    else if (kind === 'chain') { $('chain-body').innerHTML = chainHTML(st.sel, st.albedo(), st.air); $('chain').showModal(); }
    else if (kind === 'pin' && log) log.pin(st.sel.name, (w) => { openCompare(); flash(btn, w.ok ? `${st.pins.length} pinned` : 'Not pinned'); });
    else if (kind === 'log' && log) log.toggle(st.sel, glOk ? engine.camera.mode : 'orbit', (text, ok) => target.say(text, ok));
  },
};
function flash(btn, text) { if (!btn) return; const t = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = t; }, 1600); }

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
  const prm = toParams(p, { air: store.state.air });
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
  if (prev && prev !== p) st.air = null;   // a chosen scenario belongs to the world it was chosen on
  st.system = st.list.filter((q) => q.host === p.host).sort((a, b) => (a.a ?? a.P ?? 0) - (b.a ?? b.P ?? 0));
  const apply = () => {
    setReticle(p); placeWorld();
    const ret = document.querySelector('.reticle');
    ret.classList.remove('acq'); void ret.offsetWidth; ret.classList.add('acq');
    canvas.classList.remove('swap'); void canvas.offsetWidth; canvas.classList.add('swap');
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

let reticleHeld = null;   // the world whose line holds a scenario back until its look is built (engine.onReady redraws it)
let reticleOpen = null;   // the world whose scenarios and sources are open under its name
function setReticle(p) {
  reticleHeld = null;
  $('ret-name').textContent = p.name;
  const hz = hzPosition(p);
  const hzShort = { cons: 'conservative habitable zone', opt: 'optimistic habitable zone', hot: 'hotter than the habitable zone', cold: 'colder than the habitable zone', unknown: 'zone unknown' }[hz.key];
  const sc = sizeClassOf(p);
  $('ret-class').textContent = `${sc ? sc.label + (sc.fromLimit ? ' by its radius bound' : '') : 'no radius measured'} · ${hzShort}`;
  const cl = classify(p, { air: store.state.air });
  const r = $('ret-render');
  r.textContent = `procedural surface: ${cl.label.replace(/ · habitable zone/i, '').toLowerCase()}${cl.physics.radiusKnown ? '' : ' [illustrative size]'}`;
  if (!cl.air) return;
  // The line under the name (air.js): a short account that stays within two lines on a phone (airShort), then the
  // scenarios and their sources in a disclosure (airParts). A scenario that can be drawn instead is a link where the
  // renderer can draw it without building a program on the page's thread: a browser that builds in the background,
  // or a look already built. The link names the world it was offered for.
  const line = document.createElement('span');
  line.className = 'ret-air';
  line.textContent = airShort(cl.air, cl.airKey);
  const more = document.createElement('details');
  more.className = 'ret-more';
  more.open = reticleOpen === p.name;     // a switch made inside it keeps it open
  more.addEventListener('toggle', () => { reticleOpen = more.open ? p.name : null; });
  const summary = document.createElement('summary');
  summary.textContent = 'scenarios and sources';
  const body = document.createElement('span');
  body.className = 'ret-more-body';
  let held = 0;
  for (const part of airParts(cl.air, cl.airKey)) {
    if (!part.air) { body.append(part.t); continue; }
    if (glOk && !engine.canDraw(classify(p, { air: part.air }).type)) { held++; body.append(part.t); continue; }
    const a = document.createElement('a');
    a.href = `?${new URLSearchParams({ p: p.name, air: part.air })}`;
    a.dataset.air = part.air;
    a.dataset.world = p.name;
    a.title = `Draw ${p.name} ${part.air === 'bare' ? 'as bare rock' : `with ${SCENARIO_LABEL[part.air]}`}`;
    a.textContent = part.t;
    body.append(a);
  }
  if (held) { reticleHeld = p; body.append(` ${held === 1 ? 'One scenario is' : 'Some scenarios are'} not a link here: this browser would build its look on the page's thread.`); }
  body.append(' ');
  const how = document.createElement('a');
  how.href = `exomania-air.html#${cl.air.observed ? 'observed' : 'fit'}`;
  how.textContent = 'How the survey decides';
  body.append(how);
  more.append(summary, body);
  r.append(' ', line, more);   // the space keeps the two lines apart when the text is read as one
}
/* Draw the selected world in another scenario of its air, in place. A scenario of the same look changes numbers on
   the program already built; another look builds that look's program, in the background where the browser can. */
function setAir(key, world) {
  const st = store.state;
  if (!st.sel || !SCENARIOS.includes(key) || (world !== undefined && world !== st.sel.name)) return;   // offered for another world
  st.air = key === classify(st.sel).airKey ? null : key;
  if (glOk) engine.restyle(paramsFor(st.sel));
  setReticle(st.sel);
  const back = document.querySelector('#ret-render [data-air]');
  if (back) back.focus({ preventScroll: true });
  writeURL();
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
    if (st.air && classify(st.sel, { air: st.air }).airKey === st.air) u.set('air', st.air);
    if (log && log.shared().length) u.set('log', log.shared().join('|'));
    if (params.get('os-fixture')) u.set('os-fixture', params.get('os-fixture'));
    if (window.__EXO_STILL__) u.set('still', '');
    history.replaceState(null, '', '?' + u.toString().replace(/=(&|$)/, '$1'));
  }, 120);
}

/* ---------------- filters, ranges, replay, changelog ---------------- */
function renderFilters() {
  const st = store.state, f = st.filter;
  // the control that has the focus, found again once the bar is drawn
  const a = document.activeElement, bar = $('filters');
  const had = a && bar.contains(a) ? (a.id ? `#${CSS.escape(a.id)}` : ['cls', 'clear', 'act'].map((k) => (a.dataset[k] ? `[data-${k}="${CSS.escape(a.dataset[k])}"]` : '')).join('')) : '';
  const n = st.filterActive ? st.list.filter(st.filterFn).length : st.list.length;
  const chips = [];
  if (f.year !== null) chips.push(`<button type="button" class="chip on" data-clear="year">${f.year} ×</button>`);
  if (f.box) chips.push(`<button type="button" class="chip on" data-clear="box">box ×</button>`);
  if (f.zone) chips.push(`<button type="button" class="chip on" data-clear="zone">habitable zone ×</button>`);
  if (f.looks) chips.push(`<button type="button" class="chip on" data-clear="looks">${esc(kindWords(f.looks))} ×</button>`);
  if (f.locked) chips.push(`<button type="button" class="chip on" data-clear="locked">one face to its star ×</button>`);
  if (f.cold) chips.push(`<button type="button" class="chip on" data-clear="cold">cold: under ${COLD_K} K ×</button>`);
  if (f.hot) chips.push(`<button type="button" class="chip on" data-clear="hot">hot: ${fmtInt(HOT_K)} K or more ×</button>`);
  if (Object.keys(f.ranges).length) chips.push(`<button type="button" class="chip on" data-clear="ranges">${Object.keys(f.ranges).length} range${Object.keys(f.ranges).length > 1 ? 's' : ''} ×</button>`);
  if (f.newOnly) chips.push(`<button type="button" class="chip on" data-clear="newOnly">new ×</button>`);
  const newChip = st.newNames.size ? `<button type="button" class="chip${f.newOnly ? ' on' : ''}" data-act="new">${fmtInt(st.newNames.size)} new since your last visit</button>` : '';
  $('filters').innerHTML = `
    <span class="view-k">Filter</span>
    ${['all', ...SIZE_CLASSES.map((c) => c.key)].map((k) => `<button type="button" class="chip${f.cls === k ? ' on' : ''}" data-cls="${k}">${k === 'all' ? 'All' : SIZE_CLASSES.find((c) => c.key === k).label}</button>`).join('')}
    <label class="sel"><span class="sr">Discovery method</span><select id="f-method">
      <option value="all">All methods</option>${METHOD_GROUPS.map((g) => `<option value="${g.key}"${f.method === g.key ? ' selected' : ''}>${g.label}</option>`).join('')}
    </select></label>
    <button type="button" class="chip${$('ranges').hidden ? '' : ' on'}" data-act="ranges" aria-expanded="${!$('ranges').hidden}">Ranges</button>
    <button type="button" class="chip${isNum(f.upTo) ? ' on' : ''}" data-act="replay">${isNum(f.upTo) ? 'Stop replay' : 'Replay discoveries'}</button>
    ${log && log.counts().saved ? `<button type="button" class="chip${f.set === 'saved' ? ' on' : ''}" data-act="set-saved" aria-pressed="${f.set === 'saved'}" title="Show only the worlds in your log">Your log</button>` : ''}
    ${log && log.shared().length ? `<button type="button" class="chip${f.set === 'shared' ? ' on' : ''}" data-act="set-shared" aria-pressed="${f.set === 'shared'}" title="Show only the worlds the link shared">Shared log</button>` : ''}
    ${chips.join('')}${newChip}
    ${st.filterActive && n > 0 ? `<button type="button" class="chip" data-act="tourthese">Tour these</button>` : ''}
    <span class="f-count">${fmtInt(n)} ${st.filterActive ? (n === 1 ? 'match' : 'matches') : 'planets'}</span>`;
  chipsKey = chipsOf();
  if (had) { const back = bar.querySelector(had); if (back) back.focus(); }
}
function renderRanges() {
  const f = store.state.filter;
  if ($('ranges').hidden) return;
  $('ranges').innerHTML = `<div class="rg-head"><span class="view-k">Ranges</span><span class="dim">empty = open end</span></div>` +
    RANGE_FIELDS.map((r) => {
      const v = f.ranges[r.key] || [null, null];
      return `<div class="rg-row"><label class="tp-k" for="rg-${r.key}-lo">${r.label}${r.unit ? ` <i>${r.unit}</i>` : ''}</label>
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
  store_(key, JSON.stringify({ date: new Date().toISOString().slice(0, 10), names }));
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
      <b>${esc(it.name)}</b><span>${isNum(it.R) ? fmt(it.R, 3) + ' R⊕' : ''}${it.year ? ' · ' + it.year : ''}</span></li>`).join('');
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
    head = `${st.filterActive ? countWords(r.total) : `${fmtInt(r.total)} planets`} · ${orderWords(r)}${r.total > r.hits.length ? ` · the first ${r.hits.length}` : ''}`;
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
  const stops = hits.map((p) => ({ p, cap: `${hitFact(p, r.sort.key)} · ${orderWords(r)}, among ${among}.` }));
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
  $('tour-k').textContent = `Tour · ${t.label} · ${t.i + 1} of ${t.stops.length}`;
  $('tour-cap').textContent = s.cap;
  $('tourbar').hidden = false;
  tours.sync();
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
  tours && tours.sync();
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
  document.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
  const sel = store.state.sel;
  const giant = sel && classify(sel).klass >= 2;
  const sb = document.querySelector('[data-cam="surface"]');
  if (sb) sb.textContent = giant ? 'Into the clouds' : 'Surface';
  $('ground').hidden = mode !== 'surface';
  if (mode === 'surface' && sel) renderGround(sel);
}
function renderGround(p) {
  const mc = monteCarlo(p, store.state.albedo());
  const sky = skyView(p);
  const cl = classify(p), locked = cl.locked;   // the rule the picture itself is drawn by
  $('ground-sites').innerHTML = locked
    ? `<span class="view-k">Drawn tidally locked (${fmt(cl.physics.a, 3)} AU, inside the ${fmt(lockRadiusAU(cl.physics.Mstar), 2)} AU lock radius): land at</span> <button type="button" class="chip" data-elev="80">substellar point</button><button type="button" class="chip" data-elev="0">terminator</button><button type="button" class="chip" data-elev="-10">night side</button>`
    : `<span class="view-k">Time of day: drag the star's elevation</span>`;
  const grav = mc.g ? `gravity ${fmt(mc.g.med, 2)} g` : mc.hasR ? 'gravity —' : 'gravity unknown: no radius measured';
  $('ground-read').innerHTML = `<b class="tg tg-${mc.massFrom === 'measured' ? 'd' : 'e'}">${mc.massFrom === 'measured' ? 'D' : 'E'}</b> ${grav} · <b class="tg tg-d">D</b> Teq ${mc.teq ? fmtInt(mc.teq.med) : '—'} K · <b class="tg tg-d">D</b> star ${sky ? fmt(sky.angDeg, 2) : '—'}° wide (Sun 0.53°)${locked ? ' · <b class="tg tg-i">I</b> lock radius at 4.5 Gyr' : ''} · <b class="tg tg-i">I</b> terrain`;
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
    ? `SURFACE · STAR ${Math.round(c.sunElev)}° UP · LOOK ${Math.round((c.lookYaw * 180 / Math.PI) % 360)}° · FOV ${fovDeg}°`
    : `${mode === 'closeorbit' ? 'LOW PASS' : 'ORBIT'} · RANGE ${fmt(mode === 'closeorbit' ? c.closeR : c.dist, 3)} R · FOV ${fovDeg}°`;
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
  const tier = engine.tier === 'software' ? 'software GL, on demand' : engine.tier === 'still' ? 'still frame' : `${s.fps ? s.fps + ' fps' : 'gpu'} · scale ${(engine.camera.resScale || 0).toFixed(2)}`;
  $('perf').textContent = glOk ? `${engine.buffer} · ${tier}` : 'WebGL unavailable';
  $('perf').title = glOk ? `Renderer: ${engine.renderer}` : '';
}

/* ---------------- keyboard ---------------- */
function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing) { e.preventDefault(); $('q').focus(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const onCanvas = document.activeElement?.tagName === 'CANVAS';
    if (e.key === 'r') randomWorld();
    else if (e.key === 'h') toggleClean();
    else if (store.state.tour && e.key === 'ArrowRight' && !onCanvas) stepTour(1);
    else if (store.state.tour && e.key === 'ArrowLeft' && !onCanvas) stepTour(-1);
    else if (e.key === 'Escape' && store.state.tour) endTour();
  });
}
function toggleClean() {
  const on = document.body.classList.toggle('clean');
  $('btn-clean').textContent = on ? 'Show instruments' : 'Hide instruments';
  $('btn-clean').setAttribute('aria-pressed', String(on));
}

/* The route pill. On a page served from this machine, llm.js probes the local Ollama when the
   pill mounts; if that server hangs, the probe stays pending, and a headless capture under
   virtual time (which pauses while a fetch is pending) never finishes. So on localhost the
   pill mounts on the first touch, key or model request; on the public site, at once. */
function mountRouteWhenSafe() {
  const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  if (!local) { mountRoutePanel($('route')); return; }
  $('route').innerHTML = '<span class="route-wait" title="On this machine the model route is detected the first time you touch the page">model: detected on first use</span>';
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

async function boot() {
  rebuildFilter();
  target = createTarget($('col-l'), store, actions);
  store.state.albedo = target.albedo;
  report = createReport($('report'), store, actions);
  plot = createPlot($('v-plot'), store, actions);
  system = createSystem($('v-sys'), store, actions);
  transit = createTransit($('v-tr'), store);
  tours = createTours($('tours'), store, actions);
  mountRouteWhenSafe();
  // in the page from the start and empty, so that its first words are announced; the stylesheet does not draw it while empty
  const qn = document.createElement('p'); qn.id = 'q-note'; qn.className = 'q-note'; qn.setAttribute('aria-live', 'polite');
  document.querySelector('.search').appendChild(qn);
  bindFilters(); bindSearch(); bindKeys();
  document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => setCam(b.dataset.cam)));
  $('btn-random').addEventListener('click', randomWorld);
  $('btn-clean').addEventListener('click', toggleClean);
  $('btn-plain').addEventListener('click', () => {
    const st = store.state; st.plain = !st.plain;
    $('btn-plain').classList.toggle('on', st.plain); $('btn-plain').setAttribute('aria-pressed', String(st.plain));
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
  $('ret-render').addEventListener('click', (e) => { const a = e.target.closest('[data-air]'); if (!a) return; e.preventDefault(); setAir(a.dataset.air, a.dataset.world); });
  $('method-close').addEventListener('click', () => $('method').close());
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $(b.dataset.close).close()));
  $('compare').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unpin]'); if (!b || !log) return;
    log.unpin(b.dataset.unpin, () => openCompare());
  });
  $('cmp-clear').addEventListener('click', () => { if (log) log.clearPins(() => openCompare()); });
  engine.onCamera = () => writeURL();
  engine.onMode = () => syncCamButtons();
  engine.onReady = () => {
    if ($('compare').open) openCompare();
    if (reticleHeld && reticleHeld === store.state.sel) setReticle(reticleHeld);   // a look it held back may be built now
  };
  document.addEventListener('visibilitychange', () => engine.setVisible && engine.setVisible(!document.hidden));
  if (typeof IntersectionObserver === 'function') new IntersectionObserver((es) => engine.setVisible && engine.setVisible(es[0].isIntersecting && !document.hidden)).observe($('stage'));
  window.addEventListener('resize', () => { placeWorld(); });
  if (typeof ResizeObserver === 'function') {
    let t = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(placeWorld); });
    ['stage', 'col-l', 'col-r'].forEach((id) => ro.observe($(id)));
    ro.observe(document.querySelector('.reticle'));
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
  $('stamp').textContent = `${fmtInt(st.list.length)} planets · NASA Exoplanet Archive · ${snap.meta.retrieved}`;

  // ignition: the world arrives from deep space, the instruments assemble around it
  if (glOk) { engine.start(); if (!cam.every(Number.isFinite) || cam.length !== 3) engine.arrive(); }
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    $('veil').classList.add('gone');
  });
  if (linkTour.length) startTour(tourKey, true, Math.max(0, tourAt));   // the link started it, the visitor did not

  setInterval(perfLine, 2000); perfLine();
  setInterval(bezel, 300); bezel();

  try {
    const { added, rosterCount } = await joinRoster(st.list);
    for (const p of added) st.byName.set(p.name, p);
    plot.resetStats(); plot.redraw();
    const note = `The weekly roster (${DATA.rosterLabel}) lists ${fmtInt(rosterCount)} planets with a measured radius${added.length ? ` and added ${fmtInt(added.length)} confirmed after the snapshot` : '; none are newer than the snapshot'}.`;
    renderMethod({ val: validateAgainstArchive(st.list), valley: valleyHistogram(st.list), rosterNote: note });
    $('stamp').textContent = `${fmtInt(st.list.length)} planets · ${fmtInt(rosterCount)} measured radii · ${snap.meta.retrieved}`;
    if (st.sel) target.update(st.sel);
  } catch (e) {
    console.warn('[exomania] weekly roster unavailable; radius provenance is provisional', e.message);
  }
  changelog(st.list);
  renderFilters();
  resay();
  if (log) log.reread();
}

boot();
