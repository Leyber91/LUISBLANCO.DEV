/* ============================================================
   labs-src/os/config.ts — the switches of Labs OS. Data, not logic.

   v0 runs with no backend: transport is null, so the outbox
   never sends, and consentUi is false, so no visitor is asked
   to allow a send that cannot happen. When a backend exists,
   set transport to its adapter and consentUi to true in the
   same change; the banner and the "Sharing" control then
   appear, and nothing is sent until a visitor allows it.
   ============================================================ */
export const OS_CONFIG = Object.freeze({
    consentUi: false,
    transport: null,
    recipient: 'luisblanco.dev',
});
