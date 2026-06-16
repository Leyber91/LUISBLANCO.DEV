/* ============================================================
   altverse/schemas.js — the shape contract.
   Phase 1 uses a thin has-required-keys guard (the full file://-
   safe JSON-schema validator + invariants arrive in Phase 2).
   Keeping the required-key lists here means echo-world.js and the
   live stages fill the SAME slots, so the renderers never branch
   on source.
   ============================================================ */

export const LADDER = ['ESTABLISHED', 'THEORETICAL', 'SPECULATIVE', 'SF'];
export const LADDER_RANK = { ESTABLISHED: 0, THEORETICAL: 1, SPECULATIVE: 2, SF: 3 };
export const DOMAINS = ['physics', 'history', 'biology', 'geography', 'technology'];

// Required keys per spine slot. The 4-stage causal spine is
// premise -> firstOrder -> chronology -> contrast; Phase 1 adds a
// light geography slot so the map has something to draw.
export const SPINE = {
  premise:   { keys: ['text', 'firstMechanism', 'ladder'] },
  firstOrder:{ item: ['id', 'text', 'mechanism', 'ladder'] },
  geography: { item: ['id', 'name', 'bbox', 'dominantBiome', 'climate', 'rationale', 'ladder'] },
  chronology:{ eraItem: ['id', 'name', 'start', 'end'], eventItem: ['id', 'eraId', 'year', 'title', 'cause', 'ladder'] },
  civilizations: { item: ['id', 'name', 'regionId', 'rises', 'traits'] },
  contrast:  { item: ['id', 'ours', 'theirs', 'path', 'ladder'] },
  entry:     { keys: ['vignette'] },
};

/** has-required-keys guard. Returns string[] of problems (empty = ok). */
export function guardKeys(obj, keys, label = 'object') {
  const out = [];
  if (obj == null || typeof obj !== 'object') return [`${label}: not an object`];
  for (const k of keys) {
    if (obj[k] == null || (typeof obj[k] === 'string' && obj[k].trim() === '')) {
      out.push(`${label}: missing "${k}"`);
    }
  }
  return out;
}

/** guard an array of items against a per-item required-key list */
export function guardItems(arr, keys, label = 'items') {
  if (!Array.isArray(arr) || arr.length === 0) return [`${label}: expected a non-empty array`];
  return arr.flatMap((it, i) => guardKeys(it, keys, `${label}[${i}]`));
}

export function isLadder(v) { return LADDER.includes(v); }
