"""The NASA Exoplanet Archive's TAP service, read through a cache, for the backtests of this folder.

A backtest reads the archive at run time; nothing it reads is committed (a data file in the public repository is Luis's
call). Each query's rows are kept in a cache outside the repository (the system's temporary folder, or --cache <dir>),
so a second run reads the same rows. Every query prints itself, the date its rows were fetched and a hash of the rows,
so two runs can be shown to have read the same data.
"""
import hashlib, json, os, sys, tempfile, time, urllib.parse, urllib.request

sys.dont_write_bytecode = True                                                # this folder is published: leave no cache in it

TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'


def cache_dir(argv):
    if '--cache' in argv:
        return argv[argv.index('--cache') + 1]
    return os.path.join(tempfile.gettempdir(), 'exomania-tap-cache')


def folder_arg(argv):
    """The first argument that is not an option or an option's value; '.' by default."""
    rest, skip = [], False
    for a in argv[1:]:
        if skip:
            skip = False
        elif a == '--cache':
            skip = True
        elif not a.startswith('--'):
            rest.append(a)
    return rest[0] if rest else '.'


def rows_hash(rows):
    return hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()[:16]


def query(q, cache, quiet=False):
    """The rows of one ADQL query, from the cache when it holds them, else from the archive (then cached)."""
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, hashlib.sha256(q.encode('utf-8')).hexdigest()[:20] + '.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            got = json.load(f)
    else:
        url = TAP + '?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
        err = None
        for _ in range(3):
            try:
                with urllib.request.urlopen(url, timeout=120) as resp:
                    rows = json.loads(resp.read().decode('utf-8'))
                break
            except Exception as e:  # noqa: BLE001  retried, then raised
                err = e
                time.sleep(5)
        else:
            raise err
        got = {'query': q, 'fetched': time.strftime('%Y-%m-%d'), 'rows': rows}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(got, f, ensure_ascii=False)
    if not quiet:
        short = q if len(q) < 160 else q[:150] + ' ... (' + str(len(q)) + ' characters)'
        print(f"  TAP: {short}\n       fetched {got['fetched']}, {len(got['rows'])} rows, sha256 {rows_hash(got['rows'])}")
    return got['rows']


def fetched(q, cache):
    """The date the cached rows of a query were fetched."""
    path = os.path.join(cache, hashlib.sha256(q.encode('utf-8')).hexdigest()[:20] + '.json')
    with open(path, encoding='utf-8') as f:
        return json.load(f)['fetched']


def seed(q, rows, fetched, cache):
    """Put rows fetched elsewhere into the cache under the query that returns them (used once, to reuse a download)."""
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, hashlib.sha256(q.encode('utf-8')).hexdigest()[:20] + '.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'query': q, 'fetched': fetched, 'rows': rows}, f, ensure_ascii=False)
