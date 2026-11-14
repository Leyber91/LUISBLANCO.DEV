#!/usr/bin/env node
/* ============================================================
   dataspace/tests.mjs — the measuring core's tests, in Node.

     node labs/assets/js/dataspace/tests.mjs                 run every check
     node labs/assets/js/dataspace/tests.mjs --write-snapshot  re-derive measures.snapshot.json

   Checks: the GPT-2 tokenizer against reference counts and tokens from
   the Hugging Face tokenizers library; the two-part bit code; DEFLATE
   on a fixed string; the LCS alignment; number, date and entity
   extraction and survival; the PPM model on alice29.txt; the bundled
   compressor references; the run files' schema; and the recorded runs
   re-scored against the stored snapshot (identical numbers).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BPE } from './bpe.js';
import { PPM } from './ppm.js';
import * as M from './measures.js';
import { PRESETS, LEVELS, LAB } from './config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../../data/dataspace');
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} (tol ${tol})`);

/* ---------- tokenizer: reference = Hugging Face tokenizers 0.22.2, openai-community/gpt2, 2026-11-11 ---------- */
const bpe = new BPE(fs.readFileSync(path.join(DATA, 'gpt2-merges.txt'), 'utf8'));
ok(bpe.size === 50000, 'GPT-2 merges: 50,000 ranks');
const REF = [
  { text: "Hello world! It's 02:15 and the replica lags 41 s.", count: 16,
    head: ['Hello', 'Ġworld', '!', 'ĠIt', "'s", 'Ġ02', ':', '15'] },
  { text: 'USER: I keep restarting the same AI project under different names — DATASPACE, Ouroboros, the AEA. Why?', count: 31,
    head: ['USER', ':', 'ĠI', 'Ġkeep', 'Ġrestart', 'ing', 'Ġthe', 'Ġsame'] },
  { text: "  Café crème costs €3.50;   don't   panic\n\n\tpg_repack --no-order", count: 28,
    head: ['Ġ', 'ĠCafÃ©', 'Ġcr', 'Ã¨', 'me', 'Ġcosts', 'ĠâĤ¬', '3'] },
  { text: '1,240 euros + 860 euros = 2,100 euros?? (yes)  \u{1F600} not used', count: 22,
    head: ['1', ',', '240', 'Ġeuros', 'Ġ+', 'Ġ8', '60', 'Ġeuros'] },
];
for (const r of REF) {
  const t = bpe.encode(r.text);
  ok(t.length === r.count, `BPE count for ${JSON.stringify(r.text.slice(0, 24))}: ${t.length} vs ${r.count}`);
  ok(JSON.stringify(t.slice(0, 8).map((x) => x.s)) === JSON.stringify(r.head), `BPE tokens for ${JSON.stringify(r.text.slice(0, 24))}`);
  if (!/[\u{10000}-\u{10FFFF}]/u.test(r.text)) ok(t.map((x) => x.t).join('') === r.text, 'BPE decodes back to the text');
}

/* ---------- bits ---------- */
const tok = (s) => bpe.encode(s);
{
  const b = M.twoPartBits(tok('a a a b'));
  // tokens: 'a', ' a', ' a', ' b' -> counts a:1, ' a':2, ' b':1; n=4
  const data = -Math.log2(1 / 4) - 2 * Math.log2(2 / 4) - Math.log2(1 / 4);
  near(b.data, data, 1e-9, 'zeroth-order bits of "a a a b"');
  const vocab = (8 * 2 + 1) + (8 * 3 + 3) + (8 * 3 + 1); // 'a' (1 byte), 'Ġa' (2 bytes, gamma(2)=3), 'Ġb' (2 bytes)
  near(b.vocab, vocab, 1e-9, 'vocabulary bits of "a a a b"');
  near(b.total, data + vocab + 5, 1e-9, 'two-part total = data + vocabulary + gamma(types + 1), gamma(4) = 5 bits');
  near([...b.per].reduce((x, y) => x + y, 0) + b.header, b.total, 1e-6, 'per-token bits sum to the total');
}
const origin = PRESETS.find((p) => p.id === 'origin').text;
{
  const b = M.twoPartBits(tok(origin));
  near(b.total, 5838.860133, 1e-3, 'origin sample: two-part bits');
  const fb = await M.deflateBits(new TextEncoder().encode(origin));
  ok(fb === 3064, `origin sample: DEFLATE bits (Node zlib, default level) ${fb} vs 3064`);
  ok(fb <= b.total, 'the lossless floor prints at or below the source figure on the default sample');
}

/* ---------- LCS ---------- */
{
  const a = tok('the cat sat on the mat'), r = tok('a cat sat on a mat today');
  const al = M.align(a, r);
  ok(al.kept === 4 && al.N === 6 && al.M === 7, `LCS kept 4 of 6, rebuild 7 tokens: got ${al.kept}/${al.N}/${al.M}`);
  near(al.fidelity, 4 / 6, 1e-12, 'LCS fidelity');
  ok(al.invented === 3 && al.dropped === 2, 'LCS dropped 2, invented 3');
  ok(al.ops.map((o) => o.op[0]).join('') === 'adkkkadka', `LCS op order: ${al.ops.map((o) => o.op[0]).join('')}`);
}

