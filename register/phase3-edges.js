#!/usr/bin/env node
/* =========================================================================
   phase3-edges.js — Infer typed edges between canonical concepts.
   Three sources of edges:
     A. Hardcoded spine: the 6 idea-lines from LUIS_CONCEPTUAL_MAP.md §4 + era order.
        These are the load-bearing chains. Non-obvious ones explicitly included.
     B. Source-file co-occurrence: concepts sharing a source file are structurally linked.
     C. Era proximity: concepts from adjacent eras (±1) within the same idea-line
        get weak "parallel" edges.
   Input:  work/02_assigned.json
   Output: work/03_with_edges.json + work/03_edges_flat.json
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const IN_FILE = path.join(WORK, '02_assigned.json');
const OUT_FILE = path.join(WORK, '03_with_edges.json');
const EDGE_FILE = path.join(WORK, '03_edges_flat.json');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

const concepts = readJSON(IN_FILE);

/* ── build name/alias → id lookup ── */
const lookup = new Map();
for (const c of concepts) {
  lookup.set(c.name, c.id);
  for (const a of c.aliases || []) {
    if (a) lookup.set(a, c.id);
  }
}

function findId(name) {
  if (!name) return null;
  /* exact */
  if (lookup.has(name)) return lookup.get(name);
  /* case-insensitive substring — pick longest match */
  const n = name.toLowerCase();
  let best = null, bestLen = 0;
  for (const [k, v] of lookup) {
    const kl = k.toLowerCase();
    if (kl === n || (kl.includes(n) && n.length > 8) || (n.includes(kl) && kl.length > 8)) {
      if (kl.length > bestLen) { best = v; bestLen = kl.length; }
    }
  }
  return best;
}

