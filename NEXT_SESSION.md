# PASTE THIS TO OPEN THE NEXT SESSION

---

Continue from where we closed on 2026-06-13. Orient first:

1. `PORTFOLIO/INDEX.md` — workspace map.
2. `PORTFOLIO/BACKLOG.md` — epics E0–E14, decisions D-1–D-10.
3. `PORTFOLIO/LUIS_CONCEPTUAL_MAP.md` + `LUIS_IDEA_ATLAS.md` (641 entries) — who I am / what I thought.
Your rules (global CLAUDE.md v3.1 + project CLAUDE.md) auto-load — honor layer_11 field lessons.

## THE CODEX
Repo: github.com/Leyber91/LUISBLANCO.DEV · passphrase: `Aether91212*` · AES-256-GCM client-side.
Source: `_reference/` (gitignored). Rebuild: `cd LUISBLANCO.DEV; $env:CODEX_PASS="Aether91212*"; node tools/build_codex.mjs` → commit + push `codex.enc.json`.
Currently sealed: **149 sections · 1.31 MB**.

---

## THE REGISTER — DONE (do not re-open unless a bug is found)

Pipeline: 9 scripts in `register/` (phase0-bootstrap → phase1-canonicalize → phase2-part-assign → inject-constellation → **inject-wirtforge** → phase3-edges → phase4-audit → phase5-assemble).

**FINAL STATE: 690 nodes · 1013 typed edges · 0 orphans · 0 isolated S/A · 2 irreducible dup pairs**
(+14 WirthForge nodes · +17 edges vs prior session — inject-wirtforge.js sealed)

To re-run from scratch (only if source atlas changes):
```
cd register
node phase0-bootstrap.js
node phase1-canonicalize.js
node phase2-part-assign.js
node inject-constellation.js
node inject-wirtforge.js
node phase3-edges.js
node phase4-audit.js
node phase5-assemble.js
```
Then re-seal: `$env:CODEX_PASS="Aether91212*"; node tools/build_codex.mjs`

Part distribution: I-ENTITY(107) · II-CONTINUITY(107) · III-COMPOSITION(47) · IV-INTERFACE(86) · V-CRAFT(106) · VI-LABORATORY(58) · VII-MEASURE(179).

`src/core/concept_graph.json` — 690 nodes, 1013 edges — is versioned and ready for the Prime Radiant graph instrument.

**Known minor items (not blocking):**
- 536 atlas-only entries have no tier (expected — gold index only covers top ~130).
- III-COMPOSITION target ~75, currently 47 (6 named CONSTELLATION concepts from `02_the_concepts.html` not yet injected: MoA-OF-MoAs, MOA Matrix, Seven Games Orchestration Patterns, +3).
- 2 similarity dup pairs are verified distinct concepts — not merge candidates.

---

## WHAT WAS BUILT THIS SESSION (2026-06-13 cont.)

