/* ============================================================
   heptapod/tests/pod.test.mjs — the pod's engine, checked in Node.

     node labs/assets/js/heptapod/tests/pod.test.mjs           about 3 s
     node labs/assets/js/heptapod/tests/pod.test.mjs --sweep   adds the 80-species selection, about 40 s

   What is checked against values derived elsewhere:
   - the three species the page uses are the ones the selection picked, operation by operation;
   - a proxy learner (K = 4 hypotheses per radical, 40 acts) lands between chance and ceiling on
     them in the counts recorded when the selection ran (of 201 proxy visitors each);
   - a reader who knows the species scores 6 of 6 on every check, and one who knows nothing
     averages 2 of 6, the binomial mean for three options;
   - a reader who knows nothing and refuses every picture of something it did also averages 2 of 6.
     Until 2026-11-14 the two wrong pictures were drawn from every scene, and that reader scored
     3.85 of 6: an independent review found it, and the wrong pictures now come from unseen scenes.
   The rest checks the engine against its own statements: rings carry the species' codes, a crop
   keeps what its rectangle and the thinning allow, the notebook brackets what no act has told
   apart, the being reads a mark by contingency, a day survives storage.
   ============================================================ */

import { SCENES, FEATS, OBJ, sceneOf } from '../pod/world.js';
import { OPS, GATE_SPECIES, makeSpecies, opText, seedOf } from '../pod/species.js';
import { PROXY, playOnce, classify, checkItems, dayRandom, dayContrastive } from '../pod/proxy.js';
import { MarkLearner } from '../pod/being.js';
import { ringSpec, soloSpec, cellInk, recognise, sectorRect, INK } from '../pod/ring.js';
import { DAY, GREETING, newDay, doAct, addCrop, addSolo, entryActs, entryScenes, brackets, raiseMark, learnerOf, endDay, answer, score, validDay, whereIs, canEnd, setGuess, carry } from '../pod/day.js';
import { ringR } from '../geometry.js';
import { mulberry32 } from '../raster.js';

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, expected ${b}`);

/* ---------------- the world ---------------- */
eq(SCENES.length, 42, 'scene types');
eq(FEATS.length, 25, 'features');
eq(OPS.length, 54, 'operations');
eq(SCENES.filter((s) => s.act === 'give').length, 6, 'give scenes (always at the glass)');

/* ---------------- the three species ---------------- */
const EXPECT = [
  { ops: 'novel (cube/bowl)&near; join seed+cloth; novel (lift/hold)&small; split stone; join putdown+give; join you+me; split jug', concepts: 13, band: { random: 166, contrastive: 166 } },
  { ops: 'join cube+seed; novel (lift/putdown)&small; join bowl+stone; join hold+give; join jug+cloth; join you+me', concepts: 8, band: { random: 163, contrastive: 168 } },
  { ops: 'join lift+hold; join seed+cloth; split bowl; split give; split you; novel (cube/stone)&near', concepts: 14, band: { random: 162, contrastive: 163 } },
];
const species = GATE_SPECIES.map(([a, s]) => makeSpecies(a, s));
/* the species that splits one English word: the tests that need "you" or the bowl cut in two use it */
const splitting = (word) => species.find((x) => x.ops.some((op) => op.type === 'split' && op.members[0] === word));
species.forEach((sp, k) => {
  const name = `species ${sp.target}/${sp.seed}`;
  eq(sp.ops.map(opText).join('; '), EXPECT[k].ops, `${name} operations`);
  eq(sp.inv.all, EXPECT[k].concepts, `${name} concepts`);
  ok(Math.abs(sp.inv.share - sp.target) <= 0.05 + 1e-12, `${name} alienness ${sp.inv.share} within 0.05 of its target`);
  eq(new Set(sp.code.values()).size, sp.code.size, `${name} distinct radicals`);
  const again = makeSpecies(sp.target, sp.seed);
  eq(again.rings.map((r) => r.key).join(), sp.rings.map((r) => r.key).join(), `${name} is deterministic`);
  // every radical's uses are exactly the scenes whose ring carries it
  for (const [code, scenes] of sp.ext) {
    const far = sp.cls.get(sp.idOfCode.get(code)) === 'far';
    ok(scenes.every((i) => sp.rings[i].tokens.includes(code)) && (scenes.length > 0) !== far, `${name}: radical ${code} is used ${far ? 'in no scene' : 'somewhere and only where listed'}`);
  }
  // the greeting: its word for itself, two concepts no scene can show, its word for a visitor with an empty hand
  const g = sp.greeting;
  eq([...sp.cls.entries()].filter(([, c]) => c === 'far').length, 2, `${name}: two concepts outside the tray`);
  ok(g.ids.pred === 'far:1' && g.ids.patient === 'far:2', `${name}: the greeting's act and thing are outside the tray`);
  ok(sp.rings.some((r) => r.recip === g.agent) && sp.rings.some((r) => r.agent === g.recip), `${name}: the greeting's two parties come back in the day's rings`);
  eq(g.tokens.filter((t) => sp.ext.get(t).length === 0).length, 2, `${name}: two of the greeting's radicals appear in no ring of the day`);
  ok(!sp.rings.some((r) => r.key === g.key), `${name}: no ring of the day is the greeting`);
  // a ring is decided by its scene, and a scene by features a visitor can see
  ok(sp.rings.every((r) => r.agent && r.pred && r.patient), `${name}: every ring names who, what act, what thing`);
  eq(sp.rings.filter((r) => r.recip).length, 6, `${name}: a recipient on give only`);
});

