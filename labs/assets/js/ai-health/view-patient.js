/* ============================================================
   ai-health/view-patient.js — one patient read three ways: the
   editable index set, NEWS2's own chart with the scoring cells lit,
   the model's contribution waterfall, the observation chart over the
   patient's history, where the patient sits in the cohort, the
   counterfactuals, the audited explanation and a deletion test.
   ============================================================ */

import { NEWS2_ROWS, NEWS2_COLUMNS, FEATURE_BY_KEY, RECORDING_RULES, WARD, MODEL_CARD } from './config.js';
import { h, s, fill, scale, fmtPct, signed, clock, fitWidth } from './dom.js';
import { sigmoid, logit } from './rng.js';
import { fmtValue, TOP_K } from './explain.js';
import { scoreNEWS2 } from './news2.js';
import { featureValue } from './features.js';

const LETTER = { low: 'L', red: 'LM', medium: 'M', high: 'H' };

/* ---------- the editor ---------- */
const NUMERIC = ['rr', 'spo2', 'sbp', 'hr', 'temp', 'age'];
const FLAGS = [
  { key: 'o2', label: 'on supplemental oxygen' },
  { key: 'cvpu', label: 'new confusion (CVPU)' },
  { key: 'copd', label: 'COPD' },
  { key: 'scale2', label: 'SpO₂ target 88–92% (scale 2)' },
  { key: 'hf', label: 'heart failure' },
  { key: 'bb', label: 'on a beta-blocker' },
];

export function buildEditor(form, onChange) {
  const inputs = {};
  const rows = NUMERIC.map((k) => {
    const f = FEATURE_BY_KEY[k];
    const inp = h('input', { type: 'number', inputmode: 'decimal', id: 'v-' + k, min: f.min, max: f.max, step: f.step, 'aria-label': f.label });
    const bump = (dir) => { const v = clampV(k, (+inp.value || 0) + dir * f.step); inp.value = k === 'temp' ? v.toFixed(1) : v; onChange(); };
    inp.addEventListener('change', () => { inp.value = k === 'temp' ? clampV(k, +inp.value).toFixed(1) : clampV(k, +inp.value); onChange(); });
    inp.addEventListener('input', () => { if (inp.value !== '' && !Number.isNaN(+inp.value)) onChange(); });
    inputs[k] = inp;
    return h('div', { class: 'vrow', 'data-k': k },
      h('span', {}, h('b', { text: f.label }), ' ', f.unit, h('i', { class: 'was', 'data-was': k })),
      h('span', { class: 'num' },
        h('button', { type: 'button', 'aria-label': 'Decrease ' + f.label, onclick: () => bump(-1) }, '−'),
        inp,
        h('button', { type: 'button', 'aria-label': 'Increase ' + f.label, onclick: () => bump(1) }, '+')));
  });
  const flags = FLAGS.map(({ key, label }) => {
    const inp = h('input', { type: 'checkbox', id: 'v-' + key });
    inp.addEventListener('change', () => onChange());
    inputs[key] = inp;
    return h('label', { class: 'tog', 'data-k': key }, inp, h('span', { text: label }));
  });
  fill(form, ...rows, h('div', { class: 'vflags' }, ...flags));
  form.addEventListener('submit', (e) => e.preventDefault());
  return {
    set(p, source) {
      for (const k of NUMERIC) inputs[k].value = k === 'temp' ? (+p[k]).toFixed(1) : p[k];
      for (const { key } of FLAGS) inputs[key].checked = !!p[key];
      inputs.scale2.disabled = !p.copd;
      this.source = source;
      this.mark(p);
    },
    read(base) {
      const p = { ...base };
      for (const k of NUMERIC) { const v = +inputs[k].value; p[k] = Number.isFinite(v) && inputs[k].value !== '' ? clampV(k, v) : base[k]; }
      for (const { key } of FLAGS) p[key] = inputs[key].checked ? 1 : 0;
      if (!p.copd) { p.scale2 = 0; inputs.scale2.checked = false; }
      inputs.scale2.disabled = !p.copd;
      return p;
    },
    mark(p) {
      for (const k of [...NUMERIC, ...FLAGS.map((f) => f.key)]) {
        const row = form.querySelector(`[data-k="${k}"]`);
        const changed = this.source != null && +this.source[k] !== +p[k];
        row?.classList.toggle('changed', changed);
        const was = form.querySelector(`[data-was="${k}"]`);
        if (was) was.textContent = changed ? ` was ${k === 'temp' ? (+this.source[k]).toFixed(1) : this.source[k]}` : '';
      }
    },
  };
}