/* ---------- numbers, dates, entities ---------- */
{
  const n = M.extractNumbers('Feb 2023, 14 to 18 March, the 15th, at 02:15, 1,240 euros, 40s, 30 GB, two years, 15th floor');
  const keys = n.map(M.unitKey);
  for (const k of ['date:/2/2023', 'date:14/3/', 'date:18/3/', 'date:15//', 'time:02:15', 'num:1240 eur', 'num:40 s', 'num:30 GB', 'num:2 year'])
    ok(keys.includes(k), `number extraction finds ${k} (got ${keys.join(', ')})`);
  const rows = M.survival(M.extractNumbers('DATASPACE was the first, Feb 2023.'), 'It was first, in 2023.', M.extractNumbers('It was first, in 2023.'));
  ok(rows.length === 1 && rows[0].status === 'altered', "'Feb 2023' read back as '2023' is altered");
  const r2 = M.survival(M.extractNumbers('It costs 1,240 euros.'), 'It costs 1240 EUR.', M.extractNumbers('It costs 1240 EUR.'));
  ok(r2[0].status === 'survived', '1,240 euros survives as 1240 EUR');
  const isCommon = (w) => bpe.count(' ' + w) === 1;
  const e = M.extractEntities('USER: Marco paid the flat in Lisbon. Check pg_repack --no-order on the WAL. Identity matters.', isCommon);
  const ek = e.map((x) => x.rule + ':' + x.text);
  for (const k of ['E2:Marco', 'E1:Lisbon', 'E4:pg_repack', 'E4:--no-order', 'E3:WAL'])
    ok(ek.includes(k), `entity rule finds ${k} (got ${ek.join(', ')})`);
  ok(!ek.some((k) => /Check|Identity|USER/.test(k)), 'common sentence-initial words and speaker labels are not entities');
  const t = M.parseTurns('USER: a\nASSISTANT: b\n**User:** c\nnote: d');
  ok(t.map((x) => x.speaker).join() === 'USER,ASSISTANT,USER', 'turn parsing');
}

/* ---------- PPM on the reference corpus ---------- */
const alice = fs.readFileSync(path.join(DATA, 'alice29.txt'));
ok(alice.length === 152089, `alice29.txt is 152,089 bytes (got ${alice.length}; check line endings)`);
ok(crypto.createHash('sha256').update(alice).digest('hex').startsWith('7467306ee0feed49'), 'alice29.txt sha256');
{
  const ppm = new PPM(4);
  const bits = ppm.prime(alice);
  near(bits / alice.length, 2.2028, 0.0005, 'PPM-C order 4 on alice29.txt, bits per character');
  const x = new TextEncoder().encode(origin);
  const a = ppm.measure(x), b = ppm.measure(x);
  ok(a.bits === b.bits, 'PPM measure rolls back: two measurements agree');
}

/* ---------- compressor references (labs/assets/data/dataspace/reference.json) ---------- */
{
  const ref = JSON.parse(fs.readFileSync(path.join(DATA, 'reference.json'), 'utf8'));
  const gz = zlib.deflateRawSync(alice, { level: 6 }).length;
  const br = zlib.brotliCompressSync(alice, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 } }).length;
  const rg = ref.tools.find((t) => t.id === 'deflate'), rb = ref.tools.find((t) => t.id === 'brotli');
  ok(Math.abs(gz - rg.bytes) / rg.bytes < 0.05, `Node zlib level 6 within 5% of ${rg.command}: ${gz} vs ${rg.bytes}`);
  ok(Math.abs(br - rb.bytes) / rb.bytes < 0.05, `Node brotli q11 within 5% of ${rb.command}: ${br} vs ${rb.bytes}`);
}

