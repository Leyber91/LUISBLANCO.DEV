/* ============================================================
   dimensional_mania/controls.js — every control on the page and the
   readouts that are plain DOM. It holds no geometry: it calls the
   app's setters and redraws itself from app.s on sync().
   Keyboard: - / = dimension, , / . object, [ / ] slice height,
   space pause, v view, p projection, t the ladder, arrows on the dial
   (1 degree, 15 with shift) and on the pad.
   ============================================================ */

import { AXES, CONFIG, VIEWS, PROJECTIONS, PRESETS, PRESET_ORDER, TOUR, SOURCES, TIERS, TIER_ORDER, EXPLAIN } from './constants.js';
import { catalogue, regularCount, build } from './polytopes.js';
import { el, escapeHTML, degOf } from './dom.js';

const $ = (id) => document.getElementById(id);
const INSET_LABEL = { down: 'one down', schlegel: 'Schlegel', base: 'base sphere', net: 'flat net' };

/* the one-line hint under the caption: how to orbit, zoom and turn a hidden axis.
   Touch: a second finger turns the plane (main._canvasHands), so pinch does not zoom; the slider does. */
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export function hintText(n, hand, plane, coarse = COARSE) {
  const zoom = coarse ? 'zoom with the zoom slider' : 'scroll to zoom';
  if (n < 2) return `drag to orbit · ${zoom}`;
  const i = Math.min(plane[0], plane[1]), j = Math.max(plane[0], plane[1]);
  const pl = `${AXES[plane[0]]}–${AXES[plane[1]]}`;
  const how = i >= 3 ? `${pl}, a plane of two hidden axes` : j >= 3 ? `${pl} through the hidden axis ${AXES[j]}`
    : n >= 4 ? `${pl} (pick a plane with ${AXES[3]} to turn a hidden axis)` : pl;
  if (hand) return `drag turns ${how} · ${zoom}`;
  return coarse ? `drag to orbit · two fingers turn ${how} · ${zoom}` : `drag to orbit · ${zoom} · shift-drag turns ${how}`;
}

export class Controls {
  constructor(app) {
    this.app = app;
    this._build();
    this._keys();
    this._titles();
  }

