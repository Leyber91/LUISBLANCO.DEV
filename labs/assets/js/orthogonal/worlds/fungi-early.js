/* ============================================================
   worlds/fungi-early.js: one world of the Orthogonal plate, grown.

   The lineage is not typed here. buildWorld runs the engine
   (grow.js) on the technology table (assets/data/orthogonal/tech/
   light.json) twice, for Earth's endowment and for this world's
   (Earth's with the driver applied), and reads the plate from what
   grew:
   - the artifact is the first lamp this world builds that Earth
     never does (grow.js divergence), and Earth's artifact is
     Earth's lamp in use at that step. Under "better" (grow.js,
     2026-11-21's second pass) the lamp may be built and not kept,
     when a lamp in use serves the job better; the artifact's line
     and the lamp's engine line say which, from the run;
   - the verdict line, one line under the header, is written here
     from grow.js findings: what the removal of coal changes, and
     what the lamp rests on and whether it is kept. Its words are
     fixed; which words, which rows and which tag are computed;
   - this world's steps are the rows of the artifact's lineage Earth
     never keeps; each grows from the steps it drew on, or from the
     driver when it drew on none and rests on the driver's own item.
     What a step shares with Earth (blown glass, kilns) is not drawn
     as a step: both worlds have it, as they have the root, and the
     step's needs line names it. A step that drew on two or more rows
     is a combination, whether the other thread is drawn or shared.
     (The plate has one side lane, and Earth's first line runs down it
     from the root: shared rows drawn from the root put Earth's dotted
     line through them, found on 2026-11-21 in the first grown plate.)
   - Earth's steps are its artifact and the rows its first input
     came from, back as many steps as this world's branch has below
     the driver, each paired with this world's step at the same
     distance from the artifact.
   The words of each step (label, role line, what it needs, note,
   evidence) are below, keyed by the table row the engine chose; a
   row with no words stops the plate (engine.js check) instead of
   being drawn unnamed.

   A lineage is a list of nodes. Each names its role (config.js
   ROLES), the branch it belongs to (both, world, earth) and the
   nodes it grows from (after: the first is the one it continues,
   any others are threads that meet in it). An Earth node names the
   world node that does the same job at the same step (pair), and
   is drawn on that node's row. engine.js checks all of it and lays
   it out; nothing in view.js knows this world.

   Each node says what it rests on (needs), in the words of the
   steps it needs: the exercise shows that line under each step it
   lifts out, so the order can be reasoned out from the four steps
   alone. tests.mjs holds each line to the links: it names a word of
   every step the node needs (the root aside), and never a word of
   a step that needs the node.

   Each node carries its evidence as items tagged REAL or
   ILLUSTRATIVE. A REAL item cites a key of config.js SOURCES (or a
   list of them), or declares the gap where no source was opened.
   ============================================================ */
import { branch, divergence, endowmentOf, eras, findings, grow, lineage } from '../grow.js';

/* The driver as the engine reads it: Earth's endowment with coal taken out and the early fungi put in. */
export const DRIVER = Object.freeze({ remove: ['coal'], add: ['fungi-early'] });

/* Where the page reads the table from, relative to labs/. */
export const TABLE_PATH = 'assets/data/orthogonal/tech/light.json';

const ROOT = {
  id: 'ground', label: 'Wood, clay, ore and herds', role: 'root', branch: 'both', after: [],
  needs: 'nothing on this plate',
  note: "What both worlds start from: Earth's endowment in the engine's table, from fire and hand tools to whales and running water. This world has all of it but coal.",
  evidence: [
    { tag: 'REAL', text: "Earth's endowment, as the engine's table lists it.", gap: "No source opened for the endowment's items." },
    // the rules every step below is grown by (grow.js), cited once here so the lamp's reading stays one footer tall
    // and the measure that decides between lamps (light.json measure: Table 1.6, the labor price of light)
    { tag: 'REAL', text: 'Every step below is grown from it by two rules: a step enters when all it consumes and one of its tools exist, and is kept when it meets a need; a lamp only when its light costs fewer hours of work than the lamp in use.', src: ['hordijk2023', 'arthurpolak2006', 'nordhaus1996'] },
  ],
};

