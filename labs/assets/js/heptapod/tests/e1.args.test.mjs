/* ============================================================
   heptapod/tests/e1.args.test.mjs — the E1 test refuses a run that
   would test nothing, and its --merge refuses shard logs that are not
   one whole run (BAR_F G2).

     node labs/assets/js/heptapod/tests/e1.args.test.mjs

   On 2026-11-15 `e1.test.mjs --full --shard 4/4` (shards counted from
   1 by mistake) selected no graph and no tree and exited 0, and the
   full run's totals were added up by hand from four logs. Here:
   1. each malformed argument exits 2 before anything runs, and the
      refusal names its own reason (a case that exits 2 for another
      reason is a failure here);
   2. two real shards of a small run merge into one whole run (exit 0),
      so the fields the test writes are the fields --merge reads;
   3. each check of --merge is broken alone on copies of those logs and
      must fail with its own message: a repeated shard, a missing shard,
      a failed shard, a different seed, sums short of the size, no crop
      wanted, a log from before --merge, a log cut short; and the same
      logs written as UTF-16 with a byte-order mark (a PowerShell
      redirect) still merge.
   Exits 1 on any failure.
   ============================================================ */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E1 = path.join(path.dirname(fileURLToPath(import.meta.url)), 'e1.test.mjs');
const run = (args) => {
  const r = spawnSync(process.execPath, [E1, ...args], { encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
let checks = 0, failures = 0;
const expect = (what, args, code, says) => {
  checks++;
  const r = run(args);
  const ok = r.code === code && (!says || r.out.includes(says));
  if (!ok) {
    failures++;
    console.log(`FAIL ${what}: exit ${r.code} (wanted ${code})${says ? `, output ${r.out.includes(says) ? 'names' : 'does not name'} "${says}"` : ''}`);
    console.log('  ' + r.out.trim().split(/\r?\n/).slice(-3).join('\n  '));
  }
  return r;
};

/* 1. refused before anything runs */
const REFUSED = [
  ['a shard counted from 1', ['--shard', '4/4'], 'shards are counted from 0'],
  ['a shard with no K', ['--shard', '2'], '--shard takes k/K'],
  ['zero shards', ['--shard', '0/0'], 'must be at least 1'],
  ['a negative shard', ['--shard', '-1/4'], '--shard takes k/K'],
  ['two shards at once', ['--shard', '1/4', '--shard', '2/4'], 'given twice'],
  ['a count that is not a number', ['--graphs', 'abc'], 'integer of at least 1'],
  ['zero graphs', ['--graphs', '0'], 'integer of at least 1'],
  ['zero trees', ['--trees', '0'], 'integer of at least 1'],
  ['a fractional count', ['--crops', '2.5'], 'integer of at least 1'],
  ['a misspelt flag', ['--ful'], 'unknown argument'],
  ['a flag with no value', ['--graphs'], 'needs a value'],
  ['more shards than cases', ['--graphs', '3', '--trees', '30', '--shard', '0/4'], 'larger than the 3 cases'],
  ['a merge of nothing', ['--merge'], 'at least 2 shards'],
  ['a merge with run flags', ['--full', '--merge', 'a', 'b'], 'takes only log files'],
];
for (const [what, args, says] of REFUSED) expect(what, args, 2, says);

/* 2. two real shards of a small run */
const dir = mkdtempSync(path.join(tmpdir(), 'e1-merge-'));
const SMALL = ['--graphs', '8', '--trees', '8', '--crops', '8', '--canon-pairs', '40', '--sym-pairs', '20'];
const logs = [0, 1].map((k) => {
  const r = expect(`small shard ${k}/2`, [...SMALL, '--shard', `${k}/2`], 0);
  return r.out;
});
const put = (name, text, enc = 'utf8') => {
  const f = path.join(dir, name);
  writeFileSync(f, enc === 'utf16' ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]) : text);
  return f;
};
const [f0, f1] = [put('s0.log', logs[0]), put('s1.log', logs[1])];
expect('a merge of the two shards', ['--merge', f0, f1], 0, 'one whole run with 0 failures');

/* 3. each check broken alone */
const sumOf = (log) => JSON.parse(log.split(/\r?\n/).find((l) => l.startsWith('E1-SUMMARY ')).slice('E1-SUMMARY '.length));
const write = (name, sum, verdict = 'E1: 0 failures (0.0 s wall, 0.0 s CPU)') => put(name, `E1 header\nE1-SUMMARY ${JSON.stringify(sum)}\n${verdict}\n`);
const S0 = sumOf(logs[0]), S1 = sumOf(logs[1]);
const both = (name, edit) => { const a = structuredClone(S0), b = structuredClone(S1); edit(a, b); return [write(name + '-0.log', a), write(name + '-1.log', b)]; };

expect('a repeated shard', ['--merge', f0, f0], 1, 'shard 0/2 is given 2 times');
expect('a missing shard', ['--merge', ...both('k3', (a, b) => { a.shard.K = 3; b.shard.K = 3; })], 1, 'shard 2/3 is missing');
{
  const b = structuredClone(S1); b.failures = 1;
  expect('a failed shard', ['--merge', f0, write('failed.log', b, 'E1: 1 FAILURES (0.0 s wall, 0.0 s CPU)')], 1, 'failed: E1: 1 FAILURES');
}
{
  const b = structuredClone(S1); b.seed += 1;
  expect('a different seed', ['--merge', f0, write('seed.log', b)], 1, 'differ in seed');
}
expect('sums short of the size', ['--merge', ...both('short', (a, b) => { a.size.graphs = 16; b.size.graphs = 16; })], 1, 'ran 8 graphs of 16');
expect('no crop wanted', ['--merge', ...both('nocrop', (a, b) => { for (const s of [a, b]) { s.cropsWanted = 0; s.crops = 0; s.cropsOk = 0; } })], 1, 'crops: 0 of 0 read right, 0 wanted');
{
  const b = structuredClone(S1); delete b.shard;
  expect('a log from before --merge', ['--merge', f0, write('old.log', b)], 2, 'older than --merge');
}
expect('a log cut short', ['--merge', f0, put('cut.log', logs[1].split(/\r?\n/).filter((l) => !/^E1: /.test(l)).join('\n'))], 2, 'not one complete E1 log');
expect('UTF-16 logs with a byte-order mark', ['--merge', put('u0.log', logs[0], 'utf16'), put('u1.log', logs[1], 'utf16')], 0, 'one whole run with 0 failures');

rmSync(dir, { recursive: true, force: true });
console.log(failures ? `E1 args: ${failures} of ${checks} checks FAILED` : `E1 args: ${checks} of ${checks} checks pass`);
process.exit(failures ? 1 : 0);
