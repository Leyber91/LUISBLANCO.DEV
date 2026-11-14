/* ============================================================
   labs-src/os/resume.ts — "welcome back" and "what's next", computed
   from the log and the progress records. Deterministic: the
   same record and the same clock give the same answer, and
   every suggestion says why it was made.

   A visit is one lab on one page load. It comes from the lab's
   own session events (lab.open, lab.leave), or, for a lab that
   does not record yet, from the lab.handoff another page wrote
   when the visitor followed a link to it. A handoff followed by
   the lab's own lab.open within HANDOFF_MERGE_MS is one visit.

   The log is bounded (store.ts). Once it has dropped its oldest
   events, a session whose lab.open was dropped still counts, as a
   partial visit, and the labs the dropped events show were visited
   still count as visited, so nothing old is offered as unvisited.

   whatsNext ranks, in this order, and names each lab once:
     1 continue  a lab with a resume point and not finished,
                 most recent first
     2 due       a lab reporting items due now, most items first
     3 world     an unvisited lab in a world the visitor has
                 explored, one per world, the most recently
                 explored world first
     4 new       a lab that was not in the catalogue the visitor
                 saw last time, in catalogue order
   ============================================================ */

import type { LabEvent, ProgressRecord } from './types.js';
import { DROPPED_KEY, readDropped } from './store.js';
import type { DroppedSummary, Store } from './store.js';
import { ago, duration, systemClock } from './util.js';
import type { Clock } from './util.js';

export const HANDOFF_MERGE_MS = 120_000;

export interface Visit {
  readonly lab: string;
  readonly session: string;
  readonly start: number;
  readonly end: number;
  /** from the lab's last lab.leave of that session; null when the lab did not record one */
  readonly visibleMs: number | null;
  readonly totalMs: number | null;
  /** 'lab' when the lab recorded its own session, 'handoff' when only the link to it was recorded */
  readonly source: 'lab' | 'handoff';
  /** the page the visitor came from, for a handoff */
  readonly from: string | null;
  readonly events: number;
  /** true when the session's first events were dropped from the bounded log */
  readonly partial: boolean;
}

/** One lab the hub can point to. `world` groups labs; `worldName` is how it is printed. */
export interface CatalogueEntry {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly world: string;
  readonly worldName: string;
}

export type SuggestionKind = 'continue' | 'due' | 'world' | 'new';

