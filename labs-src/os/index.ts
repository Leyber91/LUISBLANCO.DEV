/* ============================================================
   labs-src/os/index.ts — Labs OS, the platform layer every lab of
   luisblanco.dev/labs shares: saved progress, an activity log,
   "welcome back / what's next", consent and data rights, and
   one lifecycle for animated scenes.

   Local-first: every record stays in the visitor's browser
   (IndexedDB "labs"; memory when storage is blocked), and the
   site works fully without a backend. With the visitor's consent,
   and only then, usage events also go to the labs backend
   (transport.ts) so the author can see which labs are used: after
   "Allow", on each page load, and as the page is left. A failed
   send is silent and offered again on the next load. Turning
   recording off stops both the record and the sending.

   Usage, in a lab's module script:

     import { LabsOS } from './assets/js/os/index.js';
     const os = await LabsOS.init({ lab: 'heptapod' });   // idempotent
     os.register('heptapod.decoded', { cls: 'outcome' });
     os.track('heptapod.decoded', { logograms: 4 });
     await os.progress.set({ logogram: 4 }, { v: 1 });
     await os.progress.setResume('heptapod.html?at=4', 'logogram 4 of 9');
     const saved = await os.progress.get({ v: 2, migrate: (d, from) => ... });
     os.mountScene(canvas, ({ reducedMotion }) => ({ destroy, pause, resume }));

   init records lab.open and, whenever the page is hidden or
   left, lab.leave with its visible and total time, unless the
   visitor has turned recording off (os.recording.set(false)):
   then nothing new is logged on any lab page until they turn it
   on again.

   ?os-fixture=<name> on the page URL swaps in a seeded memory
   store (fixtures.ts), never opens the real one and never
   reaches the network.
   ============================================================ */

import { OS_CONFIG } from './config.js';
import type { OSConfig } from './config.js';
import { Consent, CONSENT_KEY, INSTALL_KEY, Outbox } from './consent.js';
import type { EraseResult } from './consent.js';
import { Registry, Tracker } from './events.js';
import type { EventSpec, TrackResult } from './events.js';
import type { EventClass, Json, DueItem, ProgressRecord } from './types.js';
import { fixtureStore, isFixture } from './fixtures.js';
import { deleteAll, exportAll, summary } from './privacy.js';
import type { DeleteResult, ExportFile, Summary } from './privacy.js';
import { Progress } from './progress.js';
import type { GetOptions } from './progress.js';
import { Resume } from './resume.js';
import { mountScene } from './scene.js';
import { startSession } from './session.js';
import type { SessionLifecycle } from './session.js';
import { memoryStore, openStore } from './store.js';
import { loadRecording, RECORDING_KEY, saveRecording } from './recording.js';
import type { RecordingState } from './recording.js';
import type { StorageKind, Store } from './store.js';
import { isLabId, randomId, systemClock } from './util.js';
import type { Clock } from './util.js';
import { fixtureTransport } from './transport.js';
import { mountConsentBanner } from './ui.js';

export interface InitOptions {
  readonly lab: string;
  /** IndexedDB factory; null forces memory. Defaults to the browser's. */
  readonly idb?: IDBFactory | null;
  /** a fixture name; undefined reads ?os-fixture= from the page URL; null ignores the URL */
  readonly fixture?: string | null;
  readonly now?: Clock;
  readonly config?: Partial<OSConfig>;
  /** record lab.open and lab.leave (default true) */
  readonly lifecycle?: boolean;
  /** mount the consent banner when the config allows it (default true) */
  readonly ui?: boolean;
  /** the log's bound (tests); defaults to MAX_EVENTS */
  readonly maxEvents?: number;
}

/** What "delete everything" did here, and to the copy on the backend. */
export interface DeleteOutcome extends DeleteResult {
  readonly remote: EraseResult;
}

export interface StorageInfo {
  readonly kind: StorageKind;
  readonly persistent: boolean;
  readonly note: string;
  readonly fixture: string | null;
}

/** The lab's own progress, bound to its id; `of` reads any lab's record. */
export interface BoundProgress {
  get<T = Json>(opts?: GetOptions<T>): Promise<ProgressRecord | null>;
  set(data: unknown, opts?: { v?: number }): Promise<ProgressRecord>;
  setResume(url: string, label: string): Promise<ProgressRecord>;
  clearResume(): Promise<ProgressRecord>;
  setDue(items: readonly DueItem[]): Promise<ProgressRecord>;
  finish(finished?: boolean): Promise<ProgressRecord>;
  of(lab: string): Promise<ProgressRecord | null>;
  all(): Promise<ProgressRecord[]>;
}

