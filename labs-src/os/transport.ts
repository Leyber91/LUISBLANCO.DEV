/* ============================================================
   labs-src/os/transport.ts — the labs backend, as the outbox sees it:
   one Supabase project (West EU, Paris), reached with fetch and
   the publishable key. Row-level security on the backend is the
   guard; the key is public by design.

   send() turns each event into a usage_events row

     { install_id, event_id, t, lab, type, session, data }

   and posts them, at most 200 per request, with the install id in
   the x-install-id header (the backend refuses a retry without
   it) and "ignore duplicates", so offering an event twice stores
   it once.

   Usage carries no content. Before a row leaves, its data is
   reduced to what can describe use and cannot hold what a visitor
   wrote: numbers, booleans, null, and strings of at most 64
   characters from [A-Za-z0-9_ .:/+-] with at most three words.
   Everything else is dropped whole, nested values included, and
   the result stays under 2 KB. This is a backstop, and a format
   check cannot tell a typed word from a control's name: the rule
   that holds is that a lab records which control was used and
   never what was typed into it.

   An event the table would refuse (a lab id over 40 characters,
   a time outside the last 29 days) is left out here, because one
   refused row would take its whole request down. A request the
   backend still refuses as malformed (400 or 422) counts as
   handled: those rows can never be stored, and offering them
   again would block every event behind them. Any other failure
   rejects, and the outbox offers the batch again on the next load.

   erase() deletes the rows of one install and reads back that
   none remain.
   ============================================================ */

import type { EraseOutcome, OutboundBatch, SendOptions, Transport } from './consent.js';
import type { Json, JsonObject, LabEvent } from './types.js';
import { byteLength, isUuid, systemClock } from './util.js';
import type { Clock } from './util.js';

/** The labs backend. Only the project URL and the publishable key may appear in this repository. */
export const BACKEND = Object.freeze({
  url: 'https://uguiiwmhlqcitxrgqqmh.supabase.co',
  key: 'sb_publishable_GCSwvHNL3ulWiDRjaOxFMA_biQPXnsV',
  /** how the copy names who receives the events */
  recipient: 'Supabase (EU, Paris)',
});

export const ROWS_PER_REQUEST = 200;
/** Postgres prints jsonb with a space after each colon and comma; the table refuses more than 2,048 bytes of that. */
export const MAX_SENT_DATA_BYTES = 2000;
export const MAX_SENT_STRING = 64;
export const MAX_SENT_WORDS = 3;
/** a keepalive request may carry 64 KiB across everything in flight */
const KEEPALIVE_BYTES = 60_000;
const SEND_TIMEOUT_MS = 15_000;

const SAFE_STRING = /^[\w .:/+-]*$/;
const SAFE_KEY = /^[A-Za-z_][\w.-]{0,39}$/;
const LAB = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TYPE = /^[a-z][a-z0-9_.-]{0,63}$/;
const HOUR = 3_600_000, DAY = 24 * HOUR;
/** the table takes times from 30 days back to 1 day ahead; the margins absorb a clock that is a little off */
const OLDEST_MS = 29 * DAY, NEWEST_MS = 23 * HOUR;

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

function safeValue(v: Json | undefined): Json | undefined {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.abs(v) > 1e15) return undefined;
    return Number.isInteger(v) ? v : Math.round(v * 1e4) / 1e4;
  }
  if (typeof v === 'string') {
    if (v.length > MAX_SENT_STRING || !SAFE_STRING.test(v)) return undefined;
    if (v.trim().split(/\s+/).length > MAX_SENT_WORDS) return undefined;     // prose, however plain its characters
    return v;
  }
  return undefined;                                                          // arrays and objects go whole
}

/** What of an event's data may leave the browser. Null when nothing may. */
export function sanitizeData(data: JsonObject | null | undefined): JsonObject | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: JsonObject = {};
  let bytes = 2, kept = 0;
  for (const [key, raw] of Object.entries(data)) {
    if (!SAFE_KEY.test(key)) continue;
    const v = safeValue(raw);
    if (v === undefined) continue;
    const cost = byteLength(JSON.stringify(key)) + byteLength(JSON.stringify(v)) + 4;   // "key": value, as Postgres prints it
    if (bytes + cost > MAX_SENT_DATA_BYTES) continue;
    out[key] = v;
    bytes += cost;
    kept++;
  }
  return kept ? out : null;
}

