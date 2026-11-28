# EVOLUTION

One entry per daily run, newest first: the date, the roadmap item, what changed, the gates' results, and whether it
merged. A run that changed nothing still writes its entry, with the reason.

## 2026-11-28, Seed's rule fields have names (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, and the 2026-11-17 sweep has no finding left the routine can fix, so this run swept again: the 29 published
  pages outside tools/ and _archive/ (labs/bh_animation_page.html and its v1 left out, as on 2026-11-17) in headless
  Chromium at 1280 px and 390 px over a local http server, recording script errors, failed local requests, the
  document scroll width, a language, a title, a description, images without alt text, and buttons, links and form
  fields without an accessible name.
- Found: on labs/seed.html the two rule fields (the bodies of the rewrite rules for X and F) had no accessible name,
  so a screen reader announced two bare text boxes; the 2026-11-18 fix named the five fields above them and not
  these, which the page writes from its script. Not counted: the three range sliders on the home page sit in the
  Tweaks panel (src/ui/spa-tweaks.js), which is display:none unless a parent editing frame opens it, so a visitor
  never reaches them; the 20 bed-lane buttons on labs/ai-health.html are aria-hidden with tabindex -1 by design.
  No page is wider than the screen, and the console errors are the expected ones (labs probing for a local model,
  The Roaster's live request refused by CORS from localhost, labs/claude-prep/ requesting seal.json).
- Changed (labs/seed.html, one line): each rule field the page writes gets the name "rule for " and its symbol.
  Measured in headless Chromium at 1280 and 390 px: 0 textboxes named "rule for ..." before, 2 after ("rule for X"
  and "rule for F"), and the fields keep their names after a press of grow redraws them; their values and widths
  (248 px and 298 px) are unchanged. Nothing a visitor sees changed.
- Still open for later runs of item 1: labs/claude-prep/ has no meta description and requests seal.json, which
  returns 404 (Luis decides; its source is not in this repository). Item 2: no tracked file outside _archive/
  references labs/weather/ today (a search of the .js, .html and .json files finds the word only in lab data and
  comments), so there is no link to remove; Luis may strike or close it.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors (levels selftest 12 of 12); lab tests 105 files, 0 failed; atlas selftest 114 of 114, stories 87 of 87,
  evolution 109 of 109, and their checks pass (stories prints NOT_CHECKED for the private plans); anti-tells
  selftest 27 of 27, no new tells, and node tools/anti_tells.mjs scan labs/seed.html lists 7 tells before and
  after, none on the changed line. The change is inside an inline script of an HTML page, so there is no separate
  file for node --check; the page ran it in Chromium with 0 errors. The mutate run was not repeated (no tool
  changed) and runs in the gates workflow. Render: labs/seed.html at 1280 px and 390 px in headless Chromium over a
  local http server, 0 console errors, and the document scroll width equal to the screen width. Forbidden-name
  check: runs in the gates workflow on the pull request.

## 2026-11-27, The hero prototype has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  two left, labs/claude-prep/ is a build output whose source is not in this repository (Luis decides), so this run
  took hero_proto.html. No tracked page outside _archive/ links to it.
- Cause: hero_proto.html had a title and no meta description, so a shared link to it showed no summary.
- Changed (hero_proto.html, one added line): a meta description of 226 characters taken from the page's own name,
  plate, figure label and counts: a prototype of the home page hero, the name on a blueprint plate, the autonomous
  entity architecture drawn live as its figure (5 axes, 10 seeds, 4 mechanics, 4 ops and 3 rules), which a visitor
  can drag to turn. Nothing a visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: labs/claude-prep/ has no
  meta description and requests seal.json, which returns 404 (Luis decides; its source is not in this repository).
  With that, the routine has no meta-description finding left it can fix. Item 2 was not re-checked today; on
  2026-11-21 no tracked file outside _archive/ referenced labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors (levels selftest 12 of 12); lab tests 105 files, 0 failed; atlas selftest 114 of 114, stories 87 of 87, evolution 109
  of 109, and their checks pass (stories and evolution print NOT_CHECKED for the private plans); anti-tells
  selftest 27 of 27, and node tools/anti_tells.mjs scan hero_proto.html lists 4 tells before and after, none on the
  changed line. No script changed, so there was no syntax check to run. The mutate run was not repeated (no tool
  changed) and runs in the gates workflow. Render: hero_proto.html at 1280 px and 390 px in headless Chromium over
  a local http server, 0 console errors, the description present, and the document scroll width equal to the
  screen width. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #100: privacy passed (selftest and forbidden-name scan), site passed (every step, lab tests
  and the mutation test included), GitGuardian passed, on the first commit of the branch. Pull requests #90
  (gates) and #99 (heptapod) merged to main during the run, so main was merged into the branch (no rebase) and the
  gates ran again. The run applies tools/ship_pr.mjs's rules by hand over the GitHub API, as on 2026-11-26: both
  required checks and every other check must pass on the head commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-26, The Leak Map demo has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  three left, labs/claude-prep/ is a build output whose source is not in this repository (Luis decides), and
  hero_proto.html and leak_map_demo.html are linked from no page. This run took leak_map_demo.html because the
  three-demonstrations page, fixed on 2026-11-25, describes it first.
