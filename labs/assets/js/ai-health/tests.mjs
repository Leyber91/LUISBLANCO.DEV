/* ============================================================
   ai-health/tests.mjs — the engine's own tests, in Node, no
   dependencies. The engine modules touch no DOM, so they import here
   unchanged.
     node labs/assets/js/ai-health/tests.mjs      (exit 0 pass, 1 fail)
   Covers NEWS2 against the RCP 2017 charts (band edges, vignettes, an
   independent second scorer), NEWS2 monotonicity away from the 0 band
   on random values, metric sanity, seed reproducibility of cohorts and
   fitted weights, additivity of both explanations, and invariance of
   the metrics to patient order.
   ============================================================ */

import { selfTest, checkVignettes, scoreNEWS2 } from './news2.js';
import { sweep } from './news2-check.js';
import { makeCohorts } from './cohort.js';
import { MODEL_BY_ID } from './models.js';
import { roc, pr, calibration } from './metrics.js';
import { makeRng } from './rng.js';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};

// NEWS2 against the charts
const st = selfTest();
check('NEWS2 band edges', st.length === 0, `${st.checked - st.length}/${st.checked}` + (st.length ? ' ' + st.join('; ') : ''));
const vg = checkVignettes();
check('NEWS2 vignettes', vg.every((v) => v.ok), `${vg.filter((v) => v.ok).length}/${vg.length}`);
const sw = sweep();
check('independent scorer sweep', sw.bad.length === 0, `${sw.n - sw.bad.length}/${sw.n}`);

// property: each parameter never scores less moving outward from its 0 band
{
  const rng = makeRng(99);
  const base = { rr: 16, spo2: 97, o2: 0, sbp: 120, hr: 70, cvpu: 0, temp: 37.0, scale2: 0 };
  const ranges = { rr: [0, 60, 16], hr: [20, 250, 70], sbp: [40, 300, 150], temp: [30, 43, 37] };
  let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const k = Object.keys(ranges)[i % 4];
    const [lo, hi, mid] = ranges[k];
    const a = lo + rng.u() * (hi - lo), b = lo + rng.u() * (hi - lo);
    const [near, far] = Math.abs(a - mid) < Math.abs(b - mid) ? [a, b] : [b, a];
    if ((near - mid) * (far - mid) < 0) continue;            // compare only on the same side of the 0 band
    const r = (v) => (k === 'temp' ? Math.round(v * 10) / 10 : Math.round(v));
    const pts = (v) => scoreNEWS2({ ...base, [k]: r(v) }).parts.find((p) => p.key === k).pts;
    if (pts(far) < pts(near)) bad++;
  }
  check('NEWS2 monotone away from the 0 band', bad === 0, `${bad} violations in 2000 random pairs`);
}

// metric sanity
{
  const rng = makeRng(7);
  const y = Array.from({ length: 2000 }, () => (rng.u() < 0.1 ? 1 : 0));
  const rand = y.map(() => rng.u());
  check('AUROC of the label itself is 1', roc(y, y).auc === 1);
  check('AUROC of a random score is near 0.5', Math.abs(roc(rand, y).auc - 0.5) < 0.06, roc(rand, y).auc.toFixed(3));
  const cal = calibration(rand, y);
  check('Brier within [0, 1]', cal.brier >= 0 && cal.brier <= 1, cal.brier.toFixed(4));
  const perm = y.map((_, i) => i).sort(() => rng.u() - 0.5);
  check('AUROC and AP ignore patient order', Math.abs(roc(perm.map((i) => rand[i]), perm.map((i) => y[i])).auc - roc(rand, y).auc) < 1e-12 &&
    Math.abs(pr(perm.map((i) => rand[i]), perm.map((i) => y[i])).ap - pr(rand, y).ap) < 1e-12);
}

// reproducibility and additivity on a small world
{
  const world = { seed: 31, trainN: 1200, blunt: 1, oxBias: 1, b0Shift: 0 };
  const a = makeCohorts(world), b = makeCohorts(world);
  check('same seed, same cohort', JSON.stringify(a.test.slice(0, 200)) === JSON.stringify(b.test.slice(0, 200)) && JSON.stringify(a.train) === JSON.stringify(b.train));
  const c = makeCohorts({ ...world, seed: 32 });
  check('different seed, different cohort', JSON.stringify(a.test.slice(0, 50)) !== JSON.stringify(c.test.slice(0, 50)));
  const lr1 = await MODEL_BY_ID.lr.fit(a.train, a.valid), lr2 = await MODEL_BY_ID.lr.fit(b.train, b.valid);
  check('same seed, same regression weights', lr1.beta.every((w, i) => w === lr2.beta[i]), `L2 ${lr1.l2}`);
  const g1 = await MODEL_BY_ID.gbt.fit(a.train, a.valid), g2 = await MODEL_BY_ID.gbt.fit(b.train, b.valid);
  check('same seed, same trees', a.test.slice(0, 100).every((p) => g1.logit(p) === g2.logit(p)));
  let err = 0;
  for (const p of a.test.slice(0, 150)) for (const m of [lr1, g1]) {
    const e = m.explain(p);
    err = Math.max(err, Math.abs(e.base + e.phi.reduce((s, f) => s + f.c, 0) - e.logit));
  }
  check('explanations sum to the prediction', err < 1e-9, `max error ${err.toExponential(1)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
