/* ============================================================
   labs-src/os/usage.ts — what the owner's dashboard shows, computed
   from what the backend returns. Pure: the same rows, range and
   catalogue give the same model.

   Two reads feed it (owner.ts):
     byDay   usage_by_day: events per day, lab and type. Sums of
             events are exact, so the action and error counts come
             from here without reading one row per action.
     raw     usage_events of the three session types (lab.open,
             lab.leave, lab.handoff), one row each. Distinct
             visitors and sessions over a range cannot be added up
             from daily counts (a browser that came on two days
             would count twice), so they are counted from these.

   What each figure is:
     visitors      distinct install ids (browsers that allowed
                   sharing), in the range
     sessions      distinct session ids (page loads)
     opens         a lab's own lab.open events; for a lab that does
                   not record itself yet, the handoffs the hub
                   recorded to it
     visible time  for each session, the largest visibleMs of its
                   lab.leave events (each lab.leave carries the
                   session's total so far, so adding them up would
                   count the same seconds again)
     actions       every event that is not an open, a leave or an
                   error: controls used, handoffs, outcomes
     errors        lab.error events

   A lab that does not record itself has no sessions, visible
   time, actions or errors to count: those are null (not known),
   never zero.
     from          the handoffs to a lab, by where the link sat on
                   the hub (card, rail, welcome)

   Days are UTC days, as usage_by_day cuts them.
   ============================================================ */

import type { JsonObject } from './types.js';

/** One row of public.usage_by_day. Postgres may print a bigint as a number or a string. */
export interface ByDayRow {
  readonly day: string;
  readonly lab: string;
  readonly type: string;
  readonly events: number | string;
  readonly installs?: number | string;
  readonly sessions?: number | string;
  readonly visible_ms?: number | string;
}

/** One row of public.usage_events, with the columns the dashboard reads. */
export interface RawRow {
  readonly t: string;
  readonly lab: string;
  readonly type: string;
  readonly install_id: string;
  readonly session: string | null;
  readonly data: JsonObject | null;
}

export interface CatalogueLab {
  readonly id: string;
  readonly title: string;
}

export interface DayPoint {
  /** YYYY-MM-DD, a UTC day */
  readonly day: string;
  readonly visitors: number;
  readonly sessions: number;
}

export interface LabUsage {
  readonly id: string;
  readonly title: string;
  /** 'hub', a lab of the catalogue, or every other lab id in the data folded into one row */
  readonly kind: 'hub' | 'lab' | 'other';
  readonly visitors: number;
  /** null when the lab recorded no session of its own in the range */
  readonly sessions: number | null;
  readonly opens: number;
  readonly visibleMs: number | null;
  /** null when the lab recorded nothing of its own in the range */
  readonly actions: number | null;
  readonly errors: number | null;
  /** handoffs to this lab, by where the link sat, most first */
  readonly from: readonly { readonly via: string; readonly n: number }[];
  /** true when the lab was opened in the range, by its own record or by a handoff to it */
  readonly opened: boolean;
}

export interface UsageTotals {
  readonly visitors: number;
  readonly sessions: number;
  /** opens of labs, the hub left out */
  readonly labOpens: number;
  readonly visibleMs: number;
  readonly actions: number;
  readonly errors: number;
}

export interface UsageModel {
  readonly days: number;
  /** first and last UTC day of the range, YYYY-MM-DD */
  readonly from: string;
  readonly to: string;
  readonly totals: UsageTotals;
  /** one point per day of the range, days without visitors included */
  readonly daily: readonly DayPoint[];
  /** the hub, then opened labs (most visitors first), then labs never opened (catalogue order), then "other" */
  readonly labs: readonly LabUsage[];
  /** titles of the catalogue labs nobody opened in the range */
  readonly neverOpened: readonly string[];
  /** true when the range holds no row at all */
  readonly empty: boolean;
}

export const RANGES = [7, 30, 90] as const;
export const SESSION_TYPES = ['lab.open', 'lab.leave', 'lab.handoff'] as const;
const DAY_MS = 86_400_000;
const OTHER_ID = 'other';

/** The UTC day of a time, YYYY-MM-DD. */
export const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

