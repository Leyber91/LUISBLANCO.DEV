/* ============================================================
   ai-health/view-charts.js — the head-to-head as SVG: ROC,
   precision-recall, calibration, decision curve, confusion, the
   bootstrap table, the shift test, the training trace, the fitted
   terms. One grammar for every chart: hairline grid, 8.5 px tick
   labels (class tk), ink for NEWS2, gold for the chosen model, a dim
   dashed line for the other model, a faint dotted line for the hidden
   truth.
   ============================================================ */

import { s, h, fill, scale, fmtPct, fmt, fitWidth } from './dom.js';
import { FEATURE_BY_KEY, NEWS2_ROWS, LR_BINS } from './config.js';

const W = 300, H = 270, M = { l: 40, r: 10, t: 10, b: 32 };

function frame(xlab, ylab, xmax = 1, ymax = 1, ticks = [0, 0.25, 0.5, 0.75, 1], xmin = 0, ymin = 0) {
  const x = scale(xmin, xmax, M.l, W - M.r), y = scale(ymin, ymax, H - M.b, M.t);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  const g = s('g');
  for (const t of ticks) {
    const tx = xmin + t * (xmax - xmin), ty = ymin + t * (ymax - ymin);
    g.append(s('line', { x1: x(tx), x2: x(tx), y1: y(ymin), y2: y(ymax), class: 'grid' }));
    g.append(s('line', { x1: x(xmin), x2: x(xmax), y1: y(ty), y2: y(ty), class: 'grid' }));
    g.append(s('text', { x: x(tx), y: H - M.b + 13, 'text-anchor': 'middle', class: 'tk', text: fmtTick(tx, xmax) }));
    g.append(s('text', { x: M.l - 5, y: y(ty) + 3, 'text-anchor': 'end', class: 'tk', text: fmtTick(ty, ymax) }));
  }
  g.append(s('text', { x: (M.l + W - M.r) / 2, y: H - 3, 'text-anchor': 'middle', class: 'ax', text: xlab }));
  g.append(s('text', { x: 8, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', class: 'ax', transform: `rotate(-90 8 ${(M.t + H - M.b) / 2})`, text: ylab }));
  svg.append(g);
  return { svg, x, y };
}
const fmtTick = (v, max) => (max < 1 ? (100 * v).toFixed(0) + '%' : Math.abs(v) < 1e-9 || v === 1 ? String(Math.round(v)) : v.toFixed(2));

const STYLE = {
  news: { cls: 'ln-news' }, sel: { cls: 'ln-sel', glow: true }, other: { cls: 'ln-other' }, oracle: { cls: 'ln-oracle' }, ref: { cls: 'ln-ref' },
};

function path(points, x, y, st) {
  const d = points.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('');
  const g = s('g');
  if (st.glow) g.append(s('path', { d, class: 'ln-glow' }));
  g.append(s('path', { d, class: st.cls }));
  return g;
}

function opPoint(x, y, px, py, gold, label) {
  return s('g', {},
    s('circle', { cx: x(px), cy: y(py), r: 6, class: gold ? 'op-ring gold' : 'op-ring' }),
    s('circle', { cx: x(px), cy: y(py), r: 2.2, class: gold ? 'op-dot gold' : 'op-dot' }),
    label ? s('text', { x: x(px) + 8, y: y(py) + 11, class: 'tk' + (gold ? ' gold' : ' hz'), text: label }) : null);
}

/* d: { news:{roc,pr,conf,conf7,cal}, lr:{...}, gbt:{...}, oracle:{roc,pr}, sel } */
export function drawROC(host, d, rule) {
  const { svg, x, y } = frame('1 − specificity', 'sensitivity');
  svg.append(s('line', { x1: x(0), y1: y(0), x2: x(1), y2: y(1), class: 'ln-ref' }));
  const other = d.sel === 'lr' ? 'gbt' : 'lr';
  svg.append(path(d.oracle.roc.curve.map((p) => [p.fpr, p.tpr]), x, y, STYLE.oracle));
  svg.append(path(d[other].roc.curve.map((p) => [p.fpr, p.tpr]), x, y, STYLE.other));
  svg.append(path(d.news.roc.curve.map((p) => [p.fpr, p.tpr]), x, y, STYLE.news));
  svg.append(path(d[d.sel].roc.curve.map((p) => [p.fpr, p.tpr]), x, y, STYLE.sel));
  svg.append(opPoint(x, y, 1 - d.news.conf7.spec, d.news.conf7.sens, false, '≥7'));
  svg.append(opPoint(x, y, 1 - d.news.conf.spec, d.news.conf.sens, false, rule.red ? `≥${rule.t}/3` : `≥${rule.t}`));
  svg.append(opPoint(x, y, 1 - d[d.sel].conf.spec, d[d.sel].conf.sens, true));
  svg.setAttribute('aria-label', `ROC curves. AUROC NEWS2 ${fmt(d.news.roc.auc, 3)}, logistic regression ${fmt(d.lr.roc.auc, 3)}, boosted trees ${fmt(d.gbt.roc.auc, 3)}, hidden truth ${fmt(d.oracle.roc.auc, 3)}.`);
  fill(host, svg);
}

export function drawPR(host, d) {
  const { svg, x, y } = frame('recall (sensitivity)', 'precision (PPV)');
  const prev = d.news.pr.prevalence;
  svg.append(s('line', { x1: x(0), y1: y(prev), x2: x(1), y2: y(prev), class: 'ln-ref' }));
  svg.append(s('text', { x: x(1) - 2, y: y(prev) - 4, 'text-anchor': 'end', class: 'tk', text: 'prevalence ' + fmtPct(prev) }));
  const other = d.sel === 'lr' ? 'gbt' : 'lr';
  const pts = (c) => [[0, c[0]?.precision ?? 1], ...c.map((p) => [p.recall, p.precision])];
  svg.append(path(pts(d.oracle.pr.curve), x, y, STYLE.oracle));
  svg.append(path(pts(d[other].pr.curve), x, y, STYLE.other));
  svg.append(path(pts(d.news.pr.curve), x, y, STYLE.news));
  svg.append(path(pts(d[d.sel].pr.curve), x, y, STYLE.sel));
  svg.append(opPoint(x, y, d.news.conf.sens, d.news.conf.ppv || 0, false));
  svg.append(opPoint(x, y, d[d.sel].conf.sens, d[d.sel].conf.ppv || 0, true));
  svg.setAttribute('aria-label', `Precision-recall curves. Average precision NEWS2 ${fmt(d.news.pr.ap, 3)}, regression ${fmt(d.lr.pr.ap, 3)}, trees ${fmt(d.gbt.pr.ap, 3)}; prevalence ${fmtPct(prev)}.`);
  fill(host, svg);
}

export function drawCalibration(host, d) {
  const sel = d[d.sel].cal, other = d[d.sel === 'lr' ? 'gbt' : 'lr'].cal, nc = d.news.cal;
  const top = Math.max(...sel.bins.map((b) => Math.max(b.pred, b.obs)), ...nc.bins.map((b) => Math.max(b.pred, b.obs)));
  const max = Math.min(1, Math.ceil((top + 0.02) * 10) / 10);
  const { svg, x, y } = frame('predicted risk', 'observed rate', max, max);
  svg.append(s('line', { x1: x(0), y1: y(0), x2: x(max), y2: y(max), class: 'ln-ref' }));
  for (const b of other.bins) svg.append(s('circle', { cx: x(b.pred), cy: y(Math.min(max, b.obs)), r: 2.4, class: 'pt-other' }));
  svg.append(path(nc.bins.map((b) => [b.pred, Math.min(max, b.obs)]), x, y, STYLE.news));
  for (const b of nc.bins) svg.append(s('rect', { x: x(b.pred) - 2.2, y: y(Math.min(max, b.obs)) - 2.2, width: 4.4, height: 4.4, class: 'pt-news' }));
  svg.append(path(sel.bins.map((b) => [b.pred, Math.min(max, b.obs)]), x, y, { cls: 'ln-sel thin' }));
  for (const b of sel.bins) {
    svg.append(s('line', { x1: x(b.pred), x2: x(b.pred), y1: y(Math.min(max, b.lo)), y2: y(Math.min(max, b.hi)), class: 'ci gold' }));
    svg.append(s('circle', { cx: x(b.pred), cy: y(Math.min(max, b.obs)), r: 2.6, class: 'op-dot gold' }));
  }
  svg.setAttribute('aria-label', `Calibration in ten equal-count bins. Model Brier ${fmt(sel.brier, 4)}, NEWS2 mapped to risk Brier ${fmt(nc.brier, 4)}.`);
  fill(host, svg);
}

export function drawDCA(host, d) {
  const max = 0.5;
  const ys = [...d.dca.news, ...d.dca[d.sel]].map((r) => r.nb);
  const ymax = Math.max(0.02, ...ys) * 1.1, ymin = -ymax * 0.25;
  const { svg, x, y } = frame('threshold probability', 'net benefit', max, ymax, [0, 0.25, 0.5, 0.75, 1], 0, ymin);
  svg.append(s('line', { x1: x(0), x2: x(max), y1: y(0), y2: y(0), class: 'ln-ref' }));
  const clip = (arr) => arr.filter((r) => r.pt <= max).map((r) => [r.pt, Math.max(ymin, r.nb)]);
  svg.append(path(d.dca.news.filter((r) => r.pt <= max).map((r) => [r.pt, Math.max(ymin, r.all)]), x, y, STYLE.oracle));
  const other = d.sel === 'lr' ? 'gbt' : 'lr';
  svg.append(path(clip(d.dca[other]), x, y, STYLE.other));
  svg.append(path(clip(d.dca.news), x, y, STYLE.news));
  svg.append(path(clip(d.dca[d.sel]), x, y, STYLE.sel));
  svg.append(s('text', { x: x(0.01) + 2, y: y(d.dca.news[0].all) - 4, class: 'tk', text: 'treat all' }));
  svg.append(s('text', { x: x(max) - 2, y: y(0) - 4, 'text-anchor': 'end', class: 'tk', text: 'treat none' }));
  svg.setAttribute('aria-label', 'Decision curve: net benefit of NEWS2 mapped to risk and of both models across threshold probabilities from 1% to 50%, with treat-all and treat-none.');
  fill(host, svg);
}

function cm(title, c, gold) {
  return h('div', { class: 'cm' },
    h('div', { class: 't' + (gold ? ' gold' : ''), text: title }),
    h('span', {}), h('span', { class: 'hd', text: 'deteriorated' }), h('span', { class: 'hd', text: 'did not' }),
    h('span', { class: 'rh', text: 'alert' }),
    h('div', { class: 'cell hit' }, h('b', { text: c.tp }), 'caught'),
    h('div', { class: 'cell' }, h('b', { text: c.fp }), 'false alarm'),
    h('span', { class: 'rh', text: 'no alert' }),
    h('div', { class: 'cell miss' }, h('b', { text: c.fn }), 'missed'),
    h('div', { class: 'cell' }, h('b', { text: c.tn }), 'quiet'),
    h('div', { class: 'stats', text: `sensitivity ${fmtPct(c.sens)} · specificity ${fmtPct(c.spec)} · PPV ${fmtPct(c.ppv)} · alerts ${fmtPct(c.alertRate)} of patients · ${c.tp ? ((c.tp + c.fp) / c.tp).toFixed(1) : '–'} alerts per event caught` }));
}

export function drawConfusion(host, d, labels) {
  fill(host, cm(labels.news, d.news.conf, false), cm(labels.sel, d[d.sel].conf, true));
}

/* rows: [{label, est, lo, hi, digits}] */
export function drawTable(host, cols, rows) {
  fill(host, h('table', {}, h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { text: c })))),
    h('tbody', {}, ...rows.map((r) => h('tr', { class: r.cls || '' }, ...r.cells.map((c, i) => h(i ? 'td' : 'th', { scope: i ? null : 'row', class: c?.cls || '', text: c?.text ?? c })))))));
}

