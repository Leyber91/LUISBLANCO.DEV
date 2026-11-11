/* ============================================================
   trending/Trending.js — the controller. Holds the page state
   (sources, score mode, age window, view, filters, selection, terms),
   runs scans through engine.js, stores them through history.js, asks
   the model once per scan through ReasoningService.js, and redraws
   every view from one model object built in build().

   URL: every state change is written with history.replaceState, and
   ?scan=<sources> starts a live scan on load. ?demo loads the recorded
   scan; ?fixture adds the recorded model reply with two planted faults.
   ============================================================ */

import { SOURCES, SOURCE_ORDER, TUNING, SCORE_MODES, AGE_WINDOWS, PARAMS, SEL, COPY } from './constants.js';
import { $, el, clear, utc, kb, download, clock } from './dom.js';
import { runScan, gatherEvidence } from './engine.js';
import { rank, trajectory, measuredRate, ownPace, acceleration, median, scoreItem, cusum } from './score.js';
import { History, hydrate, diffScans, ranksOf } from './history.js';
import { pairsFromScans, pairsFromStoredWiki, summarize, deciles, probabilityFor, revisit } from './verify.js';
import { factsFor, reconcile, engineReply, buildRequest, factCheck, num, scanFactsOf, parseReply } from './explain.js';
import { ReasoningService } from './ReasoningService.js';
import { FieldView, trailOf } from './field.js';
import * as V from './views.js';
import { ARCHIVE } from './archive.data.js';
import { FIXTURE } from './fixtures.js';
import { parseTerms, lookupTerms, drawLookup } from './lookup.js';
import { Ledger } from './net.js';
import { clusterTopics } from './topics.js';
import { restingInputs } from './inputs.js';
import { LLM } from '../ai/llm.js';
import { mountRoutePanel } from '../ai/route-panel.js';

