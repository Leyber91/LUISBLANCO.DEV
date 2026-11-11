/* ============================================================
   timeline/view-panels.js — the DOM around the branch line.
   Pure rendering: takes state, writes markup, wires buttons to
   callbacks. Every text value goes through esc(); model output is
   set as textContent, never parsed as HTML.
   ============================================================ */

import { NOW, WORLDS, LAYERS, RUNGS, NARRATIVE, READING, DIMENSIONS, CEILING } from './config.js';
import {
  VIS, ALL, byId, layerById, worldById, physicsOf, parallelOf, worldName, sourceLabel, sourceFile, narrativeLabel,
  rungCounts, references, causesOf, consequencesOf, causalChain, calendarDiscrepancies, DISCREPANCIES, PHYSICS,
  between, charsVisible, readable, getGate,
} from './engine.js';
import { fmtCE, fmtAT, fmtCycle, threeDates, grp, parseDate, parseAge, fmtDay } from './chronology.js';
import { CALC } from './calc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rungLabel = (id) => RUNGS.find((r) => r.id === id)?.label || String(id).toLowerCase();
const tierLabel = (t) => (t ? `Book 1, ch. ${t}` : 'premise');
const dimName = (d) => worldById.get(d)?.name || layerById.get(d)?.name || d;
const doiLink = (r) => (r.doi ? ` <a class="tl-doi" href="https://doi.org/${esc(r.doi)}" rel="noopener" target="_blank">doi:${esc(r.doi)}</a>` : r.book ? ' <span class="tl-doi">book, no DOI</span>' : '');

/* ---------------- the comparison ---------------- */

export function renderCompare(root, cmp, { selWorld, onPick, pin } = {}) {
  root.querySelector('[data-k="date"]').textContent = cmp.date;
  root.querySelector('[data-k="cals"]').textContent = cmp.align
    ? 'each world read at the same distance from its own discovery'
    : cmp.t < -50000 ? 'deep time, before any calendar' : `${fmtAT(cmp.t)} on Terra · ${fmtCycle(cmp.t)} in Kha-Ren`;
  root.querySelector('[data-k="why"]').textContent = cmp.why;
  const full = NOW - WORLDS[0].found;
  for (const s of cmp.worlds) {
    const col = root.querySelector(`[data-w="${s.world.id}"]`);
    if (!col) continue;
    col.classList.toggle('on', selWorld === s.world.id);
    col.querySelector('.tl-cal').textContent = cmp.align ? `${s.native} · ${fmtCE(s.y)}` : s.native;
    const f = s.since == null ? 0 : Math.min(1, s.since / full);
    col.querySelector('.tl-meter i').style.setProperty('--f', f.toFixed(4));
    col.querySelector('.tl-meter').setAttribute('aria-label', s.since == null ? 'no years with its artifact' : `${grp(s.since)} of ${grp(full)} years with its artifact`);
    col.querySelector('.tl-status').textContent = s.status + (s.response ? ` Response: ${s.response}.` : '');
    const era = col.querySelector('.tl-era'), st = col.querySelector('.tl-st');
    if (s.held && s.era) { era.textContent = s.era.name; st.textContent = `${s.era.text} ${s.held.text}`; }
    else if (s.held) { era.textContent = 'not published here'; st.textContent = s.held.text; }
    else if (s.era) { era.textContent = s.era.name; st.textContent = s.era.text; }
    else if (s.y < -300000) { era.textContent = 'before humanity'; st.textContent = 'No people yet in any of the three dimensions.'; }
    else if (s.y > NOW + 1) { era.textContent = 'after the story present'; st.textContent = 'Held for the books.'; }
    else { era.textContent = '—'; st.textContent = ''; }
    const last = col.querySelector('.tl-last');
    const pick = s.last || s.next;
    if (pick) {
      last.hidden = false; last.dataset.id = pick.id;
      last.textContent = `${s.last ? 'latest' : 'next'}: ${pick.title} · ${fmtCE(pick.y, pick.c)}`;
    } else last.hidden = true;
    if (!last.dataset.wired) { last.dataset.wired = '1'; last.addEventListener('click', () => onPick?.(last.dataset.id)); }
  }
  const bw = root.querySelector('[data-k="between"]');
  if (pin == null) { bw.hidden = true; return; }
  const b = between(cmp.t, pin, { align: cmp.align });
  bw.hidden = false;
  bw.innerHTML = `<div class="tl-k">between the two moments</div>
    <p class="tl-span"><b>${esc(grp(b.earthYears))}</b> years on Earth’s calendar · <b>${esc(grp(b.terraYears))}</b> on Terra’s · <b>${b.cycles}</b> Cycles and <b>${b.cycleYears}</b> years on Kha-Ren’s</p><p class="tl-note">Spans are differences of the native dates: the codex converts dates by offset and only ages by year length.</p>
    <div class="tl-bw">${b.lanes.map((l) => `<div><span class="tl-k">${esc(l.world.name)} · ${l.count} ${l.count === 1 ? "event" : "events"}</span>${l.events.slice(0, 8).map((e) => `<button type="button" class="tl-link" data-id="${esc(e.id)}">${esc(fmtCE(e.y, e.c))}: ${esc(e.title)}</button>`).join('')}${l.count > 8 ? `<span class="tl-more">and ${l.count - 8} more</span>` : ''}</div>`).join('')}</div>`;
  bw.querySelectorAll('.tl-link').forEach((x) => x.addEventListener('click', () => onPick?.(x.dataset.id)));
}

