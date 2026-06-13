#!/usr/bin/env node
/* =========================================================================
   phase4-audit.js — Quality audit of the canonical register.
   Flags: orphans, tier gaps, part mismatches, likely duplicates,
   dense nodes, empty parts.
   Input:  work/03_with_edges.json + work/03_edges_flat.json
   Output: work/04_audit_report.md (human-readable, actionable)
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const IN_FILE = path.join(WORK, '03_with_edges.json');
const EDGE_FILE = path.join(WORK, '03_edges_flat.json');
const OUT_FILE = path.join(WORK, '04_audit_report.md');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

const concepts = readJSON(IN_FILE);
const edges = readJSON(EDGE_FILE);

/* ── helpers ── */
function norm(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim(); }
function similarity(a, b) {
  const wa = new Set(norm(a).split(' ').filter(w => w.length > 3));
  const wb = new Set(norm(b).split(' ').filter(w => w.length > 3));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

/* ── 1. orphans (0 outgoing edges) ── */
const outDegree = {};
for (const e of edges) outDegree[e.source] = (outDegree[e.source] || 0) + 1;
const orphans = concepts.filter(c => !outDegree[c.id]);

/* ── 2. missing tiers ── */
const noTier = concepts.filter(c => !c.tier);
const tierDist = { S: 0, A: 0, B: 0, C: 0 };
for (const c of concepts) if (c.tier) tierDist[c.tier]++;

/* ── 3. empty / thin parts ── */
const byPart = {};
for (const c of concepts) byPart[c.part] = (byPart[c.part] || 0) + 1;
const EXPECTED_PARTS = ['I-ENTITY','II-CONTINUITY','III-COMPOSITION','IV-INTERFACE','V-CRAFT','VI-LABORATORY','VII-MEASURE'];
const thinParts = EXPECTED_PARTS.filter(p => (byPart[p] || 0) < 20);

/* ── 4. dense nodes (>15 outgoing) ── */
const inDegree = {};
for (const e of edges) inDegree[e.target] = (inDegree[e.target] || 0) + 1;
const dense = Object.entries(outDegree).filter(([_, n]) => n > 15).sort((a, b) => b[1] - a[1]);

/* ── 5. likely duplicates (high name similarity, different IDs) ── */
const dupes = [];
for (let i = 0; i < concepts.length; i++) {
  for (let j = i + 1; j < concepts.length; j++) {
    const sim = similarity(concepts[i].name, concepts[j].name);
    if (sim > 0.7) {
      dupes.push({ a: concepts[i], b: concepts[j], sim: sim.toFixed(2) });
    }
  }
}

/* ── 6. Tier S/A with 0 incoming edges (isolated spine nodes) ── */
const isolatedSpine = concepts.filter(c =>
  (c.tier === 'S' || c.tier === 'A') && !inDegree[c.id]
);

/* ── 7. edge type distribution ── */
const edgeTypes = {};
for (const e of edges) edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;

/* ── 8. concepts with no sources ── */
const noSource = concepts.filter(c => !c.sources || c.sources.length === 0);

/* ── build report ── */
const lines = [];
const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
lines.push(`# REGISTER AUDIT REPORT`);
lines.push(`Generated: ${ts}`);
lines.push(`Total concepts: ${concepts.length} · Total edges: ${edges.length}`);
lines.push('');
lines.push('---');
lines.push('');

/* summary */
lines.push('## SUMMARY');
lines.push('');
lines.push(`| Check | Count | Status |`);
lines.push(`|---|---|---|`);
lines.push(`| Orphan nodes (0 outgoing edges) | ${orphans.length} | ${orphans.length === 0 ? '✅ CLEAN' : '⚠️ NEEDS EDGES'} |`);
lines.push(`| Missing tier (S/A/B/C) | ${noTier.length} | ${noTier.length < 100 ? '⚠️ EXPECTED (unranked atlas entries)' : '❌ HIGH'} |`);
lines.push(`| Thin parts (<20 entries) | ${thinParts.length} | ${thinParts.length === 0 ? '✅ OK' : '⚠️ REVIEW'} |`);
lines.push(`| Likely duplicates (>70% name similarity) | ${dupes.length} | ${dupes.length === 0 ? '✅ CLEAN' : '⚠️ REVIEW'} |`);
lines.push(`| Dense nodes (>15 outgoing edges) | ${dense.length} | ${dense.length < 5 ? '✅ OK' : '⚠️ CHECK'} |`);
lines.push(`| Tier S/A with 0 incoming edges | ${isolatedSpine.length} | ${isolatedSpine.length === 0 ? '✅ OK' : '⚠️ REVIEW'} |`);
lines.push(`| Concepts with no source citation | ${noSource.length} | ${noSource.length < 50 ? '⚠️ MINOR' : '❌ HIGH'} |`);
lines.push('');

/* part distribution */
lines.push('## PART DISTRIBUTION');
lines.push('');
for (const p of EXPECTED_PARTS) {
  const n = byPart[p] || 0;
  const bar = '█'.repeat(Math.floor(n / 5));
  const flag = n < 20 ? ' ⚠️ THIN' : '';
  lines.push(`- **${p}**: ${n} entries ${bar}${flag}`);
}
lines.push('');

/* tier distribution */
lines.push('## TIER DISTRIBUTION');
lines.push('');
lines.push(`- **S**: ${tierDist.S} (spine concepts)`);
lines.push(`- **A**: ${tierDist.A} (signature frameworks)`);
lines.push(`- **B**: ${tierDist.B} (original architectures)`);
lines.push(`- **C**: ${tierDist.C} (strong named systems)`);
lines.push(`- **unranked**: ${noTier.length} (atlas-only entries without gold ranking)`);
lines.push('');

/* edge type distribution */
lines.push('## EDGE TYPE DISTRIBUTION');
lines.push('');
for (const [t, n] of Object.entries(edgeTypes).sort((a, b) => b[1] - a[1])) {
  lines.push(`- **${t}**: ${n}`);
}
lines.push('');

/* orphans */
if (orphans.length > 0) {
  lines.push('## ORPHAN NODES (0 outgoing edges)');
  lines.push('');
  lines.push('Fix: add spine edges in `phase3-edges.js` SPINE array or `register_config.json` edge_corrections.');
  lines.push('');
  for (const c of orphans.slice(0, 30)) {
    lines.push(`- \`${c.id}\` [${c.tier || '-'}] \`${c.cluster}\` — ${c.name.slice(0, 70)}`);
  }
  if (orphans.length > 30) lines.push(`... and ${orphans.length - 30} more`);
  lines.push('');
}

/* isolated spine */
if (isolatedSpine.length > 0) {
  lines.push('## ISOLATED SPINE NODES (Tier S/A with 0 INCOMING edges)');
  lines.push('');
  lines.push('These concepts are important but nothing points to them — they appear unreachable in the graph. May indicate missing reverse edges.');
  lines.push('');
  for (const c of isolatedSpine) {
    lines.push(`- \`${c.id}\` [${c.tier}] — ${c.name.slice(0, 70)}`);
  }
  lines.push('');
}

/* thin parts */
if (thinParts.length > 0) {
  lines.push('## THIN PARTS (<20 entries)');
  lines.push('');
  for (const p of thinParts) {
    lines.push(`- **${p}**: ${byPart[p] || 0} entries — needs more content or concept reassignment`);
  }
  lines.push('');
}

/* dense nodes */
if (dense.length > 0) {
  lines.push('## DENSE NODES (>15 outgoing edges)');
  lines.push('');
  lines.push('High out-degree can indicate over-broad cluster-spine edges. Review if these are genuinely central.');
  lines.push('');
  for (const [id, n] of dense.slice(0, 10)) {
    const c = concepts.find(x => x.id === id);
    if (c) lines.push(`- \`${id}\` (${n} out, ${inDegree[id] || 0} in) — ${c.name.slice(0, 60)}`);
  }
  lines.push('');
}

/* likely duplicates */
if (dupes.length > 0) {
  lines.push('## LIKELY DUPLICATES (name similarity > 70%)');
  lines.push('');
  lines.push('Review these pairs. If confirmed duplicate: merge in `register_config.json` alias_maps and re-run phase1.');
  lines.push('');
  for (const { a, b, sim } of dupes.slice(0, 20)) {
    lines.push(`- sim=${sim} — \`${a.id}\` "${a.name.slice(0, 45)}" ↔ \`${b.id}\` "${b.name.slice(0, 45)}"`);
  }
  if (dupes.length > 20) lines.push(`... and ${dupes.length - 20} more pairs`);
  lines.push('');
}

/* no source */
if (noSource.length > 0) {
  lines.push('## CONCEPTS WITHOUT SOURCE CITATIONS');
  lines.push('');
  lines.push(`${noSource.length} concepts have no source file linked. Not blocking but reduces traceability.`);
  lines.push('');
  for (const c of noSource.slice(0, 15)) {
    lines.push(`- \`${c.id}\` \`${c.cluster}\` — ${c.name.slice(0, 60)}`);
  }
  if (noSource.length > 15) lines.push(`... and ${noSource.length - 15} more`);
  lines.push('');
}

/* actionable summary */
lines.push('---');
lines.push('');
lines.push('## ACTIONABLE FIXES (priority order)');
lines.push('');
if (orphans.length > 0) lines.push(`1. **${orphans.length} orphans** — add spine edges in phase3-edges.js`);
if (thinParts.length > 0) lines.push(`2. **Thin parts**: ${thinParts.join(', ')} — inject more entries or reassign via register_config.json`);
if (dupes.length > 0) lines.push(`3. **${dupes.length} duplicate pairs** — review and merge via alias_maps`);
if (isolatedSpine.length > 0) lines.push(`4. **${isolatedSpine.length} isolated Tier S/A nodes** — add incoming edges from related concepts`);
lines.push('');
lines.push('When fixes applied: re-run `node phase2-part-assign.js ; node phase3-edges.js ; node phase5-assemble.js`, re-seal codex, push.');

fs.writeFileSync(OUT_FILE, lines.join('\n'));
console.log('=== PHASE 4 AUDIT REPORT ===');
console.log('Written:', OUT_FILE);
console.log('');
console.log('SUMMARY:');
console.log(`  Orphans:          ${orphans.length}`);
console.log(`  Missing tier:     ${noTier.length}`);
console.log(`  Thin parts:       ${thinParts.join(', ') || 'none'}`);
console.log(`  Duplicate pairs:  ${dupes.length}`);
console.log(`  Dense nodes:      ${dense.length}`);
console.log(`  Isolated S/A:     ${isolatedSpine.length}`);
console.log(`  No source:        ${noSource.length}`);
