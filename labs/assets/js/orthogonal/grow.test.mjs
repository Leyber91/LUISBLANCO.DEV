/* ============================================================
   orthogonal/grow.test.mjs: the engine's checks, run by
   tools/lab_tests.mjs on every pull request. Written before the
   table and the rule existed (brief engine.md, 2026-11-21), so its
   first run failed on a missing module; the sections on "better"
   (H to K) were written before the rule changed (brief engine_b.md,
   2026-11-21), and failed on the first pass's rule and table.

   A. CAF (Hordijk 2023, Algorithm 3) on small networks: a row
      enters only with all its inputs and at least one tool in the
      food set or made before it; the set is the one maximal CAF
      whatever the table's order.
   B. The keep rule (Arthur and Polak 2006) on small tables: the
      first row to meet an unmet need is kept, a row that meets none
      is lost, a second maker of a thing already made is lost; the
      job keeps a new answer only when it serves better than the one
      in use, or as well at a lower cost.
   C. Test 1: Earth's endowment builds Earth's six lamps in the
      ledger's order, and keeps of them the ones that undercut every
      lamp before them on Nordhaus's price of light.
   D. Test 2: with coal removed, a different and complete set of
      rows is grown, every need of every kept step met.
   E. Test 3: world 1's own steps, with the driver reverted, each
      have an unmet need, or Earth's branch wins first.
   F. The advisor's failure checks: no cost tuned per case (a row's
      date, era, label and source, and the table's order, change
      nothing that grows); a removal never leaves the job unserved
      when any branch exists; two different drivers do not fall to
      the same fallback branch.
   G. The table itself: every row typed, every Earth row dated with
      a source opened or a declared gap, every name it uses defined.
   H. The measure: every lamp carries Nordhaus's price of light or a
      declared gap, and the figure is the one the page image shows.
   I. "Better" on the light table: the job ends at the
      best-performing row CAF allows, for Earth and every removal of
      one or two endowment items; removing Earth's winner promotes
      the best remaining row; a removal can keep an also-ran Earth
      never kept; a removal that touches no winner changes none.
   J. Sources honest: no row cites the Historical Tech Tree.
   K. The verdict line: composed from the engine's findings, each
      clause tagged by the rows it rests on.
   L. "Better" at each date (brief dated.md): figureAt, dated(), and the
      eras line: the count and the misses against an oracle read from
      the page images' copy, and a removal promoting the next cheapest.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './grow.js';
import * as W1 from './worlds/fungi-early.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'data', 'orthogonal', 'tech', 'light.json'), 'utf8'));
const JOB = TABLE.job;
const { DRIVER } = W1;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`); }
};
/* a check whose body may throw: on the first pass's rule a function it calls does not exist yet, and that is a failure of
   this check, not of the file */
const t = (name, fn) => {
  let r;
  try { r = fn(); } catch (e) { ok(name, false, `threw: ${e.message}`); return; }
  if (Array.isArray(r)) ok(name, r[0], r[1]); else ok(name, r);
};
const need = (name) => {
  if (typeof G[name] !== 'function') throw new Error(`grow.js has no ${name}()`);
  return G[name];
};
const { admissible, branch, caf, endowmentOf, grow, lineage, makes, whyNot } = G;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const table = (rows) => ({ job: 'J', rows });
const row = (id, inputs, tools, jobs = [], extra = {}) => ({ id, label: id, jobs, inputs, tools, era: 'x', ...extra });
/* a lamp of the small tables: a row that serves J, with its figure (lower is better) or none */
const lamp = (id, inputs, tools, value) => row(id, inputs, tools, ['J'], value === undefined ? { perf: { gap: 'none' } } : { perf: { value } });
const ids = (run) => run.kept.map((k) => k.id);
const byId = new Map(TABLE.rows.map((r) => [r.id, r]));
const answers = TABLE.rows.filter((r) => r.jobs.includes(JOB));

/* An oracle written apart from grow.js: replay a run and say every kept row whose inputs, or every one of whose tools,
   were not yet in the world before its step. A complete branch replays with none. */
function replayFaults(tab, run) {
  const rows = new Map(tab.rows.map((r) => [r.id, r]));
  const have = new Set(run.food);
  const out = [];
  const steps = [...new Set(run.kept.map((k) => k.step))].sort((a, b) => a - b);
  for (const s of steps) {
    const now = run.kept.filter((k) => k.step === s);
    for (const k of now) {
      const r = rows.get(k.id);
      if (!r.inputs.every((i) => have.has(i))) out.push(`${k.id}: an input missing at step ${s}`);
      if (!r.tools.some((x) => have.has(x))) out.push(`${k.id}: no tool at step ${s}`);
    }
    for (const k of now) { const r = rows.get(k.id); have.add(r.id); r.jobs.forEach((j) => have.add(j)); }
  }
  return out;
}

/* Nordhaus (1996), Table 1.6, "Labor Price of Light", pp. 52 and 53 of the chapter, copied here from the page images
   (rendered at 150 dpi from the NBER scan, 2026-11-21) apart from the table's own copy, so a slip in either shows: for each
   device and fuel, its stages in the table's order, each with the approximate date, the labor price (hours of work per
   1,000 lumen-hours) and the price (cents per 1,000 lumen-hours). */
const T16 = {
  'candle-tallow': [['Tallow', '1800', 5.37, 40.293], ['Tallow', '1830', 3.00, 18.315]],
  'candle-sperm': [['Sperm', '1800', 12.21, 91.575], ['Sperm', '1830', 6.91, 42.125]],
  'lamp-whale-oil': [['Whale oil', '1815-45', 4.90, 29.886]],
  'lamp-sperm-oil': [["Silliman's experiment: sperm oil", '1855', 16.03, 160.256]],
  'lamp-other-oils': [["Silliman's experiment: other oils", '1855', 5.94, 59.441]],
  'town-gas': [['Early lamp', '1827', 7.398, 52.524], ["Silliman's experiment", '1855', 2.978, 29.777], ['Early lamp', '1875-85', 0.326, 5.0345],
    ['Welsbach mantle', '1885-95', 0.083, 1.573], ['Welsbach mantle', '1916', 0.012, 0.346]],
  'kerosene-lamp': [["Silliman's experiment", '1855', 0.2306, 4.036], ['19th century', '1875-85', 0.2253, 3.479], ['Coleman lantern', '1993', 0.0098, 10.323]],
  'electric-lamp': [['Edison carbon lamp', '1883', 0.750239, 9.228], ['Carbon filament', '1900', 0.220431, 2.692], ['Carbon filament', '1910', 0.092096, 1.384],
    ['Filament lamp', '1920', 0.013538, 0.630], ['Filament lamp', '1930', 0.010396, 0.509], ['Filament lamp', '1940', 0.005490, 0.323],
    ['Filament lamp', '1950', 0.001883, 0.241], ['Filament lamp', '1960', 0.001016, 0.207], ['Filament lamp', '1970', 0.000551, 0.175],
    ['Filament lamp', '1980', 0.000678, 0.447], ['Filament lamp', '1990', 0.000605, 0.600], ['Compact fluorescent', '1992', 0.000119, 0.124]],
};
const firstYear = (at) => Number(String(at).match(/\d{3,4}/)[0]);

