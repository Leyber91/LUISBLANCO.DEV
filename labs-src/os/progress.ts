/* ============================================================
   labs-src/os/progress.ts — one saved-progress record per lab.

   A lab owns the shape of its `data` and versions it with `v`.
   When a lab reads with a newer version and a migrate function,
   the old record is upgraded once and written back.

   Beside its data a lab can say three things the hub reads:
     setResume(lab, url, label)   where "continue" leads
     setDue(lab, items)           what is waiting for the visitor
     finish(lab)                  the lab's run is complete, so
                                  "continue" stops suggesting it
   ============================================================ */

import type { DueItem, Json, ProgressRecord, ResumePoint } from './types.js';
import type { Store } from './store.js';
import { byteLength, cleanLabel, isLabId, sameOriginPath, systemClock, toJson } from './util.js';
import type { Clock } from './util.js';

export const MAX_PROGRESS_BYTES = 256 * 1024;
export const MAX_DUE_ITEMS = 100;

export interface GetOptions<T> {
  /** the schema version the caller understands */
  readonly v?: number;
  /** upgrade older data; called once, then the result is saved under `v` */
  readonly migrate?: (data: Json, from: number) => T;
}

const empty = (lab: string, now: number): ProgressRecord =>
  ({ lab, v: 1, data: null, updated: now, resume: null, due: [], finished: false });

function need(lab: string): void {
  if (!isLabId(lab)) throw new Error(`"${String(lab)}" is not a lab id`);
}

export class Progress {
  private readonly now: Clock;
  constructor(private readonly store: Store, now?: Clock) { this.now = now ?? systemClock; }

  /** The lab's record, upgraded to `opts.v` when a migrate function is given; null when none exists. */
  async get<T = Json>(lab: string, opts: GetOptions<T> = {}): Promise<ProgressRecord | null> {
    need(lab);
    const rec = await this.store.getProgress(lab);
    if (!rec) return null;
    const want = opts.v;
    if (want === undefined || rec.v >= want || !opts.migrate) return rec;
    const migrated = toJson(opts.migrate(rec.data, rec.v));
    if (!migrated.ok) throw new Error(`migration of ${lab} from v${rec.v} produced ${migrated.why}`);
    const next: ProgressRecord = { ...rec, v: want, data: migrated.data, updated: this.now() };
    await this.store.putProgress(next);
    return next;
  }

  /** Replace the lab's data. Resume point, due items and finished flag are kept. */
  async set(lab: string, data: unknown, opts: { v?: number } = {}): Promise<ProgressRecord> {
    need(lab);
    const j = toJson(data);
    if (!j.ok) throw new Error(`progress for ${lab}: ${j.why}`);
    const bytes = byteLength(j.json);
    if (bytes > MAX_PROGRESS_BYTES) throw new Error(`progress for ${lab} is ${bytes} bytes; the cap is ${MAX_PROGRESS_BYTES}`);
    const v = opts.v ?? 1;
    if (!Number.isInteger(v) || v < 1) throw new Error(`progress version must be a positive integer, got ${v}`);
    return this.update(lab, (r) => ({ ...r, v, data: j.data }));
  }

  /** Where "continue" leads for this lab. The url must stay on this site. */
  async setResume(lab: string, url: string, label: string): Promise<ProgressRecord> {
    need(lab);
    const path = sameOriginPath(url);
    if (!path) throw new Error(`resume url for ${lab} must be a link on this site, got "${url}"`);
    const resume: ResumePoint = { url: path, label: cleanLabel(label) || 'where you left off', t: this.now() };
    return this.update(lab, (r) => ({ ...r, resume, finished: false }));
  }

  async clearResume(lab: string): Promise<ProgressRecord> {
    need(lab);
    return this.update(lab, (r) => ({ ...r, resume: null }));
  }

  /** Replace the lab's list of items waiting for the visitor. */
  async setDue(lab: string, items: readonly DueItem[]): Promise<ProgressRecord> {
    need(lab);
    if (!Array.isArray(items)) throw new Error('due items must be an array');
    const due = items.slice(0, MAX_DUE_ITEMS).map((it, i) => {
      if (!Number.isFinite(it?.at)) throw new Error(`due item ${i} of ${lab} has no time`);
      return { id: cleanLabel(it.id, 64) || String(i), label: cleanLabel(it.label) || 'item', at: it.at };
    });
    return this.update(lab, (r) => ({ ...r, due }));
  }

  /** Mark the lab's run complete (or reopen it with false). */
  async finish(lab: string, finished = true): Promise<ProgressRecord> {
    need(lab);
    return this.update(lab, (r) => ({ ...r, finished }));
  }

  all(): Promise<ProgressRecord[]> { return this.store.allProgress(); }

  /* Read-modify-write runs one at a time on this page, so setResume and setDue fired together both land.
     Two tabs of the same lab can still interleave; the later write wins. */
  private queue: Promise<unknown> = Promise.resolve();
  private update(lab: string, fn: (r: ProgressRecord) => ProgressRecord): Promise<ProgressRecord> {
    const run = this.queue.then(async () => {
      const now = this.now();
      const prev = (await this.store.getProgress(lab)) ?? empty(lab, now);
      const next = { ...fn(prev), lab, updated: now };
      await this.store.putProgress(next);
      return next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
