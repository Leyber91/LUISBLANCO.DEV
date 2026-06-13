# REGISTER AUDIT REPORT
Generated: 2026-06-13 02:49
Total concepts: 679 · Total edges: 999

---

## SUMMARY

| Check | Count | Status |
|---|---|---|
| Orphan nodes (0 outgoing edges) | 0 | ✅ CLEAN |
| Missing tier (S/A/B/C) | 536 | ❌ HIGH |
| Thin parts (<20 entries) | 0 | ✅ OK |
| Likely duplicates (>70% name similarity) | 5 | ⚠️ REVIEW |
| Dense nodes (>15 outgoing edges) | 0 | ✅ OK |
| Tier S/A with 0 incoming edges | 0 | ✅ OK |
| Concepts with no source citation | 94 | ❌ HIGH |

## PART DISTRIBUTION

- **I-ENTITY**: 107 entries █████████████████████
- **II-CONTINUITY**: 107 entries █████████████████████
- **III-COMPOSITION**: 47 entries █████████
- **IV-INTERFACE**: 80 entries ████████████████
- **V-CRAFT**: 106 entries █████████████████████
- **VI-LABORATORY**: 59 entries ███████████
- **VII-MEASURE**: 173 entries ██████████████████████████████████

## TIER DISTRIBUTION

- **S**: 16 (spine concepts)
- **A**: 23 (signature frameworks)
- **B**: 15 (original architectures)
- **C**: 89 (strong named systems)
- **unranked**: 536 (atlas-only entries without gold ranking)

## EDGE TYPE DISTRIBUTION

- **implements**: 687
- **parallel**: 207
- **enables**: 40
- **proves**: 23
- **derives_from**: 21
- **refines**: 10
- **watches**: 7
- **requires**: 4

## LIKELY DUPLICATES (name similarity > 70%)

Review these pairs. If confirmed duplicate: merge in `register_config.json` alias_maps and re-run phase1.

- sim=0.83 — `CX-0007` "QBNN — Quantum-Biological Neural Network (bui" ↔ `CX-0361` "QBNN — Quantum-Biological Neural Network"
- sim=0.80 — `CX-0031` "Hades AI self-modifying agents + Alfa/Beta en" ↔ `CX-0065` "Hades AI self-modifying agents (AST self-rewr"
- sim=0.75 — `CX-0062` "Dr. Alice Newton (2024) vs Dr. Hades Helix (2" ↔ `CX-0237` "Dr. Alice Newton vs Dr. Hades Helix debate en"
- sim=1.00 — `CX-0074` "Aether_AI" ↔ `CX-0165` "AETHER / Aether 212"
- sim=0.75 — `CX-0221` "Games as discovery engines (the thesis)" ↔ `CX-0227` "THE GAMES LINE — Games as Discovery Engines"

## CONCEPTS WITHOUT SOURCE CITATIONS

94 concepts have no source file linked. Not blocking but reduces traceability.

- `CX-0001` `OUROBOROS` — Cosmic-quantum scale ladder mapped onto AI architecture
- `CX-0002` `OUROBOROS` — Grow-like-a-seed self-evolving organism
- `CX-0003` `OUROBOROS` — Infinite Self-Evolving Fractal Orbital Organism (HTML univer
- `CX-0004` `OUROBOROS` — InfiniteEvolver / CodeOrganism + WebSim self-evolving AI IDE
- `CX-0005` `OUROBOROS` — Primordial Application Generator + Self-Growing Web App
- `CX-0008` `OUROBOROS` — Quantum Consciousness Architect + five Cluster Games
- `CX-0009` `OUROBOROS` — Quantum-Inspired HAR Analyzer / QuantumHARAnalyzer (nova.htm
- `CX-0010` `OUROBOROS` — Self-Evolving LLM Swarm Architecture
- `CX-0011` `OUROBOROS` — Self-evolving model farm
- `CX-0012` `OUROBOROS` — Self-Growing Algorithm (pre-LLM seed artifact)
- `CX-0013` `OUROBOROS` — The AI Loop — self-evolving standing prompt
- `CX-0014` `OUROBOROS` — THE OUROBOROS LINE — Self-Modifying / Self-Growing Systems
- `CX-0061` `HADES-MOA` — ALEXANDRIA — Groq MOA app + primordial conversations lab
- `CX-0062` `HADES-MOA` — Dr. Alice Newton (2024) vs Dr. Hades Helix (2124) debate eng
- `CX-0064` `HADES-MOA` — Hades / Sedah / Ouroboros / Prometheus Helix pantheon
... and 79 more

---

## ACTIONABLE FIXES (priority order)

3. **5 duplicate pairs** — review and merge via alias_maps

When fixes applied: re-run `node phase2-part-assign.js ; node phase3-edges.js ; node phase5-assemble.js`, re-seal codex, push.