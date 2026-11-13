import { describe, expect, it } from 'vitest';
import { describeVisit, Resume, suggest, visitsFrom } from '../resume.js';
import type { CatalogueEntry } from '../resume.js';
import { memoryStore } from '../store.js';
import type { ProgressRecord } from '../types.js';
import { DAY, ev, HOUR, MIN, T0 } from './helpers.js';

const CAT: CatalogueEntry[] = [
  { id: 'black-hole', title: 'Black Hole', href: '/labs/bh_animation_page.html', world: 'cosmos', worldName: 'Cosmos' },
  { id: 'dimensional', title: 'Dimensional Test', href: '/labs/md_animation_page.html', world: 'cosmos', worldName: 'Cosmos' },
  { id: 'exomania', title: 'Exomania', href: '/labs/exomania.html', world: 'cosmos', worldName: 'Cosmos' },
  { id: 'heptapod', title: 'Heptapod Codec', href: '/labs/heptapod.html', world: 'contact', worldName: 'Contact' },
  { id: 'alt-reality', title: 'Alternate Reality Scenarios', href: '/labs/altverse.html', world: 'contact', worldName: 'Contact' },
  { id: 'claude-prep', title: 'Claude Prep', href: '/labs/claude-prep/', world: 'self', worldName: 'Self' },
  { id: 'workout-plans', title: 'Personalized Plans', href: '/labs/workout-plans.html', world: 'self', worldName: 'Self' },
  { id: 'trends', title: 'Trending Topics', href: '/labs/trending.html', world: 'signals', worldName: 'Signals' },
];

const rec = (lab: string, p: Partial<ProgressRecord> = {}): ProgressRecord =>
  ({ lab, v: 1, data: null, updated: T0, resume: null, due: [], finished: false, ...p });

describe('visitsFrom', () => {
  it('builds a visit from a lab session, taking the largest cumulative lab.leave', () => {
    const v = visitsFrom([
      ev({ session: 'a', lab: 'heptapod', type: 'lab.open', t: 0 }),
      ev({ session: 'a', lab: 'heptapod', type: 'lab.leave', t: 5, data: { visibleMs: 5, totalMs: 5 } }),
      ev({ session: 'a', lab: 'heptapod', type: 'lab.leave', t: 9, data: { visibleMs: 7, totalMs: 9 } }),
    ]);
    expect(v).toEqual([{ lab: 'heptapod', session: 'a', start: 0, end: 9, visibleMs: 7, totalMs: 9, source: 'lab', from: null, events: 3, partial: false }]);
  });

  it('turns a handoff into a visit for a lab that does not record, and merges it with one that does', () => {
    const v = visitsFrom([
      ev({ session: 'h', lab: 'hub', type: 'lab.open', t: 0 }),
      ev({ session: 'h', lab: 'hub', type: 'lab.handoff', t: 10, data: { to: 'black-hole' } }),
      ev({ session: 'h', lab: 'hub', type: 'lab.handoff', t: 20, data: { to: 'heptapod' } }),
      ev({ session: 'x', lab: 'heptapod', type: 'lab.open', t: 22 }),
    ]);
    expect(v.map((x) => [x.lab, x.source, x.start])).toEqual([['heptapod', 'lab', 22], ['black-hole', 'handoff', 10], ['hub', 'lab', 0]]);
    expect(v[1]?.from).toBe('hub');
  });

  it('ignores events of a session that never opened', () => {
    expect(visitsFrom([ev({ session: 'z', lab: 'hub', type: 'lab.leave', t: 1, data: { visibleMs: 1, totalMs: 1 } })])).toEqual([]);
  });
});

