/* ============================================================
   ai-health/view-slices.js — performance by subgroup, and the search
   for the worst one. Per slice: n, events, sensitivity, false-positive
   rate and alert rate for NEWS2 and the chosen model at the chosen
   thresholds, AUROC, and calibration-in-the-large (observed events
   over the model's predicted total, O/E). Intervals are percentile
   bootstrap intervals from the same 200 resamples as section 03. A
   slice is marked when its sensitivity interval sits wholly below the
   overall value, or when the model under-predicts its events beyond
   Poisson noise. Slices with fewer than 30 events are flagged as too
   small to read.
   ============================================================ */

import { SLICES, ATTRIBUTES, SMALL_SLICE_EVENTS } from './config.js';
import { roc } from './metrics.js';
import { h, s, fill, scale, fmtPct, fmt } from './dom.js';

function sliceStats(ix, y, scoreN, alertN, scoreM, thr) {
  let ev = 0, tpN = 0, tpM = 0, fpN = 0, fpM = 0, aN = 0, aM = 0, pSum = 0;
  for (const i of ix) {
    const fN = alertN[i], fM = scoreM[i] >= thr;
    ev += y[i]; pSum += scoreM[i];
    if (fN) aN++; if (fM) aM++;
    if (y[i]) { if (fN) tpN++; if (fM) tpM++; } else { if (fN) fpN++; if (fM) fpM++; }
  }
  const neg = ix.length - ev;
  return {
    n: ix.length, ev, oe: pSum ? ev / pSum : NaN, expected: pSum,
    news: { sens: ev ? tpN / ev : NaN, fpr: neg ? fpN / neg : NaN, alert: aN / ix.length },
    model: { sens: ev ? tpM / ev : NaN, fpr: neg ? fpM / neg : NaN, alert: aM / ix.length },
  };
}

export function computeSlices(test, sc, thr) {
  const y = test.map((p) => p.y);
  return SLICES.map((sl) => {
    const ix = [];
    test.forEach((p, i) => { if (sl.test(p)) ix.push(i); });
    const st = sliceStats(ix, y, sc.news, sc.alertN, sc.model, thr);
    const yy = ix.map((i) => y[i]);
    const aucOk = st.ev && st.ev < ix.length;
    return { ...sl, ix, ...st,
      aucN: aucOk ? roc(ix.map((i) => sc.news[i]), yy).auc : NaN, aucM: aucOk ? roc(ix.map((i) => sc.model[i]), yy).auc : NaN };
  });
}

/* boot: { slices: { [id]: { newsSens: [lo,hi], modelSens: [lo,hi], oe: [lo,hi] } } } or null while running */
export function drawSlices(host, rows, boot, modelName, onPick, picked) {
  const all = rows[0];
  const x = scale(0, 1, 6, 214);
  const ci = (id, k) => boot?.slices?.[id]?.[k];
  const dot = (r) => {
    const svg = s('svg', { viewBox: '0 0 220 22', width: 220, height: 22, role: 'img', 'aria-label': `${r.label}: NEWS2 sensitivity ${fmtPct(r.news.sens)}, ${modelName} ${fmtPct(r.model.sens)}` });
    for (const t of [0, 0.5, 1]) svg.append(s('line', { x1: x(t), x2: x(t), y1: 2, y2: 20, class: 'grid' }));
    svg.append(s('line', { x1: x(all.news.sens), x2: x(all.news.sens), y1: 1, y2: 21, class: 'refl hz' }));
    svg.append(s('line', { x1: x(all.model.sens), x2: x(all.model.sens), y1: 1, y2: 21, class: 'refl gold' }));
    if (r.ev) {
      const cn = ci(r.id, 'newsSens'), cmn = ci(r.id, 'modelSens');
      if (cn) svg.append(s('line', { x1: x(cn[0]), x2: x(cn[1]), y1: 7, y2: 7, class: 'ci hz' }));
      svg.append(s('circle', { cx: x(r.news.sens), cy: 7, r: 3, class: 'op-ring hz solid' }));
      if (cmn) svg.append(s('line', { x1: x(cmn[0]), x2: x(cmn[1]), y1: 15, y2: 15, class: 'ci gold' }));
      svg.append(s('circle', { cx: x(r.model.sens), cy: 15, r: 3, class: 'op-dot gold' }));
    }
    return svg;
  };
  const fails = (r, who) => {
    if (r.id === 'all' || r.ev < 5) return false;
    const c = ci(r.id, who === 'news' ? 'newsSens' : 'modelSens');
    const lowSens = c ? c[1] < all[who].sens : false;
    const under = who === 'model' && Math.abs(r.ev - r.expected) > 1.96 * Math.sqrt(Math.max(1, r.expected)) && r.ev > r.expected;
    return lowSens || under;
  };
  const table = h('table', {},
    h('thead', {}, h('tr', {}, h('th', { text: 'slice' }), h('th', { text: 'n' }), h('th', { text: 'events' }),
      h('th', { text: 'sensitivity  ○ NEWS2  ● model' }), h('th', { text: 'sens N / M' }), h('th', { text: 'FPR N / M' }),
      h('th', { text: 'alerts N / M' }), h('th', { text: 'AUROC N / M' }), h('th', { text: 'O/E' }))),
    h('tbody', {}, ...rows.map((r) => {
      const fN = fails(r, 'news'), fM = fails(r, 'model');
      const small = r.id !== 'all' && r.ev < SMALL_SLICE_EVENTS;
      const oeCi = ci(r.id, 'oe');
      return h('tr', { class: [r.id === 'all' ? 'all' : '', fN || fM ? 'fail' : '', picked === r.id ? 'picked' : ''].join(' ') },
        h('td', { class: 'lbl' }, h('button', { type: 'button', class: 'slice-btn', 'aria-pressed': String(picked === r.id), onclick: () => onPick(r) }, r.label),
          small ? h('span', { class: 'small-flag', title: `fewer than ${SMALL_SLICE_EVENTS} events: too small to read` }, ' small') : null),
        h('td', { text: r.n }), h('td', { text: r.ev }), h('td', { class: 'dots' }, dot(r)),
        h('td', {}, h('span', { class: fN ? 'bad' : '', text: fmtPct(r.news.sens, 0) }), ' / ', h('span', { class: fM ? 'bad' : 'gold', text: fmtPct(r.model.sens, 0) })),
        h('td', { text: `${fmtPct(r.news.fpr, 0)} / ${fmtPct(r.model.fpr, 0)}` }),
        h('td', { text: `${fmtPct(r.news.alert, 0)} / ${fmtPct(r.model.alert, 0)}` }),
        h('td', { text: `${fmt(r.aucN, 3)} / ${fmt(r.aucM, 3)}` }),
        h('td', {}, h('span', { class: r.id !== 'all' && r.ev > r.expected && fM ? 'bad' : '', text: fmt(r.oe, 2) }),
          oeCi ? h('span', { class: 'ci-t', text: ` (${fmt(oeCi[0], 2)}–${fmt(oeCi[1], 2)})` }) : null));
    })));
  fill(host, table);
}

