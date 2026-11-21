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
  headH: 22,           // the column heads, 'Earth' over Earth's lane and 'This world' over the trunk
});

/* The ignition: the fired branch draws itself from the driver down, one row after another, and the render surfaces
   from the fog when the line reaches the artifact. prefers-reduced-motion and ?still get the finished frame. */
export const TIMING = Object.freeze({
  perRow: 260,         // ms between one row's line and the next
  edge: 420,           // ms an edge takes to draw
  appear: 360,         // ms a step takes to appear once its line reaches it
  bloom: 1400,         // ms the render takes to surface
  driftFps: 20,        // at rest the fog drifts; it is redrawn at most this often
  drift: [4, -1.5],    // px a second the fog drifts, across and down
});

/* The brush each kind of line is drawn with (kit/brush.js), its body's width in px. This world's branch is the
   widest; the threads that meet in it narrower; Earth's branch a fine clear line; what has not happened the finest. */
export const INK = Object.freeze({
  fired: 4.6,
  thread: 3,
  earth: 2,
  pending: 1.6,
});

/* The fog (engine.js fogDensity, the world brief). Densities run 0 to 1; reaches are the scale, in px, of a gaussian
   about a line. The canvas draws density 1 at FOG.alpha of --horizon, through a seeded fog texture (kit/fog.js). */
export const FOG = Object.freeze({
  cell: 4,             // px of the drawing per cell of the density field
  full: 1,             // around a line of this world's branch the strand has not reached
  rest: 0.8,           // around a line it has drawn: invented, so never clear
  pending: 1,          // around what has not happened
  reach: 46,           // wide, so the fog is a cloud over the branch and not a halo along each line
  pendingReach: 50,
  channel: 0.55,       // how much of the fog a drawn stroke takes into its ink, at the stroke: a soft clearing over
  channelReach: 20,    // four stroke widths, not a band (a band beside a light haze reads as a drop shadow)
  earthClear: 10,      // Earth's branch and the root hold no fog within this many px
  earthReach: 18,      // and push it back over this many more
  alpha: 0.28,         // the fog's alpha at density 1 (labels over it keep their contrast by a halo of the ground, orthogonal.css)
  seed: 0x0F06,        // the fog texture's seed
  tile: 128,           // the texture's side, cells
  scale: 4,            // drawn at this many px a cell, so the wisps are large and slow
});

export const EVENTS = Object.freeze({ node: 'alt-reality.node' });
