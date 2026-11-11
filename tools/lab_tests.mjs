#!/usr/bin/env node
/* ============================================================
   tools/lab_tests.mjs — run every lab's own tests.

   A lab ships its tests as labs/assets/js/<lab>/tests.mjs, any
   *.test.mjs, or tests/run.mjs, under labs/assets/js/. Each file runs in Node on its
   own; a non-zero exit, an uncaught error or a run over 120 s fails
   the gate. Labs without tests are listed, not failed.

     node tools/lab_tests.mjs          run them all
     node tools/lab_tests.mjs <lab>    run one lab's tests
   ============================================================ */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'labs', 'assets', 'js');

function findTests(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findTests(p));
    else if (e.name === 'tests.mjs' || e.name.endsWith('.test.mjs') ||
      (e.name === 'run.mjs' && path.basename(dir) === 'tests')) out.push(p);
  }
  return out;
}

const only = process.argv[2];
const files = fs.existsSync(JS) ? findTests(JS).filter((f) => !only || f.includes(path.sep + only + path.sep)) : [];
let fail = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [f], { cwd: path.dirname(f), encoding: 'utf8', timeout: 120000 });
  const ms = Date.now() - t0;
  const ok = r.status === 0 && !r.error;
  if (!ok) fail++;
  const last = ((r.stdout || '') + (r.stderr || '')).trim().split(/\r?\n/).slice(-1)[0] || '';
  console.log(`${ok ? 'pass' : 'FAIL'} ${rel} (${ms} ms) ${last.slice(0, 120)}`);
  if (!ok) console.log(((r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '')).trim().split(/\r?\n/).slice(-20).join('\n'));
}
const labsWithJs = fs.existsSync(JS) ? fs.readdirSync(JS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
const tested = new Set(files.map((f) => path.relative(JS, f).split(path.sep)[0]));
const untested = labsWithJs.filter((d) => !tested.has(d) && !['ai', 'config', 'hub'].includes(d));
console.log(`lab_tests: ${files.length} files, ${fail} failed; no tests yet: ${untested.join(', ') || 'none'}`);
process.exit(fail ? 1 : 0);
