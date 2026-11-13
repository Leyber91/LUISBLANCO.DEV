# luisblanco.dev

A public static site on GitHub Pages: every merge to main is live within minutes. The rules every agent follows
here, the daily routine included, are in SITE_RULES.md:

@SITE_RULES.md

## Where things are

- ARCHITECTURE.md: the site's structure and the no-build-step rule (D-7).
- ROADMAP.md and EVOLUTION.md: the routine's queue and its log.
- labs/: the experiments. LABS_LEVELS.md defines how a lab is graded (axes, eleven rungs each, an independent
  rater); labs/levels/<id>.json holds each lab's ladder and grades.
- tools/: the gates (privacy_gate.py, site_check.mjs, levels.mjs, lab_tests.mjs, anti_tells.mjs) and the lab
  worktree tool (labs-wt.mjs). The gates workflow runs them on every pull request.

## Labs work

- Designing or restyling anything a visitor sees in labs/: use the labs-design skill. It carries the plate
  language, each world's material and the looks the anti-tells gate rejects.
- Building one lab: the labs-build skill (it forks; one lab per run, in its own worktree).
- Grading a lab: the labs-grade skill. A lab is never graded by the session that built it, because builders'
  self-ratings ran four to five levels above independent grades on 2026-11-12.
- Path-scoped conventions for labs/ are in .claude/rules/labs.md.
