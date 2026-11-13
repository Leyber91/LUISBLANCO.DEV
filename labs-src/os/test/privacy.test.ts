import { describe, expect, it } from 'vitest';
import { deleteAll, exportAll, summary } from '../privacy.js';
import { Progress } from '../progress.js';
import type { Store } from '../store.js';
import { memoryStore } from '../store.js';
import { ev, idbStore, T0 } from './helpers.js';

async function seeded(store: Store): Promise<Store> {
  await store.append(ev({ id: 'p1', lab: 'hub', type: 'lab.open', t: T0 - 1000 }));
  await store.append(ev({ id: 'p2', lab: 'heptapod', type: 'lab.outcome', t: T0, data: { logograms: 4 } }));
  await new Progress(store, () => T0).set('heptapod', { logogram: 4 });
  await store.setMeta('visit.last', { t: T0, lab: 'heptapod' });
  return store;
}

describe.each([
  ['indexeddb', () => idbStore()],
  ['memory', async () => memoryStore()],
])('%s: data rights', (_k, make) => {
  it('exportAll returns every stored record as JSON', async () => {
    const store = await seeded(await make());
    const file = await exportAll(store, () => T0);
    expect(file).toMatchObject({
      format: 'labs-os-export', v: 1, exported: new Date(T0).toISOString(),
      counts: { events: 2, progress: 1, meta: 1 },
      meta: { 'visit.last': { t: T0, lab: 'heptapod' } },
    });
    expect(file.events.map((e) => e.id)).toEqual(['p1', 'p2']);
    expect(file.progress[0]).toMatchObject({ lab: 'heptapod', data: { logogram: 4 } });
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);   // plain JSON, nothing lost in a file
  });

  it('deleteAll erases everything and confirms by counting again', async () => {
    const store = await seeded(await make());
    const r = await deleteAll(store);
    expect(r).toEqual({ deleted: { events: 2, progress: 1, meta: 1 }, remaining: { events: 0, progress: 0, meta: 0 }, ok: true });
    expect((await exportAll(store)).events).toEqual([]);
  });

  it('summary says what is stored', async () => {
    const store = await seeded(await make());
    expect(await summary(store)).toEqual({
      counts: { events: 2, progress: 1, meta: 1 }, firstEvent: T0 - 1000, lastEvent: T0, labs: ['heptapod'], settings: ['visit.last'],
    });
  });
});

it('deleteAll reports a store that did not empty', async () => {
  const store = memoryStore();
  await store.append(ev({ lab: 'hub', type: 'lab.open', t: 1 }));
  store.clear = async () => { /* a store that silently keeps its records */ };
  const r = await deleteAll(store);
  expect(r.ok).toBe(false);
  expect(r.remaining.events).toBe(1);
});
