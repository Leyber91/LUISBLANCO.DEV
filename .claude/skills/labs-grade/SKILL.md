---
name: labs-grade
description: Grade one generation of a lab against its fixed ladder as the independent rater, from the running page and the code, and write the grade. Use after a lab build is committed, never in the session that built it. Argument is the worktree name and the generation (for example "heptapod G2").
context: fork
agent: general-purpose
argument-hint: <worktree name> <generation>
---

# Grade one lab generation: $ARGUMENTS

You did not build this generation, and you grade it strictly. Builders' self-ratings ran four to five levels above
independent grades on 2026-11-12; the grade is worth something only if it holds against a skeptic.

## The ladder

labs/levels/<hub id>.json in the lab's worktree (`../_labs_wt/<name>`): axes, each with a metric, eleven rungs and
earlier generations. LABS_LEVELS.md defines the frames and the lab level: the lower median of the axis levels,
capped at the weakest axis plus two.

## Rating

- A rung counts only if the running page shows it or the code demonstrably executes it on the page's real path.
  Dead code, a stub, a TODO, or a feature behind a flag the visitor cannot reach does not count.
- Rungs are cumulative: level L needs every rung up to L. Between two rungs, take the lower.
- Evidence names a file and function, or what a screenshot shows.
- Screenshots: `node tools/labs-wt.mjs shoot <name>` (desktop and phone images plus console errors), and
  `shoot <name> "<page>?<params>"` for any state the page exposes by URL. Read every image.
- The builder's report is a list of claims to check.

## Two skeptic passes

After rating, try to lower each grade of 1 or more, once per lens, and default to the lower level when uncertain:

1. Does it run: open the code path from the page's entry module, confirm it is wired and shown, the console is
   clean of errors that break it, and the phone image has no overflow or unreachable control where the rung
   needs phone support.
2. The letter of the rung: read the exact text of every rung up to the claimed level and test it literally (the
   number, the named method, the threshold, the citation). A rung half met is not met. Flag any citation you cannot
   confirm.

The independent form of this protocol runs the rater and the two skeptics as three separate agents started by the
coordinating session, then settles: for each axis the lowest level among disputes whose reason holds. Run alone,
you hold all three roles; record that in the history entry as "by": "single rater, two skeptic passes".

## Writing the grade

The ladder file is the one file you edit. Add `"<gen>": {"level": n, "evidence": "..."}` to every axis's `levels`
(the rungs and earlier generations stay as they are), and append to `history`
`{"gen": "<gen>", "date": "<YYYY-MM-DD>", "by": "...", "commit": "<short hash of the graded commit>"}`. Then, from
the worktree:

    node tools/levels.mjs check <hub id> && node tools/levels.mjs sheet <hub id> && node tools/levels.mjs next <hub id>

Commit the ladder file alone with the message "levels: <hub id> <gen> graded by an independent rater".

## Report

The sheet verbatim, the lab level before and after, the weakest axes, the next rungs, and every disputed axis with
the reason it moved.