const DRIVER_NODE = {
  id: 'fungi', label: 'Fungi eat lignin', role: 'driver', branch: 'world',
  needs: 'wood stiffened with lignin',
  note: 'The one change: white-rot fungi learn to digest lignin before the Carboniferous, so dead plants rot where on Earth they piled up.',
  evidence: [
    { tag: 'REAL', text: 'A molecular clock puts the origin of lignin decay near the end of the Carboniferous and supports this lag in part.', src: 'floudas2012' },
    { tag: 'REAL', text: 'Rejected on four kinds of evidence: coal formed where everwet tropics met sinking basins, much of it from bark without lignin, and still forms wherever those conditions hold.', src: 'nelsen2016' },
    { tag: 'ILLUSTRATIVE', text: 'This world takes the rejected branch on purpose, to grow what it would have built.' },
  ],
};

/* The words of the rows the engine may put on this plate, keyed by the table's row id. */
const WORDS = {
  'fungus-beds': {
    id: 'farmed', label: 'Glowing fungi farmed',
    needs: 'fungi that eat lignin',
    note: 'Among fungi that have eaten wood for longer, strains that glow bright enough to read by, grown on wood as a crop. Earth farms fungi too, for food, and its glowing fungi are far dimmer.',
    evidence: [{ tag: 'ILLUSTRATIVE', text: "Invented with the driver: strains bright enough to read by. The engine's table makes this world's culture need them, because Earth's foxfire is far too dim to light a street." }],
  },
  'luminous-culture': {
    id: 'luminous', label: 'Luminous culture under glass',
    needs: 'glowing fungi, kept wet in blown glass',
    note: "Two threads meet: the farmed fungi that glow, and Earth's own blown glass, which keeps them wet and breathing.",
    evidence: [
      { tag: 'ILLUSTRATIVE', text: 'Glow drawn where Panellus stipticus is reported to glow: gill edges, cross-veins, rolled margin. Uncertain: read through an unrecorded secondary source.', src: 'okane1990' },
      { tag: 'ILLUSTRATIVE', text: 'Growing it under glass for light is invented.' },
    ],
  },
  'mycelial-lamp': {
    id: 'lamp', label: 'Mycelial lamp',
    needs: 'a luminous culture of glowing fungi',
    note: 'The street lamp of this world: a column of glass on a ceramic plinth, a culture of shelf fungus on a spindle inside, a louvered hood it breathes through, a flask that keeps it wet.',
    evidence: [
      { tag: 'REAL', text: 'Real fungal light is dim: a culture of P. stipticus was photographed with an 8-minute exposure.', src: 'rabara2025' },
      // what render_artifact.py does (review H5: it holds no grammar), with the two sources its header gives
      { tag: 'ILLUSTRATIVE', text: 'The lamp, its brightness and its world are invented. Each cap of its culture is a profile swept round an axis, built from the seed in its parameter file.', src: ['desbenoit2004', 'raistrick2023'] },
      // the lab's core claim is untested (Luis closed box 1 without the core test, 2026-11-21; CORE_TEST.md); since the
      // engine (2026-11-21) the lineage is built by its rules, which is all this line now adds. Built, not grown: under
      // "better" the engine builds the lamp and may not keep it, which the verdict line under the header says
      { tag: 'ILLUSTRATIVE', text: "Built by the engine's rules; the method's core claim is not yet tested." },
    ],
  },
  whaling: {
    id: 'whaling', label: 'Whaling',
    needs: 'harpoons and boats, at sea',
    note: 'On Earth whales were hunted from boats for their blubber.',
    // the date was checked against the Historical Tech Tree, which has no licence and is cited by no row (light.json)
    evidence: [{ tag: 'REAL', text: "Whaling, in Earth's record from about 6000 BC.", gap: 'No primary source opened for the date.' }],
  },
  'whale-oil': {
    id: 'whaleoil', label: 'Whale oil',
    needs: 'blubber from whaling',
    note: 'On Earth the fat of whales was boiled down into lamp oil.',
    evidence: [{ tag: 'REAL', text: 'Whale oil was sold for lighting by 670, from Bayonne.', gap: 'No primary source opened for the date.' }],
  },
  'whale-oil-lamp': {
    id: 'oillamp', label: 'Whale-oil lamp',
    needs: 'whale oil rendered from blubber, from whaling',
    note: "Earth's answer in use when this world's lamp came: oil burned on a wick, in street lamps and spermaceti candles.",
    evidence: [{ tag: 'REAL', text: 'In the eighteenth and nineteenth centuries whale-oil candles became the illuminant of choice.', src: 'nordhaus1996' }],
    artifact: { title: 'The whale-oil street lamp', line: "Earth's answer to the same job", supply: null, kind: 'oil' },
  },
};