// ---------------------------------------------------------------- A. CAF
{
  // food {a, t}; r1 makes b from a with tool t; r2 makes c from b with tool c2 (made by r3 from a with t); r4 needs z
  const T = table([row('b', ['a'], ['t']), row('c', ['b'], ['c2']), row('c2', ['a'], ['t']), row('z1', ['z'], ['t'])]);
  const S = caf(T, ['a', 't']);
  ok('CAF: a row with its inputs and a tool in the food set enters in the first round', S.find((e) => e.id === 'b').gen === 1 && S.find((e) => e.id === 'c2').gen === 1);
  ok('CAF: a row whose tool is made by another enters after it', S.find((e) => e.id === 'c').gen === 2);
  ok('CAF: a row with an input nothing makes never enters', !S.some((e) => e.id === 'z1'));
  const noTool = caf(table([row('b', ['a'], ['u', 'v'])]), ['a']);
  ok('CAF: a row with none of its tools never enters, even with all its inputs', noTool.length === 0);
  ok('CAF: one tool of several is enough', caf(table([row('b', ['a'], ['u', 'v'])]), ['a', 'v']).length === 1);
  const reversed = caf(table([...T.rows].reverse()), ['a', 't']);
  ok('CAF: the set and its rounds do not depend on the table order', same(S.map((e) => `${e.id}${e.gen}`).sort(), reversed.map((e) => `${e.id}${e.gen}`).sort()));
  ok('CAF: what a row makes is its id and its jobs', same(makes(row('b', [], [], ['j1', 'j2'])), ['b', 'j1', 'j2']));
  ok('CAF: admissible reads inputs as all and tools as any', admissible(row('b', ['a', 'c'], ['u', 'v']), new Set(['a', 'c', 'v'])) && !admissible(row('b', ['a', 'c'], ['u', 'v']), new Set(['a', 'v'])));
}

// ---------------------------------------------------------------- B. the keep rule
{
  // J is the job. lamp1 serves J from fuel; fuel made by f1 or f2 (the same); junk meets nothing; lamp2 comes a step
  // later through b2 and serves better
  const T = table([
    row('f1', ['a'], ['t'], ['fuel']), row('f2', ['a'], ['t'], ['fuel']),
    lamp('lamp1', ['fuel'], ['t'], 5), row('junk', ['a'], ['t'], ['nothing-needed']),
    lamp('lamp2', ['b2'], ['t'], 3), row('b2', ['fuel'], ['t'], []),
  ]);
  const run = grow(T, ['a', 't'], 'J');
  ok('keep: the first maker of what a lamp needs is kept', ids(run).includes('f1'));
  ok('keep: a second maker of the same thing in the same step is lost', run.lost.some((l) => l.id === 'f2'));
  ok('keep: a row that meets no need is lost', run.lost.some((l) => l.id === 'junk'));
  ok('keep: the job is answered, and answered again by a later lamp that serves better', same(branch(run), ['lamp1', 'lamp2']), branch(run).join());
  ok('keep: each kept step says the needs it met', run.kept.find((k) => k.id === 'lamp1').met.some((m) => m.need === 'J') && run.kept.find((k) => k.id === 'f1').met.some((m) => m.need === 'fuel'));
  ok('keep: a tie decided by the table order is recorded', run.ties.some((x) => x.winner === 'f1' && x.loser === 'f2'));
  ok('keep: the run replays with every input and a tool in place', replayFaults(T, run).length === 0, replayFaults(T, run).join('; '));
  // the lineage of a row: the kept rows it rests on, in the order they were kept, each with the needs it met
  const L = lineage(run, T, 'lamp2');
  ok('lineage: the chain from the endowment to a row, in order', same(L.map((s) => s.id), ['f1', 'b2', 'lamp2']), L.map((s) => s.id).join());
  ok('lineage: each step names the rows and the endowment it drew on', same(L[1].from, ['f1']) && same(L[0].from, []));
  ok('whyNot: a row the run never kept says why', whyNot(run, T, 'junk').kind === 'lost' && whyNot(grow(T, ['t'], 'J'), T, 'f1').kind === 'unmet');
  ok('whyNot: a row the run kept is not refused', whyNot(run, T, 'lamp1') === null);
  const bare = JSON.parse(JSON.stringify(T));
  grow(bare, ['a', 't'], 'J');
  ok('keep: grow leaves the table as it found it', same(bare, T));
}

