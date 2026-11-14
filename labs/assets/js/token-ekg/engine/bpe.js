/* ============================================================
   token-ekg/engine/bpe.js — one more tokenizer, in plain JS.

   gpt-tokenizer covers OpenAI's tiktoken encodings. The local models
   this page streams from use other vocabularies, so one Hugging Face
   tokenizer.json model is re-implemented here from its file:

     ByteLevelBPE     Qwen3 (151,387 merges over a 256-symbol byte
                      alphabet, so 151,643 regular tokens, then 26
                      special ones; a regex pre-split, NFC first).
                      Same family as GPT-2 and tiktoken, different
                      merges.

   It follows the tokenizers library's BPE: repeatedly merge the
   adjacent pair with the lowest merge rank, leftmost first. The page's
   tokenizer check compares it against the Python tokenizers library
   on a fixed test set (data/tokenizer-reference.json).

   Pure: no DOM, no fetch. The parser takes the text of the data file.
   ============================================================ */

const utf8 = new TextEncoder();

/* GPT-2's byte-to-character table: printable bytes keep their character,
   the rest move to U+0100 and up. Index in ORDER = token id for the byte. */
function byteAlphabet() {
  const bs = [];
  for (let b = 33; b <= 126; b++) bs.push(b);
  for (let b = 161; b <= 172; b++) bs.push(b);
  for (let b = 174; b <= 255; b++) bs.push(b);
  const order = [...bs];
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) order.push(b);
  const idOfByte = new Uint32Array(256);
  order.forEach((b, i) => { idOfByte[b] = i; });
  return { order, idOfByte };
}

/** A min-heap of [rank, pos] used by the merge loop. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(r, p) {
    const a = this.a; a.push([r, p]);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] < r || (a[j][0] === r && a[j][1] <= p)) break;
      [a[i], a[j]] = [a[j], a[i]]; i = j;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        const lt = (x, y) => a[x][0] < a[y][0] || (a[x][0] === a[y][0] && a[x][1] < a[y][1]);
        if (l < a.length && lt(l, m)) m = l;
        if (r < a.length && lt(r, m)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

const KEY = (a, b) => a * 262144 + b; // ids stay under 2^18

/**
 * Merge a symbol sequence. ranks: Map(KEY(a,b) -> rank), result(rank, a, b) -> merged id.
 * Lowest rank first; among equal ranks the leftmost.
 */
function mergeAll(ids, ranks, result) {
  const n = ids.length;
  if (n < 2) return ids.slice();
  const sym = ids.slice();
  const prev = new Int32Array(n), next = new Int32Array(n), alive = new Uint8Array(n).fill(1);
  for (let i = 0; i < n; i++) { prev[i] = i - 1; next[i] = i + 1 < n ? i + 1 : -1; }
  const heap = new Heap();
  for (let i = 0; i + 1 < n; i++) {
    const r = ranks.get(KEY(sym[i], sym[i + 1]));
    if (r !== undefined) heap.push(r, i);
  }
  while (heap.size) {
    const [r, i] = heap.pop();
    const j = next[i];
    if (!alive[i] || j < 0 || !alive[j]) continue;
    if (ranks.get(KEY(sym[i], sym[j])) !== r) continue; // stale entry
    sym[i] = result(r, sym[i], sym[j]);
    alive[j] = 0;
    next[i] = next[j];
    if (next[j] >= 0) prev[next[j]] = i;
    const p = prev[i];
    if (p >= 0) { const rp = ranks.get(KEY(sym[p], sym[i])); if (rp !== undefined) heap.push(rp, p); }
    const q = next[i];
    if (q >= 0) { const rq = ranks.get(KEY(sym[i], sym[q])); if (rq !== undefined) heap.push(rq, i); }
  }
  const out = [];
  for (let i = 0; i >= 0 && i < n; i = next[i]) if (alive[i]) out.push(sym[i]);
  return out;
}

/** Split text around added (special) tokens, which encode as themselves. */
function splitSpecials(text, re, idOf) {
  if (!re) return [{ text }];
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ special: idOf.get(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseB36Pairs(lines, start) {
  const pairs = new Uint32Array((lines.length - start) * 2);
  let k = 0;
  for (let i = start; i < lines.length; i++) {
    const L = lines[i];
    if (!L) continue;
    const sp = L.indexOf(' ');
    pairs[k++] = parseInt(L.slice(0, sp), 36);
    pairs[k++] = parseInt(L.slice(sp + 1), 36);
  }
  return pairs.subarray(0, k);
}

/* ---------------- Qwen-style byte-level BPE ---------------- */
export function byteLevelFromText(id, text) {
  const lines = text.split('\n');
  const head = JSON.parse(lines[0]);
  const pairs = parseB36Pairs(lines, 1);
  const { idOfByte, order } = byteAlphabet();
  const ranks = new Map();
  const nMerges = pairs.length / 2;
  for (let k = 0; k < nMerges; k++) ranks.set(KEY(pairs[2 * k], pairs[2 * k + 1]), k);
  const result = (r) => 256 + r;
  // the pre-split pattern, with the case-insensitive contraction group spelled out for JS
  const src = head.pattern.replace("(?i:'s|'t|'re|'ve|'m|'ll|'d)", "'[sS]|'[tT]|'[rR][eE]|'[vV][eE]|'[mM]|'[lL][lL]|'[dD]");
  const split = new RegExp(src, 'gu');
  const specials = new Map(Object.entries(head.specials));
  const specialRe = specials.size ? new RegExp([...specials.keys()].sort((a, b) => b.length - a.length).map(esc).join('|'), 'g') : null;
  const specialBytes = new Map([...specials].map(([c, i]) => [i, utf8.encode(c)]));
  const cache = new Map();
  const bytesMemo = new Map();

  function bytesOf(t) {
    if (t < 256) return Uint8Array.of(order[t]);
    if (specialBytes.has(t)) return specialBytes.get(t);
    let b = bytesMemo.get(t);
    if (b) return b;
    const k = t - 256;
    const a = bytesOf(pairs[2 * k]), c = bytesOf(pairs[2 * k + 1]);
    b = new Uint8Array(a.length + c.length); b.set(a); b.set(c, a.length);
    bytesMemo.set(t, b);
    return b;
  }

  function encode(text) {
    const out = [];
    for (const part of splitSpecials(text.normalize('NFC'), specialRe, specials)) {
      if (part.special !== undefined) { out.push(part.special); continue; }
      for (const m of part.text.matchAll(split)) {
        const piece = m[0];
        let ids = cache.get(piece);
        if (!ids) {
          const bytes = utf8.encode(piece);
          ids = mergeAll(Array.from(bytes, (b) => idOfByte[b]), ranks, result);
          if (cache.size < 50000) cache.set(piece, ids);
        }
        for (const x of ids) out.push(x);
      }
    }
    return out;
  }
  return { id, encode, bytesOf, vocabularySize: head.vocabSize, source: head.source };
}