/* ---------------- the selected item ---------------- */

function physicsItem(p) {
  const calc = p.calc && CALC[p.calc] ? `<p class="tl-calc"><span class="tl-tag">computed live</span>${esc(CALC[p.calc]().text)}</p>` : '';
  const refs = (p.refs || []).map((r) => `<p class="tl-ref">${esc(r.cite)}${doiLink(r)}</p>`).join('');
  const ext = p.ext ? `<li class="tl-step"><span class="tl-rung" data-r="${esc(p.ext.rung)}">${esc(rungLabel(p.ext.rung))}</span><p>${esc(p.ext.text)}</p></li>` : '';
  const detail = p.detail ? `<p>${esc(p.detail)}</p>` : '';
  const from = p.tagFrom ? `<p class="tl-from">rung copied from <code>${esc(sourceFile(p.tagFrom.src))}</code> § ${esc(p.tagFrom.sec)}</p>` : '<p class="tl-from">untagged in the codex: the rung shown is this page’s reading of published science</p>';
  return `<li class="tl-pi"><div class="tl-ph"><b>${esc(p.title)}</b></div>
    <ol class="tl-chain"><li class="tl-step"><span class="tl-rung" data-r="${esc(p.rung)}">${esc(rungLabel(p.rung))}</span><p>${esc(p.claim)}</p>${detail}${calc}${refs}${from}</li>${ext}</ol></li>`;
}

