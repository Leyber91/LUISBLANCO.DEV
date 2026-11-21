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
   - figure(row, table)      how well a row serves the job, by the table's measure (lower is better), or null for a gap
   - grow(table, food, job)  the keep rule, after Arthur and Polak 2006 (Complexity 11(5), 23-31): step by step, among
                             the rows CAF admits for the first time, keep each one that meets an unmet need, and lose
                             for good each one that meets none (theirs is discarded when it improves no need); an answer
                             to the job is kept only when it serves better than the one in use, or as well at a lower
                             cost, and then replaces it.
   - branch(run)             the answers the job kept, each replacing the one before, in order
   - winner(run)             the answer in use when the run ends: the best-performing row CAF allows
   - built(run)              every answer to the job CAF admitted in the run, kept or not, with its step
   - lineage(run, table, id) the chain from the endowment to a row the run built: every kept row it rests on, in the
                             order kept, each with the needs it met and the rows it drew on; a row built and not kept
                             ends the chain, marked kept: false
   - whyNot(run, table, id)  why a run never kept a row: an unmet need (an input, or every tool, never made), or the
                             need it would have met was met first, or better, by another row
   - divergence(a, b, table) the first answer world b builds that world a never builds, whether b kept it, and a's
                             answer in use at that step
   - findings(table, d)      what a driver does, read from the runs: what its removal changes, and what the answer it
                             builds rests on and whether it is kept (the plate's verdict line is written from these)
   - endowmentOf(table, d)   a driver applied: Earth's endowment with d.remove taken out and d.add put in

   The needs. The job (light at night) is a standing need, met over and over: a new answer is kept when it serves the
   job better than the answer in use, by the table's measure (light.json measure: Nordhaus 1996's labor price of light,
   hours of work per 1,000 lumen-hours), or as well at a lower cost; it then replaces that answer, which stays kept as
   the step it was. An answer with no figure (a gap) ranks below every answer with one: it is kept only when nothing
   serves yet, and any priced answer replaces it. Among answers fresh in one step, the best figure is taken first, then
   the lower cost, then the table's order, which the run records. Until 2026-11-21's second pass the rule kept every
   new answer, so a removal could only take lamps away (brief engine_b.md).

   Every other need is met once: an input a row toward the job lacks, or a tool when it has none of its tools. A row is
   toward the job when it serves the job, or makes something a row toward the job lacks, and CAF could still build it
   here. Every answer CAF could still build is toward the job, whether or not it will serve better: the means are built
   (Arthur and Polak's standing reserve), and the measure decides only between the answers. The first maker of a needed
   thing is kept; a later or second maker of the same thing meets nothing and is lost.

   Which row is first, among rows fresh in the same step: the one resting on fewer kept rows (Arthur and Polak's cost,
   "the number of its components"), then the table's order. A choice the table's order made is recorded in run.ties,
   so a test can refuse any branch that rests on one.

   What this rule cannot see, said here so no page claims it:
   - quantities: how much of a thing, its scarcity, a price other than the job's. Only the job has a measure; a second
     maker of a thing (coke iron after charcoal iron) is never kept, however much cheaper.
   - time: a step is one round of CAF, a depth of prerequisites, not a year. Each answer has one figure, its price at
     the earliest date the source gives, and is weighed against the answer in use at its step, whose figure is of
     another date: the incumbent's later fall in price, and the newcomer's, are not seen. Dates in the table are read
     by the tests to check the ledger's order and never by this rule.
   ============================================================ */

/* What a kept row puts into the world: its id and every job it serves. */
export const makes = (row) => [row.id, ...row.jobs];

/* CAF's test for one row: every input present, and at least one tool. */
export const admissible = (row, have) => row.inputs.every((i) => have.has(i)) && row.tools.some((t) => have.has(t));

/* How well a row serves the job, by the table's measure: lower is better; null when the row carries a gap (or no
   measure). A row names a series of the source (row.perf.series, read from table.measure.series: stages of
   [stage, date, figure, ...], the figure the one at the earliest date), or, on a small table built for a test, gives its
   figure (row.perf.value). A series the source does not give is an error, never a gap. */
export function figure(row, table) {
  const p = row.perf;
  if (!p) return null;
  if (typeof p.series === 'string') {
    const s = table && table.measure && table.measure.series && table.measure.series[p.series];
    if (!s || !s.length) throw new Error(`the measure has no series "${p.series}" (row ${row.id})`);
    const year = (at) => Number(String(at).match(/-?\d{1,4}/)[0]);
    return [...s].sort((a, b) => year(a[1]) - year(b[1]))[0][2];
  }
  return typeof p.value === 'number' ? p.value : null;
}

/* Whether answer a serves the job better than answer b (Arthur and Polak: better, or as well at a lower cost): each is
   { f: figure or null, cost }. A figure beats a gap; two gaps, or two equal figures, are decided by the cost alone. */
const rank = (f) => (f === null ? Infinity : f);
const better = (a, b) => rank(a.f) < rank(b.f) || (rank(a.f) === rank(b.f) && a.cost < b.cost);

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
  const kept = [], lost = [], ties = [], seq = [];   // seq: every row CAF admitted, in the order the rule weighed it
  const seen = new Set();
  const tie = (t) => { if (!ties.some((x) => x.winner === t.winner && x.loser === t.loser && x.need === t.need)) ties.push(t); };
  let inUse = null;              // the answer serving the job: { id, f, cost }
  for (let step = 1; ; step++) {
    const fresh = rows.filter((r) => !seen.has(r.id) && admissible(r, have));
    if (!fresh.length) break;
    const open = openNeeds(rows.filter((r) => !seen.has(r.id)), have, job);
    const ranked = fresh.map((r) => ({ r, rests: restsFor(r, have, source, restsOn) }))
      .sort((a, b) => a.rests.size - b.rests.size || at.get(a.r.id) - at.get(b.r.id));
    // the job, decided first: the best of the fresh answers (figure, then cost, then the table's order, recorded), kept
    // when it serves better than the answer in use, every other fresh answer lost to the one serving after this step
    const fresher = ranked.filter(({ r }) => r.jobs.includes(job)).map(({ r, rests }) => ({ id: r.id, f: figure(r, table), cost: rests.size }))
      .sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : at.get(a.id) - at.get(b.id)));
    for (let i = 1; i < fresher.length; i++) {
      if (!better(fresher[0], fresher[i]) && !better(fresher[i], fresher[0])) tie({ step, need: job, winner: fresher[0].id, loser: fresher[i].id, order: true });
    }
    const was = inUse;
    const takes = fresher.length && (!inUse || better(fresher[0], inUse)) ? fresher[0] : null;
    if (takes) inUse = takes;
    const closed = new Map();    // a slot's key -> the row that met it this step, and its cost
    const now = [];
    for (const { r, rests } of ranked) {
      seen.add(r.id);
      seq.push(r.id);
      const met = [];
      const from = [];
      for (const x of [...r.inputs, toolUsed(r, have, source, restsOn)]) { const s = x && source.get(x); if (s && !from.includes(s)) from.push(s); }
      if (r.jobs.includes(job) && takes && takes.id === r.id) met.push({ need: job, for: null, kind: 'job', figure: takes.f, over: was ? was.id : null });
      for (const s of open) {
        const hit = makes(r).find((x) => s.items.has(x));
        if (!hit) continue;
        const c = closed.get(s.key);
        if (c) { if (c.cost === rests.size && c.id !== r.id) tie({ step, need: s.need, winner: c.id, loser: r.id }); continue; }
        closed.set(s.key, { id: r.id, cost: rests.size });
        met.push({ need: hit, for: s.for, kind: s.kind });
      }
      if (met.length) {
        kept.push({ id: r.id, step, met, from });
        now.push({ r, rests });
      } else if (r.jobs.includes(job)) lost.push({ id: r.id, step, why: 'a better answer serves the job', by: inUse.id, from });
      else lost.push({ id: r.id, step, why: 'it met no need', from });
    }
    for (const { r, rests } of now) {
      restsOn.set(r.id, new Set([...rests, r.id]));
      for (const x of makes(r)) if (!have.has(x)) { have.add(x); source.set(x, r.id); }
    }
  }
  return { job, food: [...food], kept, lost, ties, seq, have: [...have].sort() };
}

