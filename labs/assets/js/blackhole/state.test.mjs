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
  const u = open('?o=cygx1&i=40&a=0.5');
  ok('?o=cygx1&i=40&a=0.5 opens Cygnus X-1 at 40 deg and a = 0.5', u.get('obj') === 'cygx1' && u.get('incl') === 40 && u.get('a') === 0.5);
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

console.log(fails ? `\n${fails} of ${checks} link check(s) failed` : `\nall ${checks} link checks passed`);
process.exit(fails ? 1 : 0);
