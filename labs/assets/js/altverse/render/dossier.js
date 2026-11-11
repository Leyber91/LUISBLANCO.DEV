/* ============================================================
   altverse/render/dossier.js — stage cards, the ledger, and the
   evidence footer. Every number carries its unit, a REAL or
   ILLUSTRATIVE tag and a source key; every item its ladder tag,
   its cause and who wrote it.
   ============================================================ */

import { STAGES, STAGE_ORDER } from '../config.js';
import { SOURCES, SOURCE_ORDER } from '../sources.js';
import { fmtYear } from '../classify.js';
import { esc, el } from './svg.js';

export function fmtNum(v, digits = 3) {
  if (typeof v === 'string') return v;
  if (v == null || !Number.isFinite(v)) return v === Infinity ? 'never' : '-';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(2).replace('e+', 'e');
  if (a >= 100) return Math.round(v).toLocaleString('en-US');
  return Number(v.toPrecision(digits)).toString();
}

const routeName = (r) => r === 'engine' ? 'engine' : r === 'ollama' ? 'local model' : r === 'own-key' ? 'your key' : r === 'pollinations' ? 'public route' : r === 'worker' ? 'worker' : r === 'offline' ? 'no route' : r || 'engine';

function itemsHTML(items) {
  if (!items || !items.length) return '';
  return '<ul class="its">' + items.map((i) =>
    `<li><span class="id">${esc(i.id)}</span>${esc(i.text || i.theirs || '')}<span class="lad ${esc(i.ladder)}">${esc(i.ladder)}</span>` +
    `<span class="cz">from ${esc(i.cause || '-')} <span class="by ${i.origin === 'model' ? 'model' : ''}">&middot; ${i.origin === 'model' ? 'model, validated' : 'engine'}</span>${i.src ? ` &middot; src ${esc(i.src)}` : ''}</span></li>`).join('') + '</ul>';
}

function quantTable(qs) {
  if (!qs || !qs.length) return '';
  return '<div class="scroll-x"><table class="qtab"><thead><tr><th>quantity</th><th>here</th><th>ours</th><th>tag</th></tr></thead><tbody>' + qs.map((q) =>
    `<tr><td>${esc(q.name)}<span class="how">${esc(q.how)} &middot; ${esc(q.src)}</span></td><td class="v">${fmtNum(q.theirs, q.digits)} ${esc(q.unit)}</td><td class="o">${fmtNum(q.ours, q.digits)}</td><td><span class="tag ${q.tag === 'REAL' ? 'real' : 'ill'}">${q.tag}</span></td></tr>`).join('') + '</tbody></table></div>';
}

