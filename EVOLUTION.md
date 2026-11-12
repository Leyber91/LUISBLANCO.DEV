# EVOLUTION

One entry per daily run, newest first: the date, the roadmap item, what changed, the gates' results, and whether it
merged. A run that changed nothing still writes its entry, with the reason.

## 2026-11-12, Labs: Token EKG measures instead of drawing

- Every number on the page is a measurement or a dated recording. Three real tokenizers run in the browser (o200k,
  cl100k and Qwen3) and each matches its reference library's ids on 61 of 61 test texts; the same sentence,
  Article 1 of the Universal Declaration of Human Rights, costs 33 tokens in English and 512 in Burmese under cl100k.
- A fourth tokenizer, Mistral v0.3, left the lab the same day: one of its 32,768 word pieces fails the site's
  privacy gate, which is not weakened for a data file. The 13 mistral:7b recordings stay; where their tokenizer
  cross-check would appear, the page says it is unavailable.
- With a local model, a reply is timed chunk by chunk and checked against the server's own counters; the decode rate
  is (tokens - 1) / (last - first chunk time), within a median 0.75% of the server's figure on 76 recordings. Without
  one, 80 recorded runs replay, labelled as recordings with their date and model.
- Independent grade on the lab's own ladder: level 2 to 2 (tokenizer fidelity 9, graded while the Mistral tokenizer
  was in the lab; that axis's rung 5 asks for a SentencePiece vocabulary, which the lab no longer has). The fixes
  that the grade asked for (the rate formula, a stopped run left marked live, Enter to start) were verified before
  publishing.
- Checks: 49 tests in labs/assets/js/token-ekg/tests/run.mjs, run by the site gate.

## 2026-11-12, Mobile pass on the home page and the labs hub (roadmap item 3)

- Item 1 had nothing to fix: node tools/site_check.mjs reports 20 pages and 0 findings on main today. Item 2 still
  has no link to remove: no tracked file outside _archive/ references labs/weather/. Both stay in "Next" for Luis,
  as the last two entries said. This run built item 3.
- Labs hub, found: at every width below about 470 px the menu toggle sat past the right edge (x = 413 to 442 px on a
  390 px screen), so on a phone the project menu could not be opened. The cause was the brand link, 278 px wide with
  no wrapping, plus the AI status label.
- Labs hub, changed (labs/assets/css/hub.css only): at 520 px and below the brand is set smaller with tighter
  letter-spacing and the header gap shrinks; at 440 px and below the status label is hidden visually, keeping the
  dot, the title and the text for screen readers. At 320, 360, 390 and 430 px the brand shows in full and the toggle
  ends at 301, 341, 371 and 409 px. Above 520 px nothing changes.
- Home page, measured and left unchanged: no link or button sits outside the screen at 390 px except the project
  cards inside the horizontal carousel, which is meant to scroll. Decorative halos reach x = 402 px; the body clips
  them, so a finger cannot scroll the page sideways, though a script can move it 2 px. Fixing that would mean changing
  overflow on the root element, which can break sticky elements, so it is noted here for Luis instead.
- Checks: privacy_gate.py --selftest 16 of 16; node tools/site_check.mjs 20 pages, 0 findings. No script changed, so
  there was no syntax check to run. Render: the labs hub and the home page loaded in headless Chromium over a local
  http server at 1280 px and 390 px. On the labs hub the toggle was clicked at 390 px and the menu opened (x = 55 to
  390). The page scroll width was 1280 and 390, so nothing overflowed. The only console error on the labs hub was
  the existing request to a local model server on port 11434, which is refused when none is running and is the
  same on main. The home page had no console errors. Forbidden-name check: runs in the gates workflow on the pull
  request.
- Gates on pull request #12: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-11, Labs: Personalized Plans rebuilt around a planner

- A deterministic planner makes every decision: session load (Foster et al., 2001), a fitness-fatigue model
  (Banister et al., 1975), periodisation, and a constraint solver for days, kit and injuries with an exercise
  substitution graph. Logging a missed or hard week re-plans the rest of the block.
- The model only narrates the planner's log; any narrated sentence with a number or lift not in the log is struck
  through on the page. Not medical advice.
- Independent grade: level 1 to 1. The muscle volume map's first rung is not met, which caps the lab.
- Checks: 8,351,171 planner checks in labs/assets/js/workout-plans/test/planner.test.mjs, run by the site gate.

## 2026-11-11, Labs: AI in Healthcare built (Glass Ward)

- New lab. A 20-bed synthetic ward where the published NEWS2 score (Royal College of Physicians, 2017) and a model
  trained in the visitor's browser raise alerts side by side; a scorecard at the end of the shift shows which system
  caught each deteriorating patient and how early.
- Per patient: exact score contributions, the smallest change in vital signs that would flip the decision, and a
  model-written explanation checked claim by claim against the numbers. Synthetic records only; not medical advice.
- Independent grade on the lab's own ladder: level 0 to 2. Weakest: head-to-head evaluation (the results do not yet
  state their unit, the observation set, or the 24 h horizon).
