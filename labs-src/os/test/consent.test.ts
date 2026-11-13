import { describe, expect, it, vi } from 'vitest';
import { BATCH_SIZE, Consent, CONSENT_POLICY, Outbox } from '../consent.js';
import type { EraseOutcome, OutboundBatch, SendOptions, Transport } from '../consent.js';
import { OS_CONFIG } from '../config.js';
import { memoryStore } from '../store.js';
import { isUuid, randomUuid } from '../util.js';
import { clock, ev } from './helpers.js';

type Spy = Transport & { batches: OutboundBatch[]; options: (SendOptions | undefined)[]; erased: string[] };
function spyTransport(erase: EraseOutcome = { ok: true }): Spy {
  const batches: OutboundBatch[] = [];
  const options: (SendOptions | undefined)[] = [];
  const erased: string[] = [];
  return {
    name: 'spy', batches, options, erased,
    send: vi.fn(async (b: OutboundBatch, o?: SendOptions) => { batches.push(b); options.push(o); }),
    erase: vi.fn(async (install: string) => { erased.push(install); return erase; }),
  };
}

describe('consent', () => {
  it('starts unset, then records the choice with its time and policy', async () => {
    const c = clock();
    const consent = new Consent(memoryStore(), c.now);
    expect(await consent.get()).toEqual({ state: 'unset', t: null, policy: CONSENT_POLICY });
    c.tick(5);
    expect(await consent.set('denied')).toEqual({ state: 'denied', t: c.now(), policy: CONSENT_POLICY });
    expect((await consent.get()).state).toBe('denied');
  });

  it('asks again when the policy changes', async () => {
    const store = memoryStore();
    await store.setMeta('consent', { state: 'granted', t: 1, policy: CONSENT_POLICY - 1 });
    expect((await new Consent(store).get()).state).toBe('unset');
  });

  it('refuses any state other than granted or denied', async () => {
    await expect(new Consent(memoryStore()).set('unset' as never)).rejects.toThrow(/granted or denied/);
  });

  it('tells listeners about a change', async () => {
    const consent = new Consent(memoryStore());
    const seen: string[] = [];
    const off = consent.onChange((r) => seen.push(r.state));
    await consent.set('granted');
    off();
    await consent.set('denied');
    expect(seen).toEqual(['granted']);
  });

  it('ships in v0.2 with the backend transport and the banner switched on, together', () => {
    expect(OS_CONFIG.transport?.name).toBe('supabase');
    expect(OS_CONFIG.consentUi).toBe(true);
    expect(OS_CONFIG.recipient).toMatch(/Supabase.*EU.*Paris/);
    expect(OS_CONFIG.privacyHref).toMatch(/privacy\.html$/);
  });
});

describe('the install id', () => {
  it('is a UUID in the dashed form the backend accepts, with or without crypto.randomUUID', () => {
    expect(isUuid(randomUuid())).toBe(true);
    const real = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: undefined });
    try {
      const ids = Array.from({ length: 50 }, () => randomUuid());
      expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
      expect(new Set(ids).size).toBe(50);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: real });
    }
    expect(isUuid('0123456789abcdef0123456789abcdef')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it('replaces an id an older build stored in a form the backend refuses', async () => {
    const c = clock();
    const store = memoryStore();
    await store.setMeta('install', '0123456789abcdef0123456789abcdef');
    const consent = new Consent(store, c.now);
    const transport = spyTransport();
    const outbox = new Outbox({ store, consent, transport, now: c.now });
    expect(await outbox.installed()).toBeNull();
    await consent.set('granted'); c.tick(1);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    await outbox.flush();
    const install = await store.getMeta('install');
    expect(isUuid(install)).toBe(true);
    expect(transport.batches[0]?.install).toBe(install);
    expect(await outbox.installed()).toBe(install);
  });
});