export function renderCard(root, id, { onPick, onFollow, onTrail, onTrailToggle } = {}) {
  const ev = byId.get(id);
  const layer = !ev && layerById.get(id);
  if (!(ev && readable(ev)) && !layer) { root.hidden = true; return; }
  root.hidden = false;
  let h = '';
  if (ev) {
    const d = threeDates(ev);
    const deep = ev.y < -50000;
    const lane = VIS.filter((e) => e.world === ev.world);
    const i = lane.findIndex((e) => e.id === ev.id);
    const prev = lane[i - 1], next = lane[i + 1];
    h += `<div class="tl-card-top"><div class="tl-k">selected · ${esc(worldName(ev.world))}</div>
      <div class="tl-badges"><span class="tl-nar" data-n="${esc(ev.tag)}">${esc(narrativeLabel(ev.tag))}</span><span class="tl-tier">${esc(tierLabel(ev.tier))}</span>${ev.computed ? '<span class="tl-tier">computed</span>' : ''}</div></div>
      <h2>${esc(ev.title)}</h2>
      <dl class="tl-dates">
        <div><dt>Earth</dt><dd>${esc(d.ce)}${ev.c && !ev.y0 && !deep ? '<small>rounded codex date</small>' : ''}</dd></div>
        ${deep ? '' : `<div><dt>Terra</dt><dd>${esc(d.at)}</dd></div><div><dt>Kha-Ren</dt><dd>${esc(d.cycle)}</dd></div>`}
      </dl>
      <p class="tl-text">${esc(ev.text)}</p>`;
    const par = parallelOf(ev);
    if (par) {
      const o = par.other;
      h += `<div class="tl-par"><span class="tl-tag">same physics, other clock</span>
        <button type="button" class="tl-link" data-id="${esc(o.id)}">${esc(worldName(o.world))}, ${esc(fmtCE(o.y, o.c))}: ${esc(o.title)}</button><span>${esc(par.text)}</span></div>`;
    }
    const chain = causalChain(ev.id), cons = consequencesOf(ev.id);
    if (chain.length || cons.length) {
      h += `<div class="tl-k tl-k2">why it happened here</div><ol class="tl-why-chain">`;
      if (chain.length) h += chain.map((c) => `<li><span class="tl-tag">${esc(c.t)}</span><button type="button" class="tl-link" data-id="${esc(c.id)}">${esc(fmtCE(c.e.y, c.e.c))}: ${esc(c.e.title)}</button></li>`).join('');
      h += `</ol>`;
      if (cons.length) h += `<p class="tl-cons"><span class="tl-tag">led to</span>${cons.map((c) => `<button type="button" class="tl-link" data-id="${esc(c.id)}">${esc(c.e.title)}</button>`).join(' ')}</p>`;
    }
    const ph = physicsOf(ev);
    if (ph.length) h += `<div class="tl-k tl-k2">the physics behind it, from published result to story</div><ul class="tl-phys">${ph.map(physicsItem).join('')}</ul>`;
    if (ev.who?.length) {
      h += `<p class="tl-who"><span class="tl-tag">people</span>${ev.who.map((c) => `<button type="button" class="tl-link" data-follow="${esc(c)}">follow ${esc(c)}</button>`).join(' ')}</p>`;
    }
    h += `<div class="tl-lanestep">${prev ? `<button type="button" class="tl-btn" data-id="${esc(prev.id)}">&larr; previous in ${esc(worldName(ev.world))}</button>` : ''}${next ? `<button type="button" class="tl-btn" data-id="${esc(next.id)}">next in ${esc(worldName(ev.world))} &rarr;</button>` : ''}</div>`;
    for (const dd of DISCREPANCIES.filter((x) => (x.events || []).includes(ev.id))) h += `<div class="tl-par tl-disc1"><span class="tl-tag">the codex disagrees here: ${esc(dd.topic)}</span><span>${esc(dd.note)}</span></div>`;
    h += `<div class="tl-lanestep"><button type="button" class="tl-btn" data-trail="${esc(ev.id)}" aria-pressed="${(onTrail?.has?.(ev.id)) ? 'true' : 'false'}">${onTrail?.has?.(ev.id) ? 'remove from trail' : 'add to trail'}</button></div>`;
    const file = sourceFile(ev.src);
    h += `<div class="tl-src">source: ${file ? `<code>${esc(file)}</code> § ${esc(ev.sec)}` : esc(sourceLabel(ev.src))} · ${ev.real ? '[REAL] published history' : '[REAL] as written in the codex; the series is fiction'}</div>`;
  } else {
    h += `<div class="tl-card-top"><div class="tl-k">selected · ${esc(layer.role)}</div></div><h2>${esc(layer.title)}</h2><p class="tl-text">${esc(layer.text)}</p>`;
    const ph = (layer.phys || []).map((pid) => ({ id: pid, ...PHYSICS[pid] })).filter((p) => p.rung);
    if (ph.length) h += `<div class="tl-k tl-k2">the physics behind it, from published result to story</div><ul class="tl-phys">${ph.map(physicsItem).join('')}</ul>`;
    h += `<div class="tl-src">source: <code>${esc(sourceFile(layer.src))}</code> § ${esc(layer.sec)} · [REAL] as written in the codex; the series is fiction</div>`;
  }
  root.innerHTML = h;
  root.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => onPick?.(b.dataset.id)));
  root.querySelectorAll('[data-follow]').forEach((b) => b.addEventListener('click', () => onFollow?.(b.dataset.follow)));
  root.querySelectorAll('[data-trail]').forEach((b) => b.addEventListener('click', () => onTrailToggle?.(b.dataset.trail)));
}

/* ---------------- filters: reading position, dimensions, tags, evidence ---------------- */

export function renderFilters(root, { lens }, on) {
  const g = getGate();
  const counts = rungCounts();
  root.innerHTML = `
    <label class="tl-k" for="tl-read">how far have you read?</label>
    <select id="tl-read" class="tl-select">${READING.map((r) => `<option value="${r.id}"${r.id === g.read ? ' selected' : ''}>${esc(r.label)}: ${esc(r.text)}</option>`).join('')}</select>
    <div class="tl-k tl-k2">dimensions</div>
    <div class="tl-chips">${DIMENSIONS.map((d) => `<button type="button" class="tl-chip" data-dim="${d}" aria-pressed="${!g.hideDims.includes(d)}">${esc(dimName(d))}</button>`).join('')}</div>
    <div class="tl-k tl-k2">narrative tag · ${VIS.filter((e) => e.tag === 'UNTAGGED').length} shown events come from untagged codex text and are provisional</div>
    <div class="tl-chips">${NARRATIVE.map((n) => `<button type="button" class="tl-chip" data-tag="${n.id}" aria-pressed="${!g.hideTags.includes(n.id)}" title="${esc(n.text)}"><span class="tl-nar" data-n="${n.id}">${esc(n.label)}</span></button>`).join('')}</div>
    <div class="tl-k tl-k2">evidence lens</div>
    <div class="tl-chips">${RUNGS.map((r) => `<button type="button" class="tl-chip" data-rung="${esc(r.id)}" aria-pressed="${lens === r.id}"><span class="tl-rung" data-r="${esc(r.id)}">${esc(r.label)}</span><span class="n">${counts[r.id]}</span></button>`).join('')}</div>
    <dl class="tl-legend-rungs">${RUNGS.map((r) => `<div><dt><span class="tl-rung" data-r="${esc(r.id)}">${esc(r.label)}</span></dt><dd>${esc(r.text)}</dd></div>`).join('')}</dl>`;
  root.querySelector('#tl-read').addEventListener('change', (e) => on.read(Number(e.target.value)));
  root.querySelectorAll('[data-dim]').forEach((b) => b.addEventListener('click', () => on.dim(b.dataset.dim)));
  root.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => on.tag(b.dataset.tag)));
  root.querySelectorAll('[data-rung]').forEach((b) => b.addEventListener('click', () => on.lens(b.dataset.rung)));
}

