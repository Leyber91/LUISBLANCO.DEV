/* ============================================================
   dimensional_mania/Console.js — the control console + every live
   readout for the WITNESS instrument:

     · the Dimension stepper + dot strip
     · the live element ledger (vertices/edges/faces/.../planes)
     · the Rotation presets + fold-plane chips + the Plane Dial
     · the Projection toggles + the fold/speed/scale sliders
     · the View toggles (vertices/trails/reset) + pause
     · the Shadow Ledger (per-hidden-axis projective distortion)
     · the diegetic caption

   It owns NO geometry and NO render state — it reads/writes the
   Witness controller's public API and wires the onState/onDim/
   onDial/onTick callbacks. UI tables (presets, projections,
   sliders) come from constants so a new control is data, not code.
   ============================================================ */

import {
  AXES, POLY_NAMES, faceCount, elementLedger, binomial,
} from './n_dimensional_cube.js';
import {
  SEL, CONFIG, glossFor,
  PRESET_ORDER, PRESETS, PROJECTION_ORDER, PROJECTION,
  SLIDERS, DIAL, LEDGER, TWEEN,
} from './constants.js';
import { el, fmt, deg } from './dom.js';

export class Console {
  /**
   * @param {HTMLElement} host  #dx-controls
   * @param {import('./Witness.js').Witness} w
   * @param {boolean} reduceMotion
   */
  constructor(host, w, reduceMotion) {
    this.host = host;
    this.w = w;
    this.reduceMotion = reduceMotion;
    this.tweens = {};
    this._build();
  }

