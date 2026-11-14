/* ============================================================
   trending/history.js — the only module that touches storage.

   Every scan is stored compactly in localStorage under one key with a
   schema version. Scores are never stored: they are recomputed from
   the stored counts by score.js on load, so a fix to the arithmetic
   reaches old scans too.

   Schema v2 (current):
     { format: 'lb.trending.history', version: 2, scans: [record...] }
     record = { t, done, origin, enabled, sources{src:{status, window,
       fetchedAt, ms, day, requests, bytes, error, rate, urls}},
       items[{ id, src, title, url, c, cr, th, day, prev, pc, s0, s,
       su, terms, meta, linkedBy, alsoIn, why, raw }], scalers,
       pools{src:{day, prevFloor, n, top[[article, views]]}},
       calls{src:[id...]}, topics[...], explain }
   v1 (the format of the first recorder runs on 2026-11-11) was a bare
   array of records whose items used `count` and `created`; migrate()
   lifts it to v2.
   ============================================================ */

import { STORAGE, TUNING, SOURCES } from './constants.js';
import { scoreItem, rank } from './score.js';

const browserStore = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { globalThis.localStorage?.setItem(k, v); },
  del(k) { try { globalThis.localStorage?.removeItem(k); } catch { /* blocked */ } },
};

export function memoryStore() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), del: (k) => m.delete(k) };
}

/* ---------------- migration ---------------- */
export function migrate(data) {
  if (data == null) return { format: 'lb.trending.history', version: STORAGE.version, scans: [] };
  let d = data;
  if (Array.isArray(d)) {                           // v1: a bare array
    d = {
      format: 'lb.trending.history', version: 2,
      scans: d.map((r) => ({
        ...r,
        items: (r.items || []).map(({ count, created, ...rest }) => ({ ...rest, c: rest.c ?? count, cr: rest.cr ?? created ?? null })),
      })),
    };
  }
  if (d.version === 2) return { ...d, scans: (d.scans || []).filter((r) => Number.isFinite(r?.t) && Array.isArray(r.items)) };
  throw new Error(`unknown history version ${d.version}`);
}

/* ---------------- compact <-> hydrate ---------------- */
export function compact(scan, calls, prevPools = {}) {
  const items = scan.items.map((o) => {
    const r = { id: o.id, src: o.src, title: o.title, url: o.url, c: o.count, th: o.third ?? null };
    if (o.created) r.cr = o.created;
    if (o.discuss) r.discuss = o.discuss;
    if (o.day) { r.day = o.day; r.prev = o.prev; r.pc = o.prevCensored ? 1 : 0; }
    if (o.series?.length) { r.s0 = o.series[0][0]; r.s = o.series.map((p) => p[1]); }
    if (o.seriesUrl) r.su = o.seriesUrl;
    if (o.terms?.length) r.terms = o.terms;
    if (o.meta) r.meta = o.meta;
    if (o.linkedBy) r.linkedBy = o.linkedBy;
    if (o.alsoIn) r.alsoIn = o.alsoIn;
    if (o.why) r.why = o.why;
    if (o.raw) r.raw = o.raw;
    return r;
  });
  const pools = {};
  for (const [src, p] of Object.entries(scan.pools || {})) {
    if (prevPools[src] !== p.day) pools[src] = p;      // one pool per edition per day
  }
  const sources = {};
  for (const [src, s] of Object.entries(scan.sources)) {
    sources[src] = { ...s, urls: (s.urls || []).slice(0, 2) };
  }
  return {
    t: scan.t, done: scan.done, origin: scan.origin, enabled: scan.enabled, sources, items,
    scalers: scan.scalers, pools, calls, topics: scan.topics || [], explain: scan.explain || null,
  };
}

const unSeries = (r) => {
  if (!r.s || !r.s0) return undefined;
  const d = new Date(`${r.s0}T00:00:00Z`);
  return r.s.map((v, i) => {
    const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + i);
    return [x.toISOString().slice(0, 10), v];
  });
};

export function hydrate(rec) {
  const items = rec.items.map((r) => {
    const o = {
      id: r.id, src: r.src, title: r.title, url: r.url, discuss: r.discuss, t: rec.sources[r.src]?.fetchedAt || rec.t,
      count: r.c, created: r.cr ?? null, third: r.th ?? null, day: r.day, prev: r.prev, prevCensored: !!r.pc,
      series: unSeries(r), seriesUrl: r.su, terms: r.terms || [], meta: r.meta || {}, linkedBy: r.linkedBy,
      alsoIn: r.alsoIn, why: r.why, raw: r.raw, rawUrl: r.su || rec.sources[r.src]?.urls?.[0],
    };
    return { ...o, sc: scoreItem(o) };
  });
  return { ...rec, items, stored: true };
}

/* Top calls per source: the TUNING.topPerSource best by lower bound. */
export function callsOf(items) {
  const out = {};
  for (const src of new Set(items.map((i) => i.src))) {
    out[src] = rank(items.filter((i) => i.src === src && !i.sc.isNew), 'lower', null).items
      .slice(0, TUNING.topPerSource).map((i) => i.id);
  }
  return out;
}

/* ---------------- the store ---------------- */
export class History {
  constructor(store = browserStore) {
    this.store = store;
    this.data = this._read();
    this.lastError = null;
  }

