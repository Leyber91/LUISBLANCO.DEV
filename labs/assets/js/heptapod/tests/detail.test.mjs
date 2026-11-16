/* ============================================================
   heptapod/tests/detail.test.mjs — the film-detail suite (film track
   F2, E7a) on shapes whose answers are known.

     node labs/assets/js/heptapod/tests/detail.test.mjs

   1. The distance transform against brute force on random masks (an
      independent method).
   2. The ring of part 1 on a drawn annulus of known centre, radius and
      width, and on an annulus with a gap of known size.
   3. Filaments: a bare disc has none; a disc with a straight bar of
      even width has exactly one, straight and even (the profile G9
      rejects); a disc with a curved tendril that tapers to a knob has
      exactly one, with a bulb tip and turning; a thin bar alone is one
      filament end to end.
   Exits 1 on any failure.
   ============================================================ */

import { mulberry32 } from '../topo/rng.js';
import { ringTable } from '../detail/ring.js';
import { edt2, filaments } from '../detail/filaments.js';

let checks = 0, failures = 0;
const ok = (cond, what) => { checks++; if (!cond) { failures++; console.log('FAIL ' + what); } };

const blank = (W, H) => ({ W, H, d: new Uint8Array(W * H) });
const disc = (m, cx, cy, r) => {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(m.H - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(m.W - 1, Math.ceil(cx + r)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m.d[y * m.W + x] = 1;
};
/* a stroke along points [x, y, radius], painted as discs every half pixel */
const stroke = (m, pts) => {
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0, r0] = pts[k - 1], [x1, y1, r1] = pts[k];
    const n = Math.max(1, Math.ceil(2 * Math.hypot(x1 - x0, y1 - y0)));
    for (let t = 0; t <= n; t++) disc(m, x0 + ((x1 - x0) * t) / n, y0 + ((y1 - y0) * t) / n, r0 + ((r1 - r0) * t) / n);
  }
};

/* 1. distance transform */
{
  const rnd = mulberry32(7);
  let bad = 0;
  for (let t = 0; t < 30; t++) {
    const W = 5 + Math.floor(rnd() * 20), H = 5 + Math.floor(rnd() * 20), m = blank(W, H);
    for (let i = 0; i < W * H; i++) m.d[i] = rnd() < 0.7 ? 1 : 0;
    const D = edt2(m);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let best = 0;
      if (m.d[y * W + x]) {
        best = Infinity;
        for (let Y = -1; Y <= H; Y++) for (let X = -1; X <= W; X++) {
          const inside = X >= 0 && Y >= 0 && X < W && Y < H;
          if (inside && m.d[Y * W + X]) continue;
          best = Math.min(best, (X - x) ** 2 + (Y - y) ** 2);
        }
      }
      if (D[y * W + x] !== best) bad++;
    }
  }
  ok(bad === 0, `distance transform: ${bad} pixels differ from brute force on 30 random masks`);
}

/* 2. the ring */
{
  const N = 800, m = blank(N, N), cx = 400, cy = 410, R = 290, w = 18;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x - cx, y - cy); if (Math.abs(r - R) <= w / 2) m.d[y * N + x] = 1; }
  const t = ringTable(m);
  ok(t && Math.abs(t._ring.R - R) < 3 && Math.abs(t._ring.cx - cx) < 3 && Math.abs(t._ring.cy - cy) < 3, `ring fit: R ${t && t._ring.R.toFixed(1)} of ${R}, centre ${t && t._ring.cx.toFixed(1)}, ${t && t._ring.cy.toFixed(1)}`);
  ok(t && Math.abs(t.w_med_R - w / R) < 0.1 * (w / R), `ring: median width ${t && t.w_med_R.toFixed(4)} R, drawn ${(w / R).toFixed(4)} R`);
  ok(t && t.ring_closure === 1 && t.gaps_deg.length === 0 && t.n_blots === 0, `ring: a closed even annulus has closure ${t && t.ring_closure}, gaps ${t && t.gaps_deg.length}, blots ${t && t.n_blots}`);
  // a gap of 40 degrees centred on angle 0
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = (Math.atan2(y - cy, x - cx) * 180) / Math.PI; if (Math.abs(a) < 20) m.d[y * N + x] = 0; }
  const g = ringTable(m);
  ok(g && g.gaps_deg.length === 1 && Math.abs(g.gaps_deg[0] - 40) < 2, `ring: a 40 degree gap reads as ${g && JSON.stringify(g.gaps_deg.map((x) => +x.toFixed(1)))}`);
}

