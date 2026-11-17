/* ============================================================
   blackhole/state.test.mjs — a copied link reopens the state it
   was copied from.
   Run:  node labs/assets/js/blackhole/state.test.mjs
   Exit 0 when every check passes. No dependencies.

   The page writes its link with Store.toQuery() and boots with
   Store.open(location.search); both run here on the real Store.
   The first version wrote a key only when it differed from its
   schema default, while boot applied the object preset first, so
   a value equal to a schema default was lost: Primordial with the
   thick disk reopened with no disk, Sgr A* at an Eddington ratio
   of 1e-5 reopened at 1e-8. A bare ?v=telescope also kept the
   cinematic camera at 46 M. Both are checked below, then every
   object in every view, then values set back to a schema default.
   ============================================================ */

import { Store } from './state.js';
import { SCHEMA, OBJECTS, VIEWS, DEFAULTS } from './config.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};

const open = (search) => { const s = new Store(); s.open(search); return s; };
/* the link's own rounding: a number is written with its schema digits + 1 decimals (3 at least) */
const tol = (d) => 0.5 * Math.pow(10, -(Math.max(d.digits ?? 3, 2) + 1)) + 1e-12;
function sameState(a, b) {
  const diff = [];
  for (const d of SCHEMA) {
    const x = a.get(d.key), y = b.get(d.key);
    if (d.type === 'num' ? Math.abs(x - y) > tol(d) : x !== y) diff.push(`${d.key}: ${x} -> ${y}`);
  }
  return diff;
}
function roundTrip(name, store) {
  const link = store.toQuery();
  const diff = sameState(store, open(link ? `?${link}` : ''));
  ok(`${name}: the link reopens the same state`, diff.length === 0, `?${link}\n   ${diff.join('; ')}`);
  return link;
}

/* ---------- the recorded cases ---------- */
{
  const s = open('?o=primordial');
  ok('Primordial opens with no disk', s.get('emit') === 'off');
  s.set({ emit: 'thick' }, { instant: true });
  const link = roundTrip('Primordial with the thick disk', s);
  ok('Primordial with the thick disk: the link carries the emitter', new URLSearchParams(link).get('em') === 'thick', link);
  ok('Primordial with the thick disk reopens with the thick disk', open(`?${link}`).get('emit') === 'thick');
}
{
  const s = open('?o=sgra');
  ok('Sgr A* opens at an Eddington ratio of 1e-8', s.get('edd') === -8);
  s.set({ edd: -5 }, { instant: true });
  const link = roundTrip('Sgr A* at an Eddington ratio of 1e-5', s);
  ok('Sgr A* at 1e-5 reopens at 1e-5', open(`?${link}`).get('edd') === -5, link);
}
{
  const s = open('?v=telescope');
  ok('a bare ?v=telescope opens the telescope camera: 1000 M, 1.15 deg, the object\'s 17 deg, thin emitter',
    s.get('rcam') === 1000 && s.get('fov') === 1.15 && s.get('incl') === 17 && s.get('emit') === 'thin',
    JSON.stringify({ rcam: s.get('rcam'), fov: s.get('fov'), incl: s.get('incl'), emit: s.get('emit') }));
  const j = open('?v=journey');
  ok('a bare ?v=journey opens the fall camera: 40 M, falling observer', j.get('rcam') === 40 && j.get('observer') === 'faller' && j.get('incl') === 75);
  const c = open('?o=cygx1&v=telescope');
  ok('?o=cygx1&v=telescope opens at Cygnus X-1\'s 27.5 deg', c.get('incl') === 27.5 && c.get('a') === 0.998 && c.get('rcam') === 1000);
}

