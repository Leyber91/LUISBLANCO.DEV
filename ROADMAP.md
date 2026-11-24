# ROADMAP

Luis owns this file. The daily routine builds the first open item under "Next", one item per run, and appends its
record to EVOLUTION.md. Luis reorders, adds or strikes items at any time; a struck item is never built.

When "Next" is empty, the routine audits the site and adds one item it can justify from the site itself (a broken
link, a page that fails its checks, a lab announced and never built, a section that says less than the rest of the
site already knows), then builds it on the next run. It never adds more than one item a day.

## Next

1. Fix what the site checks found, one finding per run, most visible page first.
2. The labs hub links to labs/weather/, which returns 404. Build the lab, or remove the link and say so in the log.

## Done

(The routine moves items here with the date and the commit.)

- 2026-11-24: Item 1, one finding: the 404 page (404.html) had no meta description; it now has one saying there is
  no page at the address and where the home page leads. Item 1 stays in "Next". Pull request "evolve 2026-11-24:
  404 page has a meta description".
- 2026-11-23: Item 1, one finding: The Roaster (labs/roaster.html) had no meta description; it now has one taken
  from its subtitle and its hub blurb. Item 1 stays in "Next". Pull request "evolve 2026-11-23: roaster has a meta
  description".
- 2026-11-22: Item 1, one finding: Seed (labs/seed.html) had no meta description; it now has one taken from its
  subtitle and its hub blurb. Item 1 stays in "Next". Pull request "evolve 2026-11-22: seed has a meta description".
- 2026-11-21: Item 1, one finding: The Figure (labs/figure.html) had no meta description; it now has one taken
  from its subtitle and its hub blurb. Item 1 stays in "Next". Pull request "evolve 2026-11-21: figure has a meta
  description".
- 2026-11-20: Item 1, one finding: on Dimensions the Plane Dial's range slider had no accessible name; it now
  carries the name "angle of the selected plane, in degrees". Item 1 stays in "Next". Pull request
  "evolve 2026-11-20: dimensions dial slider has a name".
- 2026-11-19: Item 1, one finding: on The Roaster the claim box had no accessible name; its caption "roast your own
  claim" is now its label. Item 1 stays in "Next". Pull request "evolve 2026-11-19: roaster claim box has a name".
- 2026-11-18: Item 1, one finding: on Seed the five fields (grammar, axiom, angle, generation, replay) had no
  accessible name; each caption is now the label of its field. Item 1 stays in "Next". Pull request
  "evolve 2026-11-18: seed fields have names".
- 2026-11-17: Item 1, one finding: on The Figure the question box had no accessible name, so a screen reader
  announced a bare text box; its caption "the question" is now its label. Item 1 stays in "Next". Pull request
  "evolve 2026-11-17: figure question box has a name".
- 2026-11-16: Item 1, one finding: hero_proto.html threw a TypeError on load (it never loaded the framework data
  its figure reads), so the figure was blank, and at 390 px it was 704 px wide with most of the page cut off; it now
  loads the data and, at 960 px and below, scrolls in one column from 320 px up. Item 1 stays in "Next". Pull request
  "evolve 2026-11-16: hero prototype draws and fits phones".
- 2026-11-15: Item 1, one finding: the home page was 1,549 px wide at 1280 px because a 1440 px decorative schematic in
  the "work with me" section ran past the screen edge (not the background canvases, as the 2026-11-14 entry said);
  each page section now clips its own sideways overflow and the page is as wide as the screen from 320 to 1920 px.
  Item 1 stays in "Next". Pull request "evolve 2026-11-15: home page fits the screen width".
- 2026-11-14: Item 1, one finding: on The Roaster at 390 px the headline and footer were cut off and the roast
  panel sat off screen with no way to scroll to it; below 860 px the page now scrolls in one column, from 320 px up.
  Item 1 stays in "Next" (see EVOLUTION.md for what the sweep found). Pull request "evolve 2026-11-14: roaster fits
  phones".
- 2026-11-13: Item 1, one finding: on the AI Meme Lab at 390 px both panels ran 8 px past the screen edge and were
  clipped; they now fit from 320 px up. Item 1 stays in "Next" because it is a standing item and the render sweep
  found two more (see EVOLUTION.md). Pull request "evolve 2026-11-13: meme lab panels fit phones".
- 2026-11-12: Mobile pass on the home page and the labs hub at 390 px. The labs hub menu toggle was off-screen
  below about 470 px; the header now fits from 320 px up. The home page needed no change. Pull request
  "evolve 2026-11-12: labs hub mobile header".
- 2026-11-11: Home page "What changed" strip. Section 02 of the home page lists the last five entries of EVOLUTION.md
  (date and item) with a link to the full log. Pull request "evolve 2026-11-11: home what-changed strip".
- 2026-11-10: Site checks. tools/site_check.mjs checks the 19 published HTML pages and the labs hub config; it found
  nothing on published pages. Pull request "evolve 2026-11-10: site checks".

## Struck

(Luis moves items here; the routine never builds them.)
