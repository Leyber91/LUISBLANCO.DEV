/* ============================================================
   honesty-decoder/view/receipt.js — the focal element: one system's
   receipt. The live hub blurb with each phrase set as its own audit,
   the computed figure and its interval, the meter segmented by
   sub-claim weight, every sub-claim with its verdict mark, basis and
   check, and the readouts that say which sub-claim moves the figure.
   Also draws the connectors from claim phrase to sub-claim to the
   mechanism sentence that settles it.
   ============================================================ */

import { esc, fmt, sgn, mark, statusMark, vclass, countTo, BASIS_LABEL } from './util.js';

const NEXT = { supported: 'partial', partial: 'unsupported', unsupported: 'supported' };

function phraseSpans(blurb, subs, effOf) {
  const lower = blurb.toLowerCase();
  const hits = [];
  subs.forEach((s, k) => {
    if (!s.phrase) return;
    const at = lower.indexOf(s.phrase.toLowerCase());
    if (at >= 0) hits.push({ at, end: at + s.phrase.length, s, k });
  });
  hits.sort((a, b) => a.at - b.at || b.end - a.end);
  const keep = [];
  for (const h of hits) if (!keep.length || h.at >= keep[keep.length - 1].end) keep.push(h);
  let out = '', i = 0;
  for (const h of keep) {
    out += esc(blurb.slice(i, h.at));
    out += `<span class="ph ${vclass(effOf(h.s))}" data-sub="${esc(h.s.id)}">${esc(blurb.slice(h.at, h.end))}<sup>${h.k + 1}</sup></span>`;
    i = h.end;
  }
  return out + esc(blurb.slice(i));
}

