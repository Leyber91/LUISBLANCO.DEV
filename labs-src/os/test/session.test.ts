import { afterEach, describe, expect, it, vi } from 'vitest';
import { Registry, Tracker } from '../events.js';
import { startSession } from '../session.js';
import { memoryStore } from '../store.js';
import { clock, MIN, setVisibility } from './helpers.js';

afterEach(() => setVisibility('visible'));

function setup() {
  const c = clock();
  const store = memoryStore();
  const tracker = new Tracker({ store, registry: new Registry(), session: 'S1', now: c.now });
  return { c, store, tracker };
}

const leaves = async (store: ReturnType<typeof memoryStore>) =>
  (await store.events()).filter((e) => e.type === 'lab.leave').map((e) => e.data);

describe('session lifecycle', () => {
  it('records lab.open with the page path and no query string', async () => {
    const { store, tracker } = setup();
    const life = startSession(tracker, 'hub');
    await life.opened;
    const [open] = await store.events();
    expect(open).toMatchObject({ type: 'lab.open', lab: 'hub', session: 'S1', data: { path: '/labs/index.html' } });
    life.stop();
  });

  it('counts visible time only, and records cumulative lab.leave on each hide', async () => {
    const { c, store, tracker } = setup();
    setVisibility('visible');
    const life = startSession(tracker, 'heptapod', { now: c.now });
    await life.opened;

    c.tick(5 * MIN);
    setVisibility('hidden');          // 5 min visible
    c.tick(10 * MIN);                 // hidden: does not count
    setVisibility('visible');
    c.tick(2 * MIN);
    setVisibility('hidden');          // 7 min visible, 17 min total
    await vi.waitFor(async () => expect(await leaves(store)).toHaveLength(2));

    expect(await leaves(store)).toEqual([
      { visibleMs: 5 * MIN, totalMs: 5 * MIN, final: false },
      { visibleMs: 7 * MIN, totalMs: 17 * MIN, final: false },
    ]);
    life.stop();
  });

  it('records a final lab.leave on pagehide and resumes counting after the back-forward cache', async () => {
    const { c, store, tracker } = setup();
    const life = startSession(tracker, 'hub', { now: c.now });
    await life.opened;
    c.tick(MIN);
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(async () => expect(await leaves(store)).toHaveLength(1));
    expect((await leaves(store))[0]).toEqual({ visibleMs: MIN, totalMs: MIN, final: true });

    c.tick(MIN);                                            // frozen in the cache: not visible time
    const show = new Event('pageshow') as Event & { persisted: boolean };
    Object.defineProperty(show, 'persisted', { value: true });
    window.dispatchEvent(show);
    c.tick(MIN);
    await life.leave(true);
    expect((await leaves(store))[1]).toEqual({ visibleMs: 2 * MIN, totalMs: 3 * MIN, final: true });
    life.stop();
  });

  it('does not write a second lab.leave when nothing changed', async () => {
    const { c, store, tracker } = setup();
    const life = startSession(tracker, 'hub', { now: c.now });   // a fixed clock: on the real one the totals can tick between calls
    await life.opened;
    await life.leave(false);
    await life.leave(false);
    expect(await leaves(store)).toHaveLength(1);
    life.stop();
  });

  it('starts hidden when the page opens in a background tab', async () => {
    const { c, store, tracker } = setup();
    setVisibility('hidden');
    const life = startSession(tracker, 'hub', { now: c.now });
    await life.opened;
    c.tick(3 * MIN);
    setVisibility('visible');
    c.tick(MIN);
    await life.leave(true);
    expect((await leaves(store)).at(-1)).toEqual({ visibleMs: MIN, totalMs: 4 * MIN, final: true });
    life.stop();
  });

  it('removes its listeners on stop', async () => {
    const { store, tracker } = setup();
    const life = startSession(tracker, 'hub');
    await life.opened;
    life.stop();
    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 10));
    expect(await leaves(store)).toHaveLength(0);
  });
});
