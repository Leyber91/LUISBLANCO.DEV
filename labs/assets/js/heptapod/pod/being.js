/* ============================================================
   heptapod/pod/being.js — the being's learner of the visitor.

   The decoder is built from both sides. Each time the visitor
   raises a mark on the slate, the being counts which of its own
   concepts were in the ring it had just written. Its reading of a
   mark is the concept that was there most reliably when the mark
   was raised and absent when it was not:

       dP = P(concept | mark raised) - P(concept | mark not raised)

   so a concept that is in every ring (its word for whoever acts)
   wins nothing by being everywhere. Ties go to the rarer concept,
   then to the order object, act, party.

   The being has no English. If a visitor writes "cube" only while
   holding the cube near the glass, the being binds the mark to
   whatever of its own was constant across those rings, and in a
   species that splits the cube by place that is seldom the cube.
   [ILLUSTRATIVE: the being is invented; the statistic is computed]
   ============================================================ */

const CLASS_ORDER = { obj: 0, act: 1, party: 2 };

export class MarkLearner {
  constructor() {
    this.N = 0;                 // rings written so far
    this.base = new Map();      // concept id -> rings that carried it
    this.marks = new Map();     // mark -> { n, first, c: Map(concept id -> rings with the mark that carried it) }
  }

  /** The being wrote a ring carrying these concept ids. */
  see(ids) {
    this.N++;
    for (const id of new Set(ids)) this.base.set(id, (this.base.get(id) || 0) + 1);
  }

  /** The visitor raised a mark while a ring with these concept ids stood. */
  raise(mark, ids) {
    let m = this.marks.get(mark);
    if (!m) { m = { n: 0, first: this.marks.size, c: new Map() }; this.marks.set(mark, m); }
    m.n++;
    for (const id of new Set(ids)) m.c.set(id, (m.c.get(id) || 0) + 1);
  }

  /** Every concept the mark was ever raised with, best reading first. */
  ranked(mark) {
    const m = this.marks.get(mark);
    if (!m) return [];
    const rest = this.N - m.n;
    return [...m.c.entries()].map(([id, c]) => {
      const b = this.base.get(id) || c;
      const p1 = c / m.n, p0 = rest > 0 ? (b - c) / rest : 0;
      return { id, c, n: m.n, base: b, dp: p1 - p0 };
    }).sort((x, y) => (Math.abs(y.dp - x.dp) > 1e-9 ? y.dp - x.dp : 0) || x.base - y.base
      || CLASS_ORDER[x.id.slice(0, x.id.indexOf(':'))] - CLASS_ORDER[y.id.slice(0, y.id.indexOf(':'))]
      || (x.id < y.id ? -1 : 1));
  }

  reading(mark) { return this.ranked(mark)[0] || null; }

  /** The mark raised on the most rings, at least twice; the earliest wins a tie. */
  mostRepeated() {
    let best = null;
    for (const [mark, m] of this.marks) {
      if (m.n < 2) continue;
      if (!best || m.n > best.n || (m.n === best.n && m.first < best.first)) best = { mark, n: m.n, first: m.first };
    }
    return best ? best.mark : null;
  }
}
