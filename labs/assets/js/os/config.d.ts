import type { Transport } from './consent.js';
export interface OSConfig {
    /** show the consent banner and the sharing control */
    readonly consentUi: boolean;
    /** where the outbox sends; null keeps everything in the browser */
    readonly transport: Transport | null;
    /** who would receive the data, for the consent copy */
    readonly recipient: string;
}
export declare const OS_CONFIG: OSConfig;
