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

const { CSV_HEAD, objectRows, objectsCsv, plateLines, importState, PLATE_BAND } = await import('./plate.js');
const P = await import('./physics.js');
const K = await import('./kerr.js');
const { OBJECTS, VERSION, CITE, EHT_RES } = await import('./config.js');
const { Store } = await import('./state.js');

/* a page with no DOM: the store and the model, as main.js keeps them */
function page(obj = 'm87', view = 'cinematic', extra = null) {
  const store = new Store();
  store.set(store.preset(obj, view), { instant: true, src: 'boot' });
  const app = { store, model: P.derive(store.all()) };
  store.on(() => { app.model = P.derive(store.all()); });
  if (extra) store.set(extra, { instant: true });
  return app;
}
function link(search) {
  const store = new Store();
  store.open(search);
  const app = { store, model: P.derive(store.all()) };
  store.on(() => { app.model = P.derive(store.all()); });
  return app;
}

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

/* ============================================================
   Added 2026-11-17 after review_s2_p1_second.md: the plate's
   stamp (plateLines, which exportPlate draws), the CSV, the data
   version and the import, each against the finding it closes.
   ============================================================ */
const col = (r, name) => r[CSV_HEAD.indexOf(name)];

/* ---------- K1 and S1: the plate prints the inclination its shadow was measured at ---------- */
guard('S1: the plate\'s inclinations', () => {
  for (const [obj, view] of [['m87', 'cinematic'], ['m87', 'journey'], ['sgra', 'cinematic'], ['m87', 'telescope']]) {
    const app = page(obj, view), s = app.store.all(), ms = P.measurement(s), L = plateLines(app, '2026-11-17').map((l) => l.text);
    ok(`${obj} ${view}: the first line names the camera's ${s.incl} deg as the camera's`, L[0].includes(`camera at i = ${P.deg(s.incl)} deg`), L[0]);
    ok(`${obj} ${view}: the shadow is printed with the ${ms.incl} deg it was measured at, and its diameter is the measurement's`, L[1].includes(`shadow ${P.s3(ms.th.mean)} M across, ${P.MEAN_DEF}, seen from far away at i = ${P.deg(ms.incl)} deg`), L[1]);
    ok(`${obj} ${view}: the angle is the measurement's`, L[2].includes(`on the sky ${P.pmText(ms.cmp.pred.value, ms.cmp.pred.errP, ms.cmp.pred.errM)} uas`), L[2]);
  }
  const c = page('m87', 'cinematic', { obj: 'custom' }), L = plateLines(c, '2026-11-17').map((l) => l.text);
  ok('a custom hole in the cinematic view: measured at 17 deg, as the card measures it, not at 90', L[1].includes(`shadow ${P.s3(P.shadowFor(0.94, 17, 0).mean)} M across`) && L[1].includes('at i = 17 deg'), L[1]);
});

/* ---------- S2, S3, S6, S7: what the plate says the EHT gave, the scale's source, the shadow's label ---------- */
guard('the plate\'s comparison', () => {
  const m = plateLines(page('m87', 'telescope'), '2026-11-17').map((l) => l.text).join('\n');
  ok('M87*: the ring named as emission, no sigma, and no shadow measured, never "published"', m.includes('EHT ring of emission 42 ± 3 uas') && m.includes(P.noShadow('M87*')) && !/published/.test(m) && !/[+-][\d.]+ sigma/.test(m), m);
  ok('M87*: the scale as a number, 3.62 (+0.60, −0.34) uas per M, and its source', m.includes('at 3.62 (+0.60, −0.34) uas per M, the scale from the motions of its stars') && m.includes(`scale: ${CITE.gebhardt2011}`), m);
  const s = plateLines(page('sgra', 'telescope'), '2026-11-17').map((l) => l.text).join('\n');
  ok('Sgr A*: one sigma against the EHT shadow, and no ring of emission', s.includes('EHT shadow 48.7 ± 7.0 uas: +0.553 sigma') && !/ring/.test(s), s);
  ok('Sgr A*: the scale\'s source is the stellar orbits\' paper, as EHT 2022 tabulates it', s.includes(`scale: ${CITE.gravity2022}`) && s.includes('at 5.124 ± 0.026 uas per M'), s);
  const y = plateLines(page('cygx1', 'telescope'), '2026-11-17').map((l) => l.text).join('\n');
  ok('Cygnus X-1: its angle with its scale, below the EHT\'s nominal resolution', y.includes('(9.4 ± 1.2)×10⁻⁵ uas per M') && y.includes(`nominal resolution of ${EHT_RES.uas} uas`) && y.includes(`scale: ${CITE.mj2021}`), y);
  // S7: a charged hole is labelled as the card labels it
  const kn = plateLines(link('?o=sgra&v=telescope&qq=0.5'), '2026-11-17')[1].text, rn = plateLines(link('?o=sgra&v=telescope&a=0&qq=0.6'), '2026-11-17')[1].text;
  ok('Kerr-Newman (a = 0.5, Q = 0.5): "traced: no closed form for Q and a", never Bardeen', kn.includes(`(${P.SHADOW_HOW.traced.label})`) && !/Bardeen/.test(kn), kn);
  ok('Reissner-Nordstrom (a = 0, Q = 0.6): "2 b_c, Reissner-Nordstrom", never Bardeen', rn.includes(`(${P.SHADOW_HOW.rn.label})`) && !/Bardeen/.test(rn), rn);
  ok('Kerr: Bardeen 1973', plateLines(page('m87', 'telescope'), '2026-11-17')[1].text.includes('(Bardeen 1973)'));
});

