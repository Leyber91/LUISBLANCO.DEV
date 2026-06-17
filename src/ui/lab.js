/* =========================================================================
   lab.js — THE LAB: a ring beside the codex (top-right chrome) that opens an
   overlay of experiment cards. A card opens its experiment in a full-viewport
   iframe layer HOSTED INSIDE the lab — never a page-jump — with persistent
   chrome (back to the lab, close to the site). So a visitor is never stranded.

   - card click            -> experiment opens in an iframe over the site
   - "← the lab" / Esc      -> back to the card grid (where you were)
   - "×"                    -> close everything, back to the site
   - browser back           -> closes the experiment layer (history-aware)
   - ?lab=<slug> on load    -> deep-links straight into an experiment
   - ⌘/ctrl/middle-click    -> still opens the raw page in a new tab

   Experiments are declared once, here — add a line to ship a new one.
   ========================================================================= */
(function () {
  'use strict';

  const EXPERIMENTS = [
    {
      name: 'Honesty Decoder', tag: 'honesty · the receipt',
      blurb: 'Every system in this lab, decoded: the myth it could be sold as on the left, the plain mechanism on the right, and a live reality-percentage meter between them — my own honest estimate, stated not hidden. The anti-evangelism stance made into a running receipt; every other exhibit carries one of its rows.',
      href: 'labs/honesty-decoder.html',
    },
    {
      name: 'Exomania', tag: 'exoplanet survey',
      blurb: 'A starship-window survey of real Kepler exoplanets — each world ray-traced from its own measured radius, temperature and host star, live in WebGL.',
      href: 'labs/exomania.html',
    },
    {
      name: 'Black Hole', tag: 'general relativity',
      blurb: 'A ray-marched Schwarzschild / Kerr black hole — gravitational lensing, a doppler-shifted accretion disk and the photon ring, live in WebGL.',
      href: 'labs/bh_animation_page.html',
    },
    {
      name: 'Dimensions', tag: 'higher-dimensional geometry',
      blurb: 'WITNESS — turn an axis you cannot see and watch an N-cube fold, while a live ledger names which hidden dimension is bending the shadow. 1D to 10D, real maths.',
      href: 'labs/md_animation_page.html',
    },
    {
      name: 'Altverse', tag: 'generative cosmology',
      blurb: 'A what-if engine: flip one constant of reality and a deterministic pipeline weaves a complete, internally-consistent alternate world — premise, chronology, map.',
      href: 'labs/altverse.html',
    },
    {
      name: 'AI Meme Lab', tag: 'reasoning · taste',
      blurb: 'Watch a reasoning model argue with itself about what is funny — brainstorm angles, score a caption slate against a taste rubric, then commit. The meme is the receipt.',
      href: 'labs/memes.html',
    },
    {
      name: 'Personalized Plans', tag: 'reasoning · constraints',
      blurb: 'A reasoning model that thinks through your real constraints out loud — the days, the kit, the bad knee — then builds a training block around them.',
      href: 'labs/workout-plans.html',
    },
    {
      name: 'Trending Topics', tag: 'agentic · live web',
      blurb: 'A live agentic scan: it hits public keyless APIs, ranks what is actually rising right now, and a model explains why. No backend, no keys.',
      href: 'labs/trending.html',
    },
    {
      name: 'The Roaster', tag: 'instrumented AI · roast',
      blurb: 'A model that loves real engineering too much to let it lie about itself. Pick a named system — DECIPHER, the token EKG, Ouroboros, "AGI on my Ryzen 9" — and it roasts the myth live: brutal on the hype, precise on the mechanism, graded for how much is real. Or feed it your own claim.',
      href: 'labs/roaster.html',
    },
    {
      name: 'Token EKG', tag: 'instrumented AI · biosignal',
      blurb: 'A model does not emit tokens evenly — it stalls on cache pressure, bursts when the batch clears, jitters with the scheduler. Token EKG timestamps each token as it streams and draws that hidden cadence as a live trace with a spectral read of its rhythm. Real telemetry of the serving pipeline — honestly not a brain.',
      href: 'labs/token-ekg.html',
    },
    {
      name: 'DATASPACE', tag: 'compression · information',
      blurb: 'Your earliest idea (2023): compress a conversation into a capsule only the model can decode. Paste real text — it falls into a lensed horizon as its own measured bits, crushes to a capsule, a fresh model rebuilds it from the capsule alone, and every word that does not survive escapes as Hawking radiation. Degradation, measured against the lossless floor.',
      href: 'labs/dataspace.html',
    },
  ];
  EXPERIMENTS.forEach((e) => { e.slug = e.href.split('/').pop().replace(/\.html$/, ''); });

  let root = null;   // the card-grid overlay
  let expEl = null;  // the experiment iframe layer

  function mountRing() {
    const a = document.createElement('button');
    a.id = 'labRing';
    a.type = 'button';
    a.setAttribute('aria-label', 'the lab — interactive experiments');
    a.innerHTML = '<span class="lb-dot"></span>';
    a.addEventListener('click', open);
    document.body.appendChild(a);
  }

  function card(e, i) {
    return '<a class="lb-card" data-i="' + i + '" href="' + e.href + '">' +
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
    root.querySelector('.lb-close').addEventListener('click', closeGrid);
    root.addEventListener('click', (e) => { if (e.target === root) closeGrid(); });
    root.querySelector('.lb-grid').addEventListener('click', (ev) => {
      const a = ev.target.closest('.lb-card');
      if (!a) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return; // let it open in a new tab
      ev.preventDefault();
      openExp(EXPERIMENTS[+a.getAttribute('data-i')]);
    });
  }
  function closeGrid() { if (root) root.hidden = true; }

  function buildLayer(e) {
    expEl = document.createElement('div');
    expEl.id = 'labExp';
    expEl.innerHTML =
      '<div class="le-bar">' +
      '  <button class="le-back" type="button">&larr; the lab</button>' +
      '  <span class="le-title">' + e.name + '<span class="le-tag">' + e.tag + '</span></span>' +
      '  <button class="le-x" type="button" aria-label="close the lab">&times;</button>' +
      '</div>' +
      '<iframe class="le-frame" src="' + e.href + '" title="' + e.name + '" allow="autoplay; fullscreen"></iframe>';
    document.body.appendChild(expEl);
    expEl.querySelector('.le-back').addEventListener('click', backToGrid);
    expEl.querySelector('.le-x').addEventListener('click', closeAll);
  }
  function teardown() { if (expEl) { expEl.remove(); expEl = null; } }

  function openExp(e) {
    if (!e) return;
    if (root) root.hidden = false;             // the grid waits underneath
    buildLayer(e);
    try { history.pushState({ labExp: e.slug }, ''); } catch (_) {}
  }
  function consume() { try { if (history.state && history.state.labExp) history.back(); } catch (_) {} }
  function backToGrid() { teardown(); if (root) root.hidden = false; consume(); }  // experiment -> grid
  function closeAll() { teardown(); closeGrid(); consume(); }                       // experiment -> site

  // browser back closes the experiment layer (lands you on the grid)
  window.addEventListener('popstate', function () { if (expEl) { teardown(); if (root) root.hidden = false; } });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (expEl) backToGrid();
    else if (root && !root.hidden) closeGrid();
  });

  function initDeepLink() {
    const m = /[?&]lab=([\w-]+)/.exec(location.search);
    if (!m) return;
    const e = EXPERIMENTS.filter((x) => x.slug === m[1])[0];
    if (e) { open(); openExp(e); }
  }

  function start() { mountRing(); initDeepLink(); }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
