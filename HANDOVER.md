# luisblanco.dev — HANDOVER: bring the whole page to the level of the hero

**Date:** 2026-06-15 · **Status:** the hero landed; the rest of the site must now rise to it.
**Canonical build:** `Luis_Blanco_dev/LUISBLANCO.DEV/` (the SPA — `index.html` + `src/` + `styles/`).
NOT the legacy `Luis_Blanco_dev/luisblanco.dev.html`.

This document is the single source for continuing the build. Read it top to bottom once, then
work section by section against §5. The job is not "redesign" — it is **raise every section to the
bar the hero set (§2), in the language the hero established (§3).**

---

## 1. Where we are

- **The hero is done and loved.** It is a living **smoke-ink entity** on near-black: soft feathered
  dye flowing in a curl field with frame-feedback trails (real "ink in water"), the named system as
  humble gold ink-filaments (model · goal · memory · tools · loop · recovery · self-model), an
  **ignition on load** (gold flash → ink fades in → filaments draw), and a **cursor that parts and
  swirls the ink**. Engine: `src/aea3d/hero-entity.js` (Canvas2D). Headline: *"Intelligence isn't the
  model. It's the system around it."*
- **A design language now exists** (§3): near-black ground, blue-white ink, gold = fired/active only,
  Fraunces serif display + IBM Plex Mono body, a faint engineering grid + plate frame + gold corner
  brackets, and a **line-and-light** button system (no solid fills).
- **Everything below the hero is a step behind that bar.** The sections work and are on-palette, but
  they read "competent/clean," not "alive/crafted." That gap is the whole remaining job.

