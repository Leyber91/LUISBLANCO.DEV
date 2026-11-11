/* ============================================================
   honesty-decoder/view/side.js — the mechanism register, the evidence
   behind the focused sub-claim, the figure's history, and a live
   preview of the lab state the checks read.
   ============================================================ */

import { esc, fmt, mark, vclass, statusMark, BASIS_LABEL } from './util.js';
import { BASES, REPO } from '../config.js';
import { ASSERTED } from '../history.js';

let built = false, prevTimer = 0, prevFor = null;

function ensure(el) {
  if (built) return;
  built = true;
  el.innerHTML = `
    <section class="panel mech" id="sd-mech" aria-label="The mechanism"></section>
    <section class="panel ev" id="sd-ev" aria-label="Evidence"></section>
    <section class="panel hist" id="sd-hist" aria-label="History of the figure"></section>
    <section class="panel prev" id="sd-prev" aria-label="The checked lab state">
      <div class="rk"><span>lab state</span><b id="pv-url">—</b></div>
      <div class="win" id="pv-win"><div class="idle" id="pv-idle">the lab the receipt describes, in the state its checks read</div></div>
      <div class="cap"><span id="pv-cap">loads after a selection settles</span><a id="pv-open" href="#">open</a></div>
    </section>`;
}

const ghBlob = (commit, file, line) => `https://github.com/${REPO.owner}/${REPO.name}/blob/${commit}/${file}${line ? `#L${line}` : ''}`;

export function renderSide(app, el) {
  ensure(el);
  const sys = app.byId[app.sel];
  if (!sys?.row) return;
  const sc = app.score(sys);
  const byId = Object.fromEntries(sc.items.map((i) => [i.id, i]));

  /* mechanism */
  const mech = sys.row.mech || [];
  document.getElementById('sd-mech').innerHTML = `<div class="rk"><span>the mechanism · what the code does</span><b>${sys.kind === 'offsite' ? 'author' : 'code'}</b></div>` +
    mech.map(([t, ids]) => `<p><span class="ms" data-subs="${esc(ids.join(' '))}">${esc(t)}</span></p>`).join('');
  document.querySelectorAll('#sd-mech .ms').forEach((m) => m.addEventListener('mouseenter', () => { app.hover = m.dataset.subs.split(' ')[0]; import('./receipt.js').then((r) => r.lightWires(app)); }));
  document.querySelectorAll('#sd-mech .ms').forEach((m) => m.addEventListener('mouseleave', () => { app.hover = null; import('./receipt.js').then((r) => r.lightWires(app)); }));

  /* evidence */
  const focus = byId[app.focus] || sc.items.find((i) => i.type !== 'framing') || sc.items[0];
  document.getElementById('sd-ev').innerHTML = focus ? evidence(app, sys, focus) : '';

  /* history */
  document.getElementById('sd-hist').innerHTML = history(app, sys, sc);

  /* preview */
  preview(app, sys);
}

