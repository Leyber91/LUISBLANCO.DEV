/* ============================================================
   labs-src/os/store.ts — where Labs OS keeps its records: one IndexedDB
   database, "labs", in the visitor's browser.

     events    the activity log. Append-only: the store offers
               add and read, never update; only clear() (the
               visitor's "delete everything") removes lines.
               Indexed by [lab, t] and by t.
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
export const DB_NAME = 'labs';
export const MIGRATIONS = [
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
/* ---------------- IndexedDB ---------------- */
function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
    });
}
function sortEvents(list) {
    // Array.prototype.sort is stable, so equal times keep insertion order.
    return list.sort((a, b) => a.t - b.t);
}
class IdbStore {
    db;
    kind = 'indexeddb';
    persistent = true;
    note = '';
    fixture = null;
    constructor(db) {
        this.db = db;
        // Another tab is upgrading the schema: step aside so it can.
        db.onversionchange = () => db.close();
    }
    tx(stores, mode) {
        return this.db.transaction(stores, mode);
    }
    async append(event) {
        const tx = this.tx('events', 'readwrite');
        tx.objectStore('events').add(event);
        await txDone(tx);
    }
    async events(q = {}) {
        const tx = this.tx('events', 'readonly');
        const store = tx.objectStore('events');
        const lo = q.since ?? -Infinity, hi = q.until ?? Infinity;
        const req = q.lab !== undefined
            ? store.index('lab_t').getAll(IDBKeyRange.bound([q.lab, lo], [q.lab, hi]))
            : q.since !== undefined || q.until !== undefined
                ? store.index('t').getAll(IDBKeyRange.bound(lo, hi))
                : store.getAll();
        await txDone(tx);
        return sortEvents(req.result);
    }
    async getProgress(lab) {
        const tx = this.tx('progress', 'readonly');
        const req = tx.objectStore('progress').get(lab);
        await txDone(tx);
        return req.result;
    }
    async putProgress(record) {
        const tx = this.tx('progress', 'readwrite');
        tx.objectStore('progress').put(record);
        await txDone(tx);
    }
    async allProgress() {
        const tx = this.tx('progress', 'readonly');
        const req = tx.objectStore('progress').getAll();
        await txDone(tx);
        return req.result;
    }
    async getMeta(key) {
        const tx = this.tx('meta', 'readonly');
        const req = tx.objectStore('meta').get(key);
        await txDone(tx);
        const row = req.result;
        return row?.value;
    }
    async setMeta(key, value) {
        const tx = this.tx('meta', 'readwrite');
        tx.objectStore('meta').put({ key, value });
        await txDone(tx);
    }
    async allMeta() {
        const tx = this.tx('meta', 'readonly');
        const req = tx.objectStore('meta').getAll();
        await txDone(tx);
        const out = {};
        for (const row of req.result)
            out[row.key] = row.value;
        return out;
    }
    async counts() {
        const tx = this.tx(['events', 'progress', 'meta'], 'readonly');
        const e = tx.objectStore('events').count();
        const p = tx.objectStore('progress').count();
        const m = tx.objectStore('meta').count();
        await txDone(tx);
        return { events: e.result, progress: p.result, meta: m.result };
    }
    async dump() {
        const [events, progress, meta] = [await this.events(), await this.allProgress(), await this.allMeta()];
        return { events, progress, meta };
    }
    async clear() {
        const tx = this.tx(['events', 'progress', 'meta'], 'readwrite');
        tx.objectStore('events').clear();
        tx.objectStore('progress').clear();
        tx.objectStore('meta').clear();
        await txDone(tx);
    }
    close() { this.db.close(); }
}
/* ---------------- memory ---------------- */
const copy = (v) => structuredClone(v);
class MemoryStore {
    persistent;
    note;
    fixture;
    kind = 'memory';
    log = [];
    ids = new Set();
    progress = new Map();
    meta = new Map();
    constructor(persistent, note, fixture) {
        this.persistent = persistent;
        this.note = note;
        this.fixture = fixture;
    }
    async append(event) {
        // Same contract as the IndexedDB unique index on id.
        if (this.ids.has(event.id))
            throw new DOMException(`event ${event.id} already recorded`, 'ConstraintError');
        this.ids.add(event.id);
        this.log.push(copy(event));
    }
    async events(q = {}) {
        const lo = q.since ?? -Infinity, hi = q.until ?? Infinity;
        return sortEvents(this.log.filter((e) => (q.lab === undefined || e.lab === q.lab) && e.t >= lo && e.t <= hi).map(copy));
    }
    async getProgress(lab) {
        const r = this.progress.get(lab);
        return r ? copy(r) : undefined;
    }
    async putProgress(record) { this.progress.set(record.lab, copy(record)); }
    async allProgress() { return [...this.progress.values()].map(copy); }
    async getMeta(key) {
        return this.meta.has(key) ? copy(this.meta.get(key)) : undefined;
    }
    async setMeta(key, value) { this.meta.set(key, copy(value)); }
    async allMeta() { return Object.fromEntries([...this.meta].map(([k, v]) => [k, copy(v)])); }
    async counts() { return { events: this.log.length, progress: this.progress.size, meta: this.meta.size }; }
    async dump() { return { events: await this.events(), progress: await this.allProgress(), meta: await this.allMeta() }; }
    async clear() { this.log = []; this.ids.clear(); this.progress.clear(); this.meta.clear(); }
    close() { }
}
export function memoryStore(opts = {}) {
    const s = new MemoryStore(opts.persistent ?? false, opts.note ?? 'kept in memory only', opts.fixture ?? null);
    const seed = opts.seed;
    if (seed) {
        // Seeding happens before anyone holds the store, so the writes are synchronous in effect.
        for (const e of seed.events ?? [])
            void s.append(e);
        for (const p of seed.progress ?? [])
            void s.putProgress(p);
        for (const [k, v] of Object.entries(seed.meta ?? {}))
            void s.setMeta(k, v);
    }
    return s;
}
function defaultFactory() {
    // Reading the property itself throws a SecurityError where storage is blocked.
    try {
        return globalThis.indexedDB ?? null;
    }
    catch {
        return null;
    }
}
function openDb(idb, name, migrations, timeoutMs) {
    return new Promise((resolve, reject) => {
        let state = 'pending';
        const timer = setTimeout(() => {
            if (state !== 'pending')
                return;
            state = 'gave-up';
            reject(new Error(`IndexedDB did not open within ${timeoutMs} ms`));
        }, timeoutMs);
        let req;
        try {
            req = idb.open(name, migrations.length);
        }
        catch (e) {
            clearTimeout(timer);
            reject(e);
            return;
        }
        req.onupgradeneeded = (ev) => {
            const db = req.result;
            const tx = req.transaction;
            if (!tx)
                return;
            for (let v = ev.oldVersion; v < (ev.newVersion ?? migrations.length); v++)
                migrations[v]?.(db, tx);
        };
        req.onsuccess = () => {
            if (state === 'gave-up') {
                req.result.close();
                return;
            } // landed after we gave up: do not leak it
            state = 'done';
            clearTimeout(timer);
            resolve(req.result);
        };
        req.onerror = () => {
            if (state !== 'pending')
                return;
            state = 'done';
            clearTimeout(timer);
            reject(req.error ?? new Error('IndexedDB open failed'));
        };
        req.onblocked = () => { };
    });
}
/**
 * Open the visitor's store. Never rejects: anything that stops IndexedDB
 * returns a memory store whose note says why.
 */
export async function openStore(opts = {}) {
    const idb = opts.idb === undefined ? defaultFactory() : opts.idb;
    if (!idb)
        return memoryStore({ note: 'this browser offers no IndexedDB here, so nothing is kept after the tab closes' });
    try {
        const db = await openDb(idb, opts.name ?? DB_NAME, opts.migrations ?? MIGRATIONS, opts.timeoutMs ?? 4000);
        return new IdbStore(db);
    }
    catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        return memoryStore({ note: `storage is blocked in this window (${why}), so nothing is kept after the tab closes` });
    }
}
