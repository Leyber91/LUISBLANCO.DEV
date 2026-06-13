#!/usr/bin/env node
/* =========================================================================
   phase5-assemble.js — Build 7 part HTML files + concept_graph.json + index.
   Input:  work/02_assigned.json (or 03_with_edges.json if edges exist)
   Output: _reference/REGISTER/*.html + concept_graph.json
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const WORK = path.join(__dirname, 'work');
const EDGES_FILE = path.join(WORK, '03_with_edges.json');
const IN_FILE = fs.existsSync(EDGES_FILE) ? EDGES_FILE : path.join(WORK, '02_assigned.json');
const OUT_DIR = path.join(__dirname, '..', '_reference', 'REGISTER');
const GRAPH_FILE = path.join(__dirname, '..', 'src', 'core', 'concept_graph.json');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const PARTS = [
  { key:'I-ENTITY',       label:'I · ENTITY',       subtitle:'Autonomy, self-modification, the nature of systems that know themselves' },
  { key:'II-CONTINUITY',  label:'II · CONTINUITY',  subtitle:'Memory, persistence, essence passing across time and context' },
  { key:'III-COMPOSITION',label:'III · COMPOSITION',subtitle:'How parts become wholes — architecture, constellation, assembly' },
  { key:'IV-INTERFACE',   label:'IV · INTERFACE',   subtitle:'The internet as navigable astrophysics — LUMEN, Transit, the visible substrate' },
  { key:'V-CRAFT',        label:'V · CRAFT',        subtitle:'Prompting, compression, the artisan disciplines of AI interaction' },
  { key:'VI-LABORATORY',  label:'VI · LABORATORY',  subtitle:'Games as discovery engines — play, simulation, emergence' },
  { key:'VII-MEASURE',    label:'VII · MEASURE',    subtitle:'Honesty, energy-truth, token-EEG, the decoder and the open cracks' }
];

/* ── ensure output dirs ── */
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
const coreDir = path.dirname(GRAPH_FILE);
if (!fs.existsSync(coreDir)) fs.mkdirSync(coreDir, { recursive: true });

const concepts = readJSON(IN_FILE);

/* ── group by part ── */
const byPart = {};
for (const c of concepts) {
  const p = c.part || 'UNKNOWN';
  if (!byPart[p]) byPart[p] = [];
  byPart[p].push(c);
}

/* ── sort each part: tier S→A→B→C then name ── */
const tierOrder = { S:0, A:1, B:2, C:3, null:4 };
for (const p of Object.keys(byPart)) {
  byPart[p].sort((a, b) => {
    const ta = tierOrder[a.tier] ?? 4;
    const tb = tierOrder[b.tier] ?? 4;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });
}

