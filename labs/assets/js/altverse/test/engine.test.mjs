/* ============================================================
   altverse/test/engine.test.mjs — the engine, validator and tree,
   headless. Run from the repository root:
     node labs/assets/js/altverse/test/engine.test.mjs
   No dependencies. Exit code 1 on any failure.

   1. our world reproduces Earth's values within 5% (the baseline)
   2. the classifier reads typed divergences
   3. propagation: chains of at least two hops across stages, and no
      placeholder text in any world, presets or not
   4. the ledger passes on every preset world
   5. one planted fault per validator rule, and per ledger check
   6. determinism and the URL round trip; a fork keeps its past
   ============================================================ */

import assert from 'node:assert/strict';

globalThis.location = globalThis.location || { protocol: 'http:', hostname: 'example.com', href: 'http://example.com/labs/altverse.html' };

const { classify } = await import('../classify.js');
const { computePhysics, nuclideSurvival } = await import('../physics.js');
const { runClimate } = await import('../climate.js');
const { BASE_KNOBS } = await import('../lexicon.js');
const { weave } = await import('../engine.js');
const { validateStage, ledger, checkPhysics, checkAxioms } = await import('../validate.js');
const { encodeHash, decodeHash } = await import('../tree.js');
const { PRESETS } = await import('../divergence-presets.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.message || e).split('\n')[0]); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * tol, `${msg}: ${a} vs ${b}`);
const SEED = 41;

console.log('1. baseline: a near-zero change reproduces Earth');
{
  const k = { ...BASE_KNOBS, gFactor: 1.000001 };
  const q = Object.fromEntries(computePhysics(k).quantities.map((x) => [x.id, x.theirs]));
  t('surface gravity 9.81 m/s2', () => near(q['q-g'], 9.81, 0.05, 'g'));
  t('escape velocity 11.19 km/s', () => near(q['q-vesc'], 11.19, 0.05, 'vesc'));
  t('scale height 8.5 km', () => near(q['q-h'], 8.5, 0.05, 'H'));
  t('surface pressure 1.013 bar', () => near(q['q-p'], 1.013, 0.05, 'p'));
  t('dry lapse rate 9.8 K/km', () => near(q['q-lapse'], 9.8, 0.05, 'lapse'));
  t('tallest mountain 8.85 km', () => near(q['q-peak'], 8.85, 0.05, 'peak'));
  t('tallest tree 122 m', () => near(q['q-tree'], 122, 0.05, 'tree'));
  t('rocket mass ratio to orbit about 8.5', () => near(q['q-mr'], 8.47, 0.05, 'mass ratio'));
  t('mean density 5.51 g/cm3', () => near(q['q-rho'], 5.51, 0.05, 'density'));
  const c = runClimate({ ...BASE_KNOBS });
  t('global mean 14.5 C (calibration)', () => near(c.Tmean, 14.5, 0.01, 'Tmean'));
  t('pole receives 0.41 of the equator\'s yearly sunlight', () => near(c.QpoleOverEq, 0.41, 0.05, 'Q ratio'));
  t('equator 24 to 30 C, pole below -15 C', () => { assert.ok(c.Teq > 24 && c.Teq < 30, 'Teq ' + c.Teq); assert.ok(c.Tpole < -15, 'Tpole ' + c.Tpole); });
  const w = weave(SEED, [{ text: 'No divergence: our world.' }]);
  t('our map: land 24 to 34% of the surface', () => assert.ok(w.ctx.ter.stats.landFrac > 0.24 && w.ctx.ter.stats.landFrac < 0.34, String(w.ctx.ter.stats.landFrac)));
  t('our map: highest peak 8.85 km within 5%', () => near(w.ctx.ter.stats.maxElev / 1000, 8.85, 0.05, 'max elev'));
  t('nuclei at our alpha: only beryllium-8 unbound, as measured', () => assert.deepEqual(nuclideSurvival(1).filter((n) => !n.bound).map((n) => n.sym + n.A), ['Be8']));
  t('no divergence changes no invention', () => assert.ok(w.stages.history.events.every((e) => e.kind !== 'shifted')));
}

console.log('2. the classifier');
{
  const cases = [
    ['Ice is denser than liquid water, so it sinks.', 'ice', (s) => s.knobs.iceDensity > 1],
    ['Light travels ten times slower, with charge and Planck\'s constant unchanged.', 'alpha', (s) => Math.abs(s.knobs.alphaFactor - 10) < 1e-9],
    ['gravity is half as strong', 'gravity', (s) => s.knobs.gFactor === 0.5],
    ['Earth has 1.3 times its mass at the same radius, so g is 12.75 m/s2.', 'gravity', (s) => Math.abs(s.knobs.gFactor - 1.3) < 0.01],
    ['The Earth has no Moon.', 'moon', (s) => s.knobs.moon === 0],
    ['Earth\'s axis is tilted 60 degrees.', 'tilt', (s) => s.knobs.tiltDeg === 60],
    ['The Sun is 5% dimmer.', 'sun', (s) => Math.abs(s.knobs.solar - 0.95) < 1e-9],
    ['The printing press arrives in 600 CE.', 'tech', (s) => s.knobs.tech.printing === -850 && s.year === 600],
    ['Rome never fell.', 'event', (s) => s.knobs.removed.includes('b-rome')],
    ['Sea level is 120 m lower.', 'sea', (s) => s.knobs.seaLevelM === -120],
    ['Oxygen makes up 30% of the air.', 'o2', (s) => Math.abs(s.knobs.o2Frac - 0.3) < 1e-9],
    ['A day lasts 48 hours.', 'day', (s) => s.knobs.dayHours === 48],
  ];
  cases.forEach(([text, fam, ok]) => t(`"${text}" reads as ${fam}`, () => { const s = classify(text); assert.ok(s.family.includes(fam), s.family.join()); assert.ok(ok(s), JSON.stringify(s.knobs)); }));
  t('two families combine: "no Moon and a 30 hour day"', () => { const s = classify('The Earth has no Moon and a day lasts 30 hours'); assert.ok(s.family.includes('moon')); assert.equal(s.knobs.moon, 0); });
  t('an unmodelled change is dated, given a domain, and says so', () => { const s = classify('A new religion unites the continents in 900'); assert.deepEqual(s.family, ['generic']); assert.equal(s.year, 900); assert.ok(s.notes.some((n) => /No rule family/.test(n))); });
  t('a fork cannot reach before its branch point', () => { const s = classify('The printing press arrives in 600 CE.', { forkYear: 1200 }); assert.equal(s.year, 1200); });
}

console.log('3. propagation');
const TEXTS = [...PRESETS.map((p) => p.text), 'gravity is half as strong', 'The Sun is 4% dimmer.', 'CO2 is 900 ppm.', 'The Isthmus of Panama never closes.',
  'The Black Death never happened', 'A day lasts 120 hours.', 'Sea level is 200 m higher.', 'Cats became the dominant species in 1200', 'The fine-structure constant is 1/120', 'Earth\'s axis is tilted 2 degrees.'];
const worlds = new Map(TEXTS.map((x) => [x, weave(SEED, [{ text: x }])]));
{
  const ice = worlds.get(PRESETS[0].text);
  const idx = new Map();
  Object.entries(ice.stages).forEach(([s, st]) => (st.items || []).forEach((i) => idx.set(i.id, { ...i, stage: s })));
  const depth = (id) => { let d = 0, c = idx.get(id); const stages = new Set(); while (c && d < 12) { stages.add(c.stage); c = idx.get(c.cause); d++; } return { d, stages: stages.size }; };
  const deepest = [...idx.keys()].map(depth).sort((a, b) => b.d - a.d)[0];
  t('ice world: a causal chain of at least 4 hops', () => assert.ok(deepest.d >= 4, String(deepest.d)));
  t('ice world: that chain crosses at least 3 stages', () => assert.ok(deepest.stages >= 3, String(deepest.stages)));
  t('ice world: sea level falls by the frozen ocean volume', () => assert.ok(ice.ctx.ter.sea < -30, String(ice.ctx.ter.sea)));
  const heavy = worlds.get(PRESETS[2].text);
  t('heavy world: map peak follows 1/g within 15%', () => near(heavy.ctx.ter.stats.maxElev / 1000, 8.85 / 1.3, 0.15, 'peak'));
  t('heavy world: orbit comes later than 1957', () => { const r = heavy.stages.technology.ladder.find((x) => x.tech === 'orbit'); assert.ok(r.theirs > 1957, String(r.theirs)); });
  const slow = worlds.get(PRESETS[1].text);
  t('slow light: carbon unbound, climate, geography, technology and culture pruned', () => { assert.equal(slow.stages.physics.chemistry, 'none'); ['climate', 'geography', 'technology', 'culture'].forEach((s) => assert.ok(slow.stages[s].pruned, s)); });
  const tilt = worlds.get(PRESETS[4].text);
  t('tilt 60: the poles out-sun the equator', () => assert.ok(tilt.ctx.clim.QpoleOverEq > 1));
  const press = worlds.get(PRESETS[9].text);
  t('press in 600: the steam engine moves earlier but not before the press', () => { const l = press.stages.history.tech; assert.ok(l.steam.theirs < 1712 && l.steam.theirs > l.printing.theirs); });
  const PLACE = /Region \d|Direct consequence|Turning point \d|People \d|undefined|NaN|\[object/;
  t(`no placeholder text in any of ${worlds.size} worlds`, () => { for (const [x, w] of worlds) assert.ok(!PLACE.test(JSON.stringify(w.stages)), x); });
}

console.log('4. the ledger passes on every world');
for (const [x, w] of worlds) t(`ledger clean: ${x.slice(0, 48)}`, () => { const L = ledger(w); assert.equal(L.passed, L.total, L.checks.filter((c) => c.status !== 'pass').map((c) => c.rule + ': ' + c.note).join('; ')); });

console.log('5. planted faults: each validator rule fires');
{
  const w = worlds.get(PRESETS[0].text);
  const lastEv = w.stages.history.events.filter((e) => e.year > 0).slice(-1)[0];
  const run = (stage, reply) => validateStage(stage, reply, w);
  const rules = (r) => [...r.rejected.map((x) => x.rule), ...r.repaired.map((x) => x.rule)].join(' | ');
  t('R1 shape: an event with no title', () => assert.match(rules(run('history', { events: [{ year: 1500, cause: 'dv' }] })), /R1/));
  t('R2 ladder: an unknown tag is repaired', () => assert.match(rules(run('physics', { add: [{ text: 'Glaciers grind the shelves flat over ages.', cause: 'ph-icefill', ladder: 'probably' }] })), /R2/));
  t('R3 cause: an id that does not exist is re-linked', () => assert.match(rules(run('physics', { add: [{ text: 'Glaciers grind the shelves flat over ages.', cause: 'zz-1', ladder: 'SPECULATIVE' }] })), /R3/));
  t('R4 order: a cause downstream of the stage is re-linked', () => assert.match(rules(run('physics', { add: [{ text: 'Glaciers grind the shelves flat over ages.', cause: 'pp-water', ladder: 'SPECULATIVE' }] })), /R4/));
  t('R4 order: an effect before its cause in time is rejected', () => assert.match(rules(run('history', { events: [{ year: lastEv.year - 100, title: 'Too soon', cause: lastEv.id, ladder: 'SPECULATIVE' }] })), /R4/));
  t('R5 dates: before the branch point', () => assert.match(rules(run('history', { events: [{ year: -5e9, title: 'Too early', cause: 'dv', ladder: 'SPECULATIVE' }] })), /R5/));
  t('R5 dates: after the horizon', () => assert.match(rules(run('history', { events: [{ year: 2500, title: 'Too late', cause: 'dv', ladder: 'SPECULATIVE' }] })), /R5/));
  const heavy = worlds.get(PRESETS[2].text);
  t('R6 physics: a stated gravity that is wrong', () => assert.ok(checkPhysics('Surface gravity here is 9.81 m/s2.', heavy)));
  t('R6 physics: a stated gravity that is right passes', () => assert.equal(checkPhysics('Surface gravity here is 12.7 m/s2.', heavy), null));
  t('R7 axioms: floating ice in a world where ice sinks', () => assert.ok(checkAxioms('Skaters cross the lakes on floating ice.', w, 'culture')));
  t('R7 axioms: a change the divergence did not make (faster rotation in a heavier world)', () => assert.ok(checkAxioms('Stronger gravity leads to a more rapid rotation and longer days.', worlds.get(PRESETS[2].text), 'physics')));
  t('R7 axioms: tides claimed to change where the Moon is ours', () => assert.ok(checkAxioms('Coasts see more extreme tidal ranges.', worlds.get(PRESETS[2].text), 'geography')));
  t('R7 axioms: a negated mention passes', () => assert.equal(checkAxioms('No ice ever floats here.', w, 'culture'), null));
  t('R7 axioms: moonlight in a world with no Moon', () => assert.ok(checkAxioms('They dance by moonlight.', worlds.get(PRESETS[3].text), 'culture')));
  t('R7 axioms: warming in a world the climate stage computes colder', () => assert.ok(checkAxioms('The ice-albedo loop amplifies the temperature increase.', w, 'physics')));
  t('R7 axioms: sea-level rise in a world whose sea fell', () => assert.ok(checkAxioms('Sea level rise floods the coast.', w, 'geography')));
  t('R7 axioms: ice-free polar seas where seas freeze solid', () => assert.ok(checkAxioms('Polar seas have no seasonal ice coverage.', w, 'physics')));
  t('R6 physics: the ours half of a contrast is read against our world', () => assert.equal(run('contrast', { items: [{ ours: 'The global mean is about 14.5 C.', theirs: 'The global mean is 3.6 C, and the seas are full of ice.', cause: 'cl-mean', ladder: 'THEORETICAL' }] }).accepted.length, 1));
  t('R8 certainty: a claim more certain than its cause is lowered', () => assert.match(rules(run('history', { events: [{ year: 1500, title: 'River guilds keep the channels open', cause: 'ge-hearths', ladder: 'THEORETICAL' }] })), /R8/));
  t('R10 source: a model line tagged ESTABLISHED is lowered', () => assert.match(rules(run('history', { events: [{ year: 1510, title: 'Charters for winter river crossings', cause: 'dv', ladder: 'ESTABLISHED' }] })), /R10/));
  t('every rejection names its field path', () => { const r = run('history', { events: [{ year: 'soon', title: 'x', cause: 'dv' }, { year: -5e9, title: 'Too early', cause: 'dv' }] }); assert.ok(r.rejected.length === 2 && r.rejected.every((x) => /^history\.events\[\d\]/.test(x.at || '')), JSON.stringify(r.rejected.map((x) => x.at))); });
  t('R9 novelty: a restatement is rejected', () => assert.match(rules(run('physics', { add: [{ text: w.stages.physics.items[0].text, cause: 'dv', ladder: 'THEORETICAL' }] })), /R9/));
  t('a pruned stage accepts nothing', () => assert.ok(validateStage('geography', { summary: 'A map.', add: [{ text: 'x', cause: 'dv' }] }, worlds.get(PRESETS[1].text)).rejected.length));
  t('a clean item is accepted with a minted id', () => { const r = run('history', { events: [{ year: 1600, title: 'River guilds keep the channels open in winter', cause: 'ge-hearths', ladder: 'SPECULATIVE' }] }); assert.equal(r.accepted.length, 1); assert.equal(r.accepted[0].id, 'ev-m1'); });
}

console.log('5b. planted faults: each ledger check flags');
{
  const fresh = () => weave(SEED, [{ text: PRESETS[0].text }]);
  const flags = (w) => ledger(w).checks.filter((c) => c.status !== 'pass').map((c) => c.rule).join(' | ');
  t('duplicate id', () => { const w = fresh(); w.stages.physics.items.push({ ...w.stages.physics.items[0] }); assert.match(flags(w), /ids unique/); });
  t('dangling cause', () => { const w = fresh(); w.stages.physics.items[0].cause = 'zz-404'; assert.match(flags(w), /every cause resolves/); });
  t('cause downstream', () => { const w = fresh(); w.stages.physics.items[0].cause = 'pp-water'; assert.match(flags(w), /upstream/); });
  t('cause later in time', () => { const w = fresh(); const ev = w.stages.history.events; ev[3].cause = ev[ev.length - 1].id; assert.match(flags(w), /before effects in time/); });
  t('dates out of order', () => { const w = fresh(); const ev = w.stages.history.events; [ev[2], ev[5]] = [ev[5], ev[2]]; assert.match(flags(w), /dates in order/); });
  t('eras overlapping', () => { const w = fresh(); w.stages.history.eras[1].start = w.stages.history.eras[0].start - 1; assert.match(flags(w), /eras ordered/); });
  t('certainty inflated', () => { const w = fresh(); const it = w.stages.biosphere.items.find((i) => i.ladder === 'SPECULATIVE'); it.ladder = 'ESTABLISHED'; w.stages.biosphere.items.push({ id: 'bi-x', text: 'x', cause: it.id, ladder: 'ESTABLISHED' }); it.ladder = 'SPECULATIVE'; assert.match(flags(w), /more certain/); });
  t('an invention before what it needs', () => { const w = fresh(); w.stages.history.tech.steam.theirs = 1000; assert.match(flags(w), /before what it needs/); });
  t('a model line that states the wrong physics', () => { const w = fresh(); w.stages.culture.items.push({ id: 'pp-m1', text: 'Here a day lasts 30 hours.', cause: 'dv', ladder: 'SF', origin: 'model' }); assert.match(flags(w), /stated numbers/); });
  t('a pruned stage holding items', () => { const w = weave(SEED, [{ text: PRESETS[1].text }]); w.stages.culture.items = [{ id: 'pp-x', text: 'x', cause: 'dv', ladder: 'SF' }]; assert.match(flags(w), /pruned stages/); });
  t('a people in a region the map lacks', () => { const w = fresh(); w.stages.culture.peoples[0].regionId = 'rg-99'; assert.match(flags(w), /regions on the map/); });
  t('an event outside every era', () => { const w = fresh(); w.stages.history.eras.shift(); assert.match(flags(w), /inside an era/); });
}

console.log('6. determinism, URL, forks');
{
  const a = weave(SEED, [{ text: PRESETS[2].text }]), b = weave(SEED, [{ text: PRESETS[2].text }]);
  t('same seed and path weave the same world', () => assert.equal(JSON.stringify(a.stages), JSON.stringify(b.stages)));
  const c = weave(SEED + 1, [{ text: PRESETS[2].text }]);
  t('another seed weaves another map', () => assert.notEqual(c.ctx.ter.stats.landFrac, a.ctx.ter.stats.landFrac));
  const parent = worlds.get(PRESETS[0].text);
  const ev = parent.stages.history.events.find((e) => e.id === 'ev-writing');
  const child = weave(SEED, [...parent.path, { text: 'The steam engine is invented in 300 BCE.', eventId: ev.id, year: ev.year }], parent);
  t('a fork keeps every parent event before the branch point', () => { const before = parent.stages.history.events.filter((e) => e.year < ev.year).map((e) => e.id); const kept = new Set(child.stages.history.events.map((e) => e.id)); assert.ok(before.every((id) => kept.has(id))); });
  t('a fork moves what follows', () => assert.ok(child.stages.history.tech.steam.theirs < 1712));
  t('the URL carries seed, root and fork path', () => { const h = decodeHash(encodeHash(child)); assert.equal(h.seed, SEED); assert.equal(h.root, parent.path[0].text); assert.equal(h.forks[0].eventId, 'ev-writing'); });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
