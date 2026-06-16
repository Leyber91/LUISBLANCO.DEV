/* ============================================================
   dimensional_mania/main.js — entry point for WITNESS, the
   Dimensions instrument.

   One honest hypercube you READ, not a swarm you watch. A single
   2^n-vertex N-cube is rotated in its true coordinate planes, then
   perspective-divided down to 3D. The whole bench is built to make
   that hidden mechanism felt:

     · the Plane Dial   — turn an axis you cannot see, by hand
     · the Shadow Ledger — see which hidden axis is bending the shadow
     · live counts       — dimensionality as a number that climbs
     · the legibility wall (6D+) — where direct vision fails by design

   All behaviour lives in the classes; this file only wires them:
     Witness  (controller) · Renderer · PlaneSet · TrailField · Console.
   Constants/theme live in constants.js; the n-cube maths in
   n_dimensional_cube.js. THREE r128 + OrbitControls + UnrealBloom
   are loaded as globals by md_animation_page.html.
   ============================================================ */

import { SEL, PARAMS } from './constants.js';
import { el, resolveMotion } from './dom.js';
import { Witness } from './Witness.js';
import { Console } from './Console.js';

const params = new URLSearchParams(location.search);
const { reduced: reduceMotion } = resolveMotion();

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById(SEL.canvas.slice(1));
  const w = new Witness(canvas, reduceMotion);

  if (!w.ok()) {
    const veil = document.getElementById(SEL.loading.slice(1));
    if (veil) veil.remove();
    const msg = el('div', 'dx-nowebgl',
      'This instrument needs WebGL.<br>Try a current Chrome, Edge, Firefox or Safari.');
    document.body.appendChild(msg);
    return;
  }

  // eslint-disable-next-line no-new -- the Console wires itself to w via callbacks
  new Console(document.getElementById(SEL.controls.slice(1)), w, reduceMotion);

  // deep-link a dimension: ?d=4
  if (params.has(PARAMS.dim)) {
    const d = parseInt(params.get(PARAMS.dim), 10);
    if (!isNaN(d)) w.setDim(d);
  }

  window.addEventListener('resize', () => w.resize());

  w.start();

  const veil = document.getElementById(SEL.loading.slice(1));
  if (veil) requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('hidden')));
});