/** The row for one event, or null when the table would refuse it. */
export function toRow(install: string, e: LabEvent, now: number): UsageRow | null {
  if (!isUuid(install)) return null;
  if (typeof e.id !== 'string' || e.id.length < 8 || e.id.length > 64) return null;
  if (typeof e.lab !== 'string' || !LAB.test(e.lab)) return null;
  if (typeof e.type !== 'string' || !TYPE.test(e.type)) return null;
  if (!Number.isFinite(e.t) || e.t < now - OLDEST_MS || e.t > now + NEWEST_MS) return null;
  return {
    install_id: install.toLowerCase(),
    event_id: e.id,
    t: new Date(e.t).toISOString(),
    lab: e.lab,
    type: e.type,
    session: typeof e.session === 'string' && e.session.length <= 64 ? e.session : null,
    data: sanitizeData(e.data),
  };
}

export interface SupabaseTransportOptions {
  readonly url?: string;
  readonly key?: string;
  /** defaults to the page's fetch, looked up when a request is made */
  readonly fetch?: typeof fetch;
  readonly now?: Clock;
  readonly timeoutMs?: number;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The Supabase adapter. No client library: three requests, written out. */
export function supabaseTransport(opts: SupabaseTransportOptions = {}): Transport {
  const rest = `${(opts.url ?? BACKEND.url).replace(/\/+$/, '')}/rest/v1`;
  const key = opts.key ?? BACKEND.key;
  const now = opts.now ?? systemClock;
  const timeoutMs = opts.timeoutMs ?? SEND_TIMEOUT_MS;
  const call = (url: string, init: RequestInit): Promise<Response> => (opts.fetch ?? globalThis.fetch)(url, init);
  const timeout = (): { signal?: AbortSignal } =>
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(timeoutMs) } : {};
  // nothing about the visitor rides along: no cookie, and no page address in the Referer header
  const quiet: RequestInit = { credentials: 'omit', referrerPolicy: 'no-referrer' };

  async function post(rows: readonly UsageRow[], install: string, keepalive: boolean): Promise<void> {
    const body = JSON.stringify(rows);
    const outlive = keepalive && byteLength(body) <= KEEPALIVE_BYTES;
    const res = await call(`${rest}/usage_events?on_conflict=install_id,event_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        'x-install-id': install,
        Prefer: 'return=minimal,resolution=ignore-duplicates',
      },
      body,
      ...quiet,
      // a leaving page gets no timeout: the abort would fire in a page that no longer exists
      ...(outlive ? { keepalive: true } : timeout()),
    });
    if (res.ok) return;
    if (res.status === 400 || res.status === 422) return;        // refused as malformed: never storable
    throw new Error(`the backend answered ${res.status}`);
  }

  return {
    name: 'supabase',

    async send(batch: OutboundBatch, sendOpts: SendOptions = {}): Promise<void> {
      if (!isUuid(batch.install)) throw new Error('the install id is not a UUID');
      const install = batch.install.toLowerCase();
      const t = now();
      const rows: UsageRow[] = [];
      for (const e of batch.events) {
        const row = toRow(install, e, t);
        if (row) rows.push(row);
      }
      for (let i = 0; i < rows.length; i += ROWS_PER_REQUEST) {
        await post(rows.slice(i, i + ROWS_PER_REQUEST), install, sendOpts.keepalive === true);
      }
    },

    async erase(installId: string): Promise<EraseOutcome> {
      if (!isUuid(installId)) return { ok: false, detail: 'the install id is not a UUID' };
      const install = installId.toLowerCase();
      const headers = { apikey: key, 'x-install-id': install };
      try {
        const gone = await call(`${rest}/usage_events?install_id=eq.${install}`, { method: 'DELETE', headers, ...quiet, ...timeout() });
        if (!gone.ok) return { ok: false, detail: `the backend answered ${gone.status}` };
        // read back what a visitor may read: the ids of the rows of their own install
        const left = await call(`${rest}/usage_events?select=event_id&install_id=eq.${install}&limit=1`, { headers, ...quiet, ...timeout() });
        if (!left.ok) return { ok: false, detail: `the erase was sent, but the check answered ${left.status}` };
        const rows: unknown = await left.json();
        return Array.isArray(rows) && rows.length === 0 ? { ok: true } : { ok: false, detail: 'rows remain after the erase' };
      } catch (e) {
        return { ok: false, detail: message(e) };
      }
    },
  };
}

/** For a page running on a fixture: accepts everything and reaches nothing. */
export function fixtureTransport(): Transport {
  return {
    name: 'fixture',
    async send(): Promise<void> { /* a fixture's events go nowhere */ },
    async erase(): Promise<EraseOutcome> { return { ok: true }; },
  };
}
