/* ============================================================
   blackhole/ask.test.mjs — the guide: which topic a question
   reaches, the numbers it hands a model and checks in a reply,
   and the deterministic answers, each against the function the
   page's readouts use.
   Run:  node labs/assets/js/blackhole/ask.test.mjs
   Exit 0 when every check passes. No dependencies.

   Written 2026-11-16 from review_s2.md: P1-1 (a number named by
   a word was matched to the wrong quantity), P1-2 (Cygnus X-1's
   angle rounded to 0), P2-4 (a typed 2.6), P2-5 (a typed count),
   P2-6 (a typed threshold off by 81), P2-7 (the Hawking question
   routed to the disk), P2-9 (a disk described in the telescope
   view). No model is called: answerOffline and checkNumbers run
   on the real Store and derive().
   ============================================================ */

globalThis.window = globalThis.window || { location: { hostname: 'localhost', search: '' }, addEventListener() {} };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = globalThis.document || { addEventListener() {}, querySelector: () => null };

const { Store } = await import('./state.js');
const P = await import('./physics.js');
const K = await import('./kerr.js');
const A = await import('./ask.js');
const { OBJECTS } = await import('./config.js');

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };

/* a page with no DOM: the store and the model, as main.js keeps them */
function page(obj = 'm87', view = 'cinematic') {
  const store = new Store();
  store.set(store.preset(obj, view), { instant: true, src: 'boot' });
  const app = { store, model: P.derive(store.all()) };
  store.on(() => { app.model = P.derive(store.all()); });
  return app;
}
const answer = (app, q) => A.answerOffline(app, q).text;

/* ---------- P2-7: a question reaches its own topic; the order is fixed here ---------- */
guard('topics', () => {
  const want = [
    ['what is the hawking temperature?', 'hawking'], ['does it emit hawking radiation?', 'hawking'],
    ['how hot is the disk?', 'temp'], ['what temperature is the gas?', 'temp'],
    ['how does this compare with the EHT?', 'eht'], ['where is the horizon in km?', 'horizon'],
    ['how big is the shadow?', 'shadow'], ['where does the disk end?', 'isco'], ['what is the photon sphere?', 'photon'],
    ['what is the thin ring?', 'ring'], ['why is one side brighter?', 'beaming'], ['what colour is it really?', 'colour'],
    ['what does the spin do?', 'spin'], ['is this a real image?', 'eht'], ['how efficient is it?', 'eff'],
    ['how long does the fall take?', 'fall'], ['would the tide kill me?', 'tide'], ['what does mass change?', 'mass'],
    ['what about edge-on?', 'incl'], ['why are the stars bent?', 'lensing'], ['what is the ergosphere?', 'ergo'],
    ['how is this computed?', 'how'], ['what am I looking at?', 'what'],
  ];
  for (const [q, t] of want) ok(`"${q}" reaches the ${t} topic`, A.answerOffline(page(), q).topic === t, A.answerOffline(page(), q).topic);
});

/* ---------- the state a question asks for, also read from its words (C2's other reader) ---------- */
guard('state requests', () => {
  const st = (q) => JSON.stringify(A.answerOffline(page(), q).state);
  ok('"show me edge-on at maximum spin": 88 deg at a = 0.998', st('show me edge-on at maximum spin') === JSON.stringify({ incl: 88, a: 0.998 }), st('show me edge-on at maximum spin'));
  ok('"view it face-on with no spin": 3 deg at a = 0', st('view it face-on with no spin') === JSON.stringify({ incl: 3, a: 0 }), st('view it face-on with no spin'));
  ok('"show it as the EHT sees it": the telescope view', st('show it as the EHT sees it') === JSON.stringify({ view: 'telescope' }), st('show it as the EHT sees it'));
  ok('the comparison chip asks for no state: comparing is not a request to move', st('how does this compare with the EHT?') === 'null', st('how does this compare with the EHT?'));
  ok('a question about the disk\'s end asks for no state', st('where does the disk end?') === 'null');
});

