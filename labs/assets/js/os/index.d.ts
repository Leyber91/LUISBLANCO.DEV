import type { OSConfig } from './config.js';
import { Consent, Outbox } from './consent.js';
import { Registry } from './events.js';
import type { EventSpec, TrackResult } from './events.js';
import type { EventClass, Json, DueItem, ProgressRecord } from './types.js';
import type { DeleteResult, ExportFile, Summary } from './privacy.js';
import type { GetOptions } from './progress.js';
import { Resume } from './resume.js';
import { mountScene } from './scene.js';
import type { RecordingState } from './recording.js';
import type { StorageKind } from './store.js';
import type { Clock } from './util.js';
export interface InitOptions {
    readonly lab: string;
    /** IndexedDB factory; null forces memory. Defaults to the browser's. */
    readonly idb?: IDBFactory | null;
    /** a fixture name; undefined reads ?os-fixture= from the page URL; null ignores the URL */
    readonly fixture?: string | null;
    readonly now?: Clock;
    readonly config?: Partial<OSConfig>;
    /** record lab.open and lab.leave (default true) */
    readonly lifecycle?: boolean;
    /** mount the consent banner when the config allows it (default true) */
    readonly ui?: boolean;
    /** the log's bound (tests); defaults to MAX_EVENTS */
    readonly maxEvents?: number;
}
export interface StorageInfo {
    readonly kind: StorageKind;
    readonly persistent: boolean;
    readonly note: string;
    readonly fixture: string | null;
}
/** The lab's own progress, bound to its id; `of` reads any lab's record. */
export interface BoundProgress {
    get<T = Json>(opts?: GetOptions<T>): Promise<ProgressRecord | null>;
    set(data: unknown, opts?: {
        v?: number;
    }): Promise<ProgressRecord>;
    setResume(url: string, label: string): Promise<ProgressRecord>;
    clearResume(): Promise<ProgressRecord>;
    setDue(items: readonly DueItem[]): Promise<ProgressRecord>;
    finish(finished?: boolean): Promise<ProgressRecord>;
    of(lab: string): Promise<ProgressRecord | null>;
    all(): Promise<ProgressRecord[]>;
}
export interface LabsOSInstance {
    readonly lab: string;
    readonly session: string;
    readonly storage: StorageInfo;
    /** the visit before this page load, on any lab page; null on a first visit */
    readonly previousVisit: {
        readonly t: number;
        readonly lab: string;
    } | null;
    readonly config: OSConfig;
    readonly registry: Registry;
    readonly progress: BoundProgress;
    readonly resume: Resume;
    readonly consent: Consent;
    readonly outbox: Outbox;
    readonly privacy: {
        summary(): Promise<Summary>;
        exportAll(): Promise<ExportFile>;
        /** erase every record and stop recording on this page; a "recording off" choice survives */
        deleteAll(): Promise<DeleteResult>;
    };
    /** the visitor's switch for the record */
    readonly recording: {
        readonly on: boolean;
        /** when it was last switched, or null */
        readonly since: number | null;
        set(on: boolean): Promise<RecordingState>;
        onChange(fn: (s: RecordingState) => void): () => void;
    };
    readonly mountScene: typeof mountScene;
    /** true once the visitor deleted their record on this page */
    readonly halted: boolean;
    register(type: string, spec: {
        cls: EventClass;
        throttleMs?: number;
    }): void;
    spec(type: string): EventSpec | undefined;
    /** record an event for this lab */
    track(type: string, data?: object | null): Promise<TrackResult>;
    /** a callback for when the visitor deletes their record */
    onDeleted(fn: () => void): () => void;
    /** remove listeners and close the store (tests; a page never needs it) */
    close(): void;
}
export declare const LabsOS: {
    /**
     * Start Labs OS for this page. Idempotent: a second call for the same
     * lab returns the same instance; a call for a different lab rejects,
     * because one page is one lab.
     */
    init(opts: InitOptions): Promise<LabsOSInstance>;
    /** the running instance, once init has resolved */
    readonly instance: LabsOSInstance | null;
    /** forget the running instance (tests) */
    reset(): void;
};
export default LabsOS;
export { OS_CONFIG } from './config.js';
export type { OSConfig } from './config.js';
export { Registry, Tracker, BUILTIN_EVENTS, MAX_DATA_BYTES } from './events.js';
export type { EventSpec, TrackResult, TrackRefusal } from './events.js';
export { Progress, MAX_PROGRESS_BYTES } from './progress.js';
export { Resume, visitsFrom, suggest, describeVisit } from './resume.js';
export type { Visit, CatalogueEntry, Suggestion, SuggestionKind } from './resume.js';
export { Consent, Outbox, CONSENT_POLICY } from './consent.js';
export type { ConsentRecord, ConsentState, Transport, OutboundBatch, FlushResult } from './consent.js';
export { exportAll, deleteAll, summary } from './privacy.js';
export type { ExportFile, DeleteResult, Summary } from './privacy.js';
export { mountScene, sceneCount } from './scene.js';
export type { SceneHandle, SceneContext, SceneFactory, MountedScene } from './scene.js';
export { openStore, memoryStore, DB_NAME, DB_VERSION, MIGRATIONS, MAX_EVENTS, DROPPED_KEY } from './store.js';
export type { Store, StorageKind, Migration, DroppedSummary } from './store.js';
export { RECORDING_KEY } from './recording.js';
export type { RecordingState } from './recording.js';
export { FIXTURES, fixtureStore } from './fixtures.js';
export { ago, duration, dayMonth } from './util.js';
export type * from './types.js';
