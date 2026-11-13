// The consent gate end to end: Labs OS as a page runs it, against a stand-in for the labs backend.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabsOS } from '../index.js';
import type { LabsOSInstance } from '../index.js';
import { FIXTURES } from '../fixtures.js';
import { supabaseTransport } from '../transport.js';
import { dataPanel } from '../ui.js';
import { isUuid } from '../util.js';
import { clock, fakeBackend, freshIdb, HOUR, MIN, setVisibility } from './helpers.js';
import type { FakeBackend } from './helpers.js';
import { network } from './setup.js';

afterEach(() => {
  LabsOS.reset();
  document.body.replaceChildren();
  history.replaceState(null, '', '/labs/index.html');
  setVisibility('visible');
});

/** let the flushes a page starts by itself (on load, on Allow) finish */
const settle = async (os: LabsOSInstance): Promise<void> => { await new Promise((r) => setTimeout(r, 0)); await os.outbox.flush(); };
const leavePage = (): void => { window.dispatchEvent(new Event('pagehide')); };
const typesOf = (b: FakeBackend): string[] => b.stored().map((r) => `${String(r['lab'])}:${String(r['type'])}`);
const banner = (): HTMLElement | null => document.querySelector('.los-consent');
const press = (root: ParentNode, sel: string): void => { (root.querySelector(sel) as HTMLButtonElement).click(); };

async function page(backend: FakeBackend, idb: IDBFactory, c: ReturnType<typeof clock>, lab = 'hub') {
  const os = await LabsOS.init({ lab, idb, now: c.now, fixture: null, config: { transport: supabaseTransport({ fetch: backend.fetch, now: c.now }) } });
  await settle(os);
  return os;
}

describe('nothing is sent before Allow', () => {
  it('a first visit records, flushes and leaves without one request', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    expect(banner()).not.toBeNull();
    c.tick(MIN);
    await os.track('lab.action', { kind: 'filter' });
    await os.track('lab.handoff', { to: 'heptapod', via: 'card' });
    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    leavePage();
    await settle(os);
    expect(backend.requests).toHaveLength(0);
    expect(network.attempts).toBe(0);
    expect(await os.sharing.everOn()).toBe(false);                       // no install id exists yet
    expect((await os.privacy.summary()).settings).not.toContain('install');
  });

  it('Allow sends what is recorded from then on, never what came before', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.track('lab.action', { kind: 'before-allow' });
    c.tick(MIN);
    press(banner() as HTMLElement, '[data-choice="granted"]');
    await vi.waitFor(async () => expect((await os.consent.get()).state).toBe('granted'));
    expect(banner()).toBeNull();
    await settle(os);
    expect(backend.requests).toHaveLength(0);                            // allowed, and nothing new to send yet
    expect(await os.sharing.everOn()).toBe(true);

    c.tick(MIN);
    await os.track('lab.handoff', { to: 'heptapod', via: 'card' });
    expect(await os.outbox.flush()).toEqual({ sent: 1, reason: 'sent' });
    expect(typesOf(backend)).toEqual(['hub:lab.handoff']);               // not the lab.open or the action before Allow
    const install = backend.stored()[0]?.install_id;
    expect(isUuid(install)).toBe(true);
    expect(backend.requests.every((r) => r.headers['x-install-id'] === install)).toBe(true);
    expect(backend.stored()[0]?.['data']).toEqual({ to: 'heptapod', via: 'card' });
  });

  it('No thanks is remembered: no request, and the question does not return', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    press(banner() as HTMLElement, '[data-choice="denied"]');
    await vi.waitFor(async () => expect((await os.consent.get()).state).toBe('denied'));
    await os.track('lab.action', { kind: 'filter' });
    leavePage();
    await settle(os);
    LabsOS.reset();

    c.tick(HOUR);
    const next = await page(backend, idb, c);
    expect(banner()).toBeNull();
    await next.track('lab.action', { kind: 'filter' });
    leavePage();
    await settle(next);
    expect(backend.requests).toHaveLength(0);
  });
});