/* ---------- P1-1: a reply's number is checked by the CONTEXT key it quotes, never by a word near it ---------- */
guard('the number check', () => {
  const app = page('sgra', 'telescope'), f = A.facts(app);
  // Sgr A*'s ring of emission is not in its context (the ruling: no ring beside a shadow; fix_s2_p1 S3)
  const r = A.checkNumbers([
    { key: 'eht_shadow_uas', value: f.eht_shadow_uas, name: 'EHT shadow diameter', unit: 'uas' },
    { key: 'eht_ring_uas', value: 51.8, name: 'Event Horizon Telescope ring', unit: 'uas' },
    { key: 'shadow_uas', value: 51.8, name: 'shadow diameter vs EHT ring, uas', unit: 'uas' },
    { name: 'Event Horizon Telescope shadow', value: 48.7, unit: 'uas' },
    { key: 'no_such_key', value: 1 },
    { key: 'object', value: 3 },
  ], f);
  ok('the EHT\'s shadow quoted as its key is right', r[0].status === 'ok', JSON.stringify(r[0]));
  ok('Sgr A*: its ring quoted by its key is wrong, not in the lab\'s facts', f.eht_ring_uas === null && r[1].status === 'wrong' && /not in the lab's facts/.test(r[1].why), JSON.stringify(r[1]));
  const off = Math.abs(51.8 / f.shadow_uas - 1);
  ok(`the ring's 51.8 quoted as the lab's shadow (${P.s3(f.shadow_uas)} uas, ${P.s3(off * 100)}% away) is checked against the shadow`, r[2].ref === f.shadow_uas && r[2].status === (off <= 0.02 ? 'ok' : 'mismatch'), JSON.stringify(r[2]));
  ok('a number named only by words is unchecked, never matched by a pattern', r[3].status === 'unchecked' && r[3].ref === undefined, JSON.stringify(r[3]));
  ok('a key the CONTEXT does not have is unchecked', r[4].status === 'unchecked', JSON.stringify(r[4]));
  ok('a key whose value is not a number is unchecked', r[5].status === 'unchecked', JSON.stringify(r[5]));
  // a tiny reference is checked relative to itself: Cygnus X-1's shadow on the sky is 9e-4 uas, and 0 is wrong
  const cy = A.facts(page('cygx1', 'telescope'));
  const z = A.checkNumbers([{ key: 'shadow_uas', value: 0 }], cy)[0];
  ok('Cygnus X-1: a reply of 0 uas for its 9e-4 uas shadow is a mismatch', z.status === 'mismatch', JSON.stringify(z));
});

/* ---------- P1-2: numbers handed to a model keep their significant figures ---------- */
guard('the facts', () => {
  const app = page('cygx1', 'telescope'), f = A.facts(app), s = app.store.all();
  const c = P.compareShadow(P.shadowFor(s.a, s.incl, s.q).mean, OBJECTS[2]);
  ok('Cygnus X-1\'s shadow on the sky is 4 significant figures of 9.1e-4 uas, not 0', f.shadow_uas > 0 && Math.abs(f.shadow_uas / c.pred.value - 1) < 5e-4, `${f.shadow_uas} vs ${c.pred.value}`);
  ok('the offline EHT answer quotes it with its error', answer(app, 'how does this compare with the EHT?').includes(`that is ${P.pmText(c.pred.value, c.pred.errP, c.pred.errM, P.ASCII)} uas on the sky`), answer(app, 'how does this compare with the EHT?'));
  const sg = A.facts(page('sgra', 'telescope'));
  ok('Sgr A*: the sigma handed to a model is 3 significant figures of the comparison\'s', sg.sigma_shadow === +P.compareShadow(P.shadowFor(0.5, 30).mean, OBJECTS[1]).shadow.sigma.toPrecision(3), `${sg.sigma_shadow}`);
  ok('the ruling travels with the numbers, in full', sg.eht_ruling === P.RULING && /only with a shadow/.test(sg.eht_ruling) && /a ratio, a percentage or a match/.test(sg.eht_ruling), sg.eht_ruling);
});

/* ---------- P2-4: the shadow against the horizon is the Instrument card's ratio ---------- */
guard('the horizon answer', () => {
  // M87* outside the telescope view is measured at its 17 deg: 3.65 (fix_s2_p1 K1; 3.73 was the 90 deg ratio)
  for (const [obj, want] of [['m87', '3.65'], ['cygx1', null], ['primordial', null]]) {
    const app = page(obj), s = app.store.all();
    const ratio = P.s3(P.measurement(s).toHorizon);
    if (want) ok(`${obj}: the card's ratio is ${want}`, ratio === want, ratio);
    ok(`${obj}: the horizon answer quotes the card's ratio, ${ratio}`, answer(app, 'where is the horizon in km?').includes(`${ratio} times wider`), answer(app, 'where is the horizon in km?'));
    ok(`${obj}: the shadow answer quotes the same ratio`, answer(app, 'how big is the shadow?').includes(`${ratio} times the horizon`), answer(app, 'how big is the shadow?'));
  }
});

/* ---------- P2-5: no count of checks, no typed accuracy ---------- */
guard('the how answer', () => {
  const t = answer(page(), 'how is this computed?');
  ok('no count of checks and no typed percentage in the how answer', !/\d+ other|plus \d+|within [\d.]+ ?%/.test(t), t);
});

/* ---------- P2-6 and P2-7: the Hawking answer ---------- */
guard('the Hawking answer', () => {
  const app = page('cygx1'), t = answer(app, 'what is the hawking temperature?');
  ok('"what is the hawking temperature?" quotes the Hawking temperature, not the disk\'s', t.includes(`${P.sci(app.model.hawkingK)} K`) && !/Novikov-Thorne disk peaks/.test(t), t);
  const kg = K.SI.hbar * K.SI.c ** 3 / (8 * Math.PI * K.SI.G * K.SI.kB * 2.725);
  ok('the background crossover is computed: hbar c^3 / (8 pi G k_B 2.725 K) = 4.50e22 kg', P.sci(kg) === '4.50×10²²', P.sci(kg));
  ok(`the answer quotes it against the Moon (7.346e22 kg): ${P.s3(kg / 7.346e22)} Moon masses`, t.includes(`${P.s3(kg / 7.346e22)} Moon masses`) && !/0\.75%/.test(t), t);
});

/* ---------- P2-9: an answer that describes the view is written for the view and the emitter ---------- */
guard('the what answer', () => {
  const tel = page('cygx1', 'telescope');
  ok('the telescope view (thin gas) describes no disk', !/disk/.test(answer(tel, 'what am I looking at?')), answer(tel, 'what am I looking at?'));
  tel.store.set({ emit: 'off' }, { instant: true });
  ok('with the emitter off it describes the sky', !/disk/.test(answer(tel, 'what am I looking at?')) && /sky/.test(answer(tel, 'what am I looking at?')), answer(tel, 'what am I looking at?'));
  const cin = page('m87', 'cinematic');
  ok('the cinematic view with the disk describes the disk', /far side of the disk/.test(answer(cin, 'what am I looking at?')), answer(cin, 'what am I looking at?'));
  tel.store.set({ emit: 'thick' }, { instant: true });
  ok('the telescope view with the thick disk names the inner shadow', /inner shadow/.test(answer(tel, 'what am I looking at?')), answer(tel, 'what am I looking at?'));
});

/* ---------- P2-2's class in the guide: the sub-ring factor is the engine's at this spin ---------- */
guard('the ring answer', () => {
  const app = page('m87'), t = answer(app, 'what is the thin ring?');
  const want = P.s3(Math.exp(K.lyapunov(0.94, K.polarPhotonOrbit(0.94))));
  ok(`the ring answer quotes e^gamma at a = 0.94, ${want}, not 23`, t.includes(want) && !/1\/23/.test(t), t);
});

/* ============================================================
   Added 2026-11-17 after review_s2_p1_second.md: the replies of
   its check_reply.mjs and check_null.mjs, read by checkNumbers as
   mountAsk reads them, and the context its states.mjs printed.
   No model is called.
   ============================================================ */
const wrong = (checks) => checks.filter((c) => c.status === 'wrong' || c.status === 'mismatch');

/* ---------- S1: the shadow's numbers travel with the inclination they were measured at ---------- */
guard('S1: the context\'s inclinations', () => {
  const app = page('m87', 'cinematic'), f = A.facts(app), ms = P.measurement(app.store.all());
  ok('the page on load: the shadow measured at 17 deg, the camera at 84, two keys', f.shadow_inclination_deg === ms.incl && ms.incl === 17 && f.camera_inclination_deg === 84 && !('inclination_deg' in f), JSON.stringify([f.shadow_inclination_deg, f.camera_inclination_deg]));
  ok('the shadow numbers are the measurement\'s at that inclination', f.shadow_mean_diameter_M === P.sigNum(ms.th.mean) && f.shadow_width_M === P.sigNum(ms.th.chords.width) && f.shadow_uas === P.sigNum(ms.cmp.pred.value) && f.shadow_to_horizon === P.sigNum(ms.toHorizon));
  ok('a custom hole in the journey view: measured at 17 deg, not at 90', (() => { const c = page('m87', 'journey'); c.store.set({ obj: 'custom' }, { instant: true }); return A.facts(c).shadow_inclination_deg === 17 && A.facts(c).shadow_mean_diameter_M === P.sigNum(P.shadowFor(0.94, 17, 0).mean); })());
  // the reply the second reader built: the camera's 84 deg beside the shadow measured at 17
  const r = A.checkNumbers([{ key: 'camera_inclination_deg', value: 84 }, { key: 'shadow_mean_diameter_M', value: f.shadow_mean_diameter_M }, { key: 'shadow_uas', value: f.shadow_uas }], f, `Seen at 84 deg, the shadow is ${f.shadow_mean_diameter_M} M across, ${f.shadow_uas} uas on the sky.`);
  ok('"Seen at 84 deg, the shadow is 9.78 M across": marked wrong, with the inclination it was measured at', wrong(r).length === 1 && wrong(r)[0].name === 'shadow_inclination_deg' && /measured at 17 deg/.test(wrong(r)[0].why), JSON.stringify(r));
  const r2 = A.checkNumbers([{ key: 'camera_inclination_deg', value: 84 }, { key: 'shadow_inclination_deg', value: 17 }, { key: 'shadow_mean_diameter_M', value: f.shadow_mean_diameter_M }], f);
  ok('the same numbers with the shadow\'s own 17 deg quoted: no break', wrong(r2).length === 0, JSON.stringify(r2));
  const t = A.facts(page('m87', 'telescope'));
  ok('the telescope view, where the two inclinations agree: no break', wrong(A.checkNumbers([{ key: 'camera_inclination_deg', value: 17 }, { key: 'shadow_uas', value: t.shadow_uas }], t)).length === 0);
  ok('the camera\'s inclination with no shadow number: no break', wrong(A.checkNumbers([{ key: 'camera_inclination_deg', value: 84 }, { key: 'isco_M', value: f.isco_M }], f)).length === 0);
});

/* ---------- S4: a shadow related to a ring of emission in any form is marked wrong ---------- */
guard('S4: the ruling in the check', () => {
  const m = A.facts(page('m87', 'telescope'));
  const pct = A.checkNumbers([{ key: 'shadow_uas', value: m.shadow_uas }, { key: 'eht_ring_uas', value: m.eht_ring_uas }], m, `The traced shadow, ${m.shadow_uas} uas, is 16% smaller than the ${m.eht_ring_uas} uas ring the EHT measured.`);
  ok('M87*: the shadow as a percentage of the ring, both keyed: wrong, with the ruling\'s reason', pct.some((c) => c.name === 'eht_ruling' && c.status === 'wrong' && /ring of emission/.test(c.why)), JSON.stringify(pct));
  const text = A.checkNumbers([{ key: 'shadow_uas', value: m.shadow_uas }], m, `The traced shadow, ${m.shadow_uas} uas, is 16% smaller than the 42 uas ring.`);
  ok('M87*: the ring\'s 42 in the text, only the shadow keyed: wrong', text.some((c) => c.name === 'eht_ruling'), JSON.stringify(text));
  const faithful = A.checkNumbers([{ key: 'shadow_uas', value: m.shadow_uas }], m, `Seen from far away at 17 deg the shadow is ${m.shadow_uas} uas on the sky. ${m.eht_sentence}`);
  ok('M87*: the shadow beside eht_sentence word for word: no break (the ring stands only inside it)', wrong(faithful).length === 0, JSON.stringify(faithful));
  ok('M87*: the ring alone, with no shadow number: no break', wrong(A.checkNumbers([{ key: 'eht_ring_uas', value: 42 }], m, 'The EHT measured a ring of emission 42 uas across.')).length === 0);
  const sg = A.facts(page('sgra', 'telescope'));
  const match = A.checkNumbers([{ key: 'shadow_uas', value: sg.shadow_uas }, { key: 'eht_ring_uas', value: 51.8 }], sg, `The lab's shadow, ${sg.shadow_uas} uas, matches the EHT's 51.8 uas ring to within 1.5%.`);
  ok('Sgr A*: "matches the 51.8 uas ring": the ring not in the lab\'s facts, and the ruling broken', match.some((c) => c.name === 'eht_ring_uas' && c.status === 'wrong') && match.some((c) => c.name === 'eht_ruling'), JSON.stringify(match));
  ok('Sgr A*: the context carries no ring beside its EHT shadow', sg.eht_ring_uas === null && sg.eht_ring_err_uas === null && sg.eht_shadow_uas === 48.7 && sg.eht_shadow_err_uas === 7);
  // the deterministic answer obeys the same check
  for (const [obj, view] of [['m87', 'telescope'], ['m87', 'cinematic'], ['sgra', 'telescope']]) {
    const app = page(obj, view), f = A.facts(app), t = answer(app, 'how does this compare with the EHT?');
    const keyed = (A.SHADOW_KEYS || []).filter((k) => typeof f[k] === 'number').map((k) => ({ key: k, value: f[k] }));
    ok(`${obj} ${view}: the instrument's own EHT answer passes the check with every shadow number keyed`, wrong(A.checkNumbers(keyed, f, t)).length === 0 && t.includes(f.eht_sentence), t);
  }
  ok('quotes(): 42 in "the 42 uas ring", 42.0, not in 420 or 4.2', A.quotes('the 42 uas ring', 42) && A.quotes('42.0 uas', 42) && !A.quotes('420 uas', 42) && !A.quotes('4.2 uas', 42) && A.quotes('(51.8)', 51.8) && !A.quotes('51.83', 51.8));
  ok('the badge counts the reply\'s 2 numbers and prints the ruling\'s reason', /2 of 2 numbers match/.test(A.badge(pct)) && /ruling allows in no form/.test(A.badge(pct)), A.badge(pct));
});

/* ---------- S5: a number for a quantity the context holds as null is wrong ---------- */
guard('S5: null keys', () => {
  const f = A.facts(page('m87', 'telescope'));
  const r = A.checkNumbers([{ key: 'sigma_shadow', value: -1 }, { key: 'eht_shadow_uas', value: 38 }], f);
  ok('M87*: a sigma and an EHT shadow it never had are wrong, "not in the lab\'s facts", never unchecked', f.sigma_shadow === null && f.eht_shadow_uas === null && r.length === 2 && r.every((c) => c.status === 'wrong' && c.why === 'none for M87*: not in the lab\'s facts'), JSON.stringify(r));
  ok('the badge names both', /sigma_shadow said -1: none for M87\*/.test(A.badge(r)) && /eht_shadow_uas said 38/.test(A.badge(r)) && /0 of 2 numbers match/.test(A.badge(r)), A.badge(r));
  ok('a key the context does not have stays unchecked', A.checkNumbers([{ key: 'no_such', value: 1 }], f)[0].status === 'unchecked');
});

/* ---------- S6: the scale and the mass travel with their sources ---------- */
guard('S6: the context\'s sources', () => {
  const m = A.facts(page('m87', 'telescope')), sg = A.facts(page('sgra', 'telescope'));
  ok('M87*: the scale\'s number, errors and source; the mass named as the EHT ring\'s', m.shadow_scale_uas_per_M === 3.62 && m.shadow_scale_err_plus === 0.6 && m.shadow_scale_err_minus === 0.34 && /Gebhardt et al\. 2011/.test(m.shadow_scale_source) && /ring of emission/.test(m.mass_from), JSON.stringify([m.shadow_scale_source, m.mass_from]));
  ok('M87*: the angle\'s errors, +5.87 and -3.33', Math.abs(m.shadow_uas_err_plus - 5.87) < 0.01 && Math.abs(m.shadow_uas_err_minus - 3.326) < 0.01, `${m.shadow_uas_err_plus} ${m.shadow_uas_err_minus}`);
  ok('Sgr A*: the scale from Gravity Collaboration et al. 2022, as EHT 2022 tabulates it', /Gravity Collaboration et al\. 2022/.test(sg.shadow_scale_source) && sg.mass_from === 'the orbits of its stars', sg.shadow_scale_source);
  ok('the EHT\'s resolution with its source', m.eht_resolution_uas === 20 && /Paper V\), p\. 5/.test(m.eht_resolution_source), m.eht_resolution_source);
  const t = answer(page('sgra', 'telescope'), 'how does this compare with the EHT?');
  ok('the instrument\'s EHT answer prints the scale\'s number and source beside the angle', t.includes('at 5.124 +- 0.026 uas per M') && t.includes('Gravity Collaboration et al. 2022') && t.includes('seen from far away at 30 deg'), t);
});

