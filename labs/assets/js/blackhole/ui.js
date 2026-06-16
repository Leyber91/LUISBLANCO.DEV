/* ============================================================
   blackhole/ui.js — the control panel. Token-styled, collapsible,
   accordion-organised. A TYPE selector (grouped by family) swaps
   whole black-hole regimes; PHYSICS sliders drive the geometry;
   a PINNED live readout shows the derived horizon / ISCO / shadow
   so the model reads as physical. Appearance + Model fold away.
   ============================================================ */

// Families — the dominant physical axis each regime exercises.
const FAMILIES = [
  { id: 'mass',      label: 'Mass class', caption: 'colour + scale shift with mass  (T ∝ M^-¼)' },
  { id: 'spacetime', label: 'Spacetime',  caption: 'spin + charge move the ISCO, horizon, shadow' },
  { id: 'activity',  label: 'Activity',   caption: 'accretion rate sets brightness + thickness' },
];

// Whole black-hole regimes. cfg sets physical params + a flattering camera + look.
// Physics (horizon, ISCO, colour) is derived from these in blackhole.js _physics().
// tag = honesty marker (ESTABLISHED real class · THEORETICAL plausible · SPECULATIVE exotic).
const TYPES = [
  // ---- mass class (small/blue -> large/amber) ----
  { id: 'primordial', family: 'mass', label: 'Primordial', tag: 'THEORETICAL',
    title: 'Primordial micro · Hawking-hot · asteroid-mass',
    cfg: { mass: 0.7, spinA: 0.1, charge: 0.0, mdot: 0.35, diskOuter: 8, spin: 1.4, colorTemp: 0.2, exposure: 1.7, diskBright: 1.45, bgBright: 1.25, camDist: 34, pitch: 0.22 } },
  { id: 'stellar', family: 'mass', label: 'Stellar-mass', tag: 'ESTABLISHED',
    title: 'Stellar-mass · ~10 M☉ · X-ray hot',
    cfg: { mass: 1.0, spinA: 0.6, charge: 0.0, mdot: 1.4, diskOuter: 11, spin: 1.8, colorTemp: 0.0, exposure: 1.15, diskBright: 1.05, bgBright: 1.0, camDist: 13, pitch: 0.10 } },
  { id: 'intermediate', family: 'mass', label: 'Intermediate', tag: 'THEORETICAL',
    title: 'Intermediate-mass · ~10³·⁵ M☉ · cluster-core',
    cfg: { mass: 3.5, spinA: 0.7, charge: 0.0, mdot: 1.5, diskOuter: 12, spin: 1.6, colorTemp: 0.0, exposure: 1.25, diskBright: 1.25, bgBright: 0.95, camDist: 14, pitch: 0.34 } },
  { id: 'supermassive', family: 'mass', label: 'Supermassive', tag: 'ESTABLISHED',
    title: 'Supermassive · ~10⁹ M☉ · galactic core',
    cfg: { mass: 9.3, spinA: 0.5, charge: 0.0, mdot: 0.6, diskOuter: 20, spin: 0.6, colorTemp: 0.0, exposure: 1.10, diskBright: 1.00, bgBright: 0.8, camDist: 22, pitch: 0.5 } },
  { id: 'ultramassive', family: 'mass', label: 'Ultramassive', tag: 'THEORETICAL',
    title: 'Ultramassive · TON 618-class · ~6.6×10¹⁰ M☉',
    cfg: { mass: 9.8, spinA: 0.4, charge: 0.0, mdot: 0.5, diskOuter: 24, spin: 0.35, colorTemp: 0.42, exposure: 1.05, diskBright: 0.95, bgBright: 0.7, camDist: 30, pitch: 0.34 } },

  // ---- spacetime (metric: spin + charge) ----
  { id: 'schwarzschild', family: 'spacetime', label: 'Schwarzschild', tag: 'ESTABLISHED',
    title: 'Schwarzschild · non-rotating',
    cfg: { mass: 6.5, spinA: 0.0, charge: 0.0, mdot: 1.0, diskOuter: 14, spin: 1.0, colorTemp: 0.0, exposure: 1.25, diskBright: 1.15, bgBright: 0.9, camDist: 16, pitch: 0.16 } },
  { id: 'kerr', family: 'spacetime', label: 'Kerr', tag: 'ESTABLISHED',
    title: 'Kerr · spinning · a = 0.90',
    cfg: { mass: 6.5, spinA: 0.9, charge: 0.0, mdot: 1.1, diskOuter: 16, spin: 1.3, colorTemp: 0.0, exposure: 1.30, diskBright: 1.20, bgBright: 0.95, camDist: 17, pitch: 0.18 } },
  { id: 'gargantua', family: 'spacetime', label: 'Gargantua', tag: 'THEORETICAL',
    title: 'Near-extremal Kerr · a = 0.998',
    cfg: { mass: 8.0, spinA: 0.998, charge: 0.0, mdot: 0.8, diskOuter: 18, spin: 0.9, colorTemp: 0.10, exposure: 1.15, diskBright: 1.05, bgBright: 0.85, camDist: 19, pitch: 0.06 } },
  { id: 'charged', family: 'spacetime', label: 'Charged (RN)', tag: 'THEORETICAL',
    title: 'Reissner-Nordström · charged · Q = 0.70',
    cfg: { mass: 6.0, spinA: 0.0, charge: 0.7, mdot: 1.0, diskOuter: 14, spin: 1.0, colorTemp: 0.30, exposure: 1.30, diskBright: 1.20, bgBright: 0.9, camDist: 16, pitch: 0.16 } },
  { id: 'kerrnewman', family: 'spacetime', label: 'Kerr-Newman', tag: 'THEORETICAL',
    title: 'Kerr-Newman · rotating + charged · a 0.70 · Q 0.50',
    cfg: { mass: 5.0, spinA: 0.7, charge: 0.5, mdot: 1.2, diskOuter: 15, spin: 1.4, colorTemp: 0.18, exposure: 1.32, diskBright: 1.22, bgBright: 0.92, camDist: 16, pitch: 0.32 } },
  { id: 'naked', family: 'spacetime', label: 'Naked singularity', tag: 'SPECULATIVE',
    title: 'Naked singularity · a > M · no event horizon',
    cfg: { mass: 3.0, spinA: 1.15, charge: 0.2, mdot: 1.6, diskOuter: 13, spin: 2.2, colorTemp: 0.0, exposure: 2.1, diskBright: 1.9, bgBright: 0.6, camDist: 15, pitch: 0.13 } },

  // ---- activity (accretion state) ----
  { id: 'quiescent', family: 'activity', label: 'Quiescent', tag: 'ESTABLISHED',
    title: 'Quiescent · Sgr A*-like · ~4×10⁶ M☉',
    cfg: { mass: 6.6, spinA: 0.5, charge: 0.0, mdot: 0.2, diskOuter: 12, spin: 0.7, colorTemp: 0.22, exposure: 1.6, diskBright: 0.55, bgBright: 1.05, camDist: 18, pitch: 0.6 } },
  { id: 'quasar', family: 'activity', label: 'Quasar / AGN', tag: 'THEORETICAL',
    title: 'Active quasar · ~10⁸·⁵ M☉ · blazing high-accretion',
    cfg: { mass: 8.5, spinA: 0.7, charge: 0.0, mdot: 1.85, diskOuter: 22, spin: 1.0, colorTemp: 0.0, exposure: 1.7, diskBright: 1.9, bgBright: 0.55, camDist: 18, pitch: 0.13 } },
];