/* The answers the job kept, each replacing the one before, in the order they did. */
export const branch = (run) => run.kept.filter((k) => k.met.some((m) => m.kind === 'job')).map((k) => k.id);

/* The answer in use when the run ends, or null when nothing serves the job. */
export const winner = (run) => branch(run).pop() || null;

/* Every answer to the job the run built (CAF admitted it), kept or not: [{ id, step, kept }], in the order built: by
   step, and within a step in the order the rule weighs rows (fewer kept rows rested on first, then the table's order). */
export function built(run) {
  const isJob = (e) => (e.met ? e.met.some((m) => m.kind === 'job') : e.why === 'a better answer serves the job');
  return [...run.kept.filter(isJob).map((e) => ({ id: e.id, step: e.step, kept: true })), ...run.lost.filter(isJob).map((e) => ({ id: e.id, step: e.step, kept: false }))]
    .sort((a, b) => run.seq.indexOf(a.id) - run.seq.indexOf(b.id));
}

/* The chain from the endowment to a row the run built: it and every kept row it drew on, back to the endowment, in the
   order they were kept. A row built and not kept ends the chain, marked kept: false. Empty when the run never built it. */
export function lineage(run, table, to) {
  const k = new Map(run.kept.map((e, i) => [e.id, { ...e, i }]));
  const tip = k.has(to) ? null : run.lost.find((e) => e.id === to);
  if (!k.has(to) && !tip) return [];
  const out = new Set();
  const walk = (id) => { if (out.has(id)) return; out.add(id); k.get(id).from.forEach(walk); };
  if (tip) tip.from.forEach(walk); else walk(to);
  const chain = [...out].map((id) => k.get(id)).sort((a, b) => a.step - b.step || a.i - b.i).map(({ i, ...e }) => e);
  return tip ? [...chain, { id: tip.id, step: tip.step, met: [], from: tip.from, kept: false, why: tip.why, by: tip.by }] : chain;
}

