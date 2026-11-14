#!/usr/bin/env python3
"""Build ephemerides.json and ephemerides-record.json: every transiting planet's published transit clocks.

Two tables of the NASA Exoplanet Archive, asked through its public table service:
  PSCompPars (doi:10.26133/NEA13)  one row per planet: where its star is, how long and how deep its
                                   transit is, and the archive's chosen mid-transit time and period.
  PS         (doi:10.26133/NEA12)  one row per published solution: a mid-transit time and a period
                                   with their errors, the paper, its date, the time standard it states.

Why a file of its own: the weekly roster (labs/exoplanet_data.json) and the survey snapshot
(pscomppars-snapshot.json) are not touched by this script and carry no transit times. This file is
built by hand, as the survey snapshot is, and committed.

Two files are written, because the page needs a little at once and the rest a moment later:
  ephemerides.json         one row per planet: its star, its transit and its working clock
  ephemerides-record.json  every published solution of every planet, in the same order, and the references

Usage (run by hand; needs the network; the output is committed):
  python build_ephemerides.py . 2026-11-14 [--raw <folder>]
--raw keeps the two raw CSV answers in a folder outside the repository, and reuses them if they are
already there, so a rebuild does not ask the archive again.

What is kept. A solution is kept when it has a full Julian date for the mid-transit time (between
2,450,000 and 2,500,000, late 1995 to 2132: the tables hold a few truncated or mistyped dates, one of
them in 1972), a positive period, and a positive error on each. Its error is the mean size of the
archive's upper and lower error bars. A planet is kept when the composite row or at least one solution
is usable.

The working clock is the best one anybody has published: of the planet's usable solutions, and of the
composite row when its mid-time and period come from one paper, the one whose window is narrowest on
the day of retrieval, unless the other papers agree with each other against it. A composite row that
mixes two papers pairs errors that do not belong together (on 2026-11-14 that made 22 planets look
lost that a single paper still times well), so it is used only when no single solution is.

Why "unless". The narrowest window alone picks outliers: a solution with a small stated error and a
wrong period wins. An independent review on 2026-11-14 found 66 planets whose working clock every
other solution contradicted by more than 3 sigma; HD 106315 b was predicted 4.6 days from where seven
papers put it. Two solutions are compared at the transit nearest the day of retrieval. They stand
apart when they differ by more than 3 sigma of their combined uncertainty, and together when they do
not, and neither is said while that uncertainty is a sixth of the period or more: beyond it any two
mid-times are within 3 sigma (overdue/clock.js, the blind rule). A solution is confirmed when a
solution from another paper stands together with it. It is outvoted when two solutions from two
other papers stand apart from it and together with each other. The working clock is the narrowest
window among the solutions that are confirmed and not outvoted; failing any, among the confirmed;
failing any, among those not outvoted; failing any, the narrowest of all. The second step is for
planets whose papers fall into camps (TOI-125 b: an archive row alone, two early papers, two recent
ones), where every solution is outvoted by some pair. Each working clock carries the number of other
solutions that stand apart from it, so the page can say a clock is disputed instead of printing its
window as if it were agreed. A later paper that repeats an earlier ephemeris counts as confirming it:
the tables do not say which transits a solution used.

Dates the archive gives. Every ExoFOP row carries the publication date 2017-07, and its mid-times run
from 2018 to 2026, so that date is not when the value was made. Those rows are kept as solutions and
written here without a date, which keeps them out of any test of an older clock by a newer one.

Data: NASA Exoplanet Archive, operated by the California Institute of Technology under contract with
NASA under the Exoplanet Exploration Program. The archive asks for that acknowledgement and for
Christiansen et al. 2025, PSJ 6, 186. It states no explicit licence; reuse here is with that
acknowledgement.
"""
import csv, html, io, json, math, os, re, sys, urllib.parse, urllib.request

TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
Q_COMP = ('select pl_name,hostname,ra,dec,sy_vmag,sy_dist,sy_pnum,disc_year,disc_facility,'
          'pl_tranmid,pl_tranmiderr1,pl_tranmiderr2,pl_tranmid_systemref,pl_tranmid_reflink,'
          'pl_orbper,pl_orbpererr1,pl_orbpererr2,pl_orbper_reflink,pl_trandur,pl_trandep,pl_ratdor,'
          'pl_orbsmax,pl_rade,pl_orbeccen,st_rad,st_teff from pscomppars where tran_flag=1')
