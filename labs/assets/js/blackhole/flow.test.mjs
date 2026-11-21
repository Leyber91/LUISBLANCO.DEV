/* ============================================================
   blackhole/flow.test.mjs — the disk's motion (flow.js): two copies
   of the pattern's core carried along the orbits and crossfaded, so
   the shear stays bounded, blended around the core's own mean, the
   lanes drawn once outside them, and the page's clock stated.
   Run:  node labs/assets/js/blackhole/flow.test.mjs

   review_spin (2026-11-18) found this file checking three named
   holes on M87*'s numbers and the shader by regular expressions a
   broken line still matched; review_spin2 found a check that passed
   when its line was not found (NaN compared false) and a pulse the
   global statistics could not see. The shader's lines are now read
   from its source, each read required, and run; its noise is ported,
   the port pinned to the source word for word, to measure the core.
   ============================================================ */

import * as K from './kerr.js';
import * as F from './flow.js';
import { derive } from './physics.js';
import { Store } from './state.js';
import { OBJECTS } from './config.js';
import * as S from './shaders.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

ok('the constants: 7.5 M a second, a cycle of two ISCO orbits, 256 seeds, the core\'s mean 0.52',
  JSON.stringify(F.FLOW) === JSON.stringify({ mPerSecond: 7.5, cycleOrbits: 2, seeds: 256, coreMean: 0.52 }), JSON.stringify(F.FLOW));

// 1. the two copies: weights in [0, 1] summing to one; a copy at its reset weighs nothing; a copy is carried for 0 to
//    one cycle; the copies half a cycle apart; a fresh seed after every reset, never the other copy's
for (const [a, q] of [[0, 0], [0.94, 0], [0.998, 0], [0.5, 0.5]]) {
  const T = F.flowCycle(a, q);
  let bad = 0, worstAtReset = 0, maxTau = 0, minTau = Infinity, sameSeed = 0, shared = 0, offset = 0;
  let prev = F.flowPhases(0, T);
  for (let k = 1; k <= 4000; k++) {
    const t = k * T / 400;
    const ph = F.flowPhases(t, T);
    if (Math.abs(ph[0].w + ph[1].w - 1) > 1e-12 || ph.some((p) => p.w < -1e-12 || p.w > 1 + 1e-12)) bad++;
    if (ph[0].seed === ph[1].seed) shared++;
    if (Math.abs(Math.abs(ph[1].tau - ph[0].tau) - 0.5 * T) > 1e-6 * T) offset++;
    for (let i = 0; i < 2; i++) {
      maxTau = Math.max(maxTau, ph[i].tau); minTau = Math.min(minTau, ph[i].tau);
      if (ph[i].tau < prev[i].tau) {
        worstAtReset = Math.max(worstAtReset, prev[i].w, ph[i].w);
        if (ph[i].seed === prev[i].seed) sameSeed++;
      }
    }
    prev = ph;
  }
  ok(`a ${a}, Q/M ${q}: the weights stay in [0, 1] and sum to one`, bad === 0, `${bad} bad steps`);
  ok(`a ${a}, Q/M ${q}: a copy weighs under 1% at the step of its reset, so the reset is not seen`, worstAtReset < 0.01, `worst ${worstAtReset.toFixed(4)}`);
  ok(`a ${a}, Q/M ${q}: a copy is carried for 0 to one cycle, never a negative time`, maxTau < T + 1e-9 && minTau >= -1e-9, `${minTau.toFixed(3)} to ${maxTau.toFixed(2)} of ${T.toFixed(2)} M`);
  ok(`a ${a}, Q/M ${q}: the two copies are half a cycle apart`, offset === 0, `${offset} steps off`);
  ok(`a ${a}, Q/M ${q}: every reset starts from a new seed, and the two copies never share one`, sameSeed === 0 && shared === 0, `${sameSeed} repeated, ${shared} shared`);
}
{
  const T = F.flowCycle(0.94, 0);
  const seeds = new Set();
  for (let c = 0; c < 400; c++) seeds.add(F.flowPhases(c * T + 0.25 * T, T)[0].seed);
  ok(`copy 0 runs through 128 seeds before one repeats: the picture repeats after 128 cycles, ${(128 * T / F.FLOW.mPerSecond / 60).toFixed(1)} min at a 0.94`, seeds.size === 128, `${seeds.size}`);
}

