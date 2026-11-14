/* ============================================================
   labs-src/os/config.ts — the switches of Labs OS. Data, not logic.

   The transport and the consent UI travel together. With no
   transport nothing can be sent, so no visitor is asked to allow
   a send that cannot happen (v0.1 shipped that way). v0.2 sets
   both: the transport is the labs backend (transport.ts), the
   banner and the "Sharing" control appear, and nothing is sent
   until a visitor allows it. Setting one without the other is a
   bug: a banner that asks for nothing, or a transport nobody can
   switch on.
   ============================================================ */
import { BACKEND, supabaseTransport } from './transport.js';
/** labs/privacy.html, found from this module (labs/assets/js/os/), so it holds wherever the site is mounted. */
function privacyHref() {
    try {
        const u = new URL('../../../privacy.html', import.meta.url);
        if (u.protocol === 'http:' || u.protocol === 'https:')
            return u.pathname;
    }
    catch { /* no module URL: fall through */ }
    return '/labs/privacy.html';
}
export const OS_CONFIG = Object.freeze({
    consentUi: true,
    transport: supabaseTransport(),
    recipient: BACKEND.recipient,
    privacyHref: privacyHref(),
});
