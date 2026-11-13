/* ============================================================
   token-ekg/view/dataset.js — the 60-run table.
   One row per model: the cold first run apart, the warm runs as
   median and interquartile range, and one dot per run on a shared
   decode-rate axis. A dot is a button: it plays that run.
   ============================================================ */

import { analyze, quantile, fmtMs } from '../engine/stats.js';

const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const qs = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return { m: quantile(s, 0.5), lo: quantile(s, 0.25), hi: quantile(s, 0.75), min: s[0], max: s[s.length - 1] };
};

export function renderDataset(table, note, runs, onPlay) {
  if (!runs.length) { table.innerHTML = '<tr><td>The dataset did not load.</td></tr>'; return; }
  const byModel = new Map();
  for (const t of runs) {
    if (!byModel.has(t.model)) byModel.set(t.model, []);
    byModel.get(t.model).push({ t, a: analyze(t) });
  }
  const maxRate = Math.max(...runs.map((t) => analyze(t).rate).filter(Number.isFinite)) * 1.08;
  const rows = [...byModel.entries()].map(([model, list]) => {
    const cold = list.filter((x) => x.t.warm === false);
    const warm = list.filter((x) => x.t.warm !== false);
    const evicted = warm.filter((x) => x.t.residentAtStart && !x.t.residentAtStart.includes(model));
    const clean = warm.filter((x) => !evicted.includes(x));
    const ttft = qs(clean.map((x) => x.a.ttft));
    const rate = qs(warm.map((x) => x.a.rate));
    const wait = qs(warm.map((x) => x.a.median));
    const n = qs(list.map((x) => x.a.n));
    const exact = list.filter((x) => x.a.server && x.a.server.evalCount === x.a.n + 1).length;
    const dots = list.map((x, i) => `<button type="button" data-id="${esc(x.t.id)}" class="${x.t.warm === false ? 'cold' : ''}" style="left:${((x.a.rate / maxRate) * 100).toFixed(2)}%"
      title="run ${i + 1}: ${fmt(x.a.rate, 1)} tok/s, first token ${fmtMs(x.a.ttft)}${x.t.warm === false ? ', cold' : ''}"
      aria-label="Play ${esc(model)} run ${i + 1}: ${fmt(x.a.rate, 1)} tokens per second, first token ${fmtMs(x.a.ttft)}${x.t.warm === false ? ', cold start' : ''}"></button>`).join('');
    const t0 = list[0].t;
    return `<tr>
      <td class="m">${esc(model)}<br><small>${esc(t0.params)} ${esc(t0.quant)}</small></td>
      <td>${cold.length ? fmtMs(cold[0].a.ttft) : '-'}<br><small>${cold.length && cold[0].a.server ? `load ${fmtMs(cold[0].a.server.loadMs)}` : ''}</small></td>
      <td>${fmtMs(ttft.m)}<br><small>${fmtMs(ttft.lo)} - ${fmtMs(ttft.hi)}${evicted.length ? `; ${evicted.length} evicted run${evicted.length > 1 ? 's' : ''} left out` : ''}</small></td>
      <td class="m">${fmt(rate.m, 1)}<br><small>${fmt(rate.lo, 1)} - ${fmt(rate.hi, 1)}</small></td>
      <td>${fmtMs(wait.m)}<br><small>${fmtMs(wait.lo)} - ${fmtMs(wait.hi)}</small></td>
      <td>${fmt(n.m)}<br><small>${fmt(n.min)} - ${fmt(n.max)}</small></td>
      <td>${exact}/${list.length}</td>
      <td><span class="dots">${dots}</span></td>
    </tr>`;
  });
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span>${fmt(maxRate * f, 0)}</span>`).join('');
  table.innerHTML = `<thead><tr><th>model</th><th>cold<br>first token</th><th>warm first token<br>median, IQR</th><th>decode tok/s<br>median, IQR</th>
    <th>median wait<br>median, IQR</th><th>chunks<br>median, range</th><th>chunks + 1<br>= eval_count</th><th>each run: decode tok/s<span class="axis">${ticks}</span></th></tr></thead><tbody>${rows.join('')}</tbody>`;
  table.onclick = (e) => { const b = e.target.closest('.dots button'); if (b) onPlay(b.dataset.id); };
  const total = runs.length, models = byModel.size;
  const evictedAll = runs.filter((t) => t.warm !== false && t.residentAtStart && !t.residentAtStart.includes(t.model)).length;
  note.textContent = `${total} runs over ${models} models, recorded 2026-11-11, temperature 0.7, num_ctx 8192, seeds 101 to 110. ` +
    `Ring = the cold first run. ${evictedAll} warm runs found their model evicted by other work on the machine and reloaded it; their first-token times are left out of the warm median and kept in the file.`;
}