/* Why a run never kept a row, or null when it did:
   - { kind: 'unmet', needs }  its inputs, or every one of its tools, never existed in this run;
   - { kind: 'lost', step, first, need }  it could be built at `step`, and `first` had met the need it would have met
     (for an answer to the job: `first` is the answer serving it, better, after that step). */
export function whyNot(run, table, id) {
  if (run.kept.some((k) => k.id === id)) return null;
  const r = table.rows.find((x) => x.id === id);
  if (!r) return { kind: 'unknown' };
  const l = run.lost.find((x) => x.id === id);
  if (l) {
    if (r.jobs.includes(run.job)) return { kind: 'lost', step: l.step, need: run.job, first: l.by || null };
    const made = makes(r).map((x) => run.kept.find((k) => k.id !== id && (k.id === x || table.rows.find((y) => y.id === k.id).jobs.includes(x)))).find(Boolean);
    return { kind: 'lost', step: l.step, need: null, first: made ? made.id : null };
  }
  const have = new Set(run.have);
  const needs = r.inputs.filter((i) => !have.has(i));
  if (!r.tools.some((t) => have.has(t))) needs.push(r.tools.join(' or '));
  return { kind: 'unmet', needs };
}

/* Where world b leaves world a: the first answer to the job b builds that a never builds, the step b built it, whether
   b kept it, and a's answer to the job at that step (the row a kept then, or else a's answer in use before it). Null
   when b builds no answer a lacks. Built, not kept: under "better" a world's own lamp may be built and lose to one in
   use, and the plate shows what the world could build beside what Earth used. */
export function divergence(a, b, table) {
  const ours = built(a).map((e) => e.id);
  const w = built(b).find((e) => !ours.includes(e.id));
  if (!w) return null;
  const at = a.kept.filter((k) => branch(a).includes(k.id));
  const same = at.find((k) => k.step === w.step);
  const before = at.filter((k) => k.step < w.step).pop();
  const e = same || before || null;
  return { world: w.id, step: w.step, kept: w.kept, earth: e ? e.id : null, how: same ? 'same step' : before ? 'in use' : 'none' };
}

