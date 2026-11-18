/* ============================================================
   heptapod/tests/chamber.test.mjs — the chamber's one light, its
   things and its being (BAR_C slices C1 to C3), checked against
   what pod/light.js, pod/things.js and pod/body.js claim.

     node labs/assets/js/heptapod/tests/chamber.test.mjs

   The rendered page is probed by tools/drives/heptapod.mjs (pixels
   of the canvas); this file checks the computation behind it, on a
   desktop room (1056 x 838 device pixels, the chamber at 1440 px)
   and a phone room (780 x 978, the chamber at 390 px, two pixels a
   point).

   C1, one light, one air
   1. The law: beyond the fog, lightAt times the squared distance is
      constant along a ray from its centre (inverse square), and on a
      face turned theta from the fog (cos theta above the fog's sine)
      it is the cosine law; wrapSphere is continuous with its slope at
      +-sin(alpha) and zero below.
   2. On the rendered layer, the table's light falls off with distance
      from the fog: a fit of log(direct light) on log(distance) over the
      table's cells has a slope under -1 and an R^2 over 0.9 (a fit, not
      a constant); the being's floor likewise.
   3. Nothing lit is brighter than the disc's edge: respond never
      exceeds CAP, and CAP in the light's colour, encoded, is darker
      than the fog where the disc is whole (fogAt(DISC_WHOLE), the
      gradient as the canvas lays it, independent of CAP).
   4. The air: airlight falls with distance from the disc, and a ray
      that ends sooner collects less of it; haze falls with depth.
   5. Shadows: a point inside an occluder sees none of the fog; beside
      a thing on the table, the point on the side away from the fog is
      darker than its mirror on the side toward it; just in front of
      it the polish loses the fog's reflection (the thing's dark
      reflection), and away from it keeps all of it.
   6. The sRGB table is within one level of the exact encoding.
   C3, the things
   7. Each of the six, at rest on the table either side of the
      disc, is brighter where its surface faces the fog than where
      it faces away (in light received and in the
      luma of the pixels written; inside the bowl the wall that faces
      the fog is the far one, as in any vessel).
   8. Each receives less light on the far plate than on the near one,
      and the six at rest fit a falloff with distance (slope under 0).
   9. A held thing enters the disc's light: placeOf brings it nearer
      the fog, and it receives more light held than resting.
   10. No pixel of any thing, wherever it is put (the brightest place,
      held under the disc at the glass), nor of the being, is brighter
      than the fog where the disc is whole.
   C2, the being
   11. Rule 7 on 400 anatomies and the three of the page, with a
      control that must fail (a body on seven legs splayed from one
      height to the floor, built in the same parts): never seven
      limbs (its fronds), the fronds' roots spread up the stalk (a
      standard deviation over 0.1 of its height), no frond reaches
      within 0.15 of its height of the floor, and its silhouette is not radial (turned by
      any share of a turn from a third to a ninth, it overlaps itself
      by less than 0.7).
   12. The three species differ: 1 - IoU of their silhouettes is over
      0.2 for each pair.
   13. It is lit at its edge facing the disc: the half facing the
      disc receives more than three times the light of the other half,
      and the fog lights less than a third of its area.
   14. It breathes when time runs and is the same at the same time
      (the scene passes time 0 with motion reduced, so it is still).
   15. It attends: its head's point moves toward what it attends to.
   16. It fits: fitBody keeps every pose it can take inside the region
      given, on the desktop and the phone rooms; and chamberLayout (the
      page's layout) leaves it at least a quarter of the canvas tall,
      inside the canvas, at every width from 1024 to 1920 px with the
      page's caption over the room (the review of 2026-11-18 found it
      6 px tall at 1024).
   17. The same seed grows the same being.
   Exits 1 on any failure, and on a run that checked nothing.
   ============================================================ */

