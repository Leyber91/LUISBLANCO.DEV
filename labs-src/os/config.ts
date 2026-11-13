/* ============================================================
   labs-src/os/config.ts — the switches of Labs OS. Data, not logic.

   v0 runs with no backend: transport is null, so the outbox
   never sends, and consentUi is false, so no visitor is asked
   to allow a send that cannot happen. When a backend exists,
   set transport to its adapter and consentUi to true in the
   same change; the banner and the "Sharing" control then
   appear, and nothing is sent until a visitor allows it.
   ============================================================ */

import type { Transport } from './consent.js';

export interface OSConfig {
  /** show the consent banner and the sharing control */
  readonly consentUi: boolean;
  /** where the outbox sends; null keeps everything in the browser */
  readonly transport: Transport | null;
  /** who would receive the data, for the consent copy */
  readonly recipient: string;
}

export const OS_CONFIG: OSConfig = Object.freeze({
  consentUi: false,
  transport: null,
  recipient: 'luisblanco.dev',
});
