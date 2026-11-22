/* ============================================================
   orthogonal/catalog-model.js: the catalogue's rules, with no DOM
   and no three.js, so that catalog.test.mjs reads the very
   functions the page runs.

   - validateTree: the parts-tree schema (the same rules as
     data/orthogonal/catalog/make_parts.py validate; the test runs
     both over parts.json and the page's copy must agree).
   - boundsOf: the sphere a tree fits in, for the camera.
   - groupByDomain, resolveWorld, step: the list, the ?w= link and
     the previous / next walk of the page.
   - partLine: one plain line naming a part, for the text fallback
     and the selection read-out.
   ============================================================ */

export const KINDS = ['column', 'plinth', 'box', 'lattice', 'vessel', 'mast', 'mirror', 'disc', 'gimbal', 'wing', 'rotor', 'shutter', 'dial', 'pipe', 'sphere'];
export const MATERIALS = ['glass', 'ceramic', 'wood', 'bronze', 'stone', 'fabric', 'bone', 'living'];
export const DOMAINS = ['energy', 'materials', 'communication', 'transport', 'food', 'environment'];
export const LIMITS = { minParts: 3, maxParts: 14, minSize: 0.001, maxCoord: 60 };
export const TAG_LINE = 'Drafted by a model from the method’s rules; not yet grown by the engine';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const triple = (v, lo, hi) => Array.isArray(v) && v.length === 3 && v.every((x) => isNum(x) && x >= lo && x <= hi);

/** Every reason a parts tree is invalid; empty when it is valid. */
export function validateTree(tree) {
  const errs = [];
  if (!tree || typeof tree !== 'object' || !Array.isArray(tree.parts)) return ['not a tree with parts'];
  const parts = tree.parts;
  if (parts.length < LIMITS.minParts || parts.length > LIMITS.maxParts) errs.push(`${parts.length} parts, not ${LIMITS.minParts} to ${LIMITS.maxParts}`);
  parts.forEach((p, i) => {
    if (!p || typeof p !== 'object') { errs.push(`part ${i}: not an object`); return; }
    const keys = Object.keys(p).sort().join();
    if (keys !== ['at', 'emits', 'kind', 'material', 'rot', 'size'].join()) errs.push(`part ${i}: keys ${keys}`);
    if (!KINDS.includes(p.kind)) errs.push(`part ${i}: kind ${p.kind}`);
    if (!MATERIALS.includes(p.material)) errs.push(`part ${i}: material ${p.material}`);
    if (typeof p.emits !== 'boolean') errs.push(`part ${i}: emits`);
    if (!triple(p.size, LIMITS.minSize, LIMITS.maxCoord)) errs.push(`part ${i}: size`);
    if (!triple(p.at, -LIMITS.maxCoord, LIMITS.maxCoord)) errs.push(`part ${i}: at`);
    if (!triple(p.rot, -360, 360)) errs.push(`part ${i}: rot`);
  });
  return errs;
}

/** The sphere (centre and radius, metres) that holds every part, each taken as the sphere about its box. */
export function boundsOf(parts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const r = Math.hypot(p.size[0], p.size[1], p.size[2]) / 2;
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.at[a] - r); hi[a] = Math.max(hi[a], p.at[a] + r); }
  }
  const center = lo.map((v, a) => (v + hi[a]) / 2);
  let radius = 0;
  for (const p of parts) {
    const r = Math.hypot(p.size[0], p.size[1], p.size[2]) / 2;
    radius = Math.max(radius, Math.hypot(p.at[0] - center[0], p.at[1] - center[1], p.at[2] - center[2]) + r);
  }
  return { center, radius: Math.max(radius, 1e-6) };
}

const fmt = (m) => (m >= 10 ? m.toFixed(0) : m >= 1 ? m.toFixed(1) : m >= 0.1 ? m.toFixed(2) : m.toFixed(3));
/** One plain line naming a part: its material, its kind, its size in metres, and whether it glows. */
export function partLine(p) {
  return `${p.material} ${p.kind}, ${p.size.map(fmt).join(' x ')} m${p.emits ? ', glowing' : ''}`;
}

/** The worlds grouped by domain, in the order of DOMAINS, each in the catalogue's own order. */
export function groupByDomain(worlds) {
  return DOMAINS.map((d) => ({ domain: d, worlds: worlds.filter((w) => w.domain === d) })).filter((g) => g.worlds.length);
}

/** The world a query string names: ?w=<id>, else the first world. Unknown ids open the first world, and say so. */
export function resolveWorld(search, worlds) {
  const id = new URLSearchParams(search).get('w');
  const hit = id ? worlds.find((w) => w.id === id) : null;
  return { world: hit || worlds[0], known: !id || !!hit };
}

/** The id d steps along the catalogue's order from id, wrapping at both ends. */
export function step(worlds, id, d) {
  const i = worlds.findIndex((w) => w.id === id);
  return worlds[(((i < 0 ? 0 : i) + d) % worlds.length + worlds.length) % worlds.length].id;
}

/** A random world other than the current one, from a draw r in [0, 1). */
export function surprise(worlds, id, r) {
  const rest = worlds.filter((w) => w.id !== id);
  return rest[Math.min(rest.length - 1, Math.floor(r * rest.length))].id;
}
