/* =========================================================================
   build_codex.mjs — compiles the PRIVATE _reference corpus into codex.enc.json.
   Pipeline: walk _reference/*.md → sections JSON → gzip → AES-256-GCM
   (key = PBKDF2-SHA256(passphrase, salt, 600k iters)) → base64 blob.
   The plaintext NEVER enters the repo (_reference/ is gitignored); only the
   encrypted blob ships. Run locally:  node tools/build_codex.mjs
   Passphrase: CODEX_PASS env var, or omit to generate one (printed ONCE).
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const REF = join(ROOT, '_reference');
const OUT = join(ROOT, 'codex.enc.json');
const ITER = 600_000;

const SKIP = new Set(['README.md', 'STYLE_HANDOVER.md', 'ALGORITHM_REFERENCE.md', '_RESUME_STATE.md']);
const group = (rel) => {
  const f = basename(rel);
  if (f === 'DOCTRINE_VISIBLE_AI.md') return '01 · the doctrine';
  if (f === 'LUIS_CONCEPTUAL_MAP.md') return '02 · the map';
  if (f === 'LUIS_IDEA_ATLAS.md') return '03 · the atlas';
  if (rel.includes('claude_vault_chunks')) return '06 · raw vault';
  if (f.startsWith('_')) return '04 · synthesis';
  return '05 · evidence';
};
const title = (file, md) => {
  const m = md.match(/^#\s+(.+)$/m);
  return (m ? m[1] : basename(file, '.md')).slice(0, 80);
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.md') && !SKIP.has(e)) out.push(p);
  }
  return out;
}

const files = walk(REF);
const sections = files.map(f => {
  const md = readFileSync(f, 'utf8');
  return { group: group(f), title: title(f, md), file: basename(f), md };
}).sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));

let pass = process.env.CODEX_PASS;
if (!pass) {
  const alpha = 'abcdefghjkmnpqrstuvwxyz23456789';
  const rb = randomBytes(20);
  pass = [...rb].map((b, i) => alpha[b % alpha.length] + ((i + 1) % 5 === 0 && i < 19 ? '-' : '')).join('');
  console.log('GENERATED PASSPHRASE (store it NOW, it is not saved anywhere):');
  console.log('  ' + pass);
}

const plain = gzipSync(Buffer.from(JSON.stringify({ built: new Date().toISOString().slice(0, 10), sections }), 'utf8'), { level: 9 });
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

// roundtrip self-test before writing
const dec = createDecipheriv('aes-256-gcm', key, iv);
dec.setAuthTag(ct.subarray(ct.length - 16));
const back = gunzipSync(Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]));
if (back.length !== gunzipSync(plain).length && JSON.parse(back.toString('utf8')).sections.length !== sections.length)
  throw new Error('roundtrip self-test failed');

writeFileSync(OUT, JSON.stringify({
  v: 1, kdf: 'PBKDF2-SHA256', iter: ITER,
  salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64'),
}));
console.log(`codex.enc.json written: ${sections.length} sections, ${(ct.length / 1024 / 1024).toFixed(2)} MB encrypted (${(plain.length / 1024 / 1024).toFixed(2)} MB compressed plaintext). Roundtrip OK.`);
