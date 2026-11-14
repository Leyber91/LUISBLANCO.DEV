---
paths:
  - "labs/**"
  - "tools/labs-wt.mjs"
  - "tools/levels.mjs"
---

# Conventions for labs/

These hold on every change under labs/, because each one has failed before or protects the live site.

- Gold (the --accretion family) marks only what has fired: live, chosen, computed, decided. Everything else is
  drawn in the blue-white ink ladder. A second warm accent dilutes the one signal the visitor learns to read.
- Every model call goes through LLM.complete() in labs/assets/js/ai/llm.js, with a deterministic fallback that is
  good on its own, and the route pill mounted with mountRoutePanel(). The public route allows one reply per 45
  seconds per IP, so design one model call per visitor action.
- Runtime hosts stay the ones the labs already use (fonts.googleapis.com, fonts.gstatic.com, cdnjs, jsdelivr with
  exact versions, the model route in llm.js, and public APIs a lab already calls). A new host needs Luis's approval,
  because the page then depends on a service nobody reviewed.
- Every on-page claim is tagged [REAL] (computed or sourced, with author, year and venue) or [ILLUSTRATIVE]. Write
  "uncertain" and the reason rather than inventing a value or a citation.
- Every Chrome you start dies on a timeout and you run one at a time: a stalled WebGL capture once held eight cores
  for two hours on this machine. `node tools/labs-wt.mjs shoot <lab>` does this for you.
- Before committing a page, style or script: `node tools/anti_tells.mjs scan <your files>` and fix what it lists;
  the site gate fails a pull request that adds a tell.
- labs/levels/*.json are written by the independent rater only. A builder reads its ladder and never edits it.
- The lab's own files, its site.config.js entry and nothing else, unless the task names a shared file.
- Look before you write. The labs share a toolbox, and a lab that writes its own copy drifts from it: Labs OS
  (labs/assets/js/os: the progress store, the scene lifecycle, usage events, export and erase), the kit
  (labs/assets/js/kit: seeded randomness, DOM helpers that write text as text), the model route
  (labs/assets/js/ai) and the tools (`tools/labs-wt.mjs` shoot and drive; `tools/drives/pages.mjs` loads every lab
  page after a change to shared code). Search labs/assets/js for a helper before writing one, compare the copies
  and take the best. What you write that a second lab would need goes into
  the shared place with its first caller, and your report says what was reused and what was lifted. On 2026-11-14
  The Pod kept a visitor's day in its own storage beside Labs OS, where the privacy page's erase could not reach
  it, until a search found the platform; that day one random generator was defined six times across the labs.
