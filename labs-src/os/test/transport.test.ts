import { describe, expect, it } from 'vitest';
import { BACKEND, MAX_SENT_DATA_BYTES, ROWS_PER_REQUEST, sanitizeData, supabaseTransport, toRow, fixtureTransport } from '../transport.js';
import type { UsageRow } from '../transport.js';
import type { JsonObject, LabEvent } from '../types.js';
import { byteLength } from '../util.js';
import { DAY, fakeBackend, HOUR, T0 } from './helpers.js';
import { network } from './setup.js';

const INSTALL = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const now = () => T0;

let n = 0;
const event = (p: Partial<LabEvent> = {}): LabEvent =>
  ({ v: 1, id: `event-${String(++n).padStart(6, '0')}`, t: T0 - 1000, lab: 'hub', type: 'lab.action', data: null, session: 'session-0001', ...p });

/** as Postgres prints jsonb: a space after every colon and comma */
const asPostgres = (o: JsonObject): string =>
  '{' + Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + '}';

describe('the row an event becomes', () => {
  it('has exactly the columns of usage_events, with an ISO time', () => {
    const e = event({ id: 'abcdefgh-0001', t: T0 - 5000, lab: 'heptapod', type: 'lab.leave', session: 'sess-1', data: { visibleMs: 1200, totalMs: 3000, final: true } });
    expect(toRow(INSTALL.toUpperCase(), e, T0)).toEqual({
      install_id: INSTALL,
      event_id: 'abcdefgh-0001',
      t: new Date(T0 - 5000).toISOString(),
      lab: 'heptapod',
      type: 'lab.leave',
      session: 'sess-1',
      data: { visibleMs: 1200, totalMs: 3000, final: true },
    });
    expect(Object.keys(toRow(INSTALL, e, T0) as UsageRow)).toEqual(['install_id', 'event_id', 't', 'lab', 'type', 'session', 'data']);
  });

  it('leaves out an event the table would refuse, instead of sending a request that fails whole', () => {
    expect(toRow('not-a-uuid', event(), T0)).toBeNull();
    expect(toRow('0123456789abcdef0123456789abcdef', event(), T0)).toBeNull();          // undashed: the header check refuses it
    expect(toRow(INSTALL, event({ id: 'short' }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ id: 'x'.repeat(65) }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ lab: 'a'.repeat(41) }), T0)).toBeNull();               // a lab id may be 64 here, 40 there
    expect(toRow(INSTALL, event({ lab: 'Not A Lab!' }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ type: 'DROP TABLE' }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ type: 'a.' + 'b'.repeat(70) }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ t: T0 - 29 * DAY - 1 }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ t: T0 + 23 * HOUR + 1 }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ t: Number.NaN }), T0)).toBeNull();
    expect(toRow(INSTALL, event({ t: T0 - 29 * DAY }), T0)).not.toBeNull();
    expect(toRow(INSTALL, event({ t: T0 + 23 * HOUR }), T0)).not.toBeNull();
  });

  it('drops a session id the table would refuse and keeps the event', () => {
    expect(toRow(INSTALL, event({ session: 's'.repeat(65) }), T0)?.session).toBeNull();
    expect(toRow(INSTALL, event({ session: 's'.repeat(64) }), T0)?.session).toBe('s'.repeat(64));
  });
});

