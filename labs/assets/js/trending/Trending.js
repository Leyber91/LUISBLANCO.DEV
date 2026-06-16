/* ============================================================
   trending/Trending.js — the top-level controller.

   Owns the views + services, the AbortController, and the current
   lens. Composes the agentic scan as a sequence of explicit steps;
   delegates fetching to a lens STRATEGY, ranking to the lens, and
   the WHY to the ReasoningService. Adding a source = an entry in
   LENSES + SNAPSHOT; no edits here. Handles ?demo and ?scan boot.
   ============================================================ */

import {
  SEL, PARAMS, SNAPSHOT_DATE, SNAPSHOT, DEMO_WHY,
  STATUS_MODES, BACKEND_NOTE,
} from './constants.js';
import { $, $all, fmt, shorten } from './dom.js';
import { LENSES } from './lenses.js';
import { ReasoningService, WhyView } from './ReasoningService.js';
import { TraceView, MetaView, FeaturedView, BoardView, StatusView } from './views.js';

export class Trending {
  constructor() {
    this.controller = null;
    this.currentLens = 'tech';
    this._cacheRefs();
    this._buildViews();
    this.reasoning = new ReasoningService(this.why);
  }

  /* ---- DOM refs (all ids resolved once, here) ---- */
  _cacheRefs() {
    this.form       = $(SEL.form);
    this.lensToggle = $(SEL.lensToggle);
    this.lensWhat   = $(SEL.lensWhat);
    this.scanBtn    = $(SEL.scanBtn);
    this.stopBtn    = $(SEL.stopBtn);
    this.resting    = $(SEL.resting);
    this.workEl     = $(SEL.work);
    this.scanStatus = $(SEL.scanStatus);
  }

  _buildViews() {
    this.trace = new TraceView($(SEL.traceWrap), $(SEL.traceBody), $(SEL.traceToggle));
    this.meta  = new MetaView($(SEL.livePill), $(SEL.liveText), $(SEL.metaSrc), $(SEL.metaTime));
    this.feat  = new FeaturedView($(SEL.featured), $(SEL.featBadge), $(SEL.featMetric), $(SEL.featLink));
    this.board = new BoardView($(SEL.board), $(SEL.boardNote));
    this.why   = new WhyView($(SEL.whyLabel), $(SEL.whyBody));
    this.status = new StatusView($(SEL.aiStatus), $(SEL.aiStatusLabel), $(SEL.backendNote));
  }

  /* ============================================================
     the agentic scan
     ============================================================ */
  async scan(lensKey) {
    const lens = LENSES[lensKey];
    this.controller?.abort();
    const myCtrl = this.controller = new AbortController();

    this.resting.hidden = true;
    this.workEl.hidden = false;
    this.trace.clear();
    this.board.clear();
    this.feat.hide();
    this.board.hideNote();
    this.why.reset();
    this.trace.setActive(true);
    this.trace.setExpanded(true);
    this._setBusy(true);
    this.scanStatus.textContent = `Scanning ${lens.source} for what is rising.`;

    let res = null, live = true;
    this.trace.step('req', 'GET ', { b: lens.host }, ` — ${lens.endpointLabel}`);
    try {
      res = await lens.fetch(myCtrl.signal);
      if (myCtrl.signal.aborted) return this._abortCleanup(myCtrl);
      this.trace.step('ok', `${res.count} signals fetched`, { dur: `${res.ms}ms` });
    } catch (e) {
      if (myCtrl.signal.aborted) return this._abortCleanup(myCtrl);
      this.trace.step('warn', `live fetch failed (${e.message}) — using the labelled snapshot`);
      res = this._snapshotResult(lensKey);
      live = false;
    }

    if (!res.items.length) {
      this.trace.step('warn', 'no usable signals returned — using the labelled snapshot');
      res = this._snapshotResult(lensKey);
      live = false;
    }

    this.trace.step('think', 'ranking by ', { b: lens.rankLabel });
    const items = res.items;
    this.trace.step('ok', 'top signal: ', { b: items[0].title }, ` — ${lens.rankLabel.split(' ')[0]} ${fmt(items[0].score)}`);

    this.meta.render(live, lens);
    this.feat.render(items[0], lens);
    this.board.render(items);

    // reason about the top signal
    this.trace.step('req', 'asking a model: why is ', { b: shorten(items[0].title) }, ' rising?');
    const r = await this.reasoning.reason(items[0], lens, myCtrl.signal);
    if (myCtrl.signal.aborted) return this._abortCleanup(myCtrl);
    this.trace.step('ok', `reasoning complete ${r.live ? '(pollinations, live)' : '(built-in heuristic)'}`);

    if (!live) {
      this.board.showNote(`Network was unreachable, so this is a snapshot captured ${SNAPSHOT_DATE}, not live data.`);
    }

    this.trace.setActive(false);
    this._paintReasonStatus(live, r.live);
    this.scanStatus.textContent = `Scan complete. Top of ${lens.source}: ${items[0].title}.`;
    this._setBusy(false);
  }