export interface Suggestion {
  readonly lab: string;
  readonly title: string;
  readonly href: string;
  readonly kind: SuggestionKind;
  /** one plain sentence: why this lab, now */
  readonly reason: string;
  readonly world: string;
  readonly worldName: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Every visit in the log, newest first. Pure. `truncated` says the log has
 * dropped older events, so a session without its lab.open is a partial visit
 * instead of a stray.
 */
export function visitsFrom(events: readonly LabEvent[], opts: { truncated?: boolean } = {}): Visit[] {
  const own = new Map<string, { lab: string; session: string; start: number; end: number; visibleMs: number | null; totalMs: number | null; n: number; partial: boolean }>();
  const handoffs: { to: string; t: number; session: string; from: string }[] = [];
  for (const e of events) {
    if (e.type === 'lab.handoff') {
      const to = e.data?.['to'];
      if (typeof to === 'string' && to !== e.lab) handoffs.push({ to, t: e.t, session: e.session, from: e.lab });
    }
    const key = `${e.session}\u0000${e.lab}`;
    let v = own.get(key);
    if (!v) {
      // A session begins with its open; without one it is a stray, unless the open was dropped from the log.
      if (e.type !== 'lab.open' && !opts.truncated) continue;
      v = { lab: e.lab, session: e.session, start: e.t, end: e.t, visibleMs: null, totalMs: null, n: 0, partial: e.type !== 'lab.open' };
      own.set(key, v);
    }
    v.end = Math.max(v.end, e.t);
    v.n++;
    if (e.type === 'lab.leave') {
      const vis = num(e.data?.['visibleMs']), tot = num(e.data?.['totalMs']);
      // lab.leave is cumulative: the largest is the session's total.
      if (tot !== null && (v.totalMs === null || tot >= v.totalMs)) { v.totalMs = tot; v.visibleMs = vis; }
    }
  }
  const visits: Visit[] = [...own.values()].map((v) => ({
    lab: v.lab, session: v.session, start: v.start, end: v.end, visibleMs: v.visibleMs, totalMs: v.totalMs,
    source: 'lab', from: null, events: v.n, partial: v.partial,
  }));
  for (const h of handoffs) {
    const merged = visits.some((v) => v.source === 'lab' && v.lab === h.to && v.start >= h.t && v.start - h.t <= HANDOFF_MERGE_MS);
    if (merged) continue;
    visits.push({ lab: h.to, session: h.session, start: h.t, end: h.t, visibleMs: null, totalMs: null, source: 'handoff', from: h.from, events: 1, partial: false });
  }
  return visits.sort((a, b) => b.start - a.start || (a.lab < b.lab ? -1 : a.lab > b.lab ? 1 : 0));
}

export interface SuggestInput {
  readonly visits: readonly Visit[];
  readonly progress: readonly ProgressRecord[];
  readonly catalogue: readonly CatalogueEntry[];
  readonly now: number;
  /** lab ids the visitor's last visit saw in the catalogue; null when unknown (nothing is "new") */
  readonly known?: readonly string[] | null;
  /** when that last visit was, for the "new" reason */
  readonly lastVisit?: number | null;
  /** labs not to suggest (the hub excludes the one its plate already offers) */
  readonly exclude?: readonly string[];
  readonly limit?: number;
  /** labs the dropped part of the log shows were visited, and the newest dropped time */
  readonly earlier?: { readonly labs: readonly string[]; readonly until: number } | null;
}

/** The ranked suggestions. Pure and deterministic. */
export function suggest(input: SuggestInput): Suggestion[] {
  const { visits, progress, catalogue, now } = input;
  const limit = input.limit ?? 3;
  const order = new Map(catalogue.map((c, i) => [c.id, i] as const));
  const byId = new Map(catalogue.map((c) => [c.id, c] as const));
  const taken = new Set<string>(input.exclude ?? []);
  const out: Suggestion[] = [];
  const add = (c: CatalogueEntry, kind: SuggestionKind, reason: string, href = c.href) => {
    if (out.length >= limit || taken.has(c.id)) return;
    taken.add(c.id);
    out.push({ lab: c.id, title: c.title, href, kind, reason, world: c.world, worldName: c.worldName });
  };
  const rank = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;

  // 1 continue
  const unfinished = progress
    .filter((p) => p.resume && !p.finished && byId.has(p.lab))
    .sort((a, b) => (b.resume?.t ?? 0) - (a.resume?.t ?? 0) || rank(a.lab) - rank(b.lab));
  for (const p of unfinished) {
    const c = byId.get(p.lab), r = p.resume;
    if (c && r) add(c, 'continue', `Unfinished: you stopped at ${r.label}, ${ago(r.t, now)}.`, r.url);
  }

  // 2 due
  const due = progress
    .map((p) => ({ p, items: p.due.filter((d) => d.at <= now) }))
    .filter((x) => x.items.length > 0 && byId.has(x.p.lab))
    .map((x) => ({ ...x, oldest: Math.min(...x.items.map((d) => d.at)) }))
    .sort((a, b) => b.items.length - a.items.length || a.oldest - b.oldest || rank(a.p.lab) - rank(b.p.lab));
  for (const x of due) {
    const c = byId.get(x.p.lab);
    const n = x.items.length;
    if (c) add(c, 'due', n === 1
      ? `1 item due; it fell due ${ago(x.oldest, now)}.`
      : `${n} items due; the oldest fell due ${ago(x.oldest, now)}.`);
  }

  // 3 an unvisited lab in a world the visitor has explored
  const visited = new Set([...visits.map((v) => v.lab), ...(input.earlier?.labs ?? [])]);
  const worldLast = new Map<string, { lab: string; start: number }>();
  for (const v of visits) {   // visits are newest first, so the first per world is its latest
    const w = byId.get(v.lab)?.world;
    if (w && !worldLast.has(w)) worldLast.set(w, v);
  }
  for (const lab of input.earlier?.labs ?? []) {   // older than anything still in the log
    const w = byId.get(lab)?.world;
    if (w && !worldLast.has(w)) worldLast.set(w, { lab, start: input.earlier?.until ?? 0 });
  }
  const worlds = [...worldLast.entries()].sort((a, b) => b[1].start - a[1].start);
  for (const [w, v] of worlds) {
    // one per world, so three rows are three different reasons
    const c = catalogue.find((x) => x.world === w && !visited.has(x.id) && !taken.has(x.id));
    if (c) add(c, 'world', `Unvisited. You opened ${byId.get(v.lab)?.title ?? v.lab} in this world.`);
  }

  // 4 new since the last visit
  if (input.known && input.known.length) {
    const known = new Set(input.known);
    const when = input.lastVisit ? `, ${ago(input.lastVisit, now)}` : '';
    for (const c of catalogue) {
      if (known.has(c.id) || visited.has(c.id)) continue;
      add(c, 'new', `New since your last visit${when}.`);
    }
  }
  return out;
}

export interface LastSessionsOptions {
  readonly limit?: number;
  /** labs to leave out, for example the hub itself */
  readonly exclude?: readonly string[];
  /** keep the visits of the current page load (default false) */
  readonly includeCurrent?: boolean;
}

export class Resume {
  private readonly now: Clock;
  constructor(private readonly store: Store, private readonly session: string, now?: Clock) {
    this.now = now ?? systemClock;
  }

  /** What the bounded log has dropped, or null while it has dropped nothing. */
  async summarised(): Promise<DroppedSummary | null> {
    return readDropped(await this.store.getMeta(DROPPED_KEY));
  }

  /** The visitor's previous visits, newest first; a visit whose start was dropped is marked partial. */
  async lastSessions(opts: LastSessionsOptions = {}): Promise<Visit[]> {
    const skip = new Set(opts.exclude ?? []);
    const all = visitsFrom(await this.store.events(), { truncated: (await this.summarised()) !== null });
    return all
      .filter((v) => !skip.has(v.lab) && (opts.includeCurrent || v.session !== this.session))
      .slice(0, opts.limit ?? 10);
  }

  /** Up to `limit` suggestions across the catalogue, each with its reason. */
  async whatsNext(catalogue: readonly CatalogueEntry[], opts: Omit<SuggestInput, 'visits' | 'progress' | 'catalogue' | 'now' | 'earlier'> = {}): Promise<Suggestion[]> {
    const [events, progress, dropped] = [await this.store.events(), await this.store.allProgress(), await this.summarised()];
    return suggest({
      ...opts, visits: visitsFrom(events, { truncated: dropped !== null }), progress, catalogue, now: this.now(),
      earlier: dropped ? { labs: dropped.labs, until: dropped.until } : null,
    });
  }
}

/** "2 hours ago · 14 min in view" for a visit, or "2 hours ago · opened from the hub". */
export function describeVisit(v: Visit, now: number): string {
  const when = ago(v.start, now);
  if (v.partial) return `${when} · earlier events summarised`;
  if (v.visibleMs !== null) return `${when} · ${duration(v.visibleMs)} in view`;
  return v.source === 'handoff' && v.from ? `${when} · opened from ${v.from === 'hub' ? 'the hub' : v.from}` : when;
}
