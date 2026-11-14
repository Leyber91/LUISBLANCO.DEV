#!/usr/bin/env python3
"""Which rule picks the best working clock? A backtest on the published record.

build_ephemerides.py chooses one working clock for each planet. This script is how that rule was chosen, and
how it can be checked again after the archive changes. It is run by hand and writes nothing.

For every planet with dated solutions from three or more papers: hide the most recently published paper, let
each rule choose a clock from what was published before it, and measure how far that clock's forecast of the
transit nearest the day of retrieval lies from the hidden paper's forecast. The hidden paper stands in for the
truth, as the latest look at the planet. That is an assumption, and it is the same for every rule.

A planet is left out when the hidden paper is itself too vague to judge by (its error a sixth of the period or
more), or when fewer than two other papers remain. Solutions that share the hidden paper's period to every
digit are left out too: they are the same ephemeris.

Usage:
  python backtest_clock.py .        # in the folder that holds ephemerides.json and ephemerides-record.json

Columns: the median gap to the hidden paper; the mean and median score of the forecast (the continuous ranked
probability score, capped at one day so a few planets do not carry the mean); the share within 3 combined
sigmas; how many gaps exceed three hours; how many exceed 5 sigma (a confident miss); how many chosen clocks
have an error longer than the transit (they would be called lost).
"""
import json, math, os, statistics, sys

sys.dont_write_bytecode = True                                                # this folder is published: leave no cache in it
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_ephemerides as B                                                 # noqa: E402  the rule under test lives there


def julian(retrieved):
    y, mo, d = (int(x) for x in retrieved.split('-'))
    a = (14 - mo) // 12
    return d + (153 * (mo + 12 * a - 3) + 2) // 5 + 365 * (y + 4800 - a) + (y + 4800 - a) // 4 - (y + 4800 - a) // 100 + (y + 4800 - a) // 400 - 32045 - 0.5


def narrowest(c, today):
    return min(c, key=lambda s: B.carried(s, today)[1])


def latest_paper(c, today):
    dated = [s for s in c if s[5] is not None]
    if not dated:
        return narrowest(c, today)
    top = max(s[5] for s in dated)
    return narrowest([s for s in dated if s[5] == top], today)


def tallest_pile(c, today):
    """Each lineage's forecast is a bump as wide as its error, no narrower than the median error; the bumps are
    added; the clock is the sharpest one under the tallest pile."""
    v = B.lineages(c, today)
    if len(v) == 1:
        return v[0]
    pred = [B.carried(s, today) for s in v]
    w0 = statistics.median(p[1] for p in pred)
    w = [max(p[1], w0) for p in pred]
    P = min(s[2] for s in v)
    gap = lambda a, b: min((a - b) % P, P - (a - b) % P)
    dens = [sum(math.exp(-0.5 * (gap(pred[i][0], pred[j][0]) / w[j]) ** 2) / w[j] for j in range(len(v))) for i in range(len(v))]
    top = max(range(len(v)), key=lambda i: dens[i])
    return v[min((i for i in range(len(v)) if gap(pred[i][0], pred[top][0]) <= 3 * math.hypot(pred[i][1], w[top])), key=lambda i: pred[i][1])]


RULES = {
    'the smallest error today': narrowest,
    'the latest paper': latest_paper,
    'the sharpest under the tallest pile': tallest_pile,
    'the build script (median pair score)': lambda c, today: B.choose_clock(c, today)[0],
}


def main(folder):
    doc = json.load(open(os.path.join(folder, 'ephemerides.json'), encoding='utf-8'))
    rec = json.load(open(os.path.join(folder, 'ephemerides-record.json'), encoding='utf-8'))
    dur_at = doc['cols'].index('dur_h')
    today = julian(doc['meta']['retrieved'])
    out = {k: [] for k in RULES}
    for i, row in enumerate(doc['rows']):
        sols = rec['sols'][i]
        dated = [s for s in sols if s[5] is not None and s[4] is not None]
        if len({s[4] for s in dated}) < 3:
            continue
        top = max(s[5] for s in dated)
        ref = next(s[4] for s in dated if s[5] == top)
        hidden = narrowest([s for s in dated if s[4] == ref], today)
        th, sh = B.carried(hidden, today)
        if sh >= hidden[2] * B.BLIND_SHARE:
            continue
        before = 2451545.0 + (top - 2000) * 365.25
        cand = [s for s in sols if s[4] != ref and s[2] != hidden[2] and ((s[5] is not None and s[5] < top) or (s[5] is None and s[0] <= before))]
        if len({s[4] for s in cand}) < 2:
            continue
        for name, rule in RULES.items():
            c = rule(cand, today)
            score, z, _ = B.between(c, hidden, today)
            tc, sc = B.carried(c, today)
            P = min(c[2], hidden[2])
            gap = abs((th - tc + P / 2) % P - P / 2)
            out[name].append((gap * 1440, score * 1440, abs(z), sc * 1440, row[dur_at]))
    n = len(next(iter(out.values())))
    print(f'{n} planets: three or more dated papers, the latest one hidden; retrieved {doc["meta"]["retrieved"]}')
    print(f"{'rule':38} {'median gap':>11} {'mean score':>11} {'median score':>13} {'within 3 sigma':>15} {'gap > 3 h':>10} {'beyond 5 sigma':>15} {'error > transit':>16}")
    for name, v in out.items():
        timed = [x for x in v if x[4]]
        print(f'{name:38} {statistics.median(x[0] for x in v):7.1f} min {statistics.mean(min(x[1], 1440) for x in v):7.1f} min {statistics.median(x[1] for x in v):9.1f} min'
              f' {100 * sum(1 for x in v if x[2] <= 3) / n:13.1f} % {sum(1 for x in v if x[0] > 180):10d} {sum(1 for x in v if x[2] > 5):15d} {sum(1 for x in timed if x[3] > x[4] * 60):16d}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