/* ── build each part HTML ── */
const partNavItems = [];
for (const part of PARTS) {
  const items = byPart[part.key] || [];
  partNavItems.push(`<a href="${part.key.toLowerCase()}.html" class="reg-nav-item">${part.label} <span class="reg-count">${items.length}</span></a>`);

  const rows = items.map(c => {
    const tierBadge = c.tier ? `<span class="reg-tier tier-${c.tier.toLowerCase()}">${c.tier}</span>` : '';
    const eraTag = c.eras.length ? `<span class="reg-era">${c.eras.join(' ')}</span>` : '';
    const aliasStr = c.aliases.length ? `<div class="reg-alias">aka: ${esc(c.aliases.join(' · '))}</div>` : '';
    const statusStr = c.status ? `<span class="reg-status">${esc(c.status)}</span>` : '';
    return `
      <article class="reg-entry" id="${c.id}">
        <div class="reg-head">
          <span class="reg-id">${c.id}</span>
          ${tierBadge}
          ${statusStr}
          ${eraTag}
        </div>
        <h3 class="reg-name">${esc(c.name)}</h3>
        ${aliasStr}
        <p class="reg-essence">${esc(c.essence)}</p>
        <div class="reg-meta">
          <span class="reg-cluster">${esc(c.cluster)}</span>
          ${c.sources.length ? `<span class="reg-source">${esc(c.sources[0].split('/').pop())}</span>` : ''}
        </div>
      </article>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(part.label)} — The Register</title>
<style>
:root{ --bg:#06080d; --ink:#EAF0FB; --ink-dim:#9FB3D6; --faint:#565d72; --gold:#D4A24C; --gold-hi:#F0C674; --line-soft:rgba(234,240,251,0.16); }
*{box-sizing:border-box;} html,body{margin:0;padding:0;}
body{font-family:'IBM Plex Mono',monospace; font-size:13px; line-height:1.55; background:var(--bg); color:var(--ink); padding:40px 30px 80px;}
.reg-header{ max-width:900px; margin:0 auto 40px; border-bottom:1px solid var(--line-soft); padding-bottom:20px; }
.reg-header h1{ font-size:18px; letter-spacing:.12em; color:var(--gold); margin:0 0 8px; }
.reg-header p{ color:var(--ink-dim); margin:0; font-size:12px; }
.reg-nav{ display:flex; flex-wrap:wrap; gap:8px; max-width:900px; margin:0 auto 30px; }
.reg-nav-item{ color:var(--ink-dim); text-decoration:none; font-size:11px; letter-spacing:.06em; padding:4px 10px; border:1px solid var(--line-soft); border-radius:6px; transition:color .2s,border-color .2s; }
.reg-nav-item:hover{ color:var(--gold); border-color:var(--gold-dim); }
.reg-nav-item .reg-count{ color:var(--faint); margin-left:4px; }
.reg-grid{ max-width:900px; margin:0 auto; display:grid; gap:16px; }
.reg-entry{ border:1px solid var(--line-soft); border-radius:10px; padding:18px 20px; background:rgba(8,11,18,0.5); }
.reg-head{ display:flex; gap:10px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.reg-id{ font-size:10px; color:var(--faint); letter-spacing:.08em; }
.reg-tier{ font-size:9px; font-weight:600; padding:2px 7px; border-radius:4px; letter-spacing:.06em; }
.tier-s{ background:rgba(212,162,76,0.18); color:var(--gold-hi); }
.tier-a{ background:rgba(212,162,76,0.10); color:var(--gold); }
.tier-b{ background:rgba(234,240,251,0.08); color:var(--ink-dim); }
.tier-c{ background:rgba(234,240,251,0.05); color:var(--faint); }
.reg-status{ font-size:9px; color:var(--faint); letter-spacing:.06em; text-transform:uppercase; }
.reg-era{ font-size:9px; color:var(--faint); margin-left:auto; }
.reg-name{ font-size:14px; color:var(--ink); margin:0 0 6px; font-weight:500; }
.reg-alias{ font-size:10px; color:var(--faint); margin-bottom:8px; font-style:italic; }
.reg-essence{ font-size:12px; color:var(--ink-dim); margin:0 0 10px; line-height:1.6; }
.reg-meta{ display:flex; gap:12px; font-size:10px; color:var(--faint); }
.reg-cluster{ text-transform:uppercase; letter-spacing:.08em; }
.reg-source{ color:var(--faint); }
.back{ display:inline-block; margin-top:30px; color:var(--gold); text-decoration:none; font-size:11px; letter-spacing:.1em; }
.back:hover{ text-decoration:underline; }
</style>
</head>
<body>
<div class="reg-header">
  <h1>${esc(part.label)}</h1>
  <p>${esc(part.subtitle)}</p>
</div>
<nav class="reg-nav">
  ${PARTS.map(p => `<a href="${p.key.toLowerCase()}.html" class="reg-nav-item"${p.key===part.key?' style="border-color:var(--gold);color:var(--gold);"':''}>${p.label} <span class="reg-count">${byPart[p.key]?.length||0}</span></a>`).join('')}
</nav>
<div class="reg-grid">
  ${rows || '<p style="color:var(--faint)">No entries assigned to this part yet.</p>'}
</div>
<a class="back" href="register_index.html">← REGISTER INDEX</a>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_DIR, `${part.key.toLowerCase()}.html`), html);
  console.log(`Wrote: ${part.key.toLowerCase()}.html (${items.length} entries)`);
}

/* ── build register_index.html ── */
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Register — Paradigm Book Index</title>
<style>
:root{ --bg:#06080d; --ink:#EAF0FB; --ink-dim:#9FB3D6; --faint:#565d72; --gold:#D4A24C; --gold-hi:#F0C674; --line-soft:rgba(234,240,251,0.16); }
*{box-sizing:border-box;} html,body{margin:0;padding:0;}
body{font-family:'IBM Plex Mono',monospace; font-size:13px; line-height:1.55; background:var(--bg); color:var(--ink); padding:40px 30px 80px;}
.reg-header{ max-width:700px; margin:0 auto 50px; text-align:center; }
.reg-header h1{ font-size:22px; letter-spacing:.16em; color:var(--gold); margin:0 0 12px; }
.reg-header p{ color:var(--ink-dim); margin:0; font-size:12px; max-width:520px; margin-left:auto; margin-right:auto; }
.reg-parts{ max-width:700px; margin:0 auto; display:grid; gap:14px; }
.reg-part-link{ display:block; text-decoration:none; border:1px solid var(--line-soft); border-radius:12px; padding:22px 24px; background:rgba(8,11,18,0.5); transition:border-color .25s,background .25s; }
.reg-part-link:hover{ border-color:var(--gold-dim); background:rgba(10,14,22,0.7); }
.reg-part-head{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; }
.reg-part-label{ font-size:14px; color:var(--ink); letter-spacing:.06em; }
.reg-part-count{ font-size:11px; color:var(--faint); }
.reg-part-sub{ font-size:11px; color:var(--ink-dim); line-height:1.5; }
</style>
</head>
<body>
<div class="reg-header">
  <h1>THE REGISTER</h1>
  <p>Canonical index of concepts across the paradigm book. 7 parts. One entry per idea. Typed edges map the dependencies.</p>
</div>
<div class="reg-parts">
  ${PARTS.map(p => {
    const count = byPart[p.key]?.length || 0;
    return `<a class="reg-part-link" href="${p.key.toLowerCase()}.html">
      <div class="reg-part-head"><span class="reg-part-label">${esc(p.label)}</span><span class="reg-part-count">${count} entries</span></div>
      <div class="reg-part-sub">${esc(p.subtitle)}</div>
    </a>`;
  }).join('\n')}
</div>
</body>
</html>`;

fs.writeFileSync(path.join(OUT_DIR, 'register_index.html'), indexHtml);
console.log('Wrote: register_index.html');

/* ── build concept_graph.json ── */
const nodes = concepts.map(c => ({
  id: c.id,
  name: c.name,
  part: c.part,
  cluster: c.cluster,
  tier: c.tier,
  status: c.status
}));

const edges = [];
for (const c of concepts) {
  for (const [type, targets] of Object.entries(c.links || {})) {
    for (const tid of targets) {
      if (tid && tid.startsWith && tid.startsWith('CX-')) {
        edges.push({ source: c.id, target: tid, type, weight: 0.5 });
      }
    }
  }
}

const graph = { meta: { built: new Date().toISOString(), nodeCount: nodes.length, edgeCount: edges.length }, nodes, edges };
fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));
console.log(`Wrote: ${path.relative(process.cwd(), GRAPH_FILE)} (${nodes.length} nodes, ${edges.length} edges)`);

/* ── summary ── */
console.log('\n=== PHASE 5 ASSEMBLE REPORT ===');
console.log('Part files:', PARTS.length);
console.log('Total nodes:', nodes.length);
console.log('Total edges:', edges.length);
for (const p of PARTS) {
  console.log(`  ${p.label.padEnd(18)} ${byPart[p.key]?.length || 0} entries`);
}