import { LIGHT, FOG_STOPS, CAP, DISC_WHOLE, fogAt, makeRoom, lightAt, wrapSphere, respond, airlight, haze, visibility, mirrorVisibility, paintRoom, tableZ, toSRGB, srgbExact } from '../pod/light.js';
import { chamberLayout } from '../pod/scene.js';
import { gbuffer, relight, occluders, placeOf, SHAPES } from '../pod/things.js';
import { growBody, poseBody, reachOf, fitBody, rasterBody, shadeBody, bodyOccluders, silhouette, iou, radialSelfSimilarity, rule7, LIMB_COUNTS } from '../pod/body.js';
import { GATE_SPECIES } from '../pod/species.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => { checks++; if (!cond) { failures++; console.log('FAIL ' + what + (detail ? ' :: ' + detail : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* The two rooms, laid out as scene.js lays them (portrait: the disc left of the middle). */
function roomFor(W, H) {
  const portrait = H > W * 1.05;
  const Rd = Math.round(portrait ? Math.min(0.31 * W, 0.25 * H) : Math.min(0.26 * H, 0.3 * W));
  const disc = { cx: Math.round(portrait ? W / 2 - 0.15 * W : W / 2), cy: Math.round(0.045 * H + Rd), Rd };
  const glassB = Math.round(disc.cy + Rd + 0.03 * H);
  const horizon = Math.round(glassB - 0.075 * H), foot = Math.round(glassB - 0.032 * H);
  const u = Math.min(H * 0.125, W * 0.1);
  const nearRow = Math.max(0.735 * H, glassB + 0.11 * H) + 0.02 * H * 0.15, farRow = 0.915 * H + 0.046 * H * 0.15;
  return { R: makeRoom({ W, H, glassB, horizon, foot, disc }), W, H, disc, glassB, foot, u, nearRow, farRow };
}
const DESK = roomFor(1056, 838), PHONE = roomFor(780, 978);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// the disc's edge: the fog where the disc is still whole, as the canvas lays the gradient (computed from the stops
// here, apart from light.js's CAP and EDGE_LUMA)
const edge = (() => {
  const st = FOG_STOPS.map(([f, h]) => [f, [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))]);
  const k = st.findIndex(([f]) => f >= DISC_WHOLE), [a, ca] = st[k - 1], [b, cb] = st[k], t = (DISC_WHOLE - a) / (b - a);
  return lum(...ca.map((x, i) => Math.round(x + (cb[i] - x) * t)));
})();