- Cause: leak_map_demo.html had a title and no meta description, so a shared link to it showed no summary.
- Changed (leak_map_demo.html, one added line): a meta description of 331 characters taken from the page's own
  heading, subtitle and labels and from its four detectors: the dollars a logistics operation leaks each week,
  each traced to the source rows that prove it (freight billed above contract, duplicate charges, expedite premiums
  after a missed connection, stale fuel rates), then driven toward zero, on illustrative synthetic data. Nothing a
  visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: hero_proto.html and
  labs/claude-prep/ have no meta description; labs/claude-prep/ requests seal.json, which returns 404 (Luis
  decides). Item 2 was not re-checked today; on 2026-11-21 no tracked file outside _archive/ referenced
  labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors (levels selftest 12 of 12); lab tests 105 files, 0 failed; atlas selftest 114 of 114, stories 87 of 87,
  evolution 109 of 109, and their checks pass (stories and evolution print NOT_CHECKED for the private plans);
  anti-tells selftest 27 of 27, no new tells, and node tools/anti_tells.mjs scan leak_map_demo.html lists 3 tells
  before and after, none on the changed line. No script changed, so there was no syntax check to run. The mutate
  run was not repeated (no tool changed) and runs in the gates workflow. Render: leak_map_demo.html at 1280 px and
  390 px in headless Chromium over a local http server, 0 console errors, the description present, and the document
  scroll width equal to the screen width. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #98: privacy passed (selftest and forbidden-name scan), site passed (every step, lab tests
  and the mutation test included), GitGuardian passed, on the first commit of the branch. The run applies
  tools/ship_pr.mjs's rules by hand over the GitHub API, as on 2026-11-25: both required checks and every other
  check must pass on the head commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-25, The three-demonstrations page has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  four left, labs/claude-prep/ is a build output whose source is not in this repository (Luis decides), and
  hero_proto.html, leak_map_demo.html and triad_demos.html are linked from no page. This run took triad_demos.html
  because the home page's demos were ported from it (src/routes/spa-demos.js) and it links to the other demos.
- Cause: triad_demos.html had a title and no meta description, so a shared link to it showed no summary.
- Changed (triad_demos.html, one added line): a meta description of 297 characters taken from the page's own
  heading and its three cards: one rule, make the waste visible and drive it toward zero, and what each of The Leak
  Map, TokenGateKeeper and Conjunction Driver does, with the page's note that the data is synthetic unless a live
  source is named. Nothing a visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: hero_proto.html,
  labs/claude-prep/ and leak_map_demo.html have no meta description; labs/claude-prep/ requests seal.json, which
  returns 404 (Luis decides). Item 2 was not re-checked today; on 2026-11-21 no tracked file outside _archive/
  referenced labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors (levels selftest 12 of 12); lab tests 105 files, 0 failed; atlas selftest 114 of 114,
  stories 87 of 87, evolution 109 of 109, and their checks pass (stories prints NOT_CHECKED for the private
  plans); anti-tells selftest 27 of 27, and node tools/anti_tells.mjs scan triad_demos.html lists 12 tells before
  and after, none on the changed line. No script changed, so there was no syntax check to run. The
  mutate run was not repeated (no tool changed) and runs in the gates workflow. Render: triad_demos.html at 1280 px
  and 390 px in headless Chromium over a local http server, 0 console errors, the description present, and the
  document scroll width equal to the screen width. Forbidden-name check: runs in the gates workflow on the pull
  request.
- Gates on pull request #97: privacy passed (selftest and forbidden-name scan), site passed (every step, lab tests
  and the mutation test included), GitGuardian passed, on the first commit of the branch. The run applies
  tools/ship_pr.mjs's rules by hand over the GitHub API, as on 2026-11-24: both required checks and every other
  check must pass on the head commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-24, The 404 page has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  five left in that list, this run took 404.html, which GitHub Pages serves for every address that has no page.
  labs/claude-prep/ is also listed on the labs hub (labs/assets/js/config/site.config.js), but its index.html is
  the output of a build (it loads assets/index-BW1plUG6.js) and its source is not in this repository, so a hand
  edit there may be lost on the next publish (Luis decides). hero_proto.html, leak_map_demo.html and
  triad_demos.html are linked from no page; the home page's demos were ported from triad_demos into
  src/routes/spa-demos.js. This run did not repeat the full sweep.
