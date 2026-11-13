/* ============================================================
   labs-src/os/types.ts — the record shapes Labs OS stores.

   Everything here is plain JSON so a record can be exported,
   inspected by the visitor and, later, sent by a transport
   without conversion.
   ============================================================ */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** The four classes an event type belongs to. */
export type EventClass = 'session' | 'action' | 'outcome' | 'error';

/** Version of the event record shape; bumped when a field changes meaning. */
export const EVENT_V = 1;

/** One line of the append-only activity log. */
export interface LabEvent {
  readonly v: number;
  readonly id: string;
  /** milliseconds since the epoch, from the page clock */
  readonly t: number;
  readonly lab: string;
  readonly type: string;
  readonly data: JsonObject | null;
  /** one id per page load */
  readonly session: string;
}

/** Where "continue" leads for a lab: a same-origin path and a short label. */
export interface ResumePoint {
  readonly url: string;
  readonly label: string;
  readonly t: number;
}

/** Something a lab reports as waiting for the visitor (a review card, a scheduled session). */
export interface DueItem {
  readonly id: string;
  readonly label: string;
  /** when it falls due, ms since the epoch */
  readonly at: number;
}

/** One lab's saved progress. `v` is the lab's own schema version for `data`. */
export interface ProgressRecord {
  readonly lab: string;
  readonly v: number;
  readonly data: Json;
  readonly updated: number;
  readonly resume: ResumePoint | null;
  readonly due: readonly DueItem[];
  readonly finished: boolean;
}

/** Every record the store holds, as exported. */
export interface StoreDump {
  readonly events: LabEvent[];
  readonly progress: ProgressRecord[];
  readonly meta: Record<string, Json>;
}

export interface StoreCounts {
  readonly events: number;
  readonly progress: number;
  readonly meta: number;
}
