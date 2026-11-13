import type { EventClass, LabEvent } from './types.js';
import type { Store } from './store.js';
import type { Clock } from './util.js';
export declare const MAX_DATA_BYTES = 2048;
export interface EventSpec {
    readonly cls: EventClass;
    /** minimum ms between two accepted events of this type for one lab; 0 accepts all */
    readonly throttleMs: number;
}
export declare const BUILTIN_EVENTS: Readonly<Record<string, EventSpec>>;
export declare class Registry {
    private readonly specs;
    /**
     * Add a lab's own event type. Throws on a malformed name, a reserved
     * "lab." name, a type already registered or a bad spec: these are
     * mistakes in the lab's code, found the first time it runs.
     */
    register(type: string, spec: {
        cls: EventClass;
        throttleMs?: number;
    }): void;
    get(type: string): EventSpec | undefined;
    has(type: string): boolean;
    types(): string[];
}
export type TrackRefusal = 'bad-lab' | 'unknown-type' | 'bad-data' | 'too-large' | 'throttled' | 'halted' | 'store-failed' | 'recording off';
export type TrackResult = {
    readonly ok: true;
    readonly event: LabEvent;
} | {
    readonly ok: false;
    readonly reason: TrackRefusal;
    readonly detail: string;
};
export interface TrackerOptions {
    readonly store: Store;
    readonly registry: Registry;
    readonly session: string;
    readonly now?: Clock;
    readonly id?: () => string;
}
export declare class Tracker {
    private readonly opts;
    private readonly last;
    private halted;
    private recordingOn;
    private readonly now;
    private readonly id;
    constructor(opts: TrackerOptions);
    get session(): string;
    /** Stop recording for the rest of this page (after the visitor deletes their record). */
    halt(): void;
    get isHalted(): boolean;
    /** Follow the visitor's recording switch (the facade keeps it in step with meta). */
    setRecording(on: boolean): void;
    get recording(): boolean;
    track(lab: string, type: string, data?: object | null): Promise<TrackResult>;
}
