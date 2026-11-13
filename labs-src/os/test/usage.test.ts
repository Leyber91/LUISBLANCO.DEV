import { describe, expect, it } from 'vitest';
import { buildUsage, emptyUsage, rangeDays, utcDay } from '../usage.js';
import type { ByDayRow, RawRow } from '../usage.js';
import { DAY, HOUR, MIN, T0 } from './helpers.js';

const hub = { id: 'hub', title: 'Labs hub' };
const catalogue = [
  { id: 'black-hole', title: 'Black Hole' },
  { id: 'heptapod', title: 'Heptapod Codec' },
  { id: 'token-ekg', title: 'Token EKG' },
];
const opts = (days = 7) => ({ days, now: T0, catalogue, hub });
const iso = (t: number): string => new Date(t).toISOString();

const raw = (p: Partial<RawRow> & Pick<RawRow, 'type' | 't'>): RawRow =>
  ({ lab: 'hub', install_id: 'install-a', session: 's1', data: null, ...p });

describe('the range', () => {
  it('is the last N UTC days, today included, oldest first', () => {
    expect(rangeDays(7, T0)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(rangeDays(30, T0)).toHaveLength(30);
    expect(rangeDays(90, T0)[0]).toBe('2026-08-16');
    expect(utcDay(Date.UTC(2026, 10, 13, 23, 59, 59))).toBe('2026-11-13');
  });

  it('ignores rows outside it', () => {
    const m = buildUsage(
      [{ day: '2026-11-01', lab: 'hub', type: 'lab.action', events: 50 }],
      [raw({ type: 'lab.open', t: iso(T0 - 8 * DAY) }), raw({ type: 'lab.open', t: iso(T0 + 2 * DAY) }), raw({ type: 'lab.open', t: 'not a time' })],
      opts(7));
    expect(m.empty).toBe(true);
    expect(m.totals).toEqual({ visitors: 0, sessions: 0, labOpens: 0, visibleMs: 0, actions: 0, errors: 0 });
    expect(m.daily.every((d) => d.visitors === 0 && d.sessions === 0)).toBe(true);
  });
});

describe('visitors and sessions', () => {
  it('count a browser once however many days and sessions it came', () => {
    const rows = [
      raw({ type: 'lab.open', t: iso(T0 - 2 * DAY), install_id: 'a', session: 'a1' }),
      raw({ type: 'lab.open', t: iso(T0 - DAY), install_id: 'a', session: 'a2' }),
      raw({ type: 'lab.open', t: iso(T0), install_id: 'a', session: 'a3' }),
      raw({ type: 'lab.open', t: iso(T0), install_id: 'b', session: 'b1' }),
    ];
    const m = buildUsage([], rows, opts());
    expect(m.totals.visitors).toBe(2);                               // adding the daily counts up would say 4
    expect(m.totals.sessions).toBe(4);
    expect(m.daily.slice(-3)).toEqual([
      { day: '2026-11-11', visitors: 1, sessions: 1 },
      { day: '2026-11-12', visitors: 1, sessions: 1 },
      { day: '2026-11-13', visitors: 2, sessions: 2 },
    ]);
    expect(m.daily).toHaveLength(7);
    expect(m.empty).toBe(false);
  });

  it('count a session that sent a leave or a handoff and no open (the page where Allow was pressed)', () => {
    const m = buildUsage([], [
      raw({ type: 'lab.handoff', t: iso(T0 - HOUR), install_id: 'a', session: 'a1', data: { to: 'heptapod', via: 'card' } }),
      raw({ type: 'lab.leave', t: iso(T0 - HOUR), install_id: 'a', session: 'a1', data: { visibleMs: 9000, totalMs: 9000, final: true } }),
    ], opts());
    expect(m.totals).toMatchObject({ visitors: 1, sessions: 1 });
  });
});

describe('visible time', () => {
  it('is the largest lab.leave of each session, because each one carries the total so far', () => {
    const rows = [
      raw({ type: 'lab.open', t: iso(T0 - HOUR), lab: 'heptapod', session: 'h1' }),
      raw({ type: 'lab.leave', t: iso(T0 - 50 * MIN), lab: 'heptapod', session: 'h1', data: { visibleMs: 5 * MIN, totalMs: 10 * MIN, final: false } }),
      raw({ type: 'lab.leave', t: iso(T0 - 40 * MIN), lab: 'heptapod', session: 'h1', data: { visibleMs: 7 * MIN, totalMs: 20 * MIN, final: false } }),
      raw({ type: 'lab.leave', t: iso(T0 - 40 * MIN), lab: 'heptapod', session: 'h1', data: { visibleMs: 7 * MIN, totalMs: 20 * MIN, final: true } }),
      raw({ type: 'lab.leave', t: iso(T0 - 30 * MIN), lab: 'heptapod', session: 'h2', install_id: 'b', data: { visibleMs: 2 * MIN, totalMs: 2 * MIN, final: true } }),
    ];
    const m = buildUsage([{ day: '2026-11-13', lab: 'heptapod', type: 'lab.leave', events: 4, visible_ms: 21 * MIN }], rows, opts());
    const heptapod = m.labs.find((l) => l.id === 'heptapod');
    expect(heptapod?.visibleMs).toBe(9 * MIN);                       // 7 + 2; the view's own sum says 21
    expect(m.totals.visibleMs).toBe(9 * MIN);
  });

  it('is null for a lab that recorded no session of its own', () => {
    const m = buildUsage([], [raw({ type: 'lab.handoff', t: iso(T0), data: { to: 'black-hole', via: 'rail' } })], opts());
    expect(m.labs.find((l) => l.id === 'black-hole')).toMatchObject({ visibleMs: null, sessions: null, actions: null, errors: null, opens: 1, visitors: 1, opened: true });
  });
});

describe('opens and where they came from', () => {
  const rows = [
    // the hub records itself and three handoffs
    raw({ type: 'lab.open', t: iso(T0 - 3 * HOUR), install_id: 'a', session: 'a1' }),
    raw({ type: 'lab.handoff', t: iso(T0 - 3 * HOUR), install_id: 'a', session: 'a1', data: { to: 'heptapod', via: 'card' } }),
    raw({ type: 'lab.open', t: iso(T0 - 2 * HOUR), install_id: 'b', session: 'b1' }),
    raw({ type: 'lab.handoff', t: iso(T0 - 2 * HOUR), install_id: 'b', session: 'b1', data: { to: 'heptapod', via: 'welcome' } }),
    raw({ type: 'lab.handoff', t: iso(T0 - 2 * HOUR), install_id: 'b', session: 'b1', data: { to: 'black-hole', via: 'card' } }),
    raw({ type: 'lab.handoff', t: iso(T0 - HOUR), install_id: 'b', session: 'b2', data: { to: 'black-hole', via: 'card' } }),
    // Heptapod records itself: three opens, one of them straight from a bookmark
    raw({ type: 'lab.open', t: iso(T0 - 3 * HOUR + MIN), lab: 'heptapod', install_id: 'a', session: 'a2' }),
    raw({ type: 'lab.open', t: iso(T0 - 2 * HOUR + MIN), lab: 'heptapod', install_id: 'b', session: 'b3' }),
    raw({ type: 'lab.open', t: iso(T0 - MIN), lab: 'heptapod', install_id: 'c', session: 'c1' }),
  ];
  const m = buildUsage([], rows, opts());
  const lab = (id: string) => m.labs.find((l) => l.id === id);

  it("a lab that records itself shows its own opens, not the hub's handoffs added on top", () => {
    expect(lab('heptapod')).toMatchObject({ opens: 3, visitors: 3, sessions: 3, opened: true });
    expect(lab('heptapod')?.from).toEqual([{ via: 'card', n: 1 }, { via: 'welcome', n: 1 }]);
  });

  it('a lab that does not record itself shows the handoffs to it', () => {
    expect(lab('black-hole')).toMatchObject({ opens: 2, visitors: 1, sessions: null, opened: true });
    expect(lab('black-hole')?.from).toEqual([{ via: 'card', n: 2 }]);
  });

  it('the hub is its own row, and lab opens leave it out', () => {
    expect(lab('hub')).toMatchObject({ kind: 'hub', opens: 2, visitors: 2, sessions: 3 });
    expect(m.totals.labOpens).toBe(5);
  });

  it('lists the hub, then opened labs by visitors, then labs never opened, then the rest', () => {
    expect(m.labs.map((l) => l.id)).toEqual(['hub', 'heptapod', 'black-hole', 'token-ekg', 'other']);
    expect(m.neverOpened).toEqual(['Token EKG']);
    expect(lab('token-ekg')).toMatchObject({ opened: false, opens: 0, visitors: 0, sessions: null, visibleMs: null, actions: null, errors: null });
  });

  it('has the same rows whatever the data holds, so every state is the same height', () => {
    expect(emptyUsage(opts()).labs.map((l) => l.id).sort()).toEqual(m.labs.map((l) => l.id).sort());
    expect(emptyUsage(opts()).neverOpened).toEqual(['Black Hole', 'Heptapod Codec', 'Token EKG']);
  });
});

describe('actions and errors', () => {
  it('are the exact sums of the daily counts, every type that is not an open, a leave or an error being an action', () => {
    const byDay: ByDayRow[] = [
      { day: '2026-11-12', lab: 'hub', type: 'lab.open', events: 9 },
      { day: '2026-11-12', lab: 'hub', type: 'lab.leave', events: 11 },
      { day: '2026-11-12', lab: 'hub', type: 'lab.handoff', events: 4 },
      { day: '2026-11-12', lab: 'hub', type: 'lab.action', events: '12' },          // a bigint may arrive as text
      { day: '2026-11-13', lab: 'hub', type: 'lab.action', events: 3 },
      { day: '2026-11-13', lab: 'heptapod', type: 'heptapod.decoded', events: 6 },
      { day: '2026-11-13', lab: 'heptapod', type: 'lab.error', events: 2 },
      { day: '2026-11-13', lab: 'a-lab-that-left', type: 'lab.action', events: 5 },
      { day: '2026-11-13T00:00:00', lab: 'token-ekg', type: 'lab.outcome', events: 1 },
    ];
    const m = buildUsage(byDay, [], opts());
    const of = (id: string) => m.labs.find((l) => l.id === id);
    expect(of('hub')).toMatchObject({ actions: 19, errors: 0 });
    expect(of('heptapod')).toMatchObject({ actions: 6, errors: 2 });
    expect(of('token-ekg')).toMatchObject({ actions: 1, errors: 0 });
    expect(of('black-hole')).toMatchObject({ actions: null, errors: null });      // nothing recorded: not known, not zero
    expect(of('other')).toMatchObject({ kind: 'other', title: 'Not in the catalogue', actions: 5 });
    expect(m.totals).toMatchObject({ actions: 31, errors: 2 });
    expect(m.empty).toBe(false);
  });
});
