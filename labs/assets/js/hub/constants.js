/* ============================================================
   hub/constants.js — the single home for every reusable hub
   constant. Nothing downstream hard-codes a selector, a magic
   number, a colour or a label: it lives here, so behaviour is
   tuned in ONE place. Data (projects/nav/socials) stays in
   config/site.config.js; this file is behaviour + theme + tuning.
   ============================================================ */

/* ---- DOM selectors (ids in index.html) ---- */
export const SEL = {
  substrate:     '#cosmos-substrate',
  heroCanvas:    '#hero-canvas',
  statBuilt:     '#stat-built',
  statPlanned:   '#stat-planned',
  statCats:      '#stat-cats',
  filters:       '#filters',
  grid:          '#project-grid',
  rail:          '#rail',
  scrim:         '#scrim',
  railToggle:    '#rail-toggle',
  siteNav:       '#site-nav',
  aiStatus:      '#ai-status',
  aiStatusLabel: '#ai-status-label',
  socials:       '#socials',
  ledgerBuilt:   '#ledger-built',
  ledgerBeta:    '#ledger-beta',
  ledgerPlanned: '#ledger-planned',
  ledgerCats:    '#ledger-cats',
  year:          '#year',
  reveal:        '[data-reveal]',
};

/* ---- behaviour / motion ---- */
export const MOTION = {
  revealRootMargin: '0px 0px -10% 0px',
  measure: '64ch',
};

export const STILL = {
  param: 'still',          // ?still query param
  flagKey: '__L212_STILL__',
  htmlClass: 'still',
};

/* ---- the "All" pseudo-filter prepended to the category chips ---- */
export const FILTER_ALL = { id: 'all', label: 'All', icon: 'fa-solid fa-asterisk' };

/* ---- AI status: mode -> label (extend by adding a key, not a branch) ---- */
export const AI_LABELS = {
  ollama: 'AI · Local',
  worker: 'AI · Hosted',
  echo:   'AI · Offline',
};
export const AI_LABEL_FALLBACK = 'AI';

/* ---- project-card CTA strategy: mode -> presentation (no if/else) ---- */
export const CARD_CTA = {
  interactive: { label: 'Explore', icon: 'fa-solid fa-arrow-right', link: true },
  pending:     { label: 'In the pipeline', muted: true },
};

/* ============================================================
   theme — the shared RGB palette (canvas can't read CSS vars
   cheaply). Kept in sync with tokens.css. Reused by the hero +
   the substrate so the warm/cold language is defined once.
   ============================================================ */
export const PALETTE = {
  star:     [197, 204, 216],
  starHex:  '#cdd6e4',
  warm:     [242, 169, 59],   // --accretion
  warmSoft: [246, 194, 113],
  warmHex:  '#f6c271',
  hot:      [186, 220, 255],  // doppler-boosted inner edge
  red:      [150, 70, 40],    // receding limb
  ring:     [255, 238, 200],  // photon ring
  cold:     [43, 106, 135],   // --horizon
  violet:   [60, 40, 90],
  slate:    [40, 70, 90],
};

/* ---- black-hole hero tuning (one place to art-direct it) ---- */
export const HERO_CONFIG = {
  centerX: 0.5,
  centerY: 0.46,
  shadowFrac: 0.12,        // shadow radius as a fraction of min(w,h)
  starDivisor: 5200,       // star count = w*h / divisor
  lensStrength: 1.55,      // outward deflection ~ lens*rs^2/r
  lensReach: 7,            // bending noticeable within rs*reach
  einsteinRing: 1.92,      // ring radius in rs
  disk: { inc: 0.30, innerRs: 1.28, outerRs: 4.6, rings: 46, segs: 60, spin: 0.45, liftRs: 0.42 },
  photonRing: { radiusRs: 1.045, widthFrac: 0.045 },
};

/* ---- cosmic-substrate tuning ---- */
export const SUBSTRATE_CONFIG = {
  // drifting nebula clouds (x,y in 0..1, r as a fraction of max(w,h))
  nebulae: [
    { x: 0.18, y: 0.22, r: 0.55, col: PALETTE.cold,   a: 0.16, drift: 0.012 },
    { x: 0.82, y: 0.30, r: 0.50, col: [151, 104, 31], a: 0.13, drift: -0.009 }, // warm
    { x: 0.55, y: 0.85, r: 0.65, col: PALETTE.violet, a: 0.12, drift: 0.007 },
    { x: 0.30, y: 0.65, r: 0.40, col: PALETTE.slate,  a: 0.10, drift: -0.014 },
  ],
  // far -> near parallax starfields
  layers: [
    { divisor: 9000,  size: [0.4, 1.0], alpha: [0.12, 0.4], par: 0.02 },
    { divisor: 16000, size: [0.7, 1.6], alpha: [0.25, 0.6], par: 0.06 },
    { divisor: 34000, size: [1.0, 2.4], alpha: [0.4, 0.9],  par: 0.12 },
  ],
  shooter: { minGap: 3.5, gapJitter: 5, speed: [260, 220], vy: [120, 160], life: [0.7, 0.5], len: [90, 80] },
  warmStarChance: 0.86,    // rand() above this -> a warm star
  nebulaParallax: 0.03,
};