  _snapshotResult(lensKey) {
    const items = SNAPSHOT[lensKey].map((x) => ({ ...x }));
    return { items, ms: 0, count: items.length };
  }

  _abortCleanup(myCtrl) {
    if (this.controller === myCtrl) { this.trace.setActive(false); this._setBusy(false); }
  }

  _setBusy(busy) {
    this.scanBtn.disabled = busy;
    this.scanBtn.querySelector('span').textContent = busy ? 'Scanning…' : 'Scan what is rising';
    this.stopBtn.hidden = !busy;
  }

  /* (dataLive, reasonLive) -> a STATUS_MODES descriptor + backend note */
  _paintReasonStatus(dataLive, reasonLive) {
    this.status.paint(reasonLive ? STATUS_MODES.live : STATUS_MODES.local);
    this.status.setNote(reasonLive ? BACKEND_NOTE.reasonLive : BACKEND_NOTE.reasonLocal(dataLive));
  }

  /* ============================================================
     interactions
     ============================================================ */
  setLens(key) {
    this.currentLens = key;
    $all(SEL.lens, this.lensToggle).forEach((b) => {
      const on = b.dataset.lens === key;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    });
    this.lensWhat.textContent = LENSES[key].what;
  }

  _wire() {
    this.trace.toggle?.addEventListener('click', () => {
      this.trace.setExpanded(!this.trace.isExpanded());
    });
    this.lensToggle.addEventListener('click', (e) => {
      const b = e.target.closest(SEL.lens); if (!b) return;
      this.setLens(b.dataset.lens);
    });
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.scan(this.currentLens); });
    this.stopBtn.addEventListener('click', () => this.controller?.abort());
  }

  /* ============================================================
     demo mode — instant, deterministic snapshot render (screenshots)
     ============================================================ */
  renderDemo() {
    this.setLens('tech');
    this.resting.hidden = true; this.workEl.hidden = false; this.trace.setActive(false);
    const lens = LENSES.tech;
    const items = SNAPSHOT.tech.map((x) => ({ ...x }));

    // a representative frozen trace
    this.trace.step('req', 'GET ', { b: lens.host }, ` — ${lens.endpointLabel}`);
    this.trace.step('ok', '30 signals fetched', { dur: '214ms' });
    this.trace.step('think', 'ranking by ', { b: lens.rankLabel });
    this.trace.step('ok', 'top signal: ', { b: items[0].title }, ` — points ${fmt(items[0].score)}`);
    this.trace.step('req', 'asking a model: why is ', { b: shorten(items[0].title) }, ' rising?');
    this.trace.step('ok', 'reasoning complete (pollinations, live)');

    this.meta.render(false, lens);          // demo uses the snapshot, labelled honestly
    this.meta.setTime(`captured ${SNAPSHOT_DATE}`);
    this.feat.render(items[0], lens);
    this.board.render(items);
    this.why.setLabel('why it is rising · sample');
    this.why.setText(DEMO_WHY);
    this.board.showNote(`Sample view (a snapshot captured ${SNAPSHOT_DATE}). Press “Scan what is rising” for a live run.`);
    this.status.paint(STATUS_MODES.sample);
  }

  /* ============================================================
     init — wires up, sets defaults, honours ?demo / ?scan
     ============================================================ */
  init() {
    const y = $(SEL.year); if (y) y.textContent = String(new Date().getFullYear());
    this._wire();
    this.setLens('tech');
    this.status.setNote(BACKEND_NOTE.idle);

    const params = new URLSearchParams(location.search);
    if (params.has(PARAMS.demo)) { this.renderDemo(); return; }
    const scanKey = params.get(PARAMS.scan);
    if (params.has(PARAMS.scan) && LENSES[scanKey]) {
      this.setLens(scanKey);
      this.scan(scanKey);   // live, in-browser — verifies the agentic path end-to-end
    }
  }

  static boot() {
    const app = new Trending();
    app.init();
    return app;
  }
}
