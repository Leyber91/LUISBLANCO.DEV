import type { Store } from './store.js';
export declare const FIXTURES: readonly ['first-visit', 'returning', 'returning-due', 'storage-unavailable', 'consent', 'sharing-on', 'sharing-off', 'recording-off'];
export type FixtureName = (typeof FIXTURES)[number];
export declare const isFixture: (s: unknown) => s is FixtureName;
/** A memory store seeded for the named fixture. Never touches IndexedDB. */
export declare function fixtureStore(name: FixtureName, now: number): Store;