/* ---------------- the proxy and the check ---------------- */
const stats = { checks: 0, targetFallback: 0, foilFallback: 0 };
species.forEach((sp, k) => {
  for (const pol of ['random', 'contrastive']) {
    const hist = new Array(7).fill(0);
    for (let r = 0; r < 201; r++) hist[playOnce(sp, pol, r, PROXY, stats)]++;
    const c = classify(hist);
    eq(c.inBandCount, EXPECT[k].band[pol], `species ${sp.target}/${sp.seed}, ${pol}: proxy visitors of 201 scoring 3 to 5 of 6`);
    ok(c.inBand, `species ${sp.target}/${sp.seed}, ${pol}: in band`);
  }
});
let oracle = 0, oracleN = 0, blank = 0, blankN = 0, ruleout = 0;
for (const sp of species) for (const pol of ['random', 'contrastive']) for (let r = 0; r < 60; r++) {
  for (const mode of ['random', 'near']) {
    const cfg = { ...PROXY, foils: mode };
    oracle += playOnce(sp, pol, 100000 + r, cfg, stats, 'oracle') === 6 ? 1 : 0; oracleN++;
    blank += playOnce(sp, pol, 200000 + r, cfg, stats, 'blank'); blankN++;
    ruleout += playOnce(sp, pol, 300000 + r, cfg, stats, 'ruleout');
  }
}
eq(oracle, oracleN, 'a reader who knows the species scores 6 of 6 on every check');
ok(Math.abs(blank / blankN - 2) < 0.15, `a reader who knows nothing averages 2 of 6 (got ${(blank / blankN).toFixed(3)} over ${blankN} checks)`);
ok(Math.abs(ruleout / blankN - 2) < 0.15, `a reader who only rules out what it did also averages 2 of 6 (got ${(ruleout / blankN).toFixed(3)})`);
eq(stats.seenFoils || 0, 0, 'in a 40-act day every wrong picture is a scene the visitor did not see');
for (let r = 0; r < 50; r++) for (const [name, day] of [['random', dayRandom], ['contrastive', dayContrastive]]) {
  const seq = day(60, mulberry32(seedOf('test-policy', name, r)));
  let held = null, legal = true, one = true;
  const last = {};
  for (const si of seq) {
    const s = SCENES[si];
    if (s.act === 'lift') { if (held !== null) legal = false; held = s.obj; }
    else { if (held !== s.obj) legal = false; if (s.act !== 'hold') held = null; }
    if (name === 'contrastive' && last[s.act]) { const L = last[s.act]; if ((L.obj !== s.obj ? 1 : 0) + (L.place !== s.place ? 1 : 0) !== 1) one = false; }
    last[s.act] = s;
  }
  ok(legal, `${name} policy keeps to one hand`);
  ok(one, `${name} policy changes exactly one element`);
}

