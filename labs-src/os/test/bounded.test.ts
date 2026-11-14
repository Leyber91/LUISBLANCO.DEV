import { describe, expect, it } from 'vitest';
import { DROPPED_KEY, MAX_EVENTS, memoryStore, openStore, readDropped } from '../store.js';
import type { Store } from '../store.js';
import { describeVisit, Resume } from '../resume.js';
import type { CatalogueEntry } from '../resume.js';
import { summary } from '../privacy.js';
import { DAY, ev, freshIdb, HOUR, T0 } from './helpers.js';

const kinds: [string, (max: number) => Promise<Store>][] = [
  ['indexeddb', (maxEvents) => openStore({ idb: freshIdb(), maxEvents })],
  ['memory', async (maxEvents) => memoryStore({ maxEvents })],
];

describe.each(kinds)('%s: a bounded log', (_kind, make) => {
  it('keeps the newest events and summarises the dropped ones per lab', async () => {
    const s = await make(5);
    await s.append(ev({ id: 'a1', lab: 'hub', type: 'lab.open', t: 1 }));
    await s.append(ev({ id: 'a2', lab: 'hub', type: 'lab.handoff', t: 2, data: { to: 'exomania' } }));
    for (let i = 3; i <= 7; i++) await s.append(ev({ id: `a${i}`, lab: 'heptapod', type: 'lab.action', t: i }));
    expect((await s.events()).map((e) => e.id)).toEqual(['a3', 'a4', 'a5', 'a6', 'a7']);
    expect(readDropped(await s.getMeta(DROPPED_KEY))).toEqual({ total: 2, byLab: { hub: 2 }, labs: ['exomania', 'hub'], since: 1, until: 2 });
  });

  it('writes no summary while under the limit, and adds to it on every later drop', async () => {
    const s = await make(3);
    for (let i = 1; i <= 3; i++) await s.append(ev({ id: `b${i}`, lab: 'hub', type: 'lab.action', t: i }));
    expect(await s.getMeta(DROPPED_KEY)).toBeUndefined();
    for (let i = 4; i <= 6; i++) await s.append(ev({ id: `b${i}`, lab: i === 6 ? 'memes' : 'hub', type: 'lab.action', t: i }));
    expect(readDropped(await s.getMeta(DROPPED_KEY))).toMatchObject({ total: 3, byLab: { hub: 3 }, since: 1, until: 3 });
    expect((await s.counts()).events).toBe(3);
  });

  it('a refused append (a repeated id) drops nothing', async () => {
    const s = await make(2);
    await s.append(ev({ id: 'c1', lab: 'hub', type: 'lab.open', t: 1 }));
    await s.append(ev({ id: 'c2', lab: 'hub', type: 'lab.open', t: 2 }));
    await expect(s.append(ev({ id: 'c2', lab: 'hub', type: 'lab.open', t: 3 }))).rejects.toThrow();
    expect((await s.events()).map((e) => e.id)).toEqual(['c1', 'c2']);
    expect(await s.getMeta(DROPPED_KEY)).toBeUndefined();
  });
});

it('drops the whole overflow in one batch when the limit is lowered under an existing log', async () => {
  const idb = freshIdb();
  const big = await openStore({ idb, maxEvents: 100 });
  for (let i = 1; i <= 8; i++) await big.append(ev({ id: `d${i}`, lab: 'hub', type: 'lab.action', t: i }));
  big.close();
  const small = await openStore({ idb, maxEvents: 5 });
  await small.append(ev({ id: 'd9', lab: 'hub', type: 'lab.action', t: 9 }));
  expect((await small.events()).map((e) => e.id)).toEqual(['d5', 'd6', 'd7', 'd8', 'd9']);
  expect(readDropped(await small.getMeta(DROPPED_KEY))?.total).toBe(4);
  small.close();
});

it('keeps the newest 5,000 by default', async () => {
  expect(MAX_EVENTS).toBe(5000);
  const s = memoryStore();
  for (let i = 1; i <= 5003; i++) await s.append(ev({ id: `m${i}`, lab: 'hub', type: 'lab.action', t: i }));
  const all = await s.events();
  expect(all).toHaveLength(5000);
  expect(all[0]?.id).toBe('m4');
  expect((await summary(s)).dropped).toMatchObject({ total: 3, byLab: { hub: 3 } });
});

it('refuses a limit that is not a positive integer', async () => {
  expect(() => memoryStore({ maxEvents: 0 })).toThrow(/positive integer/);
  await expect(openStore({ idb: freshIdb(), maxEvents: 1.5 })).rejects.toThrow(/positive integer/);
});

describe('readers stay honest after a drop', () => {
  const CAT: CatalogueEntry[] = [
    { id: 'exomania', title: 'Exomania', href: '/labs/exomania.html', world: 'cosmos', worldName: 'Cosmos' },
    { id: 'black-hole', title: 'Black Hole', href: '/labs/bh_animation_page.html', world: 'cosmos', worldName: 'Cosmos' },
    { id: 'heptapod', title: 'Heptapod Codec', href: '/labs/heptapod.html', world: 'contact', worldName: 'Contact' },
  ];

  async function truncated() {
    const s = memoryStore({ maxEvents: 4 });
    const now = T0;
    // an old hub session that opened Exomania, and a Heptapod session whose open will be dropped
    await s.append(ev({ session: 'old', lab: 'hub', type: 'lab.handoff', t: now - 3 * DAY, data: { to: 'exomania' } }));
    await s.append(ev({ session: 'hp', lab: 'heptapod', type: 'lab.open', t: now - 2 * HOUR }));
    await s.append(ev({ session: 'hp', lab: 'heptapod', type: 'lab.action', t: now - 2 * HOUR + 1000 }));
    await s.append(ev({ session: 'hp', lab: 'heptapod', type: 'lab.action', t: now - 2 * HOUR + 2000 }));
    await s.append(ev({ session: 'hp', lab: 'heptapod', type: 'lab.outcome', t: now - 2 * HOUR + 3000 }));
    await s.append(ev({ session: 'hp', lab: 'heptapod', type: 'lab.leave', t: now - HOUR, data: { visibleMs: 60_000, totalMs: 3_600_000 } }));
    return { s, now };
  }

  it('lastSessions keeps a session whose start was dropped, marked partial', async () => {
    const { s, now } = await truncated();
    const r = new Resume(s, 'current', () => now);
    const [v] = await r.lastSessions();
    expect(v).toMatchObject({ lab: 'heptapod', partial: true, totalMs: 3_600_000 });
    expect(describeVisit(v!, now)).toBe('2 hours ago · earlier events summarised');
    expect(await r.summarised()).toMatchObject({ total: 2, byLab: { hub: 1, heptapod: 1 }, labs: ['exomania', 'heptapod', 'hub'] });
  });

  it('whatsNext does not offer a lab whose visit was dropped as unvisited', async () => {
    const { s, now } = await truncated();
    const next = await new Resume(s, 'current', () => now).whatsNext(CAT, { limit: 5 });
    expect(next.map((x) => x.lab)).toEqual(['black-hole']);   // Cosmos explored through the dropped Exomania visit
    expect(next[0]?.reason).toBe('Unvisited. You opened Exomania in this world.');
  });
});
