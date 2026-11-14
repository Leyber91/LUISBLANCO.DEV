/* ============================================================
   labs-src/os/consent.ts — the visitor's choice about sending, and the
   outbox that obeys it.

   Consent is one of unset, granted or denied, with the time it
   was chosen and the policy version it was given for. A new
   policy (what is sent, or to whom, changed) resets it to unset.

   The outbox sends only when all of these hold: a transport is
   configured, the visitor's recording switch is on, and consent
   is granted. Only events recorded after the moment of consent
   are sent (an event in the same millisecond counts as before).
   Allowing creates the random install id (a UUID); until then it
   does not exist.

   Three moments send:
     flush()        after consent is granted and on every page
                    load: everything new, oldest first, in batches,
                    moving a cursor only past what the backend took.
                    A failure leaves the cursor where it was, so
                    the next load offers the same events again.
     flushOnExit()  on pagehide: what this page recorded and no
                    flush has confirmed, started in the same tick on
                    a request that outlives the page. It never moves
                    the cursor, because a leaving page cannot learn
                    whether the request landed; the next flush offers
                    those events again and the backend skips the ones
                    it already holds.
     erase()        removes this install's rows from the backend.

   Nothing here throws at a caller: flush() and erase() resolve
   with what happened.
   ============================================================ */

import type { Json, LabEvent } from './types.js';
import type { Store } from './store.js';
import { isUuid, randomUuid, systemClock } from './util.js';
import type { Clock } from './util.js';

export type ConsentState = 'unset' | 'granted' | 'denied';

export interface ConsentRecord {
  readonly state: ConsentState;
  /** when the choice was made; null while unset */
  readonly t: number | null;
  readonly policy: number;
}

/**
 * Bump when what is sent, or who receives it, changes: every visitor is asked again.
 * 2: usage events to Supabase (EU West); v0.1 described a send that never existed.
 */
export const CONSENT_POLICY = 2;

export const CONSENT_KEY = 'consent';

export class Consent {
  private readonly now: Clock;
  private readonly listeners = new Set<(r: ConsentRecord) => void>();
  constructor(private readonly store: Store, now?: Clock) { this.now = now ?? systemClock; }

  async get(): Promise<ConsentRecord> {
    const raw = await this.store.getMeta(CONSENT_KEY);
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const state = r?.['state'], t = r?.['t'], policy = r?.['policy'];
    if ((state === 'granted' || state === 'denied') && typeof t === 'number' && policy === CONSENT_POLICY) {
      return { state, t, policy };
    }
    return { state: 'unset', t: null, policy: CONSENT_POLICY };
  }

  async set(state: 'granted' | 'denied'): Promise<ConsentRecord> {
    if (state !== 'granted' && state !== 'denied') throw new Error(`consent must be granted or denied, got ${String(state)}`);
    const rec: ConsentRecord = { state, t: this.now(), policy: CONSENT_POLICY };
    await this.store.setMeta(CONSENT_KEY, { ...rec } as Json);
    this.listeners.forEach((fn) => { try { fn(rec); } catch { /* the listener's problem */ } });
    return rec;
  }

