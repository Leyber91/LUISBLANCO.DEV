/* ============================================================
   labs-src/os/scene.ts — one lifecycle for every animated scene (canvas,
   WebGL, a background).

     const scene = mountScene(el, ({ el, reducedMotion }) => {
       const s = new MyRenderer(el, { still: reducedMotion });
       s.start();
       return { destroy: () => s.destroy(), pause: () => s.stop(), resume: () => s.start() };
     });

   - The factory returns a running scene's handle.
   - Mounting on an element that already holds a scene destroys
     that scene before the factory runs, so two never overlap.
   - One document-level visibilitychange listener pauses every
     scene while the tab is hidden.
   - One IntersectionObserver pauses a scene whose element is
     off screen.
   - pause/resume are called only on a change, never twice in a
     row; after destroy nothing is called and, once the last
     scene is gone, the listener and the observer are removed.
   - reducedMotion is the visitor's prefers-reduced-motion,
     unless the caller passes its own (the hub's ?still).
   ============================================================ */

export interface SceneHandle {
  destroy(): void;
  pause?(): void;
  resume?(): void;
}

export interface SceneContext {
  readonly el: Element;
  readonly reducedMotion: boolean;
}

export type SceneFactory = (ctx: SceneContext) => SceneHandle;

export interface SceneOptions {
  readonly reducedMotion?: boolean;
  /** pause while off screen (default true) */
  readonly observe?: boolean;
}

export interface MountedScene {
  readonly el: Element;
  readonly running: boolean;
  readonly destroyed: boolean;
  /** hold the scene paused whatever the tab and viewport do */
  pause(): void;
  /** release a hold; the scene runs again if the tab is visible and it is on screen */
  resume(): void;
  destroy(): void;
}

interface Entry {
  readonly el: Element;
  readonly handle: SceneHandle;
  held: boolean;
  inView: boolean;
  running: boolean;
  destroyed: boolean;
}

const scenes = new Map<Element, Entry>();
let io: IntersectionObserver | null = null;
let onVisibility: (() => void) | null = null;

const docHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function sync(e: Entry): void {
  const want = !e.destroyed && !e.held && e.inView && !docHidden();
  if (want === e.running) return;
  e.running = want;
  try { if (want) e.handle.resume?.(); else e.handle.pause?.(); }
  catch (err) { console.error('scene', want ? 'resume' : 'pause', 'failed', err); }
}

function attach(): void {
  if (!onVisibility && typeof document !== 'undefined') {
    onVisibility = () => scenes.forEach(sync);
    document.addEventListener('visibilitychange', onVisibility);
  }
}

function detachIfEmpty(): void {
  if (scenes.size) return;
  if (onVisibility) { document.removeEventListener('visibilitychange', onVisibility); onVisibility = null; }
  if (io) { io.disconnect(); io = null; }
}

function observer(): IntersectionObserver | null {
  if (io) return io;
  if (typeof IntersectionObserver !== 'function') return null;
  io = new IntersectionObserver((entries) => {
    for (const x of entries) {
      const e = scenes.get(x.target);
      if (!e) continue;
      e.inView = x.isIntersecting;
      sync(e);
    }
  });
  return io;
}

function prefersReducedMotion(): boolean {
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

function destroyEntry(e: Entry): void {
  if (e.destroyed) return;
  e.destroyed = true;
  e.running = false;
  if (scenes.get(e.el) === e) scenes.delete(e.el);
  io?.unobserve(e.el);
  try { e.handle.destroy(); } catch (err) { console.error('scene destroy failed', err); }
  detachIfEmpty();
}

export function mountScene(el: Element, factory: SceneFactory, opts: SceneOptions = {}): MountedScene {
  const previous = scenes.get(el);
  if (previous) destroyEntry(previous);   // the old scene is gone before the new one starts

  const handle = factory({ el, reducedMotion: opts.reducedMotion ?? prefersReducedMotion() });
  if (!handle || typeof handle.destroy !== 'function') throw new Error('a scene factory must return { destroy, pause?, resume? }');
  const e: Entry = { el, handle, held: false, inView: true, running: true, destroyed: false };
  scenes.set(el, e);
  attach();
  if (opts.observe !== false) observer()?.observe(el);
  sync(e);   // a scene mounted in a hidden tab pauses at once

  return {
    el,
    get running() { return e.running; },
    get destroyed() { return e.destroyed; },
    pause() { if (e.destroyed) return; e.held = true; sync(e); },
    resume() { if (e.destroyed) return; e.held = false; sync(e); },
    destroy() { destroyEntry(e); },
  };
}

/** How many scenes are mounted (for tests and the debug console). */
export const sceneCount = (): number => scenes.size;
