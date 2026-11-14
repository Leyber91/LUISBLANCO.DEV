/* ============================================================
   heptapod/pod/proxy.js — a proxy visitor, the two scripted ways
   it plays a day, and the six-ring check.

   The proxy is a cross-situational learner with a memory limit:
   it keeps at most K hypotheses per radical, each one feature of
   the scenes that radical appeared in, and forgets a hypothesis
   that holds in fewer than half the scenes since it was formed.
   It ran before this page was built, to find out whether any
   species sits between a substitution cipher (every check right)
   and a lottery (every check at chance). The page's tests rerun
   it on the three species the page uses.

   What it is not: a fitted model of a person. It recognises every
   radical without error and ignores where in the ring a radical
   sits. Its fit to the published learning curves (Yu and Smith
   2007; Smith and Yu 2008) was not measured.
   [REAL: every number it prints is computed; ILLUSTRATIVE: the
   proxy as a stand-in for a visitor]
   ============================================================ */

import { mulberry32, weightedPick } from '../../kit/rng.js';
import { SCENES, SCENE_MASK, OBJ, PLACES, HELD_ACTS, IS_WORD, other, sceneOf } from './world.js';
import { seedOf, shuffle, pick, SECTORS, sectorDiff } from './species.js';

export const PROXY = { K: 4, N: 40, foils: 'random', sal: 3, RHO: 0.5, OWN_C: 3, OWN_R: 0.9 };
export const CHECK_RINGS = 6;
export const BAND = { lo: 3, hi: 5 };

/* ---------------- two ways to spend a day ---------------- */
export function dayRandom(N, rng) {
  const seq = [];
  let held = null;
  for (let i = 0; i < N; i++) {
    if (held === null) {
      const obj = pick(OBJ, rng), place = pick(PLACES, rng);
      seq.push(sceneOf('lift', obj, place));
      held = obj;
    } else {
      const act = pick(HELD_ACTS, rng);
      const place = act === 'give' ? 'near' : pick(PLACES, rng);
      seq.push(sceneOf(act, held, place));
      if (act !== 'hold') held = null;
    }
  }
  return seq;
}
/* Every act differs from the last act of its kind in exactly one element: the object or the place. */
export function dayContrastive(N, rng) {
  const seq = [];
  const last = {};
  let held = null;
  for (let i = 0; i < N; i++) {
    let act, obj, place;
    if (held === null) {
      act = 'lift';
      const L = last.lift;
      if (!L) { obj = pick(OBJ, rng); place = pick(PLACES, rng); }
      else {
        const opts = [...OBJ.filter((o) => o !== L.obj).map((o) => ({ obj: o, place: L.place })), { obj: L.obj, place: other(L.place) }];
        ({ obj, place } = pick(opts, rng));
      }
      held = obj;
    } else {
      obj = held;
      const allowed = [];
      for (const a of HELD_ACTS) {
        const L = last[a];
        if (a === 'give') { if (!L || L.obj !== obj) allowed.push({ act: a, places: ['near'] }); continue; }
        if (!L) allowed.push({ act: a, places: PLACES });
        else if (L.obj !== obj) allowed.push({ act: a, places: [L.place] });
        else allowed.push({ act: a, places: [other(L.place)] });
      }
      const ch = pick(allowed, rng);
      act = ch.act;
      place = pick(ch.places, rng);
      if (act !== 'hold') held = null;
    }
    last[act] = { obj, place };
    seq.push(sceneOf(act, obj, place));
  }
  return seq;
}
export const DAY_POLICY = { random: dayRandom, contrastive: dayContrastive };

