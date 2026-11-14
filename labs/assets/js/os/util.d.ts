import type { Json, JsonObject } from './types.js';
export type Clock = () => number;
export declare const systemClock: Clock;
/** A random id. crypto.randomUUID needs a secure context; getRandomValues does not. */
export declare function randomId(): string;
/** True for the dashed 8-4-4-4-12 form, the only one the backend accepts as an install id. */
export declare function isUuid(value: unknown): value is string;
/**
 * A random (version 4) UUID in the dashed form. randomId() falls back to 32 undashed hex digits where
 * crypto.randomUUID is missing (an insecure context); the backend reads the install id from a header and
 * accepts the dashed form only, so the install id is made here.
 */
export declare function randomUuid(): string;
/** Lab ids are the hub ids in site.config.js: lowercase, digits and dashes. */
export declare function isLabId(value: unknown): value is string;
/** UTF-8 byte length of a string. */
export declare const byteLength: (s: string) => number;
/**
 * A JSON copy of a plain object, or null when the value is not one.
 * Drops what JSON drops (undefined, functions); refuses cycles and BigInt.
 */
export declare function toJsonObject(value: unknown): {
    ok: true;
    json: string;
    data: JsonObject;
} | {
    ok: false;
    why: string;
};
/** A JSON copy of any value, or an error. */
export declare function toJson(value: unknown): {
    ok: true;
    json: string;
    data: Json;
} | {
    ok: false;
    why: string;
};
/** The page's own URL, or a neutral base outside a browser. */
export declare function pageHref(): string;
/**
 * Resolve a link a lab hands over (resume points) to a same-origin path.
 * Returns null for anything that would leave the site or run script.
 */
export declare function sameOriginPath(url: string, base?: string): string | null;
/** Trim and cap a label so it fits one line of a plate. */
export declare function cleanLabel(s: unknown, max?: number): string;
/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", then "on 3 Nov". */
export declare function ago(then: number, now: number): string;
/** "3 Nov" in the visitor's local time. */
export declare function dayMonth(t: number): string;
/** "40 s", "14 min", "1 h 05 min". */
export declare function duration(ms: number): string;
/** Resolve after `ms`, for racing a write against navigation. */
export declare const delay: (ms: number) => Promise<void>;
