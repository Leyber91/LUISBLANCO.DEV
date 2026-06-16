/* ============================================================
   memes/MemeParser.js — turns a model's text answer into a meme
   object, or null when the output is not usable JSON. Strips
   markdown fences, slices the outermost braces, validates the
   minimum schema (candidates + a named winner), and back-fills the
   optional angles/scene fields. Pure: no DOM, no side effects.
   ============================================================ */

import { defaultScene } from './ComedyEngine.js';

export class MemeParser {
  constructor(seedFn) { this.seedFn = seedFn; }

  /** parsed meme object, or null if the text is not valid/usable JSON */
  extract(text) {
    if (!text) return null;
    const s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a === -1 || b === -1 || b <= a) return null;
    try {
      const obj = JSON.parse(s.slice(a, b + 1));
      const okCands = Array.isArray(obj.candidates) && obj.candidates.length;
      const okWin = obj.winner && (obj.winner.top || obj.winner.bottom);
      if (!okCands || !okWin) return null;
      if (!obj.angles) obj.angles = [];
      if (!obj.scene) obj.scene = defaultScene(this.seedFn());
      return obj;
    } catch { return null; }
  }
}
