// Shared test helpers: a controllable clock, a fresh fake IndexedDB per test, and an event builder.
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../store.js';
import type { Store } from '../store.js';
import type { LabEvent } from '../types.js';

export const T0 = Date.UTC(2026, 10, 13, 12, 0, 0);
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function clock(start = T0) {
  let t = start;
  const now = () => t;
  return { now, set: (v: number) => { t = v; }, tick: (ms: number) => { t += ms; } };
}

/** A database nobody else sees. */
export const freshIdb = (): IDBFactory => new IDBFactory();

export async function idbStore(idb: IDBFactory = freshIdb()): Promise<Store> {
  const s = await openStore({ idb });
  if (s.kind !== 'indexeddb') throw new Error('expected IndexedDB: ' + s.note);
  return s;
}

let n = 0;
export function ev(p: Partial<LabEvent> & Pick<LabEvent, 'lab' | 'type' | 't'>): LabEvent {
  return { v: 1, id: `e${++n}`, data: null, session: 's', ...p };
}

/** Make document.visibilityState report `state` and fire visibilitychange. */
export function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
}
