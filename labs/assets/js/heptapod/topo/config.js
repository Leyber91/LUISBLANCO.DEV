/* ============================================================
   heptapod/topo/config.js — every constant of the topology kernel
   (experiment E1 of generation G2). Lengths are in units of l, the
   nominal length of one code cell. Nothing downstream hard-codes a
   number that lives here.

   The margins follow the plan's m1: a neck is an interior pinch no
   wider than wn; a kiss is an exterior gap between gMin and gMax;
   every other approach of the curve to itself is at least dMin, with
   dMin >= 1.5 * max(wn, gMax). The decoder's contact threshold tau
   sits between the widest contact and the narrowest non-contact.
   ============================================================ */

export const TOPO = Object.freeze({
  version: 'topo-e1-0.1',

  /* the code (abstract here; E2 turns each cell into a curvature offset) */
  K: 9,                 // cells per motif
  cellLen: 1,           // nominal cell length l
  checksumP: 31,        // the order-free checksum is a sum of motif indices mod p

  /* contact geometry, in l */
  wn: 2.5,              // neck channel width: the interior chord across a neck
  s0: 1.5,              // nominal neck channel length (gap between the two rims a neck joins)
  g: 1.5,               // kiss gap the layout solves for
  gMin: 1.0, gMax: 2.0, // admissible kiss gaps
  dMin: 6.0,            // clearance between primitives that are not in contact (>= 1.5 * max(wn, gMax))
  rMin: 5.0,            // smallest lobe radius

  /* rim allocation */
  zKiss: 1.0,           // blank rim each side of a kiss point
  zNeckPad: 0.75,       // blank rim beyond the decoder's neck zone (see neckZoneHalf)

  /* decoder */
  tau: 3.5,             // a self-approach narrower than this is a contact candidate
  aMin: 5.0,            // two points closer than this along the curve are one stretch of line, not a pinch
  tAdj: 1.5,            // a collar copy starting within this of a contact zone belongs to that contact
  widthTol: 0.3,        // tolerance on measured neck widths and kiss gaps

  /* contour */
  grid: 0.5,            // signed-distance grid step for marching squares (kiss gap g = 3 steps, neck wn = 5)
  ds: 0.3,              // arc-length resampling step of the contour
  rimTol: 0.06,         // a contour point this close to a lobe rim is read as that rim

  /* layout */
  psi: 50 * Math.PI / 180, // half-angle reserved around the direction to a lobe's parent
  angMargin: 0.02,      // extra angular margin between sibling wedges (radians)
  grow: 1.15,           // a crowded child is pushed out by this factor per step
  maxPush: 400,         // iteration cap of one composition step
  relaxRadius: 1.15,    // a lobe whose rim cannot hold its code grows by this factor (upward only)
  maxRelax: 6,
});

/* Half-width (arc length from the neck axis) of the rim zone a neck
   mouth occupies. The decoder's neck cluster reaches tau - wn/2 from
   the axis along a rim; the renderer leaves zNeckPad more blank. */
export const neckZoneHalf = () => TOPO.tau - TOPO.wn / 2 + TOPO.zNeckPad;
