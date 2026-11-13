import type { Json, LabEvent, ProgressRecord, StoreCounts, StoreDump } from './types.js';
export declare const DB_NAME = "labs";
/** One schema step, run inside the versionchange transaction. */
export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;
export declare const MIGRATIONS: readonly Migration[];
export declare const DB_VERSION: number;
export type StorageKind = 'indexeddb' | 'memory';
export interface EventQuery {
    readonly lab?: string;
    /** inclusive lower bound on t */
    readonly since?: number;
    /** inclusive upper bound on t */
    readonly until?: number;
}
export interface Store {
    readonly kind: StorageKind;
    /** true when records outlive this page */
    readonly persistent: boolean;
    /** why the store is in memory, or '' */
    readonly note: string;
    /** set when the store was seeded by a named fixture instead of the visitor's own record */
    readonly fixture: string | null;
    append(event: LabEvent): Promise<void>;
    /** events in time order (ties keep insertion order) */
    events(query?: EventQuery): Promise<LabEvent[]>;
    getProgress(lab: string): Promise<ProgressRecord | undefined>;
    putProgress(record: ProgressRecord): Promise<void>;
    allProgress(): Promise<ProgressRecord[]>;
    getMeta(key: string): Promise<Json | undefined>;
    setMeta(key: string, value: Json): Promise<void>;
    allMeta(): Promise<Record<string, Json>>;
    counts(): Promise<StoreCounts>;
    dump(): Promise<StoreDump>;
    clear(): Promise<void>;
    close(): void;
}
export interface MemoryStoreOptions {
    /** what to tell the visitor about why nothing is kept */
    readonly note?: string;
    /** a fixture may present itself as persistent so the hub renders a returning visitor's view */
    readonly persistent?: boolean;
    readonly fixture?: string | null;
    readonly seed?: Partial<StoreDump>;
}
export declare function memoryStore(opts?: MemoryStoreOptions): Store;
export interface OpenOptions {
    /** the IndexedDB factory; null forces the memory store; defaults to globalThis.indexedDB */
    readonly idb?: IDBFactory | null;
    readonly name?: string;
    /** schema steps; defaults to MIGRATIONS (tests pass a longer list to prove an upgrade) */
    readonly migrations?: readonly Migration[];
    /** give up on a database that neither opens nor errors (a blocked upgrade) after this long */
    readonly timeoutMs?: number;
}
/**
 * Open the visitor's store. Never rejects: anything that stops IndexedDB
 * returns a memory store whose note says why.
 */
export declare function openStore(opts?: OpenOptions): Promise<Store>;
