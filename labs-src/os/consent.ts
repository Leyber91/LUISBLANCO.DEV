/* ============================================================
   labs-src/os/consent.ts — the visitor's choice about sending, and the
   outbox that obeys it.

   Consent is one of unset, granted or denied, with the time it
   was chosen and the policy version it was given for. A new
   policy (what is sent, or to whom, changed) resets it to unset.

   The outbox sends only when consent is granted AND a transport
   is configured. In v0 there is no transport, so nothing ever
   leaves the browser, and OS_CONFIG keeps the consent banner
   hidden: asking to send data that nothing sends would mislead.
   The first send creates the random install id; until then it
   does not exist. Events recorded before consent was granted
   are never sent.
   ============================================================ */

import type { Json, LabEvent } from './types.js';
import type { Store } from './store.js';
import { randomId, systemClock } from './util.js';
import type { Clock } from './util.js';

export type ConsentState = 'unset' | 'granted' | 'denied';

export interface ConsentRecord {
  readonly state: ConsentState;
  /** when the choice was made; null while unset */
  readonly t: number | null;
  readonly policy: number;
}

/** Bump when what is sent, or who receives it, changes: every visitor is asked again. */
export const CONSENT_POLICY = 1;

const KEY = 'consent';

export class Consent {
  private readonly now: Clock;
  private readonly listeners = new Set<(r: ConsentRecord) => void>();
  constructor(private readonly store: Store, now?: Clock) { this.now = now ?? systemClock; }

  async get(): Promise<ConsentRecord> {
    const raw = await this.store.getMeta(KEY);
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
    await this.store.setMeta(KEY, { ...rec } as Json);
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

/** A backend adapter (a Supabase client, later). send() resolves when the batch is stored. */
export interface Transport {
  readonly name: string;
  send(batch: OutboundBatch): Promise<void>;
}

export type FlushReason = 'sent' | 'no-transport' | 'no-consent' | 'nothing-new' | 'failed';
export interface FlushResult {
  readonly sent: number;
  readonly reason: FlushReason;
  readonly detail?: string;
}

const CURSOR = 'outbox.cursor';
const INSTALL = 'install';

export interface OutboxOptions {
  readonly store: Store;
  readonly consent: Consent;
  readonly transport: Transport | null;
  readonly batchSize?: number;
}

export class Outbox {
  private running: Promise<FlushResult> | null = null;
  constructor(private readonly opts: OutboxOptions) {}

  get transport(): Transport | null { return this.opts.transport; }

  /** Send what is new, if and only if consent is granted and a transport exists. */
  flush(): Promise<FlushResult> {
    this.running ??= this.run().finally(() => { this.running = null; });
    return this.running;
  }

  private async run(): Promise<FlushResult> {
    const { store, consent, transport } = this.opts;
    if (!transport) return { sent: 0, reason: 'no-transport' };
    const c = await consent.get();
    if (c.state !== 'granted' || c.t === null) return { sent: 0, reason: 'no-consent' };

    const raw = await store.getMeta(CURSOR);
    const cur = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const curT = typeof cur?.['t'] === 'number' ? cur['t'] : -Infinity;
    const curIds = new Set(Array.isArray(cur?.['ids']) ? (cur['ids'] as Json[]).filter((x): x is string => typeof x === 'string') : []);
    const from = Math.max(c.t, curT);
    const pending = (await store.events({ since: from }))
      .filter((e) => !(e.t === curT && curIds.has(e.id)))
      .slice(0, this.opts.batchSize ?? 500);
    if (!pending.length) return { sent: 0, reason: 'nothing-new' };

    const install = await this.installId();
    try {
      await transport.send({ install, events: pending });
    } catch (e) {
      return { sent: 0, reason: 'failed', detail: e instanceof Error ? e.message : String(e) };
    }
    const lastT = pending[pending.length - 1]?.t ?? from;
    const ids = pending.filter((e) => e.t === lastT).map((e) => e.id);
    await store.setMeta(CURSOR, { t: lastT, ids: lastT === curT ? [...curIds, ...ids] : ids });
    return { sent: pending.length, reason: 'sent' };
  }

  /** The random install id, created on first need. Only a send needs it. */
  private async installId(): Promise<string> {
    const have = await this.opts.store.getMeta(INSTALL);
    if (typeof have === 'string' && have) return have;
    const id = randomId();
    await this.opts.store.setMeta(INSTALL, id);
    return id;
  }
}
