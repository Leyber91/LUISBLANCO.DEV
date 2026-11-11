/* ============================================================
   honesty-decoder/view/ledger.js — the overview: every system's
   figure on one ranked chart. Each row draws its interval as a band
   and its point as a tick; the selected system is the only gold.
   A listbox with roving tabindex: arrow keys step, Enter selects.
   ============================================================ */

import { esc, fmt } from './util.js';

const GROUPS = [
  ['lab', 'labs with a page'],
  ['nopage', 'no page yet'],
  ['offsite', 'off-site · not checkable from this page'],
];

let keyBound = false;

export function renderLedger(app, el) {
  const rows = app.systems.map((s) => ({ s, sc: app.score(s) }));
  const val = (r) => (r.sc?.fig.point ?? -1);
  let html = `<div class="rk"><span>the ledger</span><b>${app.systems.length} systems</b></div>
    <div class="lg-axis" aria-hidden="true"><span>system</span><span><i>0</i><i>50</i><i>100</i></span><span>fig</span></div>`;
  let rank = 0;
  for (const [kind, label] of GROUPS) {
    const g = rows.filter((r) => r.s.kind === kind).sort((a, b) => val(b) - val(a) || a.s.title.localeCompare(b.s.title));
    if (!g.length) continue;
    const meta = kind === 'lab'
      ? `${g.filter((r) => r.s.status === 'built').length} built · ${g.filter((r) => r.s.status === 'beta').length} beta`
      : kind === 'nopage' ? `${g.length} · 0 until a page exists` : `${g.length}`;
    html += `<div class="lg-group"><span>${label}</span><span>${meta}</span></div><ul class="lg-list" role="listbox" aria-label="${esc(label)}">`;
    for (const { s, sc } of g) {
      const f = sc?.fig;
      const on = s.id === app.sel;
      const st = app.stale(s);
      const cls = ['lg', s.kind === 'nopage' ? 'nopage compact' : '', s.kind === 'offsite' ? 'offsite' : '', st?.any ? 'stale' : '', app.compare === s.id ? 'cmp' : ''].join(' ');
      const band = f && f.low != null && s.kind !== 'offsite' ? `<i class="band" style="left:${f.low}%;width:${Math.max(0.6, f.high - f.low)}%"></i>` : '';
      const pt = f && f.point != null ? `<i class="pt" style="left:${f.point}%"></i>` : '';
      const num = s.kind === 'offsite' ? '—' : f?.point != null ? fmt(f.point) : '—';
      const aria = s.kind === 'offsite' ? `${s.title}, not checkable from this page`
        : `${s.title}, ${f?.point != null ? `${fmt(f.point)} percent, interval ${fmt(f.low)} to ${fmt(f.high)}` : 'no checked sub-claims'}${st?.any ? ', stale' : ''}`;
      html += `<li class="${cls}" role="option" id="lg-${esc(s.id)}" data-id="${esc(s.id)}" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-label="${esc(aria)}" style="--i:${rank++}">
        <span class="nm" title="${esc(s.title)}">${esc(s.title)}</span><span class="tr" aria-hidden="true">${band}${pt}</span><span class="num">${num}</span></li>`;
    }
    html += '</ul>';
  }
  const c = app.coverage;
  const built = c.by.built || { n: 0, m: 0, missing: [] };
  const beta = c.by.beta || { n: 0, m: 0 };
  const planned = c.by.planned || { n: 0, m: 0 };
  const cons = app.E.consistency(app.systems.filter((s) => s.kind === 'lab' && s.row).map((s) => s.row), app.shared);
  const sh = sharesOf(app);
  const p = app.progress;
  html += `<div class="lg-foot">
    <div>coverage <b>${built.n} of ${built.m}</b> built labs decoded · <b>${beta.n} of ${beta.m}</b> beta · <b>${planned.n} of ${planned.m}</b> planned${app.missingRows.length ? ` · missing: ${esc(app.missingRows.join(', '))}` : ''}</div>
    <div>check-backed <b>${Math.round(sh.checked)}%</b> of counted sub-claims · author assertion <b>${Math.round(sh.author)}%</b> · basis of figures: <b>${sh.fromChecks}</b> from checks, <b>${sh.fromAuthored}</b> from authored verdicts, <b>${sh.asserted}</b> asserted</div>
    <div>shared components <b>${Object.keys(app.shared).length}</b> · contradictions across rows <b>${cons.contradictions.length}</b> · stale rows <b>${sh.stale}</b></div>
    <div>checks <b>${p.done} of ${p.total}</b> run${p.failed ? ` · <b>${p.failed}</b> failed` : ''}${p.skipped ? ` · ${p.skipped} deep check${p.skipped === 1 ? '' : 's'} waiting` : ''}${p.ms ? ` · ${(p.ms / 1000).toFixed(1)} s` : ''}</div>
  </div>`;
  const had = el.contains(document.activeElement) ? document.activeElement.id : null;
  el.innerHTML = html;
  if (had) document.getElementById(had)?.focus({ preventScroll: true });
  el.querySelectorAll('.lg').forEach((li) => {
    li.addEventListener('click', () => { app.select(li.dataset.id); li.focus({ preventScroll: true }); });
  });
  if (!keyBound) {
    keyBound = true;
    el.addEventListener('keydown', (e) => {
      const items = [...el.querySelectorAll('.lg')];
      const i = items.findIndex((x) => x.dataset.id === app.sel);
      let j = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = Math.min(items.length - 1, i + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      if (j == null) return;
      e.preventDefault();
      app.select(items[j].dataset.id);
      requestAnimationFrame(() => el.querySelector(`#lg-${CSS.escape(items[j].dataset.id)}`)?.focus({ preventScroll: false }));
    });
  }
}

/* Shares across counted systems: how many sub-claims a passed check
   backs, how many rest on author assertion, and the basis of each figure. */
export function sharesOf(app) {
  let n = 0, checked = 0, author = 0, fromChecks = 0, fromAuthored = 0, asserted = 0, stale = 0;
  for (const s of app.systems) {
    const sc = app.score(s);
    if (!sc) continue;
    if (s.kind === 'offsite') { asserted++; continue; }
    if (sc.basisTag === 'computed from checks') fromChecks++; else if (sc.basisTag === 'asserted') asserted++; else fromAuthored++;
    if (s.kind !== 'lab') continue;
    if (app.stale(s)?.any) stale++;
    for (const it of sc.items) {
      if (it.type === 'framing') continue;
      n++;
      if (it.eff.basis === 'author') author++;
      else if (it.eff.status === 'pass' && it.eff.basis !== 'inspection') checked++;
    }
  }
  return { checked: n ? (100 * checked) / n : 0, author: n ? (100 * author) / n : 0, n, fromChecks, fromAuthored, asserted, stale };
}