const VIEWS = [
  { id: 'edge', label: 'Edge-on', pitch: 0.03 },
  { id: 'tilt', label: 'Tilted',  pitch: 0.20 },
  { id: 'top',  label: 'Top-down', pitch: 0.85 },
];

// fmt helpers
const f2 = (v) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));
const sup = (n) => String(n).replace(/[0-9]/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
const fMass = (v) => `10${sup(Math.round(v))} M☉`;

const SCHEMA = [
  // physics
  { group: 'physics', key: 'mass',   label: 'Mass',           min: 0.7, max: 9.8,   step: 0.1,   fmt: fMass },
  { group: 'physics', key: 'spinA',  label: 'Spin  a',        min: 0.0, max: 0.998, step: 0.001, fmt: (v) => v.toFixed(3) },
  { group: 'physics', key: 'charge', label: 'Charge  Q',      min: 0.0, max: 0.999, step: 0.005, fmt: (v) => v.toFixed(2) },
  { group: 'physics', key: 'mdot',   label: 'Accretion rate', min: 0.2, max: 2.0,   step: 0.01,  fmt: f2 },
  // look
  { group: 'look', key: 'exposure',   label: 'Exposure',           min: 0.4, max: 2.5,  step: 0.01, fmt: f2 },
  { group: 'look', key: 'diskBright', label: 'Disk brightness',    min: 0.2, max: 2.5,  step: 0.01, fmt: f2 },
  { group: 'look', key: 'diskOuter',  label: 'Disk outer edge',    min: 8.0, max: 26.0, step: 0.1,  fmt: f2 },
  { group: 'look', key: 'spin',       label: 'Disk rotation',      min: 0.0, max: 3.0,  step: 0.01, fmt: f2 },
  { group: 'look', key: 'colorTemp',  label: 'Colour (warm→cold)', min: 0.0, max: 1.0,  step: 0.01, fmt: f2 },
  { group: 'look', key: 'bgBright',   label: 'Starfield',          min: 0.0, max: 2.0,  step: 0.01, fmt: f2 },
  { group: 'look', key: 'camDist',    label: 'Distance',           min: 6.0, max: 36.0, step: 0.2,  fmt: f2 },
];

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

export function buildPanel(host, bh, { onPause } = {}) {
  const titleEl = document.querySelector('.bh-title');
  const panel = el('div', 'bh-panel');

  const head = el('div', 'bh-panel-head', `<span>Black Hole</span>`);
  const collapse = el('button', 'bh-collapse', '–');
  head.appendChild(collapse);
  panel.appendChild(head);

  const body = el('div', 'bh-panel-body');
  const inputs = {};
  const typeBtns = {};

  // ---- accordion section helper ----
  function accSection(title, { open = false, tag } = {}) {
    const wrap = el('div', 'bh-acc');
    if (open) wrap.setAttribute('data-open', '');
    const h = el('button', 'bh-acc-head');
    h.appendChild(el('span', null, title));
    if (tag) h.appendChild(el('span', 'bh-acc-tag', tag));
    const glyph = el('span', 'bh-acc-glyph', open ? '–' : '+');
    h.appendChild(glyph);
    h.setAttribute('aria-expanded', open ? 'true' : 'false');
    const outer = el('div', 'bh-acc-body');
    const inner = el('div', 'bh-acc-inner');
    outer.appendChild(inner);
    h.addEventListener('click', () => {
      const o = wrap.toggleAttribute('data-open');
      glyph.textContent = o ? '–' : '+';
      h.setAttribute('aria-expanded', o ? 'true' : 'false');
    });
    wrap.appendChild(h);
    wrap.appendChild(outer);
    body.appendChild(wrap);
    return inner;
  }

  function slider(s, into) {
    const row = el('label', 'bh-row');
    row.appendChild(el('span', 'bh-row-label', s.label));
    const val = el('span', 'bh-row-val');
    const input = el('input', 'bh-slider');
    Object.assign(input, { type: 'range', min: s.min, max: s.max, step: s.step, value: bh.cfg[s.key] });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      bh.set(s.key, v);
      val.textContent = s.fmt(v);
      if (s.group === 'physics') updateReadout();
    });
    inputs[s.key] = { input, val };
    val.textContent = s.fmt(bh.cfg[s.key]);
    row.appendChild(input);
    row.appendChild(val);
    into.appendChild(row);
  }

  // ---- TYPE (open) — family sub-grids ----
  const typeInner = accSection('Type', { open: true });
  FAMILIES.forEach((fam) => {
    const famBox = el('div', 'bh-fam');
    famBox.appendChild(el('div', 'bh-fam-head', `${fam.label} — <em>${fam.caption}</em>`));
    const grid = el('div', 'bh-types');
    TYPES.filter((t) => t.family === fam.id).forEach((ty) => {
      const b = el('button', 'bh-type', ty.label);
      b.addEventListener('click', () => applyType(ty));
      typeBtns[ty.id] = b;
      grid.appendChild(b);
    });
    famBox.appendChild(grid);
    typeInner.appendChild(famBox);
  });

  // ---- PHYSICS (open) ----
  const physInner = accSection('Physics', { open: true });
  SCHEMA.filter((s) => s.group === 'physics').forEach((s) => slider(s, physInner));

  // ---- READOUT (pinned, never folded) ----
  const readout = el('div', 'bh-readout');
  body.appendChild(readout);

  // ---- VIEW (open) ----
  const viewInner = accSection('View', { open: true });
  const viewRow = el('div', 'bh-views');
  VIEWS.forEach((vw) => {
    const b = el('button', 'bh-view', vw.label);
    b.addEventListener('click', () => { bh.cfg.pitch = vw.pitch; if (bh.still) bh._draw(); });
    viewRow.appendChild(b);
  });
  viewInner.appendChild(viewRow);

  // ---- APPEARANCE (collapsed) ----
  const lookInner = accSection('Appearance', { open: false, tag: 'advanced' });
  SCHEMA.filter((s) => s.group === 'look').forEach((s) => slider(s, lookInner));

  // ---- MODEL + PAUSE (collapsed) ----
  const modelInner = accSection('Model', { open: false });
  modelInner.appendChild(el('div', 'bh-note',
    'Exact Schwarzschild geodesics. Spin · charge · mass act on the ISCO, beaming, horizon and disk as physically-motivated approximations — not full Kerr ray tracing. Tags: ESTABLISHED real class · THEORETICAL plausible · SPECULATIVE exotic.'));
  const pause = el('button', 'bh-pause', 'Pause');
  let paused = false;
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Play' : 'Pause';
    onPause?.(paused);
  });
  modelInner.appendChild(pause);

  panel.appendChild(body);
  host.appendChild(panel);

  // whole header toggles (big touch target on phones); the +/- button bubbles here too
  const setCollapsed = (collapsed) => {
    body.style.display = collapsed ? 'none' : '';
    collapse.textContent = collapsed ? '+' : '–';
    panel.classList.toggle('bh-collapsed', collapsed);
  };
  head.addEventListener('click', () => setCollapsed(body.style.display !== 'none'));
  // on phones, start collapsed so the black hole is the hero; tap the bar to reveal controls
  if (window.matchMedia && window.matchMedia('(max-width: 600px)').matches) setCollapsed(true);

  function applyType(ty) {
    Object.entries(ty.cfg).forEach(([k, v]) => { bh.cfg[k] = v; });
    bh._physics();                                  // recompute horizon / ISCO / colour
    Object.values(typeBtns).forEach((b) => b.classList.remove('on'));
    typeBtns[ty.id]?.classList.add('on');
    if (titleEl) titleEl.textContent = ty.title;
    activeTag = ty.tag;
    sync();
    if (bh.still) bh._draw();
  }

  function sync() {
    SCHEMA.forEach((s) => {
      if (inputs[s.key]) { inputs[s.key].input.value = bh.cfg[s.key]; inputs[s.key].val.textContent = s.fmt(bh.cfg[s.key]); }
    });
    updateReadout();
  }

  // live derived-physics readout (rs units) — makes "the animation reflects the
  // physics" literally legible, and surfaces the per-type honesty tag.
  let activeTag = 'ESTABLISHED';
  const fmtR = (v) => (v == null ? '—' : `${v.toFixed(2)} r<sub>s</sub>`);
  function updateReadout() {
    const p = bh.phys || {};
    const overspun = (bh.cfg.spinA * bh.cfg.spinA + bh.cfg.charge * bh.cfg.charge) >= 1.0;
    const shadow = overspun ? 'none — exposed core'
                 : (p.a > 0.5 ? 'flattened (frame-dragged)' : 'circular');
    readout.innerHTML =
      `<span>r<sub>horizon</sub> ${overspun ? '—' : fmtR(p.horizon)}</span>` +
      `<span>r<sub>ISCO</sub> ${fmtR(p.risco)}</span>` +
      `<span>shadow ${shadow}</span>` +
      `<span class="bh-tag bh-tag-${activeTag.toLowerCase()}">${activeTag}</span>`;
  }

  // boot on Schwarzschild
  applyType(TYPES.find((t) => t.id === 'schwarzschild'));

  return {
    sync,
    setType: (id) => { const ty = TYPES.find((t) => t.id === id); if (ty) applyType(ty); },
    setView: (id) => { const vw = VIEWS.find((w) => w.id === id); if (vw) { bh.cfg.pitch = vw.pitch; if (bh.still) bh._draw(); } },
  };
}