- Cause: 404.html had a title and no meta description, so a shared link to a missing address showed no summary.
- Changed (404.html, one added line): a meta description of 148 characters saying there is no page at the address
  and that the home page links to the work, the labs and the log. The header comment names tools/publish_labs.py,
  which is no longer in tools/, so nothing regenerates the file. Nothing a visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: hero_proto.html,
  labs/claude-prep/, leak_map_demo.html and triad_demos.html have no meta description; labs/claude-prep/ requests
  seal.json, which returns 404 (Luis decides). Item 2 was not re-checked today; on 2026-11-21 no tracked file
  outside _archive/ referenced labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors (levels selftest 12 of 12); lab tests 105 files, 0 failed; atlas selftest 114 of 114, stories 87
  of 87, evolution 109 of 109, and their checks pass (stories prints NOT_CHECKED for the private plans); anti-tells
  selftest 27 of 27, no new tells, and node tools/anti_tells.mjs scan 404.html finds 0. No script changed, so there was no syntax check to run. The mutate run was not repeated (no
  tool changed) and runs in the gates workflow. Render: 404.html at 1280 px and 390 px in headless Chromium over a
  local http server, 0 console errors, the description present, and the document scroll width equal to the screen
  width. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #96: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
  The run applied tools/ship_pr.mjs's rules by hand over the GitHub API, as on 2026-11-23: both required checks and
  every other check passed on the head commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-23, The Roaster has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  six left in that list, labs/roaster.html is the only lab listed on the labs hub (src/ui/lab.js); the others are
  the 404 page, two demo pages, the hero prototype and labs/claude-prep/. This run did not repeat the full sweep.
- Cause: labs/roaster.html had a title and no meta description, so a search result or a shared link showed no
  summary of the page.
- Changed (labs/roaster.html, one added line): a meta description of 300 characters, taken from the page's own
  subtitle and its blurb on the labs hub: a model that roasts the myth of a named system or of the visitor's own
  claim, and grades how much of it is real. Nothing a visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: 404.html,
  hero_proto.html, labs/claude-prep/, leak_map_demo.html and triad_demos.html have no meta description;
  labs/claude-prep/ requests seal.json, which returns 404 (Luis decides). Item 2 was not re-checked today; on
  2026-11-21 no tracked file outside _archive/ referenced labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors; lab tests 105 files, 0 failed; atlas, stories and
  evolution checks pass (stories prints NOT_CHECKED for the private plans); anti-tells selftest 27 of 27; node tools/anti_tells.mjs scan labs/roaster.html lists 33
  tells before and after, none on the changed line. No script changed, so there was no syntax check to run. The
  mutate run was not repeated (no tool changed) and runs in the gates workflow. Render: labs/roaster.html at 1280
  px and 390 px in headless Chromium over a local http server; the description is present, the document scroll
  width equals the screen width, and the only console errors are the expected ones, the live roast request refused
  by CORS from localhost, as on 2026-11-19. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #95: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
  The run applied tools/ship_pr.mjs's rules by hand over the GitHub API, as on 2026-11-22: both required checks and
  every other check passed on the head commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-22, Seed has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 31 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  seven left in that list, labs/seed.html is the most visible: the home page lists the labs in the order Honesty
  Decoder, The Figure, Seed, and the first two have one. This run did not repeat the full sweep.
- Cause: labs/seed.html had a title and no meta description, so a search result or a shared link showed no summary
  of the page.
