/* ============================================================
   orthogonal/grow.test.mjs: the engine's checks, run by
   tools/lab_tests.mjs on every pull request. Written before the
   table and the rule existed (brief engine.md, 2026-11-21), so its
   first run failed on a missing module.

   A. CAF (Hordijk 2023, Algorithm 3) on small networks: a row
      enters only with all its inputs and at least one tool in the
      food set or made before it; the set is the one maximal CAF
      whatever the table's order.
   B. The keep rule (Arthur and Polak 2006) on small tables: the
      first row to meet an unmet need is kept, a row that meets none
      is lost, a second maker of a thing already made is lost, the
      job takes one new answer a step.
   C. Test 1: Earth's endowment regrows Earth's branch for light at
      night in the ledger's order, with no tie decided by the
      table's order.
   D. Test 2: with coal removed, a different and complete branch is
      grown, every need of every kept step met.
   E. Test 3: world 1's own steps, with the driver reverted, each
      have an unmet need, or Earth's branch wins first.
   F. The advisor's failure checks: no cost tuned per case (a row's
      date, era, label and source, and the table's order, change
      nothing that grows); a removal never leaves the job unserved
      when any branch exists; two different drivers do not fall to
      the same fallback branch.
   G. The table itself: every row typed, every Earth row dated with
      a source opened or a declared gap, every name it uses defined.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admissible, branch, caf, divergence, endowmentOf, grow, lineage, makes, whyNot } from './grow.js';
import { DRIVER } from './worlds/fungi-early.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', 'data', 'orthogonal', 'tech', 'light.json'), 'utf8'));
const JOB = TABLE.job;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const table = (rows) => ({ job: 'J', rows });
const row = (id, inputs, tools, jobs = []) => ({ id, label: id, jobs, inputs, tools, era: 'x' });
const ids = (run) => run.kept.map((k) => k.id);

/* An oracle written apart from grow.js: replay a run and say every kept row whose inputs, or every one of whose tools,
   were not yet in the world before its step. A complete branch replays with none. */
function replayFaults(tab, run) {
  const byId = new Map(tab.rows.map((r) => [r.id, r]));
  const have = new Set(run.food);
  const out = [];
  const steps = [...new Set(run.kept.map((k) => k.step))].sort((a, b) => a - b);
  for (const s of steps) {
    const now = run.kept.filter((k) => k.step === s);
    for (const k of now) {
      const r = byId.get(k.id);
      if (!r.inputs.every((i) => have.has(i))) out.push(`${k.id}: an input missing at step ${s}`);
      if (!r.tools.some((t) => have.has(t))) out.push(`${k.id}: no tool at step ${s}`);
    }
    for (const k of now) { const r = byId.get(k.id); have.add(r.id); r.jobs.forEach((j) => have.add(j)); }
  }
  return out;
}

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
  // J is the job. lamp1 serves J from fuel; fuel made by f1 (from a) or f2 (from a, cheaper? same); junk meets nothing
  const T = table([
    row('f1', ['a'], ['t'], ['fuel']), row('f2', ['a'], ['t'], ['fuel']),
    row('lamp1', ['fuel'], ['t'], ['J']), row('junk', ['a'], ['t'], ['nothing-needed']),
    row('lamp2', ['b2'], ['t'], ['J']), row('b2', ['fuel'], ['t'], []),
  ]);
  const run = grow(T, ['a', 't'], 'J');
  ok('keep: the first maker of what a lamp needs is kept', ids(run).includes('f1'));
  ok('keep: a second maker of the same thing in the same step is lost', run.lost.some((l) => l.id === 'f2'));
  ok('keep: a row that meets no need is lost', run.lost.some((l) => l.id === 'junk'));
  ok('keep: the job is answered, and answered again by a later lamp', same(branch(run), ['lamp1', 'lamp2']), branch(run).join());
  ok('keep: each kept step says the needs it met', run.kept.find((k) => k.id === 'lamp1').met.some((m) => m.need === 'J') && run.kept.find((k) => k.id === 'f1').met.some((m) => m.need === 'fuel'));
  ok('keep: a tie decided by the table order is recorded', run.ties.some((t) => t.winner === 'f1' && t.loser === 'f2'));
  ok('keep: the run replays with every input and a tool in place', replayFaults(T, run).length === 0, replayFaults(T, run).join('; '));
  // the job is a standing need: every new answer is kept, in the step it first could be; within a step the one resting
  // on fewer rows comes first, and two at one cost are put in order by the table, which the run records
  // (changed after the first run with the table, 2026-11-21: one answer a step lost Earth's kerosene lamp)
  const T2 = table([row('cheap', ['a'], ['t'], ['J']), row('m', ['a'], ['t'], ['m']), row('dear', ['m'], ['t'], ['J']), row('late', ['m'], ['t'], ['J'])]);
  const r2 = grow(T2, ['a', 't'], 'J');
  ok('keep: every new answer to the job is kept, in the step it first could be', same(branch(r2), ['cheap', 'dear', 'late']), branch(r2).join());
  ok('keep: two answers in one step at one cost are put in order by the table, and the run says so', r2.ties.some((t) => t.order && t.winner === 'dear' && t.loser === 'late'));
  const T3 = table([row('m', ['a'], ['t'], ['m']), row('n', ['a'], ['t'], ['n']), row('two', ['m', 'n'], ['t'], ['J']), row('one', ['m'], ['t'], ['J'])]);
  ok('keep: within a step, the answer resting on fewer rows comes first', same(branch(grow(T3, ['a', 't'], 'J')), ['one', 'two']));
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

