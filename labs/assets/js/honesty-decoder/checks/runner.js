/* ============================================================
   honesty-decoder/checks/runner.js — runs every check against the
   deployed lab files, in this browser, and reports each result.

   Four kinds of check, all same-origin, none calls a model:
     code     fetch the cited file, find every anchor (and confirm every
              'absent' string is missing); records line, SHA-256, commit
     shared   the same for a shared component, once for all its users
     probe    a per-lab module in checks/labs/<id>.js: loads the lab in a
              hidden frame and reads a value, or imports the lab's own
              module and compares it with a published reference
     self     the decoder measuring its own rows

   Each result: { status: 'pass'|'fail'|'error', verdict?, detail,
   ms, ts, file?, line?, sha?, commit?, changed? }. 'fail' means the
   evidence is gone or the reference disagrees beyond tolerance;
   'error' means the check could not run (no WebGL, a timeout).
   Events: 'start' and 'result' with { key, row, sub, what, fails }.
   ============================================================ */

import { PROBE_TIMEOUT_MS } from '../config.js';

const LAB_MODULES = {
  'black-hole': () => import('./labs/black-hole.js'),
  dimensional: () => import('./labs/dimensional.js'),
  exomania: () => import('./labs/exomania.js'),
  heptapod: () => import('./labs/heptapod.js'),
  'alt-reality': () => import('./labs/alt-reality.js'),
  'the-figure': () => import('./labs/the-figure.js'),
  'primordial-seed': () => import('./labs/primordial-seed.js'),
  'token-ekg': () => import('./labs/token-ekg.js'),
  dataspace: () => import('./labs/dataspace.js'),
  'honesty-decoder': () => import('./labs/honesty-decoder.js'),
  roaster: () => import('./labs/roaster.js'),
  'workout-plans': () => import('./labs/workout-plans.js'),
  memes: () => import('./labs/memes.js'),
  trends: () => import('./labs/trends.js'),
};

const SITE_ROOT = new URL('../../../../../', import.meta.url); // the repository root as served
const LABS_ROOT = new URL('labs/', SITE_ROOT);
export const fileURL = (f) => new URL(f, SITE_ROOT).href;
export const labURL = (page) => new URL(page, LABS_ROOT).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
const lineOf = (text, anchor) => {
  const i = text.indexOf(anchor);
  return i < 0 ? null : text.slice(0, i).split('\n').length;
};

