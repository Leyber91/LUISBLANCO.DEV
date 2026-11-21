/* ============================================================
   orthogonal/grow.js: the rule that grows a world's technologies
   from its endowment. No DOM. One function per rule; the tests
   (grow.test.mjs) and the page (worlds/*.js) call these and nothing
   else decides what grows.

   The table (assets/data/orthogonal/tech/<job>.json) is a list of
   rows. A row is one technology: its id, the things it makes (its
   jobs), the materials it consumes (inputs, every one needed) and
   the tools it needs (catalysts, any one of them enough). What a
   kept row makes is its id and each of its jobs. A world is the
   table and an endowment: the things that exist before any row
   (Earth's, or Earth's changed by a driver: a removal or an
   addition). The table is one for every world; only the endowment
   changes.

   - caf(table, food)        CAF, Hordijk 2023 (arXiv 2303.01809), Algorithm 3: a row enters when all its inputs and
                             at least one tool are in the food set or made by a row before it. Run here in rounds (every
                             row tested against what existed when the round began), so the order a row enters in does
                             not depend on where it sits in the table; the set is the paper's unique maximal CAF.
   - grow(table, food, job)  the keep rule, after Arthur and Polak 2006 (Complexity 11(5), 23-31): step by step, among
                             the rows CAF admits for the first time, keep each one that meets an unmet need, and lose
                             for good each one that meets none (theirs is discarded when it improves no need).
   - branch(run)             the rows that answered the job, in the order they did
   - lineage(run, table, id) the chain from the endowment to a kept row: every kept row it rests on, in the order kept,
                             each with the needs it met and the rows it drew on
   - whyNot(run, table, id)  why a run never kept a row: an unmet need (an input, or every tool, never made), or the
                             need it would have met was met first by another row
   - divergence(a, b, table) the first lamp world b kept that world a never did, and a's lamp at that step
   - endowmentOf(table, d)   a driver applied: Earth's endowment with d.remove taken out and d.add put in

   The needs. The job (light at night) is a standing need: every new row that serves it is kept as one more answer, in
   the step CAF first admits it (the first run of 2026-11-21 took one answer a step, and lost Earth's kerosene lamp
   because it came at the gas lamp's depth: with no measure of light, the rule has no ground to drop either). Every
   other need is met once: an input a row toward the job
   lacks, or a tool when it has none of its tools. A row is toward the job when it serves the job, or makes something a
   row toward the job lacks, and CAF could still build it here. The first maker of a needed thing is kept; a later or
   second maker of the same thing meets nothing and is lost.

   Which row is first, among rows fresh in the same step: the one resting on fewer kept rows (Arthur and Polak's cost,
   "the number of its components"), then the table's order. A choice the table's order made is recorded in run.ties,
   so a test can refuse any branch that rests on one.

   What this rule cannot see, said here so no page claims it:
   - quantities: how much of a thing, its price, its scarcity. Arthur and Polak keep a later candidate only when it
     meets a need better or costs less; this table has no measure of how well a lamp lights, so the job takes each new
     answer as its next one, and a second maker of a thing (coke iron after charcoal iron) is never kept.
   - time: a step is one round of CAF, a depth of prerequisites, not a year. Dates in the table are read by the tests
     to check the ledger's order and never by this rule.
   ============================================================ */

/* What a kept row puts into the world: its id and every job it serves. */
export const makes = (row) => [row.id, ...row.jobs];

/* CAF's test for one row: every input present, and at least one tool. */
export const admissible = (row, have) => row.inputs.every((i) => have.has(i)) && row.tools.some((t) => have.has(t));

/* CAF (Hordijk 2023, Algorithm 3), by rounds: [{ id, gen }] for every row of the maximal CAF, in the round it enters. */
export function caf(table, food) {
  const W = new Set(food);
  const S = [];
  const inS = new Set();
  for (let gen = 1; ; gen++) {
    const add = table.rows.filter((r) => !inS.has(r.id) && admissible(r, W));
    if (!add.length) return S;
    for (const r of add) { S.push({ id: r.id, gen }); inS.add(r.id); }
    for (const r of add) for (const x of makes(r)) W.add(x);
  }
}