describe('suggest (what is next)', () => {
  const now = T0;
  const visits = visitsFrom([
    ev({ session: 'h1', lab: 'hub', type: 'lab.open', t: now - 4 * DAY }),
    ev({ session: 'h1', lab: 'hub', type: 'lab.handoff', t: now - 4 * DAY, data: { to: 'black-hole' } }),
    ev({ session: 'h2', lab: 'hub', type: 'lab.open', t: now - 2 * HOUR }),
    ev({ session: 'h2', lab: 'hub', type: 'lab.handoff', t: now - 2 * HOUR, data: { to: 'heptapod' } }),
  ]);
  const progress = [
    rec('heptapod', { resume: { url: '/labs/heptapod.html?at=4', label: 'logogram 4 of 9', t: now - 2 * HOUR } }),
    rec('claude-prep', { due: [{ id: 'a', label: 'a', at: now - 3 * DAY }, { id: 'b', label: 'b', at: now - HOUR }, { id: 'c', label: 'c', at: now + DAY }] }),
  ];
  const known = CAT.map((c) => c.id).filter((id) => id !== 'trends');

  it('ranks continue, due, world, new, and gives each a reason', () => {
    const s = suggest({ visits, progress, catalogue: CAT, now, known, lastVisit: now - 2 * HOUR, limit: 10 });
    expect(s.map((x) => [x.kind, x.lab])).toEqual([
      ['continue', 'heptapod'],
      ['due', 'claude-prep'],
      ['world', 'alt-reality'],        // Contact, explored 2 hours ago
      ['world', 'dimensional'],        // Cosmos, explored 4 days ago; one per world, so not exomania
      ['new', 'trends'],
    ]);
    expect(s.map((x) => x.reason)).toEqual([
      'Unfinished: you stopped at logogram 4 of 9, 2 hours ago.',
      '2 items due; the oldest fell due 3 days ago.',
      'Unvisited. You opened Heptapod Codec in this world.',
      'Unvisited. You opened Black Hole in this world.',
      'New since your last visit, 2 hours ago.',
    ]);
    expect(s[0]?.href).toBe('/labs/heptapod.html?at=4');
  });

  it('names a lab once, honours exclude and the limit', () => {
    const s = suggest({ visits, progress, catalogue: CAT, now, known, exclude: ['heptapod'] });
    expect(s.map((x) => x.lab)).toEqual(['claude-prep', 'alt-reality', 'dimensional']);
    expect(suggest({ visits, progress, catalogue: CAT, now, known, exclude: ['heptapod', 'alt-reality'], limit: 10 }).map((x) => x.lab))
      .toEqual(['claude-prep', 'dimensional', 'trends']);   // Contact has no other unvisited lab
    expect(new Set(s.map((x) => x.lab)).size).toBe(s.length);
  });

  it('is deterministic: the same record and clock give the same list', () => {
    const a = suggest({ visits, progress, catalogue: CAT, now, known, limit: 10 });
    const b = suggest({ visits: [...visits], progress: [...progress].reverse(), catalogue: CAT, now, known, limit: 10 });
    expect(b).toEqual(a);
  });

  it('suggests nothing as new without the last visit\'s catalogue', () => {
    const s = suggest({ visits: [], progress: [], catalogue: CAT, now, known: null, limit: 10 });
    expect(s).toEqual([]);
  });

  it('skips a finished lab and a lab outside the catalogue', () => {
    const s = suggest({
      visits: [], catalogue: CAT, now, limit: 10,
      progress: [rec('heptapod', { finished: true, resume: { url: '/x', label: 'x', t: now } }), rec('gone-lab', { resume: { url: '/y', label: 'y', t: now } })],
    });
    expect(s).toEqual([]);
  });

  it('orders due labs by how many items wait', () => {
    const s = suggest({
      visits: [], catalogue: CAT, now, limit: 10,
      progress: [
        rec('workout-plans', { due: [{ id: 'w', label: 'w', at: now - DAY }] }),
        rec('claude-prep', { due: [{ id: 'a', label: 'a', at: now - MIN }, { id: 'b', label: 'b', at: now - MIN }] }),
      ],
    });
    expect(s.map((x) => x.lab)).toEqual(['claude-prep', 'workout-plans']);
    expect(s[1]?.reason).toBe('1 item due; it fell due 1 day ago.');
  });
});

describe('Resume over a store', () => {
  it('lastSessions leaves out the current page load and excluded labs', async () => {
    const store = memoryStore();
    await store.append(ev({ session: 'old', lab: 'hub', type: 'lab.open', t: T0 - DAY }));
    await store.append(ev({ session: 'old', lab: 'hub', type: 'lab.handoff', t: T0 - DAY + 1, data: { to: 'exomania' } }));
    await store.append(ev({ session: 'now', lab: 'hub', type: 'lab.open', t: T0 }));
    const r = new Resume(store, 'now', () => T0);
    expect((await r.lastSessions()).map((v) => v.lab)).toEqual(['exomania', 'hub']);
    expect((await r.lastSessions({ exclude: ['hub'] })).map((v) => v.lab)).toEqual(['exomania']);
    expect((await r.lastSessions({ includeCurrent: true })).map((v) => v.session)).toEqual(['now', 'old', 'old']);
    expect(describeVisit((await r.lastSessions({ exclude: ['hub'] }))[0]!, T0)).toBe('1 day ago · opened from the hub');
  });

  it('whatsNext reads the log and progress', async () => {
    const store = memoryStore();
    await store.append(ev({ session: 'o', lab: 'heptapod', type: 'lab.open', t: T0 - HOUR }));
    await store.append(ev({ session: 'o', lab: 'heptapod', type: 'lab.leave', t: T0 - HOUR + 14 * MIN, data: { visibleMs: 14 * MIN, totalMs: 14 * MIN } }));
    const r = new Resume(store, 'now', () => T0);
    const next = await r.whatsNext(CAT);
    expect(next.map((s) => s.lab)).toEqual(['alt-reality']);
    expect(describeVisit((await r.lastSessions())[0]!, T0)).toBe('1 hour ago · 14 min in view');
  });
});
