"""Thin the published posterior of the 3D cosmic shoreline into the survey's module of draws.

Source: Berta-Thompson, Wachiraphan & Murray 2026 (ApJ 1011, 123), Zenodo record 15858798
(doi:10.5281/zenodo.15858798), file cosmic-shoreline-btwm2026-posterior.nc, licence CC BY 4.0. The file holds
200,000 samples of the baseline "no magma ocean" model. This keeps every k-th sample, in the file's order, so the
module is reproducible from the record.

usage: python tools/dev/shoreline_draws.py <cosmic-shoreline-btwm2026-posterior.nc> [n]
writes labs/assets/js/exoplanet/shoreline.js (needs h5py and numpy; neither is a dependency of the site)
"""
import sys
from pathlib import Path

import h5py
import numpy as np

src = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
g = h5py.File(src, 'r')['posterior']
cols = {k: g[name][...].ravel() for k, name in [('logF0', 'log_f_0'), ('p', 'p'), ('q', 'q'), ('w', 'w')]}
total = cols['p'].size
step = total // n
pick = {k: v[::step][:n] for k, v in cols.items()}
out = Path(__file__).resolve().parents[2] / 'labs/assets/js/exoplanet/shoreline.js'
fmt = lambda a: ','.join(f'{x:.5g}' for x in a)
out.write_text(f"""/* ============================================================
   shoreline.js: {n} draws of the posterior of the 3D cosmic
   shoreline, written by tools/dev/shoreline_draws.py. Do not
   edit by hand.

   Berta-Thompson, Wachiraphan & Murray 2026, ApJ 1011, 123,
   doi:10.3847/1538-4357/ae77fd. Posterior samples: Zenodo record
   15858798, doi:10.5281/zenodo.15858798, file
   cosmic-shoreline-btwm2026-posterior.nc (the baseline "no magma
   ocean" model, {total} samples), licence CC BY 4.0. Every
   {step}th sample in the file's order is kept.

   Columns: log10(f0 / f_earth), p, q, and the width w in dex.
   ============================================================ */

export const DRAWS = {{
  n: {n},
  source: 'Berta-Thompson, Wachiraphan & Murray 2026, posterior samples, Zenodo 15858798 (CC BY 4.0)',
  logF0: [{fmt(pick['logF0'])}],
  p: [{fmt(pick['p'])}],
  q: [{fmt(pick['q'])}],
  w: [{fmt(pick['w'])}],
}};
""", encoding='utf-8', newline='\n')
print(f'{out}: {n} draws of {total}, every {step}th; medians', {k: round(float(np.median(v)), 4) for k, v in pick.items()})