/* ---------------- people ---------------- */

export function renderPeople(root, follow, onFollow) {
  const cs = charsVisible();
  root.innerHTML = cs.length
    ? cs.map((c) => `<button type="button" class="tl-chip" data-c="${esc(c.id)}" aria-pressed="${follow === c.id}">${esc(c.name)} <span class="n">b. c. ${NOW - c.age}</span></button>`).join('')
    : '<p class="tl-note">No characters before Book 1. Move your reading position to chapter 1 or later.</p>';
  root.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => onFollow(b.dataset.c)));
}

/* ---------------- reading trails ---------------- */

export function renderTrail(root, trail, cur, on) {
  const evs = trail.map((id) => byId.get(id)).filter((e) => e && readable(e));
  root.innerHTML = evs.length
    ? `<ol class="tl-trail">${evs.map((e, i) => `<li><button type="button" class="tl-link" data-id="${esc(e.id)}" aria-current="${i === cur ? 'step' : 'false'}">${i + 1}. ${esc(fmtCE(e.y, e.c))}: ${esc(e.title)}</button></li>`).join('')}</ol>
       <div class="tl-follow"><button type="button" class="tl-btn" data-t="prev">&larr; previous</button><button type="button" class="tl-btn" data-t="next">next &rarr;</button><button type="button" class="tl-btn" data-t="clear">clear trail</button></div>`
    : '<p class="tl-note">Select events and press “add to trail” to build an ordered reading trail. It gets its own link.</p>';
  root.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => on.pick(b.dataset.id)));
  root.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => on[b.dataset.t]()));
}

/* ---------------- the event table (the accessible twin of the canvas) ---------------- */

