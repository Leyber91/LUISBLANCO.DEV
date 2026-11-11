# ROADMAP

Luis owns this file. The daily routine builds the first open item under "Next", one item per run, and appends its
record to EVOLUTION.md. Luis reorders, adds or strikes items at any time; a struck item is never built.

When "Next" is empty, the routine audits the site and adds one item it can justify from the site itself (a broken
link, a page that fails its checks, a lab announced and never built, a section that says less than the rest of the
site already knows), then builds it on the next run. It never adds more than one item a day.

## Next

1. Fix what the site checks found, one finding per run, most visible page first.
2. The labs hub links to labs/weather/, which returns 404. Build the lab, or remove the link and say so in the log.
3. Mobile pass on the home page and the labs hub at 390 px wide: nothing overflows sideways, every control reachable.

## Done

(The routine moves items here with the date and the commit.)

- 2026-11-11: Home page "What changed" strip. Section 02 of the home page lists the last five entries of EVOLUTION.md
  (date and item) with a link to the full log. Pull request "evolve 2026-11-11: home what-changed strip".
- 2026-11-10: Site checks. tools/site_check.mjs checks the 19 published HTML pages and the labs hub config; it found
  nothing on published pages. Pull request "evolve 2026-11-10: site checks".

## Struck

(Luis moves items here; the routine never builds them.)
