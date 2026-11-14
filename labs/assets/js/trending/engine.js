/* ============================================================
   trending/engine.js — one scan, headless.

   The same function runs in the page (Trending.js) and under Node
   (record.mjs writes the recorded archive with it). No DOM.

     stage 1  every enabled source fetches in parallel, each with its
              own timeout and status; a failed source never blanks the
              others; a GitHub rate limit that resets within 65 s is
              waited out with a countdown instead of failing
     stage 2  each Wikipedia edition picks its candidates (risers by
              day-over-day ratio, the largest, and articles an HN or
              GitHub title names) and fetches their daily series
     stage 3  schema check, scores, z-scalers, topics
   The caller ranks (score.js rank) so a mode switch needs no request.
   ============================================================ */

import { TUNING, SOURCES } from './constants.js';
import { LENSES, hnComments } from './lenses.js';
import { Ledger, abortError } from './net.js';
import { scoreItem, fitScalers } from './score.js';
import { linkPool, dedupe, clusterTopics } from './topics.js';
import { partition, checkScore } from './schema.js';

const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) return rej(abortError());
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortError()); }, { once: true });
});

export async function runScan({ enabled, signal, now = Date.now(), emit = () => {} }) {
  const ledger = new Ledger();
  const ctx = { signal, ledger, now, rate: {} };
  const scan = { t: now, origin: 'live', enabled: [...enabled], sources: {}, items: [], pools: {}, rejected: [], scalers: {}, ledger };
  emit('stage', { stage: 'request' });

  /* ---- stage 1 ---- */
  const results = {};
  await Promise.all(enabled.map(async (src) => {
    const t0 = Date.now();
    emit('source', { src, status: 'requesting' });
    try {
      let res;
      try {
        res = await LENSES[src].fetch(ctx);
      } catch (e) {
        if (e.name !== 'RateLimitError' || !(e.resetAt - Date.now() < 65000)) throw e;
        const until = e.resetAt + 1500;
        emit('source', { src, status: 'waiting', until });
        await sleep(Math.max(0, until - Date.now()), signal);
        res = await LENSES[src].fetch(ctx);
      }
      results[src] = res;
      scan.sources[src] = { status: 'ok', window: res.window, urls: res.urls, fetchedAt: res.fetchedAt, ms: Date.now() - t0, day: res.day || null, rate: ctx.rate[src] || null };
      emit('source', { src, status: 'ok', n: (res.items.length || res.pool?.length || 0), ms: Date.now() - t0, rate: ctx.rate[src] || null });
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) throw abortError();
      scan.sources[src] = { status: 'failed', error: e.message || String(e), ms: Date.now() - t0, rate: ctx.rate[src] || null, urls: ledger.bySource(src).map((r) => r.url) };
      emit('source', { src, status: 'failed', error: e.message });
    }
  }));
  emit('stage', { stage: 'fetch' });

  /* the same HN story on the front page and in Show HN is one row */
  if (results.hn && results.show) {
    const front = new Map(results.hn.items.map((o) => [o.id, o]));
    results.show.items = results.show.items.filter((o) => {
      if (!front.has(o.id)) return true;
      front.get(o.id).alsoIn = ['show'];
      return false;
    });
  }

  /* ---- stage 2: readership candidates and their series ---- */
  const others = ['hn', 'show', 'gh'].flatMap((s) => results[s]?.items || []);
  await Promise.all(Object.keys(results).filter((s) => SOURCES[s].kind === 'readership').map(async (src) => {
    const res = results[src];
    const pool = res.pool;
    const chosen = new Map();
    const take = (list, n, why) => { for (const p of list) { if (n <= 0) break; if (!chosen.has(p.id)) { chosen.set(p.id, { ...p, why }); n--; } } };
    take([...pool].filter((p) => p.prev > 0).sort((a, b) => b.count / b.prev - a.count / a.prev), TUNING.wikiRisers, 'riser');
    take([...pool].sort((a, b) => b.count - a.count), TUNING.wikiLargest, 'largest');
    const linked = linkPool(others, pool);
    take(linked.map((l) => ({ ...l.poolItem, linkedBy: l.by })), TUNING.wikiLinked, 'linked');
    for (const l of linked) if (chosen.has(l.poolItem.id)) chosen.get(l.poolItem.id).linkedBy = l.by;
    try {
      res.items = await LENSES[src].series(ctx, res, [...chosen.values()]);
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) throw abortError();
      res.items = [];
      scan.sources[src].status = 'failed';
      scan.sources[src].error = 'series: ' + e.message;
    }
    for (const it of res.items) if (it.seriesError) scan.rejected.push({ id: it.id, src, reason: `daily series ${it.seriesError}` });
    res.items = res.items.filter((it) => !it.seriesError);
    scan.pools[src] = {
      day: res.day, prevFloor: res.prevFloor, n: pool.length,
      top: pool.slice(0, 300).map((p) => [p.meta.article, p.count]),
    };
    scan.sources[src].urls = res.urls;
    emit('source', { src, status: 'ok', n: res.items.length, series: true });
  }));

  /* ---- stage 3: validate, score, scale, cluster ---- */
  emit('stage', { stage: 'rank' });
  for (const src of Object.keys(results)) {
    const raw = dedupe(results[src].items || []);
    const { ok, bad } = partition(raw);
    scan.rejected.push(...bad);
    const scored = [];
    for (const o of ok) {
      const sc = scoreItem(o);
      const why = checkScore(sc);
      if (why) scan.rejected.push({ id: o.id, src, reason: why });
      else scored.push({ ...o, sc });
    }
    scan.items.push(...scored);
    scan.scalers[src] = fitScalers(scored);
  }
  const { terms, topics } = clusterTopics(scan.items);
  scan.topics = topics;
  for (const it of scan.items) it.terms = terms.get(it.id + '|' + it.src) || [];
  for (const src of Object.keys(scan.sources)) {
    scan.sources[src].requests = ledger.count(src);
    scan.sources[src].bytes = ledger.bytes(src);
  }
  scan.done = Date.now();
  return scan;
}

/* Fetched text for the items the model will explain: top HN comments. GitHub carries its description already. */
export async function gatherEvidence(scan, items, signal) {
  const ctx = { signal, ledger: scan.ledger };
  const out = {};
  await Promise.all(items.map(async (it) => {
    if (SOURCES[it.src].kind === 'forum' && it.meta?.objectID) {
      out[it.id] = { comments: await hnComments(ctx, it.meta.objectID, it.src) };
    }
  }));
  for (const src of Object.keys(scan.sources)) {
    scan.sources[src].requests = scan.ledger.count(src);
    scan.sources[src].bytes = scan.ledger.bytes(src);
  }
  return out;
}