// ---------------------------------------------------------------- B2. "better" on small tables (brief engine_b.md 1)
{
  // a step apart: cheap (5) at step 1; m at step 1; dear (9) and fine (2) at step 2, from m
  const T = table([lamp('cheap', ['a'], ['t'], 5), row('m', ['a'], ['t'], ['m']), lamp('dear', ['m'], ['t'], 9), lamp('fine', ['m'], ['t'], 2)]);
  const run = grow(T, ['a', 't'], 'J');
  t('better: a later answer that serves better replaces the one in use', () => [same(branch(run), ['cheap', 'fine']), branch(run).join()]);
  t('better: a later answer that serves worse is lost, and the run names what served better', () => {
    const l = run.lost.find((x) => x.id === 'dear');
    return [!!l && l.by === 'fine', JSON.stringify(l)];
  });
  t('better: the job ends at the best answer CAF allows (winner)', () => need('winner')(run) === 'fine');
  t('better: whyNot says a lost answer lost to a better one, and to which', () => {
    const w = whyNot(run, T, 'dear');
    return [w && w.kind === 'lost' && w.first === 'fine' && w.need === 'J', JSON.stringify(w)];
  });
  // a gap ranks below every figure: kept only when nothing serves yet, and replaced by the first answer with a figure
  const T2 = table([lamp('dim', ['a'], ['t']), row('m', ['a'], ['t'], ['m']), lamp('priced', ['m'], ['t'], 50), lamp('late-gap', ['m'], ['t'])]);
  const r2 = grow(T2, ['a', 't'], 'J');
  t('better: an answer with no figure is kept when nothing serves the job yet', () => branch(r2)[0] === 'dim');
  t('better: an answer with any figure replaces one with none, however dear', () => [same(branch(r2), ['dim', 'priced']), branch(r2).join()]);
  t('better: an answer with no figure is ranked below one with a figure in the same step', () => r2.lost.some((x) => x.id === 'late-gap' && x.by === 'priced'));
  // in one step: the better figure wins whatever the table's order; at one figure, the lower cost; at one figure and one
  // cost, the table's order, and the run says so
  const T3 = table([lamp('worse', ['a'], ['t'], 4), lamp('better', ['a'], ['t'], 3)]);
  t('better: in one step the better figure wins whatever the table order', () => branch(grow(T3, ['a', 't'], 'J'))[0] === 'better' && branch(grow(table([...T3.rows].reverse()), ['a', 't'], 'J'))[0] === 'better');
  const T4 = table([row('m', ['a'], ['t'], ['m']), row('n', ['a'], ['t'], ['n']), lamp('two', ['m', 'n'], ['t'], 4), lamp('one', ['m'], ['t'], 4)]);
  t('better: at one figure in one step, the answer resting on fewer rows wins (Arthur and Polak: as well at lower cost)', () => [same(branch(grow(T4, ['a', 't'], 'J')), ['one']), branch(grow(T4, ['a', 't'], 'J')).join()]);
  const T5 = table([row('m', ['a'], ['t'], ['m']), lamp('p', ['m'], ['t'], 4), lamp('q', ['m'], ['t'], 4)]);
  const r5 = grow(T5, ['a', 't'], 'J');
  t('better: at one figure and one cost the table orders them, and the run records it', () => [branch(r5)[0] === 'p' && r5.ties.some((x) => x.order && x.winner === 'p' && x.loser === 'q'), JSON.stringify(r5.ties)]);
  // the answer in use keeps the job against a later one that is only as good, at a cost no lower
  const T6 = table([lamp('first', ['a'], ['t'], 4), row('m', ['a'], ['t'], ['m']), lamp('again', ['m'], ['t'], 4)]);
  t('better: a later answer only as good does not replace the one in use', () => same(branch(grow(T6, ['a', 't'], 'J')), ['first']));
  // a lost answer's lineage: the rows it drew on, kept, and itself, built and not kept
  t('lineage: an answer built and not kept has a lineage ending in it, marked not kept', () => {
    const L = lineage(run, T, 'dear');
    return [same(L.map((s) => s.id), ['m', 'dear']) && L[L.length - 1].kept === false, JSON.stringify(L)];
  });
  // built: the answers CAF admitted in the run, kept or not, in the order the rule weighed them (by step, then fewer
  // rows rested on, then the table's order: dear and fine both rest on m, and dear comes first in the table)
  // (changed after the first run of this check, which put the kept answer first within a step: that order hid the
  // ledger's within-step order, gas before kerosene, which the rows' costs give)
  t('built: every answer the run built, kept or not, with its step', () => [same(need('built')(run).map((b) => `${b.id}@${b.step}${b.kept ? '' : '-'}`), ['cheap@1', 'dear@2-', 'fine@2']), JSON.stringify(need('built')(run))]);
}

// ---------------------------------------------------------------- C. test 1: Earth builds the ledger's lamps, keeps the cheaper
const EARTH = endowmentOf(TABLE, {});
const earth = grow(TABLE, EARTH, JOB);
const LEDGER = ['tallow-candle', 'whale-oil-lamp', 'gas-lamp', 'kerosene-lamp', 'arc-lamp', 'incandescent-lamp'];
{
  t("test 1: Earth's endowment builds the ledger's six lamps for light at night, in the ledger's order", () => {
    const b = need('built')(earth).map((x) => x.id).filter((id) => LEDGER.includes(id));
    return [same(b, LEDGER), b.join(', ')];
  });
  const ledgerRows = TABLE.rows.filter((r) => r.ledger);
  const dated = ledgerRows.filter((r) => r.jobs.includes(JOB)).sort((a, b) => a.date - b.date).map((r) => r.id);
  ok("test 1: the ledger's order is the table's own dates for the ledger's lamps", same(dated, LEDGER), dated.join(', '));
  ok("test 1: the ledger is the brief's, named in its words", same(LEDGER.map((id) => byId.get(id) && byId.get(id).ledger), ['wood and tallow', 'whale oil', 'coal gas', 'kerosene', 'electric arc', 'the incandescent lamp']));
  t("test 1: each of Earth's lamps is built no earlier than the one before", () => {
    const steps = LEDGER.map((id) => need('built')(earth).find((b) => b.id === id).step);
    return [steps.every((s, i) => i === 0 || s >= steps[i - 1]), steps.join(', ')];
  });
  // under "better", Earth keeps of its ledger the lamps that undercut every lamp built before them: derived here from the
  // figures and the build steps, apart from grow.js's job rule
  t("test 1: Earth keeps exactly the ledger lamps that undercut every lamp built before them on Nordhaus's price", () => {
    const fig = need('figure');
    const b = need('built')(earth);
    let best = Infinity;
    const want = [];
    for (const step of [...new Set(b.map((x) => x.step))].sort((x, y) => x - y)) {
      const here = b.filter((x) => x.step === step).map((x) => [x.id, fig(byId.get(x.id), TABLE)]).filter(([, f]) => f !== null).sort((p, q) => p[1] - q[1]);
      if (here.length && here[0][1] < best) { best = here[0][1]; want.push(here[0][0]); }
    }
    const got = branch(earth).filter((id) => byId.get(id).perf && byId.get(id).perf.series);
    return [same(got, want) && branch(earth).every((id) => want.includes(id) || !byId.get(id).perf.series), `kept ${branch(earth).join(', ')}; derived ${want.join(', ')}`];
  });
  t("test 1: no two of Earth's lamps were put in order by the table's order", () => {
    const ordered = earth.ties.filter((x) => x.order && answers.some((r) => r.id === x.winner) && answers.some((r) => r.id === x.loser));
    return [ordered.length === 0, ordered.map((x) => `${x.winner} before ${x.loser}`).join('; ')];
  });
  // a tie the rule cannot break among the rows the job's answers rest on is declared in the table with the history that
  // breaks it, and the table's order agrees with that history (coal gas and wood gas are one structure)
  t("test 1: every tie on the lineage of an answer Earth builds is declared, with the history that settles it", () => {
    const on = new Set(need('built')(earth).flatMap((b) => lineage(earth, TABLE, b.id).map((s) => s.id)));
    const decided = earth.ties.filter((x) => !x.order && (on.has(x.winner) || on.has(x.loser)));
    const declared = (x) => (TABLE.ties || []).some((d) => d.need === x.need && d.earth === x.winner && d.rows.includes(x.loser) && /\b(1[5-9]|20)\d\d\b/.test(d.source || ''));
    return [decided.every(declared), decided.map((x) => `${x.winner} over ${x.loser} for ${x.need}`).join('; ')];
  });
  for (const d of TABLE.ties || []) ok(`test 1: the declared tie for ${d.need} is one the rule meets on Earth`, earth.ties.some((x) => x.need === d.need && x.winner === d.earth));
  ok('test 1: the run replays with every input and a tool in place', replayFaults(TABLE, earth).length === 0, replayFaults(TABLE, earth).join('; '));
  try {
    const fig = need('figure');
    console.log(`  measured: Earth builds ${need('built')(earth).map((b) => `${b.id} ${b.step}${b.kept ? ' kept' : ''} (${fig(byId.get(b.id), TABLE) ?? 'gap'})`).join(', ')}`);
  } catch { /* measured only once the rule exists */ }
}

