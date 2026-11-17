/* ============================================================
   heptapod/pod/switch.js — which script the pod writes in.

   research/ip.md rule 6 keeps a figure off the public site until its
   similarity to the film's logograms has been checked: Luis looks at
   every pair in the review band (0.65 to 0.80), and a corpus run of
   the gate on the pod's own figures (every ring and every concept
   alone, of the three species) passes. Until then SWITCH.published is
   false and the pod writes in the codec's ring script for everyone.
   On a page served from this machine (127.0.0.1 or localhost) the link
   ?script=inked shows the inked figure, so it can be judged in the
   chamber before it is published; such a day is never stored.

   Turning it on for everyone is the one line `published: true` below.
   tests/inked.test.mjs then fails until labs/assets/data/heptapod/
   g4-pod.json records that corpus run for the current inkfig version
   with its review, and the page's ink paragraph must be rewritten
   (the inked script does not draw the being's press).

   This file loads nothing else: pod/inked.js and topo/inkfig.js are
   fetched only when the inked script is on (pod/main.js).
   ============================================================ */

export const SWITCH = Object.freeze({
  published: false,   // the one place to turn the inked script on for everyone
});

const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/;

/** Which script the pod writes in: 'inked' or 'ring'. */
export function scriptOf(loc = globalThis.location) {
  let q = null;
  try { q = new URLSearchParams(loc.search).get('script'); } catch { q = null; }
  if (SWITCH.published) return q === 'ring' ? 'ring' : 'inked';
  return loc && LOCAL.test(loc.hostname || '') && q === 'inked' ? 'inked' : 'ring';
}

/**
 * What the keys do, in the words of the script on the page. The ring script writes each part in a fixed quarter of
 * the ring; the inked script lays its parts where the figure puts them, so its keys are named by turn, not by side.
 */
export function keysHelp(script) {
  const keep = script === 'inked'
    ? 'While a ring is in the disc, W, D, S and A each keep one of its parts, the same part in every ring.'
    : 'While a ring is in the disc, W, D, S and A keep its top, right, bottom and left part.';
  return {
    hint: `Put the focus on the chamber. Left and Right choose a thing, Enter takes it. With a thing in the hand: Up holds it up at the glass, Down holds it up far from the glass, Enter sets it down on the plate it is over, G passes it through the glass. ${keep}`,
    label: `The pod. Beyond the glass a being stands in the dark beside a disc of fog, where it writes; on this side, a tray with six things. Arrow keys choose a thing and Enter takes it. With a thing in hand: Up holds it at the glass, Down holds it far from the glass, Enter sets it down, G passes it through the glass. ${keep}`,
  };
}