Q_PS = ('select pl_name,pl_tranmid,pl_tranmiderr1,pl_tranmiderr2,pl_orbper,pl_orbpererr1,pl_orbpererr2,'
        'pl_refname,pl_pubdate,pl_tsystemref,default_flag from ps where tran_flag=1 and pl_tranmid is not null')

COLS = ['pl_name', 'host', 'ra', 'dec', 'vmag', 'dist', 'pnum', 'disc_year', 'dur_h', 'depth_pct', 'a_over_rs',
        'a_au', 'r_earth', 'ecc', 'st_rad', 'st_teff', 'clock']
SOL = ['t0', 'e_t0', 'period', 'e_period', 'ref', 'pub', 'std', 'default']
CLOCK = SOL + ['disputes']
BLIND_SHARE = 1 / 6          # as overdue/clock.js: a combined uncertainty this share of the period cannot show a 3-sigma miss
DISPUTE_Z = 3


def ask(name, query, raw):
    path = os.path.join(raw, name + '.csv') if raw else None
    if path and os.path.exists(path):
        return open(path, encoding='utf-8').read()
    url = TAP + '?query=' + urllib.parse.quote_plus(query) + '&format=csv'
    req = urllib.request.Request(url, headers={'User-Agent': 'labs-build-script'})
    with urllib.request.urlopen(req, timeout=300) as r:
        text = r.read().decode('utf-8')
    if path:
        os.makedirs(raw, exist_ok=True)
        open(path, 'w', encoding='utf-8', newline='').write(text)
    return text


def num(s):
    try:
        v = float(s)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def sig(v, n):
    """v rounded to n significant figures, as the shortest number that says it."""
    if v is None or v == 0:
        return v
    return float(f'{v:.{n - 1}e}')


def err(e1, e2):
    """One error from the archive's pair: the mean size of the two bars, or the one that is given."""
    a, b = num(e1), num(e2)
    xs = [abs(x) for x in (a, b) if x is not None and x != 0]
    return sum(xs) / len(xs) if xs else None


REF = re.compile(r'href=(\S+)[^>]*>\s*([^<]*)<')


def ref_of(link, refs, index):
    """The archive gives a reference as an HTML link; keep its label and its address, once."""
    m = REF.search(link or '')
    label, url = (m.group(2).strip(), m.group(1).strip()) if m else ((link or '').strip(), '')
    for _ in range(3):                      # the archive escapes some names twice: "Ivshina &amp;amp; Winn"
        plain = html.unescape(label)
        if plain == label:
            break
        label = plain
    if not label:
        return None
    key = (label, url)
    if key not in index:
        index[key] = len(refs)
        refs.append([label, url])
    return index[key]


def clock(t0, e1, e2, p, pe1, pe2):
    """A usable ephemeris as [t0, e_t0, period, e_period], or None."""
    t, P = num(t0), num(p)
    st, sp = err(e1, e2), err(pe1, pe2)
    if t is None or P is None or st is None or sp is None:
        return None
    if not (2450000 < t < 2500000) or P <= 0:
        return None
    return [round(t, 6), sig(st, 3), sig(P, 11), sig(sp, 3)]


def carried(s, t):
    """A solution carried to the transit nearest a time: (predicted mid-time, its 1-sigma blur)."""
    n = round((t - s[0]) / s[2])
    return s[0] + n * s[2], math.hypot(s[1], n * s[3])


def against(a, b, today):
    """How two solutions of one planet stand today: 'apart' (more than 3 sigma), 'together', or None when
    their combined uncertainty is too wide for them to disagree at all."""
    ta, sa = carried(a, today)
    tb, sb = carried(b, ta)
    sigma = math.hypot(sa, sb)
    if sigma >= min(a[2], b[2]) * BLIND_SHARE:
        return None
    return 'apart' if abs(ta - tb) > DISPUTE_Z * sigma else 'together'


