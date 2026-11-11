/* ============================================================
   altverse/config.js — constants and the multipath stage graph.
   Data only. The engine (engine.js), the orchestrator
   (pipeline.js) and the views read these; none of them hard-codes
   a stage, a baseline value or a horizon.
   ============================================================ */

/* The multipath: every stage names the stages it consumes. The
   orchestrator runs them in topological order; a stage whose
   precondition fails is pruned and its descendants are told why.
   lane: vertical slot in the pipeline drawing (0 top). */
export const STAGES = [
  { id: 'divergence', label: 'divergence', deps: [], lane: 1,
    role: 'Reads the change, classifies it and fixes its date and size.' },
  { id: 'physics', label: 'physics', deps: ['divergence'], lane: 1,
    role: 'Recomputes the constants and planetary quantities the change touches.' },
  { id: 'climate', label: 'climate', deps: ['physics'], lane: 2,
    role: 'Runs an energy-balance climate on the new planet: temperature by latitude, ice, seasons.' },
  { id: 'biosphere', label: 'biosphere', deps: ['physics', 'climate'], lane: 0,
    role: 'Decides what can live, how large, and whether anything becomes a toolmaker.' },
  { id: 'geography', label: 'geography', deps: ['climate', 'biosphere'], lane: 1,
    role: 'Draws the ground: sea level, ice, rivers, where people settle and the routes between them.' },
  { id: 'history', label: 'history', deps: ['biosphere', 'geography'], lane: 1,
    role: 'Rewrites the chronology after the divergence date; earlier events stay as in ours.' },
  { id: 'technology', label: 'technology', deps: ['physics', 'history'], lane: 0,
    role: 'Moves each invention on the ladder earlier, later or off it, with its cause.' },
  { id: 'culture', label: 'culture', deps: ['geography', 'history'], lane: 2,
    role: 'Places peoples in regions and gives them the calendar and habits their world forces.' },
  { id: 'contrast', label: 'contrast', deps: ['climate', 'technology', 'culture'], lane: 1,
    role: 'Pairs each large difference with ours and traces its causal path.' },
];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const STAGE_ORDER = STAGES.map((s) => s.id);

/* id prefixes the orchestrator mints (the model never mints ids) */
export const ID_PREFIX = {
  physics: 'ph', climate: 'cl', biosphere: 'bi', geography: 'ge',
  history: 'ev', technology: 'tk', culture: 'pp', contrast: 'ct',
};

export const LADDER = ['ESTABLISHED', 'THEORETICAL', 'SPECULATIVE', 'SF'];
export const LADDER_RANK = { ESTABLISHED: 0, THEORETICAL: 1, SPECULATIVE: 2, SF: 3 };

/* The chronology runs from Earth's formation to this horizon. */
export const HORIZON_YEAR = 2100;
export const EARTH_FORMS = -4.54e9;   // [REAL] Dalrymple 2001 (4.54 +/- 0.05 Gyr)

/* Our world, as the engine's baseline. Values tagged in sources.js. */
export const EARTH = {
  g: 9.81,                 // m/s^2
  radiusKm: 6371,
  massKg: 5.972e24,
  densityGcc: 5.51,
  vEscKms: 11.19,
  vOrbitKms: 7.91,
  dvLeoKms: 9.4,           // typical delta-v to low orbit incl. gravity and drag losses
  veKms: 4.4,              // hydrogen-oxygen vacuum exhaust velocity (Isp ~450 s)
  scaleHeightKm: 8.5,      // dry air at 288 K: RT/(Mg)
  pressureBar: 1.013,
  everestKm: 8.85,
  treeMaxM: 122,           // Koch et al. 2004 predicted maximum (tallest living ~116 m)
  lapseDry: 9.8,           // K/km = g/cp
  lapseMoist: 6.5,         // K/km, standard atmosphere
  solarWm2: 1361,          // Kopp & Lean 2011
  tiltDeg: 23.44,
  dayHours: 24,
  co2ppm: 280,             // pre-industrial baseline
  o2Frac: 0.209,
  alphaInv: 137.036,       // CODATA 2018
  cKms: 299792.458,
  iceDensity: 0.917,       // g/cm^3 at 0 C (Petrenko & Whitworth 1999)
  waterDensity: 1.000,
  oceanDepthKm: 3.68,      // mean ocean depth
  oceanFrac: 0.71,
  meanTempC: 14.5,         // pre-industrial global mean surface temperature (approx.)
  tideRangeM: 0.5,         // open-ocean spring tide amplitude scale (order of magnitude)
  heatFlowMWm2: 87,        // mean surface heat flux, Davies & Davies 2010 (47 TW)
};

/* Map grid: 0.75 degree cells, equirectangular. */
export const GRID = { W: 480, H: 240 };
/* Coarse grid for route finding. */
export const ROUTE_GRID = { W: 160, H: 80 };

/* Public route: one reply per 45 s per IP (measured 2026-11-11). */
export const PUBLIC_WINDOW_S = 45;

/* Text limits for anything a model writes. */
export const LIMITS = {
  summary: 420, text: 300, title: 90, name: 24,
  addPerStage: 4, eventsAdded: 6, contrastItems: 6,
};

/* Animation timing (ms). Reduced motion sets all to zero. */
export const TIMING = {
  stageEngine: 260,      // pause per stage in the engine trace, so the graph is readable
  ignition: 1600,        // map assembly
  worldDaySec: 32,       // one world rotation on the map, real seconds
};