- **inject-wirtforge.js** — 14 WirthForge LLM-measurement concepts injected: 6 × IV-INTERFACE + 8 × VII-MEASURE.
- **BOOK_PARADIGM/00_intro.html** — unified Paradigm Book intro: Visible AI doctrine (9 principles), 7-part dependency diagram (SVG), reading order, scope boundaries.
- **BOOK_AETHER/** (Part IV — INTERFACE) — 6 files authored from scratch:
  - 00_plate: overview + status table
  - 01_the_laws: 9 laws of interface (Navigable Space, Celestial Correspondence, Observable Time, Data Made Physical, No-Label Legibility, Scientific Instrument, Spectral Fingerprint, Ordered Chaos, Local Rendering)
  - 02_the_concepts: 86-node roster organized by tier/cluster
  - 03_the_ontology: full 31-body celestial internet ontology + API supply map + product inventions + visual direction doctrine
  - 04_lineage_and_failures: 5 forms (2023 mapping → 2023 visual sprint → 2024 AI Canvas → 2025 WIRTHFORGE → 2026 LUMEN), failure patterns, deposited invariant
  - 05_practice: 7 practice sections mapping to laws + site feed documentation
- **Codex re-sealed**: 148 sections, 1.31 MB (was 141 at session start).
- **Parts I–III re-seated**: cx-plate headers + cross-reference footers added to BOOK_AEA, BOOK_ESSENCE, BOOK_CONSTELLATION.
- **Heritage scope**: `_reference/HERITAGE_SCOPE.md` written (149 sections now). Gravitational lensing shaders located. Three Doors implementation found in wirthforge. Energy backend found. Token tracking utilities found.

## WHAT WAS BUILT THIS SESSION (2026-06-13)

- **Register pipeline** (complete, clean, pushed).
- **inject-constellation.js** — parses all 5 BOOK_CONSTELLATION HTML files, injects 23 new CX- entries into III-COMPOSITION (9 laws, 5 watcher sections, 4 anti-patterns, 5 practice sections).
- **phase4-audit.js** — audits orphans, tiers, isolated S/A, dup pairs, thin parts → `work/04_audit_report.md`.
- **register_config.json** — manual_overrides now name-based (survive phase1 re-runs); alias_maps has 13 collapse rules (5 quote-variant pairs + 3 true dups + existing).
- **phase3-edges.js** — 124 spine edges including: CONSTELLATION law→concept (9 laws × 2 edges each) + reverse proves edges from proof concepts INTO each law.
- **Codex** re-sealed to include REGISTER (141 sections, 1.29 MB).
- Site visual work (from prior sessions): Section 02 diagram-instrument, sections 03-08 opaque lifted surfaces, curvature-dust in path-flow.js, codex lock fix. All complete.

---

## RESONANCE VISUALIZATION — STATUS (2026-06-13)

> **Goal:** WirthForge LLM output visualization — token stream, spectral analyzer, cognitive radar, health footer — rendered on a Canvas2D with a gold/dust aesthetic, semi-transparent over the LUMEN starfield.

### Done this session
- `resonance.orchestrator.js` — bulletproof rewrite: grabs `<canvas>` already in HTML (no dynamic creation), `bootFrame()` draws visible gold label immediately, `try-catch` on frame loop, defensive null-guards throughout, starts animation after 120ms with no IntersectionObserver gate.
- `styles/resonance.css` — visible gold border, corner accent marks, 480px height, fallback text hidden once `.active` added to wrap.
- `index.html` — `<canvas class="rs-canvas">` + `.rs-fallback` baked into template; wrap no longer needs JS to have something visible.
- All committed + pushed → `c3582cd` on `main`.

### Still missing / next session tasks

**Priority 1 — Verify it actually renders in the browser** — ✅ DONE (2026-06-13)
- All 4 panels live: token stream scrolling, spectral bars, radar polygon, health footer.
- Confirmed visually in browser screenshot.

**Priority 2 — `resonance.renderer.js` robustness pass** — ✅ DONE (2026-06-13)
- `normSig(sig)` helper normalizes all signature fields upfront — no downstream null crashes.
- `hexRGB(hex)` helper replaces all 4 `sig.color.slice()` instances.
- `CFG.WAVE.BAR_COUNT`, `CFG.RADAR.RINGS`, `CFG.TOKEN_STREAM.FADE_STEPS` all guarded.
- Committed `d25f766`.

**Priority 3 — Token stream scroll direction**
- Currently right-aligned, oldest at left. Confirm with Luis: should newest tokens appear at the RIGHT edge (current) or should the stream scroll LEFT like a ticker tape?
- Ticker-tape variant: each new token appended to right, whole strip shifts left each frame.

**Priority 4 — Profile button wiring**
- Test all 4 buttons: LIGHTNING, COUNCIL, ARCHITECT, DEEP.
- Each should swap `engine.setProfile()` + update glow color + (if LUMEN visible) trigger `applyLumenDelta`.

**Priority 5 — Responsive sizing**
- On < 600px wide, the side-by-side spectral + radar layout breaks.
- Plan: stack them vertically on narrow viewports (spectral top, radar bottom).

### File map for resonance
```
src/resonance/
  resonance.config.js       — profiles, vocab, radar axes, LUMEN deltas  [stable]
  resonance.engine.js       — tick loop, token gen, spectral FFT          [stable]
  resonance.renderer.js     — Canvas2D drawing                            [NEEDS ROBUSTNESS PASS]
  resonance.orchestrator.js — lifecycle, init, rAF loop                   [DONE - bulletproof]
styles/resonance.css        — layout, gold border, fallback               [DONE]
index.html (lines ~370-390) — template with canvas baked in              [DONE]
```

---

## THE DECIDED ARCHITECTURE

Codex = **TWO books + an archive**:

| Book | Parts | Status |
|------|-------|--------|
| **THE PARADIGM BOOK** | I-ENTITY · II-CONTINUITY · III-COMPOSITION · IV-INTERFACE · V-CRAFT · VI-LABORATORY · VII-MEASURE | Parts I-III = AEA/ESSENCE/CONSTELLATION **must be RE-SEATED** (not re-done) under one harmonized law system with a unified intro. Parts IV-VII = NEW — not yet authored. |
| **THE BOOK OF LUIS** | Eras 00-12 + BRAID + 4 new chapters (Mythology, Narrative, Ops, Life) | Main BOOK/ complete. 4 new chapters not yet added. |
| **THE ARCHIVE** | atlas/gold/evidence/vault | Parked. Also parked (not codex books): **Venture Ladder** (business framework → income track) · **Three Doors** (already inside the parts). |

**THE PARADIGM BOOK opens with a unified intro**: Visible AI doctrine + a support/dependency diagram showing how the 7 parts depend on each other. This intro does NOT exist yet — it is the first thing authored before the re-seat.

**One LINEAGE** spanning all 7 parts belongs at the back of the Paradigm Book.

`_reference/` current book dirs: `BOOK/` · `BOOK_AEA/` · `BOOK_ESSENCE/` · `BOOK_CONSTELLATION/` · `REGISTER/` · `research_map/`.
**Missing: `BOOK_CRAFT/` · `BOOK_LABORATORY/` · `BOOK_MEASURE/`** (Parts V-VII).
`BOOK_PARADIGM/` (intro) and `BOOK_AETHER/` (Part IV) are now authored and sealed.

Each new book follows the existing 6-file structure: `00_plate.html` · `01_the_laws.html` · `02_the_concepts.html` · `03_[thematic].html` · `04_lineage_and_failures.html` · `05_practice.html`.

---

## ORDER NEXT SESSION

**0. Author the Paradigm Book unified intro** — ✅ DONE
- `_reference/BOOK_PARADIGM/00_intro.html`: Visible AI doctrine (9 principles), 7-part table, SVG dependency diagram, reading order.
- Sealed in codex.

**1. Author BOOK_AETHER (Part IV — INTERFACE)** — ✅ DONE
- 6 files authored: 00_plate, 01_the_laws (9 laws), 02_the_concepts (86 nodes), 03_the_ontology (31-body table), 04_lineage_and_failures, 05_practice.
- 9 Laws: Navigable Space, Celestial Correspondence, Observable Time, Data Made Physical, No-Label Legibility, Scientific Instrument, Spectral Fingerprint, Ordered Chaos, Local Rendering.
- 31-body ontology fully documented with API supply map.
- LUMEN/Transit feed explicit in practice chapter.
- Sealed in codex (148 sections, 1.31 MB).

**2. Re-seat Parts I–III** — ✅ DONE
- cx-plate headers updated (PART I / II / III), AEA position row updated, cross-reference footer appended to all three plates.
- Feeds/depends-on tables embedded in each plate.

**3. Author BOOK_CRAFT (Part V — CRAFT)** — prompting, context engineering, output grammar.
Source: `_reference/research_map/prompting.md` + CRAFT cluster in register.

**4. Author BOOK_LABORATORY (Part VI — LABORATORY)** — games as discovery engines, sim labs, prototyping.
Source: `_reference/research_map/7-games.md` + `websim.md` + GAMES cluster in register.

**5. Author BOOK_MEASURE / OMEGA (Part VII — MEASURE)** — honesty decoder, token-EEG, QBNN, energy-truth, **and the open cracks**.
- Original name was **OMEGA** — the terminal book, the one that names what is still unresolved.
- WirthForge measurement algorithms (inject-wirtforge.js) are primary source for the token-EEG and spectral laws.
- Source: `_reference/DOCTRINE_VISIBLE_AI.md` + HONESTY + OPS clusters in register (179 entries, largest part).
- **Ops chapter has a public form**: its public-facing version = the future **client diagnostic manual** (different shelf, not inside the codex). Flag clearly when authoring.

**6. Heritage repos scope** — ✅ DONE
- Full scope in `_reference/HERITAGE_SCOPE.md` (now sealed in codex, 149 sections).
- **PRIMARY SHADER SOURCE**: `project-leyber-212-website/assets/js/black_hole/shaders/gravitational_lensing_fragment.glsl` + `_vertex.glsl` + `gravitational_lensing.js` (simplified canvas version = best port target, no THREE.js deps).
- **THREE DOORS FOUND**: `wirthforge/frontend/src/pages/DoorSelection.tsx` + Level1/2/3. The wirthforge frontend IS the Three Doors implementation. Running receipt for Part VII/OMEGA.
- **ENERGY BACKEND**: `wirthforge/backend/core/energy_calculator.py` + `energy_service.py` — energy-truth implementation for Part VII source.
- **TOKEN TRACKING**: `Aether_AI/src/utils/tokenUsage/` — tracker, statistics, limits, constants. Feeds TokenGateKeeper.
- Porting plan for gravitational lensing → LUMEN documented in HERITAGE_SCOPE.md.

**7. LUMEN gravitational lensing shader** — shader located, porting plan documented. **Still needs explicit go-ahead.** Source: `project-leyber-212-website/assets/js/main_page/gravitational_lensing.js` (simplified, no THREE.js — best port target). Port path: extract Schwarzschild math → replace skybox sample with LUMEN dust-field bend → LUMEN module pattern (lensing.config + lensing.glsl + lensing.engine + lensing.orchestrator). Should hold 60fps (one fullscreen quad per frame, ~1ms cost).

**8. concept_graph.json → Prime Radiant instrument** — force-directed graph page wiring 690 nodes + 1013 edges from `src/core/concept_graph.json`. Already versioned, just needs a viewer. Reference layout: `ai_canvas/static/js/graph/GraphLayoutManager.js` (Cytoscape algorithms, adapt to vanilla D3/force without external dep).

---

## LESSONS THAT MUST NOT BE FORGOTTEN
- Completion over planning; one ticket in flight; every visual change ends in screenshots.
- Dissatisfaction is structural until proven cosmetic; reference images are specs.
- Income clock outranks shiny (E13 Track 1). Cite research_map for any claim.
- Ship under working titles; bank to disk at session end — nothing lives only in conversation.
- Register pipeline lives in `register/` — checkpoint files in `register/work/`.

## OWED BY ME (remind, don't block)
D-6 revoke old API keys · D-4 CTA email/booking · D-5 X handle/post titles/newsletter/years ·
D-8 doctrine name · GitHub Pages toggle (Settings→Pages→main) · Stronger codex passphrase.
