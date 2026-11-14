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
  scenario per lab under tools/drives/). The gates workflow runs the gates on every pull
  request.

## Committing

- Read `git status --short` and stage files by name. Staging a whole folder once carried a tool's local cache
  (wrangler's account file) into a pushed commit on 2026-11-13; tools leave such files wherever they run.
- Merge with `node tools/ship_pr.mjs <number>`. It waits for the privacy and site checks, merges only when every
  check has passed, squashes by default and makes a merge commit only for labs/foundation. Pull request 19 was
  merged before its checks had started on 2026-11-13.
- A gate that node runs is done when its rules are listed in tools/mutants/<tool>.json and
  `node tools/mutate.mjs` shows its selftest catches each one, and after a reviewer who did not write it has read
  it. atlas.mjs, evolution.mjs, lab_tests.mjs, mutate.mjs, ship_pr.mjs and stories.mjs have such a list;
  levels.mjs and anti_tells.mjs have a selftest and no list yet, so add one when you change them. A list needs two
  kinds of mutant: one that silences each report, and one that loosens each condition, with a case just inside
  and just outside every bound. The first kind alone reads as full coverage and is not: on 2026-11-14 every report
  of two gates was caught while 51 of 68 loosened conditions still passed. On 2026-11-13 a
  checker that passed its own selftest 90 of 90 had 31 defects a review then confirmed, and the small tools
  written to prevent that had 19 of their own, then 27 more in a second review.

## Labs work

- Designing or restyling anything a visitor sees in labs/: use the labs-design skill. It carries the plate
  language, each world's material and the looks the anti-tells gate rejects.
- Building one lab: the labs-build skill (it forks; one lab per run, in its own worktree).
- Grading a lab: the labs-grade skill. A lab is never graded by the session that built it, because builders'
  self-ratings ran four to five levels above independent grades on 2026-11-12.
- Path-scoped conventions for labs/ are in .claude/rules/labs.md.
