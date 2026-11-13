import type { OSConfig } from './config.js';
import type { Consent } from './consent.js';
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
}
export declare function resumePlate(input: ResumePlateInput): HTMLElement;
export declare function storageStamp(s: StorageInfo): HTMLElement;
export declare function fixtureStamp(s: StorageInfo): HTMLElement | null;
export declare function consentCopy(config: OSConfig): string;
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
export declare function dataPanel(os: LabsOSInstance, opts?: {
    root?: HTMLElement;
    now?: () => number;
}): DataPanel;
