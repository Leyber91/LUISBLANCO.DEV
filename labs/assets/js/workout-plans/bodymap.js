/* ============================================================
   workout-plans/bodymap.js — an original front and back body
   map, drawn here as SVG, coloured by weekly sets per muscle.

   Geometry: each region is a list of points for the figure's left
   half in a 160 x 340 box; the right half is the mirror image
   (x -> 160 - x). Paths are Catmull-Rom curves through the points.
   The figure is a schematic of where each muscle group sits, not
   an anatomical drawing.

   Colour: the ink ladder carries volume (none, under target, in
   range, over range). Gold marks only the muscles the selected
   session trains, the one "active" thing on the map.
   ============================================================ */

import { svg, el, clear, smoothClosed, smoothOpen, fmt } from './dom.js';
import { MUSCLE_LABEL } from './library.js';

const W = 160, H = 340;
const mirror = (pts) => pts.map(([x, y]) => [W - x, y]);

/* outline of the left half, top of the neck to the crotch, outside then inside the leg */
const OUTLINE = [
  [74, 40], [73, 48], [62, 52], [50, 56], [44, 64], [42, 78], [41, 96], [39, 114], [36, 132], [34, 150], [33, 160],
  [31, 170], [33, 178], [37, 176], [39, 162], [42, 146], [45, 126], [48, 112], [51, 96], [55, 84], [58, 96], [60, 112],
  [61, 128], [60, 142], [58, 156], [57, 172], [57, 192], [59, 214], [62, 236], [63, 250], [62, 262], [61, 280],
  [63, 300], [65, 316], [63, 326], [61, 332], [70, 334], [74, 330], [74, 318], [75, 300], [76, 280], [77, 262],
  [77, 250], [78, 232], [79, 206], [80, 180],
];

const FRONT = {
  chest:     [[[62, 58], [70, 56], [79, 59], [79, 80], [71, 85], [63, 81], [60, 70]]],
  frontDelt: [[[52, 57], [58.5, 56], [59.5, 66], [56.5, 76], [52, 74], [50, 64]]],
  sideDelt:  [[[45, 62], [49.5, 57.5], [50.5, 66], [48.5, 76], [45, 77], [43.5, 70]]],
  biceps:    [[[45, 82], [51, 80.5], [53, 92], [51, 106], [46.5, 110], [43.5, 98]]],
  forearms:  [[[40.5, 116], [47, 114.5], [45.5, 134], [42, 153], [37.5, 155], [36.5, 136]]],
  abs:       [[[72, 88.5], [79, 88.5], [79, 100], [72, 100]], [[72, 103], [79, 103], [79, 115], [72, 115]],
              [[72, 118], [79, 118], [79, 130], [72, 130]], [[72.5, 133], [79, 133], [79, 152], [75, 149]]],
  obliques:  [[[62, 90], [69, 92.5], [69.5, 128], [66, 142], [62.5, 132], [61.5, 110]]],
  quads:     [[[60, 166], [70, 167], [75, 182], [75.5, 212], [72, 240], [65.5, 244], [60.5, 226], [58.5, 196]]],
  adductors: [[[76.5, 176], [79.2, 176], [79.2, 204], [77.5, 213]]],
  calves:    [[[63, 262], [70, 262], [71, 284], [69, 311], [66, 311], [63.5, 286]]],
};
const BACK = {
  upperBack: [[[73, 46], [79.2, 47], [79.2, 104], [73.5, 98], [64, 78], [58, 60]]],
  rearDelt:  [[[48.5, 58], [56, 57], [57.5, 66], [55, 76], [49.5, 76], [46.5, 68]]],
  sideDelt:  [[[43.5, 65], [46.5, 59.5], [47, 69], [45.5, 78], [43, 77]]],
  lats:      [[[60, 80], [65.5, 86], [72.5, 106], [72.5, 124], [67.5, 130], [62, 116], [59, 96]]],
  lowerBack: [[[74, 108], [79.2, 108], [79.2, 154], [74, 150], [73.5, 130]]],
  triceps:   [[[44, 80], [51, 80], [53, 94], [51, 108], [46.5, 110], [43.5, 96]]],
  forearms:  [[[40.5, 116], [47, 114.5], [45.5, 134], [42, 153], [37.5, 155], [36.5, 136]]],
  glutes:    [[[61, 158], [79.2, 160], [79.2, 190], [71, 194], [62, 188], [59, 172]]],
  hamstrings:[[[60, 198], [72, 198], [77, 214], [75, 242], [67, 248], [61, 230]]],
  calves:    [[[61, 262], [72, 262], [75, 280], [71, 306], [66, 306], [61.5, 284]]],
};

