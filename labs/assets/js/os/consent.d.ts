import type { LabEvent } from './types.js';
import type { Store } from './store.js';
import type { Clock } from './util.js';
export type ConsentState = 'unset' | 'granted' | 'denied';
export interface ConsentRecord {
    readonly state: ConsentState;
    /** when the choice was made; null while unset */
    readonly t: number | null;
    readonly policy: number;
}
/** Bump when what is sent, or who receives it, changes: every visitor is asked again. */
export declare const CONSENT_POLICY = 1;
export declare class Consent {
    private readonly store;
    private readonly now;
    private readonly listeners;
    constructor(store: Store, now?: Clock);
    get(): Promise<ConsentRecord>;
    set(state: 'granted' | 'denied'): Promise<ConsentRecord>;
    onChange(fn: (r: ConsentRecord) => void): () => void;
}
/** What a transport receives: the install id and the events since the last send. */
export interface OutboundBatch {
    readonly install: string;
    readonly events: readonly LabEvent[];
}
/** A backend adapter (a Supabase client, later). send() resolves when the batch is stored. */
export interface Transport {
    readonly name: string;
    send(batch: OutboundBatch): Promise<void>;
}
export type FlushReason = 'sent' | 'no-transport' | 'no-consent' | 'nothing-new' | 'failed';
export interface FlushResult {
    readonly sent: number;
    readonly reason: FlushReason;
    readonly detail?: string;
}
export interface OutboxOptions {
    readonly store: Store;
    readonly consent: Consent;
    readonly transport: Transport | null;
    readonly batchSize?: number;
}
export declare class Outbox {
    private readonly opts;
    private running;
    constructor(opts: OutboxOptions);
    get transport(): Transport | null;
    /** Send what is new, if and only if consent is granted and a transport exists. */
    flush(): Promise<FlushResult>;
    private run;
    /** The random install id, created on first need. Only a send needs it. */
    private installId;
}
