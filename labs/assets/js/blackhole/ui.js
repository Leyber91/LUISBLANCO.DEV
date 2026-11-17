/* ============================================================
   blackhole/ui.js — the panels, readouts, linked diagrams, the
   on-image annotation layer, the probe and the input handlers.
   Every control writes the store; every readout reads the model
   (physics.js) or the worker's traced anchors.
   ============================================================ */

import * as K from './kerr.js';
import { OBJECTS, EVIDENCE, VIEWS, SCHEMA, COLOR_MODES, CITE, COPY, TIERS, VERSION, EHT_RES } from './config.js';
import { tanHalfV, derive, shadowFor, s3, integratorShadow, measurement, published, fall, sci, dur, len,
  sigmaText, parsecs, photonEnergy, deg, spinText, weakest, inputTags, pmText, noShadow, SHADOW_HOW, MEAN_DEF, RULING, BODY_M, TIDE_G } from './physics.js';
import { colourWord, modeNote, modeKey } from './palette.js';
import { crossSection, diskProfile, spectrumPlot, fallChart, potentialPlot, esc } from './diagrams.js';
import { Tour } from './tour.js';
import { mountAsk } from './ask.js';
import { exportPlate, exportState, importState, exportData, PLATE_SS } from './plate.js';
import { mountRoutePanel } from '../ai/route-panel.js';
import { anchors as anchorsInline, subrings as subringsInline, liveAnchors, viewKey, probeRay as traceProbe, screenToTangent, SUBRING } from './probe.js';

/** The texels of the GPU's measuring row; the Measure card's note quotes it. */
const STRIP_N = 4096;
/** The overlay's text: 11 px IBM Plex Mono at .06em letter spacing, about 7.3 px a character (black_hole.css). */
const LABEL_CH = 7.3;

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const BY_KEY = Object.fromEntries(SCHEMA.map((s) => [s.key, s]));
const D2R = Math.PI / 180;

