import { afterEach, describe, expect, it, vi } from 'vitest';
import { Registry, Tracker } from '../events.js';
import { LabsOS } from '../index.js';
import { memoryStore } from '../store.js';
import { readRecording } from '../recording.js';
import { dataPanel, resumePlate, storageStamp } from '../ui.js';
import { clock, freshIdb, HOUR } from './helpers.js';

afterEach(() => {
  LabsOS.reset();
  document.body.replaceChildren();
});

describe('the recording switch', () => {
  it('a tracker with recording off refuses with "recording off" and appends nothing', async () => {
    const store = memoryStore();
    const t = new Tracker({ store, registry: new Registry(), session: 'S' });
    t.setRecording(false);
    expect(await t.track('hub', 'lab.action', { n: 1 })).toEqual({ ok: false, reason: 'recording off', detail: 'the visitor turned recording off' });
    expect(await t.track('hub', 'lab.handoff', { to: 'heptapod' })).toMatchObject({ ok: false, reason: 'recording off' });
    expect(await store.counts()).toMatchObject({ events: 0 });
    t.setRecording(true);
    expect((await t.track('hub', 'lab.action', { n: 2 })).ok).toBe(true);
  });

  it('reads a missing or malformed setting as on', () => {
    expect(readRecording(undefined)).toEqual({ on: true, t: null });
    expect(readRecording({ on: 'no' })).toEqual({ on: true, t: null });
    expect(readRecording({ on: false, t: 5 })).toEqual({ on: false, t: 5 });
  });

  it('persists in meta: the next page load logs nothing, not even its visit', async () => {
    const idb = freshIdb();
    const c = clock();
    const first = await LabsOS.init({ lab: 'hub', idb, now: c.now, fixture: null });
    const heard = vi.fn();
    first.recording.onChange(heard);
    await first.recording.set(false);
    expect(heard).toHaveBeenCalledWith({ on: false, t: c.now() });
    expect(await first.track('lab.handoff', { to: 'heptapod' })).toMatchObject({ ok: false, reason: 'recording off' });
    const before = await first.privacy.exportAll();
    LabsOS.reset();

    c.tick(HOUR);
    const second = await LabsOS.init({ lab: 'heptapod', idb, now: c.now, fixture: null });
    expect(second.recording.on).toBe(false);
    expect(await second.track('lab.action', { n: 1 })).toMatchObject({ ok: false, reason: 'recording off' });
    const after = await second.privacy.exportAll();
    expect(after.events).toEqual(before.events);                      // no lab.open for the second load
    expect(after.meta['visit.last']).toEqual(before.meta['visit.last']); // the visit itself is not noted
    expect(after.meta['recording']).toEqual({ on: false, t: c.now() - HOUR });

    await second.recording.set(true);
    expect((await second.track('lab.action', { n: 2 })).ok).toBe(true);
  });

  it('deleting everything keeps recording off', async () => {
    const idb = freshIdb();
    const os = await LabsOS.init({ lab: 'hub', idb, fixture: null });
    await os.track('lab.action', { n: 1 });
    await os.recording.set(false);
    const r = await os.privacy.deleteAll();
    expect(r).toMatchObject({ ok: true, kept: ['recording'], remaining: { events: 0, progress: 0, meta: 1 } });
    LabsOS.reset();
    const next = await LabsOS.init({ lab: 'hub', idb, fixture: null });
    expect(next.recording.on).toBe(false);
    expect((await next.privacy.summary()).counts).toEqual({ events: 0, progress: 0, meta: 1 });
  });

  it('deleting everything with recording on leaves nothing at all', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    await os.recording.set(false);
    await os.recording.set(true);
    const r = await os.privacy.deleteAll();
    expect(r).toMatchObject({ ok: true, kept: [], remaining: { events: 0, progress: 0, meta: 0 } });
  });
});