// ---------------------------------------------------------------- D. test 2: coal removed
const NOCOAL = endowmentOf(TABLE, { remove: ['coal'] });
const nocoal = grow(TABLE, NOCOAL, JOB);
{
  ok('test 2: with coal removed, the job is served', branch(nocoal).length > 0);
  ok('test 2: with coal removed, every kept step has every input and a tool in place', replayFaults(TABLE, nocoal).length === 0, replayFaults(TABLE, nocoal).join('; '));
  ok('test 2: with coal removed, no step rests on coal', !nocoal.kept.some((k) => byId.get(k.id).inputs.includes('coal')));
  ok("test 2: the rows grown without coal are different from Earth's", !same(ids(nocoal), ids(earth)), 'the same rows were kept');
  const full = branch(nocoal).every((id) => lineage(nocoal, TABLE, id).every((s) => s.met.length > 0));
  ok("test 2: the branch is complete: every step of every lamp's lineage met a need", full);
  // what the removal changes: the makers of what coal made, and the lamps that win (I below holds the second in general)
  const swapped = nocoal.kept.filter((k) => !ids(earth).includes(k.id)).map((k) => k.id);
  console.log(`  measured: without coal, kept and not on Earth: ${swapped.join(', ')}; lamps kept: ${branch(nocoal).join(', ')} (Earth: ${branch(earth).join(', ')})`);
}

// ---------------------------------------------------------------- E. test 3: world 1, with the driver reverted
const WORLD1 = endowmentOf(TABLE, DRIVER);
const world1 = grow(TABLE, WORLD1, JOB);
{
  let div = null;
  t('world 1: the engine builds a lamp Earth never builds', () => {
    div = need('divergence')(earth, world1, TABLE);
    const eb = need('built')(earth).map((b) => b.id);
    return [!!div && !!div.world && !eb.includes(div.world), JSON.stringify(div)];
  });
  const L = div ? lineage(world1, TABLE, div.world) : [];
  const own = L.filter((s) => !earth.kept.some((k) => k.id === s.id));
  // the steps, counted as the plate counts its branch: the driver is step 1, then this world's own rows in the order built
  const steps = [{ id: 'driver' }, ...own];
  ok("world 1: its lamp's lineage has steps of its own", own.length > 0, L.map((s) => s.id).join(', '));
  for (const s of own) {
    const w = whyNot(earth, TABLE, s.id);
    ok(`test 3: with the driver reverted, ${s.id} has an unmet need, or Earth's branch wins first`, !!w && (w.kind === 'unmet' || w.kind === 'lost'), JSON.stringify(w));
  }
  for (let k = 3; k <= 5; k++) {
    if (!steps[k - 1]) continue;
    const id = steps[k - 1].id;
    const w = whyNot(earth, TABLE, id);
    ok(`test 3: step ${k} (${id}) has an unmet need with the driver reverted, or Earth's branch wins first`, !!w, 'Earth keeps it too');
  }
  ok('test 3: step 3 at least exists to be tested', steps.length >= 3, `${steps.length - 1} steps after the driver: ${own.map((s) => s.id).join(', ')}`);
  // under "better" the lamp is kept exactly when its figure beats the answer in use when it is built
  t("world 1: its lamp is kept exactly when it serves better than the answer in use at its step", () => {
    const fig = need('figure');
    const step = div.step;
    const inUse = branch(world1).filter((id) => world1.kept.find((k) => k.id === id).step < step).pop();
    const f = fig(byId.get(div.world), TABLE), g = inUse ? fig(byId.get(inUse), TABLE) : null;
    const better = !inUse || (f !== null && (g === null || f < g));
    return [div.kept === better && branch(world1).includes(div.world) === better, `${div.world} ${f ?? 'gap'} against ${inUse} ${g ?? 'gap'}; kept ${div.kept}`];
  });
  console.log(`  measured: world 1's own steps: driver, ${own.map((s) => `${s.id} (at ${s.step}${s.kept === false ? ', not kept' : ''})`).join(', ')}; Earth's lamp then: ${div && div.earth} (${div && div.how}); lamps kept: ${branch(world1).join(', ')}`);
}

// ---------------------------------------------------------------- F. the advisor's failure checks
{
  // no cost tuned per case: the rule reads a row's id, jobs, inputs, tools and its one figure for the job, and nothing
  // else; the table is one for every world; its order decides nothing but the ties a run records
  ok('no cost tuned per case: grow takes a table, an endowment and a job, and nothing else', grow.length === 3);
  const STRUCT = new Set(['id', 'jobs', 'inputs', 'tools']);
  const strip = (r) => {
    const o = Object.fromEntries(Object.entries(r).filter(([k]) => STRUCT.has(k)));
    let f = null;
    try { f = need('figure')(r, TABLE); } catch { /* no figure before the rule */ }
    if (f !== null) o.perf = { value: f };
    return o;
  };
  const bare = { job: TABLE.job, rows: TABLE.rows.map(strip) };
  const cases = [['Earth', EARTH], ['no coal', NOCOAL], ['world 1', WORLD1]];
  for (const [name, food] of cases) {
    ok(`no cost tuned per case: ${name} grows the same with every date, era, label, source and series stripped`, same(grow(bare, food, JOB), grow(TABLE, food, JOB)));
    const back = { ...TABLE, rows: [...TABLE.rows].reverse() };
    const a = grow(TABLE, food, JOB), b = grow(back, food, JOB);
    const tied = new Set(a.ties.flatMap((x) => [x.winner, x.loser]).concat(b.ties.flatMap((x) => [x.winner, x.loser])));
    const differ = [...new Set([...ids(a), ...ids(b)])].filter((id) => ids(a).includes(id) !== ids(b).includes(id) && !tied.has(id));
    ok(`no cost tuned per case: ${name}, the table reversed, keeps the same rows but for recorded ties`, differ.length === 0, differ.join(', '));
    ok(`no cost tuned per case: ${name}'s lamps do not depend on the table's order`, same(branch(a), branch(b)), `${branch(a).join()} / ${branch(b).join()}`);
  }
  const keys = new Set(TABLE.rows.flatMap((r) => Object.keys(r)));
  ok('no cost tuned per case: no row carries a field naming a world, a weight or a cost', ![...keys].some((k) => /world|weight|cost|score|rank|prior|order/i.test(k)), [...keys].join(', '));
  const pkeys = new Set(TABLE.rows.flatMap((r) => Object.keys(r.perf || {})));
  ok("no cost tuned per case: a lamp's figure names a series of the source and nothing about a world", [...pkeys].every((k) => ['series', 'gap'].includes(k)), [...pkeys].join(', '));

  // a removal never leaves the job unserved when any branch exists: every single and every pair of endowment items
  let tried = 0;
  const unserved = [];
  for (let i = 0; i < EARTH.length; i++) for (let j = i; j < EARTH.length; j++) {
    const remove = i === j ? [EARTH[i]] : [EARTH[i], EARTH[j]];
    const food = endowmentOf(TABLE, { remove });
    tried++;
    const possible = caf(TABLE, food).some((e) => byId.get(e.id).jobs.includes(JOB));
    if (possible && !branch(grow(TABLE, food, JOB)).length) unserved.push(remove.join('+'));
  }
  ok(`a removal never leaves the job unserved when any branch exists (${tried} removals of one or two items)`, unserved.length === 0, unserved.join('; '));

  // two different drivers do not fall to the same fallback branch: each driver takes away a different one of Earth's
  // lamps, or the means of one; the rows they grow are all different
  const drivers = [['no coal', { remove: ['coal'] }], ['no whales', { remove: ['whales'] }], ['no petroleum', { remove: ['petroleum'] }],
    ['no copper', { remove: ['copper-ore'] }], ['no animal fat', { remove: ['animal-fat'] }], ['world 1', DRIVER]];
  const grown = drivers.map(([name, d]) => [name, grow(TABLE, endowmentOf(TABLE, d), JOB)]);
  for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
    ok(`two different drivers do not fall to the same branch: ${grown[i][0]} and ${grown[j][0]}`, !same(ids(grown[i][1]), ids(grown[j][1])));
  }
  for (const [name, run] of grown) ok(`${name}: the job is served`, branch(run).length > 0);
  // and under "better": two drivers that each change the lamps Earth keeps do not fall to the same lamps
  const changing = grown.filter(([, run]) => !same(branch(run), branch(earth)));
  for (let i = 0; i < changing.length; i++) for (let j = i + 1; j < changing.length; j++) {
    ok(`two drivers that change Earth's lamps do not fall to the same lamps: ${changing[i][0]} and ${changing[j][0]}`, !same(branch(changing[i][1]), branch(changing[j][1])),
      branch(changing[i][1]).join());
  }
  console.log(`  measured: lamps kept by driver: ${grown.map(([n, r]) => `${n}: ${branch(r).join(' > ')}`).join('; ')}`);
}

