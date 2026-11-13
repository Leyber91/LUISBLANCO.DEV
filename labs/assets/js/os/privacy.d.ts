import type { LabEvent, ProgressRecord, StoreCounts, Json } from './types.js';
import type { DroppedSummary, StorageKind, Store } from './store.js';
import type { RecordingState } from './recording.js';
import type { Clock } from './util.js';
export interface ExportFile {
    readonly format: 'labs-os-export';
    readonly v: 1;
    /** ISO time of the export */
    readonly exported: string;
    readonly storage: {
        readonly kind: StorageKind;
        readonly persistent: boolean;
        readonly fixture: string | null;
    };
    readonly counts: StoreCounts;
    readonly events: LabEvent[];
    readonly progress: ProgressRecord[];
    readonly meta: Record<string, Json>;
}
/** Every stored record, as one JSON document. */
export declare function exportAll(store: Store, now?: Clock): Promise<ExportFile>;
export interface DeleteResult {
    readonly deleted: StoreCounts;
    readonly remaining: StoreCounts;
    /** the settings written back after the erase */
    readonly kept: string[];
    /** true when nothing remains but the kept settings */
    readonly ok: boolean;
}
/** Erase every record, write back the settings named in `keep`, then count again to confirm. */
export declare function deleteAll(store: Store, opts?: {
    keep?: readonly string[];
}): Promise<DeleteResult>;
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
export declare function summary(store: Store): Promise<Summary>;
