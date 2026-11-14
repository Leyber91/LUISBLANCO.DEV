/* ============================================================
   dataspace/bpe.js — the GPT-2 byte-level BPE tokenizer, pure.

   Vocabulary: the 50,000 merge ranks OpenAI released with GPT-2
   (Radford et al. 2019, MIT licence), bundled as
   labs/assets/data/dataspace/gpt2-merges.txt, fetched from
   huggingface.co/openai-community/gpt2 (merges.txt, sha256
   1ce16647...26adc5) on 2026-11-11.

   The algorithm is GPT-2's encoder.py: split the text with the
   GPT-2 pattern, map each UTF-8 byte to a printable code point
   (bytes_to_unicode), then merge the lowest-ranked adjacent pair,
   all occurrences at once, until no ranked pair remains.
   Checked against the Hugging Face tokenizers library in tests.mjs.
   No DOM, no I/O.
   ============================================================ */

export const GPT2_PATTERN = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/* GPT-2 bytes_to_unicode: printable bytes map to themselves, the rest to 256 + n. */
export function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; }
  const map = new Array(256);
  bs.forEach((b, i) => { map[b] = String.fromCharCode(cs[i]); });
  return map;
}

const B2U = bytesToUnicode();
const U2B = new Map(B2U.map((ch, b) => [ch, b]));
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: false });

export class BPE {
  /** mergesText: the merges.txt file; its first line is a "#version" header. */
  constructor(mergesText) {
    this.ranks = new Map();
    const lines = mergesText.split('\n');
    let r = 0;
    for (const line of lines) {
      if (!line || line.startsWith('#version')) continue;
      const l = line.replace(/\r$/, '');
      if (!l) continue;
      this.ranks.set(l, r++);
    }
    this.size = r;
    this.cache = new Map();
  }

  /** BPE over one pre-token already mapped to byte symbols. Returns the merged symbols. */
  bpe(word) {
    const hit = this.cache.get(word);
    if (hit) return hit;
    let parts = Array.from(word);
    while (parts.length > 1) {
      let best = Infinity, bi = -1;
      for (let i = 0; i < parts.length - 1; i++) {
        const rk = this.ranks.get(parts[i] + ' ' + parts[i + 1]);
        if (rk !== undefined && rk < best) { best = rk; bi = i; }
      }
      if (bi < 0) break;
      const a = parts[bi], b = parts[bi + 1];
      const out = [];
      for (let i = 0; i < parts.length;) {
        if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) { out.push(a + b); i += 2; }
        else { out.push(parts[i]); i++; }
      }
      parts = out;
    }
    if (this.cache.size < 50000) this.cache.set(word, parts);
    return parts;
  }

  /**
   * Tokens with their character spans in the original string.
   * Returns [{ s: symbol (GPT-2 vocabulary string), t: decoded text, a: char start, b: char end }].
   * A token that ends inside a multi-byte character owns that character's span from its first byte.
   */
  encode(text) {
    const out = [];
    for (const m of String(text).matchAll(GPT2_PATTERN)) {
      const piece = m[0];
      const start = m.index;
      const bytes = enc.encode(piece);
      // byte offset -> char offset (UTF-16 index) inside this piece
      const charAtByte = new Int32Array(bytes.length + 1);
      let bi = 0, ci = 0;
      for (const ch of piece) {
        const n = enc.encode(ch).length;
        for (let k = 0; k < n; k++) charAtByte[bi + k] = ci;
        bi += n; ci += ch.length;
      }
      charAtByte[bytes.length] = piece.length;
      let mapped = '';
      for (const b of bytes) mapped += B2U[b];
      let off = 0;
      for (const sym of this.bpe(mapped)) {
        const len = sym.length; // one mapped code unit per byte
        const sb = new Uint8Array(len);
        for (let k = 0; k < len; k++) sb[k] = U2B.get(sym[k]);
        const a = start + charAtByte[off];
        const endByte = off + len;
        // end: the first char boundary at or after endByte
        let b = start + (endByte >= bytes.length ? piece.length : charAtByte[endByte]);
        if (b <= a && endByte < bytes.length) b = a; // a token inside one character
        out.push({ s: sym, t: dec.decode(sb), a, b });
        off += len;
      }
    }
    return out;
  }

  count(text) { return this.encode(text).length; }
}

/** Without the merge file: the GPT-2 pre-tokenizer pieces alone (an upper bound on the BPE token count). */
export function pretokenize(text) {
  const out = [];
  for (const m of String(text).matchAll(GPT2_PATTERN)) {
    let mapped = '';
    for (const b of enc.encode(m[0])) mapped += B2U[b];
    out.push({ s: mapped, t: m[0], a: m.index, b: m.index + m[0].length });
  }
  return out;
}
