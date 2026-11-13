/* ============================================================
   labs-src/os/privacy.ts — the visitor's data rights over what Labs OS
   keeps: see it (summary), take it (exportAll) and erase it
   (deleteAll, which counts what remains to confirm).

   deleteAll can keep named settings. The facade (index.ts) keeps
   the choices that say "off" (recording off, sharing refused), so
   erasing the record never switches anything on behind the
   visitor's back, and the install id when the backend's copy
   could not be erased, so that erase can be repeated. The rows
   on the backend are erased by the outbox (consent.ts), not here.
   ============================================================ */
import { DROPPED_KEY, readDropped } from './store.js';
import { RECORDING_KEY, readRecording } from './recording.js';
import { systemClock } from './util.js';
/** Every stored record, as one JSON document. */
export async function exportAll(store, now = systemClock) {
    const d = await store.dump();
    return {
        format: 'labs-os-export', v: 1, exported: new Date(now()).toISOString(),
        storage: { kind: store.kind, persistent: store.persistent, fixture: store.fixture },
        counts: { events: d.events.length, progress: d.progress.length, meta: Object.keys(d.meta).length },
        events: d.events, progress: d.progress, meta: d.meta,
    };
}
/** Erase every record, write back the settings named in `keep`, then count again to confirm. */
export async function deleteAll(store, opts = {}) {
    const keep = [];
    for (const k of opts.keep ?? []) {
        const v = await store.getMeta(k);
        if (v !== undefined)
            keep.push([k, v]);
    }
    const before = await store.counts();
    await store.clear();
    for (const [k, v] of keep)
        await store.setMeta(k, v);
    const remaining = await store.counts();
    const ok = remaining.events === 0 && remaining.progress === 0 && remaining.meta === keep.length;
    return {
        deleted: { events: before.events, progress: before.progress, meta: before.meta - keep.length },
        remaining, kept: keep.map(([k]) => k), ok,
    };
}
/** What is stored, in a form the "Your data" panel prints. */
export async function summary(store) {
    const [events, progress, meta] = [await store.events(), await store.allProgress(), await store.allMeta()];
    return {
        counts: { events: events.length, progress: progress.length, meta: Object.keys(meta).length },
        firstEvent: events[0]?.t ?? null,
        lastEvent: events[events.length - 1]?.t ?? null,
        labs: progress.map((p) => p.lab).sort(),
        settings: Object.keys(meta).sort(),
        maxEvents: store.maxEvents,
        dropped: readDropped(meta[DROPPED_KEY]),
        recording: readRecording(meta[RECORDING_KEY]),
    };
}
