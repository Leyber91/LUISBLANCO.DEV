import type { Tracker } from './events.js';
import type { Clock } from './util.js';
export interface SessionClock {
    readonly start: number;
    visibleMs(): number;
    totalMs(): number;
}
export interface SessionLifecycle extends SessionClock {
    /** settles once lab.open is written (or refused) */
    readonly opened: Promise<void>;
    /** record lab.leave now (also called by the page events) */
    leave(final: boolean): Promise<void>;
    /** remove the listeners */
    stop(): void;
}
export declare function startSession(tracker: Tracker, lab: string, opts?: {
    now?: Clock;
    doc?: Document;
    win?: Window;
}): SessionLifecycle;
