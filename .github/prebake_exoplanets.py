#!/usr/bin/env python3
"""Pre-bake the NASA exoplanet catalogue: dedup + normalise ONCE (in CI) so the browser
doesn't redo it on every page load. Mirrors the dedup/normalise in
labs/assets/js/exoplanet/data.js exactly (best row per planet by field-completeness,
require pl_rade), keeps only the 9 fields the engine uses, writes minified.

Usage: python prebake_exoplanets.py <raw_in.json> <baked_out.json>
Turns the ~8.1 MB raw `ps` dump (~40k rows) into a ~0.5 MB ready catalogue (~4.7k worlds)."""
import json, re, sys

FIELDS = ['sy_dist', 'pl_orbper', 'pl_orbsmax', 'pl_rade', 'pl_masse', 'pl_eqt', 'st_teff']


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f          # NaN -> None


def completeness(r):
    return sum(1 for k in FIELDS if num(r.get(k)) is not None)


def normalise(r):
    name = r['pl_name']
    return {
        'pl_name': name,
        'hostname': r.get('hostname') or re.sub(r' \w$', '', name),
        'sy_dist': num(r.get('sy_dist')),
        'pl_orbper': num(r.get('pl_orbper')),
        'pl_orbsmax': num(r.get('pl_orbsmax')),
        'pl_rade': num(r.get('pl_rade')),
        'pl_masse': num(r.get('pl_masse')),
        'pl_eqt': num(r.get('pl_eqt')),
        'st_teff': num(r.get('st_teff')),
    }


def main(src, dst):
    with open(src, encoding='utf-8') as f:
        raw = json.load(f)
    best = {}
    for r in raw:
        if not r.get('pl_name') or num(r.get('pl_rade')) is None:
            continue                      # radius is the one mandatory field
        cur = best.get(r['pl_name'])
        if cur is None or completeness(r) > completeness(cur):
            best[r['pl_name']] = r
    out = [normalise(r) for r in best.values()]
    out.sort(key=lambda w: w['pl_name'])
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'))   # minified
    print(f"prebaked {len(raw)} raw rows -> {len(out)} worlds")
    return 0 if out else 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