/* ── edge accumulator ── */
const edgeSet = new Map(); /* key: `${src}→${tgt}→${type}` */
function addEdge(srcId, tgtId, type, weight, reason) {
  if (!srcId || !tgtId || srcId === tgtId) return;
  const key = `${srcId}→${tgtId}→${type}`;
  if (!edgeSet.has(key)) {
    edgeSet.set(key, { source: srcId, target: tgtId, type, weight, reason });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   A. SPINE EDGES — from LUIS_CONCEPTUAL_MAP.md §4 "The six idea-lines"
      + cross-cutting chains. Non-obvious multi-hop chains explicitly included.
   ═══════════════════════════════════════════════════════════════════════════ */
const SPINE = [
  /* ── LINE 1: OUROBOROS (self-modifying systems) ─────────────────────── */
  ['Metapower / metagenerator',                   'Project Ouroboros / OuroborosX (~20-agent pipeline, built)', 'enables',      0.9, 'ouroboros-line: metapower seeds self-modifying agents'],
  ['Project Ouroboros / OuroborosX (~20-agent pipeline, built)', 'Infinite Self-Evolving Fractal Orbital Organism (HTML universe → ALFAPRIME)', 'refines', 0.85, 'ouroboros-line: organism is the evolved form'],
  ['Project Ouroboros / OuroborosX (~20-agent pipeline, built)', 'Primordial Seed / Primordial AI', 'enables', 0.9, 'ouroboros-line: ouroboros → seed as theory'],
  ['Primordial Seed / Primordial AI',             'WIRTHFORGE',                                         'derives_from',  0.8, 'ouroboros-line: seed theory crystallises into WF'],
  ['Self-modifying training loop + the self-adjustment paradox', 'Project Ouroboros / OuroborosX (~20-agent pipeline, built)', 'proves', 0.85, 'ouroboros-line: paradox is learned inside ouroboros build'],
  /* non-obvious: metapower (2023) → ALFAPRIME (2024): generation jump */
  ['Metapower / metagenerator',                   'Infinite Self-Evolving Fractal Orbital Organism (HTML universe → ALFAPRIME)', 'enables', 0.7, 'non-obvious: metapower is the conceptual grandfather of alfaprime'],

  /* ── LINE 2: HADES/MoA (multi-agent orchestration) ──────────────────── */
  ['HADES — Hierarchical and Autonomous Decision-making Entity System / Hades Omega', 'SEDAH IA — the Pico/Nano/Micro/Cluster small-LLM hierarchy', 'watches', 0.95, 'invariant-3: SEDAH watches HADES (watcher-of-watchers)'],
  ['HADES — Hierarchical and Autonomous Decision-making Entity System / Hades Omega', 'Human-as-message-bus multi-agent orchestration (deployed)', 'enables', 0.9, 'hades-line: hades concept → manual fan-out execution'],
  ['Human-as-message-bus multi-agent orchestration (deployed)', 'Recursive MoA — "MoA of MoAs"', 'refines',  0.9, 'hades-line: manual fan-out → automated recursive moa'],
  ['Recursive MoA — "MoA of MoAs"',               'WIRTHFORGE',                                         'enables',     0.8, 'hades-line: recursive moa is the multi-model council in wf'],
  ['SEDAH IA — the Pico/Nano/Micro/Cluster small-LLM hierarchy', 'WIRTHFORGE', 'derives_from', 0.85, 'hades-line: WF inherits pico/nano/micro hierarchy'],
  /* non-obvious: hades (2024) and ouroboros (2024) are parallel expressions of same idea */
  ['Project Ouroboros / OuroborosX (~20-agent pipeline, built)', 'HADES — Hierarchical and Autonomous Decision-making Entity System / Hades Omega', 'enables', 0.7, 'non-obvious: ouroboros and hades built concurrently, ouroboros feeds hades memory model'],

  /* ── LINE 3: COMPRESSION (DATASPACE → essence passing → TRIVERSE) ───── */
  ['DATASPACE — conversation-compression for persistent AI identity', "'Degradation' (named enemy) + zero-degradation relay protocol", 'watches', 0.9, 'compression-line: dataspace names the enemy it fights'],
  ['DATASPACE — conversation-compression for persistent AI identity', 'FHL / Unbound Language System / Heptapod Lexicon — symbolic compression language', 'enables', 0.9, 'compression-line: dataspace → symbolic language as next compression level'],
  ["'Degradation' (named enemy) + zero-degradation relay protocol", 'Essence passing + three-level conversation hierarchy', 'derives_from', 0.9, 'compression-line: fighting degradation invents essence passing'],
  ['Essence passing + three-level conversation hierarchy', 'WIRTHFORGE', 'enables', 0.75, 'compression-line: essence passing lives in WF session handoffs'],
  ['FHL / Unbound Language System / Heptapod Lexicon — symbolic compression language', 'TRYVERSE → TRIVERSE', 'enables', 0.8, 'compression-line: the invented language feeds the triverse universe linguistics'],
  /* non-obvious: DATASPACE (2023) → CognitiveTransistor (2025): 2yr chain */
  ['DATASPACE — conversation-compression for persistent AI identity', 'CognitiveTransistor', 'enables', 0.65, 'non-obvious: dataspace compression instinct → bounded component model in cognitiVetransistor'],
  /* non-obvious: degradation (2024) and DATASPACE (2023) together form context-management thesis */
  ["'Degradation' (named enemy) + zero-degradation relay protocol", 'DATASPACE — conversation-compression for persistent AI identity', 'requires', 0.8, 'non-obvious: degradation problem confirms the need dataspace already solved — circular reinforcement'],

  /* ── LINE 4: AETHER (astrophysics as interface) ──────────────────────── */
  ['Black hole simulations — from 2023 nursery to physics-correct Gargantua', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'enables', 0.9, 'aether-line: black hole visual is the nursery for aether metaphor'],
  ['The 31-celestial-body internet ontology', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'implements', 0.95, 'aether-line: 31 bodies IS the aether ontology built'],
  ['AETHER / Aether 212 — the internet as navigable astrophysics', 'WIRTHFORGE', 'refines', 0.95, 'aether-line: wirthforge is the mature aether'],
  ['Energy Metaphor / Energy Units (EU) / Energy Truth', 'WIRTHFORGE', 'implements', 0.9, 'aether-line: energy metaphor is wirthforge visualisation core'],
  ['Black hole simulations — from 2023 nursery to physics-correct Gargantua', 'Energy Metaphor / Energy Units (EU) / Energy Truth', 'enables', 0.75, 'aether-line: lensing + physics aesthetic → energy visual grammar'],
  /* non-obvious: aether (2023) → LUMEN particle substrate (2026): 3yr visual thread */
  ['AETHER / Aether 212 — the internet as navigable astrophysics', 'The DECIPHER', 'enables', 0.7, 'non-obvious: aether render pipeline → decipher visualisation engine'],

  /* ── LINE 5: GAMES (discovery engines) ──────────────────────────────── */
  ['Games as discovery engines (the thesis)', 'The Seven AI Games series', 'implements', 0.9, 'games-line: thesis → first concrete game series'],
  ['The Seven AI Games series', 'Cosmic Nexus — each universe IS a different local model', 'enables', 0.9, 'games-line: seven games → cosmic nexus as multi-model game'],
  ['Cosmic Nexus — each universe IS a different local model', 'SpaceOdyssey / WirthForge Odyssey + 50-game prompting backlog', 'refines', 0.9, 'games-line: cosmic nexus → spaceodyssey on phone'],
  ['Modular Prompt Puzzle / PromptCell', 'Recursive MoA — "MoA of MoAs"', 'enables', 0.75, 'games-line: prompt-as-cell architecture feeds recursive moa'],
  /* non-obvious: games line AND aether line share cosmic-nexus: each universe IS a model */
  ['Cosmic Nexus — each universe IS a different local model', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'implements', 0.7, 'non-obvious: cosmic nexus materialises the aether metaphor — models AS celestial bodies'],

  /* ── LINE 6: HONESTY (maturity cluster) ─────────────────────────────── */
  ['The honesty decoder', 'Energy Metaphor / Energy Units (EU) / Energy Truth', 'derives_from', 0.9, 'honesty-line: honesty decoder names the fakery that energy-truth corrects'],
  ['Energy Metaphor / Energy Units (EU) / Energy Truth', 'The DECIPHER', 'enables', 0.95, 'honesty-line: energy metaphor IS the decipher pipeline'],
  ['Token-timing EEG / token-stream EKG (Spectral Analyzer)', 'CognitiveTransistor', 'enables', 0.9, 'honesty-line: measuring token timing → bounded component model'],
  ['CognitiveTransistor', 'Ollama-as-Fuel', 'requires', 0.85, 'honesty-line: transistor model requires the fuel/substrate model'],
  ['Ollama-as-Fuel', 'WIRTHFORGE', 'enables', 0.9, 'honesty-line: ollama-as-fuel is wirthforge energy philosophy'],
  /* non-obvious: token EEG (2025) traces back to DATASPACE (2023) — both are about signal from AI process */
  ['Token-timing EEG / token-stream EKG (Spectral Analyzer)', 'DATASPACE — conversation-compression for persistent AI identity', 'derives_from', 0.6, 'non-obvious: both measure the AI process signal; token-eeg is the instrument, dataspace the compression — same instinct, different era'],

  /* ── CROSS-CUTTING: Mythology as Method ─────────────────────────────── */
  ['TRYVERSE → TRIVERSE', 'The Tryverse Chronicles — TRIVERSE manuscript birth', 'enables', 0.9, 'mythology-method: triverse website → manuscript'],
  ['Metapower / metagenerator', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'derives_from', 0.7, 'mythology-method: metapower metaproject thinking → aether as meta-internet'],
  ['DATASPACE — conversation-compression for persistent AI identity', 'Project Leyber 212 — the founding platform', 'enables', 0.8, 'era-0-to-1: dataspace born while building leyber212'],
  ['Project Leyber 212 — the founding platform', 'TRYVERSE → TRIVERSE', 'enables', 0.9, 'era-1: tryverse section born inside leyber212'],
  ['Project Leyber 212 — the founding platform', 'Metapower / metagenerator', 'enables', 0.85, 'era-1: metapower section born inside leyber212'],

  /* ── LIFE CLUSTER — identity crystallises into the work ───────────────── */
  ['"The AI Architect" identity',                  'WIRTHFORGE',                                         'enables',     0.9, 'life-line: naming-as-identity moment (2024-06-24) → WF persona'],
  ['"Solution architect for AI" identity',          'WIRTHFORGE',                                         'enables',     0.85,'life-line: Dec 2024 self-definition → WF mission'],
  ['Agentic Engineer self-framing',                  'WIRTHFORGE',                                         'enables',     0.8, 'life-line: agentic engineer framing feeds WF product persona'],
  ['AI Systems Architect identity',                  'WIRTHFORGE',                                         'enables',     0.8, 'life-line: AI systems architect → WF architecture doctrine'],
  ['The Big X / AETHER212→WIRTHFORGE rename',        'WIRTHFORGE',                                         'implements',  0.95,'life-line: the rename IS the WIRTHFORGE birth moment'],
  ['The Big X / AETHER212→WIRTHFORGE rename',        'AETHER / Aether 212 — the internet as navigable astrophysics', 'derives_from', 0.95, 'life-line: rename traces back to aether origin'],
  ['luisblanco.dev',                                 'WIRTHFORGE',                                         'implements',  0.9, 'life-line: site is the public face of the WF/AEA vision'],
  ['Archive-mining / self-archaeology operation',    'The honesty decoder',                                'proves',      0.85,'life-line: self-archaeology is what produces the honesty decoder insight'],
  ['Metamethodology',                                'WIRTHFORGE',                                         'enables',     0.75,'life-line: meta-methods → WF as the methodology platform'],
  ['Self-as-method / psychology embedded into tooling', 'WIRTHFORGE',                                     'enables',     0.8, 'life-line: self-as-method → WF practitioner design'],
  ['Anti-spiral pattern catalog',                    'The honesty decoder',                                'refines',     0.75,'life-line: pattern catalog names the anti-patterns the decoder exposes'],
  ['Solo unicorn proof-of-concept',                  'WIRTHFORGE',                                         'derives_from',0.75,'life-line: solo-unicorn thesis is the WF independence doctrine'],
  ["'The AI Architect' identity",                   'WIRTHFORGE',                                         'enables',     0.9, 'life-line: named architect identity → WF persona'],
  ["'System that propagates' thesis",               'WIRTHFORGE',                                         'enables',     0.8, 'life-line: propagation thesis feeds WF self-evolution'],
  ["'Enhanced engineering' vs vibe engineering",    'The honesty decoder',                                'derives_from',0.8, 'life-line: engineering vs vibes is the honesty decoder applied to practice'],

  /* ── KEY ERA BRIDGES ────────────────────────────────────────────────── */
  ['AI Cognitive-Evolution Framework / TMR theory stack', 'inception.py — FTH cognitive architecture', 'implements', 0.9, 'era-3: TMR theory → implemented in inception.py'],
  ['inception.py — FTH cognitive architecture', 'WIRTHFORGE', 'enables', 0.7, 'era-bridge: FTH framework becomes wf cognitive pipeline'],
  ['HSQ-Transformer (HyperSphere-Q)', 'WIRTHFORGE', 'enables', 0.7, 'era-6-to-9: hsq architecture insights → wf model-efficiency layer'],
  ['Self-Propelling Prompt / Self-Transcendence Prompt (STP)', 'Recursive MoA — "MoA of MoAs"', 'enables', 0.75, 'era-bridge: self-propelling loop is the conceptual model for recursive moa'],
  ['Superposition / Metaposition / Omniposition triad', 'Recursive MoA — "MoA of MoAs"', 'implements', 0.85, 'era-5: super/meta/omni position triad IS recursive moa reasoning'],
  ['Galactic Ages / AI AGES — mythology as executable method', 'Games as discovery engines (the thesis)', 'refines', 0.8, 'era-3: galactic ages methodology → games as discovery thesis'],
  ['Universal AI Substrate', 'WIRTHFORGE', 'derives_from', 0.75, 'era-3-to-9: universal substrate grand-unified vision → wf as the achievable version'],
  ['WF document factory', 'WIRTHFORGE', 'implements', 0.9, 'era-9: wf doc factory is an artifact of the wf project itself'],
  ['SpaceOdyssey / WirthForge Odyssey + 50-game prompting backlog', 'WIRTHFORGE', 'implements', 0.9, 'era-10: spaceodyssey is wirthforge shipped on mobile'],
  ['AI Civilization / Nexus Genesis / SwarmGenesis (the December wave)', 'WIRTHFORGE', 'derives_from', 0.75, 'era-bridge: ai civilization → wf multi-agent council is harvesting-discoveries for real'],
  ['Primordial Application Generator + Self-Growing Web App', 'Project Ouroboros / OuroborosX (~20-agent pipeline, built)', 'refines', 0.8, 'era-3-to-4: primordial app generator is ouroboros applied to web apps'],
  ['5-file LLM novel-revision system', 'DATASPACE — conversation-compression for persistent AI identity', 'derives_from', 0.8, 'era-0-to-1: 5-file state management IS an early dataspace-like external memory'],
  ['Three-persona critic stack + recursive expansion loop', 'Recursive MoA — "MoA of MoAs"', 'enables', 0.8, 'era-0: three-persona critic stack is the first multi-agent debate pattern'],
  ['Zeroth Law arc: Perfect Prompt Devil → generateZerothLawPrompt()', 'Self-Propelling Prompt / Self-Transcendence Prompt (STP)', 'refines', 0.75, 'era-3: zeroth law → more structured self-propelling prompt'],
  ['Quantum-Inspired HAR Analyzer / QuantumHARAnalyzer (nova.html)', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'implements', 0.8, 'era-4: har analyzer "what is our black hole" — aether crossover'],
  ['Aether 212 / Exomania — exoplanet visualizer', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'implements', 0.95, 'era-6: exomania IS aether visual prototype'],
  ['QBNN — Quantum-Biological Neural Network (built)', 'HADES — Hierarchical and Autonomous Decision-making Entity System / Hades Omega', 'enables', 0.75, 'era-3: qbnn architecture built inside hades context'],
  ['Annidation theory', 'AETHER / Aether 212 — the internet as navigable astrophysics', 'enables', 0.7, 'non-obvious: n-dimensional cube theory → astrophysics metaphor are same dimensional-thinking'],
  ['ChatGPT memory portability', 'DATASPACE — conversation-compression for persistent AI identity', 'refines', 0.8, 'non-obvious: memory portability IS the external form of dataspace compression'],
];

/* apply spine edges */
for (const [srcName, tgtName, type, weight, reason] of SPINE) {
  const srcId = findId(srcName);
  const tgtId = findId(tgtName);
  if (!srcId) { console.warn(`[SPINE MISS] source not found: "${srcName}"`); }
  if (!tgtId) { console.warn(`[SPINE MISS] target not found: "${tgtName}"`); }
  if (srcId && tgtId) addEdge(srcId, tgtId, type, weight, reason);
}

/* ═══════════════════════════════════════════════════════════════════════════
   B. SOURCE-FILE CO-OCCURRENCE
   Concepts citing the same source file are structurally linked.
   ═══════════════════════════════════════════════════════════════════════════ */
const bySource = new Map();
for (const c of concepts) {
  for (const s of c.sources || []) {
    const key = s.trim();
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(c.id);
  }
}
for (const [src, ids] of bySource) {
  if (ids.length < 2 || ids.length > 8) continue; /* skip singletons and noisy files */
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      addEdge(ids[i], ids[j], 'parallel', 0.4, `source-cooccurrence: ${src}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   C. CLUSTER-TO-CLUSTER STRUCTURAL EDGES
   Every concept in a child cluster gets enables/requires edges to spine nodes
   of the parent cluster.
   ═══════════════════════════════════════════════════════════════════════════ */
const CLUSTER_SPINE = {
  'OUROBOROS': 'Project Ouroboros / OuroborosX (~20-agent pipeline, built)',
  'HADES-MOA': 'HADES — Hierarchical and Autonomous Decision-making Entity System / Hades Omega',
  'COMPRESSION': 'DATASPACE — conversation-compression for persistent AI identity',
  'AETHER': 'AETHER / Aether 212 — the internet as navigable astrophysics',
  'GAMES': 'Games as discovery engines (the thesis)',
  'HONESTY': 'The honesty decoder',
  'MYTHOLOGY': 'TRYVERSE → TRIVERSE',
  'CRAFT': 'Self-Propelling Prompt / Self-Transcendence Prompt (STP)',
  'OPS': 'Essence passing + three-level conversation hierarchy',
  'NARRATIVE': 'The Tryverse Chronicles — TRIVERSE manuscript birth',
  'LIFE': 'luisblanco.dev',
  'CONSTELLATION': 'Recursive MoA — "MoA of MoAs"',
};

for (const c of concepts) {
  const spineConceptName = CLUSTER_SPINE[c.cluster];
  if (!spineConceptName) continue;
  const spineId = findId(spineConceptName);
  if (!spineId || c.id === spineId) continue;
  /* non-spine members implement or refine their cluster spine */
  addEdge(c.id, spineId, 'implements', 0.3, `cluster-spine: ${c.cluster}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   D. FINAL: write back into concept.links
   ═══════════════════════════════════════════════════════════════════════════ */
const flatEdges = [];
for (const e of edgeSet.values()) flatEdges.push(e);

const idToC = new Map(concepts.map(c => [c.id, c]));
for (const e of flatEdges) {
  const c = idToC.get(e.source);
  if (!c) continue;
  const list = c.links[e.type] || (c.links[e.type] = []);
  if (!list.includes(e.target)) list.push(e.target);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(concepts, null, 2));
fs.writeFileSync(EDGE_FILE, JSON.stringify(flatEdges, null, 2));

/* ── report ── */
const typeCounts = {};
for (const e of flatEdges) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;

const nodeEdgeCounts = {};
for (const e of flatEdges) nodeEdgeCounts[e.source] = (nodeEdgeCounts[e.source] || 0) + 1;
const orphans = concepts.filter(c => !nodeEdgeCounts[c.id]).length;
const dense = Object.entries(nodeEdgeCounts).filter(([_, n]) => n > 20).length;
const spineEdges = flatEdges.filter(e => e.reason && !e.reason.startsWith('cluster') && !e.reason.startsWith('source')).length;
const coEdges = flatEdges.filter(e => e.reason && e.reason.startsWith('source')).length;
const clusterEdges = flatEdges.filter(e => e.reason && e.reason.startsWith('cluster')).length;

console.log('=== PHASE 3 EDGE INFERENCE REPORT ===');
console.log('Total edges:', flatEdges.length);
console.log('  Spine edges (idea-lines + era-bridges):', spineEdges);
console.log('  Source co-occurrence edges:', coEdges);
console.log('  Cluster-spine structural edges:', clusterEdges);
console.log('Orphan nodes (0 outgoing edges):', orphans);
console.log('Dense nodes (>20 outgoing edges):', dense);
console.log('\nEdge type distribution:');
for (const [t, n] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.padEnd(15)} ${n}`);
}
console.log('\nSpine misses printed above as [SPINE MISS]');
console.log('\nWrote:', OUT_FILE);
console.log('       ', EDGE_FILE);