/* ---------- the stamp fits its frame (the text scales with the plate; IBM Plex Mono advances 0.6 em) ---------- */
guard('the stamp fits', () => {
  const states = [page('m87', 'cinematic'), page('m87', 'telescope'), page('sgra', 'cinematic'), page('cygx1', 'telescope'), page('primordial', 'telescope'),
    link('?o=sgra&v=telescope&qq=0.5'), link('?o=sgra&v=telescope&a=0&qq=0.6'), page('m87', 'journey', { obj: 'custom', a: 0.3, q: 0.9 })];
  const inner = 1920 - PLATE_BAND.frame - PLATE_BAND.x;   // from x = 48 to the frame's inner edge at 1896
  for (const app of states) {
    const L = plateLines(app, '2026-11-17'), s = app.store.all();
    const widest = Math.max(...L.map((l) => l.text.length * 0.6 * l.px));
    ok(`${s.obj} ${s.view} (a ${s.a}, Q ${s.q}): every line inside the frame, the widest ${Math.round(widest)} of ${inner} px`, widest <= inner, L.map((l) => l.text.length).join(','));
    const last = L[L.length - 1];
    ok(`${s.obj} ${s.view}: the last line sits inside the band, above the frame`, last.y + 0.25 * last.px <= PLATE_BAND.h - PLATE_BAND.frame && L.every((l, i) => !i || l.y > L[i - 1].y), L.map((l) => l.y).join(','));
  }
});

/* ---------- S3, S6 and K1 in the table ---------- */
guard('the table\'s comparison', () => {
  const rows = objectRows(), [m87, sgr, cyg] = rows;
  ok('Sgr A*: no ring of emission in its comparison columns', col(sgr, 'eht_ring_uas') === '' && col(sgr, 'eht_ring_err') === '' && col(sgr, 'eht_shadow_uas') === 48.7, `${col(sgr, 'eht_ring_uas')}`);
  ok('every row names its scale\'s source', col(m87, 'shadow_scale_source') === CITE.gebhardt2011 && col(sgr, 'shadow_scale_source') === CITE.gravity2022 && col(cyg, 'shadow_scale_source') === CITE.mj2021 && col(rows[3], 'shadow_scale_source') === '');
  for (const [i, o] of OBJECTS.entries()) {
    const ms = P.measurement(new Store().preset(o.id, 'telescope'));
    ok(`${o.name}: the row's inclination and diameter are the measurement's of its telescope link`, col(rows[i], 'inclination_deg') === ms.incl && col(rows[i], 'shadow_mean_diameter_M') === P.sigNum(ms.th.mean), `${col(rows[i], 'inclination_deg')} ${col(rows[i], 'shadow_mean_diameter_M')}`);
  }
  ok('the first line names the view and the diameter\'s definition', objectsCsv('2026-11-17').split('\n')[0].includes(P.MEAN_DEF));
});

/* ---------- S9: the data version moves with the comparison's data ---------- */
guard('the data version', () => {
  // FNV-1a over every field a comparison reads, with the text of every source it cites. When this fails, the data
  // changed: move VERSION to the day of the change and pin both values here together.
  const FIELDS = ['id', 'mass', 'massErr', 'massSrc', 'massBy', 'distPc', 'distErr', 'distSrc', 'spin', 'incl', 'eht', 'ruler', 'thetaGPub'];
  const cites = (o) => [o.massSrc, o.distSrc, o.ruler?.basis, o.ruler?.src, o.eht?.src, o.eht?.predicted?.src].map((k) => (k ? CITE[k] : null));
  const text = JSON.stringify([OBJECTS.map((o) => [FIELDS.map((k) => o[k] ?? null), cites(o)]), EHT_RES, CITE[EHT_RES.src]]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const hash = h.toString(16).padStart(8, '0');
  const PINNED = { version: '2026-11-17', hash: '51d82697' };   // 2026-11-17, before release: M87*'s massBy writes theta_g in the card's own symbol
  ok(`the data version ${VERSION} and the hash of the comparison's data (${hash}) are the pinned pair`, VERSION === PINNED.version && hash === PINNED.hash, `${VERSION} ${hash}`);
  ok('the CSV names the version in its first line', objectsCsv('2026-11-17').split('\n')[0].includes(`data version ${VERSION}`));
});

/* ---------- K5: an imported file takes the rule a link takes ---------- */
await (async () => {
  const file = (o) => ({ text: async () => JSON.stringify(o) });
  try {
    const a = page('m87', 'telescope');
    await importState(a, file({ state: { ...a.store.all(), obj: 'sgra', mass: 7, dist: Math.log10(8277), a: 0.5, incl: 30 } }));
    ok('a file naming Sgr A* at 10^7 solar masses opens a custom hole: the comparison never reads the catalogue under another mass', a.store.get('obj') === 'custom' && a.store.get('mass') === 7, `${a.store.get('obj')} ${a.store.get('mass')}`);
    const b = page('m87', 'telescope');
    await importState(b, file({ state: { obj: 'sgra', view: 'telescope' } }));
    ok('a file naming only Sgr A* and the telescope view opens them as a link does, with the object\'s own mass and inclination', b.store.get('obj') === 'sgra' && b.store.get('mass') === Math.log10(4.297e6) && b.store.get('incl') === 30, `${b.store.get('obj')} ${b.store.get('incl')}`);
    const c = page('m87', 'telescope');
    await importState(c, file({ state: c.store.all() }));
    ok('a file of the page\'s own state opens that state, still M87*', c.store.get('obj') === 'm87' && c.store.get('incl') === 17);
    let threw = false;
    try { await importState(page(), file({ state: 3 })); } catch { threw = true; }
    ok('a file with no state object is refused', threw);
  } catch (e) { ok('the import: runs without an error', false, e.message); }
})();

console.log(fails ? `\n${fails} of ${checks} table check(s) failed` : `\nall ${checks} table checks passed`);
process.exit(fails ? 1 : 0);