describe('the three moments that send', () => {
  it('on load: the next page sends what the last one recorded', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const first = await page(backend, idb, c);
    await first.consent.set('granted');
    c.tick(MIN);
    await first.track('lab.action', { kind: 'filter' });
    LabsOS.reset();                                                      // the page went away without a pagehide
    expect(backend.requests).toHaveLength(0);

    c.tick(HOUR);
    await page(backend, idb, c, 'heptapod');
    expect(typesOf(backend)).toEqual(['hub:lab.action', 'heptapod:lab.open']);
  });

  it('on pagehide: the last batch goes with keepalive, the final lab.leave in it', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.consent.set('granted');
    await settle(os);
    c.tick(2 * MIN);
    await os.track('lab.handoff', { to: 'heptapod', via: 'card' });
    c.tick(MIN);
    backend.requests.length = 0;

    leavePage();
    expect(backend.requests).toHaveLength(1);                            // started inside the pagehide handler
    const [req] = backend.requests;
    expect(req?.keepalive).toBe(true);
    const rows = req?.body as { type: string; data: Record<string, unknown> | null }[];
    expect(rows.map((r) => r.type)).toEqual(['lab.handoff', 'lab.leave']);
    expect(rows[1]?.data).toEqual({ visibleMs: 3 * MIN, totalMs: 3 * MIN, final: true });
  });

  it('what a leaving page sent is offered again on the next load and stored once', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('granted');
    await settle(os);                                                    // allowed, nothing to send yet
    c.tick(MIN);
    await os.track('lab.action', { kind: 'filter' });
    leavePage();                                                         // the only send so far: the exit one
    await vi.waitFor(() => expect(typesOf(backend)).toEqual(['hub:lab.action', 'hub:lab.leave']));
    await vi.waitFor(async () => expect((await os.privacy.exportAll()).events.map((e) => e.type)).toContain('lab.leave'));
    const exitIds = (backend.posts()[0]?.body as { event_id: string }[]).map((x) => x.event_id);
    LabsOS.reset();

    c.tick(HOUR);
    await page(backend, idb, c);
    const loadIds = (backend.posts()[1]?.body as { event_id: string }[]).map((x) => x.event_id);
    expect(loadIds.slice(0, 2)).toEqual(exitIds);                        // the cursor had not moved: offered again
    expect(loadIds).toHaveLength(3);                                     // plus this load's lab.open
    expect(typesOf(backend)).toEqual(['hub:lab.action', 'hub:lab.leave', 'hub:lab.open']);
    expect(backend.stored()).toHaveLength(3);                            // each stored once
  });
});

describe('recording off wins over sharing', () => {
  it('nothing is recorded and nothing is sent, not even what was waiting', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('granted');
    await settle(os);
    c.tick(MIN);
    backend.set('down');
    await os.track('lab.action', { kind: 'waiting' });
    expect((await os.outbox.flush()).reason).toBe('failed');             // recorded with consent, not yet sent
    backend.set('up');
    backend.requests.length = 0;

    await os.recording.set(false);
    expect(await os.track('lab.action', { kind: 'refused' })).toMatchObject({ ok: false, reason: 'recording off' });
    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'recording-off' });
    leavePage();
    await settle(os);
    expect(backend.requests).toHaveLength(0);
    LabsOS.reset();

    c.tick(HOUR);
    const next = await page(backend, idb, c);                            // a later visit, recording still off
    leavePage();
    await settle(next);
    expect(backend.requests).toHaveLength(0);
    expect(banner()).toBeNull();
  });

  it('a visitor with recording off is not asked to share', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.recording.set(false);
    LabsOS.reset();
    document.body.replaceChildren();
    await page(backend, idb, c);
    expect(banner()).toBeNull();
  });
});

describe('turning sharing off', () => {
  it('stops sending at once: no flush, no exit send, and no later load sends', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('granted');
    c.tick(MIN);
    await os.track('lab.action', { kind: 'while-on' });
    await settle(os);
    expect(typesOf(backend)).toEqual(['hub:lab.action']);
    backend.requests.length = 0;

    const panel = dataPanel(os);
    await panel.open();
    press(panel.el, '.los-choice [data-choice="denied"]');
    await vi.waitFor(() => expect(panel.el.textContent).toMatch(/Sharing is off\. Nothing more is sent\./));
    c.tick(MIN);
    await os.track('lab.action', { kind: 'while-off' });
    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'no-consent' });
    leavePage();
    await settle(os);
    LabsOS.reset();

    c.tick(HOUR);
    const next = await page(backend, idb, c);
    leavePage();
    await settle(next);
    expect(backend.requests).toHaveLength(0);
    expect(backend.stored()).toHaveLength(1);                            // what was sent before stays until erased
  });

  it('turning it on again sends only what is recorded from then on', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.consent.set('granted');
    await os.consent.set('denied');
    c.tick(MIN);
    await os.track('lab.action', { kind: 'while-off' });
    c.tick(MIN);
    await os.consent.set('granted');
    c.tick(MIN);
    await os.track('lab.action', { kind: 'on-again' });
    await settle(os);
    expect(backend.stored().map((r) => r['data'])).toEqual([{ kind: 'on-again' }]);
  });
});

