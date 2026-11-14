/* ============================================================
   labs-src/os/extras.ts — what the labs keep in this browser beside
   the record: a model key the visitor entered, worlds, traces and
   histories a lab saved in localStorage before the platform existed.

   The privacy page promises to show, export and erase what the labs
   keep. It runs without any lab's code, so it cannot ask a lab what
   it stored: the stores are listed here, by key. A lab that keeps
   something new in the browser keeps it in Labs OS (progress.ts) or
   adds its key to this list, and labs/assets/js/kit/stores.test.mjs
   fails when a lab touches the browser's storage and is not named.

   A store marked `erase: false` is named and counted and otherwise
   left alone: Claude Prep keeps a study record that a button on
   another page must not destroy.

   An export never carries a secret the visitor typed (a model key):
   the entry says a value was there and leaves it out, because an
   export is a file that lands in a downloads folder.
   ============================================================ */

import type { Json } from './types.js';

/** The part of the Web Storage interface this file uses, so a test can hand it a plain object. */
export interface KeyValue {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface ExtraStore {
  readonly id: string;
  /** the hub id of the lab that owns it, or null when every lab shares it */
  readonly lab: string | null;
  /** what it is, as the "Your data" panel and the privacy page print it */
  readonly name: string;
  /** exact localStorage keys */
  readonly keys: readonly string[];
  /** localStorage key prefixes */
  readonly prefixes: readonly string[];
  /** fields of a stored JSON object that an export leaves out */
  readonly secret: readonly string[];
  /** false: counted and named, never exported or erased from here */
  readonly managedHere: boolean;
}

export const EXTRA_STORES: readonly ExtraStore[] = Object.freeze([
  { id: 'model-key', lab: null, name: 'your own model key, with its address and model', keys: ['lb.llm.ownkey'], prefixes: [], secret: ['key'], managedHere: true },
  { id: 'model-wait', lab: null, name: 'when the public model route may be asked again', keys: ['lb.llm.pollReadyAt'], prefixes: [], secret: [], managedHere: true },
  { id: 'altverse-worlds', lab: 'alt-reality', name: 'worlds you saved in Alternate Reality', keys: ['altverse:index'], prefixes: ['altverse:world:'], secret: [], managedHere: true },
  { id: 'token-ekg-traces', lab: 'token-ekg', name: 'traces you saved in Token EKG, with the prompts you typed', keys: ['lb.tokenekg.traces.v1'], prefixes: [], secret: [], managedHere: true },
  { id: 'trending-history', lab: 'trends', name: 'the scans Trending kept', keys: ['lb.trending.history'], prefixes: [], secret: [], managedHere: true },
  { id: 'honesty-route', lab: 'honesty-decoder', name: 'the model route the Honesty Decoder last used', keys: ['lb.hd.route'], prefixes: [], secret: [], managedHere: true },
  { id: 'exomania-saved', lab: 'exomania', name: 'planets you bookmarked in Exomania', keys: ['exo:saved'], prefixes: [], secret: [], managedHere: true },
  { id: 'claude-prep', lab: 'claude-prep', name: 'Claude Prep\'s own study record, settings and connection', keys: [], prefixes: ['b720.', 'b720-'], secret: [], managedHere: false },
] satisfies ExtraStore[]);

/** The browser's localStorage, or null where there is none or it is blocked. */
export function browserStorage(): KeyValue | null {
  try {
    const ls = (globalThis as { localStorage?: KeyValue }).localStorage;
    if (!ls) return null;
    void ls.length;                                  // a blocked store throws on first use
    return ls;
  } catch { return null; }
}

function keysOf(ls: KeyValue, s: ExtraStore): string[] {
  const out: string[] = [];
  let n = 0;
  try { n = ls.length; } catch { return out; }
  for (let i = 0; i < n; i++) {
    let k: string | null = null;
    try { k = ls.key(i); } catch { k = null; }
    if (k === null) continue;
    if (s.keys.includes(k) || s.prefixes.some((p) => k.startsWith(p))) out.push(k);
  }
  return out.sort();
}

function read(ls: KeyValue, key: string): string | null {
  try { return ls.getItem(key); } catch { return null; }
}

export interface ExtraFound {
  readonly id: string;
  readonly lab: string | null;
  readonly name: string;
  /** how many keys hold something */
  readonly entries: number;
  /** UTF-16 code units stored, keys and values; a size to print, not an exact byte count */
  readonly chars: number;
  readonly managedHere: boolean;
}

/** The listed stores that hold something, in the list's order. */
export function findExtras(ls: KeyValue | null, stores: readonly ExtraStore[] = EXTRA_STORES): ExtraFound[] {
  if (!ls) return [];
  const out: ExtraFound[] = [];
  for (const s of stores) {
    const keys = keysOf(ls, s);
    if (!keys.length) continue;
    const chars = keys.reduce((sum, k) => sum + k.length + (read(ls, k)?.length ?? 0), 0);
    out.push({ id: s.id, lab: s.lab, name: s.name, entries: keys.length, chars, managedHere: s.managedHere });
  }
  return out;
}

export interface ExtraExport {
  readonly id: string;
  readonly lab: string | null;
  readonly name: string;
  readonly entries: { readonly key: string; readonly value: Json }[];
  /** the fields left out of every entry, by name */
  readonly withheld: string[];
}

export const WITHHELD = 'left out of the export';

function parse(text: string): Json {
  try { return JSON.parse(text) as Json; } catch { return text; }
}

function withhold(value: Json, secret: readonly string[]): Json {
  if (!secret.length || value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: { [key: string]: Json } = {};
  for (const [k, v] of Object.entries(value)) out[k] = secret.includes(k) ? WITHHELD : v;
  return out;
}

/**
 * The content of every store this page manages, as plain JSON. A stored value that is not JSON is exported as
 * its text. A store with secret fields whose value is not a JSON object is left out whole, since the secret
 * cannot be told from the rest.
 */
export function exportExtras(ls: KeyValue | null, stores: readonly ExtraStore[] = EXTRA_STORES): ExtraExport[] {
  if (!ls) return [];
  const out: ExtraExport[] = [];
  for (const s of stores) {
    if (!s.managedHere) continue;
    const entries: { key: string; value: Json }[] = [];
    for (const k of keysOf(ls, s)) {
      const raw = read(ls, k);
      if (raw === null) continue;
      const v = parse(raw);
      const plain = v !== null && typeof v === 'object' && !Array.isArray(v);
      entries.push({ key: k, value: s.secret.length && !plain ? WITHHELD : withhold(v, s.secret) });
    }
    if (entries.length) out.push({ id: s.id, lab: s.lab, name: s.name, entries, withheld: [...s.secret] });
  }
  return out;
}

export interface ExtraErase {
  /** keys removed */
  readonly removed: number;
  /** keys this page manages that are still there after the erase (a blocked store, another tab writing) */
  readonly remaining: number;
  /** stores that hold something and are not managed here, left as they were */
  readonly left: ExtraFound[];
}

/** Remove every key of every store this page manages, then look again to confirm. */
export function eraseExtras(ls: KeyValue | null, stores: readonly ExtraStore[] = EXTRA_STORES): ExtraErase {
  if (!ls) return { removed: 0, remaining: 0, left: [] };
  const held = (found: ExtraFound[]): number => found.filter((f) => f.managedHere).reduce((n, f) => n + f.entries, 0);
  const before = held(findExtras(ls, stores));
  for (const s of stores) {
    if (!s.managedHere) continue;
    for (const k of keysOf(ls, s)) {
      try { ls.removeItem(k); } catch { /* still there: counted below as remaining */ }
    }
  }
  const after = findExtras(ls, stores);
  const remaining = held(after);
  return { removed: before - remaining, remaining, left: after.filter((f) => !f.managedHere) };
}