  _build() {
    const w = this.w;
    this.titleEl = document.querySelector(SEL.title);
    this.captionEl = document.querySelector(SEL.caption);
    this.ledgerEl = document.getElementById(SEL.ledger.slice(1));

    const panel = el('div', 'dx-panel');
    const head = el('div', 'dx-panel-head', '<span>Dimensions</span>');
    const collapse = el('button', 'dx-collapse', '–');
    head.appendChild(collapse);
    panel.appendChild(head);
    const body = el('div', 'dx-panel-body');

    /* ---- DIMENSION stepper ---- */
    body.appendChild(el('div', 'dx-section', 'Dimension'));
    const stepper = el('div', 'dx-stepper');
    const minus = el('button', 'dx-step', '−');
    const plus = el('button', 'dx-step', '+');
    this.dimReadout = el('div', 'dx-dim-readout',
      `<span class="dx-dim-n"></span><span class="dx-dim-name"></span>`);
    stepper.append(minus, this.dimReadout, plus);
    body.appendChild(stepper);
    const dots = el('div', 'dx-dots');
    this.dotEls = [];
    for (let i = CONFIG.minDim; i <= CONFIG.maxDim; i++) {
      const d = el('span', 'dx-dot'); dots.appendChild(d); this.dotEls.push(d);
    }
    body.appendChild(dots);

    /* ---- live readout ---- */
    this.readout = el('div', 'dx-readout');
    body.appendChild(this.readout);
    this.chain = el('div', 'dx-chain');
    body.appendChild(this.chain);
    this.gloss = el('div', 'dx-gloss');
    body.appendChild(this.gloss);

    /* ---- ROTATION ---- */
    body.appendChild(el('div', 'dx-section', 'Rotation'));
    const presetRow = el('div', 'dx-presets');
    this.presetBtns = {};
    PRESET_ORDER.forEach((id) => {
      const b = el('button', 'dx-preset', PRESETS[id].label);
      b.addEventListener('click', () => { w.applyPreset(id); });
      this.presetBtns[id] = b;
      presetRow.appendChild(b);
    });
    body.appendChild(presetRow);

    // plane selector
    this.planesWrap = el('div', 'dx-planes');
    body.appendChild(this.planesWrap);

    // the Plane Dial
    const dialWrap = el('div', 'dx-dial-wrap');
    this.dial = el('div', 'dx-dial');
    this.dialMeta = el('div', 'dx-dial-meta',
      `<div class="dx-dial-plane"></div><div class="dx-dial-deg"></div>`);
    this.scrub = el('input', 'dx-scrub');
    Object.assign(this.scrub, {
      type: 'range', min: DIAL.scrubMin, max: DIAL.scrubMax, step: DIAL.scrubStep, value: 0,
    });
    this.dialMeta.appendChild(this.scrub);
    dialWrap.append(this.dial, this.dialMeta);
    body.appendChild(dialWrap);

    /* ---- PROJECTION ---- */
    body.appendChild(el('div', 'dx-section', 'Projection'));
    const projToggles = el('div', 'dx-toggles');
    this.projBtns = {};
    PROJECTION_ORDER.forEach((id) => {
      const b = el('button', 'dx-toggle', PROJECTION[id].label);
      b.addEventListener('click', () => { w.projMode = id; this._syncProj(); w.project(); });
      this.projBtns[id] = b; projToggles.appendChild(b);
    });
    body.appendChild(projToggles);

    this.sliders = {};
    this._mkSlider(body, 'dist', w.projDistance,
      (v) => { w.projDistance = v; }, (v) => v.toFixed(2));
    this._mkSlider(body, 'speed', w.speed,
      (v) => { w.speed = v; }, (v) => v.toFixed(2));
    this._mkSlider(body, 'size', w.size,
      (v) => { w.setScale(v); }, (v) => v.toFixed(2));

    /* ---- VIEW ---- */
    body.appendChild(el('div', 'dx-section', 'View'));
    const viewToggles = el('div', 'dx-toggles');
    this.vertsBtn = el('button', 'dx-toggle', 'Vertices');
    this.vertsBtn.addEventListener('click', () => {
      w.setVerticesVisible(!w.showVertices);
      this.vertsBtn.classList.toggle('on', w.showVertices);
    });
    this.trailsBtn = el('button', 'dx-toggle', 'Trails');
    this.trailsBtn.addEventListener('click', () => { w.toggleTrails(); this._syncView(); });
    const resetBtn = el('button', 'dx-toggle', 'Reset view');
    resetBtn.addEventListener('click', () => { w.resetView(); });
    viewToggles.append(this.vertsBtn, this.trailsBtn, resetBtn);
    body.appendChild(viewToggles);

    this.pauseBtn = el('button', 'dx-pause', this.reduceMotion ? 'Reduced motion' : 'Pause');
    if (this.reduceMotion) this.pauseBtn.disabled = true;
    let paused = this.reduceMotion;
    this.pauseBtn.addEventListener('click', () => {
      if (this.reduceMotion) return;
      paused = !paused; w.pause(paused); this.pauseBtn.textContent = paused ? 'Play' : 'Pause';
    });
    body.appendChild(this.pauseBtn);

    panel.appendChild(body);
    this.host.appendChild(panel);

    collapse.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      collapse.textContent = hidden ? '–' : '+';
    });

    /* ---- dial interaction ---- */
    let dialBase = 0, dialStart = 0;
    const pointerAngle = (ev) => {
      const r = this.dial.getBoundingClientRect();
      return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
    };
    this.dial.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      w.dragging = true;
      w.applyPreset('still');            // grabbing the dial stops the idle spin
      dialStart = pointerAngle(ev);
      dialBase = w.selectedAngle();
      this.dial.setPointerCapture(ev.pointerId);
    });
    this.dial.addEventListener('pointermove', (ev) => {
      if (!w.dragging) return;
      const delta = pointerAngle(ev) - dialStart;
      w.setSelectedAngle(dialBase + delta);
      this._syncDial();
    });
    const dialUp = (ev) => {
      if (!w.dragging) return;
      w.dragging = false;
      try { this.dial.releasePointerCapture(ev.pointerId); } catch (e) {}
    };
    this.dial.addEventListener('pointerup', dialUp);
    this.dial.addEventListener('pointercancel', dialUp);
    this.scrub.addEventListener('input', () => {
      w.setSelectedAngle(parseFloat(this.scrub.value) * Math.PI / 180);
      this._syncDial();
    });

    /* ---- steppers ---- */
    minus.addEventListener('click', () => w.setDim(w.dim - 1));
    plus.addEventListener('click', () => w.setDim(w.dim + 1));

    // wire instrument callbacks
    w.onState = () => { this._syncPresets(); this._syncPlanes(); this._syncDial(); };
    w.onDial = () => { this._syncDial(); this._tickCaption(); };
    w.onDim = () => { this._syncReadout(); this._syncProj(); this._buildLedger(); this._syncView(); };
    w.onTick = (stress) => { this._tickLedger(stress); this._tickCaption(); };

    // initial paint
    this._syncReadout(); this._syncProj(); this._syncPlanes();
    this._syncDial(); this._syncPresets(); this._buildLedger(); this._syncView();
  }

  _mkSlider(body, key, value, set, fmtv) {
    const spec = SLIDERS[key];
    const w = this.w;
    const row = el('label', 'dx-row');
    row.appendChild(el('span', 'dx-row-label', spec.label));
    const val = el('span', 'dx-row-val');
    const input = el('input', 'dx-slider');
    Object.assign(input, { type: 'range', min: spec.min, max: spec.max, step: spec.step, value });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value); set(v); val.textContent = fmtv(v);
      if (w.paused || this.reduceMotion) w.project();
    });
    val.textContent = fmtv(value);
    row.append(input, val);
    this.sliders[key] = { input, val };
    body.appendChild(row);
  }

  /* ---- sync helpers ---- */
  _syncProj() {
    const w = this.w;
    Object.entries(this.projBtns).forEach(([id, b]) => b.classList.toggle('on', w.projMode === id));
  }

  _syncPlanes() {
    const w = this.w;
    this.planesWrap.innerHTML = '';
    if (!w.selectorPlanes.length) {
      this.planesWrap.appendChild(el('div', 'dx-planes-empty', 'no rotation planes below 2D'));
      return;
    }
    w.selectorPlanes.forEach((p) => {
      const b = el('button', 'dx-plane');
      b.appendChild(el('span', 'dx-plane-dot'));
      b.appendChild(el('span', 'dx-plane-label', p.label));
      b.classList.toggle('on', p.id === w.selected);
      b.addEventListener('click', () => { w.select(p.id); });
      this.planesWrap.appendChild(b);
    });
  }

  _syncDial() {
    const w = this.w;
    const p = w.selectedPlane();
    const a = w.selectedAngle();
    this.dial.style.setProperty('--deg', `${a * 180 / Math.PI}deg`);
    this.dialMeta.querySelector('.dx-dial-plane').innerHTML = p ? `plane <b>${p.label}</b>` : '—';
    this.dialMeta.querySelector('.dx-dial-deg').textContent = `${deg(a)}°`;
    const sv = ((deg(a) + 180) % 360) - 180;
    if (parseInt(this.scrub.value, 10) !== sv) this.scrub.value = sv;
  }

  _syncPresets() {
    const w = this.w;
    Object.entries(this.presetBtns).forEach(([id, b]) => b.classList.toggle('on', w.preset === id));
  }

  _syncView() {
    const w = this.w;
    this.vertsBtn.classList.toggle('on', w.showVertices);
    this.trailsBtn.classList.toggle('on', !!w.trail);
    this.trailsBtn.disabled = !w.trailAllowed;
  }

  // count-up tween for the felt-dimensionality beat
  _countUp(node, to) {
    const from = this.tweens[node._k] != null ? this.tweens[node._k] : 0;
    if (this.reduceMotion) { this.tweens[node._k] = to; node.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = TWEEN.duration;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * e);
      node.textContent = fmt(v);
      if (t < 1) requestAnimationFrame(step); else this.tweens[node._k] = to;
    };
    requestAnimationFrame(step);
  }

  _syncReadout() {
    const w = this.w;
    const n = w.dim;
    const name = POLY_NAMES[n] || `${n}-cube`;
    this.dimReadout.querySelector('.dx-dim-n').textContent = `${n}D`;
    this.dimReadout.querySelector('.dx-dim-name').textContent = name;
    this.dotEls.forEach((d, i) => d.classList.toggle('on', (i + CONFIG.minDim) <= n));
    if (this.titleEl) this.titleEl.innerHTML = `<b>${name}</b> · Dimensions`;

    const ledger = elementLedger(n);
    const V = ledger.find((r) => r.k === 0).count;
    const E = (ledger.find((r) => r.k === 1) || { count: 0 }).count;
    const faces = (ledger.find((r) => r.k === 2) || {}).count;
    const cells = (ledger.find((r) => r.k === 3) || {}).count;
    const facets = faceCount(n, n - 1);     // == 2n
    const planeCount = binomial(n, 2);      // the combinatorial-blowup lesson

    const rows = [
      ['vertices', V, true],
      ['edges', E, true],
    ];
    if (faces != null) rows.push(['faces', faces, false]);
    if (cells != null) rows.push(['cells', cells, false]);
    rows.push(['facets', facets, false]);
    rows.push(['planes', planeCount, false]);

    this.readout.innerHTML = '';
    rows.forEach(([k, v, tick]) => {
      const r = el('div', 'r', `<k>${k}</k><b></b>`);
      const b = r.querySelector('b');
      b._k = k;
      this.readout.appendChild(r);
      if (tick) this._countUp(b, v); else b.textContent = fmt(v);
    });

    this.chain.textContent = n > 3
      ? Array.from({ length: n - 2 }, (_, i) => `${n - i}D`).join(' → ')
      : `${n}D`;
    this.gloss.textContent = glossFor(n);

    this._syncPlanes();
    this._syncDial();
  }

  /* ---- the Shadow Ledger ---- */
  _buildLedger() {
    const w = this.w;
    const ledgerEl = this.ledgerEl;
    ledgerEl.innerHTML = '';
    const hidden = [];
    for (let d = LEDGER.fromAxis; d < w.dim; d++) hidden.push(d);
    if (!hidden.length) { ledgerEl.classList.add('empty'); return; }
    ledgerEl.classList.remove('empty');
    ledgerEl.appendChild(el('div', 'dx-ledger-head', 'Shadow Ledger · hidden-axis distortion'));
    ledgerEl._rows = {};
    // cap visible bars so 8D+ doesn't reproduce the noise it cures
    const show = hidden.slice(0, LEDGER.maxRows);
    show.forEach((d) => {
      const row = el('div', 'dx-ledger-row',
        `<span class="dx-ledger-axis">${AXES[d]}</span><span class="dx-ledger-track"><span class="dx-ledger-fill"></span></span>`);
      ledgerEl.appendChild(row);
      ledgerEl._rows[d] = row;
    });
    ledgerEl._show = show;
  }

  _tickLedger(stress) {
    const ledgerEl = this.ledgerEl;
    if (!ledgerEl._rows || !ledgerEl._show) return;
    let hotAxis = -1, hotVal = 0;
    ledgerEl._show.forEach((d) => {
      const s = stress[d] || 0;
      if (s > hotVal) { hotVal = s; hotAxis = d; }
    });
    ledgerEl._show.forEach((d) => {
      const row = ledgerEl._rows[d];
      const s = stress[d] || 0;
      const pct = Math.min(100, (s / LEDGER.strongFold) * 100); // strongFold = strong fold
      row.querySelector('.dx-ledger-fill').style.width = `${pct}%`;
      row.classList.toggle('hot', d === hotAxis && hotVal > LEDGER.hotThreshold);
    });
  }

  /* ---- caption (the diegetic line) ---- */
  _tickCaption() {
    const w = this.w;
    const captionEl = this.captionEl;
    if (!captionEl) return;
    if (w.unfold < 0.98) {
      captionEl.innerHTML = `extruding into <b>${w.dim}D</b>`;
      return;
    }
    if (w.isOrtho() && w.dim >= CONFIG.orthoFrom) {
      captionEl.innerHTML = `<b>${w.dim}D</b> · legibility wall — one shadow can't hold ${fmt(Math.pow(2, w.dim))} corners apart`;
      return;
    }
    const p = w.selectedPlane();
    captionEl.innerHTML = p
      ? `rotating <b>${p.label}</b> · ${deg(w.selectedAngle())}°`
      : `${w.dim}D`;
  }
}
