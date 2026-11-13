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