/* ---------------- C1 ---------------- */
{
  const { R } = DESK;
  // 1. inverse square and cosine
  const dir = [0.3, -0.5, -0.81], dl = Math.hypot(...dir), u = dir.map((v) => v / dl);
  const facing = u.map((v) => -v);
  const prod = [1.5, 2, 3, 5].map((m) => { const d = m * R.Rs; return lightAt(R, R.S.map((v, i) => v + u[i] * d), facing) * d * d; });
  ok(prod.every((p) => near(p, prod[0], 1e-6 * prod[0])), '1 inverse square: lightAt * d^2 is constant along a ray', prod.map((p) => p.toFixed(1)).join(' '));
  const P = R.S.map((v, i) => v + u[i] * 4 * R.Rs);
  const s = R.Rs / (4 * R.Rs);
  for (const th of [0, 0.4, 0.9, Math.acos(s) - 0.01]) {
    // a normal turned th away from the fog, about an axis across the ray
    const ax = [u[1], -u[0], 0], al = Math.hypot(...ax), a = ax.map((v) => v / al);
    const n = facing.map((f, i) => f * Math.cos(th) + a[i] * Math.sin(th));
    ok(near(lightAt(R, P, n), s * s * Math.cos(th), 1e-9), `1 cosine law at ${th.toFixed(2)} rad`);
  }
  ok(near(wrapSphere(s, s), s, 1e-12) && near(wrapSphere(-s, s), 0, 1e-12) && wrapSphere(-s - 0.1, s) === 0, '1 wrapSphere meets the cosine at sin(alpha) and zero at -sin(alpha)');
  const slope = (wrapSphere(s - 1e-6, s) - wrapSphere(s - 2e-6, s)) / 1e-6;
  ok(near(slope, 1, 1e-3), '1 wrapSphere has the cosine\'s slope at sin(alpha)', slope.toFixed(4));
}
{
  // 2. the table's and the floor's light, on the rendered layer
  for (const [name, Rm] of [['desktop', DESK], ['phone', PHONE]]) {
    const { R } = Rm;
    const room = paintRoom(R, 6);
    const xs = [], ys = [], fx = [], fy = [];
    for (let j = 0; j < room.ch; j++) {
      const v = (j + 0.5) * 6;
      for (let i = 0; i < room.cw; i += 2) {
        const x = (i + 0.5) * 6;
        if (v > R.glassB + 2) {
          const P = [x, 0, tableZ(R, v)], d = Math.hypot(P[0] - R.S[0], P[1] - R.S[1], P[2] - R.S[2]);
          const lin = (room.rgb[3 * (j * room.cw + i) + 2]) * room.direct[j * room.cw + i];
          if (lin > 0) { xs.push(Math.log(d)); ys.push(Math.log(lin)); }
        } else if (v > R.horizon + 4 && v < R.glassB - 2) {
          const c = 3 * (j * room.cw + i) + 2;
          fx.push(Math.log(Math.abs(x - R.S[0]) + 1)); fy.push(room.rgb[c]);
        }
      }
    }
    const fit = (X, Y) => {
      const n = X.length, mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (let k = 0; k < n; k++) { sxy += (X[k] - mx) * (Y[k] - my); sxx += (X[k] - mx) ** 2; syy += (Y[k] - my) ** 2; }
      return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), n };
    };
    const t = fit(xs, ys);
    ok(t.n > 100 && t.slope < -1 && t.r2 > 0.9, `2 ${name}: the table's direct light falls off with distance from the fog (log-log fit)`, JSON.stringify(t));
    const f = fit(fx, fy);
    ok(f.slope < 0, `2 ${name}: the being's floor is darker away from under the fog`, JSON.stringify(f));
  }
}
{
  // 3. nothing lit is brighter than the disc's edge
  let mono = true, prev = -1;
  for (let x = 0; x < 50; x += 0.01) { const y = respond(x); if (y < prev || y > CAP) mono = false; prev = y; }
  ok(mono, '3 respond rises and never passes CAP');
  const capL = lum(...LIGHT.RGB.map((c) => toSRGB(c * CAP)));
  ok(capL < edge, '3 CAP in the light\'s colour is darker than the fog where the disc is whole', `${capL.toFixed(1)} < ${edge.toFixed(1)}`);
  ok(Math.abs(lum(...fogAt(DISC_WHOLE)) - edge) < 0.5, '3 light.js lays the fog\'s gradient as this test does', `${lum(...fogAt(DISC_WHOLE)).toFixed(1)} and ${edge.toFixed(1)}`);
}
{
  // 4. the air
  const { R } = DESK;
  const a = [1, 1.3, 2, 3, 5].map((m) => airlight(R, m * R.Rs, R.eyeZ, Infinity));
  ok(a.every((v, i) => i === 0 || v < a[i - 1]), '4 airlight falls with distance from the disc', a.map((v) => v.toFixed(5)).join(' '));
  ok(airlight(R, 2 * R.Rs, R.eyeZ, R.Zb) < airlight(R, 2 * R.Rs, R.eyeZ, Infinity), '4 a ray that ends on the being collects less air than one that goes on into the dark');
  ok(haze(R, 0) > haze(R, R.Zs) && haze(R, R.Zs) > haze(R, 10 * R.H), '4 haze falls with depth');
}
{
  // 5. shadows
  const { R, nearRow, u } = DESK;
  const x = R.disc.cx + 2.2 * u, P0 = placeOf(R, x, nearRow, nearRow);
  const occ = occluders('cube', P0, u);
  ok(visibility(R, occ[0].c, occ) === 0, '5 a point inside an occluder sees none of the fog');
  // the ground direction from under the fog to the thing, and points beyond its footprint either side
  const gx = P0[0] - R.S[0], gz = P0[2] - R.S[2], gl = Math.hypot(gx, gz), dx = gx / gl, dz = gz / gl;
  const d = 0.75 * u;
  const away = visibility(R, [P0[0] + dx * d, 0, P0[2] + dz * d], occ), toward = visibility(R, [P0[0] - dx * d, 0, P0[2] - dz * d], occ);
  ok(away < toward && away < 0.9, '5 the shadow falls on the side away from the fog', `away ${away.toFixed(3)} toward ${toward.toFixed(3)}`);
  const front = [P0[0], 0, P0[2] - 0.35 * u], aside = [P0[0] + 3 * u, 0, P0[2] - 0.35 * u];
  const mf = mirrorVisibility(R, front, occ), ma = mirrorVisibility(R, aside, occ);
  ok(mf < 0.6 && ma > 0.99, '5 in front of a thing the polish loses the fog\'s reflection, and away from it keeps it', `front ${mf.toFixed(3)}, aside ${ma.toFixed(3)}`);
}
{
  // 6. the sRGB table
  let worst = 0;
  for (let i = 0; i <= 20000; i++) { const x = (i / 20000) ** 2; worst = Math.max(worst, Math.abs(toSRGB(x) - srgbExact(x))); }
  ok(worst <= 1, '6 the sRGB table is within one level of the exact encoding', String(worst));
}

