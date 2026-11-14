/* ============================================================
   dataspace/views.js — the 2D readouts. Each function takes plain
   measurement objects (from measures.js) and writes DOM; none of
   them computes a measure. Linking is by data attributes:
   data-i = source token index, data-j = rebuild token index.
   ============================================================ */

import { LEVELS, wordCount } from './config.js';

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const fmt = (b) => (b == null || !isFinite(b) ? '-' : Math.round(b).toLocaleString('en-US'));
export const pct = (x, d = 0) => (x == null || !isFinite(x) ? '-' : (x * 100).toFixed(d) + '%');
export const lvlName = (id) => LEVELS.find((l) => l.id === id)?.name || '';
const isSpace = (t) => !/\S/.test(t.t);

/* ---------- plate ---------- */

export function renderPlate({ run, m, src, floorBits, scoredAs }) {
  $('f_src').textContent = fmt(src.bits.total);
  $('f_floor').textContent = fmt(floorBits);
  $('f_flooru').textContent = floorBits ? `DEFLATE bits, rate ${(floorBits / src.bits.total).toFixed(2)}` : 'DEFLATE bits';
  if (!run || !m) {
    for (const id of ['f_cap', 'f_rate', 'f_lex', 'f_num', 'f_ent', 'f_turn']) $(id).textContent = '-';
    if (!/loading/.test($('runHead').textContent)) $('runHead').innerHTML = 'no run yet on this text: press <b>Collapse</b>';
    renderRateBar(null, floorBits, src.bits.total);
    $('split').innerHTML = '';
    return;
  }
  const pv = run.provenance || {};
  const live = run.kind === 'live';
  $('runHead').innerHTML = `<span class="${live ? 'live' : ''}">${esc(run.kind)}</span> &middot; <b>${esc(pv.model || '-')}</b> &middot; L${run.level} ${esc(lvlName(run.level))}` +
    ` &middot; ${esc((pv.date || '').slice(0, 10))}${pv.repeat ? ` &middot; run ${esc(pv.repeat)}` : ''}`;
  $('f_cap').textContent = run.capsule ? fmt(m.bits.cap.total) : '-';
  $('f_capu').textContent = run.capsule ? `bits, same code; ${wordCount(run.capsule)} words` : 'no capsule';
  $('f_rate').textContent = run.capsule ? m.rate.toFixed(3) : '-';
  const rebuilt = scoredAs === 'rebuild';
  $('f_lex').textContent = scoredAs === 'none' ? '-' : pct(m.lex.fidelity);
  $('f_lexu').textContent = rebuilt ? 'source tokens kept' : scoredAs === 'literal' ? 'kept by the capsule as written' : 'rebuild did not run';
  const s = m.summary;
  $('f_num').textContent = scoredAs === 'none' ? '-' : s.numbers.total ? `${s.numbers.survived}/${s.numbers.total}` : 'none';
  $('f_numu').textContent = (s.numbers.total ? pct(s.numbers.survived / s.numbers.total) + ' ' : '') + (s.numbers.altered ? `survived, ${s.numbers.altered} altered` : 'survived');
  $('f_ent').textContent = scoredAs === 'none' ? '-' : s.entities.total ? `${s.entities.survived}/${s.entities.total}` : 'none';
  $('f_entu').textContent = (s.entities.total ? pct(s.entities.survived / s.entities.total) + ' ' : '') + (s.entities.altered ? `survived, ${s.entities.altered} altered` : 'survived');
  $('f_turn').textContent = rebuilt ? `${m.turns.srcCount}→${m.turns.recCount}` : '-';
  $('f_turnu').textContent = rebuilt ? `source → rebuild, order ${pct(m.turns.order)}` : 'source → rebuild';
  renderRateBar(run.capsule ? m.rate : null, floorBits, src.bits.total);
  renderSplit($('split'), rebuilt ? m.split : null, rebuilt ? m.lex.fidelity : 0);
}

/* The rate bar: 0 to max(1, floor rate). A floor above the source extends the scale instead of clamping. */
export function renderRateBar(rate, floorBits, srcBits) {
  const fr = floorBits && srcBits ? floorBits / srcBits : null;
  const max = Math.max(1, fr || 0, rate || 0);
  $('rb_cap').style.width = rate == null ? '0' : (rate / max * 100).toFixed(2) + '%';
  const f = $('rb_floor');
  f.hidden = fr == null;
  if (fr != null) f.style.left = (fr / max * 100).toFixed(2) + '%';
  $('rb_one').style.left = (1 / max * 100).toFixed(2) + '%';
}

