import type { Transport } from './consent.js';
export interface OSConfig {
    /** show the consent banner and the sharing control */
    readonly consentUi: boolean;
    /** where the outbox sends; null keeps everything in the browser */
    readonly transport: Transport | null;
    /** who receives the events, for the consent copy */
    readonly recipient: string;
    /** the privacy page the banner and "Your data" link to */
    readonly privacyHref: string;
}
export declare const OS_CONFIG: OSConfig;
