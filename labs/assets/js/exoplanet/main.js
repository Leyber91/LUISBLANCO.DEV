/* ============================================================
   exoplanet/main.js — entry for exomania.html. Owns the state
   (selection, diagram, filters, query, tour, pins), wires the
   renderer and the linked views to it, keeps the URL in step,
   and runs the opening.

   Load order: the PSCompPars snapshot paints the page; the weekly
   roster joins in the background and marks measured radii.
   ============================================================ */

import { Exoplanet } from './exoplanet.js';
import { toParams, classify } from './data.js';
import { loadSnapshot, joinRoster, provisionalMeasured } from './catalog.js';
import { LANDMARKS, PLOTS, SIZE_CLASSES, METHOD_GROUPS, TOURS, DATA, PHYS } from './config.js';
import {
  sizeClass, hzPosition, validateAgainstArchive, valleyHistogram, transitValidation, teqValidation, withholdingTest,
  insolation, earthLikeness, monteCarlo, skyView, starColour, isNum,
} from './science.js';
import { createPlot, plotValue } from './views/plot.js';
import { createSystem } from './views/system.js';
import { createTransit } from './views/transit.js';
import { createTarget } from './views/target.js';
import { createReport } from './report.js';
import { createTours, tourStops } from './tours.js';
import { exportPlate, exportCSV, copyLink } from './export.js';
import { parseQuestion, askModel, RANGE_FIELDS } from './query.js';
import { chainHTML, compareHTML, methodHTML } from './panels.js';
import { fmt, fmtInt, esc, reducedMotion } from './views/common.js';
import { mountRoutePanel } from '../ai/route-panel.js';

const params = new URLSearchParams(location.search);
window.__EXO_STILL__ = params.has('still');
const $ = (id) => document.getElementById(id);
const store_ = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } return null; };

/* ---------------- state ---------------- */
const emptyFilter = () => ({ cls: 'all', method: 'all', year: null, box: null, upTo: null, ranges: {}, zone: null, newOnly: false, query: null });
const store = {
  state: {
    list: [], byName: new Map(), sel: null, system: [], plot: PLOTS[params.get('plot')] ? params.get('plot') : 'valley',
    filter: emptyFilter(), filterFn: () => true, filterActive: false, tour: null, colorBy: 'none',
    albedo: () => 0.3, pins: [], newNames: new Set(), plain: false,
  },
};
const methodGroup = (m) => (METHOD_GROUPS.some((g) => g.key === m) ? m : 'other');
const rangeValue = (p, k) => (k === 'S' ? insolation(p).S : k === 'dist' ? (isNum(p.dist) ? p.dist * PHYS.PC_LY : null) : p[k]);
function rebuildFilter() {
  const f = store.state.filter, st = store.state;
  const rk = Object.entries(f.ranges).filter(([, r]) => r && (r[0] !== null || r[1] !== null));
  st.filterFn = (p) => {
    if (f.cls !== 'all' && sizeClass(p.R).key !== f.cls) return false;
    if (f.method !== 'all' && methodGroup(p.method) !== f.method) return false;
    if (f.year !== null && p.year !== f.year) return false;
    if (f.newOnly && !st.newNames.has(p.name)) return false;
    for (const [k, [lo, hi]] of rk) {
      const v = rangeValue(p, k);
      if (!isNum(v) || (lo !== null && v < lo) || (hi !== null && v > hi)) return false;
    }
    if (f.zone && !f.zone.includes(hzPosition(p).key)) return false;
    if (f.box) {
      const x = plotValue(p, f.box.xKey), y = plotValue(p, f.box.yKey);
      if (!isNum(x) || !isNum(y) || x < f.box.x[0] || x > f.box.x[1] || y < f.box.y[0] || y > f.box.y[1]) return false;
    }
    return true;
  };
  st.filterActive = f.cls !== 'all' || f.method !== 'all' || f.year !== null || f.newOnly || rk.length > 0 || !!f.zone || !!f.box;
}

