import { afterEach, describe, expect, it, vi } from 'vitest';
import { LabsOS } from '../index.js';
import { FIXTURES } from '../fixtures.js';
import { clock, freshIdb, HOUR, setVisibility } from './helpers.js';

afterEach(() => {
  LabsOS.reset();
  document.body.replaceChildren();
  history.replaceState(null, '', '/labs/index.html');
  setVisibility('visible');
});

describe('LabsOS.init', () => {
  it('is idempotent for one lab and refuses a second lab on the same page', async () => {
    const idb = freshIdb();
    const a = LabsOS.init({ lab: 'hub', idb });
    const b = LabsOS.init({ lab: 'hub', idb });
    expect(b).toBe(a);
    expect(await a).toBe(await b);
    expect(LabsOS.instance).toBe(await a);
    await expect(LabsOS.init({ lab: 'heptapod', idb })).rejects.toThrow(/already runs for "hub"/);
    await expect(LabsOS.init({ lab: 'Bad Id' } as never)).rejects.toThrow(/lab id/);
  });

  it('records lab.open, a previous visit on the next load, and binds track to its lab', async () => {
    const idb = freshIdb();
    const c = clock();
    const first = await LabsOS.init({ lab: 'hub', idb, now: c.now, fixture: null });
    expect(first.previousVisit).toBeNull();
    expect(first.storage).toEqual({ kind: 'indexeddb', persistent: true, note: '', fixture: null });
    first.register('hub.filter', { cls: 'action' });
    expect((await first.track('hub.filter', { id: 'space' })).ok).toBe(true);
    LabsOS.reset();

    c.tick(2 * HOUR);
    const second = await LabsOS.init({ lab: 'heptapod', idb, now: c.now, fixture: null });
    expect(second.previousVisit).toEqual({ t: c.now() - 2 * HOUR, lab: 'hub' });
    const types = (await second.privacy.exportAll()).events.map((e) => `${e.lab}:${e.type}`);
    expect(types).toEqual(['hub:lab.open', 'hub:hub.filter', 'heptapod:lab.open']);
  });

  it('a fixture never opens the visitor\'s IndexedDB', async () => {
    for (const name of FIXTURES) {
      const open = vi.fn();
      const spy = { open, deleteDatabase: open, databases: open, cmp: open } as unknown as IDBFactory;
      history.replaceState(null, '', `/labs/index.html?os-fixture=${name}`);
      const os = await LabsOS.init({ lab: 'hub', idb: spy });
      expect(os.storage.fixture).toBe(name);
      expect(os.storage.kind).toBe('memory');
      expect(open).not.toHaveBeenCalled();
      LabsOS.reset();
    }
  });

  it('an unknown fixture name still stays off the real store', async () => {
    const open = vi.fn();
    const os = await LabsOS.init({ lab: 'hub', idb: { open } as unknown as IDBFactory, fixture: 'nope' });
    expect(open).not.toHaveBeenCalled();
    expect(os.storage).toMatchObject({ kind: 'memory', persistent: false, fixture: 'nope' });
  });

  it('the storage-unavailable fixture discloses persistent:false', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'storage-unavailable' });
    expect(os.storage).toMatchObject({ kind: 'memory', persistent: false, fixture: 'storage-unavailable' });
    expect(os.storage.note).toMatch(/nothing is kept/);
  });

  it('runs on memory when IndexedDB is missing, and says so', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: null, fixture: null });
    expect(os.storage).toMatchObject({ kind: 'memory', persistent: false });
    expect((await os.track('lab.action', { n: 1 })).ok).toBe(true);
  });

  it('the returning fixture yields a last lab with its time in view, and three reasoned suggestions', async () => {
    const c = clock();
    const os = await LabsOS.init({ lab: 'hub', fixture: 'returning-due', now: c.now });
    const [last] = await os.resume.lastSessions({ exclude: ['hub'] });
    expect(last).toMatchObject({ lab: 'heptapod', source: 'lab', visibleMs: 14 * 60_000 });
    const hub = await os.progress.get();
    const known = (hub?.data as { known: string[] }).known;
    const catalogue = ['heptapod', 'alt-reality', 'claude-prep', 'workout-plans', 'trends'].map((id) => ({
      id, title: id, href: `/labs/${id}.html`, world: id === 'claude-prep' || id === 'workout-plans' ? 'self' : id === 'trends' ? 'signals' : 'contact', worldName: 'W',
    }));
    const next = await os.resume.whatsNext(catalogue, { known, exclude: ['heptapod'] });
    expect(next.map((s) => s.kind)).toEqual(['due', 'world', 'world']);
    expect(next.every((s) => s.reason.length > 10)).toBe(true);
  });

  it('deleteAll erases the record, stops recording and tells listeners', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    await os.track('lab.action', { n: 1 });
    const heard = vi.fn();
    os.onDeleted(heard);
    const r = await os.privacy.deleteAll();
    expect(r.ok).toBe(true);
    expect(os.halted).toBe(true);
    expect(heard).toHaveBeenCalledOnce();
    setVisibility('hidden');                                        // would normally write lab.leave
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((res) => setTimeout(res, 10));
    expect((await os.privacy.summary()).counts).toEqual({ events: 0, progress: 0, meta: 0 });
  });

  it('creates no install id and shows no consent banner in v0', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    await os.track('lab.action', { n: 1 });
    expect(await os.outbox.flush()).toEqual({ sent: 0, reason: 'no-transport' });
    expect((await os.privacy.summary()).settings).not.toContain('install');
    expect(document.querySelector('.los-consent')).toBeNull();
  });

  it('shows the consent banner when the flag is on and the visitor has not chosen', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null, config: { consentUi: true } });
    const banner = document.querySelector('.los-consent');
    expect(banner).not.toBeNull();
    (banner!.querySelector('[data-choice="denied"]') as HTMLButtonElement).click();
    await vi.waitFor(async () => expect((await os.consent.get()).state).toBe('denied'));
    expect(document.querySelector('.los-consent')).toBeNull();
  });
});