function outlinePath() {
  const left = OUTLINE;
  const right = mirror(OUTLINE).reverse();
  return smoothOpen(left.concat(right.slice(1)), 0.6) + 'Z';
}

/* volume -> class on the ink ladder */
export function level(v, range) {
  if (!(v > 0)) return 'v0';
  if (!range) return v >= 4 ? 'vi2' : 'vi1';
  if (v < range[0] * 0.5) return 'v1';
  if (v < range[0]) return 'v2';
  if (v <= range[1]) return 'v3';
  return 'v4';
}

/* joint markers, drawn when a flag is on: [x, y] for the left half, mirrored unless centred */
const JOINTS = {
  front: { knee: [[66.5, 252]], shoulder: [[51, 58]], wrist: [[34.5, 158]] },
  back: { back: [[80, 132]] },
};

function figure(regions, label, view) {
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bm-fig', role: 'img', 'aria-label': label });
  const defs = svg('defs');
  const pat = svg('pattern', { id: 'bm-hatch-' + view, width: 3, height: 3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  pat.appendChild(svg('line', { x1: 0, y1: 0, x2: 0, y2: 3, class: 'bm-hl' }));
  defs.appendChild(pat);
  root.appendChild(defs);
  const g = svg('g');
  root.appendChild(svg('ellipse', { cx: 80, cy: 24, rx: 12.5, ry: 15.5, class: 'bm-outline' }));
  root.appendChild(svg('path', { d: outlinePath(), class: 'bm-outline' }));
  // registration ticks: a plate's quiet scale marks
  for (let y = 40; y <= 320; y += 40) {
    root.appendChild(svg('line', { x1: 4, x2: 9, y1: y, y2: y, class: 'bm-tick' }));
    root.appendChild(svg('line', { x1: W - 9, x2: W - 4, y1: y, y2: y, class: 'bm-tick' }));
  }
  for (const [id, shapes] of Object.entries(regions)) {
    const mg = svg('g', { class: 'bm-m', 'data-m': id });
    for (const pts of shapes) {
      mg.appendChild(svg('path', { d: smoothClosed(pts, 0.55) }));
      mg.appendChild(svg('path', { d: smoothClosed(mirror(pts), 0.55) }));
    }
    mg.appendChild(svg('title', {}, MUSCLE_LABEL[id]));
    g.appendChild(mg);
  }
  root.appendChild(g);
  for (const [flag, pts] of Object.entries(JOINTS[view] || {})) {
    const jg = svg('g', { class: 'bm-j', 'data-j': flag, tabindex: '0', role: 'button', 'aria-label': `${flag} flag: show the lifts it removed` });
    for (const [x, y] of pts) {
      const both = x === 80 ? [[x, y]] : [[x, y], [W - x, y]];
      for (const [cx, cy] of both) jg.appendChild(svg('circle', { cx, cy, r: 7, fill: `url(#bm-hatch-${view})` }));
    }
    jg.appendChild(svg('title', {}, `${flag} flag`));
    root.appendChild(jg);
  }
  return root;
}

export class BodyMap {
  constructor(host, barsHost, { onPick, onJoint } = {}) {
    this.host = host;
    this.bars = barsHost;
    this.onPick = onPick;
    this.onJoint = onJoint;
    clear(host);
    const wrap = el('div', { class: 'bm-pair' });
    const f = el('figure', { class: 'bm-view' });
    f.append(figure(FRONT, 'Front view, muscles coloured by weekly sets', 'front'), el('figcaption', {}, 'front'));
    const b = el('figure', { class: 'bm-view' });
    b.append(figure(BACK, 'Back view, muscles coloured by weekly sets', 'back'), el('figcaption', {}, 'back'));
    wrap.append(f, b);
    host.appendChild(wrap);
    this.tip = el('div', { class: 'bm-tip', 'aria-hidden': 'true' });
    host.appendChild(this.tip);
    host.addEventListener('pointerover', (e) => {
      const g = e.target.closest?.('.bm-m');
      if (!g) { this.tip.hidden = true; return; }
      this.hover(g.dataset.m, e);
    });
    host.addEventListener('pointerleave', () => { this.tip.hidden = true; this.hl(null); });
    host.addEventListener('click', (e) => {
      const j = e.target.closest?.('.bm-j');
      if (j) { this.onJoint?.(j.dataset.j); return; }
      const g = e.target.closest?.('.bm-m');
      if (g) this.onPick?.(g.dataset.m);
    });
    host.addEventListener('keydown', (e) => {
      const j = e.target.closest?.('.bm-j');
      if (j && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.onJoint?.(j.dataset.j); }
    });
  }

  hover(m, e) {
    const v = this.vol?.[m] ?? 0;
    const r = this.targets?.[m];
    this.tip.textContent = `${MUSCLE_LABEL[m]}: ${fmt(v, v % 1 ? 1 : 0)} sets` + (r ? ` (target ${r[0]}-${r[1]})` : ' (indirect)');
    const box = this.host.getBoundingClientRect();
    this.tip.style.left = Math.min(box.width - 150, Math.max(0, e.clientX - box.left - 40)) + 'px';
    this.tip.style.top = Math.max(0, e.clientY - box.top - 34) + 'px';
    this.tip.hidden = false;
    this.hl(m);
  }

  hl(m) {
    this.host.querySelectorAll('.bm-m').forEach((g) => g.classList.toggle('hov', g.dataset.m === m));
    this.bars.querySelectorAll('.mb-row').forEach((r) => r.classList.toggle('hov', r.dataset.m === m));
  }

  render(vol, targets, active = [], planVol = null, flags = []) {
    this.vol = vol;
    this.targets = targets;
    const act = new Set(active);
    this.host.querySelectorAll('.bm-j').forEach((j) => { j.style.display = flags.includes(j.dataset.j) ? '' : 'none'; });
    this.host.querySelectorAll('.bm-m').forEach((g) => {
      const m = g.dataset.m;
      g.setAttribute('class', `bm-m ${level(vol[m], targets[m])}${act.has(m) ? ' act' : ''}`);
    });
    // bars for targeted muscles, then indirect ones
    clear(this.bars);
    const ids = Object.keys(vol);
    // with no weekly band (one session in view) every trained muscle gets a bar
    const banded = Object.keys(targets).length > 0;
    const targeted = banded ? ids.filter((m) => targets[m]) : ids.filter((m) => vol[m] > 0).sort((a, b) => vol[b] - vol[a]);
    const indirect = banded ? ids.filter((m) => !targets[m] && vol[m] > 0) : [];
    const max = Math.max(22, ...ids.map((m) => vol[m]));
    for (const m of targeted) {
      const v = vol[m], r = targets[m];
      const row = el('div', { class: `mb-row ${level(v, r)}${act.has(m) ? ' act' : ''}`, dataset: { m } });
      const k = el('button', { type: 'button', class: 'mb-k' }, MUSCLE_LABEL[m]);
      k.addEventListener('click', () => this.onPick?.(m));
      row.append(k);
      const track = el('span', { class: 'mb-track' });
      if (r) {
        const band = el('i', { class: 'mb-band' });
        band.style.left = (100 * r[0] / max) + '%';
        band.style.width = (100 * (r[1] - r[0]) / max) + '%';
        track.appendChild(band);
      }
      if (planVol && Math.abs((planVol[m] ?? 0) - v) > 0.01) {
        const ghost = el('i', { class: 'mb-ghost' });
        ghost.style.left = (100 * (planVol[m] ?? 0) / max) + '%';
        track.appendChild(ghost);
      }
      const fill = el('i', { class: 'mb-fill' });
      fill.style.width = (100 * v / max) + '%';
      track.appendChild(fill);
      const diff = planVol && Math.abs((planVol[m] ?? 0) - v) > 0.01 ? ` / ${fmt(planVol[m], planVol[m] % 1 ? 1 : 0)}` : '';
      row.append(track, el('span', { class: 'mb-v' }, fmt(v, v % 1 ? 1 : 0) + diff));
      row.addEventListener('pointerenter', () => this.hl(m));
      row.addEventListener('pointerleave', () => this.hl(null));
      this.bars.appendChild(row);
    }
    if (indirect.length) {
      const line = el('p', { class: 'mb-ind' });
      line.append(el('b', {}, 'indirect'), document.createTextNode(indirect.map((m) => `${MUSCLE_LABEL[m]} ${fmt(vol[m], vol[m] % 1 ? 1 : 0)}`).join(' · ')));
      this.bars.appendChild(line);
    }
  }
}
