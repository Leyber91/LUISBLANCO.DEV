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
import { ago, duration, systemClock } from './util.js';
export const HANDOFF_MERGE_MS = 120_000;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Every visit in the log, newest first. Pure. */
export function visitsFrom(events) {
    const own = new Map();
    const handoffs = [];
    for (const e of events) {
        if (e.type === 'lab.handoff') {
            const to = e.data?.['to'];
            if (typeof to === 'string' && to !== e.lab)
                handoffs.push({ to, t: e.t, session: e.session, from: e.lab });
        }
        const key = `${e.session}\u0000${e.lab}`;
        let v = own.get(key);
        if (!v) {
            if (e.type !== 'lab.open')
                continue; // a session begins with its open; stray events before it are not a visit
            v = { lab: e.lab, session: e.session, start: e.t, end: e.t, visibleMs: null, totalMs: null, n: 0 };
            own.set(key, v);
        }
        v.end = Math.max(v.end, e.t);
        v.n++;
        if (e.type === 'lab.leave') {
            const vis = num(e.data?.['visibleMs']), tot = num(e.data?.['totalMs']);
            // lab.leave is cumulative: the largest is the session's total.
            if (tot !== null && (v.totalMs === null || tot >= v.totalMs)) {
                v.totalMs = tot;
                v.visibleMs = vis;
            }
        }
    }
    const visits = [...own.values()].map((v) => ({
        lab: v.lab, session: v.session, start: v.start, end: v.end, visibleMs: v.visibleMs, totalMs: v.totalMs,
        source: 'lab', from: null, events: v.n,
    }));
    for (const h of handoffs) {
        const merged = visits.some((v) => v.source === 'lab' && v.lab === h.to && v.start >= h.t && v.start - h.t <= HANDOFF_MERGE_MS);
        if (merged)
            continue;
        visits.push({ lab: h.to, session: h.session, start: h.t, end: h.t, visibleMs: null, totalMs: null, source: 'handoff', from: h.from, events: 1 });
    }
    return visits.sort((a, b) => b.start - a.start || (a.lab < b.lab ? -1 : a.lab > b.lab ? 1 : 0));
}
/** The ranked suggestions. Pure and deterministic. */
export function suggest(input) {
    const { visits, progress, catalogue, now } = input;
    const limit = input.limit ?? 3;
    const order = new Map(catalogue.map((c, i) => [c.id, i]));
    const byId = new Map(catalogue.map((c) => [c.id, c]));
    const taken = new Set(input.exclude ?? []);
    const out = [];
    const add = (c, kind, reason, href = c.href) => {
        if (out.length >= limit || taken.has(c.id))
            return;
        taken.add(c.id);
        out.push({ lab: c.id, title: c.title, href, kind, reason, world: c.world, worldName: c.worldName });
    };
    const rank = (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
    // 1 continue
    const unfinished = progress
        .filter((p) => p.resume && !p.finished && byId.has(p.lab))
        .sort((a, b) => (b.resume?.t ?? 0) - (a.resume?.t ?? 0) || rank(a.lab) - rank(b.lab));
    for (const p of unfinished) {
        const c = byId.get(p.lab), r = p.resume;
        if (c && r)
            add(c, 'continue', `Unfinished: you stopped at ${r.label}, ${ago(r.t, now)}.`, r.url);
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
        if (c)
            add(c, 'due', n === 1
                ? `1 item due; it fell due ${ago(x.oldest, now)}.`
                : `${n} items due; the oldest fell due ${ago(x.oldest, now)}.`);
    }
    // 3 an unvisited lab in a world the visitor has explored
    const visited = new Set(visits.map((v) => v.lab));
    const worldLast = new Map();
    for (const v of visits) { // visits are newest first, so the first per world is its latest
        const w = byId.get(v.lab)?.world;
        if (w && !worldLast.has(w))
            worldLast.set(w, v);
    }
    const worlds = [...worldLast.entries()].sort((a, b) => b[1].start - a[1].start);
    for (const [w, v] of worlds) {
        // one per world, so three rows are three different reasons
        const c = catalogue.find((x) => x.world === w && !visited.has(x.id) && !taken.has(x.id));
        if (c)
            add(c, 'world', `Unvisited. You opened ${byId.get(v.lab)?.title ?? v.lab} in this world.`);
    }
    // 4 new since the last visit
    if (input.known && input.known.length) {
        const known = new Set(input.known);
        const when = input.lastVisit ? `, ${ago(input.lastVisit, now)}` : '';
        for (const c of catalogue) {
            if (known.has(c.id) || visited.has(c.id))
                continue;
            add(c, 'new', `New since your last visit${when}.`);
        }
    }
    return out;
}
export class Resume {
    store;
    session;
    now;
    constructor(store, session, now) {
        this.store = store;
        this.session = session;
        this.now = now ?? systemClock;
    }
    /** The visitor's previous visits, newest first. */
    async lastSessions(opts = {}) {
        const skip = new Set(opts.exclude ?? []);
        const all = visitsFrom(await this.store.events());
        return all
            .filter((v) => !skip.has(v.lab) && (opts.includeCurrent || v.session !== this.session))
            .slice(0, opts.limit ?? 10);
    }
    /** Up to `limit` suggestions across the catalogue, each with its reason. */
    async whatsNext(catalogue, opts = {}) {
        const [events, progress] = [await this.store.events(), await this.store.allProgress()];
        return suggest({ ...opts, visits: visitsFrom(events), progress, catalogue, now: this.now() });
    }
}
/** "2 hours ago · 14 min in view" for a visit, or "2 hours ago · opened from the hub". */
export function describeVisit(v, now) {
    const when = ago(v.start, now);
    if (v.visibleMs !== null)
        return `${when} · ${duration(v.visibleMs)} in view`;
    return v.source === 'handoff' && v.from ? `${when} · opened from ${v.from === 'hub' ? 'the hub' : v.from}` : when;
}
