import type { ByDayRow, RawRow } from './usage.js';
import type { Clock } from './util.js';
export interface OwnerSession {
    readonly accessToken: string;
    readonly refreshToken: string;
    /** ms since the epoch */
    readonly expiresAt: number;
    readonly email: string | null;
}
/**
 * SHA-256 of the owner's address, lower case: the value the backend's is_admin() compares against
 * (supabase/migrations, "retention_owner"). The address itself is the contact address on the site's home page.
 */
export declare const OWNER_ADDRESS_SHA256 = "a1fd9c6a2efdca488506075da86f2ba686743bc6fb91a34d21582963042f0eb6";
export declare const SESSION_STORE_KEY = "labs.owner.session";
/** rows asked for per request (the API may be set to return fewer), and the most requests one read makes for one table */
export declare const PAGE_ROWS = 1000;
export declare const MAX_PAGES = 20;
export type LinkResult = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: 'rate-limited' | 'refused' | 'network';
    readonly detail: string;
};
export type ReadFailure = 'signed-out' | 'network' | 'backend';
export declare class OwnerReadError extends Error {
    readonly kind: ReadFailure;
    constructor(kind: ReadFailure, detail: string);
}
export interface UsageRead {
    readonly byDay: ByDayRow[];
    readonly raw: RawRow[];
    /** true when this account can see at least one usage row, of any day: only the owner can */
    readonly anyRows: boolean;
    /** true when the session rows of the range did not fit in MAX_PAGES requests, so the oldest days are short */
    readonly truncated: boolean;
}
/** The claims of a JWT, unverified: for display only. */
export declare function jwtClaims(token: string): Record<string, unknown> | null;
/**
 * What a magic link left in the URL fragment: a session, an error the auth server reported, or nothing.
 * (#access_token=...&refresh_token=...&expires_in=3600&token_type=bearer, or #error=...&error_description=...)
 */
export declare function sessionFromFragment(hash: string, now: number): {
    session: OwnerSession;
} | {
    error: string;
} | null;
/** True when the address is the owner's. A display hint: the backend decides what an account may read. */
export declare function isOwnerAddress(email: string | null): Promise<boolean>;
export interface OwnerClientOptions {
    readonly url?: string;
    readonly key?: string;
    readonly fetch?: typeof fetch;
    readonly now?: Clock;
    /** where the session is kept; defaults to this tab's sessionStorage; null keeps it in memory */
    readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}
export interface OwnerClient {
    session(): OwnerSession | null;
    adopt(session: OwnerSession): void;
    /** forget the session here and ask the auth server to end it */
    signOut(): Promise<void>;
    /** ask the auth server to mail a sign-in link that returns to `redirectTo` */
    requestLink(email: string, redirectTo: string): Promise<LinkResult>;
    /** usage since `sinceDay` (YYYY-MM-DD, UTC). Rejects with an OwnerReadError. */
    readUsage(sinceDay: string): Promise<UsageRead>;
}
export declare function ownerClient(opts?: OwnerClientOptions): OwnerClient;
