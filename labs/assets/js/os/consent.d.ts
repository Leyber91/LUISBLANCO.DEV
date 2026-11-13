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
/**
 * Bump when what is sent, or who receives it, changes: every visitor is asked again.
 * 2: usage events to Supabase (EU West); v0.1 described a send that never existed.
 */
export declare const CONSENT_POLICY = 2;
export declare const CONSENT_KEY = "consent";
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
export interface SendOptions {
    /** the page is leaving: start the request in this tick and let it outlive the page */
    readonly keepalive?: boolean;
}
export type EraseOutcome = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly detail: string;
};
/** A backend adapter (transport.ts holds the one for Supabase). */
export interface Transport {
    readonly name: string;
    /**
     * Resolves when every event of the batch is stored, or can never be (the backend refuses it as malformed).
     * Rejects when the batch should be offered again: the network failed, or the backend is down or busy.
     */
    send(batch: OutboundBatch, opts?: SendOptions): Promise<void>;
    /** Remove every row this install sent. Resolves with whether the backend confirmed that none remain. */
    erase(install: string): Promise<EraseOutcome>;
}
export type FlushReason = 'sent' | 'no-transport' | 'no-consent' | 'recording-off' | 'stopped' | 'nothing-new' | 'failed';
export interface FlushResult {
    readonly sent: number;
    readonly reason: FlushReason;
    readonly detail?: string;
}
export type EraseResult = 
/** this browser has no install id, so the backend holds nothing of it */
{
    readonly state: 'nothing-sent';
} | {
    readonly state: 'erased';
} | {
    readonly state: 'failed';
    readonly detail: string;
};
export declare const INSTALL_KEY = "install";
/** events per send; the transport's own limit per request is the same */
export declare const BATCH_SIZE = 200;
export interface OutboxOptions {
    readonly store: Store;
    readonly consent: Consent;
    readonly transport: Transport | null;
    readonly batchSize?: number;
    /** the visitor's recording switch (default on); while it is off nothing is sent either */
    readonly recording?: () => boolean;
    readonly now?: Clock;
}
export declare class Outbox {
    private readonly opts;
    /** the flush running now, and the one waiting for it to finish */
    private active;
    private queued;
    /** set while sending is allowed and the install id is known, so a leaving page can send without reading the store */
    private live;
    /** counts the visitor's choices: a flush that began under an earlier choice sends nothing more */
    private choice;
    /** events this page recorded that no send has confirmed */
    private tail;
    private stopped;
    private readonly now;
    private readonly offConsent;
    constructor(opts: OutboxOptions);
    get transport(): Transport | null;
    private recordingOn;
    /** The tracker hands over each event as it is made, so a leaving page still has it in memory. */
    note(event: LabEvent): void;
    /** An event the store refused is not offered either. */
    drop(id: string): void;
    /**
     * Send what is new, if and only if a transport exists, recording is on and consent is granted. Never rejects.
     * One flush runs at a time; a call made while one runs gets the next one, which starts when the first ends,
     * so its answer always covers what was recorded before the call.
     */
    flush(): Promise<FlushResult>;
    private start;
    /** Resolves once no flush is running or waiting. */
    private idle;
    private cursor;
    private run;
    /**
     * The page is leaving. Offer what it recorded and no send has confirmed, now, without reading the store
     * (a leaving page may never get its answer). Returns whether a request was started.
     */
    flushOnExit(): boolean;
    /** The install id, when this browser has one: it exists once sending was allowed. */
    installed(): Promise<string | null>;
    /**
     * Erase this install's rows from the backend. What this browser recorded before the erase is not offered
     * again afterwards. Never rejects.
     */
    erase(): Promise<EraseResult>;
    /** Nothing more leaves this page (after the visitor deletes their record). */
    stop(): void;
    /** Remove the consent listener (tests; a page never needs it). */
    close(): void;
    /** The random install id, made when sending is first allowed. Always the dashed UUID form the backend accepts. */
    private installId;
}
