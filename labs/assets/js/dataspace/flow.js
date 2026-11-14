/* ============================================================
   dataspace/flow.js — the run flow: one state machine that makes
   every model call and every fallback for DATASPACE.

   States, in one place:
     idle            nothing running
     compressing     one call writes the capsule(s), every requested level in one JSON reply
     waiting         the public route allows one reply per 45 s per IP; the flow waits in the open, with a countdown
     reconstructing  one call per capsule; its payload holds the rebuild prompt and that capsule, nothing else
     scored          a run finished and was handed to the page
     failed          a call failed with no usable result; the reason is kept

   A sweep is one compress call for all five levels, then five rebuild calls. On the public route the rebuilds queue
   45 s apart, so a sweep takes about four to five minutes and every reply in it is live. When no route answers the
   compress call, the offline engine writes extractive capsules at the same word budgets; those runs are labelled
   engine, and no fidelity is claimed for a model. When a rebuild fails, the run keeps its live capsule and says the
   rebuild did not run.

   The model client is injected (labs/assets/js/ai/llm.js in the page, a stub in tests). No DOM.
   ============================================================ */

import { PROMPTS, PUBLIC_WINDOW_S, CACHED_MS, LIMITS, TIMERS, budgetFor, wordCount } from './config.js';

export const STATES = ['idle', 'compressing', 'waiting', 'reconstructing', 'scored', 'failed'];
const NEXT = {
  idle: ['compressing', 'waiting', 'reconstructing'],
  compressing: ['waiting', 'reconstructing', 'scored', 'failed', 'idle'],
  waiting: ['reconstructing', 'compressing', 'failed', 'idle'],
  reconstructing: ['scored', 'failed', 'idle'],
  scored: ['compressing', 'waiting', 'reconstructing', 'idle'],
  failed: ['compressing', 'waiting', 'reconstructing', 'idle'],
};

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

const newSeed = () => Math.floor(Math.random() * 2147483646) + 1;

/** Parse a compress reply into { level: capsule } for the requested levels; missing or empty levels are left out. */
export function parseCapsules(json, levels) {
  const out = {};
  if (!json || typeof json !== 'object') return out;
  for (const l of levels) {
    let v = json['L' + l];
    if (v && typeof v === 'object') v = v.capsule ?? v.text ?? JSON.stringify(v);
    if (typeof v === 'string' && v.trim()) out[l] = v.trim().slice(0, LIMITS.capsuleChars);
  }
  return out;
}

export class RunFlow {
  /**
   * llm: { complete(req), status(), publicReadyIn() }
   * engine: { capsule(source, words) -> string }  the offline extractive compressor
   * onState(state, detail), onRun(run)
   */
  constructor({ llm, engine, onState = () => {}, onRun = () => {}, onCapsule = () => {} }) {
    this.llm = llm;
    this.engine = engine;
    this.onState = onState;
    this.onRun = onRun;
    this.onCapsule = onCapsule;   // a live capsule arrived; its rebuild is next
    this.state = 'idle';
    this.ctrl = null;
    this.serial = 0;
  }

  set(state, detail = {}) {
    if (state !== this.state && !NEXT[this.state].includes(state)) console.warn(`dataspace flow: ${this.state} -> ${state}`);
    this.state = state;
    this.detail = detail;
    this.onState(state, detail);
  }

  busy() { return !['idle', 'scored', 'failed'].includes(this.state); }

  cancel() { this.ctrl?.abort(); }

  /** Wait in the open while the public window is closed. */
  async waitWindow(signal, detail) {
    if (this.llm.status().route !== 'pollinations') return;
    let s = this.llm.publicReadyIn();
    while (s > 0) {
      this.set('waiting', { ...detail, readyIn: s, window: PUBLIC_WINDOW_S });
      await sleep(Math.min(TIMERS.countdownTick, s * 1000), signal);
      s = this.llm.publicReadyIn();
    }
  }

  callInfo(req, r) {
    const pub = r.source === 'pollinations';
    return {
      route: r.source, model: r.model, ms: r.ms, seed: req.seed,
      system: req.system + (req.json ? '\n\nReply with one JSON object and nothing else.' : ''), user: req.prompt,
      raw: r.text, usage: r.usage || null, errors: r.errors || [],
      cached: pub && r.ms < CACHED_MS ? 'possible' : 'no',
      at: new Date().toISOString(),
    };
  }