const TROUBLE = {
  id: 'trouble', label: 'The rot that lights the city eats its timber', role: 'trouble', branch: 'world',
  needs: 'mycelial lamps of luminous fungi',
  note: 'Every success plants the next problem. A city lit by wood-eating fungi lives beside the thing that eats its beams.',
  evidence: [{ tag: 'ILLUSTRATIVE', text: "Invented, and not grown by the engine: the hook of this world's next era." }],
};

const words = (row) => {
  const w = WORDS[row];
  if (!w) throw new Error(`the engine put "${row}" on the plate, and this world has no words for it`);
  return w;
};

/* The plate's world, grown from the table. Returns the same shape engine.js reads, plus `grown`: what the engine did,
   for the page's record of it and for the tests. */
export function buildWorld(table) {
  const earth = grow(table, endowmentOf(table, {}), table.job);
  const run = grow(table, endowmentOf(table, DRIVER), table.job);
  const div = divergence(earth, run, table);
  if (!div || !div.earth) throw new Error('the engine built no lamp this world has and Earth lacks');
  const kept = new Set(earth.kept.map((k) => k.id));
  const L = lineage(run, table, div.world);
  const at = new Map(L.map((s) => [s.id, s]));
  const own = L.filter((s) => !kept.has(s.id)).map((s) => s.id);
  const shown = new Set(own);
  const byRow = new Map(table.rows.map((r) => [r.id, r]));
  const plateId = (row) => words(row).id;
  // what a step grows from on the plate: the steps it drew on; the driver when it drew on none and rests on the
  // driver's own item; else the root
  const afterOf = (row) => {
    const from = at.get(row).from.filter((f) => shown.has(f));
    if (from.length) return from.map(plateId);
    return byRow.get(row).inputs.some((i) => DRIVER.add.includes(i)) ? [DRIVER_NODE.id] : [ROOT.id];
  };
  const worldNodes = own.map((row) => {
    const w = words(row);
    const role = row === div.world ? 'artifact' : at.get(row).from.length > 1 ? 'combination' : 'substrate';
    return { id: w.id, label: w.label, role, branch: 'world', after: afterOf(row), needs: w.needs, note: w.note, evidence: w.evidence, row, drew: at.get(row).from };
  });
  // this world's trunk below the driver: the artifact back through first parents
  const byPlate = new Map(worldNodes.map((n) => [n.id, n]));
  const trunk = [];
  for (let n = byPlate.get(plateId(div.world)); n; n = byPlate.get(n.after[0])) trunk.unshift(n.id);
  // Earth's steps: its artifact and the rows its first input came from, as many as the trunk has, paired from the end
  const chain = [];
  for (let row = div.earth; row && chain.length < trunk.length; row = (earth.kept.find((k) => k.id === row) || { from: [] }).from[0]) chain.unshift(row);
  const offset = trunk.length - chain.length;
  const earthNodes = chain.map((row, i) => {
    const w = words(row);
    return { id: w.id, label: w.label, role: 'earth', branch: 'earth', after: [i ? words(chain[i - 1]).id : ROOT.id], pair: trunk[offset + i], needs: w.needs, note: w.note, evidence: w.evidence, row };
  });
  const art = words(div.world), earthArt = words(div.earth);
  // the same driver with coal restored and the fungi kept: does the lamp rest on the missing coal? (the step it is built)
  const restored = grow(table, endowmentOf(table, { add: DRIVER.add }), table.job);
  const stepOf = (r, id) => (r.kept.find((k) => k.id === id) || r.lost.find((k) => k.id === id) || {}).step || null;
  const verdict = verdictOf(table, findings(table, DRIVER));
  return {
    id: 'fungi-early',
    plate: 'A',
    title: 'A world where the fungi came early',
    driver: 'lignin-eating fungi before the Carboniferous',
    job: 'light at night',
    // the header's evidence line, a [REAL] claim (review H1): each source with its venue as config.js SOURCES gives it,
    // and the lag it is about said in the sentence itself
    favours: {
      branch: 'earth',
      line: 'The evidence favours the other branch: Nelsen et al. 2016 (PNAS) reject that coal formed because fungi could not yet digest lignin; Floudas et al. 2012 (Science) support that lag in part.',
    },
    artifact: {
      node: art.id,
      params: 'assets/data/orthogonal/artifacts/mycelial-lamp.json',
      image: 'assets/data/orthogonal/renders/mycelial-lamp.webp',
      record: 'assets/data/orthogonal/renders/mycelial-lamp.render.json',
      title: 'The mycelial street lamp',
      // what the lamp is to its world, from the run: its answer to the job when kept, else only its lamp (built, not kept,
      // which the verdict line says); one line of the caption at 1440
      line: div.kept ? "This world's answer to light at night" : "This world's lamp for light at night",
      // [ILLUSTRATIVE] said beside the render: every way it departs from what the culture would look like, as the
      // pipeline declares them (render-words.js DEPARTURES, tests.mjs section 18). The scene is exposed up, as a long
      // exposure records a dim source; an exposure that long records the night sky's faint light too (air.sky_ambient);
      // and the glow is drawn blue-white for the plate's palette where fungal light is green (review H4)
      exposure: "Drawn as a long exposure, sky included, in the plate's blue-white; to the eye fungal light is dimmer, and green (Kotlobay et al. 2018, PNAS).",
      exposureCites: ['kotlobay2018'],
      // what the render shows, read from the image (renders/mycelial-lamp.webp, 900 x 1200) and held word by word to the
      // parameter file, the record and the pipeline (render-words.js, tests.mjs section 18)
      alt: "At night in fog, a glass column on a plinth under a hood of stacked rings. Inside it, shelves of gilled bracket fungus on a central spindle glow blue-white along their gills and rims, and a small glass flask stands at the plinth's side. Their light reaches the plinth's top and a pool of wet cobbles in front of it; the hood is dark against the faint sky.",
      // where the render put the instrument's top and foot, as shares of the frame's height from its top (the render's
      // record, measure.frame); Earth's lamp stands on the same two lines. tests.mjs holds the three to each other.
      frame: { top: 0.09, ground: 0.79 },
    },
    earthArtifact: { node: earthArt.id, ...earthArt.artifact },
    verdict,
    eras: erasOf(table),
    nodes: [ROOT, { ...DRIVER_NODE, after: [ROOT.id] }, ...worldNodes, ...earthNodes, { ...TROUBLE, after: [art.id] }],
    grown: {
      table: TABLE_PATH, rows: table.rows.length, artifactRow: div.world, earthRow: div.earth, how: div.how, kept: div.kept,
      step: div.step, earthStep: stepOf(earth, div.earth), restoredStep: stepOf(restored, div.world),
      earthLamps: branch(earth), lamps: branch(run),
    },
  };
}

