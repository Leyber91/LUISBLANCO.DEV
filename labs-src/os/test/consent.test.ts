import { describe, expect, it, vi } from 'vitest';
import { Consent, CONSENT_POLICY, Outbox } from '../consent.js';
import type { OutboundBatch, Transport } from '../consent.js';
import { OS_CONFIG } from '../config.js';
import { memoryStore } from '../store.js';
import { clock, ev } from './helpers.js';

function spyTransport(): Transport & { batches: OutboundBatch[] } {
  const batches: OutboundBatch[] = [];
  return { name: 'spy', batches, send: vi.fn(async (b: OutboundBatch) => { batches.push(b); }) };
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

  it('ships in v0 with no transport and the banner switched off', () => {
    expect(OS_CONFIG.transport).toBeNull();
    expect(OS_CONFIG.consentUi).toBe(false);
  });
});

describe('outbox', () => {
  async function setup(withTransport: boolean) {
    const c = clock();
    const store = memoryStore();
    const consent = new Consent(store, c.now);
    const transport = spyTransport();
    const outbox = new Outbox({ store, consent, transport: withTransport ? transport : null });
    return { c, store, consent, transport, outbox };
  }

  it('never sends without a transport, whatever the consent', async () => {
    const { store, consent, outbox, c } = await setup(false);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-transport' });
    await consent.set('granted');
    c.tick(1);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-transport' });
    expect(await store.getMeta('install')).toBeUndefined();
  });

  it('never sends with a transport while consent is unset or denied', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    await consent.set('denied');
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    expect(transport.send).not.toHaveBeenCalled();
    expect(await store.getMeta('install')).toBeUndefined();
  });

  it('sends only events recorded after consent was granted, once each, with an install id made on first need', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await store.append(ev({ id: 'before', lab: 'hub', type: 'lab.open', t: c.now() }));
    c.tick(10);
    await consent.set('granted');
    await store.append(ev({ id: 'after-1', lab: 'hub', type: 'lab.action', t: c.now() }));
    await store.append(ev({ id: 'after-2', lab: 'hub', type: 'lab.action', t: c.now() }));

    expect(await outbox.flush()).toEqual({ sent: 2, reason: 'sent' });
    expect(transport.batches[0]?.events.map((e) => e.id)).toEqual(['after-1', 'after-2']);
    const install = await store.getMeta('install');
    expect(typeof install).toBe('string');
    expect(transport.batches[0]?.install).toBe(install);

    // same millisecond as the last send: still sent once, and only the new one
    await store.append(ev({ id: 'after-3', lab: 'hub', type: 'lab.action', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 1, reason: 'sent' });
    expect(transport.batches[1]?.events.map((e) => e.id)).toEqual(['after-3']);
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'nothing-new' });
  });

  it('stops sending when consent is withdrawn', async () => {
    const { store, consent, outbox, transport, c } = await setup(true);
    await consent.set('granted');
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    await outbox.flush();
    await consent.set('denied');
    c.tick(5);
    await store.append(ev({ lab: 'hub', type: 'lab.action', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('keeps its place when a send fails', async () => {
    const { store, consent, c } = await setup(true);
    const flaky: Transport = { name: 'flaky', send: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined) };
    const outbox = new Outbox({ store, consent, transport: flaky });
    await consent.set('granted');
    await store.append(ev({ lab: 'hub', type: 'lab.open', t: c.now() }));
    expect(await outbox.flush()).toEqual({ sent: 0, reason: 'failed', detail: 'offline' });
    expect(await outbox.flush()).toEqual({ sent: 1, reason: 'sent' });
  });
});
