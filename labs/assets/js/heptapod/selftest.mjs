/* ============================================================
   heptapod/selftest.mjs — the codec's headless test.

     node labs/assets/js/heptapod/selftest.mjs

   1. English round trip: for 3,000 random graphs g, parse(realise(g)) = g.
   2. Paraphrases draw one semagram: active / passive, fronted clause,
      dative shift give equal graphs.
   3. Pixel round trip: every page example and 150 random graphs are
      inked on the 1400 x 840 raster and read back exactly.
   4. The model route fails safe: with llm.js stubbed to fail, to time
      out and to return schema-invalid JSON, the engine's parse is the
      graph that gets drawn.
   Exits 1 on any failure.
   ============================================================ */

import { parse, realize, randomGraph, graphEqual, diffGraphs } from './grammar.js';
import { graphSpec } from './geometry.js';
import { inkPage, readPage, Raster } from './codec.js';
import { PRESETS, COMPOSE_PRESETS } from './config.js';
import { graphFromModel } from './model.js';
import { lexiconStats } from './lexicon.js';

let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL ' + msg); };
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// 1. English round trip
{
  const rnd = lcg(7);
  let bad = 0;
  for (let i = 0; i < 3000; i++) {
    const g = randomGraph(rnd);
    const r = parse(realize(g));
    if (!r.graph || !graphEqual(g, r.graph)) { bad++; if (bad < 4) fail('english round trip: ' + realize(g)); }
  }
  console.log(`english round trip: ${3000 - bad} / 3000`);
}

// 2. paraphrases
{
  const pairs = [
    ['The visitors gave us a language.', 'A language was given to us by the visitors.'],
    ['The visitors gave us a language.', 'The visitors gave a language to us.'],
    ['The visitors gave us a language because they knew the future.', 'Because they knew the future, the visitors gave us a language.'],
    ['Did the soldiers destroy the ship?', 'Was the ship destroyed by the soldiers?'],
  ];
  let ok = 0;
  for (const [a, b] of pairs) {
    const A = parse(a).graph, B = parse(b).graph;
    if (A && B && graphEqual(A, B)) ok++; else fail(`paraphrase: "${a}" vs "${b}"`);
  }
  console.log(`paraphrases drawing one semagram: ${ok} / ${pairs.length}`);
}

// 3. pixel round trip
{
  const rs = new Raster();
  const cases = [...PRESETS.map((s) => parse(s).graph)];
  for (const c of COMPOSE_PRESETS) {
    const a = parse(c.a).graph, b = parse(c.b).graph;
    cases.push({ type: 'rel', rel: c.rel, a, b });
  }
  const rnd = lcg(11);
  for (let i = 0; i < 150; i++) cases.push(randomGraph(rnd));
  let ok = 0;
  const t0 = Date.now();
  cases.forEach((g, i) => {
    if (!g) { fail('an example did not parse'); return; }
    inkPage(graphSpec(g), 0, i + 1, rs);
    const d = diffGraphs(g, readPage(rs).graph);
    if (!d.diffs.length) ok++; else fail(`pixel round trip: ${realize(g)} ${JSON.stringify(d.diffs)}`);
  });
  console.log(`pixel round trip: ${ok} / ${cases.length} (${Math.round((Date.now() - t0) / cases.length)} ms each)`);
}

// 4. the model route fails safe
{
  const text = 'The visitors gave us a language.';
  const engine = parse(text).graph;
  const viaFallback = { complete: async (req) => ({ source: 'offline', json: await req.fallback(req), errors: ['stub: no route'], ms: 0, model: 'deterministic' }) };
  const timesOut = { complete: async (req) => ({ source: 'offline', json: await req.fallback(req), errors: ['stub: timed out'], ms: 45000, model: 'deterministic' }) };
  const invalid = { complete: async () => ({ source: 'ollama', json: { type: 'prop', pred: 'xyzzy', agent: { c: 'nobody' } }, errors: [], ms: 5, model: 'stub' }) };
  const notJson = { complete: async () => ({ source: 'pollinations', json: 'not an object', errors: [], ms: 5, model: 'stub' }) };
  for (const [name, llm] of [['no route', viaFallback], ['timeout', timesOut], ['schema-invalid JSON', invalid], ['not JSON', notJson]]) {
    const r = await graphFromModel(text, { llm });
    if (r.graph && graphEqual(r.graph, engine)) console.log(`model route, ${name}: the engine's parse is drawn`);
    else fail(`model route, ${name}: got ${r.graph ? realize(r.graph) : 'nothing'}`);
  }
}

console.log('lexicon', JSON.stringify(lexiconStats()));
console.log(failures ? `${failures} FAILURES` : 'all passed');
process.exit(failures ? 1 : 0);