/* ---------- links written before this change still open the same state ---------- */
{
  const s = open('?o=m87&v=telescope&r=1000&f=1.15&i=17&em=thin');
  ok('a full telescope link opens as before', s.get('rcam') === 1000 && s.get('fov') === 1.15 && s.get('incl') === 17 && s.get('emit') === 'thin');
  const t = open('?o=sgra&i=60');
  ok('?o=sgra&i=60 opens Sgr A* at 60 deg', t.get('obj') === 'sgra' && t.get('incl') === 60 && t.get('a') === 0.5 && t.get('edd') === -8);
  // a spin of the link's own is not Cygnus X-1's measured 0.998: the hole opens custom, at the object's mass and
  // distance, as the spin slider makes it (fix_s2_p1 K5; this asserted obj = cygx1 before)
  const u = open('?o=cygx1&i=40&a=0.5');
  ok('?o=cygx1&i=40&a=0.5 opens a custom hole at Cygnus X-1\'s mass, 40 deg and a = 0.5', u.get('obj') === 'custom' && u.get('incl') === 40 && u.get('a') === 0.5 && u.get('mass') === Math.log10(21.2), `${u.get('obj')}`);
  ok('the legacy ?type=schwarzschild&view=edge still maps to a = 0 at 88 deg', open('?type=schwarzschild&view=edge').get('a') === 0 && open('?type=schwarzschild&view=edge').get('incl') === 88);
}

/* ---------- the default page needs no link; an object and a view need only their names ---------- */
ok('the default state writes an empty link', open('').toQuery() === '', open('').toQuery());
for (const o of OBJECTS) {
  for (const v of Object.keys(VIEWS)) {
    const want = [o.id !== DEFAULTS.obj ? `o=${o.id}` : '', v !== DEFAULTS.view ? `v=${v}` : ''].filter(Boolean).join('&');
    ok(`${o.name} in the ${v} view is the link ?${want}`, open(`?${want}`).toQuery() === want, open(`?${want}`).toQuery());
  }
}

/* ---------- every object in every view, reached by the page's own buttons ---------- */
for (const o of OBJECTS) {
  for (const v of Object.keys(VIEWS)) {
    // object button, then view button (ui.js: objectPatch, then viewPatch)
    const a = open('');
    a.set(a.objectPatch(o.id), { instant: true }); a.set(a.viewPatch(v), { instant: true });
    roundTrip(`${o.name}, then ${v}`, a);
    // view button, then object button
    const b = open('');
    b.set(b.viewPatch(v), { instant: true }); b.set(b.objectPatch(o.id), { instant: true });
    roundTrip(`${v}, then ${o.name}`, b);
  }
}

/* ---------- any key set back to its schema default over a preset that changed it ---------- */
for (const o of OBJECTS) {
  for (const v of Object.keys(VIEWS)) {
    for (const d of SCHEMA) {
      if (d.key === 'obj' || d.key === 'view') continue;
      const s = open(`?o=${o.id}&v=${v}`);
      if (s.get(d.key) === d.def) continue;                  // the preset left this key at its default
      s.set({ [d.key]: d.def }, { instant: true });
      roundTrip(`${o.name}, ${v}: ${d.key} set back to its schema default ${d.def}`, s);
    }
  }
}

/* ---------- a camera the visitor dragged and zoomed, a custom hole with charge ---------- */
{
  const s = open('?o=sgra');
  s.set({ az: 12.299999999999983, incl: 61.25, rcam: 57.94675200000001, color: 'redshift', notes: false, anim: false }, { instant: true });
  roundTrip('dragged and zoomed camera', s);
  const c = open('');
  c.set({ obj: 'custom', a: 0.3, q: 0.9, mass: 1.5, edd: -2 }, { instant: true });
  c.set(c.viewPatch('telescope'), { instant: true });
  c.set({ incl: 33 }, { instant: true });
  roundTrip('custom charged hole in the telescope view at 33 deg', c);
  const k = open('');
  k.set({ obj: 'custom', a: 0.5 }, { instant: true });
  k.set(k.viewPatch('telescope'), { instant: true });       // keeps the cinematic 84 deg: a custom hole has no measured inclination
  roundTrip('custom hole taken to the telescope view', k);
}

/* ============================================================
   The store's own rules, each with a case just inside and just
   outside its bound (added 2026-11-16 with the mutants lists in
   tests/state.mutants.test.mjs, which break each rule and expect
   a check here to fail). A rule broken so that it throws is a
   failing check, not a crash: guard() reports the error.
   ============================================================ */
