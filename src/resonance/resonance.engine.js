/* =========================================================================
   resonance.engine.js — RESONANCE computation (pure state machine).
   No DOM. No canvas. No GL. Takes a profile, emits EnergySignature each tick.
   Subsystems: TokenStreamSimulator · SpectralAnalyzer · RadarComputer ·
               BurstDetector · HealthAggregator.
   Public API (window.RESONANCE.Engine):
     create(profileKey) → engine instance with:
       tick(dtMs)           — advance simulation by dtMs wall-clock ms
       getSignature()       — return current EnergySignature snapshot
       setProfile(key)      — hot-swap profile (lerps toward new character)
       reset()              — clear history, restart from silence
   ========================================================================= */
(function(){
  "use strict";
  const RESONANCE = (window.RESONANCE = window.RESONANCE || {});
  const CFG = RESONANCE.CONFIG;
  const SP  = CFG.SPECTRAL;

  // ── tiny seedable PRNG (mulberry32) ────────────────────────────────────
  function prng(seed){
    let s = seed >>> 0;
    return function(){
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Gaussian sample (Box-Muller) ───────────────────────────────────────
  function gauss(rand, mean, std){
    let u = 0, v = 0;
    while(u === 0) u = rand();
    while(v === 0) v = rand();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ── TokenStreamSimulator ───────────────────────────────────────────────
  // Produces a stream of inter-token intervals (ms) from a model profile.
  // Returns the interval of the next token when budget (virtualMs) exhausted.
  function makeSimulator(profile, rand){
    let budget   = 0;   // virtual ms until next token fires
    let inBurst  = 0;   // remaining burst tokens
    let inPause  = 0;   // virtual ms remaining in pause

    function nextInterval(){
      if(inPause > 0){
        const amt = Math.min(inPause, profile.mean_ms * 3);
        inPause -= amt;
        return amt;
      }
      if(inBurst > 0){
        inBurst--;
        return Math.max(8, gauss(rand, profile.mean_ms * 0.35, profile.std_ms * 0.3));
      }
      const r = rand();
      if(r < profile.pause_prob){
        const lo = profile.pause_ms[0], hi = profile.pause_ms[1];
        inPause = lo + rand() * (hi - lo);
        return inPause;
      }
      if(r < profile.pause_prob + profile.burst_prob){
        inBurst = Math.round(1 + rand() * (profile.burst_len - 1));
        return Math.max(8, gauss(rand, profile.mean_ms * 0.35, profile.std_ms * 0.3));
      }
      return Math.max(8, gauss(rand, profile.mean_ms, profile.std_ms));
    }

    return {
      // Advance by dtVirtual ms. Returns array of interval values that fired.
      advance(dtVirtual){
        const fired = [];
        budget -= dtVirtual;
        while(budget <= 0){
          const iv = nextInterval();
          fired.push(iv);
          budget += iv;
        }
        return fired;
      },
      reset(){ budget = 0; inBurst = 0; inPause = 0; },
    };
  }

  // ── SpectralAnalyzer ───────────────────────────────────────────────────
  // Maintains a rolling buffer of inter-token intervals, computes a DFT-
  // based frequency profile, and derives the spectral metrics.
  function makeSpectral(){
    const N   = SP.FFT_SIZE;
    const buf = new Float32Array(N);  // circular, normalised intervals
    let   ptr = 0, count = 0;
    // windowed DFT magnitude spectrum (N/2 bins)
    const mag = new Float32Array(N / 2);

    // Push one interval value (ms) into the buffer.
    function push(intervalMs){
      // Normalise to 0-1 range against a 1s ceiling
      buf[ptr % N] = Math.min(intervalMs, 1000) / 1000;
      ptr++;
      count = Math.min(count + 1, N);
    }

    // Recompute DFT magnitude spectrum from current buffer (Hann windowed).
    function compute(){
      const half = N / 2;
      for(let k = 0; k < half; k++){
        let re = 0, im = 0;
        for(let n = 0; n < N; n++){
          const sample = buf[(ptr - N + n + N) % N];
          const win    = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1));
          const phase  = (2 * Math.PI * k * n) / N;
          re += sample * win * Math.cos(phase);
          im -= sample * win * Math.sin(phase);
        }
        mag[k] = Math.sqrt(re * re + im * im) / (N * 0.5);
      }
    }

    // Derive metrics from the magnitude spectrum.
    function metrics(){
      compute();
      const half = N / 2;
      let total = 0, peak = 0, peakBin = 0, weightedSum = 0;
      for(let k = 1; k < half; k++){   // skip DC (k=0)
        total      += mag[k];
        weightedSum+= mag[k] * k;
        if(mag[k] > peak){ peak = mag[k]; peakBin = k; }
      }
      const normTotal = total || 1;
      const centroid  = weightedSum / normTotal;               // spectral centroid
      const domFreq   = peakBin / half;                        // dominant freq (0-1)
      // Bandwidth: weighted RMS spread around centroid
      let bwSum = 0;
      for(let k = 1; k < half; k++) bwSum += mag[k] * (k - centroid) * (k - centroid);
      const bandwidth = Math.sqrt(bwSum / normTotal) / half;
      // Spectral complexity: entropy-like measure (spread of energy)
      let entropy = 0;
      for(let k = 1; k < half; k++){
        const p = mag[k] / normTotal;
        if(p > 0) entropy -= p * Math.log2(p);
      }
      const complexity = entropy / Math.log2(half);            // normalised 0-1
      return { domFreq, bandwidth, centroid: centroid / half, complexity, mag };
    }

    function getMag(){ return mag; }
    function getCount(){ return count; }
    function reset(){ buf.fill(0); ptr = 0; count = 0; }

    return { push, metrics, getMag, getCount, reset };
  }

  // ── BurstDetector ─────────────────────────────────────────────────────
  // Scans the recent interval history for burst patterns (short runs of
  // fast tokens) and annotates them with position and intensity.
  function makeBurstDetector(histLen){
    const history = [];
    const BURST_THRESHOLD = 0.45;   // fraction of mean to count as "fast"

    function push(iv, profileMean){
      history.push({ iv, mean: profileMean });
      if(history.length > histLen) history.shift();
    }

    function detect(){
      if(history.length < 4) return [];
      const bursts = [];
      let i = 0;
      while(i < history.length){
        const { iv, mean } = history[i];
        if(iv < mean * BURST_THRESHOLD){
          let end = i;
          while(end < history.length && history[end].iv < history[end].mean * BURST_THRESHOLD) end++;
          if(end - i >= 2){
            const intensity = 1 - (history.slice(i, end).reduce((s, h) => s + h.iv / h.mean, 0) / (end - i));
            bursts.push({ position: i / history.length, speed: 1 / (end - i), intensity: Math.min(1, intensity * 2) });
          }
          i = end;
        } else { i++; }
      }
      return bursts;
    }

    function reset(){ history.length = 0; }
    return { push, detect, reset };
  }

  // ── RadarComputer ─────────────────────────────────────────────────────
  // Maps spectral metrics + timing stats to the 6 Cognitive Radar axes.
  // All output values are in [0, 1].
  function computeRadar(spectral, intervals, profileMean, burstPatterns){
    const half = intervals.length / 2;
    if(half < 1) return { processing:0, latency:0, throughput:0, coherence:0, efficiency:0, stochasticity:0 };

    // mean and coefficient of variation of recent intervals
    let sum = 0, sum2 = 0;
    for(const iv of intervals){ sum += iv; sum2 += iv * iv; }
    const n      = intervals.length;
    const mean   = sum / n;
    const variance = (sum2 / n) - (mean * mean);
    const stdDev = Math.sqrt(Math.max(0, variance));
    const cv     = stdDev / (mean || 1);   // coefficient of variation

    // Pause fraction: how many intervals are >3× the profile mean
    const pauseCount = intervals.filter(iv => iv > profileMean * 3).length;
    const pauseFrac  = pauseCount / n;

    const { domFreq, bandwidth, complexity } = spectral;

    // Processing: high token rate → high processing score
    const processing   = Math.min(1, profileMean / Math.max(1, mean));
    // Latency: inverse of mean interval (fast = high latency score here means low latency)
    const latency      = 1 - Math.min(1, mean / (profileMean * 2));
    // Throughput: sustained rate (penalised by pauses)
    const throughput   = Math.max(0, processing * (1 - pauseFrac));
    // Coherence: rhythmic regularity; low CV = high coherence
    const coherence    = Math.max(0, 1 - Math.min(1, cv * 1.5));
    // Efficiency: signal energy vs pause energy (non-pause intervals / total)
    const efficiency   = 1 - pauseFrac;
    // Stochasticity: measured non-determinism via spectral complexity + CV
    const stochasticity= Math.min(1, (complexity * 0.6 + Math.min(1, cv) * 0.4));

    return { processing, latency, throughput, coherence, efficiency, stochasticity };
  }

  // ── HealthAggregator ──────────────────────────────────────────────────
  // Single composite health score (0-100) with exponential moving average.
  function makeHealth(){
    let health = 50;
    const a = CFG.SPECTRAL.HEALTH_ALPHA;
    function update(radar, spectral){
      const raw = (
        radar.coherence   * 30 +
        radar.efficiency  * 25 +
        radar.throughput  * 20 +
        (1 - spectral.complexity) * 15 +
        radar.processing  * 10
      );
      health = health + a * (raw - health);
      return health;
    }
    function get(){ return health; }
    function reset(){ health = 50; }
    return { update, get, reset };
  }

  // ── TokenWordGenerator ────────────────────────────────────────────────
  // Maps each token-fire event to a word drawn from the vocabulary,
  // maintaining a rolling display buffer for the renderer.
  function makeWordGen(rand){
    const vocab = CFG.TOKEN_VOCAB;
    const HIST  = CFG.TOKEN_STREAM.HISTORY;
    const stream = [];   // [{word, isBurst, age}]  age increments each tick
    let   vocabIdx = Math.floor(rand() * vocab.length);

    function nextWord(){ vocabIdx = (vocabIdx + 1) % vocab.length; return vocab[vocabIdx]; }

    function push(isBurst){
      stream.push({ word: nextWord(), isBurst, age: 0 });
      if(stream.length > HIST) stream.shift();
    }

    function tick(dtMs){
      // age all existing tokens (visual fade is driven by position, not age,
      // but we keep age for potential future use)
      for(const t of stream) t.age += dtMs;
    }

    function get(){ return stream; }
    function reset(){ stream.length = 0; vocabIdx = 0; }
    return { push, tick, get, reset };
  }

  // ── Engine factory ────────────────────────────────────────────────────
  function create(profileKey){
    const rand    = prng(Date.now() & 0xFFFF);
    let profile   = CFG.PROFILES[profileKey] || CFG.PROFILES[CFG.DEFAULT_PROFILE];
    const sim     = makeSimulator(profile, rand);
    const spectral= makeSpectral();
    const bursts  = makeBurstDetector(SP.HISTORY_LEN);
    const health  = makeHealth();
    const words   = makeWordGen(rand);

    // Rolling interval history (for radar computation)
    const intervalHistory = [];
    const HIST = SP.HISTORY_LEN;

    // Current signature (updated by tick)
    let signature = _emptySignature(profile);

    function _emptySignature(p){
      return {
        timing_pattern: { mean_interval: p.mean_ms, std_interval: p.std_ms, rhythm_pattern: [], burst_patterns: [] },
        semantic_density:  0,
        confidence_flow:   0.5,
        energy_density:    0,
        resonance_potential: 0,
        radar: { processing:0, latency:0, throughput:0, coherence:0, efficiency:0, stochasticity:0 },
        health: 50,
        energy_type: p.energy_type,
        color: p.color,
        dim_color: p.dim_color,
        mag: new Float32Array(CFG.SPECTRAL.FFT_SIZE / 2),
        profile_label: p.label,
      };
    }

    function tick(dtMs){
      const dtVirtual = dtMs * CFG.SIM_SPEED;
      const fired = sim.advance(dtVirtual);
      words.tick(dtMs);
      fired.forEach(iv => {
        spectral.push(iv);
        bursts.push(iv, profile.mean_ms);
        intervalHistory.push(iv);
        if(intervalHistory.length > HIST) intervalHistory.shift();
        // word stream: classify as burst if interval < 45% of profile mean
        const isBurst = iv < profile.mean_ms * 0.45;
        words.push(isBurst);
      });
      if(spectral.getCount() < 4) return;

      const sp      = spectral.metrics();
      const recent  = intervalHistory.slice(-32);
      const radar   = computeRadar(sp, recent, profile.mean_ms, []);
      const hp      = health.update(radar, sp);
      const bpats   = bursts.detect();

      // Semantic density: inverse complexity (lower complexity = denser meaning)
      const semantic_density = Math.max(0, 1 - sp.complexity * 0.8);
      // Confidence flow: coherence smoothed
      const confidence_flow  = radar.coherence;
      // Energy density: throughput × (1 - pause fraction approximation)
      const energy_density   = radar.throughput;
      // Resonance potential: harmonic richness of the spectrum
      const resonance_potential = sp.domFreq * (1 - sp.bandwidth) * (1 + sp.complexity * 0.5);

      // Mean / std of recent intervals for the timing pattern
      let s = 0, s2 = 0;
      for(const iv of recent){ s += iv; s2 += iv * iv; }
      const mn = s / (recent.length || 1);
      const st = Math.sqrt(Math.max(0, s2 / (recent.length || 1) - mn * mn));

      signature = {
        timing_pattern: {
          mean_interval:  mn,
          std_interval:   st,
          rhythm_pattern: Array.from(sp.mag.slice(0, 16)),
          burst_patterns: bpats,
        },
        semantic_density,
        confidence_flow,
        energy_density,
        resonance_potential,
        radar,
        health: hp,
        energy_type:  profile.energy_type,
        color:        profile.color,
        dim_color:    profile.dim_color,
        glow:         profile.glow,
        mag:          sp.mag,
        profile_label:profile.label,
        token_stream: words.get().slice(),
      };
    }

    function getSignature(){ return signature; }

    function setProfile(key){
      const p = CFG.PROFILES[key];
      if(!p) return;
      profile = p;
      sim.reset(); words.reset();
      signature = _emptySignature(p);
    }

    function reset(){
      sim.reset(); spectral.reset(); bursts.reset(); health.reset(); words.reset();
      intervalHistory.length = 0;
      signature = _emptySignature(profile);
    }

    return { tick, getSignature, setProfile, reset };
  }

  RESONANCE.Engine = { create };
})();
