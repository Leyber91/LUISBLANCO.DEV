/* ============================================================
   memes/MemeLab.js — the top-level controller. Composes the lab
   from single-responsibility collaborators: the ComedyEngine
   (deterministic local + fallback), the MemeParser (model JSON),
   the MemeCanvas (painter + export surface), the SlateView (the
   visible taste filter), the BackgroundSource (image backdrop +
   taint), and the Exporter (download/copy). Owns the AI provider,
   the input read, the generate flow, status, wiring, and demo mode.

   Wired to the shared tiered backend (ollama -> worker -> echo).
   NOTE: worker.base is '' until the Cloudflare proxy is deployed,
   so the live tier is ECHO for everyone right now — the local
   comedy engine is the main event, not a fallback.
   ============================================================ */

import { AIProvider } from '../ai/provider.js';
import {
  SEL, DEFAULTS, WORKER_CALL, TIER_TEXT, TIER_TEXT_FALLBACK, BACKEND_NOTE,
  FOOTER_TAGLINE, FOOTER_SUFFIX, REASONING_LABEL, GEN_LABEL, MSG, SR,
  DEMO_INPUTS, DEMO_PARAM,
} from './constants.js';
import { $ } from './dom.js';
import { ComedyEngine, defaultScene } from './ComedyEngine.js';
import { MemeParser } from './MemeParser.js';
import { MemeCanvas } from './MemeCanvas.js';
import { SlateView } from './SlateView.js';
import { BackgroundSource } from './BackgroundSource.js';
import { Exporter } from './Exporter.js';

export class MemeLab {
  constructor() {
    this._refs();

    this.ai = new AIProvider();
    this.controller = null;
    this.meme = null;                              // last parsed meme object
    this.size = { ...DEFAULTS.size };

    this.engine = new ComedyEngine();
    this.parser = new MemeParser(() => this._readSeed());
    this.canvas = new MemeCanvas(this.dom.meme);
    this.slate = new SlateView({ angleChips: this.dom.angleChips, candidates: this.dom.candidates });

    this.source = new BackgroundSource(
      { toggle: this.dom.sourceToggle, uploadEl: this.dom.upload, srcNote: this.dom.srcNote,
        downloadBtn: this.dom.download, copyBtn: this.dom.copy, exportNote: this.dom.exportNote },
      {
        recompose: () => this._composite(),
        hasMeme: () => !!this.meme,
        getSeed: () => this._readSeed(),
        getSize: () => this.size,
        getScene: () => this.meme?.scene,
        getCaption: () => ({ top: this.dom.capTop.value, bottom: this.dom.capBottom.value }),
      });

    this.exporter = new Exporter(this.canvas,
      { exportNote: this.dom.exportNote, copyBtn: this.dom.copy,
        getSeed: () => this._readSeed(), onTaint: () => this.source.taintFallback() });
  }

  /* ---- cache every DOM ref once ---- */
  _refs() {
    const get = {};
    for (const [key, sel] of Object.entries(SEL)) get[key] = $(sel);
    this.dom = get;
  }

  /* ============================================================
     boot
     ============================================================ */
  async mount() {
    if (this.dom.year) this.dom.year.textContent = String(new Date().getFullYear());
    if (!window.ClipboardItem) this.dom.copy.hidden = true;
    this._wire();

    if (new URLSearchParams(location.search).has(DEMO_PARAM)) await this._renderDemo();

    const mode = await this.ai.detect();
    this._paintStatus(mode);
  }

  /* ============================================================
     status — mode -> labels via lookup maps (no nested ternary)
     ============================================================ */
  _paintStatus(mode) {
    const [short, long] = (TIER_TEXT[mode] || TIER_TEXT[TIER_TEXT_FALLBACK])();
    this.dom.aiStatus.dataset.mode = mode;
    this.dom.aiStatusLabel.textContent = short;
    this.dom.backendNote.textContent = BACKEND_NOTE(long);
    if (this.dom.footerTag) {
      this.dom.footerTag.textContent = (FOOTER_TAGLINE[mode] || FOOTER_TAGLINE.echo) + FOOTER_SUFFIX;
    }
  }

  /* ============================================================
     inputs
     ============================================================ */
  /* seed parse that preserves 0 and treats blank/NaN as the default */
  _readSeed() {
    const raw = (this.dom.seed.value || '').trim();
    const n = Number(raw);
    return (raw !== '' && Number.isFinite(n)) ? n : DEFAULTS.seed;
  }

