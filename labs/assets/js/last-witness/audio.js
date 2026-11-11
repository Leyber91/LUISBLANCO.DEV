/* ============================================================
   last-witness/audio.js — a generated soundscape. WebAudio only,
   no files. Silent until the visitor turns it on.

   Layers
     bed       two low sines a fifth apart and filtered noise; the
               filter opens with the clock ratio during the crossing
     pulse     a soft low thump; the pilot's heart in the planner,
               slowed to the rate home hears it after the return
     carrier   TALLY's voice tone: the ship's carrier as home received
               it, when that frequency is audible (20 Hz to 16 kHz);
               otherwise folded by octaves into range, and the page
               says so
     ping      a glass tone for log events and the anomaly
   ============================================================ */

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.nodes = {};
    this.carrierHz = 440;
    this.folded = 0;
  }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this._build();
    }
    await this.ctx.resume();
    this.on = true;
    this._ramp(this.nodes.master.gain, 0.9, 1.2);
    return true;
  }

  disable() {
    if (!this.ctx) return;
    this.on = false;
    this._ramp(this.nodes.master.gain, 0, 0.4);
  }

  _ramp(param, v, s) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(v, t + s);
  }

  _build() {
    const c = this.ctx;
    const master = c.createGain(); master.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    master.connect(comp).connect(c.destination);

    const bed = c.createGain(); bed.gain.value = 0.16; bed.connect(master);
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.4;
    const o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110.3;
    const g3 = c.createGain(); g3.gain.value = 0.18;
    o1.connect(bed); o2.connect(bed); o3.connect(g3).connect(bed);

    // filtered noise: the hiss of a receiver with nothing on it
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = 0.97 * last + 0.03 * (Math.random() * 2 - 1); d[i] = last * 3; }
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.22;
    noise.connect(lp).connect(ng).connect(master);

    // slow movement in the bed
    const lfo = c.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = c.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG).connect(lp.frequency);

    const carrier = c.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = 440;
    const cg = c.createGain(); cg.gain.value = 0;
    const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.Q.value = 3;
    carrier.connect(cf).connect(cg).connect(master);

    [o1, o2, o3, noise, lfo, carrier].forEach((n) => n.start());
    this.nodes = { master, bed, lp, ng, carrier, cg, cf };
  }

  /* 0..1 intensity of the crossing: opens the filter, lifts the bed. */
  crossing(x) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.nodes.lp.frequency.setTargetAtTime(320 + 2600 * x * x, t, 0.2);
    this.nodes.bed.gain.setTargetAtTime(0.16 + 0.12 * x, t, 0.3);
    this.nodes.ng.gain.setTargetAtTime(0.22 + 0.25 * x, t, 0.3);
  }

  /* The carrier as home hears it. Fold into the audible band by octaves. */
  setCarrier(hz) {
    let f = hz, folds = 0;
    while (f > 16000) { f /= 2; folds++; }
    while (f < 40) { f *= 2; folds--; }
    this.carrierHz = f; this.folded = folds;
    if (this.ctx) { this.nodes.carrier.frequency.value = f; this.nodes.cf.frequency.value = f; }
    return { audibleHz: f, folds, exact: folds === 0 };
  }

  /* TALLY speaks: the carrier swells under its words. */
  voice(seconds = 2) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, g = this.nodes.cg.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.05, t + 0.25);
    g.setTargetAtTime(0.0, t + Math.max(0.6, seconds), 0.5);
  }

  /* The home tone follows the clock rate: f = 110 Hz x 2^(log10(rate) / 1.5),
     one octave for every factor of about 32 in dt/dtau, capped at 1760 Hz.
     During the crossing you hear home speed up. */
  home(rate) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.nodes.ho) {
      const o = c.createOscillator(); o.type = 'triangle';
      const g = c.createGain(); g.gain.value = 0;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      o.connect(f).connect(g).connect(this.nodes.master); o.start();
      this.nodes.ho = o; this.nodes.hg = g;
    }
    const hz = Math.min(1760, 110 * Math.pow(2, Math.log10(Math.max(1, rate)) / 1.5));
    const t = c.currentTime;
    this.nodes.ho.frequency.setTargetAtTime(hz, t, 0.15);
    this.nodes.hg.gain.setTargetAtTime(rate > 1.01 ? 0.035 : 0, t, 0.3);
  }

  homeOff() { if (this.nodes.hg) this.nodes.hg.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); }

  /* TALLY's timbre follows its mood: the carrier's filter and an added
     fifth. guarded and withdrawn are narrow and bare; open adds width;
     warm adds the fifth; grieving drops an octave. */
  mood(m) {
    if (!this.ctx) return;
    const T = { withdrawn: [14, 0, 1], guarded: [9, 0, 1], measuring: [6, 0, 1], open: [3, 0, 1], warm: [2, 0.6, 1], grieving: [5, 0.25, 0.5] }[m] || [6, 0, 1];
    const c = this.ctx, t = c.currentTime;
    this.nodes.cf.Q.setTargetAtTime(T[0], t, 0.4);
    this.nodes.carrier.frequency.setTargetAtTime(this.carrierHz * T[2], t, 0.4);
    if (!this.nodes.fifth) {
      const o = c.createOscillator(); o.type = 'sine';
      const g = c.createGain(); g.gain.value = 0;
      o.connect(g).connect(this.nodes.cg); o.start();
      this.nodes.fifth = o; this.nodes.fg = g;
    }
    this.nodes.fifth.frequency.setTargetAtTime(this.carrierHz * T[2] * 1.5, t, 0.4);
    this.nodes.fg.gain.setTargetAtTime(T[1], t, 0.4);
    this.timbre = m;
  }

  thump(gain = 0.5) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(68, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
    o.connect(g).connect(this.nodes.master); o.start(t); o.stop(t + 0.5);
  }

  ping(freq = 1320, gain = 0.12) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    [1, 2.76, 5.4].forEach((m, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * m;
      const g = c.createGain(); g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain / (i + 1), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6 / (i + 1));
      o.connect(g).connect(this.nodes.master); o.start(t); o.stop(t + 1.8);
    });
  }
}
