import { describe, expect, it } from 'vitest';
import { BUILTIN_EVENTS, MAX_DATA_BYTES, Registry, Tracker } from '../events.js';
import { memoryStore } from '../store.js';
import { clock } from './helpers.js';

function setup() {
  const c = clock();
  const store = memoryStore();
  const registry = new Registry();
  let n = 0;
  const tracker = new Tracker({ store, registry, session: 'S1', now: c.now, id: () => `id${++n}` });
  return { c, store, registry, tracker };
}

describe('registry', () => {
  it('starts with the built-in types and their classes', () => {
    const r = new Registry();
    expect(r.types().sort()).toEqual(['lab.action', 'lab.error', 'lab.handoff', 'lab.leave', 'lab.open', 'lab.outcome']);
    expect(r.get('lab.open')?.cls).toBe('session');
    expect(r.get('lab.outcome')?.cls).toBe('outcome');
    expect(r.get('lab.error')?.cls).toBe('error');
    expect(Object.isFrozen(BUILTIN_EVENTS)).toBe(true);
  });

  it('registers a lab type under its own prefix', () => {
    const r = new Registry();
    r.register('heptapod.decoded', { cls: 'outcome', throttleMs: 0 });
    expect(r.get('heptapod.decoded')).toEqual({ cls: 'outcome', throttleMs: 0 });
  });

  it.each([
    ['decoded', /must look like/],
    ['Heptapod.Decoded', /must look like/],
    ['lab.custom', /reserved/],
    ['lab.open', /reserved/],
  ])('refuses the name %s', (name, msg) => {
    expect(() => new Registry().register(name, { cls: 'action' })).toThrow(msg);
  });

  it('refuses a duplicate, an unknown class and a bad throttle', () => {
    const r = new Registry();
    r.register('memes.slate', { cls: 'action' });
    expect(() => r.register('memes.slate', { cls: 'action' })).toThrow(/already registered/);
    expect(() => r.register('memes.vote', { cls: 'click' as never })).toThrow(/unknown class/);
    expect(() => r.register('memes.score', { cls: 'outcome', throttleMs: -1 })).toThrow(/bad throttle/);
    expect(() => r.register('memes.score', { cls: 'outcome', throttleMs: Number.NaN })).toThrow(/bad throttle/);
  });
});

describe('track', () => {
  it('appends { v, id, t, lab, type, data, session }', async () => {
    const { tracker, store } = setup();
    const r = await tracker.track('heptapod', 'lab.outcome', { logograms: 4 });
    expect(r.ok).toBe(true);
    expect(await store.events()).toEqual([
      { v: 1, id: 'id1', t: expect.any(Number), lab: 'heptapod', type: 'lab.outcome', data: { logograms: 4 }, session: 'S1' },
    ]);
  });

  it('refuses an unregistered type and a bad lab id without throwing', async () => {
    const { tracker, store } = setup();
    expect(await tracker.track('heptapod', 'heptapod.nope')).toMatchObject({ ok: false, reason: 'unknown-type' });
    expect(await tracker.track('Hepta Pod', 'lab.open')).toMatchObject({ ok: false, reason: 'bad-lab' });
    expect(await tracker.track('', 'lab.open')).toMatchObject({ ok: false, reason: 'bad-lab' });
    expect(await store.counts()).toMatchObject({ events: 0 });
  });

  it('accepts data of exactly 2 KB and refuses one byte more', async () => {
    const { tracker } = setup();
    const base = JSON.stringify({ s: '' }).length;                     // {"s":""} is 8 bytes
    const fits = { s: 'a'.repeat(MAX_DATA_BYTES - base) };
    const over = { s: 'a'.repeat(MAX_DATA_BYTES - base + 1) };
    expect(JSON.stringify(fits).length).toBe(2048);
    expect((await tracker.track('hub', 'lab.outcome', fits)).ok).toBe(true);
    const r = await tracker.track('hub', 'lab.outcome', over);
    expect(r).toMatchObject({ ok: false, reason: 'too-large' });
    expect(!r.ok && r.detail).toMatch(/2049 bytes; the cap is 2048/);
  });

  it('measures the cap in UTF-8 bytes, not characters', async () => {
    const { tracker } = setup();
    const r = await tracker.track('hub', 'lab.outcome', { s: 'é'.repeat(1100) });   // 1100 characters, 2200 bytes
    expect(r).toMatchObject({ ok: false, reason: 'too-large' });
  });

  it('refuses data that is not a plain JSON object', async () => {
    const { tracker } = setup();
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(await tracker.track('hub', 'lab.action', [1, 2] as unknown as object)).toMatchObject({ reason: 'bad-data' });
    expect(await tracker.track('hub', 'lab.action', cyclic)).toMatchObject({ reason: 'bad-data' });
    expect(await tracker.track('hub', 'lab.action', { big: 1n } as unknown as object)).toMatchObject({ reason: 'bad-data' });
  });

  it('stores a JSON copy, dropping what JSON drops', async () => {
    const { tracker, store } = setup();
    await tracker.track('hub', 'lab.outcome', { a: 1, gone: undefined, fn: () => 1 });
    expect((await store.events())[0]?.data).toEqual({ a: 1 });
  });

  it('throttles per lab and type, and lets the next one through after the window', async () => {
    const { tracker, c, store } = setup();
    expect((await tracker.track('hub', 'lab.action', { n: 1 })).ok).toBe(true);
    c.tick(100);
    expect(await tracker.track('hub', 'lab.action', { n: 2 })).toMatchObject({ ok: false, reason: 'throttled' });
    expect((await tracker.track('heptapod', 'lab.action', { n: 3 })).ok).toBe(true);   // another lab has its own window
    expect((await tracker.track('hub', 'lab.outcome', { n: 4 })).ok).toBe(true);      // throttle 0
    c.tick(150);                                                                       // 250 ms after the first
    expect((await tracker.track('hub', 'lab.action', { n: 5 })).ok).toBe(true);
    expect((await store.events()).map((e) => e.data?.['n'])).toEqual([1, 3, 4, 5]);
  });

  it('throttles a burst fired in the same tick', async () => {
    const { tracker, store } = setup();
    const results = await Promise.all([1, 2, 3].map((n) => tracker.track('hub', 'lab.error', { n })));
    expect(results.map((r) => r.ok)).toEqual([true, false, false]);
    expect(await store.counts()).toMatchObject({ events: 1 });
  });

  it('records nothing after halt', async () => {
    const { tracker, store } = setup();
    tracker.halt();
    expect(await tracker.track('hub', 'lab.open')).toMatchObject({ ok: false, reason: 'halted' });
    expect(await store.counts()).toMatchObject({ events: 0 });
  });

  it('reports a store failure instead of throwing', async () => {
    const { registry } = setup();
    const broken = memoryStore();
    broken.append = async () => { throw new Error('quota exceeded'); };
    const t = new Tracker({ store: broken, registry, session: 'S' });
    expect(await t.track('hub', 'lab.open')).toMatchObject({ ok: false, reason: 'store-failed', detail: 'quota exceeded' });
  });
});
