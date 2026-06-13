#!/usr/bin/env node
/* =========================================================================
   phase2-part-assign.js — Assign each canonical concept to one of 7 parts.
   Rules: (1) cluster default, (2) keyword override from name+essence,
   (3) manual override from register_config.json.
   Input:  work/01_canonical.json
   Output: work/02_assigned.json
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const IN_FILE = path.join(WORK, '01_canonical.json');
const OUT_FILE = path.join(WORK, '02_assigned.json');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'register_config.json'), 'utf-8'));

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

/* ── keyword scan ── */
function keywordPart(name, essence) {
  const text = (name + ' ' + essence).toLowerCase();
  for (const [kw, part] of Object.entries(CONFIG.keyword_part_overrides || {})) {
    if (text.includes(kw.toLowerCase())) return part;
  }
  return null;
}

/* ── main ── */
const concepts = readJSON(IN_FILE);
const manual = CONFIG.manual_overrides || {};
let assigned = 0, defaulted = 0, manualCount = 0, keywordCount = 0;

for (const c of concepts) {
  /* 1. manual override by ID or name */
  if (manual[c.id]) {
    c.part = manual[c.id];
    manualCount++;
  } else if (manual[c.name]) {
    c.part = manual[c.name];
    manualCount++;
  }
  /* 2. keyword override */
  else {
    const kw = keywordPart(c.name, c.essence);
    if (kw) {
      c.part = kw;
      keywordCount++;
    }
    /* 3. cluster default */
    else {
      c.part = CONFIG.cluster_to_part[c.cluster] || 'UNKNOWN';
      defaulted++;
    }
  }
  assigned++;
}

fs.writeFileSync(OUT_FILE, JSON.stringify(concepts, null, 2));

/* ── report ── */
const byPart = {};
for (const c of concepts) {
  byPart[c.part] = (byPart[c.part] || 0) + 1;
}

console.log('=== PHASE 2 PART ASSIGNMENT REPORT ===');
console.log('Total concepts:', assigned);
console.log('  Manual overrides:', manualCount);
console.log('  Keyword overrides:', keywordCount);
console.log('  Cluster defaults:', defaulted);
console.log('\nPart distribution:');
for (const [part, n] of Object.entries(byPart).sort()) {
  console.log(`  ${part.padEnd(18)} ${n}`);
}
console.log('\nWrote:', OUT_FILE);