export function renderDossier(host, w, { onRerun } = {}) {
  host.innerHTML = '';
  const traceOf = (s) => [...(w.trace || [])].reverse().find((t) => t.stage === s);
  STAGES.forEach((meta) => {
    const s = meta.id, st = w.stages[s];
    if (!st) return;
    const tr = traceOf(s) || {};
    const card = el('section', `card${st.pruned ? ' pruned' : ''}`);
    const rt = st.pruned ? 'pruned' : `${routeName(tr.route)}${tr.model ? ' ' + esc(tr.model) : ''}${tr.ms ? ' &middot; ' + (tr.ms >= 1000 ? (tr.ms / 1000).toFixed(1) + ' s' : tr.ms + ' ms') : ''}`;
    let body = `<div class="card-h"><h3>${esc(meta.label)}</h3><span class="r">${rt}</span></div><p class="role">${esc(meta.role)}</p>`;
    if (st.pruned) { body += `<p class="sum">${esc(st.pruned)}</p>`; card.innerHTML = body; host.appendChild(card); return; }
    if (st.summary) body += `<p class="sum">${esc(st.summary)}${st.summaryOrigin === 'model' ? ' <span class="by model" style="font-size:9px;color:var(--accretion-soft)">(model)</span>' : ''}</p>`;
    if (s === 'divergence') {
      const r = st.reading;
      body += `<table class="qtab"><tbody><tr><td>rule families</td><td class="v">${esc(r.family.join(', '))}</td></tr><tr><td>reading</td><td class="v" style="white-space:normal">${esc(r.label)}</td></tr><tr><td>takes hold</td><td class="v">${esc(fmtYear(r.year))}</td></tr><tr><td>matched</td><td class="v" style="white-space:normal">${esc(r.matched.join(', '))}</td></tr><tr><td>confidence</td><td class="v">${r.confidence}</td></tr></tbody></table>`;
      if (st.notes && st.notes.length) body += '<ul class="its">' + st.notes.map((n) => `<li>${esc(n)}</li>`).join('') + '</ul>';
    }
    if (st.quantities) body += quantTable(st.quantities);
    if (s === 'physics' && st.nuclides) {
      const alive = st.nuclides.filter((n) => n.bound).map((n) => `${n.sym}-${n.A}`);
      body += `<p class="nm-list">nuclides still bound: <b>${esc(alive.join(', ') || 'none')}</b> of ${st.nuclides.length} tested. Check: at our alpha the same test leaves only beryllium-8 unbound, which matches the measured record (unbound by 0.09 MeV). [REAL data, ILLUSTRATIVE first-order shift]</p>`;
    }
    if (s === 'geography') {
      body += `<p class="nm-list">regions: ${st.regions.map((r) => `<b>${esc(r.name)}</b> (${esc(r.kind)}${r.origin === 'model' ? ', named by the model' : ''})`).join(', ') || 'none'}<br>settlements: ${st.settlements.slice(0, 10).map((x) => esc(x.name)).join(', ')}${st.settlements.length > 10 ? ` and ${st.settlements.length - 10} more` : ''}</p>`;
    }
    if (s === 'history') {
      const ev = st.events;
      const counts = ['divergence', 'new', 'changed', 'shifted', 'model', 'kept', 'inherited'].map((k) => [k, ev.filter((e) => e.kind === k).length]).filter(([, n]) => n);
      body += `<p class="nm-list">${counts.map(([k, n]) => `${k} <b>${n}</b>`).join(' &middot; ')} &middot; removed <b>${st.removed.length}</b><br>eras: ${st.eras.map((e) => esc(e.name)).join(' / ')}</p>`;
      body += itemsHTML(ev.filter((e) => ['new', 'changed', 'model', 'divergence'].includes(e.kind)).map((e) => ({ ...e, text: `${fmtYear(e.year)}: ${e.title}${e.text && e.kind !== 'divergence' ? '. ' + e.text : ''}` })));
    }
    if (s === 'technology' && st.ladder) {
      body += '<div class="scroll-x"><table class="qtab"><thead><tr><th>invention</th><th>here</th><th>ours</th><th>shift</th></tr></thead><tbody>' + st.ladder.map((r) =>
        `<tr><td>${esc(r.name)}</td><td class="v">${r.theirs == null ? 'never' : esc(fmtYear(r.theirs))}</td><td class="o">${esc(fmtYear(r.ours))}</td><td class="${r.delta ? 'v' : 'o'}">${r.theirs == null ? '-' : r.delta ? (r.delta > 0 ? '+' : '') + r.delta + ' yr' : '0'}</td></tr>`).join('') + '</tbody></table></div>';
    }
    if (s === 'culture' && st.peoples) {
      body += '<ul class="its">' + st.peoples.map((p) => `<li><b style="color:var(--text-bright);font-weight:500">${esc(p.name)}</b>${p.origin === 'model' ? ' <span class="by model">model</span>' : ''}, ${esc(p.region)}: ${esc(p.traits.join(', '))}. <span class="cz">${esc(p.note || p.text)}</span></li>`).join('') + '</ul>';
    }
    if (s !== 'history') body += itemsHTML(st.items);
    if (st.notModelled && st.notModelled.length) body += '<p class="nm-list" style="margin-top:8px">not modelled: ' + st.notModelled.map(esc).join(' ') + '</p>';
    card.innerHTML = body;
    if (onRerun && s !== 'divergence') {
      const b = el('button', 'ghost rerun', 'ask the model for this stage only');
      b.type = 'button'; b.title = 'One call; the other stages keep what they have.';
      b.addEventListener('click', () => onRerun(s));
      card.appendChild(b);
    }
    host.appendChild(card);
  });
}