describe('the backend is unreachable', () => {
  it('the page works exactly as without a backend, and nothing throws', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const backend = fakeBackend();
    backend.set('down');
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('granted');
    c.tick(MIN);

    expect((await os.track('lab.action', { kind: 'filter' })).ok).toBe(true);
    await os.progress.set({ known: ['heptapod'] });
    await os.progress.setResume('/labs/heptapod.html', 'logogram 4 of 9');
    expect((await os.progress.get())?.resume?.label).toBe('logogram 4 of 9');
    expect((await os.resume.lastSessions({ includeCurrent: true })).map((v) => v.lab)).toEqual(['hub']);
    const panel = dataPanel(os);
    await panel.open();
    expect(panel.el.textContent).toMatch(/Activity log2 events/);
    expect((await os.privacy.exportAll()).counts.events).toBe(2);

    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'failed', detail: 'Failed to fetch' });
    leavePage();
    await new Promise((r) => setTimeout(r, 10));
    expect(backend.stored()).toHaveLength(0);
    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
    LabsOS.reset();

    // the failed send is silent, and the next load offers the same events
    backend.set('up');
    c.tick(HOUR);
    await page(backend, idb, c);
    expect(typesOf(backend)).toEqual(['hub:lab.action', 'hub:lab.leave', 'hub:lab.open']);
  });

  it('a backend that answers 500 changes nothing either', async () => {
    const backend = fakeBackend();
    backend.set(500);
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.consent.set('granted');
    c.tick(MIN);
    expect((await os.track('lab.action', { kind: 'filter' })).ok).toBe(true);
    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'failed', detail: 'the backend answered 500' });
    expect(os.halted).toBe(false);
  });
});

describe('delete everything', () => {
  it('erases this install on the backend when sharing was ever on, and says so', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('granted');
    c.tick(MIN);
    await os.track('lab.action', { kind: 'filter' });
    await settle(os);
    expect(backend.stored()).toHaveLength(1);

    const panel = dataPanel(os);
    await panel.open();
    const text = () => panel.el.textContent ?? '';
    press(panel.el, '[data-act="delete"]');
    expect(text()).toMatch(/Delete \d+ records from this browser and erase the events it sent\?/);
    press(panel.el, '[data-act="confirm"]');
    await vi.waitFor(() => expect(text()).toMatch(/none remain\. The events this browser sent were erased from the backend; it holds none\./));
    expect(text()).toMatch(/Sharing is off until you allow it again\./);
    expect(backend.stored()).toHaveLength(0);
    expect((await os.privacy.summary()).counts).toEqual({ events: 0, progress: 0, meta: 0 });

    // nothing more leaves this page
    backend.requests.length = 0;
    leavePage();
    await settle(os);
    expect(backend.requests).toHaveLength(0);
  });

  it('when the backend cannot be reached, says so and keeps the install id so the erase can be repeated', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('granted');
    c.tick(MIN);
    await os.track('lab.action', { kind: 'filter' });
    await settle(os);
    const install = backend.stored()[0]?.install_id;
    backend.set('down');

    const r = await os.privacy.deleteAll();
    expect(r.remote).toEqual({ state: 'failed', detail: 'Failed to fetch' });
    expect(r).toMatchObject({ ok: true, kept: ['install'], remaining: { events: 0, progress: 0, meta: 1 } });
    expect(backend.stored()).toHaveLength(1);
    LabsOS.reset();
    document.body.replaceChildren();

    backend.set('up');
    c.tick(HOUR);
    const next = await page(backend, idb, c);
    expect((await next.consent.get()).state).toBe('unset');             // sharing is off until allowed again
    expect(banner()).not.toBeNull();
    const panel = dataPanel(next);
    await panel.open();
    press(panel.el, '[data-act="delete"]');
    press(panel.el, '[data-act="confirm"]');
    await vi.waitFor(() => expect(panel.el.textContent).toMatch(/were erased from the backend; it holds none\./));
    expect(backend.stored()).toHaveLength(0);
    expect(backend.requests.filter((q) => q.method === 'DELETE').every((q) => q.headers['x-install-id'] === install)).toBe(true);
    expect((await next.privacy.summary()).settings).not.toContain('install');
  });

  it('the panel words the failure plainly', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.consent.set('granted');
    await settle(os);
    backend.set(503);
    const panel = dataPanel(os);
    await panel.open();
    press(panel.el, '[data-act="delete"]');
    press(panel.el, '[data-act="confirm"]');
    await vi.waitFor(() => expect(panel.el.textContent).toMatch(/could not be erased \(the backend answered 503\)\. Its install id is kept so the erase can be repeated/));
  });

  it('asks the backend nothing when sharing was never on', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.track('lab.action', { kind: 'filter' });
    const r = await os.privacy.deleteAll();
    expect(r.remote).toEqual({ state: 'nothing-sent' });
    expect(backend.requests).toHaveLength(0);
  });

  it('keeps a "No thanks", so deleting never brings the question back', async () => {
    const backend = fakeBackend();
    const c = clock();
    const idb = freshIdb();
    const os = await page(backend, idb, c);
    await os.consent.set('denied');
    const r = await os.privacy.deleteAll();
    expect(r).toMatchObject({ ok: true, kept: ['consent'], remote: { state: 'nothing-sent' } });
    LabsOS.reset();
    document.body.replaceChildren();
    const next = await page(backend, idb, c);
    expect((await next.consent.get()).state).toBe('denied');
    expect(banner()).toBeNull();
    expect(backend.requests).toHaveLength(0);
  });
});