export interface LabsOSInstance {
  readonly lab: string;
  readonly session: string;
  readonly storage: StorageInfo;
  /** the visit before this page load, on any lab page; null on a first visit */
  readonly previousVisit: { readonly t: number; readonly lab: string } | null;
  readonly config: OSConfig;
  readonly registry: Registry;
  readonly progress: BoundProgress;
  readonly resume: Resume;
  readonly consent: Consent;
  readonly outbox: Outbox;
  readonly privacy: {
    summary(): Promise<Summary>;
    exportAll(): Promise<ExportFile>;
    /**
     * Erase every record here, and the rows this browser sent to the backend, and stop recording and sending on
     * this page. The choices that say "off" survive (recording off, sharing refused), so deleting never switches
     * anything on; if the backend could not be reached, the install id survives too, so the erase can be retried.
     */
    deleteAll(): Promise<DeleteOutcome>;
  };
  /** sending usage events with the visitor's consent; the choice itself is `consent` */
  readonly sharing: {
    /** false where nothing can be sent: no backend is configured, or this window keeps nothing */
    readonly available: boolean;
    /** true once sending was allowed in this browser, so the backend may hold rows of it */
    everOn(): Promise<boolean>;
    /** erase this browser's rows on the backend and keep the record here */
    erase(): Promise<EraseResult>;
  };
  /** the visitor's switch for the record */
  readonly recording: {
    readonly on: boolean;
    /** when it was last switched, or null */
    readonly since: number | null;
    set(on: boolean): Promise<RecordingState>;
    onChange(fn: (s: RecordingState) => void): () => void;
  };
  readonly mountScene: typeof mountScene;
  /** true once the visitor deleted their record on this page */
  readonly halted: boolean;
  register(type: string, spec: { cls: EventClass; throttleMs?: number }): void;
  spec(type: string): EventSpec | undefined;
  /** record an event for this lab */
  track(type: string, data?: object | null): Promise<TrackResult>;
  /** a callback for when the visitor deletes their record */
  onDeleted(fn: () => void): () => void;
  /** remove listeners and close the store (tests; a page never needs it) */
  close(): void;
}

function fixtureFromUrl(): string | null {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('os-fixture'); } catch { return null; }
}

async function pickStore(opts: InitOptions, now: number): Promise<Store> {
  const name = opts.fixture === undefined ? fixtureFromUrl() : opts.fixture;
  if (name) {
    if (isFixture(name)) return fixtureStore(name, now);
    return memoryStore({ fixture: name, note: `"${name}" is not a fixture; this page runs on an empty memory store` });
  }
  return openStore({
    ...(opts.idb === undefined ? {} : { idb: opts.idb }),
    ...(opts.maxEvents === undefined ? {} : { maxEvents: opts.maxEvents }),
  });
}

async function create(opts: InitOptions): Promise<LabsOSInstance> {
  const lab = opts.lab;
  const now = opts.now ?? systemClock;
  const store = await pickStore(opts, now());
  const base: OSConfig = { ...OS_CONFIG, ...opts.config };
  const config: OSConfig = Object.freeze({
    ...base,
    // a fixture shows what the live page shows and reaches nothing: its sends and erases go nowhere
    ...(store.fixture !== null && opts.config?.transport === undefined && base.transport ? { transport: fixtureTransport() } : {}),
  });
  const session = randomId();
  const registry = new Registry();
  const progress = new Progress(store, now);
  const consent = new Consent(store, now);
  const resume = new Resume(store, session, now);
  const deletedFns = new Set<() => void>();
  const recordingFns = new Set<(s: RecordingState) => void>();
  let recording = await loadRecording(store);
  // A window that keeps nothing could not remember the answer and would draw a new install id on every load,
  // so it is never asked and never sends.
  const outbox = new Outbox({ store, consent, transport: store.persistent ? config.transport : null, recording: () => recording.on, now });
  const tracker = new Tracker({ store, registry, session, now, sink: outbox });
  tracker.setRecording(recording.on);

  let previousVisit: LabsOSInstance['previousVisit'] = null;
  try {
    const raw = await store.getMeta('visit.last');
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw['t'] === 'number' && typeof raw['lab'] === 'string') {
      previousVisit = { t: raw['t'], lab: raw['lab'] };
    }
    if (recording.on) await store.setMeta('visit.last', { t: now(), lab });
  } catch { /* the store failed; the page still works without a last visit */ }

  let life: SessionLifecycle | null = null;
  if (opts.lifecycle !== false) {
    life = startSession(tracker, lab, { now });
    await life.opened;
  }

  // Asked only where an answer means something: a backend exists, the window can remember, and there is a
  // record to send (a visitor who turned recording off is not asked to share it).
  let banner: { destroy(): void } | null = null;
  if (opts.ui !== false && config.consentUi && outbox.transport && recording.on && typeof document !== 'undefined') {
    const c = await consent.get();
    if (c.state === 'unset') banner = mountConsentBanner(document.body, consent, config);
  }

  // The three moments that send: the visitor allows it, a page loads, a page is left. The exit listener is added
  // after the session's own, so the session's last lab.leave is already in the outbox when it runs.
  const offConsent = consent.onChange((r) => { if (r.state === 'granted') void outbox.flush(); });
  const onExit = (): void => { outbox.flushOnExit(); };
  const win = typeof window !== 'undefined' ? window : undefined;
  win?.addEventListener('pagehide', onExit);
  void outbox.flush();

  const os: LabsOSInstance = {
    lab, session, config, registry, resume, consent, outbox, mountScene,
    storage: { kind: store.kind, persistent: store.persistent, note: store.note, fixture: store.fixture },
    previousVisit,
    get halted() { return tracker.isHalted; },
    progress: {
      get: (o) => progress.get(lab, o),
      set: (data, o) => progress.set(lab, data, o),
      setResume: (url, label) => progress.setResume(lab, url, label),
      clearResume: () => progress.clearResume(lab),
      setDue: (items) => progress.setDue(lab, items),
      finish: (f) => progress.finish(lab, f),
      of: (other) => progress.get(other),
      all: () => progress.all(),
    },
    privacy: {
      summary: () => summary(store),
      exportAll: () => exportAll(store, now),
      async deleteAll() {
        tracker.halt();
        life?.stop();
        outbox.stop();
        const remote = await outbox.erase();         // first: it needs the install id the local erase removes
        const c = await consent.get().catch(() => null);
        const keep = [
          ...(recording.on ? [] : [RECORDING_KEY]),
          ...(c?.state === 'denied' ? [CONSENT_KEY] : []),
          ...(remote.state === 'failed' ? [INSTALL_KEY] : []),
        ];
        const r = await deleteAll(store, { keep });
        deletedFns.forEach((fn) => { try { fn(); } catch { /* the listener's problem */ } });
        return { ...r, remote };
      },
    },
    sharing: {
      available: outbox.transport !== null,
      everOn: async () => (await outbox.installed()) !== null,
      erase: () => outbox.erase(),
    },
    recording: {
      get on() { return recording.on; },
      get since() { return recording.t; },
      async set(on: boolean) {
        recording = await saveRecording(store, on, now());
        tracker.setRecording(on);
        recordingFns.forEach((fn) => { try { fn(recording); } catch { /* the listener's problem */ } });
        return recording;
      },
      onChange(fn) { recordingFns.add(fn); return () => { recordingFns.delete(fn); }; },
    },
    register: (type, spec) => registry.register(type, spec),
    spec: (type) => registry.get(type),
    track: (type, data) => tracker.track(lab, type, data),
    onDeleted(fn) { deletedFns.add(fn); return () => { deletedFns.delete(fn); }; },
    close() {
      life?.stop();
      banner?.destroy();
      offConsent();
      win?.removeEventListener('pagehide', onExit);
      outbox.stop();
      outbox.close();
      store.close();
    },
  };
  return os;
}