export function drawTrace(host, traces, label, progress = 1) {
  const w = fitWidth(host, 240, 520), hgt = 96, m = { l: 34, r: 8, t: 8, b: 22 };
  const all = traces.flatMap((t) => t.values);
  const len = Math.max(...traces.map((t) => t.values.length));
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = scale(0, Math.max(1, len - 1), m.l, w - m.r), y = scale(lo, hi, hgt - m.b, m.t);
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, role: 'img', 'aria-label': `${label}. ` + traces.map((t) => `${t.name} log-loss ${fmt(t.values[t.values.length - 1], 3)}`).join(', ') });
  svg.append(s('line', { x1: m.l, x2: w - m.r, y1: hgt - m.b, y2: hgt - m.b, class: 'grid' }));
  svg.append(s('text', { x: m.l, y: hgt - 8, class: 'tk', text: label }));
  svg.append(s('text', { x: m.l - 4, y: m.t + 4, 'text-anchor': 'end', class: 'tk', text: fmt(hi, 2) }));
  svg.append(s('text', { x: m.l - 4, y: hgt - m.b, 'text-anchor': 'end', class: 'tk', text: fmt(lo, 2) }));
  traces.forEach((t, i) => {
    const n = Math.max(2, Math.round(t.values.length * progress));
    svg.append(path(t.values.slice(0, n).map((v, k) => [k, v]), x, y, i ? STYLE.other : STYLE.sel));
    svg.append(s('text', { x: w - m.r, y: y(t.values[n - 1]) + (i ? 11 : -4), 'text-anchor': 'end', class: 'tk' + (i ? '' : ' gold'), text: `${t.name} ${fmt(t.values[n - 1], 3)}` }));
  });
  fill(host, svg);
}

