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

The working clock is the published solution whose forecast of today's transit agrees best with the
forecasts of the other papers. Each solution, carried to the transit nearest the day of retrieval,
is a forecast: a time and an error. Two forecasts are scored against each other with the continuous
ranked probability score of a Gaussian (T. Gneiting and A. E. Raftery, J. Am. Stat. Assoc. 102, 359,
2007, on proper scoring rules): for a gap of z combined sigmas, sigma times (z (2 Phi(z) - 1) +
2 phi(z) - 1/sqrt(pi)). It is in days and smaller is better. When two forecasts are far apart it is
the gap between them; when they coincide it is about a quarter of their combined error; so a clock
scores well by being close to the others and by being sharp, and a wide error bar cannot buy a good
score. A pair never scores worse than a quarter of the shorter period (two transits are never more
than half an orbit apart). A clock's score is the median of its scores against the others, and the
lowest median is the working clock; a tie goes to the smaller error. Solutions that share a period
to every digit are one lineage (a paper repeating another's ephemeris) and count once, by their
sharpest member. With one lineage there is nothing to compare, and it is the clock.

Candidates are the planet's usable solutions, and the composite row only when its mid-time and
period come from one paper and no solution is the same ephemeris: a composite row that mixes two
papers pairs errors that do not belong together (on 2026-11-14 that made 22 planets look lost that
a single paper still times well).

How this rule was reached, on 2026-11-14.
  1. The smallest error on the day of retrieval. An independent review found that it picks outliers:
     66 planets whose working clock every other solution contradicted, HD 106315 b by 4.6 days.
  2. A vote: keep a clock another paper stands with, drop one that two agreeing papers stand
     against. A second review found that a vague clock stands with everything, so it was always
     kept: WASP-12 b was read by a 2009 clock while six papers from 2022 to 2025 agreed within
     minutes, and WASP-24 b was called lost.
  3. A forecast of the latest mid-times other papers measured. It failed on reading: a published
     mid-time is a reference epoch, often set near the first observations, so the latest mid-times
     are not the latest measurements.
  4. This rule, chosen by a backtest instead of by argument (backtest_clock.py, beside this file):
     hide each planet's most recently published paper, let a rule pick from what came before, and
     measure how far its forecast of today's transit lies from the hidden paper's. Over 3,462
     planets with three or more dated papers it has the smallest median gap and the fewest
     confident misses. The same backtest says what no rule can mend: for about one planet in ten,
     no earlier clock comes within three hours of the latest paper.

Each working clock carries two numbers for the page: how many other lineages could be compared with
it (their combined error under a sixth of the period, clock.js, the blind rule), and how many of
those agree with it within 3 combined sigmas. A clock that fewer than half agree with is called
contested.

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
CLOCK = SOL + ['agree', 'others']
BLIND_SHARE = 1 / 6          # as overdue/clock.js: a combined uncertainty this share of the period cannot show a 3-sigma miss
AGREE_Z = 3


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


def same_clock(a, b):
    """One ephemeris quoted twice: the same period, and mid-times a whole number of orbits apart."""
    if a[2] != b[2]:
        return False
    k = (a[0] - b[0]) / a[2]
    return abs(k - round(k)) < 1e-4


def crps(z, sigma):
    """The continuous ranked probability score of a Gaussian forecast that missed by z sigmas. Days; smaller is better."""
    phi = math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)
    big = 0.5 * (1 + math.erf(z / math.sqrt(2)))
    return sigma * (z * (2 * big - 1) + 2 * phi - 1 / math.sqrt(math.pi))


def lineages(sols, today):
    """One solution for each period: the sharpest today of those that share it to every digit."""
    best = {}
    for s in sols:
        if s[2] not in best or carried(s, today)[1] < carried(best[s[2]], today)[1]:
            best[s[2]] = s
    return list(best.values())


def between(a, b, today):
    """Two clocks' forecasts of the transit nearest today: (score in days, gap in combined sigmas, blind).
    The same whichever clock is named first: the gap is folded by the shorter period. blind: the combined
    error is a sixth of that period or more, so the two could not be seen to disagree."""
    ta, sa = carried(a, today)
    tb, sb = carried(b, today)
    P = min(a[2], b[2])
    gap = (tb - ta + P / 2) % P - P / 2
    sigma = math.hypot(sa, sb)
    z = gap / sigma
    return min(crps(z, sigma), P / 4), z, sigma >= P * BLIND_SHARE


def choose_clock(candidates, today):
    """The working clock among the candidates, how many other lineages agree with it within 3 sigma, and how
    many could be compared. See the module text."""
    v = sorted(lineages(candidates, today), key=lambda s: carried(s, today)[1])          # the sharpest first, so a tie goes to it
    if len(v) == 1:
        return v[0], 0, 0
    scores = []
    for i, c in enumerate(v):
        pair = sorted(between(c, o, today)[0] for j, o in enumerate(v) if j != i)
        scores.append((pair[(len(pair) - 1) // 2], i))                                    # the median, the lower of two
    c = v[min(scores)[1]]
    seen = [between(c, o, today) for o in v if o is not c]
    told = [x for x in seen if not x[2]]
    return c, sum(1 for x in told if abs(x[1]) <= AGREE_Z), len(told)


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
              'not_the_narrowest': 0, 'contested': 0, 'uncompared': 0}
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
        # the working clock: the solution whose forecast of today's transit agrees best with the other papers'
        # (choose_clock). flag 1: the composite, mid-time and period from one paper. 2: one published
        # solution. 0: a composite that mixes papers, for want of either. The last two numbers: how many other
        # lineages agree with it within 3 sigma, and how many could be compared.
        single = [s[:7] + [2] for s in mine]
        if comp_row and same and not any(same_clock(comp_row, s) for s in mine):      # the composite only when no solution is the same ephemeris: a solution carries its date
            single.append(comp_row[:7] + [1])
        if single:
            narrowest = min(single, key=lambda s: carried(s, today)[1])
            chosen, agree, others = choose_clock(single, today)
            clock_row = chosen + [agree, others]
            counts['not_the_narrowest'] += 1 if chosen is not narrowest else 0
            counts['contested'] += 1 if agree * 2 < others else 0
            counts['uncompared'] += 1 if not others else 0
        else:
            clock_row = comp_row + [0, 0] if comp_row else None
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
            'clock': 'the working clock as [' + ', '.join(CLOCK) + ']: default is 1 for the composite row with mid-time and period from one paper, 2 for one published solution, 0 for a mixed composite kept for want of a solution; others is how many other lineages (solutions with another period) could be compared with it on the day of retrieval, and agree how many of those lie within 3 combined sigmas of it; ref and std index the record file',
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