describe('what of an event may leave the browser', () => {
  it('keeps numbers, booleans, null and short plain strings', () => {
    const data = { visibleMs: 1200, ratio: 0.5, final: true, none: null, to: 'black-hole', via: 'card', path: '/labs/index.html', model: 'gemma 4', at: '12:30' };
    expect(sanitizeData(data)).toEqual(data);
  });

  it('drops a typed sentence, with punctuation or without', () => {
    expect(sanitizeData({ kind: 'ask', q: 'What is the capital of France?' })).toEqual({ kind: 'ask' });
    expect(sanitizeData({ kind: 'ask', q: 'I think, therefore I am' })).toEqual({ kind: 'ask' });
    // every character of this one is in the allowed set; it is prose all the same
    expect(sanitizeData({ kind: 'ask', q: 'my name is luis and i live in barcelona' })).toEqual({ kind: 'ask' });
    expect(sanitizeData({ q: 'I am worried about my diagnosis.' })).toBeNull();
  });

  it('drops a long string, an email-shaped string and anything outside the plain set', () => {
    expect(sanitizeData({ a: 'x'.repeat(65) })).toBeNull();
    expect(sanitizeData({ a: 'x'.repeat(64) })).toEqual({ a: 'x'.repeat(64) });
    expect(sanitizeData({ mail: 'someone@example.org' })).toBeNull();
    expect(sanitizeData({ a: 'café' })).toBeNull();
    expect(sanitizeData({ a: '<b>x</b>' })).toBeNull();
    expect(sanitizeData({ a: 'line one\nline two' })).toBeNull();
    expect(sanitizeData({ a: '?q=secret' })).toBeNull();
  });

  it('drops nested objects and arrays whole, whatever they hold', () => {
    expect(sanitizeData({ n: 1, inner: { safe: 1, text: 'hello' }, list: [1, 2, 3], deep: { a: { b: 'c' } } })).toEqual({ n: 1 });
    expect(sanitizeData({ list: ['card'] })).toBeNull();
  });

  it('drops a key that could itself carry content', () => {
    expect(sanitizeData({ 'my secret plan': true, 'a@b.c': 1, ['k'.repeat(41)]: 1, ok_key: 1, 'a.b-c': 2 })).toEqual({ ok_key: 1, 'a.b-c': 2 });
  });

  it('keeps only numbers Postgres prints as short as JavaScript does', () => {
    expect(sanitizeData({ a: 1e300, b: -1e16, c: 1e15, d: Math.PI, e: 1e-9, f: -0.123456 })).toEqual({ c: 1e15, d: 3.1416, e: 0, f: -0.1235 });
    expect(sanitizeData({ a: Number.NaN as unknown as number, b: Number.POSITIVE_INFINITY as unknown as number })).toBeNull();
  });

  it('stays under 2 KB as Postgres measures it, by leaving whole entries out', () => {
    const big: JsonObject = {};
    for (let i = 0; i < 60; i++) big[`key_${String(i).padStart(2, '0')}_${'k'.repeat(20)}`] = 'v'.repeat(60);
    const out = sanitizeData(big) as JsonObject;
    expect(Object.keys(out).length).toBeGreaterThan(10);
    expect(Object.keys(out).length).toBeLessThan(60);
    expect(byteLength(asPostgres(out))).toBeLessThanOrEqual(MAX_SENT_DATA_BYTES);
    expect(byteLength(asPostgres(out))).toBeLessThan(2048);
    expect(Object.values(out).every((v) => v === 'v'.repeat(60))).toBe(true);       // entries are whole, never cut
  });

  it('answers null for no data, for data that is not an object and for data with nothing left', () => {
    expect(sanitizeData(null)).toBeNull();
    expect(sanitizeData(undefined)).toBeNull();
    expect(sanitizeData([1, 2] as unknown as JsonObject)).toBeNull();
    expect(sanitizeData({})).toBeNull();
    expect(sanitizeData({ text: 'a, b' })).toBeNull();
  });
});

