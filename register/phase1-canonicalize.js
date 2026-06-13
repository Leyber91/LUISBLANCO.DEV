#!/usr/bin/env node
/* =========================================================================
   phase1-canonicalize.js — Collapse aliases, assign CX- IDs, normalize fields.
   Input:  work/00_raw_concepts.json
   Output: work/01_canonical.json
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const IN_FILE = path.join(WORK, '00_raw_concepts.json');
const OUT_FILE = path.join(WORK, '01_canonical.json');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'register_config.json'), 'utf-8'));

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

/* ── normalize name for matching ── */
function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ── build alias lookup ── */
function buildAliasMap() {
  const aliasToPrimary = new Map();
  for (const [primary, aliases] of Object.entries(CONFIG.alias_maps || {})) {
    const priNorm = norm(primary);
    aliasToPrimary.set(priNorm, primary);
    for (const a of aliases) {
      aliasToPrimary.set(norm(a), primary);
    }
  }
  return aliasToPrimary;
}

/* ── extract tier from raw ── */
function extractTier(raw) {
  if (raw.tier) return raw.tier;
  if (raw.gold_rank) {
    const r = raw.gold_rank;
    if (r <= 10) return 'S';
    if (r <= 25) return 'A';
    if (r <= 40) return 'B';
    return 'C';
  }
  return null;
}

/* ── parse era string into array ── */
function parseEras(eraStr) {
  if (!eraStr) return [];
  const eras = [];
  const m = eraStr.match(/ERA(\d+)/g);
  if (m) eras.push(...m);
  const range = eraStr.match(/ERA(\d+)[\s\-–]+ERA(\d+)/);
  if (range) {
    const start = +range[1], end = +range[2];
    for (let i = start + 1; i <= end; i++) eras.push(`ERA${i}`);
  }
  return [...new Set(eras)];
}

/* ── parse potential into array ── */
function parsePotential(potStr) {
  if (!potStr) return [];
  return potStr.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

/* ── main ── */
const raw = readJSON(IN_FILE);
const aliasMap = buildAliasMap();
const clusterOrder = CONFIG.cluster_order;

/* group by cluster */
const byCluster = {};
for (const r of raw) {
  const cl = r.cluster || 'UNKNOWN';
  if (!byCluster[cl]) byCluster[cl] = [];
  byCluster[cl].push(r);
}

/* canonicalize each cluster */
let seq = 0;
const canonical = [];
const usedNames = new Set();

for (const cl of clusterOrder) {
  const group = byCluster[cl] || [];
  /* sort within cluster: gold first, then by name */
  group.sort((a, b) => {
    const aG = a.from.includes('gold') ? 0 : 1;
    const bG = b.from.includes('gold') ? 0 : 1;
    if (aG !== bG) return aG - bG;
    return a.name.localeCompare(b.name);
  });

  for (const r of group) {
    const n = norm(r.name);
    const primaryName = aliasMap.get(n) || r.name;

    /* skip if this raw entry is an alias of an already-seen concept */
    if (usedNames.has(primaryName)) {
      /* merge into existing */
      const existing = canonical.find(c => c.name === primaryName);
      if (existing) {
        existing.aliases.push(r.name);
        existing.aliases = [...new Set(existing.aliases)];
        if (r.source && !existing.sources.includes(r.source)) {
          existing.sources.push(r.source);
        }
        const newEras = parseEras(r.era);
        for (const e of newEras) {
          if (!existing.eras.includes(e)) existing.eras.push(e);
        }
      }
      continue;
    }

    usedNames.add(primaryName);
    seq++;

    canonical.push({
      id: `CX-${String(seq).padStart(4, '0')}`,
      name: primaryName,
      cluster: cl,
      part: null, /* assigned in phase 2 */
      law: null,
      tier: extractTier(r),
      essence: r.essence || '',
      status: r.status || 'paper-only',
      eras: parseEras(r.era),
      sources: r.source ? [r.source] : [],
      aliases: [r.name === primaryName ? null : r.name].filter(Boolean),
      potential: parsePotential(r.potential),
      merged_from: [r.from],
      links: {
        derives_from: [],
        enables: [],
        requires: [],
        watches: [],
        transports: [],
        opposes: [],
        implements: [],
        refines: [],
        proves: []
      }
    });
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(canonical, null, 2));

/* ── report ── */
const byCl = {};
const withTier = { S: 0, A: 0, B: 0, C: 0, null: 0 };
for (const c of canonical) {
  byCl[c.cluster] = (byCl[c.cluster] || 0) + 1;
  withTier[c.tier || 'null']++;
}

console.log('=== PHASE 1 CANONICALIZE REPORT ===');
console.log('Canonical concepts:', canonical.length);
console.log('Tier distribution:', JSON.stringify(withTier));
console.log('\nCluster distribution:');
for (const cl of clusterOrder) {
  const n = byCl[cl] || 0;
  if (n) console.log(`  ${cl.padEnd(15)} ${n}`);
}
console.log('\nTop 10 by name:');
for (const c of canonical.slice(0, 10)) {
  const tierTag = c.tier ? `[${c.tier}]` : '[ ]';
  console.log(`  ${c.id} ${tierTag} ${c.name.slice(0, 60)}`);
}
console.log('\nWrote:', OUT_FILE);
