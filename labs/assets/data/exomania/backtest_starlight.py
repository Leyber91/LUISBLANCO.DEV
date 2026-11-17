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
temperature's paper; all three's; only one of the radius and the temperature's; or none of them.

Names differ where the measurement is shared (the second review of pull request 50, 2026-11-17). Berger et al. 2018's
insolation and the TICv8 lineage's luminosity (TICv8, and Gajdos et al. 2019 and the DR25 Supplemental KOI table, which
copy its star values) both rest on Gaia DR2 parallaxes: the archive's luminosity and Berger's agree to 7% on those rows.
So "none of them" is split again, by what the reference is (Berger et al. 2018, ExoFOP, every other) against what the
luminosity is (the TICv8 lineage, Gaia DR2, a paper), and the stratum that decides is "none of them" without the rows
where Berger et al. 2018 meets the TICv8 lineage. Its answer is a witness, not the ground: on references and
luminosities that are both single papers the two rules tie. The luminosity is chosen for the Gaia-era parallax behind
the Kepler stars' luminosities and for the M-dwarf papers' own method (Zechmeister et al. 2019, Barone et al. 2025:
the luminosity measured, the radius derived from it); render_science.md records it.

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
BERGER = 'Berger et al. 2018'


# The references whose star values are TICv8's, by their whole label (bo.label has read the archive's escapes): a prefix
# took any paper by the same first author into the lineage (Gajdoš et al. 2026, for TIC 87422071 b; 2026-11-17).
TICV8_LINEAGE = ('TICv8', 'Gajdoš et al. 2019', 'Q1-Q17 DR25 Supplemental KOI Table')


def lineage(lum_ref):
    """What a luminosity's reference is: the TICv8 lineage (TICv8, and the tables that copy its star values), Gaia DR2,
    or a paper."""
    if lum_ref in TICV8_LINEAGE:
        return 'the TICv8 lineage'
    return 'Gaia DR2' if lum_ref == 'Gaia DR2' else 'a paper'


def kind(ref):
    return ref if ref in (BERGER, 'ExoFOP') else 'every other'


def shared(r):
    """A reference and a luminosity that rest on one measurement: Berger et al. 2018 and the TICv8 lineage, both on Gaia
    DR2 parallaxes."""
    return r['src'] == BERGER and r['lineage'] == 'the TICv8 lineage'
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
    for ref, want in [('TICv8', 'the TICv8 lineage'), ('Gajdoš et al. 2019', 'the TICv8 lineage'), ('Gajdoš et al. 2026', 'a paper'),
                      ('Gaia DR2', 'Gaia DR2'), ('Q1-Q17 DR25 Supplemental KOI Table', 'the TICv8 lineage'), ('Berger et al. 2018', 'a paper')]:
        got = lineage(ref)
        print(f"  selftest: the lineage of \"{ref}\" is {'that of ' + want if got == want else 'FAIL, ' + got + ', not ' + want}")
        ok = ok and got == want
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
        rows.append({'name': p['name'], 'ref': c['pl_insol'], 'star': from_star(p, a), 'lum': from_lum(p, a), 'stratum': stratum, 'src': src,
                     'lineage': lineage(sL)})
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
    none = [r for r in rows if r['stratum'] == STRATA[0]]
    line = lambda name, s_, w=40: f"  {name:{w}} {s_['near']:5d} of {s_['n']:<5d} ({s_['near'] / s_['n'] * 100:3.0f}%)   {s_['median'] * 100:5.1f}%   {s_['p90'] * 100:5.1f}%"
    print(f"\n\"none of them\" ({len(none)} planets), by what the reference and the luminosity are: luminosity nearer, R2 Teff4 nearer; medians off")
    for ref_kind in (BERGER, 'ExoFOP', 'every other'):
        for lin in ('the TICv8 lineage', 'a paper', 'Gaia DR2'):
            rs = [r for r in none if kind(r['src']) == ref_kind and r['lineage'] == lin]
            if not rs:
                continue
            a, b = score(rs, 'lum'), score(rs, 'star')
            print(f"  {ref_kind:20} | {lin:18} | {len(rs):5d} | {a['near']:5d} to {b['near']:<5d} ({a['near'] / len(rs) * 100:3.0f}%) | {a['median'] * 100:5.1f}% and {b['median'] * 100:5.1f}%"
                  + ('   shared: both on Gaia DR2' if ref_kind == BERGER and lin == 'the TICv8 lineage' else ''))
    decide = [r for r in none if not shared(r)]
    sh = [r for r in none if shared(r)]
    papers = [r for r in none if kind(r['src']) == 'every other' and r['lineage'] == 'a paper']
    for title, rs in ((f'the shared rows ({BERGER} and the TICv8 lineage)', sh), ('"none of them" without the shared rows', decide), ('papers only: neither the reference nor the luminosity a catalogue', papers)):
        print(f"\n{title} ({len(rs)} planets): nearer the reference; off it, median and 90th percentile")
        for name, key in CANDIDATES:
            print(line(name, score(rs, key)))
    won, scores = best(decide)
    ranked = sorted(scores, key=lambda x: (-x[1]['near'], x[1]['median']))
    w, r2 = ranked[0][1], ranked[1][1]
    pa, pb = score(papers, 'lum'), score(papers, 'star')
    print(f"\nThe nearer more often where no catalogue is shared: {won}, {w['near']} against {r2['near']} of {w['n']}; median "
          f"{w['median'] * 100:.1f}% against {r2['median'] * 100:.1f}%. On papers only: {pa['near']} to {pb['near']}, medians "
          f"{pa['median'] * 100:.1f}% and {pb['median'] * 100:.1f}%, a tie. The choice of the archive's luminosity rests on the parallax "
          f"and the M-dwarf papers' method (render_science.md), and this backtest finds nothing against it.")
    for title in ['all'] + STRATA[1:]:
        rs = rows if title == 'all' else [r for r in rows if r['stratum'] == title]
        if rs:
            got, _ = best(rs)
            print(f"  in the stratum \"{title}\" the nearer more often is: {got}")
    return won


if __name__ == '__main__':
    main(tap.folder_arg(sys.argv), tap.cache_dir(sys.argv))