/* ---------------- renderer ---------------- */
const canvas = $('exo-canvas');
const engine = new Exoplanet(canvas);
const glOk = engine.ok();
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
let plot, system, transit, target, report, tours;
const actions = {
  select, setPlot, setFilter, startTour, pauseTour,
  exportAs(kind, btn) {
    const st = store.state;
    if (!st.sel) return;
    if (kind === 'plate') { exportPlate(st.sel, engine, { system: document.querySelector('.sys-cv'), transit: document.querySelector('.tr-cv') }, st.albedo()); flash(btn, 'Saved'); }
    else if (kind === 'csv') { const n = exportCSV(st.list, st.filterFn, st.filterActive, st.albedo(), filterLabel()); flash(btn, `${fmtInt(n)} rows`); }
    else if (kind === 'link') copyLink().then((ok) => flash(btn, ok ? 'Copied' : 'Copy failed'));
    else if (kind === 'chain') { $('chain-body').innerHTML = chainHTML(st.sel, st.albedo()); $('chain').showModal(); }
    else if (kind === 'pin') { pin(st.sel); flash(btn, `${st.pins.length} pinned`); }
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
  if (f.box) parts.push('box on ' + PLOTS[f.box.mode].label);
  if (f.newOnly) parts.push('new since last visit');
  return parts.join(', ');
}

/* ---------------- selection ---------------- */
function paramsFor(p) {
  const prm = toParams(p);
  if (store.state.plain) { prm.cloud = 0; prm.life = 0; }
  return prm;
}
function select(p, { from = 'ui', keepTour = false } = {}) {
  if (!p) return;
  const st = store.state;
  if (!keepTour && st.tour) endTour();
  const prev = st.sel;
  st.sel = p;
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
  if (from !== 'search') $('q').value = '';
}

function setReticle(p) {
  $('ret-name').textContent = p.name;
  const hz = hzPosition(p);
  const hzShort = { cons: 'conservative habitable zone', opt: 'optimistic habitable zone', hot: 'hotter than the habitable zone', cold: 'colder than the habitable zone', unknown: 'zone unknown' }[hz.key];
  $('ret-class').textContent = `${sizeClass(p.R).label} · ${hzShort}`;
  $('ret-render').textContent = `procedural surface: ${classify(p).label.replace(/ · habitable zone/i, '').toLowerCase()}`;
}

function setPlot(mode) { store.state.plot = mode; plot.redraw(); writeURL(); }

function setFilter(patch) {
  Object.assign(store.state.filter, patch);
  rebuildFilter();
  renderFilters();
  renderRanges();
  plot.redraw();
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
    if (glOk && !c.moving && (Math.abs((c.yaw ?? 0.7) - 0.7) > 0.01 || Math.abs((c.pitch ?? 0.3) - 0.3) > 0.01 || Math.abs(c.dist - (c.homeDist || c.dist)) > 0.05)) {
      u.set('cam', [c.yaw, c.pitch, c.dist / (c.homeDist || 1)].map((x) => (+x).toFixed(2)).join(','));
    }
    if (st.filter.query) u.set('q', st.filter.query);
    if (window.__EXO_STILL__) u.set('still', '');
    history.replaceState(null, '', '?' + u.toString().replace(/=(&|$)/, '$1'));
  }, 120);
}

