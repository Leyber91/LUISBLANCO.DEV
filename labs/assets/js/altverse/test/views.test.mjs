/* ============================================================
   altverse/test/views.test.mjs — the two pre-publish defects,
   headless. Run from the repository root:
     node labs/assets/js/altverse/test/views.test.mjs
   No dependencies. Exit code 1 on any failure. Kept apart from
   engine.test.mjs because it stubs window, document and storage.

   1. the map's ignition: a requestAnimationFrame timestamp earlier
      than the ignite time (measured in Chrome: up to about 580 ms
      earlier) gave arc() a negative radius and an IndexSizeError.
      The real MapView.frame() runs against a 2D context that
      throws exactly as Chrome's does on a negative radius.
   2. saved worlds: an example's text woven on another seed was
      saved but never listed, so it could not be reopened. Every
      saved world is listed, and its hash rebuilds the same world.
   ============================================================ */

import assert from 'node:assert/strict';

/* ---- a browser just large enough for the map view ---- */
const drawn = { arcs: 0, negative: [], nonFinite: 0 };
class IndexSizeError extends Error { constructor(m) { super(m); this.name = 'IndexSizeError'; } }
globalThis.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
function fakeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'arc') return (x, y, r) => {
        drawn.arcs++;
        // Chrome: "Failed to execute 'arc' on 'CanvasRenderingContext2D': The radius provided (r) is negative."
        if (r < 0) { drawn.negative.push(r); throw new IndexSizeError(`The radius provided (${r}) is negative.`); }
        if (!Number.isFinite(r)) drawn.nonFinite++;
      };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'createImageData') return (w, h) => new ImageData(w, h);
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function fakeCanvas() {
  return {
    width: 0, height: 0, clientWidth: 900, clientHeight: 450, style: {}, parentElement: null,
    addEventListener() {}, setAttribute() {}, toBlob() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 450 }),
    getContext: () => fakeCtx(),
  };
}
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.document = { createElement: () => fakeCanvas(), hidden: false };
globalThis.location = globalThis.location || { protocol: 'http:', hostname: 'example.com', href: 'http://example.com/labs/altverse.html' };

/* ---- storage: a Map, and a switch that makes it throw like a blocked one ---- */
const mem = new Map();
let blocked = false;
const guard = () => { if (blocked) throw new Error('SecurityError: storage is blocked'); };
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() { guard(); return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) }; },
});

const { weave } = await import('../engine.js');
const { TIMING } = await import('../config.js');
const { PRESETS, DEFAULT_SEED } = await import('../divergence-presets.js');
const { encodeHash, decodeHash } = await import('../tree.js');
const { remember, recent, shelf, RECENT_MAX } = await import('../store.js');
const { MapView, revealAt, arcR } = await import('../render/map-view.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.message || e).split('\n')[0]); }
}
const root = (text) => [{ text, eventId: null, year: null }];   // the path shape main.js weaves

console.log('1. the map ignition never hands arc() a negative radius');
{
  const D = TIMING.ignition;
  t('revealAt: a frame stamped before the ignite time is 0, not negative', () => { assert.equal(revealAt(1000 - 16, 1000, D), 0); assert.equal(revealAt(1000 - 580, 1000, D), 0); });
  t('revealAt: halfway is 0.5, past the end is 1, no ignition is 1', () => { assert.equal(revealAt(1000 + D / 2, 1000, D), 0.5); assert.equal(revealAt(1000 + 5 * D, 1000, D), 1); assert.equal(revealAt(5, 0, D), 1); });
  t('revealAt: a time that is not a number counts as finished', () => { assert.equal(revealAt(NaN, 1000, D), 1); assert.equal(revealAt(undefined, 1000, D), 1); });
  t('arcR: negative, NaN and infinite radii become 0; a positive one passes', () => { assert.deepEqual([-1489.88, NaN, Infinity, -0.0001].map(arcR), [0, 0, 0, 0]); assert.equal(arcR(6), 6); });
  t('the unclamped formula this replaces was negative 16 ms early (the defect)', () => assert.ok(1 - Math.pow(1 - (-16 / D), 3) < 0));

  const worlds = [
    ['ice sinks (terrain, routes, settlements)', weave(DEFAULT_SEED, root(PRESETS[0].text))],
    ['light / 10 (no ground: the nuclide chart)', weave(DEFAULT_SEED, root(PRESETS[1].text))],
  ];
  for (const [label, w] of worlds) {
    for (const mode of ['terrain', 'isotherm', 'ours']) {
      t(`frame() across the ignition, ${label}, ${mode} view: no throw, no negative or non-finite radius`, () => {
        drawn.negative.length = 0; drawn.nonFinite = 0;
        const mv = new MapView(fakeCanvas(), {});
        mv.mode = mode;
        mv.setWorld(w, { ignite: true });
        const ig = mv.ignite;
        assert.ok(ig > 0, 'setWorld should start an ignition');
        // the measured failure: rAF timestamps 16 ms and 580 ms before the ignite time
        mv.frame(ig - 16); mv.frame(ig - 580);
        for (let tt = ig - 2000; tt <= ig + D + 400; tt += 13) mv.frame(tt);
        mv.cursor = 0; mv.frame(ig + D + 500);
        assert.deepEqual(drawn.negative, []);
        assert.equal(drawn.nonFinite, 0);
        assert.equal(mv.ignite, 0, 'the ignition ends once reveal reaches 1');
      });
    }
  }
  t('frame() with a timestamp before the view was built (t < t0) and at t = 0', () => {
    drawn.negative.length = 0;
    const mv = new MapView(fakeCanvas(), {});
    mv.setWorld(worlds[0][1], { ignite: true });
    mv.frame(0); mv.frame(mv.t0 - 1000);
    assert.deepEqual(drawn.negative, []);
  });
  t('reduced motion: no ignition, one static frame', () => {
    drawn.negative.length = 0;
    const mv = new MapView(fakeCanvas(), { reduced: true });
    mv.setWorld(worlds[0][1], { ignite: true });
    assert.equal(mv.ignite, 0);
    mv.frame(0);
    assert.deepEqual(drawn.negative, []);
  });
  t('the frames above drew arcs at all (the context stub is live)', () => assert.ok(drawn.arcs > 100, String(drawn.arcs)));
}

