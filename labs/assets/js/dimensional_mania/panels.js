/* ============================================================
   dimensional_mania/panels.js — the linked 2D views beside the shadow:
     · MatrixView  the live rotation matrix R (n x n), split where the
                   screen's three axes end
     · ProfileView the measure of the cut against h, with the cube's
                   closed form dashed beside it
     · CountsView  the f-vector, how each number was obtained, the
                   reference value, and the Euler-Poincare sum
     · LedgerView  the shadow ledger: what each hidden axis does to the picture
     · Reticle     the registration ring around the object; its gold mark
                   is the turn of the plane on the dial
   ============================================================ */

import { AXES, PALETTE, RANK, HOW } from './constants.js';
import { el, fmt, sup } from './dom.js';
import { ledgerValue } from './narrator.js';

const C = PALETTE.css;

/** the width of an element's content box */
export function innerWidth(node) {
  const cs = getComputedStyle(node);
  return Math.floor(node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
}

function fitCanvas(cv, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv._w !== cssW || cv._h !== cssH || cv._d !== dpr) {
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    cv._w = cssW; cv._h = cssH; cv._d = dpr;
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cssW, cssH);
  return g;
}

/** the matrix entry as printed: 3 decimals, leading zero dropped, a real minus sign */
export const matrixEntry = (v) => (Math.abs(v) < 5e-4 ? '0' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(3).replace(/^0/, ''));

/**
 * The matrix layout for a box of a given width. The cell is 31 px at every n,
 * the size that holds a 3-decimal entry such as "−.707" (5 characters of
 * IBM Plex Mono at 9 px, 0.6 em each: 27 px) inside its 29 px fill. Until G1
 * the cells shrank past 6D and the numbers were switched off; now the
 * canvas grows instead and its box scrolls sideways (over = true).
 */
export const MATRIX_CELL = 31, MATRIX_FONT = 9, MATRIX_PAD = 18;
export function matrixLayout(box, n) {
  const W = Math.max(box, MATRIX_PAD + MATRIX_CELL * n + 2);
  return { pad: MATRIX_PAD, cell: MATRIX_CELL, font: MATRIX_FONT, W, H: MATRIX_PAD + MATRIX_CELL * n + 2, over: W > box };
}