/* ---------------- filters, ranges, replay, changelog ---------------- */
function renderFilters() {
  const st = store.state, f = st.filter;
  const n = st.filterActive ? st.list.filter(st.filterFn).length : st.list.length;
  const chips = [];
  if (f.year !== null) chips.push(`<button type="button" class="chip on" data-clear="year">${f.year} ×</button>`);
  if (f.box) chips.push(`<button type="button" class="chip on" data-clear="box">box ×</button>`);
  if (f.zone) chips.push(`<button type="button" class="chip on" data-clear="zone">habitable zone ×</button>`);
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
    ${chips.join('')}${newChip}
    ${st.filterActive ? `<button type="button" class="chip" data-act="tourthese">Tour these</button>` : ''}
    <span class="f-count">${fmtInt(n)} ${st.filterActive ? 'match' : 'planets'}</span>`;
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
  if (isNum(st.filter.upTo)) { clearInterval(replayT); setFilter({ upTo: null }); return; }
  const years = st.list.map((p) => p.year).filter(isNum);
  const y0 = Math.max(1995, Math.min(...years)), y1 = Math.max(...years);
  let y = y0;
  setFilter({ upTo: y });
  clearInterval(replayT);
  replayT = setInterval(() => {
    y += 1;
    if (y > y1) { clearInterval(replayT); setTimeout(() => setFilter({ upTo: null }), 1600); return; }
    setFilter({ upTo: y });
  }, reducedMotion() ? 900 : 420);
}
function bindFilters() {
  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const f = store.state.filter;
    if (b.dataset.cls) setFilter({ cls: b.dataset.cls });
    else if (b.dataset.clear) setFilter({ [b.dataset.clear]: b.dataset.clear === 'ranges' ? {} : b.dataset.clear === 'newOnly' ? false : null, ...(b.dataset.clear === 'ranges' ? { query: null } : {}) });
    else if (b.dataset.act === 'ranges') { $('ranges').hidden = !$('ranges').hidden; renderFilters(); renderRanges(); placeWorld(); }
    else if (b.dataset.act === 'replay') replay();
    else if (b.dataset.act === 'new') setFilter({ newOnly: !f.newOnly });
    else if (b.dataset.act === 'tourthese') tourFromFilter();
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
function bindSearch() {
  const q = $('q'), box = $('q-results');
  let items = [], cur = -1;
  const close = () => { box.hidden = true; q.setAttribute('aria-expanded', 'false'); cur = -1; };
  const render = () => {
    box.innerHTML = items.map((it, i) => it.ask
      ? `<li role="option" id="qr-${i}" class="ask${i === cur ? ' on' : ''}" aria-selected="${i === cur}" data-i="${i}"><b>Ask the catalogue</b><span>${esc(it.ask)}</span></li>`
      : `<li role="option" id="qr-${i}" class="${i === cur ? 'on' : ''}" aria-selected="${i === cur}" data-i="${i}">
      <b>${esc(it.name)}</b><span>${isNum(it.R) ? fmt(it.R, 3) + ' R⊕' : ''}${it.year ? ' · ' + it.year : ''}</span></li>`).join('');
    box.hidden = !items.length; q.setAttribute('aria-expanded', String(!!items.length));
    q.setAttribute('aria-activedescendant', cur >= 0 ? 'qr-' + cur : '');
  };
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase();
    if (!s) { close(); return; }
    const L = store.state.list;
    const starts = [], has = [];
    for (const p of L) {
      const nm = p.name.toLowerCase(), h = p.host.toLowerCase();
      if (nm.startsWith(s) || h.startsWith(s)) starts.push(p); else if (nm.includes(s) || h.includes(s)) has.push(p);
      if (starts.length > 40) break;
    }
    items = [...starts, ...has].slice(0, 7);
    if (s.includes(' ') || !items.length) items.push({ ask: q.value.trim() });
    cur = 0; render();
  });
  const choose = (it) => { close(); q.blur(); if (it.ask) runQuestion(it.ask, true); else select(it, { from: 'search' }); };
  q.addEventListener('keydown', (e) => {
    if (box.hidden) { if (e.key === 'Enter' && q.value.trim()) runQuestion(q.value.trim(), true); return; }
    if (e.key === 'ArrowDown') { cur = Math.min(items.length - 1, cur + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[cur]) choose(items[cur]);
    else if (e.key === 'Escape') close();
  });
  box.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); choose(items[+li.dataset.i]);
  });
  q.addEventListener('blur', () => setTimeout(close, 120));
}

let qCtrl = null;
async function runQuestion(text, useModel) {
  const det = parseQuestion(text);
  applyQuery(det, text, 'parser');
  if (!useModel) return;
  if (qCtrl) qCtrl.abort();
  qCtrl = new AbortController();
  $('q-note').textContent = `Parsed: ${det.notes.join(', ') || 'nothing recognised'}. Asking a model to read it`;
  try {
    const { q, res } = await askModel(text, qCtrl.signal);
    const st = store.state;
    const prevFilter = { ...st.filter, ranges: { ...st.filter.ranges } }, prevSort = st.querySort;
    if (q) {
      applyQuery(q, text, `${res.model} (${res.source})`);
      // a model reading that matches nothing is worse than the parser's: keep the parser's
      if (!st.list.some(st.filterFn) && det.recognised) {
        st.querySort = prevSort; setFilter(prevFilter);
        $('q-note').textContent = `“${text}” → ${det.notes.join(', ')} · ${fmtInt(st.list.filter(st.filterFn).length)} match · read by the parser; ${res.model}'s reading matched no planet and was set aside.`;
      }
    }
    else $('q-note').textContent = `${$('q-note').textContent.replace(/\. Asking.*$/, '')}. ${res.source === 'offline' ? 'No model answered' : 'The model reply failed validation'}; parser filter kept.`;
  } catch (e) { if (e.name !== 'AbortError') $('q-note').textContent += ': model call failed; parser filter kept.'; }
}
function applyQuery(q, text, by) {
  const st = store.state;
  const patch = { ranges: { ...q.ranges }, zone: q.zone, query: text };
  if (q.method) patch.method = q.method;
  st.querySort = q.sort;
  setFilter(patch);
  const n = st.list.filter(st.filterFn).length;
  $('q-note').textContent = `“${text}” → ${q.notes.join(', ') || 'no clause recognised'}${q.sort ? `, sorted by ${q.sort.key}` : ''} · ${fmtInt(n)} match · read by ${by}. Edit under Ranges.`;
  $('q-note').hidden = false;
  if ($('ranges').hidden && Object.keys(q.ranges).length) { $('ranges').hidden = false; renderFilters(); renderRanges(); }
}
const sortValue = (p, key) => (key === 'earthlike' ? earthLikeness(p) : key === 'S' ? insolation(p).S : key === 'dist' ? p.dist : p[key]);
function tourFromFilter() {
  const st = store.state;
  const s = st.querySort || { key: 'earthlike', dir: -1 };
  const pool = st.list.filter((p) => st.filterFn(p) && p.measuredR && isNum(sortValue(p, s.key)));
  pool.sort((a, b) => s.dir * (sortValue(a, s.key) - sortValue(b, s.key)));
  const stops = pool.slice(0, 6).map((p) => ({
    p, cap: `${fmt(p.R, 3)} R⊕ · ${insolation(p).S ? fmt(insolation(p).S, 3) + ' S⊕ · ' : ''}${isNum(p.Teq) ? fmtInt(p.Teq) + ' K · ' : ''}${isNum(p.dist) ? fmtInt(p.dist * PHYS.PC_LY) + ' ly' : ''} · ranked by ${s.key}, ${s.dir < 0 ? 'highest' : 'lowest'} first, among ${fmtInt(pool.length)} matches with a measured radius.`,
  }));
  if (!stops.length) return;
  st.tour = { key: 'custom', stops, i: 0, label: st.filter.query ? `“${st.filter.query}”` : 'Your filter' };
  showStop();
}

