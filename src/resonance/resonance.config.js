/* =========================================================================
   resonance.config.js — RESONANCE constants (tune here, never in logic).
   Pure data: model profiles, radar axes, spectral params, LUMEN mappings,
   canvas layout. Augments window.RESONANCE.CONFIG. No logic, no DOM, no GL.
   Source lineage: WirthForge EnergySignature / TimingPattern (2025-09-12).
   ========================================================================= */
(function(){
  "use strict";
  const RESONANCE = (window.RESONANCE = window.RESONANCE || {});

  RESONANCE.CONFIG = {

    // ── model profiles — each is an archetype of LLM behaviour ───────────
    // mean_ms: average inter-token interval
    // std_ms:  timing variance (higher = more irregular)
    // burst_prob:  probability a token starts a fast burst sequence
    // burst_len:   tokens in a burst
    // pause_prob:  probability of a deliberate pause (thinking)
    // pause_ms:    [min, max] pause duration
    // energy_type: visual character name
    PROFILES: {
      lightning: {
        label:       'LIGHTNING',
        mean_ms:     32,
        std_ms:      7,
        burst_prob:  0.18,
        burst_len:   6,
        pause_prob:  0.02,
        pause_ms:    [60, 120],
        energy_type: 'lightning',
        color:       '#00ffcc',
        dim_color:   'rgba(0,255,204,0.25)',
      },
      council: {
        label:       'COUNCIL',
        mean_ms:     58,
        std_ms:      14,
        burst_prob:  0.10,
        burst_len:   4,
        pause_prob:  0.06,
        pause_ms:    [140, 280],
        energy_type: 'council',
        color:       '#4ecdc4',
        dim_color:   'rgba(78,205,196,0.25)',
      },
      architect: {
        label:       'ARCHITECT',
        mean_ms:     88,
        std_ms:      28,
        burst_prob:  0.06,
        burst_len:   3,
        pause_prob:  0.14,
        pause_ms:    [220, 580],
        energy_type: 'architecture',
        color:       '#ff8c42',
        dim_color:   'rgba(255,140,66,0.25)',
      },
      deep: {
        label:       'DEEP',
        mean_ms:     135,
        std_ms:      45,
        burst_prob:  0.04,
        burst_len:   2,
        pause_prob:  0.22,
        pause_ms:    [420, 1100],
        energy_type: 'consciousness',
        color:       '#9b59b6',
        dim_color:   'rgba(155,89,182,0.25)',
      },
    },
    DEFAULT_PROFILE: 'council',

    // ── spectral analysis window ──────────────────────────────────────────
    // HISTORY_LEN: how many token intervals to keep in the rolling buffer
    // FFT_SIZE:    must be power-of-two; determines frequency resolution
    // HEALTH_ALPHA: smoothing factor for the composite health score (EMA)
    SPECTRAL: {
      HISTORY_LEN: 64,
      FFT_SIZE:    64,
      HEALTH_ALPHA: 0.06,
    },

    // ── Cognitive Radar — six axes (from WirthForge CX-0679) ─────────────
    RADAR_AXES: [
      { id: 'processing',   label: 'PROCESSING',   desc: 'token throughput rate'          },
      { id: 'latency',      label: 'LATENCY',      desc: 'inverse mean interval'          },
      { id: 'throughput',   label: 'THROUGHPUT',   desc: 'sustained output density'       },
      { id: 'coherence',    label: 'COHERENCE',    desc: 'rhythm regularity (1 - cv)'     },
      { id: 'efficiency',   label: 'EFFICIENCY',   desc: 'signal-to-pause ratio'          },
      { id: 'stochasticity',label: 'STOCHASTICITY',desc: 'measured non-determinism'       },
    ],

    // ── canvas layout ─────────────────────────────────────────────────────
    // Waveform panel (spectral analyzer)
    WAVE: {
      HEIGHT: 120,
      BAR_COUNT: 32,
      BAR_GAP: 2,
    },
    // Radar panel (cognitive profile)
    RADAR: {
      SIZE: 200,      // total canvas width/height
      RADIUS: 80,     // outer ring
      RINGS: 4,
    },
    // Composite health gauge
    HEALTH: {
      WIDTH: 120,
      HEIGHT: 14,
    },

    // ── LUMEN bridge — preset delta per profile ───────────────────────────
    // These are written into the base 'resonance' LUMEN preset at runtime.
    // The base preset lives in lumen.config.js under PRESETS.resonance.
    LUMEN_DELTA: {
      lightning: { speed: 0.082, damp: 0.90, drift: 0.08, mode: 0 },
      council:   { speed: 0.048, damp: 0.94, drift: 0.05, mode: 1 },
      architect: { speed: 0.032, damp: 0.96, drift: 0.04, mode: 3 },
      deep:      { speed: 0.022, damp: 0.97, drift: 0.09, mode: 4 },
    },

    // ── simulation tick budget (ms between simulated token arrivals) ──────
    // The engine runs at real wall-clock speed but uses a virtual "model time"
    // multiplier so the demo is watchable without waiting real LLM latency.
    SIM_SPEED: 0.4,   // 1.0 = real-time, < 1 = slower (more watchable)
  };
})();