const keyOf = (it) => `${it.id}|${it.src}`;
const perOf = (src) => (SOURCES[src].kind === 'code' ? 24 : 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* decile tables from the archive carry edges, not a function */
const withBin = (d) => (d && !d.tooFew && d.edges ? { ...d, bin: (x) => { let b = 0; while (b < 9 && x > d.edges[b]) b++; return b; } } : d);

export class Trending {
  constructor() {
    this.history = new History();
    this.reasoning = new ReasoningService();
    this.s = { enabled: new Set(SOURCE_ORDER.filter((s) => SOURCES[s].defaultOn)), mode: 'lower', win: 'all', view: 'items', only: '', cause: '', sel: null, terms: [] };
    this.current = null;
    this.origin = 'recorded';
    this.explain = null;
    this.stages = {};
    this.sourceState = {};
    this.pick = [];
    this.scanning = false;
    this.thinking = false;
    this.ctrl = null;
    this.lastScanSources = null;
    this.verifyCache = null;
    this.fixture = null;
    this.trailIndex = new Map();
    for (const s of ARCHIVE.trail || []) {
      for (const [src, o] of Object.entries(s.obs)) {
        for (const [id, c] of o.c) {
          const k = `${id}|${src}`;
          if (!this.trailIndex.has(k)) this.trailIndex.set(k, []);
          this.trailIndex.get(k).push({ t: o.at, c });
        }
      }
    }
    this.archiveScan = { ...hydrate(ARCHIVE.latest), origin: 'recorded' };
  }

  /* ---------------- boot ---------------- */
  init() {
    this.n = {};
    for (const [k, sel] of Object.entries(SEL)) this.n[k] = $(sel);
    mountRoutePanel(this.n.route);
    this.field = new FieldView(this.n.field, {
      onSelect: (k, o) => this.select(k, o),
      onOpen: (k, node) => this.open(k, node),
    });
    this.scrub = el('div', 'scrub');
    this.n.field.after(this.scrub);
    this._readURL();
    this._wire();

    const p = new URLSearchParams(location.search);
    if (p.has(PARAMS.fixture)) this.fixture = FIXTURE;
    this.engineOnly = p.has(PARAMS.engine);
    const latest = this.history.latest();
    if (!p.has(PARAMS.demo) && !this.fixture && latest) {
      this.current = hydrate(latest);
      this.origin = 'stored';
      this.explain = latest.explain ? { ...latest.explain, stored: true } : null;
      this.status(COPY.idleStored);
    } else {
      this.current = this.archiveScan;
      this.origin = this.fixture ? 'fixture' : 'recorded';
      this.status(COPY.idleRecorded);
    }
    if (!this.explain) this.explain = this._restingExplain();
    this._restingStages();
    this.render('ignite');
    V.renderLegend(this.n.legend);
    V.renderEvidence(this.n.evidence, { archiveNote: this._archiveNote() });
    if (this.s.terms.length) { this.n.lookupInput.value = this.s.terms.join(', '); this.lookup(this.n.lookupInput.value); }
    if (this.s.sel && p.has(PARAMS.open)) this.open(this.s.sel);
    if (p.has(PARAMS.tour)) this.startTour();
    if (p.has(PARAMS.scan)) {
      const list = (p.get(PARAMS.scan) || '').split(',').filter((x) => SOURCES[x]);
      if (list.length) this.s.enabled = new Set(list);
      this.scan();
    }
  }

  _archiveNote() {
    const r = ARCHIVE.recorded;
    return `${r.scans} scans recorded ${utc(Date.parse(r.first))} to ${utc(Date.parse(r.last))} by record.mjs with this page's own engine; Wikipedia backtests over ${['wen', 'wde', 'wes'].map((s) => ARCHIVE.verify[s]?.summary?.pairs || 0).join(', ')} days (EN, DE, ES)`;
  }

  /* An explanation for a scan at rest: the fixture, the recorded reply, or the engine. */
  _restingExplain() {
    const vs = this._viewScan();
    const { top, facts, ctxs, topics, scanFacts } = restingInputs(vs, this.s.enabled, (it) => this._earlier(it, it.t));
    if (!top.length) return null;
    const engine = engineReply(top, ctxs, topics, vs, {});
    const recorded = this.current === this.archiveScan && ARCHIVE.reply && this._defaultView();
    if (this.fixture && this._defaultView()) {
      const out = reconcile(this.fixture.reply, top, facts, engine, scanFacts);
      return { ...out, source: 'fixture', model: this.fixture.model, label: this.fixture.label, ms: 0 };
    }
    if (recorded) {
      const out = reconcile(ARCHIVE.reply.json, top, facts, engine, scanFacts);
      return { ...out, source: 'recorded', model: ARCHIVE.reply.model, label: `recorded reply · ${ARCHIVE.reply.model} · ${ARCHIVE.reply.at.slice(0, 16).replace('T', ' ')} UTC`, ms: ARCHIVE.reply.ms };
    }
    const out = reconcile(engine, top, facts, engine);
    for (const e of out.entries) { e.origin = 'engine'; e.flags = []; e.rule = engine.signals.find((s) => s.id === e.key)?.rule; }
    out.digestOrigin = 'engine';
    out.digestFlags = [];
    return { ...out, source: 'offline', model: 'deterministic', ms: 0, resting: true };
  }

  /* The recorded reply and the fixture were made for the default sources and score. */
  _defaultView() {
    return this.s.mode === 'lower' && SOURCE_ORDER.every((s) => this.s.enabled.has(s) === !!SOURCES[s].defaultOn);
  }

  _restingStages() {
    const sc = this.current;
    const ok = Object.values(sc.sources).filter((v) => v.status === 'ok').length;
    const req = Object.values(sc.sources).reduce((a, v) => a + (v.requests || 0), 0);
    const bytes = Object.values(sc.sources).reduce((a, v) => a + (v.bytes || 0), 0);
    const tag = this.origin === 'stored' ? 'stored' : 'recorded';
    this.stages = {
      request: { s: 'warn', text: `${tag}: ${req} requests` },
      fetch: { s: 'warn', text: `${ok} of ${Object.keys(sc.sources).length} sources · ${kb(bytes)}` },
      rank: { s: 'warn', text: `${sc.items.length} scored · ${(this._viewScan().topics || []).length} topics` },
      field: { s: 'warn', text: `captured ${utc(sc.t)}` },
      reason: { s: 'warn', text: this.explain?.stored ? 'stored reply' : this.explain?.source === 'fixture' ? 'test fixture' : this.explain?.source === 'recorded' ? `recorded reply · ${this.explain.model}` : 'engine at rest; scan to ask a model' },
    };
    for (const src of SOURCE_ORDER) {
      const v = sc.sources[src];
      this.sourceState[src] = v ? (v.status === 'ok' ? { s: 'stored', text: `${tag} ${utc(v.fetchedAt).slice(11, 16)}` } : { s: 'failed', text: 'failed' }) : { s: '', text: this.s.enabled.has(src) ? 'not in this scan' : 'off' };
    }
  }

  /* ---------------- the composite scan the views show ---------------- */
  _viewScan() {
    const sc = this.current;
    const have = new Set(sc.items.map((i) => i.src));
    const extra = [];
    const sources = { ...sc.sources };
    const scalers = { ...(sc.scalers || {}) };
    // a source switched on that this scan lacks: re-show its last stored result, no request
    for (const src of this.s.enabled) {
      if (have.has(src)) continue;
      const rec = this.history.previous(src, Infinity);
      const from = rec ? hydrate(rec) : this.archiveScan.items.some((i) => i.src === src) ? this.archiveScan : null;
      if (!from) continue;
      extra.push(...from.items.filter((i) => i.src === src));
      sources[src] = { ...from.sources[src], reshown: true };
      scalers[src] = from.scalers?.[src];
    }
    const items = [...sc.items, ...extra];
    const sig = `${sc.t}|${items.length}|${[...this.s.enabled].join(',')}`;
    if (this._topicSig !== sig) {
      const { topics, terms } = clusterTopics(items.filter((i) => this.s.enabled.has(i.src)));
      this._topics = topics;
      this._terms = terms;
      this._topicSig = sig;
    }
    for (const it of items) it.terms = this._terms.get(`${it.id}|${it.src}`) || it.terms || [];
    return { ...sc, items, sources, scalers, topics: this._topics };
  }

  _earlier(it, scanT) {
    const local = this.history.earlier(it.id, it.src, scanT);
    const rec = (this.trailIndex.get(keyOf(it)) || []).filter((e) => e.t < scanT);
    const all = [...rec, ...local].sort((a, b) => a.t - b.t);
    const out = [];
    for (const e of all) if (!out.length || e.t - out[out.length - 1].t > 60000) out.push(e);
    return out;
  }

  _poolMedian(src) {
    return median(this.current.items.filter((i) => i.src === src).map((i) => i.sc.rate));
  }

  _topicKeys(top) {
    const ids = new Map(top.map((it, i) => [keyOf(it), `s${i + 1}`]));
    return (this._viewScan().topics || []).map((t) => ({ label: t.label, keys: t.members.map((m) => ids.get(m)).filter(Boolean), sources: t.sources }))
      .filter((t) => t.keys.length > 1 || t.sources.length > 1).filter((t) => t.keys.length);
  }

  _verify() {
    if (this.verifyCache?.n === this.history.count()) return this.verifyCache.v;
    const scans = this.history.scans().map(hydrate);
    const local = {}, dec = {};
    for (const src of SOURCE_ORDER) {
      const pairs = SOURCES[src].kind === 'readership' ? pairsFromStoredWiki(scans, src) : pairsFromScans(scans, src);
      if (pairs.length) { local[src] = { summary: summarize(pairs) }; dec[src] = deciles(pairs); }
    }
    const archive = {};
    for (const [src, v] of Object.entries(ARCHIVE.verify || {})) archive[src] = { ...v, deciles: withBin(v.deciles) };
    const v = {
      local, localDec: dec, archive,
      archiveNote: ['wen', 'wde', 'wes'].map((s) => ARCHIVE.verify[s]?.summary).filter(Boolean).map((x, i) => `${['EN', 'DE', 'ES'][i]} ${x.span?.[0]} to ${x.span?.[1]}`).join(', ') + ', every day scored with the live method and checked against the next day.',
      recordedDay: (ARCHIVE.recorded.first || '').slice(0, 10),
    };
    this.verifyCache = { n: this.history.count(), v };
    return v;
  }

  /* ---------------- the model object every view draws from ---------------- */
  build() {
    const scan = this._viewScan();
    const enabled = this.s.enabled;
    const all = scan.items.filter((it) => enabled.has(it.src)).map((it) => {
      const key = keyOf(it);
      const traj = trajectory(it, this._earlier(it, it.t));
      const per = perOf(it.src);
      return { ...it, key, traj, measured: measuredRate(traj, per), pace: ownPace(traj, per), accel: acceleration(traj, per), burst: SOURCES[it.src].kind === 'readership' ? cusum(it.series) : null };
    });
    const { items, merged } = rank(all, this.s.mode, scan.scalers);
    // rank change since the previous stored scan of each source
    const prevRanks = {};
    for (const src of new Set(items.map((i) => i.src))) {
      const prev = this.history.previous(src, scan.sources[src]?.fetchedAt ? Math.min(scan.t, scan.sources[src].fetchedAt) : scan.t);
      if (!prev) continue;
      const nowR = ranksOf(scan, src);
      const preR = ranksOf(hydrate(prev), src);
      prevRanks[src] = { nowR, preR, prev };
    }
    const ver = this._verify();
    for (const it of items) {
      const pr = prevRanks[it.src];
      if (pr) {
        const a = pr.preR.get(it.id), b = pr.nowR.get(it.id);
        it.change = a == null ? { kind: 'new' } : a === b ? { kind: 'held', n: 0 } : a > b ? { kind: 'up', n: a - b } : { kind: 'down', n: b - a };
      }
      const localDec = ver.localDec[it.src];
      const dec = localDec && !localDec.tooFew ? localDec : ver.archive[it.src]?.deciles;
      const p = probabilityFor(it.sc.lo, dec);
      if (p) it.prob = { ...p, horizon: SOURCES[it.src].kind === 'readership' ? 'the next day' : `${TUNING.outcomeHorizonH} h`, from: dec === localDec ? 'your scans' : 'recorded record' };
    }
    const ex = this.explain;
    const exMap = new Map((ex?.entries || []).map((e) => [e.id, e]));
    const explainedItems = ex?.entries ? ex.entries.map((e) => items.find((i) => i.id === e.id)).filter(Boolean) : items.slice(0, TUNING.explainTop);
    const fired = new Set(explainedItems.map((i) => i.key));
    const win = AGE_WINDOWS[this.s.win];
    const boardItems = items.filter((it) => (!this.s.only || it.src === this.s.only)
      && (!this.s.cause || exMap.get(it.id)?.cause === this.s.cause)
      && (win === Infinity || SOURCES[it.src].kind === 'readership' || (it.sc.ageH ?? 0) <= win)).slice(0, TUNING.boardMax);
    const revisits = [];
    for (const [src, pr] of Object.entries(prevRanks)) {
      if (this.origin !== 'live') continue;
      revisits.push(...revisit(hydrate(pr.prev), scan, src).map((r) => ({ ...r, src })));
    }
    const topics = (scan.topics || []).filter((t) => t.members.some((m) => items.some((i) => i.key === m)));
    return {
      scan, origin: this.origin, scanning: this.scanning, thinking: this.thinking, mode: this.s.mode, merged, view: this.s.view,
      only: this.s.only, cause: this.s.cause, enabled, items, allScored: items, boardItems, topics, fired, selected: this.s.sel,
      explain: ex ? { ...ex, model: ex.model } : null, explainedItems, typing: this.typing,
      explainOf: (it) => { const e = exMap.get(it.id); return e ? { ...e, prob: it.prob } : null; },
      sourceState: this.sourceState, verify: ver, revisits,
      store: { count: this.history.count(), kb: this.history.sizeKB(), scans: this.history.scans(), note: this.storeNote },
      pick: this.pick, confirmClear: this.confirmClear,
      scalerOf: (it) => scan.scalers?.[it.src]?.[this.s.mode],
      budget: this._budgetText(),
      emptyText: this.emptyText,
    };
  }

  _budgetText() {
    const parts = SOURCE_ORDER.filter((s) => this.s.enabled.has(s)).map((s) => `${SOURCES[s].short} ${SOURCES[s].budget}`);
    const led = this.current?.ledger;
    const used = led ? ` This scan used ${led.count()} requests and received ${kb(led.bytes())} (body bytes as read); by source: ${SOURCE_ORDER.filter((s) => led.count(s)).map((s) => `${SOURCES[s].short} ${led.count(s)} (${kb(led.bytes(s))})`).join(', ')}.` : '';
    return `Request budget per scan, at most: ${parts.join(', ')}; model 1.${used}`;
  }

  /* ---------------- render ---------------- */
  render(animate = 'move') {
    const m = this.build();
    this.model = m;
    V.renderSources(this.n.sources, m, (src) => this.toggleSource(src));
    V.renderSeg(this.n.scoreModes, Object.entries(SCORE_MODES).map(([k, v]) => [k, v.label]), this.s.mode, (v) => { this.s.mode = v; this.render(); });
    V.renderSeg(this.n.windows, [['all', 'all'], ['6h', '< 6 h'], ['24h', '< 24 h'], ['3d', '< 3 d']], this.s.win, (v) => { this.s.win = v; this.render(); });
    V.renderSeg(this.n.viewToggle, [['items', 'items'], ['topics', 'topics']], this.s.view, (v) => { this.s.view = v; this.render(); });
    V.renderStamp(this.n.stamp, m);
    this._renderField(m, animate);
    V.renderTrace(this.n.trace, this.stages);
    V.renderTop(this.n.top, m);
    V.renderExplained(this.n.explained, m, this.n.expRoute);
    V.renderDigest(this.n.digest, m);
    V.renderBoard(this.n.boardHead, this.n.board, m, { open: (k, node) => this.open(k, node), select: (k, o) => this.select(k, o) });
    V.renderFilters(this.n.boardFilters, m, { only: (v) => { this.s.only = v; this.render(); }, cause: (v) => { this.s.cause = v; this.render(); } });
    this._renderMemory(m);
    V.renderVerify(this.n.verify, m);
    V.renderMethod(this.n.method, m);
    V.renderWorked(this.n.worked, m);
    V.renderHard(this.n.hard, m);
    this._writeURL();
  }

  _renderField(m, animate, at) {
    const notes = {};
    for (const kind of ['forum', 'code', 'readership']) {
      const srcs = SOURCE_ORDER.filter((s) => SOURCES[s].kind === kind);
      const on = srcs.filter((s) => this.s.enabled.has(s));
      notes[kind] = !on.length ? 'source off' : on.every((s) => m.scan.sources[s]?.status === 'failed') ? 'source failed in this scan' : 'no items';
    }
    let items = m.items;
    const full = new Map();
    for (const it of m.items) {
      const earlier = it.traj.filter((p) => p.kind === 'stored');
      if (earlier.length) full.set(it.key, trailOf(it, earlier));
    }
    let trails = full;
    if (at != null) {
      // scrubber: positions at an earlier recorded or stored time, on the final axes
      trails = new Map();
      items = m.items.map((it) => {
        if (SOURCES[it.src].kind === 'readership') return it;
        const obs = it.traj.filter((p) => p.kind !== 'origin' && p.t <= at + 1000);
        const last = obs[obs.length - 1];
        if (!last) return null;
        return { ...it, sc: scoreItem({ ...it, count: last.c, t: last.t }) };
      }).filter(Boolean);
    }
    this.field.render({
      items, topics: m.topics, fired: m.fired, selected: m.selected, trails, notes, animate,
      domainItems: m.items, domainTrails: full, fast: at != null || this._scrubbing,
      describe: (it) => V.describe(it, m.mode),
    });
    this._renderScrub(m, at);
  }

  /* Observation times of the shown items, one per scan (times within 2 minutes merge, latest kept). */
  _scrubTimes(m) {
    const ts = [];
    for (const it of m.items) {
      if (SOURCES[it.src].kind === 'readership') continue;
      for (const p of it.traj) if (p.kind === 'stored' || p.kind === 'now') ts.push(p.t);
    }
    ts.sort((a, b) => a - b);
    const out = [];
    for (const t of ts) { if (out.length && t - out[out.length - 1] < 120000) out[out.length - 1] = t; else out.push(t); }
    return out;
  }

  _renderScrub(m, at) {
    const times = this._scrubTimes(m);
    clear(this.scrub);
    if (times.length < 2) { this.scrub.hidden = true; return; }
    this.scrub.hidden = false;
    const id = 'scrub-range';
    const lab = el('label', null, 'replay', { for: id });
    const r = el('input', null, null, { type: 'range', id, min: '0', max: String(times.length - 1), step: '1', 'aria-valuetext': '' });
    const idx = at == null ? times.length - 1 : Math.max(0, times.findIndex((t) => t >= at));
    r.value = String(idx);
    const out = el('span', 'num', `${utc(times[idx])} · ${idx + 1} of ${times.length} observations`);
    r.setAttribute('aria-valuetext', out.textContent);
    r.addEventListener('input', () => {
      const k = Number(r.value);
      this._scrubbing = true;
      this._renderField(this.model, 'move', k === times.length - 1 ? null : times[k]);
      this._scrubbing = false;
      this.scrub.querySelector('input')?.focus();
    });
    const play = el('button', 'ghost sm', 'play', { type: 'button', 'aria-label': 'Replay the stored observations' });
    play.addEventListener('click', () => this._replay());
    this.scrub.append(lab, r, out, play);
  }

  /* Replay the stored observations: every mark moves through its recorded positions. */
  async _replay() {
    const times = this._scrubTimes(this.model);
    if (times.length < 2 || this._replaying) return;
    this._replaying = true;
    for (let k = 0; k < times.length; k++) {
      if (this.scanning) break;
      this._renderField(this.model, 'move', k === times.length - 1 ? null : times[k]);
      await sleep(Math.max(420, Math.min(700, 3000 / times.length)));
    }
    this._replaying = false;
  }

  _renderMemory(m) {
    V.renderStore(this.n.store, m, {
      exportJSON: () => download(`trending-history-${new Date().toISOString().slice(0, 10)}.json`, this.history.exportJSON(), 'application/json'),
      exportCSV: () => download(`trending-history-${new Date().toISOString().slice(0, 10)}.csv`, this.history.exportCSV(), 'text/csv'),
      importJSON: () => this.n.fileImport.click(),
      clear: () => {
        if (!this.confirmClear) { this.confirmClear = true; this.render(); setTimeout(() => { this.confirmClear = false; this.render(); }, 4000); return; }
        this.confirmClear = false;
        this.history.clear();
        this.pick = [];
        this.verifyCache = null;
        this.storeNote = 'History cleared.';
        this.render();
      },
    });
    V.renderHistory(this.n.history, m, {
      pick: (t, on) => {
        this.pick = on ? [...this.pick.filter((x) => x !== t), t].slice(-2) : this.pick.filter((x) => x !== t);
        this._renderMemory(this.model);
      },
    });
    if (this.pick.length === 2) {
      const [a, b] = this.pick.map((t) => this.history.scans().find((r) => r.t === t)).filter(Boolean).sort((x, y) => x.t - y.t).map(hydrate);
      V.renderDiff(this.n.diff, a && b ? diffScans(a, b) : null, a, b);
    } else V.renderDiff(this.n.diff, null);
  }

  /* ---------------- interactions ---------------- */
  toggleSource(src) {
    this._userTouched = true;
    if (this.s.enabled.has(src)) this.s.enabled.delete(src); else this.s.enabled.add(src);
    const v = this._viewScan().sources[src];
    if (this.s.enabled.has(src)) this.sourceState[src] = v ? { s: v.reshown ? 'stored' : this.origin === 'live' ? 'ok' : 'stored', text: `${v.reshown ? 'last scan ' : ''}${utc(v.fetchedAt).slice(11, 16)}` } : { s: '', text: 'not scanned yet' };
    else this.sourceState[src] = { s: '', text: 'off' };
    this.render();
  }

  select(key, { from } = {}) {
    if (from !== 'focus' && from !== 'board') this._userTouched = true;
    this.s.sel = key;
    this.field.select(key);
    for (const r of this.n.board.querySelectorAll('.row')) r.classList.toggle('sel', r.dataset.key === key);
    if (from === 'field' || from === 'topic') {
      const row = [...this.n.board.querySelectorAll('.row')].find((r) => r.dataset.key === key);
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.focus({ preventScroll: true }); }
    }
    this._writeURL();
  }

  open(key, returnTo) {
    const it = this.model.items.find((x) => x.key === key);
    if (!it) return;
    this.select(key, { from: 'open' });
    this._detailOpen = key;
    this._returnFocus = returnTo || document.activeElement;
    V.renderDetail(this.n.detail, it, { ...this.model, askLabel: this._askLabel() }, {
      close: () => this.closeDetail(),
      ask: (item, out, btn) => this.askOne(item, out, btn),
    });
    this.n.detail.hidden = false;
    this.n.detail.querySelector('button')?.focus();
  }

  closeDetail() {
    if (this.n.detail.hidden) return;
    this.n.detail.hidden = true;
    this._detailOpen = null;
    this._writeURL();
    this._returnFocus?.focus?.();
  }

  _askLabel() {
    const w = LLM.publicReadyIn();
    return w > 0 && LLM.status().route === 'pollinations' ? `Ask one question (public route ready in ${w} s)` : 'Ask the model about this item alone (one call)';
  }

  async askOne(it, out, btn) {
    btn.disabled = true;
    out.textContent = '';
    out.classList.add('thinking');
    const fact = factsFor(it, {}, { key: 's1', measured: it.measured, accel: it.accel });
    const engine = engineReply([it], [{ measured: it.measured, accel: it.accel, poolMedian: this._poolMedian(it.src) }], [], this.current, {});
    let res;
    try {
      const { system, prompt } = buildRequest([fact], []);
      const r = await LLM.complete({ system: `${system}\n\nReply with one JSON object and nothing else.`, prompt, json: false, temperature: 0.2, timeoutMs: TUNING.modelTimeoutMs, maxWaitMs: TUNING.modelMaxWaitMs, fallback: () => JSON.stringify(engine) });
      res = reconcile(r.source === 'offline' ? engine : parseReply(r.text), [it], [fact], engine);
      if (r.source === 'offline') res.entries[0].origin = 'engine';
      res.route = `${r.source} · ${r.model}`;
    } catch (e) {
      res = { entries: [{ ...engine.signals[0], origin: 'engine', flags: [] }], route: 'engine' };
    }
    out.classList.remove('thinking');
    const e = res.entries[0];
    out.textContent = '';
    out.append(el('span', `tag ${e.origin === 'model' ? 'model' : 'engine'}`, res.route), el('span', 'tag', `cause · ${e.cause}`));
    out.append(V.whyNode(e.why, e.flags));
    if (e.flags?.length) out.append(el('p', 'flagnote', `${e.flags.length} figure(s) match nothing in the fetched data.`));
    if (e.note) out.append(el('p', 'flagnote', e.note));
    btn.disabled = false;
  }

  status(text) { if (this.n.status) this.n.status.textContent = text; }

  _busy(on) {
    this.n.scan.disabled = on;
    this.n.scan.textContent = on ? 'Scanning' : 'Scan live';
    this.n.stop.hidden = !on;
  }

  /* ---------------- the live scan ---------------- */
  async scan() {
    if (this.scanning) return;
    const enabled = SOURCE_ORDER.filter((s) => this.s.enabled.has(s));
    if (!enabled.length) { this.status('Turn on at least one source.'); return; }
    this._userTouched = true;
    this.ctrl = new AbortController();
    const signal = this.ctrl.signal;
    this.scanning = true;
    this.lastScanSources = enabled;
    this._busy(true);
    this.emptyText = null;
    this.stages = { request: { s: 'run', text: `${enabled.length} sources in parallel` } };
    for (const src of SOURCE_ORDER) this.sourceState[src] = enabled.includes(src) ? { s: '', text: 'queued' } : { s: '', text: 'off' };
    this.status(`${COPY.scanning} ${enabled.map((s) => SOURCES[s].label).join(', ')}.`);
    this.render();
    const t0 = Date.now();
    let scan;
    try {
      scan = await runScan({ enabled, signal, emit: (k, d) => this._onEmit(k, d) });
    } catch (e) {
      if (e.name === 'AbortError') return this._stopped();
      this.scanning = false; this._busy(false);
      this.stages.request = { s: 'fail', text: e.message };
      this.status(`Scan failed: ${e.message}`);
      return this.render();
    }
    const okN = enabled.filter((s) => scan.sources[s]?.status === 'ok').length;
    const hosts = new Set(scan.ledger.rows.map((r) => { try { return new URL(r.url).host; } catch { return ''; } }));
    this.stages.request = { s: 'ok', text: `${scan.ledger.count()} requests to ${hosts.size} hosts` };
    this.stages.fetch = { s: okN === enabled.length ? 'ok' : okN ? 'warn' : 'fail', text: `${okN} of ${enabled.length} answered · ${kb(scan.ledger.bytes())} · ${((Date.now() - t0) / 1000).toFixed(1)} s` };
    if (!scan.items.length) {
      this.scanning = false; this._busy(false);
      this.emptyText = COPY.empty;
      this.stages.rank = { s: 'fail', text: 'nothing to rank' };
      this.status(`${COPY.empty} ${this._failText(scan)}`);
      return this.render();
    }
    const rec = this.history.add(scan);
    this.verifyCache = null;
    this.storeNote = this.history.lastError ? `Storage refused the scan: ${this.history.lastError}` : '';
    this.current = { ...hydrate(rec), ledger: scan.ledger, rejected: scan.rejected };
    this.origin = 'live';
    this.explain = null;
    this.stages.rank = { s: scan.rejected.length ? 'warn' : 'ok', text: `${scan.items.length} scored · ${scan.rejected.length} rejected · ${scan.topics.length} topics` };
    this.stages.field = { s: 'run', text: 'drawing' };
    this.render('move');
    await sleep(TUNING.stageMs);
    this.stages.field = { s: 'ok', text: `${this.model.items.length} marks` };
    const [a1, b1] = this.model.items;
    if (a1 && b1) this.stages.rank.text += ` · first: "${a1.title.slice(0, 40)}", ${this.model.merged ? `z ${(a1.z - b1.z).toFixed(3)}` : `${num(a1.value - b1.value)} ${SOURCES[a1.src].unit}`} ahead of "${b1.title.slice(0, 30)}"`;
    V.renderTrace(this.n.trace, this.stages);
    if (signal.aborted) return this._stopped();
    await this._reason(signal, scan);
    if (signal.aborted) return this._stopped();
    this.scanning = false;
    this._busy(false);
    const top = this.model.items[0];
    const rej = scan.rejected.length ? ` ${scan.rejected.length} item(s) failed the schema check: ${scan.rejected.slice(0, 3).map((r) => `${r.id} (${r.reason})`).join('; ')}.` : '';
    this.status(`Scan complete at ${utc(Date.now()).slice(11)}. ${okN} of ${enabled.length} sources answered.${this._failText(scan)} Top: "${top?.title}" (${top ? SOURCES[top.src].label : ''}).${rej}`);
    this.render();
    this._armPoll();
  }

  _failText(scan) {
    const f = Object.entries(scan.sources).filter(([, v]) => v.status !== 'ok');
    return f.length ? ` Failed: ${f.map(([s, v]) => `${SOURCES[s].label} (${v.error})`).join(', ')}.` : '';
  }

  _onEmit(kind, d) {
    if (kind === 'source') {
      const lim = d.src === 'gh' && d.rate?.remaining != null ? ` · ${d.rate.remaining}/${d.rate.limit} left` : '';
      const st = d.status === 'ok' ? { s: 'ok', text: d.series ? `${d.n} series` : `${d.n} items · ${(d.ms / 1000).toFixed(1)} s${lim}` }
        : d.status === 'failed' ? { s: 'failed', text: d.error } : d.status === 'waiting' ? { s: 'waiting', text: 'limit' } : { s: '', text: 'requesting' };
      this.sourceState[d.src] = st;
      if (d.status === 'waiting') this._countdown(d.src, d.until);
      V.renderSources(this.n.sources, this.build(), (src) => this.toggleSource(src));
    } else if (kind === 'stage') {
      if (d.stage === 'fetch') this.stages.fetch = { s: 'run', text: 'Wikipedia daily series' };
      if (d.stage === 'rank') this.stages.rank = { s: 'run', text: 'scoring' };
      V.renderTrace(this.n.trace, this.stages);
    }
  }

  _countdown(src, until) {
    const tick = () => {
      const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      if (this.sourceState[src]?.s !== 'waiting') return;
      this.sourceState[src] = { s: 'waiting', text: `limit, ${s} s` };
      this.status(`${COPY.limitWait} ${s} s for ${SOURCES[src].label} (X-RateLimit-Remaining 0).`);
      V.renderSources(this.n.sources, this.model, (x) => this.toggleSource(x));
      if (s > 0) setTimeout(tick, 1000);
    };
    tick();
  }

  async _reason(signal, scan) {
    const m = this.build();
    const top = m.items.slice(0, TUNING.explainTop);
    this.stages.reason = { s: 'run', text: 'fetching evidence' };
    V.renderTrace(this.n.trace, this.stages);
    const evidence = await gatherEvidence(scan, top, signal).catch(() => ({}));
    const facts = top.map((it, i) => factsFor(it, evidence[it.id], { key: `s${i + 1}`, rankChange: it.change ? (it.change.kind === 'new' ? 'new' : `${it.change.kind} ${it.change.n || 0}`) : null, measured: it.measured, accel: it.accel }));
    const ctxs = top.map((it) => ({ measured: it.measured, accel: it.accel, poolMedian: this._poolMedian(it.src) }));
    const topics = this._topicKeys(top);
    this.thinking = true;
    const waitS = LLM.publicReadyIn();
    this.stages.reason = { s: 'run', text: waitS > 0 && LLM.status().route === 'pollinations' ? `public route in ${waitS} s` : 'one batched call' };
    if (waitS > 0 && LLM.status().route === 'pollinations') this.status(`${COPY.modelWait} ${waitS} s.`);
    V.renderTrace(this.n.trace, this.stages);
    V.renderExplained(this.n.explained, this.model, this.n.expRoute);
    let res;
    try {
      res = await this.reasoning.explain({ items: top, facts, ctxs, topics, scan: this.current, evidence, signal, fixture: this.fixture, engineOnly: this.engineOnly, scanFacts: scanFactsOf(this._viewScan(), this.s.enabled) });
    } catch (e) {
      if (e.name === 'AbortError') { this.thinking = false; throw e; }
      const engine = engineReply(top, ctxs, topics, this.current, evidence);
      res = { ...reconcile(engine, top, facts, engine), source: 'offline', model: 'deterministic', errors: [e.message] };
    }
    if (res.source === 'offline') for (const e of res.entries) { e.origin = 'engine'; e.flags = []; e.rule = e.rule || engineReply(top, ctxs, topics, this.current, evidence).signals.find((x) => x.id === e.key)?.rule; }
    this.thinking = false;
    this.explain = res;
    for (const src of Object.keys(scan.sources)) {
      if (this.current.sources[src]) Object.assign(this.current.sources[src], { requests: scan.ledger.count(src), bytes: scan.ledger.bytes(src) });
    }
    this.history.setExplain(this.current.t, {
      source: res.source, model: res.model, ms: res.ms, entries: res.entries, topics: res.topics, digest: res.digest,
      digestOrigin: res.digestOrigin, digestFlags: res.digestFlags, malformed: res.malformed, unreadable: res.unreadable, salvaged: res.salvaged, errors: res.errors,
    });
    const flagged = res.entries.reduce((a, e) => a + (e.flags?.length || 0), 0);
    this.stages.reason = { s: res.source === 'offline' ? 'warn' : flagged || res.malformed?.length ? 'warn' : 'ok', text: `${V.routeLabel(res)}${res.malformed?.length ? ` · ${res.malformed.length} entry rejected` : ''}${flagged ? ` · ${flagged} figure flagged` : ''}` };
    if (res.source === 'offline') this.status(COPY.modelFailed);
    // type the top explanation
    this.typing = res.entries[0]?.origin === 'model' ? res.entries[0].id : null;
    this.render();
    if (this.typing) {
      const node = this.n.top.querySelector('.why');
      if (node) await V.typeInto(node, res.entries[0].why, signal).catch(() => {});
      this.typing = null;
      V.renderTop(this.n.top, this.build());
    }
  }

  _stopped() {
    this.scanning = false;
    this.thinking = false;
    this._busy(false);
    for (const k of Object.keys(this.stages)) if (this.stages[k].s === 'run') this.stages[k] = { s: 'fail', text: 'stopped' };
    this.status(COPY.stopped);
    this.render();
  }

  /* ---------------- auto re-scan ---------------- */
  _armPoll() {
    clearTimeout(this._pollT);
    if (!this.polling) { this.n.pollState.textContent = ''; return; }
    this._pollAt = Date.now() + TUNING.pollMinutes * 60000;
    const tick = () => {
      if (!this.polling) return;
      const s = Math.max(0, Math.round((this._pollAt - Date.now()) / 1000));
      this.n.pollState.textContent = `next scan in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s <= 0) { this.n.pollState.textContent = 'scanning'; this.scan(); return; }
      this._pollT = setTimeout(tick, 1000);
    };
    tick();
  }

  /* ---------------- lookup ---------------- */
  async lookup(text) {
    const terms = parseTerms(text);
    this.s.terms = terms;
    this._writeURL();
    const out = this.n.lookupOut;
    clear(out);
    if (!terms.length) { out.append(el('p', 'note', 'Type one to five terms of two or more characters.')); return; }
    const ledger = new Ledger();
    const note = el('p', 'note num', `Looking up ${terms.length} term(s): at most ${terms.length * 5} requests (HN 2, Wikipedia up to 2, GitHub 2 per term).`);
    out.append(note);
    try {
      const rows = await lookupTerms(terms, { ledger }, async (until) => {
        for (;;) {
          const s = Math.ceil((until - Date.now()) / 1000);
          if (s <= 0) break;
          note.textContent = `${COPY.limitWait} ${s} s (GitHub search allows 10 requests per minute without a key).`;
          await sleep(1000);
        }
      });
      clear(out);
      const chart = el('div');
      out.append(chart);
      drawLookup(chart, rows);
      const ul = el('ul', 'steps num');
      for (const r of rows) for (const x of r.res) ul.append(el('li', null, `${r.term} · ${x.src === 'wen' ? 'Wikipedia EN' : x.src === 'gh' ? 'GitHub' : 'Hacker News'}: ${x.error || `${x.text}; ratio ${num(x.ratio)}x (95% ${num(x.lo)} to ${num(x.hi)})`}`));
      out.append(ul, el('p', 'note num', `${ledger.count()} requests, ${kb(ledger.bytes())} received.`));
    } catch (e) {
      out.append(el('p', 'flagnote', `Lookup failed: ${e.message}`));
    }
  }

  /* ---------------- URL ---------------- */
  _readURL() {
    const p = new URLSearchParams(location.search);
    const src = p.get(PARAMS.src);
    if (src) { const l = src.split(',').filter((s) => SOURCES[s]); if (l.length) this.s.enabled = new Set(l); }
    if (SCORE_MODES[p.get(PARAMS.score)]) this.s.mode = p.get(PARAMS.score);
    if (p.get(PARAMS.win) in AGE_WINDOWS) this.s.win = p.get(PARAMS.win);
    if (['items', 'topics'].includes(p.get(PARAMS.view))) this.s.view = p.get(PARAMS.view);
    if (SOURCES[p.get(PARAMS.only)]) this.s.only = p.get(PARAMS.only);
    if (p.get(PARAMS.cause)) this.s.cause = p.get(PARAMS.cause);
    if (p.get(PARAMS.sel)) this.s.sel = p.get(PARAMS.sel);
    if (p.get(PARAMS.terms)) this.s.terms = parseTerms(p.get(PARAMS.terms));
  }

  _writeURL() {
    const p = new URLSearchParams(location.search);
    const set = (k, v, def) => { if (v == null || v === '' || v === def) p.delete(k); else p.set(k, v); };
    const def = SOURCE_ORDER.filter((s) => SOURCES[s].defaultOn).join(',');
    set(PARAMS.src, SOURCE_ORDER.filter((s) => this.s.enabled.has(s)).join(','), def);
    set(PARAMS.score, this.s.mode, 'lower');
    set(PARAMS.win, this.s.win, 'all');
    set(PARAMS.view, this.s.view, 'items');
    set(PARAMS.only, this.s.only, '');
    set(PARAMS.cause, this.s.cause, '');
    set(PARAMS.sel, this.s.sel, null);
    set(PARAMS.terms, this.s.terms.join(','), '');
    if (this.lastScanSources) p.set(PARAMS.scan, this.lastScanSources.join(','));
    if (this._detailOpen) p.set(PARAMS.open, '1'); else p.delete(PARAMS.open);
    p.delete(PARAMS.tour);
    const q = p.toString();
    try { history.replaceState(null, '', q ? `?${q}` : location.pathname); } catch { /* sandboxed */ }
  }

  /* ---------------- wiring ---------------- */
  _wire() {
    this.n.scan.addEventListener('click', () => this.scan());
    this.n.stop.addEventListener('click', () => this.ctrl?.abort());
    this.n.poll.addEventListener('click', () => {
      this.polling = !this.polling;
      this.n.poll.setAttribute('aria-pressed', String(this.polling));
      this.n.poll.textContent = this.polling ? `Pause re-scan (every ${TUNING.pollMinutes} min)` : `Re-scan every ${TUNING.pollMinutes} min`;
      this._armPoll();
    });
    this.n.lookupForm.addEventListener('submit', (e) => { e.preventDefault(); this.lookup(this.n.lookupInput.value); });
    this.n.fileImport.addEventListener('change', async () => {
      const f = this.n.fileImport.files?.[0];
      if (!f) return;
      try {
        const n = this.history.importJSON(await f.text());
        this.verifyCache = null;
        this.storeNote = `Imported ${n} scan(s) from ${f.name}.`;
        const latest = this.history.latest();
        if (latest && this.origin !== 'live') { this.current = hydrate(latest); this.origin = 'stored'; this.explain = latest.explain ? { ...latest.explain, stored: true } : this._restingExplain(); this._restingStages(); }
      } catch (e) { this.storeNote = `Import failed: ${e.message}`; }
      this.n.fileImport.value = '';
      this.render();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.closeDetail(); this.tour?.end(); }
    });
    this.n.tourBtn.addEventListener('click', () => this.startTour());
  }

  /* ---------------- walkthrough ---------------- */
  startTour() {
    const steps = [
      [SEL.trace, 'The scan runs as five stages: request every enabled source in parallel, fetch, rank, draw the field, then one model call. Each stage turns green when it completes, gold while it runs.'],
      [SEL.top, 'The top signal and the arithmetic that put it first: its score in its own unit, the 95% interval, and its lead over the runner-up.'],
      [SEL.field, 'Every scored signal on its source\'s own axes. Gold marks are the five called rising; dashed edges join one subject across sources; trails show where a mark sat in earlier scans.'],
      [SEL.explained, 'One model call explains the top five. Each entry is checked against the fetched numbers; a figure it cannot back is struck through, and a malformed entry is replaced by the engine.'],
      [SEL.verify, 'Calls are checked later: did the item gain more than the median item over the next span? The same test is run on two naive rankings so the method has to earn its place.'],
    ];
    let i = 0;
    const host = this.n.tour;
    let lit = null;
    const show = () => {
      lit?.classList.remove('spot');
      const [sel, text] = steps[i];
      lit = $(sel);
      lit?.classList.add('spot');
      lit?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      clear(host);
      host.append(el('div', 'k', `step ${i + 1} of ${steps.length}`), el('p', null, text));
      const b = el('div', 'btns');
      const mk = (t, f) => { const x = el('button', 'ghost sm', t, { type: 'button' }); x.addEventListener('click', f); b.append(x); return x; };
      if (i > 0) mk('Back', () => { i--; show(); });
      const next = mk(i < steps.length - 1 ? 'Next' : 'Done', () => { if (i < steps.length - 1) { i++; show(); } else end(); });
      mk('Skip', () => end());
      host.append(b);
      host.hidden = false;
      next.focus({ preventScroll: true });
    };
    const end = () => { lit?.classList.remove('spot'); host.hidden = true; this.tour = null; this.n.tourBtn.focus({ preventScroll: true }); };
    this.tour = { end };
    show();
  }

  static boot() {
    const app = new Trending();
    app.init();
    return app;
  }
}
