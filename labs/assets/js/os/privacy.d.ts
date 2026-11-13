import type { LabEvent, ProgressRecord, StoreCounts, Json } from './types.js';
import type { StorageKind, Store } from './store.js';
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
    /** true when nothing remains */
    readonly ok: boolean;
}
/** Erase every record, then count again to confirm. */
export declare function deleteAll(store: Store): Promise<DeleteResult>;
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
export declare function summary(store: Store): Promise<Summary>;