  /**
   * Compress the source at the given levels, then rebuild each capsule in its own call.
   * opts: { source, levels: [ids], repeats: 1..3, preset: id|null }
   */
  async collapse({ source, levels, repeats = 1, preset = null }) {
    if (this.busy()) return;
    this.ctrl = new AbortController();
    const signal = this.ctrl.signal;
    const sent = source.slice(0, LIMITS.sourceChars);
    const words = wordCount(sent);
    const budgets = levels.map((l) => ({ level: l, words: budgetFor(words, l) }));
    try {
      for (let rep = 1; rep <= repeats; rep++) {
        const seed = newSeed();
        const base = { rep, repeats, levels };
        await this.waitWindow(signal, { ...base, next: 'compress' });
        this.set('compressing', base);
        const creq = {
          system: PROMPTS.compressSystem, prompt: PROMPTS.compressUser(sent, budgets), json: true, seed,
          temperature: PROMPTS.temperature, signal, maxWaitMs: 60000,
          fallback: () => Object.fromEntries(budgets.map((b) => ['L' + b.level, this.engine.capsule(sent, b.words)])),
        };
        const cr = await this.llm.complete(creq);
        const compress = this.callInfo(creq, cr);
        const engine = cr.source === 'offline';
        const caps = parseCapsules(cr.json, levels);
        for (const b of budgets) {
          const id = `live.${++this.serial}`;
          const run = {
            id, kind: engine ? 'engine' : 'live', preset, level: b.level, budgetWords: b.words,
            source: sent, sourceCut: source.length > sent.length ? source.length : 0,
            capsule: caps[b.level] ?? null, rebuild: null, status: 'pending', note: '',
            provenance: { route: cr.source, model: engine ? 'offline engine (extractive)' : cr.model, date: compress.at,
              promptVersion: PROMPTS.version, seed, temperature: PROMPTS.temperature, repeat: rep, compress, rebuild: null },
          };
          if (engine) {
            run.status = 'engine';
            run.note = 'No live run happened: no model route answered the compress call. This capsule is the offline ' +
              'engine\'s extractive pick at the same word budget, scored as written, with no decoder.';
            this.set('scored', { ...base, run: id });
            this.onRun(run);
            continue;
          }
          if (!run.capsule) {
            run.status = 'failed';
            run.note = `The compress reply held no capsule for L${b.level}.`;
            this.set('failed', { ...base, run: id, reason: run.note });
            this.onRun(run);
            continue;
          }
          this.onCapsule(run);
          await this.rebuildInto(run, signal, base);
        }
      }
      this.set('idle');
    } catch (e) {
      if (e.name === 'AbortError') this.set('idle', { cancelled: true });
      else this.set('failed', { reason: String(e.message || e) });
    } finally {
      this.ctrl = null;
    }
  }

  async rebuildInto(run, signal, base) {
    await this.waitWindow(signal, { ...base, level: run.level, next: 'rebuild' });
    this.set('reconstructing', { ...base, level: run.level, run: run.id });
    const rreq = {
      system: PROMPTS.rebuildSystem, prompt: PROMPTS.rebuildUser(run.capsule), json: false,
      seed: run.provenance.seed, temperature: PROMPTS.temperature, signal, maxWaitMs: 60000,
      fallback: () => '',
    };
    const rr = await this.llm.complete(rreq);
    const info = this.callInfo(rreq, rr);
    run.provenance.rebuild = info;
    if (rr.source === 'offline' || !rr.text.trim()) {
      run.status = 'partial';
      run.note = 'The capsule is live; its rebuild did not run (' + (info.errors.slice(-1)[0] || 'no route answered') +
        '). Only the capsule itself is scored. Rebuild it again when the route is ready.';
      this.set('failed', { ...base, run: run.id, reason: run.note });
    } else {
      run.rebuild = rr.text.trim();
      run.status = 'scored';
      this.set('scored', { ...base, run: run.id });
    }
    this.onRun(run);
  }

  /** Rebuild a capsule the visitor edited by hand: one call, the capsule and nothing else. */
  async rebuildOnly({ source, capsule, level, budgetWords, preset = null, parent = null }) {
    if (this.busy()) return;
    this.ctrl = new AbortController();
    const seed = newSeed();
    const route = this.llm.status();
    const run = {
      id: `live.${++this.serial}`, kind: 'live', preset, level, budgetWords, source, sourceCut: 0,
      capsule: String(capsule).slice(0, LIMITS.capsuleChars), rebuild: null, status: 'pending', parent,
      note: 'Capsule edited by hand; only the rebuild ran.',
      provenance: { route: route.route, model: route.model, date: new Date().toISOString(), promptVersion: PROMPTS.version,
        seed, temperature: PROMPTS.temperature, repeat: 1, compress: null, rebuild: null, edited: true },
    };
    try {
      this.onCapsule(run);
      await this.rebuildInto(run, this.ctrl.signal, { rep: 1, repeats: 1, levels: [level] });
      if (run.provenance.rebuild) { run.provenance.route = run.provenance.rebuild.route; run.provenance.model = run.provenance.rebuild.model; }
      this.set('idle');
    } catch (e) {
      this.set('idle', { cancelled: e.name === 'AbortError' });
    } finally { this.ctrl = null; }
  }

  /** The model's prior: a rebuild from an empty capsule. One call. Returns { model, route, text, at } or null. */
  async prior() {
    if (this.busy()) return null;
    this.ctrl = new AbortController();
    try {
      await this.waitWindow(this.ctrl.signal, { next: 'prior' });
      this.set('reconstructing', { prior: true });
      const req = { system: PROMPTS.rebuildSystem, prompt: PROMPTS.rebuildUser(''), json: false, seed: newSeed(),
        temperature: PROMPTS.temperature, signal: this.ctrl.signal, maxWaitMs: 60000, fallback: () => '' };
      const r = await this.llm.complete(req);
      this.set('idle');
      if (r.source === 'offline' || !r.text.trim()) return null;
      return { model: r.model, route: r.source, text: r.text.trim(), at: new Date().toISOString(), call: this.callInfo(req, r) };
    } catch {
      this.set('idle');
      return null;
    } finally { this.ctrl = null; }
  }
}