/* ---------- K3: the model is told the ruling in full ---------- */
guard('the prompt', () => {
  ok('the ruling in full: no relation of any kind between a shadow and a ring, eht_sentence quoted', /in any form/.test(A.SYSTEM) && /a ratio, a percentage/.test(A.SYSTEM) && /quote eht_sentence word for word/.test(A.SYSTEM), A.SYSTEM.slice(0, 300));
  ok('a null is a quantity that does not exist', /A null in CONTEXT is a quantity that does not exist/.test(A.SYSTEM));
  ok('the shadow\'s inclination named apart from the camera\'s', /shadow_inclination_deg/.test(A.SYSTEM) && /camera_inclination_deg/.test(A.SYSTEM));
});

/* ---------- K5: the guide's apply names an object with its preset ---------- */
guard('the guide\'s apply', () => {
  const app = page('m87', 'telescope');
  app.store.set(A.applyPatch(app.store, { obj: 'sgra' }), { instant: true });
  ok('"apply: obj sgra" from M87* opens Sgr A* with its own mass and inclination, as its button does', app.store.get('obj') === 'sgra' && app.store.get('mass') === Math.log10(4.297e6) && app.store.get('incl') === 30, JSON.stringify(app.store.all()).slice(0, 120));
  app.store.set(A.applyPatch(app.store, { a: 0 }), { instant: true });
  ok('"apply: a 0" on Sgr A*: a spin of the visitor\'s, so a custom hole', app.store.get('obj') === 'custom' && app.store.get('a') === 0);
  ok('a patch with no object is left as it is', JSON.stringify(A.applyPatch(app.store, { incl: 88 })) === '{"incl":88}');
});

console.log(fails ? `\n${fails} of ${checks} guide check(s) failed` : `\nall ${checks} guide checks passed`);
process.exit(fails ? 1 : 0);