  _seg(host, items, onPick, cls = 'sg') {
    host.innerHTML = '';
    const out = {};
    for (const it of items) {
      const b = el('button', cls, escapeHTML(it.label));
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => onPick(it.id));
      host.appendChild(b);
      out[it.id] = b;
    }
    return out;
  }

  _build() {
    const app = this.app;
    const dims = $('dims');
    this.dimBtns = [];
    for (let n = CONFIG.minDim; n <= CONFIG.maxDim; n++) {
      const b = el('button', 'dim', `<b>${n}</b><i>D</i>`);
      b.type = 'button';
      b.setAttribute('aria-label', `${n} dimensions`);
      b.addEventListener('click', () => app.setDim(n));
      dims.appendChild(b);
      this.dimBtns.push(b);
    }
    this.viewBtns = this._seg($('views'), VIEWS, (id) => app.set({ view: id }));
    this.projBtns = this._seg($('projs'), PROJECTIONS, (id) => app.set({ proj: id }));
    this.presetBtns = this._seg($('presets'), PRESET_ORDER.map((id) => ({ id, label: PRESETS[id].label })), (id) => app.set({ preset: id }));
    this.cutBtns = this._seg($('cuts'), [{ id: 'vertex', label: 'vertex' }, { id: 'edge', label: 'edge' }, { id: 'face', label: 'face' }, { id: 'cell', label: 'cell' }], (id) => app.cutPreset(id));
    this.matBtns = this._seg($('matShow'), [{ id: 'R', label: 'R pose' }, { id: 'A', label: 'A generator' }], (id) => { app.matShow = id; this.sync(); });

    this._range('fold', CONFIG.foldRange[0], CONFIG.foldRange[1], 0.01, (v) => app.set({ D: v }), (v) => `${v.toFixed(2)}`);
    this._range('zoom', 4.5, 30, 0.1, (v) => app.stage.setZoom(v), (v) => `${v.toFixed(1)}`);
    this._range('speed', 0, 2, 0.01, (v) => app.set({ speed: v }), (v) => `${v.toFixed(2)}×`);
    this._range('hslide', -1, 1, 0.002, (v) => app.set({ h: v, sweep: false }), (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(3)}`);

    $('sweep').addEventListener('click', () => app.set({ sweep: !app.s.sweep }));
    $('trails').addEventListener('click', () => app.set({ trails: !app.s.trails }));
    $('pause').addEventListener('click', () => app.togglePause());
    $('resetView').addEventListener('click', () => { app.stage.resetView(); this._setRange('zoom', app.stage.zoom()); });
    $('pose').addEventListener('click', () => app.setPose('seed'));
    $('dual').addEventListener('click', () => app.dual());
    $('handTurn').addEventListener('click', () => { app.handTurn = !app.handTurn; app.obs.try('hands'); this.sync(); });
    $('openFile').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; if (f) app.importFile(f); });
    $('facetPrev').addEventListener('click', () => app.nextFacet(-1));
    $('facetNext').addEventListener('click', () => app.nextFacet(1));
    $('farSide').addEventListener('click', () => { app.inset.probe.far = !app.inset.probe.far; app.inset.probe.e = Math.PI / 2 - app.inset.probe.e; app.probeMoved(); this.sync(); });

    /* the dial: drag, or arrow keys, turns the selected plane */
    const dial = $('dial');
    let last = null;
    const angleAt = (ev) => { const r = dial.getBoundingClientRect(); return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)); };
    dial.addEventListener('pointerdown', (ev) => { ev.preventDefault(); dial.setPointerCapture(ev.pointerId); last = angleAt(ev); app.dialGrab(true); });
    dial.addEventListener('pointermove', (ev) => {
      if (last == null) return;
      const a = angleAt(ev);
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      last = a; app.turn(d);
    });
    const up = () => { if (last != null) { last = null; app.dialGrab(false); } };
    dial.addEventListener('pointerup', up);
    dial.addEventListener('pointercancel', up);
    dial.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 15 : 1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { app.turn((step * Math.PI) / 180); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { app.turn((-step * Math.PI) / 180); ev.preventDefault(); }
    });

    /* the pad: two hidden planes at once, X–W across and Y–W up and down */
    const pad = $('pad');
    let pl = null;
    pad.addEventListener('pointerdown', (ev) => { ev.preventDefault(); pad.setPointerCapture(ev.pointerId); pl = { x: ev.clientX, y: ev.clientY }; app.dialGrab(true); });
    pad.addEventListener('pointermove', (ev) => {
      if (!pl) return;
      const n = app.s.n;
      if (n >= 4) { app.turn((ev.clientX - pl.x) * 0.012, [0, 3]); app.turn(-(ev.clientY - pl.y) * 0.012, [1, 3]); }
      else if (n >= 2) { app.turn((ev.clientX - pl.x) * 0.012, [0, n - 1]); if (n === 3) app.turn(-(ev.clientY - pl.y) * 0.012, [1, 2]); }
      pl = { x: ev.clientX, y: ev.clientY };
      app.obs.try('pad');
      const r = pad.getBoundingClientRect();
      pad.style.setProperty('--px', `${Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100))}%`);
      pad.style.setProperty('--py', `${Math.max(0, Math.min(100, ((ev.clientY - r.top) / r.height) * 100))}%`);
    });
    const padUp = () => { if (pl) { pl = null; app.dialGrab(false); pad.style.setProperty('--px', '50%'); pad.style.setProperty('--py', '50%'); } };
    pad.addEventListener('pointerup', padUp);
    pad.addEventListener('pointercancel', padUp);
    pad.addEventListener('keydown', (ev) => {
      const k = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
      if (!k || app.s.n < 4) return;
      ev.preventDefault();
      const d = ((ev.shiftKey ? 15 : 2) * Math.PI) / 180;
      if (k[0]) app.turn(k[0] * d, [0, 3]); else app.turn(k[1] * d, [1, 3]);
    });

    /* the ladder and the three questions after it */
    $('tourStart').addEventListener('click', () => app.tour(0));
    $('tourPrev').addEventListener('click', () => app.tour(app.tourIdx - 1));
    $('tourNext').addEventListener('click', () => (app.tourIdx >= TOUR.length - 1 ? app.tourEnd(true) : app.tour(app.tourIdx + 1)));
    $('tourExit').addEventListener('click', () => app.tourEnd());
    $('quizClose').addEventListener('click', () => { $('quiz').hidden = true; $('tourStart').hidden = false; });
    document.querySelectorAll('[data-quiz]').forEach((form) => form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const r = app.quizAnswer(+form.dataset.quiz, form.querySelector('input').value);
      const out = form.querySelector('.qa');
      out.textContent = r.text;
      out.className = 'qa ' + (r.ok ? 'ok' : 'miss');
    }));

    /* ask, and the next experiment */
    $('ask').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = $('q').value.trim();
      if (q) app.ask(q);
    });
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { $('q').value = b.dataset.q; app.ask(b.dataset.q); }));
    $('sugTry').addEventListener('click', () => { const s = this._sug; if (s) { app.obs.try(s.id); app.obs.note(`tried: ${s.text}`); s.act(app); } });

    /* share, keep, read */
    $('copyLink').addEventListener('click', () => app.copyLink());
    $('savePlate').addEventListener('click', () => app.savePlate());
    $('savePNG').addEventListener('click', () => app.savePNG());
    $('saveJSON').addEventListener('click', () => app.saveJSON());
    $('saveOBJ').addEventListener('click', () => app.saveOBJ());
    this.tierBtns = this._seg($('tiers'), [{ id: 'auto', label: 'auto' }, ...TIER_ORDER.map((id) => ({ id, label: TIERS[id].label }))], (id) => app.setTier(id), 'tg');
    for (const [btn, kind] of [['mechBtn', 'mech'], ['explainBtn', 'explain'], ['logBtn', 'log']]) {
      $(btn).addEventListener('click', () => this.drawer(app.drawer === kind ? null : kind));
    }
    $('drawerClose').addEventListener('click', () => this.drawer(null));
    $('drawerCopy').addEventListener('click', async () => {
      const t = $('drawerBody').innerText;
      try { await navigator.clipboard.writeText(t); $('drawerCopy').textContent = 'copied'; } catch { $('drawerCopy').textContent = 'select and copy'; }
      setTimeout(() => { $('drawerCopy').textContent = 'copy'; }, 1800);
    });

    $('sources').innerHTML = SOURCES.map((s) => `<li>${escapeHTML(s.text)}</li>`).join('');
  }

  /** every control carries its mathematical one-liner as a title */
  _titles() {
    for (const [id, , text] of EXPLAIN) {
      const node = $(id);
      if (node) node.title = text;
    }
  }

  _range(id, min, max, step, onInput, show) {
    const input = $(id), out = $(id + 'Val');
    Object.assign(input, { min, max, step });
    input.addEventListener('input', () => { const v = parseFloat(input.value); onInput(v); if (out) out.textContent = show(v); });
    this[id] = { input, out, show };
  }

  _setRange(id, v) {
    const r = this[id];
    if (!r) return;
    if (document.activeElement !== r.input) r.input.value = v;
    if (r.out) r.out.textContent = r.show(v);
  }

  _keys() {
    const app = this.app;
    document.addEventListener('keydown', (ev) => {
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const s = app.s;
      const objs = catalogue(s.n);
      const oi = objs.findIndex((o) => o.id === s.obj);
      switch (ev.key) {
        case '-': app.setDim(s.n - 1); break;
        case '=': case '+': app.setDim(s.n + 1); break;
        case ',': app.set({ obj: objs[(oi - 1 + objs.length) % objs.length].id }); break;
        case '.': app.set({ obj: objs[(oi + 1) % objs.length].id }); break;
        case '[': app.set({ h: Math.max(-1, s.h - 0.02), sweep: false }); break;
        case ']': app.set({ h: Math.min(1, s.h + 0.02), sweep: false }); break;
        case ' ': if (t && (t.tagName === 'BUTTON' || t.id === 'dial' || t.id === 'pad')) return; app.togglePause(); break;
        case 'v': { const i = VIEWS.findIndex((v) => v.id === s.view); app.set({ view: VIEWS[(i + 1) % VIEWS.length].id }); break; }
        case 'p': { const i = PROJECTIONS.findIndex((v) => v.id === s.proj); app.set({ proj: PROJECTIONS[(i + 1) % PROJECTIONS.length].id }); break; }
        case 't': app.tourIdx >= 0 ? app.tourEnd() : app.tour(0); break;
        case 'Escape': if (app.tourIdx >= 0) app.tourEnd(); else if (app.drawer) this.drawer(null); else app.pick = null; break;
        default: return;
      }
      ev.preventDefault();
    });
  }

  /** redraw every state-dependent control from app.s */
  sync() {
    const app = this.app, s = app.s, n = s.n;
    this.dimBtns.forEach((b, i) => { const on = i + CONFIG.minDim === n; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.classList.toggle('lit', i + CONFIG.minDim < n); });

    const objs = catalogue(n);
    const host = $('objs');
    host.innerHTML = '';
    for (const o of objs) {
      const b = el('button', 'chip' + (o.curved ? ' curved' : ''), escapeHTML(o.label));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(o.id === s.obj));
      b.classList.toggle('on', o.id === s.obj);
      b.addEventListener('click', () => app.set({ obj: o.id }));
      host.appendChild(b);
    }
    const o = app.o;
    const rc = regularCount(n);
    const grp = o.group ? `symmetry <i class="mth">${escapeHTML(o.group.name).replace(/(\d+)/, '<sub>$1</sub>')}</i>, order ${o.group.order.toLocaleString('en-US')}` : '';
    const ok = o.metrics && o.ref && Math.abs(o.metrics.re - o.ref.re) < 1e-9 && (o.ref.dihedral == null || Math.abs(o.metrics.dihedral - o.ref.dihedral) < 1e-6);
    const met = o.metrics && o.ref ? `<span class="met" title="circumradius over edge length, and the angle between two adjacent facets">R/e ${o.metrics.re.toFixed(4)}${o.metrics.dihedral != null ? ` · dihedral ${o.metrics.dihedral.toFixed(2)}°` : ''} <span class="tg">${ok ? 'closed form: match' : 'closed form: differs'}</span></span>` : '';
    $('objline').innerHTML = `<b>${escapeHTML(o.name)}</b>${o.schlafli ? ` <span class="sch mth">${escapeHTML(o.schlafli)}</span>` : ''}<span class="grp">${grp}</span>${met}`;
    $('rcline').textContent = n === 1 ? '1D: 1 regular' : rc === Infinity ? '2D: one per p' : `${n}D: ${rc} regular`;
    $('rcline').title = 'regular convex polytopes in this dimension (Schläfli 1852; Coxeter 1973)';
    const d = o.dual && o.dual !== o.id ? build(o.dual, n) : null;
    $('dual').textContent = o.curved ? 'dual' : d ? `dual → ${d.name}` : 'self-dual';
    $('dual').disabled = o.curved || n < 2;

    const sliceOK = app.sliceAllowed();
    for (const v of VIEWS) {
      const b = this.viewBtns[v.id];
      b.textContent = n <= 3 ? v.low : v.label;
      const on = app.effView() === v.id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      b.disabled = v.id !== 'shadow' && !sliceOK;
    }
    for (const p of PROJECTIONS) {
      const b = this.projBtns[p.id];
      const on = app.effProj() === p.id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      b.disabled = (p.only4 && n !== 4) || n <= 3;
    }
    $('projNote').textContent = n <= 3 ? 'nothing to project below 4D' : s.proj === 'stereo' && n !== 4 ? 'stereographic works on the 3-sphere: 4D only' : app.effProj() === 'stereo' && s.view !== 'shadow' ? 'a slice needs a flat projection' : '';
    $('foldRow').hidden = !(n >= 4 && app.effProj() === 'persp');
    this._setRange('fold', s.D);
    this._setRange('zoom', app.stage.zoom());

    for (const id of PRESET_ORDER) {
      const b = this.presetBtns[id];
      const on = s.preset === id;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
      b.disabled = n < 2 || ((id === 'double' || id === 'iso') && n < 4) || (id === 'fibre' && !app.flowAllowed());
    }
    for (const id in this.matBtns) { const on = app.matShow === id; this.matBtns[id].classList.toggle('on', on); this.matBtns[id].setAttribute('aria-pressed', on); }
    this._planes();
    this._setRange('speed', s.speed);
    this._setRange('hslide', s.h);
    $('sweep').classList.toggle('on', s.sweep); $('sweep').setAttribute('aria-pressed', s.sweep);
    $('trails').classList.toggle('on', s.trails); $('trails').setAttribute('aria-pressed', s.trails);
    $('trails').disabled = !app.trailsAllowed();
    $('pause').textContent = app.reduced ? 'still' : app.paused ? 'play' : 'pause';
    $('pause').title = app.reduced ? 'reduced motion is on: the view holds a composed frame' : 'space';
    $('pause').disabled = app.reduced;
    $('handTurn').classList.toggle('on', !!app.handTurn); $('handTurn').setAttribute('aria-pressed', String(!!app.handTurn));
    $('handTurn').textContent = app.handTurn ? `drag turns ${AXES[s.plane[0]]}–${AXES[s.plane[1]]}` : 'drag orbits';
    const hint = hintText(n, !!app.handTurn, s.plane);
    if ($('hint').textContent !== hint) $('hint').textContent = hint;
    $('sliceBlk').classList.toggle('off', app.effView() === 'shadow');
    for (const id in this.cutBtns) this.cutBtns[id].disabled = n < 2 || o.curved || ((id === 'face' || id === 'cell') && n < 3) || (id === 'cell' && n === 3);

    // the second view
    const modes = app.inset.modesFor(o);
    if (!modes.includes(app.inset.mode)) app.inset.mode = modes[0] || 'down';
    const mh = $('insetModes');
    mh.innerHTML = '';
    for (const m of modes) {
      const b = el('button', '', INSET_LABEL[m]);
      b.type = 'button';
      b.classList.toggle('on', app.inset.mode === m);
      b.setAttribute('aria-pressed', String(app.inset.mode === m));
      b.addEventListener('click', () => { app.inset.mode = m; if (m === 'schlegel') { app.obs.try('facet'); app.showFacet = true; } this.sync(); });
      mh.appendChild(b);
    }
    const facets = o.facets && n >= 3;
    $('facetRow').hidden = !facets || app.inset.mode !== 'schlegel';
    if (facets) $('facetLabel').textContent = `${n === 4 ? 'cell' : n === 3 ? 'face' : 'facet'} ${app.facetIdx + 1} / ${o.facets.length}`;
    $('farSide').hidden = o.id !== 'hopf';
    $('farSide').textContent = app.inset.probe.far ? 'near side' : 'far side';

    const t = app.tierChoice;
    for (const id in this.tierBtns) { const on = id === t; this.tierBtns[id].classList.toggle('on', on); this.tierBtns[id].setAttribute('aria-pressed', on); }
  }

  _planes() {
    const app = this.app, s = app.s, n = s.n;
    const host = $('planes');
    host.innerHTML = '';
    if (n < 2) { host.appendChild(el('p', 'none', 'a segment has no plane to turn in')); return; }
    host.style.setProperty('--cols', n - 1);
    const spinning = new Set(app.spin.map((p) => `${p.i}${p.j}`));
    for (let i = 0; i < n - 1; i++) {
      for (let j = 1; j < n; j++) {
        if (j <= i) { host.appendChild(el('span', 'pc void')); continue; }
        const b = el('button', 'pc', `${AXES[i]}${AXES[j]}`);
        b.type = 'button';
        const sel = s.plane[0] === i && s.plane[1] === j;
        b.classList.toggle('sel', sel);
        b.classList.toggle('spin', spinning.has(`${i}${j}`));
        b.classList.toggle('hid', j >= 3);
        b.setAttribute('aria-pressed', String(sel));
        b.setAttribute('aria-label', `plane ${AXES[i]}–${AXES[j]}${spinning.has(`${i}${j}`) ? ', turning' : ''}`);
        b.addEventListener('click', () => app.set({ plane: [i, j] }));
        host.appendChild(b);
      }
    }
  }

  dial(turned, plane) {
    $('dial').style.setProperty('--deg', `${(turned * 180) / Math.PI}deg`);
    $('dial').setAttribute('aria-valuenow', String(degOf(turned)));
    $('dialread').innerHTML = `<span class="pl">plane <b class="mth">${AXES[plane[0]]}–${AXES[plane[1]]}</b></span><span class="tn">turned ${degOf(turned)}°</span>`;
  }

  /** quiet: the same sentence with new numbers, so no fade-in */
  witness(text, kind, quiet = false) {
    const p = $('witness');
    if (p.textContent === text) return;
    p.textContent = text;
    p.dataset.kind = kind;
    if (quiet) return;
    p.classList.remove('fresh'); void p.offsetWidth; p.classList.add('fresh');
  }

  suggest(s) {
    this._sug = s;
    $('suggest').hidden = !s;
    if (s) $('sugText').textContent = s.text;
  }

  showTour(k) {
    const st = TOUR[k];
    $('tourStart').hidden = true;
    $('quiz').hidden = true;
    $('tour').hidden = false;
    $('tourStep').textContent = `${k + 1} / ${TOUR.length}`;
    $('tourTitle').textContent = st.title;
    $('tourText').textContent = st.text;
    $('tourPrev').disabled = k === 0;
    $('tourNext').textContent = k === TOUR.length - 1 ? 'check yourself' : 'next';
    $('tourBar').style.width = `${((k + 1) / TOUR.length) * 100}%`;
  }

  hideTour() {
    $('tour').hidden = true;
    $('tourStart').hidden = false;
  }

  showQuiz() {
    $('tourStart').hidden = true;
    $('quiz').hidden = false;
    const i = $('quiz').querySelector('input');
    if (i) i.focus();
  }

  drawer(kind) {
    const app = this.app;
    app.drawer = kind;
    $('drawer').hidden = !kind;
    for (const [btn, k] of [['mechBtn', 'mech'], ['explainBtn', 'explain'], ['logBtn', 'log']]) $(btn).classList.toggle('on', kind === k);
    if (!kind) return;
    $('drawerTitle').textContent = kind === 'mech' ? 'the mechanism, live' : kind === 'explain' ? 'what each control does' : 'session log';
    $('drawerCopy').hidden = kind !== 'log';
    if (kind === 'explain') {
      $('drawerBody').innerHTML = `<dl class="ex">${EXPLAIN.map(([, name, text]) => `<dt>${escapeHTML(name)}</dt><dd>${escapeHTML(text)}</dd>`).join('')}</dl>`;
    } else if (kind === 'log') {
      $('drawerBody').innerHTML = `<pre class="log">${escapeHTML(app.obs.text())}</pre>`;
    } else this.drawerText(app.mechanismText());
  }

  drawerText(rows) {
    if (this.app.drawer !== 'mech') return;
    $('drawerBody').innerHTML = `<table class="mech">${rows.map(([k, f, v]) => `<tr><th>${escapeHTML(k)}</th><td class="mth f">${escapeHTML(f)}</td><td class="v">${escapeHTML(v)}</td></tr>`).join('')}</table>`;
  }

  answer(html, pending) {
    const a = $('answer');
    a.hidden = false;
    a.innerHTML = html;
    a.classList.toggle('pending', !!pending);
  }

  fps(text) { $('fps').textContent = text; }

  /** the sweep moves h on its own: keep the slider honest */
  liveH(h) { this._setRange('hslide', h); }
}
