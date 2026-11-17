#!/usr/bin/env python3
"""Which luminosity does the page's starlight use: the star's radius and temperature, or the archive's luminosity?

The page computes the starlight a planet receives as S = L / a^2 (L in solar luminosities, a in AU, S in Earth's) and
its equilibrium temperature from S (starlight.js). L can come from two places in the snapshot: R^2 (Teff / 5772 K)^4
from the star's radius and temperature, or the archive's st_lum. They differ by more than 1.2 times for about a quarter
of the stars that carry both. The review of pull request 50 (2026-11-17) found the first contradicting the papers on
famous M-dwarf worlds (Teegarden's Star b: 1.61 against 1.15 and 1.08).

The reference: today's composite insolation (pl_insol) where it comes from a paper or a table, never where it is the
archive's own calculation ('Calculated Value'), and only where it is the value the snapshot carries and the star's
R, Teff and log L are too (so the references named below are the sources of the snapshot's own numbers).

A reference can be built from one of the two candidates: a paper that gives the insolation often gives the luminosity
or the radius and temperature it was computed from. So the rows are split by where the insolation comes from against
where the snapshot's luminosity, radius and temperature come from: the luminosity's paper; the radius and the
temperature's paper; all three's; only one of the radius and the temperature's; or none of them. The stratum that
decides is the last, "none of them", because neither candidate was built from its reference there. The others are
printed to show how much each candidate gains where it shares a source with the reference. This criterion was fixed
before the run.

The candidates: L from R and Teff wherever both exist (pull request 50 at ebf969b); the archive's L wherever the snapshot
has st_lum, R and Teff elsewhere. Both use the page's orbit (backtest_orbit.page_orbit) and are scored on the stars that
carry all three, where they can differ: by how often each is the nearer to the reference, and by the median and the 90th
percentile of its distance from it. The selftest builds rows on which each must win.

Usage:
  python backtest_starlight.py .  [--cache <dir>]       # in the folder that holds pscomppars-snapshot.json
"""
import os, statistics, sys

sys.dont_write_bytecode = True                                                # this folder is published: leave no cache in it
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tap                                                                    # noqa: E402
import backtest_orbit as bo                                                   # noqa: E402

T_SUN = 5772.0
LUM_Q = ('select pl_name,st_lum,st_lum_reflink,st_lumerr1,st_lumerr2,st_rad,st_rad_reflink,st_raderr1,st_raderr2,st_teff,'
         'st_teff_reflink,st_tefferr1,st_tefferr2 from pscomppars')
CALCULATED = 'Calculated Value'
STRATA = ['none of them', "the luminosity's", "the radius and the temperature's", 'all three', 'one of the radius and the temperature']


def from_star(p, a):
    return p['Rs'] ** 2 * (p['Teff'] / T_SUN) ** 4 / a ** 2


def from_lum(p, a):
    return 10 ** p['logL'] / a ** 2


CANDIDATES = [
    ("L from R and Teff (ebf969b)", 'star'),
    ("the archive's L where it has one", 'lum'),
]


def score(rows, key):
    near, offs = 0, []
    for r in rows:
        mine, other = abs(r[key] / r['ref'] - 1), abs(r['lum' if key == 'star' else 'star'] / r['ref'] - 1)
        if mine <= other:
            near += 1
        offs.append(mine)
    offs.sort()
    n = len(rows)
    return {'n': n, 'near': near, 'median': statistics.median(offs) if n else None, 'p90': offs[min(n - 1, int(0.9 * n))] if n else None}


def best(rows):
    scores = [(name, score(rows, key)) for name, key in CANDIDATES]
    return sorted(scores, key=lambda x: (-x[1]['near'], x[1]['median']))[0][0], scores


def selftest():
    """Rows where the reference is the luminosity's value, where the archive's L must win; and the other way."""
    def rows(right, n=30):
        out = []
        for i in range(n):
            t = 0.5 + 0.05 * i
            out.append({'star': t if right == 'star' else t * 1.5, 'lum': t if right == 'lum' else t * 0.7, 'ref': t * 1.01})
        return out
    ok = True
    for (name, key) in CANDIDATES:
        got, _ = best(rows(key))
        print(f"  selftest: rows built for \"{name}\": {'it wins' if got == name else 'FAIL, ' + got + ' wins'}")
        ok = ok and got == name
    return ok


def same(x, y):
    """The snapshot's value against today's: the snapshot keeps four significant figures (log L four decimals)."""
    return x is not None and y is not None and abs(x - y) <= max(1e-3 * max(abs(x), abs(y)), 1e-4)


