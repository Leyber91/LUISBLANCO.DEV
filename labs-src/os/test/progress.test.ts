import { describe, expect, it } from 'vitest';
import { MAX_PROGRESS_BYTES, Progress } from '../progress.js';
import { memoryStore } from '../store.js';
import { clock, DAY, idbStore } from './helpers.js';

function setup() {
  const c = clock();
  const store = memoryStore();
  return { c, store, p: new Progress(store, c.now) };
}

describe('progress', () => {
  it('returns null for a lab with nothing saved, then the saved record with its version', async () => {
    const { p } = setup();
    expect(await p.get('heptapod')).toBeNull();
    await p.set('heptapod', { logogram: 4 }, { v: 2 });
    expect(await p.get('heptapod')).toMatchObject({ lab: 'heptapod', v: 2, data: { logogram: 4 }, resume: null, due: [], finished: false });
  });

  it('keeps the resume point, due items and finished flag when the data changes', async () => {
    const { p } = setup();
    await p.setResume('heptapod', 'heptapod.html?at=4', 'logogram 4 of 9');
    await p.setDue('heptapod', [{ id: 'a', label: 'review', at: 1 }]);
    await p.set('heptapod', { logogram: 5 });
    const r = await p.get('heptapod');
    expect(r?.resume).toMatchObject({ url: '/labs/heptapod.html?at=4', label: 'logogram 4 of 9' });
    expect(r?.due).toHaveLength(1);
  });

  it('migrates old data once, writes it back and leaves newer data alone', async () => {
    const { p, store } = setup();
    await p.set('memes', { score: 7 }, { v: 1 });
    let calls = 0;
    const migrate = (d: unknown, from: number) => { calls++; return { scores: [(d as { score: number }).score], from }; };
    const up = await p.get('memes', { v: 2, migrate });
    expect(up).toMatchObject({ v: 2, data: { scores: [7], from: 1 } });
    expect((await store.getProgress('memes'))?.v).toBe(2);
    await p.get('memes', { v: 2, migrate });
    expect(calls).toBe(1);
    expect((await p.get('memes', { v: 1, migrate }))?.v).toBe(2);   // an older page reads newer data unchanged
    expect(calls).toBe(1);
  });

  it('only accepts resume links on this site, stored as a path', async () => {
    const { p } = setup();
    await expect(p.setResume('heptapod', 'javascript:alert(1)', 'x')).rejects.toThrow(/link on this site/);
    await expect(p.setResume('heptapod', 'https://example.com/labs/heptapod.html', 'x')).rejects.toThrow(/link on this site/);
    await expect(p.setResume('heptapod', '', 'x')).rejects.toThrow(/link on this site/);
    const r = await p.setResume('heptapod', 'http://127.0.0.1:8833/labs/heptapod.html#g4', '  logogram\n 4 ');
    expect(r.resume).toMatchObject({ url: '/labs/heptapod.html#g4', label: 'logogram 4' });
  });

  it('caps due items and requires a time on each', async () => {
    const { p } = setup();
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}`, label: `card ${i}`, at: i }));
    expect((await p.setDue('claude-prep', many)).due).toHaveLength(100);
    await expect(p.setDue('claude-prep', [{ id: 'x', label: 'x', at: Number.NaN }])).rejects.toThrow(/no time/);
  });

  it('refuses data over the cap and an invalid lab id', async () => {
    const { p } = setup();
    await expect(p.set('hub', { s: 'a'.repeat(MAX_PROGRESS_BYTES) })).rejects.toThrow(/cap/);
    await expect(p.set('Not A Lab', {})).rejects.toThrow(/not a lab id/);
    await expect(p.set('hub', {}, { v: 0 })).rejects.toThrow(/positive integer/);
  });

  it('lands concurrent writes from one page', async () => {
    const store = await idbStore();
    const c = clock();
    const p = new Progress(store, c.now);
    await Promise.all([
      p.set('claude-prep', { mocks: 2 }),
      p.setResume('claude-prep', '/labs/claude-prep/#/mock/3', 'mock 3'),
      p.setDue('claude-prep', [{ id: 'a', label: 'card', at: c.now() - DAY }]),
    ]);
    const r = await p.get('claude-prep');
    expect(r).toMatchObject({ data: { mocks: 2 }, resume: { url: '/labs/claude-prep/#/mock/3' } });
    expect(r?.due).toHaveLength(1);
    store.close();
  });

  it('finish stops a lab from being unfinished; a new resume point reopens it', async () => {
    const { p } = setup();
    await p.setResume('heptapod', '/labs/heptapod.html', 'start');
    expect((await p.finish('heptapod')).finished).toBe(true);
    expect((await p.setResume('heptapod', '/labs/heptapod.html', 'again')).finished).toBe(false);
  });
});
