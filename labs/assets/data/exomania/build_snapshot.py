#!/usr/bin/env python3
"""Build the Exomania snapshot of the NASA Exoplanet Archive's Planetary Systems
Composite Parameters table (PSCompPars, doi:10.26133/NEA13).

Why a second file: the weekly roster (labs/exoplanet_data.json, refreshed by a
workflow this lab does not touch) carries 9 fields. The survey needs the rest:
stellar radius, mass and luminosity, insolation, eccentricity, impact parameter,
measured transit depth and duration, mass provenance and limit flags, error
bars, discovery method, year and facility, sky position, and the reference the
archive cites for the radius, mass, period, stellar radius and the discovery.

Usage (run by hand; the output is committed):
  curl -fsS "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=<QUERY>&format=json" -o raw.json
  python build_snapshot.py raw.json pscomppars-snapshot.json 2026-11-11

QUERY (spaces as +):
  select pl_name,hostname,discoverymethod,disc_year,disc_facility,sy_dist,pl_orbper,
  pl_orbsmax,pl_orbsmaxerr1,pl_orbsmaxerr2,pl_orbeccen,pl_rade,pl_radeerr1,pl_radeerr2,
  pl_bmasse,pl_bmasseerr1,pl_bmasseerr2,pl_bmasselim,pl_bmassprov,pl_insol,pl_eqt,
  pl_orbincl,pl_imppar,pl_trandep,pl_trandur,st_teff,st_tefferr1,st_tefferr2,st_rad,
  st_raderr1,st_raderr2,st_mass,st_lum,ra,dec,tran_flag,sy_pnum,pl_rade_reflink,
  pl_bmasse_reflink,pl_orbper_reflink,st_rad_reflink,disc_refname
  from pscomppars

Data: NASA Exoplanet Archive, operated by the California Institute of Technology
under contract with NASA under the Exoplanet Exploration Program. The archive asks
for that acknowledgement and for Christiansen et al. 2025, PSJ 6, 186. It states
no explicit licence; reuse here is with that acknowledgement.
"""
import json, math, re, sys

COLS = ['pl_name', 'host', 'method', 'year', 'facility', 'sy_dist', 'pl_orbper', 'pl_orbsmax',
        'pl_orbeccen', 'pl_rade', 'pl_radeerr1', 'pl_radeerr2', 'pl_bmasse', 'pl_bmasseerr1',
        'pl_bmasseerr2', 'pl_bmasselim', 'massprov', 'pl_insol', 'pl_eqt', 'pl_imppar',
        'pl_trandep', 'pl_trandur', 'st_teff', 'st_rad', 'st_mass', 'st_lum', 'ra', 'dec',
        'pl_orbsmaxerr', 'st_tefferr', 'st_raderr', 'ref_r', 'ref_m', 'ref_p', 'ref_star', 'ref_disc']

REF_RE = re.compile(r'href=(\S+)[^>]*>\s*(.*?)\s*</a>', re.S)


def symerr(e1, e2, n=2):
    a = [abs(float(x)) for x in (e1, e2) if x is not None]
    return sig(sum(a) / len(a), n) if a else None


def sig(v, n=4):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f or math.isinf(f):
        return None
    if f == 0:
        return 0
    d = n - int(math.floor(math.log10(abs(f)))) - 1
    r = round(f, max(d, 0)) if d > 0 else round(f, d)
    return int(r) if float(r).is_integer() else r


def main(src, dst, date):
    raw = json.load(open(src, encoding='utf-8'))
    methods, facilities, provs, refs = [], [], [], []
    ref_ix = {}

    def ref(html):
        # '<a refstr=X href=URL target=ref> Author et al. 2013 </a>' -> index into refs [label, ads bibcode or url]
        if not html:
            return None
        m = REF_RE.search(html)
        if not m:
            return None
        url, label = m.group(1), ' '.join(m.group(2).split())
        bib = re.search(r'adsabs\.harvard\.edu/abs/([^/]+)', url)
        key = bib.group(1) if bib else url
        if key not in ref_ix:
            ref_ix[key] = len(refs)
            refs.append([label, key])
        return ref_ix[key]

    def idx(table, v):
        if v is None:
            return None
        if v not in table:
            table.append(v)
        return table.index(v)

    rows = []
    for r in sorted(raw, key=lambda r: r['pl_name']):
        name, host = r['pl_name'], r.get('hostname') or ''
        derived_host = re.sub(r' \w$', '', name)
        rows.append([
            name, 0 if host == derived_host else host,
            idx(methods, r.get('discoverymethod')), r.get('disc_year'), idx(facilities, r.get('disc_facility')),
            sig(r.get('sy_dist')), sig(r.get('pl_orbper'), 5), sig(r.get('pl_orbsmax')),
            sig(r.get('pl_orbeccen'), 3), sig(r.get('pl_rade')), sig(r.get('pl_radeerr1'), 2), sig(r.get('pl_radeerr2'), 2),
            sig(r.get('pl_bmasse')), sig(r.get('pl_bmasseerr1'), 2), sig(r.get('pl_bmasseerr2'), 2),
            r.get('pl_bmasselim') or 0, idx(provs, r.get('pl_bmassprov')),
            sig(r.get('pl_insol')), sig(r.get('pl_eqt')), sig(r.get('pl_imppar'), 2),
            sig(r.get('pl_trandep'), 3), sig(r.get('pl_trandur'), 3),
            sig(r.get('st_teff')), sig(r.get('st_rad')), sig(r.get('st_mass')), sig(r.get('st_lum')),
            sig(r.get('ra'), 3), sig(r.get('dec'), 3),
            symerr(r.get('pl_orbsmaxerr1'), r.get('pl_orbsmaxerr2')), symerr(r.get('st_tefferr1'), r.get('st_tefferr2')),
            symerr(r.get('st_raderr1'), r.get('st_raderr2')),
            ref(r.get('pl_rade_reflink')), ref(r.get('pl_bmasse_reflink')), ref(r.get('pl_orbper_reflink')),
            ref(r.get('st_rad_reflink')), ref(r.get('disc_refname')),
        ])
    out = {
        'meta': {
            'source': 'NASA Exoplanet Archive, Planetary Systems Composite Parameters (PSCompPars)',
            'doi': '10.26133/NEA13',
            'retrieved': date,
            'rows': len(rows),
            'units': {'sy_dist': 'pc', 'pl_orbper': 'd', 'pl_orbsmax': 'AU', 'pl_rade': 'R_earth',
                      'pl_bmasse': 'M_earth', 'pl_insol': 'S_earth', 'pl_eqt': 'K', 'pl_trandep': '%',
                      'pl_trandur': 'h', 'st_teff': 'K', 'st_rad': 'R_sun', 'st_mass': 'M_sun',
                      'st_lum': 'log10(L/L_sun)', 'ra': 'deg', 'dec': 'deg'},
            'host': '0 means the host name is the planet name without its last letter',
            'acknowledgement': 'This research has made use of the NASA Exoplanet Archive, which is operated by the '
                               'California Institute of Technology, under contract with the National Aeronautics and '
                               'Space Administration under the Exoplanet Exploration Program.',
        },
        'refs_note': 'refs: [label, ADS bibcode or archive URL]; ref_* columns index it',
        'methods': methods, 'facilities': facilities, 'massprov': provs, 'refs': refs,
        'cols': COLS, 'rows': rows,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print(f'{len(rows)} planets -> {dst}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
