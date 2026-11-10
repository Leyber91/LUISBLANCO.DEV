# ROADMAP

Luis owns this file. The daily routine builds the first open item under "Next", one item per run, and appends its
record to EVOLUTION.md. Luis reorders, adds or strikes items at any time; a struck item is never built.

When "Next" is empty, the routine audits the site and adds one item it can justify from the site itself (a broken
link, a page that fails its checks, a lab announced and never built, a section that says less than the rest of the
site already knows), then builds it on the next run. It never adds more than one item a day.

## Next

1. Site checks. Write tools/site_check.mjs (Node, no dependencies): every local link, script, stylesheet and image
   referenced from each HTML page resolves to a file in the repository; every page parses; every labs/ page listed on
   the labs hub exists. Wire it into the gates workflow (it already runs the file when present). Fix nothing else in
   the same run; record what it finds as roadmap items.
2. Fix what the site checks found, one finding per run, most visible page first.
3. The labs hub links to labs/weather/, which returns 404. Build the lab, or remove the link and say so in the log.
4. Home page: a dated "What changed" strip that reads the last five entries of EVOLUTION.md, so a visitor sees the
   site is alive.
5. Mobile pass on the home page and the labs hub at 390 px wide: nothing overflows sideways, every control reachable.

## Done

(The routine moves items here with the date and the commit.)

## Struck

(Luis moves items here; the routine never builds them.)