export function renderSplit(host, split, fid) {
  host.innerHTML = '';
  if (!split) return;
  const parts = [['prior', split.prior, 'from the empty-capsule prior'], ['literal', split.literal, 'carried literally by the capsule'],
    ['decoder', split.decoder, 'restored by the decoder']];
  for (const [k, v, t] of parts) {
    const i = document.createElement('i');
    i.className = 's-' + k; i.style.width = (v * 100).toFixed(2) + '%'; i.title = `${pct(v)} ${t}`;
    host.append(i);
  }
  host.title = `kept ${pct(fid)}: prior ${pct(split.prior)}, capsule ${pct(split.literal)}, decoder ${pct(split.decoder)}`;
}

/* ---------- capsule panel ---------- */

export function renderCapsule(run, m) {
  if (!run) { $('capText').textContent = '-'; $('capMeta').textContent = ''; $('capNote').textContent = ''; return; }
  const w = run.capsule ? wordCount(run.capsule) : 0;
  $('capMeta').textContent = run.capsule
    ? `${w} words of ${run.budgetWords} asked · ${m.tokens.cap.length} tokens · ${run.capsule.length} chars · ${fmt(m.bits.cap.total)} bits`
    : '';
  $('capNote').textContent = run.note || '';
  if (!run.capsule) { $('capText').textContent = '(no capsule)'; return; }
  // capsule tokens linked to the source tokens they match in the capsule-to-source LCS alignment (token overlap)
  const toSrc = new Map();
  for (const o of m.literal.ops) if (o.op === 'keep') toSrc.set(o.j, o.i);
  $('capText').innerHTML = m.tokens.cap.map((t, j) => {
    if (isSpace(t)) return esc(t.t);
    const lead = t.t.match(/^\s*/)[0];
    const i = toSrc.get(j);
    return esc(lead) + (i != null ? `<span data-i="${i}" title="matches source token ${i}">${esc(t.t.slice(lead.length))}</span>` : esc(t.t.slice(lead.length)));
  }).join('');
}

/* ---------- ledger: strip, heat view, diff ---------- */

/* Cell shade: the token's bits on this text's own scale, cheapest 0.03 to dearest 0.45 opacity of --horizon. */
const heatScale = (per, tokens) => {
  let lo = Infinity, hi = 0;
  tokens.forEach((t, i) => { if (!isSpace(t)) { lo = Math.min(lo, per[i]); hi = Math.max(hi, per[i]); } });
  return (b) => (0.03 + 0.42 * (hi > lo ? (b - lo) / (hi - lo) : 0.5)).toFixed(3);
};

export function renderStrip(host, tokens, per, keptSrc) {
  const max = Math.max(...per, 1);
  let h = '';
  tokens.forEach((t, i) => {
    if (isSpace(t)) return;
    const lost = keptSrc && !keptSrc[i] ? ' lost' : '';
    h += `<i class="${lost.trim()}" data-i="${i}" style="height:${Math.max(4, per[i] / max * 100).toFixed(1)}%" title="${esc(t.t.trim())}: ${per[i].toFixed(1)} bits"></i>`;
  });
  host.innerHTML = h;
}

export function renderHeat(host, tokens, per, pins) {
  const heatAlpha = heatScale(per, tokens);
  let h = '';
  tokens.forEach((t, i) => {
    if (isSpace(t)) { h += esc(t.t); return; }
    const lead = t.t.match(/^\s*/)[0];
    h += esc(lead) + `<span data-i="${i}" tabindex="-1" class="${pins.has(i) ? 'pin' : ''}" style="--a:${heatAlpha(per[i])}" title="${per[i].toFixed(1)} bits">${esc(t.t.slice(lead.length))}</span>`;
  });
  host.innerHTML = h;
}

export function renderDiff(host, m, scoredAs) {
  if (scoredAs === 'none') { host.textContent = 'The rebuild did not run for this capsule.'; return; }
  const src = m.tokens.src, rec = m.tokens.rec;
  let h = '', lastJ = -1;
  const gap = (j) => { for (let k = lastJ + 1; k < j; k++) if (isSpace(rec[k])) h += esc(rec[k].t); lastJ = j; };
  for (const o of m.lex.ops) {
    if (o.op === 'drop') { h += `<span class="drop" data-i="${o.i}">${esc(src[o.i].t)}</span>`; continue; }
    gap(o.j);
    const t = rec[o.j];
    const lead = t.t.match(/^\s*/)[0];
    const cls = o.op === 'keep' ? 'keep' : 'add';
    h += esc(lead) + `<span class="${cls}" data-j="${o.j}"${o.op === 'keep' ? ` data-i="${o.i}"` : ''}>${esc(t.t.slice(lead.length))}</span>`;
  }
  host.innerHTML = h;
  $('diffCounts').textContent = `${m.lex.kept} kept · ${m.lex.dropped} dropped · ${m.lex.invented} invented` +
    (scoredAs === 'literal' ? ' · the capsule read as written' : '') + (m.lex.truncated ? ' · cut to the scoring limit' : '');
}

