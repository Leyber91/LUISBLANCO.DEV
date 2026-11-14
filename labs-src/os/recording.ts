/* ============================================================
   labs-src/os/recording.ts — the visitor's switch for the record.

   On by default. Turned off, Labs OS logs nothing new (no events,
   no visit time, no hub catalogue snapshot) until the visitor
   turns it on again; what was logged before stays until they
   delete it. The choice lives in meta under "recording" and
   survives "delete everything", so deleting the record never
   turns recording back on behind the visitor's back.
   ============================================================ */

import type { Json } from './types.js';
import type { Store } from './store.js';

export const RECORDING_KEY = 'recording';

export interface RecordingState {
  readonly on: boolean;
  /** when the visitor last switched it; null while it has never been switched */
  readonly t: number | null;
}

export const RECORDING_DEFAULT: RecordingState = Object.freeze({ on: true, t: null });

export function readRecording(raw: Json | undefined): RecordingState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return RECORDING_DEFAULT;
  const on = raw['on'], t = raw['t'];
  if (typeof on !== 'boolean') return RECORDING_DEFAULT;
  return { on, t: typeof t === 'number' ? t : null };
}

export async function loadRecording(store: Store): Promise<RecordingState> {
  try { return readRecording(await store.getMeta(RECORDING_KEY)); } catch { return RECORDING_DEFAULT; }
}

export async function saveRecording(store: Store, on: boolean, t: number): Promise<RecordingState> {
  const state: RecordingState = { on, t };
  await store.setMeta(RECORDING_KEY, { on, t });
  return state;
}