const guard = (name, fn) => { try { fn(); } catch (e) { ok(`${name}: runs without an error`, false, e.message); } };
const near = (x, y, eps = 1e-9) => Math.abs(x - y) <= eps;

guard('a link\'s values are read into the schema', () => {
  // a number is clamped to its range: just outside each end comes back as that end, the end itself stays
  ok('?i=0.5, below the inclination range, opens at its floor of 1 deg', open('?i=0.5').get('incl') === 1, `${open('?i=0.5').get('incl')}`);
  ok('?i=1, the floor itself, opens at 1 deg', open('?i=1').get('incl') === 1);
  ok('?i=179.5, above the range, opens at its ceiling of 179 deg', open('?i=179.5').get('incl') === 179, `${open('?i=179.5').get('incl')}`);
  ok('?i=179, the ceiling itself, opens at 179 deg', open('?i=179').get('incl') === 179);
  ok('?i=abc, not a number, opens at the schema default of 84 deg', open('?i=abc').get('incl') === 84, `${open('?i=abc').get('incl')}`);
  // a toggle is on for true, 'true', '1' and 1 only
  for (const [text, want] of [['1', true], ['true', true], ['0', false], ['false', false], ['yes', false]]) {
    ok(`?an=${text} opens with the animation ${want ? 'on' : 'off'}`, open(`?an=${text}`).get('anim') === want, `${open(`?an=${text}`).get('anim')}`);
  }
  const t = open('?an=0');
  t.set({ anim: 1 }, { instant: true });
  ok('a toggle set to the number 1 is on', t.get('anim') === true, `${t.get('anim')}`);
  t.set({ anim: true }, { instant: true });
  ok('a toggle set to true stays on', t.get('anim') === true);
  // a name outside its list falls back to the schema default
  ok('?o=nowhere opens M87*', open('?o=nowhere').get('obj') === 'm87', open('?o=nowhere').get('obj'));
  ok('?v=edge opens the cinematic view', open('?v=edge').get('view') === 'cinematic', open('?v=edge').get('view'));
  // a key the schema does not know is kept as given
  const x = new Store();
  x.set({ extra: 'kept' }, { instant: true });
  ok('a key outside the schema is kept as given', x.get('extra') === 'kept', `${x.get('extra')}`);
  ok('open() returns the keys the link carried', JSON.stringify(new Store().open('?o=sgra&i=60')) === '{"obj":"sgra","incl":"60"}', JSON.stringify(new Store().open('?o=sgra&i=60')));
});

guard('a hole needs a^2 + q^2 < 1', () => {
  const s = new Store();
  s.set({ obj: 'custom', a: 0.6, q: 0.7972 }, { instant: true });       // a^2 + q^2 = 0.99553, just inside 0.996
  ok('a^2 + q^2 = 0.99553, just inside 0.996, keeps its charge', s.get('q') === 0.7972, `q = ${s.get('q')}`);
  s.set({ q: 0.7979 }, { instant: true });                               // 0.99664, just outside
  ok('a^2 + q^2 = 0.99664, just outside 0.996: the charge gives way to sqrt(0.996 - a^2) to 3 decimals, 0.797', s.get('q') === 0.797, `q = ${s.get('q')}`);
  const p = new Store();
  p.set({ obj: 'custom', a: 0, q: 0.8 }, { instant: true });
  const changed = p.set({ a: 0.6 }, { instant: true });
  ok('a spin that pushes the charge down reports the charge as changed', changed.includes('a') && changed.includes('q'), changed.join());
  ok('the picture shows the lowered charge at once', p.view().q === 0.797, `${p.view().q}`);
  p.set({ a: 0.998 }, { instant: true });
  ok('at the spin limit 0.998 the charge gives way entirely: q = 0', p.get('q') === 0, `q = ${p.get('q')}`);
});