  _readInputs() {
    return {
      topic: (this.dom.topic.value || '').trim() || DEFAULTS.topic,
      tone: this.dom.tone.value,
      seed: this._readSeed(),
      source: this.source.mode,
    };
  }

  /* ============================================================
     submit -> generate
     ============================================================ */
  async generate(inputs) {
    this.controller?.abort();
    const myCtrl = this.controller = new AbortController();
    const d = this.dom;

    d.resting.hidden = true;
    d.work.hidden = false;
    this.slate.clear();
    d.fallbackNote.hidden = true;
    d.exportBar.hidden = true;
    d.captionEdit.hidden = true;
    d.exportNote.hidden = true;
    d.composing.hidden = false;
    d.reasoningBody.textContent = '';
    d.reasoningWrap.dataset.active = 'true';
    d.reasoningTog.setAttribute('aria-expanded', 'true');
    d.reasoningLabel.textContent = REASONING_LABEL[this.ai.mode] || REASONING_LABEL.echo;
    this._setBusy(true);
    d.reasoningStat.textContent = SR.start;

    let answer = '';
    let gotReasoning = false;

    try {
      await this.ai.chat({
        provider: this.ai.mode === 'worker' ? WORKER_CALL.provider : undefined,
        model: this.ai.mode === 'worker' ? WORKER_CALL.model : undefined,
        messages: this._buildMessages(inputs),
        temperature: DEFAULTS.temperature,
        maxTokens: DEFAULTS.maxTokens,
        signal: this.controller.signal,
        echo: this._buildEcho(inputs),
        onReasoning: (t) => { gotReasoning = true; d.reasoningBody.textContent += t; d.reasoningBody.scrollTop = d.reasoningBody.scrollHeight; },
        onToken: (t) => { answer += t; },
        onDone: () => {},
      });
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('[memes] chat failed:', err);
    }

    // if a newer run superseded this one, bail without clobbering its DOM/state.
    // if it was a user Stop (no successor took the controller), reset the button.
    if (myCtrl.signal.aborted) {
      if (this.controller === myCtrl) this._setBusy(false);
      return;
    }

    d.reasoningWrap.dataset.active = 'false';
    d.reasoningWrap.hidden = !gotReasoning && this.ai.mode !== 'echo';

    let meme = this.parser.extract(answer);
    let note = null;
    if (!meme) {
      meme = this.engine.build(inputs);
      note = this.ai.mode === 'echo' ? null : SR.parseFail;
    }
    await this._renderResult(meme, inputs, note);
    d.reasoningStat.textContent = `Reasoning complete — winner selected: ${meme.winner?.top || ''} ${meme.winner?.bottom || ''}`.trim();
    this._setBusy(false);
  }

  _setBusy(busy) {
    this.dom.generate.disabled = busy;
    this.dom.generate.querySelector('span').textContent = busy ? GEN_LABEL.busy : GEN_LABEL.idle;
    this.dom.stop.hidden = !busy;
  }

  /* ============================================================
     prompt construction
     ============================================================ */
  _buildMessages(i) {
    const sys =
`You are a deadpan staff comedy writer with the taste of a senior engineer, writing memes about AI engineering and the singularity. You do not just write a caption — you run a VISIBLE four-phase taste filter, because a platform streams your reasoning to the reader and the reasoning IS the product.

PHASE 1 ANGLES: list 4-6 distinct comedic ANGLES on the topic (relatable-pain, unexpected-juxtaposition, self-own, doomer, corporate-cringe). One short labelled line each.
PHASE 2 SLATE: for the 3 strongest angles, draft a meme as TOP text / BOTTOM text. Punchy, under 8 words per line, all-caps meme register, no emoji.
PHASE 3 CRITIQUE: score EVERY candidate 0-5 on five named axes — punchy, funny (genuinely funny vs merely true), onTopic, notCringe (reject dad-jokes, ads, try-hard, and anything punching-down/slur/NSFW -> 0), readable (lands in 2 seconds). Narrate each cut in one line.
PHASE 4 COMMIT: pick the winner, state the ONE edit that sharpens it, emit the final caption, and choose a canvas scene motif that frames the joke.

Do all four phases in your reasoning. THEN output ONLY a single JSON object (no markdown fences, no prose around it) matching this schema exactly:
{"angles":["short label"],"candidates":[{"id":"A","top":"TOP","bottom":"BOTTOM","scores":{"punchy":4,"funny":3,"onTopic":5,"notCringe":4,"readable":5},"verdict":"one line why kept or cut"}],"winner":{"id":"A","top":"FINAL TOP","bottom":"FINAL BOTTOM"},"refinement":"the one edit you made","scene":{"motif":"event-horizon|accretion-disk|lone-observer|collapsing-stack|signal-in-noise","warmCold":0.6,"focal":"center","seed":${i.seed}}}
Rules: the scores object must have exactly those five integer keys (0-5). notCringe MUST be 0 for any hateful/NSFW/punching-down line. Tone register: ${i.tone}. Keep top/bottom under 8 words each.`;

    const usr = `Topic: ${i.topic}. Tone: ${i.tone}. Make the meme.`;
    return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
  }