/* ---------------- C3 ---------------- */
const NAMES = Object.keys(SHAPES);
function lit(Rm, name, x, y, ground, scale = Rm.u) {
  const gb = gbuffer(name, 60);
  const out = new Uint8ClampedArray(gb.w * gb.h * 4);
  const m = relight(gb, Rm.R, { x, y }, placeOf(Rm.R, x, y, ground), scale, out);
  let max = 0, sum = 0, n = 0;
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] > 200) { const L = lum(out[i], out[i + 1], out[i + 2]); max = Math.max(max, L); sum += L; n++; }
  return { ...m, mean: m.all, max, lumMean: n ? sum / n : 0, P: placeOf(Rm.R, x, y, ground) };
}
for (const [rname, Rm] of [['desktop', DESK], ['phone', PHONE]]) {
  const { R, nearRow, farRow, u } = Rm;
  const off = 2.4 * u;
  const rest = [];
  for (const name of NAMES) {
    for (const side of [-1, 1]) {
      const x = R.disc.cx + side * off;
      const a = lit(Rm, name, x, nearRow, nearRow), b = lit(Rm, name, x, farRow, farRow, u * 1.19);
      // 7. its lit side faces the disc
      ok(a.near > a.far && a.lumNear > a.lumFar, `7 ${rname}: the ${name} ${side < 0 ? 'left' : 'right'} of the disc is lit where it faces the fog and dark where it faces away`,
        `E ${a.near.toFixed(4)} > ${a.far.toFixed(4)}; luma ${a.lumNear.toFixed(1)} > ${a.lumFar.toFixed(1)} (${a.nNear}, ${a.nFar} px)`);
      // 8. far from the glass it gets less
      ok(b.mean < a.mean, `8 ${rname}: the ${name} gets less light on the far plate than on the near one`, `${b.mean.toFixed(4)} < ${a.mean.toFixed(4)}`);
      if (side > 0) rest.push({ d: Math.hypot(...a.P.map((v, i) => v - R.S[i])), e: a.mean }, { d: Math.hypot(...b.P.map((v, i) => v - R.S[i])), e: b.mean });
      // 9. held up, it enters the disc's light
      const held = lit(Rm, name, x, nearRow - 0.13 * Rm.H, nearRow);
      const dh = Math.hypot(...held.P.map((v, i) => v - R.S[i])), dr = Math.hypot(...a.P.map((v, i) => v - R.S[i]));
      ok(dh < dr && held.mean > a.mean, `9 ${rname}: the ${name} held up is nearer the fog and gets more light`, `d ${dh.toFixed(0)} < ${dr.toFixed(0)}; ${held.mean.toFixed(4)} > ${a.mean.toFixed(4)}`);
    }
    // 10. never brighter than the disc's edge, even held right under the disc at the glass
    const top = lit(Rm, name, R.disc.cx, R.glassB + 0.02 * Rm.H, nearRow);
    ok(top.max < edge, `10 ${rname}: the ${name} at the brightest place is darker than the disc's edge`, `${top.max.toFixed(1)} < ${edge.toFixed(1)}`);
  }
  // 8. the falloff across the things at rest (the same thing near and far, all six)
  const X = rest.map((r) => Math.log(r.d)), Y = rest.map((r) => Math.log(r.e));
  const mx = X.reduce((a, b) => a + b, 0) / X.length, my = Y.reduce((a, b) => a + b, 0) / Y.length;
  let sxy = 0, sxx = 0;
  for (let k = 0; k < X.length; k++) { sxy += (X[k] - mx) * (Y[k] - my); sxx += (X[k] - mx) ** 2; }
  ok(sxy / sxx < 0, `8 ${rname}: across the six things the light falls with distance from the fog`, (sxy / sxx).toFixed(2));
}

