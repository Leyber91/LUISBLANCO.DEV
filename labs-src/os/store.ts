/* ============================================================
   labs-src/os/store.ts — where Labs OS keeps its records: one IndexedDB
   database, "labs", in the visitor's browser.

     events    the activity log. Append-only: the store offers
               add and read, never update. Bounded: it keeps the
               newest MAX_EVENTS; an append that crosses the limit
               drops the oldest in the same transaction and adds
               them to a per-lab count in meta ("log.dropped"), so
               what was dropped is summarised, never silently lost.
               clear() (the visitor's "delete everything") removes
               the rest. Indexed by [lab, t] and by t.
     progress  one record per lab, keyed by lab id, carrying the
               lab's own schema version.
     meta      small settings: consent, last visit, the install id
               (created only when a transport needs one).

   When IndexedDB cannot be opened (storage blocked, some private
   windows, a sandboxed frame) the same interface runs in memory
   with persistent: false and a note the UI can show.

   Schema changes are migrations: MIGRATIONS[n] upgrades version
   n to n + 1 inside the browser's upgrade transaction, so an old
   database always walks forward one step at a time.
   ============================================================ */

import type { Json, LabEvent, ProgressRecord, StoreCounts, StoreDump } from './types.js';
import { isLabId } from './util.js';

export const DB_NAME = 'labs';

/** The log keeps this many events, the newest. */
export const MAX_EVENTS = 5000;
/** Meta key of the summary of events dropped to keep the log bounded. */
export const DROPPED_KEY = 'log.dropped';

/** What the bounded log dropped, kept so a reader can say "earlier events summarised". */
export interface DroppedSummary {
  readonly total: number;
  /** dropped events per lab id (the lab that recorded them) */
  readonly byLab: Readonly<Record<string, number>>;
  /** every lab the dropped events show was visited, handoff targets included */
  readonly labs: readonly string[];
  /** time of the oldest and the newest dropped event */
  readonly since: number;
  readonly until: number;
}

/** The dropped summary in a meta value, or null. */
export function readDropped(raw: Json | undefined): DroppedSummary | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const total = raw['total'], byLab = raw['byLab'], labs = raw['labs'], since = raw['since'], until = raw['until'];
  if (typeof total !== 'number' || typeof since !== 'number' || typeof until !== 'number') return null;
  const counts: Record<string, number> = {};
  if (byLab && typeof byLab === 'object' && !Array.isArray(byLab)) {
    for (const [k, v] of Object.entries(byLab)) if (typeof v === 'number') counts[k] = v;
  }
  return { total, byLab: counts, labs: Array.isArray(labs) ? labs.filter((x): x is string => typeof x === 'string') : [], since, until };
}

/** Add a batch of dropped events to the running summary. */
export function mergeDropped(prev: Json | undefined, gone: readonly LabEvent[]): DroppedSummary {
  const p = readDropped(prev);
  const byLab: Record<string, number> = { ...(p?.byLab ?? {}) };
  const labs = new Set(p?.labs ?? []);
  let since = p?.since ?? Infinity, until = p?.until ?? -Infinity;
  for (const e of gone) {
    byLab[e.lab] = (byLab[e.lab] ?? 0) + 1;
    labs.add(e.lab);
    const to = e.type === 'lab.handoff' ? e.data?.['to'] : undefined;
    if (isLabId(to)) labs.add(to);
    since = Math.min(since, e.t);
    until = Math.max(until, e.t);
  }
  return { total: (p?.total ?? 0) + gone.length, byLab, labs: [...labs].sort(), since, until };
}

/** One schema step, run inside the versionchange transaction. */
export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