guard('what a change reports', () => {
  // a custom hole, so that a spin changes the spin alone (on a named object it also makes the hole custom, below)
  const s = new Store(), heard = [];
  s.set({ obj: 'custom' }, { instant: true });
  s.on((changed, state, src) => heard.push([changed.join(), src, state === s.s]));
  ok('a key set to the value it already has is no change, and nobody hears it', s.set({ a: s.get('a') }).length === 0 && heard.length === 0, `${heard.length} heard`);
  s.set({ a: 0.5 }, { instant: true });
  ok('a change is heard once, with its keys, the state and the source "ui" by default', heard.length === 1 && heard[0][0] === 'a' && heard[0][1] === 'ui' && heard[0][2], JSON.stringify(heard));
  s.set({ incl: 40 }, { instant: true, src: 'drag' });
  ok('a change is heard with the source it was given', heard.length === 2 && heard[1][1] === 'drag', JSON.stringify(heard));
});

guard('easing', () => {
  ok('a new store shows its own values', JSON.stringify(new Store().view()) === JSON.stringify(new Store().view(true)) && new Store().view().incl === 84);
  // inclination 84 -> 40 over 1000 ms; the cubic ease is 4 t^3 before half time and 1 - (2 - 2t)^3 / 2 after
  const s = new Store();
  s.set({ incl: 40 }, { dur: 1000 });
  const t0 = s.anim.t0, at = (ms) => { s.tick(t0 + ms); return s.view().incl; };
  ok('a change eases: the picture still shows the old inclination, the target is the new one', s.view().incl === 84 && s.view(true).incl === 40);
  ok('a frame stamped before the change started shows the old value', at(-500) === 84, `${s.view().incl}`);
  ok('at 1/4 of the time, 1/16 of the way (4 t^3)', near(at(250), 84 - 44 * 0.0625), `${s.view().incl}`);
  ok('at 0.45 of the time, just before half: 4 t^3 = 0.3645 of the way', near(at(450), 84 - 44 * 0.3645), `${s.view().incl}`);
  ok('at 0.55 of the time, just after half: 1 - (2 - 2t)^3 / 2 = 0.6355 of the way', near(at(550), 84 - 44 * 0.6355), `${s.view().incl}`);
  ok('at 3/4 of the time, 15/16 of the way', near(at(750), 84 - 44 * 0.9375), `${s.view().incl}`);
  ok('at 0.995 of the time the transition is still running', s.tick(t0 + 995) === true && s.tick(t0 + 996) === true);
  ok('the frame at the end lands on the target', s.tick(t0 + 1000.5) === true && s.view().incl === 40, `${s.view().incl}`);
  ok('the frame after the end reports no transition', s.tick(t0 + 1001) === false);
  // a frame stamped past the end of a transition that never saw its last frame
  const late = new Store();
  late.set({ incl: 40 }, { dur: 1000 });
  late.tick(late.anim.t0 + 3000);
  ok('a frame stamped past the end shows the target, not beyond it', late.view().incl === 40, `${late.view().incl}`);
  // the default length is 1400 ms
  const d = new Store();
  d.set({ incl: 40 });
  d.tick(d.anim.t0 + 700);
  ok('a change with no length given takes 1400 ms: halfway at 700 ms', near(d.view().incl, 62), `${d.view().incl}`);
  // distance and field of view ease in log space
  const z = new Store();
  z.set({ rcam: 1000, fov: 1.15, incl: 40 }, { dur: 1000 });
  const z0 = z.anim.t0;
  z.tick(z0 + 500);
  ok('halfway, the distance is the geometric mean of 46 and 1000 M', near(z.view().rcam, Math.sqrt(46 * 1000)), `${z.view().rcam}`);
  ok('halfway, the field of view is the geometric mean of 31 and 1.15 deg', near(z.view().fov, Math.sqrt(31 * 1.15)), `${z.view().fov}`);
  ok('halfway, the inclination is the arithmetic mean', near(z.view().incl, 62), `${z.view().incl}`);
  z.tick(z0 + 1000.5);
  z.tick(z0 + 1001);
  ok('the frame after the end shows exactly the target distance (the eased last frame is 999.9999999999998)', z.view().rcam === 1000, `${z.view().rcam}`);
  // an instant change, reduced motion, and a change of a key that does not ease
  const i = new Store();
  i.set({ incl: 40 }, { dur: 1000 });
  i.set({ incl: 60 }, { instant: true });
  ok('an instant change shows at once and ends the transition that was running', i.view().incl === 60 && i.tick(performance.now() + 100) === false && i.view().incl === 60, `${i.view().incl}`);
  const r = new Store();
  r.reduced = true;
  r.set({ incl: 40 });
  ok('under reduced motion a change shows at once', r.view().incl === 40 && r.tick(performance.now() + 100) === false, `${r.view().incl}`);
  const c = new Store();
  c.set({ incl: 40 }, { dur: 1000 });
  const c0 = c.anim.t0;
  c.set({ color: 'redshift' });
  c.tick(c0 + 1000.5);
  ok('a change of a key that does not ease leaves a running transition alone', c.view().incl === 40, `${c.view().incl}`);
  // view(): the eased geometry, or the target; the observer and the emitter always from the state
  const v = new Store();
  v.set({ obj: 'custom', a: 0.5, q: 0.3, incl: 40, rcam: 100, fov: 20, tilt: 10, rout: 40, observer: 'orbiter', emit: 'thin' }, { dur: 1000 });
  v.tick(v.anim.t0 + 500);
  const now = v.view(), goal = v.view(true);
  const want = { a: 0.72, q: 0.15, incl: 62, rcam: Math.sqrt(46 * 100), fov: Math.sqrt(31 * 20), tilt: 5, rout: 30 };
  ok('halfway, view() carries every eased key at its eased value', Object.entries(want).every(([k, w]) => near(now[k], w)), JSON.stringify(now));
  ok('view(true) carries the targets', goal.a === 0.5 && goal.q === 0.3 && goal.incl === 40 && goal.rcam === 100 && goal.fov === 20 && goal.tilt === 10 && goal.rout === 40, JSON.stringify(goal));
  ok('both carry the observer and the emitter of the state', now.observer === 'orbiter' && now.emit === 'thin' && goal.observer === 'orbiter' && goal.emit === 'thin');
});

