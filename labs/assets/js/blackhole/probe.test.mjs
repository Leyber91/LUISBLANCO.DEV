/* ============================================================
   blackhole/probe.test.mjs — the ray probe against the renderer,
   at charge Q/M = 0.9.
   Run:  node labs/assets/js/blackhole/probe.test.mjs
   Exit 0 when every check passes. No dependencies.

   The page's probe (ui.js probeAt) traces Store.view() through
   probe.probeRay(); the renderer builds its shader uniforms from
   the same Store.view() in Renderer.buildGeometry() and maps
   texels with Renderer._screenMap(). Both run here without a GPU:
   the geometry and the pixel map are the renderer's own code, and
   the shader's ray is reproduced by kerr.traceRay with exactly the
   uniforms the shader receives (a, q, camera, r+, ISCO, escape
   radius, the mid tier's step factor and step cap). The first
   version dropped q in the probe: at Q/M = 0.9 it called rays
   "ends in the hole" that the renderer showed escaping.
   ============================================================ */

import * as K from './kerr.js';
import { Store } from './state.js';
import { TIERS } from './config.js';
import { probeRay, screenToTangent, tangentToScreen } from './probe.js';
import { Renderer } from './renderer.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

const W = 1440, H = 900;                                   // the desktop screenshot size
const tier = TIERS.mid;
const fakeRenderer = (geo) => ({ canvas: { clientWidth: W, clientHeight: H }, geo });

function compare(label, patch) {
  const store = new Store();
  store.set({ obj: 'custom', a: 0.3, q: 0.9, ...patch }, { instant: true });
  const view = store.view();
  ok(`${label}: Store.view() carries Q/M = 0.9 (the old viewNow() set q: 0)`, view.q === 0.9, `q = ${view.q}`);

  // the renderer's uniforms and texel map, from its own code
  const geo = Renderer.prototype.buildGeometry.call(fakeRenderer(null), view);
  const map = Renderer.prototype._screenMap.call(fakeRenderer(geo), { w: W, h: H });
  const shaderRay = (i, j) => {
    const sx = map.origin[0] + (i + 0.5) * map.stepX[0], sy = map.origin[1] + (j + 0.5) * map.stepY[1];
    const res = K.traceRay(geo.a, geo.cam.raw, sx, sy, 1, { q: geo.q, k: tier.k, maxSteps: tier.maxSteps, disk: geo.emit === 1, rIn: geo.rin, rOut: geo.rout, rEscape: geo.resc });
    return { sx, sy, fate: res.fate };
  };

  // same parameters: charge, horizon, ISCO, camera frame
  const pr0 = probeRay(view, 0, 0);
  ok(`${label}: probe and renderer use the same charge, horizon and ISCO`,
    pr0.q === geo.q && pr0.rIn === geo.rin && K.horizon(view.a, pr0.q) === geo.rh, `q ${pr0.q}/${geo.q}, ISCO ${pr0.rIn.toFixed(4)}/${geo.rin.toFixed(4)}, r+ ${geo.rh.toFixed(4)}`);

  // grid over the centre of the screen: same pixel -> same direction -> same fate
  let n = 0, agree = 0, mapErr = 0, band = 0, bandOk = 0;
  const oldView = { ...view, q: 0 };                        // what the first version traced
  for (let py = H * 0.2; py < H * 0.8; py += 12) {
    for (let px = W * 0.2; px < W * 0.8; px += 12) {
      const i = Math.floor(px), jCss = Math.floor(py), j = H - 1 - jCss;    // GL rows count up
      const sh = shaderRay(i, j);
      const { sx, sy } = screenToTangent(i + 0.5, jCss + 0.5, W, H, view.fov);
      mapErr = Math.max(mapErr, Math.abs(sx - sh.sx), Math.abs(sy - sh.sy));
      const pr = probeRay(view, sx, sy);
      n++; if (pr.fate === sh.fate) agree++;
      // the band the bug lived in: captured without the charge, not captured with it
      const old = probeRay(oldView, sx, sy).fate;
      if (old === 'captured' && sh.fate !== 'captured') { band++; if (pr.fate === sh.fate) bandOk++; }
    }
  }
  ok(`${label}: probe pixel map = renderer texel map`, mapErr < 1e-12, `max diff ${mapErr.toExponential(1)}`);
  ok(`${label}: probe fate = renderer fate on ${n} pixels`, agree === n, `${agree} / ${n} agree`);
  // band > 20 proves the grid crosses the region the bug lived in, so the test can fail
  ok(`${label}: ${band} pixels a q-dropping probe calls "ends in the hole" escape in the renderer; the probe agrees with the renderer on all`,
    band > 20 && bandOk === band, `${bandOk} / ${band}`);
}

compare('cinematic view, Q/M 0.9, a 0.3', {});
compare('telescope view, Q/M 0.9, a 0.3', { view: 'telescope', rcam: 1000, fov: 1.15, incl: 17, emit: 'thin' });


/* a place on the image plane is the same ray at any window size (review_s3b E): the inverse mapping round-trips, and
   the place a pixel names on one window opens the same direction on another */
{
  let worst = 0, n = 0;
  for (const [W, H] of [[1440, 900], [390, 844], [844, 390], [1280, 720]]) for (const fov of [1.15, 31, 70]) for (const [fx, fy] of [[0.1, 0.6], [0.5, 0.5], [0.93, 0.07]]) {
    const { sx, sy } = screenToTangent(fx * W, fy * H, W, H, fov);
    const { px, py } = tangentToScreen(sx, sy, W, H, fov);
    worst = Math.max(worst, Math.abs(px - fx * W), Math.abs(py - fy * H)); n++;
    // the same place on a phone's window gives back the same place
    const back = tangentToScreen(sx, sy, 390, 844, fov), again = screenToTangent(back.px, back.py, 390, 844, fov);
    worst = Math.max(worst, Math.abs(again.sx - sx) * 1e6, Math.abs(again.sy - sy) * 1e6);
  }
  ok(`tangentToScreen inverts screenToTangent on ${n} places and four windows, and a place opens the same ray on a phone`, worst < 1e-6, `worst ${worst}`);
}
console.log(fails ? `\n${fails} of ${checks} probe check(s) failed` : `\nall ${checks} probe checks passed`);
process.exit(fails ? 1 : 0);