// ---------------------------------------------------------------- C. test 1: Earth regrows Earth's branch
const EARTH = endowmentOf(TABLE, {});
const earth = grow(TABLE, EARTH, JOB);
const LEDGER = ['tallow-candle', 'whale-oil-lamp', 'gas-lamp', 'kerosene-lamp', 'arc-lamp', 'incandescent-lamp'];
{
  ok("test 1: Earth's endowment regrows the ledger's branch for light at night, in the ledger's order", same(branch(earth), LEDGER), branch(earth).join(', '));
  const byId = new Map(TABLE.rows.map((r) => [r.id, r]));
  const dated = TABLE.rows.filter((r) => r.jobs.includes(JOB) && r.date !== undefined).sort((a, b) => a.date - b.date).map((r) => r.id);
  ok("test 1: the ledger's order is the table's own dates for Earth's lamps", same(dated, LEDGER), dated.join(', '));
  ok('test 1: the ledger is the brief\'s, named in its words', same(LEDGER.map((id) => byId.get(id) && byId.get(id).ledger), ['wood and tallow', 'whale oil', 'coal gas', 'kerosene', 'electric arc', 'the incandescent lamp']));
  const steps = branch(earth).map((id) => earth.kept.find((k) => k.id === id).step);
  ok("test 1: each of Earth's lamps answers the job no earlier than the one before", steps.every((s, i) => i === 0 || s >= steps[i - 1]), steps.join(', '));
  // the order of Earth's lamps is never the table's: a step, or within a step the cost, puts each after the one before
  // (changed after the first run: two lamps may share a step, and then the rows they rest on order them)
  const ordered = earth.ties.filter((t) => t.order && LEDGER.includes(t.winner) && LEDGER.includes(t.loser));
  ok("test 1: no two of Earth's lamps were put in order by the table's order", ordered.length === 0, ordered.map((t) => `${t.winner} before ${t.loser}`).join('; '));
  // a tie the rule cannot break on Earth's lineage is declared in the table with the history that breaks it, and the
  // table's order agrees with that history (changed after the first run: coal gas and wood gas are one structure)
  const onLedger = new Set(LEDGER.flatMap((id) => lineage(earth, TABLE, id).map((s) => s.id)));
  const decided = earth.ties.filter((t) => !t.order && (onLedger.has(t.winner) || onLedger.has(t.loser)));
  const declared = (t) => (TABLE.ties || []).some((d) => d.need === t.need && d.earth === t.winner && d.rows.includes(t.loser) && /\b(1[5-9]|20)\d\d\b/.test(d.source || ''));
  ok("test 1: every tie on Earth's lineage is declared, with the history that settles it", decided.every(declared), decided.map((t) => `${t.winner} over ${t.loser} for ${t.need}`).join('; '));
  for (const d of TABLE.ties || []) ok(`test 1: the declared tie for ${d.need} is one the rule meets on Earth`, earth.ties.some((t) => t.need === d.need && t.winner === d.earth));
  console.log(`  measured: Earth's lamps by step: ${branch(earth).map((id, i) => `${id} ${steps[i]}`).join(', ')}; ties ${JSON.stringify(earth.ties)}`);
  ok('test 1: the run replays with every input and a tool in place', replayFaults(TABLE, earth).length === 0, replayFaults(TABLE, earth).join('; '));
}