describe('send', () => {
  it('posts the rows to usage_events with the key, the install header and ignore-duplicates', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    const e = event({ data: { to: 'heptapod', via: 'card' }, type: 'lab.handoff' });
    await t.send({ install: INSTALL, events: [e] });
    expect(backend.requests).toHaveLength(1);
    const [req] = backend.requests;
    expect(req?.url).toBe(`${BACKEND.url}/rest/v1/usage_events?on_conflict=install_id,event_id`);
    expect(req?.method).toBe('POST');
    expect(req?.headers).toEqual({
      apikey: BACKEND.key,
      'content-type': 'application/json',
      'x-install-id': INSTALL,
      prefer: 'return=minimal,resolution=ignore-duplicates',
    });
    expect(req?.body).toEqual([toRow(INSTALL, e, T0)]);
    expect(req?.keepalive).toBe(false);
    expect(req?.init.credentials).toBe('omit');                    // no cookie
    expect(req?.init.referrerPolicy).toBe('no-referrer');          // no page address
    expect(backend.stored()).toHaveLength(1);
  });

  it('carries no key but the publishable one', () => {
    expect(BACKEND.key.startsWith('sb_publishable_')).toBe(true);
    expect(BACKEND.url).toBe('https://uguiiwmhlqcitxrgqqmh.supabase.co');
  });

  it('sends at most 200 rows per request, each request with the install header', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    const events = Array.from({ length: 450 }, () => event());
    await t.send({ install: INSTALL, events });
    expect(backend.posts().map((r) => (r.body as unknown[]).length)).toEqual([200, 200, 50]);
    expect(ROWS_PER_REQUEST).toBe(200);
    expect(backend.requests.every((r) => r.headers['x-install-id'] === INSTALL)).toBe(true);
    expect(backend.stored()).toHaveLength(450);
  });

  it('content never leaves: no typed text, long string, nested value or address is in any request', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    const secrets = ['tell me about my diagnosis please', 'What is my IP address?', 'someone@example.org', 'S'.repeat(80), 'buried-in-an-object', 'buried-in-a-list'];
    await t.send({ install: INSTALL, events: [
      event({ data: { kind: 'prompt', prompt: secrets[0] as string, question: secrets[1] as string, email: secrets[2] as string, blob: secrets[3] as string } }),
      event({ data: { kind: 'form', fields: { note: secrets[4] as string }, tags: [secrets[5] as string], length: 33 } }),
    ] });
    const wire = backend.requests.map((r) => JSON.stringify(r.body) + r.url + JSON.stringify(r.headers)).join('\n');
    for (const s of secrets) expect(wire).not.toContain(s);
    expect(backend.stored().map((r) => r['data'])).toEqual([{ kind: 'prompt' }, { kind: 'form', length: 33 }]);
  });

  it('treats any 2xx as stored', async () => {
    for (const status of [200, 201, 204]) {
      const backend = fakeBackend();
      backend.set(status);
      await expect(supabaseTransport({ fetch: backend.fetch, now }).send({ install: INSTALL, events: [event()] })).resolves.toBeUndefined();
    }
  });

  it('rejects, so the batch is offered again, when the network or the backend fails', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    backend.set('down');
    await expect(t.send({ install: INSTALL, events: [event()] })).rejects.toThrow(/Failed to fetch/);
    for (const status of [401, 403, 404, 408, 413, 429, 500, 502, 503]) {
      backend.set(status);
      await expect(t.send({ install: INSTALL, events: [event()] })).rejects.toThrow(String(status));
    }
    expect(backend.stored()).toHaveLength(0);
  });

  it('stops at the first request that fails, so the outbox offers the whole batch again', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    const events = Array.from({ length: 450 }, () => event());
    let calls = 0;
    const flaky: typeof fetch = (input, init) => { if (++calls === 2) backend.set('down'); return backend.fetch(input, init); };
    const t2 = supabaseTransport({ fetch: flaky, now });
    await expect(t2.send({ install: INSTALL, events })).rejects.toThrow();
    expect(backend.stored()).toHaveLength(200);
    backend.set('up');
    await t.send({ install: INSTALL, events });                       // the retry offers all 450 again
    expect(backend.stored()).toHaveLength(450);                       // and each is stored once
  });

  it('counts a request the backend refuses as malformed as handled, so it cannot block the events behind it', async () => {
    for (const status of [400, 422]) {
      const backend = fakeBackend();
      backend.set(status);
      await expect(supabaseTransport({ fetch: backend.fetch, now }).send({ install: INSTALL, events: [event()] })).resolves.toBeUndefined();
    }
  });

  it('refuses an install id that is not a UUID, and sends nothing when no row survives', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    await expect(t.send({ install: 'nope', events: [event()] })).rejects.toThrow(/UUID/);
    await t.send({ install: INSTALL, events: [event({ lab: 'Not A Lab!' }), event({ id: 'x' })] });
    await t.send({ install: INSTALL, events: [] });
    expect(backend.requests).toHaveLength(0);
  });

  it('asks for keepalive only when told the page is leaving, and only for a body a keepalive request may carry', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    await t.send({ install: INSTALL, events: [event()] }, { keepalive: true });
    expect(backend.requests[0]?.keepalive).toBe(true);
    expect(backend.requests[0]?.init.signal).toBeUndefined();        // no timer that would fire in a page that is gone

    await t.send({ install: INSTALL, events: [event()] });
    expect(backend.requests[1]?.keepalive).toBe(false);

    const heavy = Array.from({ length: 200 }, () => event({ data: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, 'v'.repeat(60)])) }));
    await t.send({ install: INSTALL, events: heavy }, { keepalive: true });
    const last = backend.requests[2];
    expect(byteLength(JSON.stringify(last?.body))).toBeGreaterThan(60_000);
    expect(last?.keepalive).toBe(false);
  });

  it('starts the request in the same tick, as a leaving page needs', () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    void t.send({ install: INSTALL, events: [event()] }, { keepalive: true });
    expect(backend.requests).toHaveLength(1);                         // before any await
  });

  it('uses the page\'s fetch when given none, looked up when it sends', async () => {
    await expect(supabaseTransport({ now }).send({ install: INSTALL, events: [event()] })).rejects.toThrow(/tests do not reach the network/);
    expect(network.attempts).toBe(1);
  });
});