guard('an object button', () => {
  const t = open('?v=telescope');
  t.set(t.objectPatch('sgra'), { instant: true });
  ok('in the telescope view, Sgr A*: the thin emitter kept, Sgr A*\'s measured 30 deg', t.get('emit') === 'thin' && t.get('incl') === 30, `${t.get('emit')} ${t.get('incl')}`);
  const c = open('?o=primordial');
  c.set(c.objectPatch('sgra'), { instant: true });
  ok('in the cinematic view, Primordial then Sgr A*: the thick disk back, the camera\'s 84 deg kept', c.get('emit') === 'thick' && c.get('incl') === 84, `${c.get('emit')} ${c.get('incl')}`);
  const p = open('');
  p.set(p.objectPatch('primordial'), { instant: true });
  ok('in the cinematic view, M87* then Primordial: no disk', p.get('emit') === 'off', p.get('emit'));
  const q = open('');
  q.set({ obj: 'custom', a: 0.3, q: 0.9 }, { instant: true });
  q.set(q.objectPatch('sgra'), { instant: true });
  ok('an object button clears the charge and sets the object\'s spin', q.get('q') === 0 && q.get('a') === 0.5, `${q.get('q')} ${q.get('a')}`);
  const g = open('?o=sgra');
  ok('Sgr A* opens at its mass and distance, 4.297e6 Msun at 8277 pc', near(g.get('mass'), Math.log10(4.297e6), 1e-12) && near(g.get('dist'), Math.log10(8277), 1e-12), `${g.get('mass')} ${g.get('dist')}`);
  ok('Primordial accretes nothing: its Eddington ratio opens at the floor, 1e-9', open('?o=primordial').get('edd') === -9, `${open('?o=primordial').get('edd')}`);
  const d = open('?o=sgra');
  d.set(d.objectPatch('primordial'), { instant: true });
  ok('Primordial has no distance of its own: Sgr A*, then Primordial, keeps Sgr A*\'s 8277 pc', near(d.get('dist'), Math.log10(8277), 1e-12), `${d.get('dist')}`);
  ok('the custom button names the custom hole and changes nothing else', JSON.stringify(open('').objectPatch('custom')) === '{"obj":"custom"}', JSON.stringify(open('').objectPatch('custom')));
});

