/* ============================================================
   trending/lenses.js — the lens STRATEGY registry.

   Each lens is a self-contained source: its display labels plus a
   fetch(signal) that returns ranked, normalized items. Adding a new
   trending source is a new entry in LENSES — data, not a branch.
   Every fetch() returns { items, ms, count }; every item is
   { title, url, metricLabel, metricValue, sub, ageText, score }.
   ============================================================ */

import { TUNING } from './constants.js';
import { fetchWithTimeout, fmt, humanAge, ymd, daysAgoUTC } from './dom.js';

export const LENSES = {
  tech: {
    label: 'Tech', source: 'Hacker News', host: 'hn.algolia.com', badge: 'HN',
    endpointLabel: 'front page', rankLabel: 'velocity (pts/hr)', theme: 'software and AI',
    what: 'Hacker News front page, ranked by velocity — points per hour since posting. The truest "rising right now" signal here.',
    async fetch(signal) {
      const t0 = performance.now();
      const res = await fetchWithTimeout(
        `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${TUNING.hitsPerPage}`,
        signal, TUNING.fetchTimeoutMs);
      if (!res.ok) throw new Error('HN ' + res.status);
      const data = await res.json();
      const now = Date.now() / 1000;
      const items = (data.hits || []).filter((h) => h.title).map((h) => {
        const ageH = Math.max(TUNING.minVelocityAgeH, (now - h.created_at_i) / 3600);
        const velocity = Math.round(h.points / ageH);
        return {
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          metricLabel: 'points', metricValue: h.points,
          sub: `${h.points} pts · ${h.num_comments || 0} comments · ${humanAge(ageH)} old`,
          ageText: `posted ${humanAge(ageH)} ago`,
          score: velocity,
        };
      }).sort((a, b) => b.score - a.score).slice(0, TUNING.topN);
      return { items, ms: Math.round(performance.now() - t0), count: (data.hits || []).length };
    },
  },
  culture: {
    label: 'Culture', source: 'Wikipedia', host: 'wikimedia.org', badge: 'WIKI',
    endpointLabel: 'most-read, prior full day', rankLabel: 'page views', theme: 'public attention',
    what: "Wikipedia's most-read articles over the prior full day — what the world is actually reading. Daily totals, not real-time.",
    async fetch(signal) {
      const t0 = performance.now();
      let data = null, used = null;
      for (const back of TUNING.wikiBackoffDays) {
        const d = ymd(daysAgoUTC(back));
        const r = await fetchWithTimeout(
          `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d}`,
          signal, TUNING.fetchTimeoutMs);
        if (r.ok) { data = await r.json(); used = d; break; }
      }
      if (!data) throw new Error('Wikipedia unavailable');
      const arts = (data.items?.[0]?.articles || [])
        .filter((a) => a.article && a.article !== 'Main_Page' && a.article !== '-' && !a.article.includes(':'));
      const items = arts.slice(0, TUNING.topN).map((a) => ({
        title: a.article.replace(/_/g, ' '),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
        metricLabel: 'views', metricValue: a.views,
        sub: `${fmt(a.views)} views · rank #${a.rank}`,
        ageText: `over ${used}`,
        score: a.views,
      }));
      return { items, ms: Math.round(performance.now() - t0), count: arts.length };
    },
  },
  dev: {
    label: 'Dev', source: 'GitHub', host: 'api.github.com', badge: 'GH',
    endpointLabel: 'repos created in the last 2 weeks, by stars', rankLabel: 'stars (new repos)', theme: 'developer tooling',
    what: 'GitHub repositories created in the last two weeks, sorted by stars — new projects climbing fast. Unauthenticated, so rate-limited to ~10 scans/min.',
    async fetch(signal) {
      const t0 = performance.now();
      const since = ymd(daysAgoUTC(TUNING.githubSinceDays), '-');
      const res = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&order=desc&per_page=20`,
        signal, TUNING.fetchTimeoutMs, { Accept: 'application/vnd.github+json' });
      if (res.status === 403) throw new Error('GitHub rate limit (10/min unauth)');
      if (!res.ok) throw new Error('GitHub ' + res.status);
      const data = await res.json();
      const items = (data.items || []).map((r) => ({
        title: r.full_name,
        url: r.html_url,
        metricLabel: 'stars', metricValue: r.stargazers_count,
        sub: `${fmt(r.stargazers_count)} stars · ${r.language || '—'} · new since ${since}`,
        ageText: 'created in the last two weeks',
        score: r.stargazers_count,
      })).slice(0, TUNING.topN);
      return { items, ms: Math.round(performance.now() - t0), count: (data.items || []).length };
    },
  },
};
