/* ============================================================
   labs-src/os/owner.ts — the owner's side of the labs backend, for
   labs/dashboard.html: sign in by magic link, keep the session
   for this tab only, read usage. Fetch and the publishable key,
   like transport.ts; no client library.

   Row-level security decides what an account may read: the owner
   gets every row of usage_by_day and usage_events, anyone else
   gets none. Nothing here is a guard. isOwnerAddress() only lets
   the page tell "the owner, and nothing recorded yet" from "not
   the owner" when both read zero rows.

   The session (access and refresh token) lives in sessionStorage
   and is gone when the tab closes. The magic link returns with
   the tokens in the URL fragment; the page takes them and clears
   the fragment at once.
   ============================================================ */

import { BACKEND } from './transport.js';
import { SESSION_TYPES } from './usage.js';
import type { ByDayRow, RawRow } from './usage.js';
import { systemClock } from './util.js';
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
export const OWNER_ADDRESS_SHA256 = 'a1fd9c6a2efdca488506075da86f2ba686743bc6fb91a34d21582963042f0eb6';

export const SESSION_STORE_KEY = 'labs.owner.session';
/** rows asked for per request (the API may be set to return fewer), and the most requests one read makes for one table */
export const PAGE_ROWS = 1000;
export const MAX_PAGES = 20;
const REFRESH_MARGIN_MS = 60_000;
const READ_TIMEOUT_MS = 20_000;

export type LinkResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'rate-limited' | 'refused' | 'network'; readonly detail: string };

export type ReadFailure = 'signed-out' | 'network' | 'backend';
export class OwnerReadError extends Error {
  constructor(readonly kind: ReadFailure, detail: string) { super(detail); this.name = 'OwnerReadError'; }
}

export interface UsageRead {
  readonly byDay: ByDayRow[];
  readonly raw: RawRow[];
  /** true when this account can see at least one usage row, of any day: only the owner can */
  readonly anyRows: boolean;
  /** true when the session rows of the range did not fit in MAX_PAGES requests, so the oldest days are short */
  readonly truncated: boolean;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The claims of a JWT, unverified: for display only. */
export function jwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(Array.from(atob(b64), (ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * What a magic link left in the URL fragment: a session, an error the auth server reported, or nothing.
 * (#access_token=...&refresh_token=...&expires_in=3600&token_type=bearer, or #error=...&error_description=...)
 */
export function sessionFromFragment(hash: string, now: number): { session: OwnerSession } | { error: string } | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const error = q.get('error_description') ?? q.get('error');
  if (error) return { error: error.slice(0, 200) };
  const accessToken = q.get('access_token'), refreshToken = q.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const at = Number(q.get('expires_at')), within = Number(q.get('expires_in'));
  const expiresAt = Number.isFinite(at) && at > 0 ? at * 1000 : now + (Number.isFinite(within) && within > 0 ? within : 3600) * 1000;
  const email = jwtClaims(accessToken)?.['email'];
  return { session: { accessToken, refreshToken, expiresAt, email: typeof email === 'string' ? email : null } };
}

/** True when the address is the owner's. A display hint: the backend decides what an account may read. */
export async function isOwnerAddress(email: string | null): Promise<boolean> {
  if (!email) return false;
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('') === OWNER_ADDRESS_SHA256;
  } catch { return false; }
}

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

function defaultStorage(): OwnerClientOptions['storage'] {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

export function ownerClient(opts: OwnerClientOptions = {}): OwnerClient {
  const base = (opts.url ?? BACKEND.url).replace(/\/+$/, '');
  const key = opts.key ?? BACKEND.key;
  const now = opts.now ?? systemClock;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const call = (url: string, init: RequestInit): Promise<Response> => (opts.fetch ?? globalThis.fetch)(url, {
    credentials: 'omit', referrerPolicy: 'no-referrer',
    ...(typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(READ_TIMEOUT_MS) } : {}),
    ...init,
  });
  let memory: OwnerSession | null = null;

  function load(): OwnerSession | null {
    if (!storage) return memory;
    try {
      const v: unknown = JSON.parse(storage.getItem(SESSION_STORE_KEY) ?? 'null');
      if (!v || typeof v !== 'object') return null;
      const s = v as Record<string, unknown>;
      if (typeof s['accessToken'] !== 'string' || typeof s['refreshToken'] !== 'string' || typeof s['expiresAt'] !== 'number') return null;
      return { accessToken: s['accessToken'], refreshToken: s['refreshToken'], expiresAt: s['expiresAt'], email: typeof s['email'] === 'string' ? s['email'] : null };
    } catch { return null; }
  }
  function save(s: OwnerSession | null): void {
    memory = s;
    if (!storage) return;
    try { if (s) storage.setItem(SESSION_STORE_KEY, JSON.stringify(s)); else storage.removeItem(SESSION_STORE_KEY); } catch { /* storage refused: the session lives for this page */ }
  }

  /** A fresh access token for the stored refresh token, or null when the auth server no longer accepts it. */
  async function refresh(s: OwnerSession): Promise<OwnerSession | null> {
    let res: Response;
    try {
      res = await call(`${base}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refreshToken }),
      });
    } catch (e) { throw new OwnerReadError('network', message(e)); }
    if (res.status >= 500) throw new OwnerReadError('backend', `the auth server answered ${res.status}`);
    if (!res.ok) { save(null); return null; }
    const j = await res.json().catch(() => null) as Record<string, unknown> | null;
    const accessToken = j?.['access_token'], refreshToken = j?.['refresh_token'];
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') { save(null); return null; }
    const within = Number(j?.['expires_in']);
    const email = jwtClaims(accessToken)?.['email'];
    const next: OwnerSession = {
      accessToken, refreshToken,
      expiresAt: now() + (Number.isFinite(within) && within > 0 ? within : 3600) * 1000,
      email: typeof email === 'string' ? email : s.email,
    };
    save(next);
    return next;
  }

  /** GET a Data API path as the signed-in account; one refresh and one more try on 401. */
  async function get(path: string): Promise<unknown[]> {
    let s = load();
    if (!s) throw new OwnerReadError('signed-out', 'no session');
    if (s.expiresAt - now() < REFRESH_MARGIN_MS) s = await refresh(s);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!s) throw new OwnerReadError('signed-out', 'the session has ended');
      let res: Response;
      try { res = await call(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${s.accessToken}` } }); }
      catch (e) { throw new OwnerReadError('network', message(e)); }
      if (res.status === 401 && attempt === 0) { s = await refresh(s); continue; }
      if (res.status === 401) { save(null); throw new OwnerReadError('signed-out', 'the session has ended'); }
      if (!res.ok) throw new OwnerReadError('backend', `the backend answered ${res.status}`);
      const rows: unknown = await res.json().catch(() => null);
      if (!Array.isArray(rows)) throw new OwnerReadError('backend', 'the backend answered something that is not a list of rows');
      return rows;
    }
    throw new OwnerReadError('signed-out', 'the session has ended');
  }

