/* ============================================================
   heptapod/fermat.js — Fermat's principle of least time, air into
   water, both readings.

   Sequential: a ray leaves A at the aim angle, meets the surface and
   bends by the local rule n1 sin(t1) = n2 sin(t2). Variational: of
   every path A -> P -> B with P on the surface, light takes the one
   whose travel time T(P) = (n1 |AP| + n2 |PB|) / c is least. The
   page finds that minimum numerically (golden section) and checks it
   against Snell's law. Scene width: 1.00 m.

   Indices at 589.3 nm [REAL]:
     air   1.000277  P. E. Ciddor, Appl. Opt. 35, 1566 (1996), dry air, 15 C, 101.325 kPa
     water 1.33335   M. Daimon & A. Masumura, Appl. Opt. 46, 3811 (2007), 20 C Sellmeier fit
   ============================================================ */

import { palette, fitCanvas } from './render.js';

export const N_AIR = 1.000277;
export const N_WATER = 1.33335;
export const C_LIGHT = 299792458; // m/s, exact by definition of the metre

const D2R = Math.PI / 180;

export function travelTime(A, B, x, n1 = N_AIR, n2 = N_WATER) {
  return (n1 * Math.hypot(x - A.x, A.y) + n2 * Math.hypot(B.x - x, B.y)) / C_LIGHT;
}

/** Golden-section search for the least-time crossing point (T is convex in x). */
export function leastTime(A, B, n1 = N_AIR, n2 = N_WATER) {
  let lo = Math.min(A.x, B.x) - 0.5, hi = Math.max(A.x, B.x) + 0.5;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = hi - g * (hi - lo), d = lo + g * (hi - lo);
  for (let i = 0; i < 90; i++) {
    if (travelTime(A, B, c, n1, n2) < travelTime(A, B, d, n1, n2)) hi = d; else lo = c;
    c = hi - g * (hi - lo); d = lo + g * (hi - lo);
  }
  const x = (lo + hi) / 2;
  const s1 = (x - A.x) / Math.hypot(x - A.x, A.y), s2 = (B.x - x) / Math.hypot(B.x - x, B.y);
  return { x, T: travelTime(A, B, x, n1, n2), t1: Math.asin(s1) / D2R, t2: Math.asin(s2) / D2R, snell1: n1 * s1, snell2: n2 * s2 };
}