The path we walked to get here (so you don't relitigate it): blueprint-figure → particle-node →
relational-web → luminous-web → **smoke-ink**. Blueprint-blue was tried and **rejected as cliché**;
ground is now black. A crisp network/particle look was rejected as "materialist." The bar is
**alive, hand-made, post-materialist** — meaning over decoration.

---

## 2. THE BAR — what "hero level" means (the test every section must pass)

Five principles the hero embodies. Hold each section against them.

1. **Alive over static.** The hero breathes, flows, and reacts. Every major section needs **one
   living element** — a motion or interaction that responds to time or the visitor — not a static
   diagram. Not decoration: the motion should *mean* something (the ink = the system thinking).
2. **Line + light over solid matter.** Thin strokes, feathered glows, gold dust, registration ticks.
   No chunky filled buttons, no heavy cards, no flat blocks. Light reacts on hover.
3. **Meaning over spectacle (post-materialist).** The visual must *say the idea*, not just look cool.
   The hero's ink literally argues "intelligence is the pattern, not the node." Each section's visual
   should carry its section's thesis.
4. **One focal moment + restraint.** Vast quiet, then one thing that grabs you. Don't fill every
   pixel. Negative space is a feature.
5. **A reveal.** The hero ignites on load. Sections should **assemble/reveal on scroll-into-view**
   (IntersectionObserver), not just appear. Motion is the entrance.

Quick gut-check per section: *"Does this feel as alive and as crafted as the hero, or does the site
visibly drop to 'nice template' after the fold?"* If the latter, it's not done.

---

## 3. THE DESIGN SYSTEM (tokens + vocabulary)

### Palette (locked, in `styles/styles.css` `:root`)
- `--bg:#05070E` (near-black) · `--bg-2:#0A0E1A` · subtle cool vignette in `body` bg.
- `--ink:#EAF2FF` · `--ink-dim:#A6BEDF` · `--faint:#5E76A0` (blue-white ink ladder).
- `--gold:#D4A24C` · `--gold-hi:#F0C674` · `--gold-dim` · `--gold-glow`. **Gold = fired / active /
  decision only.** Never decorative.
- `--line / --line-soft / --line-hi` (blue-white linework) · `--grid / --grid-strong` (faint cool
  engineering grid) · `--frame` (plate border).
- **No cyan/teal. No third accent. No emoji. Ever.**

### Type
- **Display = Fraunces** (`--serif`), used for the hero name and **every section title** (big, tight,
  -0.01em). This serif-against-mono contrast is the editorial signature.
- **Body/UI = IBM Plex Mono** (everything else), letterspaced, often uppercase for labels.
- Section titles are already upgraded to big serif via `.arch-head .ttl` etc. in `styles.css`.

### Persistent chrome (in `index.html` body + `styles.css`)
- `.bp-grid` (fixed fine engineering grid) · `.bp-frame` (inset plate border) · `.bp-corner ×4`
  (gold corner brackets). These frame the whole site as one plate. Keep on every route.
- Top nav `.topnav`, drawing index `.dwgindex`, sheet tag `.sheet`, AEA glyph `.glyph` — injected by
  `spa-engine.js`. **On the home cover these fade out** (`body[data-route="home"]` → opacity 0) so the
  hero is clean; they return from the architecture plate on.

### Motion vocabulary (reuse these; don't invent new idioms casually)
- **Curl-flow** — divergence-free field (`curl()` in `hero-entity.js`) = organic ink/smoke motion.
- **Frame-feedback trails** — draw a low-alpha bg wash instead of clearing → smoky wakes. The single
  trick that turns particles into ink. (Fade ~0.085; lower = smokier but risks additive blow-out.)
- **Bloom breathing** — slow sine 0..1 that expands/contracts.
- **Ignition** — flash + fade-in + draw-on, gated by a `born`-based 0..1 ramp.
- **Line-and-light buttons** — `.hero-cta` / `.cta-btn`: thin gold-dim frame, transparent fill, a
  radial gold-dust `::before`, a corner-tick `::after`, hover = gold border + glow. **This is THE
  button. Use it for every CTA.** (Already on hero + `/work`.)
- **`.tickbox`** — the gold corner tick on hover (shared atom). **Scroll reveals** via
  `[data-scroll-reveal]` / `.scroll-draw` (engine-driven) + IntersectionObserver in section modules.
- Everything must honor `prefers-reduced-motion` + `html.reduced-motion` + `LB.motionOn` (settle to a
  beautiful static frame; no animation).

---

## 4. TECH ARCHITECTURE (how the build works)

- **The POSTER:** all sections are `<template>`s mounted ONCE into `#page` by `spa-router.js`
  (`ORDER = home, architecture, projects, writing, about, work, contact`). Navigation = scroll; the
  hash router survives for deep links; a scroll-spy drives the chrome.
- **Routes are registered in TWO places** — `spa-router.js` (`ORDER`/`AMP`/`ARCS`) AND `spa-engine.js`
  (`ROUTES`/`DI_CUR`/`SHEET`). Add/remove a section in both or the nav/sheet desync.
- **Section modules** init once in `spa-router.js` `initSections()` after layout settles
  (rAF×2). Pattern: `if(window.LB_X && el) window.LB_X.init(el)`.
- **Key files:**
  - `src/core/spa-engine.js` — persistent chrome (nav, drawing index, sheet, glyph), motion master.
  - `src/core/spa-router.js` — poster mount, scroll-spy, section init, deep-link.
  - `src/core/spa-substrate.js` — starfield/grid substrate (persistent, parallax).
  - `src/aea3d/hero-entity.js` — **the hero** (smoke-ink, Canvas2D). `LB_HEROENT.init(canvas)`.
  - `src/aea3d/aea3d.js` — architecture WebGL structure (clean 3D, layer toggles, connection legend,
    `locate()`). `LB_AEA3D.init(mount)`.
  - `src/routes/spa-projects.js` — triad meters + carousel. `LB_PROJ.init(scope)`.
  - `src/routes/spa-writing.js` — horizontal scrub timeline. `LB_WRITING.init(scope)`.
  - `src/routes/spa-home.js`, `spa-about.js` — home/about section modules.
  - `src/resonance/*` — the token-stream instrument (`LB_RESONANCE`), now mounted in the home mission.
  - `styles/` — one CSS file per section + `styles.css` (foundation) + `spa.css`.
- **Standalone previews** (for fast, reliable iteration without the SPA): `hero_alive2.html` loads the
  real `hero-entity.js`. `aea_panel_proto.html` is the AEA prototype. Build new effects in a
  standalone first, then integrate.
- **Stack lock (D-7):** static vanilla, no frameworks, no build step, must run from `file://`. Native
  WebGL (no Three.js) is allowed. Self-host fonts before deploy (currently Google CDN).

---

## 5. PER-SECTION ELEVATION PLAN (the work)

For each: current state → the gap vs §2 → concrete upgrades. Do them in the §7 order.

### 5.1 Architecture (`/architecture`, `aea3d.js`)
- **Now:** plain-language text left + interactive WebGL 3D (axis columns, layer toggles, connection
  legend, "place a system" locator). Clean and legible — but it's the *digital-3D* aesthetic, a step
  below the ink hero.
- **Gap:** static until you touch it; no reveal; reads "diagram," not "alive."
- **Upgrade:** (a) **assemble on scroll-into-view** — the structure draws itself in (axes rise,
  filaments connect) when it enters the viewport. (b) Give nodes a soft feathered glow (reuse the ink
  sprite look) so it shares the hero's light quality instead of crisp dots. (c) Layer-toggle buttons →
  the line-and-light language (they're close). (d) Keep it legible and interactive — this is the
  explorable proof; don't over-inkify it. One living touch: a faint gold pulse traveling the lit
  filaments. Title already serif.

### 5.2 Projects (`/projects`, `spa-projects.js`) — INCOME-ADJACENT
- **Now:** the "what I'm building" triad (Leak Map €→0 · TokenGateKeeper tokens→0 · Conjunction Driver
  P→0; meters animate down on scroll) + a draggable parallax carousel of proofs/engineering.
- **Gap:** the triad cards are decent gradient cards — not hero-crafted. The metric-collapse is the
  one alive thing (good); lean into it.
- **Upgrade:** (a) triad cards → line-and-light surfaces (thin frame, gold-dust, corner tick), the
  meter bar more alive (a faint ink/ember in the bar as it drains). (b) Each card's metric→0 is the
  living element — make it the focal moment (bigger number, the bar a luminous filament). (c) Carousel
  cards same refined treatment; the big parallax numeral stays. (d) Reveal cards on scroll.

### 5.3 Writing (`/writing`, `spa-writing.js`)
- **Now:** horizontal scrubbable timeline of 26 real posts, gold shipped-nodes on a rail, ends
  diffuminate, axis filter. Solid concept.
- **Gap:** the rail + cards are a bit flat; no living element.
- **Upgrade:** (a) the rail as a faint flowing line (subtle gold current along it, like the hero's
  filaments). (b) post cards → line-and-light, hover lifts + lights. (c) the scrub is the interaction;
  make the centered post bloom slightly (focal). (d) reveal on enter.

### 5.4 Work (`/work`) — THE CONVERSION PAGE, highest stakes
- **Now:** the operational AI diagnostic — serif title, de-risk-first pills, "why a fixed fee" line,
  deliverables/steps, proof strip (9 sites/15min/months), refined `.cta-btn`, real email/LinkedIn.
- **Gap:** it's clean and honest but visually plainest of all — and it's the page that earns.
- **Upgrade:** (a) it must feel as crafted as the hero — add ONE restrained living element (a faint
  ink wisp echo in the header, or a small "leak → 0" living meter that mirrors the Leak Map demo and
  ties the offer to the proof). (b) strong typographic hierarchy (serif headline already; make the
  number/fee and the guarantee the focal beats). (c) the CTA is the money moment — give it a touch
  more presence than other buttons (it already uses `.cta-btn`; maybe a gentle pulse). (d) keep it
  fast and skimmable — conversion > spectacle here; restraint wins.

### 5.5 About (`/about`, `spa-about.js`)
- **Now:** worldview text + an orbital/spiral SVG field, the one quiet "country as a system" line.
- **Gap:** the orbital is the old aesthetic; on black it needs the ink/light treatment.
- **Upgrade:** (a) the orbital field → soft feathered light (reuse the sprite glow) so it shares the
  hero's quality; slow drift. (b) reveal on enter. (c) keep it personal and quiet — this is the human
  beat; restraint.

### 5.6 Contact (`/contact`)
- **Now:** "let's build better systems," refined link tiles (email/LinkedIn/GitHub, no placeholders),
  a radial closure diagram, faint closing curves.
- **Gap:** the closure should *land* — right now it just ends.
- **Upgrade:** (a) echo the hero — a final ink wisp that dissolves/settles as you reach the bottom
  (the entity coming to rest). (b) link tiles already refined; ensure hover lights gold. (c) the
  radial → soft light.

### 5.7 Global chrome
- nav / drawing-index / sheet / footer: confirm all read on black and use the line-and-light language.
- **Decision needed:** the persistent `.glyph` (pentagon/cube, top-right) — does it still fit the
  smoke-ink world, or does it read as a leftover? Consider retiring it or restyling to an ink mark.

---

## 6. VERIFICATION (hard-won — trust these)

- **Headless recipe (Chrome):** `--headless=new --no-sandbox --hide-scrollbars
  --user-data-dir=<fresh> --window-size=W,H --virtual-time-budget=N --screenshot=out.png file:///...`.
  For WebGL sections add `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
  --ignore-gpu-blocklist`.
- **Chrome flakiness (real, recurring):** screenshots intermittently write nothing. Fixes that work:
  **kill all `chrome` processes + PURGE the `--user-data-dir` profile folders between bursts**; use a
  **fresh profile dir each shot**; keep **window height ≤ ~1500** (taller hangs); first attempt often
  fails — **retry once**.
- **The full SPA hangs headless** — multiple WebGL contexts (aea3d + lumen) choke swiftshader and the
  capture never writes. **Verify the hero via `hero_alive2.html`** (Canvas2D only) and interior
  sections by **isolating one section** (inject CSS hiding the other `.plate-sec`s) at a normal window
  height. The site runs **fine in a real browser** — the hang is capture-only.
- **Motion pieces can't be judged from a still** — verify ink/flow/reveal in a live browser. Stills
  confirm composition and that nothing's broken, not the feel.
- **Shot-override trick:** mirror the site to local temp (robocopy, dodges OneDrive sync), inject a
  `<style>` that sets 100vh sections to `min-height:auto` + skips the intro
  (`localStorage 'lbr_seen_intro'='1'`), then capture top-down.

---

## 7. EXECUTION ORDER (income-first — the clock is real)

1. **Work / conversion page (5.4)** — it earns; bring it to hero level FIRST.
2. **Projects triad (5.2)** — the income showcases; the metric→0 living element.
3. **Architecture (5.1)** — the credibility centerpiece; assemble-on-scroll + glow.
4. **Writing (5.3)** → **About (5.5)** → **Contact (5.6)** — the supporting beats.
5. **Global chrome pass (5.7)** + the glyph decision.
6. **Full screenshot-verify every route** (per §6), then **self-host fonts + deploy**.

Do **one section at a time, screenshot-verified, Luis go/no-go** (working agreement). Each section is
done when it passes the §2 gut-check, not when it merely renders.

---

## 8. GUARDRAILS (unchanged, non-negotiable)
- Palette §3 only · gold = fired/active only · **NO emoji** anywhere.
- Never name employer / client / internal system. Real anonymized numbers only.
- Only real URLs: `github.com/Leyber91` · `linkedin.com/in/luisblancorodriguez` ·
  `leyber.91.2@gmail.com` (provisional — confirm before deploy). Every unknown stays a visible
  `[PLACEHOLDER]`. Forks labelled as forks.
- Internal production repos = pattern-sources only (synthetic data, clean reimplementation).

## 9. OWED BY LUIS (unblocks deploy)
- Rotate the **burned NVIDIA key** before the TokenGateKeeper folder is ever committed.
- X handle · real post dates/URLs for the writing timeline · newsletter decision · confirm the CTA
  email · self-host the WOFF2 fonts (Fraunces + IBM Plex Mono) — currently Google CDN, violates the
  CSP/no-CDN lock.

## 10. OPEN DECISIONS / RISKS
- The persistent `.glyph` vs the smoke-ink world (§5.7) — keep, restyle, or retire?
- How far to "inkify" interior sections vs keep them legible/calm — the hero is the spectacle; the
  body should be *crafted and alive but calmer* (don't make every section a particle show; that would
  exhaust and bury the content). Restraint is the senior move.
- Performance: the hero is Canvas2D + the substrate + (on interior) WebGL. Watch total GPU/CPU on a
  mid laptop; the hero must not jank on a recruiter's machine. Profile before deploy.
```