/* ---------------- rings ---------------- */
for (const sp of species) {
  let signs = 0, total = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const spec = ringSpec(sp, i);
    const ring = sp.rings[i];
    for (const [role, field] of [['agent', 'agent'], ['pred', 'pred'], ['patient', 'patient'], ['recipient', 'recip']]) {
      const cells = spec.cells.filter((c) => c.role === role);
      if (!ring[field]) { eq(cells.length, 0, `scene ${i}: no ${role} sector`); continue; }
      eq(cells.map((c) => (c.trit < 0 ? '-' : c.trit > 0 ? '+' : '0')).join(''), ring[field], `species ${sp.seed} scene ${i}: the ${role} sector is written with its radical`);
      for (const c of cells) { // the solved curve swells, lies flat or dips where the radical says
        const r = ringR(spec.r, c.theta);
        total++;
        if ((c.trit > 0 && r > 1.03) || (c.trit < 0 && r < 0.97) || (c.trit === 0 && Math.abs(r - 1) < 0.03)) signs++;
      }
    }
  }
  ok(signs / total > 0.995, `species ${sp.seed}: the solved ring follows its cells (${signs} of ${total})`);
}
{
  const sp = species[0];
  const i = sceneOf('give', 'cube', 'near');
  const spec = ringSpec(sp, i);
  const all = { x0: -2, y0: -2, x1: 2, y1: 2 };
  eq(recognise(spec, all, 0).roles.slice().sort().join(), 'agent,patient,pred,recipient', 'a crop of the whole ring keeps all four radicals');
  eq(recognise(spec, all, INK.ERODE_MAX).roles.length, 0, 'a crop cut after the ink has gone keeps nothing');
  eq(recognise(spec, { x0: 0.5, y0: -0.6, x1: 2, y1: 0.6 }, 0).roles.join(), 'patient', 'a crop of the east side keeps the thing');
  eq(recognise(spec, { x0: -0.6, y0: -2, x1: 0.6, y1: -0.5 }, 0).roles.join(), 'pred', 'a crop of the crown keeps the act');
  eq(recognise(spec, { x0: -2, y0: -0.6, x1: -0.5, y1: 0.6 }, 0).roles.join(), 'agent', 'a crop of the west side keeps who acts');
  // the pressed sector outlasts the others
  const pressed = ringSpec(sp, i, 'patient');
  const w = (s, role) => Math.min(...cellInk(s).filter((c) => c.role === role).map((c) => c.w));
  ok(w(pressed, 'patient') > 1.4 * w(spec, 'patient'), 'the pressed sector is heavier than the same sector unpressed');
  let last = null;
  for (let e = 0; e <= INK.ERODE_MAX; e += 0.001) { const r = recognise(pressed, all, e).roles; if (r.length) last = r; }
  eq(last.join(), 'patient', 'the pressed sector is the last radical a crop can keep');
  const solo = soloSpec(sp, sp.rings[i].ids.patient);
  eq(recognise(solo, all, 0).roles.join(), 'pred,patient', 'a solo ring has a crown and one sector');
  ok(solo.cells.filter((c) => c.role === 'pred').every((c) => c.trit === 0), 'a solo ring of a thing leaves the crown flat');
}