- Checks: 16 tests in labs/assets/js/ai-health/tests.mjs, run by the site gate.

## 2026-11-11, Labs: Trending Topics measures what is rising

- Six keyless sources (Hacker News, Show HN, GitHub, Wikipedia in English, German and Spanish) are scored as rates
  against each item's own baseline, with exact 95% Poisson intervals and the formulas on the page.
- Scans are stored in the browser and earlier "rising" calls are checked on later scans.
- The page reports its own backtest: over 42, 23 and 30 days of Wikipedia data, ranking by rise beats a naive
  day-over-day ranking by about 3 points and loses to plain size on next-day views by 7 to 13 points.
- Independent grade: level 2 to 3. Weakest: rising-call verification, design language.
- Checks: 82 assertions in labs/assets/js/trending/tests.mjs, run by the site gate.

## 2026-11-11, Labs: DATASPACE rebuilt as a rate-distortion instrument

- A conversation is compressed by a model at five strengths and rebuilt from the capsule alone; the page plots a
  rate-distortion curve and scores what survived on numbers, dates, names and turns as well as letters.
- A lossless floor is measured live in the browser by three compressors (DEFLATE, Brotli, PPM order 4). On the
  Canterbury Corpus file alice29.txt the page is within 0.56% of gzip -6.
- 159 recorded runs from three local models (llama3.1:8b, qwen3:8b, granite4.1:3b) ship with their prompts, seeds
  and raw replies. On the default sample a plain head-cut baseline beats all three models on letter-level fidelity
  at levels 1 to 4; the page shows that as measured.
- Independent grade on the lab's own ladder (a rater who did not build it, two skeptics): level 2 to 3. Weakest:
  readout views, legibility over the horizon, compression literacy.
- Checks: 699 engine checks in labs/assets/js/dataspace/tests.mjs, run by the site gate.

## 2026-11-11, Labs: Honesty Decoder computes its figures

- No percentage is typed in any more. Each system's claim is split into sub-claims, and each sub-claim is checked
  in the visitor's browser against the deployed lab: cited code lines fetched and hashed, labs loaded in a hidden
  frame, the Black Hole shader's own integrator compared with the published shadow edge (2.583 against 2.598 r_s).
- The Figure, typed in as 66% real in June, computes to 38%.
- A pasted claim is split by rule; on a held-out set of claims the splitter scores precision 0.94, recall 0.82.
- Independent grade: level 2 to 3. Weakest: pasted-claim decomposition, row truth, register language, method
  explanation, reach.
- Checks: 216 tests in labs/assets/js/honesty-decoder/tests.mjs, run by the site gate.

## 2026-11-11, What changed strip on the home page (roadmap item 3)

- Item 1 ("Fix what the site checks found") had nothing to fix: node tools/site_check.mjs reports 19 pages and 0
  findings on main today. It stays in "Next" as a standing item.
- Item 2 ("The labs hub links to labs/weather/") has no link to remove: no tracked file outside _archive/ references
  labs/weather/, and labs/assets/js/config/site.config.js does not list it. Left in "Next" for Luis to strike or
  reword, as the 2026-11-10 entry suggested. So this run built item 3, the first item with work in it.
- Home page, section 02: an aside "what changed" under the AEA link lists the last five "## YYYY-MM-DD, item"
  headings of EVOLUTION.md, date and item, with a link to the full log. src/routes/spa-home.js fetches EVOLUTION.md
  once per page load and fills the list with textContent; the aside stays hidden if the fetch fails or finds no
  entry. Styles in styles/home.css; at 760 px and below the date sits above the item.
- EVOLUTION.md is served at https://luisblanco.dev/EVOLUTION.md as text/markdown (checked with curl before building).
- Checks: privacy_gate.py --selftest 16 of 16; node tools/site_check.mjs 19 pages, 0 findings; node --check
  src/routes/spa-home.js passed. Render: home page loaded in headless Chromium over a local http server at 1280 px and
  390 px wide; the strip showed the two existing entries at both widths, no console errors at either width. The page
  scroll width (1549 px at 1280, 391 px at 390) is the same on main without this change, and the body clips it, so
  this change adds no sideways overflow. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #2: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed. The
  gates ran within seconds of the pull request opening.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

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
- Gates on pull request #1: privacy passed (selftest and forbidden-name scan), site passed (19 pages, 0 findings),
  GitGuardian passed. The gates run started about four minutes after the pull request opened.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-10, setup (not a routine run)

- History rewritten. Removed from every commit: the session transcripts folder, the concept pipeline's intermediate
  files (register/work/), and the encrypted Codex archive with every old version of it, because its key had been
  written in a handoff note. That note no longer holds the key.
- Project labels in the concept graph now describe the logic and architecture of each piece of work instead of naming
  it.
- The Codex is offline until it is rebuilt under a new key. The rest of the site is unchanged.
- Added the gates workflow (privacy, site checks), tools/privacy_gate.py, ROADMAP.md, this file and SITE_RULES.md.
- The daily routine runs at 05:00 UTC (06:00 in Madrid in winter). Its first run was started by hand on setup day.
