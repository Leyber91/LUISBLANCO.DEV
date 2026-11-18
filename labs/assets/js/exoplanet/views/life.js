/* ============================================================
   exoplanet/views/life.js — the sheet "If there were life",
   drawn from life.js for the planet on sheet A.

   A strip of wavelengths from 400 to 1,100 nm: the visible part
   tinted, the near infrared hatched (unseen), the star's surface
   peak a dashed tick, and each reading's reflectance a line. A
   swatch per reading, which a red dwarf's two readings make keys
   that choose the one the picture draws. Then a paper's table,
   the words, and the evidence footer. Nothing here is gold:
   nothing on this sheet is measured.
   ============================================================ */

import { lifeOf, reflectance } from '../life.js';
import { el } from '../../kit/dom.js';
import { num, int } from '../../kit/format.js';
import { KOPPARAPU } from '../config.js';

const NS = 'http://www.w3.org/2000/svg';
/* a wavelength's hue as the eye sees it, for the strip's band only (a drawing aid, not a measurement) */
const HUES = [[400, [90, 0, 140]], [440, [50, 25, 230]], [490, [0, 150, 205]], [530, [50, 205, 50]], [580, [230, 215, 25]], [620, [240, 115, 15]], [700, [150, 0, 0]]];
function hue(nm) {
  let i = 0; while (i < HUES.length - 2 && nm > HUES[i + 1][0]) i++;
  const [a, ca] = HUES[i], [b, cb] = HUES[i + 1], t = Math.max(0, Math.min(1, (nm - a) / (b - a)));
  return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(',')})`;
}
const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.append(e); return e; };
const text = (parent, x, y, words, anchor = 'middle', cls = 'ax') => { const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = words; return t; };

/** The strip for a life reading. */
function strip(L) {
  const W = 420, H = 170, x = (nm) => ((nm - 400) / 700) * W, y = (r) => H - 24 - r * (H - 46) * 1.75;
  const pk = L.case.peak;
  const svg = svgEl('svg', { viewBox: `-4 0 ${W + 8} ${H + 8}`, class: 'life-strip', role: 'img',
    'aria-label': `Reflectance from 400 to 1,100 nm of ${L.scenarios.length > 1 ? 'readings a and b' : 'the cover'}; the star's light at the surface peaks at ${int(pk)} nm` });
  const defs = svgEl('defs', {}, svg), pat = svgEl('pattern', { id: 'life-hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'hatch' }, pat);
  for (let nm = 400; nm < 700; nm += 5) svgEl('rect', { x: x(nm).toFixed(1), y: H - 18, width: (x(nm + 5) - x(nm) + 0.6).toFixed(1), height: 6, fill: hue(nm), opacity: 0.55 }, svg);
  svgEl('rect', { x: x(700), y: H - 18, width: x(1100) - x(700), height: 6, fill: 'url(#life-hatch)' }, svg);
  for (const t of [400, 550, 700, 900, 1100]) {
    svgEl('line', { x1: x(t), y1: H - 12, x2: x(t), y2: H - 8, class: 'tk' }, svg);
    text(svg, x(t), H + 6, `${int(t)}${t === 1100 ? ' nm' : ''}`, t === 400 ? 'start' : t === 1100 ? 'end' : 'middle');
  }
  text(svg, x(900), H - 26, 'near infrared, unseen', 'middle', 'ax dim');
  svgEl('line', { x1: x(pk), y1: 6, x2: x(pk), y2: H - 18, class: 'peak' }, svg);
  text(svg, x(pk) + (pk > 900 ? -5 : 5), 14, `its light peaks at ${int(pk)} nm`, pk > 900 ? 'end' : 'start');
  L.scenarios.forEach((s, i) => {
    const R = reflectance(s.bands, s.broad);
    let d = '';
    for (let nm = 400; nm <= 1100; nm += 4) d += `${nm === 400 ? 'M' : 'L'}${x(nm).toFixed(1)},${y(R(nm)).toFixed(1)}`;
    svgEl('path', { d, class: i ? 'refl refl-b' : 'refl' }, svg);
    text(svg, x(1096), (y(R(1096)) - 4).toFixed(1), L.scenarios.length > 1 ? s.key : 'reflectance', 'end');
  });
  return svg;
}

/* The words of a ratio to Earth's: two figures, and "Earth" as the unit. */
const times = (v) => (v < 0.01 ? 'under 0.01× Earth' : `${num(v, 2)}× Earth`);

/** Draw the sheet for planet p into host. kind: the planet as the picture draws it, the visitor's air scenario included
   (classify(p, { air })); air: that scenario. reading: 'a' or 'b' for an M dwarf's two readings; onReading(key) is
   called when a reading's key is pressed, and the key keeps the focus after the sheet is drawn again. plain: "data
   only" is on, so the picture draws no cover, and the sheet says so. Returns lifeOf's result. */
export function drawLife(host, p, { kind, air = null, reading = 'a', onReading = () => {}, plain = false, focus = null } = {}) {
  const L = lifeOf(p, kind, { air });
  host.replaceChildren();
  const h = el('h2', 'st', 'If there were life'); h.id = 'life-h';
  host.append(h, el('p', 'life-lede', 'No life is known on any planet but Earth. These are rules applied to this planet\'s numbers, not observations.'));
  const sparse = L.where.surface === 'sparse';
  if (L.case && L.scenarios.length) {
    host.append(strip(L));
    const sws = el('div', 'life-sws');
    for (const s of L.scenarios) {
      const two = L.scenarios.length > 1;
      const sw = el(two ? 'button' : 'div', 'life-sw');
      if (two) { sw.type = 'button'; sw.dataset.reading = s.key; sw.setAttribute('aria-pressed', String(s.key === reading)); }
      const chip = el('span', 'chip'); chip.style.background = s.colour.hex;
      // Y is the share of an even white light the eye sees it reflect (science.js reflectanceColour)
      const cover = sparse ? 'sparse, on the low ground, and not drawn' : `covers ${Math.round(s.cover * 100)}% as much as on Earth`;
      sw.append(chip, el('span', 'life-sw-w', `${two ? `${s.key}: ` : ''}reflects ${Math.round(s.colour.Y * 100)}% of white light; ${cover}`));
      sws.append(sw);
    }
    sws.addEventListener('click', (e) => { const b = e.target.closest('[data-reading]'); if (b) onReading(b.dataset.reading); });
    host.append(sws);
    if (plain) host.append(el('p', 'life-plain', 'The clouds switch is off (the data only), so the picture draws no cover.'));
  }
  if (L.case && L.light !== null) {
    const rows = [['the case of its star', `${L.case.key}, ${L.case.star}`], ['visible light, noon', times(L.light)], ['UV-B, noon', times(L.uvb)]];
    const t = el('table', 'paper life-t'), tb = el('tbody');
    for (const [n, v] of rows) { const tr = el('tr'); tr.append(el('th', '', n), el('td', '', v)); tb.append(tr); }
    t.append(tb); host.append(t);
  }
  host.append(el('p', 'life-words', L.words.join(' ')));
  const ev = el('footer', 'life-ev');
  ev.append(el('span', '', '[REAL] each case\'s light and UV-B at noon (Table 2a) and its productivity averaged over the day and the disk (Table 3), under Earth-like air: Kiang et al. 2007, Astrobiology 7, 252; the habitable zone: ' + KOPPARAPU.ref + '.'),
    el('span', '', '[ILLUSTRATIVE] those numbers times this planet\'s starlight, the colour (the paper gives where pigments absorb most, at the star\'s peak; the other band drawn, Earth\'s chlorophyll\'s, is this page\'s), the cover and these sentences: rules on top of the papers; the M dwarfs\' second reading after Takizawa et al. 2017, Sci. Rep. 7, 7561.'));
  host.append(ev);
  if (focus) { const k = host.querySelector(`button[data-reading="${focus}"]`); if (k) k.focus({ preventScroll: true }); }
  return L;
}
