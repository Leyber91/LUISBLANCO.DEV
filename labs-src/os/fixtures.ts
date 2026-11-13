/* ============================================================
   labs-src/os/fixtures.ts — seeded records for screenshots and review.

   A page opened with ?os-fixture=<name> runs Labs OS against a
   memory store seeded here. The visitor's real IndexedDB record
   is never opened, read or written, nothing is sent (index.ts
   swaps in a transport that reaches nothing), and the page shows
   a stamp saying it is a fixture.

     first-visit          nothing recorded yet; the sharing question
                          is asked
     returning            two earlier visits; Heptapod has a resume
                          point; one lab is new since the last visit;
                          the visitor answered "No thanks" on their
                          first visit, so no question is asked
     returning-due        returning, plus Claude Prep reporting
                          twelve review items due
     storage-unavailable  a window where storage is blocked
     consent              returning, before any answer: the sharing
                          question is asked
     sharing-on           returning, after "Allow" four days ago
     sharing-off          returning, after "No thanks" four days ago
     recording-off        returning, after the visitor turned
                          recording off yesterday

   The seeded labs stand for labs that have adopted the OS; today
   only the hub records, so a real record holds hub sessions and
   handoffs. Times are relative to the moment the page opens.
   ============================================================ */

import type { DueItem, Json, LabEvent, ProgressRecord } from './types.js';
import { EVENT_V } from './types.js';
import { CONSENT_KEY, CONSENT_POLICY, INSTALL_KEY } from './consent.js';
import { memoryStore } from './store.js';
import type { Store } from './store.js';

export const FIXTURES = ['first-visit', 'returning', 'returning-due', 'storage-unavailable', 'consent', 'sharing-on',
  'sharing-off', 'recording-off'] as const;
export type FixtureName = (typeof FIXTURES)[number];
export const isFixture = (s: unknown): s is FixtureName => typeof s === 'string' && (FIXTURES as readonly string[]).includes(s);

/** The hub's live labs when this fixture was written, minus "trends", so the fixture has one new lab. */
const KNOWN_BEFORE = ['black-hole', 'dimensional', 'exomania', 'heptapod', 'alt-reality', 'the-figure', 'primordial-seed',
  'token-ekg', 'dataspace', 'ai-health', 'claude-prep', 'honesty-decoder', 'roaster', 'workout-plans', 'memes'];

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function builder(now: number) {
  const events: LabEvent[] = [];
  let n = 0;
  const ev = (session: string, lab: string, type: string, at: number, data: LabEvent['data'] = null) =>
    events.push({ v: EVENT_V, id: `fx-${++n}`, t: now - at, lab, type, data, session });
  return { events, ev };
}