- Changed (labs/seed.html, one added line): a meta description of 330 characters, taken from the page's own
  subtitle and its blurb on the labs hub (src/ui/lab.js): one symbol and four rules rewritten at once each
  generation, a motif turned into a new rule, and no model or network. Nothing a visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: 404.html,
  hero_proto.html, labs/claude-prep/, labs/roaster.html, leak_map_demo.html and triad_demos.html have no meta
  description; labs/claude-prep/ requests seal.json, which returns 404 (Luis decides). Item 2 was not re-checked
  today; on 2026-11-21 no tracked file outside _archive/ referenced labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 31 pages, 0 findings; levels 32 labs, 0
  errors; atlas, stories and evolution checks pass (stories prints NOT_CHECKED for the private plans); anti-tells
  selftest 27 of 27; node tools/anti_tells.mjs scan labs/seed.html lists 7 tells, the same count as on 2026-11-18,
  none on the changed line; lab tests 105 files, 0 failed. No script changed, so there was no syntax check to run. The mutate run was
  not repeated (no tool changed) and runs in the gates workflow. Render: labs/seed.html at 1280 px and 390 px in
  headless Chromium over a local http server, 0 console errors, the description present, and the document scroll
  width equal to the screen width. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #94: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
  The run applied tools/ship_pr.mjs's rules by hand over the GitHub API, as on 2026-11-21: both required checks and
  every other check passed on the head commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-21, The Figure has a meta description (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 29 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: pages with no meta description. Of the
  eight in that list, labs/figure.html is the most visible: the home page lists the labs in the order Honesty
  Decoder (which has one), The Figure, Seed. This run did not repeat the full sweep.
- Cause: labs/figure.html had a title and no meta description, so a search result or a shared link showed no
  summary of the page.
- Changed (labs/figure.html, one added line): a meta description of 327 characters, taken from the page's own
  subtitle and its blurb on the labs hub (src/ui/lab.js): three persona-framed calls, a local router that measures
  agreement and dissent, a fourth call that synthesises, and the trap questions. Nothing a visitor sees changed.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: 404.html,
  hero_proto.html, labs/claude-prep/, labs/roaster.html, labs/seed.html, leak_map_demo.html and triad_demos.html
  have no meta description; labs/claude-prep/ requests seal.json, which returns 404 (Luis decides). Item 2 still has
  no link to remove: no tracked file outside _archive/ references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 29 pages, 0 findings; levels 32 labs, 0
  errors; atlas, stories and evolution checks pass (stories prints NOT_CHECKED for the private plans); anti-tells
  selftest 27 of 27; node tools/anti_tells.mjs scan labs/figure.html lists 23 tells before and after, none on the
  changed line; lab tests 100 files, 0 failed. No script changed, so there was no syntax check to run. The mutate run was not
  repeated (no tool changed) and runs in the gates workflow. Render: labs/figure.html at 1280 px and 390 px in
  headless Chromium over a local http server, 0 console errors, the description present, and the document scroll
  width equal to the screen width. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #84: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
  tools/ship_pr.mjs could not read the pull request from this session (GitHub GraphQL is refused here), so the
  run applied its rules by hand over the REST API: both required checks and every other check passed on the head
  commit, and the branch contains main.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-20, The Dimensions dial's slider has a name (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 29 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: the unnamed range slider on
  labs/md_animation_page.html (Dimensions), the last unnamed form field in that list. This run did not repeat the
  full sweep.
- Cause: labs/assets/js/dimensional_mania/Console.js builds the Plane Dial's scrub slider (-180 to 180 degrees)
  with no label and no aria-label, so a screen reader announced a bare slider. The plane name and the degrees shown
  beside it are separate divs, not tied to it.
- Changed (Console.js, one added line): the slider carries aria-label "angle of the selected plane, in degrees".
  Measured in headless Chromium over a local http server at 1280 and 390 px: the page had 1 form field with no name
  and no slider by that name before, and 0 unnamed fields and one such slider after. The slider keeps its position
  and size to the pixel at both widths, and the document scroll width equals the screen width.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: 404.html, hero_proto.html,
  labs/claude-prep/, labs/figure.html, labs/roaster.html, labs/seed.html, leak_map_demo.html and triad_demos.html
  have no meta description; labs/claude-prep/ requests seal.json, which returns 404 (Luis decides). Item 2 still has
  no link to remove: no tracked file outside _archive/ references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 29 pages, 0 findings; levels 32 labs, 0
  errors; lab tests 100 files, 0 failed (dimensional_mania has no tests yet); atlas, stories and evolution checks
  pass (stories prints NOT_CHECKED for the private plans); anti-tells selftest 27 of 27; node tools/anti_tells.mjs
  scan of Console.js lists 2 tells before and after, none on the changed line. node --check on Console.js passes.
  The mutate run was not repeated (no tool changed) and runs in the gates workflow. Render:
  labs/md_animation_page.html at 1280 px and 390 px in headless Chromium, 0 console errors before and after.
  Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #83: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-19, The Roaster's claim box has a name (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 29 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open: the claim box on labs/roaster.html, which
  comes before labs/md_animation_page.html (one range slider) in that list. This run did not repeat the full sweep.
- Cause: the caption "roast your own claim" above the box was a div, not tied to the textarea, so a screen reader
  announced a bare text box.
- Changed (labs/roaster.html, two lines): the caption is a label for claim, and the .rl rule states display:block so
  the label keeps the block layout the div had. Measured in headless Chromium over a local http server at 1280 and
  390 px: the box had 0 labels and no textbox named "roast your own claim" before, and has 1 label and one such
  textbox after. The caption and the box keep their position and size to the pixel at both widths, the caption keeps
  its 10.5 px size, colour rgb(107, 118, 130), 2.52 px letter spacing and block display, and the document scroll
  width equals the screen width.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: the unnamed range slider
  on labs/md_animation_page.html; 404.html, hero_proto.html, labs/claude-prep/, labs/figure.html, labs/roaster.html,
  labs/seed.html, leak_map_demo.html and triad_demos.html have no meta description; labs/claude-prep/ requests
  seal.json, which returns 404 (Luis decides). Item 2 still has no link to remove: no tracked file outside _archive/
  references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 29 pages, 0 findings; levels 32 labs, 0
  errors; lab tests 100 files, 0 failed; atlas, stories and evolution checks pass (stories prints NOT_CHECKED for the
  private plans); anti-tells selftest 27 of 27 and no new tells; node tools/anti_tells.mjs scan labs/roaster.html
  lists 33 tells before and after, none on a changed line. The mutate run was not repeated (no tool changed) and
  runs in the gates workflow. No script file changed, so there was no syntax check to run. Render: labs/roaster.html
  at 1280 px and 390 px in headless Chromium; the only console errors are the expected ones, the live roast request
  refused by CORS from localhost, the same before and after. Forbidden-name check: runs in the gates workflow on the
  pull request.
- Gates on pull request #82: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-18, Seed's five fields have names (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 29 pages and 0 findings on main
  today, so this run took the next finding the 2026-11-17 sweep left open. The home page lists the labs in the order
  Honesty Decoder, The Figure, Seed; The Figure was fixed on 2026-11-17, so Seed is the most visible page with a
  finding. This run did not repeat the full sweep of every page.
- Cause: on labs/seed.html the captions "grammar", "axiom (the seed)", "angle", "generation" and "replay gen" sat
  beside their fields as label elements with no for attribute (the first four) and a span (the last), so none was
  tied to its field and a screen reader announced five bare controls.
- Changed (labs/seed.html, five lines): each caption is a label for its field (preset, axiom, angle, genin, scrub);
  the "replay gen" span becomes a label with the same class. Measured in headless Chromium over a local http
  server at 1280 and 390 px: the five fields had 0 labels each before and have 1 each after, and each is found by
  its caption as an accessible name. The captions keep their position and width to the pixel at both widths, the
  "replay gen" caption keeps its 10 px size, colour rgb(107, 118, 130) and block display, and the document scroll
  width equals the screen width.
- Still open for later runs of item 1, from the 2026-11-17 sweep and not re-checked today: the unnamed fields on
  labs/roaster.html (the claim box) and labs/md_animation_page.html (one range slider); 404.html, hero_proto.html,
  labs/claude-prep/, labs/figure.html, labs/roaster.html, labs/seed.html, leak_map_demo.html and triad_demos.html
  have no meta description; labs/claude-prep/ requests seal.json, which returns 404 (Luis decides). Item 2 still has
  no link to remove: no tracked file outside _archive/ references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 29 pages, 0 findings; levels 32 labs, 0
  errors; lab tests 88 files, 0 failed; atlas, stories and evolution checks pass (they print NOT_CHECKED for the
  private plans); anti-tells selftest 27 of 27 and no new tells; node tools/anti_tells.mjs scan labs/seed.html
  lists 7 tells before and after, none on a changed line. The mutate run was not repeated (no tool changed) and
  runs in the gates workflow. No script file changed, so there was no syntax check to run. Render: labs/seed.html at
  1280 px and 390 px in headless Chromium, 0 console errors. Forbidden-name check: runs in the gates workflow on the
  pull request.
- Gates on pull request #63: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-17, The Figure's question box has a name (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 28 pages and 0 findings on main
  today. This run loaded the 27 published pages outside tools/ and _archive/ in headless Chromium at 1280 px and 390
  px over a local http server and recorded script errors, failed local requests and the document scroll width; it
  then followed the 30 same-origin links the pages hold after their scripts run (all answer 200) and read each page
  for a language, a title, a description, a viewport, images without alt text, and buttons, links and form fields
  without an accessible name.
- Found: no page is wider than the screen and no script error is new. Five lab pages have form fields with no
  accessible name, so a screen reader announces them as a bare text box: labs/figure.html (the question box),
  labs/roaster.html (the claim box), labs/md_animation_page.html (one range slider) and labs/seed.html (five fields).
  The home page lists the labs in the order Honesty Decoder, The Figure, Seed, so The Figure is the most visible page
  with a finding.
- Cause: on labs/figure.html the caption "the question" above the question box was a span, not tied to the box.
- Changed (labs/figure.html, one line): the caption is a label for q_text. Measured in headless Chromium at 1280 and
  390 px: the box had 0 labels and no textbox named "the question" before, and has 1 label and one such textbox
  after; a click on the caption now focuses the box. The caption keeps its block display, 9 px IBM Plex Mono, colour
  rgb(107, 118, 130) and letter spacing, and the caption and the box keep the same position and size to the pixel at
  both widths. The cursor over the caption changes from auto to default.
- Still open for later runs of item 1: the unnamed fields on labs/roaster.html, labs/md_animation_page.html and
  labs/seed.html; 404.html, hero_proto.html, labs/claude-prep/, labs/figure.html, labs/roaster.html, labs/seed.html,
  leak_map_demo.html and triad_demos.html have no meta description; labs/claude-prep/ requests seal.json, which
  returns 404 (Luis decides). labs/bh_animation_page.html took 21.8 s to fire its load event in headless Chromium
  with software WebGL and logged no script error; that speaks to the headless renderer more than to a visitor's
  browser, and its rebuild is open as draft pull request #48, so it is not counted as a finding. The other console
  errors are expected: labs probing for a local model (connection refused) and The Roaster's live request refused by
  CORS from localhost. Item 2 still has no link to remove: no tracked file outside _archive/ references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 28 pages, 0 findings; levels selftest 12 of
  12 and 32 labs, 0 errors; lab tests selftest 25 of 25 and 43 files, 0 failed; atlas, stories and evolution
  selftests and checks pass (they print NOT_CHECKED for the private plans); mutate selftest and run pass (every
  broken rule caught); model route 56 of 56; anti-tells selftest 27 of 27 and no new tells; node tools/anti_tells.mjs
  scan labs/figure.html lists 23 tells before and after, none on the changed line. The labs build was not run here
  (labs-src is untouched) and runs in the gates workflow. No script file changed, so there was no syntax check to
  run. Render: labs/figure.html at 1280 px and 390 px in headless Chromium, 0 console errors. Forbidden-name check:
  runs in the gates workflow on the pull request.
- Gates on pull request #52: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-16, The hero prototype draws its figure and fits a phone (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 27 pages and 0 findings on main
  today. This run loaded the 25 published pages outside tools/ in headless Chromium at 1280 px and 390 px over a
  local http server and recorded script errors, failed local requests and the document scroll width. The only
  script error was on hero_proto.html, which no page links to but Pages publishes at /hero_proto.html.
- Cause: hero_proto.html loads src/aea3d/aea3d.js without src/data/aea-framework.js, which index.html loads first.
  The renderer read the empty framework and threw "Cannot read properties of undefined (reading '0')" on load, so
  the figure on the right was blank at every width. At 390 px the page kept its two-column desktop layout with
  overflow hidden: it was 704 px wide, and the tagline, the census, the call to action and the whole figure were cut
  off at the right edge with no way to scroll to them.
- Changed (hero_proto.html only, 26 added lines): the page loads the framework data before the renderer; the
  renderer's mobile dock, scrim and sheet join the controls the page already hides in hero mode; at 960 px and
  below the page scrolls in one column with the figure under the name, the top bar, census and title block wrap,
  and the census dots and scroll cue are hidden. Above 960 px the layout is unchanged; 960 px is where the figure's
  axis labels stopped running past the screen edge in the two-column layout (875 px wide at 800 px, 922 at 900).
- Measured over a local http server in headless Chromium: no script error at 1280 or 390 px; document scroll width
  equals the screen width at 320, 360, 390, 430, 760, 960, 961, 1280, 1440 and 1920 px, with no element past the
  right edge. Main measured 704 px at 390 px. At 1280 px the left column matches main by screenshot, and the figure
  now draws.
- Still open for later runs: labs/claude-prep/ requests seal.json, which returns 404 (Luis decides). The other
  console errors in the sweep are expected: the labs probing for a local model on this machine (connection refused)
  and The Roaster's live request refused by CORS from localhost. Item 2 still has no link to remove: no tracked file
  outside _archive/ references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 27 pages, 0 findings; levels selftest 12 of
  12 and 32 labs, 0 errors; lab tests 29 files, 0 failed; atlas, stories and evolution selftests and checks pass (they
  print NOT_CHECKED for the private plans); mutate selftest and run pass (every broken rule caught); model route 56 of
  56; anti-tells no new tells; the labs build was not run here (labs-src is untouched) and runs in the gates workflow.
  No script file changed, so there was no syntax check to run (the change is HTML and CSS). node tools/anti_tells.mjs
  scan hero_proto.html lists 4 tells, all in lines this run did not touch. Render: hero_proto.html at 1280 px and 390
  px (and 320 to 1920 px for width) in headless Chromium, 0 console errors. Forbidden-name check: runs in the gates
  workflow on the pull request.
- Gates on pull request #44: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-15, The home page is as wide as the screen (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 26 pages and 0 findings on main
  today, so this run took the most visible finding left by the 2026-11-14 sweep: the home page (index.html) measured
  1,549 px wide at 1280 px. This run did not repeat the full sweep of every page.
- Cause, corrected: the 2026-11-14 entry blamed the two background canvases (sub-dots, sub-stars). They sit in a
  fixed layer and do not add to the page width; clipping that layer changed nothing (still 1,549 px). Listing every
  element that ends past the screen edge with no clipping ancestor below body found one at 1280 px: the 1440 px
  decorative schematic (svg.mid-schematic) in the "work with me" section, placed from x = 109 px inside the
  1,100 px column, so it ended at x = 1,549 px. At 390 px the contact section's flow lines ended 1 px past the edge.
  Body clips sideways overflow, so a visitor in Chromium could not scroll to it; a browser or tool that reads the
  document width could.
- Changed (styles/spa.css, one line): each full-width page section (.plate-sec) clips its own sideways overflow with
  overflow-x: clip. The sections are as wide as the screen and start at x = 0, so the clip falls where body already
  clipped; clip makes no scroll container, so vertical overflow and sticky headers are untouched.
- Measured over a local http server in headless Chromium: document scroll width before and after, with the work
  section scrolled into view, is 1,541 to 1,280 px at 1280 px and 1,621 to 1,440 px at 1440 px; at 320, 360, 390, 430
  and 1920 px it was and stays equal to the screen width. At load, 1280 px went from 1,549 to 1,280 px, 390 px from
  391 to 390 px and 320 px from 322 to 320 px. No element is left past the right edge without a clipping ancestor.
  Screenshots of the work section at 1280 px before and after match apart from the animated stars.
- Still open for later runs of item 1, from the 2026-11-14 sweep and not re-checked today: hero_proto.html throws a
  TypeError on load and is 704 px wide at 390 px; labs/claude-prep/ requests seal.json, which returns 404 (Luis
  decides). Item 2 still has no link to remove: no tracked file outside _archive/ references labs/weather/.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 26 pages, 0 findings; levels selftest 12 of
  12 and 32 labs, 0 errors; lab tests 17 files, 0 failed; atlas, stories and evolution selftests and checks pass
  (they print NOT_CHECKED for the private plans); mutate selftest and run pass (every broken rule caught); model
  route 56 of 56; anti-tells no new tells. No script changed, so there was no syntax check to run. Render:
  index.html at 1280 px and 390 px (and 320 to 1920 px for width) in headless Chromium, 0 console errors.
  Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #35: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-14, The Roaster fits a phone screen (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 24 pages and 0 findings on main
  today, so this run loaded all 24 published pages in headless Chromium at 1280 px and 390 px over a local http
  server and recorded script errors, failed local requests and content that ends past the screen edge.
- Found, most visible first among the lab pages the hub links: on labs/roaster.html at 390 px the page is one fixed
  screen with overflow hidden, laid out as a 312 px rail beside the roast panel. The headline, the intro and the
  footer were cut off at the right edge, the top bar ran to x = 851 px, and the roast panel (the output the lab
  exists for) sat entirely off screen with no way to scroll to it.
- Changed (labs/roaster.html, one media query of 15 lines): at 860 px and below the page scrolls, the panel follows
  the rail in one column, the top bar, the source badge and the kept/deleted legend wrap, the headline is 28 px
  instead of 34 px, and the footer stacks. Above 860 px nothing changes: at 861 and 1280 px the panel measures the
  same as on main (x = 388 px, 563 px tall). At 320, 360, 390, 430 and 860 px no element in the page ends past the
  screen edge and the scroll width equals the screen width; in an iPhone 13 emulation a wheel scroll moves the page
  down 962 px.
- Also found and left for later runs of item 1: the home page is 1,549 px wide at 1280 px and 392 px at 390 px
  because two absolutely placed background canvases (sub-dots, sub-stars) extend past the edge; body clips it and
  neither a wheel nor the arrow keys scrolled it sideways in Chromium, so a visitor there sees nothing, but a
  browser that ignores the body's overflow on the viewport could. hero_proto.html still throws a TypeError on load
  and is 704 px wide at 390 px. labs/claude-prep/ still requests seal.json, which returns 404 (Luis decides).
  Narrower tables on labs/ai-health.html, labs/honesty-decoder.html and labs/token-ekg.html scroll inside their own
  containers and were not counted as findings.
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 24 pages, 0 findings; levels 32 labs, 0
  errors; lab tests 7 files, 0 failed; atlas, stories, evolution, mutate and anti-tells selftests pass and their
  checks pass (anti-tells: no new tells; atlas, stories and evolution print NOT_CHECKED for the private plans). No script changed, so there was no syntax check to
  run. node tools/anti_tells.mjs scan labs/roaster.html lists 33 tells, all in lines this run did not touch. Render:
  labs/roaster.html at 1280 px and 390 px in headless Chromium; the only console errors were the browser refusing
  the live roast request to the model host (CORS from localhost), the same on main, after which the lab shows its
  offline roast. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #24: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

## 2026-11-13, Labs OS: a consent banner, a privacy page and the owner's usage dashboard (not a routine run)

- New for a visitor: the labs hub now asks, once, whether this browser may send usage of the labs to their author.
  Allow and No thanks have equal weight and nothing is sent before Allow. What is sent: which lab is opened and
  from where, how long the page was visible, which kinds of controls were used, and a random id for the browser.
  Never anything typed; no name, email or IP address is stored with the events. "Your data" shows the choice, lets
  the visitor change it, and erases what was sent.
- New page labs/privacy.html: who is responsible, what stays in the browser, what is sent with consent and to whom
  (Supabase, EU West, Paris), where a lab's model prompts go, the fonts' host, retention (raw events become daily
  counts after 90 days), and how to export, delete, erase and withdraw. It describes what the code does and says it
  is not legal advice.
- New page labs/dashboard.html, for the site's owner only: visitors, sessions, opens, visible time, actions and
  errors per lab and per day, which labs were never opened, and where visits came from. Anyone else who signs in
  sees that the account is not the owner; the database returns them no rows.
- Behind it: a Supabase project with row-level security on every table. Three migrations are applied. A visitor
  can add events and can erase the events of their own browser; only the owner can read them.
- Checks: 246 tests of Labs OS; the build reproduces the committed output; a live smoke test sent two events and
  erased them, leaving none; in headless Chrome against the real backend nothing was sent before Allow and erasure
  left zero rows; 52 database access checks (two visitors cannot read or change each other's data; only the owner
  reads usage) and 36 checks of the anonymous path over the real API pass; the owner's recognition was checked in
  the database. The site gates pass: privacy selftest 18 of 18, site_check 24 pages and 0 findings, levels, lab
  tests, anti-tells, atlas, stories, model route.
- Not yet proven: the owner's sign-in by emailed link has not been run with a real session.
- Known limits: the banner covers part of the hero's second line at 1440 by 900 until it is answered; events are
  sent when a page is left, so a phone tab the system kills sends its last events on the next visit.

## 2026-11-13, Labs: a model route of their own, about two seconds a reply (not a routine run)

- New for a visitor with no local model and no key: the labs that call a model through the shared route now get
  their reply from the labs' own endpoint in about two seconds, and a second request no longer waits. Before, the
  public route allowed one reply every 45 seconds per visitor.
- What it is: a Cloudflare Worker (workers/model-route, labs-model-route.luisblanco.workers.dev) in front of
  Workers AI, on the free plan. It holds no key and stores and logs nothing. It answers the site's origin only,
  a few requests a minute per visitor (Cloudflare documents that limit as approximate), from a shared allowance of
  10,000 neurons a day; past the allowance it answers 429 and the lab falls through to the old public route and
  then to its deterministic engine, as before.
- Measured on 2026-11-13 with one two-sentence physics question: Gemma 4 26B with thinking on took 12 to 33 s and
  17 to 33 neurons and returned nothing within 600 tokens; with thinking off it answered correctly in 2.1 s for
  2.2 neurons, so thinking is off. At about 18 neurons for a reply of 800 tokens in and 400 out, the allowance is
  about 550 such replies a day across all visitors.
- It also carries a pass-through for three providers whose APIs refuse browser calls (a visitor's own key rides in
  the request and goes nowhere else). Nothing on the site uses it yet.
- Labs still on the older model module are unchanged: the new route has its own config block that only llm.js reads.
- Checks: 56 tests of the Worker with a fake model and a fake upstream (an unknown provider is a 404, never an open
  proxy; a foreign origin is refused); in headless Chrome, llm.js on a local page took the route twice in a row
  (JSON parsed, 2.2 s and 1.4 s) with the local model probe blocked to stand in for a public visitor.
- Known weakness: the per-visitor limit let 10 of 12 rapid calls through. The daily allowance is the hard stop and
  costs nothing when it runs out; a strict limit is planned.

## 2026-11-13, Labs OS: the hub remembers where you left off (not a routine run)

- New for a visitor: the labs hub now keeps a record of your visits in your own browser and, when you come back,
  shows where you left off and up to three suggestions for what to open next, each with its reason. A first visit
  looks as it did. Nothing is sent anywhere: there is no backend in this version.
- "Your data", in the hub's footer, shows what is kept (an activity log capped at the newest 5,000 events, saved
  progress, two settings), exports it as JSON, deletes it, and turns recording off. Off stays off through a delete.