def choose_clock(candidates, others, today):
    """The working clock among candidates, and how many other solutions stand apart from it.
    others: every published solution of the planet. See the module text for the four steps."""
    def standing(c):
        seen, rivals = set(), []
        for s in others:
            k = (s[0], s[2])
            if k == (c[0], c[2]) or k in seen:
                continue
            seen.add(k)
            rivals.append(s)
        apart = [s for s in rivals if against(c, s, today) == 'apart']
        confirmed = any(s[4] != c[4] and against(c, s, today) == 'together' for s in rivals)
        outvoted = any(a[4] != b[4] and a[4] != c[4] and b[4] != c[4] and against(a, b, today) == 'together'
                       for i, a in enumerate(apart) for b in apart[i + 1:])
        return confirmed, outvoted, len(apart)
    ranked = sorted(candidates, key=lambda s: carried(s, today)[1])
    stand = [standing(c) for c in ranked]
    for need_confirmed, need_unbeaten in ((True, True), (True, False), (False, True), (False, False)):
        for c, (confirmed, outvoted, apart) in zip(ranked, stand):
            if (confirmed or not need_confirmed) and (not outvoted or not need_unbeaten):
                return c, apart
    raise ValueError('no candidate')


def pub_year(s):
    """'2018-08-16' or '2018-08' as a year with a fraction; None when the archive gives no date."""
    m = re.match(r'(\d{4})-(\d{2})(?:-(\d{2}))?', s or '')
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3) or 15)
    return round(y + ((mo - 1) + (d - 1) / 31) / 12, 3)


