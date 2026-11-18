/* ============================================================
   blackhole/flow.test.mjs — the disk's motion (flow.js): two copies
   of the pattern carried along the orbits and crossfaded, so the
   shear stays bounded, and the page's clock stated for each hole.
   Run:  node labs/assets/js/blackhole/flow.test.mjs
   ============================================================ */

import * as K from './kerr.js';
import * as F from './flow.js';
import { derive, dur } from './physics.js';
import { Store } from './state.js';
import { OBJECTS } from './config.js';
import * as S from './shaders.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

// 1. the two copies: weights in [0, 1] summing to one; a copy at its reset weighs nothing, so no reset is seen; a copy
//    is carried for under one cycle; a fresh seed after every reset
for (const [a, q] of [[0, 0], [0.94, 0], [0.998, 0], [0.5, 0.5]]) {
  const T = F.flowCycle(a, q);
  let bad = 0, worstAtReset = 0, maxTau = 0, sameSeed = 0;
  let prev = F.flowPhases(0, T);
  for (let k = 1; k <= 4000; k++) {
    const t = k * T / 400;                           // ten cycles, 400 steps a cycle
    const ph = F.flowPhases(t, T);
    const sum = ph[0].w + ph[1].w;
    if (Math.abs(sum - 1) > 1e-12 || ph.some((p) => p.w < -1e-12 || p.w > 1 + 1e-12)) bad++;
    for (let i = 0; i < 2; i++) {
      maxTau = Math.max(maxTau, ph[i].tau);
      if (ph[i].tau < prev[i].tau) {                  // this copy was reset between the two steps
        worstAtReset = Math.max(worstAtReset, prev[i].w, ph[i].w);
        if (ph[i].seed === prev[i].seed) sameSeed++;
      }
    }
    prev = ph;
  }
  ok(`a ${a}, Q/M ${q}: the weights stay in [0, 1] and sum to one`, bad === 0, `${bad} bad steps`);
  ok(`a ${a}, Q/M ${q}: a copy weighs under 1% at the step of its reset, so the reset is not seen`, worstAtReset < 0.01, `worst ${worstAtReset.toFixed(4)}`);
  ok(`a ${a}, Q/M ${q}: a copy is carried for under one cycle`, maxTau < T + 1e-9, `${maxTau.toFixed(2)} of ${T.toFixed(2)} M`);
  ok(`a ${a}, Q/M ${q}: every reset starts from a new seed`, sameSeed === 0, `${sameSeed} repeated`);
}

// 2. the shear a copy carries: never more than the cycle's, a turn and a half between the ISCO and twice its radius
//    (the pattern carried for ever, as before, wound without limit: after a minute of display the inner disk was rings
//    finer than the pixels)
for (const [a, q] of [[0, 0], [0.94, 0], [0.998, 0]]) {
  const T = F.flowCycle(a, q), ri = K.isco(a, 1, q);
  const shear = (tau) => tau * (K.circular(a, ri, q).Omega - K.circular(a, 2 * ri, q).Omega) / (2 * Math.PI);
  const worst = shear(T);
  ok(`a ${a}: a copy is sheared by at most ${worst.toFixed(2)} turns between the ISCO and twice its radius, under 1.5`, worst < 1.5, `cycle ${T.toFixed(1)} M`);
  const visit = shear(300 * F.FLOW.mPerSecond);
  ok(`a ${a}: one pattern carried through five minutes of display would be sheared ${visit.toFixed(1)} turns, which the cycle prevents`, visit > 4 * worst);
}

// 3. the clock's sentence, for each named hole and a custom one: its numbers are derive()'s and the clock's
for (const id of ['m87', 'sgra', 'cygx1', 'custom']) {
  const st = new Store();
  st.set({ obj: id, ...(id === 'custom' ? { a: 0.5 } : {}) }, { instant: true });
  const m = derive(st.all());
  const name = OBJECTS.find((o) => o.id === id)?.name || null;
  const line = F.clockLine(m, name);
  const per = dur(F.FLOW.mPerSecond * m.tg), there = dur(m.iscoPeriod), here = (F.iscoOrbitM(m.a, m.q) / F.FLOW.mPerSecond).toFixed(1);
  ok(`${id}: the clock's sentence names a second here in the hole's time (${per}), and an orbit at the ISCO here (${here} s) and there (${there})`,
    line.includes(`a second here is ${per} of`) && line.includes(`takes ${here} s here and ${there} there`), line);
  // here times the clock's seconds-per-second is there
  const consistent = Math.abs((F.iscoOrbitM(m.a, m.q) / F.FLOW.mPerSecond) * F.FLOW.mPerSecond * m.tg - m.iscoPeriod) / m.iscoPeriod < 1e-9;
  ok(`${id}: an orbit here times a second's worth there is the orbit's real period`, consistent);
}

// 4. the shader mirrors flow.js: two copies with the same weights and the cycle as a uniform, and an ignition that
//    fades the disk in place (it lit from the ISCO outward, and read as the disk expanding)
const shade = S.shadeProgram();
ok('the shader carries two copies over the cycle uCycle, weighted as flowPhases weighs them', /uniform float uCycle/.test(shade) && /1\.0 - abs\(2\.0\*t0\/T - 1\.0\)/.test(shade) && /floor\(uTime\/T \+ 0\.5\)/.test(shade), 'searched the shade program');
ok('the shader blends the two copies keeping the pattern\'s contrast', /inversesqrt\(w0\*w0 \+ w1\*w1\)/.test(shade));
const ign = (shade.match(/float ign = [^;]*;/) || [''])[0];
ok('the ignition fades the disk in place: it no longer depends on radius', !!ign && !/\br\b|uRin|uRout/.test(ign), ign);

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