export class MatrixView {
  constructor(canvas, note = null) {
    this.cv = canvas; this.wrap = canvas.parentElement; this.note = note; this.last = null; this.over = null;
    // the row labels stay pinned at the left edge while the matrix scrolls
    this.wrap.addEventListener('scroll', () => { if (this.last) this.draw(...this.last); }, { passive: true });
  }
  /** M is R (the pose) or A (the generator of the motion, skew-symmetric) */
  draw(M, n, sel, mode = 'R') {
    this.last = [M, n, sel, mode];
    const box = Math.max(160, innerWidth(this.wrap));
    // every n prints its numbers: the cell keeps the size 3 decimals need, and the box scrolls instead
    const { pad, cell, font, W, H, over } = matrixLayout(box, n);
    const g = fitCanvas(this.cv, W, H);
    this._overflow(over, n, mode);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const x0 = pad, y0 = pad;
    let scale = 1;
    if (mode === 'A') { scale = 0; for (let i = 0; i < n * n; i++) scale = Math.max(scale, Math.abs(M[i])); scale = scale || 1; }
    g.font = `500 ${font}px "IBM Plex Mono", monospace`;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = M[i * n + j];
      const a = Math.min(1, Math.abs(v) / scale);
      const x = x0 + cell * j, y = y0 + cell * i;
      g.fillStyle = v >= 0 ? `rgba(159,179,214,${(0.06 + 0.6 * a).toFixed(3)})` : `rgba(86,93,114,${(0.05 + 0.42 * a).toFixed(3)})`;
      g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (v < 0 && a > 0.05) { // negative entries carry a hairline slash
        g.strokeStyle = `rgba(197,204,216,${(0.18 + 0.45 * a).toFixed(3)})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 3, y + cell - 3); g.lineTo(x + cell - 3, y + 3); g.stroke();
      }
      g.fillStyle = a > 0.62 && v >= 0 ? C.void : C.bright;
      g.fillText(matrixEntry(v), x + cell / 2, y + cell / 2 + 0.5, cell - 3); // "−1.000" is 6 characters: held inside its cell
    }
    if (n > 3 && mode === 'R') { // the screen sees the first three rows (exactly so in orthographic)
      g.strokeStyle = C.goldDim; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(x0, y0 + cell * 3 + 0.5); g.lineTo(x0 + cell * n, y0 + cell * 3 + 0.5);
      g.moveTo(x0 + cell * 3 + 0.5, y0); g.lineTo(x0 + cell * 3 + 0.5, y0 + cell * n);
      g.stroke(); g.setLineDash([]);
    }
    // axis labels last: the row labels ride the scroll offset over an opaque gutter, and the gutter
    // swallows any column the scroll has half hidden, so no entry is ever shown clipped ("885" for "−.885")
    const sx = Math.max(0, Math.min(this.wrap.scrollLeft || 0, W - box));
    const firstCol = sx > 0 ? Math.ceil((sx + pad - x0) / cell - 1e-9) : 0;
    if (sx > 0) { g.fillStyle = C.void; g.fillRect(sx, 0, x0 + cell * firstCol - sx, H); }
    g.font = 'italic 500 11px "STIX Two Text", Georgia, serif';
    for (let k = 0; k < n; k++) {
      const hot = sel && (k === sel[0] || k === sel[1]);
      g.fillStyle = hot ? C.gold : C.dim;
      if (k >= firstCol) g.fillText(AXES[k], x0 + cell * k + cell / 2, 8);
      g.fillText(AXES[k], sx + 8, y0 + cell * k + cell / 2);
    }
  }

  /** when the matrix is wider than its box, say so and let the keyboard scroll it */
  _overflow(over, n, mode) {
    const key = over ? `${n}:${mode}` : '';
    if (key === this.over) return;
    this.over = key;
    if (over) { this.wrap.tabIndex = 0; this.wrap.setAttribute('aria-label', `the ${n} by ${n} matrix ${mode}, scrolls sideways`); }
    else { this.wrap.removeAttribute('tabindex'); this.wrap.removeAttribute('aria-label'); this.wrap.scrollLeft = 0; }
    if (!this.note) return;
    this.note.hidden = !over;
    this.note.textContent = over ? `${mode} is ${n} × ${n}, wider than this panel: scroll it sideways to column ${AXES[n - 1]}; the row names stay at the left.` : '';
  }
}

export class ProfileView {
  constructor(canvas) { this.cv = canvas; }
  draw(p, h, n, label) {
    const W = Math.max(160, innerWidth(this.cv.parentElement));
    const H = 78;
    const g = fitCanvas(this.cv, W, H);
    const L = 4, Rr = W - 4, top = 10, base = H - 22;
    const X = (x) => L + ((x + 1) / 2) * (Rr - L);
    g.strokeStyle = C.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, base + 0.5); g.lineTo(Rr, base + 0.5); g.stroke();
    for (let t = -1; t <= 1.001; t += 0.5) { g.beginPath(); g.moveTo(X(t) + 0.5, base); g.lineTo(X(t) + 0.5, base + 4); g.stroke(); }
    g.font = '500 11px "IBM Plex Mono", monospace'; g.fillStyle = C.dim; g.textBaseline = 'top';
    const ax = AXES[n - 1];
    g.textAlign = 'left'; g.fillText(`${ax} = −1`, L, base + 7);
    g.textAlign = 'right'; g.fillText(`+1`, Rr, base + 7);
    g.textAlign = 'center'; g.fillText('0', X(0), base + 7);
    if (!p) return;
    // vertex heights: the cut changes type only where it crosses one
    g.strokeStyle = 'rgba(159,179,214,0.22)';
    g.beginPath();
    for (const w of p.heights) { const x = Math.round(X(w)) + 0.5; g.moveTo(x, base - 3); g.lineTo(x, base + 1); }
    g.stroke();
    const peak = Math.max(p.peak, 1e-9) * 1.12;
    const Y = (m) => base - (m / peak) * (base - top);
    if (p.refs) {
      g.strokeStyle = C.horizon; g.lineWidth = 1; g.setLineDash([2, 3]);
      g.beginPath();
      p.hs.forEach((hh, i) => { const x = X(hh), y = Y(p.refs[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
    }
    g.strokeStyle = C.gold; g.lineWidth = 1.6;
    g.beginPath();
    p.hs.forEach((hh, i) => { const x = X(hh), y = Y(p.vals[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = 'rgba(212,162,76,0.07)';
    g.beginPath(); g.moveTo(X(p.hs[0]), base);
    p.hs.forEach((hh, i) => g.lineTo(X(hh), Y(p.vals[i])));
    g.lineTo(X(p.hs[p.hs.length - 1]), base); g.closePath(); g.fill();
    // the cursor
    const cx = X(Math.max(-1, Math.min(1, h)));
    g.strokeStyle = C.goldSoft; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + 0.5, top - 4); g.lineTo(cx + 0.5, base); g.stroke();
    if (label != null) {
      const y = Y(label);
      g.fillStyle = C.goldSoft; g.beginPath(); g.arc(cx, y, 2.6, 0, Math.PI * 2); g.fill();
    }
  }
}

export class CountsView {
  constructor(host) { this.host = host; }
  render(o) {
    const rows = o.fvec.map((f) => {
      const rank = o.curved ? ['vertices', 'edges', 'faces'][f.k] : RANK[f.k];
      const ref = f.ref == null ? '<td class="ref na">n/a</td>'
        : `<td class="ref ${f.ref === f.count ? 'ok' : 'bad'}">${fmt(f.ref)}<i>${f.ref === f.count ? 'match' : 'differs'}</i></td>`;
      return `<tr><td class="rk">${rank}</td><td class="ct">${fmt(f.count)}</td><td class="how" title="${HOW[f.how]}"><span class="h-${f.how}">${f.how}</span></td>${ref}</tr>`;
    }).join('');
    let euler = '';
    if (o.euler && !o.curved) {
      const terms = o.fvec.map((f, i) => (i === 0 ? '' : f.k % 2 ? ' − ' : ' + ') + fmt(f.count)).join('');
      euler = `<div class="euler"><span class="lbl">Euler-Poincaré</span> ${terms} = <b>${o.euler.chi}</b>
        <span class="exp">expected 1 − (−1)${sup(o.n)} = ${o.euler.expected}</span> <span class="${o.euler.ok ? 'ok' : 'bad'}">${o.euler.ok ? 'holds' : 'fails'}</span></div>`;
    } else if (o.euler && o.curved) {
      euler = `<div class="euler"><span class="lbl">Euler, on its grid</span> V − E + F = ${fmt(o.fvec[0].count)} − ${fmt(o.fvec[1].count)} + ${fmt(o.fvec[2].count)} = <b>${o.euler.chi}</b>
        <span class="exp">a torus has χ = 0</span> <span class="${o.euler.ok ? 'ok' : 'bad'}">${o.euler.ok ? 'holds' : 'fails'}</span></div>`;
    } else if (o.id === 'hopf') {
      euler = `<div class="euler"><span class="lbl">not a polytope</span> ${o.fibres.length} great circles of S³, ${o.fibres[0].count} samples each. Their invariant is the linking number, measured below the view.</div>`;
    }
    const head = o.curved
      ? `<tr><th>part</th><th>count</th><th>how</th><th>ref</th></tr>`
      : `<tr><th>rank</th><th>count</th><th>how</th><th>Table I</th></tr>`;
    this.host.innerHTML = `<table class="fv">${head}${rows}</table>${euler}`;
  }
}

export class LedgerView {
  constructor(host, head) { this.host = host; this.head = head; this.rows = {}; this.key = ''; }
  build(n, mode) {
    const key = `${n}:${mode}`;
    if (key === this.key) return;
    this.key = key;
    this.host.innerHTML = '';
    this.rows = {};
    if (n <= 3) {
      this.head.textContent = 'shadow ledger';
      this.host.appendChild(el('p', 'ledger-empty', n === 3 ? 'Nothing is hidden in 3D: the view is the object itself. Step up to 4D to see a shadow.' : 'Nothing is hidden: the object lies in the screen.'));
      return;
    }
    this.head.textContent = mode === 'ortho' ? 'shadow ledger · depth dropped'
      : mode === 'stereo' ? 'shadow ledger · stretch' : 'shadow ledger · scale per axis';
    const axes = mode === 'stereo' ? [3] : Array.from({ length: n - 3 }, (_, i) => 3 + i);
    for (const d of axes.slice(0, 7)) {
      const r = el('div', 'lrow', `<span class="lax">${AXES[d]}</span><span class="ltrack"><span class="lfill"></span></span><span class="lval">0.00</span>`);
      this.host.appendChild(r);
      this.rows[d] = { r, fill: r.querySelector('.lfill'), val: r.querySelector('.lval') };
    }
  }
  /** L is the report from project.js shadowLedger(); the sentence under the bars reads the same report */
  tick(L) {
    const full = L.mode === 'ortho' ? 1 : L.mode === 'stereo' ? 8 : 1.4;
    for (const d in this.rows) {
      const a = L.entry(+d);
      const row = this.rows[d];
      row.fill.style.width = `${Math.min(100, ((a ? a.dev : 0) / full) * 100).toFixed(1)}%`;
      row.val.textContent = ledgerValue(a, L.mode);
      row.r.classList.toggle('hot', +d === L.hot && L.flagged);
    }
    return L;
  }
}

export class Reticle {
  constructor(svg) {
    this.svg = svg;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    this.ring = mk('circle', { cx: 0, cy: 0, r: 100, class: 'rt-ring' });
    this.ticks = mk('path', { class: 'rt-ticks', d: '' });
    this.mark = mk('path', { class: 'rt-mark', d: '' });
    this.label = mk('text', { class: 'rt-label', x: 0, y: 0 });
    this.r = 0;
  }
  layout(cx, cy, r) {
    this.cx = cx; this.cy = cy;
    this.svg.setAttribute('viewBox', `${-cx} ${-cy} ${window.innerWidth} ${window.innerHeight}`);
    if (Math.abs(r - this.r) < 0.5) return;
    this.r = r;
    this.ring.setAttribute('r', r.toFixed(1));
    let d = '';
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2, len = k % 18 === 0 ? 9 : k % 6 === 0 ? 5 : 2.5;
      const c = Math.cos(a), s = Math.sin(a);
      d += `M${(c * r).toFixed(1)} ${(s * r).toFixed(1)}L${(c * (r + len)).toFixed(1)} ${(s * (r + len)).toFixed(1)}`;
    }
    this.ticks.setAttribute('d', d);
  }
  /** angle in radians (the dial's turn), label e.g. "X–W 37°" */
  set(angle, text, on) {
    const r = this.r, a = angle - Math.PI / 2;
    const a0 = -Math.PI / 2;
    const large = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) > Math.PI ? 1 : 0;
    const R2 = r - 5;
    const ex = Math.cos(a) * R2, ey = Math.sin(a) * R2;
    const arc = Math.abs(angle) < 1e-3 ? '' : `M${(Math.cos(a0) * R2).toFixed(1)} ${(Math.sin(a0) * R2).toFixed(1)}A${R2} ${R2} 0 ${large} ${angle >= 0 ? 1 : 0} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    const tip = `M${(Math.cos(a) * (r - 12)).toFixed(1)} ${(Math.sin(a) * (r - 12)).toFixed(1)}L${(Math.cos(a) * (r + 12)).toFixed(1)} ${(Math.sin(a) * (r + 12)).toFixed(1)}`;
    this.mark.setAttribute('d', on ? arc + tip : '');
    // the label sits outside the ring, or inside it when the ring is near the screen edge
    // or when outside would put it on the hint line (guard: that line's box, in viewport pixels)
    let out = this.r + 22 < Math.min(this.cx, window.innerWidth - this.cx) - 70;
    const g = this.guard;
    if (out && g) {
      const lx = this.cx + Math.cos(a) * (r + 22), ly = this.cy + Math.sin(a) * (r + 22);
      if (ly - 12 < g.bottom + 4 && ly > g.top - 4 && lx > g.left - 60 && lx < g.right + 60) out = false;
    }
    const lr = out ? r + 22 : r - 26;
    this.label.setAttribute('x', (Math.cos(a) * lr).toFixed(1));
    this.label.setAttribute('y', (Math.sin(a) * lr).toFixed(1));
    const right = Math.cos(a) > 0.2, left = Math.cos(a) < -0.2;
    this.label.setAttribute('text-anchor', out ? (right ? 'start' : left ? 'end' : 'middle') : (right ? 'end' : left ? 'start' : 'middle'));
    this.label.textContent = on ? text : '';
  }
}
