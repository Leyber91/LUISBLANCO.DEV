/* =========================================================================
   lumen.config.js — LUMEN constants (the only file you tune by hand).
   Pure data: tiers, fixed timestep, DPR cap, field presets, route→preset map.
   Augments window.LUMEN.CONFIG. No logic, no DOM, no GL.
   ========================================================================= */
(function(){
  "use strict";
  const LUMEN = (window.LUMEN = window.LUMEN || {});

  LUMEN.CONFIG = {
    // ── perf tiers — texSize² = particle count (T-1.5 will bench + pick) ────
    TIERS: {
      T0: { texSize: 776 },   // ~602k  desktop dGPU
      T1: { texSize: 512 },   // ~262k  default laptop
      T2: { texSize: 316 },   // ~100k  weak iGPU
    },
    DEFAULT_TIER: 'T1',

    STEP_MS: 16.6,            // fixed simulation timestep
    DPR_CAP: 1.5,            // device-pixel-ratio ceiling (battery / fill cost)
    PRESET_LERP_MS: 2000,    // ease time when the field changes character

    // ── field presets — one character per plate section ────────────────────
    // scale=frequency · speed=flow mag (units/s) · drift=field evolution ·
    // damp=viscosity · mode 0 hero/1 laminar/2 cellular/3 funnel/4 radial ·
    // cx,cy = funnel column / radial origin.
    PRESETS: {
      hero:         { scale:1.4, speed:0.060, drift:0.05, damp:0.95, mode:0, cx:0.00, cy:0.0 },
      architecture: { scale:1.1, speed:0.050, drift:0.04, damp:0.96, mode:1, cx:0.00, cy:0.0 },
      projects:     { scale:2.8, speed:0.060, drift:0.06, damp:0.94, mode:2, cx:0.00, cy:0.0 },
      work:         { scale:1.6, speed:0.075, drift:0.05, damp:0.95, mode:3, cx:0.55, cy:0.0 },
      contact:      { scale:1.2, speed:0.045, drift:0.03, damp:0.96, mode:4, cx:0.00, cy:0.0 },
      resonance:    { scale:2.0, speed:0.040, drift:0.06, damp:0.93, mode:4, cx:0.50, cy:0.4 },
    },

    // route spy: first matching section class wins (distinctive classes first).
    SECTION_PRESET: [
      ['.arch-main','architecture'], ['.proj-main','projects'], ['.wr-main','projects'],
      ['.rs-main','resonance'], ['.wk-main','work'], ['.ct-main','contact'], ['.ab-main','contact'],
      ['.inside','hero'], ['.hero','hero'],
    ],
  };
})();
