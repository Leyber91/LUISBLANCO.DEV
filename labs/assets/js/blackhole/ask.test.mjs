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
  const r = A.checkNumbers([
    { key: 'eht_shadow_uas', value: f.eht_shadow_uas, name: 'EHT shadow diameter', unit: 'uas' },
    { key: 'eht_ring_uas', value: f.eht_ring_uas, name: 'Event Horizon Telescope ring', unit: 'uas' },
    { key: 'shadow_uas', value: f.eht_ring_uas, name: 'shadow diameter vs EHT ring, uas', unit: 'uas' },
    { name: 'Event Horizon Telescope shadow', value: 48.7, unit: 'uas' },
    { key: 'no_such_key', value: 1 },
    { key: 'object', value: 3 },
  ], f);
  ok('the EHT\'s shadow quoted as its key is right', r[0].status === 'ok', JSON.stringify(r[0]));
  ok('the EHT\'s ring quoted as its key is right', r[1].status === 'ok', JSON.stringify(r[1]));
  const off = Math.abs(f.eht_ring_uas / f.shadow_uas - 1);
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
  ok('the offline EHT answer quotes it', answer(app, 'how does this compare with the EHT?').includes(`would be ${P.sci(c.pred.value)} uas on the sky`), answer(app, 'how does this compare with the EHT?'));
  const sg = A.facts(page('sgra', 'telescope'));
  ok('Sgr A*: the sigma handed to a model is 3 significant figures of the comparison\'s', sg.sigma_shadow === +P.compareShadow(P.shadowFor(0.5, 30).mean, OBJECTS[1]).shadow.sigma.toPrecision(3), `${sg.sigma_shadow}`);
  ok('the ruling travels with the numbers: a sigma only between two shadows', /only between two shadows/.test(sg.eht_ruling || ''), sg.eht_ruling);
});

/* ---------- P2-4: the shadow against the horizon is the Instrument card's ratio ---------- */
guard('the horizon answer', () => {
  for (const [obj, want] of [['m87', '3.73'], ['cygx1', null], ['primordial', null]]) {
    const app = page(obj), s = app.store.all();
    const ratio = P.s3(P.shadowToHorizon(s.a, s.q));
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

console.log(fails ? `\n${fails} of ${checks} guide check(s) failed` : `\nall ${checks} guide checks passed`);
process.exit(fails ? 1 : 0);
