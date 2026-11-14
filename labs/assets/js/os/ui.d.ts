import type { OSConfig } from './config.js';
import type { Consent, ConsentRecord } from './consent.js';
import type { LabsOSInstance, StorageInfo } from './index.js';
import type { Suggestion } from './resume.js';
export interface PlateLast {
    readonly title: string;
    readonly href: string;
    /** "2 hours ago · 14 min in view" */
    readonly when: string;
    /** the lab's own resume label, when it set one */
    readonly resumeLabel: string | null;
}
export interface ResumePlateInput {
    readonly last: PlateLast | null;
    readonly next: readonly Suggestion[];
    /** the plate's letter in the page's sequence */
    readonly plate?: string;
    readonly persistent: boolean;
    /** what the record holds, for the plate's title block ("14 events since 9 Nov") */
    readonly record?: string | null;
    /** where "Your data" opens (default #your-data) */
    readonly dataHref?: string;
    /** the visitor's recording switch (default on) */
    readonly recording?: boolean;
    /** true while usage events are sent with the visitor's consent */
    readonly sharing?: boolean;
}
export declare function resumePlate(input: ResumePlateInput): HTMLElement;
export declare function storageStamp(s: StorageInfo, recording?: boolean, sharing?: boolean): HTMLElement;
export declare function fixtureStamp(s: StorageInfo): HTMLElement | null;
/** The sharing choice in words, with what it means right now. */
export declare function sharingWords(r: ConsentRecord, recording: boolean, recipient: string): string;
/** The sharing question, in parts: each sentence states one thing that is checked in transport.ts or on the backend. */
export interface ConsentCopy {
    /** the question, and what holds while it is unanswered: always in view */
    readonly ask: string;
    /** the name of the part that opens everything below */
    readonly more: string;
    /** what leads the list of what is sent */
    readonly lead: string;
    /** exactly what a usage event carries */
    readonly sent: readonly string[];
    readonly never: string;
    readonly kept: string;
    readonly change: string;
}
export declare function consentCopy(config: OSConfig): ConsentCopy;
/**
 * The sharing question: one strip at the foot of the window. The question and the two answers are always in
 * view. What is sent, what never is and where it is kept are one press away, in the same plate, so the question
 * does not cover the page it is asked on. (Measured 2026-11-14: as a plate that showed all of its text it
 * covered a lab's one control on a first visit at 390 px.)
 */
export declare function mountConsentBanner(root: HTMLElement, consent: Consent, config: OSConfig): {
    el: HTMLElement;
    destroy(): void;
};
export interface DataPanel {
    readonly el: HTMLDialogElement;
    open(): Promise<void>;
    close(): void;
    refresh(): Promise<void>;
    destroy(): void;
}
export interface DataPanelOptions {
    readonly root?: HTMLElement;
    readonly now?: () => number;
    /** a lab's title for its id (the hub passes its catalogue); the id is shown when this returns nothing */
    readonly titleOf?: (lab: string) => string | undefined;
}
export declare function dataPanel(os: LabsOSInstance, opts?: DataPanelOptions): DataPanel;