/** The UTC days of a range that ends today: `days` of them, oldest first. */
export function rangeDays(days: number, now: number): string[] {
  const end = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return Array.from({ length: days }, (_, i) => utcDay(end - (days - 1 - i) * DAY_MS));
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

interface Acc {
  installs: Set<string>;
  sessions: Set<string>;
  opens: number;
  arrivals: number;
  /** session -> the largest visibleMs it reported */
  visible: Map<string, number>;
  via: Map<string, number>;
  actions: number;
  errors: number;
  /** the lab recorded a session of its own */
  own: boolean;
  /** the lab recorded any event of its own */
  counted: boolean;
}
const acc = (): Acc => ({ installs: new Set(), sessions: new Set(), opens: 0, arrivals: 0, visible: new Map(), via: new Map(), actions: 0, errors: 0, own: false, counted: false });

export interface BuildOptions {
  readonly days: number;
  readonly now: number;
  /** the labs a visitor can open, in hub order */
  readonly catalogue: readonly CatalogueLab[];
  readonly hub: CatalogueLab;
}

export function buildUsage(byDay: readonly ByDayRow[], raw: readonly RawRow[], opts: BuildOptions): UsageModel {
  const days = rangeDays(opts.days, opts.now);
  const inRange = new Set(days);
  const known = new Map<string, CatalogueLab>([[opts.hub.id, opts.hub], ...opts.catalogue.map((c): [string, CatalogueLab] => [c.id, c])]);
  const keyOf = (lab: string): string => (known.has(lab) ? lab : OTHER_ID);
  const labs = new Map<string, Acc>();
  const at = (lab: string): Acc => { const k = keyOf(lab); let a = labs.get(k); if (!a) { a = acc(); labs.set(k, a); } return a; };

  const dayInstalls = new Map<string, Set<string>>(days.map((d): [string, Set<string>] => [d, new Set()]));
  const daySessions = new Map<string, Set<string>>(days.map((d): [string, Set<string>] => [d, new Set()]));
  const allInstalls = new Set<string>(), allSessions = new Set<string>();
  let rows = 0;

  for (const r of raw) {
    const t = Date.parse(r.t);
    if (!Number.isFinite(t)) continue;
    const day = utcDay(t);
    if (!inRange.has(day)) continue;
    rows++;
    allInstalls.add(r.install_id);
    dayInstalls.get(day)?.add(r.install_id);
    if (r.session) { allSessions.add(r.session); daySessions.get(day)?.add(r.session); }

    // the lab that recorded the row had a session, whatever the row says
    const own = at(r.lab);
    own.own = true;
    own.installs.add(r.install_id);
    if (r.session) own.sessions.add(r.session);

    if (r.type === 'lab.open') own.opens++;
    else if (r.type === 'lab.leave') {
      const ms = r.data?.['visibleMs'];
      if (typeof ms === 'number' && ms >= 0 && r.session) own.visible.set(r.session, Math.max(own.visible.get(r.session) ?? 0, ms));
    } else if (r.type === 'lab.handoff') {
      const to = r.data?.['to'];
      if (typeof to !== 'string' || !to) continue;
      const target = at(to);
      target.arrivals++;
      target.installs.add(r.install_id);
      const via = typeof r.data?.['via'] === 'string' && r.data['via'] ? r.data['via'] : 'link';
      target.via.set(via, (target.via.get(via) ?? 0) + 1);
    }
  }

  for (const r of byDay) {
    if (!inRange.has(String(r.day).slice(0, 10))) continue;
    rows++;
    const a = at(r.lab);
    a.counted = true;
    if (r.type === 'lab.open' || r.type === 'lab.leave') continue;
    if (r.type === 'lab.error') a.errors += num(r.events);
    else a.actions += num(r.events);
  }

  const sum = (m: Map<string, number>): number => [...m.values()].reduce((n, v) => n + v, 0);
  const row = (id: string, title: string, kind: LabUsage['kind']): LabUsage => {
    const a = labs.get(id) ?? acc();
    const opens = a.own ? a.opens : a.arrivals;
    return {
      id, title, kind,
      visitors: a.installs.size,
      sessions: a.own ? a.sessions.size : null,
      opens,
      visibleMs: a.own ? sum(a.visible) : null,
      actions: a.own || a.counted ? a.actions : null,
      errors: a.own || a.counted ? a.errors : null,
      from: [...a.via].map(([via, n]) => ({ via, n })).sort((x, y) => y.n - x.n || x.via.localeCompare(y.via)),
      opened: a.own || a.arrivals > 0,
    };
  };

  const catalogueRows = opts.catalogue.map((c) => row(c.id, c.title, 'lab'));
  const opened = catalogueRows.filter((l) => l.opened).sort((x, y) => y.visitors - x.visitors || y.opens - x.opens);   // stable: ties keep hub order
  const never = catalogueRows.filter((l) => !l.opened);
  const hub = row(opts.hub.id, opts.hub.title, 'hub');
  const other = row(OTHER_ID, 'Not in the catalogue', 'other');
  const all = [hub, ...opened, ...never, other];

  return {
    days: opts.days,
    from: days[0] ?? utcDay(opts.now),
    to: days[days.length - 1] ?? utcDay(opts.now),
    totals: {
      visitors: allInstalls.size,
      sessions: allSessions.size,
      labOpens: [...opened, other].reduce((n, l) => n + l.opens, 0),
      visibleMs: all.reduce((n, l) => n + (l.visibleMs ?? 0), 0),
      actions: all.reduce((n, l) => n + (l.actions ?? 0), 0),
      errors: all.reduce((n, l) => n + (l.errors ?? 0), 0),
    },
    daily: days.map((day) => ({ day, visitors: dayInstalls.get(day)?.size ?? 0, sessions: daySessions.get(day)?.size ?? 0 })),
    labs: all,
    neverOpened: never.map((l) => l.title),
    empty: rows === 0,
  };
}

/** The model of a range nobody has data for: every lab listed, every figure zero. */
export function emptyUsage(opts: BuildOptions): UsageModel {
  return buildUsage([], [], opts);
}
