/* ============================================================
   labs-src/os/privacy.ts — the visitor's data rights over what Labs OS
   keeps: see it (summary), take it (exportAll) and erase it
   (deleteAll, which counts what remains to confirm).
   ============================================================ */
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
/** Erase every record, then count again to confirm. */
export async function deleteAll(store) {
    const before = await store.counts();
    await store.clear();
    const remaining = await store.counts();
    const ok = remaining.events === 0 && remaining.progress === 0 && remaining.meta === 0;
    return { deleted: before, remaining, ok };
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
    };
}
