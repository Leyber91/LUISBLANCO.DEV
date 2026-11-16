/* ============================================================
   blackhole/tour.test.mjs — walks the guided tour forward and
   back and checks every caption against the state on screen.
   Run:  node labs/assets/js/blackhole/tour.test.mjs
   Exit 0 when every check passes. No dependencies.

   The real Tour class runs on the real Store, with the smallest
   DOM it touches stubbed. Each caption is read twice: the moment
   a stop starts (the eased display values still hold the previous
   stop, which is where the old captions read their numbers) and
   after the transition has finished. The expected numbers are
   computed here from the state and from physics.measurement(),
   the function the Measure card draws from.
   ============================================================ */

const node = () => ({ style: {}, innerHTML: '', setAttribute() {}, appendChild() {}, querySelector: () => ({ addEventListener() {} }), querySelectorAll: () => [] });
globalThis.document = { createElementNS: node, body: node() };
globalThis.window = { innerWidth: 1440, innerHeight: 900 };

const { Store } = await import('./state.js');
const { TOUR, OBJECTS, VIEWS } = await import('./config.js');
const P = await import('./physics.js');
const { viewKey } = await import('./probe.js');
const { Tour } = await import('./tour.js');

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};
/* a rule broken so that it throws is a failing check, not a crash (tests/tour.mutants.test.mjs counts FAIL lines) */
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };
const unesc = (h) => h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/* ---------- the page, minus the DOM ---------- */
const store = new Store();
store.set(store.objectPatch('m87'), { instant: true, src: 'boot' });
const app = { store, model: P.derive(store.all()), still: true, lastInput: 0 };
store.on(() => { app.model = P.derive(store.all()); });          // as main.js: model first
let anchors = null;
const caption = node();
const journey = { play() { store.set({ observer: 'faller', rcam: 40 }, { instant: true, src: 'journey' }); }, stop() {} };
const tour = new Tour(app, { caption, toScreen: () => [0, 0], getAnchors: () => anchors, journey });
const captionText = () => unesc((caption.innerHTML.match(/cap-b">([\s\S]*?)<\/div>/) || [])[1] || '').trim();
const finishTransition = () => { const t = performance.now() + 1e6; store.tick(t); store.tick(t); tour.refresh(); };

/* ---------- what each caption must say, from the state alone ---------- */
const distText = (pc) => (pc >= 1e6 ? `${(pc / 1e6).toPrecision(3)} Mpc` : pc >= 1e3 ? `${(pc / 1e3).toPrecision(3)} kpc` : `${pc.toPrecision(3)} pc`);
function expected(stop, s, an) {
  const m = P.derive(s), o = OBJECTS.find((x) => x.id === s.obj);
  const ms = P.measurement(s);                                      // the Measure card's numbers
  const ts = s.view === 'telescope' ? ms.th : P.shadowFor(s.a, 90, s.q);
  const cmp = s.view === 'telescope' ? ms.cmp : P.compareShadow(ts.mean, o);   // ledger row 2
  const n = {
    name: o.name, dist: o.distPc ? distText(o.distPc) : '--',
    eht: P.compareSentence(cmp, o.name), by: cmp && cmp.pred.by ? cmp.pred.by : 'its mass and distance',
    a: s.a.toFixed(3), rh: (2 * m.rh).toFixed(2), shadowW: ts.chords.width.toFixed(2), vmax: m.vIsco.toFixed(2),
    gmax: an ? Math.pow(an.gmax, 4).toFixed(1) : '--', gmin: an ? P.s3(Math.pow(an.gmin, 4)) : '--',
    incl: s.incl.toFixed(0), shadowUas: cmp ? cmp.pred.value.toFixed(1) : '--', ri: m.ri.toFixed(2), eta: (m.eta * 100).toFixed(1),
    // the interior time runs to the inner horizon r- = 1 - sqrt(1 - a^2 - Q^2): the centre only at a = Q = 0
    tauIn: P.dur(m.interiorTauS), inner: s.a === 0 && s.q === 0 ? 'the centre' : 'the inner horizon',
    massSun: P.sci(m.massSun), horizonKm: P.sci(m.horizonKm), tidalG: P.sci(m.tidalHg),
  };
  return stop.text.replace(/\{(\w+)\}/g, (_, k) => n[k]);
}

/* ---------- the scene each stop must show ---------- */
function checkScene(stop, s, where) {
  for (const [k, v] of Object.entries(stop.patch)) ok(`${where}: state.${k} = ${v}`, s[k] === v, `got ${s[k]}`);
  const o = OBJECTS.find((x) => x.id === s.obj);
  const wantIncl = s.view === 'telescope' ? o.incl : VIEWS[s.view].incl;
  ok(`${where}: inclination is the ${s.view} preset ${wantIncl} deg`, s.incl === wantIncl, `got ${s.incl}`);
  ok(`${where}: emitter matches the view`, s.emit === (s.view === 'telescope' ? 'thin' : (stop.patch.emit || o.view?.emit || 'thick')), `got ${s.emit}`);
  ok(`${where}: spin and mass are ${o.name}'s`, s.a === o.spin && s.mass === Math.log10(o.mass), `got a ${s.a}, mass ${s.mass}`);
}

/* ---------- one stop: scene, caption now, caption after the transition ---------- */
const seen = {};
const SCENE_KEYS = ['obj', 'view', 'color', 'emit', 'a', 'q', 'incl', 'fov', 'tilt', 'observer', 'mass', 'edd', 'dist'];
function visit(dir) {
  const stop = TOUR[tour.i], where = `${dir} stop ${tour.i + 1} (${stop.id})`;
  const s = store.all();
  checkScene(stop, s, where);
  const cap = captionText();
  ok(`${where}: caption at the start of the transition`, cap === expected(stop, s, null), `\n   got  ${cap}\n   want ${expected(stop, s, null)}`);
  // no caption names an object other than the one loaded
  for (const o of OBJECTS) if (o.id !== s.obj) ok(`${where}: caption does not name ${o.name}`, !cap.includes(o.name));
  finishTransition();
  const cap2 = captionText();
  ok(`${where}: caption after the transition`, cap2 === expected(stop, store.all(), null), `\n   got  ${cap2}\n   want ${expected(stop, store.all(), null)}`);
  // a stop reached backward is the same scene as reached forward
  const scene = Object.fromEntries(SCENE_KEYS.map((k) => [k, store.get(k)]));
  if (seen[stop.id]) ok(`${where}: same scene as walking forward`, JSON.stringify(scene) === JSON.stringify(seen[stop.id]), `\n   back ${JSON.stringify(scene)}\n   fwd  ${JSON.stringify(seen[stop.id])}`);
  else seen[stop.id] = scene;
}

guard('the walk forward and back', () => {
  tour.start(0); visit('forward');
  for (let i = 1; i < TOUR.length; i++) { tour.next(); visit('forward'); }
  for (let i = TOUR.length - 2; i >= 0; i--) { tour.prev(); visit('back'); }
  console.log(`walked ${TOUR.length} stops forward and ${TOUR.length - 1} back`);
});

/* ---------- traced numbers: only from anchors traced for the view on screen ---------- */
guard('traced numbers', () => {
  const iBeam = TOUR.findIndex((t) => t.id === 'beaming');
  tour.go(iBeam); finishTransition();
  const stop = TOUR[iBeam], s = store.all();
  anchors = { gmax: 1.31, gmin: 0.62, key: 'a view the visitor left' };
  tour.refresh();
  ok('beaming: anchors from another view are not quoted', captionText() === expected(stop, s, null), captionText());
  anchors = { gmax: 1.31, gmin: 0.62, key: viewKey(store.view(true)) };
  tour.refresh();
  ok('beaming: anchors traced for this view are quoted (g^4 = 2.9x, 0.15x)', captionText() === expected(stop, s, anchors) && captionText().includes('2.9x'), captionText());
  // the same anchors go stale the moment the tour moves the camera
  tour.go(TOUR.findIndex((t) => t.id === 'telescope'));
  ok('telescope: the previous view\'s anchors are dropped at once', tour.anchors() === null);
  anchors = null;
});

/* ---------- the telescope caption and the Measure card, number for number ---------- */
guard('the telescope caption', () => {
  tour.go(TOUR.findIndex((t) => t.id === 'telescope'));
  const s = store.all(), ms = P.measurement(s), cap = captionText();
  const num = (re) => +(cap.match(re) || [])[1];
  ok('telescope: caption inclination = card inclination (17 deg)', num(/sits at ([\d.]+) deg/) === Math.round(ms.incl) && ms.incl === 17, `${num(/sits at ([\d.]+) deg/)} vs ${ms.incl}`);
  ok('telescope: caption width = card width (9.73 M)', Math.abs(num(/is ([\d.]+) M wide/) - ms.th.chords.width) < 0.006 && P.s3(ms.th.chords.width) === '9.73', `${num(/is ([\d.]+) M wide/)} vs ${ms.th.chords.width}`);
  // the angle on the sky is scaled by the stars' motions (Paper VI, Table 9), not by the EHT's own mass (ledger row 2)
  ok('telescope: caption angle = card prediction (35.4 uas, at the stellar-dynamics scale)', Math.abs(num(/([\d.]+) uas on the sky/) - ms.cmp.pred.value) < 0.06 && P.s3(ms.cmp.pred.value) === '35.4', `${num(/([\d.]+) uas on the sky/)} vs ${ms.cmp.pred.value}`);
  ok('telescope: the caption names the ring as emission and sets no sigma against it', cap.includes('ring of emission 42 +- 3 uas') && cap.includes('the motions of its stars') && !/sigma/.test(cap), cap);
  // a visitor who drags the inclination in the telescope view: card and idle caption follow it
  tour.stop();
  store.set({ incl: 40 }, { instant: true, src: 'drag' });
  const s2 = store.all();
  ok('idle caption quotes the dragged inclination', captionText().includes('at 40 deg'), captionText());
  ok('card follows the dragged inclination', P.measurement(s2).incl === 40);
  // exiting the tour in the middle of a transition: the idle caption quotes the target
  tour.start(TOUR.findIndex((t) => t.id === 'telescope'));
  tour.stop();
  ok('exit mid-transition: idle caption quotes 17 deg, not the eased value', captionText().includes('at 17 deg') && store.shown.incl !== 17, `${captionText()} (shown ${store.shown.incl.toFixed(1)})`);
});

/* ============================================================
   The tour's own rules, each with a case just inside and just
   outside its bound (added 2026-11-16 with
   tests/tour.mutants.test.mjs, which breaks each rule and
   expects a check here to fail). Each block opens its own page:
   a store, a caption whose buttons can be clicked, a journey that
   records what it was asked, a screen map and anchors traced for
   whatever view the state is in.
   ============================================================ */
function page({ still = true } = {}) {
  const st = new Store();
  st.set(st.objectPatch('m87'), { instant: true, src: 'boot' });
  const ap = { store: st, model: P.derive(st.all()), still, lastInput: 0 };
  st.on(() => { ap.model = P.derive(st.all()); });
  const cap = { innerHTML: '', click: {} };
  const buttons = () => [...cap.innerHTML.matchAll(/data-n="(\w+)"/g)].map((m) => ({ dataset: { n: m[1] }, addEventListener: (type, fn) => { cap.click[m[1]] = fn; } }));
  cap.querySelectorAll = () => buttons();
  cap.querySelector = () => buttons()[0];
  const asked = [];
  const pg = { st, ap, cap, asked, points: null, src: null };
  st.on((changed, state, src) => { pg.src = src; });
  const jr = { play() { asked.push('play'); }, stop() { asked.push('stop'); } };
  // anchors traced for the view the state is in, while points are set
  const getAnchors = () => (pg.points ? { key: viewKey(st.view(true)), ...pg.points } : null);
  pg.T = new Tour(ap, { caption: cap, toScreen: (x, y) => [700 + 100 * x, 450 - 100 * y], getAnchors, journey: jr });
  pg.text = () => unesc((cap.innerHTML.match(/cap-b">([\s\S]*?)<\/div>/) || [])[1] || '').trim();
  pg.title = () => unesc((cap.innerHTML.match(/cap-t">([\s\S]*?)<\/div>/) || [])[1] || '').trim();
  pg.kicker = () => unesc((cap.innerHTML.match(/cap-k">([\s\S]*?)<\/div>/) || [])[1] || '').trim();
  pg.ring = () => { const m = pg.T.focusSvg.innerHTML.match(/cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/); return m ? m.slice(1).join(' ') : ''; };
  return pg;
}
const POINTS = { shadow: { cx: 0.2, cy: 0.1, left: -2, right: 3 }, limb: { sx: -1, sy: 0.5 }, ring: { sx: 1, sy: -0.5 }, isco: { sx: 2, sy: 1 } };
const at = (id) => TOUR.findIndex((t) => t.id === id);

guard('the numbers a caption quotes', () => {
  const pg = page(), { st, ap, T } = pg;
  st.set({ obj: 'custom', a: 0.5 }, { instant: true });
  const n = T.numbers();
  ok('a custom hole is "this hole", with no distance, no EHT image and no angular size', n.name === 'this hole' && n.dist === '--' && n.eht === 'The EHT has not imaged it.' && n.shadowUas === '--', JSON.stringify([n.name, n.dist, n.eht, n.shadowUas]));
  st.set({ a: 0, q: 0 }, { instant: true });
  ok('at a = Q = 0 the fall ends at the centre', T.numbers().inner === 'the centre', T.numbers().inner);
  st.set({ a: 0.001 }, { instant: true });
  ok('at a = 0.001, the slider\'s first step (r- = 5.0000012e-7 M), the fall ends at the inner horizon', T.numbers().inner === 'the inner horizon', T.numbers().inner);
  st.set(st.objectPatch('cygx1'), { instant: true });
  ok('Cygnus X-1: the EHT has not imaged it', T.numbers().eht === 'The EHT has not imaged it.', T.numbers().eht);
  // the distance in its unit: just at and just below a megaparsec and a kiloparsec
  for (const [pc, want] of [[1e6, '1.00 Mpc'], [999000, '999 kpc'], [1e3, '1.00 kpc'], [999, '999 pc']]) {
    ap.model = { ...P.derive(st.all()), obj: { ...OBJECTS[0], distPc: pc } };
    ok(`a distance of ${pc} pc reads ${want}`, T.numbers().dist === want, T.numbers().dist);
  }
  ap.model = P.derive(st.all());
  ok('a key the state does not have is left as its name', T.fill('{nosuch} at {a}') === 'nosuch at 0.998', T.fill('{nosuch} at {a}'));
});

guard('moving through the tour', () => {
  const pg = page(), { T, cap, asked } = pg;
  T.start();
  ok('start() with no stop named starts at the first', T.running && T.i === 0, `${T.i}`);
  T.prev();
  ok('Back at the first stop stays at the first', T.i === 0 && T.running, `${T.i}`);
  T.go(-1);
  ok('a stop before the first is the first', T.i === 0, `${T.i}`);
  T.go(TOUR.length);
  ok('a stop past the last is the last', T.i === TOUR.length - 1, `${T.i}`);
  T.go(99);
  ok('stop 99 is the last', T.i === TOUR.length - 1, `${T.i}`);
  ok('the last stop\'s button says Finish', /data-n="next">Finish</.test(cap.innerHTML), cap.innerHTML.match(/data-n="next">\w+/)?.[0]);
  T.next();
  ok('Next at the last stop ends the tour', !T.running, `running ${T.running}, stop ${T.i}`);
  T.start(TOUR.length - 2);
  ok('the stop before the last says Next', /data-n="next">Next</.test(cap.innerHTML), cap.innerHTML.match(/data-n="next">\w+/)?.[0]);
  T.next();
  ok('Next at the stop before the last goes to the last and the tour goes on', T.i === TOUR.length - 1 && T.running, `${T.i} ${T.running}`);
  T.start(2);
  const dots = [...cap.innerHTML.matchAll(/<i class="(on|)"><\/i>/g)].map((m) => m[1]);
  ok('at the third stop the third dot, and only it, is on', dots.length === TOUR.length && dots.indexOf('on') === 2 && dots.filter((d) => d === 'on').length === 1, dots.join(','));
  cap.click.next();
  ok('the Next button goes forward', T.i === 3 && T.running, `${T.i}`);
  cap.click.prev();
  ok('the Back button goes back', T.i === 2 && T.running, `${T.i}`);
  cap.click.exit();
  ok('the Exit button ends the tour', !T.running);
  ok('the idle caption follows the exit', /Take the tour/.test(cap.innerHTML));
  T.refresh();
  ok('a refresh after the tour leaves the idle caption', /Take the tour/.test(cap.innerHTML) && !/Tour \d/.test(cap.innerHTML));
  cap.click.tour();
  ok('the idle caption\'s button starts the tour at the first stop', T.running && T.i === 0, `${T.running} ${T.i}`);
  T.go(at('telescope'));
  ok('a stop eases in over 1.7 s, with the tour as its source', pg.st.anim && pg.st.anim.dur === 1700 && pg.src === 'tour', `${pg.st.anim && pg.st.anim.dur} ${pg.src}`);
  // the journey plays at the fall and only there
  asked.length = 0;
  T.go(at('fall'));
  T.next();
  T.go(at('arrive'));
  ok('the fall stop plays the journey; the stops around it stop it', asked.join(' ') === 'play stop stop', asked.join(' '));
});

guard('the tour\'s clock', () => {
  const pg = page(), { T, st, ap } = pg;
  T.start(0);
  T.tick(0, TOUR[0].dur * 1000);
  ok(`at exactly ${TOUR[0].dur} s the first stop is still on`, T.i === 0, `${T.i}`);
  T.tick(0, 1);
  ok(`1 ms past ${TOUR[0].dur} s the tour moves to the second stop`, T.i === 1, `${T.i}`);
  // the focus ring is redrawn when the clock crosses a quarter second, not on every frame
  let drawn = 0;
  const draw = T.drawFocus.bind(T);
  T.drawFocus = () => { drawn++; draw(); };
  T.tick(0, 200);
  ok('0.2 s in, inside the first quarter second: the ring is not redrawn', drawn === 0, `${drawn}`);
  T.tick(0, 100);
  ok('0.3 s in, past the quarter second: the ring is redrawn', drawn === 1, `${drawn}`);
  delete T.drawFocus;
  // the idle drift: only when not touring, not still, motion allowed, animation on, and after 20 s without input
  ap.still = false;
  const az0 = st.get('az');
  T.tick(30000, 50);
  ok('during the tour the view does not drift', st.get('az') === az0, `${st.get('az')}`);
  T.stop();
  T.tick(20000, 50);
  ok('at exactly 20 s after the last input the view does not drift yet', st.get('az') === az0, `${st.get('az')}`);
  T.tick(20000.5, 50);
  ok('just past 20 s it turns by 0.004 deg per ms: 0.2 deg in 50 ms', Math.abs(st.get('az') - az0 - 0.2) < 1e-9, `${st.get('az')}`);
  st.set({ az: 179.9 }, { instant: true });
  T.tick(30000, 50);
  ok('past 180 deg it comes round to -180: 179.9 turns to -179.9', Math.abs(st.get('az') + 179.9) < 1e-9, `${st.get('az')}`);
  for (const [why, on, off] of [
    ['under reduced motion', () => { st.reduced = true; }, () => { st.reduced = false; }],
    ['on a still page', () => { ap.still = true; }, () => { ap.still = false; }],
    ['with the animation off', () => st.set({ anim: false }, { instant: true }), () => st.set({ anim: true }, { instant: true })],
  ]) {
    on();
    const before = st.get('az');
    T.tick(30000, 50);
    ok(`${why} the view does not drift`, st.get('az') === before, `${st.get('az')}`);
    off();
  }
});

guard('the focus ring', () => {
  const pg = page(), { T } = pg;
  pg.points = POINTS;
  const want = {
    shadow: `720.0 440.0 ${(500 * 0.62).toFixed(1)}`,           // the shadow's centre, 0.62 of its width on screen
    limb: '600.0 400.0 26.0', ring: '800.0 500.0 26.0', isco: '900.0 350.0 26.0',
  };
  for (let i = 0; i < TOUR.length; i++) {
    T.start(i);
    const f = TOUR[i].focus, w = want[f] || '';
    ok(`stop ${i + 1} (${TOUR[i].id}, focus ${f}): ${w ? `ring at ${w}` : 'no ring'}`, pg.ring() === w, pg.ring());
  }
  T.start(at('beaming'));
  T.t = 0.5;
  T.drawFocus();
  ok('the ring pulses by 8 %: at 0.5 s its radius is 26 (1 + 0.08 sin 1.5)', pg.ring() === `600.0 400.0 ${(26 * (1 + 0.08 * Math.sin(1.5))).toFixed(1)}`, pg.ring());
  T.stop();
  ok('the ring goes when the tour ends', T.focusSvg.innerHTML === '', T.focusSvg.innerHTML);
  T.go(0);
  ok('a stop drawn while the tour is not running shows no ring', pg.ring() === '' && T.focusSvg.innerHTML === '', T.focusSvg.innerHTML);
  pg.points = { limb: POINTS.limb };
  T.start(0);
  ok('a shadow stop with no traced shadow shows no ring', T.focusSvg.innerHTML === '', T.focusSvg.innerHTML);
  pg.points = null;
  T.start(at('beaming'));
  ok('no anchors for this view: no ring', T.focusSvg.innerHTML === '', T.focusSvg.innerHTML);
});

guard('the idle caption', () => {
  const pg = page(), { st } = pg;
  st.set({ color: 'redshift' }, { instant: true });
  ok('the cinematic view names the spin and the colour', pg.text().startsWith('Spin 0.940, redshift g colour.'), pg.text());
  ok('it names the object and its kind', pg.title() === 'M87*: supermassive, galaxy M87', pg.title());
  ok('it names the view', pg.kicker() === 'Cinematic view', pg.kicker());
  st.set(st.viewPatch('journey'), { instant: true });
  ok('the journey view tells how to scrub the fall', pg.text().startsWith('Free fall from rest far away.'), pg.text());
  st.set(st.viewPatch('telescope'), { instant: true });
  ok('the telescope view with the thin emitter speaks of thin gas', pg.text().includes('through hot thin gas as the EHT sees it') && pg.kicker() === 'Telescope view', pg.text());
  st.set({ emit: 'thick' }, { instant: true });
  ok('the telescope view with the thick disk speaks of the inner shadow', pg.text().includes('An opaque disk reaching the ISCO covers the outer shadow'), pg.text());
  st.set({ obj: 'custom' }, { instant: true });
  ok('a custom hole is titled so', pg.title() === 'Custom hole', pg.title());
});

console.log(fails ? `\n${fails} of ${checks} tour check(s) failed` : `\nall ${checks} tour checks passed`);
process.exit(fails ? 1 : 0);
