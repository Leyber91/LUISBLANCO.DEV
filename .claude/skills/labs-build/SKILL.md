---
name: labs-build
description: Build one lab of luisblanco.dev/labs up its ladder in its own git worktree, verify it in a headless browser and commit it for grading. Use when asked to build, rebuild, evolve or fix a single lab. Argument is the worktree name (for example heptapod).
context: fork
agent: general-purpose
argument-hint: <worktree name> [what to build]
---

# Build one lab: $ARGUMENTS

You own one lab of a public static site. Make it the best interactive of its kind you can build in this run and
prove it with screenshots. Someone else grades it.

## Where you work

- Your worktree is `../_labs_wt/<name>` beside the main checkout, on branch `labs/<name>`
  (`node tools/labs-wt.mjs status` lists them; `node tools/labs-wt.mjs add <name>` creates one). Start every shell
  command with `cd <worktree> &&` and use absolute paths, because other builders may be working in other worktrees
  of the same repository at the same time.
- Touch only your lab's files and its entry in labs/assets/js/config/site.config.js. Shared files (tokens.css,
  labs/assets/js/ai/, labs/assets/js/hub/, labs/index.html, tools/) change only when the task names them; otherwise
  write the change you need in your report.
- Commit to your branch with the message "labs: <lab id> <generation> - <one line>". Pushing, merging and shipping
  are the coordinator's step (`node tools/labs-wt.mjs ship <name>`, which merges through tools/ship_pr.mjs and
  so only after the privacy and site checks have passed).

## Before you build

Stop and report, without building, when either of these is missing:

- The lab's concept, chosen by Luis: `plan.concept.status` is "chosen" in `_reference/labs/plans/<hub id>/plan.json`
  in the main checkout. On 2026-11-13 he found the plans had been scaling poor concepts ("we were just scaling up
  garbage"), so nothing is built on a concept he has not chosen.
- A written reference study of what you are about to make: the real artifact, the source papers or the film stills,
  studied as specifications. On 2026-11-11 thirty-one labs were rebuilt without one, and all of them stayed below
  his bar.

## Read first

1. Your ladder, labs/levels/<hub id>.json: the axes, each with a metric and eleven rungs, and the current grade.
   The rater grades against it rung by rung; rungs are cumulative, and the lab level is the lower median of its
   axes capped at the weakest axis plus two, so plan to lift the weakest axis first.
2. LABS_LEVELS.md: the frames, the general ladder and the anchor (level 5 is the lab's fiction made real).
3. The lab's plan and its stories for the next level: `_reference/labs/plans/<hub id>/plan.json` and `stories.json`
   in the main checkout (older notes may also sit under _reference/labs/<lab>/).
4. SITE_RULES.md and the labs-design skill. Both bind you.
5. labs/assets/js/ai/llm.js and route-panel.js: the only way a lab talks to a model.
6. labs/assets/js/os/index.js (Labs OS): the only place a lab keeps a visitor's progress, mounts an animated
   scene and logs usage. Its header shows the five calls a lab needs. labs/assets/js/heptapod/pod/main.js is a
   lab bound to it.
7. Every current file of your lab, before you change any of them.

## Shape of the code

- Static, no build step. labs/<lab>.html is a thin shell; labs/assets/css/<lab>.css; labs/assets/js/<lab>/ holds
  config (constants, data) apart from engine (computation) apart from view (DOM, canvas).
- A Node check of the engine at labs/assets/js/<lab>/tests.mjs (or tests/run.mjs, *.test.mjs, verify.mjs): it
  tests the computation against published or derived values. The site gate runs it on every pull request.
- Images are drawn procedurally (canvas, WebGL, SVG); *.png is not committed.
- Static data you need is committed as a file, with its source and licence cited in the page and in a comment.

## Model calls

One model call per visitor action, batched as one JSON request, validated, with a deterministic engine doing
everything a model is not needed for, because the public route allows one reply per 45 seconds per IP. Served from
127.0.0.1, llm.js uses the local Ollama; test the model path there and make at most one live public call.

The model narrates; the lab computes. This contract keeps a model from ever printing a number or a rule the lab
did not produce:

1. The engine computes every value and fires every rule.
2. The model returns typed blocks (headline, a reference to a computed value by id, a causal step between two
   references, a short line, a declared gap), never free prose with numbers in it.
3. A validator runs before anything renders: the schema parses, every rule id is one that fired, every reference
   resolves, no digits appear in prose, headlines stay under their word cap. A failure falls back.
4. A deterministic builder emits the same blocks from the same state and renders through the same view; only the
   route badge differs. Most visitors on the public route see this path, so it is the product, not a lesser copy.
5. Answers are cached by their input and a time bucket, so a repeat visit does not spend the visitor's allowance.

## Truth

Real published models and values, cited with author, year and venue on the page. When unsure of a value, write
"uncertain" in a comment and use a value labelled [ILLUSTRATIVE]. Original work on published ideas; no copied
designs, glyphs, game art or logos. Never name an employer, client, colleague or internal system.

Data surfaces are honest about their state: a placeholder says what is pending; when a live source is
unreachable the lab shows a bundled snapshot with its date; every view carries a provenance strip (source, date,
freshness). Ratios are recomputed from their totals, never averaged.

## Machine safety

This computer is Luis's and is shared. Every Chrome you start dies on a timeout and you run one at a time
(`labs-wt shoot` handles both). Heavy runs go at the gate size; the full size once, single process. Stop every
server and browser you started before you report.

## Verify

A change is done when it rendered and you looked at it.

1. `node tools/labs-wt.mjs shoot <name>` (or `shoot <name> "<page>?<params>"` for a deep-linked state): desktop
   and phone images plus console errors. Read both images and judge them with the labs-design skill.
2. Zero uncaught console errors.
   A still cannot show that a drag or a key does anything. Where the lab is operated by hand, write
   tools/drives/<name>.mjs (tools/drives/heptapod.mjs is the model) and run `node tools/labs-wt.mjs drive <name>`:
   real pointer and keyboard at 1440 and 390 px, the page read back, pictures at each step.
3. From the worktree: `python tools/privacy_gate.py --selftest`, `node tools/site_check.mjs`,
   `node tools/lab_tests.mjs`, `node tools/anti_tells.mjs`. All pass.
4. Shoot every state the lab can be in (empty, loading, error, offline, full) through deep links, not only the
   happy path.
5. If a screenshot shows a form beside an empty panel, it is not done.

## Report

Your final message is all the coordinator sees:

1. Branch, worktree path, commit hash; files added and changed.
2. Per axis: the rung you believe you reached and its evidence (file and function, or what a screenshot shows).
   The rater checks every line, and on 2026-11-12 builders' claims ran four to five levels high, so claim only what
   a stranger can verify. Head this list "claimed, ungraded": the coordinator reports the lab to Luis as built and
   ungraded until the labs-grade skill has run, and never passes these rungs on as levels.
3. What the lab now does for a visitor that it could not before, in one paragraph.
4. Screenshot paths, console result, gate results.
5. What is still weak, and any decision that belongs to Luis.