export function buildUI(app) {
  const { store, renderer } = app;
  const left = $('#bh-left'), right = $('#bh-right');
  const overlay = $('#bh-overlay'), caption = $('#bh-caption'), probe = $('#bh-probe');
  const sr = $('#bh-sr');
  const narrow = () => window.matchMedia('(max-width: 900px)').matches;

  /* ---------- worker ---------- */
  let worker = null, wid = 0;
  const pending = new Map();
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onerror = (e) => { console.warn('worker error:', e.message || e); };
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data.result); } };
  } catch { worker = null; }
  const call = (type, args) => new Promise((res, rej) => {
    if (!worker) { rej(new Error('no worker')); return; }
    const id = ++wid; pending.set(id, { res, rej }); worker.postMessage({ id, type, args });
  });

  /* ---------- back link (hidden when embedded) ---------- */
  const back = $('#bh-back');
  if (window.self !== window.top) back.style.display = 'none';

  /* ---------- left column ---------- */
  const head = el('div', 'bh-head', `<div class="bh-kick">${COPY.kick}</div><h1>${COPY.title}</h1><p>${COPY.sub}</p>`);
  left.appendChild(head);

  // object
  const objCard = el('div', 'bh-card');
  // each object carries its evidence class on its button; the legend under the buttons defines the classes
  objCard.innerHTML = `<h2>Object <em id="bh-objkind"></em></h2><div class="bh-seg" id="bh-objs"></div>
    <p class="bh-note" id="bh-evid">${Object.entries(EVIDENCE).map(([k, v]) => `<b>${k}</b> ${v}`).join('<br>')}</p><p class="bh-note" id="bh-objnote"></p>`;
  left.appendChild(objCard);
  const objBtns = {};
  OBJECTS.forEach((o) => {
    const b = el('button', 'bh-btn', `${o.name}<small>${o.evidence}</small>`);
    b.type = 'button';
    b.addEventListener('click', () => { app.tour?.stop(); store.set(store.objectPatch(o.id)); });
    objBtns[o.id] = b; $('#bh-objs', objCard).appendChild(b);
  });

  // view + observer + colour + emitter
  const viewCard = el('div', 'bh-card');
  viewCard.innerHTML = `<h2>View</h2><div class="bh-seg" id="bh-views"></div><div class="bh-seg" id="bh-obs"></div>
    <h2 style="margin-top:12px">Colour <em id="bh-modenote"></em></h2><div class="bh-seg" id="bh-modes"></div><div class="bh-legend" id="bh-modekey"></div>
    <h2 style="margin-top:12px">Emitter</h2><div class="bh-seg" id="bh-emit"></div><p class="bh-note" id="bh-viewnote"></p>`;
  left.appendChild(viewCard);
  const viewBtns = {}, obsBtns = {}, modeBtns = {}, emitBtns = {};
  Object.entries(VIEWS).forEach(([id, v]) => {
    const b = el('button', 'bh-btn', v.label); b.type = 'button';
    b.addEventListener('click', () => { app.tour?.stop(); store.set(store.viewPatch(id)); if (id === 'journey') journey.play(); else journey.stop(); });
    viewBtns[id] = b; $('#bh-views', viewCard).appendChild(b);
  });
  [['zamo', 'hover'], ['faller', 'fall'], ['orbiter', 'orbit']].forEach(([id, lab]) => {
    const b = el('button', 'bh-btn', lab); b.type = 'button'; b.title = { zamo: 'zero-angular-momentum observer: hovering', faller: 'free fall from rest at infinity', orbiter: 'moving at the local Kepler rate' }[id];
    b.addEventListener('click', () => store.set({ observer: id }));
    obsBtns[id] = b; $('#bh-obs', viewCard).appendChild(b);
  });
  Object.entries(COLOR_MODES).forEach(([id, m]) => {
    const b = el('button', 'bh-btn', m.label); b.type = 'button';
    b.addEventListener('click', () => store.set({ color: id }));
    modeBtns[id] = b; $('#bh-modes', viewCard).appendChild(b);
  });
  [['thick', 'thin disk (thick)'], ['thin', 'optically thin'], ['off', 'none']].forEach(([id, lab]) => {
    const b = el('button', 'bh-btn', lab); b.type = 'button';
    b.addEventListener('click', () => store.set({ emit: id }));
    emitBtns[id] = b; $('#bh-emit', viewCard).appendChild(b);
  });

  // parameters
  const parCard = el('div', 'bh-card');
  parCard.innerHTML = `<h2>Parameters <em>type or drag</em></h2>`;
  left.appendChild(parCard);
  const rows = {};
  const sliderKeys = ['a', 'q', 'incl', 'rcam', 'fov', 'mass', 'edd', 'rout', 'hotspot', 'fcol', 'tdisp', 'stretch', 'ev'];
  const LABEL = { q: 'charge Q/M', fcol: 'colour correction f_col', mass: 'mass, log10 M☉', edd: 'Ṁ/Ṁ_Edd, log10', rcam: 'observer r', a: 'spin a/M', incl: 'inclination', fov: 'field of view', rout: 'disk outer edge', hotspot: 'hot spot r (0 off)', tdisp: 'display peak T', stretch: 'display stretch', ev: 'exposure' };
  const toRange = (d, v) => (d.log ? Math.log(v) : v);
  const fromRange = (d, x) => (d.log ? Math.exp(x) : x);
  sliderKeys.forEach((k) => {
    const d = BY_KEY[k];
    const row = el('div', 'bh-row');
    const id = `bh-in-${k}`;
    row.innerHTML = `<label for="${id}">${LABEL[k] || d.label}</label><span><input class="bh-num" id="${id}" inputmode="decimal" aria-label="${LABEL[k] || d.label} value"> <span class="bh-unit">${d.unit === 'Msun' ? '' : d.unit}</span></span>
      <input class="bh-range" type="range" aria-label="${LABEL[k] || d.label}" min="${toRange(d, d.min)}" max="${toRange(d, d.max)}" step="${d.log ? 0.001 : d.step}">`;
    const num = row.querySelector('.bh-num'), rng = row.querySelector('.bh-range');
    // whether a value makes a named object custom is Store.set's rule, the one a link and a file take (fix_s2_p1 K5)
    rng.addEventListener('input', () => { app.tour?.stop(); store.set({ [k]: +fromRange(d, +rng.value).toFixed(5) }, { dur: 450 }); });
    num.addEventListener('change', () => { app.tour?.stop(); store.set({ [k]: +num.value }); });
    rows[k] = { num, rng, d };
    parCard.appendChild(row);
  });
  parCard.appendChild(el('p', 'bh-note', 'Spin, inclination, distance and field of view change the light paths and re-trace them; mass, accretion rate and display settings only re-colour the cached rays. In units of M, every hole of the same spin looks the same: mass sets the scale and the temperature.'));

  // actions
  const actCard = el('div', 'bh-card');
  actCard.innerHTML = `<h2>Run and keep</h2>
    <div class="bh-seg"><button class="bh-btn go" type="button" id="bh-tour">Tour</button><button class="bh-btn" type="button" id="bh-anim"></button><button class="bh-btn" type="button" id="bh-notes"></button></div>
    <div class="bh-seg"><button class="bh-btn" type="button" id="bh-png">Plate 1920</button><button class="bh-btn" type="button" id="bh-png4">Plate 3840</button><button class="bh-btn" type="button" id="bh-link">Copy link</button></div>
    <div class="bh-seg"><button class="bh-btn" type="button" id="bh-json">State JSON</button><label class="bh-btn" for="bh-import" tabindex="0">Import JSON</label><input type="file" id="bh-import" accept="application/json" hidden><button class="bh-btn" type="button" id="bh-csv">Objects CSV</button></div>
    <p class="bh-note" id="bh-actnote">The link and the JSON reproduce this exact frame. The plate stamps the parameters and the measurement onto the image.</p>`;
  left.appendChild(actCard);
  const actNote = $('#bh-actnote', actCard);
  $('#bh-anim', actCard).addEventListener('click', () => store.set({ anim: !store.get('anim') }));
  $('#bh-notes', actCard).addEventListener('click', () => store.set({ notes: !store.get('notes') }));
  $('#bh-link', actCard).addEventListener('click', async () => {
    const url = location.origin + location.pathname + '?' + store.toQuery();
    try { await navigator.clipboard.writeText(url); actNote.textContent = 'Link copied. It restores every parameter, the camera and the colour mode.'; }
    catch { actNote.textContent = url; }
  });
  const plate = async (W) => {
    actNote.textContent = `Tracing a ${W} px still with ${PLATE_SS} × ${PLATE_SS} samples per pixel...`;
    try { await exportPlate(app, W, (p) => { actNote.textContent = `Tracing a ${W} px still: ${Math.round(p * 100)}%`; }); actNote.textContent = `Plate saved (${W} px, parameters stamped).`; }
    catch (e) { actNote.textContent = 'Export failed: ' + e.message; }
  };
  $('#bh-png', actCard).addEventListener('click', () => plate(1920));
  $('#bh-png4', actCard).addEventListener('click', () => plate(3840));
  $('#bh-json', actCard).addEventListener('click', () => exportState(app));
  $('#bh-csv', actCard).addEventListener('click', () => exportData(app));
  $('#bh-import', actCard).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await importState(app, file); actNote.textContent = 'State restored from the file.'; } catch (err) { actNote.textContent = 'Could not read that file: ' + err.message; }
  });
  $('label[for="bh-import"]', actCard).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#bh-import').click(); } });

  /* ---------- right column ---------- */
  const instCard = el('div', 'bh-card');
  instCard.innerHTML = `<h2>Instrument <em id="bh-insttag"></em></h2><dl class="bh-read" id="bh-read"></dl><p class="bh-note">R: computed or sourced. I: illustrative. Tides use the equatorial value 2M/r³.</p>`;
  right.appendChild(instCard);

  const measCard = el('div', 'bh-card');
  measCard.innerHTML = `<h2>Shadow, measured <em>far observer</em></h2><dl class="bh-read" id="bh-meas"></dl>
    <div class="bh-seg" style="margin-top:8px"><button class="bh-btn" type="button" id="bh-strip">Measure on the GPU</button><button class="bh-btn" type="button" id="bh-rings">Sub-rings</button></div>
    <p class="bh-note" id="bh-measnote"></p>`;
  right.appendChild(measCard);

  const xsCard = el('div', 'bh-card');
  xsCard.innerHTML = `<h2>Cross-section <em>click the image to trace a ray</em></h2><div id="bh-xs"></div>
    <div class="bh-legend"><span><i></i>photon orbit</span><span><i class="s"></i>disk, ISCO</span><span><i class="d"></i>ergosurface</span></div>`;
  right.appendChild(xsCard);

  const profCard = el('div', 'bh-card');
  profCard.innerHTML = `<h2>Disk profile <em>hover to light an annulus</em></h2><div id="bh-prof"></div>
    <div class="bh-legend"><span><i class="s"></i>temperature T / T peak</span><span><i class="d"></i>flux F / F peak</span></div>`;
  right.appendChild(profCard);

  const potCard = el('div', 'bh-card');
  potCard.innerHTML = `<h2>Effective potential <em>equatorial</em></h2><div id="bh-pot"></div><p class="bh-note" id="bh-potnote"></p>
    <div class="bh-legend"><span><i></i>photon impact parameter b(r)</span><span><i class="s"></i>particle V(r) at L_ISCO</span></div>`;
  right.appendChild(potCard);

  const specCard = el('div', 'bh-card');
  specCard.innerHTML = `<h2>Spectrum <em>the visible disk, traced</em></h2><div id="bh-spec"></div><p class="bh-note" id="bh-specnote"></p>`;
  right.appendChild(specCard);

  const fallCard = el('div', 'bh-card');
  fallCard.innerHTML = `<h2>Fall <em>drag the chart to scrub</em></h2><div id="bh-fall"></div><dl class="bh-read" id="bh-fallread"></dl>
    <div class="bh-seg" style="margin-top:8px"><button class="bh-btn go" type="button" id="bh-fallgo">Fall in</button><button class="bh-btn" type="button" id="bh-fallstop">Hold</button></div>
    <div class="bh-legend"><span><i class="s"></i>your clock τ</span><span><i></i>far clock t</span><span><i class="d"></i>tide on ${BODY_M} m</span></div>`;
  right.appendChild(fallCard);

  const askCard = el('div', 'bh-card');
  right.appendChild(askCard);
  const ask = mountAsk(askCard, app);

  const checkCard = el('div', 'bh-card');
  checkCard.innerHTML = `<h2>Five-minute check <em id="bh-score"></em></h2><div id="bh-quiz"></div>`;
  right.appendChild(checkCard);

  /* ---------- phone: one bottom sheet ---------- */
  const stage = $('.bh-stage');
  const handle = el('button', 'bh-sheet-h', `<span>controls and readouts</span><em id="bh-sheetv">open</em>`);
  handle.type = 'button';
  handle.setAttribute('aria-expanded', 'false');
  stage.prepend(handle);
  stage.classList.add('bh-sheet');
  handle.addEventListener('click', () => {
    const open = stage.classList.toggle('open');
    handle.setAttribute('aria-expanded', String(open)); $('#bh-sheetv').textContent = open ? 'close' : 'open';
  });
  const footM = el('div', 'bh-card bh-foot-m');
  stage.appendChild(footM);

  /* ---------- footer ---------- */
  const foot = $('#bh-foot');
  foot.innerHTML = `<div class="tags"><span><b>[REAL]</b> ${COPY.real}</span>
    <span><b class="i">[ILLUSTRATIVE]</b> ${COPY.illustrative}</span></div>
    <button class="bh-btn src" type="button" id="bh-srcbtn">Sources</button>
    <div class="perf" id="bh-perf">tier -- · -- ms</div>`;
  footM.innerHTML = `<div><b style="color:var(--horizon)">[REAL]</b> ${COPY.real}. <b>[ILLUSTRATIVE]</b> ${COPY.illustrative}.</div><button class="bh-btn" type="button" id="bh-srcbtn2">Sources</button><div class="perf" id="bh-perf2"></div>`;
  const sources = $('#bh-sources');
  const openSources = () => {
    sources.hidden = !sources.hidden;
    if (sources.hidden) return;
    // each value names its own source: 'mass, distance: <paper>; spin: <paper>; inclination: <paper>'
    const cited = (o) => {
      const by = new Map();
      [['mass', o.massSrc], ['distance', o.distSrc], ['spin', o.spinSrc], ['inclination', o.inclSrc]].forEach(([what, k]) => { if (k) by.set(k, [...(by.get(k) || []), what]); });
      return [...by].map(([k, what]) => `${what.join(', ')}: ${CITE[k]}`).join('; ') || o.massNote || '';
    };
    const rowsT = OBJECTS.map((o) => `<tr><td>${o.name}</td><td>${o.massErr ? pmText(o.mass, o.massErr) : sci(o.mass)} M☉</td><td>${o.distPc ? parsecs(o.distPc) : '--'}</td><td>a ${spinText(o.spin)} <span class="${o.spinTag === 'REAL' ? 'bh-tagr' : 'bh-tagi'}">${o.spinTag}</span></td><td>i ${deg(o.incl)} deg</td><td>${esc(cited(o))}</td></tr>`).join('');
    sources.innerHTML = `<h3>Objects (data version ${VERSION})</h3><table><tr><th>object</th><th>mass</th><th>distance</th><th>spin</th><th>incl.</th><th>sources</th></tr>${rowsT}</table>
      <h3 style="margin-top:12px">Equations and values</h3><ol>${Object.values(CITE).map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
      <p class="bh-note">Verification: ${esc(COPY.verify)}</p>
      <p class="bh-note">The first version of this page, from June 2026, stays at <a href="bh_animation_page_v1.html" style="color:var(--horizon)">bh_animation_page_v1.html</a>.</p>
      <button class="bh-btn" type="button" id="bh-srcclose">Close</button>`;
    $('#bh-srcclose').addEventListener('click', () => { sources.hidden = true; });
  };
  $('#bh-srcbtn').addEventListener('click', openSources);
  $('#bh-srcbtn2').addEventListener('click', openSources);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { sources.hidden = true; probe.hidden = true; } });

  /* ---------- route pill ---------- */
  mountRoutePanel($('#bh-route'));

  /* ---------- the anchors (traced positions of features) ---------- */
  // Traced in the view the renderer traces (Store.view: the eased values, charge included).
  // Nothing is traced while a transition runs; its end asks again (tick below). Labels and
  // the tour read anchorsLive(): anchors traced for the view the state is in, else none.
  let anchors = null, anchorKey = '', anchorTimer = 0, anchorsRuns = 0;
  const viewNow = () => store.view();
  const aspectNow = () => window.innerWidth / window.innerHeight;
  const anchorsLive = () => liveAnchors(anchors, store.view(true));
  const requestAnchors = () => {
    clearTimeout(anchorTimer);
    anchorTimer = setTimeout(async () => {
      if (store.anim) return;
      const v = viewNow();
      const args = { view: v, aspect: aspectNow(), tpeakK: app.model.Tpeak, fcol: store.get('fcol') };
      // a resize re-traces (the grid's reach follows the aspect); the anchors stay live meanwhile
      const key = JSON.stringify([viewKey(v), args.aspect.toFixed(3), Math.round(app.model.Tpeak), args.fcol]);
      if (key === anchorKey) return;
      anchorKey = key;
      try {
        // the first pass runs inline (about 50 ms) so the labels exist with the first frame;
        // later passes go to the worker
        const res = anchorsRuns++ === 0 || !worker ? anchorsInline(args) : await call('anchors', args);
        if (key !== anchorKey) return;
        anchors = { ...res, fcol: args.fcol };
        drawOverlay(); drawSpectrum(); app.tour?.refresh();
      } catch (err) { console.warn('anchors unavailable:', err.message); /* the overlay keeps the analytic curve only */ }
    }, 260);
  };

  /* ---------- the overlay: model-computed annotations on the image ---------- */
  const thNow = () => tanHalfV(store.shown.fov, window.innerWidth / window.innerHeight);
  const toScreen = (sx, sy, th = thNow()) => {
    const W = window.innerWidth, H = window.innerHeight, asp = W / H;
    return [(sx / (th * asp) + 1) / 2 * W, (1 - (sy / th + 1) / 2) * H];
  };
  /** The part of the window the render shows between the panels, [left, right] in px: every label on the image
   *  stays inside it (review_s2 P4-3; fix_s2_p1 K6, the curve's legend ran under the Measure card at 1440). Read
   *  from the panels' own boxes, so the bound follows the stylesheet at every width; the whole window on a phone,
   *  where the panels are a sheet. */
  const openCentre = (W) => (narrow() ? [0, W] : [left.getBoundingClientRect().right, right.getBoundingClientRect().left]);
  /** Where a label's lead ends, kept inside the open centre [L, R] (review_s2 P4-3): flipped to the left where its
   *  text (tw px, 4 px from the lead) would run past the right bound, to the right where it would run past the left,
   *  then held so the text fits, and held between the top and the bottom. end: the text ends at the lead (it sits
   *  left). */
  function keepInside(x, y, dx, dy, tw, [L, R], H, pad = 8) {
    if (dx > 0 && x + dx + 4 + tw > R - pad) dx = -dx;
    else if (dx < 0 && x + dx - 4 - tw < L + pad) dx = -dx;
    const end = dx < 0;
    const lx = end ? Math.min(R - pad, Math.max(x + dx, L + pad + 4 + tw)) : Math.max(L + pad, Math.min(x + dx, R - pad - 4 - tw));
    const ly = Math.max(pad + 14, Math.min(H - pad - 14, y + dy));
    return { lx, ly, end };
  }
  function drawOverlay() {
    const W = window.innerWidth, H = window.innerHeight;
    overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const s = store.all();
    const parts = [];
    const th = thNow();
    // the analytic critical curve, in the telescope view (far observer)
    const tsO = s.view === 'telescope' && s.notes ? shadowFor(store.shown.a, store.shown.incl, store.shown.q) : null;
    if (tsO && tsO.curve) {
      const ts = tsO;
      const ro = store.shown.rcam;
      let d = '';
      ts.curve.forEach(([al, be], i) => {
        // impact parameter -> tangent-plane coordinate at finite distance (Synge factor)
        const sx = Math.tan(Math.asin(al * Math.sqrt(1 - 2 / ro) / ro)), sy = Math.tan(Math.asin(be * Math.sqrt(1 - 2 / ro) / ro));
        const [x, y] = toScreen(sx, sy, th);
        d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      });
      parts.push(`<g><path class="curve" d="${d}Z"/></g>`);
      const top = ts.curve.reduce((m, p) => (p[1] > m[1] ? p : m), ts.curve[0]);
      const [tx, ty] = toScreen(Math.tan(Math.asin(top[0] / ro)), Math.tan(Math.asin(top[1] / ro)), th);
      // the legend names the curve by the colour its token draws it in (palette.js; review_s2 P2-1) and by how it was
      // obtained (physics.js SHADOW_HOW; fix_s2_p1 K4), and stays between the panels at every width: flipped to the
      // left where it would run under the Measure card (P4-3, K6)
      const l1 = SHADOW_HOW[ts.how].curve, l2 = `solid ${colourWord('curve')}: theory · dashes: traced edge`;
      const { lx: cx, ly: cy, end } = keepInside(tx, ty, 70, -46, Math.max(l1.length, l2.length) * LABEL_CH, openCentre(W), H);
      const anchor = end ? 'end' : 'start', ox = end ? -4 : 4;
      parts.push(`<g><line class="lead" x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}"/><text x="${(cx + ox).toFixed(1)}" y="${(cy - 4).toFixed(1)}" text-anchor="${anchor}" class="subt">${l1}</text><text x="${(cx + ox).toFixed(1)}" y="${(cy + 10).toFixed(1)}" text-anchor="${anchor}">${l2}</text></g>`);
    }
    // labels only from anchors traced for this view: none mid-transition, none from the last view
    const an = anchorsLive();
    if (s.notes && an) {
      const placed = [];          // text blocks already drawn, so a later label steps aside
      const lab = (pt, txt, sub, dx, dy) => {
        if (!pt) return;
        const [x, y] = toScreen(pt.sx, pt.sy, th);
        const [L, R] = openCentre(W), lo = L + 8, hi = R - 8;
        if (x < lo || x > hi) return;
        // keep the label inside the open centre: flip it to the other side if it would run under a panel
        const tw = Math.max(txt.length, (sub || '').length) * LABEL_CH + 10;
        if (dx > 0 && x + dx + tw > hi) dx = -dx;
        if (dx < 0 && x + dx - tw < lo) dx = -dx;
        // and clear of the labels before it: the two text lines span 16 px either side of the
        // lead's end; of the four mirrored offsets, the first that touches no placed block wins
        const block = (ox, oy) => (ox < 0 ? [x + ox - tw, y + oy - 16, x + ox, y + oy + 16] : [x + ox, y + oy - 16, x + ox + tw, y + oy + 16]);
        const free = (b) => b[0] >= lo && b[2] <= hi && b[1] >= 0 && b[3] <= H && placed.every((p) => b[2] < p[0] || b[0] > p[2] || b[3] < p[1] || b[1] > p[3]);
        const fit = [[dx, dy], [dx, -dy], [-dx, dy], [-dx, -dy]].find(([ox, oy]) => free(block(ox, oy)));
        if (fit) [dx, dy] = fit;
        // where no offset is free, the label still stays between the panels (review_s2 P4-3)
        const { lx, ly, end } = keepInside(x, y, dx, dy, tw, [L, R], H);
        dx = end ? -1 : 1;
        placed.push(end ? [lx - tw, ly - 16, lx, ly + 16] : [lx, ly - 16, lx + tw, ly + 16]);
        parts.push(`<g><circle class="mark" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/><line class="lead" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}"/><text x="${(lx + (dx < 0 ? -4 : 4)).toFixed(1)}" y="${(ly - 3).toFixed(1)}" text-anchor="${dx < 0 ? 'end' : 'start'}">${txt}</text>${sub ? `<text x="${(lx + (dx < 0 ? -4 : 4)).toFixed(1)}" y="${(ly + 11).toFixed(1)}" text-anchor="${dx < 0 ? 'end' : 'start'}" class="subt">${sub}</text>` : ''}</g>`);
      };
      const m = app.model;
      if (an.shadow) {
        const sh = an.shadow;
        const wM = s.view === 'telescope' ? (K.angleToImpact(Math.atan(sh.right), store.shown.rcam) - K.angleToImpact(Math.atan(sh.left), store.shown.rcam)) : null;
        const inner = s.emit === 'thick' && s.view === 'telescope';
        lab({ sx: sh.right, sy: sh.cy + (sh.top - sh.cy) * 0.3 }, inner ? 'inner shadow' : 'shadow',
          wM ? `${s3(wM)} M wide${inner ? ': the disk hides the rest' : ''}` : `horizon is ${s3(2 * m.rh)} M across`, narrow() ? 30 : 70, narrow() ? -70 : -30);
      }
      if (an.limb && s.emit === 'thick') lab(an.limb, 'approaching side', `g up to ${s3(an.limb.g)}, I × ${s3(Math.pow(an.limb.g, 4))}`, -60, 46);
      if (an.ring && s.emit === 'thick' && !narrow()) lab(an.ring, 'n = 1 image', 'light that circled once', 60, -34);
      if (an.isco && s.emit === 'thick' && s.view !== 'telescope' && !narrow()) lab(an.isco, 'ISCO edge', `r = ${s3(m.ri)} M`, -70, -40);
    }
    if (app.probePt) parts.push(`<g><circle class="mark" cx="${app.probePt[0]}" cy="${app.probePt[1]}" r="6"/><circle class="mark" cx="${app.probePt[0]}" cy="${app.probePt[1]}" r="1.5"/></g>`);
    overlay.innerHTML = parts.join('');
  }

  /* ---------- readouts ---------- */
  const tagR = '<span class="bh-tagr" title="real: computed or sourced">R</span>', tagI = '<span class="bh-tagi" title="illustrative">I</span>';
  const dd = (label, value, unit = '', tag = '', cls = '') => `<div class="rw"><dt>${label}${tag}</dt><dd class="${cls}">${value}${unit ? `<span class="u">${unit}</span>` : ''}</dd></div>`;
  function drawReadouts() {
    const s = store.all(), m = app.model, o = m.obj;
    $('#bh-objkind').textContent = o ? o.kind : 'custom';
    const note = o ? `${o.emitterNote} Spin: ${o.spinNote}.` : 'Custom: mass, spin and accretion rate are yours.';
    $('#bh-objnote').textContent = note;
    const rgkm = (r) => `${sci(r * m.rg / 1000)} km`;
    const au = (r) => `${sci(r * m.rg / K.SI.au)} AU`;
    // readouts quote the state (where a transition is going), never the eased display values
    const camR = s.rcam;
    const clock = s.observer === 'orbiter' ? K.orbitClockRate(s.a, Math.max(camR, m.rph * 1.05), s.q) : K.hoverClockRate(s.a, camR, s.incl * D2R, s.q);
    // a value is as strong as its weakest input (physics.js weakest): a radius in M rests on the spin, a value in
    // km or seconds on the mass as well, the disk's temperature on the accretion rate too (fix_s2_brief C10)
    const it = inputTags(o), tag = (...ins) => (weakest(...ins.map((k) => it[k])) === 'REAL' ? tagR : tagI);
    // the shadow is the measurement's, at the inclination it names (physics.js measurement; fix_s2_p1 K1)
    const ms = measurement(s);
    $('#bh-read').innerHTML = [
      dd('mass', sci(m.massSun), 'M☉', tag('mass')),
      // what the mass rests on: M87*'s is the EHT's ring, which the Measure card's scale does not use (fix_s2_p1 S6)
      o && o.massBy ? dd(`from ${o.massBy}`, '', '', '', 'ink') : '',
      dd('event horizon r+', s3(m.rh), 'M', tag('spin')), dd('the point of no return, unseen', `${rgkm(m.rh)} · ${au(m.rh)}`, '', '', 'ink'),
      dd(`shadow, mean diameter, far observer at ${deg(ms.incl)} deg`, s3(ms.th.mean), 'M', tag('spin')),
      dd('light aimed inside falls in', `${s3(ms.toHorizon)} × the horizon`, '', '', 'ink'),
      dd('photon orbit', s3(m.rph), 'M', tag('spin')), dd('light can circle here, unstably', '', '', '', 'ink'),
      dd('ISCO, last stable orbit', s3(m.ri), 'M', tag('spin')), dd('the inner edge of the disk', `${rgkm(m.ri)} · ${au(m.ri)}`, '', '', 'ink'),
      dd('efficiency 1 - E(ISCO)', s3(m.eta * 100), '%', tag('spin')), dd('rest mass radiated on the way in', '', '', '', 'ink'),
      dd('ISCO gas speed', s3(m.vIsco), 'c', tag('spin')),
      dd('ISCO orbit period', dur(m.iscoPeriod), '', tag('mass', 'spin')),
      '<div class="hr"></div>',
      dd('disk peak T', m.Tpeak > 0 ? sci(m.Tpeak) : '--', m.Tpeak > 0 ? 'K' : '', tag('mass', 'spin', 'edd')),
      dd('Eddington', m.edd > 0 && m.obj?.id !== 'primordial' ? sci(m.edd) : 'none', '', tag('edd')),
      dd('Hawking T', sci(m.hawkingK), 'K', tag('mass', 'spin')),
      '<div class="hr"></div>',
      dd('clock rate here', s3(clock), 'x far', tag('spin')),
      dd(`tide at r+, ${BODY_M} m`, sci(m.tidalHg), 'g', tag('mass', 'spin')),
      dd(`${TIDE_G} g tide at`, m.tide10g > m.rh ? `${s3(m.tide10g)} M` : 'inside r+', '', tag('mass', 'spin')),
      // the inner horizon r- = 1 - sqrt(1 - a^2 - Q^2) is the centre only without spin and charge
      dd(m.rmin < 5e-7 ? 'r+ to r = 0' : 'r+ to inner r-', dur(m.interiorTauS), '', tag('mass', 'spin')),
    ].join('');
    $('#bh-insttag').textContent = o ? o.name : 'custom';
    // the card that matters for this view goes first
    const first = s.view === 'journey' ? fallCard : s.view === 'telescope' ? measCard : instCard;
    if (right.firstElementChild !== first) right.prepend(first);
    // footer perf readout keeps its own cadence
    drawMeasure();
    drawXS();
    drawProfile();
    drawPotential();
    drawFall();
    drawQuiz();
    // button states
    Object.entries(objBtns).forEach(([id, b]) => b.setAttribute('aria-pressed', String(s.obj === id)));
    Object.entries(viewBtns).forEach(([id, b]) => b.setAttribute('aria-pressed', String(s.view === id)));
    Object.entries(obsBtns).forEach(([id, b]) => b.setAttribute('aria-pressed', String(s.observer === id)));
    Object.entries(modeBtns).forEach(([id, b]) => b.setAttribute('aria-pressed', String(s.color === id)));
    Object.entries(emitBtns).forEach(([id, b]) => b.setAttribute('aria-pressed', String(s.emit === id)));
    $('#bh-modenote').textContent = '';
    $('#bh-viewnote').textContent = `${VIEWS[s.view].hint}. ${modeNote(s.color)}.`;
    // the swatches are drawn in the tokens the render draws the same marks with (palette.js modeKey)
    $('#bh-modekey').innerHTML = modeKey(s.color).map(([c, t]) => `<span><i class="sw" style="background:${c}"></i>${esc(t)}</span>`).join('');
    $('#bh-anim', actCard).textContent = s.anim ? 'Pause' : 'Play';
    $('#bh-anim', actCard).setAttribute('aria-pressed', String(!s.anim));
    $('#bh-notes', actCard).textContent = 'Labels';
    $('#bh-notes', actCard).setAttribute('aria-pressed', String(!!s.notes));
    for (const [k, r] of Object.entries(rows)) {
      const v = s[k];
      if (document.activeElement !== r.num) r.num.value = r.d.log ? (+v).toPrecision(4) : (+v).toFixed(r.d.digits ?? 2);
      if (document.activeElement !== r.rng) r.rng.value = r.d.log ? Math.log(v) : v;
    }
  }

  let gpuStrip = null, rings = null;
  function drawMeasure() {
    const s = store.all(), o = app.model.obj;
    // the same measurement the tour quotes: the state's inclination in the telescope view
    const { incl, th, cmp } = measurement(s);
    let integ = null;
    try { integ = integratorShadow(s.a, incl, s.q); } catch { integ = null; }
    const rows2 = [];
    rows2.push(`<dt style="color:var(--text)">i = ${deg(incl)} deg, a/M = ${spinText(s.a)}${s.q ? `, Q/M = ${s.q.toFixed(2)}` : ''}, observer at ${s3(VIEWS.telescope.rcam)} M</dt>`);
    // a value is as strong as its weakest input: the shadow rests on the spin, its angle on the scale too; the
    // EHT's own numbers are sourced (fix_s2_brief C10)
    const it = inputTags(o), tag = (...ins) => (weakest(...ins.map((k) => (k === 'sourced' ? 'REAL' : it[k]))) === 'REAL' ? tagR : tagI);
    // the width row names how the shadow was obtained, in the words the plate uses (physics.js SHADOW_HOW; K4)
    rows2.push(dd(`width, ${SHADOW_HOW[th.how].label}`, s3(th.chords.width), 'M', tag('spin')));
    if (integ) rows2.push(dd('width, traced', s3(integ.width), 'M', tag('spin')));
    if (integ) rows2.push(dd('relative difference', s3(Math.abs(integ.width / th.chords.width - 1) * 100), '%', tagR, 'ink'));
    if (gpuStrip && gpuStrip.a === s.a && gpuStrip.q === s.q && gpuStrip.incl === incl) rows2.push(dd('width, GPU strip', pmText(gpuStrip.width, gpuStrip.res), 'M', tag('spin')));
    rows2.push(dd('height, B / traced', `${s3(th.chords.height)} / ${integ ? s3(integ.height) : '--'}`, 'M', tag('spin')));
    rows2.push(dd('mean diameter', s3(th.mean), 'M', tag('spin')), dd(MEAN_DEF, '', '', '', 'ink'));
    // the comparison is compareShadow's through measurement, the one rule every place that states it calls (ledger
    // row 2); every angle is printed with its scale's number, and the note names the scale's source (fix_s2_p1 S6)
    if (cmp) {
      const p = cmp.pred;
      rows2.push('<div class="hr"></div>');
      rows2.push(dd('scale θ_g', pmText(p.thetaG, p.thetaErrP, p.thetaErrM), 'µas per M', tag('mass', 'dist')), dd(`from ${p.by}`, '', '', '', 'ink'));
      rows2.push(dd(`shadow on the sky at that scale`, pmText(p.value, p.errP, p.errM), 'µas', tag('spin', 'mass', 'dist')));
    }
    if (cmp && o.eht) {
      if (cmp.shadow) {
        const sg = cmp.shadow.sigma;
        rows2.push(dd(`EHT shadow ${published(cmp.shadow.value, cmp.shadow.err, '±')}`, `<span class="bh-sig ${Math.abs(sg) < 2 ? 'good' : 'warn'}">${sigmaText(sg, 'σ')}</span>`, '', tag('spin', 'mass', 'dist', 'sourced')));
        // weigh it: the mass the EHT shadow implies with this traced diameter, at the distance named
        const Mimp = o.mass * cmp.shadow.value / cmp.pred.value, Merr = Mimp * Math.hypot(cmp.shadow.err / cmp.shadow.value, (o.distErr || 0) / o.distPc);
        rows2.push(dd(`mass the EHT shadow implies at ${parsecs(o.distPc)}`, pmText(Mimp, Merr), 'M☉', tag('spin', 'dist', 'sourced')));
      }
      // a ring only where no shadow was published (compareShadow carries none beside a shadow; S3)
      if (cmp.ring) rows2.push(dd('EHT ring of emission (no σ: a different quantity)', published(cmp.ring.value, cmp.ring.err, '±'), 'µas', tagR, 'ink'));
    } else if (cmp) {
      rows2.push(dd('EHT nominal resolution', String(EHT_RES.uas), 'µas', tagR));
    }
    if (rings) {
      rows2.push('<div class="hr"></div>');
      rows2.push(`<dt style="color:var(--text)">sub-rings, face-on, a/M = ${spinText(rings.a)}${rings.q ? `, Q/M = ${rings.q.toFixed(2)}` : ''}</dt>`);
      rows2.push(dd('n=2 / n=1 width', s3(rings.w[2] / rings.w[1]), '', tagR));
      rows2.push(dd('n=3 / n=2 width', s3(rings.w[3] / rings.w[2]), '', tagR));
      rows2.push(dd(rings.gamma == null ? 'e^-γ (Johnson 2020, Kerr only)' : 'e^-γ (Johnson 2020)', rings.gamma == null ? '--' : s3(Math.exp(-rings.gamma)), '', tagR));
    }
    $('#bh-meas').innerHTML = rows2.join('');
    // written from the comparison it describes (ledger row 2): the scale's source, what the EHT measured, and why a
    // ring gets no sigma
    $('#bh-measnote').textContent = cmp && o.eht
      ? `The size on the sky uses a scale the EHT image did not give: ${cmp.pred.by}, ${cmp.pred.src}.${cmp.ring ? ` ${noShadow(o.name)}` : ''} ${RULING}`
      : `Choose M87* or Sgr A* to compare with the Event Horizon Telescope.${cmp ? ` The scale here: ${cmp.pred.by}, ${cmp.pred.src}. The resolution: ${CITE[EHT_RES.src]}, ${EHT_RES.where}.` : ''}`;
  }

  $('#bh-strip', measCard).addEventListener('click', () => {
    if (store.get('view') !== 'telescope') store.set(store.viewPatch('telescope'), { instant: true });
    setTimeout(() => {
      const res = renderer.measureStrip(app.ui.frameUniforms(), STRIP_N);
      if (!res || !res.h) { $('#bh-measnote').textContent = 'The GPU strip needs float render targets, not available here.'; return; }
      const ro = store.shown.rcam;
      const b = (t) => K.angleToImpact(Math.atan(t), ro);
      gpuStrip = { width: b(res.h.hi) - b(res.h.lo), res: 2 * b(res.h.res), a: store.get('a'), q: store.get('q'), incl: store.get('incl') };
      drawMeasure();
      $('#bh-measnote').textContent = `The renderer traced a ${STRIP_N}-texel row through the shadow with the disk switched off; its edges, converted with the finite-distance factor, give the width above.`;
    }, 60);
  });
  $('#bh-rings', measCard).addEventListener('click', async () => {
    $('#bh-measnote').textContent = `Tracing ${SUBRING.samples} rays face-on out from the critical curve...`;
    try {
      const a = store.get('a'), q = store.get('q');
      const res = worker ? await call('subrings', { a, q }) : subringsInline({ a, q });
      rings = { ...res, a, q };
      drawMeasure();
      $('#bh-measnote').textContent = `Each further half-orbit thins the image by e^-γ. The n=3/n=2 ratio has converged; n=2/n=1 has not yet, as expected for the first sub-ring. Test annulus ${SUBRING.r0} to ${SUBRING.r1} M, observer face-on.`;
    } catch (e) { $('#bh-measnote').textContent = 'Sub-ring measurement needs a module worker: ' + e.message; }
  });

  /* ---------- diagrams ---------- */
  let probeRay = null;
  function drawXS() {
    const s = store.all(), m = app.model;
    $('#bh-xs').innerHTML = crossSection({ a: s.a, q: s.q, rh: m.rh, rph: m.rph, rphr: m.rphr, ri: m.ri, rout: s.rout, incl: s.incl, rcam: s.rcam, ray: probeRay });
  }
  function drawPotential(mark = null) {
    const s = store.all(), m = app.model;
    const Lisco = K.circular(s.a, m.ri, s.q).L;
    const p = potentialPlot({ a: s.a, q: s.q, rh: m.rh, rph: m.rph, ri: m.ri, Lisco, mark });
    $('#bh-pot').innerHTML = p.svg;
    $('#bh-potnote').textContent = `Located on the curves: photon orbit ${s3(p.rPh)} M (readout ${s3(m.rph)}), ISCO ${p.rIsco ? s3(p.rIsco) : '--'} M (readout ${s3(m.ri)}). Gas inside the ISCO has no stable orbit and plunges.`;
  }
  let profGeom = null;
  function drawProfile() {
    const s = store.all(), m = app.model;
    const p = diskProfile({ tab: m.tab, ri: m.ri, rout: s.rout, Tpeak: m.Tpeak, hl: app.hover.r, tdispK: s.tdisp });
    profGeom = p;
    $('#bh-prof').innerHTML = p.svg;
  }
  $('#bh-prof').addEventListener('pointermove', (e) => {
    const svg = $('#bh-prof svg'); if (!svg || !profGeom) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * profGeom.W;
    const u = (x - profGeom.L) / (profGeom.W - profGeom.L - profGeom.Rr);
    if (u < 0 || u > 1) return;
    app.hover.r = profGeom.r0 * Math.pow(profGeom.r1 / profGeom.r0, u);
    drawProfile(); app.request();
  });
  $('#bh-prof').addEventListener('pointerleave', () => { app.hover.r = 0; drawProfile(); app.request(); });
  function drawSpectrum() {
    const m = app.model;
    $('#bh-spec').innerHTML = spectrumPlot(anchors?.spectrum);
    const pk = anchors?.spectrum?.reduce((a, b) => (b[1] > a[1] ? b : a));
    $('#bh-specnote').textContent = m.Tpeak > 0 && pk
      ? `Observed νFν of every disk pixel: each a colour-corrected blackbody (f = ${s3(anchors.fcol)}) at its local temperature, shifted by its own g. Peak near ${photonEnergy(pk[0])} for ${sci(m.massSun)} M☉ at Eddington ratio ${sci(m.edd)}.`
      : 'Set an accretion rate to see the disk spectrum.';
  }

  /* ---------- the fall ---------- */
  const journey = {
    playing: false, tau: 0, rows: null,
    play() {
      // the fall the view is going to (incl may still be easing), with the hole's charge
      this.rows = fall(store.get('a'), store.get('incl'), 40, store.get('q'));
      this.tau = 0; this.playing = true; this.done = false;
      store.set({ observer: 'faller', rcam: 40 }, { instant: true, src: 'journey' });
    },
    stop() { this.playing = false; },
    tick(dt) {
      if (!this.playing || !this.rows) return;
      const total = this.rows[this.rows.length - 1].tau;
      this.tau = Math.min(total, this.tau + dt / 1000 * total / (store.reduced ? 1e9 : 22));
      const row = this.rows.find((r) => r.tau >= this.tau) || this.rows[this.rows.length - 1];
      const rStop = Math.max(row.r, app.model.rh * 1.08);
      store.set({ rcam: +rStop.toFixed(4), az: ((row.phi * 180 / Math.PI) % 360 + 540) % 360 - 180 }, { instant: true, src: 'journey' });
      if (rStop <= app.model.rh * 1.08 + 1e-6) { this.playing = false; this.done = true; app.request(); }
    },
  };
  $('#bh-fallgo', fallCard).addEventListener('click', () => { app.tour?.stop(); store.set(store.viewPatch('journey')); journey.play(); });
  $('#bh-fallstop', fallCard).addEventListener('click', () => journey.stop());
  let fallGeom = null;
  function drawFall() {
    const s = store.all(), m = app.model;
    const rows3 = fall(s.a, s.incl, 40, s.q);
    const tidalScale = K.SI.c * K.SI.c / (m.rg * m.rg) * 2 / K.SI.g0;
    const rc = s.rcam;
    const g = fallChart({ rows: rows3, tg: m.tg, rcur: s.view === 'journey' ? rc : null, rh: m.rh, ri: m.ri, rph: m.rph, tidalScale, tide10g: m.tide10g });
    fallGeom = g;
    $('#bh-fall').innerHTML = g.svg;
    const row = rows3.find((r) => r.r <= rc) || rows3[0];
    const inJ = s.view === 'journey';
    $('#bh-fallread').innerHTML = [
      dd('your clock τ since 40 M', inJ ? dur(row.tau * m.tg) : '--', '', tagR),
      dd('far clock t since 40 M', inJ ? dur(row.t * m.tg) : '--', '', tagR),
      dd('your speed vs hovering', inJ ? (store.get('observer') === 'faller' ? s3(Math.sqrt(1 - K.hoverClockRate(s.a, rc, s.incl * D2R, s.q) ** 2)) + ' c' : '--') : '--', '', tagR),
      dd(`tide on ${BODY_M} m here`, inJ ? `${sci(row.tidal * tidalScale * K.SI.g0)} m/s² · ${sci(row.tidal * tidalScale)} g` : '--', '', tagR),
      dd('horizon to r = 0 (a = 0 law 4M/3)', dur(4 / 3 * m.tg), '', tagR),
      dd('longest possible inside (πM)', dur(m.piM), '', tagR),
      dd('far clock: redshift e-fold every', dur(m.efold), '', tagR),
    ].join('');
  }
  let scrubbing = false;
  const scrub = (e) => {
    const svg = $('#bh-fall svg'); if (!svg || !fallGeom) return;
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * fallGeom.W;
    const u = Math.max(0, Math.min(1, (x - fallGeom.L) / (fallGeom.W - fallGeom.L - fallGeom.Rr)));
    const rh = fallGeom.rh * 0.999;
    const r = rh + (fallGeom.r1 - rh) * Math.pow((fallGeom.r0 - rh) / (fallGeom.r1 - rh), 1 - u);
    journey.stop();
    if (store.get('view') !== 'journey') store.set({ ...store.viewPatch('journey') }, { instant: true });
    store.set({ rcam: Math.max(r, app.model.rh * 1.08), observer: 'faller' }, { instant: true, src: 'scrub' });
  };
  $('#bh-fall').addEventListener('pointerdown', (e) => { scrubbing = true; e.target.setPointerCapture?.(e.pointerId); scrub(e); });
  $('#bh-fall').addEventListener('pointermove', (e) => { if (scrubbing) scrub(e); });
  $('#bh-fall').addEventListener('pointerup', () => { scrubbing = false; });

  /* ---------- the five-minute check ---------- */
  const quizState = { answers: {} };
  function drawQuiz() {
    const s = store.all(), m = app.model;
    // the shadow is the measurement's, at the inclination the question names (fix_s2_p1 K1)
    const ms = measurement(s);
    const Q = [
      { id: 'shadow', q: `How wide is this hole's shadow compared with its horizon (a = ${spinText(s.a)}, seen from far away at ${deg(ms.incl)} deg)?`,
        opts: [['the same', false], [`${s3(ms.toHorizon)} times wider`, true], ['half as wide', false]] },
      { id: 'side', q: 'Why is one side of the disk brighter?', opts: [['it is hotter there', false], ['gas moving toward you is beamed: I scales as g^4', true], ['the hole lights it', false]] },
      { id: 'isco', q: `Where does the disk end at a = ${spinText(s.a)}?`, opts: [[`at the horizon, ${s3(m.rh)} M`, false], [`at the ISCO, ${s3(m.ri)} M`, true], [`at the photon orbit, ${s3(m.rph)} M`, false]] },
      { id: 'clock', q: 'Falling in, what do you see on your own clock at the horizon?', opts: [['it stops', false], ['nothing special: it reads a finite time', true], ['it runs backward', false]] },
      { id: 'tide', q: `At ${sci(m.massSun)} M☉, does the tide tear a person apart before the horizon?`, opts: [['yes', m.tide10g > m.rh], ['no', m.tide10g <= m.rh]] },
    ];
    const score = Object.values(quizState.answers).filter(Boolean).length;
    $('#bh-score').textContent = `${score} / ${Q.length}`;
    $('#bh-quiz').innerHTML = Q.map((x) => `<p class="bh-note" style="color:var(--text)">${esc(x.q)}</p><div class="bh-seg">${x.opts.map(([t, ok], i) => {
      const chosen = quizState.answers[x.id + ':pick'] === i;
      return `<button class="bh-btn" type="button" data-q="${x.id}" data-i="${i}" data-ok="${ok ? 1 : 0}" aria-pressed="${chosen}">${esc(t)}${chosen ? `<small>${ok ? 'right' : 'not quite'}</small>` : ''}</button>`;
    }).join('')}</div>`).join('');
  }
  $('#bh-quiz').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-q]'); if (!b) return;
    quizState.answers[b.dataset.q] = b.dataset.ok === '1';
    quizState.answers[b.dataset.q + ':pick'] = +b.dataset.i;
    drawQuiz();
  });

  /* ---------- the probe ---------- */
  const canvas = $('#bh-canvas');
  function probeAt(px, py) {
    // the ray the renderer traced for this pixel: same view object (Store.view, charge
    // included), same pixel mapping, same horizon and ISCO (probe.js, tested in probe.test.mjs)
    const v = viewNow();
    const { sx, sy } = screenToTangent(px, py, window.innerWidth, window.innerHeight, v.fov);
    const res = traceProbe(v, sx, sy);
    const ri = res.rIn, q = v.q || 0;
    probeRay = res.path;
    app.probePt = [px, py];
    // brushing: a disk hit lights its radius in the profile plot and its annulus on the image
    app.hover.r = res.fate === 'disk' ? res.hits[0].r : 0;
    drawProfile(); drawPotential(res.fate === 'disk' ? res.hits[0].r : null); app.request();
    drawXS(); drawOverlay();
    // radii of the traced view (it can differ from the state's while a transition runs)
    const m = { rh: K.horizon(v.a, q), rph: K.photonOrbit(v.a, 1, q), rphr: K.photonOrbit(v.a, -1, q) };
    const lam = res.pphi / -res.pt;     // axial angular momentum per energy, in M
    let title, cause, deriv;
    if (res.fate === 'captured') {
      title = 'Shadow: this ray ends in the hole';
      cause = `Followed back, the light path crosses the horizon at r+ = ${s3(m.rh)} M. Its angular momentum per energy, ${s3(lam)} M, is too small to turn around at the photon orbits.`;
      // the curve is named as every label names it: how the shadow was obtained (physics.js SHADOW_HOW; K4)
      const how = q > 0 ? shadowFor(v.a, v.incl, q).how : 'bardeen';
      deriv = q > 0
        ? `${how === 'rn' ? `Reissner-Nordstrom, Q/M = ${q.toFixed(2)}: the critical curve is the ${SHADOW_HOW.rn.curve}, b_c = r_p / sqrt(1 - 2/r_p + Q^2/r_p^2) at r_p = (3 + sqrt(9 - 8 Q^2)) / 2.` : `Kerr-Newman, Q/M = ${q.toFixed(2)}: no closed-form critical curve is used.`} The ray is integrated in the Kerr-Schild form\n  g^mn = eta^mn - f k^m k^n,  f = r^2 (2 r - Q^2) / (r^4 + a^2 z^2)\nand captured when r < 0.98 r+, r+ = 1 + sqrt(1 - a^2 - Q^2) = ${s3(m.rh)} M.`
        : 'Critical curve (Bardeen 1973), spherical photon orbit radius r:\n  xi = (r^2 (3 - r) - a^2 (r + 1)) / (a (r - 1))\n  eta = r^3 (4 a^2 - r (r - 3)^2) / (a^2 (r - 1)^2)\n  alpha = -xi / sin i,  beta = +- sqrt(eta + a^2 cos^2 i - xi^2 cot^2 i)';
    } else if (res.fate === 'disk') {
      const h = res.hits[0];
      const nearIsco = h.r < ri * 1.08;
      title = h.n === 0 ? (nearIsco ? 'ISCO edge of the disk' : (res.g > 1.05 ? 'Approaching side of the disk' : res.g < 0.8 ? 'Receding side of the disk' : 'Disk, direct image')) : `Disk, n = ${h.n} image`;
      cause = h.n > 0 ? `This light crossed the disk plane ${h.n} time${h.n > 1 ? 's' : ''} outside the gas before landing at r = ${s3(h.r)} M: it went around the hole first.`
        : nearIsco ? `Gas here sits at r = ${s3(h.r)} M, just outside the last stable orbit at ${s3(ri)} M. Inside it, gas plunges and stops radiating.`
          : `Gas at r = ${s3(h.r)} M orbiting at ${s3(K.diskSpeed(v.a, h.r, q))} c. Its light reaches you shifted by g = ${s3(res.g)}, so intensity x ${s3(Math.pow(res.g, 4))}.`;
      deriv = `Redshift (circular orbit, conserved E and L of the ray):\n  g = 1 / (u^t (E - Omega L)),  ${q > 0 ? 'Omega = sqrt(r - Q^2) / (r^2 + a sqrt(r - Q^2))' : 'Omega = 1 / (r^1.5 + a)'}\n  here E = ${s3(-res.pt)}, L = ${s3(res.pphi)}, g = ${s3(res.g)}\nObserved intensity I = g^4 I_emit (I_nu / nu^3 is invariant).\nTemperature: Page & Thorne 1974 flux, T = (F / sigma)^(1/4).`;
    } else if (res.minr < m.rphr * 1.08) {
      title = 'Photon ring: light that skimmed the photon orbits';
      cause = `This ray came within ${s3(res.minr)} M of the centre, among the unstable photon orbits (${s3(m.rph)} to ${s3(m.rphr)} M), and was flung back out. Each extra half-orbit thins such images by e^-gamma.`;
      deriv = `Lyapunov exponent of the spherical photon orbit (Johnson et al. 2020):
  gamma = 4 r sqrt(chi) K(u+/u-) / (a sqrt(-u-)),  chi = 1 - Delta / (r (r - 1)^2)
  at a = 0, gamma = pi: each sub-ring is e^-pi = 1/23 of the last`;
    } else {
      title = 'Sky: this ray escaped';
      cause = `The light came from a star, bent on the way. Closest approach r = ${s3(res.minr)} M${res.minr < 3.5 ? ', close to the photon orbits: near the critical curve the sky is copied many times' : ''}.`;
      deriv = 'Null geodesics of g^mn = eta^mn - f k^m k^n (Kerr-Schild), integrated by RK4:\n  dx/dl = dH/dp,  dp/dl = -dH/dx,  H = 1/2 g^mn p_m p_n = 0';
    }
    probe.innerHTML = `<button class="x" type="button" aria-label="Close">×</button><h3>${title}</h3><p>${cause}</p>
      <dl class="bh-read">${dd('ray fate', res.fate === 'disk' ? `disk, n = ${res.hits[0].n}` : res.fate, '', tagR)}${dd('L / E (axial)', s3(lam), 'M', tagR)}${res.g ? dd('redshift g', s3(res.g), '', tagR) : ''}${dd('steps · |H| drift', `${res.steps} · ${res.drift.toExponential(1)}`, '', tagR)}</dl>
      <details><summary>the equation the code uses</summary><pre>${esc(deriv)}</pre></details>`;
    probe.hidden = false;
    const pw = 300;
    probe.style.left = `${Math.min(window.innerWidth - pw - 12, Math.max(12, px + 16))}px`;
    probe.style.top = `${Math.min(window.innerHeight - 260, Math.max(64, py - 40))}px`;
    $('.x', probe).addEventListener('click', () => { probe.hidden = true; app.probePt = null; app.hover.r = 0; drawProfile(); drawOverlay(); app.request(); });
    sr.textContent = `${title}. ${cause}`;
  }

  /* ---------- canvas input: drag orbits (azimuth free, inclination re-traces), wheel zooms ---------- */
  let drag = null;
  const pointers = new Map();
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, moved: 0, az: store.get('az'), incl: store.get('incl'), rcam: store.get('rcam') };
    if (pointers.size === 2) { const p = [...pointers.values()]; drag.pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    app.tour?.stop(); journey.stop();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && drag.pinch) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      store.set({ rcam: drag.rcam * drag.pinch / d }, { instant: true, src: 'drag' });
      drag.moved = 99; app.interacting = true; return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved < 4) return;
    app.interacting = true;
    store.set({ az: ((drag.az - dx * 0.3) % 360 + 540) % 360 - 180, incl: drag.incl - dy * 0.25 }, { instant: true, src: 'drag' });
  });
  const endDrag = (e) => {
    pointers.delete(e.pointerId);
    if (drag && drag.moved < 4 && e.type === 'pointerup') probeAt(e.clientX, e.clientY);
    if (pointers.size === 0) { drag = null; app.interacting = false; app.request(); }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); app.tour?.stop(); store.set({ rcam: store.get('rcam') * (e.deltaY > 0 ? 1.08 : 1 / 1.08) }, { dur: 250 }); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    const step = e.shiftKey ? 10 : 2;
    if (k === 'ArrowLeft') store.set({ az: store.get('az') - step * 2 });
    else if (k === 'ArrowRight') store.set({ az: store.get('az') + step * 2 });
    else if (k === 'ArrowUp') store.set({ incl: store.get('incl') - step });
    else if (k === 'ArrowDown') store.set({ incl: store.get('incl') + step });
    else if (k === '+' || k === '=') store.set({ rcam: store.get('rcam') / 1.15 });
    else if (k === '-' || k === '_') store.set({ rcam: store.get('rcam') * 1.15 });
    else if (k === 'Enter') { const r = canvas.getBoundingClientRect(); probeAt(r.width / 2, r.height / 2); }
    else if (k === ' ') store.set({ anim: !store.get('anim') });
    else return;
    e.preventDefault(); app.tour?.stop();
  });

  /* ---------- store subscription ---------- */
  let annTimer = 0;
  store.on((changed, s, src) => {
    if (changed.some((k) => ['a', 'q', 'incl', 'rcam', 'fov', 'tilt', 'rout', 'observer', 'emit', 'view', 'obj', 'edd', 'mass', 'fcol'].includes(k))) {
      if (src !== 'drag') probe.hidden = true;
      requestAnchors();
    }
    drawReadouts();
    drawOverlay();
    // announce regime changes for screen readers (throttled)
    clearTimeout(annTimer);
    annTimer = setTimeout(() => {
      const m = app.model;
      sr.textContent = `${m.obj ? m.obj.name : 'Custom hole'}, spin ${spinText(s.a)}, inclination ${deg(s.incl)} degrees, ${VIEWS[s.view].label} view, ${COLOR_MODES[s.color].label} colour. Horizon ${s3(m.rh)} M, ISCO ${s3(m.ri)} M.`;
    }, 700);
  });

  /* ---------- tour ---------- */
  app.tour = new Tour(app, { caption, toScreen, getAnchors: () => anchors, journey });
  $('#bh-tour', actCard).addEventListener('click', () => (app.tour.running ? app.tour.stop() : app.tour.start(0)));

  /* ---------- perf readout ---------- */
  const perfEl = $('#bh-perf'), perfEl2 = $('#bh-perf2');
  const tierCycle = ['auto', 'min', 'low', 'mid', 'high'];
  // the device name only: 'ANGLE (Vendor, Device (0x..) Direct3D11 ...)' -> 'Device', at most 26 characters
  const gpuFull = renderer.gpuName || '';
  let gpu = (gpuFull.replace(/^ANGLE \(/, '').split(',')[1] || gpuFull).replace(/\(0x[0-9A-Fa-f]+\)|Direct3D.*$|Vulkan.*$|\)\s*$/g, '').trim();
  if (/swiftshader/i.test(gpuFull)) gpu = 'SwiftShader (CPU)';
  if (gpu.length > 26) gpu = gpu.slice(0, 25) + '…';
  const perf = (p, res) => {
    const t = store.get('tier');
    const html = `<span title="${esc(gpuFull)}">${esc(gpu)}</span> · tier ${t === 'auto' ? 'auto/' + (p.tier || '--') : t} · median ${p.median ? p.median.toFixed(1) : '--'} ms${res && !res.refined ? ` · refining ${Math.round((res.progress || 0) * 100)}%` : ''}<button type="button" aria-label="Change quality tier">change</button>`;
    perfEl.innerHTML = html; perfEl2.innerHTML = html;
    [perfEl, perfEl2].forEach((n) => n.querySelector('button').addEventListener('click', () => store.set({ tier: tierCycle[(tierCycle.indexOf(t) + 1) % tierCycle.length] })));
  };

  /* ---------- per-frame hooks ---------- */
  let lastFallDraw = 0, wasEasing = false;
  const tick = (now, dt) => {
    journey.tick(dt);
    app.tour?.tick(now, dt);
    // a transition just ended: the image is the state's own view now, so trace its anchors
    // and redraw what is drawn from the eased values (critical curve, labels, tour focus)
    const easing = !!store.anim;
    if (wasEasing && !easing) { requestAnchors(); drawOverlay(); app.tour?.refresh(); }
    wasEasing = easing;
    if (store.get('view') === 'journey' && now - lastFallDraw > 120) { lastFallDraw = now; drawFall(); drawReadouts(); }
  };

  const start = () => {
    drawReadouts(); requestAnchors(); drawSpectrum();
    // title card: up to 1.8 s on first load, ended by any input, skipped for stills,
    // shared links and reduced motion
    const veil = $('#bh-veil');
    const lift = () => veil.classList.add('off');
    if (app.still || store.reduced || app.hasState) lift();
    else {
      setTimeout(lift, 1800);
      ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, lift, { once: true, passive: true }));
    }
    // the guided tour starts on its own unless the visitor arrived with a link, prefers
    // reduced motion, or the page is a still capture
    if (!app.hasState && !store.reduced && !app.still) setTimeout(() => { if (!app.tour.running && performance.now() - app.lastInput > 2500) app.tour.start(0); }, 3200);
    else app.tour.idleCaption();
    // ?ask=... asks the question box on load (a shareable question)
    const aq = new URLSearchParams(location.search).get('ask');
    if (aq) setTimeout(() => { $('#bh-askq').value = aq; ask.ask(aq); }, 600);
    // ?p=x,y (fractions of the screen) opens the probe on that pixel: a shareable traced ray
    const pq = new URLSearchParams(location.search).get('p');
    if (pq) {
      const [fx, fy] = pq.split(',').map(Number);
      if (Number.isFinite(fx) && Number.isFinite(fy)) setTimeout(() => probeAt(fx * window.innerWidth, fy * window.innerHeight), 400);
    }
  };
  ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { app.lastInput = performance.now(); }, { passive: true }));

  return {
    tick, perf, start, frameUniforms: () => app.frameUniforms(app), layout: () => { drawOverlay(); requestAnchors(); },
    onRefined: () => drawOverlay(), anchors: () => anchors, liveAnchors: anchorsLive, ask,
  };
}
