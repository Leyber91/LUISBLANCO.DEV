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

Pipeline: 8 scripts in `register/` (phase0-bootstrap → phase1-canonicalize → phase2-part-assign → inject-constellation → phase3-edges → phase4-audit → phase5-assemble).

**FINAL STATE: 676 nodes · 996 typed edges · 0 orphans · 0 isolated S/A · 2 irreducible dup pairs**

To re-run from scratch (only if source atlas changes):
```
cd register
node phase0-bootstrap.js
node phase1-canonicalize.js
node phase2-part-assign.js
node inject-constellation.js
node phase3-edges.js
node phase4-audit.js
node phase5-assemble.js
```
Then re-seal: `$env:CODEX_PASS="Aether91212*"; node tools/build_codex.mjs`

Part distribution: I-ENTITY(107) · II-CONTINUITY(107) · III-COMPOSITION(47) · IV-INTERFACE(80) · V-CRAFT(106) · VI-LABORATORY(58) · VII-MEASURE(171).

`src/core/concept_graph.json` — 676 nodes, 996 edges — is versioned and ready for the Prime Radiant graph instrument.

**Known minor items (not blocking):**
- 536 atlas-only entries have no tier (expected — gold index only covers top ~130).
- III-COMPOSITION target ~75, currently 47 (6 named CONSTELLATION concepts from `02_the_concepts.html` not yet injected: MoA-OF-MoAs, MOA Matrix, Seven Games Orchestration Patterns, +3).
- 2 similarity dup pairs are verified distinct concepts — not merge candidates.

---

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
| **THE PARADIGM BOOK** | I-ENTITY · II-CONTINUITY · III-COMPOSITION · IV-INTERFACE · V-CRAFT · VI-LABORATORY · VII-MEASURE | Parts I-III = existing BOOK_AEA/ESSENCE/CONSTELLATION (done). Parts IV-VII = **NEW — not yet authored.** |
| **THE BOOK OF LUIS** | Eras 00-12 + BRAID + 4 new chapters (Mythology, Narrative, Ops, Life) | Main BOOK/ complete. 4 new chapters not yet added. |
| **THE ARCHIVE** | atlas/gold/evidence/vault | Parked. |

`_reference/` current book dirs: `BOOK/` · `BOOK_AEA/` · `BOOK_ESSENCE/` · `BOOK_CONSTELLATION/` · `REGISTER/` · `research_map/`.
**Missing: `BOOK_AETHER/` · `BOOK_CRAFT/` · `BOOK_LABORATORY/` · `BOOK_MEASURE/`** (Parts IV-VII).

Each new book follows the existing 6-file structure: `00_plate.html` · `01_the_laws.html` · `02_the_concepts.html` · `03_[thematic].html` · `04_lineage_and_failures.html` · `05_practice.html`.

---

## ORDER NEXT SESSION

**1. Author BOOK_AETHER (Part IV — INTERFACE)** ← START HERE
- Theme: astrophysics as interface; the internet as navigable space; AETHER/WIRTHFORGE/AetherNet.
- Pull register's IV-INTERFACE concepts (80 entries) from `register/work/02_assigned.json` where `part=="IV-INTERFACE"` as the concept roster.
- 6 files in `_reference/BOOK_AETHER/`. Model exactly on `_reference/BOOK_CONSTELLATION/` structure.
- Laws to derive from the AETHER LINE in `PORTFOLIO/LUIS_CONCEPTUAL_MAP.md` (section: THE AETHER LINE).
- After writing: add `BOOK_AETHER` to `tools/build_codex.mjs` BOOKS array, re-seal, push.

**2. Author BOOK_CRAFT (Part V — CRAFT)** — prompting, context engineering, output grammar.
Source: `_reference/research_map/prompting.md` + CRAFT cluster in register.

**3. Author BOOK_LABORATORY (Part VI — LABORATORY)** — games as discovery engines, sim labs, prototyping.
Source: `_reference/research_map/7-games.md` + `websim.md` + GAMES cluster in register.

**4. Author BOOK_MEASURE (Part VII — MEASURE)** — honesty, audit, receipt culture, visible AI.
Source: `_reference/DOCTRINE_VISIBLE_AI.md` + HONESTY cluster in register (171 entries, largest part).

**5. Heritage repos scope** — list what exists in AetherVision, project-leyber-212, time_slip, ai_canvas; extract shader assets for LUMEN.

**6. LUMEN gravitational lensing shader** — `project-leyber-212-website/.../gravitational_lensing.js`. Bends the dust field, adds depth layer under glyphs. **Needs explicit go-ahead — substantial JS build.**

**7. concept_graph.json → Prime Radiant instrument** — force-directed graph page wiring 676 nodes + 996 edges from `src/core/concept_graph.json`. Already versioned, just needs a viewer.

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
