import type { LabEvent, ProgressRecord, StoreCounts, Json } from './types.js';
import type { DroppedSummary, StorageKind, Store } from './store.js';
import type { RecordingState } from './recording.js';
import type { Clock } from './util.js';
import type { ExtraErase, ExtraExport, ExtraFound, KeyValue } from './extras.js';
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
    /** what the labs keep in the browser beside the record; a key the visitor typed is left out */
    readonly extras: ExtraExport[];
}
/** Every stored record, as one JSON document. `extras` is the browser's storage, or null to read none of it. */
export declare function exportAll(store: Store, now?: Clock, extras?: KeyValue | null): Promise<ExportFile>;
export interface DeleteResult {
    readonly deleted: StoreCounts;
    readonly remaining: StoreCounts;
    /** the settings written back after the erase */
    readonly kept: string[];
    /** what happened to the labs' own stores in the browser */
    readonly extras: ExtraErase;
    /** true when nothing remains but the kept settings, here and in the labs' own stores */
    readonly ok: boolean;
}
/**
 * Erase every record, write back the settings named in `keep`, erase the labs' own stores in `extras` (the
 * browser's storage; null touches none), then count again to confirm.
 */
export declare function deleteAll(store: Store, opts?: {
    keep?: readonly string[];
    extras?: KeyValue | null;
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
    /** the labs' own stores that hold something */
    readonly extras: ExtraFound[];
}
/** What is stored, in a form the "Your data" panel prints. `extras` is the browser's storage, or null. */
export declare function summary(store: Store, extras?: KeyValue | null): Promise<Summary>;
