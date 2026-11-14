import { describe, expect, it } from 'vitest';
import { EXTRA_STORES, WITHHELD, browserStorage, eraseExtras, exportExtras, findExtras } from '../extras.js';
import type { ExtraStore, KeyValue } from '../extras.js';
import { deleteAll, exportAll, summary } from '../privacy.js';
import { memoryStore } from '../store.js';
import { LabsOS } from '../index.js';
import { T0 } from './helpers.js';

/** A plain object behind the Web Storage calls the code makes. `stuck` names keys that will not go. */
function fakeStorage(init: Record<string, string>, stuck: readonly string[] = []): KeyValue & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    removeItem: (k) => { if (!stuck.includes(k)) map.delete(k); },
  };
}

const OWN = JSON.stringify({ base: 'https://api.example.test/v1', key: 'sk-test-0000', model: 'm-1' });
const full = (): Record<string, string> => ({
  'lb.llm.ownkey': OWN,
  'lb.llm.pollReadyAt': '1763100000000',
  'altverse:index': JSON.stringify([{ id: 'w1', title: 'One' }, { id: 'w2', title: 'Two' }]),
  'altverse:world:w1': JSON.stringify({ title: 'One' }),
  'altverse:world:w2': JSON.stringify({ title: 'Two' }),
  'lb.tokenekg.traces.v1': JSON.stringify([{ id: 't', promptPreview: 'what I typed' }]),
  'lb.trending.history': JSON.stringify({ format: 'lb.trending.history', version: 2, scans: [] }),
  'lb.hd.route': JSON.stringify({ route: 'worker', model: 'x', ms: 900, ts: 1 }),
  'exo:saved': JSON.stringify(['Kepler-62 e']),
  'b720.theme': 'dark',
  'b720-token': 'ghp_not_a_real_token',
  'something:else': 'left alone',
  'altverse': 'a key that only looks like the prefix',
});

describe('the list of stores', () => {
  it('names every store once, each with a key or a prefix, and no prefix swallows another store', () => {
    const ids = EXTRA_STORES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of EXTRA_STORES) {
      expect(s.keys.length + s.prefixes.length, s.id).toBeGreaterThan(0);
      expect(s.name.length, s.id).toBeGreaterThan(8);
      for (const p of s.prefixes) expect(p.length, `${s.id} prefix "${p}"`).toBeGreaterThanOrEqual(5);
    }
    const all = EXTRA_STORES.flatMap((s) => [...s.keys, ...s.prefixes].map((k) => ({ id: s.id, k })));
    for (const a of all) for (const b of EXTRA_STORES) {
      if (a.id === b.id) continue;
      expect(b.prefixes.some((p) => a.k.startsWith(p)), `${a.k} of ${a.id} falls under a prefix of ${b.id}`).toBe(false);
    }
  });

  it('keeps the model key out of every export and leaves Claude Prep to Claude Prep', () => {
    expect(EXTRA_STORES.find((s) => s.id === 'model-key')).toMatchObject({ keys: ['lb.llm.ownkey'], secret: ['key'], managedHere: true });
    expect(EXTRA_STORES.find((s) => s.id === 'claude-prep')).toMatchObject({ managedHere: false });
    expect(EXTRA_STORES.filter((s) => !s.managedHere).map((s) => s.id)).toEqual(['claude-prep']);
  });
});

describe('finding what the labs kept', () => {
  it('reports each store that holds something, with its entries and size', () => {
    const found = findExtras(fakeStorage(full()));
    expect(found.map((f) => [f.id, f.entries, f.managedHere])).toEqual([
      ['model-key', 1, true], ['model-wait', 1, true], ['altverse-worlds', 3, true], ['token-ekg-traces', 1, true],
      ['trending-history', 1, true], ['honesty-route', 1, true], ['exomania-saved', 1, true], ['claude-prep', 2, false],
    ]);
    expect(found[0]?.chars).toBe('lb.llm.ownkey'.length + OWN.length);
  });

  it('reports nothing for an empty store, for no store, and for keys that are nobody\'s', () => {
    expect(findExtras(fakeStorage({}))).toEqual([]);
    expect(findExtras(null)).toEqual([]);
    expect(findExtras(fakeStorage({ 'something:else': 'x', altverse: 'x', 'altverse:worl': 'x', b720: 'x' }))).toEqual([]);
  });

  it('matches a prefix only at the start of a key', () => {
    expect(findExtras(fakeStorage({ 'x-altverse:world:w1': '1', 'my.b720.theme': '1' }))).toEqual([]);
    expect(findExtras(fakeStorage({ 'altverse:world:': '1' })).map((f) => f.id)).toEqual(['altverse-worlds']);
  });

  it('survives a store that throws', () => {
    const bad: KeyValue = { get length(): number { throw new Error('blocked'); }, key: () => null, getItem: () => null, removeItem: () => {} };
    expect(findExtras(bad)).toEqual([]);
    expect(exportExtras(bad)).toEqual([]);
    expect(eraseExtras(bad)).toEqual({ removed: 0, remaining: 0, left: [] });
  });
});