/* The verdict line: what the engine finds for this world, in one line of two clauses, each tagged by the rows it rests on
   ([ILLUSTRATIVE] when any of them is invented, else [REAL]). The words are fixed here; which words, which rows, which
   outcome and which tag come from grow.js findings, so a table that grows something else writes another line (the
   engine's tests change a figure and read the line change). Names are the table's (row.name, else its label; the
   endowment's label). */
export function verdictOf(table, f) {
  const row = new Map(table.rows.map((r) => [r.id, r]));
  const name = (id) => (row.get(id) && (row.get(id).name || row.get(id).label.toLowerCase())) || id;
  const item = (id) => { const e = table.endowment.find((x) => x.id === id); return e ? e.label.toLowerCase() : id; };
  const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const tagOf = (ids) => (ids.some((id) => row.get(id) && row.get(id).invented) ? 'ILLUSTRATIVE' : 'REAL');
  const without = `Without ${list(f.removed.map(item))}`;
  // the removal: what replaced what Earth made from the removed item, and how the answer it fed fared
  let removal;
  const s = f.removal.swaps[0];
  const a = s && s.answers[0];
  if (s && a) {
    const fared = a.alone.kept ? `and ${name(a.id)} wins the job`
      : a.earth.kept ? `and ${name(a.id)} loses to ${name(a.alone.by)} on price`
        : `but ${name(a.id)} still loses to ${name(a.alone.by)} on price`;
    removal = `${without}, ${name(s.world)} replaces ${name(s.earth)}, ${fared}.`;
  } else if (f.removal.same) removal = `${without}, no lamp that wins changes.`;
  else removal = `${without}, the lamps that win are ${list(f.removal.lamps.map(name))}.`;
  // the lamp: what it needs that is invented, and whether it is kept, or what served the job better when it came
  const L = f.lamp;
  const needs = L.needs.length ? `needs ${list(L.needs.map(name))} and` : 'is built and';
  const lamp = L.kept ? `${cap(name(L.id))} ${needs} is kept.`
    : `${cap(name(L.id))} ${needs}, ${L.figure === null ? 'unpriced' : 'dearer'}, loses to ${name(L.by)}.`;
  const clauses = [
    { tag: tagOf(f.removal.rows), text: removal, rows: f.removal.rows },
    { tag: tagOf(L.rows), text: lamp, rows: L.rows },
  ];
  return { clauses, line: clauses.map((c) => `[${c.tag}] ${c.text}`).join(' ') };
}