/* ---------------- a day ---------------- */
{
  const sp = splitting('you');
  const st = newDay(sp.target, sp.seed, 7);
  eq(st.plates.near.filter(Boolean).length + st.plates.far.filter(Boolean).length, 6, 'six things on the two plates');
  eq(OBJ.filter((o) => whereIs(st, o)).length, 6, 'each thing once');
  const a = st.plates.near.find(Boolean), b = st.plates.far.find(Boolean);
  ok(doAct(st, sp, 'hold', { place: 'near' }) === null, 'nothing to hold with an empty hand');
  const r1 = doAct(st, sp, 'lift', { obj: a });
  eq(r1.scene, sceneOf('lift', a, 'near'), 'lifting from the near plate is a near lift');
  ok(doAct(st, sp, 'lift', { obj: b }) === null, 'one hand: no second lift');
  eq(doAct(st, sp, 'hold', { place: 'far' }).scene, sceneOf('hold', a, 'far'), 'held over the far plate');
  eq(doAct(st, sp, 'putdown', { place: 'far', slot: 0 }).scene, sceneOf('putdown', a, 'far'), 'put down far');
  eq(whereIs(st, a).place, 'far', 'the thing is where it was put');
  doAct(st, sp, 'lift', { obj: b });
  eq(doAct(st, sp, 'give', {}).scene, sceneOf('give', b, 'near'), 'a thing is given at the glass');
  eq(whereIs(st, b).place, 'near', 'a given thing comes back to the plate at the glass');
  eq(st.held, null, 'the hand is empty after a give');
  eq(st.acts.length, 5, 'five acts, five rings');
  ok(st.acts.every((x) => ['patient', 'pred', 'agent', 'recipient'].includes(x.emph)), 'every ring presses on one sector');
  eq(st.acts[0].emph, 'patient', 'the first ring presses on the thing');

  // the notebook
  const full = { x0: -2, y0: -2, x1: 2, y1: 2 };
  const spec0 = ringSpec(sp, st.acts[0].scene, st.acts[0].emph);
  const east = recognise(spec0, { x0: 0.5, y0: -0.6, x1: 2, y1: 0.6 }, 0);
  const e1 = addCrop(st, sp, 0, { x0: 0.5, y0: -0.6, x1: 2, y1: 0.6 }, 0, east.roles, east.cells);
  ok(e1.fresh && e1.entry.tokens.length === 1, 'a crop of one sector is one radical in the notebook');
  const west = recognise(spec0, { x0: -2, y0: -0.6, x1: -0.5, y1: 0.6 }, 0);
  const e2 = addCrop(st, sp, 0, { x0: -2, y0: -0.6, x1: -0.5, y1: 0.6 }, 0, west.roles, west.cells);
  const again = addCrop(st, sp, 0, { x0: 0.5, y0: -0.6, x1: 2, y1: 0.6 }, 0, east.roles, east.cells);
  ok(!again.fresh && st.entries.length === 2, 'the same radical cropped twice is one entry');
  for (let k = 0; k < 50; k++) addCrop(st, sp, 0, { x0: 0.5, y0: -0.6, x1: 2, y1: 0.6 }, 0, east.roles, east.cells);
  eq(st.crops.length, 2, 'a crop of a radical already kept is not stored a second time');
  const better = addCrop(st, sp, 0, { x0: 0.4, y0: -0.7, x1: 2, y1: 0.7 }, 0, east.roles, east.cells + 1);
  ok(!better.fresh && st.crops.length === 2 && st.crops.some((c) => c.id === better.entry.crop), 'a crop with more ink replaces the kept one');
  const scrap = addCrop(st, sp, 0, full, INK.ERODE_MAX - 0.02, [], 2);
  ok(scrap.entry.tokens.length === 0, 'a crop that kept no whole radical is a scrap');
  ok(addCrop(st, sp, 0, full, 0, [], 0) === null, 'a crop of no ink is nothing');
  // a crop of the greeting: its last radical is the being's word for the visitor, and it gathers the day's scenes
  const gspec = ringSpec(sp, GREETING);
  const south = recognise(gspec, sectorRect(gspec, 'recipient'), 0);
  const eg = addCrop(st, sp, GREETING, sectorRect(gspec, 'recipient'), 0, south.roles, south.cells);
  eq(eg.entry.tokens.join(), sp.greeting.recip, 'the south of the greeting is the word for a visitor with an empty hand');
  ok(entryActs(st, sp, eg.entry).length > 0 && entryActs(st, sp, eg.entry).every((i) => SCENES[st.acts[i].scene].act === 'lift'), 'that radical then lists the scenes where the visitor took something');
  const crown = recognise(gspec, sectorRect(gspec, 'pred'), 0);
  const ef = addCrop(st, sp, GREETING, sectorRect(gspec, 'pred'), 0, crown.roles, crown.cells);
  eq(entryActs(st, sp, ef.entry).length, 0, 'the crown of the greeting appears in no ring about the tray');
  const solo = addSolo(st, sp, sp.rings[st.acts[0].scene].ids.pred);
  ok(solo.fresh && solo.entry.tokens.length === 1 && !addSolo(st, sp, sp.rings[st.acts[0].scene].ids.pred).fresh, 'a read-back radical is kept once');
  ok(entryActs(st, sp, e1.entry).includes(0), 'an entry lists the act it was cut from');
  eq(entryScenes(st, sp, e1.entry).reduce((n, s) => n + s.n, 0), entryActs(st, sp, e1.entry).length, 'scene counts add up to the acts');
  ok(whereIs(st, null) === null && doAct(st, sp, 'lift', { obj: null }) === null && st.held === null, 'taking nothing is refused and leaves the hand empty');
  // who acts and the thing lifted first: bracketed until an act tells them apart
  const st2 = newDay(sp.target, sp.seed, 7);
  const x = st2.plates.near.find(Boolean);
  doAct(st2, sp, 'lift', { obj: x });
  const s0 = ringSpec(sp, st2.acts[0].scene, st2.acts[0].emph);
  for (const rect of [{ x0: 0.5, y0: -0.6, x1: 2, y1: 0.6 }, { x0: -2, y0: -0.6, x1: -0.5, y1: 0.6 }]) { const k = recognise(s0, rect, 0); addCrop(st2, sp, 0, rect, 0, k.roles, k.cells); }
  eq(brackets(st2, sp).length, 1, 'after one act, two radicals of its ring are bracketed');
  doAct(st2, sp, 'putdown', { place: 'far' });
  const y = st2.plates.near.find(Boolean);
  doAct(st2, sp, 'lift', { obj: y });
  eq(brackets(st2, sp).length, 0, 'lifting a different thing tells the thing from who lifts');
  setGuess(st2, st2.entries[0].key, 'x'.repeat(200));
  eq(st2.entries[0].guess.length, DAY.GUESS_MAX, 'a guess is cut to its limit');
  ok(JSON.stringify(brackets(st2, sp)) === JSON.stringify(brackets(JSON.parse(JSON.stringify(st2)), sp)), 'the notebook never reads the guess, and survives storage');
}

