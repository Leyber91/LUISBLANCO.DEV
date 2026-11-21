/* ============================================================
   tools/drives/heptapod.mjs — one day in the pod, by hand.

   Run by `node tools/labs-wt.mjs drive heptapod` (tools/drive.mjs).
   Every position comes from the page's own probe (the canvas
   element's probe(), set in pod/main.js), so this file holds no
   copy of the scene's layout.

   What it proves: the chamber fills the first screen, a ring forms
   in the disc's ink field, a ring can be cropped, a thing can be
   taken, set down, held up and passed through the glass, one
   gesture is one act, the keyboard does the same, a mark can be
   raised, the day and a pencil guess survive a reload through the
   labs' store, the evening runs to its count, the inked script is
   the page's own once published (a kept day, in the store across a
   reload) and the ring script stays at its link, and every deep-linked
   state comes up.

   BAR_C, C1 to C3, on the canvas's own pixels (luma, Rec. 709 on the
   sRGB bytes): no thing, held or at rest, and no part of the being
   is brighter than the disc where it is still whole; the table's
   light falls with distance from under the disc (a fit over its
   pixels); the light the pale things receive falls with the square
   of their distance from the fog (a fit over pixels the page names:
   points of their surfaces that face the fog, read from the canvas,
   the page's response undone, the sheen and the light of the
   visitor's side that the page gives with each point taken off, and
   the cosine divided out, so what is left is the inverse square or
   it is not; the dark things and the being's rim are too dark to
   read so in eight bits and are checked on the computation by
   tests/chamber.test.mjs); the
   same points show each thing lit where it faces the fog and dark
   where it faces away; the same thing is darker set down far from
   the glass than near it, and brighter held up than at rest; a
   thing's shadow lies away from the disc (where the table brightens
   when the thing leaves its place, the centre of that change lies on
   the side of the thing away from the disc); the table carries no
   drawn line (no plate's ellipse); the being is whole in the frame
   (the box of its drawn cells) at 1440 and 390 px and in a room
   narrowed to a laptop's, a fifth of the room tall or more; it
   turns to a thing held up; under reduced motion it is still when
   drawn again (and, as a control, it is not without the reduction);
   and the ink is achromatic (G11: its inked pixels carry no more
   chroma than the fog's own uninked pixels in the same disc).
   ============================================================ */

/* The canvas's luma in a rectangle of the viewport (CSS pixels), row by row, at one sample a CSS pixel. */
const ROWS = `window.__rows = (x0, y0, x1, y1) => {
  const cv = document.getElementById('pod'), r = cv.getBoundingClientRect(), k = cv.width / r.width, out = [];
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let y = Math.ceil(y0); y < y1; y++) { const row = []; for (let x = Math.ceil(x0); x < x1; x++) {
    const X = Math.round((x - r.left) * k), Y = Math.round((y - r.top) * k);
    if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) { row.push(null); continue; }
    const i = 4 * (Y * cv.width + X); row.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); } out.push(row); }
  return out;
};`;
/* The canvas's colour at points of the viewport (CSS pixels): [[r, g, b], ...]. */
const RGB = `window.__rgb = (pts) => {
  const cv = document.getElementById('pod'), r = cv.getBoundingClientRect(), k = cv.width / r.width, c = cv.getContext('2d');
  return pts.map(([x, y]) => { const d = c.getImageData(Math.floor((x - r.left) * k), Math.floor((y - r.top) * k), 1, 1).data; return [d[0], d[1], d[2]]; });
};`;
const lin8 = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/* A straight-line fit of y on x: slope and R^2. */
const fitLine = (X, Y) => {
  const n = X.length, mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), n };
};

/* Luma statistics of the canvas's pixels in a rectangle of the viewport (CSS pixels), computed in the page. */
const PIX = `window.__pix = (x0, y0, x1, y1, mask) => {
  const cv = document.getElementById('pod'), r = cv.getBoundingClientRect(), k = cv.width / r.width;
  const X0 = Math.max(0, Math.floor((x0 - r.left) * k)), Y0 = Math.max(0, Math.floor((y0 - r.top) * k));
  const X1 = Math.min(cv.width, Math.ceil((x1 - r.left) * k)), Y1 = Math.min(cv.height, Math.ceil((y1 - r.top) * k));
  if (X1 - X0 < 1 || Y1 - Y0 < 1) return { n: 0 };
  const d = cv.getContext('2d').getImageData(X0, Y0, X1 - X0, Y1 - Y0).data, L = [], C = [];
  let chroma = 0;
  for (let i = 0; i < d.length; i += 4) {
    const px = X0 + ((i / 4) % (X1 - X0)), py = Y0 + Math.floor(i / 4 / (X1 - X0));
    if (mask && !mask(px / k + r.left, py / k + r.top)) continue;
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2], c = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    L.push(y); C.push([y, c]);
    chroma = Math.max(chroma, c);
  }
  L.sort((a, b) => a - b);
  const q = (f) => L[Math.min(L.length - 1, Math.floor(f * L.length))];
  // the chroma of the darkest fifth (in the disc, the ink)
  const p20 = q(0.2);
  const chromaDark = C.reduce((m, [y, c]) => (y <= p20 ? Math.max(m, c) : m), 0);
  return { n: L.length, mean: L.reduce((a, b) => a + b, 0) / Math.max(1, L.length), p50: q(0.5), p75: q(0.75), p95: q(0.95), max: L[L.length - 1], chroma, chromaDark };
};`;

