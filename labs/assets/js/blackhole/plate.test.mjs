/* ============================================================
   blackhole/plate.test.mjs — the objects table a visitor saves.
   Run:  node labs/assets/js/blackhole/plate.test.mjs
   Exit 0 when every check passes. No dependencies.

   Written 2026-11-16 after review_s2.md P1-3 (M87*'s row could not
   reproduce its own prediction: the scale it used was a phrase, not
   a number) and P1-2 (fixed decimals wrote Cygnus X-1's 9.1e-4 uas
   as 0.001 +- 0.000). Each row's prediction is redone here from the
   row's own columns.
   ============================================================ */

globalThis.window = globalThis.window || { location: { hostname: 'localhost', search: '' }, addEventListener() {} };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = globalThis.document || { addEventListener() {}, querySelector: () => null };

const { CSV_HEAD, objectRows, objectsCsv } = await import('./plate.js');
const P = await import('./physics.js');
const K = await import('./kerr.js');
const { OBJECTS } = await import('./config.js');

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };
const rel = (x, y) => Math.abs(x / y - 1);

guard('the table', () => {
  const rows = objectRows(), col = (r, name) => r[CSV_HEAD.indexOf(name)];
  ok('one row per object, one cell per column', rows.length === OBJECTS.length && rows.every((r) => r.length === CSV_HEAD.length), rows.map((r) => r.length).join(','));
  for (const r of rows) {
    const name = col(r, 'object'), d = col(r, 'shadow_mean_diameter_M'), sc = col(r, 'shadow_scale_uas_per_M'), u = col(r, 'predicted_shadow_uas');
    if (u === '') { ok(`${name}: no distance, no scale and no prediction`, sc === '' && col(r, 'distance_pc') === ''); continue; }
    // 4 significant figures on each number: the product agrees to the rounding of the three
    ok(`${name}: predicted = diameter x scale, from the row alone (${d} x ${sc} = ${u})`, rel(d * sc, u) < 1.5e-3, `${d * sc} vs ${u}`);
    ok(`${name}: its errors are the diameter times the scale's errors`, rel(d * col(r, 'shadow_scale_err_plus'), col(r, 'predicted_err_plus_uas')) < 1.5e-3 && rel(d * col(r, 'shadow_scale_err_minus'), col(r, 'predicted_err_minus_uas')) < 1.5e-3);
  }
  const [m87, sgr, cyg] = rows;
  ok('M87*: the scale is the stars\', 3.62 (+0.60, -0.34) uas per M, as a number', col(m87, 'shadow_scale_uas_per_M') === 3.62 && col(m87, 'shadow_scale_err_plus') === 0.6 && col(m87, 'shadow_scale_err_minus') === 0.34 && col(m87, 'shadow_scale') === 'the motions of its stars');
  ok('M87*: its sources name Gebhardt et al. 2011, where the scale comes from', /Gebhardt et al\. 2011/.test(col(m87, 'sources')), col(m87, 'sources'));
  ok('M87*: no shadow and no sigma against its ring', col(m87, 'eht_shadow_uas') === '' && col(m87, 'sigma_shadow') === '' && col(m87, 'eht_ring_uas') === 42);
  const sg = P.compareShadow(P.theoryShadow(0.5, 30).mean, OBJECTS[1]);
  ok('Sgr A*: the scale is its mass and distance\'s theta_g', rel(col(sgr, 'shadow_scale_uas_per_M'), K.thetaG(OBJECTS[1].mass, OBJECTS[1].distPc)) < 5e-4);
  ok('Sgr A*: one sigma, 3 significant figures of the comparison\'s, 0.553', col(sgr, 'sigma_shadow') === +sg.shadow.sigma.toPrecision(3) && col(sgr, 'sigma_shadow') === 0.553, `${col(sgr, 'sigma_shadow')}`);
  ok('Cygnus X-1: 9.1e-4 uas keeps 4 significant figures, and so do its errors', col(cyg, 'predicted_shadow_uas') > 9e-4 && col(cyg, 'predicted_shadow_uas') < 9.2e-4 && col(cyg, 'predicted_err_plus_uas') > 0, `${col(cyg, 'predicted_shadow_uas')} +${col(cyg, 'predicted_err_plus_uas')}`);
  ok('Primordial: its note stands for its sources', col(rows[3], 'sources') === OBJECTS[3].massNote);
  const csv = objectsCsv('2026-11-16').split('\n');
  ok('the CSV: a comment line, the header, a line per object', csv.length === 2 + OBJECTS.length && csv[1] === CSV_HEAD.join(',') && csv[0].includes('exported 2026-11-16'), csv[0]);
  ok('a cell holding a comma is quoted', csv[2].includes('"supermassive, galaxy M87"'), csv[2].slice(0, 80));
});

console.log(fails ? `\n${fails} of ${checks} table check(s) failed` : `\nall ${checks} table checks passed`);
process.exit(fails ? 1 : 0);