// ---------------------------------------------------------------- G. the table
{
  const named = new Set([...EARTH, ...(DRIVER.add || [])]);
  for (const r of TABLE.rows) { named.add(r.id); r.jobs.forEach((j) => named.add(j)); }
  const rowIds = TABLE.rows.map((r) => r.id);
  ok('table: about 40 rows', TABLE.rows.length >= 30 && TABLE.rows.length <= 60, String(TABLE.rows.length));
  ok('table: every id is unique', new Set(rowIds).size === rowIds.length);
  const GAPS = new Set(['not opened', 'primary not opened']);
  for (const r of TABLE.rows) {
    ok(`table: ${r.id} is typed (label, jobs, inputs, tools, era)`, typeof r.label === 'string' && r.label.trim() && Array.isArray(r.jobs) && Array.isArray(r.inputs) && Array.isArray(r.tools) && typeof r.era === 'string');
    ok(`table: ${r.id} has at least one tool, as CAF's catalyst`, r.tools.length >= 1);
    for (const x of [...r.inputs, ...r.tools]) ok(`table: ${r.id} uses "${x}", which the endowment or some row makes`, named.has(x));
    const earthRow = r.date !== undefined;
    if (earthRow) {
      ok(`table: Earth row ${r.id} has a whole-number date`, Number.isInteger(r.date));
      ok(`table: Earth row ${r.id} has a source opened, or the gap declared`, (typeof r.source === 'string' && /\b(1[5-9]|20)\d\d\b/.test(r.source) && r.source.length > 20) !== GAPS.has(r.gap), JSON.stringify([r.source, r.gap]));
    } else {
      ok(`table: ${r.id}, with no date, is an invented row and says so`, typeof r.invented === 'string' && r.invented.trim().length > 20);
    }
  }
  for (const e of TABLE.endowment) ok(`table: endowment item ${e.id} has a label and a source or a gap`, !!e.label && (!!e.source !== GAPS.has(e.gap)));
}

// ---------------------------------------------------------------- H. the measure: Nordhaus's price of light
{
  t('measure: the table declares its measure for the job, its unit, which way is better, and its source', () => {
    const m = TABLE.measure || {};
    return [m.job === JOB && /hours of work per 1,000 lumen-hours/.test(m.unit || '') && m.better === 'lower' && /Nordhaus/.test(m.source || '') && /Table 1\.6/.test(m.source || ''), JSON.stringify(m)];
  });
  t("measure: the table's copy of Table 1.6 is the one read from the page image, stage by stage", () => {
    const series = (TABLE.measure || {}).series || {};
    const bad = Object.entries(T16).filter(([k, v]) => !same(series[k], v)).map(([k]) => k);
    const extra = Object.keys(series).filter((k) => !T16[k]);
    return [bad.length === 0 && extra.length === 0, `differs: ${bad.join(', ')}; not on the page: ${extra.join(', ')}`];
  });
  for (const r of answers) {
    t(`measure: ${r.id}, an answer to the job, carries a series of the source or a declared gap`, () => {
      const p = r.perf || {};
      return [(typeof p.series === 'string' && !!T16[p.series]) !== (typeof p.gap === 'string' && p.gap.length > 10), JSON.stringify(p)];
    });
    if (r.invented) t(`measure: ${r.id}, invented, carries no figure`, () => !!r.perf && !r.perf.series && !!r.perf.gap);
  }
  t("measure: a lamp's figure is its series' labor price at the earliest date the source gives", () => {
    const fig = need('figure');
    const bad = answers.filter((r) => r.perf && r.perf.series).filter((r) => {
      const s = T16[r.perf.series];
      const first = [...s].sort((a, b) => firstYear(a[1]) - firstYear(b[1]))[0];
      return fig(r, TABLE) !== first[2];
    });
    return [bad.length === 0, bad.map((r) => `${r.id} ${fig(r, TABLE)}`).join('; ')];
  });
  t('measure: a row that serves no job of the measure has no figure, and a gap has none', () => {
    const fig = need('figure');
    return TABLE.rows.every((r) => (r.perf && r.perf.series ? fig(r, TABLE) > 0 : fig(r, TABLE) === null));
  });
  // just inside and just outside: a figure is read from the series named, and a series the source lacks is refused
  t('measure: a series the source does not give is refused, not read as a gap', () => {
    try { need('figure')({ id: 'x', jobs: [JOB], perf: { series: 'nowhere' } }, TABLE); return false; } catch (e) { return /nowhere/.test(e.message); }
  });
}