- Under it is Labs OS, a platform layer every lab will use: an append-only event log and progress store in
  IndexedDB with an in-memory fallback when storage is blocked, a registry of event types, resume and what's-next,
  a consent state and an outbox that only ever sends when consent is granted and a transport exists (neither does
  yet, so the consent banner is built and hidden), export and delete, and one lifecycle for animated scenes. The
  hub's two canvases now run through that lifecycle and pause when the tab is hidden.
- Labs may now have a build step (ARCHITECTURE.md): TypeScript source in labs-src/, compiled output committed in
  labs/assets/js/os/, and the site job rebuilds and fails if the two differ. The main site stays buildless.
- The hub's font link drops two families no hub style used and adds Fraunces, the main site's display face.
- Checks: 148 tests (Node 20 and 24); the build reproduces the committed output; privacy selftest 18 of 18;
  site_check 22 pages, 0 findings; levels 32 labs, 0 errors; lab tests 6 files, 0 failed; anti-tells no new tells.
  Rendered at 1440 px and 390 px in five states (first visit, returning, returning with due items, storage
  unavailable, recording off) with zero console errors beyond the two requests the hub already made (the local
  model probe and a missing favicon). A still cannot judge the pause when hidden; the tests cover it.
- Not yet: no lab other than the hub calls Labs OS, so a visit to a lab's own address is recorded only when it
  starts from the hub.