export class Runner extends EventTarget {
  constructor({ rows, shared, snapshot, self }) {
    super();
    this.rows = rows;
    this.shared = shared;
    this.snapshot = snapshot || { files: {} };
    this.self = self; // () => app state for self probes
    this.results = {};
    this.files = new Map();
    this.frames = [];
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  /* ---------- files ---------- */
  fetchFile(f, fresh = false) {
    if (!fresh && this.files.has(f)) return this.files.get(f);
    const p = (async () => {
      const t0 = performance.now();
      const r = await fetch(fileURL(f), { cache: fresh ? 'reload' : 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${f}`);
      const text = (await r.text()).replace(/\r\n?/g, '\n');
      const sha = await sha256(text);
      const snap = this.snapshot.files?.[f];
      const commit = snap && snap.sha256 && sha === snap.sha256 ? snap.commit : null;
      return { text, sha, commit, snapCommit: snap?.commit || null, changed: !!(snap && sha && snap.sha256 && sha !== snap.sha256), ms: performance.now() - t0 };
    })();
    this.files.set(f, p);
    p.catch(() => this.files.delete(f));
    return p;
  }

  /* ---------- hidden frames ---------- */
  async frame(page, { ready, timeout = PROBE_TIMEOUT_MS, w = 800, h = 520 } = {}) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.title = 'decoder check frame';
    f.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;border:0;pointer-events:none;`;
    f.src = labURL(page);
    document.body.appendChild(f);
    this.frames.push(f);
    // the checked values are set when the lab's scripts run; waiting for the
    // load event would also wait for its web fonts, so poll from the start
    const live = () => (f.contentWindow && f.contentWindow.location.href !== 'about:blank' ? f.contentDocument : null);
    const api = {
      get win() { return f.contentWindow; },
      get doc() { return live(); },
      $: (s) => live()?.querySelector(s) || null,
      $$: (s) => [...(live()?.querySelectorAll(s) || [])],
      text: (s) => (live()?.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(),
      count: (s) => live()?.querySelectorAll(s).length || 0,
      wait: async (cond, ms = timeout) => {
        const end = performance.now() + ms;
        while (performance.now() < end) {
          try { if (live()) { const v = cond(api); if (v) return v; } } catch { /* not yet */ }
          await sleep(60);
        }
        return null;
      },
      dispose: () => { f.remove(); this.frames = this.frames.filter((x) => x !== f); },
    };
    const ok = await api.wait(ready || (() => live()?.readyState !== 'loading'), timeout);
    if (!ok) { api.dispose(); throw new Error(`the lab did not reach its checked state within ${Math.round(timeout / 1000)} s`); }
    return api;
  }

  disposeFrames() { this.frames.forEach((f) => f.remove()); this.frames = []; }

  /* ---------- one check ---------- */
  async codeCheck(ev, absent = []) {
    const lines = [];
    let commit = null, changed = false, sha = null, file = null;
    for (const [f, a] of ev) {
      const x = await this.fetchFile(f);
      const line = lineOf(x.text, a);
      file = file || f; sha = sha || x.sha; commit = commit || x.commit; changed = changed || x.changed;
      if (line == null) return { status: 'fail', detail: `not found in ${f}: "${a.slice(0, 70)}"`, file: f, sha: x.sha, commit: x.commit, changed: x.changed };
      lines.push({ f, a, line, commit: x.commit, snapCommit: x.snapCommit, changed: x.changed });
    }
    for (const [f, a] of absent) {
      const x = await this.fetchFile(f);
      if (x.text.includes(a)) return { status: 'fail', detail: `"${a}" now appears in ${f}`, file: f };
      lines.push({ f, a, line: null, absent: true, commit: x.commit, snapCommit: x.snapCommit, changed: x.changed });
    }
    const first = lines[0];
    return {
      status: 'pass', lines, file: first?.f, line: first?.line, sha, commit, changed,
      detail: lines.map((l) => (l.absent ? `${l.f}: "${l.a}" absent` : `${l.f}:${l.line}`)).join(' · '),
    };
  }

  async run(key, job) {
    const t0 = performance.now();
    this.results[key] = { status: 'pending', ts: Date.now() };
    this.emit('start', { key, ...job.meta });
    let res;
    try { res = await job.fn(); }
    catch (e) { res = { status: 'error', detail: String(e.message || e) }; }
    res = { ...res, ms: Math.round(performance.now() - t0), ts: Date.now() };
    this.results[key] = res;
    this.emit('result', { key, result: res, ...job.meta });
    return res;
  }

  /* All jobs, in the order a visitor should watch them resolve. */
  jobs({ heavy = true, only = null } = {}) {
    const out = [];
    for (const [id, c] of Object.entries(this.shared)) {
      if (only && !this.rows.find((r) => r.id === only)?.subs.some((s) => s.shared === id)) continue;
      out.push({ key: `shared:${id}`, meta: { row: null, sub: null, kind: 'shared', what: `${c.name}: ${c.text}`, fails: 'fails if a cited line is gone' },
        fn: () => this.codeCheck(c.ev) });
    }
    const rows = only ? this.rows.filter((r) => r.id === only) : this.rows;
    for (const row of rows) {
      for (const sub of row.subs) {
        if (sub.type === 'framing' || sub.basis === 'author' || sub.basis === 'inspection') continue;
        if ((sub.ev && sub.ev.length) || (sub.absent && sub.absent.length)) {
          const f = sub.ev?.[0]?.[0] || sub.absent?.[0]?.[0];
          out.push({ key: `${sub.id}#code`, meta: { row: row.id, sub: sub.id, kind: 'code',
            what: `fetching ${f.replace(/^labs\//, '')}: looking for the cited line${(sub.ev?.length || 0) > 1 ? 's' : ''}`,
            fails: 'fails if any cited line is gone from the deployed file' },
          fn: () => this.codeCheck(sub.ev || [], sub.absent || []) });
        }
      }
    }
    const probes = [];
    for (const row of rows) {
      for (const sub of row.subs) {
        if (!sub.probe) continue;
        probes.push({ row, sub });
      }
    }
    for (const { row, sub } of probes) {
      out.push({ key: `${sub.id}#probe`, meta: { row: row.id, sub: sub.id, kind: 'probe', probe: sub.probe, what: '', fails: '' },
        probe: true,
        fn: async () => {
          const mod = await LAB_MODULES[row.id]?.();
          const p = mod?.PROBES?.[sub.probe];
          if (!p) return { status: 'error', detail: `no probe ${sub.probe}` };
          if ((p.heavy && !heavy) || (p.onDemand && !only)) return { status: 'skipped', detail: p.onDemand ? 'deep check: runs when this lab is selected (it loads its libraries from two CDNs)' : 'deep check: runs on a wide screen, or when this lab is selected' };
          const ctx = { runner: this, frame: (page, o) => this.frame(page, o), file: (f) => this.fetchFile(f), self: this.self, row, sub };
          try { return await p.run(ctx); }
          finally { this.disposeFrames(); }
        } });
    }
    // self checks last: they read the other results
    out.sort((a, b) => (a.meta.row === 'honesty-decoder' && a.probe ? 1 : 0) - (b.meta.row === 'honesty-decoder' && b.probe ? 1 : 0));
    return out;
  }

  /* Probe metadata (caption text) without running anything. */
  static async describe(rowId, probeId) {
    const mod = await LAB_MODULES[rowId]?.();
    return mod?.PROBES?.[probeId] || null;
  }

  async runAll(opts = {}) {
    const jobs = this.jobs(opts);
    // code checks fetch in parallel (small files, same origin); probes run one by one
    const code = jobs.filter((j) => !j.probe);
    const probes = jobs.filter((j) => j.probe);
    const pool = 4;
    let i = 0;
    await Promise.all(Array.from({ length: pool }, async () => { while (i < code.length) { const j = code[i++]; await this.run(j.key, j); } }));
    for (const j of probes) {
      if (j.meta.probe) {
        const d = await Runner.describe(j.meta.row, j.meta.probe);
        if (d) { j.meta.what = d.what; j.meta.fails = d.fails; }
      }
      await this.run(j.key, j);
    }
    this.emit('done', { results: this.results });
    return this.results;
  }
}
