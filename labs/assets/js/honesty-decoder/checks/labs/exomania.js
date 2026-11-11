/* Exomania: the lab's physics module on an Earth analogue against the
   NASA Earth Fact Sheet, and the running lab's Kepler-62 e against
   its discovery paper. */
import { REFERENCES } from '../../config.js';

const within = (x, ref, tol) => Math.abs(x - ref) / ref <= tol;

export const PROBES = {
  'ex-physics': {
    what: 'importing the lab\'s data.js and running physics() on an Earth analogue',
    fails: 'fails if escape velocity or equilibrium temperature lands more than 1% from Earth\'s published values',
    async run() {
      const { physics } = await import('../../../exoplanet/data.js');
      const p = physics({ pl_name: 'Earth analogue', pl_rade: 1, pl_masse: 1, st_teff: 5772, pl_orbsmax: 1, pl_eqt: null, pl_orbper: 365.256 });
      const v = REFERENCES.earthVesc, t = REFERENCES.earthTbb;
      const okV = within(p.vEscKms, v.value, v.tol), okT = within(p.Teq, t.value, t.tol);
      return {
        status: 'pass', verdict: okV && okT ? 'supported' : okV || okT ? 'partial' : 'unsupported',
        detail: `physics() gives v_esc ${p.vEscKms.toFixed(3)} km/s (published ${v.value}) and T_eq ${p.Teq.toFixed(1)} K (published ${t.value}), ${v.cite}`,
      };
    },
  },
  'ex-kepler62e': {
    heavy: true,
    what: 'loading the lab at ?p=Kepler-62 e in a hidden frame (it fetches its 0.8 MB catalogue) and reading radius and period',
    fails: 'fails if the lab shows Kepler-62 e more than 1% from Borucki et al. (2013)',
    async run(ctx) {
      const f = await ctx.frame('exomania.html?still&p=Kepler-62%20e', {
        ready: (a) => (a.text('#ret-name') === 'Kepler-62 e' && a.count('.tel-panel .tel-val') >= 8) || (a.$('#exo-fail') && !a.$('#exo-fail').hidden && a.text('#exo-fail')),
        timeout: 15000,
      });
      if (f.$('#exo-fail') && !f.$('#exo-fail').hidden && f.text('#exo-fail')) return { status: 'error', detail: 'this browser gave the lab no WebGL context' };
      const vals = f.$$('.tel-panel .tel-val').map((x) => x.textContent.replace(/\s+/g, ' ').trim());
      const R = parseFloat((vals[3] || '').replace(/[^\d.]/g, ''));
      const P = parseFloat((vals[7] || '').replace(/[^\d.]/g, ''));
      if (!R || !P) return { status: 'error', detail: `could not read radius and period: ${vals.join(' | ').slice(0, 120)}` };
      const ref = REFERENCES.kepler62e;
      const ok = within(R, ref.value.R, ref.tol) && within(P, ref.value.P, ref.tol);
      return {
        status: 'pass', verdict: ok ? 'supported' : 'partial',
        detail: `the running lab shows Kepler-62 e at ${R} R_earth and ${P} d; ${ref.cite} give ${ref.value.R} R_earth and ${ref.value.P} d`,
      };
    },
  },
};