  _read() {
    try { return migrate(JSON.parse(this.store.get(STORAGE.key) || 'null')); }
    catch { return migrate(null); }
  }

  _write() {
    for (;;) {
      try {
        this.store.set(STORAGE.key, JSON.stringify(this.data));
        this.lastError = null;
        return true;
      } catch (e) {
        if (this.data.scans.length <= 1) { this.lastError = e.message; return false; }
        this.data.scans.shift();                      // quota: drop the oldest and retry
      }
    }
  }

  scans() { return this.data.scans; }
  count() { return this.data.scans.length; }
  sizeKB() { const s = this.store.get(STORAGE.key); return s ? (s.length * 2) / 1024 : 0; }
  latest() { return this.data.scans[this.data.scans.length - 1] || null; }

  /* Latest stored day per readership source, so a pool is stored once per day. */
  _poolDays() {
    const out = {};
    for (const r of this.data.scans) for (const [src, p] of Object.entries(r.pools || {})) out[src] = p.day;
    return out;
  }

  add(scan) {
    const rec = compact(scan, callsOf(scan.items), this._poolDays());
    this.data.scans.push(rec);
    while (this.data.scans.length > TUNING.historyMaxScans) this.data.scans.shift();
    this._write();
    return rec;
  }

  /* Attach the model or engine explanation to the stored record of scan t. */
  setExplain(t, explain) {
    const r = this.data.scans.find((x) => x.t === t);
    if (!r) return;
    r.explain = explain;
    this._write();
  }

  clear() { this.data = migrate(null); this.store.del(STORAGE.key); }

  /* Earlier stored observations of one cumulative item: [{ t, c }], oldest first (indexed once per change). */
  earlier(id, src, beforeT) {
    if (this._idxN !== this.data.scans.length || this._idxT !== this.data.scans[this.data.scans.length - 1]?.t) {
      this._idx = new Map();
      for (const r of this.data.scans) {
        for (const it of r.items) {
          const k = `${it.id}|${it.src}`;
          if (!this._idx.has(k)) this._idx.set(k, []);
          this._idx.get(k).push({ t: r.sources[it.src]?.fetchedAt || r.t, c: it.c, rt: r.t });
        }
      }
      this._idxN = this.data.scans.length;
      this._idxT = this.data.scans[this.data.scans.length - 1]?.t;
    }
    return (this._idx.get(`${id}|${src}`) || []).filter((e) => e.rt < beforeT).map(({ t, c }) => ({ t, c }));
  }

  /* The newest stored record before t that holds source src. */
  previous(src, beforeT) {
    for (let i = this.data.scans.length - 1; i >= 0; i--) {
      const r = this.data.scans[i];
      if (r.t < beforeT && r.sources[src]?.status === 'ok' && r.items.some((x) => x.src === src)) return r;
    }
    return null;
  }

  exportJSON() {
    return JSON.stringify({ ...this.data, exportedAt: new Date().toISOString() }, null, 1);
  }

  exportCSV() {
    const rows = ['time_utc,source,item,metric,unit'];
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    for (const r of this.data.scans) {
      for (const it of r.items) {
        const t = new Date(r.sources[it.src]?.fetchedAt || r.t).toISOString();
        const unit = SOURCES[it.src]?.kind === 'readership' ? `views on ${it.day}` : SOURCES[it.src]?.total;
        rows.push([t, it.src, q(it.id), it.c, q(unit)].join(','));
      }
    }
    return rows.join('\n') + '\n';
  }

  /* Merge an exported file into the store. Returns the number of scans added. */
  importJSON(text) {
    const d = migrate(JSON.parse(text));
    if (d.format && d.format !== 'lb.trending.history') throw new Error('not a trending history file');
    const have = new Set(this.data.scans.map((r) => r.t));
    const add = d.scans.filter((r) => !have.has(r.t));
    this.data.scans = [...this.data.scans, ...add].sort((a, b) => a.t - b.t).slice(-TUNING.historyMaxScans);
    this._write();
    return add.length;
  }
}

/* Ranks within one source of a hydrated scan, by lower bound. */
export function ranksOf(scan, src) {
  const r = rank(scan.items.filter((i) => i.src === src), 'lower', null).items;
  return new Map(r.map((it, i) => [it.id, i + 1]));
}

/**
 * Compare two hydrated scans for one source (or all): which items entered,
 * left and moved, by rank on the lower bound.
 */
export function diffScans(a, b, src) {
  const srcs = src ? [src] : [...new Set([...a.items, ...b.items].map((i) => i.src))];
  const entered = [], left = [], moved = [], held = [];
  for (const s of srcs) {
    const ra = ranksOf(a, s), rb = ranksOf(b, s);
    const title = new Map([...a.items, ...b.items].filter((i) => i.src === s).map((i) => [i.id, i.title]));
    for (const [id, r] of rb) {
      if (!ra.has(id)) entered.push({ id, src: s, title: title.get(id), to: r });
      else if (ra.get(id) !== r) moved.push({ id, src: s, title: title.get(id), from: ra.get(id), to: r, by: ra.get(id) - r });
      else held.push({ id, src: s, title: title.get(id), to: r });
    }
    for (const [id, r] of ra) if (!rb.has(id)) left.push({ id, src: s, title: title.get(id), from: r });
  }
  moved.sort((x, y) => Math.abs(y.by) - Math.abs(x.by));
  return { entered, left, moved, held };
}