def main(folder, cache):
    print('Selftest:')
    if not selftest():
        sys.exit(1)
    cb = bo.circumbinary(folder)
    planets = bo.load(folder)
    print('\nThe archive (today\'s composite, joined by name):')
    comp = {r['pl_name']: r for r in tap.query(bo.COMP_Q, cache)}
    lum = {r['pl_name']: r for r in tap.query(LUM_Q, cache)}
    rows, why = [], {'no reference insolation': 0, 'the archive\'s own calculation': 0, 'not the snapshot\'s value': 0,
                     'lacks R, Teff or log L': 0, 'no orbit': 0}
    for p in planets:
        c, l = comp.get(p['name']), lum.get(p['name'])
        if not c or not l or c['pl_insol'] is None:
            why['no reference insolation'] += 1
            continue
        src = bo.label(c['pl_insol_reflink'])
        if src == CALCULATED:
            why['the archive\'s own calculation'] += 1
            continue
        if not (p['Rs'] and p['Teff'] and p['logL'] is not None):
            why['lacks R, Teff or log L'] += 1
            continue
        if not (same(p['S'], c['pl_insol']) and same(p['Rs'], l['st_rad']) and same(p['Teff'], l['st_teff']) and same(p['logL'], l['st_lum'])):
            why['not the snapshot\'s value'] += 1
            continue
        a = bo.page_orbit(p, cb)
        if not a:
            why['no orbit'] += 1
            continue
        sL, sR, sT = bo.label(l['st_lum_reflink']), bo.label(l['st_rad_reflink']), bo.label(l['st_teff_reflink'])
        isL, isR, isT = src == sL, src == sR, src == sT
        stratum = (STRATA[3] if isL and isR and isT else STRATA[1] if isL and not (isR or isT) else STRATA[2] if isR and isT and not isL
                   else STRATA[0] if not (isL or isR or isT) else STRATA[4])
        rows.append({'name': p['name'], 'ref': c['pl_insol'], 'star': from_star(p, a), 'lum': from_lum(p, a), 'stratum': stratum, 'src': src})
    print(f"\nScored: {len(rows)} planets. Left out: " + '; '.join(f'{v} {k}' for k, v in why.items()) + '.')
    print("A stratum is where the reference insolation comes from, against the sources of the snapshot's luminosity, radius and temperature.")
    for title in ['all'] + STRATA:
        rs = rows if title == 'all' else [r for r in rows if r['stratum'] == title]
        if not rs:
            continue
        print(f"\nthe insolation's source is {title if title != 'all' else 'any'} ({len(rs)} planets): nearer the reference; off it, median and 90th percentile")
        for name, key in CANDIDATES:
            s = score(rs, key)
            print(f"  {name:40} {s['near']:5d} of {s['n']:<5d} ({s['near'] / s['n'] * 100:3.0f}%)   {s['median'] * 100:5.1f}%   {s['p90'] * 100:5.1f}%")
    decide = [r for r in rows if r['stratum'] == STRATA[0]]
    won, scores = best(decide)
    ranked = sorted(scores, key=lambda x: (-x[1]['near'], x[1]['median']))
    w, r2 = ranked[0][1], ranked[1][1]
    print(f"\nAdopted, by the stratum where the reference shares no source with either: {won}.\nIts margin: {w['near']} against {r2['near']} "
          f"of {w['n']} nearer; median {w['median'] * 100:.1f}% against {r2['median'] * 100:.1f}%; 90th percentile {w['p90'] * 100:.1f}% against {r2['p90'] * 100:.1f}%.")
    from collections import Counter
    print('Its references, the most frequent: ' + '; '.join(f'{k} {v}' for k, v in Counter(r['src'] for r in decide).most_common(6)) + '.')
    # A reference of another name can still share a method with a candidate: Berger et al. 2018 derives luminosities
    # from Gaia parallaxes, ExoFOP's insolation comes from TESS Input Catalog radii and temperatures. Each is scored apart.
    by_ref = [(k, [r for r in decide if r['src'] == k]) for k in ('Berger et al. 2018', 'ExoFOP')]
    by_ref.append(('every other reference', [r for r in decide if r['src'] not in ('Berger et al. 2018', 'ExoFOP')]))
    for title, rs in by_ref:
        if not rs:
            continue
        print(f"  the deciding stratum, reference {title} ({len(rs)} planets):")
        for name, key in CANDIDATES:
            s = score(rs, key)
            print(f"    {name:38} {s['near']:5d} of {s['n']:<5d} ({s['near'] / s['n'] * 100:3.0f}%)   {s['median'] * 100:5.1f}%   {s['p90'] * 100:5.1f}%")
    for title in ['all'] + STRATA[1:]:
        rs = rows if title == 'all' else [r for r in rows if r['stratum'] == title]
        if rs:
            got, _ = best(rs)
            print(f"  in the stratum \"{title}\" the nearer more often is: {got}")
    return won


if __name__ == '__main__':
    main(tap.folder_arg(sys.argv), tap.cache_dir(sys.argv))
