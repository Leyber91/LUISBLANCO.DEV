/* Black Hole: two reference checks and one lab-state check.
   bh-bcrit replays the shader's own ray integrator in JS, with every
   constant read from the deployed shader source, and finds the impact
   parameter below which rays are captured. */
import { REFERENCES } from '../../config.js';

const SRC = 'labs/assets/js/blackhole/blackhole.js';
const num = (text, rx, name) => {
  const m = text.match(rx);
  if (!m) throw new Error(`could not read ${name} from the shader`);
  return m.slice(1).map(Number);
};
const within = (x, ref, tol) => Math.abs(x - ref) / ref <= tol;
const pct = (x, ref) => `${((100 * (x - ref)) / ref).toFixed(1)}%`;

/* The shader's loop at a = 0, for one ray starting at the camera with
   angular momentum h = |p x v| (v is a unit vector). Returns 'captured',
   'escaped' or 'exhausted' (ran out of steps: drawn dark). */
function trace(h, K) {
  const D = K.cam;
  let px = -D, py = 0, pz = 0;
  const s = h / D; // sin of the angle off the line to the centre
  let vx = Math.sqrt(1 - s * s), vy = s, vz = 0;
  for (let i = 0; i < K.steps; i++) {
    const r = Math.hypot(px, py, pz);
    if (r < 1) return 'captured';                               // capR = uHorizon at a = 0
    if (r > K.escape && px * vx + py * vy + pz * vz > 0) return 'escaped';
    const dt = Math.min(Math.max(K.dtk * r, K.dtmin), K.dtmax);
    const hx = py * vz - pz * vy, hy = pz * vx - px * vz, hz = px * vy - py * vx;
    const h2 = hx * hx + hy * hy + hz * hz;
    const r2 = px * px + py * py + pz * pz;
    const k = -K.bend * h2 / Math.pow(r2, 2.5);
    vx += k * px * dt; vy += k * py * dt; vz += k * pz * dt;
    const n = Math.hypot(vx, vy, vz); vx /= n; vy /= n; vz /= n;
    px += vx * dt; py += vy * dt; pz += vz * dt;
  }
  return 'exhausted';
}

export const PROBES = {
  'bh-bcrit': {
    what: 'replaying the shader integrator with its own constants: where does a ray stop escaping?',
    fails: `fails if the shadow edge sits more than ${REFERENCES.bcrit.tol * 100}% from 3*sqrt(3)/2 r_s`,
    async run(ctx) {
      const { text, commit } = await ctx.file(SRC);
      const [steps] = num(text, /#define STEPS (\d+)/, 'STEPS');
      const [dtk, dtmin, dtmax] = num(text, /float dt = clamp\(([\d.]+)\*r, ([\d.]+), ([\d.]+)\);/, 'the step rule');
      const [bend] = num(text, /return -([\d.]+) \* h2 \* p \/ pow\(r2, 2\.5\);/, 'the bending law');
      const [escape] = num(text, /if\(r > ([\d.]+) && dot\(v,p\) > 0\.0\)/, 'the escape radius');
      const [cam] = num(text, /camDist: ([\d.]+),/, 'the camera distance');
      const K = { steps, dtk, dtmin, dtmax, bend, escape, cam };
      let lo = 1.5, hi = 4.0; // captured at lo, escaped at hi
      if (trace(lo, K) === 'escaped' || trace(hi, K) !== 'escaped') return { status: 'fail', detail: 'the integrator does not separate captured from escaped rays' };
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (trace(mid, K) === 'escaped') hi = mid; else lo = mid; }
      const b = hi, ref = REFERENCES.bcrit;
      const verdict = within(b, ref.value, ref.tol) ? 'supported' : within(b, ref.value, 3 * ref.tol) ? 'partial' : 'unsupported';
      return {
        status: 'pass', verdict, value: b, expected: ref.value, commit, file: SRC,
        detail: `shadow edge at b = ${b.toFixed(3)} r_s with the shader's ${steps} steps and bending ${bend}; ${ref.what} = ${ref.value.toFixed(3)} r_s (${ref.cite}); off by ${pct(b, ref.value)}`,
      };
    },
  },
  'bh-beta': {
    what: 'reading the disk speed formula from the shader and evaluating it at the ISCO',
    fails: `fails if the code is gone; partial beyond ${REFERENCES.betaIsco.tol * 100}% from c/2`,
    async run(ctx) {
      const { text, commit } = await ctx.file(SRC);
      const [c1, c2] = num(text, /float beta = clamp\(sqrt\(([\d.]+) \/ max\(r - ([\d.]+), [\d.]+\)\)/, 'the disk speed');
      const beta = Math.sqrt(c1 / (3 - c2)), ref = REFERENCES.betaIsco;
      const verdict = within(beta, ref.value, ref.tol) ? 'supported' : within(beta, ref.value, 4 * ref.tol) ? 'partial' : 'unsupported';
      return {
        status: 'pass', verdict, value: beta, expected: ref.value, commit, file: SRC,
        detail: `beta(3 r_s) = sqrt(${c1}/(3 - ${c2})) = ${beta.toFixed(3)}c; ${ref.what} = ${ref.value}c (${ref.cite}); off by ${pct(beta, ref.value)}, and the Doppler factor has no Lorentz gamma`,
      };
    },
  },
  'bh-isco': {
    heavy: true,
    what: 'loading the lab (?still) in a hidden frame and reading its ISCO readout',
    fails: `fails if the readout is gone or the ISCO is more than ${REFERENCES.isco0.tol * 100}% from 3 r_s`,
    async run(ctx) {
      const f = await ctx.frame('bh_animation_page.html?still', { ready: (a) => /ISCO/.test(a.text('.bh-readout')) || a.$('.bh-nowebgl'), w: 640, h: 420 });
      if (f.$('.bh-nowebgl')) return { status: 'error', detail: 'this browser gave the lab no WebGL context' };
      const read = f.text('.bh-readout');
      const title = f.text('.bh-title');
      const m = read.match(/ISCO\s*([\d.]+)/);
      if (!m) return { status: 'fail', detail: `no ISCO in the readout: "${read.slice(0, 80)}"` };
      const v = Number(m[1]), ref = REFERENCES.isco0;
      const ok = Math.abs(v - ref.value) / ref.value <= ref.tol && /schwarzschild/i.test(title);
      return {
        status: 'pass', verdict: ok ? 'supported' : 'partial', value: v, expected: ref.value,
        detail: `the running lab reads "${title}", ISCO ${v.toFixed(2)} r_s; ${ref.what} = ${ref.value} r_s (${ref.cite})`,
      };
    },
  },
};
