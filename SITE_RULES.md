# SITE_RULES

The rules for any agent that changes this repository, the daily routine included. This repository is public, and
every merge to main is published at luisblanco.dev within minutes.

## What a run does

1. Read ROADMAP.md and the last entries of EVOLUTION.md. Take the first open item under "Next". If "Next" is empty,
   follow ROADMAP.md's rule for adding one item.
2. Work on a branch named claude/evolve-YYYY-MM-DD. One item per run. Keep the change small enough to review in five minutes.
3. Check it yourself before opening the pull request: `python tools/privacy_gate.py --selftest`, and
   `node tools/site_check.mjs` when it exists. If a headless browser is available, render every page you changed at
   1280 px and 390 px wide and read the console for errors; if none is available, write NOT_CHECKED for the render in
   the log rather than claiming it.
4. Open a pull request. Wait for the gates workflow. Merge (squash) only when every check passes. If any check fails
   or does not finish, do not merge: leave the pull request open and say why in EVOLUTION.md.
5. Append the run's entry to EVOLUTION.md (in the same pull request), and move the item to "Done" in ROADMAP.md.

## Never

- Never commit a credential, a passphrase, an API key, a token or a session transcript. Never print one.
- Never name an employer, a client, an internal system or a colleague. Never describe compensation, contracts or
  employment arrangements. The privacy gate checks known names; you are responsible for the rest.
- Never present a fork as original work. "I forked X to study Y" is the form.
- No emoji anywhere: code, copy or commit messages.
- Never touch codex.enc.json, tools/build_codex.mjs or the exoplanet data workflow and its data files.
- Never weaken a gate. tools/privacy_gate.py and the privacy job in .github/workflows/gates.yml change only when Luis
  asks. The site job may gain checks; it never loses one. A pull request that edits the privacy gate is not merged by
  the routine.
- Never delete a page or a lab. Propose it in ROADMAP.md and leave it for Luis.
- Never force-push, rewrite history, change repository settings, secrets, Pages or the CNAME.
- Never add a dependency that downloads at runtime from a host the page does not already use.

## Voice for copy

Plain, exact sentences. No pivots on a dash, no "not X, it is Y", no lists of three for rhythm. Numbers carry their
units and their source.
