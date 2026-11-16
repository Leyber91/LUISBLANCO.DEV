/* ============================================================
   kit/controls.js: the labs' shared controls, drawn from what a
   visitor already knows from an instrument. Each writes text as
   text, carries its state in ARIA, and shows the chosen state by
   geometry (an index, a lever, a frame), never by colour. The look
   is in assets/css/controls.css; the geometry in kit/shapes.js.

   - keycap(key, label): an action drawn as the key that does the
     same thing (the Apollo DSKY's keys). The page binds the key.
   - switchCtl({ name, words }): on or off, both states engraved,
     the lever on the side of the state (an aircraft panel's
     toggle). One button, role switch, aria-checked.
   - scale({ name, options }): one of a few, on an engraved line
     with a fixed index (a lens's distance scale). A radio group
     the arrow keys move.
   - ivSvg(): an interval on the shared log axis, its line type
     saying where the number comes from (ISO 128: continuous
     measured, dashed derived, chain estimated, phantom
     illustrative); a measured value's tick is gold.
   - tallySvg(): a tally, a mark per thing counted and a tall
     gold mark per thing kept (an observer's logbook).
   - The filled action is a class only: `.fill`, and `.fill.kept`
     once its thing is kept.

   Lifted on 2026-11-16 with their first caller, the Exomania
   survey. A lab that needs one of these imports it from here.
   ============================================================ */

import { ivGeometry, ivAt, scaleStep, tallyMarks, IV_SPAN } from './shapes.js';

const NS = 'http://www.w3.org/2000/svg';
const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const svgNode = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
const setAttrs = (n, attrs = {}) => { for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); return n; };

/* ---------------- keycap ---------------- */

/* The key glyph alone, beside a control that is not a button (the field's "/"). */
export function keyHint(key) { const k = node('kbd', 'key', key); k.setAttribute('aria-hidden', 'true'); return k; }

/* A button drawn as its key, with its words beside it when it has any. A key with no words needs ariaLabel. */
export function keycap(key, label = '', { id, cls = '', ariaLabel, attrs } = {}) {
  const b = node('button', `kact${label ? '' : ' bare'}${cls ? ' ' + cls : ''}`);
  b.type = 'button';
  if (id) b.id = id;
  b.append(node('kbd', 'key', key));
  if (label) b.append(node('span', 'kact-w', label));
  b.setAttribute('aria-keyshortcuts', key === '←' ? 'ArrowLeft' : key === '→' ? 'ArrowRight' : key);
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  return setAttrs(b, attrs);
}

/* ---------------- switch ---------------- */

/* words: [the state with the lever left, the state with the lever right]; checked means the lever is right. The
   accessible name holds the visible words: the name and the right-hand state, unless the caller gives one. */
export function switchCtl({ name = '', words, checked = false, id, cls = '', ariaLabel, attrs } = {}) {
  const b = node('button', `switch${cls ? ' ' + cls : ''}`);
  b.type = 'button';
  b.setAttribute('role', 'switch');
  if (id) b.id = id;
  if (name) b.append(node('span', 'sw-name', name));
  const track = node('span', 'sw-track'); track.append(node('i', 'sw-lever'));
  b.append(node('span', 'sw-w sw-l', words[0]), track, node('span', 'sw-w sw-r', words[1]));
  b.setAttribute('aria-label', ariaLabel || `${name ? name + ' ' : ''}${words[1]}`.trim());
  setSwitch(b, checked);
  return setAttrs(b, attrs);
}
export function setSwitch(b, checked) { b.setAttribute('aria-checked', String(!!checked)); return b; }
export const isOn = (b) => !!b && b.getAttribute('aria-checked') === 'true';
/* A press anywhere on the switch, its words included, turns it; onChange(checked, event) after. */
export function bindSwitch(b, onChange) {
  b.addEventListener('click', (e) => { setSwitch(b, !isOn(b)); if (onChange) onChange(isOn(b), e); });
  return b;
}

/* ---------------- scale ---------------- */

