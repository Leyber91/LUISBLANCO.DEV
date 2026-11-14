/* ============================================================
   dataspace/plot.js — the rate-distortion plot as SVG.

   Input is plain data (no measures computed here):
     points   [{ id, x: rate, y: distortion, kind: 'recorded'|'live'|'engine', model, level }]
     series   [{ model, shape, dash, levels: [{ level, x, y, ymin, ymax }] }]  mean per level and spread
     base     [{ name, pts: [{ x, y, level }] }]                              baselines at matched rate
     floor    { x }                                                           lossless floor, zero distortion
     priors   [{ model, y }]                                                  empty-capsule points at rate 0
   Clicking a point calls onPick(id, event).
   ============================================================ */

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

export const SHAPES = ['circle', 'square', 'triangle', 'diamond'];
export const DASHES = ['', '5 3', '1.5 3', '8 3 2 3'];

function marker(shape, x, y, r, cls) {
  if (shape === 'square') return el('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, class: cls });
  if (shape === 'triangle') return el('path', { d: `M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * 0.8}L${x - r * 1.1} ${y + r * 0.8}Z`, class: cls });
  if (shape === 'diamond') return el('path', { d: `M${x} ${y - r * 1.3}L${x + r * 1.2} ${y}L${x} ${y + r * 1.3}L${x - r * 1.2} ${y}Z`, class: cls });
  return el('circle', { cx: x, cy: y, r, class: cls });
}

export function renderPlot(svg, data, opts) {
  const { W, H, mini = false, sel, cmp, onPick, showBase = true, showBand = true, yLabel = 'distortion' } = opts;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const m = mini ? { l: 30, r: 8, t: 8, b: 24 } : { l: 52, r: 16, t: W < 600 ? 40 : 14, b: 44 };
  const xs = data.points.map((p) => p.x).concat(data.floor ? [data.floor.x] : []);
  const xMax = Math.max(0.2, Math.min(1.6, Math.ceil((Math.max(...xs, 0.2) * 1.12) * 10) / 10));
  const X = (x) => m.l + (Math.min(x, xMax) / xMax) * (W - m.l - m.r);
  const yy = (d) => H - m.b - d * (H - m.t - m.b); // distortion 0 at the bottom, 1 at the top
  // grid and axes
  const g = el('g');
  for (let i = 0; i <= 4; i++) {
    const d = i / 4;
    g.append(el('line', { x1: m.l, x2: W - m.r, y1: yy(d), y2: yy(d), class: 'grid' }));
    g.append(el('text', { x: m.l - 6, y: yy(d) + 4, 'text-anchor': 'end', class: 'axt' }, (d * 100).toFixed(0) + (mini ? '' : '%')));
  }
  const step = xMax > 0.8 ? 0.2 : 0.1;
  for (let x = 0; x <= xMax + 1e-9; x += step) {
    g.append(el('line', { x1: X(x), x2: X(x), y1: m.t, y2: H - m.b, class: 'grid' }));
    g.append(el('text', { x: X(x), y: H - m.b + 14, 'text-anchor': 'middle', class: 'axt' }, x.toFixed(1)));
  }
  g.append(el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'ax' }));
  g.append(el('line', { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, class: 'ax' }));
  if (!mini) {
    g.append(el('text', { x: (m.l + W - m.r) / 2, y: H - 8, 'text-anchor': 'middle', class: 'axl' }, 'rate: capsule bits / source bits (two-part code)'));
    const t = el('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', class: 'axl', transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, yLabel);
    g.append(t);
  }
  svg.append(g);

  // spread bands and mean lines per model
  for (const s of data.series) {
    const lv = s.levels.filter((l) => l.y != null).sort((a, b) => a.x - b.x);
    if (!lv.length) continue;
    if (showBand && lv.length > 1) {
      const top = lv.map((l) => `${X(l.x)},${yy(l.ymax)}`), bot = lv.slice().reverse().map((l) => `${X(l.x)},${yy(l.ymin)}`);
      svg.append(el('polygon', { points: top.concat(bot).join(' '), class: 'band' }));
    }
    svg.append(el('polyline', { points: lv.map((l) => `${X(l.x)},${yy(l.y)}`).join(' '), class: 'ln-model', 'stroke-dasharray': s.dash || '' }));
  }
  // the lexical curve as a faint reference when another distortion is plotted
  if (data.ghost && data.ghost.length > 1 && !mini) {
    const gp = data.ghost.slice().sort((a, b) => a.x - b.x);
    svg.append(el('polyline', { points: gp.map((p) => `${X(p.x)},${yy(p.y)}`).join(' '), class: 'ln-ghost' }));
    const last = gp[gp.length - 1];
    svg.append(el('text', { x: X(last.x) + 6, y: yy(last.y) - 6, class: 'plab' }, 'lexical, for comparison'));
  }
  // baselines
  if (showBase) {
    for (const b of data.base) {
      const pts = b.pts.filter((p) => p.y != null).sort((a, c) => a.x - c.x);
      if (!pts.length) continue;
      svg.append(el('polyline', { points: pts.map((p) => `${X(p.x)},${yy(p.y)}`).join(' '), class: 'ln-base' }));
      for (const p of pts) svg.append(marker(b.name === 'head' ? 'square' : 'circle', X(p.x), yy(p.y), mini ? 1.8 : 2.6, 'pt-base'));
      if (!mini && pts.length) {
        const last = pts[pts.length - 1];
        svg.append(el('text', { x: X(last.x) + 6, y: yy(last.y) + 4, class: 'plab' }, b.name === 'head' ? 'head cut' : 'extractive'));
      }
    }
  }
  // empty-capsule priors at rate 0, lossless floor at distortion 0
  const pri = (data.priors || []).filter((p) => p.y != null);
  for (const p of pri) {
    const r = el('rect', { x: X(0) - 3, y: yy(p.y) - 3, width: 6, height: 6, class: 'pt-prior' });
    r.append(el('title', {}, `empty capsule, ${p.model}: distortion ${(p.y * 100).toFixed(1)}%`));
    svg.append(r);
  }
  if (!mini && pri.length) {
    const lowest = Math.min(...pri.map((p) => p.y));
    svg.append(el('text', { x: X(0) + 8, y: yy(lowest) + 16, class: 'plab' }, pri.length > 1 ? `empty capsule, ${pri.length} models` : `empty capsule, ${pri[0].model}`));
  }
  if (data.floor) {
    const fx = X(data.floor.x), fy = yy(0);
    svg.append(el('circle', { cx: fx, cy: fy, r: mini ? 3 : 5, class: 'pt-floor' }));
    const right = fx > W * 0.6;
    if (!mini) svg.append(el('text', { x: right ? fx - 8 : fx + 8, y: fy - 8, 'text-anchor': right ? 'end' : 'start', class: 'plab' }, `lossless floor (DEFLATE), rate ${data.floor.x.toFixed(2)}`));
  }
  // run points, selected last so it draws on top
  const shapeOf = (model) => (data.series.find((s) => s.model === model)?.shape) || 'circle';
  const ordered = data.points.slice().sort((a, b) => (a.id === sel) - (b.id === sel));
  for (const p of ordered) {
    if (p.y == null) continue;
    const cls = ['pt', p.kind === 'live' ? 'pt-live' : p.kind === 'engine' ? 'pt-eng' : 'pt-rec', p.id === sel ? 'pt-sel' : '', p.id === cmp ? 'pt-cmp' : ''].join(' ');
    const r = mini ? (p.id === sel ? 3.6 : 2.4) : (p.id === sel ? 6 : 4);
    const mk = marker(p.kind === 'live' ? 'circle' : shapeOf(p.model), X(p.x), yy(p.y), r, cls);
    mk.setAttribute('tabindex', mini ? '-1' : '0');
    mk.setAttribute('role', 'button');
    mk.setAttribute('aria-label', `${p.kind} run, ${p.model}, level ${p.level}, rate ${p.x.toFixed(2)}, distortion ${(p.y * 100).toFixed(0)} percent`);
    const title = el('title', {}, `${p.model} · L${p.level} · rate ${p.x.toFixed(3)} · distortion ${(p.y * 100).toFixed(1)}%`);
    mk.append(title);
    mk.addEventListener('click', (e) => onPick?.(p.id, e));
    mk.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(p.id, e); } });
    svg.append(mk);
  }
  // legend of model shapes (full plot only), right-aligned along the top edge
  if (!mini) {
    const items = data.series.map((s) => ({ shape: s.shape, label: s.model, cls: 'pt-rec' }));
    if (data.points.some((p) => p.kind === 'live')) items.push({ shape: 'circle', label: 'live', cls: 'pt-live' });
    if (data.points.some((p) => p.kind === 'engine')) items.push({ shape: 'circle', label: 'offline engine', cls: 'pt-eng' });
    let lx = W - m.r - 6;
    const ly = W < 600 ? 16 : m.t + 12;
    for (const it of items.reverse()) {
      const tw = it.label.length * 6.7;
      lx -= tw;
      svg.append(el('text', { x: lx, y: ly + 4, class: 'plab' }, it.label));
      svg.append(marker(it.shape, lx - 9, ly, 3.5, it.cls));
      lx -= 26;
    }
  }
  return svg;
}
