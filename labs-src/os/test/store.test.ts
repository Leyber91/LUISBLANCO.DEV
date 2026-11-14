import { describe, expect, it } from 'vitest';
import { DB_VERSION, MIGRATIONS, memoryStore, openStore } from '../store.js';
import type { Migration, Store } from '../store.js';
import { ev, freshIdb, idbStore } from './helpers.js';

const both: [string, () => Promise<Store>][] = [
  ['indexeddb', () => idbStore()],
  ['memory', async () => memoryStore()],
];

describe.each(both)('%s store: append-only log', (_kind, make) => {
  it('returns events in time order, ties in insertion order', async () => {
    const s = await make();
    await s.append(ev({ id: 'a', lab: 'hub', type: 'lab.open', t: 30 }));
    await s.append(ev({ id: 'b', lab: 'heptapod', type: 'lab.open', t: 10 }));
    await s.append(ev({ id: 'c', lab: 'hub', type: 'lab.leave', t: 30 }));
    expect((await s.events()).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('refuses a second event with the same id and keeps the first intact', async () => {
    const s = await make();
    await s.append(ev({ id: 'x', lab: 'hub', type: 'lab.open', t: 1, data: { n: 1 } }));
    await expect(s.append(ev({ id: 'x', lab: 'hub', type: 'lab.open', t: 2, data: { n: 2 } }))).rejects.toThrow();
    const all = await s.events();
    expect(all).toHaveLength(1);
    expect(all[0]?.data).toEqual({ n: 1 });
  });

  it('offers no way to change or remove a single event', () => {
    return make().then((s) => {
      const api = Object.getOwnPropertyNames(Object.getPrototypeOf(s));
      expect(api.filter((k) => /update|put(?!Progress)|delete|remove|edit|replace/i.test(k))).toEqual([]);
    });
  });

  it('hands out copies, so a caller cannot rewrite the log in place', async () => {
    const s = await make();
    await s.append(ev({ id: 'm', lab: 'hub', type: 'lab.open', t: 1, data: { n: 1 } }));
    const [first] = await s.events();
    (first!.data as { n: number }).n = 99;
    expect((await s.events())[0]?.data).toEqual({ n: 1 });
  });

  it('queries by lab and by time', async () => {
    const s = await make();
    for (const [id, lab, t] of [['1', 'hub', 5], ['2', 'heptapod', 6], ['3', 'hub', 7], ['4', 'hub', 9]] as const) {
      await s.append(ev({ id, lab, type: 'lab.action', t }));
    }
    expect((await s.events({ lab: 'hub' })).map((e) => e.id)).toEqual(['1', '3', '4']);
    expect((await s.events({ lab: 'hub', since: 6, until: 8 })).map((e) => e.id)).toEqual(['3']);
    expect((await s.events({ since: 6 })).map((e) => e.id)).toEqual(['2', '3', '4']);
  });

  it('keeps progress per lab and meta by key, and clears everything', async () => {
    const s = await make();
    await s.putProgress({ lab: 'heptapod', v: 1, data: { a: 1 }, updated: 1, resume: null, due: [], finished: false });
    await s.setMeta('visit.last', { t: 1, lab: 'hub' });
    await s.append(ev({ lab: 'hub', type: 'lab.open', t: 1 }));
    expect(await s.counts()).toEqual({ events: 1, progress: 1, meta: 1 });
    await s.clear();
    expect(await s.counts()).toEqual({ events: 0, progress: 0, meta: 0 });
  });
});

describe('opening', () => {
  it('opens IndexedDB at the current schema version with the three stores and both event indexes', async () => {
    const idb = freshIdb();
    const s = await openStore({ idb });
    expect(s.kind).toBe('indexeddb');
    expect(s.persistent).toBe(true);
    s.close();
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = idb.open('labs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['events', 'meta', 'progress']);
    const tx = db.transaction('events');
    expect([...tx.objectStore('events').indexNames].sort()).toEqual(['id', 'lab_t', 't']);
    db.close();
  });

  it('falls back to memory with persistent:false when there is no IndexedDB', async () => {
    const s = await openStore({ idb: null });
    expect(s.kind).toBe('memory');
    expect(s.persistent).toBe(false);
    expect(s.note).toMatch(/nothing is kept/);
    await s.append(ev({ lab: 'hub', type: 'lab.open', t: 1 }));
    expect(await s.counts()).toMatchObject({ events: 1 });
  });

  it('falls back to memory when opening throws (storage blocked)', async () => {
    const blocked = { open() { throw new DOMException('The operation is insecure.', 'SecurityError'); } } as unknown as IDBFactory;
    const s = await openStore({ idb: blocked });
    expect(s.kind).toBe('memory');
    expect(s.persistent).toBe(false);
    expect(s.note).toMatch(/insecure/);
  });

  it('falls back to memory when the open request errors (a private window)', async () => {
    const failing = {
      open() {
        const req = { result: undefined, error: new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError') } as unknown as IDBOpenDBRequest;
        setTimeout(() => (req.onerror as ((e: Event) => void) | null)?.(new Event('error')), 0);
        return req;
      },
    } as unknown as IDBFactory;
    const s = await openStore({ idb: failing });
    expect(s.kind).toBe('memory');
    expect(s.note).toMatch(/did not allow mutations/);
  });

  it('gives up on an open that never settles', async () => {
    const hanging = { open() { return {} as IDBOpenDBRequest; } } as unknown as IDBFactory;
    const s = await openStore({ idb: hanging, timeoutMs: 30 });
    expect(s.kind).toBe('memory');
    expect(s.note).toMatch(/did not open within 30 ms/);
  });
});

describe('schema migration', () => {
  it('walks an existing v1 database forward, keeping its records', async () => {
    const idb = freshIdb();
    const v1 = await openStore({ idb });
    await v1.append(ev({ id: 'old', lab: 'heptapod', type: 'lab.open', t: 100 }));
    await v1.putProgress({ lab: 'heptapod', v: 1, data: { logogram: 4 }, updated: 100, resume: null, due: [], finished: false });
    v1.close();

    let ran = 0;
    // a hypothetical step 1 -> 2: index events by session
    const step2: Migration = (_db, tx) => { ran++; tx.objectStore('events').createIndex('session', 'session'); };
    const v2 = await openStore({ idb, migrations: [...MIGRATIONS, step2] });
    expect(v2.kind).toBe('indexeddb');
    expect(ran).toBe(1);
    expect((await v2.events()).map((e) => e.id)).toEqual(['old']);
    expect((await v2.getProgress('heptapod'))?.data).toEqual({ logogram: 4 });
    v2.close();

    const db = await new Promise<IDBDatabase>((res) => { const r = idb.open('labs'); r.onsuccess = () => res(r.result); });
    expect(db.version).toBe(MIGRATIONS.length + 1);
    expect([...db.transaction('events').objectStore('events').indexNames]).toContain('session');
    db.close();

    // opening again at the same version runs nothing
    const again = await openStore({ idb, migrations: [...MIGRATIONS, step2] });
    expect(ran).toBe(1);
    again.close();
  });

  it('runs every step from zero for a new visitor', async () => {
    const order: number[] = [];
    const steps: Migration[] = [
      (db, tx) => { order.push(0); MIGRATIONS[0]!(db, tx); },
      () => { order.push(1); },
      () => { order.push(2); },
    ];
    const s = await openStore({ idb: freshIdb(), migrations: steps });
    expect(order).toEqual([0, 1, 2]);
    s.close();
  });
});