/** The crossing point from Snell's law alone: bisection on n1 sin t1 - n2 sin t2 = 0. */
export function snellPoint(A, B, n1 = N_AIR, n2 = N_WATER) {
  let lo = Math.min(A.x, B.x), hi = Math.max(A.x, B.x);
  const f = (x) => n1 * (x - A.x) / Math.hypot(x - A.x, A.y) - n2 * (B.x - x) / Math.hypot(B.x - x, B.y);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

export function mountFermat({ canvas, mode, aim, aimV, snap, nums, n2, n2v }) {
  // scene coordinates in metres: x in [-0.5, 0.5], y down, surface at y = 0
  const st = { A: { x: -0.3, y: -0.16 }, B: { x: 0.26, y: 0.15 }, aimDeg: 40, mode: 'var', drag: null, n2: N_WATER };
  const P = palette();
  let xf = null;

  const toPx = (p) => [xf.ox + p.x * xf.s, xf.oy + p.y * xf.s];
  const fromPx = (X, Y) => ({ x: (X - xf.ox) / xf.s, y: (Y - xf.oy) / xf.s });

  function draw() {
    const { w, h, dpr } = fitCanvas(canvas);
    const ctx = canvas.getContext('2d');
    xf = { s: w, ox: w / 2, oy: h * 0.42 };
    const floor = h * 0.76; // below this, the plot band
    ctx.clearRect(0, 0, w, h);
    // water
    ctx.fillStyle = 'rgba(159,179,214,0.045)';
    ctx.fillRect(0, xf.oy, w, floor - xf.oy);
    ctx.strokeStyle = P.line; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(0, floor); ctx.lineTo(w, floor); ctx.stroke();
    ctx.strokeStyle = P.lineB; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(0, xf.oy); ctx.lineTo(w, xf.oy); ctx.stroke();
    ctx.strokeStyle = P.line;
    for (let k = 1; k < 5; k++) { const y = xf.oy + k * (floor - xf.oy) / 5; ctx.setLineDash([2 * dpr, 7 * dpr]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = `500 ${10.5 * dpr}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = P.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`AIR  n = ${N_AIR}`, 12 * dpr, 12 * dpr);
    ctx.fillText(Math.abs(st.n2 - N_WATER) < 1e-6 ? `WATER  n = ${N_WATER}` : `LOWER MEDIUM  n = ${st.n2.toFixed(4)}`, 12 * dpr, xf.oy + 10 * dpr);
    ctx.textAlign = 'right';
    ctx.fillText('1.00 m', w - 12 * dpr, 12 * dpr);
    // scale bar
    ctx.strokeStyle = P.faint; ctx.beginPath(); ctx.moveTo(w - 12 * dpr - 0.2 * xf.s, 30 * dpr); ctx.lineTo(w - 12 * dpr, 30 * dpr); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText('0.20 m', w - 12 * dpr, 34 * dpr);

    const { A, B } = st;
    const best = leastTime(A, B, N_AIR, st.n2);
    const xs = snellPoint(A, B, N_AIR, st.n2);
    const [ax, ay] = toPx(A), [bx, by] = toPx(B);
    const span = [Math.min(A.x, B.x) - 0.12, Math.max(A.x, B.x) + 0.12];

    if (st.mode === 'var') {
      // every candidate path, faint by how much slower it is
      const N = 31, Ts = [];
      for (let i = 0; i < N; i++) { const x = span[0] + (span[1] - span[0]) * i / (N - 1); Ts.push([x, travelTime(A, B, x, N_AIR, st.n2)]); }
      const Tmax = Math.max(...Ts.map((t) => t[1]));
      for (const [x, T] of Ts) {
        const k = (T - best.T) / (Tmax - best.T + 1e-30);
        ctx.strokeStyle = P.horizon; ctx.globalAlpha = 0.06 + 0.32 * (1 - k) ** 3; ctx.lineWidth = dpr;
        const [px, py] = toPx({ x, y: 0 });
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // the travel-time valley in the band below, its floor under the chosen point
      const top = floor + 22 * dpr, base = h - 10 * dpr;
      ctx.strokeStyle = P.dim; ctx.lineWidth = 1.2 * dpr; ctx.beginPath();
      const M = 120;
      for (let i = 0; i <= M; i++) {
        const x = span[0] + (span[1] - span[0]) * i / M, T = travelTime(A, B, x, N_AIR, st.n2);
        const k = (T - best.T) / (Tmax - best.T + 1e-30);
        const [px] = toPx({ x, y: 0 });
        const py = base - (base - top) * Math.min(1, k);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      const [mx] = toPx({ x: best.x, y: 0 });
      ctx.setLineDash([2 * dpr, 4 * dpr]); ctx.strokeStyle = P.goldDim;
      ctx.beginPath(); ctx.moveTo(mx, xf.oy); ctx.lineTo(mx, base); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('TRAVEL TIME BY CROSSING POINT', 12 * dpr, floor + 6 * dpr);
      // the chosen path
      ctx.save(); ctx.shadowColor = P.gold; ctx.shadowBlur = 12 * dpr;
      ctx.strokeStyle = P.goldSoft; ctx.lineWidth = 2.2 * dpr;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, xf.oy); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
      ctx.fillStyle = P.goldSoft; ctx.beginPath(); ctx.arc(mx, base, 3.2 * dpr, 0, Math.PI * 2); ctx.fill();
    } else {
      // one ray, aimed, bent at the surface by the local rule
      const t1 = st.aimDeg * D2R;
      const px = A.x + (-A.y) * Math.tan(t1);
      const s2 = (N_AIR / st.n2) * Math.sin(t1);
      const t2 = Math.asin(s2);
      const yEnd = (floor - xf.oy) / xf.s;
      const ex = px + yEnd * Math.tan(t2);
      const [ppx, ppy] = toPx({ x: px, y: 0 }), [epx, epy] = toPx({ x: ex, y: yEnd });
      ctx.save(); ctx.shadowColor = P.horizon; ctx.shadowBlur = 8 * dpr;
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.8 * dpr;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ppx, ppy); ctx.lineTo(epx, epy); ctx.stroke(); ctx.restore();
      // the normal at the surface
      ctx.strokeStyle = P.faint; ctx.setLineDash([3 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(ppx, ppy - 60 * dpr); ctx.lineTo(ppx, ppy + 60 * dpr); ctx.stroke(); ctx.setLineDash([]);
      // where it passes B's depth
      const xb = px + B.y * Math.tan(t2);
      const [qx, qy] = toPx({ x: xb, y: B.y });
      const hit = Math.abs(xb - B.x) < 0.004;
      ctx.strokeStyle = hit ? P.goldSoft : P.dim; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.arc(qx, qy, 5 * dpr, 0, Math.PI * 2); ctx.stroke();
      st.miss = xb - B.x;
      st.t2seq = t2 / D2R;
    }
    // endpoints
    for (const [p, name] of [[A, 'A'], [B, 'B']]) {
      const [x, y] = toPx(p);
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.goldDim; ctx.lineWidth = dpr; ctx.beginPath(); ctx.arc(x, y, 11 * dpr, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(name, x + 15 * dpr, y);
    }
    // numbers
    const rows = st.mode === 'var' ? [
      ['least time', `${(best.T * 1e9).toFixed(4)} ns`, true],
      ['angle in air', `${best.t1.toFixed(2)} deg`],
      ['angle in water', `${best.t2.toFixed(2)} deg`],
      ['n1 sin t1', best.snell1.toFixed(6)],
      ['n2 sin t2', best.snell2.toFixed(6)],
      ['crossing, least time', `x = ${(best.x * 1000).toFixed(3)} mm`],
      ['crossing, Snell alone', `x = ${(xs * 1000).toFixed(3)} mm`],
      ['they agree to', `${(Math.abs(best.x - xs) / 1.0 * 100).toExponential(1)} % of the scene`, true],
    ] : [
      ['aim in air', `${st.aimDeg.toFixed(1)} deg`, true],
      ['bent to', `${st.t2seq.toFixed(2)} deg in water`],
      ['misses B by', `${(st.miss * 1000).toFixed(1)} mm`, Math.abs(st.miss) < 0.004],
      ['least-time aim', `${best.t1.toFixed(2)} deg`],
    ];
    nums.textContent = '';
    for (const [k, v, g] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v; if (g) dd.className = 'gold';
      nums.append(dt, dd);
    }
    aimV.textContent = st.aimDeg.toFixed(1) + ' deg';
    aim.disabled = st.mode !== 'seq';
    snap.disabled = st.mode !== 'seq';
  }

  const pick = (ev) => {
    const r = canvas.getBoundingClientRect();
    const dpr = canvas.width / r.width;
    return fromPx((ev.clientX - r.left) * dpr, (ev.clientY - r.top) * dpr);
  };
  canvas.addEventListener('pointerdown', (ev) => {
    const p = pick(ev);
    const dA = Math.hypot(p.x - st.A.x, p.y - st.A.y), dB = Math.hypot(p.x - st.B.x, p.y - st.B.y);
    st.drag = dA < dB ? 'A' : 'B';
    canvas.setPointerCapture(ev.pointerId);
    move(ev);
  });
  const move = (ev) => {
    if (!st.drag) return;
    const p = pick(ev);
    const lim = (v, a, b) => Math.max(a, Math.min(b, v));
    const asp = canvas.height / canvas.width;
    if (st.drag === 'A') st.A = { x: lim(p.x, -0.47, 0.47), y: lim(p.y, -0.42 * asp + 0.03, -0.03) };
    else st.B = { x: lim(p.x, -0.47, 0.47), y: lim(p.y, 0.03, 0.34 * asp - 0.02) };
    draw();
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', () => { st.drag = null; });
  canvas.addEventListener('pointercancel', () => { st.drag = null; });
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (ev) => {
    const d = ev.shiftKey ? 0.05 : 0.01;
    const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[ev.key];
    if (!k) return;
    st.B = { x: Math.max(-0.47, Math.min(0.47, st.B.x + k[0])), y: Math.max(0.03, Math.min(0.34 * canvas.height / canvas.width - 0.02, st.B.y + k[1])) };
    draw(); ev.preventDefault();
  });
  canvas.setAttribute('aria-label', 'Refraction from air into water. Drag A or B; arrow keys move B.');

  mode.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-v]');
    if (!b) return;
    st.mode = b.dataset.v;
    mode.querySelectorAll('button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
    draw();
  });
  aim.addEventListener('input', () => { st.aimDeg = Number(aim.value); draw(); });
  snap.addEventListener('click', () => { st.aimDeg = leastTime(st.A, st.B, N_AIR, st.n2).t1; aim.value = String(st.aimDeg); draw(); });
  if (n2) {
    n2.addEventListener('input', () => { st.n2 = Number(n2.value); n2v.textContent = st.n2.toFixed(4); draw(); });
    n2v.textContent = st.n2.toFixed(5);
  }
  addEventListener('resize', () => draw());
  draw();
  return { draw };
}