describe('erase', () => {
  it('deletes the rows of the install with its header, then reads back that none remain', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    await t.send({ install: INSTALL, events: [event(), event()] });
    await t.send({ install: OTHER, events: [event()] });
    backend.requests.length = 0;

    expect(await t.erase(INSTALL)).toEqual({ ok: true });
    const [del, check] = backend.requests;
    expect(del?.method).toBe('DELETE');
    expect(del?.url).toBe(`${BACKEND.url}/rest/v1/usage_events?install_id=eq.${INSTALL}`);
    expect(del?.headers).toEqual({ apikey: BACKEND.key, 'x-install-id': INSTALL });
    expect(check?.method).toBe('GET');
    expect(check?.url).toBe(`${BACKEND.url}/rest/v1/usage_events?select=event_id&install_id=eq.${INSTALL}&limit=1`);
    expect(check?.headers['x-install-id']).toBe(INSTALL);
    expect(backend.stored().map((r) => r.install_id)).toEqual([OTHER]);   // another install's rows are untouched
  });

  it('says so, and never throws, when the backend is down, refuses, or still holds rows', async () => {
    const backend = fakeBackend();
    const t = supabaseTransport({ fetch: backend.fetch, now });
    await t.send({ install: INSTALL, events: [event()] });
    backend.set('down');
    expect(await t.erase(INSTALL)).toEqual({ ok: false, detail: 'Failed to fetch' });
    backend.set(503);
    expect(await t.erase(INSTALL)).toEqual({ ok: false, detail: 'the backend answered 503' });
    expect(await t.erase('nope')).toEqual({ ok: false, detail: 'the install id is not a UUID' });

    // a delete that answers 204 and removes nothing (the wrong header would do that) is not reported as erased
    const stubborn: typeof fetch = async (input, init) =>
      init?.method === 'DELETE' ? ({ ok: true, status: 204 } as Response) : backend.fetch(input, init);
    backend.set('up');
    expect(await supabaseTransport({ fetch: stubborn, now }).erase(INSTALL)).toEqual({ ok: false, detail: 'rows remain after the erase' });
    expect(backend.stored()).toHaveLength(1);
  });
});

describe('the fixture transport', () => {
  it('accepts everything and reaches nothing', async () => {
    const t = fixtureTransport();
    await t.send({ install: INSTALL, events: [event()] });
    expect(await t.erase(INSTALL)).toEqual({ ok: true });
    expect(network.attempts).toBe(0);
  });
});