guard('a view button', () => {
  for (const v of Object.keys(VIEWS)) {
    const s = open('');
    s.set({ tilt: 30 }, { instant: true });
    s.set(s.viewPatch(v), { instant: true });
    ok(`the ${v} view looks level: tilt 0`, s.get('tilt') === 0, `${s.get('tilt')}`);
    ok(`the ${v} view's observer is ${v === 'journey' ? 'falling' : 'hovering'}`, s.get('observer') === (v === 'journey' ? 'faller' : 'zamo'), s.get('observer'));
  }
  const t = open('?v=telescope');
  t.set(t.viewPatch('cinematic'), { instant: true });
  ok('telescope, then cinematic: the cinematic view\'s own 84 deg', t.get('incl') === 84, `${t.get('incl')}`);
  const k = open('');
  k.set({ obj: 'custom', incl: 33 }, { instant: true });
  k.set(k.viewPatch('telescope'), { instant: true });
  ok('a custom hole at 33 deg taken to the telescope view keeps its 33 deg: it has no measured inclination', k.get('incl') === 33, `${k.get('incl')}`);
  const g = open('?o=sgra');
  g.set(g.viewPatch('telescope'), { instant: true });
  ok('Sgr A*, then the telescope view: Sgr A*\'s measured 30 deg', g.get('incl') === 30, `${g.get('incl')}`);
  ok('the journey view shows M87*\'s thick disk', open('?v=journey').get('emit') === 'thick', open('?v=journey').get('emit'));
  ok('an unknown view changes nothing', JSON.stringify(open('').viewPatch('edge')) === '{}', JSON.stringify(open('').viewPatch('edge')));
  const s = open('?o=sgra&v=telescope&i=60');
  ok('preset() depends on the two names only, not on the live state', JSON.stringify(s.preset('custom', 'telescope')) === JSON.stringify(new Store().preset('custom', 'telescope')), `${s.preset('custom', 'telescope').incl}`);
  ok('preset() with no names is the default page\'s', JSON.stringify(s.preset()) === JSON.stringify(new Store().preset('m87', 'cinematic')));
});

guard('the link\'s text', () => {
  const s = open('?o=sgra');
  s.set({ rcam: 57.94675200000001, az: 12.299999999999983, a: 0.12345678, notes: false }, { instant: true });
  const q = new URLSearchParams(s.toQuery());
  ok('a distance (1 digit in the schema) is written with 3 decimals: r=57.947', q.get('r') === '57.947', s.toQuery());
  ok('an azimuth is written as the number it rounds to: z=12.3', q.get('z') === '12.3', s.toQuery());
  ok('the spin (3 digits in the schema) is written with 4 decimals: a=0.1235', q.get('a') === '0.1235', s.toQuery());
  ok('a toggle switched off is written as 0', q.get('n') === '0', s.toQuery());
  ok('?type=kerr (the first version\'s links) opens a = 0.9', open('?type=kerr').get('a') === 0.9, `${open('?type=kerr').get('a')}`);
  ok('?type=kerr&o=sgra: the object names the spin, 0.5', open('?type=kerr&o=sgra').get('a') === 0.5, `${open('?type=kerr&o=sgra').get('a')}`);
  ok('?type=schwarzschild alone opens at the cinematic 84 deg: only view=edge means 88', open('?type=schwarzschild').get('incl') === 84, `${open('?type=schwarzschild').get('incl')}`);
});

/* ============================================================
   fix_s2_p1 K5 (review_s2_p1_second S10): every way into the
   state takes one rule for when a named object turns custom. A
   link, a set() from an imported file (plate.test.mjs) and a
   slider (the drive) all go through Store.set. Each bound is
   checked just inside and just outside half a unit of the link's
   last written digit.
   ============================================================ */
