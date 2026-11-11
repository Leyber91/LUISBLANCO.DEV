#!/usr/bin/env node
/* ============================================================
   trending/record.mjs — the recorder. Runs the page's own engine
   under Node (engine.js, score.js, topics.js: no browser imports)
   and writes the dated records the page shows at rest.

     node record.mjs scan [hn,show,gh] one live scan of every source (or the
                                       listed ones), appended to data/recorded.json
     node record.mjs backtest wen 30   Wikipedia backtest: 30 past days
                                       scored with the live method, with
                                       next-day outcomes, to data/backtest-wen.json
     node record.mjs reply [--ollama]  one model call for the resting scan, through
                                       ai/llm.js or straight to the local Ollama
                                       (num_ctx 8192), to data/recorded-reply.json
     node record.mjs build             write archive.data.js (what the page
                                       imports) and fixtures.js from the files above

   Sources and licences of the recorded data:
     Hacker News via the Algolia HN Search API (hn.algolia.com/api);
     GitHub REST search API (docs.github.com/rest/search);
     Wikimedia Analytics pageviews API (wikimedia.org/api/rest_v1),
     pageview data released under CC0 by the Wikimedia Foundation.
   Titles and counts are facts as the APIs returned them on the dates
   recorded in each record.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const UA = 'luisblanco.dev-labs-trending-recorder/1.0 (https://luisblanco.dev)';
const f0 = globalThis.fetch;
globalThis.fetch = (u, o = {}) => f0(u, { ...o, headers: { ...(o.headers || {}), 'User-Agent': UA } });

const { runScan } = await import('./engine.js');
const { compact, callsOf } = await import('./history.js');
const { scoreItem, rank } = await import('./score.js');
const { TUNING, SOURCES, SOURCE_ORDER } = await import('./constants.js');
const { getJSON, pool, ymd, daysBefore } = await import('./net.js');

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };

async function doScan(list) {
  const enabled = list ? list.split(',').filter((s) => SOURCES[s]) : SOURCE_ORDER;
  const scan = await runScan({ enabled, emit: () => {} });
  scan.origin = 'recorded';
  const file = path.join(DATA, 'recorded.json');
  const store = readJSON(file, { format: 'lb.trending.recorded', version: 2, scans: [] });
  const days = {};
  for (const r of store.scans) for (const [s, p] of Object.entries(r.pools || {})) days[s] = p.day;
  const rec = compact(scan, callsOf(scan.items), days);
  store.scans.push(rec);
  writeJSON(file, store);
  const ok = Object.entries(scan.sources).map(([s, v]) => `${s}:${v.status}`).join(' ');
  console.log(`recorded ${new Date(scan.t).toISOString()} items ${scan.items.length} requests ${scan.ledger.count()} ${ok}`);
}

/* ---------------- the Wikipedia backtest ---------------- */
/* Polite GET: spaced requests, and a 429 waits and retries (Wikimedia rate-limits bursts). */
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
async function politeGet(u) {
  for (let k = 0; k < 5; k++) {
    await nap(120);
    const r = await getJSON(u, { timeoutMs: 30000 });
    if (r.status !== 429) return r;
    await nap(8000 * (k + 1));
  }
  return { ok: false, status: 429 };
}
async function doBacktest(src, nDays) {
  const cfg = SOURCES[src];
  const keep = (a) => a.article && a.article !== '-' && !cfg.main.includes(a.article) && !cfg.ns.some((n) => a.article.startsWith(n));
  const today = new Date();
  const lastOutcome = daysBefore(today, 1);           // latest full day published
  const lastCall = daysBefore(lastOutcome, 1);
  const firstCall = daysBefore(lastCall, nDays - 1);
  const tops = new Map();
  const dayList = [];
  for (let d = daysBefore(firstCall, 1); d <= lastOutcome; d = daysBefore(d, -1)) dayList.push(new Date(d));
  await pool(dayList, 2, async (d) => {
    const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${cfg.project}/all-access/${ymd(d, '/')}`;
    const r = await politeGet(u);
    if (r.ok) tops.set(ymd(d), (r.json.items?.[0]?.articles || []).filter(keep));
  });
  const calls = [];
  const series = new Map();
  const RISERS = TUNING.wikiRisers + TUNING.wikiLinked;   // linked slots go to risers: no HN history for past days
  for (let d = new Date(firstCall); d <= lastCall; d = daysBefore(d, -1)) {
    const D = ymd(d), P = ymd(daysBefore(d, 1));
    const top = tops.get(D), prev = tops.get(P);
    if (!top || !prev) continue;
    const prevMap = new Map(prev.map((a) => [a.article, a.views]));
    const prevFloor = Math.min(...prev.map((a) => a.views));
    const pl = top.map((a) => ({ article: a.article, views: a.views, prev: prevMap.get(a.article) ?? prevFloor }));
    const chosen = new Map();
    for (const a of [...pl].sort((x, y) => y.views / y.prev - x.views / x.prev).slice(0, RISERS)) chosen.set(a.article, 'riser');
    let n = TUNING.wikiLargest;
    for (const a of [...pl].sort((x, y) => y.views - x.views)) { if (n <= 0) break; if (!chosen.has(a.article)) { chosen.set(a.article, 'largest'); n--; } }
    calls.push({ D, P, pl, chosen });
    for (const a of chosen.keys()) series.set(a, null);
  }
  const start = ymd(daysBefore(firstCall, TUNING.wikiSeriesDays), '') + '00';
  const end = ymd(lastOutcome, '') + '00';
  await pool([...series.keys()], 2, async (a) => {
    const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${cfg.project}/all-access/user/${encodeURIComponent(a)}/daily/${start}/${end}`;
    const r = await politeGet(u);
    if (!r.ok && r.status !== 404) { series.set(a, 'failed'); return; }
    series.set(a, r.ok ? (r.json.items || []).map((p) => [`${p.timestamp.slice(0, 4)}-${p.timestamp.slice(4, 6)}-${p.timestamp.slice(6, 8)}`, p.views]) : []);
  });
  const days = [];
  let failed = 0;
  for (const c of calls) {
    const N = ymd(daysBefore(new Date(`${c.D}T00:00:00Z`), -1));
    const next = tops.get(N);
    if (!next) continue;
    const nextMap = new Map(next.map((a) => [a.article, a.views]));
    const nextFloor = Math.min(...next.map((a) => a.views));
    const gainOf = (a, ser) => {
      const v = ser?.find(([d]) => d === N)?.[1];
      if (Number.isFinite(v)) return { gain: v, cen: 0 };
      if (nextMap.has(a)) return { gain: nextMap.get(a), cen: 0 };
      return { gain: null, cen: 1 };
    };
    const rows = [];
    for (const [a, why] of c.chosen) {
      if (series.get(a) === 'failed') { failed++; continue; }
      const ser = (series.get(a) || []).filter(([d]) => d <= c.D);
      const p = c.pl.find((x) => x.article === a);
      const o = { src, day: c.D, count: p.views, prev: p.prev, series: ser };
      const sc = scoreItem(o);
      const g = gainOf(a, series.get(a) === 'failed' ? null : series.get(a));
      rows.push({ id: a, why, lo: sc.lo, rate: sc.rate, total: p.views, alt: p.prev > 0 ? p.views / p.prev : null, base: sc.base, gain: g.gain, cen: g.cen });
    }
    // baselines over the whole pool: raw total and day-over-day ratio
    const byTotal = [...c.pl].sort((x, y) => y.views - x.views).slice(0, TUNING.topPerSource);
    const byAlt = [...c.pl].sort((x, y) => y.views / y.prev - x.views / x.prev).slice(0, TUNING.topPerSource);
    const extra = new Map();
    for (const a of [...byTotal, ...byAlt]) {
      if (c.chosen.has(a.article) || extra.has(a.article)) continue;
      const g = gainOf(a.article, null);
      extra.set(a.article, { id: a.article, why: 'baseline', lo: null, rate: null, total: a.views, alt: a.views / a.prev, base: null, gain: g.gain, cen: g.cen });
    }
    rows.push(...extra.values());
    // median next-day views over the pool, articles that left the list counted below its floor
    const gains = c.pl.map((a) => (nextMap.has(a.article) ? nextMap.get(a.article) : -1)).sort((x, y) => x - y);
    const m = gains.length >> 1;
    const med = gains.length % 2 ? gains[m] : (gains[m - 1] + gains[m]) / 2;
    days.push({
      day: c.D, next: N, poolN: c.pl.length, nextFloor, med: med < 0 ? nextFloor : med, medCensored: med < 0 ? 1 : 0,
      calls: { method: null, total: byTotal.map((a) => a.article), alt: byAlt.map((a) => a.article) },
      rows,
    });
  }
  // the method's calls: top 10 candidates by lower bound
  for (const d of days) {
    d.calls.method = d.rows.filter((r) => r.lo != null).sort((a, b) => b.lo - a.lo).slice(0, TUNING.topPerSource).map((r) => r.id);
  }
  const out = {
    format: 'lb.trending.backtest', version: 1, src, project: cfg.project, written: new Date().toISOString(),
    method: `candidates per day: ${RISERS} by day-over-day ratio and ${TUNING.wikiLargest} by views (the live rule, with its 2 linked slots given to risers because past days have no HN or GitHub scan); calls: top ${TUNING.topPerSource} by the lower 95% bound of views over the same-weekday median of 4 prior weeks; outcome: views on the next day`,
    first: days[0]?.day, last: days[days.length - 1]?.day, seriesFailed: failed, days,
  };
  writeJSON(path.join(DATA, `backtest-${src}.json`), out);
  console.log(`backtest ${src}: ${days.length} days ${out.first}..${out.last}, ${series.size} series, ${failed} candidate rows dropped for a failed series`);
}

