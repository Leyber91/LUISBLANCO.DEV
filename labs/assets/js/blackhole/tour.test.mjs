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
  const pred = s.view === 'telescope' ? ms.pred : P.predictedUas(ts.mean, o);
  const n = {
    name: o.name, dist: o.distPc ? distText(o.distPc) : '--',
    eht: o.eht ? `EHT measured a ring of ${o.eht.ring} +- ${o.eht.ringErr} uas.` : 'The EHT has not imaged it.',
    a: s.a.toFixed(3), rh: (2 * m.rh).toFixed(2), shadowW: ts.chords.width.toFixed(2), vmax: m.vIsco.toFixed(2),
    gmax: an ? Math.pow(an.gmax, 4).toFixed(1) : '--', gmin: an ? P.s3(Math.pow(an.gmin, 4)) : '--',
    incl: s.incl.toFixed(0), shadowUas: pred ? pred.value.toFixed(1) : '--', ri: m.ri.toFixed(2), eta: (m.eta * 100).toFixed(1),
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

tour.start(0); visit('forward');
for (let i = 1; i < TOUR.length; i++) { tour.next(); visit('forward'); }
for (let i = TOUR.length - 2; i >= 0; i--) { tour.prev(); visit('back'); }
console.log(`walked ${TOUR.length} stops forward and ${TOUR.length - 1} back`);

/* ---------- traced numbers: only from anchors traced for the view on screen ---------- */
{
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
}

/* ---------- the telescope caption and the Measure card, number for number ---------- */
{
  tour.go(TOUR.findIndex((t) => t.id === 'telescope'));
  const s = store.all(), ms = P.measurement(s), cap = captionText();
  const num = (re) => +(cap.match(re) || [])[1];
  ok('telescope: caption inclination = card inclination (17 deg)', num(/sits at ([\d.]+) deg/) === Math.round(ms.incl) && ms.incl === 17, `${num(/sits at ([\d.]+) deg/)} vs ${ms.incl}`);
  ok('telescope: caption width = card width (9.73 M)', Math.abs(num(/is ([\d.]+) M wide/) - ms.th.chords.width) < 0.006 && P.s3(ms.th.chords.width) === '9.73', `${num(/is ([\d.]+) M wide/)} vs ${ms.th.chords.width}`);
  ok('telescope: caption angle = card prediction (37.4 uas)', Math.abs(num(/that is ([\d.]+) uas/) - ms.pred.value) < 0.06 && P.s3(ms.pred.value) === '37.4', `${num(/that is ([\d.]+) uas/)} vs ${ms.pred.value}`);
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
}

console.log(fails ? `\n${fails} of ${checks} tour check(s) failed` : `\nall ${checks} tour checks passed`);
process.exit(fails ? 1 : 0);