describe('the recording switch on screen', () => {
  it('Your data shows the switch with its plain copy and flips it', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    const panel = dataPanel(os);
    await panel.open();
    const text = () => panel.el.textContent ?? '';
    const btn = () => panel.el.querySelector('[data-act="recording"]') as HTMLButtonElement;
    expect(text()).toMatch(/On: the labs you open and what you do in them are logged\. The record stays in this browser; usage events leave it only if you allow that under Sharing\./);
    expect(btn().textContent).toBe('Stop recording');

    btn().click();
    await vi.waitFor(() => expect(btn().textContent).toBe('Turn recording on'));
    expect(os.recording.on).toBe(false);
    expect(text()).toMatch(/Off since \d{1,2} [A-Z][a-z]{2}: nothing new is logged, and what was logged before stays until you delete it\. The record stays in this browser; usage events leave it only if you allow that under Sharing\./);
    expect(text()).toMatch(/Recording is off\. Nothing new is logged until you turn it on\./);

    // a delete while off says recording stays off, and counts only the records it removes
    (panel.el.querySelector('[data-act="delete"]') as HTMLButtonElement).click();
    expect(text()).toMatch(/Delete 2 records from this browser\?/);   // lab.open and the last visit; the switch stays
    (panel.el.querySelector('[data-act="confirm"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(text()).toMatch(/Deleted 2 records; none remain\. Recording stays off\./));
    expect(os.recording.on).toBe(false);
  });

  it('the plate reads "Recording off" with the way back on', () => {
    const el = resumePlate({ persistent: true, recording: false, record: '11 events since 9 Nov', next: [], last: { title: 'Heptapod Codec', href: '/labs/heptapod.html', when: 'now', resumeLabel: null } });
    const foot = el.querySelector('.los-foot')!;
    expect(foot.querySelector('.los-stamp')?.textContent).toBe('Recording off · the record is kept only in this browser');
    const link = foot.querySelector('a')!;
    expect(link.textContent).toBe('Turn it back on in Your data');
    expect(link.getAttribute('href')).toBe('#your-data');
  });

  it('the footer stamp says so', () => {
    const s = { kind: 'indexeddb' as const, persistent: true, note: '', fixture: null };
    expect(storageStamp(s, false).textContent).toBe('Recording off');
    expect(storageStamp(s, true).textContent).toBe('Record kept in this browser');
  });

  it('the recording-off fixture starts with recording off', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'recording-off' });
    expect(os.recording.on).toBe(false);
    expect((await os.resume.lastSessions({ exclude: ['hub'] }))[0]?.lab).toBe('heptapod');
  });
});

describe('Your data names labs by title', () => {
  it('uses the catalogue title and falls back to the id', async () => {
    const os = await LabsOS.init({ lab: 'hub', fixture: 'returning' });   // progress for heptapod and hub
    const titles: Record<string, string> = { heptapod: 'Heptapod Codec' };
    const panel = dataPanel(os, { titleOf: (id) => titles[id] });
    await panel.open();
    expect(panel.el.textContent).toMatch(/Saved progress2 labs: Heptapod Codec, hub/);
  });

  it('prints the summarised part of a bounded log with titles', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null, maxEvents: 3 });
    for (let i = 0; i < 4; i++) await os.track('lab.outcome', { i });
    const titles: Record<string, string> = { hub: 'Labs hub' };
    const panel = dataPanel(os, { titleOf: (id) => titles[id] });
    await panel.open();
    // lab.open + 4 outcomes = 5 events, the newest 3 kept
    expect(panel.el.textContent).toMatch(/3 events, \d{1,2} [A-Z][a-z]{2} to \d{1,2} [A-Z][a-z]{2}\. Keeps the newest 3\. 2 earlier events summarised \([^)]*\): Labs hub 2\./);
  });

  it('shows a lab id when there is no title', async () => {
    const os = await LabsOS.init({ lab: 'hub', idb: freshIdb(), fixture: null });
    await os.progress.set({ known: [] });
    const panel = dataPanel(os);
    await panel.open();
    expect(panel.el.textContent).toMatch(/Saved progress1 lab: hub/);
  });
});
