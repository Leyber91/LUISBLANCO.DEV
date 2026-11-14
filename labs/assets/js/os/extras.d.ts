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
export declare const EXTRA_STORES: readonly ExtraStore[];
/** The browser's localStorage, or null where there is none or it is blocked. */
export declare function browserStorage(): KeyValue | null;
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
export declare function findExtras(ls: KeyValue | null, stores?: readonly ExtraStore[]): ExtraFound[];
export interface ExtraExport {
    readonly id: string;
    readonly lab: string | null;
    readonly name: string;
    readonly entries: {
        readonly key: string;
        readonly value: Json;
    }[];
    /** the fields left out of every entry, by name */
    readonly withheld: string[];
}
export declare const WITHHELD = "left out of the export";
/**
 * The content of every store this page manages, as plain JSON. A stored value that is not JSON is exported as
 * its text. A store with secret fields whose value is not a JSON object is left out whole, since the secret
 * cannot be told from the rest.
 */
export declare function exportExtras(ls: KeyValue | null, stores?: readonly ExtraStore[]): ExtraExport[];
export interface ExtraErase {
    /** keys removed */
    readonly removed: number;
    /** keys this page manages that are still there after the erase (a blocked store, another tab writing) */
    readonly remaining: number;
    /** stores that hold something and are not managed here, left as they were */
    readonly left: ExtraFound[];
}
/** Remove every key of every store this page manages, then look again to confirm. */
export declare function eraseExtras(ls: KeyValue | null, stores?: readonly ExtraStore[]): ExtraErase;