/* ---------------- C2 ---------------- */
{
  // 11. rule 7
  const seeds = [...GATE_SPECIES, ...Array.from({ length: 400 }, (_, i) => [[0.25, 0.5, 0.75, 1][i % 4], i + 1])];
  let worst = { limbs: 0, spread: 1, low: 1, radial: 0 };
  let sevens = 0;
  for (const [a, sd] of seeds) {
    const B = growBody(a, sd), r = rule7(B);
    if (r.limbs === 7 || !LIMB_COUNTS.includes(r.limbs)) sevens++;
    worst.spread = Math.min(worst.spread, r.rootSpread);
    worst.low = Math.min(worst.low, r.lowestLimb);
  }
  ok(sevens === 0, '11 rule 7: no being has seven limbs', `${sevens} of ${seeds.length}`);
  // the control: the same parts built as the film's kind of body, seven legs from one height down to the floor
  const legs = { ...growBody(1, 14) };
  legs.fronds = Array.from({ length: 7 }, (_, i) => ({ s: 0.42, phi: (2 * Math.PI * i) / 7, len: 3.2, r0: 0.12, rise: -1.15, curl: 0, blade: 0 }));
  const c7 = rule7(legs);
  ok(c7.limbs === 7 && c7.rootSpread < 0.1 && c7.lowestLimb < 0.15, '11 rule 7: the measures fail a body on seven legs splayed from one height to the floor (the control)', JSON.stringify(c7));
  ok(worst.spread > 0.1, '11 rule 7: the fronds leave the stalk at different heights (no centre they radiate from)', worst.spread.toFixed(3));
  ok(worst.low > 0.15, '11 rule 7: no frond comes within 0.15 of its height of the floor (it stands on its foot, not on limbs)', worst.low.toFixed(3));
  for (const [a, sd] of seeds.slice(0, 23)) {
    const sim = radialSelfSimilarity(silhouette(poseBody(growBody(a, sd), 0)));
    const mx = Math.max(...Object.values(sim));
    worst.radial = Math.max(worst.radial, mx);
    ok(mx < 0.7, `11 rule 7: the silhouette of ${a}/${sd} is not radial`, JSON.stringify(Object.fromEntries(Object.entries(sim).map(([k, v]) => [k, +v.toFixed(2)]))));
  }
}
{
  // 12. the three species differ
  const sil = GATE_SPECIES.map(([a, sd]) => silhouette(poseBody(growBody(a, sd), 0)));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const d = 1 - iou(sil[i], sil[j]);
    ok(d > 0.2, `12 species ${i} and ${j} have different silhouettes`, `1 - IoU = ${d.toFixed(3)}`);
  }
}
{
  // 13. 14. 15. 16. 17. on the page's rooms
  for (const [rname, Rm] of [['desktop', DESK], ['phone', PHONE]]) {
    const { R, W, H, disc, foot } = Rm;
    for (const [a, sd] of GATE_SPECIES) {
      const B = growBody(a, sd), reach = reachOf(B);
      const region = { x0: disc.cx + 1.13 * disc.Rd + 0.02 * W, x1: W - 0.025 * W, top: 0.04 * H, foot };
      const fit = fitBody(reach, region);
      // 16. every pose fits
      let inside = true;
      for (const t of [0, 1.7, 3.1, 4.4]) for (const att of [{ x: 0, y: 1, w: 0 }, { x: -1, y: -1, w: 1 }, { x: 1, y: 0.2, w: 1 }, { x: -1, y: 0.1, w: 1 }]) {
        for (const p of poseBody(B, t, att)) for (const [q, r] of [[p.a, p.ra], [p.b, p.rb]]) {
          const x = fit.at.x + fit.k * q[0], y = fit.at.y - fit.k * q[1];
          if (x - fit.k * r < region.x0 - 1 || x + fit.k * r > region.x1 + 1 || y - fit.k * r < region.top - 1) inside = false;
        }
      }
      ok(inside && fit.box.x1 <= W && fit.box.y0 >= 0, `16 ${rname}: being ${a}/${sd} fits beside the disc in every pose`, JSON.stringify(fit.box));
      // 13. rim-lit
      const prims = poseBody(B, 0, { x: -1, y: -0.4, w: 1 });
      const F = rasterBody(prims, fit.at, fit.k, fit.c, fit.box);
      const m = shadeBody(F, R, fit.at, fit.k, B, new Uint8ClampedArray(F.gw * F.gh * 4));
      ok(m.near > 3 * m.far && m.lit < 1 / 3, `13 ${rname}: being ${a}/${sd} is lit at its edge facing the disc`, `${m.near.toFixed(4)} > 3 x ${m.far.toFixed(4)}; lit share ${m.lit.toFixed(3)}`);
      // 10. and no pixel of it is brighter than the disc where it is whole
      const px = new Uint8ClampedArray(F.gw * F.gh * 4);
      shadeBody(F, R, fit.at, fit.k, B, px, bodyOccluders(B, fit.at, fit.k, R.Zb));
      let bmax = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200) bmax = Math.max(bmax, lum(px[i], px[i + 1], px[i + 2]));
      ok(bmax < edge, `10 ${rname}: no pixel of being ${a}/${sd} is brighter than the disc where it is whole`, `${bmax.toFixed(1)} < ${edge.toFixed(1)}`);
    }
  }
  // 16. the page's layout at a laptop's widths, and a phone's, the caption over the room on the wide ones (its corner as measured at 1440, and a
  // smaller and a larger one)
  for (const [vw, vh] of [[1024, 768], [1024, 900], [1100, 800], [1180, 900], [1280, 800], [1366, 768], [1440, 900], [1920, 1080]]) {
    const W = vw - 384, H = vh - 62;
    for (const cap of [{ x1: 315, y1: 90 }, { x1: 260, y1: 75 }, { x1: 345, y1: 115 }]) for (const [a, sd] of GATE_SPECIES) {
      const reach = reachOf(growBody(a, sd)), lay = chamberLayout(W, H, cap, reach), f = lay.fit, tall = f.k * reach.y1;
      ok(tall >= 0.25 * H && f.box.x0 >= 0 && f.box.x1 <= W && f.box.y0 >= 0 && f.box.x0 >= lay.disc.cx + lay.disc.Rd,
        `16 at ${vw} x ${vh} px (caption to ${cap.x1}, ${cap.y1}) being ${a}/${sd} stands whole beside the disc, a quarter of the canvas tall or more`, `${tall.toFixed(0)} px tall in ${H}; box ${JSON.stringify(f.box)}; disc ${JSON.stringify(lay.disc)}`);
    }
  }
  for (const [W, H] of [[390, 489], [780, 978], [360, 400], [414, 520]]) for (const [a, sd] of GATE_SPECIES) {
    const reach = reachOf(growBody(a, sd)), lay = chamberLayout(W, H, null, reach), f = lay.fit, tall = f.k * reach.y1;
    ok(tall >= 0.25 * H && f.box.x1 <= W && f.box.y0 >= 0 && lay.disc.cx - 1.105 * lay.disc.Rd >= 0,
      `16 a phone's chamber ${W} x ${H}: being ${a}/${sd} whole, a quarter of it tall or more, and the disc's ticks inside`, `${tall.toFixed(0)} px tall; box ${JSON.stringify(f.box)}; disc ${JSON.stringify(lay.disc)}`);
  }
  const B = growBody(...GATE_SPECIES[0]);
  const same = JSON.stringify(poseBody(B, 2.5)) === JSON.stringify(poseBody(B, 2.5));
  const moves = JSON.stringify(poseBody(B, 0)) !== JSON.stringify(poseBody(B, 1.5));
  ok(same && moves, '14 it breathes as time runs, and is the same at the same time (time 0 when motion is reduced)');
  const tipOf = (att) => { const ps = poseBody(B, 0, att).filter((p) => p.frond == null); return ps[ps.length - 1].b; };
  const left = tipOf({ x: -1, y: -0.3, w: 1 }), right = tipOf({ x: 1, y: -0.3, w: 1 });
  ok(left[0] < right[0] - 0.5, '15 its head points toward what it attends to', `${left[0].toFixed(2)} < ${right[0].toFixed(2)}`);
  ok(JSON.stringify(growBody(...GATE_SPECIES[1])) === JSON.stringify(growBody(...GATE_SPECIES[1])), '17 the same seed grows the same being');
}

console.log(`chamber: ${checks - failures} of ${checks} checks passed`);
if (!checks || failures) process.exit(1);