/* ---------- run files: schema, provenance, and re-scoring against the snapshot ---------- */
const isCommon = (w) => bpe.count(' ' + w) === 1;
const ctx = { tokenize: tok, isCommon };
const snapFile = path.join(DATA, 'measures.snapshot.json');
const priors = fs.existsSync(path.join(DATA, 'priors.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'priors.json'), 'utf8')).priors : [];
const fresh = {};
let runCount = 0;
for (const p of PRESETS) {
  const f = path.join(DATA, `runs-${p.id}.json`);
  if (!fs.existsSync(f)) { ok(false, `run file ${path.basename(f)} exists`); continue; }
  const file = JSON.parse(fs.readFileSync(f, 'utf8'));
  ok(file.schema === LAB.runSchema, `${path.basename(f)} schema ${file.schema}`);
  for (const r of file.runs) {
    runCount++;
    const pv = r.provenance || {};
    ok(pv.model && pv.date && pv.route && pv.promptVersion && pv.seed != null && r.level >= 1 && r.level <= LEVELS.length,
      `${r.id}: provenance has model, date, route, prompt version, seed and strength`);
    ok(file.calls[pv.compressCall] && file.calls[pv.rebuildCall], `${r.id}: both calls are stored verbatim`);
    ok(file.calls[pv.rebuildCall]?.raw === r.rebuild, `${r.id}: the rebuild is the verbatim reply`);
    const prior = priors.find((x) => x.model === pv.model)?.call?.raw ?? null;
    fresh[r.id] = M.snapshot(M.scoreRun({ source: p.text, capsule: r.capsule, rebuild: r.rebuild, prior }, ctx));
  }
}
if (process.argv.includes('--write-snapshot')) {
  fs.writeFileSync(snapFile, JSON.stringify({ note: 'measures.js snapshot of every recorded run; tests.mjs re-derives and compares', runs: fresh }, null, 1) + '\n');
  console.log(`wrote ${snapFile} (${Object.keys(fresh).length} runs)`);
} else if (fs.existsSync(snapFile)) {
  const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8')).runs;
  let same = 0;
  for (const [id, s] of Object.entries(fresh)) {
    const eq = JSON.stringify(s) === JSON.stringify(snap[id]);
    ok(eq, `${id}: re-scored measures equal the snapshot`);
    if (eq) same++;
  }
  console.log(`re-scored ${same} of ${Object.keys(fresh).length} recorded runs: identical`);
}

/* ---------- the run flow, against a stub route ---------- */
{
  const { RunFlow, STATES } = await import('./flow.js');
  const { PROMPTS } = await import('./config.js');
  const mk = ({ route = 'ollama', compress = 'ok', rebuild = 'ok', windowTicks = 0 }) => {
    let ticks = windowTicks;
    const calls = [];
    return {
      calls,
      status: () => ({ route, model: 'stub-model', label: 'stub' }),
      publicReadyIn: () => (ticks > 0 ? ticks-- : 0),
      async complete(req) {
        calls.push(req);
        const isCompress = req.json;
        const mode = isCompress ? compress : rebuild;
        if (mode === 'offline') { const fb = await req.fallback(req); return { text: typeof fb === 'string' ? fb : JSON.stringify(fb), json: typeof fb === 'string' ? null : fb, source: 'offline', model: 'deterministic', ms: 1, errors: ['stub: down'] }; }
        if (isCompress) return { text: '{"L1":"a b c","L2":"a b"}', json: { L1: 'a b c', L2: 'a b' }, source: route, model: 'stub-model', ms: 900, errors: [] };
        return { text: 'USER: a b c', json: null, source: route, model: 'stub-model', ms: 900, errors: [] };
      },
    };
  };
  const engine = { capsule: (s, w) => s.split(/\s+/).slice(0, w).join(' ') };
  const run = async (opts) => {
    const llm = mk(opts); const states = []; const runs = [];
    const f = new RunFlow({ llm, engine, onState: (s) => states.push(s), onRun: (r) => runs.push(r) });
    await f.collapse({ source: 'USER: one two three four five six seven eight nine ten', levels: [1, 2], repeats: 1 });
    return { llm, states, runs };
  };
  ok(STATES.join() === 'idle,compressing,waiting,reconstructing,scored,failed', 'flow states listed in one place');
  const a = await run({});
  ok(a.llm.calls.length === 3, `flow: one compress call for two levels, then one rebuild each (${a.llm.calls.length} calls)`);
  ok(a.runs.every((r) => r.status === 'scored' && r.kind === 'live'), 'flow: both runs scored live');
  ok(a.llm.calls.slice(1).every((c) => c.prompt === PROMPTS.rebuildUser(c.prompt.slice('CAPSULE:\n'.length)) && !c.prompt.includes('one two three')), 'flow: a rebuild payload holds the capsule and nothing else');
  ok(new Set(a.llm.calls.map((c) => c.seed)).size === 1 && a.llm.calls[0].seed > 0, 'flow: a per-run seed reaches every call');
  const b = await run({ route: 'pollinations', windowTicks: 2 });
  ok(b.states.includes('waiting') && b.states.indexOf('waiting') < b.states.lastIndexOf('reconstructing'), 'flow: on the public route it waits in the open before a call');
  const c = await run({ compress: 'offline' });
  ok(c.runs.length === 2 && c.runs.every((r) => r.kind === 'engine' && r.rebuild === null) && c.llm.calls.length === 1, 'flow: no route -> engine capsules, labelled, and no rebuild claimed');
  const d = await run({ rebuild: 'offline' });
  ok(d.runs.every((r) => r.status === 'partial' && r.capsule && r.rebuild === null), 'flow: a failed rebuild keeps the live capsule and says the rebuild did not run');
}

console.log(`dataspace tests: ${checks - fails} of ${checks} checks pass, ${runCount} recorded runs`);
process.exit(fails ? 1 : 0);