/* ---------------- the proxy ---------------- */
export class Proxy {
  constructor(K, sal, rng) { this.K = K; this.sal = sal; this.rng = rng; this.H = new Map(); }
  owner(u, f) {
    const hs = this.H.get(u);
    if (!hs) return null;
    for (const h of hs) if (h.f === f && h.c >= PROXY.OWN_C && h.c / h.n >= PROXY.OWN_R) return h;
    return null;
  }
  ownedByOther(tokens, t, f) {        // the strongest owner of f among the other radicals of the ring
    let best = null;
    for (const u of tokens) {
      if (u === t) continue;
      const o = this.owner(u, f);
      if (o && (!best || o.c > best.c)) best = o;
    }
    return best;
  }
  observe(tokens, feats, mask) {
    for (const t of tokens) {                                   // 1 verify
      const hs = this.H.get(t);
      if (hs) for (const h of hs) { h.n++; if (mask[h.f]) h.c++; }
    }
    for (const t of tokens) {                                   // 2 forget
      const hs = this.H.get(t);
      if (hs) this.H.set(t, hs.filter((h) => !(h.n >= 2 && h.c / h.n < PROXY.RHO)));
    }
    for (const t of tokens) {                                   // 3 exclude: a feature another radical owns
      const hs = this.H.get(t);
      if (hs) this.H.set(t, hs.filter((h) => { const o = this.ownedByOther(tokens, t, h.f); return !(o && o.c > h.c); }));
    }
    for (const t of tokens) {                                   // 4 propose
      let hs = this.H.get(t);
      if (!hs) { hs = []; this.H.set(t, hs); }
      while (hs.length < this.K) {
        const cand = [], w = [];
        for (const f of feats) {
          if (hs.some((h) => h.f === f)) continue;
          if (this.ownedByOther(tokens, t, f)) continue;
          cand.push(f);
          w.push(IS_WORD[f] ? this.sal : 1);
        }
        if (!cand.length) break;
        hs.push({ f: weightedPick(cand, w, this.rng), c: 1, n: 1 });
      }
    }
  }
  vote(t, mask) {
    const hs = this.H.get(t);
    if (!hs || !hs.length) return 0;
    let num = 0, den = 0;
    for (const h of hs) { const w = h.c / (h.n + 1); den += w; if (mask[h.f]) num += w; }
    return den > 0 ? num / den : 0;
  }
}

/* ---------------- the six-ring check ---------------- */
/* The two wrong pictures. They are scenes the visitor did not see either: if they were drawn from every
   scene, most would be acts the visitor remembers doing, and ruling those out would pass the check with
   no decoder at all (3.85 of 6 after 40 acts, measured before this rule existed). Only when too few
   unseen scenes are left do the least seen stand in. */
function pickFoils(sp, ti, mode, rng, stats, seen) {
  const tr = sp.rings[ti];
  const general = SCENES.map((_, i) => i).filter((i) => i !== ti && sp.rings[i].key !== tr.key);
  const unseen = general.filter((i) => seen[i] === 0);
  const out = [];
  const keys = new Set([tr.key]);
  const add = (list) => { for (const i of list) { if (out.length === 2) break; if (keys.has(sp.rings[i].key)) continue; out.push(i); keys.add(sp.rings[i].key); } };
  if (mode === 'near') { add(shuffle(unseen.filter((i) => sectorDiff(sp.rings[i], tr) === 1), rng)); if (out.length < 2) stats.foilFallback += 2 - out.length; }
  add(shuffle(unseen, rng));
  if (out.length < 2) {
    stats.seenFoils = (stats.seenFoils || 0) + 2 - out.length;
    add(shuffle(general.filter((i) => seen[i] > 0), rng).sort((a, b) => seen[a] - seen[b]));
  }
  if (out.length < 2) throw new Error('not enough distinct rings for two foils');
  return out;
}
/* Six scene types the visitor did not see; when fewer than six are unseen, the least seen fill in. */
function pickTargets(seen, lastSeen, rng, stats) {
  let targets = shuffle(SCENES.map((_, i) => i).filter((i) => seen[i] === 0), rng).slice(0, CHECK_RINGS);
  if (targets.length < CHECK_RINGS) {
    stats.targetFallback += CHECK_RINGS - targets.length;
    const rest = SCENES.map((_, i) => i).filter((i) => seen[i] > 0).sort((a, b) => seen[a] - seen[b] || lastSeen[a] - lastSeen[b]);
    targets = targets.concat(rest.slice(0, CHECK_RINGS - targets.length));
  }
  return targets;
}