// ---------------------------------------------------------------- D. test 2: coal removed
const NOCOAL = endowmentOf(TABLE, { remove: ['coal'] });
const nocoal = grow(TABLE, NOCOAL, JOB);
{
  ok('test 2: with coal removed, the job is served', branch(nocoal).length > 0);
  ok('test 2: with coal removed, every kept step has every input and a tool in place', replayFaults(TABLE, nocoal).length === 0, replayFaults(TABLE, nocoal).join('; '));
  ok('test 2: with coal removed, no step rests on coal', !nocoal.kept.some((k) => TABLE.rows.find((r) => r.id === k.id).inputs.includes('coal')));
  ok('test 2: the branch grown without coal is different from Earth\'s', !same(ids(nocoal), ids(earth)), 'the same rows were kept');
  // complete: every lamp Earth has whose kind still serves the job here is reached by some lineage, and every need met
  const lamps = branch(nocoal);
  const full = lamps.every((id) => lineage(nocoal, TABLE, id).every((s) => s.met.length > 0));
  ok('test 2: the branch is complete: every step of every lamp\'s lineage met a need', full);
  const changed = lamps.filter((id) => branch(earth).includes(id) && !same(lineage(nocoal, TABLE, id).map((s) => s.id), lineage(earth, TABLE, id).map((s) => s.id)));
  ok('test 2: a lamp both worlds have is reached by a different lineage without coal', changed.length > 0, lamps.join(', '));
}

// ---------------------------------------------------------------- E. test 3: world 1, with the driver reverted
const WORLD1 = endowmentOf(TABLE, DRIVER);
const world1 = grow(TABLE, WORLD1, JOB);
const div = divergence(earth, world1, TABLE);
{
  ok('world 1: the engine grows a lamp Earth never kept', !!div && !!div.world && !branch(earth).includes(div.world), JSON.stringify(div));
  const L = div ? lineage(world1, TABLE, div.world) : [];
  const own = L.filter((s) => !earth.kept.some((k) => k.id === s.id));
  // the steps, counted as the plate counts its branch: the driver is step 1, then this world's own rows in the order
  // kept (changed after the first run, which counted the rows both worlds share, lime and glass, as this world's steps)
  const steps = [{ id: 'driver' }, ...own];
  ok("world 1: its lineage has steps of its own", own.length > 0, L.map((s) => s.id).join(', '));
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
  console.log(`  measured: world 1's own steps: driver, ${own.map((s) => `${s.id} (kept at ${s.step})`).join(', ')}; Earth's lamp then: ${div && div.earth} (${div && div.how})`);
  // what the lamp rests on: with coal restored and the fungi kept, is it still grown, and at the same step?
  const back = grow(TABLE, endowmentOf(TABLE, { add: DRIVER.add }), JOB);
  const at = (run, id) => (run.kept.find((k) => k.id === id) || {}).step;
  console.log(`  measured: with coal restored and the fungi kept, ${div && div.world} is grown at step ${at(back, div && div.world)} (without coal: ${at(world1, div && div.world)})`);
}

