/* =========================================================================
   lab.js — THE LAB: a ring beside the codex (top-right chrome) that opens an
   overlay of the space-science experiments migrated into labs/. Each card
   links to a self-contained experiment page. Mirrors the codex ring/overlay.

   Experiments are declared once, here — add a line to ship a new one.
   ========================================================================= */
(function () {
  'use strict';

  const EXPERIMENTS = [
    {
      name: 'Exomania', tag: 'exoplanet survey',
      blurb: 'A starship-window survey of real Kepler exoplanets — each world ray-traced from its own measured radius, temperature and host star, live in WebGL.',
      href: 'labs/exomania/index.html',
    },
    {
      name: 'Black Hole', tag: 'general relativity',
      blurb: 'A ray-marched Schwarzschild / Kerr black hole — gravitational lensing, a doppler-shifted accretion disk and the photon ring, rendered live in WebGL.',
      href: 'labs/black-hole/index.html',
    },
    {
      name: 'Dimensions', tag: 'higher-dimensional geometry',
      blurb: 'WITNESS — turn an axis you cannot see by hand and watch an N-cube project and fold, while a live ledger names which hidden dimension is bending the shadow. 1D to 10D, real maths.',
      href: 'labs/dimensions/index.html',
    },
    {
      name: 'Altverse', tag: 'generative cosmology',
      blurb: 'A what-if engine: change one constant of reality and a deterministic pipeline weaves a complete, internally-consistent alternate world — premise, chronology, map and the causal record of how it differs from ours.',
      href: 'labs/altverse/index.html',
    },
  ];

  let root = null;

  function mountRing() {
    const a = document.createElement('button');
    a.id = 'labRing';
    a.type = 'button';
    a.setAttribute('aria-label', 'the lab — interactive experiments');
    a.innerHTML = '<span class="lb-dot"></span>';
    a.addEventListener('click', open);
    document.body.appendChild(a);
  }

  function card(e) {
    return '<a class="lb-card" href="' + e.href + '">' +
      '<span class="lb-tag">' + e.tag + '</span>' +
      '<span class="lb-name">' + e.name + '</span>' +
      '<span class="lb-blurb">' + e.blurb + '</span>' +
      '<span class="lb-open">open experiment →</span>' +
      '</a>';
  }

  function open() {
    if (root) { root.hidden = false; return; }
    root = document.createElement('div');
    root.id = 'labOverlay';
    root.innerHTML =
      '<div class="lb-frame">' +
      '  <div class="lb-head"><span class="lb-title">THE LAB</span>' +
      '    <span class="lb-sub">interactive experiments — space, physics, intelligence</span>' +
      '    <button class="lb-close" type="button" aria-label="close">&times;</button></div>' +
      '  <div class="lb-grid">' + EXPERIMENTS.map(card).join('') + '</div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('.lb-close').addEventListener('click', () => { root.hidden = true; });
    root.addEventListener('click', (e) => { if (e.target === root) root.hidden = true; });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root && !root.hidden) root.hidden = true;
  });

  if (document.readyState !== 'loading') mountRing();
  else document.addEventListener('DOMContentLoaded', mountRing);
})();