  onChange(fn: (r: ConsentRecord) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

/** What a transport receives: the install id and the events since the last send. */
export interface OutboundBatch {
  readonly install: string;
  readonly events: readonly LabEvent[];
}

export interface SendOptions {
  /** the page is leaving: start the request in this tick and let it outlive the page */
  readonly keepalive?: boolean;
}

export type EraseOutcome = { readonly ok: true } | { readonly ok: false; readonly detail: string };

/** A backend adapter (transport.ts holds the one for Supabase). */
export interface Transport {
  readonly name: string;
  /**
   * Resolves when every event of the batch is stored, or can never be (the backend refuses it as malformed).
   * Rejects when the batch should be offered again: the network failed, or the backend is down or busy.
   */
  send(batch: OutboundBatch, opts?: SendOptions): Promise<void>;
  /** Remove every row this install sent. Resolves with whether the backend confirmed that none remain. */
  erase(install: string): Promise<EraseOutcome>;
}

export type FlushReason = 'sent' | 'no-transport' | 'no-consent' | 'recording-off' | 'stopped' | 'nothing-new' | 'failed';
export interface FlushResult {
  readonly sent: number;
  readonly reason: FlushReason;
  readonly detail?: string;
}

export type EraseResult =
  /** this browser has no install id, so the backend holds nothing of it */
  | { readonly state: 'nothing-sent' }
  | { readonly state: 'erased' }
  | { readonly state: 'failed'; readonly detail: string };

const CURSOR = 'outbox.cursor';
export const INSTALL_KEY = 'install';
/** events per send; the transport's own limit per request is the same */
export const BATCH_SIZE = 200;
/** batches per flush: 6,000 events, more than the log holds */
const MAX_BATCHES = 30;
/** the most a leaving page offers, so the request stays well under the 64 KiB a keepalive request may carry */
const EXIT_EVENTS = 100;
const TAIL_MAX = 400;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export interface OutboxOptions {
  readonly store: Store;
  readonly consent: Consent;
  readonly transport: Transport | null;
  readonly batchSize?: number;
  /** the visitor's recording switch (default on); while it is off nothing is sent either */
  readonly recording?: () => boolean;
  readonly now?: Clock;
}

export class Outbox {
  /** the flush running now, and the one waiting for it to finish */
  private active: Promise<FlushResult> | null = null;
  private queued: Promise<FlushResult> | null = null;
  /** set while sending is allowed and the install id is known, so a leaving page can send without reading the store */
  private live: { readonly install: string; readonly since: number } | null = null;
  /** counts the visitor's choices: a flush that began under an earlier choice sends nothing more */
  private choice = 0;
  /** events this page recorded that no send has confirmed */
  private tail: LabEvent[] = [];
  private stopped = false;
  private readonly now: Clock;
  private readonly offConsent: () => void;

  constructor(private readonly opts: OutboxOptions) {
    this.now = opts.now ?? systemClock;
    // A changed choice takes effect in the same tick, before any flush reads it back from the store.
    this.offConsent = opts.consent.onChange((r) => { this.choice++; if (r.state !== 'granted') this.live = null; });
  }

  get transport(): Transport | null { return this.opts.transport; }

  private recordingOn(): boolean { return this.opts.recording?.() ?? true; }

  /** The tracker hands over each event as it is made, so a leaving page still has it in memory. */
  note(event: LabEvent): void {
    if (!this.opts.transport || this.stopped) return;
    this.tail.push(event);
    if (this.tail.length > TAIL_MAX) this.tail.splice(0, this.tail.length - TAIL_MAX);
  }

  /** An event the store refused is not offered either. */
  drop(id: string): void { this.tail = this.tail.filter((e) => e.id !== id); }

  /**
   * Send what is new, if and only if a transport exists, recording is on and consent is granted. Never rejects.
   * One flush runs at a time; a call made while one runs gets the next one, which starts when the first ends,
   * so its answer always covers what was recorded before the call.
   */
  flush(): Promise<FlushResult> {
    if (!this.active) return this.start();
    this.queued ??= this.active.then(() => { this.queued = null; return this.start(); });
    return this.queued;
  }

  private start(): Promise<FlushResult> {
    const p: Promise<FlushResult> = this.run()
      .catch((e): FlushResult => ({ sent: 0, reason: 'failed', detail: message(e) }))
      .finally(() => { if (this.active === p) this.active = null; });
    this.active = p;
    return p;
  }

  /** Resolves once no flush is running or waiting. */
  private async idle(): Promise<void> {
    while (this.active || this.queued) await (this.queued ?? this.active);
  }

  private async cursor(): Promise<{ t: number; ids: Set<string> }> {
    const raw = await this.opts.store.getMeta(CURSOR);
    const cur = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const t = typeof cur?.['t'] === 'number' ? cur['t'] : -Infinity;
    const ids = new Set(Array.isArray(cur?.['ids']) ? (cur['ids'] as Json[]).filter((x): x is string => typeof x === 'string') : []);
    return { t, ids };
  }

  private async run(): Promise<FlushResult> {
    const { store, consent, transport } = this.opts;
    if (!transport) return { sent: 0, reason: 'no-transport' };
    if (this.stopped) return { sent: 0, reason: 'stopped' };
    if (!this.recordingOn()) { this.live = null; return { sent: 0, reason: 'recording-off' }; }
    const choice = this.choice;
    const c = await consent.get();
    if (c.state !== 'granted' || c.t === null) { this.live = null; return { sent: 0, reason: 'no-consent' }; }
    const since = c.t;
    const install = await this.installId();
    // the visitor chose again while this flush was reading: what it read is stale, and the flush their
    // choice started (if it was "Allow") follows this one
    if (choice !== this.choice) return { sent: 0, reason: 'no-consent' };
    this.live = { install, since };

    const size = this.opts.batchSize ?? BATCH_SIZE;
    let sent = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
      const cur = await this.cursor();
      const pending = (await store.events({ since: Math.max(since, cur.t) }))
        .filter((e) => e.t > since && !(e.t === cur.t && cur.ids.has(e.id)))
        .slice(0, size);
      if (!pending.length) break;
      // a choice made while a long flush runs is obeyed before the next batch leaves
      if (this.stopped) return { sent, reason: 'stopped' };
      if (!this.recordingOn()) return { sent, reason: 'recording-off' };
      if (choice !== this.choice) return { sent, reason: 'no-consent' };
      try {
        await transport.send({ install, events: pending });
      } catch (e) {
        return { sent, reason: 'failed', detail: message(e) };
      }
      const lastT = pending[pending.length - 1]?.t ?? cur.t;
      const ids = pending.filter((e) => e.t === lastT).map((e) => e.id);
      await store.setMeta(CURSOR, { t: lastT, ids: lastT === cur.t ? [...cur.ids, ...ids] : ids });
      sent += pending.length;
      const gone = new Set(pending.map((e) => e.id));
      this.tail = this.tail.filter((e) => !gone.has(e.id));
    }
    return sent ? { sent, reason: 'sent' } : { sent: 0, reason: 'nothing-new' };
  }

  /**
   * The page is leaving. Offer what it recorded and no send has confirmed, now, without reading the store
   * (a leaving page may never get its answer). Returns whether a request was started.
   */
  flushOnExit(): boolean {
    const { transport } = this.opts;
    const live = this.live;
    if (!transport || this.stopped || !live || !this.recordingOn()) return false;
    const events = this.tail.filter((e) => e.t > live.since).slice(-EXIT_EVENTS);
    if (!events.length) return false;
    const offered = new Set(events.map((e) => e.id));
    let request: Promise<void>;
    try { request = transport.send({ install: live.install, events }, { keepalive: true }); } catch { return false; }
    request.then(
      // the page lived (the back-forward cache): do not offer these again from here
      () => { this.tail = this.tail.filter((e) => !offered.has(e.id)); },
      () => { /* offered again by the next flush */ },
    );
    return true;
  }

  /** The install id, when this browser has one: it exists once sending was allowed. */
  async installed(): Promise<string | null> {
    try {
      const have = await this.opts.store.getMeta(INSTALL_KEY);
      return isUuid(have) ? have : null;
    } catch { return null; }
  }

  /**
   * Erase this install's rows from the backend. What this browser recorded before the erase is not offered
   * again afterwards. Never rejects.
   */
  async erase(): Promise<EraseResult> {
    try {
      const install = await this.installed();
      if (!install) return { state: 'nothing-sent' };
      const { transport, store } = this.opts;
      if (!transport) return { state: 'failed', detail: 'this page has no backend to ask' };
      await this.idle();                             // a send in flight lands first, so it is erased too
      const out = await transport.erase(install).catch((e): EraseOutcome => ({ ok: false, detail: message(e) }));
      if (!out.ok) return { state: 'failed', detail: out.detail };
      this.tail = [];
      const t = this.now();
      const same = await store.events({ since: t, until: t });
      await store.setMeta(CURSOR, { t, ids: same.map((e) => e.id) });
      return { state: 'erased' };
    } catch (e) {
      return { state: 'failed', detail: message(e) };
    }
  }

  /** Nothing more leaves this page (after the visitor deletes their record). */
  stop(): void { this.stopped = true; this.live = null; this.tail = []; }

  /** Remove the consent listener (tests; a page never needs it). */
  close(): void { this.offConsent(); }

  /** The random install id, made when sending is first allowed. Always the dashed UUID form the backend accepts. */
  private async installId(): Promise<string> {
    const have = await this.opts.store.getMeta(INSTALL_KEY);
    if (isUuid(have)) return have;
    const id = randomUuid();
    await this.opts.store.setMeta(INSTALL_KEY, id);
    return id;
  }
}
