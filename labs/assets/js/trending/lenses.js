/* ============================================================
   trending/lenses.js — the source registry. Each entry fetches and
   returns RAW observations only: counts with timestamps, as the API
   gave them. No ranking happens here; score.js computes every rate,
   baseline and interval from these fields.

   An observation:
     { id, src, title, url, discuss?, t, count, created|null, third,
       meta: {...}, raw: {...the API fields used...}, rawUrl }
   Readership sources add: day, prev, prevCensored, series[[day, views]].

   Adding a source: one entry in SOURCES (constants.js) for its labels
   and one adapter here. Nothing else changes.
   Runs in the browser and under Node (record.mjs, tests.mjs).
   ============================================================ */

import { TUNING, SOURCES } from './constants.js';
import { getJSON, pool, ymd, daysBefore } from './net.js';

export class RateLimitError extends Error {
  constructor(src, resetAt) { super(`${src} rate limit reached`); this.name = 'RateLimitError'; this.resetAt = resetAt; }
}

const HN_FIELDS = 'title,url,points,num_comments,created_at_i,author';
const hnItem = (src, h, t, rawUrl) => ({
  id: `hn:${h.objectID}`, src, title: h.title,
  url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
  discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
  t, count: Number(h.points) || 0, created: (Number(h.created_at_i) || 0) * 1000,
  third: Number(h.num_comments) || 0,
  meta: { author: h.author || '', objectID: h.objectID },
  raw: { objectID: h.objectID, points: h.points, created_at_i: h.created_at_i, num_comments: h.num_comments },
  rawUrl,
});

const isoMin = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const ageWindow = (items, t) => {
  if (!items.length) return 'no items';
  const c = items.map((i) => i.created).filter(Boolean);
  return `items posted ${isoMin(Math.min(...c))} to ${isoMin(Math.max(...c))}; counts as of ${isoMin(t)}`;
};

async function hnFeed(src, url, ctx) {
  const r = await getJSON(url, { signal: ctx.signal, timeoutMs: TUNING.fetchTimeoutMs, ledger: ctx.ledger, src });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = Date.now();
  const items = (r.json.hits || []).filter((h) => h.title && h.objectID).map((h) => hnItem(src, h, t, url));
  return { items, window: ageWindow(items, t), urls: [url], fetchedAt: t };
}

