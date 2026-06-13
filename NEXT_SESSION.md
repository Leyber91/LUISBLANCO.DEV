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
Currently sealed: **141 sections · 1.29 MB**.

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

- **inject-wirtforge.js** — 14 WirthForge LLM-measurement concepts injected: 6 × IV-INTERFACE (AI Resonance instrument, Spectral Analyzer, Cognitive Radar, Pattern Analysis, Load Meter, Observable-time doctrine) + 8 × VII-MEASURE (token-stream-as-signal, spectral fingerprint, stochasticity axis, token velocity Rₜ, asymptotic load pattern, pre-flight cost runway, cognitive load formula, health score). Source: AI Resonance dashboard screenshot (2025-09-12) + TokenGateKeeper/research_gemini.md.

## WHAT WAS BUILT THIS SESSION (2026-06-13)

- **Register pipeline** (complete, clean, pushed).
- **inject-constellation.js** — parses all 5 BOOK_CONSTELLATION HTML files, injects 23 new CX- entries into III-COMPOSITION (9 laws, 5 watcher sections, 4 anti-patterns, 5 practice sections).
- **phase4-audit.js** — audits orphans, tiers, isolated S/A, dup pairs, thin parts → `work/04_audit_report.md`.
- **register_config.json** — manual_overrides now name-based (survive phase1 re-runs); alias_maps has 13 collapse rules (5 quote-variant pairs + 3 true dups + existing).
- **phase3-edges.js** — 124 spine edges including: CONSTELLATION law→concept (9 laws × 2 edges each) + reverse proves edges from proof concepts INTO each law.
- **Codex** re-sealed to include REGISTER (141 sections, 1.29 MB).
- Site visual work (from prior sessions): Section 02 diagram-instrument, sections 03-08 opaque lifted surfaces, curvature-dust in path-flow.js, codex lock fix. All complete.

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
**Missing: `BOOK_AETHER/` · `BOOK_CRAFT/` · `BOOK_LABORATORY/` · `BOOK_MEASURE/`** (Parts IV-VII).

Each new book follows the existing 6-file structure: `00_plate.html` · `01_the_laws.html` · `02_the_concepts.html` · `03_[thematic].html` · `04_lineage_and_failures.html` · `05_practice.html`.

---

## ORDER NEXT SESSION

**0. Author the Paradigm Book unified intro** (do this BEFORE re-seating or writing new parts)
- One page: Visible AI doctrine statement + a support/dependency diagram of the 7 parts.
- Lives at `_reference/BOOK_PARADIGM/00_intro.html`. No new concepts — pure architecture.

**1. Author BOOK_AETHER (Part IV — INTERFACE)** ← START HERE after intro
- Theme: astrophysics as interface; the internet as navigable space; AETHER/WIRTHFORGE/AetherNet.
- **Critical detail**: the **31-body ontology** (the 31 subsystems/entities of the Aether architecture) is the structural spine of this part. Name and define all 31.
- **Critical link**: AETHER **feeds LUMEN and Transit** — the instrument vocabulary here is the live animation vocabulary on-site. Laws written here become LUMEN preset names and parameters.
- **WirthForge source vocabulary now in register** (inject-wirtforge.js). Pull IV-INTERFACE cluster for instrument laws; pull VII-MEASURE WIRTHFORGE- entries for measurement laws.
- Pull register's IV-INTERFACE concepts (86 entries) from `register/work/02_assigned.json` where `part=="IV-INTERFACE"` as the concept roster.
- 6 files in `_reference/BOOK_AETHER/`. Model exactly on `_reference/BOOK_CONSTELLATION/` structure.
- Laws to derive from the AETHER LINE in `PORTFOLIO/LUIS_CONCEPTUAL_MAP.md` (section: THE AETHER LINE).
- After writing: add `BOOK_AETHER` to `tools/build_codex.mjs` BOOKS array, re-seal, push.

**2. Re-seat Parts I–III** under the unified Paradigm Book law system (after intro is written).
- BOOK_AEA → Part I-ENTITY, BOOK_ESSENCE → Part II-CONTINUITY, BOOK_CONSTELLATION → Part III-COMPOSITION.
- Re-seating = add unified law IDs, cross-part references, shared register links. Do NOT rewrite content.

**3. Author BOOK_CRAFT (Part V — CRAFT)** — prompting, context engineering, output grammar.
Source: `_reference/research_map/prompting.md` + CRAFT cluster in register.

**4. Author BOOK_LABORATORY (Part VI — LABORATORY)** — games as discovery engines, sim labs, prototyping.
Source: `_reference/research_map/7-games.md` + `websim.md` + GAMES cluster in register.

**5. Author BOOK_MEASURE / OMEGA (Part VII — MEASURE)** — honesty decoder, token-EEG, QBNN, energy-truth, **and the open cracks**.
- Original name was **OMEGA** — the terminal book, the one that names what is still unresolved.
- WirthForge measurement algorithms (inject-wirtforge.js) are primary source for the token-EEG and spectral laws.
- Source: `_reference/DOCTRINE_VISIBLE_AI.md` + HONESTY + OPS clusters in register (179 entries, largest part).
- **Ops chapter has a public form**: its public-facing version = the future **client diagnostic manual** (different shelf, not inside the codex). Flag clearly when authoring.

**6. Heritage repos scope** — list what exists in AetherVision, project-leyber-212, time_slip, ai_canvas; extract shader assets for LUMEN.

**7. LUMEN gravitational lensing shader** — `project-leyber-212-website/.../gravitational_lensing.js`. Bends the dust field, adds depth layer under glyphs. **Needs explicit go-ahead — substantial JS build.**

**8. concept_graph.json → Prime Radiant instrument** — force-directed graph page wiring 676 nodes + 996 edges from `src/core/concept_graph.json`. Already versioned, just needs a viewer.

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
