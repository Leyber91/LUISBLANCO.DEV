/* ============================================================
   labs-src/os/events.ts — the activity log's front door.

   Every event type is registered with a class (session, action,
   outcome, error) and a throttle. track(lab, type, data) checks
   the lab id, the type and the data (a plain JSON object of at
   most 2 KB), drops a repeat that arrives inside the type's
   throttle window, and appends

     { v, id, t, lab, type, data, session }

   to the store. It never throws: a refusal comes back as
   { ok: false, reason } so a lab's own code keeps running.
   While the visitor has turned recording off (recording.ts),
   every call returns { ok: false, reason: 'recording off' } and
   appends nothing.

   Built-in types (labs register their own, under their own
   prefix, for example "heptapod.decoded"):

     lab.open      a page of the lab was opened
     lab.leave     the page was hidden or left; carries visibleMs
                   and totalMs for the session so far, so the last
                   one of a session is its total
     lab.action    something the visitor did
     lab.outcome   something the lab computed or the visitor finished
     lab.error     something failed (throttled: an error loop must
                   not fill the log)
     lab.handoff   the visitor followed a link to another lab;
                   data.to is that lab's id
   ============================================================ */
import { EVENT_V } from './types.js';
import { byteLength, isLabId, randomId, systemClock, toJsonObject } from './util.js';
export const MAX_DATA_BYTES = 2048;
export const BUILTIN_EVENTS = Object.freeze({
    'lab.open': { cls: 'session', throttleMs: 0 },
    'lab.leave': { cls: 'session', throttleMs: 0 },
    'lab.action': { cls: 'action', throttleMs: 250 },
    'lab.outcome': { cls: 'outcome', throttleMs: 0 },
    'lab.error': { cls: 'error', throttleMs: 1000 },
    'lab.handoff': { cls: 'action', throttleMs: 0 },
});
const CLASSES = ['session', 'action', 'outcome', 'error'];
const TYPE_NAME = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
export class Registry {
    specs = new Map(Object.entries(BUILTIN_EVENTS));
    /**
     * Add a lab's own event type. Throws on a malformed name, a reserved
     * "lab." name, a type already registered or a bad spec: these are
     * mistakes in the lab's code, found the first time it runs.
     */
    register(type, spec) {
        if (!TYPE_NAME.test(type))
            throw new Error(`event type "${type}" must look like "mylab.something"`);
        if (type.startsWith('lab.'))
            throw new Error(`event type "${type}" uses the reserved "lab." prefix`);
        if (this.specs.has(type))
            throw new Error(`event type "${type}" is already registered`);
        if (!CLASSES.includes(spec.cls))
            throw new Error(`event type "${type}" has unknown class "${String(spec.cls)}"`);
        const throttleMs = spec.throttleMs ?? 0;
        if (!Number.isFinite(throttleMs) || throttleMs < 0)
            throw new Error(`event type "${type}" has a bad throttle`);
        this.specs.set(type, Object.freeze({ cls: spec.cls, throttleMs }));
    }
    get(type) { return this.specs.get(type); }
    has(type) { return this.specs.has(type); }
    types() { return [...this.specs.keys()]; }
}
const refuse = (reason, detail) => ({ ok: false, reason, detail });
export class Tracker {
    opts;
    last = new Map();
    halted = false;
    recordingOn = true;
    now;
    id;
    constructor(opts) {
        this.opts = opts;
        this.now = opts.now ?? systemClock;
        this.id = opts.id ?? randomId;
    }
    get session() { return this.opts.session; }
    /** Stop recording for the rest of this page (after the visitor deletes their record). */
    halt() { this.halted = true; }
    get isHalted() { return this.halted; }
    /** Follow the visitor's recording switch (the facade keeps it in step with meta). */
    setRecording(on) { this.recordingOn = on; }
    get recording() { return this.recordingOn; }
    async track(lab, type, data) {
        if (this.halted)
            return refuse('halted', 'recording stopped on this page');
        if (!this.recordingOn)
            return refuse('recording off', 'the visitor turned recording off');
        if (!isLabId(lab))
            return refuse('bad-lab', `"${String(lab)}" is not a lab id`);
        const spec = this.opts.registry.get(type);
        if (!spec)
            return refuse('unknown-type', `"${String(type)}" is not registered`);
        let payload = null;
        if (data !== undefined && data !== null) {
            const j = toJsonObject(data);
            if (!j.ok)
                return refuse('bad-data', j.why);
            const bytes = byteLength(j.json);
            if (bytes > MAX_DATA_BYTES)
                return refuse('too-large', `${bytes} bytes; the cap is ${MAX_DATA_BYTES}`);
            payload = j.data;
        }
        const t = this.now();
        const key = `${lab}\u0000${type}`;
        const prev = this.last.get(key);
        if (spec.throttleMs > 0 && prev !== undefined && t - prev < spec.throttleMs) {
            return refuse('throttled', `${type} within ${spec.throttleMs} ms of the last one`);
        }
        this.last.set(key, t); // set before the write, so a burst in the same tick is throttled too
        const event = { v: EVENT_V, id: this.id(), t, lab, type, data: payload, session: this.opts.session };
        try {
            await this.opts.store.append(event);
        }
        catch (e) {
            return refuse('store-failed', e instanceof Error ? e.message : String(e));
        }
        return { ok: true, event };
    }
}