/** The check a visitor takes: six items, each a ring and three pictured scenes, one of them its own. */
export function checkItems(sp, seen, lastSeen, rng, mode = 'random') {
  const stats = { targetFallback: 0, foilFallback: 0, seenFoils: 0 };
  const items = pickTargets(seen, lastSeen, rng, stats).map((ti) => ({ target: ti, options: shuffle([ti, ...pickFoils(sp, ti, mode, rng, stats, seen)], rng) }));
  return { items, fallbacks: stats.targetFallback + stats.seenFoils };
}

/* scorer: a Proxy, 'oracle' (knows the species), 'blank' (knows nothing) or 'ruleout' (knows nothing and
   refuses any picture of a scene it saw). Returns a score of 6. */
export function sixRingCheck(scorer, sp, seen, lastSeen, mode, rng, stats) {
  const targets = pickTargets(seen, lastSeen, rng, stats);
  stats.checks++;
  let score = 0;
  for (const ti of targets) {
    const tr = sp.rings[ti];
    const cands = shuffle([ti, ...pickFoils(sp, ti, mode, rng, stats, seen)], rng);
    let best = -Infinity, bestList = [];
    for (const ci of cands) {
      let s;
      if (scorer === 'oracle') s = SECTORS.length - sectorDiff(sp.rings[ci], tr);
      else if (scorer === 'blank') s = 0;
      else if (scorer === 'ruleout') s = seen[ci] > 0 ? 0 : 1;
      else { s = 0; for (const t of tr.tokens) s += scorer.vote(t, SCENE_MASK[ci]); }
      if (s > best + 1e-9) { best = s; bestList = [ci]; } else if (Math.abs(s - best) <= 1e-9) bestList.push(ci);
    }
    if (pick(bestList, rng) === ti) score++;
  }
  return score;
}

/** One proxy visitor, one day, one check. r numbers the visitor. */
export function playOnce(sp, pol, r, cfg = PROXY, stats = { checks: 0, targetFallback: 0, foilFallback: 0 }, scorerKind = 'proxy') {
  const base = [sp.target, sp.seed, pol, r];
  const seq = DAY_POLICY[pol](cfg.N, mulberry32(seedOf('policy', ...base)));
  const proxy = new Proxy(cfg.K, cfg.sal, mulberry32(seedOf('learner', ...base)));
  const seen = new Array(SCENES.length).fill(0), lastSeen = new Array(SCENES.length).fill(-1);
  seq.forEach((si, i) => {
    if (scorerKind === 'proxy') proxy.observe(sp.rings[si].tokens, SCENES[si].feats, SCENE_MASK[si]);
    seen[si]++;
    lastSeen[si] = i;
  });
  const scorer = scorerKind === 'proxy' ? proxy : scorerKind;
  return sixRingCheck(scorer, sp, seen, lastSeen, cfg.foils, mulberry32(seedOf('check', ...base)), stats);
}

/** A histogram of scores 0..6 over many proxy visitors, read as shares. */
export function classify(hist) {
  const R = hist.reduce((a, b) => a + b, 0);
  const le2 = hist[0] + hist[1] + hist[2];
  const band = hist.slice(BAND.lo, BAND.hi + 1).reduce((a, b) => a + b, 0);
  const top = hist[6];
  const mean = hist.reduce((a, h, i) => a + h * i, 0) / R;
  const inBand = band * 2 > R;
  return { R, inBandCount: band, le2: le2 / R, band: band / R, top: top / R, mean, inBand, label: inBand ? 'band' : top >= le2 ? 'ceiling' : 'chance' };
}