guard('a named object is its catalogue\'s hole', () => {
  const g = open('?o=sgra&v=telescope&m=7');
  ok('?o=sgra&v=telescope&m=7: a mass of the link\'s own makes a custom hole, so no comparison reads 4.297e6 under 1e7', g.get('obj') === 'custom' && g.get('mass') === 7, `${g.get('obj')}`);
  const sg = Math.log10(4.297e6), m87 = Math.log10(6.5e9);
  for (const [name, q, want] of [
    ['a mass 4e-4 above Sgr A*\'s log10, inside the link\'s 5e-4', `?o=sgra&m=${sg + 4e-4}`, 'sgra'],
    ['a mass 6e-4 above it, outside', `?o=sgra&m=${sg + 6e-4}`, 'custom'],
    ['a mass 6e-4 below it, outside', `?o=sgra&m=${sg - 6e-4}`, 'custom'],
    ['a distance 4e-4 off Sgr A*\'s, inside', `?o=sgra&d=${Math.log10(8277) + 4e-4}`, 'sgra'],
    ['a distance 6e-4 off it, outside', `?o=sgra&d=${Math.log10(8277) + 6e-4}`, 'custom'],
    ['a spin 4e-5 off M87*\'s 0.94, inside the link\'s 5e-5', '?o=m87&a=0.94004', 'm87'],
    ['a spin 6e-5 off it, outside', '?o=m87&a=0.94006', 'custom'],
    ['a spin 6e-5 below it, outside', '?o=m87&a=0.93994', 'custom'],
    ['a charge of 4e-4, inside the link\'s 5e-4', '?o=sgra&qq=0.0004', 'sgra'],
    ['a charge of 6e-4, outside', '?o=sgra&qq=0.0006', 'custom'],
    ['M87*\'s own mass written to 3 decimals, as a link writes it', `?o=m87&m=${m87.toFixed(3)}`, 'm87'],
    ['an Eddington ratio of the link\'s own: not a key of the rule', '?o=sgra&e=-5', 'sgra'],
    ['an inclination of the link\'s own: not a key of the rule', '?o=sgra&v=telescope&i=60', 'sgra'],
    ['Primordial has no distance, so a distance of the link\'s own is not compared', '?o=primordial&d=5', 'primordial'],
  ]) {
    const s = open(q);
    ok(`${name}: ${q} opens ${want}`, s.get('obj') === want, `${s.get('obj')}`);
  }
  // the same rule after boot: a set() of a spin, a charge or a mass, as a slider or the guide's apply sends it
  for (const k of ['a', 'q', 'mass', 'dist']) {
    const s = open('?o=sgra'), heard = [];
    s.on((changed) => heard.push(changed.join()));
    s.set({ [k]: s.get(k) + 0.05 }, { instant: true });
    ok(`Sgr A* given a ${k} of the visitor's: custom, and the change reports obj`, s.get('obj') === 'custom' && heard[0] === `${k},obj`, `${s.get('obj')} ${heard[0]}`);
  }
  const c = open('?o=custom&m=3');
  c.set({ a: 0.2 }, { instant: true });
  ok('a custom hole stays custom, whatever it is given', c.get('obj') === 'custom');
  const back = open('?o=sgra');
  back.set({ a: 0.6 }, { instant: true });
  back.set({ a: 0.5 }, { instant: true });
  ok('a named object made custom does not turn back when its spin returns', back.get('obj') === 'custom');
  ok('the tour\'s and the buttons\' presets keep their object: every object in every view', OBJECTS.every((o) => Object.keys(VIEWS).every((v) => { const s = open(''); s.set(s.objectPatch(o.id, v), { instant: true }); s.set(s.viewPatch(v), { instant: true }); return s.get('obj') === o.id; })));
  ok('isOwn(): the catalogue state is its own; a custom hole always is', open('?o=cygx1').isOwn() && open('?o=custom&a=0.3').isOwn());
});

console.log(fails ? `\n${fails} of ${checks} link check(s) failed` : `\nall ${checks} link checks passed`);
process.exit(fails ? 1 : 0);
