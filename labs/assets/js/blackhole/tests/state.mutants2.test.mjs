/* ============================================================
   The test of the store's tests, part 2 of 2. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/state.mutants2.test.mjs

   Each entry breaks one rule of state.js's presets and link: what
   an object button or a view button sets (emitter, inclination,
   tilt, observer, charge, accretion floor, distance), the preset
   a link starts from, which keys the link writes and with how
   many decimals, the first version's ?type= and ?view=edge links,
   and boot. The broken file is written to a copy of this lab in
   the system's temp folder and state.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check
   there. Part 1 is state.mutants.test.mjs.

   Add an entry here with every new rule in state.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ORDER = `if (v === (d.key === 'obj' || d.key === 'view' ? d.def : base[d.key])) continue;`;
const WRITE = `String(+Number(v).toFixed(Math.max(d.digits ?? 3, 2) + 1))`;
const BOOT = `this.set(this.preset(this.coerce('obj', patch.obj ?? DEFAULTS.obj), this.coerce('view', patch.view ?? DEFAULTS.view)), { instant: true, src: 'boot' });`;

const MUTANTS = [
  /* ---- an object button ---- */
  ['every object button gives M87*', `const o = OBJECTS.find((x) => x.id === id);`, `const o = OBJECTS.find((x) => x.id === DEFAULTS.obj);`],
  ['the custom button sets nothing', `if (!o) return { obj: 'custom' };`, `if (!o) return {};`],
  ['an object keeps the charge it had', `a: o.spin, q: 0, mass:`, `a: o.spin, mass:`],
  ['an object keeps the mass it had', `mass: Math.log10(o.mass), `, ``],
  ['Primordial\'s zero accretion read as log10(0)', `edd: o.edd > 0 ?`, `edd: o.edd >= 0 ?`],
  ['Sgr A*\'s 1e-8 read as no accretion', `edd: o.edd > 0 ?`, `edd: o.edd > 1e-8 ?`],
  ['no accretion opens at 1e-8', `Math.log10(o.edd) : -9,`, `Math.log10(o.edd) : -8,`],
  ['in the telescope view an object brings its own disk', `emit: view === 'telescope' ? 'thin'`, `emit: view === 'telescopeX' ? 'thin'`],
  ['an object with no disk of its own gets the thin one', `(o.view?.emit || 'thick'),`, `(o.view?.emit || 'thin'),`],
  ['Primordial gets a disk', `(o.view?.emit || 'thick'),`, `('thick'),`],
  ['an object keeps the distance it had', `    if (o.distPc) p.dist = Math.log10(o.distPc);\n`, ``],
  ['Primordial\'s missing distance read as log10(null)', `if (o.distPc) p.dist`, `p.dist`],
  ['in the telescope view an object keeps the camera\'s inclination', `if (view === 'telescope') p.incl = o.incl;`, `if (view === 'telescopeX') p.incl = o.incl;`],
  ['in every view an object sets its measured inclination', `    if (view === 'telescope') p.incl = o.incl;`, `    p.incl = o.incl;`],
  ['an object button reads the cinematic view, whatever the view is', `objectPatch(id, view = this.s.view)`, `objectPatch(id, view = 'cinematic')`],

  /* ---- a view button ---- */
  ['an unknown view breaks the page', `    if (!v) return {};\n`, ``],
  ['a view leaves the tilt where it was', `tilt: v.tilt || 0, `, ``],
  ['a view with tilt 0 opens at 5 deg', `tilt: v.tilt || 0,`, `tilt: v.tilt || 5,`],
  ['the journey\'s observer hovers', `observer: id === 'journey' ?`, `observer: id === 'journeyX' ?`],
  ['every view but the cinematic falls', `observer: id === 'journey' ?`, `observer: id !== 'cinematic' ?`],
  ['a view reads M87* whatever the object', `const o = OBJECTS.find((x) => x.id === obj);`, `const o = OBJECTS.find((x) => x.id === DEFAULTS.obj);`],
  ['a view button reads M87* when no object is named', `viewPatch(id, obj = this.s.obj,`, `viewPatch(id, obj = DEFAULTS.obj,`],
  ['the telescope view brings the object\'s disk', `p.emit = id === 'telescope' ? 'thin'`, `p.emit = id === 'telescopeX' ? 'thin'`],
  ['a view of an object with no disk of its own gets the thin one', `(o?.view?.emit || 'thick');`, `(o?.view?.emit || 'thin');`],
  ['a view of Primordial gets a disk', `(o?.view?.emit || 'thick');`, `('thick');`],
  ['the telescope view takes no measured inclination', `p.incl = id === 'telescope' ? (o ? o.incl`, `p.incl = id === 'telescopeX' ? (o ? o.incl`],
  ['a custom hole in the telescope view opens at 17 deg', `(o ? o.incl : keep)`, `(o ? o.incl : 17)`],
  ['a view keeps the inclination it had', `(v.incl ?? keep)`, `(keep)`],
  ['a view button keeps the default 84 deg, not the camera\'s', `keep = this.s.incl) {`, `keep = DEFAULTS.incl) {`],

  /* ---- the preset a link starts from ---- */
  ['the preset depends on the live inclination', `this.viewPatch(view, obj, DEFAULTS.incl)`, `this.viewPatch(view, obj)`],
  ['the preset with no names reads the live object', `preset(obj = DEFAULTS.obj,`, `preset(obj = this.s.obj,`],
  ['the preset with no names reads the live view', `view = DEFAULTS.view) {`, `view = this.s.view) {`],
  ['the preset leaves the object out', `...this.objectPatch(obj, view), `, ``],

  /* ---- the link's text ---- */
  ['every key is written', `      ${ORDER}\n`, ``],
  ['obj and view compared with the preset, so never written', ORDER, ORDER.replace(`d.key === 'obj' || d.key === 'view' ? d.def : base[d.key]`, `base[d.key]`)],
  ['obj compared with the preset, so never written', ORDER, ORDER.replace(`d.key === 'obj' ||`, `d.key === 'objX' ||`)],
  ['view compared with the preset, so never written', ORDER, ORDER.replace(`|| d.key === 'view' ?`, `|| d.key === 'viewX' ?`)],
  ['neither obj nor view compared with the default', ORDER, ORDER.replace(`d.key === 'obj' || d.key === 'view'`, `d.key === 'obj' && d.key === 'view'`)],
  ['numbers written as they are', `d.type === 'num' ? String(`, `d.type === 'numX' ? String(`],
  ['a number written with its schema digits + 1, below 3 decimals', WRITE, WRITE.replace(`Math.max(d.digits ?? 3, 2) + 1`, `(d.digits ?? 3) + 1`)],
  ['at least 2 decimals, not 3', WRITE, WRITE.replace(`, 2) + 1`, `, 1) + 1`)],
  ['at least 4 decimals, not 3', WRITE, WRITE.replace(`, 2) + 1`, `, 3) + 1`)],
  ['no decimal added to the schema digits', WRITE, WRITE.replace(`, 2) + 1)`, `, 2))`)],
  ['the schema digits not read: 4 decimals for every number', WRITE, WRITE.replace(`d.digits ?? 3`, `3`)],
  ['a toggle written as true or false', `d.type === 'bool' ? (v ? '1' : '0')`, `d.type === 'boolX' ? (v ? '1' : '0')`],
  ['a toggle switched off written as 1', `(v ? '1' : '0')`, `(v ? '1' : '1')`],

  /* ---- reading a link ---- */
  ['every key read, present in the link or not', `if (q.has(d.url)) patch[d.key]`, `patch[d.key]`],
  ['?type=kerr opens a = 0.94', `? 0 : 0.9 });`, `? 0 : 0.94 });`],
  ['?type= overrides the spin of the object the link names', `if (q.has('type') && !q.has('o'))`, `if (q.has('type'))`],
  ['every link is read as a ?type= link', `if (q.has('type') && !q.has('o'))`, `if (!q.has('o'))`],
  ['?type=schwarzschild read as kerr', `q.get('type') === 'schwarzschild'`, `q.get('type') === 'kerr'`],
  ['every link opens edge-on', `    if (q.get('view') === 'edge') patch.incl = 88;`, `    patch.incl = 88;`],
  ['?view=edge not read', `=== 'edge') patch`, `=== 'edges') patch`],

  /* ---- boot ---- */
  ['boot starts from M87*\'s preset whatever object the link names', BOOT, BOOT.replace(`patch.obj ?? DEFAULTS.obj`, `DEFAULTS.obj`)],
  ['boot starts from the cinematic preset whatever view the link names', BOOT, BOOT.replace(`patch.view ?? DEFAULTS.view`, `DEFAULTS.view`)],
  ['boot skips the preset', `    ${BOOT}\n`, ``],
  ['open() returns nothing the link carried', `    this.set(patch, { instant: true, src: 'boot' });\n    return patch;`, `    this.set(patch, { instant: true, src: 'boot' });\n    return {};`],

  /* ---- fix_s2_p1 K5: one rule for when a named object turns custom, on every way in ---- */
  ['a named object never turns custom', `    if (!this.isOwn()) {\n`, `    if (false) {\n`],
  ['a named object turns custom but keeps its name', `      this.s.obj = 'custom';\n`, `      this.s.obj = this.s.obj;\n`],
  ['the turn to custom not reported', `      if (!changed.includes('obj')) changed.push('obj');\n    }\n    if (!changed.length)`, `    }\n    if (!changed.length)`],
  ['a mass of the visitor\'s keeps the object', `const OWN = ['mass', 'dist', 'a', 'q'];`, `const OWN = ['dist', 'a', 'q'];`],
  ['a distance of the visitor\'s keeps the object', `const OWN = ['mass', 'dist', 'a', 'q'];`, `const OWN = ['mass', 'a', 'q'];`],
  ['a spin of the visitor\'s keeps the object', `const OWN = ['mass', 'dist', 'a', 'q'];`, `const OWN = ['mass', 'dist', 'q'];`],
  ['a charge of the visitor\'s keeps the object', `const OWN = ['mass', 'dist', 'a', 'q'];`, `const OWN = ['mass', 'dist', 'a'];`],
  ['the tolerance three times the link\'s rounding', `const linkTol = (d) => 0.5 *`, `const linkTol = (d) => 1.5 *`],
  ['the tolerance a tenth of the link\'s rounding', `const linkTol = (d) => 0.5 *`, `const linkTol = (d) => 0.05 *`],
  ['the tolerance at the schema digits, not one more', `Math.max(d.digits, 2) + 1));`, `Math.max(d.digits, 2)));`],
  ['the tolerance at 3 digits at least, not 2', `Math.max(d.digits, 2) + 1));`, `Math.max(d.digits, 3) + 1));`],
  ['a key its object does not set compared all the same (Primordial\'s distance)', `p[k] === undefined || Math.abs`, `false || Math.abs`],
  ['a key its object sets never its own', `p[k] === undefined || Math.abs`, `p[k] === undefined && Math.abs`],
  ['twice the tolerance taken as the object\'s own', `<= linkTol(BY_KEY[k]));`, `<= 2 * linkTol(BY_KEY[k]));`],
  ['the catalogue read for another object', `const p = this.objectPatch(s.obj, s.view);`, `const p = this.objectPatch('m87', s.view);`],
];

process.exit(await runMutants({ here, file: 'state.js', test: '../state.test.mjs', mutants: MUTANTS }));