export function renderIndex(root, { filter = '', inView = null } = {}, onPick) {
  const q = filter.trim().toLowerCase();
  const rows = VIS.filter((e) => (!q || `${e.title} ${e.text} ${worldName(e.world)}`.toLowerCase().includes(q)) && (!inView || (e.y >= inView[0] && e.y <= inView[1])));
  root.querySelector('tbody').innerHTML = rows.map((e) => {
    const deep = e.y < -50000, pre = e.c ? 'c. ' : '';
    return `<tr data-id="${esc(e.id)}"><td class="d">${esc(fmtCE(e.y, e.c))}</td><td class="d">${esc(deep ? '—' : pre + fmtAT(e.y))}</td><td class="d">${esc(deep ? '—' : pre + fmtCycle(e.y))}</td><td>${esc(worldName(e.world))}</td>
      <td><button type="button" data-id="${esc(e.id)}" aria-pressed="false">${esc(e.title)}</button></td>
      <td><span class="tl-nar" data-n="${esc(e.tag)}">${esc(narrativeLabel(e.tag))}</span>${[...new Set(physicsOf(e).map((p) => p.rung))].map((r) => ` <span class="tl-rung" data-r="${esc(r)}">${esc(rungLabel(r))}</span>`).join('')}</td></tr>`;
  }).join('');
  root.querySelector('[data-k="count"]').textContent = `${rows.length} of ${ALL.filter(readable).length} events`;
  root.querySelectorAll('tbody button[data-id]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.id, { from: 'index' })));
}

export function markIndex(root, sel, hi = []) {
  const H = new Set(hi);
  root.querySelectorAll('tbody tr').forEach((tr) => {
    const on = tr.dataset.id === sel;
    tr.classList.toggle('on', on); tr.classList.toggle('hi', H.has(tr.dataset.id));
    tr.querySelector('button')?.setAttribute('aria-pressed', String(on));
    if (on) tr.setAttribute('aria-current', 'true'); else tr.removeAttribute('aria-current');
  });
}

/* ---------------- the answer ---------------- */

export function renderAnswer(root, res, { pending = false, label = '', onPick } = {}) {
  root.hidden = false;
  const p = root.querySelector('.tl-ans-text');
  if (res.claims?.length) {
    // the model's sentences, each checked: a date or quantity not found in its context is struck through
    p.replaceChildren(...res.claims.flatMap((c) => {
      const el = document.createElement(c.ok ? 'span' : 's');
      el.textContent = c.text + ' ';
      if (!c.ok) el.title = `not in the events it was given: ${c.missing.join(', ')}`;
      return [el];
    }));
  } else p.textContent = res.answer || '';
  p.classList.toggle('refused', !!res.refused);
  root.querySelector('.tl-ans-meta').textContent = label + (pending ? ' · asking the model…' : '');
  const links = root.querySelector('.tl-ans-links');
  links.innerHTML = (res.events || []).map((id) => {
    const e = byId.get(id), l = layerById.get(id);
    if (l) return `<button type="button" class="tl-link" data-id="${esc(id)}">${esc(l.title)}</button>`;
    return e && readable(e) ? `<button type="button" class="tl-link" data-id="${esc(id)}">${esc(fmtCE(e.y, e.c))}: ${esc(e.title)}</button>` : '';
  }).join('');
  links.querySelectorAll('.tl-link').forEach((b) => b.addEventListener('click', () => onPick?.(b.dataset.id)));
}

/* ---------------- the clock converter ---------------- */

export function convert(input) {
  const age = parseAge(input);
  if (age) return { kind: 'age', html: `<p>${esc(age.n)} ${age.from === 'at' ? 'Terran' : age.from === 'cycle' ? 'Kha-Ren' : 'Earth'} years =</p><ul><li><b>${age.earth.toFixed(1)}</b> Earth years (365.25 days)</li><li><b>${age.terra.toFixed(1)}</b> Terran years (about 400 days)</li><li><b>${age.kharen.toFixed(1)}</b> Kha-Ren years (about 365 days), <b>${(age.kharen / 75).toFixed(2)}</b> Cycles</li></ul>` };
  const p = parseDate(input);
  if (!p) return { kind: 'none', html: '<p class="tl-note">Try 3537 BCE, 1500 A.T., Cycle 16 Year 13, 4 Ga, or an age such as 42 Earth years.</p>' };
  const y = p.ce;
  if (y > NOW + 1) return { kind: 'none', html: '<p class="tl-note">After the story present: held for the books.</p>' };
  return { kind: 'date', ce: y, html: `<p>${esc(p.read)} =</p><ul><li>Earth: <b>${esc(fmtCE(y))}</b></li><li>Terra: <b>${esc(fmtAT(y))}</b></li><li>Kha-Ren: <b>${esc(fmtCycle(y))}</b></li></ul>` };
}

/* ---------------- where the codex disagrees with itself ---------------- */

export function renderDiscrepancies(root) {
  const cal = calendarDiscrepancies();
  root.innerHTML = `
    <p class="tl-note">The page computes every date from the codex’s own conversion rules and checks them against the codex’s printed tables. ${cal.length} printed values disagree with the rules; each is listed with both values. The page follows the rules.</p>
    <div class="tl-tablewrap"><table class="tl-table"><thead><tr><th>Earth date</th><th>printed in the codex</th><th>the codex’s rule gives</th><th>where</th></tr></thead><tbody>
    ${cal.map((r) => `<tr><td class="d">${esc(fmtCE(r.ce))}</td><td class="d">${esc(r.printed)}</td><td class="d">${esc(r.computed)}</td><td><code>${esc(sourceFile(r.src))}</code> § ${esc(r.sec)}</td></tr>`).join('')}
    </tbody></table></div>
    <ul class="tl-disc">${DISCREPANCIES.map((d) => `<li><b>${esc(d.topic)}</b><p>${esc(d.a)} <span class="tl-tag">${esc(sourceFile(d.aSrc) || 'published science')}</span></p><p>${esc(d.b)} <span class="tl-tag">${esc(sourceFile(d.bSrc) || 'published science')}</span></p><p class="tl-note">${esc(d.note)}</p></li>`).join('')}</ul>`;
}

/* ---------------- references ---------------- */

export function renderRefs(root) {
  root.innerHTML = references().map((r) => `<li>${esc(r.cite)}${doiLink(r)}</li>`).join('');
}

export { fmtDay, CEILING };
