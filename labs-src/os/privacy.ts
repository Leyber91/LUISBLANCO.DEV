/* ============================================================
   labs-src/os/privacy.ts — the visitor's data rights over what Labs OS
   keeps: see it (summary), take it (exportAll) and erase it
   (deleteAll, which counts what remains to confirm).
   ============================================================ */

import type { LabEvent, ProgressRecord, StoreCounts, Json } from './types.js';
import type { StorageKind, Store } from './store.js';
import { systemClock } from './util.js';
import type { Clock } from './util.js';

export interface ExportFile {
  readonly format: 'labs-os-export';
  readonly v: 1;
  /** ISO time of the export */
  readonly exported: string;
  readonly storage: { readonly kind: StorageKind; readonly persistent: boolean; readonly fixture: string | null };
  readonly counts: StoreCounts;
  readonly events: LabEvent[];
  readonly progress: ProgressRecord[];
  readonly meta: Record<string, Json>;
}

/** Every stored record, as one JSON document. */
export async function exportAll(store: Store, now: Clock = systemClock): Promise<ExportFile> {
  const d = await store.dump();
  return {
    format: 'labs-os-export', v: 1, exported: new Date(now()).toISOString(),
    storage: { kind: store.kind, persistent: store.persistent, fixture: store.fixture },
    counts: { events: d.events.length, progress: d.progress.length, meta: Object.keys(d.meta).length },
    events: d.events, progress: d.progress, meta: d.meta,
  };
}

export interface DeleteResult {
  readonly deleted: StoreCounts;
  readonly remaining: StoreCounts;
  /** true when nothing remains */
  readonly ok: boolean;
}

/** Erase every record, then count again to confirm. */
export async function deleteAll(store: Store): Promise<DeleteResult> {
  const before = await store.counts();
  await store.clear();
  const remaining = await store.counts();
  const ok = remaining.events === 0 && remaining.progress === 0 && remaining.meta === 0;
  return { deleted: before, remaining, ok };
}

export interface Summary {
  readonly counts: StoreCounts;
  readonly firstEvent: number | null;
  readonly lastEvent: number | null;
  /** labs with a progress record */
  readonly labs: string[];
  /** names of the settings kept */
  readonly settings: string[];
}

/** What is stored, in a form the "Your data" panel prints. */
export async function summary(store: Store): Promise<Summary> {
  const [events, progress, meta] = [await store.events(), await store.allProgress(), await store.allMeta()];
  return {
    counts: { events: events.length, progress: progress.length, meta: Object.keys(meta).length },
    firstEvent: events[0]?.t ?? null,
    lastEvent: events[events.length - 1]?.t ?? null,
    labs: progress.map((p) => p.lab).sort(),
    settings: Object.keys(meta).sort(),
  };
}