/* The needs still open: for every row toward the job, each input it lacks and, when it has none of its tools, its tools.
   A slot is one such need of one row; `items` are the things that would meet it. `rows` are the rows not yet seen. */
function openNeeds(rows, have, job) {
  const reach = new Set(caf({ rows }, have).map((e) => e.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const toward = new Set(rows.filter((r) => reach.has(r.id) && r.jobs.includes(job)).map((r) => r.id));
  const slots = new Map();
  const todo = [...toward];
  while (todo.length) {
    const t = byId.get(todo.shift());
    const add = [];
    for (const i of t.inputs) if (!have.has(i)) add.push({ key: `${t.id}<${i}`, need: i, for: t.id, kind: 'input', items: new Set([i]) });
    if (!t.tools.some((x) => have.has(x))) add.push({ key: `${t.id}<tool`, need: t.tools.join(' or '), for: t.id, kind: 'tool', items: new Set(t.tools) });
    for (const s of add) {
      if (slots.has(s.key)) continue;
      slots.set(s.key, s);
      for (const r of rows) {
        if (toward.has(r.id) || !reach.has(r.id) || !makes(r).some((x) => s.items.has(x))) continue;
        toward.add(r.id);
        todo.push(r.id);
      }
    }
  }
  return [...slots.values()];
}

/* The kept rows a row would rest on if kept now: the rows that made each of its inputs, and the cheapest of its tools
   present, with everything those rested on. */
function restsFor(row, have, source, restsOn) {
  const out = new Set();
  const take = (x) => { const s = source.get(x); if (s) for (const id of restsOn.get(s)) out.add(id); };
  row.inputs.forEach(take);
  const tool = toolUsed(row, have, source, restsOn);
  if (tool) take(tool);
  return out;
}

/* The tool a row uses: of its tools present, the one resting on fewest kept rows (the first listed on a tie). */
function toolUsed(row, have, source, restsOn) {
  let best = null, size = Infinity;
  for (const t of row.tools) {
    if (!have.has(t)) continue;
    const s = source.get(t);
    const n = s ? restsOn.get(s).size : 0;
    if (n < size) { best = t; size = n; }
  }
  return best;
}

/* The keep rule. Returns the run: what was kept, in order, with the step, the needs each met and the rows it drew on;
   what was lost, with the step and why; the ties the table's order decided; and everything the world then held. */
export function grow(table, food, job) {
  const rows = table.rows;
  const at = new Map(rows.map((r, i) => [r.id, i]));
  const have = new Set(food);
  const source = new Map();    // a thing -> the kept row that first made it (none: the endowment's)
  const restsOn = new Map();   // a kept row -> the kept rows it rests on, itself included
  const kept = [], lost = [], ties = [];
  const seen = new Set();
  const tie = (t) => { if (!ties.some((x) => x.winner === t.winner && x.loser === t.loser && x.need === t.need)) ties.push(t); };
  for (let step = 1; ; step++) {
    const fresh = rows.filter((r) => !seen.has(r.id) && admissible(r, have));
    if (!fresh.length) break;
    const open = openNeeds(rows.filter((r) => !seen.has(r.id)), have, job);
    const ranked = fresh.map((r) => ({ r, rests: restsFor(r, have, source, restsOn) }))
      .sort((a, b) => a.rests.size - b.rests.size || at.get(a.r.id) - at.get(b.r.id));
    let answer = null;           // the last row that answered the job this step, and its cost
    const closed = new Map();    // a slot's key -> the row that met it this step, and its cost
    const now = [];
    for (const { r, rests } of ranked) {
      seen.add(r.id);
      const met = [];
      if (r.jobs.includes(job)) {
        // every new answer to the job is kept; two in one step at one cost were put in order by the table alone
        if (answer && answer.cost === rests.size) tie({ step, need: job, winner: answer.id, loser: r.id, order: true });
        answer = { id: r.id, cost: rests.size };
        met.push({ need: job, for: null, kind: 'job' });
      }
      for (const s of open) {
        const hit = makes(r).find((x) => s.items.has(x));
        if (!hit) continue;
        const c = closed.get(s.key);
        if (c) { if (c.cost === rests.size && c.id !== r.id) tie({ step, need: s.need, winner: c.id, loser: r.id }); continue; }
        closed.set(s.key, { id: r.id, cost: rests.size });
        met.push({ need: hit, for: s.for, kind: s.kind });
      }
      if (met.length) {
        const from = [];
        for (const x of [...r.inputs, toolUsed(r, have, source, restsOn)]) { const s = x && source.get(x); if (s && !from.includes(s)) from.push(s); }
        kept.push({ id: r.id, step, met, from });
        now.push({ r, rests });
      } else lost.push({ id: r.id, step, why: r.jobs.includes(job) ? 'the job was answered first' : 'it met no need' });
    }
    for (const { r, rests } of now) {
      restsOn.set(r.id, new Set([...rests, r.id]));
      for (const x of makes(r)) if (!have.has(x)) { have.add(x); source.set(x, r.id); }
    }
  }
  return { job, food: [...food], kept, lost, ties, have: [...have].sort() };
}

/* The rows that answered the job, in the order they did. */
export const branch = (run) => run.kept.filter((k) => k.met.some((m) => m.kind === 'job')).map((k) => k.id);

/* The chain from the endowment to a kept row: it and every kept row it drew on, back to the endowment, in the order
   they were kept. Empty when the run never kept it. */
export function lineage(run, table, to) {
  const k = new Map(run.kept.map((e, i) => [e.id, { ...e, i }]));
  if (!k.has(to)) return [];
  const out = new Set();
  const walk = (id) => { if (out.has(id)) return; out.add(id); k.get(id).from.forEach(walk); };
  walk(to);
  return [...out].map((id) => k.get(id)).sort((a, b) => a.step - b.step || a.i - b.i).map(({ i, ...e }) => e);
}

/* Why a run never kept a row, or null when it did:
   - { kind: 'unmet', needs }  its inputs, or every one of its tools, never existed in this run;
   - { kind: 'lost', step, first, need }  it could be built at `step`, and `first` had met the need it would have met. */
export function whyNot(run, table, id) {
  if (run.kept.some((k) => k.id === id)) return null;
  const r = table.rows.find((x) => x.id === id);
  if (!r) return { kind: 'unknown' };
  const l = run.lost.find((x) => x.id === id);
  if (l) {
    if (r.jobs.includes(run.job)) {
      const a = run.kept.find((k) => k.step === l.step && k.met.some((m) => m.kind === 'job'));
      return { kind: 'lost', step: l.step, need: run.job, first: a ? a.id : null };
    }
    const made = makes(r).map((x) => run.kept.find((k) => k.id !== id && (k.id === x || table.rows.find((y) => y.id === k.id).jobs.includes(x)))).find(Boolean);
    return { kind: 'lost', step: l.step, need: null, first: made ? made.id : null };
  }
  const have = new Set(run.have);
  const needs = r.inputs.filter((i) => !have.has(i));
  if (!r.tools.some((t) => have.has(t))) needs.push(r.tools.join(' or '));
  return { kind: 'unmet', needs };
}

/* Where world b leaves world a: the first row of b's branch that a's branch never has, the step b kept it, and a's
   answer to the job at that step (the row a kept then, or else a's latest answer before it). Null when b keeps no lamp
   a lacks. */
export function divergence(a, b, table) {
  const ours = branch(a);
  const w = branch(b).find((id) => !ours.includes(id));
  if (!w) return null;
  const step = b.kept.find((k) => k.id === w).step;
  const at = a.kept.filter((k) => ours.includes(k.id));
  const same = at.find((k) => k.step === step);
  const before = at.filter((k) => k.step < step).pop();
  const e = same || before || null;
  return { world: w, step, earth: e ? e.id : null, how: same ? 'same step' : before ? 'in use' : 'none' };
}

/* A driver applied to Earth's endowment: { remove: [ids], add: [ids] }. The order is the table's, then what was added. */
export function endowmentOf(table, { remove = [], add = [] } = {}) {
  const base = table.endowment.map((e) => e.id).filter((id) => !remove.includes(id));
  return [...base, ...add.filter((id) => !base.includes(id))];
}