/* One paragraph from the numbers. */
export function finding(rows, modelName, info) {
  const all = rows[0];
  const cand = rows.filter((r) => r.id !== 'all' && r.ev >= 8);
  const worstM = cand.slice().sort((a, b) => a.model.sens - b.model.sens)[0];
  const worstN = cand.slice().sort((a, b) => a.news.sens - b.news.sens)[0];
  const old = rows.find((r) => r.id === 'a80');
  const parts = [h('span', {}, `At these thresholds the ${modelName} catches `, h('b', { text: fmtPct(all.model.sens, 0) }), ` of deteriorations and NEWS2 `, h('b', { text: fmtPct(all.news.sens, 0) }), '. ')];
  if (worstN) parts.push(h('span', {}, `NEWS2 does worst for `, h('b', { text: worstN.label.toLowerCase() }), ` (${fmtPct(worstN.news.sens, 0)}, ${worstN.ev} events). `));
  if (worstM) parts.push(h('span', {}, `The model does worst for `, h('b', { text: worstM.label.toLowerCase() }), ` (${fmtPct(worstM.model.sens, 0)}, ${worstM.ev} events). `));
  if (old) parts.push(h('span', {}, `For patients 80+, observed events are `, h('b', { text: fmt(old.oe, 2) + '×' }), ` the model's predicted total. ${info}`));
  return parts;
}

/* Every attribute value and every pair of values from different attributes. */
export function worstSliceSearch(test, sc, thr, { minEvents = 10, top = 5 } = {}) {
  const y = test.map((p) => p.y);
  const singles = ATTRIBUTES.flatMap((a) => a.values.map((v) => ({ attrs: [a.id], label: v.label, test: v.test })));
  const pairs = [];
  for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) {
    if (singles[i].attrs[0] === singles[j].attrs[0]) continue;
    const a = singles[i], b = singles[j];
    pairs.push({ attrs: [a.attrs[0], b.attrs[0]], label: `${a.label} × ${b.label.toLowerCase()}`, test: (p) => a.test(p) && b.test(p) });
  }
  const allIx = test.map((_, i) => i);
  const base = sliceStats(allIx, y, sc.news, sc.alertN, sc.model, thr);
  const scored = [...singles, ...pairs].map((c) => {
    const ix = [];
    test.forEach((p, i) => { if (c.test(p)) ix.push(i); });
    const st = sliceStats(ix, y, sc.news, sc.alertN, sc.model, thr);
    return { ...c, ...st, gapN: st.news.sens - base.news.sens, gapM: st.model.sens - base.model.sens };
  }).filter((c) => c.ev >= minEvents);
  return {
    searched: singles.length + pairs.length, kept: scored.length, base,
    news: scored.slice().sort((a, b) => a.gapN - b.gapN).slice(0, top),
    model: scored.slice().sort((a, b) => a.gapM - b.gapM).slice(0, top),
  };
}

export function drawSearch(host, res, modelName) {
  const list = (title, rows, key, cls) => h('div', { class: 'srch' }, h('div', { class: 'mini lbl', text: title }),
    h('ol', {}, ...rows.map((r) => h('li', {}, h('span', { class: 'sl', text: r.label }),
      h('span', { class: cls, text: `${fmtPct(r[key === 'gapN' ? 'news' : 'model'].sens, 0)} (${r[key] >= 0 ? '+' : '−'}${Math.abs(100 * r[key]).toFixed(0)} pts)` }),
      h('span', { class: 'mini', text: ` ${r.ev} events` })))));
  fill(host,
    h('p', { class: 'mini', text: `${res.searched} slices searched (every group, every pair of groups); ${res.kept} have 10 or more events. Ranked by sensitivity gap at the chosen thresholds, so alert burden is the same for every slice.` }),
    list('NEWS2, worst five', res.news, 'gapN', 'hz'), list(`${modelName}, worst five`, res.model, 'gapM', 'gold'));
}
