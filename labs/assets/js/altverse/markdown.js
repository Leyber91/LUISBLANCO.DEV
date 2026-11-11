/* ============================================================
   altverse/markdown.js — the one-page causal dossier a visitor
   takes away: the divergence, the computed quantities with their
   formulas and tags, each contrast as a causal chain in sentences,
   the changed chronology, the ledger, and the sources cited.
   ============================================================ */

import { STAGE_ORDER } from './config.js';
import { SOURCES } from './sources.js';
import { fmtYear } from './classify.js';
import { fmtNum } from './render/dossier.js';
import { shareURL } from './tree.js';

export function toMarkdown(w, tree) {
  const L = [];
  const idx = new Map([['dv', { text: w.spec.text, cause: null, ladder: 'ESTABLISHED' }]]);
  STAGE_ORDER.forEach((s) => { const st = w.stages[s]; if (!st) return; (st.items || []).forEach((i) => idx.set(i.id, i)); (st.events || []).forEach((e) => idx.set(e.id, { text: `${fmtYear(e.year)}: ${e.title}`, cause: e.cause, ladder: e.ladder })); });
  const chain = (id) => { const out = []; let c = id, g = 0; while (c && g++ < 10) { const n = idx.get(c); if (!n) break; out.push(`${n.text} [${n.ladder}]`); c = n.cause; } return out; };
  const used = new Set();

  L.push(`# ${w.name}`, '', `*${w.motto}*`, '');
  L.push(`**Divergence:** ${w.spec.text}  `, `**Read as:** ${w.spec.label}, from ${fmtYear(w.spec.year)}  `);
  if (w.path.length > 1) L.push(`**Fork path:** ${w.path.map((p) => p.text).join(' / then: ')}  `);
  L.push(`**Written by:** the Altverse engine${w.model && w.model.done && w.model.route !== 'offline' ? ` and ${w.model.route} ${w.model.model || ''} (validated)` : ''}  `, `**Replay:** ${shareURL(w)}`, '');

  const qs = [...(w.stages.physics.quantities || []), ...((w.stages.climate && w.stages.climate.quantities) || [])];
  if (qs.length) {
    L.push('## Computed quantities', '', '| quantity | here | ours | how | tag | source |', '|---|---|---|---|---|---|');
    qs.forEach((q) => { used.add(q.src); L.push(`| ${q.name} | ${fmtNum(q.theirs, q.digits)} ${q.unit} | ${fmtNum(q.ours, q.digits)} | ${q.how} | ${q.tag} | ${q.src} |`); });
    L.push('');
  }
  L.push('## How it differs, and why', '');
  (w.stages.contrast.items || []).forEach((c) => {
    L.push(`- **Ours:** ${c.ours}  `, `  **Here:** ${c.theirs}  `, `  because ${chain(c.cause).join(', because ')}`, '');
  });
  L.push('## Stage by stage', '');
  STAGE_ORDER.forEach((s) => {
    const st = w.stages[s]; if (!st || s === 'divergence') return;
    L.push(`### ${s}`, '', st.pruned ? `Pruned: ${st.pruned}` : (st.summary || ''), '');
    (st.items || []).forEach((i) => { if (i.src) used.add(i.src); L.push(`- \`${i.id}\` ${i.text} [${i.ladder}] (from \`${i.cause}\`, ${i.origin === 'model' ? 'model, validated' : 'engine'})`); });
    if (s === 'history') st.events.filter((e) => !['inherited', 'kept'].includes(e.kind)).forEach((e) => L.push(`- ${fmtYear(e.year)}: ${e.title} [${e.ladder}] (${e.kind}, from \`${e.cause}\`)`));
    L.push('');
  });
  const tl = (w.stages.technology && w.stages.technology.ladder) || [];
  if (tl.length) {
    L.push('## Inventions', '', '| invention | here | ours |', '|---|---|---|');
    tl.forEach((r) => L.push(`| ${r.name} | ${r.theirs == null ? 'never' : fmtYear(r.theirs)} | ${fmtYear(r.ours)} |`));
    L.push('');
  }
  const lg = w.ledger;
  if (lg) { L.push(`## Ledger: ${lg.passed}/${lg.total} checks pass`, ''); lg.checks.forEach((c) => L.push(`- ${c.status === 'pass' ? 'PASS' : 'FLAG'} ${c.rule}: ${c.note}`)); L.push(''); }
  if (w.rejected && w.rejected.length) { L.push('## Rejected model lines', ''); w.rejected.forEach((r) => L.push(`- ${r.stage} / ${r.rule}: ${r.reason}. "${r.item}"`)); L.push(''); }
  if (tree && tree.all().length > 1) { L.push('## The tree', ''); tree.all().forEach((n) => L.push(`${'  '.repeat(tree.depth(n.id))}- ${n.name}: ${n.path[n.path.length - 1].text}`)); L.push(''); }
  L.push('## Sources', '');
  [...used].filter((k) => SOURCES[k]).forEach((k) => L.push(`- ${SOURCES[k]}`));
  L.push('', 'Tags: ESTABLISHED, THEORETICAL, SPECULATIVE, SF. Terrain is an Earth-analog seeded for illustration; quantities follow the formulas named beside them.', '', 'luisblanco.dev/labs/altverse.html');
  return L.join('\n');
}