def main(out, retrieved, raw):
    comp = list(csv.DictReader(io.StringIO(ask('pscomppars_transiting', Q_COMP, raw))))
    ps = list(csv.DictReader(io.StringIO(ask('ps_transiting', Q_PS, raw))))
    refs, ref_index, stds = [], {}, []

    def std_of(name):
        name = (name or '').strip() or 'not stated'
        if name not in stds:
            stds.append(name)
        return stds.index(name)

    y, mo, d = (int(x) for x in retrieved.split('-'))
    a = (14 - mo) // 12
    today = d + (153 * (mo + 12 * a - 3) + 2) // 5 + 365 * (y + 4800 - a) + (y + 4800 - a) // 4 - (y + 4800 - a) // 100 + (y + 4800 - a) // 400 - 32045 - 0.5   # Julian date at 0h UT

    sols = {}
    for r in ps:
        c = clock(r['pl_tranmid'], r['pl_tranmiderr1'], r['pl_tranmiderr2'], r['pl_orbper'], r['pl_orbpererr1'], r['pl_orbpererr2'])
        if not c:
            continue
        ref = ref_of(r['pl_refname'], refs, ref_index)
        undated = 'exofop' in (r['pl_refname'] or '').lower()       # its one date for every row is not a date
        row = c + [ref, None if undated else pub_year(r['pl_pubdate']), std_of(r['pl_tsystemref']), 1 if r['default_flag'] == '1' else 0]
        sols.setdefault(r['pl_name'], []).append(row)

    rows, record = [], []
    counts = {'planets_asked': len(comp), 'solutions_asked': len(ps), 'with_composite_clock': 0, 'composite_from_one_paper': 0,
              'clock_from_a_solution': 0, 'without_a_clock': 0, 'with_a_solution': 0, 'solutions_kept': 0,
              'not_the_narrowest': 0, 'disputed': 0}
    for r in sorted(comp, key=lambda x: x['pl_name']):
        c = clock(r['pl_tranmid'], r['pl_tranmiderr1'], r['pl_tranmiderr2'], r['pl_orbper'], r['pl_orbpererr1'], r['pl_orbpererr2'])
        comp_row, same = None, False
        if c:
            same = ref_of(r['pl_tranmid_reflink'], refs, ref_index) == ref_of(r['pl_orbper_reflink'], refs, ref_index)
            comp_row = c + [ref_of(r['pl_tranmid_reflink'], refs, ref_index), None, std_of(r['pl_tranmid_systemref']), 1 if same else 0]
            counts['with_composite_clock'] += 1
            counts['composite_from_one_paper'] += 1 if same else 0
        # one row per paper and mid-time: the archive repeats a solution when a paper is listed twice
        seen, mine = set(), []
        for s in sorted(sols.get(r['pl_name'], []), key=lambda s: (s[5] is None, s[5] or 0, s[0])):
            k = (s[4], s[0], s[2])
            if k in seen:
                continue
            seen.add(k)
            mine.append(s)
        if not comp_row and not mine:
            continue
        if mine:
            counts['with_a_solution'] += 1
            counts['solutions_kept'] += len(mine)
        # the working clock: the narrowest window on the day of retrieval that the other papers do not agree
        # against (choose_clock). flag 1: the composite, mid-time and period from one paper. 2: one published
        # solution. 0: a composite that mixes papers, for want of either. The last number: how many other
        # solutions contradict it today.
        single = ([comp_row[:7] + [1]] if comp_row and same else []) + [s[:7] + [2] for s in mine]
        if single:
            narrowest = min(single, key=lambda s: carried(s, today)[1])
            chosen, disputes = choose_clock(single, mine, today)
            clock_row = chosen + [disputes]
            counts['not_the_narrowest'] += 1 if chosen is not narrowest else 0
            counts['disputed'] += 1 if disputes else 0
        else:
            clock_row = comp_row + [0] if comp_row else None
        if clock_row is not None and clock_row[7] == 2:
            counts['clock_from_a_solution'] += 1
        if clock_row is None:
            counts['without_a_clock'] += 1
        host = 0 if r['hostname'] == r['pl_name'].rsplit(' ', 1)[0] else r['hostname']
        rows.append([r['pl_name'], host, sig(num(r['ra']), 8), sig(num(r['dec']), 8), num(r['sy_vmag']), sig(num(r['sy_dist']), 5),
                     int(num(r['sy_pnum']) or 1), int(num(r['disc_year'])) if num(r['disc_year']) else None,
                     sig(num(r['pl_trandur']), 5), sig(num(r['pl_trandep']), 4), sig(num(r['pl_ratdor']), 4), sig(num(r['pl_orbsmax']), 4),
                     sig(num(r['pl_rade']), 4), sig(num(r['pl_orbeccen']), 3), sig(num(r['st_rad']), 4), int(num(r['st_teff'])) if num(r['st_teff']) else None,
                     clock_row])
        record.append(mine)

    doc = {
        'meta': {
            'source': 'NASA Exoplanet Archive: Planetary Systems (PS) and Planetary Systems Composite Parameters (PSCompPars), transiting planets',
            'doi': {'PS': '10.26133/NEA12', 'PSCompPars': '10.26133/NEA13'},
            'retrieved': retrieved,
            'counts': counts,
            'units': {'ra': 'deg, J2000', 'dec': 'deg, J2000', 'vmag': 'V magnitude', 'dist': 'pc', 'dur_h': 'h', 'depth_pct': '%',
                      'a_over_rs': 'semi-major axis in stellar radii', 'a_au': 'AU', 'r_earth': 'R_earth', 'st_rad': 'R_sun', 'st_teff': 'K',
                      't0': 'Julian date in the stated standard', 'e_t0': 'd', 'period': 'd', 'e_period': 'd', 'pub': 'year of publication, with a fraction'},
            'host': '0 means the host name is the planet name without its last letter',
            'clock': 'the working clock as [' + ', '.join(CLOCK) + ']: default is 1 for the composite row with mid-time and period from one paper, 2 for one published solution, 0 for a mixed composite kept for want of a solution; disputes is how many other published solutions contradict it by more than 3 sigma on the day of retrieval; ref and std index the record file',
            'record': 'ephemerides-record.json holds refs and sols; sols[i] are the published solutions of rows[i], oldest first, undated last',
            'errors': 'the mean size of the upper and lower error bars the archive gives',
            'acknowledgement': 'This research has made use of the NASA Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program.',
        },
        'standards': stds, 'cols': COLS, 'sol': SOL, 'rows': rows,
    }
    rec = {'meta': {'retrieved': retrieved, 'of': 'ephemerides.json, row for row'}, 'refs': refs, 'sol': SOL, 'sols': record}
    for name, d in (('ephemerides.json', doc), ('ephemerides-record.json', rec)):
        path = os.path.join(out, name)
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(d, f, separators=(',', ':'), ensure_ascii=False)
        print(f'{path}: {os.path.getsize(path)} bytes')
    print(f'{len(rows)} planets, {counts["solutions_kept"]} solutions, {len(refs)} references, {len(stds)} standards')
    print(counts)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    raw = sys.argv[sys.argv.index('--raw') + 1] if '--raw' in sys.argv else None
    main(sys.argv[1], sys.argv[2], raw)