/** One hover controller for every linked view. */
export function linkHover(roots, onHover) {
  let cur = [];
  const clear = () => { cur.forEach((n) => n.classList.remove('hl')); cur = []; };
  const on = (e) => {
    const n = e.target.closest('[data-i],[data-j]');
    clear();
    if (!n) { onHover?.(null); return; }
    const i = n.dataset.i, j = n.dataset.j;
    const sel = [i != null ? `[data-i="${i}"]` : '', j != null ? `[data-j="${j}"]` : ''].filter(Boolean).join(',');
    for (const r of roots) cur.push(...r.querySelectorAll(sel));
    cur.forEach((x) => x.classList.add('hl'));
    onHover?.(i != null ? Number(i) : null);
  };
  for (const r of roots) { r.addEventListener('mouseover', on); r.addEventListener('focusin', on); r.addEventListener('mouseleave', clear); }
}

/* ---------- survival tables ---------- */

export function renderUnits(tbody, m, recText, scoredAs) {
  const rows = scoredAs === 'none' ? [] : m.units;
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="4">${scoredAs === 'none' ? 'no rebuild to score' : 'no numbers, dates or names found by the rules'}</td></tr>`; return; }
  tbody.innerHTML = rows.map((r, k) => {
    const back = r.recSpans.length ? esc(recText.slice(r.recSpans[0][0], r.recSpans[0][1])) : '-';
    const kind = r.kind === 'entity' ? `name (${r.rule})` : r.kind;
    return `<tr data-u="${k}" tabindex="0"><td>${esc(kind)}</td><td>${esc(r.text)}${r.spans.length > 1 ? ` <span class="hint">x${r.spans.length}</span>` : ''}</td><td>${back}</td><td class="${r.status}">${r.status}</td></tr>`;
  }).join('');
}

export function renderTurns(tbody, m, scoredAs) {
  if (scoredAs !== 'rebuild') { tbody.innerHTML = '<tr><td colspan="6">turns are scored on a rebuild</td></tr>'; return; }
  tbody.innerHTML = m.turns.rows.map((r) => `<tr data-a="${r.a}" data-b="${r.b}" tabindex="0"><td>${r.turn}</td><td>${r.speaker}</td><td class="num">${r.tokens}</td>` +
    `<td class="num">${pct(r.fidelity)}</td><td class="num">${r.numbers.total ? `${r.numbers.survived}/${r.numbers.total}` : '-'}</td>` +
    `<td class="num">${r.entities.total ? `${r.entities.survived}/${r.entities.total}` : '-'}</td></tr>`).join('');
}

/* ---------- provenance and payloads ---------- */

export function renderCalls(run, calls, tokenCount) {
  const pv = run?.provenance || {};
  const c = calls.compress, r = calls.rebuild;
  const tok = (call, side) => {
    if (!call) return '-';
    const u = call.usage;
    if (u && (u.prompt_tokens != null || u.completion_tokens != null)) return `${u.prompt_tokens ?? '?'} in / ${u.completion_tokens ?? '?'} out (route)`;
    if (call.promptTokens != null) return `${call.promptTokens} in / ${call.completionTokens} out (Ollama)`;
    const pin = tokenCount((call.system || '') + (call.user || '')), pout = tokenCount(call.raw || '');
    return `${pin} in / ${pout} out (GPT-2 count; route gave none)`;
  };
  const cell = (k, v, cls = '') => `<div><span>${k}</span><b class="${cls}">${esc(v)}</b></div>`;
  $('prov').innerHTML = [
    cell('kind', run ? run.kind : '-', run?.kind === 'live' ? 'live' : ''),
    cell('model', pv.model || '-'), cell('weights', pv.digest ? `${pv.digest} · ${pv.quant || ''} · ${pv.params || ''}` : '-'),
    cell('route', pv.route || '-'), cell('date', pv.date || '-'), cell('prompt version', pv.promptVersion || '-'),
    cell('seed · temperature', `${pv.seed ?? '-'} · ${pv.temperature ?? '-'}`),
    cell('strength', run ? `L${run.level} ${lvlName(run.level)}, ${run.budgetWords} words` : '-'),
    cell('compress', c ? `${c.ms ?? '-'} ms · ${tok(c)}${c.cached === 'possible' ? ' · possibly cached' : ''}` : '-'),
    cell('rebuild', r ? `${r.ms ?? '-'} ms · ${tok(r)}${r.cached === 'possible' ? ' · possibly cached' : ''}` : '-'),
    cell('Ollama', pv.ollamaVersion ? `v${pv.ollamaVersion}` : '-'),
    cell('freshness', run?.kind === 'live' ? (c?.cached === 'possible' || r?.cached === 'possible' ? 'a reply came back fast enough to be cached' : 'per-run seed; reply fresh') : run?.kind === 'recorded' ? 'recorded reply, replayed' : '-'),
  ].join('');
  const req = (call) => call ? `SYSTEM:\n${call.system}\n\nUSER:\n${call.user}` : '-';
  $('reqC').textContent = req(c);
  $('rawC').textContent = c ? c.raw : '-';
  $('reqR').textContent = req(r);
  $('rawR').textContent = r ? r.raw : (run?.status === 'partial' ? 'the rebuild did not run' : '-');
}

/* ---------- tables ---------- */

export function renderRunsTable(tbody, entries, sel, cmp) {
  tbody.innerHTML = entries.map(({ run, m, scoredAs }) => {
    const pv = run.provenance || {};
    const cls = [run.id === sel ? 'sel' : '', run.id === cmp ? 'sel' : ''].join(' ');
    return `<tr data-run="${esc(run.id)}" class="${cls}" tabindex="0"><td>${esc(run.id)}</td><td class="${run.kind === 'live' ? 'livecell' : ''}">${esc(run.kind)}${run.status === 'partial' ? ' (no rebuild)' : ''}</td>` +
      `<td>${esc(pv.model || '-')}</td><td>L${run.level}</td><td class="num">${run.capsule ? wordCount(run.capsule) : '-'}/${run.budgetWords}</td>` +
      `<td class="num">${m && run.capsule ? m.rate.toFixed(3) : '-'}</td><td class="num">${m && scoredAs !== 'none' ? pct(m.lex.fidelity) : '-'}</td>` +
      `<td class="num">${m && scoredAs !== 'none' && m.summary.numbers.total ? `${m.summary.numbers.survived}/${m.summary.numbers.total}` : '-'}</td>` +
      `<td class="num">${m && scoredAs !== 'none' && m.summary.entities.total ? `${m.summary.entities.survived}/${m.summary.entities.total}` : '-'}</td></tr>`;
  }).join('') || '<tr><td colspan="9">no runs yet</td></tr>';
}

export function renderLevelsTable(tbody, rows) {
  tbody.innerHTML = rows.map((r) => `<tr><td>L${r.level} ${esc(lvlName(r.level))}</td><td class="num">${r.budget}</td><td class="num">${r.n}</td>` +
    `<td class="num">${r.rate == null ? '-' : r.rate.toFixed(3)}</td><td class="num">${pct(r.fid)}${r.spread ? ` <span class="hint">±${(r.spread * 50).toFixed(0)}</span>` : ''}</td>` +
    `<td class="num">${pct(r.head)}</td><td class="num">${pct(r.ext)}</td><td class="num">${r.gain == null ? '-' : (r.gain >= 0 ? '+' : '') + (r.gain * 100).toFixed(0) + ' pts'}</td></tr>`).join('');
}

export function renderBpc(tbody, rows) {
  tbody.innerHTML = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.method)}</td><td class="num">${r.bits == null ? (r.pending ? 'measuring' : '-') : fmt(r.bits)}</td>` +
    `<td class="num">${r.bits == null ? '-' : r.bpc.toFixed(3)}</td></tr>`).join('');
}

export function renderRef(tbody, rows) {
  tbody.innerHTML = rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.page == null ? (r.err ? esc(r.err) : 'measuring') : `${fmt(r.page)} B · ${(r.page * 8 / r.n).toFixed(3)} bpc`}</td>` +
    `<td class="num">${fmt(r.ref)} B · ${(r.ref * 8 / r.n).toFixed(3)} bpc<br><span class="hint">${esc(r.cmd)}</span></td>` +
    `<td class="num">${r.page == null ? '-' : ((r.page - r.ref) / r.ref * 100).toFixed(2) + '%'}</td></tr>`).join('');
}
