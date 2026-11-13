/* ============================================================
   token-ekg/view/export.js — a trace leaves the page as CSV, or as
   a card: a self-contained SVG in the page's own drawing language,
   with title, axes, units, route, model and date.
   ============================================================ */

import { ANALYSIS } from '../config.js';
import { fmtMs } from '../engine/stats.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (s) => (/[",\n\r]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

/** One row per chunk: index, t_ms, wait_ms, kind, buffered, text. */
export function toCSV(t) {
  const lines = [['index', 't_ms', 'wait_ms', 'kind', 'buffered', 'text'].join(',')];
  t.chunks.forEach((c, i) => {
    const w = i ? c.t - t.chunks[i - 1].t : c.t;
    lines.push([i + 1, c.t.toFixed(2), w.toFixed(2), c.kind === 't' ? 'thinking' : 'answer', i && w < ANALYSIS.BUFFER_MS ? 1 : 0, csvCell(c.text)].join(','));
  });
  return `# Token EKG trace ${t.id}: ${t.label}; model ${t.model}; route ${t.route}; recorded ${t.recorded}; t in ms since the request was sent\n` + lines.join('\n') + '\n';
}

/** A 1200 x 630 card of the whole run. */
export function cardSVG(t, a) {
  const W = 1200, H = 630, L = 90, R = 40, top = 210, base = 520;
  const T = Math.max(1, t.tDone || (t.chunks.length ? t.chunks[t.chunks.length - 1].t : 1));
  const x = (ms) => L + (ms / T) * (W - L - R);
  const lo = Math.log10(0.5), span = Math.log10(10000) - lo;
  const y = (ms) => base - ((Math.log10(Math.max(0.5, Math.min(10000, ms))) - lo) / span) * (base - top);
  let spikes = '';
  t.chunks.forEach((c, i) => {
    const w = i ? c.t - t.chunks[i - 1].t : c.t;
    spikes += `M${x(c.t).toFixed(1)} ${base}V${y(w).toFixed(1)}`;
  });
  const grid = [];
  for (let k = 0; k <= 10; k++) {
    const ms = (T * k) / 10;
    grid.push(`<line x1="${x(ms)}" y1="${top - 10}" x2="${x(ms)}" y2="${base}" stroke="#9FB3D6" stroke-opacity=".12"/>`);
    grid.push(`<text x="${x(ms) + 4}" y="${base + 22}" fill="#79828F" font-size="14">${esc(fmtMs(ms))}</text>`);
  }
  for (const d of [1, 10, 100, 1000, 10000]) {
    grid.push(`<line x1="${L}" y1="${y(d)}" x2="${W - R}" y2="${y(d)}" stroke="#9FB3D6" stroke-opacity=".07"/>`);
    grid.push(`<text x="20" y="${y(d) + 5}" fill="#79828F" font-size="14">${esc(fmtMs(d))}</text>`);
  }
  const s = a.server;
  const facts = t.kind === 'oneshot'
    ? `reply in one piece after ${fmtMs(t.tDone)}`
    : `first token ${fmtMs(a.ttft)} · ${a.rate.toFixed(1)} tok/s · median wait ${fmtMs(a.median)} · p99 ${fmtMs(a.p99)} · ${a.n} chunks${s ? ` · server eval_count ${s.evalCount}` : ''}`;
  const when = t.recorded ? new Date(t.recorded).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="IBM Plex Mono, ui-monospace, Consolas, monospace">
<rect width="${W}" height="${H}" fill="#06080D"/>
<rect x="16.5" y="16.5" width="${W - 33}" height="${H - 33}" fill="none" stroke="#1C232F"/>
<path d="M16 34V16H34M${W - 34} 16H${W - 16}V34M16 ${H - 34}V${H - 16}H34M${W - 34} ${H - 16}H${W - 16}V${H - 34}" fill="none" stroke="#97681F"/>
<text x="44" y="64" fill="#9FB3D6" font-size="15" letter-spacing="4">TOKEN EKG · ${esc(t.origin === 'recording' ? 'RECORDING' : 'MEASURED')}</text>
<text x="44" y="108" fill="#EAF0FB" font-size="30">${esc(t.label)}</text>
<text x="44" y="142" fill="#C5CCD8" font-size="17">${esc(facts)}</text>
<text x="44" y="170" fill="#79828F" font-size="14">${esc(t.model)} · ${esc(t.route)} · ${esc(when)} · timed by ${esc(t.recorder || '')}</text>
${grid.join('\n')}
<line x1="${x(0)}" y1="${top - 10}" x2="${x(0)}" y2="${base}" stroke="#9FB3D6" stroke-opacity=".5" stroke-dasharray="3 4"/>
<path d="${spikes}" stroke="#EAF0FB" stroke-opacity=".8" stroke-width="1.2"/>
<line x1="${L}" y1="${base}" x2="${W - R}" y2="${base}" stroke="#9FB3D6" stroke-opacity=".45"/>
<text x="${L}" y="${H - 44}" fill="#79828F" font-size="13">x: ms since the request was sent · height: the wait before each chunk, log scale · luisblanco.dev/labs/token-ekg.html</text>
</svg>`;
}