export const MIGRATIONS: readonly Migration[] = [
  // 0 -> 1: the three stores.
  (db) => {
    const events = db.createObjectStore('events', { autoIncrement: true });
    events.createIndex('id', 'id', { unique: true });
    events.createIndex('lab_t', ['lab', 't']);
    events.createIndex('t', 't');
    db.createObjectStore('progress', { keyPath: 'lab' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
];

export const DB_VERSION = MIGRATIONS.length;

export type StorageKind = 'indexeddb' | 'memory';

export interface EventQuery {
  readonly lab?: string;
  /** inclusive lower bound on t */
  readonly since?: number;
  /** inclusive upper bound on t */
  readonly until?: number;
}

export interface Store {
  readonly kind: StorageKind;
  /** true when records outlive this page */
  readonly persistent: boolean;
  /** why the store is in memory, or '' */
  readonly note: string;
  /** set when the store was seeded by a named fixture instead of the visitor's own record */
  readonly fixture: string | null;
  /** the log keeps this many events, the newest */
  readonly maxEvents: number;
  /** add one event; past maxEvents the oldest are dropped into the summary under DROPPED_KEY */
  append(event: LabEvent): Promise<void>;
  /** events in time order (ties keep insertion order) */
  events(query?: EventQuery): Promise<LabEvent[]>;
  getProgress(lab: string): Promise<ProgressRecord | undefined>;
  putProgress(record: ProgressRecord): Promise<void>;
  allProgress(): Promise<ProgressRecord[]>;
  getMeta(key: string): Promise<Json | undefined>;
  setMeta(key: string, value: Json): Promise<void>;
  allMeta(): Promise<Record<string, Json>>;
  counts(): Promise<StoreCounts>;
  dump(): Promise<StoreDump>;
  clear(): Promise<void>;
  close(): void;
}

/* ---------------- IndexedDB ---------------- */

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

function sortEvents(list: LabEvent[]): LabEvent[] {
  // Array.prototype.sort is stable, so equal times keep insertion order.
  return list.sort((a, b) => a.t - b.t);
}

class IdbStore implements Store {
  readonly kind = 'indexeddb' as const;
  readonly persistent = true;
  readonly note = '';
  readonly fixture = null;
  /* This page's running count of the log. Below the limit an append is a single add; only an append that may cross
     it pays for a count and a drop. Other tabs' appends are not in this count, so with several tabs open the log can
     run past the limit until this tab's count reaches it, and then the whole overflow goes in one batch. */
  private approx: number;
  constructor(private readonly db: IDBDatabase, readonly maxEvents: number, count: number) {
    this.approx = count;
    // Another tab is upgrading the schema: step aside so it can.
    db.onversionchange = () => db.close();
  }

  private tx(stores: string | string[], mode: IDBTransactionMode): IDBTransaction {
    return this.db.transaction(stores, mode);
  }

  async append(event: LabEvent): Promise<void> {
    if (this.approx + 1 <= this.maxEvents) {
      const tx = this.tx('events', 'readwrite');
      tx.objectStore('events').add(event);
      await txDone(tx);
      this.approx++;
      return;
    }
    // One transaction: the add, the count and, past the limit, the drop and the summary land together or not at all.
    const tx = this.tx(['events', 'meta'], 'readwrite');
    const events = tx.objectStore('events');
    events.add(event);
    const count = events.count();
    let after = this.approx + 1;
    count.onsuccess = () => {
      const over = count.result - this.maxEvents;
      after = Math.min(count.result, this.maxEvents);
      if (over <= 0) return;
      const gone: LabEvent[] = [];
      const cursor = events.openCursor();   // key order is insertion order: the oldest first
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c && gone.length < over) { gone.push(c.value as LabEvent); c.delete(); c.continue(); return; }
        const meta = tx.objectStore('meta');
        const prev = meta.get(DROPPED_KEY);
        prev.onsuccess = () => {
          const row = prev.result as { key: string; value: Json } | undefined;
          meta.put({ key: DROPPED_KEY, value: mergeDropped(row?.value, gone) as unknown as Json });
        };
      };
    };
    await txDone(tx);
    this.approx = after;
  }

  async events(q: EventQuery = {}): Promise<LabEvent[]> {
    const tx = this.tx('events', 'readonly');
    const store = tx.objectStore('events');
    const lo = q.since ?? -Infinity, hi = q.until ?? Infinity;
    const req = q.lab !== undefined
      ? store.index('lab_t').getAll(IDBKeyRange.bound([q.lab, lo], [q.lab, hi]))
      : q.since !== undefined || q.until !== undefined
        ? store.index('t').getAll(IDBKeyRange.bound(lo, hi))
        : store.getAll();
    await txDone(tx);
    return sortEvents(req.result as LabEvent[]);
  }

  async getProgress(lab: string): Promise<ProgressRecord | undefined> {
    const tx = this.tx('progress', 'readonly');
    const req = tx.objectStore('progress').get(lab);
    await txDone(tx);
    return req.result as ProgressRecord | undefined;
  }

  async putProgress(record: ProgressRecord): Promise<void> {
    const tx = this.tx('progress', 'readwrite');
    tx.objectStore('progress').put(record);
    await txDone(tx);
  }

  async allProgress(): Promise<ProgressRecord[]> {
    const tx = this.tx('progress', 'readonly');
    const req = tx.objectStore('progress').getAll();
    await txDone(tx);
    return req.result as ProgressRecord[];
  }

  async getMeta(key: string): Promise<Json | undefined> {
    const tx = this.tx('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    await txDone(tx);
    const row = req.result as { key: string; value: Json } | undefined;
    return row?.value;
  }

  async setMeta(key: string, value: Json): Promise<void> {
    const tx = this.tx('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await txDone(tx);
  }

  async allMeta(): Promise<Record<string, Json>> {
    const tx = this.tx('meta', 'readonly');
    const req = tx.objectStore('meta').getAll();
    await txDone(tx);
    const out: Record<string, Json> = {};
    for (const row of req.result as { key: string; value: Json }[]) out[row.key] = row.value;
    return out;
  }

  async counts(): Promise<StoreCounts> {
    const tx = this.tx(['events', 'progress', 'meta'], 'readonly');
    const e = tx.objectStore('events').count();
    const p = tx.objectStore('progress').count();
    const m = tx.objectStore('meta').count();
    await txDone(tx);
    return { events: e.result, progress: p.result, meta: m.result };
  }

  async dump(): Promise<StoreDump> {
    const [events, progress, meta] = [await this.events(), await this.allProgress(), await this.allMeta()];
    return { events, progress, meta };
  }

  async clear(): Promise<void> {
    const tx = this.tx(['events', 'progress', 'meta'], 'readwrite');
    tx.objectStore('events').clear();
    tx.objectStore('progress').clear();
    tx.objectStore('meta').clear();
    await txDone(tx);
    this.approx = 0;
  }

  close(): void { this.db.close(); }
}

/* ---------------- memory ---------------- */

const copy = <T>(v: T): T => structuredClone(v);

class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private log: LabEvent[] = [];
  private ids = new Set<string>();
  private progress = new Map<string, ProgressRecord>();
  private meta = new Map<string, Json>();

  constructor(readonly persistent: boolean, readonly note: string, readonly fixture: string | null, readonly maxEvents: number) {}

  async append(event: LabEvent): Promise<void> {
    // Same contract as the IndexedDB unique index on id.
    if (this.ids.has(event.id)) throw new DOMException(`event ${event.id} already recorded`, 'ConstraintError');
    this.ids.add(event.id);
    this.log.push(copy(event));
    const over = this.log.length - this.maxEvents;
    if (over > 0) {
      const gone = this.log.splice(0, over);
      gone.forEach((e) => this.ids.delete(e.id));
      this.meta.set(DROPPED_KEY, mergeDropped(this.meta.get(DROPPED_KEY), gone) as unknown as Json);
    }
  }

  async events(q: EventQuery = {}): Promise<LabEvent[]> {
    const lo = q.since ?? -Infinity, hi = q.until ?? Infinity;
    return sortEvents(this.log.filter((e) => (q.lab === undefined || e.lab === q.lab) && e.t >= lo && e.t <= hi).map(copy));
  }

  async getProgress(lab: string): Promise<ProgressRecord | undefined> {
    const r = this.progress.get(lab);
    return r ? copy(r) : undefined;
  }

  async putProgress(record: ProgressRecord): Promise<void> { this.progress.set(record.lab, copy(record)); }
  async allProgress(): Promise<ProgressRecord[]> { return [...this.progress.values()].map(copy); }
  async getMeta(key: string): Promise<Json | undefined> {
    return this.meta.has(key) ? copy(this.meta.get(key) as Json) : undefined;
  }
  async setMeta(key: string, value: Json): Promise<void> { this.meta.set(key, copy(value)); }
  async allMeta(): Promise<Record<string, Json>> { return Object.fromEntries([...this.meta].map(([k, v]) => [k, copy(v)])); }
  async counts(): Promise<StoreCounts> { return { events: this.log.length, progress: this.progress.size, meta: this.meta.size }; }
  async dump(): Promise<StoreDump> { return { events: await this.events(), progress: await this.allProgress(), meta: await this.allMeta() }; }
  async clear(): Promise<void> { this.log = []; this.ids.clear(); this.progress.clear(); this.meta.clear(); }
  close(): void { /* nothing held */ }
}

export interface MemoryStoreOptions {
  /** what to tell the visitor about why nothing is kept */
  readonly note?: string;
  /** a fixture may present itself as persistent so the hub renders a returning visitor's view */
  readonly persistent?: boolean;
  readonly fixture?: string | null;
  readonly seed?: Partial<StoreDump>;
  readonly maxEvents?: number;
}

export function memoryStore(opts: MemoryStoreOptions = {}): Store {
  const s = new MemoryStore(opts.persistent ?? false, opts.note ?? 'kept in memory only', opts.fixture ?? null, limit(opts.maxEvents));
  const seed = opts.seed;
  if (seed) {
    // Seeding happens before anyone holds the store, so the writes are synchronous in effect.
    for (const e of seed.events ?? []) void s.append(e);
    for (const p of seed.progress ?? []) void s.putProgress(p);
    for (const [k, v] of Object.entries(seed.meta ?? {})) void s.setMeta(k, v);
  }
  return s;
}

/* ---------------- opening ---------------- */

export interface OpenOptions {
  /** the IndexedDB factory; null forces the memory store; defaults to globalThis.indexedDB */
  readonly idb?: IDBFactory | null;
  readonly name?: string;
  /** schema steps; defaults to MIGRATIONS (tests pass a longer list to prove an upgrade) */
  readonly migrations?: readonly Migration[];
  /** give up on a database that neither opens nor errors (a blocked upgrade) after this long */
  readonly timeoutMs?: number;
  /** the log's bound; defaults to MAX_EVENTS (tests pass a small one) */
  readonly maxEvents?: number;
}

function limit(n: number | undefined): number {
  if (n === undefined) return MAX_EVENTS;
  if (!Number.isInteger(n) || n < 1) throw new Error(`maxEvents must be a positive integer, got ${n}`);
  return n;
}

function defaultFactory(): IDBFactory | null {
  // Reading the property itself throws a SecurityError where storage is blocked.
  try { return globalThis.indexedDB ?? null; } catch { return null; }
}

function openDb(idb: IDBFactory, name: string, migrations: readonly Migration[], timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let state: 'pending' | 'done' | 'gave-up' = 'pending';
    const timer = setTimeout(() => {
      if (state !== 'pending') return;
      state = 'gave-up';
      reject(new Error(`IndexedDB did not open within ${timeoutMs} ms`));
    }, timeoutMs);
    let req: IDBOpenDBRequest;
    try { req = idb.open(name, migrations.length); } catch (e) { clearTimeout(timer); reject(e); return; }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      if (!tx) return;
      for (let v = ev.oldVersion; v < (ev.newVersion ?? migrations.length); v++) migrations[v]?.(db, tx);
    };
    req.onsuccess = () => {
      if (state === 'gave-up') { req.result.close(); return; }   // landed after we gave up: do not leak it
      state = 'done'; clearTimeout(timer); resolve(req.result);
    };
    req.onerror = () => {
      if (state !== 'pending') return;
      state = 'done'; clearTimeout(timer); reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onblocked = () => { /* an older tab holds the database; wait for it or for the timeout */ };
  });
}

/**
 * Open the visitor's store. Never rejects: anything that stops IndexedDB
 * returns a memory store whose note says why.
 */
export async function openStore(opts: OpenOptions = {}): Promise<Store> {
  const idb = opts.idb === undefined ? defaultFactory() : opts.idb;
  const maxEvents = limit(opts.maxEvents);
  if (!idb) return memoryStore({ maxEvents, note: 'this browser offers no IndexedDB here, so nothing is kept after the tab closes' });
  try {
    const db = await openDb(idb, opts.name ?? DB_NAME, opts.migrations ?? MIGRATIONS, opts.timeoutMs ?? 4000);
    const tx = db.transaction('events', 'readonly');
    const count = tx.objectStore('events').count();
    await txDone(tx);
    return new IdbStore(db, maxEvents, count.result);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return memoryStore({ maxEvents, note: `storage is blocked in this window (${why}), so nothing is kept after the tab closes` });
  }
}
