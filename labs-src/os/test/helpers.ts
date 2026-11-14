// Shared test helpers: a controllable clock, a fresh fake IndexedDB per test, and an event builder.
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../store.js';
import type { Store } from '../store.js';
import type { LabEvent } from '../types.js';

export const T0 = Date.UTC(2026, 10, 13, 12, 0, 0);
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function clock(start = T0) {
  let t = start;
  const now = () => t;
  return { now, set: (v: number) => { t = v; }, tick: (ms: number) => { t += ms; } };
}

/** A database nobody else sees. */
export const freshIdb = (): IDBFactory => new IDBFactory();

export async function idbStore(idb: IDBFactory = freshIdb()): Promise<Store> {
  const s = await openStore({ idb });
  if (s.kind !== 'indexeddb') throw new Error('expected IndexedDB: ' + s.note);
  return s;
}

let n = 0;
export function ev(p: Partial<LabEvent> & Pick<LabEvent, 'lab' | 'type' | 't'>): LabEvent {
  return { v: 1, id: `e${++n}`, data: null, session: 's', ...p };
}

/** Make document.visibilityState report `state` and fire visibilitychange. */
export function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}

/* ---------------- a stand-in for the labs backend ---------------- */

export interface SeenRequest {
  readonly url: string;
  readonly method: string;
  /** header names in lower case */
  readonly headers: Readonly<Record<string, string>>;
  /** the parsed JSON body, or undefined */
  readonly body: unknown;
  readonly keepalive: boolean;
  readonly init: RequestInit;
}

type StoredRow = { install_id: string; event_id: string } & Record<string, unknown>;

function answer(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status,
    json: async () => json,
    text: async () => (json === undefined ? '' : JSON.stringify(json)),
  } as unknown as Response;
}

/**
 * usage_events as the Data API behaves for an anonymous visitor (supabase/tests/anon_api.mjs): an insert needs
 * the install header and stores each (install, event) once; a delete removes the rows of the header's install;
 * a read returns the ids of the header's install. `mode` makes it unreachable or makes it answer one status.
 */
export function fakeBackend() {
  const rows = new Map<string, StoredRow>();
  const requests: SeenRequest[] = [];
  let mode: 'up' | 'down' | number = 'up';
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = init.method ?? 'GET';
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
    requests.push({ url, method, headers, body, keepalive: init.keepalive === true, init });
    if (mode === 'down') throw new TypeError('Failed to fetch');
    if (typeof mode === 'number') return answer(mode, { message: 'refused' });
    const install = headers['x-install-id'];
    if (!url.includes('/rest/v1/usage_events')) return answer(404);
    if (method === 'POST') {
      if (!install) return answer(401, { message: 'new row violates row-level security policy' });
      const list = body as StoredRow[];
      if (list.some((r) => r.install_id !== install)) return answer(401);
      for (const r of list) { const k = `${r.install_id}/${r.event_id}`; if (!rows.has(k)) rows.set(k, r); }
      return answer(201);
    }
    if (method === 'DELETE') {
      for (const [k, r] of rows) if (r.install_id === install && url.includes(`install_id=eq.${install}`)) rows.delete(k);
      return answer(204);
    }
    return answer(200, [...rows.values()].filter((r) => r.install_id === install).map((r) => ({ event_id: r.event_id })));
  };
  return {
    fetch: fetch as typeof globalThis.fetch,
    rows, requests,
    set(m: 'up' | 'down' | number) { mode = m; },
    posts: () => requests.filter((r) => r.method === 'POST'),
    /** every row the backend holds, in arrival order */
    stored: () => [...rows.values()],
  };
}
export type FakeBackend = ReturnType<typeof fakeBackend>;