describe('exporting what the labs kept', () => {
  it('writes every managed entry as JSON and leaves the typed key out', () => {
    const out = exportExtras(fakeStorage(full()));
    expect(out.map((x) => x.id)).toEqual(['model-key', 'model-wait', 'altverse-worlds', 'token-ekg-traces', 'trending-history', 'honesty-route', 'exomania-saved']);
    expect(out[0]).toEqual({
      id: 'model-key', lab: null, name: 'your own model key, with its address and model', withheld: ['key'],
      entries: [{ key: 'lb.llm.ownkey', value: { base: 'https://api.example.test/v1', key: WITHHELD, model: 'm-1' } }],
    });
    expect(JSON.stringify(out)).not.toContain('sk-test-0000');
    expect(JSON.stringify(out)).not.toContain('ghp_not_a_real_token');         // Claude Prep's store is not exported at all
    expect(out[2]?.entries.map((e) => e.key)).toEqual(['altverse:index', 'altverse:world:w1', 'altverse:world:w2']);
    expect(out[1]?.entries[0]?.value).toBe(1763100000000);
  });

  it('exports text that is not JSON as text, and withholds a secret store whose value has no fields', () => {
    const out = exportExtras(fakeStorage({ 'lb.hd.route': 'not json {', 'lb.llm.ownkey': 'sk-bare-secret' }));
    expect(out.find((x) => x.id === 'honesty-route')?.entries[0]?.value).toBe('not json {');
    expect(out.find((x) => x.id === 'model-key')?.entries[0]?.value).toBe(WITHHELD);
    expect(JSON.stringify(out)).not.toContain('sk-bare-secret');
    const arr = exportExtras(fakeStorage({ 'lb.llm.ownkey': JSON.stringify(['sk-in-a-list']) }));
    expect(JSON.stringify(arr)).not.toContain('sk-in-a-list');
  });

  it('withholds only the named field, at the top of the object', () => {
    const stores: ExtraStore[] = [{ id: 's', lab: null, name: 'a test store', keys: ['k'], prefixes: [], secret: ['key'], managedHere: true }];
    const out = exportExtras(fakeStorage({ k: JSON.stringify({ key: 'A', keys: 'B', nested: { key: 'C' } }) }), stores);
    expect(out[0]?.entries[0]?.value).toEqual({ key: WITHHELD, keys: 'B', nested: { key: 'C' } });
  });
});

describe('erasing what the labs kept', () => {
  it('removes every managed key, leaves Claude Prep and strangers, and counts again', () => {
    const ls = fakeStorage(full());
    const r = eraseExtras(ls);
    expect(r.removed).toBe(9);
    expect(r.remaining).toBe(0);
    expect(r.left.map((f) => [f.id, f.entries])).toEqual([['claude-prep', 2]]);
    expect([...ls.map.keys()].sort()).toEqual(['altverse', 'b720-token', 'b720.theme', 'something:else']);
  });

  it('says what would not go', () => {
    const ls = fakeStorage(full(), ['lb.llm.ownkey', 'altverse:world:w2']);
    const r = eraseExtras(ls);
    expect(r).toMatchObject({ removed: 7, remaining: 2 });
    expect(ls.map.has('lb.llm.ownkey')).toBe(true);
  });

  it('removes nothing from an empty store', () => {
    expect(eraseExtras(fakeStorage({}))).toEqual({ removed: 0, remaining: 0, left: [] });
  });
});

describe('the three rights reach the labs\' stores', () => {
  it('summary, export and delete carry them when handed the browser\'s storage, and ignore them when not', async () => {
    const store = memoryStore();
    const ls = fakeStorage(full());
    expect((await summary(store)).extras).toEqual([]);
    expect((await summary(store, ls)).extras.map((x) => x.id)).toContain('model-key');
    expect((await exportAll(store, () => T0)).extras).toEqual([]);
    const file = await exportAll(store, () => T0, ls);
    expect(file.extras.length).toBe(7);
    expect(JSON.stringify(file)).not.toContain('sk-test-0000');
    const untouched = await deleteAll(store);
    expect(untouched.extras).toEqual({ removed: 0, remaining: 0, left: [] });
    expect(ls.map.has('lb.llm.ownkey')).toBe(true);
    const r = await deleteAll(store, { extras: ls });
    expect(r.ok).toBe(true);
    expect(r.extras).toMatchObject({ removed: 9, remaining: 0 });
    expect(ls.map.has('lb.llm.ownkey')).toBe(false);
  });

  it('a delete that leaves a lab\'s key behind is not ok', async () => {
    const r = await deleteAll(memoryStore(), { extras: fakeStorage(full(), ['lb.tokenekg.traces.v1']) });
    expect(r.ok).toBe(false);
    expect(r.extras.remaining).toBe(1);
  });

  it('the platform erases the model key with the record, and a fixture touches nothing', async () => {
    const ls = fakeStorage(full());
    const os = await LabsOS.init({ lab: 'hub', idb: null, lifecycle: false, ui: false, fixture: null, extras: ls, config: { transport: null } });
    expect((await os.privacy.summary()).extras.find((x) => x.id === 'model-key')?.entries).toBe(1);
    const out = await os.privacy.deleteAll();
    expect(out.ok).toBe(true);
    expect(ls.map.has('lb.llm.ownkey')).toBe(false);
    expect(ls.map.has('b720-token')).toBe(true);
    LabsOS.reset();                                   // one page is one instance: forget it before the next

    const ls2 = fakeStorage(full());
    const demo = await LabsOS.init({ lab: 'hub', idb: null, lifecycle: false, ui: false, fixture: 'returning', extras: ls2, config: { transport: null } });
    expect((await demo.privacy.summary()).extras).toEqual([]);
    await demo.privacy.deleteAll();
    expect(ls2.map.has('lb.llm.ownkey')).toBe(true);
    LabsOS.reset();
  });

  it('browserStorage returns the page\'s localStorage, or null where there is none', () => {
    const ls = browserStorage();
    expect(ls === null || typeof ls.getItem === 'function').toBe(true);
  });
});
