/* The timeline's publication gate. Fails (exit 1) when:
     - any tracked file in the repository (git ls-files; the labs/levels ladder files exempt)
       holds a bracketed codex tag for unpublished material, a spoiler-list phrase, a superseded
       canon phrase, or a phrase from the SPOILER_WATCHLIST environment variable;
     - a file of this lab holds one of the lab-only phrases (generic words that are spoilers here);
     - an event or character in the data sits above the spoiler ceiling (data/ceiling.json).
   The lists in checks/terms.json are SHA-256 hashes, so the plaintext never enters the repository;
   SPOILER_WATCHLIST is meant to come from a repository secret, as WATCHLIST does for privacy_gate.py.
   node labs/assets/js/timeline/checks/gate.mjs              scan
   node labs/assets/js/timeline/checks/gate.mjs --selftest   prove it catches planted leaks */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const lab = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(lab, '..', '..', '..', '..');
const labRel = 'labs/assets/js/timeline/';
const terms = JSON.parse(readFileSync(join(lab, 'checks', 'terms.json'), 'utf8'));
const ceiling = JSON.parse(readFileSync(join(lab, 'data', 'ceiling.json'), 'utf8')).ceiling.tier;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const SPOIL = new Set(terms.spoiler), LAB = new Set(terms.labOnly || []), TEST = new Set(terms.selftest);
const OLD = new Map(terms.superseded.map((x) => [x.hash, x]));
const SECRET = new Set((process.env.SPOILER_WATCHLIST || '').split('\n').map(norm).filter(Boolean).map(sha));
const TAGS = /\[(?:SCAFFOLD|DEEP LORE|B3-ONLY|B2-PREP)\]/;
const TEXT = /\.(html|css|js|mjs|cjs|json|md|txt|py|yml|yaml|svg)$/i;

function phrases(line) {
  const w = norm(line).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) out.push(sha(w.slice(i, i + n).join(' ')));
  return out;
}

export function scanText(name, text, { inLab = false, selftest = false } = {}) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (TAGS.test(line) && !name.startsWith('labs/levels/')) hits.push(`${name}:${i + 1} bracketed tag for unpublished material`);
    for (const h of phrases(line)) {
      if (SPOIL.has(h) || SECRET.has(h)) hits.push(`${name}:${i + 1} spoiler watchlist phrase (hash ${h.slice(0, 8)})`);
      if (inLab && LAB.has(h)) hits.push(`${name}:${i + 1} lab-only spoiler phrase (hash ${h.slice(0, 8)})`);
      if (OLD.has(h)) hits.push(`${name}:${i + 1} superseded canon: use “${OLD.get(h).supersededBy}” (${OLD.get(h).source})`);
      if (selftest && TEST.has(h)) hits.push(`${name}:${i + 1} planted test phrase`);
    }
  });
  return hits;
}

function run() {
  const tracked = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter((p) => p && TEXT.test(p));
  const mine = execFileSync('git', ['ls-files', '--others', '--exclude-standard', labRel, 'labs/timeline.html', 'labs/assets/css/timeline.css'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
  const files = [...new Set([...tracked, ...mine])].filter((p) => !p.startsWith(`${labRel}checks/`) && !p.startsWith('labs/levels/'));
  const hits = [];
  let skipped = 0;
  for (const f of files) {
    let text;
    try { text = readFileSync(join(repo, f), 'utf8'); } catch { continue; }
    // numeric data files (the exoplanet catalogue) carry no prose; scanning them only costs time
    if (text.length > 1.5e6) { skipped++; continue; }
    text = text.split('\n').map((l) => (l.length > 4000 ? l.slice(0, 4000) : l)).join('\n');
    const inLab = f.startsWith(labRel) || f === 'labs/timeline.html' || f === 'labs/assets/css/timeline.css';
    hits.push(...scanText(f, text, { inLab }));
  }
  const data = JSON.parse(readFileSync(join(lab, 'data', 'events.json'), 'utf8'));
  for (const e of data.events) if (e.tier == null || e.tier > ceiling) hits.push(`events.json: ${e.id} tier ${e.tier} unset or above the ceiling ${ceiling}`);
  for (const c of data.characters) if (c.tier > ceiling) hits.push(`events.json: character ${c.id} above the ceiling`);
  return { hits, files: files.length - skipped, skipped };
}

if (process.argv.includes('--selftest')) {
  const clean = scanText('clean', 'Kha-Ren finds its artifact in c. 8000 BCE.', { inLab: true, selftest: true });
  const planted = scanText('planted', 'An ordinary line with a ZQX planted leak in it.', { selftest: true });
  const tagged = scanText('tagged', 'A line marked [DEEP LORE] by mistake.');
  const ladder = scanText('labs/levels/x.json', 'The ladder may name [B3-ONLY] as a tag.');
  const ok = clean.length === 0 && planted.length === 1 && tagged.length === 1 && ladder.length === 0;
  console.log(`selftest: clean ${clean.length}, planted ${planted.length}, bracketed tag ${tagged.length}, ladder exemption ${ladder.length}: ${ok ? 'pass' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
}
const { hits, files, skipped } = run();
for (const h of hits) console.log(h);
const outside = hits.filter((h) => !h.startsWith(labRel) && !h.startsWith('labs/timeline.html') && !h.startsWith('labs/assets/css/timeline.css') && !h.startsWith('events.json')).length;
console.log(`timeline gate: ${files} tracked files scanned (${skipped} data files over 1.5 MB skipped)${SECRET.size ? `, ${SECRET.size} secret watchlist phrases` : ''}, ${hits.length} findings, ${hits.length - outside} in this lab`);
process.exit(hits.length ? 1 : 0);