/* ---- the readership adapter, shared by every Wikipedia edition ---- */
function wikiAdapter(id) {
  const cfg = SOURCES[id];
  const topUrl = (d) => `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${cfg.project}/all-access/${ymd(d, '/')}`;
  const keep = (a) => a.article && a.article !== '-' && !cfg.main.includes(a.article) && !cfg.ns.some((n) => a.article.startsWith(n));
  return {
    /* stage 1: the latest full day's top list, and the day before it */
    async fetch(ctx) {
      const today = new Date(ctx.now ?? Date.now());
      let top = null, day = null, url = '';
      for (const back of TUNING.wikiBackoff) {
        const d = daysBefore(today, back);
        url = topUrl(d);
        const r = await getJSON(url, { signal: ctx.signal, timeoutMs: TUNING.fetchTimeoutMs, ledger: ctx.ledger, src: id });
        if (r.ok) { top = r.json; day = d; break; }
        if (r.status !== 404) throw new Error(`HTTP ${r.status}`);
      }
      if (!top) throw new Error('no full day published in the last 3 days');
      const prevUrl = topUrl(daysBefore(day, 1));
      const pr = await getJSON(prevUrl, { signal: ctx.signal, timeoutMs: TUNING.fetchTimeoutMs, ledger: ctx.ledger, src: id });
      const arts = (top.items?.[0]?.articles || []).filter(keep);
      const prevArts = pr.ok ? (pr.json.items?.[0]?.articles || []).filter(keep) : [];
      const prevMap = new Map(prevArts.map((a) => [a.article, a.views]));
      const prevFloor = prevArts.length ? Math.min(...prevArts.map((a) => a.views)) : 0;
      const t = Date.now();
      const dayS = ymd(day);
      const poolItems = arts.map((a) => ({
        id: `${id}:${a.article}`, src: id, title: a.article.replace(/_/g, ' '),
        url: cfg.site + encodeURIComponent(a.article), t, day: dayS,
        count: a.views, created: null, third: null,
        prev: prevMap.get(a.article) ?? prevFloor, prevCensored: !prevMap.has(a.article),
        meta: { article: a.article, rank: a.rank }, raw: { article: a.article, views: a.views, rank: a.rank }, rawUrl: url,
      }));
      return {
        items: [], pool: poolItems, day: dayS, prevFloor,
        window: `views on ${dayS} (UTC day), compared with ${ymd(daysBefore(day, 1))}`,
        urls: [url, prevUrl], fetchedAt: t,
      };
    },

    /* stage 2: per-article daily series for the chosen candidates */
    async series(ctx, res, chosen) {
      const end = new Date(`${res.day}T00:00:00Z`);
      const start = daysBefore(end, TUNING.wikiSeriesDays);
      const f = (d) => ymd(d, '') + '00';
      const items = await pool(chosen, 6, async (it) => {
        const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${cfg.project}/all-access/user/${encodeURIComponent(it.meta.article)}/daily/${f(start)}/${f(end)}`;
        try {
          const r = await getJSON(u, { signal: ctx.signal, timeoutMs: TUNING.fetchTimeoutMs, ledger: ctx.ledger, src: id });
          if (!r.ok) return { ...it, series: [], seriesUrl: u, seriesError: `HTTP ${r.status}` };
          const series = (r.json.items || []).map((p) => [`${p.timestamp.slice(0, 4)}-${p.timestamp.slice(4, 6)}-${p.timestamp.slice(6, 8)}`, p.views]);
          return { ...it, series, seriesUrl: u };
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          return { ...it, series: [], seriesUrl: u, seriesError: e.message };
        }
      });
      res.urls.push(...items.map((i) => i.seriesUrl));
      return items;
    },
  };
}

export const LENSES = {
  hn: {
    fetch: (ctx) => hnFeed('hn', `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${TUNING.hnHits}&attributesToRetrieve=${HN_FIELDS}`, ctx),
  },
  show: {
    fetch: (ctx) => {
      const since = Math.floor((ctx.now ?? Date.now()) / 1000) - TUNING.showWindowH * 3600;
      return hnFeed('show', `https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=created_at_i%3E${since}&hitsPerPage=${TUNING.showHits}&attributesToRetrieve=${HN_FIELDS}`, ctx);
    },
  },
  gh: {
    async fetch(ctx) {
      const since = ymd(daysBefore(new Date(ctx.now ?? Date.now()), TUNING.ghSinceDays));
      const url = `https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&order=desc&per_page=${TUNING.ghPerPage}`;
      const r = await getJSON(url, { signal: ctx.signal, timeoutMs: TUNING.fetchTimeoutMs, ledger: ctx.ledger, src: 'gh', headers: { Accept: 'application/vnd.github+json' } });
      ctx.rate = ctx.rate || {};
      ctx.rate.gh = { remaining: r.headers.remaining, limit: r.headers.limit, reset: r.headers.reset };
      if ((r.status === 403 || r.status === 429) && r.headers.remaining === '0') throw new RateLimitError('gh', Number(r.headers.reset) * 1000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = Date.now();
      const items = (r.json.items || []).map((x) => ({
        id: `gh:${x.full_name}`, src: 'gh', title: x.full_name, url: x.html_url, t,
        count: x.stargazers_count, created: Date.parse(x.created_at), third: x.forks_count,
        meta: { desc: (x.description || '').slice(0, 240), lang: x.language || '', topics: (x.topics || []).slice(0, 6) },
        raw: { full_name: x.full_name, stargazers_count: x.stargazers_count, created_at: x.created_at, forks_count: x.forks_count },
        rawUrl: url,
      }));
      return { items, window: `repositories created after ${since} (UTC); stars as of ${isoMin(t)}`, urls: [url], fetchedAt: t };
    },
  },
  wen: wikiAdapter('wen'),
  wde: wikiAdapter('wde'),
  wes: wikiAdapter('wes'),
};

/* Top comments for one HN story: evidence the model prompt carries. */
export async function hnComments(ctx, objectID, src = 'hn') {
  const url = `https://hn.algolia.com/api/v1/search?tags=comment,story_${objectID}&hitsPerPage=${TUNING.hnCommentsPer}&attributesToRetrieve=comment_text,author`;
  try {
    const r = await getJSON(url, { signal: ctx.signal, timeoutMs: TUNING.fetchTimeoutMs, ledger: ctx.ledger, src });
    if (!r.ok) return [];
    return (r.json.hits || []).map((h) => String(h.comment_text || '')
      .replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim().slice(0, 280)).filter(Boolean);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return [];
  }
}