describe('erase what was sent', () => {
  it('removes the backend rows, keeps the record here, and leaves sharing as it was', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await page(backend, freshIdb(), c);
    await os.consent.set('granted');
    c.tick(MIN);
    await os.track('lab.action', { kind: 'filter' });
    await settle(os);
    const panel = dataPanel(os);
    await panel.open();
    press(panel.el, '[data-act="erase"]');
    await vi.waitFor(() => expect(panel.el.textContent).toMatch(/Erased: the backend holds no events from this browser\. The record here is unchanged\./));
    expect(backend.stored()).toHaveLength(0);
    expect((await os.privacy.summary()).counts.events).toBe(2);
    expect((await os.consent.get()).state).toBe('granted');

    backend.set('down');
    press(panel.el, '[data-act="erase"]');
    await vi.waitFor(() => expect(panel.el.textContent).toMatch(/could not be erased \(Failed to fetch\)\. Try again when you are online\./));
  });
});

describe('where no answer could be kept', () => {
  it('a window that blocks storage is not asked and sends nothing', async () => {
    const backend = fakeBackend();
    const c = clock();
    const os = await LabsOS.init({ lab: 'hub', idb: null, now: c.now, fixture: null, config: { transport: supabaseTransport({ fetch: backend.fetch, now: c.now }) } });
    expect(os.storage.persistent).toBe(false);
    expect(banner()).toBeNull();
    expect(os.sharing.available).toBe(false);
    await os.consent.set('granted');                                     // even if something set it
    await os.track('lab.action', { kind: 'filter' });
    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'no-transport' });
    leavePage();
    await settle(os);
    expect(backend.requests).toHaveLength(0);
  });
});

describe('fixtures', () => {
  it('never reach the network, whatever is pressed', async () => {
    for (const name of FIXTURES) {
      const os = await LabsOS.init({ lab: 'hub', fixture: name });       // the shipped config: the real transport
      if (os.sharing.available) {
        expect(os.outbox.transport?.name).toBe('fixture');
        await os.consent.set('granted');
        await os.track('lab.action', { kind: 'filter' });
        await settle(os);
        leavePage();
        await os.sharing.erase();
      }
      await os.privacy.deleteAll();
      expect(network.attempts).toBe(0);
      LabsOS.reset();
      document.body.replaceChildren();
    }
  });

  it('show the question on a first visit and before an answer, and not after one', async () => {
    const shown: Record<string, boolean> = {};
    for (const name of FIXTURES) {
      await LabsOS.init({ lab: 'hub', fixture: name });
      shown[name] = banner() !== null;
      LabsOS.reset();
      document.body.replaceChildren();
    }
    expect(shown).toEqual({
      'first-visit': true, consent: true,
      returning: false, 'returning-due': false, 'sharing-on': false, 'sharing-off': false,
      'recording-off': false, 'storage-unavailable': false,
    });
  });
});
