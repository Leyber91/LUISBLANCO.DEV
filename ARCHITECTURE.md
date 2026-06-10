# ARCHITECTURE — luisblanco.dev

One repo, ordered. The site is a static, vanilla, zero-build single-page build. This file is the
map: where every piece lives and the conventions that keep it coherent as it grows.

## Layout

```
LUISBLANCO.DEV/
  index.html              the only HTML — hash-routed SPA, <template> per section
  README.md               public overview
  ARCHITECTURE.md         this file
  styles/                 all CSS (one file per area + the SPA chrome)
    styles.css  spa.css  home.css  architecture.css  projects.css
    writing.css  about.css  contact.css  work.css
  src/
    core/                 the persistent engine — mounts once, survives route swaps
      spa-engine.js         chrome + motion (drift, glyph, reduced-motion master)
      spa-substrate.js      celestial substrate (2D-canvas stars + dot grid)
      spa-router.js         hash routing, <template> swap, per-route init
      spa-spine.js          the traversal spine (scroll-drawn)
      spa-intro.js          first-visit assembly overlay
    routes/               per-route init (run when a section swaps into #page)
      spa-home.js  spa-architecture.js  spa-projects.js  spa-about.js
    data/                 content data, separated from logic
      concepts.js           the AEA concept→axis map (the Concept Locator data)
    ui/                   interface widgets
      spa-tweaks.js         the live tweak panel (lb_tweaks)
    lumen/                THE animation system — the GPU particle substrate
      lumen.config.js       constants: tiers, presets, timestep, route→preset map
      lumen.glsl.js         shader sources (seed · sim · render)
      lumen.engine.js       the GPGPU engine (WebGL2 state + sim/render passes)
      lumen.orchestrator.js lifecycle, fixed-timestep loop, route spy, public API
  _reference/             PRIVATE build material — GITIGNORED, never published
                          (gold index, idea atlas, conceptual map, ALGORITHM_REFERENCE.md)
```

## Conventions (the rules that keep it ordered)

1. **Zero build, works from `file://`.** No bundler, no transpile, no `import`/`export` (native
   ES modules are blocked from `file://` by browser CORS). Modules are plain `<script>` files
   loaded in order; this is a deliberate trade for portability + no toolchain rot (BACKLOG D-7).
2. **Namespaces, not globals soup.** Each subsystem augments ONE namespace object:
   - `window.LB` — the engine/motion master (substrate reads `LB.motionOn`, `LB.amp`, …).
   - `window.LUMEN` — the animation system internals (`LUMEN.CONFIG`, `.GLSL`, `.Engine`).
   - `window.LB_LUMEN` — LUMEN's public API (`init`, `setPreset`, `pause`, …).
3. **Data ≠ logic.** Constants and content live in their own files (`lumen.config.js`,
   `data/concepts.js`). You tune behavior by editing config, not by hunting through logic.
4. **Load order is explicit.** `index.html` is the manifest. Engine → substrate → LUMEN
   (config → glsl → engine → orchestrator) → data → routes → spine → router → ui.
5. **Animations are modular.** Each animation system is a folder: pure-data config + shaders,
   a stateful engine, and a thin orchestrator that wires it to the page lifecycle. LUMEN is the
   reference implementation of this shape.

## How a new module is added

- Constants/data → its own file (`*.config.js` / `data/*.js`), no logic.
- Heavy GLSL/string assets → a `*.glsl.js` (or `*.assets.js`) file of pure strings.
- The engine (stateful machine) exposes a small imperative API; it never touches the DOM or rAF.
- An orchestrator owns the lifecycle (mount, loop, events, public API) and drives the engine.
- Register its `<script>` tags in `index.html` in dependency order.

## Public vs. private

The repo is **public** (it publishes the site). Only public-safe site files are committed.
The full research — gold index, idea atlas, conceptual map, the algorithm catalogue — lives in
`_reference/`, which is **gitignored**. It is the build reference, not site content. If that
material is ever to be version-controlled, it belongs in a separate PRIVATE repo.

## Status

- **Consolidated + ordered:** the site is one repo; CSS in `styles/`, JS in `src/` by concern.
- **LUMEN modularized:** config / glsl / engine / orchestrator (the animation-module pattern).
- **Next:** migrate the heritage special effects (see `_reference/ALGORITHM_REFERENCE.md`) into
  the same module shape as they're brought in; self-host fonts (kill the CDN) at deploy.