/* options: [{ value, label, attrs }]. The chosen option stands under the index; the arrow keys move it. */
export function scale({ name, options, value, id, cls = '', ariaLabel } = {}) {
  const g = node('div', `scale${cls ? ' ' + cls : ''}`);
  g.setAttribute('role', 'radiogroup');
  if (id) g.id = id;
  g.setAttribute('aria-label', ariaLabel || name);
  if (name) { const n = node('span', 'sc-name', name); n.setAttribute('aria-hidden', 'true'); g.append(n); }
  const track = node('span', 'sc-track');
  for (const o of options) {
    const r = node('button', 'sc-opt');
    r.type = 'button';
    r.setAttribute('role', 'radio');
    r.dataset.value = o.value;
    r.append(node('span', 'sc-w', o.label));
    setAttrs(r, o.attrs);
    track.append(r);
  }
  g.append(track);
  setScale(g, value ?? options[0].value);
  return g;
}
const opts = (g) => [...g.querySelectorAll('[role="radio"]')];
/* Choose an option by its value: it alone is checked, in the tab order, and marked `on` for a reader of the page's
   state (the class carries no colour). */
export function setScale(g, value) {
  for (const r of opts(g)) {
    const on = r.dataset.value === String(value);
    r.setAttribute('aria-checked', String(on));
    r.tabIndex = on ? 0 : -1;
    r.classList.toggle('on', on);
  }
  return g;
}
export const scaleValue = (g) => { const r = opts(g).find((x) => x.getAttribute('aria-checked') === 'true'); return r ? r.dataset.value : null; };
/* A press or an arrow key chooses; onChange(value) after. The focus follows the arrow keys. */
export function bindScale(g, onChange) {
  g.addEventListener('click', (e) => {
    const r = e.target.closest('[role="radio"]'); if (!r || !g.contains(r) || r.disabled) return;
    setScale(g, r.dataset.value); if (onChange) onChange(r.dataset.value);
  });
  g.addEventListener('keydown', (e) => {
    const all = opts(g), i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const j = scaleStep(i, all.length, e.key);
    if (j === null) return;
    e.preventDefault();
    e.stopPropagation();   // a page's own arrow keys (a tour's steps) do not also move
    if (j === i) return;
    all[j].focus();
    setScale(g, all[j].dataset.value); if (onChange) onChange(all[j].dataset.value);
  });
  return g;
}

/* ---------------- interval ---------------- */

/* kind: 'm' measured, 'd' derived, 'e' estimated, 'i' illustrative. An SVG `width` x `height`. */
export function ivSvg({ value, lo = null, hi = null, kind = 'm', width = 150, height = 14, span = IV_SPAN, label = '' } = {}) {
  const s = svgNode('svg', { class: `iv iv-${kind}`, width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': label ? 'false' : 'true' });
  if (label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', label); }
  const g = ivGeometry(value, lo, hi, width, span);
  const y = Math.round(height / 2) + 0.5;
  s.append(svgNode('line', { class: 'iv-mid', x1: width / 2, y1: 1, x2: width / 2, y2: height - 1 }));
  if (!g) return s;
  if (g.ranged) s.append(svgNode('line', { class: `iv-run${g.cutLo ? ' cut-lo' : ''}${g.cutHi ? ' cut-hi' : ''}`, x1: g.a, y1: y, x2: g.b, y2: y }));
  s.append(svgNode('line', { class: 'iv-tick', x1: g.xc, y1: 2, x2: g.xc, y2: height - 2 }));
  return s;
}
/* The axis under a column of intervals: where half and twice the value fall. */
export function ivAxisSvg({ width = 150, height = 12, span = IV_SPAN } = {}) {
  const s = svgNode('svg', { class: 'iv-axis', width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  for (const [f, t] of [[0.5, '×½'], [1, 'value'], [2, '×2']]) {
    const x = ivAt(f, width, span);
    s.append(svgNode('line', { x1: x, y1: 0, x2: x, y2: 3 }));
    const tx = svgNode('text', { x, y: height - 1, 'text-anchor': 'middle' }); tx.textContent = t; s.append(tx);
  }
  return s;
}

/* ---------------- tally ---------------- */

/* A mark per thing counted, tall and gold for each kept, as many as fit `room` px. Returns the SVG and the plan. */
export function tallySvg(count, kept, room, { pitch = 7, height = 18 } = {}) {
  const plan = tallyMarks(count, kept, room, pitch);
  const w = Math.max(1, plan.marks * pitch);
  const s = svgNode('svg', { class: 'tally-marks', width: plan.marks ? w : 0, height, viewBox: `0 0 ${w} ${height}`, 'aria-hidden': 'true' });
  const tall = new Set(plan.tall);
  for (let i = 0; i < plan.marks; i++) {
    const x = i * pitch + 3.5, t = tall.has(i);
    s.append(svgNode('line', { class: t ? 'tl-kept' : 'tl-seen', x1: x, y1: t ? 2 : 8, x2: x, y2: height - 2 }));
  }
  return { svg: s, plan };
}
