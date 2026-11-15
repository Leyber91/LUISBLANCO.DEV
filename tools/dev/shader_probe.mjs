// Copies of a WebGL engine file whose shader text carries a unique comment, so that a browser builds them cold.
//
// A browser caches built shader programs by their source. To learn what a first-time visitor waits for, the
// source has to differ from anything the browser has built. This writes one copy per version asked for, with a
// comment holding a random token placed after `precision highp float;`, under tools/dev/_probe/ (ignored by git).
//
//   node tools/dev/shader_probe.mjs <engine file> <name>=<git ref | work> [...]
//   node tools/dev/shader_probe.mjs labs/assets/js/exoplanet/exoplanet.js main=origin/main work=work
//
// Then, in a browser on a local server at the repository root (a real GPU, not a headless one), time the build:
//
//   const { Exoplanet } = await import('/tools/dev/_probe/work-<token>.js');
//   const c = document.createElement('canvas'); document.body.append(c);
//   const e = new Exoplanet(c); const t = performance.now(); e._programFor(0, true); performance.now() - t
//
// Measured this way on 2026-11-15 (laptop GPU, Direct3D 11): one orbit program holding every look took 29 s; a
// program per look takes 2.4 to 8.3 s. Compile time grows faster than the code, so measure before merging a
// shader that grew.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [file, ...specs] = process.argv.slice(2);
if (!file || !specs.length) { console.log('usage: node tools/dev/shader_probe.mjs <engine file> <name>=<git ref | work> [...]'); process.exit(2); }
const ANCHOR = 'precision highp float;';
const dir = path.join('tools', 'dev', '_probe');
mkdirSync(dir, { recursive: true });
const token = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
for (const spec of specs) {
  const [name, ref] = spec.split('=');
  if (!name || !ref) { console.log(`skipped "${spec}": write it as name=ref`); continue; }
  const src = ref === 'work' ? readFileSync(file, 'utf8') : execFileSync('git', ['show', `${ref}:${file.replace(/\\/g, '/')}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const at = src.indexOf(ANCHOR);
  if (at < 0 || src.indexOf(ANCHOR, at + 1) >= 0) { console.log(`skipped ${name}: "${ANCHOR}" is not in the file exactly once`); continue; }
  const out = path.join(dir, `${name}-${token}.js`);
  writeFileSync(out, src.slice(0, at) + `${ANCHOR}\n// probe ${name} ${token}` + src.slice(at + ANCHOR.length));
  console.log('/' + out.replace(/\\/g, '/'));
}
