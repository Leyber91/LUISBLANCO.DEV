/* ============================================================
   trending/ReasoningService.js — asks WHY the top signal is rising.

   Live path: text.pollinations.ai (keyless, in-browser; no backend,
   no keys — this is why it does NOT use ai/provider.js, whose tiers
   are ollama/worker/echo and never reach pollinations). If that is
   unreachable it falls back to a per-source built-in heuristic.

   The heuristic is a STRATEGY MAP keyed by lens badge (with a
   default) rather than an if/else chain — a new source's blurb is a
   new entry, not a branch.
   ============================================================ */

import { TUNING, REASON } from './constants.js';
import { fetchWithTimeout, prefersReduced, wait, fmt } from './dom.js';

/* ---- built-in heuristic blurbs: badge -> (value, lens) -> string ---- */
const HEURISTICS = {
  HN: (v, lens) =>
    `At ${v} points climbing this fast, it has cleared the front-page baseline by a wide margin — on Hacker News that velocity usually means a launch, an outage, or a strong opinion landing at the right moment. The pace reflects practitioner interest, not just headline curiosity, which is the signal worth watching in ${lens.theme}.`,
  WIKI: (v, lens) =>
    `With ${v} reads in a single day it is one of the most-looked-up things in the world right now — a spike like this is almost always downstream of a news event, a release, or a moment that sent people to look it up. It is a clean proxy for where ${lens.theme} actually went, rather than where commentary said it would.`,
};
const HEURISTIC_DEFAULT = (v, lens) =>
  `A repository this new pulling ${v} stars is climbing far faster than the median project — early star velocity like this tracks developer conviction, usually a tool that removes a real, shared pain. It is an early read on where ${lens.theme} is heading before the trend is obvious.`;

export class ReasoningService {
  constructor(whyView) { this.view = whyView; }

  /* Resolve why the item is rising. Returns { live }.
     view callbacks: setThinking(on), reset(), type(text, signal),
     setLabel(text). */
  async reason(item, lens, signal) {
    this.view.setLabel('reasoning…');
    this.view.setThinking(true);
    this.view.reset();
    const prompt = this._prompt(item, lens);
    try {
      const url = `${REASON.base}${encodeURIComponent(prompt)}?model=${REASON.model}&referrer=${REASON.referrer}`;
      const res = await fetchWithTimeout(url, signal, TUNING.reasonTimeoutMs);
      if (!res.ok) throw new Error('pollinations ' + res.status);
      const text = (await res.text()).trim();
      if (signal?.aborted) return { live: false };
      if (text.length < TUNING.reasonMinChars || /^\s*(error|\{)/i.test(text)) throw new Error('empty');
      await this.view.type(text, signal);
      this.view.setLabel('why it is rising · pollinations (live)');
      return { live: true };
    } catch {
      if (signal?.aborted) return { live: false };
      await this.view.type(this._heuristic(item, lens), signal);
      this.view.setLabel('why it is rising · built-in heuristic');
      return { live: false };
    } finally {
      this.view.setThinking(false);
    }
  }

  _prompt(item, lens) {
    return (
      `A signal is rising on ${lens.source}: "${item.title}" (${item.metricLabel}: ${item.metricValue}` +
      `${item.ageText ? ', ' + item.ageText : ''}). In 2 to 3 concrete sentences, explain why it is likely ` +
      `climbing right now and what it signals about where ${lens.theme} is heading. No hype, no preamble, no lists.`
    );
  }

  _heuristic(item, lens) {
    const v = fmt(item.metricValue);
    return (HEURISTICS[lens.badge] || HEURISTIC_DEFAULT)(v, lens);
  }
}

/* ============================================================
   WhyView — owns the #why-label / #why-body nodes and the type-out.
   Reduced-motion users get the full text instantly.
   ============================================================ */
export class WhyView {
  constructor(labelNode, bodyNode) { this.label = labelNode; this.body = bodyNode; }

  setLabel(text) { if (this.label) this.label.textContent = text; }
  setThinking(on) { this.body?.classList.toggle('thinking', on); }
  reset() { if (this.body) this.body.textContent = ''; }
  setText(text) { if (this.body) this.body.textContent = text; }

  async type(text, signal) {
    if (!this.body) return;
    this.body.textContent = '';
    if (prefersReduced()) { this.body.textContent = text; return; }
    for (let i = 0; i < text.length; i += TUNING.typeStep) {
      if (signal?.aborted) { this.body.textContent = text; return; }
      this.body.textContent += text.slice(i, i + TUNING.typeStep);
      await wait(TUNING.typeDelayMs);
    }
  }
}