function returning(now: number, withDue: boolean): { events: LabEvent[]; progress: ProgressRecord[]; meta: Record<string, Json> } {
  const { events, ev } = builder(now);
  // four days ago: the hub, then Black Hole (which does not record itself, so only the handoff exists)
  ev('fx-s1', 'hub', 'lab.open', 4 * DAY, { path: '/labs/index.html' });
  ev('fx-s1', 'hub', 'lab.handoff', 4 * DAY - 3 * MIN, { to: 'black-hole', via: 'card' });
  ev('fx-s1', 'hub', 'lab.leave', 4 * DAY - 3 * MIN, { visibleMs: 3 * MIN, totalMs: 3 * MIN, final: true });
  if (withDue) {
    // yesterday: Claude Prep from the hub
    ev('fx-s2', 'hub', 'lab.open', DAY + 20 * MIN, { path: '/labs/index.html' });
    ev('fx-s2', 'hub', 'lab.handoff', DAY + 19 * MIN, { to: 'claude-prep', via: 'card' });
    ev('fx-s2', 'hub', 'lab.leave', DAY + 19 * MIN, { visibleMs: 50_000, totalMs: 60_000, final: true });
  }
  // two hours ago: the hub, then Heptapod, which records its own session
  ev('fx-s3', 'hub', 'lab.open', 2 * HOUR + 2 * MIN, { path: '/labs/index.html' });
  ev('fx-s3', 'hub', 'lab.handoff', 2 * HOUR + MIN, { to: 'heptapod', via: 'card' });
  ev('fx-s3', 'hub', 'lab.leave', 2 * HOUR + MIN, { visibleMs: 40_000, totalMs: 60_000, final: true });
  ev('fx-s4', 'heptapod', 'lab.open', 2 * HOUR + MIN - 2000, { path: '/labs/heptapod.html' });
  ev('fx-s4', 'heptapod', 'lab.action', 2 * HOUR - 4 * MIN, { kind: 'encode' });
  ev('fx-s4', 'heptapod', 'lab.outcome', 2 * HOUR - 12 * MIN, { kind: 'decoded', logograms: 4 });
  ev('fx-s4', 'heptapod', 'lab.leave', 2 * HOUR - 20 * MIN, { visibleMs: 14 * MIN, totalMs: 21 * MIN, final: true });

  const progress: ProgressRecord[] = [
    { lab: 'hub', v: 1, data: { known: KNOWN_BEFORE }, updated: now - 2 * HOUR, resume: null, due: [], finished: false },
    { lab: 'heptapod', v: 1, data: { logogram: 4, of: 9 }, updated: now - 2 * HOUR + 20 * MIN,
      resume: { url: '/labs/heptapod.html', label: 'logogram 4 of 9', t: now - 2 * HOUR + 20 * MIN }, due: [], finished: false },
  ];
  if (withDue) {
    const due: DueItem[] = [];
    for (let i = 0; i < 12; i++) due.push({ id: `card-${i + 1}`, label: `review card ${i + 1}`, at: now - 3 * DAY + i * 6 * HOUR });
    for (let i = 0; i < 3; i++) due.push({ id: `card-${i + 13}`, label: `review card ${i + 13}`, at: now + (i + 1) * DAY });
    progress.push({ lab: 'claude-prep', v: 1, data: { mocks: 2, best: 0.74 }, updated: now - DAY, resume: null, due, finished: false });
  }
  return { events, progress, meta: { 'visit.last': { t: now - 2 * HOUR + 20 * MIN, lab: 'heptapod' } } };
}

/** An install id no browser will ever draw: the fixture's stand-in. */
const FIXTURE_INSTALL = '00000000-0000-4000-8000-000000000000';

/** The returning visitor's record, with the sharing choice they made on their first visit (or none yet). */
function withChoice(now: number, withDue: boolean, choice: 'granted' | 'denied' | 'unset', more: Record<string, Json> = {}): Partial<{ events: LabEvent[]; progress: ProgressRecord[]; meta: Record<string, Json> }> {
  const seed = returning(now, withDue);
  const meta: Record<string, Json> = { ...seed.meta, ...more };
  if (choice !== 'unset') meta[CONSENT_KEY] = { state: choice, t: now - 4 * DAY + MIN, policy: CONSENT_POLICY };
  if (choice === 'granted') meta[INSTALL_KEY] = FIXTURE_INSTALL;
  return { ...seed, meta };
}

/** A memory store seeded for the named fixture. Never touches IndexedDB. */
export function fixtureStore(name: FixtureName, now: number): Store {
  const seeded = (seed: ReturnType<typeof withChoice>) => memoryStore({ persistent: true, fixture: name, note: '', seed });
  switch (name) {
    case 'first-visit':
      return memoryStore({ persistent: true, fixture: name, note: '' });
    case 'storage-unavailable':
      return memoryStore({ persistent: false, fixture: name, note: 'storage is blocked in this window, so nothing is kept after the tab closes' });
    case 'returning':
    case 'sharing-off':
      return seeded(withChoice(now, false, 'denied'));
    case 'returning-due':
      return seeded(withChoice(now, true, 'denied'));
    case 'consent':
      return seeded(withChoice(now, false, 'unset'));
    case 'sharing-on':
      return seeded(withChoice(now, false, 'granted'));
    case 'recording-off':
      return seeded(withChoice(now, false, 'denied', { recording: { on: false, t: now - DAY } }));
  }
}
