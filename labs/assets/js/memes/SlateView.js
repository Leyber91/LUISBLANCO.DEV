/* ============================================================
   memes/SlateView.js — renders the visible taste filter: the angle
   chips and the scored candidate cards (winner first, then cuts).
   Builds DOM only via textContent — model output is never markup.
   ============================================================ */

import { AXES } from './constants.js';
import { el } from './dom.js';

export class SlateView {
  constructor({ angleChips, candidates }) {
    this.angleChips = angleChips;
    this.candidates = candidates;
  }

  clear() {
    this.angleChips.innerHTML = '';
    this.candidates.innerHTML = '';
  }

  render(meme) {
    // angle chips
    this.angleChips.innerHTML = '';
    for (const a of (meme.angles || [])) this.angleChips.append(el('span', 'angle-chip', a));

    // candidate cards — winner first, then the cut ones (explicit partition,
    // not a sort: an identity comparator isn't a valid total order)
    this.candidates.innerHTML = '';
    const winId = meme.winner?.id;
    const win = meme.candidates.filter((c) => c.id === winId);
    const rest = meme.candidates.filter((c) => c.id !== winId);
    if (win.length) {
      this.candidates.append(this._card(win[0], true, meme.winner));
    } else {
      // model named a winner id that matches no candidate — synthesize the card
      this.candidates.append(this._card({ id: meme.winner?.id || 'A', scores: {} }, true, meme.winner));
    }
    for (const c of rest) this.candidates.append(this._card(c, false, null));
  }

  _card(c, isWin, winner) {
    const card = el('div', 'cand-card' + (isWin ? ' winner' : ' cut'));
    const head = el('div', 'cand-head');
    head.append(el('span', 'cand-id', c.id || '?'));
    head.append(el('span', 'cand-tag', isWin ? 'winner' : 'cut'));
    card.append(head);

    const text = el('div', 'cand-text');
    const top = (winner ? winner.top : c.top) || '';
    const bot = (winner ? winner.bottom : c.bottom) || '';
    if (top) text.append(el('span', 'half', top.toUpperCase()));
    if (bot) text.append(el('span', 'half dim', bot.toUpperCase()));
    card.append(text);

    const scores = el('div', 'scores');
    const sc = c.scores || {};
    for (const [key, label] of AXES) {
      const v = Math.max(0, Math.min(5, Number(sc[key]) || 0));
      const s = el('div', 'score');
      s.append(el('span', 'axis', label));
      const track = el('span', 'track');
      const fill = el('span', 'fill');
      fill.style.width = (v / 5 * 100) + '%';
      track.append(fill);
      s.append(track);
      s.title = `${label}: ${v}/5`;
      scores.append(s);
    }
    card.append(scores);

    if (c.verdict) card.append(el('div', 'cand-verdict', c.verdict));
    return card;
  }
}