describe('outbox', () => {
  async function setup(withTransport: boolean, opts: { batchSize?: number } = {}) {
    const c = clock();
    const store = memoryStore();
    const consent = new Consent(store, c.now);
    const transport = spyTransport();
    let recording = true;
    const outbox = new Outbox({ store, consent, transport: withTransport ? transport : null, now: c.now, recording: () => recording, ...opts });
    return { c, store, consent, transport, outbox, setRecording: (on: boolean) => { recording = on; } };
  }

  it('never sends without a transport, whatever the consent', async () => {
    const { store, consent, outbox, c } = await setup(false);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-transport' });
    await consent.set('granted'); c.tick(1);
    c.tick(1);
    const e = ev({ lab: 'hub', type: 'lab.open', t: c.now() });
    await store.append(e);
    outbox.note(e);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-transport' });
    expect(outbox.flushOnExit()).toBe(false);
    expect(await store.getMeta('install')).toBeUndefined();
  });

  it('never sends with a transport while consent is unset or denied', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    const e = ev({ lab: 'hub', type: 'lab.open', t: c.now() });
    await store.append(e);
    outbox.note(e);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    expect(outbox.flushOnExit()).toBe(false);
    await consent.set('denied');
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    expect(outbox.flushOnExit()).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
    expect(await store.getMeta('install')).toBeUndefined();
  });

  it('sends only events recorded after consent was granted, once each, with an install id made when sending is allowed', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await store.append(ev({ id: 'before', lab: 'hub', type: 'lab.open', t: c.now() }));
    c.tick(10);
    await consent.set('granted'); c.tick(1);
    await store.append(ev({ id: 'after-1', lab: 'hub', type: 'lab.action', t: c.now() }));
    await store.append(ev({ id: 'after-2', lab: 'hub', type: 'lab.action', t: c.now() }));

    expect(await outbox.flush()).toEqual({ sent: 2, reason: 'sent' });
    expect(transport.batches[0]?.events.map((e) => e.id)).toEqual(['after-1', 'after-2']);
    const install = await store.getMeta('install');
    expect(isUuid(install)).toBe(true);
    expect(transport.batches[0]?.install).toBe(install);

    // same millisecond as the last send: still sent once, and only the new one
    await store.append(ev({ id: 'after-3', lab: 'hub', type: 'lab.action', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 1, reason: 'sent' });
    expect(transport.batches[1]?.events.map((e) => e.id)).toEqual(['after-3']);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'nothing-new' });
  });

  it('stops sending when consent is withdrawn', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await consent.set('granted'); c.tick(1);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    await outbox.flush();
    await consent.set('denied');
    c.tick(5);
    const e = ev({ lab: 'hub', type: 'lab.action', t: c.now() });
    await store.append(e);
    outbox.note(e);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    expect(outbox.flushOnExit()).toBe(false);                     // the exit send obeys in the same tick
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('a choice made while a flush is in flight is obeyed before the next batch leaves', async () => {
    const { store, consent, c } = await setup(true);
    let release: () => void = () => undefined;
    const sent: string[] = [];
    const slow: Transport = {
      name: 'slow',
      send: (b) => new Promise<void>((res) => { sent.push(...b.events.map((e) => e.id)); release = res; }),
      erase: async () => ({ ok: true }),
    };
    const outbox = new Outbox({ store, consent, transport: slow, now: c.now, batchSize: 1 });
    await consent.set('granted'); c.tick(1);
    await store.append(ev({ id: 'first-batch', lab: 'hub', type: 'lab.action', t: c.now() }));
    await store.append(ev({ id: 'second-batch', lab: 'hub', type: 'lab.action', t: c.now() + 1 }));
    const flushing = outbox.flush();
    await vi.waitFor(() => expect(sent).toEqual(['first-batch']));
    await consent.set('denied');                                  // while the first request is on the wire
    release();
    expect(await flushing).toEqual({ sent: 1, reason: 'no-consent' });
    expect(sent).toEqual(['first-batch']);
    expect(outbox.flushOnExit()).toBe(false);
  });

  it('a flush asked for while one runs starts after it and covers what was recorded in between', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await consent.set('granted'); c.tick(1);
    await store.append(ev({ id: 'seen-by-first', lab: 'hub', type: 'lab.action', t: c.now() }));
    const first = outbox.flush();
    const second = outbox.flush();
    const third = outbox.flush();
    expect(third).toBe(second);                                    // one waits, however many ask
    await store.append(ev({ id: 'seen-by-second', lab: 'hub', type: 'lab.action', t: c.now() + 1 }));
    const results = await Promise.all([first, second]);
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(2);
    expect(transport.batches.flatMap((b) => b.events.map((e) => e.id)).sort()).toEqual(['seen-by-first', 'seen-by-second']);
  });

  it('sends nothing while recording is off, and resumes when it is on again', async () => {
    const { store, consent, outbox, transport, c, setRecording } = await setup(true);
    await consent.set('granted'); c.tick(1);
    const e = ev({ lab: 'hub', type: 'lab.open', t: c.now() });
    await store.append(e);
    outbox.note(e);
    expect((await outbox.flush()).reason).toBe('sent');           // the outbox now knows it may send
    const later = ev({ lab: 'hub', type: 'lab.action', t: c.now() + 1 });
    await store.append(later);
    outbox.note(later);
    setRecording(false);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'recording-off' });
    expect(outbox.flushOnExit()).toBe(false);
    expect(transport.send).toHaveBeenCalledTimes(1);
    setRecording(true);
    expect(await outbox.flush()).toEqual({ sent: 1, reason: 'sent' });
  });

  it('keeps its place when a send fails, and offers the same events on the next flush', async () => {
    const { store, consent, c } = await setup(true);
    const seen: string[][] = [];
    const flaky: Transport = {
      name: 'flaky',
      send: vi.fn(async (b: OutboundBatch) => { seen.push(b.events.map((e) => e.id)); if (seen.length === 1) throw new Error('offline'); }),
      erase: async () => ({ ok: true }),
    };
    const outbox = new Outbox({ store, consent, transport: flaky, now: c.now });
    await consent.set('granted'); c.tick(1);
    await store.append(ev({ id: 'only-one', lab: 'hub', type: 'lab.open', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'failed', detail: 'offline' });
    expect(await outbox.flush()).toEqual({ sent: 1, reason: 'sent' });
    expect(seen).toEqual([['only-one'], ['only-one']]);
  });

  it('never rejects, even when the store itself fails', async () => {
    const { consent, transport, c } = await setup(true);
    const broken = memoryStore();
    broken.getMeta = async () => { throw new Error('database closed'); };
    const outbox = new Outbox({ store: broken, consent: new Consent(broken, c.now), transport, now: c.now });
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'failed', detail: 'database closed' });
    expect(await outbox.erase()).toEqual({ state: 'nothing-sent' });
    void consent;
  });

  it('sends a long backlog in batches of at most 200, moving its place after each', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await consent.set('granted'); c.tick(1);
    for (let i = 0; i < 450; i++) await store.append(ev({ lab: 'hub', type: 'lab.action', t: c.now() + (i % 7) }));
    expect(await outbox.flush()).toEqual({ sent: 450, reason: 'sent' });
    expect(transport.batches.map((b) => b.events.length)).toEqual([200, 200, 50]);
    expect(BATCH_SIZE).toBe(200);
    const ids = transport.batches.flatMap((b) => b.events.map((e) => e.id));
    expect(new Set(ids).size).toBe(450);                           // each once, across same-millisecond ties
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'nothing-new' });
  });

  it('a batch that fails mid-backlog leaves the rest for the next flush, without repeating what went', async () => {
    const { store, consent, c } = await setup(true, { batchSize: 10 });
    const batches: string[][] = [];
    let fail = true;
    const transport: Transport = {
      name: 'second-fails',
      send: async (b) => { if (batches.length === 1 && fail) { fail = false; throw new Error('502'); } batches.push(b.events.map((e) => e.id)); },
      erase: async () => ({ ok: true }),
    };
    const outbox = new Outbox({ store, consent, transport, now: c.now, batchSize: 10 });
    await consent.set('granted'); c.tick(1);
    for (let i = 0; i < 25; i++) await store.append(ev({ id: `backlog-${String(i).padStart(2, '0')}`, lab: 'hub', type: 'lab.action', t: c.now() + i }));
    expect(await outbox.flush()).toEqual({ sent: 10, reason: 'failed', detail: '502' });
    expect(await outbox.flush()).toEqual({ sent: 15, reason: 'sent' });
    expect(batches.flat()).toEqual(Array.from({ length: 25 }, (_, i) => `backlog-${String(i).padStart(2, '0')}`));
  });

  it('on exit, offers what this page recorded and no flush confirmed, with keepalive, in the same tick', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await consent.set('granted'); c.tick(1);
    const first = ev({ id: 'sent-on-load', lab: 'hub', type: 'lab.open', t: c.now() });
    await store.append(first);
    outbox.note(first);
    await outbox.flush();                                          // confirmed: not offered again on exit

    c.tick(1000);
    const handoff = ev({ id: 'handoff-0001', lab: 'hub', type: 'lab.handoff', t: c.now() });
    const leave = ev({ id: 'leave-000001', lab: 'hub', type: 'lab.leave', t: c.now() });
    outbox.note(handoff);
    outbox.note(leave);                                            // noted before their writes finish, as on pagehide
    expect(outbox.flushOnExit()).toBe(true);
    expect(transport.send).toHaveBeenCalledTimes(2);               // already called, before any await
    expect(transport.batches[1]?.events.map((e) => e.id)).toEqual(['handoff-0001', 'leave-000001']);
    expect(transport.options[1]).toEqual({ keepalive: true });
    expect(transport.options[0]).toBeUndefined();

    // the exit send never moves the cursor: once the writes land, the next flush offers the same events again
    await store.append(handoff);
    await store.append(leave);
    expect(await outbox.flush()).toEqual({ sent: 2, reason: 'sent' });
    expect(transport.batches[2]?.events.map((e) => e.id)).toEqual(['handoff-0001', 'leave-000001']);
  });

  it('on exit, never offers an event recorded before consent, or one the store refused', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    const before = ev({ id: 'before-consent', lab: 'hub', type: 'lab.open', t: c.now() });
    await store.append(before);
    outbox.note(before);
    c.tick(10);
    await consent.set('granted'); c.tick(1);
    await outbox.flush();                                          // nothing new, but sending is now known to be allowed
    expect(transport.send).not.toHaveBeenCalled();
    expect(outbox.flushOnExit()).toBe(false);                      // the only event in memory predates consent

    const refused = ev({ id: 'store-refused', lab: 'hub', type: 'lab.action', t: c.now() });
    outbox.note(refused);
    outbox.drop(refused.id);
    expect(outbox.flushOnExit()).toBe(false);
  });

  it('after stop, nothing leaves the page', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await consent.set('granted'); c.tick(1);
    const e = ev({ lab: 'hub', type: 'lab.open', t: c.now() });
    await store.append(e);
    outbox.note(e);
    await outbox.flush();
    const later = ev({ lab: 'hub', type: 'lab.action', t: c.now() + 5 });
    await store.append(later);
    outbox.note(later);
    outbox.stop();
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'stopped' });
    expect(outbox.flushOnExit()).toBe(false);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('erase asks the backend to remove this install, and does not offer earlier events again', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    expect(await outbox.erase()).toEqual({ state: 'nothing-sent' });   // never allowed: no install id, nothing to erase
    expect(transport.erase).not.toHaveBeenCalled();

    await consent.set('granted'); c.tick(1);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    await outbox.flush();
    const install = await store.getMeta('install');
    c.tick(50);
    const unsent = ev({ id: 'recorded-not-sent', lab: 'hub', type: 'lab.action', t: c.now() });
    await store.append(unsent);
    outbox.note(unsent);

    expect(await outbox.erase()).toEqual({ state: 'erased' });
    expect(transport.erased).toEqual([install]);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'nothing-new' });   // what predates the erase stays here
    expect(outbox.flushOnExit()).toBe(false);

    c.tick(50);
    await store.append(ev({ id: 'after-the-erase', lab: 'hub', type: 'lab.action', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 1, reason: 'sent' });          // sharing is still on: new events go
  });

  it('erase reports a backend that fails, and never rejects', async () => {
    const c = clock();
    const store = memoryStore();
    const consent = new Consent(store, c.now);
    await store.setMeta('install', randomUuid());
    const refusing = new Outbox({ store, consent, transport: spyTransport({ ok: false, detail: 'the backend answered 503' }), now: c.now });
    expect(await refusing.erase()).toEqual({ state: 'failed', detail: 'the backend answered 503' });
    const throwing: Transport = { name: 'throws', send: async () => undefined, erase: async () => { throw new Error('boom'); } };
    expect(await new Outbox({ store, consent, transport: throwing, now: c.now }).erase()).toEqual({ state: 'failed', detail: 'boom' });
    expect(await new Outbox({ store, consent, transport: null, now: c.now }).erase()).toEqual({ state: 'failed', detail: 'this page has no backend to ask' });
  });
});
