/* ============================================================
   view/halflife.js — the Half-Life plate: ten sentences about what
   AI cannot do, checked on seven open models from 2019 to 2026.

   Every number on the plate is a field of
   assets/data/honesty-decoder/half-life.json, written from the
   sealed run by the same rules that gave its verdict
   (_reference kill_test/export_page.mjs). This file computes no
   pass rate, bound or death of its own: it reads them and draws.

   Gold marks only what fired: the pencil stroke through a sentence
   that died, and the tick on the cell where it died. A cell that
   clears the bar after the death gains a brighter edge, not gold.
   ============================================================ */
import { el } from '../../kit/dom.js';
import { scale, bindScale } from '../../kit/controls.js';

const DATA = 'assets/data/honesty-decoder/half-life.json';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ym = (iso) => iso.slice(0, 7);
const monthYear = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const pct = (k, n) => `${Math.round((100 * k) / n)}%`;

// A sentence died under (w, r) when its death is on a model; "alive" means no model cleared the bar.
const died = (s, w, r) => s.deaths[w][r].kind !== 'alive';
const heldEverywhere = (d, s) => d.wordings.every((w) => d.rules.every((r) => !died(s, w.id, r)));

function deathIndex(d, s, w, r) {
  const x = s.deaths[w][r];
  return x.kind === 'alive' ? -1 : d.models.findIndex((m) => m.name === x.model);
}

function readout(d, s, w, r, i) {
  const m = d.models[i], c = s.cells[w][r][i];
  const rule = r === 'exact' ? 'exact' : s.partial ? `partial (${s.partial})` : 'exact (no partial rule for this sentence)';
  const verdict = c.clears ? 'clears the bar' : 'does not clear the bar';
  const at = deathIndex(d, s, w, r) === i ? ', the first model to do so: the sentence died here' : '';
  return `${m.name}, released ${m.released}: ${c.k} of ${c.n} right, ${rule}, ${d.wordings.find((x) => x.id === w).name} wording. Lower bound ${c.lower.toFixed(2)}, so it ${verdict}${at}.`;
}

