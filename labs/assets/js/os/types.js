/* ============================================================
   labs-src/os/types.ts — the record shapes Labs OS stores.

   Everything here is plain JSON so a record can be exported,
   inspected by the visitor and, later, sent by a transport
   without conversion.
   ============================================================ */
/** Version of the event record shape; bumped when a field changes meaning. */
export const EVENT_V = 1;