export function renderLedger(host, w, { onPlant } = {}) {
  const L = w.ledger || { checks: [], passed: 0, total: 0 };
  host.innerHTML = '';
  const left = el('div', 'card');
  left.innerHTML = `<div class="card-h"><h3>consistency</h3><span class="r">${L.passed}/${L.total} pass</span></div>` +
    L.checks.map((c) => `<div class="chk ${c.status}"><span class="s">${c.status === 'pass' ? 'PASS' : 'FLAG'}</span><span>${esc(c.rule)}<span class="n">${esc(c.note)}</span></span></div>`).join('');
  // the three weakest hops: where certainty falls furthest from cause to claim
  const RANK = { ESTABLISHED: 0, THEORETICAL: 1, SPECULATIVE: 2, SF: 3 };
  const idx = new Map([['dv', { ladder: 'ESTABLISHED', text: w.spec.text }]]);
  Object.values(w.stages).forEach((st) => { (st.items || []).forEach((i) => idx.set(i.id, i)); (st.events || []).forEach((e) => idx.set(e.id, { ...e, text: e.title })); });
  const hops = [...idx.entries()].filter(([, i]) => i.cause && idx.get(i.cause)).map(([id, i]) => ({ id, i, c: idx.get(i.cause), drop: RANK[i.ladder] - RANK[idx.get(i.cause).ladder] }))
    .filter((h) => h.drop > 0).sort((a, b) => b.drop - a.drop || RANK[b.i.ladder] - RANK[a.i.ladder]).slice(0, 3);
  if (hops.length) {
    left.innerHTML += `<div class="card-h" style="margin-top:12px"><h3>weakest links</h3><span class="r">largest drops in certainty</span></div>` +
      hops.map((h) => `<div class="weak">${esc(String(h.c.text || h.i.cause).slice(0, 70))} <span class="lad">[${h.c.ladder}]</span> &rarr; ${esc(String(h.i.text || h.id).slice(0, 90))} <span class="lad">[${h.i.ladder}]</span><br><span class="lad">${esc(h.id)}: ${h.i.ladder === 'SF' ? 'fiction on a real framework from here' : h.i.ladder === 'SPECULATIVE' ? 'plausible, not settled; the engine says what it assumed' : 'a published mechanism applied beyond its tested range'}</span></div>`).join('');
  }
  const right = el('div', 'card');
  const rej = w.rejected || [], rep = w.repaired || [];
  const m = w.model;
  const head = m && m.done ? `${routeName(m.route)}${m.model ? ' ' + esc(m.model) : ''} &middot; ${m.mode} &middot; ${m.calls} call${m.calls === 1 ? '' : 's'}` : 'no model reply yet';
  right.innerHTML = `<div class="card-h"><h3>rejected and repaired</h3><span class="r">${head}</span></div>` +
    (rej.length ? rej.map((r) => `<div class="rej"><span class="st">${esc(r.stage)}</span><span class="rule">${esc(r.rule)}</span>${r.at ? `<code>${esc(r.at)}</code> ` : ''}${esc(r.reason)}<q>${esc(r.item)}</q></div>`).join('') : `<p class="empty">${m && m.done ? 'Nothing rejected.' : 'The engine wrote this world. A model reply passes rules R1 to R10 before any line joins it: shape, ladder tag, a cause that exists, causes upstream and earlier in time, dates after the branch point, stated numbers that match the physics, no contradiction of the divergence, no claim more certain than its cause, no restatement, no ESTABLISHED tag without a source of record.'}</p>`) +
    (rep.length ? '<div class="card-h" style="margin-top:10px"><h3>repaired</h3><span class="r"></span></div>' + rep.map((r) => `<div class="rej"><span class="st">${esc(r.stage)}</span><span class="rule">${esc(r.rule)}</span>${r.at ? `<code>${esc(r.at)}</code> ` : ''}${esc(r.note)}<q>${esc(r.item)}</q></div>`).join('') : '');
  const btn = el('button', 'ghost', 'feed the validator a planted bad reply');
  btn.type = 'button'; btn.style.marginTop = '10px';
  btn.addEventListener('click', () => onPlant && onPlant());
  right.appendChild(btn);
  host.append(left, right);
}

export function renderFoot(host, w, tierNote) {
  const used = new Set();
  STAGE_ORDER.forEach((s) => { const st = w.stages[s]; if (!st) return; (st.items || []).forEach((i) => i.src && used.add(i.src)); (st.quantities || []).forEach((q) => q.src && used.add(q.src)); });
  const order = [...SOURCE_ORDER.filter((k) => used.has(k)), ...SOURCE_ORDER.filter((k) => !used.has(k))];
  const nm = (w.stages.physics.notModelled || []);
  host.innerHTML = `
    <div>
      <h4>What is real and what is illustrative</h4>
      <div class="tg"><i></i><span><b>[REAL]</b> physical constants and baseline values with their sources; textbook formulas evaluated here (escape velocity, scale height, the rocket equation, Coriolis, tidal scaling, insolation by latitude); the 1/g law for mountain height; the hydraulic tree-height limit; CO2 forcing; nuclear binding energies (AME2020); our chronology and invention dates; the hotspot locations.</span></div>
      <div class="tg il"><i></i><span><b>[ILLUSTRATIVE]</b> the Earth-analog terrain and its noise; the energy-balance coefficients (calibrated to our 14.5 C); seasonal amplitude factors; the chosen ice density; the first-order Coulomb shift in nuclei; the 70% fading propagation of invention shifts; settlement and route placement; names; every SPECULATIVE or SF item.</span></div>
      <h4 style="margin-top:12px">What the engine does not model</h4>
      <ul style="margin:0;padding-left:16px">
        <li>Evolution's contingency. Where toolmakers exist, it keeps our sequence as a scaffold and moves what its rules move.</li>
        <li>Ocean currents, clouds and land-sea contrast beyond a seasonal factor.</li>
        <li>Plate tectonics under a different history; continents stay where ours are.</li>
        <li>Politics, economies and individual people, beyond a few generic rules. A model pass writes those, and the validator checks them.</li>
        ${nm.map((x) => `<li>${esc(x)}</li>`).join('')}
      </ul>
    </div>
    <div>
      <h4>Sources</h4>
      <ol>${order.map((k) => `<li><span class="src-k">${esc(k)}</span> ${esc(SOURCES[k])}</li>`).join('')}</ol>
    </div>
    <div class="perf">${esc(tierNote)} &middot; model access only through the site's shared route (local Ollama, your own key, or the public route at one reply per 45 s per IP); no key lives in this page.</div>`;
}
