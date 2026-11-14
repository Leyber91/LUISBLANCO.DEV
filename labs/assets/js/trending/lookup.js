/* ============================================================
   trending/lookup.js — the visitor's own terms, in every source.

   Per term, against a baseline of 1:
     HN         stories matching the term posted in the last 24 h,
                over the daily mean of the 7 days before (2 requests,
                Algolia nbHits with hitsPerPage=0)
     Wikipedia  views of the article with that title on the latest
                full day, over its same-weekday median (1 request,
                a second if the first title form is missing)
     GitHub     repositories matching the term created in the last 7
                days, over the daily mean of the 21 days before
                (2 requests; the 10-per-minute search limit is waited
                out with a countdown)
   ============================================================ */

import { TUNING } from './constants.js';
import { getJSON, ymd, daysBefore } from './net.js';
import { garwood, weekdayBaseline } from './score.js';
import { RateLimitError } from './lenses.js';
import { svgEl, glyph } from './marks.js';
import { num } from './explain.js';

const H = 3600;

export function parseTerms(s) {
  return [...new Set(String(s || '').split(',').map((t) => t.trim().replace(/\s+/g, ' ')).filter((t) => t.length >= 2 && t.length <= 60))].slice(0, 5);
}

async function hn(term, ctx) {
  const now = Math.floor(Date.now() / 1000);
  const q = encodeURIComponent(term);
  const base = `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=0&numericFilters=`;
  const a = await getJSON(base + encodeURIComponent(`created_at_i>${now - 24 * H}`), { signal: ctx.signal, ledger: ctx.ledger, src: 'hn', timeoutMs: TUNING.fetchTimeoutMs });
  const b = await getJSON(base + encodeURIComponent(`created_at_i>${now - 8 * 24 * H},created_at_i<=${now - 24 * H}`), { signal: ctx.signal, ledger: ctx.ledger, src: 'hn', timeoutMs: TUNING.fetchTimeoutMs });
  if (!a.ok || !b.ok) return { src: 'hn', error: `HTTP ${a.ok ? b.status : a.status}` };
  const k = a.json.nbHits, base7 = b.json.nbHits / 7;
  const [l, h] = garwood(k);
  return { src: 'hn', count: k, base: base7, ratio: base7 > 0 ? k / base7 : null, lo: base7 > 0 ? l / base7 : null, hi: base7 > 0 ? h / base7 : null, text: `${k} stories in 24 h, ${num(base7)}/day before` };
}

async function wiki(term, ctx) {
  const titleA = term.charAt(0).toUpperCase() + term.slice(1);
  const titleB = term.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const end = daysBefore(new Date(), 1), start = daysBefore(end, TUNING.wikiSeriesDays);
  const f = (d) => ymd(d, '') + '00';
  for (const t of [...new Set([titleA, titleB])]) {
    const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(t.replace(/ /g, '_'))}/daily/${f(start)}/${f(end)}`;
    const r = await getJSON(u, { signal: ctx.signal, ledger: ctx.ledger, src: 'wen', timeoutMs: TUNING.fetchTimeoutMs });
    if (r.status === 404) continue;
    if (!r.ok) return { src: 'wen', error: `HTTP ${r.status}` };
    const series = (r.json.items || []).map((p) => [`${p.timestamp.slice(0, 4)}-${p.timestamp.slice(4, 6)}-${p.timestamp.slice(6, 8)}`, p.views]);
    if (!series.length) continue;
    const [day, v] = series[series.length - 1];
    const { base } = weekdayBaseline(series, day);
    const [l, h] = garwood(v);
    return { src: 'wen', count: v, base, ratio: base > 0 ? v / base : null, lo: base > 0 ? l / base : null, hi: base > 0 ? h / base : null, text: `"${t}": ${num(v)} views on ${day}, weekday median ${num(base)}` };
  }
  return { src: 'wen', error: `no English Wikipedia article titled "${titleA}"` };
}

async function gh(term, ctx, onWait) {
  const now = new Date();
  const d7 = ymd(daysBefore(now, 7)), d8 = ymd(daysBefore(now, 8)), d28 = ymd(daysBefore(now, 28));
  const q = (range) => `https://api.github.com/search/repositories?q=${encodeURIComponent(`${term} created:${range}`)}&per_page=1`;
  const get = async (u) => {
    for (let k = 0; k < 2; k++) {
      const r = await getJSON(u, { signal: ctx.signal, ledger: ctx.ledger, src: 'gh', timeoutMs: TUNING.fetchTimeoutMs, headers: { Accept: 'application/vnd.github+json' } });
      if ((r.status === 403 || r.status === 429) && r.headers.remaining === '0') {
        const until = Number(r.headers.reset) * 1000 + 1500;
        if (until - Date.now() > 65000) throw new RateLimitError('gh', until);
        await onWait(until);
        continue;
      }
      return r;
    }
    return { ok: false, status: 'rate limit' };
  };
  const a = await get(q(`>${d7}`));
  const b = await get(q(`${d28}..${d8}`));
  if (!a.ok || !b.ok) return { src: 'gh', error: `HTTP ${a.ok ? b.status : a.status}` };
  const k = a.json.total_count, base = b.json.total_count / 21;
  const [l, h] = garwood(k);
  return { src: 'gh', count: k, base: base * 7, ratio: base > 0 ? k / 7 / base : null, lo: base > 0 ? l / 7 / base : null, hi: base > 0 ? h / 7 / base : null, text: `${k} new repositories in 7 days, ${num(base)}/day before` };
}