/* ---------------- one model call for the resting scan (public route, or --ollama) ---------------- */
async function doReply() {
  const { ARCHIVE } = await import('./archive.data.js');
  const { restingFor } = await import('./archive.build.mjs');
  const { buildRequest, parseReply } = await import('./explain.js');
  const { LLM } = await import('../ai/llm.js');
  const { facts, topics, scanFacts } = restingFor(ARCHIVE);
  const { system, prompt } = buildRequest(facts, topics, scanFacts);
  let r;
  if (process.argv.includes('--ollama')) {
    // the local model on this machine, called directly: num_ctx 8192 keeps it inside the machine's memory
    const t0 = Date.now();
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b', stream: false, format: 'json',
        messages: [{ role: 'system', content: `${system}\n\nReply with one JSON object and nothing else.` }, { role: 'user', content: prompt }],
        options: { temperature: 0.2, num_ctx: 8192 },
      }),
    });
    const j = await res.json();
    r = { text: j.message?.content || '', model: 'llama3.1:8b', source: 'ollama', ms: Date.now() - t0 };
  } else {
    r = await LLM.complete({ system: `${system}\n\nReply with one JSON object and nothing else.`, prompt, json: false, temperature: 0.2, maxWaitMs: 60000 });
  }
  writeJSON(path.join(DATA, 'recorded-reply.json'), {
    latestT: ARCHIVE.latest.t, at: new Date().toISOString(), model: r.model, route: r.source, ms: r.ms, prompt, text: r.text, json: parseReply(r.text),
  });
  console.log(`reply from ${r.source} ${r.model} in ${r.ms} ms`);
}

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'scan') await doScan(a1);
else if (cmd === 'backtest') await doBacktest(a1 || 'wen', Number(a2) || 30);
else if (cmd === 'reply') await doReply();
else if (cmd === 'build') { const { build } = await import('./archive.build.mjs'); await build(DATA, HERE); }
else console.log('usage: node record.mjs scan | backtest <src> <days> | build');