/* 3. filaments */
{
  const N = 600;
  const a = blank(N, N); disc(a, 300, 300, 120);
  const fa = filaments(a).filaments;
  ok(fa.length === 0, `filaments: a bare disc has ${fa.length}`);

  const b = blank(N, N); disc(b, 260, 300, 120);
  stroke(b, [[370, 300, 6], [570, 300, 6]]);
  const fb = filaments(b).filaments;
  ok(fb.length === 1, `filaments: a disc with one straight bar has ${fb.length}`);
  if (fb.length === 1) {
    const f = fb[0];
    ok(Math.abs(f.shaft - 13) < 2.5, `straight bar: shaft ${f.shaft.toFixed(1)} px, drawn 12 to 13`);
    ok(f.straightness > 0.98 && f.shaftCV < 0.1 && f.turnDeg < 15, `straight bar: straightness ${f.straightness.toFixed(3)}, width CV ${f.shaftCV.toFixed(3)}, turning ${f.turnDeg.toFixed(1)} deg`);
    ok(f.length > 150 && f.length < 230, `straight bar: length ${f.length.toFixed(0)} px`);
    ok(f.tip === 'flat', `straight bar: tip ${f.tip} (${f.tipRatio.toFixed(2)})`);
  }

  const c = blank(N, N); disc(c, 220, 300, 110);
  const pts = [];
  for (let k = 0; k <= 40; k++) { const t = k / 40, ang = 1.4 * t; pts.push([320 + 220 * Math.sin(ang) * 0.9, 300 - 160 * (1 - Math.cos(ang)), 9 - 6 * t]); }
  stroke(c, pts);
  const [ex, ey] = pts[pts.length - 1];
  disc(c, ex, ey, 7);
  const fc = filaments(c).filaments;
  ok(fc.length === 1, `filaments: a disc with one curved tapering tendril has ${fc.length}`);
  if (fc.length === 1) {
    const f = fc[0];
    ok(f.tip === 'bulb' && f.tipRatio >= 1.5, `curved tendril: tip ${f.tip} (${f.tipRatio.toFixed(2)})`);
    ok(f.turnDeg > 45 && f.straightness < 0.95, `curved tendril: turning ${f.turnDeg.toFixed(0)} deg, straightness ${f.straightness.toFixed(3)}`);
  }

  const e = blank(N, N); disc(e, 220, 300, 110);
  stroke(e, [[320, 300, 9], [420, 330, 5], [540, 320, 0.8]]);
  const fe = filaments(e).filaments;
  ok(fe.length === 1 && fe[0].tip === 'pointed', `filaments: a tendril tapering to a point reads ${fe.length} filament(s), tip ${fe.length ? `${fe[0].tip} (taper ${fe[0].taper.toFixed(2)})` : '-'}`);

  // a filament grows from a body: a bar alone, and a ring's stroke ending at a gap, are strands, not filaments
  const d = blank(N, N); stroke(d, [[100, 200, 4], [500, 260, 4]]);
  const fd = filaments(d).filaments;
  ok(fd.length === 0, `filaments: a thin bar alone reads ${fd.length} filament(s), wanted 0 (a strand, judged by G9 apart)`);
  const r = blank(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const rr = Math.hypot(x - 300, y - 300), a = Math.atan2(y - 300, x - 300); if (Math.abs(rr - 220) <= 7 && Math.abs(a) > 0.35) r.d[y * N + x] = 1; }
  const fr = filaments(r).filaments;
  ok(fr.length === 0, `filaments: an even ring with a gap reads ${fr.length} filament(s), wanted 0 (its two ends are the stroke's own)`);
  stroke(r, [[300, 520, 3], [310, 590, 1.5]]);
  disc(r, 310, 590, 3.5);
  const fr2 = filaments(r).filaments;
  ok(fr2.length === 1, `filaments: the same ring with one tendril reads ${fr2.length}, wanted 1`);
  const fr3 = filaments(r, { ring: { cx: 300, cy: 300, R: 220, w: 15 } }).filaments;
  ok(fr3.length === 1, `filaments: with the ring passed, the tendril near the ring is kept: ${fr3.length}, wanted 1`);

  // a short thin tendril lying wholly inside the carrier band (+-0.12 R = 26 px) is still a tendril
  const sh = blank(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const rr = Math.hypot(x - 300, y - 300); if (Math.abs(rr - 220) <= 7) sh.d[y * N + x] = 1; }
  stroke(sh, [[300, 300 - 225, 2.2], [300, 300 - 244, 2]]);
  const fs1 = filaments(sh, { ring: { cx: 300, cy: 300, R: 220, w: 15 } }).filaments;
  ok(fs1.length === 1, `filaments: a short thin tendril inside the carrier band, ring passed, reads ${fs1.length}, wanted 1`);

  // a tendril nearly as thick as the ring it grows from (its width never passes 2.5 shafts)
  const th = blank(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const rr = Math.hypot(x - 300, y - 300); if (Math.abs(rr - 220) <= 8) th.d[y * N + x] = 1; }
  stroke(th, [[300, 80, 5], [290, 40, 4.5], [300, 8, 4]]);
  const ft = filaments(th).filaments;
  ok(ft.length === 1, `filaments: a thick tendril on a closed ring reads ${ft.length}, wanted 1`);
  const closed = blank(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const rr = Math.hypot(x - 300, y - 300); if (Math.abs(rr - 220) <= 8) closed.d[y * N + x] = 1; }
  ok(filaments(closed).filaments.length === 0, 'filaments: a closed even ring alone reads none');

  // Ian's case: a thin ring with a gap runs into a blob on the ring; the strand along the ring is the carrier
  const ian = blank(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const rr = Math.hypot(x - 300, y - 300), a = Math.atan2(y - 300, x - 300); if (Math.abs(rr - 220) <= 3 && Math.abs(a) > 0.35) ian.d[y * N + x] = 1; }
  disc(ian, 300, 80, 34);
  const without = filaments(ian).filaments.length, withRing = filaments(ian, { ring: { cx: 300, cy: 300, R: 220, w: 7 } }).filaments.length;
  ok(without >= 1 && withRing === 0, `filaments: a thin ring into a blob reads ${without} without the ring and ${withRing} with it (wanted at least 1, then 0)`);
}

console.log(failures ? `detail: ${failures} of ${checks} checks FAILED` : `detail: ${checks} of ${checks} checks pass`);
process.exit(failures ? 1 : 0);
