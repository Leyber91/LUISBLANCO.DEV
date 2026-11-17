#!/usr/bin/env python3
"""Which orbit does the page use: the archive's, Kepler's third law, or Kepler's law with an exception? A backtest.

The composite table (PSCompPars) takes each value from the paper it judges best, so a planet's orbit can come from one
paper and its star's mass from another. The page computes the starlight from the orbit (starlight.js), so an orbit from
another solution of the star, or from another period, moves the starlight, the zone and what is drawn; and Kepler's law
on a wrong mass gives a wrong orbit. Kepler-1649 c showed the first (its archive orbit comes from the DR25 KOI table and
a star of 0.096 solar masses; its period and its star's 0.1977 from Vanderburg et al. 2020). The review of pull request
50 (2026-11-17) showed the second: masses from Stassun et al. 2017 (WASP-17: 2.28 solar masses, against 1.2 to 1.35 in
eight other papers).

The set: every planet of the snapshot whose two orbits differ by more than 10% (Kepler's law on the snapshot's period,
star's mass and measured planet mass, against the archive's orbit). No sample.

The reference, which none of the candidates is built from: Kepler's law on the snapshot's period and the median of the
star's masses that the OTHER papers give (the archive's PS table, one row per paper): the paper the composite took its
mass from is left out, and the Kepler KOI tables (one star solution, released several times) count as one paper. A
planet with no other paper's mass has no reference and is not scored. Circumbinary planets (the snapshot's names in
config.js CIRCUMBINARY) are not scored either: Kepler's law on one star's mass is wrong for them whatever the paper, and the
page gives them the archive's orbit by a rule of their own.

The candidates, each a rule on what the page can read (the snapshot's own columns, the star's reference by its name in
the snapshot's refs table): the archive's orbit (main before ticket 2.14); Kepler's law (pull request 50 at ebf969b);
Kepler's law except where the star's reference is Stassun et al. 2017; that exception and Morton et al. 2016 too.
Each is scored by how often it picks the orbit nearer the reference, and by the median and the 90th percentile of the
picked orbit's distance from it, over all and by the source of the composite's mass. The best is adopted, by the share
picked nearer, then by the median.

The selftest (run first, every time) builds rows for each candidate on which it must win: rows with a wrong mass, where
the archive's orbit must win; rows with a stale orbit, where Kepler's law must win; and the two mixtures for the
exceptions. A scorer that cannot pick each one is not a backtest.

The data is read at run time from the archive's TAP service through tap.py's cache, and nothing is written into the
repository. Each query prints itself, its date and a hash of its rows.

Usage:
  python backtest_orbit.py .  [--cache <dir>]       # in the folder that holds pscomppars-snapshot.json
"""
import html, json, os, re, statistics, sys

sys.dont_write_bytecode = True                                                # this folder is published: leave no cache in it
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tap                                                                    # noqa: E402

M_EARTH_IN_SUN = 3.986004e14 / 1.3271244e20                                    # the ratio of the two GM, IAU 2015 nominal
TRUE_MASS = {'Mass', 'Msini', 'Msin(i)/sin(i)'}
STASSUN, MORTON = 'Stassun et al. 2017', 'Morton et al. 2016'
COMP_Q = ('select cb_flag,hostname,pl_bmasse,pl_bmassprov,pl_eqt,pl_eqt_reflink,pl_insol,pl_insol_reflink,pl_name,pl_orbper,'
          'pl_orbper_reflink,pl_orbsmax,pl_orbsmax_reflink,pl_orbsmaxerr1,st_logg,st_lum,st_mass,st_mass_reflink,st_masserr1,'
          'st_masserr2,st_rad,st_rad_reflink,st_spectype,st_teff,st_teff_reflink,sy_snum from pscomppars')
PS_COLS = 'pl_name,pl_refname,st_refname,default_flag,pl_orbsmax,pl_orbper,st_mass,st_masserr1,st_rad,st_teff,pl_insol,pl_eqt'
CHUNK = 40


def label(s):
    """A reference's name, as the archive's links write it."""
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def num(v):
    return None if v is None or v == '' else float(v)