/* What a driver does, read from the runs of Earth, of the driver and of its removal alone (no DOM, no words):
   - removal: each row Earth kept that consumed a removed item, the row that met the same need in its place
     (swaps: { earth, world, need, answers }), each answer to the job that consumes that need with whether it is kept on
     Earth and without the item, and what served better when not; and the answers kept without it beside Earth's;
   - lamp: the first answer the driver's world builds that Earth never does, whether it is kept, its figure, what served
     better, and the invented rows its lineage starts from (drawing on no other invented row) without which CAF cannot
     build it.
   Each part names the rows it rests on (rows), so a sentence written from it can be tagged by them. */
export function findings(table, driver) {
  const job = table.job;
  const rowOf = new Map(table.rows.map((r) => [r.id, r]));
  const earth = grow(table, endowmentOf(table, {}), job);
  const world = grow(table, endowmentOf(table, driver), job);
  const removed = driver.remove || [];
  const alone = grow(table, endowmentOf(table, { remove: removed }), job);
  const fate = (run, id) => {
    const k = run.kept.find((e) => e.id === id && e.met.some((m) => m.kind === 'job'));
    if (k) return { kept: true, by: null };
    const l = run.lost.find((e) => e.id === id);
    return l ? { kept: false, by: l.by || null } : { kept: false, by: null, unbuilt: true };
  };
  const swaps = [];
  for (const k of earth.kept) {
    if (!rowOf.get(k.id).inputs.some((i) => removed.includes(i))) continue;
    for (const m of k.met.filter((x) => x.kind !== 'job')) {
      const sub = alone.kept.find((e) => e.id !== k.id && e.met.some((x) => x.need === m.need && x.kind !== 'job'));
      if (!sub || swaps.some((s) => s.earth === k.id && s.need === m.need)) continue;
      const answers = table.rows.filter((r) => r.jobs.includes(job) && r.inputs.includes(m.need))
        .map((r) => ({ id: r.id, earth: fate(earth, r.id), alone: fate(alone, r.id) }));
      swaps.push({ earth: k.id, world: sub.id, need: m.need, answers });
    }
  }
  const lamps = branch(alone), earthLamps = branch(earth);
  const removalRows = [...new Set([...swaps.flatMap((s) => [s.earth, s.world, ...s.answers.flatMap((a) => [a.id, a.alone.by, a.earth.by])]),
    ...lamps.flatMap((id) => lineage(alone, table, id).map((e) => e.id))].filter(Boolean))];
  const div = divergence(earth, world, table);
  let lamp = null;
  if (div) {
    const L = lineage(world, table, div.world);
    const food = endowmentOf(table, driver);
    // the invented rows the lamp cannot be built without, first in their chain: those that draw on no other invented row
    const invented = (id) => !!rowOf.get(id).invented;
    const needs = L.filter((e) => e.id !== div.world && invented(e.id) && !e.from.some(invented)).map((e) => e.id)
      .filter((id) => !caf({ rows: table.rows.filter((r) => r.id !== id) }, food).some((e) => e.id === div.world));
    const f = fate(world, div.world);
    lamp = {
      id: div.world, step: div.step, kept: div.kept, figure: figure(rowOf.get(div.world), table), by: f.by,
      byFigure: f.by ? figure(rowOf.get(f.by), table) : null, earth: div.earth, needs, rows: [...L.map((e) => e.id), f.by].filter(Boolean),
    };
  }
  return { removed, removal: { swaps, lamps, earthLamps, same: JSON.stringify(lamps) === JSON.stringify(earthLamps), rows: removalRows }, lamp };
}

/* A driver applied to Earth's endowment: { remove: [ids], add: [ids] }. The order is the table's, then what was added. */
export function endowmentOf(table, { remove = [], add = [] } = {}) {
  const base = table.endowment.map((e) => e.id).filter((id) => !remove.includes(id));
  return [...base, ...add.filter((id) => !base.includes(id))];
}