function clampV(k, v) {
  const f = FEATURE_BY_KEY[k];
  const r = Math.max(f.min, Math.min(f.max, v));
  return k === 'temp' ? Math.round(r * 10) / 10 : Math.round(r);
}

/* What the history makes of the index set: the temporal features. */
export function drawDerived(host, p) {
  const prev = p.prev?.length ? p.prev[p.prev.length - 1] : null;
  const items = ['d_rr', 'd_hr', 'd_sbp', 'd_spo2', 'slope', 'gap'].map((k) =>
    h('span', { class: 'dv' }, h('i', { text: FEATURE_BY_KEY[k].short }), fmtValue(k, featureValue(p, k))));
  fill(host,
    h('div', { class: 'mini lbl', text: prev ? `derived from ${p.prev.length} earlier sets` : 'no earlier sets' }),
    h('div', { class: 'dvs' }, ...items),
    p.missKeys?.length ? h('div', { class: 'mini carried', text: `carried forward from the previous set: ${p.missKeys.map((k) => FEATURE_BY_KEY[k].label).join(', ')}` }) : null,
    h('div', { class: 'mini attrs', text: `sex ${p.sex === 'F' ? 'female' : 'male'} · oximeter group: ${p.oxg ? 'over-reads' : 'accurate'} (not a model input)` }));
}

/* ---------- NEWS2 chart 1, with this patient's cells lit ---------- */
export function drawNewsGrid(table, totalHost, news, rule) {
  const head = h('tr', {}, h('th', { class: 'rowh', scope: 'col' }, 'parameter'),
    ...NEWS2_COLUMNS.map((c) => h('th', { scope: 'col', text: String(c) })), h('th', { class: 'pts', scope: 'col', text: 'pts' }));
  const body = NEWS2_ROWS.map((row) => {
    const part = news.parts.find((p) => p.row === row);
    return h('tr', { class: part ? '' : 'off' },
      h('th', { class: 'rowh', scope: 'row' }, row.label, row.unit ? h('small', { text: row.unit }) : null),
      ...row.cells.map((txt, col) => {
        const hit = part && part.col === col;
        return h('td', { class: `c${NEWS2_COLUMNS[col]}` + (hit ? ' hit' + (part.pts > 0 ? ' scored' : '') : ''), text: hit ? cellValue(row, part) : txt });
      }),
      h('td', { class: 'ptsv' + (part && part.pts > 0 ? ' scored' : ''), text: part ? String(part.pts) : '' }));
  });
  fill(table, h('caption', { class: 'mini', text: `Scale ${news.scale} is in use for SpO₂; the other scale row is dimmed. A lit cell shows the recorded value in the band that scored it. ${RECORDING_RULES}` }),
    h('thead', {}, head), h('tbody', {}, ...body));
  const fire = news.total >= rule.t || (rule.red && news.red);
  const r = news.risk;
  fill(totalHost,
    h('div', { class: 'nt-left' }, h('span', { class: 'mini', text: 'aggregate' }),
      h('span', { class: 'big' + (fire ? ' fire' : ''), text: String(news.total) }),
      h('span', { class: `catpill cat-${r.id}`, text: LETTER[r.id] }),
      h('span', { class: 'mini', text: fire ? 'alert fires' : 'no alert' })),
    h('div', { class: 'risk' }, h('b', { text: `${r.label} clinical risk` }), ` · chart 2: ${r.response}`, h('br'),
      h('span', { class: 'mon', text: `chart 4: ${r.monitoring}` }),
      h('ul', { class: 'c4' }, ...(r.chart4 || []).map((t) => h('li', { text: t }))),
      news.red && news.total < 5 ? h('span', { class: 'mini', text: 'red score: a 3 in a single parameter' }) : null));
}

