import type { LabEvent, ProgressRecord } from './types.js';
import type { DroppedSummary, Store } from './store.js';
import type { Clock } from './util.js';
export declare const HANDOFF_MERGE_MS = 120000;
export interface Visit {
    readonly lab: string;
    readonly session: string;
    readonly start: number;
    readonly end: number;
    /** from the lab's last lab.leave of that session; null when the lab did not record one */
    readonly visibleMs: number | null;
    readonly totalMs: number | null;
    /** 'lab' when the lab recorded its own session, 'handoff' when only the link to it was recorded */
    readonly source: 'lab' | 'handoff';
    /** the page the visitor came from, for a handoff */
    readonly from: string | null;
    readonly events: number;
    /** true when the session's first events were dropped from the bounded log */
    readonly partial: boolean;
}
/** One lab the hub can point to. `world` groups labs; `worldName` is how it is printed. */
export interface CatalogueEntry {
    readonly id: string;
    readonly title: string;
    readonly href: string;
    readonly world: string;
    readonly worldName: string;
}
export type SuggestionKind = 'continue' | 'due' | 'world' | 'new';
export interface Suggestion {
    readonly lab: string;
    readonly title: string;
    readonly href: string;
    readonly kind: SuggestionKind;
    /** one plain sentence: why this lab, now */
    readonly reason: string;
    readonly world: string;
    readonly worldName: string;
}
/**
 * Every visit in the log, newest first. Pure. `truncated` says the log has
 * dropped older events, so a session without its lab.open is a partial visit
 * instead of a stray.
 */
export declare function visitsFrom(events: readonly LabEvent[], opts?: {
    truncated?: boolean;
}): Visit[];
export interface SuggestInput {
    readonly visits: readonly Visit[];
    readonly progress: readonly ProgressRecord[];
    readonly catalogue: readonly CatalogueEntry[];
    readonly now: number;
    /** lab ids the visitor's last visit saw in the catalogue; null when unknown (nothing is "new") */
    readonly known?: readonly string[] | null;
    /** when that last visit was, for the "new" reason */
    readonly lastVisit?: number | null;
    /** labs not to suggest (the hub excludes the one its plate already offers) */
    readonly exclude?: readonly string[];
    readonly limit?: number;
    /** labs the dropped part of the log shows were visited, and the newest dropped time */
    readonly earlier?: {
        readonly labs: readonly string[];
        readonly until: number;
    } | null;
}
/** The ranked suggestions. Pure and deterministic. */
export declare function suggest(input: SuggestInput): Suggestion[];
export interface LastSessionsOptions {
    readonly limit?: number;
    /** labs to leave out, for example the hub itself */
    readonly exclude?: readonly string[];
    /** keep the visits of the current page load (default false) */
    readonly includeCurrent?: boolean;
}
export declare class Resume {
    private readonly store;
    private readonly session;
    private readonly now;
    constructor(store: Store, session: string, now?: Clock);
    /** What the bounded log has dropped, or null while it has dropped nothing. */
    summarised(): Promise<DroppedSummary | null>;
    /** The visitor's previous visits, newest first; a visit whose start was dropped is marked partial. */
    lastSessions(opts?: LastSessionsOptions): Promise<Visit[]>;
    /** Up to `limit` suggestions across the catalogue, each with its reason. */
    whatsNext(catalogue: readonly CatalogueEntry[], opts?: Omit<SuggestInput, 'visits' | 'progress' | 'catalogue' | 'now' | 'earlier'>): Promise<Suggestion[]>;
}
/** "2 hours ago · 14 min in view" for a visit, or "2 hours ago · opened from the hub". */
export declare function describeVisit(v: Visit, now: number): string;
