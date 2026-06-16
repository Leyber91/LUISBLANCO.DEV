/* ============================================================
   blackhole/main.js — entry for bh_animation_page.html.
   Boots the WebGL black hole + the control panel.
   ============================================================ */

import { BlackHole } from './blackhole.js';
import { buildPanel } from './ui.js';

const params = new URLSearchParams(location.search);
window.__BH_STILL__ = params.has('still');

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bh-canvas');
  const bh = new BlackHole(canvas);
  if (!bh.ok()) return;

  const panel = buildPanel(document.getElementById('bh-controls'), bh, {
    onPause: (paused) => { paused ? bh.stop() : bh.start(); },
  });

  // deep-link a regime / viewing angle: ?type=kerr&view=edge
  if (params.has('type')) panel.setType(params.get('type'));
  if (params.has('view')) panel.setView(params.get('view'));

  bh.start();

  // fade out the loading veil once the first frame is up
  const veil = document.getElementById('bh-loading');
  if (veil) requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('hidden')));
});
