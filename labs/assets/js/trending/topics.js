/* ============================================================
   trending/topics.js — terms, entities and cross-source topics.

   Pure functions; tests.mjs runs them on recorded titles.

   1. normalize: NFKD, diacritics and case folded, punctuation dropped
      (intra-word . + # - kept: "node.js", "c++", "gpt-5"), stopwords
      in English, German and Spanish removed. Duplicate titles inside
      one source merge into one row.
   2. key terms: TF-IDF over every title in the scan, binary term
      frequency, idf = ln(N / df); the 1 to 3 highest-idf terms.
   3. topics, single-linkage over two rules:
      (a) entity: a Wikipedia title (disambiguation stripped) appears as
          a contiguous phrase in another title, or two editions share
          the same title;
      (b) terms: idf-weighted Jaccard of content terms
          J = sum idf(shared) / sum idf(union) >= 0.30, with the
          shared idf summing to at least 2.5.
   ============================================================ */

import { TUNING, SOURCES } from './constants.js';

const STOP = new Set((
  // english
  'a an the and or but if then else of to in on at by for with from into onto over under about after before ' +
  'is are was were be been being am do does did done has have had having will would shall should can could may might must ' +
  'i me my we us our you your he him his she her it its they them their this that these those there here ' +
  'what which who whom whose when where why how not no nor so too very just than also only own same such ' +
  'all any both each few more most other some new old now via vs per get got gets make makes made using use used ' +
  'one two three first last next up down out off again further once s t don isn aren wasn ' +
  'show ask tell hn launch yc pdf video 2024 2025 2026 2027 like way ways thing things lot really still ever even much many ' +
  'need needs want wants work works working go goes going best better good bad big small free open source based ' +
  'year years day days time times people world built build building without within against between ' +
  // german
  'der die das den dem des ein eine einer eines einem einen und oder aber im am zum zur von vom mit nach bei aus ' +
  'ist sind war waren wird werden hat haben sich nicht auch als wie für fur auf über uber unter vor ' +
  // spanish
  'el la los las un una unos unas y o pero del al con por para sin sobre entre es son fue fueron ser ' +
  'se su sus lo le les que en de como mas más muy ya ' +
  // list and disambiguation words
  'list liste lista film series serie season temporada staffel episode album song band singer footballer'
).split(/\s+/));

export function fold(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* Wikipedia titles: drop "(disambiguation)" parts for matching. */
export const coreTitle = (t) => String(t).replace(/\s*\([^)]*\)\s*/g, ' ').trim();

/* Ordered tokens, punctuation dropped, stopwords kept (phrase matching needs order). */
export function tokenSeq(text) {
  return fold(text)
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9.+#\-\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter(Boolean);
}

export const isContent = (w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w);
export const contentTerms = (text) => [...new Set(tokenSeq(text).filter(isContent))];

/* The text a source's title is matched on. GitHub: repo name split, plus the description. */
export function docText(o) {
  if (o.src === 'gh') {
    const repo = o.title.split('/').pop() || '';
    const split = repo.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_.]+/g, ' ');
    return `${split} ${o.meta?.desc || ''}`;
  }
  if (SOURCES[o.src]?.kind === 'readership') return coreTitle(o.title);
  return o.title;
}