/* The eras line: how many of Earth's lighting eras (the table's ledger rows for the job, in the order of their dates) the
   rule regrows when it ranks at each date (grow.js dated, eras), against how many it regrew ranked by each lamp's first
   price, and the misses with their figures. Written from the engine's run; the words are fixed, the counts, the names and
   the figures are computed, and the tag is [REAL] unless a row it names is invented (a ledger row never is). */
export function erasOf(table) {
  const row = new Map(table.rows.map((r) => [r.id, r]));
  const name = (id) => row.get(id).name || row.get(id).label.toLowerCase();
  const ids = table.rows.filter((r) => r.ledger && r.jobs.includes(table.job)).sort((a, b) => a.date - b.date).map((r) => r.id);
  const e = eras(table, endowmentOf(table, {}), table.job, ids);
  const num = (x) => String(Number(x.toPrecision(3)));
  const miss = e.missed.map((m) => (m.stages.length && m.near
    ? `${name(m.id)} (never cheapest: ${num(m.near.f)} against ${num(m.near.byF)} for ${name(m.near.by)} in ${m.near.year}, hours of work per 1,000 lumen-hours)`
    : `${name(m.id)} (Table 1.6 gives it no price)`));
  const tag = ids.some((id) => row.get(id).invented) ? 'ILLUSTRATIVE' : 'REAL';
  const text = `Ranked by the price of light at each date, the rules regrow ${e.held.length} of Earth's ${e.total} lighting eras, against ${e.before.length} of ${e.total} by first price`
    + (miss.length ? `; missed: ${miss.join(', ')}.` : '.');
  return { tag, text, line: `[${tag}] ${text}`, held: e.held, missed: e.missed, before: e.before, total: e.total, ids };
}