  /**
   * Every row of a query, up to MAX_PAGES requests. Each request starts after the rows already received and the
   * read ends on an empty page, so it is complete whatever row limit the API is set to (a short page is not
   * taken for the last one).
   */
  async function pages(path: string): Promise<{ rows: unknown[]; truncated: boolean }> {
    const rows: unknown[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const part = await get(`${path}&limit=${PAGE_ROWS}&offset=${rows.length}`);
      if (!part.length) return { rows, truncated: false };
      rows.push(...part);
    }
    return { rows, truncated: true };
  }

  return {
    session: load,
    adopt: save,

    async signOut(): Promise<void> {
      const s = load();
      save(null);
      if (!s) return;
      try {
        await call(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${s.accessToken}` } });
      } catch { /* the tab has forgotten the session either way */ }
    },

    async requestLink(email: string, redirectTo: string): Promise<LinkResult> {
      let res: Response;
      try {
        // The auth server reads where the link returns to from the redirect_to query parameter (what the client
        // libraries send for their emailRedirectTo option). email_redirect_to in the body repeats it under the
        // option's own name; uncertain whether the server reads it there, and it ignores body fields it does not know.
        res = await call(`${base}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, create_user: true, email_redirect_to: redirectTo }),
        });
      } catch (e) { return { ok: false, reason: 'network', detail: message(e) }; }
      if (res.ok) return { ok: true };
      const j = await res.json().catch(() => null) as Record<string, unknown> | null;
      const said = [j?.['msg'], j?.['message'], j?.['error_description'], j?.['error']].find((x): x is string => typeof x === 'string' && x.length > 0);
      const detail = `${res.status}${said ? `: ${said.slice(0, 160)}` : ''}`;
      return { ok: false, reason: res.status === 429 ? 'rate-limited' : 'refused', detail };
    },

    async readUsage(sinceDay: string): Promise<UsageRead> {
      const probe = await get('usage_by_day?select=day&limit=1');
      if (!probe.length) return { byDay: [], raw: [], anyRows: false, truncated: false };
      // each order ends in a unique key, so a page boundary never repeats or skips a row
      const byDay = await pages(`usage_by_day?select=*&day=gte.${sinceDay}&order=day.asc,lab.asc,type.asc`);
      const types = encodeURIComponent(SESSION_TYPES.map((t) => `"${t}"`).join(','));
      const raw = await pages(`usage_events?select=t,lab,type,install_id,session,data&type=in.(${types})&t=gte.${sinceDay}T00:00:00Z&order=t.desc,id.desc`);
      return { byDay: byDay.rows as ByDayRow[], raw: raw.rows as RawRow[], anyRows: true, truncated: raw.truncated || byDay.truncated };
    },
  };
}
