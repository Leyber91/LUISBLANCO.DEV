import type { Json, LabEvent, ProgressRecord, StoreCounts, StoreDump } from './types.js';
export declare const DB_NAME = "labs";
/** The log keeps this many events, the newest. */
export declare const MAX_EVENTS = 5000;
/** Meta key of the summary of events dropped to keep the log bounded. */
export declare const DROPPED_KEY = "log.dropped";
/** What the bounded log dropped, kept so a reader can say "earlier events summarised". */
export interface DroppedSummary {
    readonly total: number;
    /** dropped events per lab id (the lab that recorded them) */
    readonly byLab: Readonly<Record<string, number>>;
    /** every lab the dropped events show was visited, handoff targets included */
    readonly labs: readonly string[];
    /** time of the oldest and the newest dropped event */
    readonly since: number;
    readonly until: number;
}
/** The dropped summary in a meta value, or null. */
export declare function readDropped(raw: Json | undefined): DroppedSummary | null;
/** Add a batch of dropped events to the running summary. */
export declare function mergeDropped(prev: Json | undefined, gone: readonly LabEvent[]): DroppedSummary;
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
    /** the log keeps this many events, the newest */
    readonly maxEvents: number;
    /** add one event; past maxEvents the oldest are dropped into the summary under DROPPED_KEY */
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
    readonly maxEvents?: number;
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
    /** the log's bound; defaults to MAX_EVENTS (tests pass a small one) */
    readonly maxEvents?: number;
}
/**
 * Open the visitor's store. Never rejects: anything that stops IndexedDB
 * returns a memory store whose note says why.
 */
export declare function openStore(opts?: OpenOptions): Promise<Store>;