/* ---------------- the being's reading of a mark ---------------- */
{
  const L = new MarkLearner();
  // "a" is in every ring; "b" is in the rings where the mark is raised and in no other
  L.see(['party:a', 'act:x', 'obj:b']); L.raise('blip', ['party:a', 'act:x', 'obj:b']);
  L.see(['party:a', 'act:y', 'obj:c']);
  L.see(['party:a', 'act:y', 'obj:b']); L.raise('blip', ['party:a', 'act:y', 'obj:b']);
  L.see(['party:a', 'act:x', 'obj:c']);
  eq(L.reading('blip').id, 'obj:b', 'a mark is read as the concept present with it and absent without it');
  ok(Math.abs(L.reading('blip').dp - 1) < 1e-12, 'its contingency is 1');
  ok(L.ranked('blip').find((r) => r.id === 'party:a').dp === 0, 'a concept in every ring has contingency 0');
  eq(L.mostRepeated(), 'blip', 'the most repeated mark');
  // a tie in contingency goes to the rarer concept, whatever the rounding of 1 - 2/6 against 2/3
  const T = new MarkLearner();
  for (let i = 0; i < 2; i++) { T.see(['obj:rare', 'act:common']); T.raise('m', ['obj:rare', 'act:common']); }
  T.see(['obj:rare', 'act:common']); T.raise('m', ['obj:rare', 'act:common']);
  for (let i = 0; i < 6; i++) T.see(i < 2 ? ['act:common', 'obj:z'] : ['obj:z']);
  const tied = T.ranked('m');
  ok(Math.abs(tied[0].dp - tied[1].dp) > 1e-9 || tied[0].base <= tied[1].base, 'between two concepts of equal contingency the rarer one is read');
  eq(new MarkLearner().mostRepeated(), null, 'no mark raised twice, no read-back');

  // the misreading the concept predicts: a word for a thing, raised only while lifting it from both plates,
  // in a species that splits that thing by place, is bound to something other than the thing
  const sp = splitting('bowl');
  const st = newDay(sp.target, sp.seed, 3);
  const plate = whereIs(st, 'bowl').place;
  doAct(st, sp, 'lift', { obj: 'bowl' }); raiseMark(st, ' Bowl ');
  doAct(st, sp, 'putdown', { place: plate === 'near' ? 'far' : 'near' });
  doAct(st, sp, 'lift', { obj: 'bowl' }); raiseMark(st, 'bowl');
  ok(raiseMark(st, 'BOWL') === null, 'a mark counts once per ring');
  doAct(st, sp, 'putdown', { place: plate });
  const other = OBJ.find((o) => o !== 'bowl' && whereIs(st, o));
  doAct(st, sp, 'lift', { obj: other });
  const read = learnerOf(st, sp).reading('bowl');
  ok(!read.id.startsWith('obj:'), `the being reads "bowl" as ${read.id}, which is no thing: its two words for the bowl split the count`);
}

