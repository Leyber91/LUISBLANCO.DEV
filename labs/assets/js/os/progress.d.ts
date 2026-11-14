import type { DueItem, Json, ProgressRecord } from './types.js';
import type { Store } from './store.js';
import type { Clock } from './util.js';
export declare const MAX_PROGRESS_BYTES: number;
export declare const MAX_DUE_ITEMS = 100;
export interface GetOptions<T> {
    /** the schema version the caller understands */
    readonly v?: number;
    /** upgrade older data; called once, then the result is saved under `v` */
    readonly migrate?: (data: Json, from: number) => T;
}
export declare class Progress {
    private readonly store;
    private readonly now;
    constructor(store: Store, now?: Clock);
    /** The lab's record, upgraded to `opts.v` when a migrate function is given; null when none exists. */
    get<T = Json>(lab: string, opts?: GetOptions<T>): Promise<ProgressRecord | null>;
    /** Replace the lab's data. Resume point, due items and finished flag are kept. */
    set(lab: string, data: unknown, opts?: {
        v?: number;
    }): Promise<ProgressRecord>;
    /** Where "continue" leads for this lab. The url must stay on this site. */
    setResume(lab: string, url: string, label: string): Promise<ProgressRecord>;
    clearResume(lab: string): Promise<ProgressRecord>;
    /** Replace the lab's list of items waiting for the visitor. */
    setDue(lab: string, items: readonly DueItem[]): Promise<ProgressRecord>;
    /** Mark the lab's run complete (or reopen it with false). */
    finish(lab: string, finished?: boolean): Promise<ProgressRecord>;
    all(): Promise<ProgressRecord[]>;
    private queue;
    private update;
}
