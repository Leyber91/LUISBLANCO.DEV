import type { Transport } from './consent.js';
import type { JsonObject, LabEvent } from './types.js';
import type { Clock } from './util.js';
/** The labs backend. Only the project URL and the publishable key may appear in this repository. */
export declare const BACKEND: Readonly<{
    url: "https://uguiiwmhlqcitxrgqqmh.supabase.co";
    key: "sb_publishable_GCSwvHNL3ulWiDRjaOxFMA_biQPXnsV";
    /** how the copy names who receives the events */
    recipient: "Supabase (EU, Paris)";
}>;
export declare const ROWS_PER_REQUEST = 200;
/** Postgres prints jsonb with a space after each colon and comma; the table refuses more than 2,048 bytes of that. */
export declare const MAX_SENT_DATA_BYTES = 2000;
export declare const MAX_SENT_STRING = 64;
export declare const MAX_SENT_WORDS = 3;
/** One row of public.usage_events, as the Data API takes it. */
export interface UsageRow {
    readonly install_id: string;
    readonly event_id: string;
    /** ISO 8601 */
    readonly t: string;
    readonly lab: string;
    readonly type: string;
    readonly session: string | null;
    readonly data: JsonObject | null;
}
/** What of an event's data may leave the browser. Null when nothing may. */
export declare function sanitizeData(data: JsonObject | null | undefined): JsonObject | null;
/** The row for one event, or null when the table would refuse it. */
export declare function toRow(install: string, e: LabEvent, now: number): UsageRow | null;
export interface SupabaseTransportOptions {
    readonly url?: string;
    readonly key?: string;
    /** defaults to the page's fetch, looked up when a request is made */
    readonly fetch?: typeof fetch;
    readonly now?: Clock;
    readonly timeoutMs?: number;
}
/** The Supabase adapter. No client library: three requests, written out. */
export declare function supabaseTransport(opts?: SupabaseTransportOptions): Transport;
/** For a page running on a fixture: accepts everything and reaches nothing. */
export declare function fixtureTransport(): Transport;