export async function lookupTerms(terms, ctx, onWait = async () => {}) {
  const out = [];
  for (const term of terms) {
    const row = { term, res: [] };
    const [a, b] = await Promise.all([hn(term, ctx).catch((e) => { if (e.name === 'AbortError') throw e; return { src: 'hn', error: e.message }; }),
      wiki(term, ctx).catch((e) => { if (e.name === 'AbortError') throw e; return { src: 'wen', error: e.message }; })]);
    let c;
    try { c = await gh(term, ctx, onWait); } catch (e) { if (e.name === 'AbortError') throw e; c = { src: 'gh', error: e.message }; }
    row.res = [a, b, c];
    out.push(row);
  }
  return out;
}

/* One comparison chart: rows are terms, x is the ratio to baseline (log), glyph = source. */
export function drawLookup(host, rows) {
  while (host.firstChild) host.firstChild.remove();
  if (!rows.length) return;
  const w = Math.max(320, host.clientWidth || 600), L = Math.min(170, w * 0.32), R = 16, rowH = 46, top = 24;
  const H2 = top + rows.length * rowH + 30;
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${H2}`, role: 'img', 'aria-label': 'Your terms against their baselines' }, host);
  svg.classList.add('field');
  const vals = rows.flatMap((r) => r.res.flatMap((x) => [x.lo, x.hi, x.ratio])).filter((v) => v > 0);
  const lo = Math.min(0.1, ...vals.map((v) => v / 1.5)), hi = Math.max(10, ...vals.map((v) => v * 1.5));
  const d0 = Math.pow(10, Math.floor(Math.log10(lo))), d1 = Math.pow(10, Math.ceil(Math.log10(hi)));
  const sx = (v) => L + ((Math.log10(Math.max(d0, Math.min(d1, v))) - Math.log10(d0)) / Math.log10(d1 / d0)) * (w - L - R);
  for (let e = Math.log10(d0); e <= Math.log10(d1); e++) {
    const v = Math.pow(10, e);
    svgEl('line', { x1: sx(v), x2: sx(v), y1: top - 6, y2: H2 - 26, class: 'frame', 'stroke-dasharray': v === 1 ? '' : '2 4' }, svg);
    const t = svgEl('text', { x: sx(v), y: H2 - 10, 'text-anchor': 'middle', class: 'ax' }, svg);
    t.textContent = `${v < 1 ? v.toPrecision(1) : v}x`;
  }
  const lab = svgEl('text', { x: L, y: 12, class: 'ax' }, svg);
  lab.textContent = 'rate over baseline (log); 1x = no change';
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2;
    const t = svgEl('text', { x: 0, y: y + 4, class: 'ptitle' }, svg);
    t.textContent = r.term.length > 22 ? r.term.slice(0, 21) + '.' : r.term;
    r.res.forEach((x, j) => {
      const yy = y - 12 + j * 12;
      if (!(x.ratio > 0)) {
        const n = svgEl('text', { x: L + 4, y: yy + 4, class: 'empty' }, svg);
        n.textContent = `${x.src === 'wen' ? 'Wikipedia' : x.src === 'gh' ? 'GitHub' : 'HN'}: ${x.error || (x.count === 0 ? 'no matches' : 'no baseline')}`;
        n.setAttribute('font-size', '11');
        return;
      }
      if (x.lo > 0 && x.hi > 0) svgEl('line', { x1: sx(x.lo), x2: sx(x.hi), y1: yy, y2: yy, class: 'edge' }, svg);
      const g = svgEl('g', { transform: `translate(${sx(x.ratio).toFixed(1)} ${yy})`, class: 'mark' }, svg);
      glyph(x.src, 4.5, g, 'g');
      const v = svgEl('text', { x: sx(x.ratio) + 9, y: yy + 4, class: 'elabel' }, svg);
      v.textContent = `${num(x.ratio)}x`;
    });
  });
}