/* ---------------- the evening ---------------- */
{
  const sp = species[2];
  const st = newDay(sp.target, sp.seed, 11);
  const rng = mulberry32(5);
  ok(!canEnd(st), 'a day cannot end before it starts');
  doAct(st, sp, 'lift', { obj: OBJ.find((o) => whereIs(st, o)) });
  ok(!endDay(st, sp) && st.phase === 'day', `a day cannot end before ${DAY.MIN_ACTS} rings`);
  carry(st, 'far');
  eq(st.held.over, 'far', 'the hand can move over the other plate without an act');
  eq(st.acts.length, 1, 'and no ring is written for it');
  while (st.acts.length < DAY.ACTS) {
    if (!st.held) { const on = OBJ.filter((o) => whereIs(st, o)); doAct(st, sp, 'lift', { obj: on[Math.floor(rng() * on.length)] }); }
    else { const k = ['hold', 'putdown', 'give'][Math.floor(rng() * 3)]; doAct(st, sp, k, { place: rng() < 0.5 ? 'near' : 'far' }); }
    if (st.acts.length % 5 === 0) raiseMark(st, 'tick');
  }
  ok(doAct(st, sp, st.held ? 'hold' : 'lift', { obj: OBJ.find((o) => whereIs(st, o)), place: 'near' }) === null, 'the day holds 40 acts and no more');
  if (!st.held) doAct(st, sp, 'lift', { obj: OBJ.find((o) => whereIs(st, o)) });
  const inHand = st.held ? st.held.obj : null;
  ok(endDay(st, sp), 'the day ends');
  eq(st.phase, 'evening', 'evening');
  ok(st.held === null && OBJ.every((o) => whereIs(st, o)), `a thing still in the hand at the end of the day (${inHand}) is back on a plate`);
  ok(st.readback && st.readback.mark === 'tick', 'the most repeated mark is read back');
  eq(st.check.items.length, 6, 'six rings in the check');
  const { seen } = (() => { const s = new Array(42).fill(0); st.acts.forEach((a) => s[a.scene]++); return { seen: s }; })();
  for (const it of st.check.items) {
    eq(it.options.length, 3, 'three pictured scenes');
    ok(it.options.includes(it.target), 'one of them is the ring\'s own');
    eq(new Set(it.options.map((o) => sp.rings[o].key)).size, 3, 'their three rings differ');
    ok(seen[it.target] === 0 || st.check.fallbacks > 0, 'a check ring is about a scene the visitor did not see');
    ok(it.options.every((o) => seen[o] === 0) || st.check.fallbacks > 0, 'and neither wrong picture is a scene the visitor saw');
  }
  ok(!answer(st, 1, st.check.items[1].target), 'answers go in order');
  ok(!answer(st, 0, -1), 'an answer must be one of the three');
  st.check.items.forEach((it, i) => answer(st, i, i < 4 ? it.target : it.options.find((o) => o !== it.target)));
  eq(st.phase, 'done', 'the check ends the day');
  eq(score(st), 4, 'the score counts the rings matched to their own scene');
  ok(validDay(JSON.parse(JSON.stringify(st))), 'a finished day is a valid record');
  ok(!validDay({ v: 1 }) && !validDay(null) && !validDay({ ...JSON.parse(JSON.stringify(st)), acts: [{ scene: 99 }] }), 'a damaged record is refused');
  // records an independent review built to pass the first validation and then break the page
  const copy = () => JSON.parse(JSON.stringify(st));
  const bad = {
    'a check with no rings': (r) => { r.phase = 'evening'; r.check.items = []; r.check.answers = []; },
    'an evening with every ring answered': (r) => { r.phase = 'evening'; },
    'a done day with rings unanswered': (r) => { r.check.answers.pop(); },
    'a read-back of a concept the species does not have': (r) => { r.readback.id = 'obj:unicorn'; },
    'a check ring about scene 99': (r) => { r.check.items[0].target = 99; },
    'a pictured scene 99': (r) => { r.check.items[0].options[0] = 99; },
    'a check ring without pictures': (r) => { delete r.check.items[0].options; },
    'an answer that was not offered': (r) => { r.check.answers[0] = r.check.items[0].options[0] === 0 ? 41 : 0; r.check.items[0].options = r.check.items[0].options.filter((o) => o !== r.check.answers[0]).concat(r.check.items[0].target).slice(0, 3); },
    'an empty notebook entry': (r) => { r.entries.push({}); },
    'an entry whose radicals are a string': (r) => { r.entries.push({ key: 'x', tokens: '+0-0+-', crop: r.crops[0]?.id ?? 1, cells: 6, guess: '' }); },
    'an entry pointing at no crop': (r) => { r.entries.push({ key: 'y', tokens: ['+0-0+-'], crop: 987654, cells: 6, guess: '' }); },
    'a mark that is null': (r) => { r.marks.push(null); },
    'a crop cut from act 99': (r) => { r.crops.push({ id: 5000, act: 99, rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, erode: 0, roles: [], cells: 1 }); },
    'a thing on two plates': (r) => { r.plates.far[0] = r.plates.near.find(Boolean) || r.plates.far.find(Boolean); r.plates.far[1] = r.plates.far[0]; },
    'a seventh kind of thing': (r) => { r.plates.near[r.plates.near.findIndex(Boolean)] = 'anvil'; },
    'more rings than a day holds': (r) => { for (let k = 0; k < 5; k++) r.acts.push({ scene: 0, emph: 'pred' }); },
    'a guess longer than the line': (r) => { if (r.entries[0]) r.entries[0].guess = 'x'.repeat(DAY.GUESS_MAX + 1); else r.entries.push({ key: 'z', tokens: [], crop: -1, cells: 1, guess: 'x'.repeat(DAY.GUESS_MAX + 1) }); },
  };
  for (const [name, breakIt] of Object.entries(bad)) { const r = copy(); breakIt(r); ok(!validDay(r, sp), `a stored record with ${name} is refused`); }
  ok(validDay(copy(), sp), 'the record itself, unbroken, is still accepted with the species at hand');
  const fresh = checkItems(sp, new Array(42).fill(1), new Array(42).fill(0), mulberry32(1));
  eq(fresh.fallbacks, 18, 'when every scene was seen, six rings and their twelve wrong pictures are the least seen, and the page says so');
}