function evidence(app, sys, it) {
  const s = it.sub, e = it.eff;
  const keys = app.E.checkKeys(s);
  const checks = keys.map((k) => ({ k, r: app.results[k] })).filter((x) => x.r);
  const lines = (s.ev || []).map(([f, a]) => {
    const live = checks.map((c) => c.r.lines?.find((l) => l.f === f && l.a === a)).find(Boolean);
    const line = live?.line ?? app.snapshot.anchors?.[`${f}::${a}`] ?? null;
    const commit = live?.commit || app.snapshot.files?.[f]?.commit || null;
    const changed = live?.changed;
    const href = commit && commit !== 'uncommitted' ? ghBlob(commit, f, line) : null;
    return `<div class="row"><span>${line ? 'line' : 'file'}</span><span>${href ? `<a href="${esc(href)}" rel="noopener">${esc(f.replace(/^labs\//, ''))}${line ? `:${line}` : ''}</a>` : esc(f)} ${commit ? `@ ${esc(commit)}` : ''}${changed ? ' (file changed since the snapshot)' : ''}<br><code>${esc(a.length > 120 ? `${a.slice(0, 117)}...` : a)}</code></span></div>`;
  }).join('');
  const checkRows = checks.map(({ k, r }) => `<div class="row"><span>${esc(k.split('#')[1] || 'shared')}</span><span>${statusMark(r.status)} ${esc(r.status)}${r.ms != null ? ` · ${r.ms} ms` : ''}${r.ts ? ` · ${new Date(r.ts).toLocaleTimeString()}` : ''}<br>${esc(r.detail || '')}</span></div>`).join('');
  const route = s.route ? app.E.routeVerdict(s.route, app.route) : null;
  const state = sys.row.state && !sys.row.self ? `<div class="row"><span>state</span><span><a href="${esc(sys.row.state)}">${esc(sys.row.state)}</a></span></div>` : '';
  const shared = s.shared ? `<div class="row"><span>shared</span><span>${esc(app.shared[s.shared].name)}: ${esc(app.shared[s.shared].text)}</span></div>` : '';
  const commit = app.snapshot.labs?.[sys.id]?.commit || 'uncommitted';
  const issue = new URL(`https://github.com/${REPO.owner}/${REPO.name}/issues/new`);
  issue.searchParams.set('title', `Decoder dispute: ${sys.id} / ${s.id} (${e.verdict})`);
  issue.searchParams.set('body', `System: ${sys.title} (${sys.id})\nSub-claim: ${s.id}, "${s.text}"\nVerdict on the page: ${e.verdict} (graded ${s.verdict}), basis ${e.basis}\nLab commit: ${commit}\nPage: ${location.href}\n\nMy reason:\n`);
  return `<div class="rk"><span>evidence · sub-claim ${sys.row.subs.indexOf(s) + 1}</span><b>${esc(s.type)}</b></div>
    <h3>${mark(vclass(e))} ${esc(s.text)}</h3>
    <div class="row"><span>verdict</span><span>${esc(e.excluded ? 'framing: shown, never scored' : e.verdict)}${e.changed ? ` (graded ${esc(s.verdict)})` : ''}${app.over[app.sel]?.[s.id] ? ' · your challenge' : ''}. ${esc(s.note)}</span></div>
    <div class="row"><span>weight</span><span>${it.w}${it.w !== s.w ? ` (graded ${s.w})` : ''}: ${esc(s.why || '')}</span></div>
    <div class="row"><span>basis</span><span>${esc(BASES[e.basis]?.long || BASIS_LABEL[e.basis] || e.basis)}</span></div>
    ${route ? `<div class="row"><span>route</span><span>${esc(route.verdict)}: ${esc(route.reason)} (route for this visit: ${esc(app.route)}, ${esc(app.routeNote)})</span></div>` : ''}
    ${shared}${lines}${checkRows}${state}
    <div class="acts">${sys.kind === 'lab' ? '<button class="btn" type="button" id="ev-rerun">re-run this lab\'s checks</button>' : ''}<a class="btn" href="${esc(issue.href)}" rel="noopener" target="_blank">dispute this verdict</a></div>`;
}

/* The figure over its grading dates: asserted (dashed, hollow), then the
   computed G1 grading and the figure as checked now (solid). The move
   from asserted to computed is marked as a correction. */
function history(app, sys, sc) {
  const pts = (ASSERTED[sys.id] || []).map(([d, c, v]) => ({ d, c, v, kind: 'asserted' }));
  const g = app.graded(sys);
  if (g?.fig.point != null) pts.push({ d: app.snapshot.grading?.date || '2026-11-11', c: 'G1', v: g.fig.point, kind: 'graded' });
  if (sc.fig.point != null && !sc.pending) pts.push({ d: new Date().toISOString().slice(0, 10), c: 'now', v: sc.fig.point, kind: 'now' });
  if (!pts.length) return `<div class="rk"><span>history</span><b>—</b></div><div class="note">${sys.kind === 'offsite' ? 'asserted figures only; nothing on this page can check them' : 'no graded figure yet'}</div>`;
  const W = 340, H = 80, P = 26;
  // ordinal x: one step per dated point, so same-day revisions stay apart
  const x = (i) => (pts.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (pts.length - 1));
  const y = (v) => 8 + (1 - v / 100) * (H - 16);
  const pos = pts.map((p, i) => ({ ...p, x: x(i), y: y(p.v) }));
  const asserted = pos.filter((p) => p.kind === 'asserted');
  const comp = pos.filter((p) => p.kind !== 'asserted');
  const path = (arr) => arr.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const bridge = asserted.length && comp.length ? `<path class="ln" d="M${asserted[asserted.length - 1].x},${asserted[asserted.length - 1].y} L${comp[0].x},${comp[0].y}"/>` : '';
  const fixMark = asserted.length && comp.length ? `<circle class="fix" cx="${comp[0].x}" cy="${comp[0].y}" r="6"><title>correction: asserted figure replaced by a computed one</title></circle>` : '';
  const dots = pos.map((p) => `<circle class="dot${p.kind !== 'asserted' ? ' comp' : ''}" cx="${p.x}" cy="${p.y}" r="3"><title>${esc(`${p.d} ${p.c}: ${fmt(p.v)} (${p.kind})`)}</title></circle>`).join('');
  const lab = (p) => `<text x="${p.x}" y="${p.y - 7}" text-anchor="middle">${fmt(p.v)}</text>`;
  const tick = (p) => `<text x="${p.x}" y="${H + 10}" text-anchor="middle">${esc(p.c === 'now' ? 'now' : p.d.slice(5))}</text>`;
  return `<div class="rk"><span>history · ${pts.length} dated points</span><b>${asserted.length ? 'asserted, then computed' : 'computed'}</b></div>
    <svg viewBox="0 0 ${W} ${H + 12}" role="img" aria-label="${esc(`History of ${sys.title}: ${pos.map((p) => `${p.d} ${fmt(p.v)} ${p.kind}`).join(', ')}`)}">
      <line class="ax" x1="${P - 8}" y1="${y(0)}" x2="${W - P + 8}" y2="${y(0)}"/><line class="ax" x1="${P - 8}" y1="${y(100)}" x2="${W - P + 8}" y2="${y(100)}" stroke-dasharray="1 4"/>
      <text x="0" y="${y(100) + 4}">100</text><text x="8" y="${y(0) + 4}">0</text>
      ${asserted.length > 1 ? `<path class="ln" d="${path(asserted)}"/>` : ''}${bridge}${comp.length > 1 ? `<path class="ln comp" d="${path(comp)}"/>` : ''}
      ${dots}${pos.map(lab).join('')}${pos.map(tick).join('')}${fixMark}
    </svg>
    <div class="note">${asserted.length ? `hollow, dashed: figures typed into earlier versions of this page (git ${asserted.map((p) => p.c).join(', ')}); the ring marks the correction; ` : ''}filled: computed from sub-claim verdicts, at the G1 grading and as checked now</div>`;
}

function preview(app, sys) {
  const win = document.getElementById('pv-win');
  const url = sys.row.state && sys.kind === 'lab' && !sys.row.self ? sys.row.state : null;
  const open = document.getElementById('pv-open');
  document.getElementById('pv-url').textContent = url || (sys.row.self ? 'this page' : 'none');
  open.href = url || '#';
  open.hidden = !url;
  if (prevFor === app.sel) return;
  prevFor = app.sel;
  clearTimeout(prevTimer);
  const old = win.querySelector('iframe');
  if (old) old.remove();
  const idle = document.getElementById('pv-idle');
  const wide = matchMedia('(min-width: 861px)').matches;
  if (!url || !wide) {
    idle.hidden = false;
    idle.textContent = sys.row.self ? 'the decoder itself: its checks measure this page' : sys.kind === 'nopage' ? 'no page exists for this lab yet' : sys.kind === 'offsite' ? 'off-site: no page on this site to show' : 'open the lab to see its state';
    document.getElementById('pv-cap').textContent = '';
    return;
  }
  idle.hidden = false;
  idle.textContent = 'loading the checked state';
  document.getElementById('pv-cap').textContent = 'a live frame of the lab, scaled; it makes no model call';
  prevTimer = setTimeout(() => {
    const f = document.createElement('iframe');
    f.title = `${sys.title}, the state its checks read`;
    f.tabIndex = -1;
    f.setAttribute('loading', 'lazy');
    f.src = url;
    const scale = win.clientWidth / 1280;
    f.style.transform = `scale(${scale})`;
    f.addEventListener('load', () => { idle.hidden = true; }, { once: true });
    win.appendChild(f);
  }, 900);
}