export function renderReceipt(app, el) {
  const sys = app.byId[app.sel];
  if (!sys) return;
  const sc = app.score(sys);
  const f = sc?.fig;
  const list = app.systems;
  const idx = list.indexOf(sys);
  const st = app.stale(sys);
  const effOf = (s) => sc.items.find((i) => i.id === s.id)?.eff;
  const byId = Object.fromEntries(sc.items.map((i) => [i.id, i]));
  const testing = app.testing && app.testing.row === sys.id ? app.testing.sub : null;
  const offsite = sys.kind === 'offsite';

  /* header */
  const link = sys.href ? `<a href="${esc(sys.href)}">${esc(sys.href)}</a>` : sys.kind === 'nopage' ? 'no page' : 'off-site';
  const snapLab = app.snapshot.labs?.[sys.id];
  const meta = sys.kind === 'lab'
    ? `<span>graded <b>${esc(app.snapshot.grading?.date || '2026-11-11')}</b> at <b>${esc(st?.graded || snapLab?.commit || 'uncommitted')}</b></span>
       <span>lab now <b>${esc(st?.now || '—')}</b>${st?.any ? ` <span class="stale">stale: ${esc([st.commitStale ? 'lab committed since grading' : '', st.changedFiles.length ? `${st.changedFiles.length} file${st.changedFiles.length > 1 ? 's' : ''} changed since the snapshot` : '', st.drift.length ? `blurb changed (${st.drift.length} phrase${st.drift.length > 1 ? 's' : ''} gone)` : ''].filter(Boolean).join('; '))}</span>` : ' (fresh)'}</span>`
    : offsite ? '<span><b>not checkable from this page</b>: every sub-claim is the author\'s own assertion</span>'
      : '<span>the hub entry has no page: every checkable sub-claim is unsupported</span>';

  /* figure */
  const prevEl = el.querySelector('#fig-n');
  const prevV = prevEl && el.dataset.sys === sys.id ? prevEl.dataset.v || 0 : 0;
  el.dataset.sys = sys.id;
  const author = offsite ? app.author(sys) : null;
  const figHTML = f?.point != null
    ? `<div class="fig-num" aria-hidden="true"><span id="fig-n" data-v="${prevV}">${prevV}</span><small>%</small></div>`
    : `<div class="fig-num none">${offsite ? 'not checkable<br>from this page' : 'no checked<br>sub-claim'}</div>`;
  const sideHTML = f?.point != null
    ? `<span>interval <b>${fmt(f.low)} to ${fmt(f.high)}</b> · width <b>${fmt(f.width)} pts</b></span>
       <span>basis <span class="tag">${esc(sc.basisTag)}</span>${sc.pending ? ' · checks running' : ''}</span>
       <span>unverified share <b>${fmt(f.unverifiedShare)}%</b> of the claim's weight</span>
       <span>FActScore <b>${fmt(f.factscore)}</b> (${f.nSup} of ${f.n} sub-claims supported, unweighted) · gap <b>${sgn(f.gap)} pts</b></span>`
    : offsite ? `<span>the author's verdicts, taken on trust, would give <b>${fmt(author?.point)}</b>; none can be checked here, so the whole claim counts as unverified share</span>
       <span>basis <span class="tag">asserted</span> · unverified share <b>100%</b></span>`
      : '<span>no sub-claim has a check behind it</span>';

  /* meter */
  const W = sc.items.filter((i) => i.type !== 'framing').reduce((a, i) => a + i.w, 0) || 1;
  const segs = sc.items.filter((i) => i.type !== 'framing').map((i, k) =>
    `<i class="seg ${vclass(i.eff)}${i.eff.status === 'pending' ? ' pending' : ''}${app.focus === i.id ? ' on' : ''}" data-sub="${esc(i.id)}" style="--i:${k};width:${(100 * i.w) / W}%" title="${esc(`${i.sub.text} (${i.eff.verdict}, weight ${i.w})`)}"></i>`).join('');
  const meterHTML = f?.point != null || offsite ? `
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${f?.point != null ? Math.round(f.point) : 0}" aria-label="${esc(`${sys.title} reality figure`)}" aria-valuetext="${f?.point != null ? `${fmt(f.point)} percent, interval ${fmt(f.low)} to ${fmt(f.high)}` : 'not checkable'}">
      <div class="mt-seg">${segs}</div>
      ${f?.point != null ? `<div class="mt-band" aria-hidden="true"><i class="ln" style="left:${f.low}%;width:${f.high - f.low}%"></i><i class="pt" style="left:${f.point}%"></i></div>
      <div class="mt-asp" aria-hidden="true"><i class="real" style="width:${f.point}%"></i><i class="asp"></i></div>
      <div class="mt-legend"><span>segments: width = weight, fill = verdict · band = interval</span><span><span>${fmt(f.point)}% real</span> · <span class="a">${fmt(100 - f.point)}% aspiration</span></span></div>` : ''}
    </div>` : '';

  /* caption: the page explaining itself while it runs */
  const p = app.progress;
  let cap;
  if (app.testing) {
    const t = app.testing;
    const tsub = t.sub ? app.byId[t.row]?.row?.subs.find((s) => s.id === t.sub) : null;
    cap = `<b>checking</b> ${esc(app.byId[t.row]?.title || 'shared component')}${tsub ? ` · "${esc(tsub.phrase)}"` : ''}: ${esc(t.what || '')}. <b>would fail</b> ${esc(t.fails || '')}.`;
  } else if (p.total) {
    const waiting = Object.entries(app.results).filter(([, r]) => r.status === 'skipped').map(([k]) => app.systems.find((x) => x.row?.subs.some((s) => `${s.id}#probe` === k))?.title).filter(Boolean);
    cap = `<b>verification pass ${p.only ? `for ${esc(app.byId[p.only]?.title || p.only)} ` : ''}done</b>: ${p.done} check${p.done === 1 ? '' : 's'} in ${((p.ms || 0) / 1000).toFixed(1)} s, ${p.failed} failed${waiting.length ? `; deep check${waiting.length === 1 ? '' : 's'} waiting for ${esc([...new Set(waiting)].join(', '))}, run${waiting.length === 1 ? 's' : ''} when that lab is selected` : ''}. Each mark below shows the check that backs it.`;
  } else cap = '<b>starting</b>: the figures below are computed from the graded verdicts until each check resolves.';
  const prog = p.total ? `<span class="bar-p"><i style="width:${(100 * p.done) / p.total}%"></i></span>` : '';

  /* sub-claims */
  const rows = sc.items.map((i, k) => {
    const s = i.sub, e = i.eff;
    const keys = app.E.checkKeys(s);
    const res = keys.map((kk) => app.results[kk]).filter(Boolean);
    const stat = e.excluded ? 'none' : e.basis === 'author' || e.basis === 'inspection' ? 'none'
      : res.some((r) => r.status === 'fail' || r.status === 'error') ? 'fail' : res.some((r) => r.status === 'skipped') ? 'skipped'
        : res.length < keys.length || res.some((r) => r.status === 'pending') ? 'pending' : s.nopage ? 'pass' : res.length ? 'pass' : 'none';
    const ms = res.reduce((a, r) => a + (r.ms || 0), 0);
    const changed = app.over[app.sel]?.[s.id] || app.weights[app.sel]?.[s.id] != null;
    const wCtl = app.challengeMode && !e.excluded ? `<span class="wctl"><button type="button" data-w="-1" data-sub="${esc(s.id)}" aria-label="lower weight">-</button><button type="button" data-w="1" data-sub="${esc(s.id)}" aria-label="raise weight">+</button></span>` : '';
    return `<li class="sub${e.excluded ? ' frm' : ''}${app.focus === s.id ? ' on' : ''}${testing === s.id ? ' test' : ''}${changed ? ' changed' : ''}" data-sub="${esc(s.id)}">
      <button type="button" class="markbtn" data-flip="${esc(s.id)}" aria-label="${esc(`${s.text}: ${e.excluded ? 'framing, not scored' : e.verdict}. ${e.excluded ? '' : 'Press to challenge this verdict.'}`)}">${mark(vclass(e), e.excluded ? 'framing' : e.verdict)}</button>
      <span class="tx">${k + 1}. ${esc(s.text)}<small>${esc(s.type)} · ${esc(e.failed ? `check ${e.failed.status}: ${e.failed.detail}` : e.computed?.reason || e.computed?.detail || s.note)}</small></span>
      <span class="w">${i.w}${wCtl}</span>
      <span class="bs">${esc(BASIS_LABEL[e.basis] || e.basis)}</span>
      <span class="ck">${stat !== 'none' && ms ? `${ms} ms` : ''}${statusMark(stat)}</span></li>`;
  }).join('');

  /* readouts */
  const sens = sc.sens, gd = sc.gap;
  const subTxt = (id) => byId[id]?.sub?.phrase || id;
  const readouts = f?.point != null ? `
    <div>most sensitive: <b>"${esc(subTxt(sens.id))}"</b>: moving it from ${verdictName(sens.from)} to ${verdictName(sens.to)} changes the figure by <b>${sgn(sens.delta)} pts</b>, to ${fmt(sens.figure)}</div>
    <div>FActScore cross-check: <b>${fmt(f.factscore)}</b> against <b>${fmt(f.point)}</b>${Math.abs(f.gap) > 10 ? `; the gap of ${sgn(f.gap)} pts comes most from <b>"${esc(subTxt(gd.driver.id))}"</b> (${sgn(gd.driver.c)} pts), through ${gapCause(byId[gd.driver.id])}` : `; the two agree within 10 pts`}</div>` : '';

  const mine = app.over[app.sel] || app.weights[app.sel];
  const hasMine = mine && (Object.keys(app.over[app.sel] || {}).length || Object.keys(app.weights[app.sel] || {}).length);
  const graded = app.graded(sys);
  const challenge = sys.row && !offsite && sys.kind === 'lab' ? `<div class="challenge">
      <button class="btn" type="button" id="ch-mode" aria-pressed="${!!app.challengeMode}">challenge the grading</button>
      ${hasMine ? `<span class="mine">your grading gives ${fmt(f.point)} · the grader's gives ${fmt(graded?.fig.point)} at G1</span><button class="btn" type="button" id="ch-restore">restore the grading</button><button class="btn" type="button" id="ch-share">copy link to my grading</button>` : '<span>press any mark to flip its verdict; with challenge on, change weights too</span>'}
    </div>` : '';

  el.innerHTML = `
    <div class="rc-top">
      <div class="rc-name"><span class="no">receipt ${String(idx + 1).padStart(2, '0')}/${list.length}</span>${esc(sys.title)}</div>
      <div class="rc-meta"><span>${esc(sys.status)}</span><span>${link}</span></div>
    </div>
    <div class="rc-meta grade">${meta}</div>
    <div class="step"><button class="btn" type="button" id="st-prev" aria-label="previous system">&larr;</button><button class="btn" type="button" id="st-next" aria-label="next system">&rarr;</button></div>
    <div class="claim"><span class="rk">the claim · ${sys.kind === 'offsite' ? 'as the author states it' : 'the live hub blurb, site.config.js'}</span>${phraseSpans(sys.blurb || '', sys.row.subs, effOf)}</div>
    <p class="mobile-mech">${esc((sys.row.mech?.[0]?.[0] || ''))}</p>
    <div class="figure">${figHTML}<div class="fig-side">${sideHTML}</div></div>
    ${meterHTML}
    <div class="caption" aria-live="off">${cap}${prog}</div>
    <ol class="subs" aria-label="sub-claims">${rows}</ol>
    <div class="readouts">${readouts}</div>
    ${challenge}`;

  if (f?.point != null) countTo(el.querySelector('#fig-n'), f.point);

  /* interaction */
  el.querySelectorAll('[data-flip]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = b.dataset.flip, it = byId[id];
    if (!it || it.eff.excluded || sys.kind !== 'lab') { app.setFocus(id); return; }
    const base = app.E.effective(it.sub, app.results, app.route).verdict;
    const cur = it.eff.verdict === 'unverified' ? base : it.eff.verdict;
    const nxt = NEXT[cur] || 'supported';
    app.focus = id;
    app.challenge(id, nxt === base ? null : nxt);
  }));
  el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = b.dataset.sub, it = byId[id];
    const w = (app.weights[app.sel]?.[id] ?? it.sub.w) + Number(b.dataset.w);
    app.reweigh(id, w === it.sub.w ? null : w);
  }));
  el.querySelectorAll('.sub').forEach((li) => {
    li.addEventListener('click', () => app.setFocus(li.dataset.sub));
    li.addEventListener('mouseenter', () => { app.hover = li.dataset.sub; lightWires(app); });
    li.addEventListener('mouseleave', () => { app.hover = null; lightWires(app); });
  });
  el.querySelectorAll('.ph, .seg').forEach((x) => {
    x.addEventListener('click', () => app.setFocus(x.dataset.sub));
    x.addEventListener('mouseenter', () => { app.hover = x.dataset.sub; lightWires(app); });
    x.addEventListener('mouseleave', () => { app.hover = null; lightWires(app); });
  });
  el.querySelector('#ch-mode')?.addEventListener('click', () => { app.challengeMode = !app.challengeMode; app.render(); });
  el.querySelector('#ch-restore')?.addEventListener('click', () => app.restore());
  el.querySelector('#ch-share')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'link copied'; } catch { e.target.textContent = 'copy the address bar'; }
  });
  const step = (d) => app.select(list[(idx + d + list.length) % list.length].id);
  el.querySelector('#st-prev')?.addEventListener('click', () => step(-1));
  el.querySelector('#st-next')?.addEventListener('click', () => step(1));
}

const verdictName = (v) => (v === 1 ? 'supported' : v === 0.5 ? 'partial' : 'unsupported');
function gapCause(it) {
  if (!it) return 'its weight';
  if (it.v === 0.5) return 'partial credit (FActScore counts a partial as not supported)';
  if (it.v == null) return 'being unverified (FActScore counts it as not supported)';
  return `its weight of ${it.w} (FActScore weighs every sub-claim equally)`;
}

/* ---------------------------------------------------------- connectors */
function anchor(el, deckBox, side) {
  const b = el.getBoundingClientRect();
  if (!b.width && !b.height) return null;
  const x = side === 'left' ? b.left : side === 'right' ? b.right : b.left + b.width / 2;
  const y = side === 'bottom' ? b.bottom : b.top + b.height / 2;
  return { x: x - deckBox.left, y: y - deckBox.top };
}

export function drawWires(app, deck, svg) {
  if (!deck || !svg || matchMedia('(max-width: 860px)').matches) { if (svg) svg.innerHTML = ''; return; }
  const box = deck.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  const sys = app.byId[app.sel];
  if (!sys?.row) { svg.innerHTML = ''; return; }
  let out = '';
  for (const s of sys.row.subs) {
    const li = deck.querySelector(`.sub[data-sub="${CSS.escape(s.id)}"]`);
    if (!li) continue;
    const ph = deck.querySelector(`.ph[data-sub="${CSS.escape(s.id)}"]`);
    const r = anchor(li, box, 'left');
    if (ph && r) {
      const a = anchor(ph, box, 'bottom');
      const lx = Math.min(a.x, r.x) - 16;
      out += `<path data-sub="${esc(s.id)}" d="M${a.x},${a.y} C${a.x},${a.y + 30} ${lx},${a.y + 20} ${lx},${(a.y + r.y) / 2} S${r.x - 10},${r.y} ${r.x},${r.y}"/>`;
    }
    const rr = anchor(li, box, 'right');
    deck.querySelectorAll('.ms').forEach((ms) => {
      if (!ms.dataset.subs.split(' ').includes(s.id)) return;
      const m = anchor(ms, box, 'left');
      if (!m || !rr) return;
      const mx = (rr.x + m.x) / 2;
      out += `<path data-sub="${esc(s.id)}" d="M${rr.x},${rr.y} C${mx},${rr.y} ${mx},${m.y} ${m.x - 4},${m.y}"/><circle data-sub="${esc(s.id)}" cx="${m.x - 4}" cy="${m.y}" r="2"/>`;
    });
  }
  svg.innerHTML = out;
  lightWires(app);
}

export function lightWires(app) {
  const id = app.hover || app.focus;
  document.querySelectorAll('#wires [data-sub]').forEach((p) => p.classList.toggle('on', p.dataset.sub === id));
  document.querySelectorAll('#deck .ph, #deck .ms, #deck .sub, #deck .seg').forEach((x) => {
    const subs = (x.dataset.subs || x.dataset.sub || '').split(' ');
    x.classList.toggle('on', !!id && subs.includes(id));
  });
}
