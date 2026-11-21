/* ============================================================
   orthogonal/config.js: the constants of the Orthogonal plate.
   Data lives in worlds/; computation in engine.js; drawing in
   view.js. Nothing here is computed.
   ============================================================ */

/* The method's steps, as each node of a lineage names its role. The words are the plate's; the order is the order a
   branch is grown in (the driver, what it gives, the pressure, the meeting of two threads, the made thing, and the
   trouble that success plants). */
export const ROLES = Object.freeze({
  root: 'Both worlds',
  driver: 'Driver',
  substrate: 'Substrate',
  pressure: 'Why now',
  combination: 'Combination',
  artifact: 'Artifact',
  trouble: 'Seed of trouble',
  earth: 'Earth',
});

/* Published sources, cited on the page as written here. Only what was opened and read is cited; a source read through
   another is said to be. */
export const SOURCES = Object.freeze({
  floudas2012: 'Floudas et al., Science 336, 1715 (2012)',
  nelsen2016: 'Nelsen, DiMichele, Peters and Boyce, PNAS 113, 2442 (2016)',
  okane1990: "O'Kane, Lingle, Porter and Wampler, Mycologia 82, 595 (1990), read through a secondary source",
  rabara2025: 'Rabara and Xie, J. Fungi 11, 774 (2025)',
  desbenoit2004: 'Desbenoit, Vanderhaghe, Galin and Grosjean, Eurographics 2004 short paper',
});

/* The lineage's geometry, in CSS px. The lanes are placed as shares of the drawing's width (engine.js lanes): Earth's
   lane at the left edge, this world's trunk at 0.61 of the width, the side lane 80 px left of the trunk. */
export const LAYOUT = Object.freeze({
  charW: 6.6,          // IBM Plex Mono at 11 px: 0.6 em a character
  lineH: 14,
  node: 10,            // a node's square
  labelGap: 14,        // from a lane to its label
  edgeLane: 11,        // Earth's lane, from the left edge
  trunkShare: 0.61,
  sideOffset: 80,
  rowGap: 22,          // below a row's tallest label block
  minPitch: 52,        // a row is never shorter, so a finger's target is at least 44 px tall at 390
  curve: 56,           // the most a branch curve takes before the node it reaches
  topPad: 6,
});

/* The ignition: the fired branch draws itself from the driver down, one row after another, and the render surfaces
   from the fog when the line reaches the artifact. prefers-reduced-motion and ?still get the finished frame. */
export const TIMING = Object.freeze({
  perRow: 260,         // ms between one row's line and the next
  edge: 420,           // ms an edge takes to draw
  bloom: 1400,         // ms the render takes to surface
});

export const EVENTS = Object.freeze({ node: 'alt-reality.node' });