console.log('2. every saved world is listed and reopens');
{
  const text = PRESETS[0].text;
  const otherSeed = 77;
  const wA = weave(DEFAULT_SEED, root(text));
  const wB = weave(otherSeed, root(text));
  const ev = wA.stages.history.events.find((e) => e.id === 'ev-writing');
  const wF = weave(DEFAULT_SEED, [...wA.path, { text: 'The steam engine is invented in 300 BCE.', eventId: ev.id, year: ev.year }], wA);
  const hA = encodeHash(wA), hB = encodeHash(wB), hF = encodeHash(wF);
  mem.clear();
  remember(wA, hA); remember(wF, hF); remember(wB, hB);

  /* what boot() does with a hash: weave the root, then each fork at its event's year */
  const replay = (hash) => {
    const h = decodeHash(hash);
    let cur = weave(h.seed, root(h.root));
    for (const f of h.forks) {
      const e = cur.stages.history.events.find((x) => x.id === f.eventId);
      if (!e) break;
      cur = weave(h.seed, [...cur.path, { text: f.text, eventId: f.eventId, year: e.year }], cur);
    }
    return cur;
  };

  const chips = shelf(PRESETS, recent(), { activeText: text, currentHash: hB, defaultSeed: DEFAULT_SEED });
  const saved = chips.filter((c) => c.kind === 'saved');
  t('the examples are all still on the shelf', () => assert.equal(chips.filter((c) => c.kind === 'preset').length, PRESETS.length));
  t('an example woven on another seed is listed (the defect)', () => assert.ok(saved.some((c) => c.hash === hB)));
  t('the same example on the default seed is listed too', () => assert.ok(saved.some((c) => c.hash === hA)));
  t('a fork of an example is listed', () => assert.ok(saved.some((c) => c.hash === hF)));
  t('listed = saved: one chip per stored world, newest first', () => assert.deepEqual(saved.map((c) => c.hash), [hB, hF, hA]));
  t('the chip names the seed only when it is not the default', () => { assert.equal(saved.find((c) => c.hash === hB).seedNote, `seed ${otherSeed}`); assert.equal(saved.find((c) => c.hash === hA).seedNote, ''); });
  t('only the world on screen is pressed', () => assert.deepEqual(saved.filter((c) => c.pressed).map((c) => c.hash), [hB]));
  t('two worlds with one text are told apart by seed, not hidden', () => assert.notEqual(saved.find((c) => c.hash === hA).seed, saved.find((c) => c.hash === hB).seed));
  for (const [label, w, h] of [['the other-seed example', wB, hB], ['the default-seed example', wA, hA], ['the fork', wF, hF]]) {
    t(`reopen ${label}: its hash rebuilds the same world (id, name, map)`, () => {
      const r = replay(saved.find((c) => c.hash === h).hash);
      assert.equal(r.id, w.id); assert.equal(r.name, w.name);
      assert.equal(r.ctx.ter.stats.landFrac, w.ctx.ter.stats.landFrac);
    });
  }

  t(`the store keeps ${RECENT_MAX} and the shelf lists all ${RECENT_MAX}`, () => {
    mem.clear();
    for (let s = 1; s <= RECENT_MAX + 3; s++) { const fake = { seed: s, name: `W${s}`, path: root(text) }; remember(fake, encodeHash(fake)); }
    const stored = JSON.parse(mem.get('altverse:recent:v2'));
    const listed = shelf(PRESETS, recent(), {}).filter((c) => c.kind === 'saved');
    assert.equal(stored.length, RECENT_MAX);
    assert.deepEqual(listed.map((c) => c.hash), stored.map((r) => r.hash));
  });
  t('old storage (12 entries, one broken) lists what can be reopened, capped, and the next save trims it', () => {
    mem.clear();
    const old = Array.from({ length: 12 }, (_, i) => ({ hash: encodeHash({ seed: 100 + i, path: root(text) }), name: `Old${i}`, text }));
    old.splice(3, 0, { name: 'broken' }, { hash: '#nothing', name: 'empty' });
    mem.set('altverse:recent:v2', JSON.stringify(old));
    const r = recent();
    assert.equal(r.length, RECENT_MAX);
    assert.ok(r.every((x) => decodeHash(x.hash)));
    remember(wA, hA);
    assert.equal(JSON.parse(mem.get('altverse:recent:v2')).length, RECENT_MAX);
  });
  t('blocked storage: nothing saved, nothing listed, nothing thrown', () => {
    blocked = true;
    try { remember(wA, hA); assert.deepEqual(recent(), []); assert.equal(shelf(PRESETS, recent(), {}).filter((c) => c.kind === 'saved').length, 0); }
    finally { blocked = false; }
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
