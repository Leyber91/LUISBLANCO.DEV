# Succession Progress — Nemotron vs Claude Capability Gap

*Auto-tracked. Updated each session. Last: 2026-06-13*

---

## Current State

| Capability | Claude | Nemotron Today | Gap |
|---|---|---|---|
| Read files + synthesize | ✅ Full | ✅ Working | None |
| Keyword search (lookup_book) | ✅ | ✅ 97% recall | None |
| BRAID memory + RAG | ✅ | ✅ Built, untested E2E | Minor |
| Observability tower | ✅ | ✅ Running | None |
| **Write files reliably** | ✅ | ⚠️ XML tag bug (partial) | **Medium** |
| **Document generation** | ✅ | ❓ Untested | **Unknown** |
| Multi-file coordination | ✅ | ❌ One file at a time | **High** |
| Error diagnosis w/o examples | ✅ | ❌ Needs explicit failures | **High** |
| Proactive structured planning | ✅ | ❌ Needs task pre-breakdown | **High** |
| Context synthesis (10+ files) | ✅ | ❌ Linear reads only | **High** |
| Hybrid semantic search | ✅ | ❌ Keyword only (3% gap) | Medium |
| Self-modifying (glyph language) | ✅ Concept | ❌ Not built | Future |

---

## Evolution Roadmap — Ordered by Impact

### TIER 1 — This Week (unlocks everything else)

**T1.1 — Verify file writing end-to-end**
- Task: run agent on a simple "create this file" task, verify with list_dir
- Success: new_file + edit_file work 100% of the time
- Fix needed: confirm `</tool>` closing tag fix is sufficient

**T1.2 — First document generation test**
- Task: `gatekeeper agent --task "write a 500-word AEA explainer as EXPLAINER.md"`
- Measures: can Nemotron plan + write structured multi-section content?
- Success: coherent, well-structured document created without human help

**T1.3 — Add `plan` tool**
- Before executing: Nemotron writes a plan.md listing steps
- Tracks which step it's on, marks done
- Same pattern as todo_list — constrains one step in flight
- Closes the "proactive design" gap

**T1.4 — Fix python -c permanently**
- Add to XML parser: if `cmd` attribute contains `python -c`, reject + suggest .py file
- Or: add a `python_exec` tool that accepts code as body (not cmd attribute)

---

### TIER 2 — Next Week (quality leap)

**T2.1 — Multi-file coordinator tool**
```
<tool name="multi_plan" files="file1.py,file2.py,file3.py">
  Step 1: edit file1.py — add function X
  Step 2: edit file2.py — import X from file1
  Step 3: edit file3.py — update config
</tool>
```
Tracks cross-file consistency. Each step verifies before proceeding.

**T2.2 — Semantic embeddings (closes 3% recall gap)**
- Wire `nv-embedqa-mistral-7b-v2` API call in memory.py `find_seeds()`
- Hybrid score = 0.6×keyword + 0.4×semantic
- Expected: Recall@10 → 99%+

**T2.3 — Context synthesis tool**
```
<tool name="synthesize" paths="a.py,b.py,c.py" question="what is the architecture?"/>
```
Reads all files, builds a compressed architecture summary, returns it.
Closes the "understand the full system" gap.

**T2.4 — Error pattern crystallization**
- After each failed tool call, Nemotron writes to `error_patterns.json`
- At session start, these are injected (like BRAID but for errors)
- Nemotron learns from its own failures across sessions

---

### TIER 3 — Month (closes the gap almost entirely)

**T3.1 — Document generation suite**
Tools: `write_section`, `append_section`, `rewrite_section`
Each writes one section with a specific template (heading, body, code blocks).
Nemotron generates docs section by section, verifies each before next.

**T3.2 — Crystallized patterns as rules**
- When Nemotron uses the same pattern 5+ times across sessions → it becomes a RULE in SYSTEM_PROMPT
- The system prompt evolves from experience
- This is the FHL Stage 3 → Stage 4 transition

**T3.3 — BRAID compression language (glyph proto-v1)**
- `glyph_dict.json` — shared codebook
- Agent writes BRAID in compressed notation
- Human reads decoded version
- First working compression language between gatekeeper + Nemotron

**T3.4 — Agent-to-agent delegation**
- Nemotron can spawn a sub-agent for a subtask
- Uses the Pico→Micro→Macro ladder: delegate simple tasks to nano model
- First working CONSTELLATION topology

---

## What Claude Does That Requires Architecture (Not Just Prompting)

These require actual system changes, not better prompts:

| What Claude does | Why it's hard to replicate | Solution |
|---|---|---|
| Parallel tool calls | Nemotron is sequential | Add batch_tools dispatcher |
| Read 50-file codebase at once | Context window used for history | Context synthesis tool |
| Mid-task course correction | No feedback loop during inference | Streaming + interrupt mechanism |
| Understands implicit intent | Trained on intent alignment | BRAID prior-task context helps |
| Writes idiomatic code | Code training depth | Fine-tune on repo (T4) |

---

## Sessions Log

| Date | Task | Outcome | Capability Gained |
|---|---|---|---|
| 2026-06-13 | Build agent loop | ✅ Working 9-turn session | Agent foundation |
| 2026-06-13 | Benchmark memory | ✅ 97% recall@10, 175 q/s | Verified book RAG |
| 2026-06-13 | Fix XML parser | ✅ `</tool_file>` accepted | Stable file writing |
| 2026-06-13 | Build observability | ✅ Tower running | Full visibility |
| 2026-06-13 | Hybrid search design | ⚠️ Nemotron at turn 21, ran out | Needs completion |

---

*Next task: T1.2 — First document generation test*
