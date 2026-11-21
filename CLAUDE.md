# luisblanco.dev

A public static site on GitHub Pages: every merge to main is live within minutes. The rules every agent follows
here, the daily routine included, are in SITE_RULES.md:

@SITE_RULES.md

## Where things are

- ARCHITECTURE.md: the site's structure and the no-build-step rule (D-7).
- ROADMAP.md and EVOLUTION.md: the routine's queue and its log.
- labs/: the experiments. LABS_LEVELS.md defines how a lab is graded (axes, eleven rungs each, an independent
  rater); labs/levels/<id>.json holds each lab's ladder and grades.
- tools/: the gates (privacy_gate.py, site_check.mjs, levels.mjs, lab_tests.mjs, atlas.mjs, stories.mjs,
  evolution.mjs, anti_tells.mjs), the test of the gates themselves (mutate.mjs with tools/mutants/), the merge
  guard (ship_pr.mjs), the lab worktree tool (labs-wt.mjs) and the page driver it runs (drive.mjs, with one
  scenario per lab under tools/drives/, and invariants.mjs, the rules a page keeps after every step of a drive).
  The gates workflow runs the gates on every pull request.

## Committing

- Read `git status --short` and stage files by name. Staging a whole folder once carried a tool's local cache
  (wrangler's account file) into a pushed commit on 2026-11-13; tools leave such files wherever they run.
- Merge with `node tools/ship_pr.mjs <number>`. It waits for the privacy and site checks, merges only when every
  check has passed, squashes by default and makes a merge commit only for labs/foundation. Pull request 19 was
  merged before its checks had started on 2026-11-13.
- A gate that node runs is done when its rules are listed in tools/mutants/<tool>.json and
  `node tools/mutate.mjs` shows its selftest catches each one, and after a reviewer who did not write it has read
  it. atlas.mjs, drive.mjs (the runner of the invariants, the frame rule, its lock and the console), evolution.mjs,
  invariants.mjs, lab_tests.mjs, labs-wt.mjs (the shot's lock and the server it starts), mutate.mjs, ship_pr.mjs
  and stories.mjs have such a list; the selftests of
  drive.mjs and invariants.mjs run headless Chrome (Node 22 or later), one Chrome at a time on a machine (mutate.mjs
  holds the machine's lock around each copy of their lists and leaves 600 ms between copies, so other drives get turns);
  levels.mjs and anti_tells.mjs have a selftest and no list yet, so add one when you change them. A list needs two
  kinds of mutant: one that silences each report, and one that loosens each condition, with a case just inside
  and just outside every bound. The first kind alone reads as full coverage and is not: on 2026-11-14 every report
  of two gates was caught while 51 of 68 loosened conditions still passed. Lists written from memory kept missing
  conditions, so count them from the code: `node tools/dev/conditions.mjs <module> <list> [<list> ...]` names the
  comparisons, defaults and clamps no entry changes (on 2026-11-16, 20 of find.js's 29). Give it every list of a
  module at once. On 2026-11-13 a
  checker that passed its own selftest 90 of 90 had 31 defects a review then confirmed, and the small tools
  written to prevent that had 19 of their own, then 27 more in a second review.
- The selftests of drive.mjs, invariants.mjs and mutate.mjs run on every pull request. Every mutants list is gated:
  they run on every push to main, and on a pull request only when one of their files changes (`mutate.mjs
  --changed-since origin/main`, its GATED lists, renames counted). drive's and invariants' (54m38s on the gates on
  2026-11-16, before the 600 ms between copies: 0.6 s more a copy) run on a change to tools/drive.mjs,
  tools/invariants.mjs, tools/drives/invariants.mjs, tools/mutants/drive.json, tools/mutants/invariants.json,
  tools/mutate.mjs or .github/workflows/gates.yml; mutate's own (mutate.json, 498 s on the gates on 2026-11-17) on a
  change to tools/mutate.mjs, tools/mutants/mutate.json, tools/drive.mjs or the gates workflow. Since 2026-11-21 every
  other list, mutate.core.json (run with `selftest core`) among them, runs on a change to its tool, its list, a file of
  tools/ its tool spells as a quoted name, tools/mutate.mjs or the gates workflow; a list GATED does not name runs on
  every pull request, and mutate's selftest fails on it. A run
  stopped at mutate's limit, or a selftest that stops itself at its own (exit 124, when no check has failed yet),
  runs once more alone, then counts as timed out, never as caught, and fails the list unless its entry declares
  `"timeout": "<reason>"`.

## Labs work

- Designing or restyling anything a visitor sees in labs/: use the labs-design skill. It carries the plate
  language, each world's material and the looks the anti-tells gate rejects.
- Building one lab: the labs-build skill (it forks; one lab per run, in its own worktree).
- Grading a lab: the labs-grade skill. A lab is never graded by the session that built it, because builders'
  self-ratings ran four to five levels above independent grades on 2026-11-12.
- Path-scoped conventions for labs/ are in .claude/rules/labs.md.
