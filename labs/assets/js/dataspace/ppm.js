/* ============================================================
   dataspace/ppm.js — an order-k PPM context model over bytes, pure.

   PPM (Cleary and Witten 1984) with method C escapes (Moffat 1990):
   in a context that has seen d distinct symbols over n occurrences,
   a seen symbol s costs -log2(c(s) / (n + d)) and an escape costs
   -log2(d / (n + d)). Symbols seen in a longer context are excluded
   from the shorter ones (full exclusion); after the order-0 context,
   a never-seen byte costs log2 of the bytes still possible. Counts
   are updated in every context from the order that coded the byte up
   to the maximum (update exclusion).

   The figure is the ideal code length, the sum of -log2 p over the
   bytes: what an arithmetic coder driven by this model would output,
   within a few bits. No coder runs here; nothing is decoded.

   prime(corpus) trains it on a reference text; bits(text) measures a
   text and then rolls the model back, so every measurement starts
   from the same primed state.
   ============================================================ */

const LOG2 = Math.log2;

export class PPM {
  constructor(order = 4) {
    this.order = Math.min(4, order);
    this.ctx = new Map();          // key -> { n, d, syms: Map<byte, count> }
    this.excl = new Int32Array(256);
    this.stamp = 0;
    this.hist = 0;                 // last 4 bytes, packed
    this.len = 0;                  // bytes seen
    this.undo = null;              // when set, every mutation is logged for rollback
  }

  /** Context key for order k: k in the high part, the last k bytes in the low 32 bits. Orders up to 4. */
  key(k) {
    if (k === 0) return 0;
    const mask = k === 4 ? 0xffffffff : (1 << (8 * k)) - 1;
    return k * 4294967296 + ((this.hist & mask) >>> 0);
  }

  /** Code one byte: returns its cost in bits and updates the model. */
  code(s) {
    const top = Math.min(this.order, this.len);
    const st = ++this.stamp;
    let bits = 0, found = -1, excluded = 0;
    for (let k = top; k >= 0; k--) {
      const c = this.ctx.get(this.key(k));
      if (!c) continue;
      let tot = 0, d = 0, cs = 0;
      for (const [sym, cnt] of c.syms) {
        if (this.excl[sym] === st) continue;
        tot += cnt; d++;
        if (sym === s) cs = cnt;
      }
      if (d === 0) continue;
      if (cs > 0) { bits -= LOG2(cs / (tot + d)); found = k; break; }
      bits -= LOG2(d / (tot + d));
      for (const sym of c.syms.keys()) if (this.excl[sym] !== st) { this.excl[sym] = st; excluded++; }
    }
    if (found < 0) bits += LOG2(256 - excluded);
    for (let k = Math.max(found, 0); k <= top; k++) this.bump(this.key(k), s);
    this.hist = ((this.hist << 8) | s) >>> 0;
    this.len++;
    return bits;
  }

  bump(key, s) {
    let c = this.ctx.get(key);
    if (!c) {
      c = { syms: new Map() };
      this.ctx.set(key, c);
      if (this.undo) this.undo.push([key, -1, 0]);
    }
    c.syms.set(s, (c.syms.get(s) || 0) + 1);
    if (this.undo) this.undo.push([key, s, 1]);
  }

  /** Train on a corpus (bytes). Returns the corpus's own adaptive cost in bits. */
  prime(bytes) {
    let bits = 0;
    for (let i = 0; i < bytes.length; i++) bits += this.code(bytes[i]);
    return bits;
  }

  /**
   * Measure bytes on top of the current state, adaptively, then restore the state.
   * Returns { bits, per: Float32Array of per-byte bits }.
   */
  measure(bytes) {
    const saved = { hist: this.hist, len: this.len };
    this.hist = 0; this.len = 0;   // the measured text starts fresh: no context borrowed from the corpus's last bytes
    this.undo = [];
    const per = new Float32Array(bytes.length);
    let bits = 0;
    for (let i = 0; i < bytes.length; i++) { per[i] = this.code(bytes[i]); bits += per[i]; }
    for (let i = this.undo.length - 1; i >= 0; i--) {
      const [key, s] = this.undo[i];
      const c = this.ctx.get(key);
      if (s < 0) { this.ctx.delete(key); continue; }
      const v = c.syms.get(s) - 1;
      if (v > 0) c.syms.set(s, v); else c.syms.delete(s);
    }
    this.undo = null;
    this.hist = saved.hist;
    this.len = saved.len;
    return { bits, per };
  }
}
