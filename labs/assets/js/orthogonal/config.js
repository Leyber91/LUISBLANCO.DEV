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
  // the two sources render_artifact.py's header gives for its cap: a profile swept round an axis
  raistrick2023: 'Raistrick et al., Infinigen, CVPR 2023',
  // fungal light is green: opened 2026-11-21 (PMC6294908, through PubMed): the fungal luciferase "emitted green light
  // with a maximum at 520 nm and spectrum identical to that of N. nambi mycelium". It is measured on Neonothopanus
  // nambi. The page says "fungal light", not this culture's: P. stipticus carries the same pathway's genes (luz, hisps,
  // h3h; Rabara and Xie 2025, full text opened), and Oliveira et al. 2012 (Photochem. Photobiol. Sci. 11, 848; abstract
  // opened) find one luciferin and luciferase shared by every luminous lineage. uncertain: P. stipticus's own maximum
  // (525 nm, Lingle, Porter and O'Kane 1992, Mycologia) is known here only through a secondary source, so no number
  // for this species is printed.
  kotlobay2018: 'Kotlobay et al., PNAS 115, 12728 (2018)',
  // the engine's table (assets/data/orthogonal/tech/light.json), opened 2026-11-21 from the copies the road's wheel scout
  // downloaded (research/wheel_graphs.md G1, G7, M1, M4): Nordhaus's chapter read in sections 1.2.4 to 1.2.7 and Table
  // 1.1; the Historical Tech Tree's records (title, year, links, date notes) for each row that cites it; Hordijk's
  // Algorithms 1 to 3; Arthur and Polak's working paper whole
  nordhaus1996: 'Nordhaus, in Bresnahan and Gordon (eds.), The Economics of New Goods, University of Chicago Press (1996)',
  htt2025: 'Fortier-Dubois, Historical Tech Tree, historicaltechtree.com (2025)',
  hordijk2023: 'Hordijk, A Concise and Formal Definition of RAF Sets and the RAF Algorithm, arXiv 2303.01809 (2023)',
  arthurpolak2006: 'Arthur and Polak, Complexity 11(5), 23 (2006), read as SFI Working Paper 2004-12-042',
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
  earth: 2,            // Earth's branch is not brushed: this is the diameter of its dots (EARTH_DOTS)
  pending: 1.6,
});

/* Earth's branch is drawn dotted: round dots of INK.earth px, one every EARTH_DOTS.gap px, in the ink ladder's dim
   grey, clear of fog because it is history. The bindings say so ("with Earth's dotted beside it", plan.json
   signature_move and the central scene) and so does the ladder (lineage-plate rung 2); the world brief had chosen a
   solid line and drifted from them (review H2; the brief is amended). The dots are larger and further apart than the
   dotted rule across a chosen row (orthogonal.css .pair-rule, 1 px every 4 px), so the two read apart. */
export const EARTH_DOTS = Object.freeze({ gap: 6 });

/* The most alpha the fog may have anywhere, in any state: the world brief's budget ("the fog a cold haze of --horizon
   at no more than 0.16 alpha", _reference/labs/plans/alt-reality/world_brief.md, axis 3). FOG.alpha had been raised
   to 0.28 after the brief was written (review H3); tests.mjs section 21 holds the fog's peak alpha to this in every
   state, the ignition included, and every --horizon haze in orthogonal.css, and the drive reads the canvas. */
export const FOG_LIMIT = 0.16;

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
  alpha: 0.16,         // the fog's alpha at density 1, at FOG_LIMIT (labels over it keep their contrast by a halo of the ground)
  seed: 0x0F06,        // the fog texture's seed
  tile: 128,           // the texture's side, cells
  scale: 4,            // drawn at this many px a cell, so the wisps are large and slow
  edge: 28,            // the fog thins to none over this many px at the drawing's edges, so the box never cuts it
  drillClear: 10,      // while an order is given, a step holds no fog within this many px of its square and its words
  drillReach: 22,      // and pushes it back over this many more
  fadeMs: 520,         // the fog's change between the reading and an order
});

/* The exercise: order these steps by what each needs (the necessity unit; the challenge blueprint's second format in
   the lab's plan). The engine picks `size` steps of the shown world's lineage for each item: a set in which at most
   `free` pairs are not ordered by the links, so every item has an order to find, and any order the links allow is
   right. */
export const EXERCISE = Object.freeze({
  size: 4,
  free: 1,
  logCap: 400,         // the record keeps the last 400 answers and actions; its counts are kept apart and never trimmed
  walkMs: 1500,        // arrow-key choices this close together are one walk, logged as the step it ended on
  moveMs: 560,         // the steps leave their rows, and come back, over this long
});

/* What the plate says when the browser keeps nothing: the bindings' storage-off diagnosis, verbatim from the lab's plan
   (bindings.known_setup_failures, id storage-off). */
export const STORAGE_OFF = 'Your browser keeps nothing for this page, so your answers last until it reloads or closes. A link to a step still opens that step.';

/* What the plate says beside the count when the browser keeps the record: where it is and what the privacy page does
   with it (Labs OS keeps it in this browser; labs/privacy.html shows, exports and erases it). It takes the storage-off
   diagnosis's place, so both states put a line there and on a phone the bar is one height in both (item 9). */
export const STORAGE_ON = 'Your answers are kept in this browser. The privacy page shows what is kept, and exports or erases it.';

export const EVENTS =Object.freeze({ node: 'alt-reality.node', order: 'alt-reality.order' });