def load(folder):
    """The snapshot's planets: orbit, period, star's mass, the planet's measured mass, the star's reference by name."""
    d = json.load(open(os.path.join(folder, 'pscomppars-snapshot.json'), encoding='utf-8'))
    I = {c: i for i, c in enumerate(d['cols'])}
    out = []
    for r in d['rows']:
        lim = {p.split(':')[0] for p in str(r[I['lim']] or '').split(';') if ':' in p and float(p.split(':')[1] or 0)}
        v = lambda c: None if c in lim else num(r[I[c]])
        prov = d['massprov'][r[I['massprov']]] if r[I['massprov']] is not None else None
        ref = d['refs'][r[I['ref_star']]] if r[I['ref_star']] is not None else None
        out.append({'name': r[I['pl_name']], 'a': v('pl_orbsmax'), 'P': v('pl_orbper'), 'Ms': v('st_mass'),
                    'Mp': v('pl_bmasse') if prov in TRUE_MASS and not r[I['pl_bmasselim']] else None,
                    'star_ref': ref[0].strip() if ref else None,
                    'Teff': v('st_teff'), 'Rs': v('st_rad'), 'logL': v('st_lum'), 'S': v('pl_insol')})
    return out


def kepler(P, Ms, Mp=None):
    return ((P / 365.25) ** 2 * (Ms + (Mp or 0) * M_EARTH_IN_SUN)) ** (1 / 3) if P and Ms and P > 0 and Ms > 0 else None


def apart(p):
    return abs(kepler(p['P'], p['Ms'], p['Mp']) / p['a'] - 1)


CANDIDATES = [
    ("the archive's orbit (main)", lambda r: 'archive'),
    ("Kepler's law (ebf969b)", lambda r: 'kepler'),
    ("Kepler's law; the archive's where the star's reference is Stassun et al. 2017", lambda r: 'archive' if r['star_ref'] == STASSUN else 'kepler'),
    ("the same, and where it is Morton et al. 2016", lambda r: 'archive' if r['star_ref'] in (STASSUN, MORTON) else 'kepler'),
]


def score(rows, pick):
    """How a candidate does on rows that have a reference: the share picked nearer, and the picked orbit's distance."""
    near, offs = 0, []
    for r in rows:
        dA, dK = abs(r['A'] / r['ref'] - 1), abs(r['K'] / r['ref'] - 1)
        chose = r['A'] if pick(r) == 'archive' else r['K']
        if (pick(r) == 'archive' and dA <= dK) or (pick(r) == 'kepler' and dK <= dA):
            near += 1
        offs.append(abs(chose / r['ref'] - 1))
    offs.sort()
    n = len(rows)
    return {'n': n, 'near': near, 'median': statistics.median(offs) if offs else None, 'p90': offs[min(n - 1, int(0.9 * n))] if offs else None}


def best(rows):
    """The candidate that picks the nearer orbit most often, then the one whose median is smaller; with the scores."""
    scores = [(name, score(rows, pick)) for name, pick in CANDIDATES]
    order = sorted(scores, key=lambda x: (-x[1]['near'], x[1]['median']))
    return order[0][0], scores


def selftest():
    """Each candidate wins on rows built for it."""
    def rows(kinds):
        out = []
        for src, kind, n in kinds:
            for i in range(n):
                t = 1 + 0.01 * i                                              # the true orbit
                if kind == 'wrong mass':                                       # the composite's mass is off; the archive's orbit is right
                    out.append({'A': t * 1.01, 'K': t * 1.2, 'ref': t, 'star_ref': src, 'mass_ref': src})
                else:                                                          # the archive's orbit belongs to another solution
                    out.append({'A': t * 0.8, 'K': t * 1.01, 'ref': t, 'star_ref': src, 'mass_ref': src})
        return out
    sets = {
        CANDIDATES[0][0]: rows([('Paper A', 'wrong mass', 20), (STASSUN, 'wrong mass', 5), (MORTON, 'wrong mass', 5)]),
        CANDIDATES[1][0]: rows([('Paper A', 'stale orbit', 20), (STASSUN, 'stale orbit', 5), (MORTON, 'stale orbit', 5)]),
        CANDIDATES[2][0]: rows([('Paper A', 'stale orbit', 20), (STASSUN, 'wrong mass', 5), (MORTON, 'stale orbit', 5)]),
        CANDIDATES[3][0]: rows([('Paper A', 'stale orbit', 20), (STASSUN, 'wrong mass', 5), (MORTON, 'wrong mass', 5)]),
    }
    ok = True
    for want, rs in sets.items():
        got, _ = best(rs)
        print(f"  selftest: rows built for \"{want}\": {'it wins' if got == want else 'FAIL, ' + got + ' wins'}")
        ok = ok and got == want
    return ok


def page_orbit(p, cb):
    """The orbit the page uses (starlight.js semiMajor), by the rule this backtest adopted: the archive's for a planet
    of two stars (none where it has none) and where the star's reference is Stassun et al. 2017; else Kepler's law
    where the period and the star's mass exist; else the archive's."""
    if p['name'] in cb:
        return p['a']
    if p['star_ref'] == STASSUN and p['a']:
        return p['a']
    return kepler(p['P'], p['Ms'], p['Mp']) or p['a']