// ---------------------------------------------------------------- I. "better" on the light table
{
  const ALSO = TABLE.rows.filter((r) => r.alsoRan).map((r) => r.id);
  t("also-rans: Earth's also-rans for light are in the table, each dated, with a source or a declared gap", () => {
    const want = ['argand-lamp', 'thermolampe', 'limelight', 'camphene-lamp'];
    const bad = want.filter((id) => !byId.get(id) || !byId.get(id).alsoRan || !byId.get(id).jobs.includes(JOB) || !Number.isInteger(byId.get(id).date));
    return [bad.length === 0 && ALSO.every((id) => !byId.get(id).ledger && !byId.get(id).invented), `missing or untyped: ${bad.join(', ')}`];
  });
  // the oracle: the best answer CAF admits for a food set, by the figure (a gap below every figure); with no figure at
  // all, an answer of the earliest round
  const fig = (r) => need('figure')(r, TABLE);
  const best = (food) => {
    const admitted = caf(TABLE, food).filter((e) => byId.get(e.id).jobs.includes(JOB));
    if (!admitted.length) return { none: true };
    const priced = admitted.map((e) => [e.id, fig(byId.get(e.id))]).filter(([, f]) => f !== null).sort((a, b) => a[1] - b[1]);
    if (priced.length) return { id: priced[0][0], unique: priced.length < 2 || priced[1][1] > priced[0][1] };
    const g = Math.min(...admitted.map((e) => e.gen));
    return { among: admitted.filter((e) => e.gen === g).map((e) => e.id) };
  };
  const ends = (run, b) => {
    const w = G.winner ? G.winner(run) : branch(run).pop();
    return b.none ? !w : b.id ? w === b.id : b.among.includes(w);
  };
  t("better: Earth's job ends at the best-performing row CAF allows", () => {
    const b = best(EARTH);
    return [ends(earth, b), `ends at ${need('winner')(earth)}; best ${JSON.stringify(b)}`];
  });
  t('better: so does every removal of one or two endowment items', () => {
    const wrong = [];
    let n = 0;
    for (let i = 0; i < EARTH.length; i++) for (let j = i; j < EARTH.length; j++) {
      const remove = i === j ? [EARTH[i]] : [EARTH[i], EARTH[j]];
      const food = endowmentOf(TABLE, { remove });
      n++;
      const b = best(food);
      if (!ends(grow(TABLE, food, JOB), b)) wrong.push(`${remove.join('+')}: ${need('winner')(grow(TABLE, food, JOB))} against ${JSON.stringify(b)}`);
    }
    return [wrong.length === 0, `${wrong.length} of ${n}: ${wrong.slice(0, 4).join('; ')}`];
  });
  t("better: removing Earth's winner from the table promotes the best remaining row", () => {
    const w = need('winner')(earth);
    const less = { ...TABLE, rows: TABLE.rows.filter((r) => r.id !== w) };
    const run = grow(less, EARTH, JOB);
    const rest = caf(less, EARTH).filter((e) => byId.get(e.id).jobs.includes(JOB)).map((e) => [e.id, fig(byId.get(e.id))]).filter(([, f]) => f !== null).sort((a, b) => a[1] - b[1]);
    return [need('winner')(run) === rest[0][0] && rest[0][0] !== w, `Earth's winner ${w}; then ${need('winner')(run)}; best remaining ${rest[0][0]}`];
  });
  t("better: removing what only Earth's winner needs promotes the same row", () => {
    const w = need('winner')(earth);
    const only = EARTH.filter((x) => lineage(earth, TABLE, w).some((s) => byId.get(s.id).inputs.includes(x))
      && !branch(earth).filter((id) => id !== w).some((id) => lineage(earth, TABLE, id).some((s) => byId.get(s.id).inputs.includes(x))));
    const wins = only.map((x) => [x, need('winner')(grow(TABLE, endowmentOf(TABLE, { remove: [x] }), JOB))]);
    const less = { ...TABLE, rows: TABLE.rows.filter((r) => r.id !== w) };
    const promoted = need('winner')(grow(less, EARTH, JOB));
    return [wins.length > 0 && wins.some(([, x]) => x === promoted), JSON.stringify(wins)];
  });
  t('better: a removal of one or two endowment items keeps an also-ran Earth never kept', () => {
    const found = [];
    for (let i = 0; i < EARTH.length; i++) for (let j = i; j < EARTH.length; j++) {
      const remove = i === j ? [EARTH[i]] : [EARTH[i], EARTH[j]];
      const run = grow(TABLE, endowmentOf(TABLE, { remove }), JOB);
      for (const id of branch(run)) if (ALSO.includes(id) && !branch(earth).includes(id)) found.push(`${remove.join('+')}: ${id}`);
    }
    if (found.length) console.log(`  measured: also-rans kept: ${found.length} removals, first ${found.slice(0, 3).join('; ')}`);
    return [found.length > 0, 'none'];
  });
  // a removal that touches no row of any lineage Earth's lamps rest on changes no lamp Earth keeps: the lamps depend on
  // what they rest on and on the figures of the answers built, and a removal takes answers away, never adds one
  t("better: a removal that touches no kept lamp's lineage changes no lamp Earth keeps", () => {
    const on = new Set(branch(earth).flatMap((id) => lineage(earth, TABLE, id).flatMap((s) => [...byId.get(s.id).inputs, ...byId.get(s.id).tools])));
    const wrong = [];
    let n = 0;
    for (let i = 0; i < EARTH.length; i++) for (let j = i; j < EARTH.length; j++) {
      const remove = i === j ? [EARTH[i]] : [EARTH[i], EARTH[j]];
      if (remove.some((x) => on.has(x))) continue;
      n++;
      const run = grow(TABLE, endowmentOf(TABLE, { remove }), JOB);
      if (!same(branch(run), branch(earth))) wrong.push(remove.join('+'));
    }
    return [n > 0 && wrong.length === 0, `${n} removals tried; changed: ${wrong.join(', ')}`];
  });
  try { console.log(`  measured: Earth's winner ${need('winner')(earth)}; Earth keeps ${branch(earth).join(' > ')}`); } catch { /* the rule first */ }
}