/* The regression's fitted band terms beside NEWS2's points. */
export function drawTerms(host, terms) {
  const rows = [];
  const pts = {
    rr: NEWS2_ROWS.find((r) => r.key === 'rr').bands.map((b) => b.pts),
    spo2: NEWS2_ROWS.find((r) => r.key === 'spo2' && r.scale === 1).bands.map((b) => b.pts),
    sbp: NEWS2_ROWS.find((r) => r.key === 'sbp').bands.map((b) => b.pts),
    hr: NEWS2_ROWS.find((r) => r.key === 'hr').bands.map((b) => b.pts),
    temp: NEWS2_ROWS.find((r) => r.key === 'temp').bands.map((b) => b.pts),
  };
  const binned = terms.filter((t) => t.kind === 'bin');
  const wmax = Math.max(0.5, ...binned.flatMap((t) => t.bands.map((b) => Math.abs(b.w))));
  for (const t of binned) {
    rows.push(h('div', { class: 'term-h', text: FEATURE_BY_KEY[t.key].label }));
    t.bands.forEach((b, i) => {
      const wpx = (Math.abs(b.w) / wmax) * 50;
      rows.push(h('div', { class: 'term' + (b.ref ? ' ref' : '') },
        h('span', { class: 'bl', text: b.label }),
        h('span', { class: 'np', text: pts[t.key]?.[i] != null ? pts[t.key][i] + ' pt' : '' }),
        h('span', { class: 'bar' }, h('i', { class: b.w >= 0 ? 'up' : 'dn', style: `width:${wpx.toFixed(1)}%;${b.w >= 0 ? 'left:50%' : `left:${(50 - wpx).toFixed(1)}%`}` })),
        h('span', { class: 'wv', text: b.ref ? 'ref' : (b.w >= 0 ? '+' : '−') + Math.abs(b.w).toFixed(2) })));
    });
  }
  const lin = terms.filter((t) => t.kind === 'lin').map((t) => `${FEATURE_BY_KEY[t.key].short} ${t.perUnit >= 0 ? '+' : '−'}${Math.abs(t.perUnit).toFixed(3)}/${FEATURE_BY_KEY[t.key].unit || 'unit'}`);
  fill(host, ...rows, h('p', { class: 'mini', text: 'Linear terms, log-odds per unit: ' + lin.join(' · ') + '. Bands with no training patients stay at 0.' }));
}

export function drawImportance(host, imp) {
  const max = Math.max(...imp.map((r) => r.mean), 1e-9);
  const rows = imp.slice().sort((a, b) => b.mean - a.mean).map((r) =>
    h('div', { class: 'imp-row' },
      h('span', { text: FEATURE_BY_KEY[r.key].short }),
      h('span', {}, h('i', { style: `width:${(100 * r.mean / max).toFixed(1)}%` })),
      h('span', { text: r.mean.toFixed(2) })));
  fill(host, h('div', { class: 'mini', text: 'mean |contribution|, log-odds, 300 test patients' }), ...rows);
}

export { LR_BINS };
