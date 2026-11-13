import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountScene, sceneCount } from '../scene.js';
import type { SceneHandle } from '../scene.js';
import { setVisibility } from './helpers.js';

/* A controllable IntersectionObserver: tests decide what is on screen. */
class FakeIO {
  static last: FakeIO | null = null;
  readonly targets = new Set<Element>();
  disconnected = false;
  constructor(readonly cb: IntersectionObserverCallback) { FakeIO.last = this; }
  observe(el: Element) { this.targets.add(el); }
  unobserve(el: Element) { this.targets.delete(el); }
  disconnect() { this.disconnected = true; this.targets.clear(); }
  fire(el: Element, isIntersecting: boolean) {
    this.cb([{ target: el, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function recorder(name: string, log: string[]): () => SceneHandle {
  return () => {
    log.push(`${name}:init`);
    return {
      destroy: () => log.push(`${name}:destroy`),
      pause: () => log.push(`${name}:pause`),
      resume: () => log.push(`${name}:resume`),
    };
  };
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', FakeIO);
  setVisibility('visible');
});
afterEach(() => {
  vi.unstubAllGlobals();
  setVisibility('visible');
});

describe('scene lifecycle', () => {
  it('destroys the scene it replaces before the next one starts', () => {
    const el = document.createElement('canvas');
    const log: string[] = [];
    mountScene(el, recorder('a', log));
    const b = mountScene(el, recorder('b', log));
    expect(log).toEqual(['a:init', 'a:destroy', 'b:init']);
    expect(sceneCount()).toBe(1);
    b.destroy();
    expect(sceneCount()).toBe(0);
  });

  it('pauses every scene while the tab is hidden and resumes on return, once each', () => {
    const log: string[] = [];
    const a = mountScene(document.createElement('canvas'), recorder('a', log));
    const b = mountScene(document.createElement('canvas'), recorder('b', log));
    setVisibility('hidden');
    setVisibility('hidden');
    expect(log).toEqual(['a:init', 'b:init', 'a:pause', 'b:pause']);
    expect(a.running).toBe(false);
    setVisibility('visible');
    expect(log.slice(4)).toEqual(['a:resume', 'b:resume']);
    a.destroy(); b.destroy();
  });

  it('pauses a scene that scrolls off screen', () => {
    const el = document.createElement('canvas');
    const log: string[] = [];
    const s = mountScene(el, recorder('hero', log));
    FakeIO.last!.fire(el, false);
    expect(s.running).toBe(false);
    setVisibility('hidden');
    setVisibility('visible');                         // back in the tab, still off screen: stays paused
    FakeIO.last!.fire(el, true);
    expect(log).toEqual(['hero:init', 'hero:pause', 'hero:resume']);
    s.destroy();
  });

  it('a held pause survives the tab coming back', () => {
    const log: string[] = [];
    const s = mountScene(document.createElement('canvas'), recorder('s', log));
    s.pause();
    setVisibility('hidden');
    setVisibility('visible');
    expect(s.running).toBe(false);
    s.resume();
    expect(log).toEqual(['s:init', 's:pause', 's:resume']);
    s.destroy();
  });

  it('a scene mounted in a hidden tab pauses at once', () => {
    setVisibility('hidden');
    const log: string[] = [];
    const s = mountScene(document.createElement('canvas'), recorder('s', log));
    expect(log).toEqual(['s:init', 's:pause']);
    s.destroy();
  });

  it('calls nothing after destroy and drops the listener and observer with the last scene', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const log: string[] = [];
    const el = document.createElement('canvas');
    const s = mountScene(el, recorder('s', log));
    const io = FakeIO.last!;
    expect(add.mock.calls.filter((c) => c[0] === 'visibilitychange')).toHaveLength(1);
    s.destroy();
    s.destroy();
    setVisibility('hidden');
    io.fire(el, true);
    s.resume();
    expect(log).toEqual(['s:init', 's:destroy']);
    expect(remove.mock.calls.filter((c) => c[0] === 'visibilitychange')).toHaveLength(1);
    expect(io.disconnected).toBe(true);
  });

  it('shares one visibility listener across scenes', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const scenes = [1, 2, 3].map(() => mountScene(document.createElement('canvas'), recorder('x', [])));
    expect(add.mock.calls.filter((c) => c[0] === 'visibilitychange')).toHaveLength(1);
    scenes.forEach((s) => s.destroy());
  });

  it('passes the reduced-motion preference to the factory', () => {
    const seen: boolean[] = [];
    const f = ({ reducedMotion }: { reducedMotion: boolean }) => { seen.push(reducedMotion); return { destroy() {} }; };
    mountScene(document.createElement('canvas'), f, { reducedMotion: true }).destroy();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    mountScene(document.createElement('canvas'), f).destroy();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    mountScene(document.createElement('canvas'), f).destroy();
    expect(seen).toEqual([true, true, false]);
  });

  it('works without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const log: string[] = [];
    const s = mountScene(document.createElement('canvas'), recorder('s', log));
    expect(s.running).toBe(true);
    s.destroy();
  });

  it('rejects a factory that returns no destroy', () => {
    expect(() => mountScene(document.createElement('canvas'), () => ({}) as SceneHandle)).toThrow(/destroy/);
  });
});
