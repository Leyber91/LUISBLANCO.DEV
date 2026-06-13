#!/usr/bin/env node
/* =========================================================================
   phase0-bootstrap.js — Parse LUIS_IDEA_ATLAS.md + _GOLD_INDEX.md into
   a single raw concept array. Gold entries override atlas on name match.
   Output: register/work/00_raw_concepts.json
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const PORTFOLIO = path.resolve(__dirname, '..', '..', '..');
const ATLAS_PATH = path.join(PORTFOLIO, 'LUIS_IDEA_ATLAS.md');
const GOLD_PATH = path.join(PORTFOLIO, 'research_map', '_GOLD_INDEX.md');
const OUT_DIR = path.join(__dirname, 'work');
const OUT_FILE = path.join(OUT_DIR, '00_raw_concepts.json');

function readFile(p) {
  if (!fs.existsSync(p)) { console.error('MISSING:', p); process.exit(1); }
  return fs.readFileSync(p, 'utf-8');
}

/* ── parse atlas ── */
function parseAtlas(src) {
  const lines = src.split(/\r?\n/);
  const concepts = [];
  let currentCluster = null;
  let inTable = false;
  let headerSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    /* cluster header */
    if (/^##\s+/.test(line)) {
      const m = line.replace(/^##\s+/, '');
      if (m && !m.startsWith('How to use') && !m.startsWith('OUROBOROS').test === undefined) {
        currentCluster = m.split(/\s/)[0];
        if (currentCluster === 'How') currentCluster = null;
      }
      const clusterMatch = line.match(/^##\s+([A-Z\-]+)/);
      if (clusterMatch) {
        currentCluster = clusterMatch[1];
      }
      inTable = false; headerSeen = false;
      continue;
    }

    /* table delimiter */
    if (/^\|[-\s|]+\|$/.test(line)) { headerSeen = true; continue; }

    /* table row */
    if (headerSeen && /^\|/.test(line)) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c.length);
      if (cells.length >= 6) {
        concepts.push({
          name: cells[0],
          essence: cells[1],
          era: cells[2],
          status: cells[3],
          potential: cells[4],
          source: cells[5],
          cluster: currentCluster || 'UNKNOWN',
          from: 'atlas'
        });
      }
      continue;
    }

    if (/^#{1,4}\s/.test(line)) { inTable = false; headerSeen = false; }
  }
  return concepts;
}

/* ── parse gold index ── */
function parseGold(src) {
  const entries = [];
  const blocks = src.split(/\n(?=\d+\.\s+\*\*)/);
  for (const block of blocks) {
    const numMatch = block.match(/^(\d+)\.\s+\*\*([^*]+)\*\*/);
    if (!numMatch) continue;
    const num = +numMatch[1];
    const name = numMatch[2].trim();
    const whatMatch = block.match(/What:\s*([\s\S]*?)(?=\n\s+Source:|\n\s+Date:|$)/);
    const sourceMatch = block.match(/Source:\s*(.+)/);
    const dateMatch = block.match(/Date:\s*(.+)/);
    const tier = num <= 10 ? 'S' : num <= 25 ? 'A' : num <= 40 ? 'B' : 'C';
    entries.push({
      name,
      essence: whatMatch ? whatMatch[1].trim() : '',
      era: '',
      status: 'shipped',
      potential: '',
      source: sourceMatch ? sourceMatch[1].trim() : '',
      cluster: inferClusterFromName(name),
      from: 'gold',
      tier,
      gold_rank: num
    });
  }
  return entries;
}

function inferClusterFromName(name) {
  const n = name.toLowerCase();
  if (/\baether\b/.test(n) || /\bwirthforge\b/.test(n) || /\bastrophysics\b/.test(n)) return 'AETHER';
  if (/\bhades\b/.test(n) || /\bmoa\b/.test(n) || /\borchestration\b/.test(n)) return 'HADES-MOA';
  if (/\bouroboros\b/.test(n) || /\bself-growing\b/.test(n) || /\bself-evolving\b/.test(n)) return 'OUROBOROS';
  if (/\bdataspace\b/.test(n) || /\bcompression\b/.test(n) || /\bessence\b/.test(n)) return 'COMPRESSION';
  if (/\bgame\b/.test(n) || /\bnexus\b/.test(n) || /\bdiscovery\b/.test(n)) return 'GAMES';
  if (/\bhonest\b/.test(n) || /\benergy\b/.test(n) || /\bdecipher\b/.test(n) || /\beeg\b/.test(n) || /\btoken.*time\b/.test(n)) return 'HONESTY';
  if (/\bmyth\b/.test(n) || /\bnaming\b/.test(n) || /\btriverse\b/.test(n)) return 'MYTHOLOGY';
  if (/\bprompt\b/.test(n) || /\bcraft\b/.test(n)) return 'CRAFT';
  if (/\bqbnn\b/.test(n) || /\bquantum\b/.test(n) || /\bneural\b/.test(n)) return 'OUROBOROS';
  if (/\bsedah\b/.test(n)) return 'HADES-MOA';
  if (/\bollama\b/.test(n) || /\blocal\b/.test(n)) return 'AETHER';
  return 'HONESTY';
}

/* ── deduplicate: gold overrides atlas by fuzzy name match ── */
function dedup(atlas, gold) {
  const byName = new Map();

  for (const c of atlas) {
    byName.set(c.name, c);
  }

  for (const g of gold) {
    /* exact or substring match */
    let found = false;
    for (const [name, a] of byName) {
      if (name.includes(g.name) || g.name.includes(name)) {
        byName.set(name, { ...a, ...g, from: 'gold+atlas' });
        found = true;
        break;
      }
    }
    if (!found) {
      byName.set(g.name, g);
    }
  }

  return Array.from(byName.values());
}

/* ── main ── */
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const atlasRaw = readFile(ATLAS_PATH);
const goldRaw = readFile(GOLD_PATH);

const atlasConcepts = parseAtlas(atlasRaw);
const goldConcepts = parseGold(goldRaw);
const merged = dedup(atlasConcepts, goldConcepts);

/* sort by cluster order then name */
const config = JSON.parse(readFile(path.join(__dirname, 'register_config.json')));
const clusterOrder = config.cluster_order;
merged.sort((a, b) => {
  const ai = clusterOrder.indexOf(a.cluster);
  const bi = clusterOrder.indexOf(b.cluster);
  if (ai !== bi) return ai - bi;
  return a.name.localeCompare(b.name);
});

fs.writeFileSync(OUT_FILE, JSON.stringify(merged, null, 2));

/* ── report ── */
const byCluster = {};
for (const c of merged) {
  byCluster[c.cluster] = (byCluster[c.cluster] || 0) + 1;
}
const goldCount = merged.filter(c => c.from === 'gold' || c.from === 'gold+atlas').length;
const atlasOnly = merged.filter(c => c.from === 'atlas').length;

console.log('=== PHASE 0 BOOTSTRAP REPORT ===');
console.log('Atlas entries parsed:', atlasConcepts.length);
console.log('Gold entries parsed: ', goldConcepts.length);
console.log('Merged (deduped):   ', merged.length);
console.log('  Gold-priority:    ', goldCount);
console.log('  Atlas-only:       ', atlasOnly);
console.log('\nCluster distribution:');
for (const cl of clusterOrder) {
  const n = byCluster[cl] || 0;
  if (n) console.log(`  ${cl.padEnd(15)} ${n}`);
}
console.log('\nWrote:', OUT_FILE);