/* ---------------- tours ---------------- */
let tourTimer = 0;
function startTour(key) {
  const stops = tourStops(key, store.state.list);
  if (!stops.length) return;
  store.state.tour = { key, stops, i: 0, label: TOURS.find((t) => t.key === key).label };
  showStop();
}
function pauseTour() {
  if (!store.state.tour) return;
  clearTimeout(tourTimer);
  $('tour-prog').classList.remove('run');
}
function showStop() {
  const t = store.state.tour; if (!t) return;
  const s = t.stops[t.i];
  select(s.p, { from: 'tour', keepTour: true });
  $('tour-k').textContent = `Tour · ${t.label} · ${t.i + 1} of ${t.stops.length}`;
  $('tour-cap').textContent = s.cap;
  $('tourbar').hidden = false;
  tours.sync();
  writeURL();
  clearTimeout(tourTimer);
  const bar = $('tour-prog');
  bar.classList.remove('run'); void bar.offsetWidth;
  if (!reducedMotion() && !window.__EXO_STILL__) { bar.classList.add('run'); tourTimer = setTimeout(() => stepTour(1), 11000); }
}
function stepTour(d) {
  const t = store.state.tour; if (!t) return;
  t.i = (t.i + d + t.stops.length) % t.stops.length;
  showStop();
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
function pin(p) {
  const st = store.state;
  if (!st.pins.includes(p)) { st.pins.push(p); if (st.pins.length > 3) st.pins.shift(); }
  openCompare();
}
function openCompare() {
  const st = store.state;
  $('compare-body').innerHTML = compareHTML(st.pins, EARTH, st.albedo());
  document.querySelectorAll('.cmp-thumb').forEach((el) => {
    const i = +el.dataset.i, p = i === 0 ? EARTH : st.pins[i - 1];
    if (!thumbs.has(p.name) && glOk) thumbs.set(p.name, engine.snapshot(toParams(p), 150));
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
  const locked = isNum(p.P) && p.P < 10;
  $('ground-sites').innerHTML = locked
    ? `<span class="view-k">Likely tidally locked (P ${fmt(p.P, 3)} d): land at</span> <button type="button" class="chip" data-elev="80">substellar point</button><button type="button" class="chip" data-elev="0">terminator</button><button type="button" class="chip" data-elev="-10">night side</button>`
    : `<span class="view-k">Time of day: drag the star's elevation</span>`;
  $('ground-read').innerHTML = `<b class="tg tg-${mc.massFrom === 'measured' ? 'd' : 'e'}">${mc.massFrom === 'measured' ? 'D' : 'E'}</b> gravity ${mc.g ? fmt(mc.g.med, 2) : '—'} g · <b class="tg tg-d">D</b> Teq ${mc.teq ? fmtInt(mc.teq.med) : '—'} K · <b class="tg tg-d">D</b> star ${sky ? fmt(sky.angDeg, 2) : '—'}° wide (Sun 0.53°)${locked ? ' · <b class="tg tg-i">I</b> lock threshold 10 d' : ''} · <b class="tg tg-i">I</b> terrain`;
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
  if (pool.length) select(pool[Math.floor(Math.random() * pool.length)], { from: 'random' });
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
  const qn = document.createElement('p'); qn.id = 'q-note'; qn.className = 'q-note'; qn.hidden = true; qn.setAttribute('aria-live', 'polite');
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
  $('method-close').addEventListener('click', () => $('method').close());
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $(b.dataset.close).close()));
  $('compare').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unpin]'); if (!b) return;
    store.state.pins = store.state.pins.filter((p) => p.name !== b.dataset.unpin); openCompare();
  });
  $('cmp-clear').addEventListener('click', () => { store.state.pins = []; openCompare(); });
  engine.onCamera = () => writeURL();
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

  const want = params.get('p') && st.byName.get(params.get('p'));
  const first = want || LANDMARKS.map((n) => st.byName.get(n)).find(Boolean) || st.list[0];
  renderFilters();
  select(first, { from: 'boot' });
  const view = params.get('view');
  if (glOk && (view === 'surface' || view === 'closeorbit')) setCam(view);
  const cam = (params.get('cam') || '').split(',').map(Number);
  if (glOk && cam.length === 3 && cam.every(Number.isFinite)) engine.setCamera({ yaw: cam[0], pitch: cam[1], dist: cam[2] * (engine.camera.homeDist || 5) });
  if (params.get('q')) runQuestion(params.get('q'), false);   // a shared question replays with the parser; no model call on load

  renderMethod({ meta: snap.meta, val: validateAgainstArchive(st.list), valley: valleyHistogram(st.list), transit: transitValidation(st.list), teq: teqValidation(st.list), hold: withholdingTest(st.list), rosterNote: 'The weekly roster is joining in the background.' });
  $('stamp').textContent = `${fmtInt(st.list.length)} planets · NASA Exoplanet Archive · ${snap.meta.retrieved}`;

  // ignition: the world arrives from deep space, the instruments assemble around it
  if (glOk) { engine.start(); if (!cam.every(Number.isFinite) || cam.length !== 3) engine.arrive(); }
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    $('veil').classList.add('gone');
  });
  const tourKey = params.get('tour');
  if (tourKey && TOURS.some((t) => t.key === tourKey)) startTour(tourKey);

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
}

boot();