// 2. the shear a copy carries: at most the cycle's, between the ISCO and twice its radius
for (const [a, q] of [[0, 0], [0.94, 0], [0.998, 0]]) {
  const T = F.flowCycle(a, q), ri = K.isco(a, 1, q);
  const shear = (tau) => tau * (K.circular(a, ri, q).Omega - K.circular(a, 2 * ri, q).Omega) / (2 * Math.PI);
  ok(`a ${a}: a copy is sheared by at most ${shear(T).toFixed(2)} turns between the ISCO and twice its radius, under 1.5`, shear(T) < 1.5);
  ok(`a ${a}: the cycle is two ISCO orbits, ${(T / F.FLOW.mPerSecond).toFixed(1)} s of display`, Math.abs(T - 2 * 2 * Math.PI / K.circular(a, ri, q).Omega) < 1e-9);
}

// 3. the clock's sentences for each hole from its own preset, pinned by hand (GM/c^3 of a sun is 4.925 us); the
//    distant clock named in both (the gas's own clock at the ISCO counts less)
const holes = [
  ['m87', 'a second here is 2.78 d by a distant clock at M87*', 'takes 3.2 s here and 8.89 d by that clock', 'takes 3.2 s here and 8.89 d by a distant clock'],
  ['sgra', 'a second here is 2.65 min by a distant clock at Sgr A*', 'takes 7.7 s here and 20.4 min by that clock', 'takes 7.7 s here and 20.4 min by a distant clock'],
  ['cygx1', 'a second here is 783 µs by a distant clock at Cygnus X-1', 'takes 2.0 s here and 1.56 ms by that clock', 'takes 2.0 s here and 1.56 ms by a distant clock'],
];
for (const [id, per, orbit, short] of holes) {
  const st = new Store();
  st.set(st.objectPatch(id, 'cinematic'), { instant: true });
  const s = st.all(), m = derive(s);
  const line = F.clockLine(m, OBJECTS.find((o) => o.id === id).name), card = F.clockShort(m);
  ok(`${id}: the clock's sentence, from the hole's own preset (${s.obj}, mass 10^${s.mass.toFixed(3)})`, s.obj === id && line.includes(per) && line.includes(orbit), line);
  ok(`${id}: the caption card's short sentence`, card.includes(short) && card.startsWith('Time here runs at 7.5 M a second'), card);
}
{
  // a charged hole: the ISCO orbit here from the Kerr-Newman frequency written out, w / (r^2 + a w), w = sqrt(r - Q^2)
  const st = new Store();
  st.set({ obj: 'custom', a: 0.5, q: 0.5 }, { instant: true });
  const m = derive(st.all()), r = K.isco(0.5, 1, 0.5), w = Math.sqrt(r - 0.25);
  const here = (2 * Math.PI / (w / (r * r + 0.5 * w)) / 7.5).toFixed(1);
  const line = F.clockLine(m, null), card = F.clockShort(m);
  ok(`a charged hole (a 0.5, Q/M 0.5): an orbit at its ISCO takes ${here} s here in both sentences, its charge counted`,
    st.all().q === 0.5 && line.includes(`takes ${here} s here`) && card.includes(`takes ${here} s here`) && line.includes('at this hole'), `${line} | ${card}`);
}

// 4. when the sentence about a turning disk shows
{
  const base = { emit: 'thick', color: 'thermal', anim: true, view: 'cinematic' };
  const cases = [
    [base, false, true], [{ ...base, color: 'true' }, false, true], [{ ...base, view: 'telescope' }, false, true],
    [{ ...base, emit: 'thin' }, false, false], [{ ...base, emit: 'off' }, false, false],
    [{ ...base, color: 'redshift' }, false, false], [{ ...base, color: 'order' }, false, false], [{ ...base, color: 'steps' }, false, false],
    [{ ...base, anim: false }, false, false], [base, true, false], [{ ...base, view: 'journey' }, false, false],
  ];
  const wrong = cases.filter(([s, red, want]) => F.clockShown(s, red) !== want);
  ok('the clock\'s sentence shows only where a textured disk turns: thick, thermal or true colour, playing, motion allowed, not the fall', wrong.length === 0, wrong.map(([s, r]) => JSON.stringify({ ...s, reduced: r })).join(' '));
}

