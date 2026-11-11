/* ============================================================
   altverse/render/sweep-view.js — move the number, watch what
   switches. The engine weaves the world again at 24 values across
   the dial's legal range (yielding to the page between runs), and
   the grid shows, for every consequence the rules can produce,
   at which values it fires. Outcome rows (toolmakers, a frozen or
   boiled planet, chemistry) come first. The current value is the
   gold column.
   ============================================================ */

import { weaveSync } from '../pipeline.js';
import { STAGE_ORDER } from '../config.js';
import { esc, el } from './svg.js';

const STEPS = 24;
const outcomes = (w) => ({
  'toolmakers exist': !!w.ctx.bio.observers,
  'complex life': !!w.ctx.bio.complex,
  'chemistry beyond helium': w.ctx.phys.planet,
  'snowball': !!(w.ctx.clim && w.ctx.clim.snowball),
  'oceans boil away': !!(w.ctx.clim && w.ctx.clim.runaway),
  'orbit before 2000': (() => { const r = (w.stages.technology.ladder || []).find((x) => x.tech === 'orbit'); return !!(r && r.theirs != null && r.theirs < 2000); })(),
});

export async function runSweep(host, seed, dial, current, { onDone } = {}) {
  host.innerHTML = `<p class="empty">weaving ${STEPS} worlds across ${esc(dial.label)}...</p><div class="sw-bar"><i></i></div>`;
  const bar = host.querySelector('.sw-bar i');
  const vals = Array.from({ length: STEPS }, (_, i) => dial.min + (dial.max - dial.min) * i / (STEPS - 1));
  const runs = [];
  const t0 = performance.now();
  for (let i = 0; i < vals.length; i++) {
    const w = weaveSync(seed, [{ text: dial.text(vals[i]) }]);
    const fired = new Set();
    STAGE_ORDER.forEach((s) => (w.stages[s].items || []).forEach((it) => { if (!/-m\d/.test(it.id) && !/^ct-/.test(it.id) && !/^tk-/.test(it.id)) fired.add(it.id); }));
    runs.push({ v: vals[i], fired, out: outcomes(w), mean: w.ctx.clim && !w.ctx.clim.runaway ? w.ctx.clim.Tmean : null, text: Object.fromEntries([...STAGE_ORDER.flatMap((s) => (w.stages[s].items || []).map((it) => [it.id, it.text]))]) });
    bar.style.width = `${Math.round(((i + 1) / STEPS) * 100)}%`;
    await new Promise((r) => setTimeout(r, 0));
  }
  const ms = Math.round(performance.now() - t0);
  const ids = [...new Set(runs.flatMap((r) => [...r.fired]))];
  const varying = ids.filter((id) => !runs.every((r) => r.fired.has(id)));
  const steady = ids.length - varying.length;
  const outRows = Object.keys(runs[0].out).filter((k) => runs.some((r) => r.out[k] !== runs[0].out[k]) || runs[0].out[k]);
  const ci = vals.reduce((b, v, i) => (Math.abs(v - current) < Math.abs(vals[b] - current) ? i : b), 0);
  const flips = (get) => { const out = []; for (let i = 1; i < runs.length; i++) if (get(runs[i]) !== get(runs[i - 1])) out.push(`${get(runs[i]) ? 'on' : 'off'} at ${dial.fmt((runs[i - 1].v + runs[i].v) / 2)}`); return out.join(', '); };
  const row = (label, get, title) => `<tr><th title="${esc(title || label)}">${esc(label)}</th>${runs.map((r, i) => `<td class="${get(r) ? 'on' : ''}${i === ci ? ' cur' : ''}"></td>`).join('')}<td class="fl">${esc(flips(get) || (get(runs[0]) ? 'always' : 'never'))}</td></tr>`;
  host.innerHTML = `<div class="scroll-x"><table class="sw"><thead><tr><th>${esc(dial.label)}</th>${runs.map((r, i) => `<td class="${i === ci ? 'cur' : ''}">${i % 6 === 0 || i === STEPS - 1 ? esc(dial.fmt(r.v)) : ''}</td>`).join('')}<td class="fl">switches</td></tr></thead><tbody>
    ${outRows.map((k) => row(k, (r) => r.out[k])).join('')}
    <tr><th>global mean (C)</th>${runs.map((r, i) => `<td class="num${i === ci ? ' cur' : ''}">${r.mean == null ? '' : Math.round(r.mean)}</td>`).join('')}<td class="fl"></td></tr>
    ${varying.map((id) => row(id, (r) => r.fired.has(id), (runs.find((r) => r.fired.has(id)) || runs[0]).text[id])).join('')}
  </tbody></table></div>
  <p class="empty">${STEPS} engine runs in ${(ms / 1000).toFixed(1)} s. ${varying.length} consequences switch within this range; ${steady} hold at every value and are not listed. Hover a row id for its sentence. [REAL engine re-runs; thresholds as fine as the ${STEPS}-step grid]</p>`;
  onDone && onDone();
}