## 2026-11-13, AI Meme Lab panels fit a phone screen (roadmap item 1)

- Item 1 asks to fix what the site checks found. node tools/site_check.mjs reports 22 pages and 0 findings on main
  today, so this run also loaded all 22 published pages in headless Chromium at 1280 px and 390 px over a local http
  server and recorded failed local requests, script errors and page width. Item 2 still has no link to remove: no
  tracked file outside _archive/ references labs/weather/. It stays in "Next" for Luis, as the last three entries said.
- Found, most visible first: on labs/memes.html at 390 px both panels (the brief and the output) ran from x = 20 to
  398 px, and the body clips sideways overflow, so the right 8 px of each panel, its border and padding included,
  were cut off. At 360 px the third image-source button ("Pollinations") was also cut off inside its toggle.
- Cause: below 860 px the bench grid is one 1fr column, which cannot shrink below the widest content's minimum width;
  the image-source buttons do not wrap, so that minimum was about 380 px.
- Changed (labs/assets/css/memes.css only): below 860 px the column is minmax(0, 1fr), and at 400 px and below the
  image-source button labels may wrap onto two lines. At 320, 360, 390, 430, 860 and 1280 px no element now ends past
  the screen edge, and the page scroll width equals the screen width. Above 400 px the buttons are unchanged.
- Also found and left for later runs of item 1: hero_proto.html throws a TypeError on load and is 704 px wide at 390
  px (a prototype page the home page does not link to); labs/claude-prep/ requests seal.json, which is not in the
  repository and returns 404 (the lab treats a missing file as no seal, and the file belongs to an encrypted
  feature this routine does not touch, so Luis should decide whether it should exist).
- Checks: privacy_gate.py --selftest 18 of 18; node tools/site_check.mjs 22 pages, 0 findings. No script changed, so
  there was no syntax check to run. Render: labs/memes.html loaded in headless Chromium over a local http server at
  1280 px and 390 px (and measured at 320, 360, 430 and 860 px); a screenshot at 320 px shows the three image-source
  buttons inside the panel. The only console error was the request to a local model server, refused when none is
  running and the same on main. Forbidden-name check: runs in the gates workflow on the pull request.
- Gates on pull request #14: privacy passed (selftest and forbidden-name scan), site passed, GitGuardian passed.
- Merged: yes, squash, after the gates passed on the commit that recorded these results.

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