function cellValue(row, part) {
  if (row.key === 'o2') return part.value ? 'Oxygen' : 'Air';
  if (row.key === 'cvpu') return part.value ? 'CVPU' : 'Alert';
  if (row.key === 'temp') return (+part.value).toFixed(1);
  return String(part.value);
}

/* ---------- the waterfall: the largest rows, the rest summed ---------- */
const SHOW = 9;
export function drawWaterfall(host, noteHost, expl, ranked, thr, method) {
  const shown = ranked.slice(0, SHOW);
  const rest = ranked.slice(SHOW);
  const rows = rest.length ? [...shown, { key: '_rest', label: `${rest.length} smaller`, c: rest.reduce((a, f) => a + f.c, 0), value: null, rest: true }] : shown;
  const W = 380, rowH = 19, top = 34, labW = 132, padR = 46;
  const Hh = top + (rows.length + 2) * rowH + 10;
  let run = expl.base;
  const steps = rows.map((f) => { const a = run; run += f.c; return { ...f, a, b: run }; });
  const lo = Math.min(expl.base, expl.logit, logit(thr), ...steps.map((q) => Math.min(q.a, q.b))) - 0.3;
  const hi = Math.max(expl.base, expl.logit, logit(thr), ...steps.map((q) => Math.max(q.a, q.b))) + 0.3;
  const x = scale(lo, hi, labW, W - padR);
  const svg = s('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img',
    'aria-label': `Contribution waterfall. Baseline ${fmtPct(sigmoid(expl.base))}, this patient ${fmtPct(sigmoid(expl.logit))}. ` +
      ranked.slice(0, TOP_K).map((f) => `${f.label} ${signed(f.c)}`).join(', ') + '.' });
  for (const p of [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 0.8, 0.95, 0.99]) {
    const l = logit(p);
    if (l < lo || l > hi) continue;
    svg.append(s('line', { x1: x(l), x2: x(l), y1: top - 6, y2: Hh - 6, stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(s('text', { x: x(l), y: top - 10, 'text-anchor': 'middle', class: 'tk', text: (100 * p) + '%' }));
  }
  svg.append(s('text', { x: 0, y: 10, class: 'tk', 'letter-spacing': '.08em', text: 'RISK · LOG-ODDS AXIS LABELLED IN %' }));
  const xt = x(logit(thr));
  svg.append(s('line', { x1: xt, x2: xt, y1: top - 4, y2: Hh - 6, stroke: 'var(--accretion)', 'stroke-dasharray': '3 3', opacity: 0.8 }));
  svg.append(s('text', { x: xt + 3, y: Hh - 2, class: 'tk gold', text: 'threshold ' + fmtPct(thr) }));
  const y0 = top + 4;
  svg.append(s('text', { x: 0, y: y0 + 9, class: 'lb dim', text: 'baseline' }));
  svg.append(s('line', { x1: x(expl.base), x2: x(expl.base), y1: y0, y2: y0 + rowH - 4, stroke: 'var(--text-dim)', 'stroke-width': 1.5 }));
  svg.append(s('text', { x: x(expl.base) + 5, y: y0 + 9, class: 'tk', text: fmtPct(sigmoid(expl.base)) }));
  steps.forEach((q, i) => {
    const y = top + (i + 1) * rowH + 4;
    const up = q.c >= 0;
    const xa = x(Math.min(q.a, q.b)), xb = x(Math.max(q.a, q.b));
    const big = !q.rest && i < TOP_K && Math.abs(q.c) >= 0.04;
    svg.append(s('text', { x: 0, y: y + 9, class: 'lb' + (big ? '' : ' dim'), text: q.rest ? q.label : FEATURE_BY_KEY[q.key].short }));
    if (!q.rest) svg.append(s('text', { x: labW - 6, y: y + 9, 'text-anchor': 'end', class: 'tk', text: shortValue(q.key, q.value) }));
    svg.append(s('line', { x1: x(q.a), x2: x(q.a), y1: y - 4, y2: y + 1, stroke: 'var(--line-bright)' }));
    svg.append(s('rect', { x: xa, y: y + 1, width: Math.max(1, xb - xa), height: rowH - 7,
      fill: up ? 'rgba(212,162,76,0.30)' : 'rgba(159,179,214,0.16)', stroke: up ? 'var(--accretion)' : 'var(--horizon)', 'stroke-width': 0.8, opacity: big ? 1 : 0.6 }));
    svg.append(s('text', { x: (up ? xb : xa) + (up ? 4 : -4), y: y + 10, 'text-anchor': up ? 'start' : 'end', class: 'tk ' + (up ? 'gold' : 'hz'), text: signed(q.c) }));
  });
  const yf = top + (rows.length + 1) * rowH + 4;
  const flagged = sigmoid(expl.logit) >= thr;
  const xl = x(expl.logit);
  svg.append(s('line', { x1: labW - 4, x2: W - 4, y1: yf - 2, y2: yf - 2, stroke: 'var(--line-bright)' }));
  svg.append(s('text', { x: 0, y: yf + 10, class: 'lb', text: 'this patient' }));
  svg.append(s('circle', { cx: xl, cy: yf + 7, r: 4, fill: flagged ? 'var(--accretion-soft)' : 'var(--text-bright)' }));
  if (flagged) svg.append(s('circle', { cx: xl, cy: yf + 7, r: 8, fill: 'none', stroke: 'var(--accretion)', opacity: 0.6 }));
  svg.append(s('text', { x: xl + (xl > W - 100 ? -10 : 10), y: yf + 10, 'text-anchor': xl > W - 100 ? 'end' : 'start', class: 'lb ' + (flagged ? 'gold' : ''),
    text: fmtPct(sigmoid(expl.logit)) + (flagged ? ' · flagged' : ' · not flagged') }));
  fill(host, svg);
  const sum = ranked.reduce((a, f) => a + f.c, 0);
  const err = Math.abs(expl.base + sum - expl.logit);
  fill(noteHost, `Sum check: baseline ${signed(expl.base, 3)} + contributions ${signed(sum, 3)} = ${signed(expl.base + sum, 3)}; model log-odds ${signed(expl.logit, 3)}; error ${err.toExponential(1)}.`, h('br'), method);
  return err;
}

function shortValue(k, v) {
  if (k === 'o2') return v ? 'on O₂' : 'air';
  if (k === 'cvpu') return v ? 'new' : 'alert';
  if (FEATURE_BY_KEY[k].binary) return v ? 'yes' : 'no';
  if (k === 'temp') return (+v).toFixed(1);
  if (k === 'slope') return (v >= 0 ? '+' : '') + (+v).toFixed(2);
  if (k === 'gap') return (+v).toFixed(1) + 'h';
  if (k.startsWith('d_')) return (v >= 0 ? '+' : '') + Math.round(v);
  return String(Math.round(v * 10) / 10);
}

/* ---------- the observation chart (after the layout of RCP Chart 3) ---------- */
const OBS_ROWS = [
  { key: 'rr', label: 'Resp rate' }, { key: 'spo2', label: 'SpO₂' }, { key: 'o2', label: 'Air / O₂' }, { key: 'sbp', label: 'Systolic' },
  { key: 'hr', label: 'Pulse' }, { key: 'cvpu', label: 'Conscious' }, { key: 'temp', label: 'Temp' },
];
export function drawObsChart(table, keyHost, p, opts = {}) {
  const sets = [...(p.prev || []), { ...p, t: 0, missKeys: p.missKeys || [] }];
  const scored = sets.map((q) => scoreNEWS2({ ...q, scale2: p.scale2 }));
  const head = h('tr', {}, h('th', { class: 'rowh', scope: 'col', text: opts.ward ? 'time' : 'hours' }),
    ...sets.map((q, i) => h('th', { scope: 'col', class: i === sets.length - 1 ? 'idx' : '',
      text: opts.ward ? clock(WARD.startHour, opts.hour + q.t).replace(/^(-?)(\d+):00$/, (m, a, b) => (+b < 0 ? String(24 + +b).padStart(2, '0') + ':00' : m)) : (i === sets.length - 1 ? 'index' : (q.t).toFixed(1)) })));
  const body = OBS_ROWS.map((r) => h('tr', {}, h('th', { class: 'rowh', scope: 'row', text: r.label }),
    ...sets.map((q, i) => {
      const part = scored[i].parts.find((x) => x.key === r.key);
      const carried = (q.missKeys || []).includes(r.key);
      const v = r.key === 'o2' ? (q.o2 ? 'O₂' : 'air') : r.key === 'cvpu' ? (q.cvpu ? 'CVPU' : 'A') : r.key === 'temp' ? (+q.temp).toFixed(1) : q[r.key];
      return h('td', { class: `p${part.pts}` + (carried ? ' carried' : '') + (i === sets.length - 1 ? ' idx' : ''), title: carried ? 'not recorded; carried forward' : `${part.pts} points` }, String(v));
    })));
  const tot = h('tr', { class: 'tot' }, h('th', { class: 'rowh', scope: 'row', text: 'NEWS2' }),
    ...scored.map((r, i) => h('td', { class: `cat-${r.risk.id}` + (i === sets.length - 1 ? ' idx' : '') }, h('b', { text: String(r.total) }), ' ', LETTER[r.risk.id])));
  const mon = h('tr', { class: 'mon' }, h('th', { class: 'rowh', scope: 'row', text: 'chart 4' }),
    ...scored.map((r) => h('td', { text: r.risk.monitoring.replace('Minimum ', '').replace('Continuous monitoring of vital signs', 'continuous') })));
  fill(table, h('thead', {}, head), h('tbody', {}, ...body, tot, mon));
  const firstAlert = scored.findIndex((r) => r.total >= opts.rule.t || (opts.rule.red && r.red));
  let key = `${sets.length} sets · cells shaded by points · dotted = carried forward`;
  if (opts.ward && opts.event != null) {
    const fa = firstAlert >= 0 ? opts.hour + sets[firstAlert].t : null;
    key += ` · deteriorates ${clock(WARD.startHour, opts.event)}` + (fa != null && fa < opts.event ? ` · NEWS2 first alerted ${opts.event - fa} h before` : ' · NEWS2 had not alerted by this hour');
  }
  keyHost.textContent = key;
}

/* ---------- where the patient sits in the test cohort ---------- */
export function drawDistribution(host, newsScores, risks, patientNews, patientRisk, rule, thr) {
  const W = fitWidth(host), H1 = 70, gap = 26;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H1 * 2 + gap + 34}`, role: 'img',
    'aria-label': `This patient: NEWS2 ${patientNews}, model risk ${fmtPct(patientRisk)}, among ${newsScores.length} test patients.` });
  // NEWS2 histogram
  const counts = new Array(21).fill(0);
  newsScores.forEach((v) => { counts[Math.min(20, v)]++; });
  const mx = Math.max(...counts);
  const bx = scale(0, 21, 4, W - 4), by = scale(0, Math.sqrt(mx), H1, 14);
  svg.append(s('text', { x: 4, y: 9, class: 'tk', text: 'NEWS2 TOTAL (√ COUNT)' }));
  counts.forEach((c, k) => {
    const fire = k >= rule.t;
    svg.append(s('rect', { x: bx(k) + 1, y: by(Math.sqrt(c)), width: bx(1) - bx(0) - 2, height: H1 - by(Math.sqrt(c)),
      fill: fire ? 'rgba(212,162,76,0.22)' : 'rgba(159,179,214,0.16)', stroke: k === Math.min(20, patientNews) ? 'var(--text-bright)' : 'none' }));
    if (k % 5 === 0) svg.append(s('text', { x: bx(k + 0.5), y: H1 + 10, 'text-anchor': 'middle', class: 'tk', text: k }));
  });
  const px = bx(Math.min(20, patientNews) + 0.5);
  svg.append(s('path', { d: `M${px - 4} ${12} L${px + 4} ${12} L${px} ${18} Z`, fill: 'var(--text-bright)' }));
  // model risk histogram on a log axis
  const y0 = H1 + gap;
  const lo = Math.log10(0.002), hi = 0;
  const nb = 30, rc = new Array(nb).fill(0);
  risks.forEach((r) => { rc[Math.max(0, Math.min(nb - 1, Math.floor((Math.log10(Math.max(r, 0.002)) - lo) / (hi - lo) * nb)))]++; });
  const rmx = Math.max(...rc);
  const rx = scale(lo, hi, 4, W - 4), ry = scale(0, Math.sqrt(rmx), y0 + H1, y0 + 14);
  svg.append(s('text', { x: 4, y: y0 + 9, class: 'tk', text: 'MODEL RISK, LOG AXIS (√ COUNT)' }));
  rc.forEach((c, k) => {
    const a = lo + (k / nb) * (hi - lo), b = lo + ((k + 1) / nb) * (hi - lo);
    svg.append(s('rect', { x: rx(a) + 0.5, y: ry(Math.sqrt(c)), width: rx(b) - rx(a) - 1, height: y0 + H1 - ry(Math.sqrt(c)),
      fill: 10 ** a >= thr ? 'rgba(212,162,76,0.22)' : 'rgba(159,179,214,0.16)' }));
  });
  for (const t of [0.01, 0.1, 1]) svg.append(s('text', { x: rx(Math.log10(t)), y: y0 + H1 + 10, 'text-anchor': 'middle', class: 'tk', text: (100 * t) + '%' }));
  const tx = rx(Math.log10(thr));
  svg.append(s('line', { x1: tx, x2: tx, y1: y0 + 12, y2: y0 + H1, stroke: 'var(--accretion)', 'stroke-dasharray': '3 3' }));
  const mx2 = rx(Math.log10(Math.max(0.002, patientRisk)));
  svg.append(s('path', { d: `M${mx2 - 4} ${y0 + 12} L${mx2 + 4} ${y0 + 12} L${mx2} ${y0 + 18} Z`, fill: 'var(--text-bright)' }));
  svg.append(s('line', { x1: mx2, x2: mx2, y1: y0 + 18, y2: y0 + H1, stroke: 'var(--text-bright)', opacity: 0.6 }));
  const pctN = newsScores.filter((v) => v < patientNews).length / newsScores.length;
  const pctM = risks.filter((v) => v < patientRisk).length / risks.length;
  svg.append(s('text', { x: 4, y: y0 + H1 + 28, class: 'lb dim', text: `NEWS2 above ${fmtPct(pctN, 0)}, risk above ${fmtPct(pctM, 0)} of test patients` }));
  fill(host, svg);
}

/* ---------- counterfactuals ---------- */
export function drawCounterfactuals(host, items, onApply) {
  fill(host, ...items.map((it) => {
    const what = h('div', { class: 'cf-what' });
    if (!it.cf.found) {
      what.append(`No change of up to ${it.cf.bound} standard units in one or two vitals ${it.cf.flagged ? 'clears' : 'triggers'} this alert. `,
        h('span', { class: 'after', text: `${it.cf.evaluated} candidate observations searched.` }));
    } else {
      it.cf.list.forEach((cf, n) => {
        const line = h('div', { class: 'cf-line' + (n === 0 ? ' first' : '') });
        cf.changes.forEach((c, ci) => {
          if (ci) line.append(h('span', { class: 'plus', text: '+' }));
          const f = FEATURE_BY_KEY[c.key];
          const d = c.to - c.from;
          line.append(h('span', { class: 'chg' }, f.short + ' ', fmtValue(c.key, c.from), ' → ', h('em', { text: fmtValue(c.key, c.to) }),
            f.binary ? '' : ` (${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(c.key === 'temp' ? 1 : 0)})`));
        });
        line.append(h('span', { class: 'after', text: `${it.after(cf.changes)} · distance ${cf.cost.toFixed(2)}` }),
          h('button', { type: 'button', class: 'ctl xs', onclick: () => onApply(cf.changes) }, 'apply'));
        what.append(line);
      });
      what.append(h('span', { class: 'after', text: `${it.cf.evaluated} candidates searched` }));
    }
    return h('div', { class: 'cf-row' },
      h('div', { class: 'cf-who' }, it.who, h('b', { class: it.cf.flagged ? 'fire' : '', text: it.cf.flagged ? 'alert now' : 'no alert now' })),
      what);
  }));
}

/* ---------- the audited explanation ---------- */
export function drawExplanation(textHost, auditHost, audit) {
  const frag = [];
  for (const snt of audit.sentences) {
    if (snt.blocked) { frag.push(h('span', { class: 'blocked', text: '[sentence blocked: clinical advice] ' })); continue; }
    frag.push(markSentence(snt), ' ');
  }
  if (audit.ward) frag.push(h('span', { class: 'ward-line' }, h('i', { text: 'ward · ' }), audit.ward.blocked ? '[blocked]' : markSentence(audit.ward)));
  fill(textHost, ...frag);
  const items = [];
  audit.sentences.forEach((snt, i) => {
    for (const c of snt.checks) items.push(h('li', { class: c.ok ? '' : c.soft ? 'soft' : 'bad' }, h('span', { text: c.ok ? 'PASS' : c.blocked ? 'BLOCK' : c.soft ? 'NOTE' : 'FLAG' }), h('span', { text: `s${i + 1} ${c.kind}: ${c.text}` })));
  });
  for (const c of audit.factorChecks) items.push(h('li', { class: c.ok ? '' : 'bad' }, h('span', { text: c.ok ? 'PASS' : 'FLAG' }), h('span', { text: `factor: ${c.text}` })));
  if (audit.ward) for (const c of audit.ward.checks) items.push(h('li', { class: c.ok ? '' : c.soft ? 'soft' : 'bad' }, h('span', { text: c.ok ? 'PASS' : c.soft ? 'NOTE' : 'FLAG' }), h('span', { text: `ward ${c.kind}: ${c.text}` })));
  items.push(h('li', { class: 'verdict' }, h('span', { text: audit.ok ? 'OK' : 'FLAG' }),
    h('span', { text: audit.ok ? `Every claim checks: ${audit.claims.verified} of ${audit.claims.n} claims verified against the engine.`
      : `${audit.claims.verified} of ${audit.claims.n} claims verified; ${audit.bad} checks fail. The text says something the numbers do not.` })));
  fill(auditHost, ...items);
}

function markSentence(snt) {
  const bad = new Set(snt.checks.filter((c) => c.kind === 'feature' && !c.ok).map((c) => c.word));
  const good = new Set(snt.checks.filter((c) => c.kind === 'feature' && c.ok).map((c) => c.word));
  const struck = new Set(snt.struck);
  const words = [...bad, ...good].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/2/g, '[2₂]'));
  const parts = [...(words.length ? [`(${words.join('|')})`] : []), '(\\d+(?:\\.\\d+)?)'];
  const re = new RegExp(parts.join('|'), 'gi');
  const out = h('span', {});
  let last = 0, m;
  const text = snt.text;
  while ((m = re.exec(text))) {
    out.append(text.slice(last, m.index));
    const tok = m[0];
    if (/^\d/.test(tok)) out.append(struck.has(tok) ? h('s', { class: 'bad', title: 'matches no computed value', text: tok }) : tok);
    else out.append(h('mark', { class: bad.has(tok.toLowerCase().replace(/₂/g, '2')) ? 'bad' : '', text: tok }));
    last = m.index + tok.length;
  }
  out.append(text.slice(last));
  return out;
}

/* ---------- the deletion test ---------- */
export function drawDeletion(host, noteHost, curves) {
  const { top, random, k } = curves;
  const W = fitWidth(host), H = 170, m = { l: 34, r: 10, t: 10, b: 26 };
  const ymax = Math.max(...top, ...random, 0.1) * 1.08;
  const x = scale(0, k, m.l, W - m.r), y = scale(0, ymax, H - m.b, m.t);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Deletion test: removing the top ${k} features moves the log-odds by ${top[k].toFixed(2)}; removing ${k} random features moves it by ${random[k].toFixed(2)} on average.` });
  for (let i = 0; i <= k; i++) svg.append(s('text', { x: x(i), y: H - m.b + 12, 'text-anchor': 'middle', class: 'tk', text: i }));
  for (const v of [0, ymax / 2, ymax]) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: 'var(--line)' }));
    svg.append(s('text', { x: m.l - 4, y: y(v) + 3, 'text-anchor': 'end', class: 'tk', text: v.toFixed(1) }));
  }
  svg.append(s('text', { x: (m.l + W - m.r) / 2, y: H - 2, 'text-anchor': 'middle', class: 'tk', text: 'features reset to their training reference' }));
  const pth = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('');
  svg.append(s('path', { d: pth(random), fill: 'none', stroke: 'var(--text-dim)', 'stroke-dasharray': '4 3' }));
  svg.append(s('path', { d: pth(top), fill: 'none', stroke: 'var(--accretion)', 'stroke-width': 1.6 }));
  svg.append(s('text', { x: x(k) - 2, y: y(top[k]) - 6, 'text-anchor': 'end', class: 'tk gold', text: 'largest first' }));
  svg.append(s('text', { x: x(k) - 2, y: y(random[k]) + 12, 'text-anchor': 'end', class: 'tk', text: 'random order (20 draws)' }));
  fill(host, svg);
  const lead = top.slice(1).reduce((a, v, i) => a + (v - random[i + 1]), 0) / k;
  noteHost.textContent = `Change in log-odds as features are reset one by one to their training reference. Resetting the ${Math.min(3, k)} largest contributions moves the prediction ${top[Math.min(3, k)].toFixed(2)}; resetting ${Math.min(3, k)} random features moves it ${random[Math.min(3, k)].toFixed(2)} on average. ` +
    (lead > 0 ? 'The ranking is faithful: the features the explanation names matter more than others.' : 'The ranking is not doing better than chance for this patient.');
}

export function drawModelCard(dl, info) {
  const rows = [
    ['model', info.name], ['intended use', MODEL_CARD.intended], ['out of scope', MODEL_CARD.outOfScope], ['data', MODEL_CARD.data],
    ['inputs', info.inputs], ['fit', info.fit], ['test performance', info.perf], ['by slice', info.slices], ['caveats', MODEL_CARD.caveats],
  ];
  fill(dl, ...rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
}
