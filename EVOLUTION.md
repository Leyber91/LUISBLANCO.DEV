# EVOLUTION

One entry per daily run, newest first: the date, the roadmap item, what changed, the gates' results, and whether it
merged. A run that changed nothing still writes its entry, with the reason.

## 2026-11-10, Site checks (roadmap item 1)

- Added tools/site_check.mjs (Node, no dependencies). For every published HTML page it checks that each local href,
  src, srcset and poster resolves to a tracked file (a directory to its index.html), that the page has a doctype and
  that every non-void element without an optional end tag opens and closes in order. It also checks that every page the
  labs hub lists in labs/assets/js/config/site.config.js exists. Exit 1 on any finding.
- Published means tracked and not under a path segment starting with "_" or ".": the repository has no .nojekyll, so
  the Pages build leaves those out. https://luisblanco.dev/_archive/protos/preview.html returns 404, which confirms it.
  The checker treats a link into such a path as missing.
- The gates workflow already runs the file when present, so it was not edited.
- Findings: none on the 19 published pages or the hub config. The 24 broken references it reports when _archive/ is
  included are all in _archive/protos/, which is not served. No new roadmap items.
- Roadmap item "The labs hub links to labs/weather/": no file in the repository references labs/weather/, and the
  hub config does not list it. Luis may want to strike or reword that item.
- Checks: privacy_gate.py --selftest 16 of 16; node --check tools/site_check.mjs passed; node tools/site_check.mjs
  passed (19 pages, 0 findings); the checker was also run on a scratch repository with planted faults (unclosed span,
  missing image, directory without index.html, link into an underscore path, missing doctype, missing hub config) and
  reported all six. Render: no page changed, so nothing to render. Forbidden-name check: runs in the gates workflow
  on the pull request.
- Merged: pending the gates workflow.

## 2026-11-10, setup (not a routine run)

- History rewritten. Removed from every commit: the session transcripts folder, the concept pipeline's intermediate
  files (register/work/), and the encrypted Codex archive with every old version of it, because its key had been
  written in a handoff note. That note no longer holds the key.
- Project labels in the concept graph now describe the logic and architecture of each piece of work instead of naming
  it.
- The Codex is offline until it is rebuilt under a new key. The rest of the site is unchanged.
- Added the gates workflow (privacy, site checks), tools/privacy_gate.py, ROADMAP.md, this file and SITE_RULES.md.
- The daily routine runs at 05:00 UTC (06:00 in Madrid in winter). Its first run was started by hand on setup day.