export default async function heptapod(p, { base, width }) {
  const probe = () => p.ev('document.getElementById("pod").probe()');
  const ringNo = () => p.ev('(document.querySelector("#panel .pp-lamp .mini") || {}).textContent || ""');
  const entries = () => p.ev('document.querySelectorAll("#nb .nb-entry").length');
  const panelHead = () => p.ev('(document.querySelector("#panel .mini") || {}).textContent || ""');
  const ready = () => p.until('!!document.querySelector("#panel .pp") && typeof document.getElementById("pod").probe === "function"');
  /* a crop of one side of the ring: the rectangle around a point at angle deg (clockwise from the top) */
  const cropSide = async (g, deg) => {
    const a = (deg * Math.PI) / 180, cx = g.ring.x + Math.sin(a) * g.ring.R, cy = g.ring.y - Math.cos(a) * g.ring.R, h = 0.55 * g.ring.R;
    await p.drag(cx - h, cy - h, cx + h, cy + h);
    await p.sleep(250);
  };
  const first = (g, place) => Object.entries(g.things).find(([, t]) => t.place === place);
  const pix = async (b, mask = null) => { await p.ev(PIX); return p.ev(`window.__pix(${b.x0}, ${b.y0}, ${b.x1}, ${b.y1}${mask ? ', ' + mask : ''})`); };
  /* the disc where it is still whole: the 75th percentile of the luma on that circle (above any ink on it) */
  const discEdge = async (g) => p.ev(`(() => { ${PIX}; const g = document.getElementById("pod").probe(), r = g.disc.R * g.whole, L = [];
    for (let a = 0; a < 360; a += 2) { const x = g.disc.x + r * Math.sin(a * Math.PI / 180), y = g.disc.y - r * Math.cos(a * Math.PI / 180);
      const s = window.__pix(x - 0.5, y - 0.5, x + 0.5, y + 0.5); if (s.n) L.push(s.p50); }
    L.sort((a, b) => a - b); return L[Math.floor(0.75 * L.length)]; })()`);
  /* the table's columns, top to bottom from just under the sill, away from every thing: the largest step up from a
     row to the next and back down within two rows (a drawn hairline), in luma */
  const ridge = async (g) => p.ev(`(() => { ${PIX}; const g = document.getElementById("pod").probe(), cv = document.getElementById("pod"), r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const boxes = Object.values(g.things).map((t) => t.box).filter(Boolean);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let worst = 0;
    for (let x = r.left + 4; x < r.right - 4; x += 6) {
      if (boxes.some((b) => x > b.x0 - 6 && x < b.x1 + 6)) continue;
      const X = Math.round((x - r.left) * k); const col = [];
      for (let Y = Math.ceil((g.sill - r.top) * k) + 4; Y < cv.height - 2; Y++) { const i = 4 * (Y * cv.width + X); col.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); }
      for (let i = 2; i < col.length - 2; i++) worst = Math.max(worst, Math.min(col[i] - col[i - 2], col[i] - col[i + 2]));
    }
    return +worst.toFixed(2); })()`);

  // the day by hand runs in the ring script, whose parts sit in fixed quarters (the crops below are by side); the
  // inked script, the page's own once published, is driven at the end
  await p.go(`${base}/labs/heptapod.html?script=ring`);
  p.check('the page comes up', await ready());
  await p.ev('document.getElementById("pod").scrollIntoView({ block: "center" })');
  await p.sleep(400);
  let g = await probe();
  p.check('the day starts at ring 0', (await ringNo()).includes('ring 0 of 40'), await ringNo());
  p.check('the ring script by its link', g.script === 'ring', g.script);
  // the first screen is the chamber: on a wide screen it starts under the bar and fills most of the viewport
  const box = await p.ev('(() => { const r = document.getElementById("pod").getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, w: r.width, vh: innerHeight, vw: innerWidth }; })()');
  p.check('the chamber fills the first screen', box.h >= 0.55 * box.vh && box.top < 0.3 * box.vh, JSON.stringify(box));
  p.check('the disc is inside the chamber', g.disc.y - g.disc.R >= -1 && g.disc.y + g.disc.R <= g.sill + 1, JSON.stringify(g.disc));

  // the greeting forms in the disc and stays until the first act: keep its lower part
  p.check('the greeting is in the disc and can be cropped', await p.until('document.getElementById("pod").probe().crop', 6000));
  p.check('its ink field has gathered', await p.until('(() => { const f = document.getElementById("pod").probe().field; return f.mass > 10 && f.fit > 0.8; })()', 6000), JSON.stringify((await probe()).field));
  p.check('no horizontal scroll', await p.ev('document.documentElement.scrollWidth <= innerWidth'), await p.ev('`${document.documentElement.scrollWidth} > ${innerWidth}`'));
  await p.shot('01-greeting');

  /* The light received, read from the canvas at points the page names (see the header): the inverse square, or not.
     Run on the recorded day (?at=mid), whose things stand where its seed puts them, so the pale things stand at
     different distances from the fog on every run (on a random day they may all stand on one row). */
  const paleFit = async (g) => {
    const things = Object.entries(g.things).filter(([, t]) => t.box);
    await p.ev(RGB);
    const { exposure: X, cap } = g.response, pts = [];
    for (const [o, t] of things) for (const s of t.samples.lit) pts.push({ ...s, what: o, fill: s.fill || 0, spec: s.spec || 0 });
    const rgb = await p.ev(`window.__rgb(${JSON.stringify(pts.map((s) => [s.x, s.y]))})`);
    const by = {};
    pts.forEach((s, i) => {
      const b = rgb[i][2];
      if (b < 30) return;                                  // too dark to read in eight bits
      const y = (lin8(b) - s.air) / s.T;
      if (!(y > 0) || y >= 0.995 * cap) return;            // the response cannot be undone at its ceiling
      const e = ((cap * Math.atanh(y / cap)) / X - s.spec) / s.alb - s.fill;
      if (!(e > 0)) return;
      (by[s.what] = by[s.what] || []).push([Math.log(s.d), Math.log(e / s.cos)]);
    });
    // one point for each pale thing: the medians of its readings (a single pixel read off a picture drawn to scale mixes
    // its neighbours; the median of many does not). Only the pale things are read: on a dark glaze or wax, and on the
    // being's rim, the light left once the sheen is taken off is too little to read in eight bits (it came out up to
    // 2.2 times off on 2026-11-18), so they are checked by tests/chamber.test.mjs on the computation instead
    const med = (A) => { const B = A.slice().sort((x, y) => x - y); return B[Math.floor(B.length / 2)]; };
    const pt = (v) => [med(v.map((q) => q[0])), med(v.map((q) => q[1]))];
    const pale = new Set(things.filter(([, t]) => t.alb >= 0.4).map(([o]) => o));
    const kept = Object.entries(by).filter(([k, v]) => pale.has(k) && v.length >= 5).map(([k, v]) => [k, pt(v), v.length]);
    const f = fitLine(kept.map(([, q]) => q[0]), kept.map(([, q]) => q[1]));
    const span = kept.length ? Math.max(...kept.map(([, q]) => q[0])) - Math.min(...kept.map(([, q]) => q[0])) : 0;
    const res = (q) => q[1] + 2 * q[0];
    const thingsRes = kept.length ? med(kept.map(([, q]) => res(q))) : NaN;
    p.check('C1: the light the pale things receive falls with the square of their distance from the fog (read from the canvas)',
      kept.length >= 3 && span > 0.12 && f.slope < -1.4 && f.slope > -2.6 && f.r2 > 0.7,
      `slope ${f.slope.toFixed(2)} (the inverse square: -2), R^2 ${f.r2.toFixed(2)} over ${kept.length} pale things (distances ${Math.exp(span).toFixed(2)} to 1): `
      + kept.map(([k, q, n]) => `${k} ${n} (${res(q).toFixed(2)})`).join(', '));
  };
  // BAR_C on the pixels: the brightest thing is darker than the disc where it is still whole
  g = await probe();
  const edge = await discEdge(g);
  const things = Object.entries(g.things).filter(([, t]) => t.box);
  const stats = {};
  for (const [o, t] of things) stats[o] = await pix(t.box);
  const brightest = Math.max(...Object.values(stats).map((s) => s.max));
  const beingPix = await pix(g.being.drawn);
  p.check('C1: no thing and no part of the being is brighter than the disc where it is whole', brightest < edge && beingPix.max < edge,
    `brightest thing ${brightest.toFixed(1)}, being ${beingPix.max.toFixed(1)}, disc ${edge}`);
  // the fog's light falls off with distance. On the pixels: the table, away from every thing and its shadow, against
  // the distance from the point under the disc's centre on the sill
  {
    await p.ev(ROWS);
    const cvr = await p.ev('(() => { const r = document.getElementById("pod").getBoundingClientRect(); return { x0: r.left, x1: r.right, y1: r.bottom }; })()');
    const rows = await p.ev(`window.__rows(${cvr.x0}, ${g.sill + 3}, ${cvr.x1}, ${cvr.y1 - 2})`);
    const X = [], Y = [];
    const near = (x, y) => things.some(([, t]) => x > t.box.x0 - 0.6 * t.u && x < t.box.x1 + 0.6 * t.u && y > t.box.y0 - 0.2 * t.u && y < t.base.y + 2.6 * t.u);
    rows.forEach((row, j) => row.forEach((v, i) => {
      const x = Math.ceil(cvr.x0) + i, y = Math.ceil(g.sill + 3) + j;
      if (v == null || v < 1 || i % 4 || j % 4 || near(x, y)) return;
      X.push(Math.log(Math.hypot(x - g.disc.x, y - g.sill) + 10)); Y.push(Math.log(v));
    }));
    const f = fitLine(X, Y);
    p.check('C1: the table\'s light falls with distance from under the disc (a fit over its pixels)', f.n > 50 && f.slope < -0.2 && f.r2 > 0.5, JSON.stringify({ slope: +f.slope.toFixed(2), r2: +f.r2.toFixed(2), n: f.n }));
  }
  {
    // each thing lit where it faces the fog and dark where it faces away, on the same canvas
    await p.ev(RGB);
    const bad = [];
    for (const [o, t] of things) {
      if (!t.samples.lit.length || !t.samples.dark.length) continue;
      const a = await p.ev(`window.__rgb(${JSON.stringify(t.samples.lit.map((s) => [s.x, s.y]))})`), b = await p.ev(`window.__rgb(${JSON.stringify(t.samples.dark.map((s) => [s.x, s.y]))})`);
      const la = a.reduce((m, c) => m + luma(c), 0) / a.length, lb = b.reduce((m, c) => m + luma(c), 0) / b.length;
      if (!(la > lb + 4)) bad.push(`${o} ${la.toFixed(1)} vs ${lb.toFixed(1)}`);
    }
    p.check('C3: each thing is lit where it faces the fog and dark where it faces away (on the canvas)', bad.length === 0, bad.join('; '));
  }
  const line = await ridge(g);
  p.check('C1: the table carries no drawn line (no plate)', line < 4, `largest one-row ridge ${line} luma`);
  // G11: the ink in the disc is achromatic: its pixels (the darkest fifth of the whole disc, where the greeting's ink
  // is) carry no more chroma than the fog's own colours
  const fogChroma = 24;           // the largest max-min of light.js FOG_STOPS (#6E7786: 0x86 - 0x6E)
  // the ink gathered in the field (a change of tier lays the field again, and its ink gathers again)
  await p.until('(() => { const f = document.getElementById("pod").probe().field; return f.mass > 10 && f.fit > 0.8; })()', 6000);
  g = await probe();
  const inDisc = `(x, y) => Math.hypot(x - ${g.disc.x}, y - ${g.disc.y}) < ${g.disc.R * 0.7}`;
  const box7 = { x0: g.disc.x - g.disc.R * 0.7, y0: g.disc.y - g.disc.R * 0.7, x1: g.disc.x + g.disc.R * 0.7, y1: g.disc.y + g.disc.R * 0.7 };
  const inked = await pix(box7, `(x, y) => (${inDisc})(x, y) && document.getElementById('pod').inkAt(x, y) > 0.5`);
  const bare = await pix(box7, `(x, y) => (${inDisc})(x, y) && document.getElementById('pod').inkAt(x, y) < 0.01`);
  p.check('G11: the ink carries no colour beyond the fog\'s own', inked.n > 50 && bare.n > 50 && inked.chroma <= bare.chroma + 1,
    `inked pixels ${inked.n}, chroma at most ${inked.chroma}; uninked fog ${bare.n}, at most ${bare.chroma} (its stops' ${fogChroma}); field ${JSON.stringify(g.field)}, tier ${g.tier}`);
  // C2: the being is whole in the frame, and lit on the side facing the disc
  const bb = g.being.drawn, cvr = await p.ev('(() => { const r = document.getElementById("pod").getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })()');
  p.check('C2: the being is whole in the frame (the box of its drawn cells), a fifth of the room tall or more', bb.x0 >= cvr.x0 - 1 && bb.x1 <= cvr.x1 + 1 && bb.y0 >= cvr.y0 - 1 && bb.y1 <= cvr.y1 + 1 && bb.y1 - bb.y0 > 0.2 * (cvr.y1 - cvr.y0),
    `${JSON.stringify(bb)} in ${JSON.stringify(cvr)}`);
  const third = (bb.x1 - bb.x0) / 3, toward = g.disc.x < (bb.x0 + bb.x1) / 2;
  const sideA = await pix({ x0: toward ? bb.x0 : bb.x1 - third, x1: toward ? bb.x0 + third : bb.x1, y0: bb.y0, y1: bb.y1 });
  const sideB = await pix({ x0: toward ? bb.x1 - third : bb.x0, x1: toward ? bb.x1 : bb.x0 + third, y0: bb.y0, y1: bb.y1 });
  p.check('C2: the being is lit on its side facing the disc', sideA.max > sideB.max + 8 && g.being.light.near > 3 * g.being.light.far,
    `brightest pixel facing ${sideA.max.toFixed(0)}, away ${sideB.max.toFixed(0)}; light ${JSON.stringify(g.being.light)}`);
  await cropSide(g, 180);
  p.check('a crop of the greeting lands in the notebook', (await entries()) === 1, `${await entries()} entries; read ${JSON.stringify((await probe()).lastKeep)}; dragging ${(await probe()).dragging}`);

  // take a thing from the plate at the glass: first its light and the table round its foot at rest, so that its shadow
  // and its light held up can be told from them (the thing farthest from the disc's centre line, so the shadow's side
  // shows)
  let [name, t] = Object.entries(g.things).filter(([, v]) => v.place === 'near').sort((a, b) => Math.abs(b[1].base.x - g.disc.x) - Math.abs(a[1].base.x - g.disc.x))[0];
  const U = t.u;
  const restStat = await pix(t.box);
  // the table round its foot, row by row, to find where its shadow lay once it has left
  const around = { x0: t.base.x - 2 * U, x1: t.base.x + 2 * U, y0: Math.max(g.sill + 3, t.base.y - 1.2 * U), y1: t.base.y + 2.2 * U };
  await p.ev(ROWS);
  const restRows = await p.ev(`window.__rows(${around.x0}, ${around.y0}, ${around.x1}, ${around.y1})`);
  const tBox = t.box;
  await p.drag(t.x, t.y, t.x, t.y - 0.11 * g.height, { steps: 12 });      // up into the air, short of the glass
  await p.sleep(200);
  p.check('taking a thing writes ring 1', (await ringNo()).includes('ring 1 of 40'), await ringNo());
  p.check('the greeting gave way to the new ring', await p.until('document.getElementById("pod").probe().crop', 6000));
  // both sides are cut while the ring hangs, before any picture: a picture of this page took seconds in the headless
  // browser, and a ring lives 9.6 s (2026-11-17: the second crop came after the ring had gone)
  // who takes is written on the left, and it is the radical at the foot of the greeting: the notebook knows it again
  await cropSide(g, 270);
  const said = await p.ev('document.getElementById("say").textContent');
  p.check('the left of ring 1 is the radical at the foot of the greeting', (await entries()) === 1 && said.includes('already in the notebook'), `${await entries()} entries; "${said}"; read ${JSON.stringify((await probe()).lastKeep)}`);
  await cropSide(g, 90);
  p.check('a crop of the right side lands in the notebook', (await entries()) === 2, `${await entries()} entries; read ${JSON.stringify((await probe()).lastKeep)}; ring ${(await probe()).age} ms old`);
  // the held thing's light, after the crops: its pixel reads take seconds under load, and the ring lives 9.6 s (on
  // 2026-11-21 at 1440 px they came first and ring 1 had thinned away before its crops, on main's code as on this)
  {
    const h = await probe(), ht = h.things[name];
    const heldStat = await pix(ht.box);
    p.check('C1: a thing held up is no brighter than the disc where it is whole', heldStat.max < edge, `${name}: ${heldStat.max.toFixed(1)}, disc ${edge}`);
    p.check('C3: a thing held up enters the disc\'s light (it is brighter than at rest)', heldStat.p95 > restStat.p95 && ht.light.all > t.light.all && ht.dist < t.dist,
      `${name}: brightest 5% ${restStat.p95.toFixed(1)} at rest, ${heldStat.p95.toFixed(1)} held; light ${t.light.all.toFixed(4)}, ${ht.light.all.toFixed(4)}; ${t.dist} px from the fog, then ${ht.dist}`);
  }
  await p.shot('02-ring-hangs');
  // late in the thinning only hairlines are left on that side: a crop of them is a scrap
  await p.until('!document.getElementById("pod").probe().ink', 12000);
  p.check('the ring thins away', !(await probe()).ink);

  // set the held thing down on the far plate
  g = await probe();
  t = g.things[name];
  p.check('the thing is in the hand', t.held, name);
  await p.drag(t.x, t.y, g.plates.far.x - 0.2 * g.width, g.plates.far.y - 0.01 * g.height, { steps: 16 });
  await p.sleep(200);
  p.check('setting it down far writes ring 2', (await ringNo()).includes('ring 2 of 40'), await ringNo());
  g = await probe();
  p.check('the thing is on the far plate', g.things[name].place === 'far', g.things[name].place);
  await p.sleep(1200);
  {
    const f = (await probe()).things[name], farStat = await pix(f.box);
    p.check('C1: the same thing set down far from the glass is darker than it was near it', farStat.p95 < restStat.p95 && f.dist > t.dist,
      `${name}: brightest 5% ${restStat.p95.toFixed(1)} near, ${farStat.p95.toFixed(1)} far; ${t.dist} then ${f.dist} px from the fog`);
    // its place at the glass is empty now: where the table brightened is where its shadow lay. The centre of that
    // change, outside the thing's own picture, lies on the side of the thing away from the disc's foot on the sill
    await p.ev(ROWS);
    const goneRows = await p.ev(`window.__rows(${around.x0}, ${around.y0}, ${around.x1}, ${around.y1})`);
    let sw = 0, sx = 0, sy = 0;
    goneRows.forEach((row, j) => row.forEach((v, i) => {
      const x = Math.ceil(around.x0) + i, y = Math.ceil(around.y0) + j, r0 = restRows[j][i];
      if (v == null || r0 == null || (x > tBox.x0 - 2 && x < tBox.x1 + 2 && y > tBox.y0 - 2 && y < tBox.y1 + 2)) return;
      const d = v - r0;
      if (d > 0.5) { sw += d; sx += d * x; sy += d * y; }
    }));
    const cx = sx / sw, cy = sy / sw, ax = t.base.x - g.disc.x, ay = t.base.y - g.sill;
    const along = ((cx - t.base.x) * ax + (cy - t.base.y) * ay) / Math.hypot(ax, ay);
    p.check('C3: its shadow had lain on the table on its side away from the disc', sw > 50 && along > 0.1 * U,
      `${name}: the table brightened by ${sw.toFixed(0)} luma in all; its centre ${along.toFixed(1)} px beyond the thing's foot, away from the disc`);
  }

  // raise a mark
  await p.ev('(() => { const i = document.getElementById("slate"); i.value = "Down"; i.form.requestSubmit(); })()');
  await p.sleep(300);
  p.check('a raised mark is listed, lower-cased, with its count', (await p.ev('(document.querySelector(".pp-mark") || {}).textContent || ""')).startsWith('down'), await p.ev('(document.querySelector(".pp-mark") || {}).textContent || ""'));

  // one gesture is one act: a thing dragged from its plate all the way onto the glass is taken, and stays in the hand
  [name, t] = first(g, 'near');
  await p.drag(t.x, t.y, t.x, g.glass.y, { steps: 20 });
  await p.sleep(350);
  p.check('dragging a thing onto the glass only takes it: ring 3', (await ringNo()).includes('ring 3 of 40'), await ringNo());
  g = await probe();
  p.check('it is in the hand, not given', g.things[name].held, name);
  // a second gesture passes it through the glass
  t = g.things[name];
  await p.drag(t.x, t.y, t.x, g.glass.y, { steps: 14 });
  await p.sleep(250);
  p.check('the second gesture gives it: ring 4', (await ringNo()).includes('ring 4 of 40'), await ringNo());
  await p.sleep(1700);
  g = await probe();
  p.check('a given thing comes back to the plate at the glass', g.things[name].place === 'near', g.things[name].place);

  // take a thing from the far plate, then hold it up at the glass with a second gesture
  [name, t] = first(g, 'far');
  await p.drag(t.x, t.y, t.x, t.y - 0.14 * g.height, { steps: 12 });
  await p.sleep(350);
  p.check('taking from the far plate writes ring 5', (await ringNo()).includes('ring 5 of 40'), await ringNo());
  g = await probe();
  t = g.things[name];
  await p.drag(t.x, t.y, g.air.near.x + 0.06 * g.width, g.air.near.y - 0.03 * g.height, { steps: 14 });
  await p.sleep(300);
  p.check('holding it up at the glass writes ring 6', (await ringNo()).includes('ring 6 of 40'), await ringNo());
  await p.sleep(250);
  await p.shot('03-ring-forming');
  await p.until('document.getElementById("pod").probe().crop', 6000);
  await p.sleep(500);
  await p.shot('04-held-at-the-glass');
  {
    // once the ring has gathered the being turns to what is held: its attention points from its head to the thing
    await p.sleep(2600);
    const a = await probe(), held = Object.values(a.things).find((v) => v.held);
    const [ax, ay] = a.being.key.split('|').map(Number);
    const hx = held.x - a.being.head.x, hy = -(held.y - a.being.head.y);
    const cos = (ax * hx + ay * hy) / (Math.hypot(ax, ay) * Math.hypot(hx, hy) || 1);
    p.check('C2: the being attends to the thing held up', cos > 0.8, `the cosine between its attention and the thing ${cos.toFixed(2)}`);
    await p.shot('04b-attends-held');
  }

  // the keyboard: W keeps the top of the ring, Enter sets the thing down
  await p.ev('document.getElementById("pod").focus()');
  const before = await entries();
  await p.key('w');
  await p.sleep(250);
  p.check('W keeps the top of the ring', (await entries()) === before + 1, `${before} -> ${await entries()}`);
  await p.key('Enter');
  await p.sleep(250);
  p.check('Enter sets the thing down and writes ring 7', (await ringNo()).includes('ring 7 of 40'), await ringNo());

  // a pencil guess and the day survive a reload
  await p.ev('(() => { const i = document.querySelector(".nb-guess"); i.value = "the one who takes?"; i.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await p.sleep(600);
  // a paused guess is written 300 ms after the typing stops, through the store's queue behind the acts' own writes;
  // the reload comes once the store holds it, as a visitor's would after a pause (on 2026-11-18, at 1440 px on a
  // machine short of memory, the queue took longer than a fixed 600 ms and the reload came first)
  p.check('the guess reaches the store', await p.until(`import('${base}/labs/assets/js/os/index.js').then((m) => m.LabsOS.instance && m.LabsOS.instance.progress.get('heptapod')).then((r) => JSON.stringify(r || {}).includes('the one who takes?'))`, 8000));
  await p.ev('window.scrollTo(0, 0)');
  await p.shot('05-notebook');
  await p.go(`${base}/labs/heptapod.html?script=ring`);
  p.check('the page comes up again', await ready());
  p.check('the day survives a reload', (await ringNo()).includes('ring 7 of 40'), await ringNo());
  p.check('the guess survives a reload', (await p.ev('(document.querySelector(".nb-guess") || {}).value || ""')) === 'the one who takes?',
    `guesses after the reload ${JSON.stringify(await p.ev('[...document.querySelectorAll(".nb-guess")].map((i) => i.value)'))}`);
  p.check('the notebook survives a reload', (await entries()) === before + 1, `${await entries()} entries`);

  // the evening, from a recorded day
  // a link that picks the species is played and never stored: the kept day is still there afterwards
  await p.go(`${base}/labs/heptapod.html?species=1`);
  p.check('a species link comes up as a day of its own', (await ready()) && (await ringNo()).includes('ring 0 of 40'), await ringNo());
  g = await probe();
  [name, t] = first(g, 'near');
  await p.drag(t.x, t.y, t.x, t.y - 0.11 * g.height, { steps: 10 });
  await p.sleep(300);
  await p.go(`${base}/labs/heptapod.html?script=ring`);
  p.check('and it did not replace the kept day', (await ready()) && (await ringNo()).includes('ring 7 of 40'), await ringNo());

  await p.go(`${base}/labs/heptapod.html?species=0&at=evening`);
  p.check('a recorded evening comes up', await ready());
  await p.sleep(500);
  await p.shot('06-evening');
  p.check('the evening opens on the being\'s reading of a mark', (await panelHead()).includes('reading of you'), await panelHead());
  await p.ev('[...document.querySelectorAll("#panel .act")].find((b) => b.textContent === "go on").click()');
  await p.sleep(400);
  p.check('then the six rings', (await panelHead()).includes('ring 1 of 6'), await panelHead());
  await p.ev('document.getElementById("stage").scrollIntoView({ block: "start" })');
  await p.sleep(300);
  await p.shot('07-check');
  // a press within a third of a second of the panel being rebuilt is ignored, so that a double click cannot answer two rings
  await p.ev('document.querySelector("#panel .pp-opt").click(); document.querySelector("#panel .pp-opt").click()');
  await p.sleep(500);
  p.check('a double click answers one ring, not two', (await panelHead()).includes('ring 2 of 6'), await panelHead());
  for (let i = 1; i < 6; i++) { await p.ev('document.querySelector("#panel .pp-opt").click()'); await p.sleep(500); }
  await p.sleep(400);
  p.check('six answers end the day', (await panelHead()).includes('the day is over'), await p.ev('(document.querySelector("#panel .pp-score") || {}).textContent || ""'));
  p.check('the notebook then outlines what each radical is used for', (await p.ev('document.querySelectorAll("#nb .nb-grid i.can").length')) > 0);
  await p.shot('08-done');

  // the inked script by its link (on this machine only while unpublished; pod/switch.js), on a species' own day
  await p.go(`${base}/labs/heptapod.html?species=0&script=inked`);
  p.check('an inked day comes up', await ready());
  g = await probe();
  p.check('the link turns the inked script on, here', g.script === 'inked', g.script);
  p.check('its greeting forms and can be cropped', await p.until('document.getElementById("pod").probe().crop', 8000));
  await p.sleep(800);
  await p.shot('09-inked-greeting');
  await p.ev('document.getElementById("pod").focus()');
  const n0 = await entries();
  await p.key('w');
  await p.sleep(300);
  p.check('W keeps the act of the inked ring', (await entries()) === n0 + 1, `${n0} -> ${await entries()}`);
  [name, t] = first(g, 'near');
  await p.drag(t.x, t.y, t.x, t.y - 0.11 * g.height, { steps: 10 });
  await p.until('document.getElementById("pod").probe().crop', 6000);
  await p.sleep(900);
  await p.shot('10-inked-ring');

  // the states a link opens, each shot
  for (const [q, shot] of [['?at=mid&still', '11-mid-still'], ['?at=evening&species=2', '12-evening-readback'], ['?at=check&species=1', '13-check'], ['?at=done', '14-done']]) {
    await p.go(`${base}/labs/heptapod.html${q}`);
    p.check(`${q} comes up`, await ready());
    await p.sleep(2600);
    await p.shot(shot);
    if (q.includes('still')) {
      // C2: with motion reduced the being does not breathe: drawn again a second and a half later, its pixels are the
      // same (the page is asked to draw it again, so the check does not rest on the page drawing nothing)
      const stillness = async () => {
        const b = (await probe()).being.box;
        const read = () => p.ev(`(() => { const cv = document.getElementById('pod'), r = cv.getBoundingClientRect(), k = cv.width / r.width;
          const d = cv.getContext('2d').getImageData(Math.round((${b.x0} - r.left) * k), Math.round((${b.y0} - r.top) * k), Math.round((${b.x1 - b.x0}) * k), Math.round((${b.y1 - b.y0}) * k)).data;
          let s = 0; for (let i = 0; i < d.length; i += 4) s = (s * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) % 1000000007; return s; })()`);
        await p.ev('document.getElementById("pod").redraw()'); await p.sleep(300);
        const a = await read();
        await p.sleep(1500);
        await p.ev('document.getElementById("pod").redraw()'); await p.sleep(300);
        return a === (await read());
      };
      p.check('C2: with motion reduced the being is still', await stillness(), 'drawn again 1.5 s apart');
      // the control: the same day without the reduction breathes
      await p.go(`${base}/labs/heptapod.html?at=mid`);
      await ready(); await p.sleep(1500);
      p.check('C2: without the reduction the same check sees it breathe (the control)', !(await stillness()));
      await p.until('(() => { const f = document.getElementById("pod").probe().field; return f.mass > 10 && f.fit > 0.8; })()', 6000);
      await paleFit(await probe());
    }
  }
  // C2: in a room as narrow as a laptop's (the chamber's column at 1024 to 1180 px, the caption over it), the being
  // stays whole and at least a fifth of the room tall as it stands (the review of 2026-11-18 found it 6 px tall at 1024;
  // tests/chamber.test.mjs holds every pose it can take to a quarter)
  if (width >= 1000) {
    for (const w of [640, 716, 796]) {
      await p.go(`${base}/labs/heptapod.html?species=0`);
      await ready();
      await p.ev(`(() => { const r = document.querySelector('.room'); r.style.width = '${w}px'; r.style.maxWidth = '${w}px'; })()`);
      await p.sleep(900);
      const b = (await probe()).being.drawn, c = await p.ev('(() => { const r = document.getElementById("pod").getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })()');
      p.check(`C2: in a room ${w} px wide the being is whole and a fifth of the room tall or more`, b && b.x0 >= c.x0 - 1 && b.x1 <= c.x1 + 1 && b.y0 >= c.y0 - 1 && b.y1 - b.y0 >= 0.2 * (c.y1 - c.y0),
        `${JSON.stringify(b)} in ${JSON.stringify(c)}`);
      if (w === 640) await p.shot('16-room-640');
    }
  }
  // C2: the three species, side by side (and each being whole in the frame)
  for (const k of [0, 1, 2]) {
    await p.go(`${base}/labs/heptapod.html?species=${k}`);
    await ready();
    await p.ev('document.getElementById("pod").scrollIntoView({ block: "center" })');
    await p.sleep(1200);
    const b = (await probe()).being.drawn, c = await p.ev('(() => { const r = document.getElementById("pod").getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; })()');
    p.check(`C2: species ${k}'s being is whole in the frame`, b.x0 >= c.x0 - 1 && b.x1 <= c.x1 + 1 && b.y0 >= c.y0 - 1 && b.y1 <= c.y1 + 1, JSON.stringify(b));
    await p.shot(`15-species-${k}`);
  }
  // the page's own script: inked once published (pod/switch.js), and then the visitor's kept day, the same day as in
  // the ring script, kept in the store across a reload
  {
    const published = await p.ev(`import('${base}/labs/assets/js/heptapod/pod/switch.js').then((m) => m.SWITCH.published)`);
    await p.go(`${base}/labs/heptapod.html`);
    p.check('the page comes up in its own script', await ready());
    await p.ev('document.getElementById("pod").scrollIntoView({ block: "center" })');
    const g3 = await probe();
    p.check("the page's own script follows the switch", g3.script === (published ? 'inked' : 'ring'), `${g3.script}, published ${published}`);
    p.check('it is the kept day', (await p.ev('document.getElementById("preview").hidden')) && (await ringNo()).includes('ring 7 of 40'), await ringNo());
    p.check('its greeting forms and can be cropped', await p.until('document.getElementById("pod").probe().crop', 8000));
    await p.sleep(800);
    await p.shot('17-own-script-greeting');
    await p.ev('document.getElementById("pod").focus()');
    const n0 = await entries();
    await p.key('w');
    await p.sleep(300);
    p.check('W keeps a part of the greeting, in the notebook', (await entries()) === n0 + 1, `${n0} -> ${await entries()}`);
    p.check('the part reaches the store', await p.until(`import('${base}/labs/assets/js/os/index.js').then((m) => m.LabsOS.instance && m.LabsOS.instance.progress.get('heptapod')).then((r) => !!r && r.data.entries.length === ${n0 + 1})`, 8000));
    await p.go(`${base}/labs/heptapod.html`);
    p.check('and comes back after a reload', (await ready()) && (await entries()) === n0 + 1, `${await entries()} entries`);
    await p.shot('18-own-script-notebook');
  }
  // the light tier taken in the middle of a crop does not drop it (on 2026-11-18 a tier switch went through the
  // resize handler, which drops a drag; the drive's own canvas reads slowed the frames enough at 1440 px). On the
  // last species' own day, so the kept day is not touched; the tier is taken as the page takes it, by 60 slow frames.
  {
    await p.go(`${base}/labs/heptapod.html?species=2&script=ring`);         // the ring script: the crop below is at its foot
    await ready();
    await p.ev('document.getElementById("pod").scrollIntoView({ block: "center" })');
    p.check('a species greeting can be cropped', await p.until('document.getElementById("pod").probe().crop', 8000));
    // settled first, so the change of grid below meets a ring at rest (a moving one moves on from where it was)
    await p.until('(() => { const f = document.getElementById("pod").probe().field; return f.mass > 10 && f.fit > 0.95; })()', 8000);
    const g2 = await probe();
    const cx = g2.ring.x, cy = g2.ring.y + g2.ring.R, h = 0.55 * g2.ring.R;
    await p.down(cx - h, cy - h);
    await p.move(cx, cy);
    // 120 slow frames: the page judges its frames in batches of 60 and may have some of its own fast ones queued, so a
    // batch of 60 alone can close mixed and keep the tier (the rater's drive at 390 px, 2026-11-18); the second batch is
    // only these
    await p.ev(`import('${base}/labs/assets/js/heptapod/stage.js').then((m) => { for (let i = 0; i < 120; i++) m.Tier.sample(50); return m.Tier.name; })`);
    const mid = await probe();
    await p.sleep(300);
    const laid = (await probe()).field;
    await p.move(cx + h, cy + h);
    await p.up(cx + h, cy + h);
    await p.sleep(250);
    const kept = (await probe()).lastKeep;
    // the field laid again on the light tier's grid keeps the ring's ink (it once began empty, and the ring formed again
    // out of the fog, 2026-11-21)
    p.check("the ring's ink stays through the change of grid", laid.N !== g2.field.N && laid.fit > 0.8, `N ${g2.field.N} to ${laid.N}, fit ${laid.fit}`);
    p.check('a crop goes on through a change of tier and is kept', mid.tier === 'lite' && mid.dragging === 'crop' && !!kept && kept.cells > 0,
      `tier ${mid.tier}, dragging ${mid.dragging} after the change; read ${JSON.stringify(kept)}`);
  }
}