// 5. the shader's arithmetic, run: each line read from its source (a line not found fails), evaluated against
//    flowPhases and flowBlend
const shade = S.shadeProgram();
const turb = (shade.match(/float turbulence\(float r, float phiW\)\{[\s\S]*?\n\}/) || [''])[0];
const read = (re) => (turb.match(re) || [null])[0];
const lines = { T: read(/float T = [^;]*;/), c: read(/float c0 = [^;]*;/), t: read(/float t0 = [^;]*;/), w: read(/float w0 = [^;]*;/), x0: read(/float x0 = [^;]*;/), x1: read(/float x1 = [^;]*;/), m: read(/float m = [^;]*;/), x: read(/float x = [^;]*;/), lanes: read(/float lanes = [^;]*;/), ret: read(/return [^;]*;/) };
const missingLines = Object.entries(lines).filter(([, v]) => !v).map(([k]) => k);
ok('every line of turbulence() the checks below read is found', missingLines.length === 0, missingLines.join(', '));
const toJs = (src) => (src || '').replace(/float /g, '').replace(/floor\(/g, 'Math.floor(').replace(/abs\(/g, 'Math.abs(').replace(/max\(/g, 'Math.max(').replace(/sin\(/g, 'Math.sin(').replace(/inversesqrt\(/g, '1/Math.sqrt(');
{
  let run = null;
  try { run = new Function('uTime', 'uCycle', `let T, c0, c1, t0, t1, w0, w1;\n${[lines.T, lines.c, lines.t, lines.w].map(toJs).join('\n')}\nreturn { c0, c1, t0, t1, w0, w1 };`); } catch { run = null; }
  let off = 0, n = 0;
  if (run && !missingLines.length) {
    for (const [a, q] of [[0.94, 0], [0, 0]]) {
      const T = F.flowCycle(a, q);
      for (let k = 0; k < 3000; k++) {
        const t = k * T / 397 + 0.37, js = F.flowPhases(t, T), g = run(t, T);
        n++;
        const nums = [g.t0, g.t1, g.w0, g.w1, g.c0, g.c1];
        if (!nums.every(Number.isFinite)) { off++; continue; }
        if (Math.abs(g.t0 - js[0].tau) > 1e-6 || Math.abs(g.t1 - js[1].tau) > 1e-6 || Math.abs(g.w0 - js[0].w) > 1e-9 || Math.abs(g.w1 - js[1].w) > 1e-9) off++;
        if (((g.c0 * 2) % F.FLOW.seeds) !== js[0].seed || ((g.c1 * 2 + 1) % F.FLOW.seeds) !== js[1].seed) off++;
      }
    }
  }
  ok('the shader\'s time lines, run, give flowPhases\'s times, weights and seeds at 6000 times', n === 6000 && off === 0, `${off} off of ${n}`);
  ok('copy 0 is drawn at t0 from seed c0*2, copy 1 at t1 from seed c1*2 + 1, over the 256 seeds',
    /diskCore\(phiW - Om\*t0, lr, mod\(c0\*2\.0, 256\.0\)\)/.test(lines.x0 || '') && /diskCore\(phiW - Om\*t1, lr, mod\(c1\*2\.0 \+ 1\.0, 256\.0\)\)/.test(lines.x1 || ''), `${lines.x0} | ${lines.x1}`);
  let blendOff = -1;
  try {
    const mVal = +((lines.m || '').match(/[\d.]+/) || [NaN])[0];
    const js = new Function('x0', 'x1', 'w0', 'w1', 'm', `return ${toJs(lines.x).replace(/^x = /, '').replace(/;$/, '')}`);
    blendOff = Number.isFinite(mVal) && mVal === F.FLOW.coreMean ? 0 : 99;
    for (const [a0, a1, w] of [[0.3, 1.2, 0.5], [0.9, 0.5, 0.2], [0.6, 0.7, 0.9], [1.4, 0.4, 0.33], [0.05, 0.02, 0.5]]) {
      const g = js(a0, a1, w, 1 - w, mVal);
      if (!Number.isFinite(g) || Math.abs(g - F.flowBlend(a0, a1, w, 1 - w)) > 1e-9) blendOff++;
    }
  } catch { blendOff = -1; }
  ok('the shader\'s blend, run, gives flowBlend around the core\'s mean 0.52', blendOff === 0, `${blendOff} off`);
  ok('the lanes are drawn once from the radius alone, outside the copies, and the pattern is 0.30 + core x (0.75 + 0.35 lanes)',
    lines.lanes === 'float lanes = 0.5 + 0.5*sin(lr*42.0);' && lines.ret === 'return 0.30 + x*(0.75 + 0.35*lanes);', `${lines.lanes} | ${lines.ret}`);
}

// 6. the core through a cycle: a port of the shader's noise, pinned to its source word for word
const NOISE_SRC = [
  'float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y)*p.z); }',
  'float vnoise(vec3 x){\n  vec3 i = floor(x), f = fract(x);\n  f = f*f*(3.0 - 2.0*f);\n  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),\n             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);\n}',
  'float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }',
  'vec3 p = vec3(cos(ang)*5.5, sin(ang)*5.5, lr*16.0) + vec3(seed*13.7, seed*7.9, 0.0);',
  'float body = fbm(p*vec3(1.0, 1.0, 0.5));',
  'float ridge = 1.0 - abs(2.0*fbm(p*vec3(1.7, 1.7, 1.3) + 4.0) - 1.0);',
  'return 1.05*body*body*2.0*(0.55 + 0.75*ridge*ridge);',
];
const missing = NOISE_SRC.filter((l) => !shade.includes(l));
ok('the port below is the shader\'s noise and core word for word', missing.length === 0, missing.map((l) => l.slice(0, 50)).join(' | '));
{
  const fract = (x) => x - Math.floor(x);
  const hash13 = (x, y, z) => { x = fract(x * 0.1031); y = fract(y * 0.1031); z = fract(z * 0.1031); const d = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32); x += d; y += d; z += d; return fract((x + y) * z); };
  const sm = (f) => f * f * (3 - 2 * f);
  const vnoise = (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
    const h = (a, b, c) => hash13(ix + a, iy + b, iz + c), mix = (a, b, t) => a + (b - a) * t;
    return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), fx), mix(h(0, 1, 0), h(1, 1, 0), fx), fy), mix(mix(h(0, 0, 1), h(1, 0, 1), fx), mix(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
  };
  const fbm = (x, y, z) => { let a = 0.5, s = 0; for (let i = 0; i < 4; i++) { s += a * vnoise(x, y, z); x = x * 2.03 + 7.1; y = y * 2.03 + 7.1; z = z * 2.03 + 7.1; a *= 0.5; } return s; };
  const core = (ang, lr, seed) => {
    const px = Math.cos(ang) * 5.5 + seed * 13.7, py = Math.sin(ang) * 5.5 + seed * 7.9, pz = lr * 16;
    const body = fbm(px, py, pz * 0.5), ridge = 1 - Math.abs(2 * fbm(px * 1.7 + 4, py * 1.7 + 4, pz * 1.3 + 4) - 1);
    return 1.05 * body * body * 2 * (0.55 + 0.75 * ridge * ridge);
  };
  let sd = 4242; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const a = 0.94, T = F.flowCycle(a, 0), ri = K.isco(a, 1, 0);
  const stat = (v) => { const m = v.reduce((x, y) => x + y, 0) / v.length; return [m, Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length)]; };
  const sample = Array.from({ length: 24000 }, () => core(rnd() * 2 * Math.PI, Math.log(Math.sqrt(ri * ri + rnd() * (400 - ri * ri))), Math.floor(rnd() * 256)));
  const [cm] = stat(sample);
  ok(`one copy's core averages ${cm.toFixed(4)} over the disk, the mean the copies are blended around (0.52) within 0.004`, Math.abs(cm - F.FLOW.coreMean) < 0.004);
  // the two copies are independent: their cores at one point, seeds apart and angles half a cycle apart
  const xs = [], ys = [];
  for (let i = 0; i < 12000; i++) {
    const r = Math.sqrt(ri * ri + rnd() * (400 - ri * ri)), p = rnd() * 2 * Math.PI, lr = Math.log(r), Om = K.circular(a, r, 0).Omega;
    const c = Math.floor(rnd() * 120), tau = rnd() * T;
    xs.push(core(p - Om * tau, lr, (2 * c) % 256)); ys.push(core(p - Om * ((tau + T / 2) % T), lr, (2 * c + 1) % 256));
  }
  const [mx, sx] = stat(xs), [my, sy] = stat(ys);
  const rho = xs.reduce((q, v, i) => q + (v - mx) * (ys[i] - my), 0) / xs.length / (sx * sy);
  ok(`the two copies' cores are independent: correlation ${rho.toFixed(4)}, under 0.02`, Math.abs(rho) < 0.02);
  // through half a cycle, at each phase averaged over 16 cycles: the blended core's mean and spread hold
  const pts = Array.from({ length: 1500 }, () => [Math.sqrt(ri * ri + rnd() * (400 - ri * ri)), rnd() * 2 * Math.PI]);
  const means = [], sds = [];
  for (let k = 0; k <= 8; k++) {
    let mSum = 0, sSum = 0;
    for (let c = 0; c < 16; c++) {
      const ph = F.flowPhases((10 + c) * T + k * T / 16, T);
      const [m, s] = stat(pts.map(([r, p]) => {
        const Om = K.circular(a, r, 0).Omega, lr = Math.log(r);
        return F.flowBlend(core(p - Om * ph[0].tau, lr, ph[0].seed), core(p - Om * ph[1].tau, lr, ph[1].seed), ph[0].w, ph[1].w);
      }));
      mSum += m; sSum += s;
    }
    means.push(mSum / 16); sds.push(sSum / 16);
  }
  const spread = (v) => (Math.max(...v) - Math.min(...v)) / (v.reduce((x, y) => x + y, 0) / v.length);
  ok('through half a cycle, averaged over 16 cycles, the blended core keeps its mean within 1% and its spread within 2.5%: no breathing', spread(means) < 0.01 && spread(sds) < 0.025,
    `mean ${(100 * spread(means)).toFixed(2)}%, spread ${(100 * spread(sds)).toFixed(2)}%`);
}

// 7. the renderer binds the cycle, the shader declares it, and the ignition fades in place
{
  const src = readFileSync(fileURLToPath(new URL('./renderer.js', import.meta.url)), 'utf8');
  ok('the renderer binds uCycle from the geometry, and the geometry\'s cycle is flowCycle(a, q)', /\['uCycle', '1f', \(f\) => f\.cycle\],/.test(src) && /cycle: flowCycle\(a, q\)/.test(src));
  ok('the shader declares uCycle and the ignition fades in place', /uniform float uCycle/.test(shade) && /float ign = smoothstep\(0\.0, 1\.0, uIgnite\);/.test(shade));
}

// the clock's tag follows its weakest input, the mass and the spin (flow.js clockTag; the final grade, 2026-11-18)
{
  const byId = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));
  const want = { m87: 'ILLUSTRATIVE', sgra: 'ILLUSTRATIVE', cygx1: 'REAL', primordial: 'ILLUSTRATIVE' };
  for (const [id, tag] of Object.entries(want)) ok(`the clock of ${byId[id].name} is tagged ${tag}, from its spin tag ${byId[id].spinTag}`, F.clockTag(byId[id]) === tag, F.clockTag(byId[id]));
  ok('a custom hole\'s clock is tagged ILLUSTRATIVE', F.clockTag(null) === 'ILLUSTRATIVE');
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
