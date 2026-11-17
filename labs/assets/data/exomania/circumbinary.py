#!/usr/bin/env python3
"""Write the list of the snapshot's planets that orbit two stars into labs/assets/js/exoplanet/config.js.

The snapshot has no cb_flag column, and Kepler's third law on one star's mass gives a wrong orbit for a planet that
orbits two (Kepler-47 c: 0.8705 AU on 0.957 solar masses, where Orosz et al. 2019 give 0.9638). So the page keeps
their names (config.js CIRCUMBINARY) and gives them the archive's orbit (starlight.js semiMajor). This script reads
cb_flag from the archive's composite table, keeps the names the snapshot carries, and writes them between the markers
`// circumbinary:start` and `// circumbinary:end` with the query, its date and the rows' hash. Nothing else in
config.js is touched. When cb_flag enters the snapshot (the data workflow is Luis's), the list goes.

Usage:
  python circumbinary.py .  [--cache <dir>]       # in the folder that holds pscomppars-snapshot.json
"""
import json, os, re, sys

sys.dont_write_bytecode = True                                                # this folder is published: leave no cache in it
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tap                                                                    # noqa: E402

QUERY = 'select pl_name,cb_flag from pscomppars where cb_flag = 1'
START, END = '// circumbinary:start', '// circumbinary:end'


def config_path(folder):
    return os.path.join(folder, '..', '..', 'js', 'exoplanet', 'config.js')


def main(folder, cache):
    rows = tap.query(QUERY, cache)
    snap = json.load(open(os.path.join(folder, 'pscomppars-snapshot.json'), encoding='utf-8'))
    have = {r[snap['cols'].index('pl_name')] for r in snap['rows']}
    names = sorted(r['pl_name'] for r in rows if r['pl_name'] in have)
    fetched = tap.fetched(QUERY, cache)
    block = '\n'.join([
        START,
        '/* The snapshot\'s planets that orbit two stars, written by labs/assets/data/exomania/circumbinary.py; do not',
        f'   edit by hand. Query: {QUERY} (NASA Exoplanet Archive TAP), fetched {fetched},',
        f'   {len(rows)} rows, sha256 {tap.rows_hash(rows)}; {len(names)} of them in the snapshot of {snap["meta"]["retrieved"]}. Kepler\'s third',
        '   law on one star\'s mass does not give their orbits, so the page uses the archive\'s (starlight.js semiMajor).',
        '   When cb_flag enters the snapshot, this list goes. */',
        'export const CIRCUMBINARY = Object.freeze([',
        *[f'  {json.dumps(n, ensure_ascii=False)},' for n in names],
        ']);',
        END,
    ])
    path = config_path(folder)
    raw = open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in raw
    text = raw.replace('\r\n', '\n')
    if START in text:
        text = re.sub(re.escape(START) + r'.*?' + re.escape(END), lambda m: block, text, flags=re.S)
    else:
        text = text.rstrip('\n') + '\n\n' + block + '\n'
    open(path, 'w', encoding='utf-8', newline='').write(text.replace('\n', '\r\n') if crlf else text)
    print(f'config.js: {len(names)} names written')


if __name__ == '__main__':
    main(tap.folder_arg(sys.argv), tap.cache_dir(sys.argv))
