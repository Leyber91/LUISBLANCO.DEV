/* Citation audit: resolve every DOI in data/events.json through Crossref and compare the
   title, first author and year with what the note claims. Writes checks/citations-report.json.
   node labs/assets/js/timeline/checks/audit-citations.mjs      (needs network; api.crossref.org) */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const lab = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(lab, 'data', 'events.json'), 'utf8'));
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const seen = new Map();
for (const [k, p] of Object.entries(data.physics)) for (const r of p.refs || []) if (!seen.has(r.cite)) seen.set(r.cite, { ...r, notes: [k] }); else seen.get(r.cite).notes.push(k);

const rows = [];
for (const r of seen.values()) {
  if (!r.doi) { rows.push({ cite: r.cite, doi: null, status: r.book ? 'book: no DOI exists' : 'MISSING DOI', notes: r.notes }); continue; }
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(r.doi)}`, { headers: { 'User-Agent': 'luisblanco.dev timeline citation audit' } });
    if (!res.ok) { rows.push({ cite: r.cite, doi: r.doi, status: `HTTP ${res.status}` }); continue; }
    const m = (await res.json()).message;
    const title = (m.title || [''])[0], first = (m.author || [{}])[0].family || '', year = (m.issued?.['date-parts']?.[0]?.[0]) || null;
    const okTitle = norm(title).startsWith(norm(r.title).slice(0, 40)) || norm(r.title).startsWith(norm(title).slice(0, 40));
    const okAuthor = norm(first) === norm(r.author);
    const okYear = Math.abs((year || 0) - r.year) <= 1;     // print and online years can differ by one
    rows.push({ cite: r.cite, doi: r.doi, status: okTitle && okAuthor && okYear ? 'match' : 'MISMATCH', crossref: { title, firstAuthor: first, year }, okTitle, okAuthor, okYear, notes: r.notes });
  } catch (e) { rows.push({ cite: r.cite, doi: r.doi, status: `ERROR ${e.message}` }); }
}
const mismatches = rows.filter((r) => !['match', 'book: no DOI exists'].includes(r.status)).length;
writeFileSync(join(lab, 'checks', 'citations-report.json'), JSON.stringify({ date: new Date().toISOString().slice(0, 10), source: 'api.crossref.org', references: rows.length, mismatches, rows }, null, 1) + '\n');
for (const r of rows) console.log(`${r.status.padEnd(20)} ${r.cite}`);
console.log(`citation audit: ${rows.length} references, ${mismatches} mismatches`);
process.exit(mismatches ? 1 : 0);
