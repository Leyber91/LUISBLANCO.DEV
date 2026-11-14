/* ============================================================
   honesty-decoder/view/tools.js — below the deck, loaded after the
   first paint: decode any claim (rule engine, and one model call on
   request), compare two systems, score the engine and the model on
   the held-out gold half, the corrections log, the limits, the full
   method, the export, and the guided walk-through.
   ============================================================ */

import { esc, fmt, sgn, mark, vclass } from './util.js';
import { SCHEMA_VERSION, METHOD_VERSION, METHOD_DATE, TYPE_ORDER, TYPES, FORMULA, CITATIONS } from '../config.js';
import { CORRECTIONS } from '../history.js';
import { engineSubs } from '../model.js';

const EXAMPLE = 'Token EKG streams a live model on load and timestamps every token in real time: real telemetry of the serving pipeline.';

export function mountTools(app, tools, record) {
  const E = app.E;
  const st = {
    claim: EXAMPLE, lab: 'auto',
    eng: [], mod: null, modInfo: null, busy: false,
    score: null, scoreModel: null,
  };

  /* restore a shared paste */
  if (app.pastedHash) {
    try {
      const x = JSON.parse(decodeURIComponent(escape(atob(app.pastedHash))));
      st.claim = x.c || EXAMPLE; st.lab = x.l || 'auto';
      st.eng = (x.s || []).map((s) => ({ text: s.t, type: s.y, use: s.u !== 0, src: 'engine' }));
    } catch { /* a bad link: start fresh */ }
  }
  if (!st.eng.length) st.eng = engineSubs(st.claim).map((s) => ({ ...s, use: true, src: 'engine' }));

  tools.innerHTML = `
    <section class="panel paste" id="t-paste" aria-labelledby="t-paste-h">
      <h2 id="t-paste-h">Decode any claim</h2>
      <p>Paste a claim about one of these labs. The rule engine splits and types it at once; the model splits it too on request (one call through the site's model route). Each piece takes a verdict only when it matches a checked sub-claim of that lab; the rest read "no evidence in this lab".</p>
      <label class="sr" for="t-claim">claim</label><textarea id="t-claim" spellcheck="false"></textarea>
      <div class="row">
        <label for="t-lab" class="rk">about</label><select id="t-lab"></select>
        <button class="btn" type="button" id="t-dec">decode</button>
        <button class="btn" type="button" id="t-ask">ask the model too</button>
        <button class="btn" type="button" id="t-share">copy a link to this</button>
        <span class="rk" id="t-route"></span>
      </div>
      <div class="cols"><div class="col" id="t-eng"></div><div class="col" id="t-mod"></div></div>
      <div class="pfig" id="t-fig"></div>
    </section>
    <section class="panel cmp" id="t-cmp" aria-labelledby="t-cmp-h">
      <h2 id="t-cmp-h">Compare</h2>
      <p>Two receipts side by side, sub-claims aligned by type.</p>
      <div class="row"><label for="t-cmp-b" class="rk">against</label> <select id="t-cmp-b"></select></div>
      <div class="scroll" id="t-cmp-t"></div>
    </section>
    <section class="panel score" id="t-score" aria-labelledby="t-score-h">
      <h2 id="t-score-h">Score the decomposition</h2>
      <p>A gold set of 56 claims about these labs, each with annotated sub-claims (gold.js), split by id into a tuning half and a held-out half. The rule engine was tuned on the tuning half only. A predicted sub-claim matches a gold one when they share at least half of their combined content words (Jaccard 0.5 on stemmed words, stop words removed), one to one, greedy by similarity.</p>
      <div class="row"><button class="btn" type="button" id="t-sc-m">score the model too (one call for all ${0} claims)</button><span class="rk" id="t-sc-r"></span></div>
      <div class="scroll" id="t-sc-t"></div>
    </section>
    <section class="panel log" id="t-log" aria-labelledby="t-log-h">
      <h2 id="t-log-h">Corrections</h2>
      <p>Every change to a row's figure or text since the G0 page, and every check in this browser that disagreed with the grading.</p>
      <div class="scroll" id="t-log-t"></div>
    </section>`;

  record.innerHTML = `
    <section class="panel" id="limits" aria-labelledby="lim-h">
      <h2 id="lim-h">What this cannot catch</h2>
      <ol>
        <li><b>Implicature.</b> "a live biosignal" (Token EKG) implies a body to read; the decoder scores the trace and leaves the implication in framing. <button class="btn" type="button" data-show="token-ekg:te.draw">show</button></li>
        <li><b>Framing.</b> "into an organism" (Primordial Seed) is shown and never scored, so a metaphor that sells the lab costs it nothing. <button class="btn" type="button" data-show="primordial-seed:ps.organism">show</button></li>
        <li><b>Omitted claims.</b> Exomania's blurb never says that some catalogue masses are upper limits shown as measurements; no sub-claim exists to fail. <button class="btn" type="button" data-show="exomania:ex.nasa">show</button></li>
        <li><b>The choice of claims.</b> Only the hub blurb is graded. Personalized Plans' own page says it is powered by a hosted model; that sentence is not in its blurb and is not graded here. <button class="btn" type="button" data-show="workout-plans:wp.model">show</button></li>
        <li><b>A line is not a run.</b> A code check proves the cited line is deployed, not that it executes; lab-state and reference checks cover a subset (Black Hole's shadow edge, Token EKG's timer). <button class="btn" type="button" data-show="black-hole:bh.lens">show</button></li>
        <li><b>Weights are judgement.</b> One grader set them; the FActScore column shows what equal weights and no partial credit would give. <button class="btn" type="button" data-show="the-figure:fg.live">show</button></li>
      </ol>
    </section>
    <section class="panel method-long" id="method" aria-labelledby="m-h">
      <h2 id="m-h">Method, version ${METHOD_VERSION}, ${METHOD_DATE}</h2>
      <p><b>The claim</b> is the lab's hub blurb, read from site.config.js when the page loads. The grader split it into atomic sub-claims, one per independently checkable property, each tied to a phrase of the blurb. If a phrase disappears from the blurb, the row reads stale.</p>
      <p><b>Verdicts.</b> Supported: the code does what the phrase says, read literally. Partial: the code does a weaker, narrower or conditional version. Unsupported: it does not. Framing (metaphor, persona, evaluation) is shown and never scored.</p>
      <p><b>Checks.</b> A verdict enters the figure only when a check backs it: the cited lines fetched from the deployed file (SHA-256 compared with the snapshot, so the commit is named); the lab loaded in a hidden frame in a stated state and a value read from it; the lab's own module imported and compared with a published value; or the model calls a run needs against what the answering route allows (1 reply per 45 s on the public route). A check that fails or cannot run makes its sub-claim unverified, at once. Code inspection of a file the site does not serve is verified by the repository test. Author assertions never enter the figure.</p>
      <p><b>The figure</b>: ${esc(FORMULA.point)}. ${esc(FORMULA.low)}. ${esc(FORMULA.high)}. The most sensitive sub-claim is the one whose move to the opposite end changes the figure most.</p>
      <p><b>Cross-check</b>: ${esc(FORMULA.factscore)}. The decoder departs from that method in four ways: (1) sub-claims carry weights; (2) a partial verdict earns half credit; (3) the knowledge source is the lab's code, its running state and published values, not a reference corpus; (4) unverified sub-claims stay out of the point figure instead of counting as unsupported. When the two figures differ by more than 10 points the receipt names the sub-claim that drives the gap.</p>
      <p><b>Shared components</b> (the public route, provider.js, Google Fonts) hold one verdict used by every row that cites them; the ledger counts contradictions between rows, and the bar is 0.</p>
      <p><b>Export</b>: the full table, schema ${SCHEMA_VERSION}. <button class="btn" type="button" id="x-json">download JSON</button> <button class="btn" type="button" id="x-csv">download CSV</button></p>
      <p><b>Sources</b>: ${CITATIONS.map(esc).join(' ')}</p>
    </section>`;

  const $ = (id) => document.getElementById(id);
  const counted = app.systems.filter((s) => s.kind === 'lab' && s.row);
  $('t-claim').value = st.claim;
  $('t-lab').innerHTML = `<option value="auto">nearest lab (by keyword)</option>` + counted.map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
  $('t-lab').value = st.lab;
  $('t-cmp-b').innerHTML = `<option value="__paste">the decoded claim above</option>` + app.systems.filter((s) => s.row).map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');

  /* ------------------------------------------------------------ paste */
  const labOf = () => {
    if (st.lab !== 'auto') return app.byId[st.lab];
    const n = E.nearestLab(st.claim, counted.map((s) => s.row), Object.fromEntries(counted.map((s) => [s.id, s.title])));
    return n && n.score > 0 ? app.byId[n.id] : null;
  };
  const working = () => [...st.eng, ...(st.mod || [])].filter((x) => x.use);
  const save = () => {
    try {
      app.pastedState = btoa(unescape(encodeURIComponent(JSON.stringify({ c: st.claim, l: st.lab, s: working().map((x) => ({ t: x.text, y: x.type })) }))));
      app.writeHash();
    } catch { /* too long for a link */ }
  };

  function itemHTML(x, k, col, diff) {
    const sys = labOf();
    const g = x.type === 'framing' ? null : E.ground(x.text, sys?.row);
    const eff = g ? E.effective(g.sub, app.results, app.route) : null;
    const cls = x.type === 'framing' ? 'v-frm' : eff ? vclass(eff) : 'v-unv';
    const verdict = x.type === 'framing' ? 'framing: not checkable' : g ? `${eff.verdict}: matches "${g.sub.phrase}" (${sys.title})` : `no evidence in this lab${sys ? '' : ': pick a lab'}`;
    return `<div class="ps ${diff || ''}${x.use ? '' : ' unpicked'}" data-col="${col}" data-k="${k}">
      ${mark(cls, verdict)}
      <span class="t" contenteditable="true" spellcheck="false" data-edit="${col}:${k}" aria-label="sub-claim text">${esc(x.text)}</span>
      <span class="m"><select data-type="${col}:${k}" aria-label="type">${TYPE_ORDER.map((t) => `<option${t === x.type ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <span>${esc(verdict)}</span>${x.evidence ? `<span>settle it: ${esc(x.evidence)}</span>` : ''}
        <span class="acts"><label><input type="checkbox" data-use="${col}:${k}"${x.use ? ' checked' : ''}> use</label><button type="button" data-split="${col}:${k}">split</button><button type="button" data-merge="${col}:${k}">merge next</button><button type="button" data-del="${col}:${k}">remove</button></span></span>
    </div>`;
  }

  function renderPaste() {
    const sys = labOf();
    const pairs = st.mod ? E.matchSets(st.eng, st.mod, 0.5) : [];
    const engMatched = new Map(pairs.map((p) => [p.i, p]));
    const modMatched = new Map(pairs.map((p) => [p.j, p]));
    const added = st.mod ? st.mod.filter((_, j) => !modMatched.has(j)).length : 0;
    const changed = pairs.filter((p) => p.s < 1).length;
    const dropped = st.mod ? st.eng.filter((_, i) => !engMatched.has(i)).length : 0;
    $('t-eng').innerHTML = `<h3><span>rule engine</span><span>${st.eng.length}</span></h3>` + st.eng.map((x, k) => itemHTML(x, k, 'eng', st.mod && !engMatched.has(k) ? 'diff-chg' : '')).join('');
    $('t-mod').innerHTML = st.mod
      ? `<h3><span>model · ${esc(st.modInfo.source)}${st.modInfo.model ? ` · ${esc(st.modInfo.model)}` : ''}</span><span>${st.mod.length}</span></h3>` +
        `<p class="rk">${st.modInfo.valid ? `added ${added} · changed ${changed} · dropped ${dropped}` : esc(st.modInfo.why)}</p>` +
        st.mod.map((x, k) => itemHTML(x, k, 'mod', !modMatched.has(k) ? 'diff-add' : modMatched.get(k).s < 1 ? 'diff-chg' : '')).join('')
      : `<h3><span>model</span><span>—</span></h3><p class="rk">${st.busy ? 'asking the model: one call' : 'not asked yet: press "ask the model too"'}</p>`;
    const w = working().map((x) => ({ text: x.text, type: x.type }));
    const res = E.scorePasted(w, sys?.row, app.results, app.route);
    const f = res.fig;
    const grounded = res.items.filter((i) => i.ground).length;
    $('t-fig').innerHTML = `<span class="n">${f.point != null ? fmt(f.point) : '—'}</span>
      <span>${sys ? `about <b>${esc(sys.title)}</b>` : 'no lab found: pick one'} · ${w.length} sub-claims in use · ${grounded} grounded in its checks · ${res.items.filter((i) => !i.ground && i.type !== 'framing').length} with no evidence in this lab</span>
      ${f.point != null ? `<span>interval <b>${fmt(f.low)} to ${fmt(f.high)}</b> · FActScore ${fmt(f.factscore)}${res.sens ? ` · most sensitive: "${esc(w[Number(res.sens.id.slice(1))]?.text || '')}" (${sgn(res.sens.delta)} pts)` : ''}</span>` : '<span>no piece matched a checked sub-claim, so no figure: the interval is the whole scale</span>'}`;
    $('t-route').textContent = `route: ${app.route}${app.routeAnswered ? ` (answered ${app.routeAnswered.route})` : ''}`;
    bindPaste();
    save();
  }

  function bindPaste() {
    const at = (v) => { const [c, k] = v.split(':'); return { list: c === 'eng' ? st.eng : st.mod, k: Number(k) }; };
    tools.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('change', () => { const { list, k } = at(b.dataset.use); list[k].use = b.checked; renderPaste(); }));
    tools.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('change', () => { const { list, k } = at(b.dataset.type); list[k].type = b.value; renderPaste(); }));
    tools.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('blur', () => { const { list, k } = at(b.dataset.edit); const t = b.textContent.trim(); if (t && t !== list[k].text) { list[k].text = t; renderPaste(); } }));
    tools.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { const { list, k } = at(b.dataset.del); list.splice(k, 1); renderPaste(); }));
    tools.querySelectorAll('[data-merge]').forEach((b) => b.addEventListener('click', () => {
      const { list, k } = at(b.dataset.merge);
      if (k + 1 >= list.length) return;
      list.splice(k, 2, { ...list[k], text: `${list[k].text} ${list[k + 1].text}` });
      renderPaste();
    }));
    tools.querySelectorAll('[data-split]').forEach((b) => b.addEventListener('click', () => {
      const { list, k } = at(b.dataset.split);
      const parts = E.decompose(list[k].text);
      let a, c;
      if (parts.length > 1) { a = parts[0].text; c = parts.slice(1).map((p) => p.text).join(' '); }
      else { const ws = list[k].text.split(/\s+/); const m = Math.ceil(ws.length / 2); a = ws.slice(0, m).join(' '); c = ws.slice(m).join(' '); }
      if (!c) return;
      list.splice(k, 1, { ...list[k], text: a, type: E.typeOf(a) }, { ...list[k], text: c, type: E.typeOf(c) });
      renderPaste();
    }));
  }

  $('t-dec').addEventListener('click', () => {
    st.claim = $('t-claim').value.trim() || EXAMPLE;
    st.eng = engineSubs(st.claim).map((s) => ({ ...s, use: true, src: 'engine' }));
    st.mod = null;
    renderPaste();
  });
  $('t-lab').addEventListener('change', () => { st.lab = $('t-lab').value; renderPaste(); });
  $('t-ask').addEventListener('click', async () => {
    if (st.busy) return;
    st.claim = $('t-claim').value.trim() || EXAMPLE;
    if (!st.eng.length) st.eng = engineSubs(st.claim).map((s) => ({ ...s, use: true, src: 'engine' }));
    st.busy = true; $('t-ask').disabled = true; renderPaste();
    try {
      const { decomposeOne } = await import('../model.js');
      const r = await decomposeOne(st.claim);
      st.modInfo = r;
      st.mod = r.valid ? r.subs.map((s) => ({ ...s, use: true, src: 'model' })) : null;
      if (r.valid) {
        // default picks: the model's version where it differs, both where they agree on nothing
        const pairs = E.matchSets(st.eng, st.mod, 0.5);
        const engMatched = new Set(pairs.map((p) => p.i));
        st.eng.forEach((x, i) => { x.use = !engMatched.has(i) ? x.use : false; });
      } else {
        st.mod = [];
      }
      app.routeAnswered = { route: r.source, model: r.model, ms: r.ms, ts: Date.now() };
    } finally { st.busy = false; $('t-ask').disabled = false; renderPaste(); }
  });
  $('t-share').addEventListener('click', async (e) => {
    save();
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'link copied'; } catch { e.target.textContent = 'copy the address bar'; }
  });

  /* ---------------------------------------------------------- compare */
  function renderCompare() {
    const a = app.byId[app.sel];
    const bId = app.compare || $('t-cmp-b').value || '__paste';
    $('t-cmp-b').value = bId;
    const left = a.row ? app.score(a).items.map((i) => ({ text: i.sub.text, type: i.type, cls: vclass(i.eff), v: i.eff.verdict })) : [];
    let right, bTitle, bFig, aFig = app.score(a)?.fig;
    if (bId === '__paste') {
      const sys = labOf();
      const res = E.scorePasted(working().map((x) => ({ text: x.text, type: x.type })), sys?.row, app.results, app.route);
      right = res.items.map((i) => ({ text: i.sub.text, type: i.type, cls: i.type === 'framing' ? 'v-frm' : i.eff ? vclass(i.eff) : 'v-unv', v: i.eff?.verdict || 'no evidence' }));
      bTitle = 'the decoded claim'; bFig = res.fig;
    } else {
      const b = app.byId[bId];
      right = b.row ? app.score(b).items.map((i) => ({ text: i.sub.text, type: i.type, cls: vclass(i.eff), v: i.eff.verdict })) : [];
      bTitle = b.title; bFig = app.score(b)?.fig;
    }
    const rows = TYPE_ORDER.map((t) => {
      const L = left.filter((x) => x.type === t), R = right.filter((x) => x.type === t);
      if (!L.length && !R.length) return '';
      const n = Math.max(L.length, R.length);
      return Array.from({ length: n }, (_, k) => `<tr>${k === 0 ? `<th rowspan="${n}">${t}</th>` : ''}<td>${L[k] ? `${mark(L[k].cls, L[k].v)} ${esc(L[k].text)}` : ''}</td><td>${R[k] ? `${mark(R[k].cls, R[k].v)} ${esc(R[k].text)}` : ''}</td></tr>`).join('');
    }).join('');
    $('t-cmp-t').innerHTML = `<table><thead><tr><th>type</th><th>${esc(a.title)} · ${aFig?.point != null ? fmt(aFig.point) : '—'}</th><th>${esc(bTitle)} · ${bFig?.point != null ? fmt(bFig.point) : '—'}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  $('t-cmp-b').addEventListener('change', () => { app.compare = $('t-cmp-b').value === '__paste' ? null : $('t-cmp-b').value; app.writeHash(); renderCompare(); app.render(); });

  /* ------------------------------------------------------------ score */
  let GOLD = null;
  async function renderScore() {
    if (!GOLD) GOLD = await import('../gold.js');
    const { HELD, TUNE } = GOLD;
    $('t-sc-m').textContent = `score the model too (one call for all ${HELD.length} held-out claims)`;
    const eng = E.scoreSet(HELD, (g) => E.decompose(g.claim));
    const tune = E.scoreSet(TUNE, (g) => E.decompose(g.claim));
    st.score = eng;
    const m = st.scoreModel;
    const row = (name, r) => `<tr><td>${name}</td><td class="n">${r.P.toFixed(2)}</td><td class="n">${r.R.toFixed(2)}</td><td class="n">${r.F1.toFixed(2)}</td><td class="n">${r.np}</td><td class="n">${r.ng}</td></tr>`;
    let html = `<table><thead><tr><th>route, half</th><th>precision</th><th>recall</th><th>F1</th><th>predicted</th><th>gold</th></tr></thead><tbody>
      ${row(`rule engine, held-out (${HELD.length} claims)`, eng)}${row(`rule engine, tuning half (${TUNE.length})`, tune)}${m ? row(`model, held-out · ${esc(m.source)}${m.model ? ` ${esc(m.model)}` : ''}`, m.r) : ''}</tbody></table>`;
    html += `<table><thead><tr><th>type</th><th>engine F1</th>${m ? '<th>model F1</th><th>model adds</th>' : ''}<th>gold</th></tr></thead><tbody>${TYPE_ORDER.map((t) =>
      `<tr><td>${t}</td><td class="n">${eng.types[t].F1.toFixed(2)}</td>${m ? `<td class="n">${m.r.types[t].F1.toFixed(2)}</td><td class="n">${sgn(100 * (m.r.types[t].F1 - eng.types[t].F1))} pts</td>` : ''}<td class="n">${eng.types[t].ng}</td></tr>`).join('')}</tbody></table>`;
    if (m) {
      html += `<p class="rk">model F1 ${sgn(100 * (m.r.F1 - eng.F1))} pts over the engine · it changed the final figure on ${m.changedFig} of ${HELD.length} claims · ${m.valid} of ${HELD.length} answers passed the schema${m.invalid.length ? ` (the engine answered for ${m.invalid.length})` : ''} · 1 call, ${(m.ms / 1000).toFixed(1)} s</p>`;
    }
    $('t-sc-t').innerHTML = html;
  }
  $('t-sc-m').addEventListener('click', async () => {
    if (!GOLD) GOLD = await import('../gold.js');
    const { HELD } = GOLD;
    $('t-sc-m').disabled = true; $('t-sc-r').textContent = 'one call for the whole held-out half...';
    try {
      const { decomposeMany } = await import('../model.js');
      const r = await decomposeMany(HELD);
      const pred = (g) => r.byId[g.id] || E.decompose(g.claim);
      const res = E.scoreSet(HELD, pred);
      let changedFig = 0;
      for (const g of HELD) {
        const row = app.byId[g.lab]?.row;
        const a = E.scorePasted(E.decompose(g.claim), row, app.results, app.route).fig.point;
        const b = E.scorePasted(pred(g), row, app.results, app.route).fig.point;
        if ((a == null) !== (b == null) || (a != null && Math.round(a) !== Math.round(b))) changedFig++;
      }
      st.scoreModel = { r: res, source: r.source, model: r.model, ms: r.ms, valid: r.valid, invalid: r.invalid, changedFig };
      $('t-sc-r').textContent = r.source === 'offline' ? `no route answered (${(r.errors || []).slice(-1)[0] || ''}); the engine stood in for every claim` : `answered by ${r.source}`;
      app.routeAnswered = { route: r.source, model: r.model, ms: r.ms, ts: Date.now() };
    } finally { $('t-sc-m').disabled = false; renderScore(); }
  });

  /* -------------------------------------------------------- corrections */
  function renderLog() {
    const figOf = (id) => { const s = app.byId[id]; const g = s ? app.graded(s) : null; return g?.fig.point != null ? `computed: ${fmt(g.fig.point)}` : 'computed'; };
    const rows = [
      ...app.log.map((c) => ({ ...c, rt: true })),
      ...CORRECTIONS.map((c) => ({ ...c, new: c.new === 'computed' ? figOf(c.id) : c.new })),
    ];
    $('t-log-t').innerHTML = `<table><thead><tr><th>date</th><th>system</th><th>field</th><th>old</th><th>new</th><th>reason</th></tr></thead><tbody>${rows.map((c) =>
      `<tr class="${c.rt ? 'rt' : ''}"><td>${esc(c.date)}</td><td>${esc(c.id === '*' ? 'every row' : app.byId[c.id]?.title || c.id)}</td><td>${esc(c.field)}</td><td>${esc(c.old)}</td><td>${esc(c.new)}</td><td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table>`;
  }

  /* ------------------------------------------------------------ export */
  function table() {
    return {
      schema: SCHEMA_VERSION, method: METHOD_VERSION, generated: new Date().toISOString(), route: app.route,
      grading: app.snapshot.grading, head: app.snapshot.head,
      systems: app.systems.filter((s) => s.row).map((s) => {
        const sc = app.score(s), stl = app.stale(s);
        return {
          id: s.id, title: s.title, kind: s.kind, status: s.status, page: s.href, claim: s.blurb,
          figure: sc.fig.point, low: sc.fig.low, high: sc.fig.high, factscore: sc.fig.factscore, basis: sc.basisTag,
          graded: { date: app.snapshot.grading?.date || null, commit: stl?.graded || null }, labCommit: stl?.now || null, stale: !!stl?.any,
          subclaims: sc.items.map((i) => ({
            id: i.id, phrase: i.sub.phrase, text: i.sub.text, type: i.type, weight: i.w, why: i.sub.why,
            verdict: i.eff.verdict, graded: i.sub.verdict, basis: i.eff.basis, note: i.sub.note,
            evidence: (i.sub.ev || []).map(([f, a]) => ({ file: f, line: app.snapshot.anchors?.[`${f}::${a}`] ?? null, commit: app.snapshot.files?.[f]?.commit || null, anchor: a })),
            checks: app.E.checkKeys(i.sub).map((k) => ({ key: k, ...(app.results[k] ? { status: app.results[k].status, detail: app.results[k].detail, ts: app.results[k].ts } : { status: 'not run' }) })),
          })),
        };
      }),
      corrections: [...app.log, ...CORRECTIONS],
    };
  }
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('x-json').addEventListener('click', () => download(`honesty-decoder-${SCHEMA_VERSION}.json`, JSON.stringify(table(), null, 2), 'application/json'));
  $('x-csv').addEventListener('click', () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['schema', 'system', 'kind', 'status', 'figure', 'low', 'high', 'factscore', 'graded_commit', 'lab_commit', 'stale', 'subclaim', 'phrase', 'type', 'weight', 'verdict', 'graded_verdict', 'basis', 'evidence', 'check'];
    const lines = [head.join(',')];
    for (const s of table().systems) for (const c of s.subclaims) {
      lines.push([SCHEMA_VERSION, s.id, s.kind, s.status, s.figure?.toFixed(2), s.low?.toFixed(2), s.high?.toFixed(2), s.factscore?.toFixed(2), s.graded.commit, s.labCommit, s.stale,
        c.id, c.phrase, c.type, c.weight, c.verdict, c.graded, c.basis, c.evidence.map((e) => `${e.file}:${e.line ?? ''}@${e.commit ?? ''}`).join(' '), c.checks.map((k) => `${k.key}=${k.status}`).join(' ')].map(q).join(','));
    }
    download(`honesty-decoder-${SCHEMA_VERSION}.csv`, lines.join('\n'), 'text/csv');
  });

  record.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const [id, sub] = b.dataset.show.split(':');
    app.select(id, { focus: sub });
    document.getElementById('deck').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }));

  renderPaste(); renderCompare(); renderScore(); renderLog();
  return {
    refresh(what) {
      if (what === 'caption') return;
      renderCompare(); renderLog();
      if (what === 'done' || what === 'route') renderPaste();
    },
  };
}

/* ------------------------------------------------------------ walk */
export function walk(app) {
  const sys = app.byId[app.sel];
  const sc = app.score(sys);
  const f = sc.fig;
  const items = sc.items.filter((i) => i.type !== 'framing' && i.v != null);
  const num = items.map((i) => `${i.w}x${i.v}`).join(' + ');
  const den = items.map((i) => i.w).join(' + ');
  const steps = [
    ['#receipt .claim', 'The claim', `This is ${sys.title}'s own hub blurb, read from site.config.js when the page loaded. Nothing here is a myth line written for the decoder.`],
    ['#receipt .subs', 'Sub-claims', `The blurb is split into ${sc.items.length} atomic sub-claims, each tied to a phrase (the small numbers in the claim). Each has a type and a weight, justified in one sentence.`],
    ['#receipt .sub .ck', 'Checks', 'A verdict counts only when a check backs it: cited lines fetched from the deployed file, a lab state read in a hidden frame, a route calculation or a published value. The mark at the right of each row is its check.'],
    ['#receipt .figure', 'The figure', f.point != null ? `figure = (${num}) / (${den}) = ${fmt(f.point)}. Supported counts 1, partial 0.5, unsupported 0; unverified and framing stay out.` : 'No sub-claim has a check behind it, so there is no point figure: the interval is the whole scale.'],
    ['#receipt .meter', 'Interval and sensitivity', f.point != null ? `Low ${fmt(f.low)} counts partial and unverified as unsupported, high ${fmt(f.high)} counts them as supported. The readouts below name the sub-claim that moves the figure most.` : 'The receipt says why nothing could be checked.'],
  ];
  let i = 0;
  const root = document.createElement('div');
  root.className = 'walk';
  root.innerHTML = '<div class="ring"></div><div class="card" role="dialog" aria-modal="true" aria-labelledby="wk-h"><div class="rk" id="wk-n"></div><b id="wk-h"></b><p id="wk-p"></p><div class="acts"><button class="btn" type="button" id="wk-skip">skip</button><span><button class="btn" type="button" id="wk-back">back</button> <button class="btn" type="button" id="wk-next">next</button></span></div></div>';
  document.body.appendChild(root);
  const close = () => { root.remove(); removeEventListener('keydown', key); };
  const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  addEventListener('keydown', key);
  function show() {
    const [sel, h, p] = steps[i];
    const t = document.querySelector(sel);
    if (t) t.scrollIntoView({ block: 'center', behavior: 'auto' });
    const b = t ? t.getBoundingClientRect() : { left: 20, top: 20, width: 100, height: 40 };
    const ring = root.querySelector('.ring');
    Object.assign(ring.style, { left: `${b.left - 6}px`, top: `${b.top - 6}px`, width: `${b.width + 12}px`, height: `${b.height + 12}px` });
    const card = root.querySelector('.card');
    const below = b.bottom + 200 < innerHeight;
    Object.assign(card.style, { left: `${Math.max(16, Math.min(innerWidth - 396, b.left))}px`, top: `${below ? b.bottom + 14 : Math.max(16, b.top - 190)}px` });
    root.querySelector('#wk-n').textContent = `step ${i + 1} of ${steps.length}`;
    root.querySelector('#wk-h').textContent = h;
    root.querySelector('#wk-p').textContent = p;
    root.querySelector('#wk-next').textContent = i === steps.length - 1 ? 'done' : 'next';
    root.querySelector('#wk-next').focus();
  }
  function go(d) { i += d; if (i < 0) i = 0; if (i >= steps.length) { close(); return; } show(); }
  root.querySelector('#wk-next').addEventListener('click', () => go(1));
  root.querySelector('#wk-back').addEventListener('click', () => go(-1));
  root.querySelector('#wk-skip').addEventListener('click', close);
  show();
}