let current: { lab: string; promise: Promise<LabsOSInstance> } | null = null;
let ready: LabsOSInstance | null = null;

export const LabsOS = {
  /**
   * Start Labs OS for this page. Idempotent: a second call for the same
   * lab returns the same instance; a call for a different lab rejects,
   * because one page is one lab.
   */
  init(opts: InitOptions): Promise<LabsOSInstance> {
    if (!isLabId(opts?.lab)) return Promise.reject(new Error(`LabsOS.init needs a lab id, got "${String(opts?.lab)}"`));
    if (current) {
      return current.lab === opts.lab
        ? current.promise
        : Promise.reject(new Error(`LabsOS already runs for "${current.lab}" on this page`));
    }
    const promise = create(opts).then((os) => { ready = os; return os; });
    current = { lab: opts.lab, promise };
    return promise;
  },
  /** the running instance, once init has resolved */
  get instance(): LabsOSInstance | null { return ready; },
  /** forget the running instance (tests) */
  reset(): void { ready?.close(); ready = null; current = null; },
};

export default LabsOS;

export { OS_CONFIG } from './config.js';
export type { OSConfig } from './config.js';
export { Registry, Tracker, BUILTIN_EVENTS, MAX_DATA_BYTES } from './events.js';
export type { EventSpec, TrackResult, TrackRefusal } from './events.js';
export { Progress, MAX_PROGRESS_BYTES } from './progress.js';
export { Resume, visitsFrom, suggest, describeVisit } from './resume.js';
export type { Visit, CatalogueEntry, Suggestion, SuggestionKind } from './resume.js';
export { Consent, Outbox, CONSENT_POLICY, BATCH_SIZE } from './consent.js';
export type { ConsentRecord, ConsentState, Transport, OutboundBatch, SendOptions, FlushResult, FlushReason, EraseResult, EraseOutcome } from './consent.js';
export { BACKEND, supabaseTransport, fixtureTransport, sanitizeData, toRow } from './transport.js';
export type { UsageRow, SupabaseTransportOptions } from './transport.js';
export { exportAll, deleteAll, summary } from './privacy.js';
export type { ExportFile, DeleteResult, Summary } from './privacy.js';
export { mountScene, sceneCount } from './scene.js';
export type { SceneHandle, SceneContext, SceneFactory, MountedScene } from './scene.js';
export { openStore, memoryStore, DB_NAME, DB_VERSION, MIGRATIONS, MAX_EVENTS, DROPPED_KEY } from './store.js';
export type { Store, StorageKind, Migration, DroppedSummary } from './store.js';
export { RECORDING_KEY } from './recording.js';
export type { RecordingState } from './recording.js';
export { FIXTURES, fixtureStore } from './fixtures.js';
export { ago, duration, dayMonth } from './util.js';
export type * from './types.js';
