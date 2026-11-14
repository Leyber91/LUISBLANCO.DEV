import type { JsonObject } from './types.js';
/** One row of public.usage_by_day. Postgres may print a bigint as a number or a string. */
export interface ByDayRow {
    readonly day: string;
    readonly lab: string;
    readonly type: string;
    readonly events: number | string;
    readonly installs?: number | string;
    readonly sessions?: number | string;
    readonly visible_ms?: number | string;
}
/** One row of public.usage_events, with the columns the dashboard reads. */
export interface RawRow {
    readonly t: string;
    readonly lab: string;
    readonly type: string;
    readonly install_id: string;
    readonly session: string | null;
    readonly data: JsonObject | null;
}
export interface CatalogueLab {
    readonly id: string;
    readonly title: string;
}
export interface DayPoint {
    /** YYYY-MM-DD, a UTC day */
    readonly day: string;
    readonly visitors: number;
    readonly sessions: number;
}
export interface LabUsage {
    readonly id: string;
    readonly title: string;
    /** 'hub', a lab of the catalogue, or every other lab id in the data folded into one row */
    readonly kind: 'hub' | 'lab' | 'other';
    readonly visitors: number;
    /** null when the lab recorded no session of its own in the range */
    readonly sessions: number | null;
    readonly opens: number;
    readonly visibleMs: number | null;
    /** null when the lab recorded nothing of its own in the range */
    readonly actions: number | null;
    readonly errors: number | null;
    /** handoffs to this lab, by where the link sat, most first */
    readonly from: readonly {
        readonly via: string;
        readonly n: number;
    }[];
    /** true when the lab was opened in the range, by its own record or by a handoff to it */
    readonly opened: boolean;
}
export interface UsageTotals {
    readonly visitors: number;
    readonly sessions: number;
    /** opens of labs, the hub left out */
    readonly labOpens: number;
    readonly visibleMs: number;
    readonly actions: number;
    readonly errors: number;
}
export interface UsageModel {
    readonly days: number;
    /** first and last UTC day of the range, YYYY-MM-DD */
    readonly from: string;
    readonly to: string;
    readonly totals: UsageTotals;
    /** one point per day of the range, days without visitors included */
    readonly daily: readonly DayPoint[];
    /** the hub, then opened labs (most visitors first), then labs never opened (catalogue order), then "other" */
    readonly labs: readonly LabUsage[];
    /** titles of the catalogue labs nobody opened in the range */
    readonly neverOpened: readonly string[];
    /** true when the range holds no row at all */
    readonly empty: boolean;
}
export declare const RANGES: readonly [7, 30, 90];
export declare const SESSION_TYPES: readonly ['lab.open', 'lab.leave', 'lab.handoff'];
/** The UTC day of a time, YYYY-MM-DD. */
export declare const utcDay: (t: number) => string;
/** The UTC days of a range that ends today: `days` of them, oldest first. */
export declare function rangeDays(days: number, now: number): string[];
export interface BuildOptions {
    readonly days: number;
    readonly now: number;
    /** the labs a visitor can open, in hub order */
    readonly catalogue: readonly CatalogueLab[];
    readonly hub: CatalogueLab;
}
export declare function buildUsage(byDay: readonly ByDayRow[], raw: readonly RawRow[], opts: BuildOptions): UsageModel;
/** The model of a range nobody has data for: every lab listed, every figure zero. */
export declare function emptyUsage(opts: BuildOptions): UsageModel;