function render(root, d) {
  const newest = d.models[d.models.length - 1];
  const held = d.sentences.filter((s) => heldEverywhere(d, s));
  const state = { w: 'w1', r: 'exact' };

  root.replaceChildren();
  const head = el('div', 'hl-head');
  head.append(el('p', 'hl-kick', `a sealed test, run ${d.run.asked} on ${d.run.machine}`));
  const h = el('h2', 'hl-h', `${held.length} of ${d.sentences.length} things people say AI can't do still held in ${monthYear(newest.released)}, on small open models.`);
  h.id = 'hl-h';
  head.append(h);
  const nOf = (id) => d.sentences.find((s) => s.id === id)?.n;
  head.append(el('p', 'hl-lede',
    `Each sentence became ${nOf('reverse')} generated questions (${nOf('letters')} for letter counting), asked of ${d.models.length} open models released from ${d.models[0].released.slice(0, 4)} to ${newest.released.slice(0, 4)}, ` +
    `in ${d.wordings.length} wordings. Every answer was held to a typed field by the runtime, with no reasoning mode. A sentence dies on the first model whose ${d.rule.bound} on the pass rate reaches ${d.rule.bar.toFixed(2)}: ${d.rule.needs[nOf('reverse')]} of ${nOf('reverse')} right, or ${d.rule.needs[nOf('letters')]} of ${nOf('letters')}.`));
  root.append(head);

  const ctl = el('div', 'hl-ctl');
  const wScale = scale({ name: 'wording', ariaLabel: 'How the question was put', value: state.w,
    options: d.wordings.map((w) => ({ value: w.id, label: w.gated ? w.short : `${w.short} *`, attrs: { 'aria-label': w.gated ? `${w.name} wording` : `${w.name} wording, reported and not tested` } })) });
  const rScale = scale({ name: 'scoring', ariaLabel: 'How an answer was scored', value: state.r,
    options: d.rules.map((r) => ({ value: r, label: r })) });
  ctl.append(wScale, rScale);
  root.append(ctl);

  // the strip's column heads: each model and its release month
  const grid = el('div', 'hl-grid');
  grid.setAttribute('role', 'table');
  grid.setAttribute('aria-label', 'Each sentence against each model, by release date');
  const cols = el('div', 'hl-row hl-cols');
  cols.setAttribute('role', 'row');
  cols.append(el('span', 'hl-say', ''));
  const colStrip = el('span', 'hl-strip');
  for (const m of d.models) { const c = el('span', 'hl-col'); c.append(el('b', '', m.short), el('span', '', ym(m.released))); colStrip.append(c); }
  cols.append(colStrip, el('span', 'hl-note', ''));
  grid.append(cols);

  const rows = d.sentences.map((s) => {
    const row = el('div', 'hl-row');
    row.setAttribute('role', 'row');
    const say = el('span', 'hl-say', s.says);
    const strip = el('span', 'hl-strip');
    const cells = d.models.map((m, i) => {
      const b = el('button', 'hl-cell');
      b.type = 'button';
      b.dataset.i = String(i);
      strip.append(b);
      return b;
    });
    const note = el('span', 'hl-note', '');
    row.append(say, strip, note);
    grid.append(row);
    return { s, row, say, cells, note };
  });
  root.append(grid);

  const out = el('p', 'hl-readout', '');
  out.setAttribute('aria-live', 'polite');
  const ask = el('p', 'hl-ask', '');
  root.append(out, ask);

  const foot = el('div', 'hl-foot');
  const moved = d.sentences.filter((s) => s.spreadMonths > 0);
  const scoringMoved = d.sentences.filter((s) => s.scoringMonths.A > 0 || s.scoringMonths.B > 0);
  const gated = d.wordings.filter((w) => w.gated).length;
  // how many models apart a sentence's deaths fell across the tested wordings, under either rule
  const apart = (s) => Math.max(...d.rules.map((r) => {
    const at = d.wordings.filter((w) => w.gated).map((w) => deathIndex(d, s, w.id, r));
    return at.some((i) => i < 0) ? 0 : Math.max(...at) - Math.min(...at);
  }));
  const movedText = moved.length
    ? `Under the ${gated} tested wordings, ${moved.map((s) => `${s.id} died ${apart(s)} models apart`).join(' and ')}: at least ${moved.map((s) => s.spreadMonths).join(' and ')} months by the test's interval rule, short of the ${d.rule.generationMonths} months it required.`
    : `Under the ${gated} tested wordings, no death moved.`;
  const scoringText = scoringMoved.length ? `Scoring moved ${scoringMoved.map((s) => s.id).join(', ')}.` : 'Scoring moved no date.';
  foot.append(
    el('p', '', `${movedText} ${scoringText} The test asked whether wording moves the date a claim dies, and it ended without an answer: ${d.sentences.length - held.length} sentences died at all, and it needed ${d.rule.movingMin} to move.`),
    el('p', '', '* Steps (step by step) is reported, not tested. Under a typed answer its working had to fit one text field, and its replies were the ones most often cut at the length limit.'),
    el('p', '', `What this cannot show: free-text answers, models that reason before they answer, models larger than 8B, and the years 2020 to 2022, whose open models the runtime here (${d.run.runtime}, on ${d.run.machine}) could not run.`),
  );
  const tag = el('p', 'hl-tags');
  tag.append(el('b', 't-real', '[REAL]'), document.createTextNode(` every count, bound, death and spread, from ${d.run.replies.toLocaleString('en-US')} recorded replies, read through the rules that gave the test's verdict. Sentences and wordings as asked; the example questions are from the unsealed practice draw.`));
  foot.append(tag);
  root.append(foot);

  let focus = null;   // { row, i } under the pointer or in focus
  function show(r, i) {
    const w = state.w, rule = state.r;
    out.textContent = readout(d, r.s, w, rule, i);
    ask.textContent = `Asked as: ${r.s.examples[w]}`;
  }
  function draw() {
    const w = state.w, rule = state.r;
    let first = null;
    for (const r of rows) {
      const at = deathIndex(d, r.s, w, rule);
      const isDead = at >= 0;
      r.say.classList.toggle('struck', isDead);
      r.note.textContent = isDead
        ? `died at ${d.models[at].short}, ${ym(d.models[at].released)}`
        : `held through ${newest.short}, ${ym(newest.released)}`;
      r.note.classList.toggle('dead', isDead);
      r.cells.forEach((b, i) => {
        const c = r.s.cells[w][rule][i];
        b.style.setProperty('--rate', (c.k / c.n).toFixed(3));
        b.classList.toggle('clears', c.clears);
        b.classList.toggle('death', i === at);
        b.setAttribute('aria-label', readout(d, r.s, w, rule, i));
        b.textContent = '';
        b.append(el('span', 'hl-v', pct(c.k, c.n)));
      });
      if (isDead && !first) first = { row: r, i: at };
    }
    const f = focus || first || { row: rows[0], i: d.models.length - 1 };
    show(f.row, f.i);
  }
  for (const r of rows) {
    r.cells.forEach((b, i) => {
      const pick = () => { focus = { row: r, i }; show(r, i); };
      b.addEventListener('pointerenter', pick);
      b.addEventListener('focus', pick);
      b.addEventListener('click', pick);
    });
  }
  bindScale(wScale, (v) => { state.w = v; draw(); });
  bindScale(rScale, (v) => { state.r = v; draw(); });
  draw();
}

const root = document.getElementById('half-life');
if (root) {
  fetch(DATA)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((d) => render(root, d))
    .catch((e) => { root.replaceChildren(el('p', 'hl-error', `The test's data file did not load (${e.message}), so this plate shows nothing rather than a number it cannot back.`)); });
}