def circumbinary(folder):
    """The names config.js carries in CIRCUMBINARY (written by circumbinary.py)."""
    text = open(os.path.join(folder, '..', '..', 'js', 'exoplanet', 'config.js'), encoding='utf-8').read()
    body = re.search(r'CIRCUMBINARY = Object\.freeze\(\[(.*?)\]\);', text, re.S).group(1)
    return set(json.loads('[' + body.strip().rstrip(',') + ']'))


def main(folder, cache):
    print('Selftest:')
    if not selftest():
        sys.exit(1)
    planets = load(folder)
    both = [p for p in planets if p['a'] and kepler(p['P'], p['Ms'], p['Mp'])]
    print(f"\nPlanets with an archive orbit, a period and a star's mass: {len(both)} of {len(planets)}")
    for t in (0.05, 0.10, 0.20):
        print(f"  Kepler's law within {int(t * 100)}% of the archive's orbit: {sum(apart(p) <= t for p in both)}")
    off = sorted((p for p in both if apart(p) > 0.10), key=lambda p: p['name'])
    names = [p['name'] for p in off]
    print(f"The set: the {len(off)} planets more than 10% apart.\n\nThe archive (today's tables, joined by name):")
    comp = {r['pl_name']: r for r in tap.query(COMP_Q, cache)}
    ps = {}
    for i in range(0, len(names), CHUNK):
        inlist = ','.join("'" + n.replace("'", "''") + "'" for n in names[i:i + CHUNK])
        for r in tap.query(f'select {PS_COLS} from ps where pl_name in ({inlist})', cache):
            ps.setdefault(r['pl_name'], []).append(r)
    cb = circumbinary(folder)
    rows, noref, cbn, missing = [], 0, 0, 0
    for p in off:
        c = comp.get(p['name'])
        if c is None:
            missing += 1
            continue
        if p['name'] in cb:
            cbn += 1
            continue
        mref = label(c['st_mass_reflink'])
        others, koi = {}, []
        for r in ps.get(p['name'], []):
            if r['st_mass'] is None or label(r['st_refname']) == mref:
                continue
            if 'KOI Table' in label(r['st_refname']):
                koi.append(r['st_mass'])
            else:
                others.setdefault(label(r['st_refname']), r['st_mass'])
        masses = list(others.values()) + ([statistics.median(koi)] if koi else [])
        if not masses:
            noref += 1
            continue
        rows.append({'name': p['name'], 'A': p['a'], 'K': kepler(p['P'], p['Ms'], p['Mp']), 'ref': kepler(p['P'], statistics.median(masses), p['Mp']),
                     'star_ref': p['star_ref'], 'mass_ref': mref})
    print(f"\nScored: {len(rows)} of the {len(off)}; left out: {cbn} circumbinary, {noref} with no other paper's mass, {missing} not in today's composite.")
    groups = [('all', rows), (f'mass from {STASSUN}', [r for r in rows if r['mass_ref'] == STASSUN]),
              (f'mass from {MORTON}', [r for r in rows if r['mass_ref'] == MORTON]),
              ('mass from any other paper', [r for r in rows if r['mass_ref'] not in (STASSUN, MORTON)])]
    for title, rs in groups:
        print(f"\n{title} ({len(rs)} planets): picked nearer the reference; picked orbit off it, median and 90th percentile")
        for name, pick in CANDIDATES:
            s = score(rs, pick)
            if s['n']:
                print(f"  {name:84} {s['near']:4d} of {s['n']:<4d} ({s['near'] / s['n'] * 100:3.0f}%)   {s['median'] * 100:5.1f}%   {s['p90'] * 100:5.1f}%")
    won, scores = best(rows)
    ranked = sorted(scores, key=lambda x: (-x[1]['near'], x[1]['median']))
    w, r2 = ranked[0][1], ranked[1][1]
    print(f"\nAdopted: {won}.\nIts margin over the next, {ranked[1][0]}: {w['near'] - r2['near']} more planets picked nearer "
          f"({w['near']} against {r2['near']} of {w['n']}); median {w['median'] * 100:.1f}% against {r2['median'] * 100:.1f}%; "
          f"90th percentile {w['p90'] * 100:.1f}% against {r2['p90'] * 100:.1f}%.")
    covered = sum(r['star_ref'] == STASSUN for r in rows if r['mass_ref'] == STASSUN)
    print(f"The guard reads the snapshot's star reference: it covers {covered} of the {sum(r['mass_ref'] == STASSUN for r in rows)} scored planets whose composite mass is from {STASSUN}.")


if __name__ == '__main__':
    main(tap.folder_arg(sys.argv), tap.cache_dir(sys.argv))