/* Merge duplicate titles inside one source; returns the kept items. */
export function dedupe(items) {
  const seen = new Map();
  for (const o of items) {
    const k = `${o.src}|${tokenSeq(docText(o)).join(' ')}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...o, dupes: [] });
    else {
      if (o.count > prev.count) seen.set(k, { ...o, dupes: [...prev.dupes, prev.id] });
      else prev.dupes.push(o.id);
    }
  }
  return [...seen.values()];
}

/* idf over a corpus of term sets. */
export function idfTable(termSets) {
  const df = new Map();
  for (const ts of termSets) for (const t of new Set(ts)) df.set(t, (df.get(t) || 0) + 1);
  const n = Math.max(1, termSets.length);
  const idf = new Map();
  for (const [t, d] of df) idf.set(t, Math.log(n / d));
  return { idf, n };
}

export function keyTerms(terms, idf, k = TUNING.keyTerms) {
  return [...terms].sort((a, b) => (idf.get(b) || 0) - (idf.get(a) || 0) || b.length - a.length).slice(0, k);
}

export function weightedJaccard(a, b, idf) {
  const A = new Set(a), B = new Set(b);
  let shared = 0, union = 0;
  for (const t of new Set([...A, ...B])) {
    const w = idf.get(t) || 0;
    union += w;
    if (A.has(t) && B.has(t)) shared += w;
  }
  return { j: union > 0 ? shared / union : 0, shared };
}

/* Does the phrase (token list) occur contiguously in seq? */
function hasPhrase(seq, phrase) {
  if (!phrase.length || phrase.length > seq.length) return false;
  outer: for (let i = 0; i + phrase.length <= seq.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (seq[i + j] !== phrase[j]) continue outer;
    return true;
  }
  return false;
}

/* Is a single-word entity written as a proper noun in the original title? */
function capitalizedIn(original, word) {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu');
  const m = fold(original).match(re);
  if (!m) return false;
  const at = fold(original).indexOf(m[0]) + m[1].length;
  const ch = original.normalize('NFKD').replace(/[̀-ͯ]/g, '')[at];
  return ch != null && ch !== ch.toLowerCase();
}

/* The entity phrase of a Wikipedia title, or null when it is too generic to link on. */
export function entityPhrase(title) {
  const seq = tokenSeq(coreTitle(title));
  const content = seq.filter(isContent);
  if (!content.length) return null;
  if (seq.length === 1 && seq[0].length < 4) return null;
  return seq;
}

/* An item links to a Wikipedia entity when the entity phrase sits inside its title. */
export function linksTo(o, phrase, seqIn) {
  if (!phrase) return false;
  const seq = seqIn || tokenSeq(docText(o));
  if (!hasPhrase(seq, phrase)) return false;
  if (phrase.length > 1) return true;
  if (o.src === 'gh') return phrase[0].length >= 5 && tokenSeq(o.title.split('/').pop()).includes(phrase[0]);
  return capitalizedIn(o.title, phrase[0]);
}

/**
 * Wikipedia pool articles that an HN or GitHub title names, for one edition.
 * Returns [{ poolItem, by: [ids] }], best linked first.
 */
export function linkPool(others, poolItems) {
  const out = [];
  for (const p of poolItems) {
    const ph = entityPhrase(p.title);
    if (!ph) continue;
    const by = others.filter((o) => linksTo(o, ph)).map((o) => o.id);
    if (by.length) out.push({ poolItem: p, by, len: ph.length });
  }
  return out.sort((a, b) => b.by.length - a.by.length || b.len - a.len || b.poolItem.count - a.poolItem.count);
}

/**
 * Cluster items into topics. items: observations (any sources).
 * Returns { terms: Map(id -> key terms), topics: [...], idf, pairs }.
 */
export function clusterTopics(items) {
  const termsOf = new Map(items.map((o) => [o.id + '|' + o.src, contentTerms(docText(o))]));
  const { idf, n } = idfTable([...termsOf.values()]);
  const key = (o) => o.id + '|' + o.src;
  const terms = new Map(items.map((o) => [key(o), keyTerms(termsOf.get(key(o)), idf)]));

  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges = [];
  const unite = (i, j, rule, sim, label) => {
    edges.push({ a: key(items[i]), b: key(items[j]), rule, sim, label });
    const a = find(i), b = find(j);
    if (a !== b) parent[a] = b;
  };

  const seqs = items.map((o) => tokenSeq(docText(o)));
  const folded = items.map((o) => fold(coreTitle(o.title)));
  const readers = items.map((o, i) => [o, i]).filter(([o]) => SOURCES[o.src]?.kind === 'readership');
  const phrases = new Map(readers.map(([o, i]) => [i, entityPhrase(o.title)]));

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.src === B.src && A.id === B.id) continue;
      const ra = SOURCES[A.src]?.kind === 'readership', rb = SOURCES[B.src]?.kind === 'readership';
      // rule (a): entity phrases
      if (ra && rb) {
        if (A.src !== B.src && folded[i] === folded[j] && phrases.get(i)) {
          unite(i, j, 'entity', 1, coreTitle(A.title)); continue;
        }
      } else if (ra && linksTo(B, phrases.get(i), seqs[j])) { unite(i, j, 'entity', 1, coreTitle(A.title)); continue; }
      else if (rb && linksTo(A, phrases.get(j), seqs[i])) { unite(i, j, 'entity', 1, coreTitle(B.title)); continue; }
      // rule (b): weighted Jaccard of content terms
      const { j: sim, shared } = weightedJaccard(termsOf.get(key(A)), termsOf.get(key(B)), idf);
      if (sim >= TUNING.jaccard && shared >= 2.5) {
        const common = termsOf.get(key(A)).filter((t) => termsOf.get(key(B)).includes(t));
        const lbl = keyTerms(common, idf, 2).join(' ');
        unite(i, j, 'terms', sim, lbl);
      }
    }
  }

  const groups = new Map();
  items.forEach((o, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });

  const topics = [];
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const members = idx.map((i) => items[i]);
    const ks = new Set(members.map(key));
    const es = edges.filter((e) => ks.has(e.a) && ks.has(e.b));
    const ent = es.find((e) => e.rule === 'entity');
    const label = ent ? ent.label : (es[0]?.label || keyTerms(termsOf.get(key(members[0])), idf, 2).join(' '));
    const wiki = members.find((m) => SOURCES[m.src]?.kind === 'readership');
    const sims = [];
    for (let a = 0; a < members.length; a++) for (let b = a + 1; b < members.length; b++) {
      sims.push(weightedJaccard(termsOf.get(key(members[a])), termsOf.get(key(members[b])), idf).j);
    }
    topics.push({
      id: 'topic:' + tokenSeq(label).join('-'),
      label,
      members: members.map(key),
      sources: [...new Set(members.map((m) => m.src))],
      rule: ent ? 'entity' : 'terms',
      edges: es,
      entityUrl: wiki ? wiki.url : null,
      meanSim: sims.length ? sims.reduce((x, y) => x + y, 0) / sims.length : 0,
    });
  }
  topics.sort((a, b) => b.sources.length - a.sources.length || b.members.length - a.members.length);
  return { terms, topics, idf, n, edges };
}

export const itemKey = (o) => o.id + '|' + o.src;