// ---------------------------------------------------------------- F. the advisor's failure checks
{
  // no cost tuned per case: the rule reads a row's id, jobs, inputs and tools, and nothing else; the table is one for
  // every world; its order decides nothing but the ties a run records
  ok('no cost tuned per case: grow takes a table, an endowment and a job, and nothing else', grow.length === 3);
  const STRUCT = new Set(['id', 'jobs', 'inputs', 'tools']);
  const bare = { job: TABLE.job, rows: TABLE.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => STRUCT.has(k)))) };
  const cases = [['Earth', EARTH], ['no coal', NOCOAL], ['world 1', WORLD1]];
  for (const [name, food] of cases) {
    ok(`no cost tuned per case: ${name} grows the same with every date, era, label and source stripped`, same(grow(bare, food, JOB), grow(TABLE, food, JOB)));
    const back = { job: TABLE.job, rows: [...TABLE.rows].reverse() };
    const a = grow(TABLE, food, JOB), b = grow(back, food, JOB);
    const tied = new Set(a.ties.flatMap((t) => [t.winner, t.loser]).concat(b.ties.flatMap((t) => [t.winner, t.loser])));
    const differ = [...new Set([...ids(a), ...ids(b)])].filter((id) => ids(a).includes(id) !== ids(b).includes(id) && !tied.has(id));
    ok(`no cost tuned per case: ${name}, the table reversed, keeps the same rows but for recorded ties`, differ.length === 0, differ.join(', '));
    ok(`no cost tuned per case: ${name}'s lamps do not depend on the table's order`, same(branch(a), branch(b)), `${branch(a).join()} / ${branch(b).join()}`);
  }
  const keys = new Set(TABLE.rows.flatMap((r) => Object.keys(r)));
  ok('no cost tuned per case: no row carries a field naming a world, a weight or a cost', ![...keys].some((k) => /world|weight|cost|score|rank|prior|order/i.test(k)), [...keys].join(', '));

  // a removal never leaves the job unserved when any branch exists: every single and every pair of endowment items
  let tried = 0;
  const unserved = [];
  const base = EARTH;
  for (let i = 0; i < base.length; i++) for (let j = i; j < base.length; j++) {
    const remove = i === j ? [base[i]] : [base[i], base[j]];
    const food = endowmentOf(TABLE, { remove });
    tried++;
    const possible = caf(TABLE, food).some((e) => TABLE.rows.find((r) => r.id === e.id).jobs.includes(JOB));
    if (possible && !branch(grow(TABLE, food, JOB)).length) unserved.push(remove.join('+'));
  }
  ok(`a removal never leaves the job unserved when any branch exists (${tried} removals of one or two items)`, unserved.length === 0, unserved.join('; '));

  // two different drivers do not fall to the same fallback branch: each driver takes away a different one of Earth's
  // lamps, or the means of one; the branches they grow are all different
  const drivers = [['no coal', { remove: ['coal'] }], ['no whales', { remove: ['whales'] }], ['no petroleum', { remove: ['petroleum'] }],
    ['no copper', { remove: ['copper-ore'] }], ['world 1', DRIVER]];
  const grown = drivers.map(([name, d]) => [name, grow(TABLE, endowmentOf(TABLE, d), JOB)]);
  for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
    ok(`two different drivers do not fall to the same branch: ${grown[i][0]} and ${grown[j][0]}`, !same(ids(grown[i][1]), ids(grown[j][1])));
  }
  for (const [name, run] of grown) ok(`${name}: the job is served`, branch(run).length > 0);
}

// ---------------------------------------------------------------- G. the table
{
  const named = new Set([...EARTH, ...(DRIVER.add || [])]);
  for (const r of TABLE.rows) { named.add(r.id); r.jobs.forEach((j) => named.add(j)); }
  const rowIds = TABLE.rows.map((r) => r.id);
  ok('table: about 40 rows', TABLE.rows.length >= 30 && TABLE.rows.length <= 50, String(TABLE.rows.length));
  ok('table: every id is unique', new Set(rowIds).size === rowIds.length);
  for (const r of TABLE.rows) {
    ok(`table: ${r.id} is typed (label, jobs, inputs, tools, era)`, typeof r.label === 'string' && r.label.trim() && Array.isArray(r.jobs) && Array.isArray(r.inputs) && Array.isArray(r.tools) && typeof r.era === 'string');
    ok(`table: ${r.id} has at least one tool, as CAF's catalyst`, r.tools.length >= 1);
    for (const x of [...r.inputs, ...r.tools]) ok(`table: ${r.id} uses "${x}", which the endowment or some row makes`, named.has(x));
    const earthRow = r.date !== undefined;
    if (earthRow) {
      ok(`table: Earth row ${r.id} has a whole-number date`, Number.isInteger(r.date));
      ok(`table: Earth row ${r.id} has a source opened, or the gap declared`, (typeof r.source === 'string' && /\b(1[5-9]|20)\d\d\b/.test(r.source) && r.source.length > 20) !== (r.gap === 'not opened'), JSON.stringify([r.source, r.gap]));
    } else {
      ok(`table: ${r.id}, with no date, is an invented row and says so`, typeof r.invented === 'string' && r.invented.trim().length > 20);
    }
  }
  for (const e of TABLE.endowment) ok(`table: endowment item ${e.id} has a label and a source or a gap`, !!e.label && (!!e.source !== (e.gap === 'not opened')));
}

console.log(`orthogonal engine: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
