# luisblanco.dev

The personal site of Luis Blanco — AI Systems Architect. One continuous plate, drawn in the
browser: what AI actually is, the architecture behind autonomous and reliable systems, and the
proofs that run.

## Stack

Static, vanilla, zero build step, zero runtime dependencies.

- Hash-routed single-page build (`index.html` + `<template>` sections).
- `spa-*.js` engine: persistent chrome + motion (`spa-engine`), route swaps + per-route init
  (`spa-router`), the celestial substrate (`spa-substrate`), the spine (`spa-spine`).
- `lumen.js` — LUMEN, a self-contained WebGL2 GPGPU particle field (the substrate protagonist):
  curl-noise flow gated by a drifting cloud field, velocity→gold emission, depth-banded sprites.
  Degrades cleanly to the 2D-canvas starfield where WebGL2 float-render is unavailable.
- No framework, no bundler. Works from `file://`.

## Run

Open `index.html` in a modern browser (Chrome/Edge/Firefox). WebGL2 enables the full particle
substrate; without it the static starfield renders instead. Honors `prefers-reduced-motion`.

## Visual language

IBM Plex Mono throughout. Near-black ground, luminous white-blue linework, a single warm gold
accent reserved for fired/active states. A monospace engineering schematic levitating in deep space.

## Links

- Code: github.com/Leyber91
