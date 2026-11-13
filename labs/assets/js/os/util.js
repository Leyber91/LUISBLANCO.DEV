/* ============================================================
   labs-src/os/util.ts — small pure helpers shared by the OS modules:
   random ids, JSON size, lab-id and URL validation, and the
   plain-English time phrases the hub prints.
   ============================================================ */
export const systemClock = () => Date.now();
/** A random id. crypto.randomUUID needs a secure context; getRandomValues does not. */
export function randomId() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') {
        try {
            return c.randomUUID();
        }
        catch { /* insecure context: fall through */ }
    }
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function')
        c.getRandomValues(bytes);
    else
        for (let i = 0; i < bytes.length; i++)
            bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
const LAB_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Lab ids are the hub ids in site.config.js: lowercase, digits and dashes. */
export function isLabId(value) {
    return typeof value === 'string' && LAB_ID.test(value);
}
const encoder = new TextEncoder();
/** UTF-8 byte length of a string. */
export const byteLength = (s) => encoder.encode(s).length;
/**
 * A JSON copy of a plain object, or null when the value is not one.
 * Drops what JSON drops (undefined, functions); refuses cycles and BigInt.
 */
export function toJsonObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, why: 'data must be a plain object' };
    }
    let json;
    try {
        json = JSON.stringify(value);
    }
    catch (e) {
        return { ok: false, why: `not serialisable: ${e.message}` };
    }
    return { ok: true, json, data: JSON.parse(json) };
}
/** A JSON copy of any value, or an error. */
export function toJson(value) {
    let json;
    try {
        json = JSON.stringify(value);
    }
    catch (e) {
        return { ok: false, why: `not serialisable: ${e.message}` };
    }
    if (json === undefined)
        return { ok: false, why: 'value has no JSON form' };
    return { ok: true, json, data: JSON.parse(json) };
}
/** The page's own URL, or a neutral base outside a browser. */
export function pageHref() {
    try {
        return globalThis.location?.href || 'http://localhost/';
    }
    catch {
        return 'http://localhost/';
    }
}
/**
 * Resolve a link a lab hands over (resume points) to a same-origin path.
 * Returns null for anything that would leave the site or run script.
 */
export function sameOriginPath(url, base = pageHref()) {
    if (typeof url !== 'string' || !url.trim())
        return null;
    let b, u;
    try {
        b = new URL(base);
        u = new URL(url.trim(), b);
    }
    catch {
        return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:')
        return null;
    if (u.origin !== b.origin)
        return null;
    return u.pathname + u.search + u.hash;
}
/** Trim and cap a label so it fits one line of a plate. */
export function cleanLabel(s, max = 80) {
    const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", then "on 3 Nov". */
export function ago(then, now) {
    const d = Math.max(0, now - then);
    if (d < 45_000)
        return 'just now';
    const m = Math.max(1, Math.round(d / MIN));
    if (m < 60)
        return `${plural(m, 'minute')} ago`;
    const h = Math.round(d / HOUR);
    if (h < 24)
        return `${plural(h, 'hour')} ago`;
    const days = Math.round(d / DAY);
    if (days < 14)
        return `${plural(days, 'day')} ago`;
    return `on ${dayMonth(then)}`;
}
/** "3 Nov" in the visitor's local time. */
export function dayMonth(t) {
    const d = new Date(t);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** "40 s", "14 min", "1 h 05 min". */
export function duration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60)
        return `${s} s`;
    const m = Math.round(s / 60);
    if (m < 60)
        return `${m} min`;
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
/** Resolve after `ms`, for racing a write against navigation. */
export const delay = (ms) => new Promise((res) => setTimeout(res, ms));
