/* ============================================================
   blackhole/flow.test.mjs — the disk's motion (flow.js): two copies
   of the pattern carried along the orbits and crossfaded, so the
   shear stays bounded, blended around the pattern's own mean, and
   the page's clock stated for each hole.
   Run:  node labs/assets/js/blackhole/flow.test.mjs

   review_spin (2026-11-18) found the first version of this file
   checking three named holes on M87*'s numbers and the shader by
   regular expressions a broken line still matched (14 of 14 mutants
   survived). The shader's arithmetic is now run here: its lines are
   read from the source and evaluated against flowPhases; its noise
   is ported, and the port pinned to the source, to measure the
   pattern's mean and spread through a cycle.
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

ok('the constants: 7.5 M a second, a cycle of two ISCO orbits, 256 seeds, the pattern\'s mean 0.778, the copies\' correlation 0.07',
  JSON.stringify(F.FLOW) === JSON.stringify({ mPerSecond: 7.5, cycleOrbits: 2, seeds: 256, patternMean: 0.778, copyCorrelation: 0.07 }), JSON.stringify(F.FLOW));

// 1. the two copies: weights in [0, 1] summing to one; a copy at its reset weighs nothing; a copy is carried for under
//    one cycle; the two copies a half cycle apart; a fresh seed after every reset, never the other copy's
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
  ok('copy 0 runs through 128 seeds before one repeats (256 seeds, two copies)', seeds.size === 128, `${seeds.size}`);
}

// 2. the shear a copy carries: at most the cycle's, between the ISCO and twice its radius
for (const [a, q] of [[0, 0], [0.94, 0], [0.998, 0]]) {
  const T = F.flowCycle(a, q), ri = K.isco(a, 1, q);
  const shear = (tau) => tau * (K.circular(a, ri, q).Omega - K.circular(a, 2 * ri, q).Omega) / (2 * Math.PI);
  ok(`a ${a}: a copy is sheared by at most ${shear(T).toFixed(2)} turns between the ISCO and twice its radius, under 1.5`, shear(T) < 1.5);
  ok(`a ${a}: the cycle is two ISCO orbits, ${(T / F.FLOW.mPerSecond).toFixed(1)} s of display`, Math.abs(T - 2 * 2 * Math.PI / K.circular(a, ri, q).Omega) < 1e-9);
}

// 3. the clock's sentence for each hole from its own preset (the first version set the object alone, kept M87*'s mass
//    and turned every hole into a custom one). Pinned by hand: GM/c^3 of a sun is 4.925 us.
const holes = [
  ['m87', 'a second here is 2.78 d by a distant clock at M87*', 'takes 3.2 s here and 8.89 d there'],
  ['sgra', 'a second here is 2.65 min by a distant clock at Sgr A*', 'takes 7.7 s here and 20.4 min there'],
  ['cygx1', 'a second here is 783 µs by a distant clock at Cygnus X-1', 'takes 2.0 s here and 1.56 ms there'],
];
for (const [id, per, orbit] of holes) {
  const st = new Store();
  st.set(st.objectPatch(id, 'cinematic'), { instant: true });
  const s = st.all();
  const line = F.clockLine(derive(s), OBJECTS.find((o) => o.id === id).name);
  ok(`${id}: the clock's sentence, from the hole's own preset (${s.obj}, mass 10^${s.mass.toFixed(3)})`, s.obj === id && line.includes(per) && line.includes(orbit), line);
}
{
  // a charged hole: the ISCO orbit here from the Kerr-Newman frequency written out, w / (r^2 + a w), w = sqrt(r - Q^2)
  const st = new Store();
  st.set({ obj: 'custom', a: 0.5, q: 0.5 }, { instant: true });
  const m = derive(st.all()), r = K.isco(0.5, 1, 0.5), w = Math.sqrt(r - 0.25);
  const here = (2 * Math.PI / (w / (r * r + 0.5 * w)) / 7.5).toFixed(1);
  const line = F.clockLine(m, null);
  ok(`a charged hole (a 0.5, Q/M 0.5): an orbit at its ISCO takes ${here} s here, its charge counted`, st.all().q === 0.5 && line.includes(`takes ${here} s here`) && line.includes('at this hole'), line);
}

// the short form in the caption card, M87*, pinned
{
  const st = new Store();
  st.set(st.objectPatch('m87', 'cinematic'), { instant: true });
  const short = F.clockShort(derive(st.all()), 'M87*');
  ok('the caption card\'s clock for M87*', short === 'Time here runs at 7.5 M a second: an orbit at the ISCO takes 3.2 s here and 8.89 d at M87*.', short);
}

// 4. when the sentence about a turning disk shows
{
  const base = { emit: 'thick', color: 'thermal', anim: true };
  const cases = [
    [base, false, true], [{ ...base, color: 'true' }, false, true],
    [{ ...base, emit: 'thin' }, false, false], [{ ...base, emit: 'off' }, false, false],
    [{ ...base, color: 'redshift' }, false, false], [{ ...base, color: 'order' }, false, false], [{ ...base, color: 'steps' }, false, false],
    [{ ...base, anim: false }, false, false], [base, true, false],
  ];
  const wrong = cases.filter(([s, red, want]) => F.clockShown(s, red) !== want);
  ok('the clock\'s sentence shows only where a textured disk turns: thick, thermal or true colour, playing, motion allowed', wrong.length === 0, wrong.map(([s, r]) => JSON.stringify({ ...s, reduced: r })).join(' '));
}

// 5. the shader's arithmetic, run: the time lines of turbulence() evaluated against flowPhases, the seeds, which copy
//    each pattern is drawn with, and the blend against flowBlend
const shade = S.shadeProgram();
const turb = (shade.match(/float turbulence\(float r, float phiW\)\{[\s\S]*?\n\}/) || [''])[0];
ok('the shader has turbulence()', !!turb);
const glslLine = (name) => (turb.match(new RegExp(`float ${name} = [^;]*;`)) || [''])[0];
const toJs = (src) => src.replace(/float /g, '').replace(/floor\(/g, 'Math.floor(').replace(/abs\(/g, 'Math.abs(').replace(/mod\(([^,]+), ([^)]+)\)/g, '(($1) % ($2))');
{
  const timeSrc = [toJs((turb.match(/float T = [^;]*;/) || [''])[0]), toJs((turb.match(/float c0 = [^;]*;/) || [''])[0]), toJs((turb.match(/float t0 = [^;]*;/) || [''])[0]), toJs((turb.match(/float w0 = [^;]*;/) || [''])[0])].join('\n');
  let run = null;
  try { run = new Function('uTime', 'uCycle', `let T, c0, c1, t0, t1, w0, w1;\n${timeSrc}\nreturn { c0, c1, t0, t1, w0, w1 };`); } catch (e) { run = null; }
  let off = 0;
  if (run) {
    for (const [a, q] of [[0.94, 0], [0, 0]]) {
      const T = F.flowCycle(a, q);
      for (let k = 0; k < 3000; k++) {
        const t = k * T / 397 + 0.37, js = F.flowPhases(t, T), g = run(t, T);
        if (Math.abs(g.t0 - js[0].tau) > 1e-6 || Math.abs(g.t1 - js[1].tau) > 1e-6 || Math.abs(g.w0 - js[0].w) > 1e-9 || Math.abs(g.w1 - js[1].w) > 1e-9) off++;
        if (((g.c0 * 2) % F.FLOW.seeds) !== js[0].seed || ((g.c1 * 2 + 1) % F.FLOW.seeds) !== js[1].seed) off++;
      }
    }
  }
  ok('the shader\'s time lines, run, give flowPhases\'s times and weights at 6000 times', !!run && off === 0, run ? `${off} off` : 'could not read the lines');
  const v0 = glslLine('v0'), v1 = glslLine('v1');
  ok('copy 0 is drawn at t0 from seed c0*2, copy 1 at t1 from seed c1*2 + 1, over the 256 seeds',
    /diskPattern\(phiW - Om\*t0, lr, mod\(c0\*2\.0, 256\.0\)\)/.test(v0) && /diskPattern\(phiW - Om\*t1, lr, mod\(c1\*2\.0 \+ 1\.0, 256\.0\)\)/.test(v1), `${v0} | ${v1}`);
  const ret = (turb.match(/return max\(0\.05, [^;]*;/) || [''])[0];
  const mean = (turb.match(/float m = ([\d.]+);/) || [])[1];
  let blendOff = -1;
  try {
    const js = new Function('v0', 'v1', 'w0', 'w1', 'm', 'inversesqrt', `return ${ret.replace(/^return /, '').replace(/max\(/, 'Math.max(').replace(/;$/, '')}`);
    blendOff = 0;
    for (const [a0, a1, w] of [[0.3, 1.2, 0.5], [0.9, 0.5, 0.2], [0.6, 0.7, 0.9], [1.4, 0.4, 0.33]]) {
      const g = js(a0, a1, w, 1 - w, +mean, (x) => 1 / Math.sqrt(x));
      if (Math.abs(g - F.flowBlend(a0, a1, w, 1 - w)) > 1e-4) blendOff++;
    }
  } catch { blendOff = -1; }
  ok('the shader\'s blend, run, gives flowBlend around the mean 0.778', blendOff === 0 && +mean === F.FLOW.patternMean, `${blendOff} off, mean ${mean}`);
}

// 6. the pattern's mean and spread through a cycle: a port of the shader's noise, pinned to its source text, sampled
//    over the disk (the blend kept them: a field blended around 0.5 clamped and brightened the disk twice a cycle)
const NOISE_SRC = [
  'float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y)*p.z); }',
  'float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }',
  'vec3 p = vec3(cos(ang)*5.5, sin(ang)*5.5, lr*16.0) + vec3(seed*13.7, seed*7.9, 0.0);',
  'float body = fbm(p*vec3(1.0, 1.0, 0.5));',
  'float ridge = 1.0 - abs(2.0*fbm(p*vec3(1.7, 1.7, 1.3) + 4.0) - 1.0);',
  'float lanes = 0.5 + 0.5*sin(lr*42.0 + 3.0*body);',
  'return 0.30 + 1.05*body*body*2.0*(0.55 + 0.75*ridge*ridge) * (0.75 + 0.35*lanes);',
];
const missing = NOISE_SRC.filter((l) => !shade.includes(l));
ok('the port below is the shader\'s noise and pattern line for line', missing.length === 0, missing.join(' | '));
const vnoiseSrc = (shade.match(/float vnoise\(vec3 x\)\{[\s\S]*?\n\}/) || [''])[0];
ok('the shader\'s value noise is the smoothstep trilinear one the port follows', /f = f\*f\*\(3\.0 - 2\.0\*f\)/.test(vnoiseSrc) || /smoothstep/.test(vnoiseSrc), vnoiseSrc.slice(0, 120));
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
  const pattern = (ang, lr, seed) => {
    const px = Math.cos(ang) * 5.5 + seed * 13.7, py = Math.sin(ang) * 5.5 + seed * 7.9, pz = lr * 16;
    const body = fbm(px, py, pz * 0.5), ridge = 1 - Math.abs(2 * fbm(px * 1.7 + 4, py * 1.7 + 4, pz * 1.3 + 4) - 1);
    const lanes = 0.5 + 0.5 * Math.sin(lr * 42 + 3 * body);
    return 0.30 + 1.05 * body * body * 2 * (0.55 + 0.75 * ridge * ridge) * (0.75 + 0.35 * lanes);
  };
  let sd = 4242; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const a = 0.94, T = F.flowCycle(a, 0), ri = K.isco(a, 1, 0);
  const pts = Array.from({ length: 1500 }, () => [Math.sqrt(ri * ri + rnd() * (400 - ri * ri)), rnd() * 2 * Math.PI]);
  const stat = (v) => { const m = v.reduce((x, y) => x + y, 0) / v.length; return [m, Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / v.length)]; };
  const single = stat(pts.flatMap(([r, p], i) => [0, 1, 2, 3].map((j) => pattern(p, Math.log(r), (i * 4 + j) % 256))));
  ok(`one copy's mean over the disk is the constant the copies are blended around: ${single[0].toFixed(4)} against ${F.FLOW.patternMean}`, Math.abs(single[0] - F.FLOW.patternMean) < 0.01);
  // the two copies' correlation at one point (seeds apart, angles half a cycle apart), against the constant
  const xs = [], ys = [];
  for (let i = 0; i < 12000; i++) {
    const r = Math.sqrt(ri * ri + rnd() * (400 - ri * ri)), p = rnd() * 2 * Math.PI, lr = Math.log(r), Om = K.circular(a, r, 0).Omega;
    const c = Math.floor(rnd() * 120), tau = rnd() * T;
    xs.push(pattern(p - Om * tau, lr, (2 * c) % 256)); ys.push(pattern(p - Om * ((tau + T / 2) % T), lr, (2 * c + 1) % 256));
  }
  const [mx, sx] = stat(xs), [my, sy] = stat(ys);
  const rho = xs.reduce((q, v, i) => q + (v - mx) * (ys[i] - my), 0) / xs.length / (sx * sy);
  ok(`the two copies correlate at ${rho.toFixed(3)}, the constant the blend allows for (0.07) within 0.03`, Math.abs(rho - F.FLOW.copyCorrelation) < 0.03);
  // breathing is a swing tied to the cycle's phase: at each phase, the disk's mean and spread averaged over 16 cycles (a
  // fresh seed's content wanders from cycle to cycle, as any finite sample of features does; the average removes it)
  const means = [], sds = [];
  for (let k = 0; k <= 8; k++) {
    let mSum = 0, sSum = 0;
    for (let c = 0; c < 16; c++) {
      const t = (10 + c) * T + k * T / 16;
      const ph = F.flowPhases(t, T);
      const [m, s] = stat(pts.map(([r, p]) => {
        const Om = K.circular(a, r, 0).Omega, lr = Math.log(r);
        return F.flowBlend(pattern(p - Om * ph[0].tau, lr, ph[0].seed), pattern(p - Om * ph[1].tau, lr, ph[1].seed), ph[0].w, ph[1].w);
      }));
      mSum += m; sSum += s;
    }
    means.push(mSum / 16); sds.push(sSum / 16);
  }
  const spread = (v) => (Math.max(...v) - Math.min(...v)) / (v.reduce((x, y) => x + y, 0) / v.length);
  ok('through half a cycle, averaged over 16 cycles, the blended disk keeps its mean within 1% and its spread within 2.5%: no breathing', spread(means) < 0.01 && spread(sds) < 0.025,
    `mean ${(100 * spread(means)).toFixed(2)}%, spread ${(100 * spread(sds)).toFixed(2)}%`);
}

// 7. the renderer binds the cycle: the uniform from the frame's geometry, the geometry's cycle from flowCycle
{
  const src = readFileSync(fileURLToPath(new URL('./renderer.js', import.meta.url)), 'utf8');
  ok('the renderer binds uCycle from the geometry, and the geometry\'s cycle is flowCycle(a, q)', /\['uCycle', '1f', \(f\) => f\.cycle\],/.test(src) && /cycle: flowCycle\(a, q\)/.test(src));
  ok('the shader declares uCycle and the ignition fades in place', /uniform float uCycle/.test(shade) && /float ign = smoothstep\(0\.0, 1\.0, uIgnite\);/.test(shade));
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
