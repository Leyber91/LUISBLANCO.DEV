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
  if (f === 'DOCTRINE_VISIBLE_AI.md') return '10 · the doctrine';
  if (f === 'LUIS_CONCEPTUAL_MAP.md') return '11 · the map';
  if (f === 'LUIS_IDEA_ATLAS.md') return '12 · the atlas';
  if (rel.includes('claude_vault_chunks')) return '15 · raw vault';
  if (f.startsWith('_')) return '13 · synthesis';
  return '14 · evidence';
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

// the authored book: _reference/BOOK/*.html fragments, ordered by filename,
// shipped raw (inline SVG diagrams included) as group 00.
const BOOKS = [
  ['BOOK_PARADIGM', '00 · the paradigm'],
  ['BOOK_AEA', '01 · part i — entity'],
  ['BOOK_ESSENCE', '02 · part ii — continuity'],
  ['BOOK_CONSTELLATION', '03 · part iii — composition'],
  ['BOOK_AETHER', '04 · part iv — interface'],
  ['BOOK_CRAFT', '05 · part v — craft'],
  ['BOOK_PLAY', '06 · part vi — laboratory'],
  ['BOOK_OMEGA', '07 · part vii — measure'],
  ['REGISTER', '08 · the register'],
  ['BOOK', '09 · the book of luis'],
];
let bookSections = [];
for (const [dir, grp] of BOOKS) {
  try {
    for (const f of readdirSync(join(REF, dir)).filter(f => f.endsWith('.html')).sort()) {
      const html = readFileSync(join(REF, dir, f), 'utf8');
      const m = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
      const t = m ? m[1].replace(/<[^>]+>/g, '').trim() : basename(f, '.html').replace(/^\d+_/, '').replace(/_/g, ' ');
      bookSections.push({ group: grp, title: t.slice(0, 80), file: f, md: html, raw: true });
    }
  } catch { /* folder not authored yet */ }
}

const files = walk(REF).filter(f => !f.includes('BOOK'));
const sections = [...bookSections, ...files.map(f => {
  const md = readFileSync(f, 'utf8');
  return { group: group(f), title: title(f, md), file: basename(f), md };
}).sort((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title))];

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
