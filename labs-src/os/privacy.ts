/* ============================================================
   labs-src/os/privacy.ts — the visitor's data rights over what Labs OS
   keeps: see it (summary), take it (exportAll) and erase it
   (deleteAll, which counts what remains to confirm).

   deleteAll can keep named settings (the facade keeps "recording"
   while it is off), so erasing the record never turns recording
   back on behind the visitor's back.
   ============================================================ */

import type { LabEvent, ProgressRecord, StoreCounts, Json } from './types.js';
import { DROPPED_KEY, readDropped } from './store.js';
import type { DroppedSummary, StorageKind, Store } from './store.js';
import { RECORDING_KEY, readRecording } from './recording.js';
import type { RecordingState } from './recording.js';
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
  /** the settings written back after the erase */
  readonly kept: string[];
  /** true when nothing remains but the kept settings */
  readonly ok: boolean;
}

/** Erase every record, write back the settings named in `keep`, then count again to confirm. */
export async function deleteAll(store: Store, opts: { keep?: readonly string[] } = {}): Promise<DeleteResult> {
  const keep: [string, Json][] = [];
  for (const k of opts.keep ?? []) {
    const v = await store.getMeta(k);
    if (v !== undefined) keep.push([k, v]);
  }
  const before = await store.counts();
  await store.clear();
  for (const [k, v] of keep) await store.setMeta(k, v);
  const remaining = await store.counts();
  const ok = remaining.events === 0 && remaining.progress === 0 && remaining.meta === keep.length;
  return {
    deleted: { events: before.events, progress: before.progress, meta: before.meta - keep.length },
    remaining, kept: keep.map(([k]) => k), ok,
  };
}

export interface Summary {
  readonly counts: StoreCounts;
  readonly firstEvent: number | null;
  readonly lastEvent: number | null;
  /** labs with a progress record */
  readonly labs: string[];
  /** names of the settings kept */
  readonly settings: string[];
  /** the log's bound */
  readonly maxEvents: number;
  /** what the bounded log has dropped, or null */
  readonly dropped: DroppedSummary | null;
  readonly recording: RecordingState;
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
    maxEvents: store.maxEvents,
    dropped: readDropped(meta[DROPPED_KEY]),
    recording: readRecording(meta[RECORDING_KEY]),
  };
}