// ---------------------------------------------------------------- J. sources honest (brief engine_b.md 2)
{
  // the 31 rows the first pass cited to the Historical Tech Tree, which has no licence and guides checks only
  const HTT_ROWS = ['fat-rendering', 'charcoal', 'kiln', 'lime', 'boat', 'harpoon', 'water-wheel', 'bloomery-iron', 'blast-furnace', 'copper', 'zinc', 'wire',
    'glass', 'blown-glass', 'whaling', 'whale-oil', 'gas-chemistry', 'wood-gas', 'gas-main', 'still', 'borehole-drilling', 'drilled-well', 'kerosene',
    'argand-burner', 'voltaic-pile', 'electromagnetism', 'induction', 'dynamo', 'vacuum-pump', 'carbon-filament', 'steam-engine'];
  ok('sources: the list of rows to check is the first pass\'s 31', HTT_ROWS.length === 31);
  const cites = (s) => /Fortier-Dubois|historicaltechtree|Historical Tech Tree/i.test(s || '');
  t('sources: no row, endowment item or tie cites the Historical Tech Tree as its source', () => {
    const bad = [...TABLE.rows, ...TABLE.endowment, ...(TABLE.ties || [])].filter((r) => cites(r.source)).map((r) => r.id || r.need);
    return [bad.length === 0, bad.join(', ')];
  });
  for (const id of HTT_ROWS) {
    t(`sources: ${id} cites a primary source opened, or declares "primary not opened" and what it was checked against`, () => {
      const r = byId.get(id);
      const opened = typeof r.source === 'string' && /Nordhaus/.test(r.source) && /page image/.test(r.source);
      const gap = r.gap === 'primary not opened' && /Historical Tech Tree/.test(r.checkedAgainst || '');
      return [opened !== gap && Number.isInteger(r.date), JSON.stringify([r.source, r.gap, r.checkedAgainst])];
    });
  }
  // the two dates the first pass read from Table 1.1's misaligned text layer, checked on the page image
  t("sources: the wick's and the tallow candle's dates are Table 1.1's, checked on the page image", () => {
    const w = byId.get('wick'), c = byId.get('tallow-candle');
    return [w.date === -38000 && c.date === 1292 && /Table 1\.1/.test(w.source) && /Table 1\.1/.test(c.source) && /page image/.test(w.source) && /page image/.test(c.source), JSON.stringify([w.source, c.source])];
  });
  t('sources: a row checked against the tech tree declares its gap', () => TABLE.rows.filter((r) => r.checkedAgainst).every((r) => r.gap === 'primary not opened' && !r.source));
}

// ---------------------------------------------------------------- K. the verdict line (brief engine_b.md 3)
{
  let V = null;
  t('verdict: world 1 is grown with a verdict line', () => {
    V = need('findings')(TABLE, DRIVER);
    const w = W1.buildWorld(TABLE);
    return [!!w.verdict && typeof w.verdict.line === 'string' && w.verdict.clauses.length === 2, JSON.stringify(w.verdict)];
  });
  t('verdict: the findings say what the removal changes and what the lamp needs, from the runs', () => {
    const f = V;
    const lampKept = branch(world1).includes(f.lamp.id);
    return [f.removal.swaps.some((s) => s.earth === 'coal-gas' && s.world === 'wood-gas') && f.lamp.kept === lampKept && f.lamp.needs.includes('fungus-beds'), JSON.stringify(f)];
  });
  t('verdict: a clause resting on an invented row is tagged ILLUSTRATIVE, and one resting on none REAL', () => {
    const v = W1.buildWorld(TABLE).verdict;
    return [v.clauses.every((c) => c.tag === (c.rows.some((id) => byId.get(id) && byId.get(id).invented) ? 'ILLUSTRATIVE' : 'REAL')) && v.clauses.some((c) => c.tag === 'REAL') && v.clauses.some((c) => c.tag === 'ILLUSTRATIVE'),
      JSON.stringify(v.clauses.map((c) => [c.tag, c.rows]))];
  });
  t('verdict: the line is its clauses, each after its tag', () => {
    const v = W1.buildWorld(TABLE).verdict;
    return [v.line === v.clauses.map((c) => `[${c.tag}] ${c.text}`).join(' '), v.line];
  });
  // computed, not typed: a table where the lamp has a figure better than oil keeps it, and the line says so; a table
  // where gas undercuts every lamp makes gas win without coal, and the line says that instead
  t('verdict: the line follows the engine: a priced fungal lamp is kept, and the line says it is', () => {
    const T = JSON.parse(JSON.stringify(TABLE));
    T.measure.series['test-bright'] = [['Bright culture', '1', 0.001, 0.01]];
    T.rows.find((r) => r.id === 'mycelial-lamp').perf = { series: 'test-bright' };
    const a = W1.buildWorld(TABLE).verdict.line, b = W1.buildWorld(T).verdict.line;
    return [a !== b && /\bkept\b/.test(b) && !/not kept/.test(b), `${a} / ${b}`];
  });
  t('verdict: and a gas lamp that undercuts every lamp wins without coal, and the line says that', () => {
    const T = JSON.parse(JSON.stringify(TABLE));
    T.measure.series['test-cheap-gas'] = [['Cheap gas', '1', 0.0001, 0.001]];
    T.rows.find((r) => r.id === 'gas-lamp').perf = { series: 'test-cheap-gas' };
    const a = W1.buildWorld(TABLE).verdict.clauses[0].text, b = W1.buildWorld(T).verdict.clauses[0].text;
    return [a !== b, `${a} / ${b}`];
  });
  t('verdict: the line fits one line of the plate (at most 190 characters)', () => {
    const v = W1.buildWorld(TABLE).verdict;
    return [v.line.length <= 190, `${v.line.length}: ${v.line}`];
  });
  try { console.log(`  measured: the verdict line: ${W1.buildWorld(TABLE).verdict.line}`); } catch { /* the line first */ }
}