/* ---------------- the selection, on demand ---------------- */
if (process.argv.includes('--sweep')) {
  const rows = [];
  for (const a of [0.25, 0.5, 0.75, 1]) for (let s = 0; s < 20; s++) {
    const sp = makeSpecies(a, s);
    const share = {};
    for (const pol of ['random', 'contrastive']) {
      const hist = new Array(7).fill(0);
      for (let r = 0; r < 201; r++) hist[playOnce(sp, pol, r, PROXY, stats)]++;
      share[pol] = classify(hist);
    }
    rows.push({ a, s, low: Math.min(share.random.band, share.contrastive.band), inBand: [share.random.inBand, share.contrastive.inBand] });
  }
  const cells = rows.reduce((n, r) => n + r.inBand.filter(Boolean).length, 0);
  eq(cells, 144, 'cells in band of 160 (80 species, two policies)');
  const top = rows.slice().sort((p, q) => q.low - p.low || p.a - q.a || p.s - q.s).slice(0, 3).map((r) => `${r.a}/${r.s}`).join(' ');
  eq(top, GATE_SPECIES.map(([a, s]) => `${a}/${s}`).join(' '), 'the three species with the highest lower in-band share');
}

if (fails.length) { console.log(`pod tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`pod tests: ${passed} passed, 0 failed`);
