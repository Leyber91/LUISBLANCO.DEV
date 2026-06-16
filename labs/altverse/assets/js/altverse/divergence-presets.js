/* ============================================================
   altverse/divergence-presets.js — the curated compose path.
   Phase 1: vetted PHYSICS divergences, each with a known entry
   node + plausibility ceiling. Free-text divergence (needs the
   S0 classifier) is a Phase 4 fast-follow.
   ============================================================ */

export const PRESETS = [
  {
    id: 'ice-sinks',
    domain: 'physics',
    statement: 'Water has no density anomaly — ice sinks instead of floating.',
    baseline: 'In our reality water is densest near 4 °C, so ice floats and insulates the water below.',
    entryNode: 'loss of the 4 °C density maximum',
    ceiling: 'THEORETICAL',
    hint: 'Lakes and oceans freeze from the bed upward. No liquid refuge survives the winter.',
  },
  {
    id: 'slow-light',
    domain: 'physics',
    statement: 'The speed of light is ten times slower (c ≈ 30,000 km/s).',
    baseline: 'c ≈ 299,792 km/s — relativity only bites at extreme speeds.',
    entryNode: 'relativistic effects at everyday velocities',
    ceiling: 'SPECULATIVE',
    hint: 'Time dilation and the mass-energy ceiling intrude on ordinary travel and engineering.',
  },
  {
    id: 'strong-gravity',
    domain: 'physics',
    statement: 'Earth-surface gravity is 30% stronger (g ≈ 12.7 m/s²).',
    baseline: 'g ≈ 9.81 m/s².',
    entryNode: 'a heavier world',
    ceiling: 'THEORETICAL',
    hint: 'Shorter, sturdier life; lower mountains; a denser, shallower atmosphere; flight is hard.',
  },
];

export const PRESETS_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