// ---------------------------------------------------------------- L. "better" at each date (brief dated.md)
{
  // an oracle written apart from grow.js: T16, the page images' copy above, read for the lamps the table gives a series
  // and CAF allows on Earth, at every date T16 gives
  const lampSeries = TABLE.rows.filter((r) => r.jobs.includes(JOB) && r.perf && r.perf.series).map((r) => [r.id, T16[r.perf.series]]);
  const yr = (at) => firstYear(at);
  const figAt = (st, y) => { const ok = st.filter((x) => yr(x[1]) <= y); return ok.length ? ok.sort((a, b) => yr(a[1]) - yr(b[1])).pop()[2] : null; };
  const allYears = [...new Set(Object.values(T16).flatMap((st) => st.map((x) => yr(x[1]))))].sort((a, b) => a - b);
  const rankAt = (lamps, y) => lamps.map(([id, st]) => [id, figAt(st, y)]).filter(([, f]) => f !== null).sort((a, b) => a[1] - b[1]);
  const builtIds = new Set(need('built')(earth).map((b) => b.id));
  const earthLamps = lampSeries.filter(([id]) => builtIds.has(id));
  t('dated: figureAt is the latest stage on or before the year, and none before the first', () => {
    const f = need('figureAt'), r = byId.get('gas-lamp');
    return [f(r, TABLE, 1826) === null && f(r, TABLE, 1827) === 7.398 && f(r, TABLE, 1854) === 7.398 && f(r, TABLE, 1855) === 2.978
      && f(r, TABLE, 1885) === 0.083 && f(r, TABLE, 1915) === 0.083 && f(r, TABLE, 1916) === 0.012 && f(r, TABLE, 3000) === 0.012,
      [1826, 1827, 1854, 1855, 1885, 1915, 1916].map((y) => f(r, TABLE, y)).join(' ')];
  });
  t('dated: a gap has no figure at any date', () => need('figureAt')(byId.get('arc-lamp'), TABLE, 2000) === null && need('figureAt')(byId.get('mycelial-lamp'), TABLE, 2000) === null);
  t("dated: the dates are the union of the table's series' dates", () => [same(need('datesOf')(TABLE), allYears), need('datesOf')(TABLE).join()]);
  t('dated: at every date the engine keeps the cheapest lamp CAF allows, as the page images give it', () => {
    const d = need('dated')(TABLE, EARTH, JOB);
    const bad = d.filter((x) => { const w = rankAt(earthLamps, x.year)[0]; return !w || x.kept !== w[0] || x.figure !== w[1]; }).map((x) => x.year);
    return [d.length === allYears.length && bad.length === 0, `dates ${d.length}/${allYears.length}; differ at ${bad.join()}`];
  });
  t('dated: before its first date a lamp is unavailable: every lamp ranked at a date has a stage on or before it', () => {
    const d = need('dated')(TABLE, EARTH, JOB);
    return [d[0].year === 1800 && d.every((x) => x.ranked.every((r) => figAt(T16[byId.get(r.id).perf.series], x.year) !== null)), String(d[0].year)];
  });
  // test 1, the count and the misses, whatever they are: the eras of the ledger the rule regrows, derived from the oracle
  const keptAt = allYears.map((y) => rankAt(earthLamps, y)[0][0]);
  const wantHeld = LEDGER.filter((id) => keptAt.includes(id));
  const wantMissed = LEDGER.filter((id) => !keptAt.includes(id));
  t("test 1 (dated): the eras the rules regrow, and the misses, are the oracle's", () => {
    const e = need('eras')(TABLE, EARTH, JOB, LEDGER);
    return [same(e.held.map((h) => h.id), wantHeld) && same(e.missed.map((m) => m.id), wantMissed) && e.total === 6, `held ${e.held.map((h) => h.id)}; missed ${e.missed.map((m) => m.id)}`];
  });
  t('test 1 (dated): the count before is what the step rule keeps of the ledger', () => {
    const e = need('eras')(TABLE, EARTH, JOB, LEDGER);
    return [same(e.before, branch(earth).filter((id) => LEDGER.includes(id))), e.before.join()];
  });
  t('test 1 (dated): a missed era names its figures (the stages of its series) or says it has none', () => {
    const e = need('eras')(TABLE, EARTH, JOB, LEDGER);
    return [e.missed.every((m) => { const p = byId.get(m.id).perf || {}; return p.series ? m.stages.length === T16[p.series].length : (m.stages.length === 0 && typeof p.gap === 'string'); }), JSON.stringify(e.missed)];
  });
  t('test 1 (dated): the plate line is written from that run, tagged REAL, and one line (at most 190 characters)', () => {
    const e = W1.erasOf(TABLE), run = need('eras')(TABLE, EARTH, JOB, LEDGER);
    const nameOf = (id) => byId.get(id).name || byId.get(id).label.toLowerCase();
    return [e.tag === 'REAL' && e.line.startsWith('[REAL] ') && e.line.includes(`regrow ${run.held.length} of Earth's ${run.total}`) && e.line.includes(`against ${run.before.length} of ${run.total}`)
      && run.missed.every((m) => e.line.includes(nameOf(m.id))) && e.line.length <= 190, `${e.line.length}: ${e.line}`];
  });
  t('test 1 (dated): the line follows the engine: an arc lamp priced 0.1 from 1867 is held, and the line drops it from the misses', () => {
    const T = JSON.parse(JSON.stringify(TABLE));
    T.measure.series['test-arc'] = [['Arc', '1867', 0.1, 0.5]];
    T.rows.find((r) => r.id === 'arc-lamp').perf = { series: 'test-arc' };
    const a = W1.erasOf(TABLE), b = W1.erasOf(T);
    return [a.line !== b.line && b.held.some((h) => h.id === 'arc-lamp') && b.missed.length === 0 && /regrow 6 of Earth's 6/.test(b.line) && !/missed/.test(b.line), b.line];
  });
  // removing the kept lamp at a date promotes the cheapest remaining at that date (written on a table without the row, so
  // the engine is not asked about its own ranking: the oracle ranks what is left)
  t('dated: removing the lamp kept at a date promotes the cheapest remaining lamp at that date, at every date', () => {
    const base = need('dated')(TABLE, EARTH, JOB);
    const bad = [];
    for (const x of base) {
      const rest = earthLamps.filter(([id]) => id !== x.kept);
      const T = { ...TABLE, rows: TABLE.rows.filter((r) => r.id !== x.kept) };
      const after = need('dated')(T, EARTH, JOB).find((y) => y.year === x.year);
      const want = rankAt(rest, x.year)[0];
      if (!after) { bad.push(`${x.year}: no date`); continue; }
      if ((want ? want[0] : null) !== after.kept) bad.push(`${x.year}: ${x.kept} out, engine ${after.kept}, oracle ${want && want[0]}`);
    }
    return [bad.length === 0, bad.join('; ')];
  });
  t('dated: at 1900, gas out promotes incandescent (0.220431), and incandescent out too promotes kerosene (0.2253)', () => {
    const f = (drop) => need('dated')({ ...TABLE, rows: TABLE.rows.filter((r) => !drop.includes(r.id)) }, EARTH, JOB).find((x) => x.year === 1900).kept;
    return [f([]) === 'gas-lamp' && f(['gas-lamp']) === 'incandescent-lamp' && f(['gas-lamp', 'incandescent-lamp']) === 'kerosene-lamp', [f([]), f(['gas-lamp']), f(['gas-lamp', 'incandescent-lamp'])].join()];
  });
  t('dated: a lamp CAF cannot build is not ranked: without coal, no coal-gas lamp is kept at any date', () => {
    const d = need('dated')(TABLE, NOCOAL, JOB);
    const free = new Set(caf(TABLE, NOCOAL).map((e) => e.id));
    return [d.every((x) => x.ranked.every((r) => free.has(r.id))), d.map((x) => x.kept).join()];
  });
  t('dated: no date, era or label is read: stripping them changes no kept lamp', () => {
    const bare = { ...TABLE, rows: TABLE.rows.map((r) => { const { date, era, label, source, ...rest } = r; return { ...rest, label: r.id, era: 'x' }; }) };
    return same(need('dated')(bare, EARTH, JOB), need('dated')(TABLE, EARTH, JOB));
  });
  try {
    console.log(`  measured: kept at each date: ${need('dated')(TABLE, EARTH, JOB).map((x) => `${x.year} ${x.kept}`).join(', ')}`);
    console.log(`  measured: the eras line: ${W1.erasOf(TABLE).line}`);
  } catch { /* measured only once the rule exists */ }
}

console.log(`orthogonal engine: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