  _buildEcho(i) {
    const local = this.engine.build(i);
    return { thought: this.engine.script(i, local), speech: [JSON.stringify(local)] };
  }

  /* ============================================================
     render the slate + composite the meme
     ============================================================ */
  async _renderResult(meme, inputs, note) {
    const d = this.dom;
    d.composing.hidden = true;

    this.slate.render(meme);

    // caption edit fields = winner text
    d.capTop.value = (meme.winner?.top || '').toUpperCase();
    d.capBottom.value = (meme.winner?.bottom || '').toUpperCase();
    d.captionEdit.hidden = false;

    if (note) { d.fallbackNote.textContent = note; d.fallbackNote.hidden = false; }

    this.meme = meme;
    await this._composite();

    d.exportBar.hidden = false;
  }

  /* paint the canvas from current state, then probe a remote backdrop for taint */
  async _composite() {
    await this.canvas.compose({
      scene: { ...(this.meme?.scene || defaultScene(this._readSeed())) },
      seed: this._readSeed(),
      bgImage: this.source.image,
      top: this.dom.capTop.value,
      bottom: this.dom.capBottom.value,
    });

    // a remote backdrop can taint the canvas — detect it now, not at click time
    if (this.source.mode === 'pollinations' && this.source.image) this._probeTaint();
  }

  /* cheap taint probe so a blocked download is shown before the user clicks */
  _probeTaint() {
    try { this.canvas.probe(); this.source.markClean(); }
    catch { this.source.taintFallback(); }
  }

  /* ============================================================
     interactions
     ============================================================ */
  _wire() {
    const d = this.dom;

    d.reasoningTog.addEventListener('click', () => {
      const open = d.reasoningTog.getAttribute('aria-expanded') === 'true';
      d.reasoningTog.setAttribute('aria-expanded', String(!open));
    });

    d.form.addEventListener('submit', (e) => { e.preventDefault(); this.generate(this._readInputs()); });
    d.stop.addEventListener('click', () => this.controller?.abort());

    d.topicChips.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      d.topic.value = b.dataset.topic;
    });

    d.dice.addEventListener('click', () => { d.seed.value = this._randomSeed(); if (this.meme) this._composite(); });

    this.source.wire();

    d.sizes.addEventListener('click', (e) => {
      const b = e.target.closest('.size'); if (!b) return;
      d.sizes.querySelectorAll('.size').forEach((s) => s.classList.toggle('on', s === b));
      this.size = { w: Number(b.dataset.w), h: Number(b.dataset.h) };
      this.canvas.setSize(this.size.w, this.size.h);
      if (this.meme) this._composite();
    });

    d.capTop.addEventListener('input', () => this.meme && this._composite());
    d.capBottom.addEventListener('input', () => this.meme && this._composite());

    d.rerollArt.addEventListener('click', () => { d.seed.value = this._randomSeed(); this._composite(); });
    d.remix.addEventListener('click', () => this.generate(this._readInputs()));
    d.download.addEventListener('click', () => this.exporter.download());
    d.copy.addEventListener('click', () => this.exporter.copy());
  }

  _randomSeed() { return Math.floor(Math.random() * DEFAULTS.seedMax); }

  /* ============================================================
     demo mode — instant deterministic render for screenshots
     ============================================================ */
  async _renderDemo() {
    const d = this.dom;
    const inputs = { ...DEMO_INPUTS };
    d.topic.value = inputs.topic; d.tone.value = inputs.tone; d.seed.value = String(inputs.seed);

    d.resting.hidden = true; d.work.hidden = false; d.composing.hidden = true;
    d.reasoningWrap.dataset.active = 'false';
    d.reasoningLabel.textContent = REASONING_LABEL.echo;   // honest: worker tier is unreachable (worker.base='')
    const local = this.engine.build(inputs);
    d.reasoningBody.textContent = this.engine.script(inputs, local).join('\n');
    await this._renderResult(local, inputs, null);         // await the canvas paint -> deterministic screenshot
  }

  static boot() {
    const lab = new MemeLab();
    lab.mount();
    return lab;
  }
}
