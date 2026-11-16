/* ============================================================
   blackhole/plate.js — what the visitor keeps: a PNG plate with
   the parameters and the measurement stamped on it, the full state
   as JSON (re-importable), and the object table as CSV.
   ============================================================ */

import { OBJECTS, CITE, VERSION } from './config.js';
import { facts } from './ask.js';
import { theoryShadow, shadowFor, compareShadow, published, sigmaText, sigNum, s3, spinText, deg } from './physics.js';
import { INK, MARKS, rgbOf } from './palette.js';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

const stamp = () => new Date().toISOString().slice(0, 10);
/** Samples per pixel along each axis of a plate; the action card's note quotes it. */
export const PLATE_SS = 2;
const hex = (t) => INK[t].hex;
const rgba = (t, alpha) => `rgba(${rgbOf(hex(t)).join(',')},${alpha})`;

export async function exportPlate(app, W, onProgress) {
  const still = await app.renderer.renderStill(app.frameUniforms(app), W, { ss: PLATE_SS, onProgress });
  if (!still) throw new Error('needs float render targets');
  const { width, height, data } = still;
  const band = Math.round(width * 0.075);
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height + band;
  const g = cv.getContext('2d');
  g.fillStyle = hex('--void'); g.fillRect(0, 0, cv.width, cv.height);
  g.putImageData(new ImageData(data, width, height), 0, 0);
  const u = width / 1920;
  // hairline frame and the corner brackets, the plate's one gold mark (palette.js MARKS.plate)
  g.strokeStyle = rgba('--horizon', 0.35); g.lineWidth = Math.max(1, u);
  g.strokeRect(24 * u, 24 * u, width - 48 * u, cv.height - 48 * u);
  g.strokeStyle = hex(MARKS.plate); g.lineWidth = Math.max(1, 1.5 * u);
  const L = 26 * u, m = 24 * u;
  [[m, m, 1, 1], [width - m, m, -1, 1], [m, cv.height - m, 1, -1], [width - m, cv.height - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
  });
  // the stamp: every number in physics.js's format for its kind
  const f = facts(app), s = app.store.all();
  const o = app.model.obj;
  const ts = shadowFor(s.a, s.view === 'telescope' ? s.incl : (o ? o.incl : 90), s.q);
  // the comparison with the EHT is compareShadow's (ledger row 2): a sigma only between two shadows; the angle is
  // printed beside the diameter it was computed from, the mean, said "across" (review_s2 P2-3)
  const cmp = o ? compareShadow(ts.mean, o) : null;
  const font = (px, w = 400) => `${w} ${Math.round(px * u)}px "IBM Plex Mono", ui-monospace, monospace`;
  const y0 = height + band * 0.42;
  g.fillStyle = hex('--text-bright'); g.font = font(26, 600);
  g.fillText(`${o ? o.name : 'Custom hole'}  ·  a = ${spinText(s.a)}  ·  i = ${deg(s.incl)} deg  ·  ${s.view}  ·  ${s.observer}`, 48 * u, y0);
  g.fillStyle = hex('--text'); g.font = font(19);
  let line2 = `horizon ${s3(f.horizon_radius_M)} M  ·  ISCO ${s3(f.isco_M)} M  ·  shadow ${s3(ts.mean)} M across (Bardeen 1973, traced)`;
  if (cmp && cmp.shadow) line2 += `  ·  ${s3(cmp.pred.value)} uas vs EHT shadow ${published(cmp.shadow.value, cmp.shadow.err, '±')} (${sigmaText(cmp.shadow.sigma)})`;
  else if (cmp && cmp.ring) line2 += `  ·  ${s3(cmp.pred.value)} uas; EHT ring of emission ${published(cmp.ring.value, cmp.ring.err, '±')} (no shadow published)`;
  g.fillText(line2, 48 * u, y0 + 32 * u);
  g.fillStyle = hex('--text-dim'); g.font = font(16);
  g.fillText(`Kerr null geodesics, RK4 in Kerr-Schild coordinates · Novikov-Thorne disk, ${s.color} colour · luisblanco.dev/labs · THE LAB · L212 · ${stamp()}`, 48 * u, y0 + 58 * u);
  await new Promise((res) => cv.toBlob((b) => { download(b, `kerr-${o ? o.id : 'custom'}-a${spinText(s.a)}-i${Math.round(s.incl)}-${width}px.png`); res(); }, 'image/png'));
}

export function exportState(app) {
  const body = {
    kind: 'luisblanco.dev black-hole state', version: VERSION, saved: new Date().toISOString(),
    url: location.origin + location.pathname + '?' + app.store.toQuery(),
    state: app.store.all(), derived: facts(app),
    sources: CITE,
  };
  download(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }), `kerr-state-${stamp()}.json`);
}

export async function importState(app, file) {
  const text = await file.text();
  const j = JSON.parse(text);
  const st = j.state || j;
  if (typeof st !== 'object') throw new Error('no state object');
  app.tour?.stop();
  app.store.set(st);
}

/** The objects table's columns. Every number a row's prediction uses is a column of that row: the traced mean
 *  diameter and the scale with its errors, so predicted = diameter x scale can be redone from the row alone
 *  (review_s2 P1-3). Numbers keep 4 significant figures (3 for a sigma), never fixed decimals (P1-2). */
export const CSV_HEAD = ['object', 'kind', 'mass_Msun', 'mass_err', 'distance_pc', 'distance_err', 'spin', 'spin_tag', 'inclination_deg',
  'shadow_mean_diameter_M', 'shadow_scale', 'shadow_scale_uas_per_M', 'shadow_scale_err_plus', 'shadow_scale_err_minus',
  'predicted_shadow_uas', 'predicted_err_plus_uas', 'predicted_err_minus_uas', 'eht_ring_uas', 'eht_ring_err',
  'eht_shadow_uas', 'eht_shadow_err', 'sigma_shadow', 'sources'];

/** One row per object, as CSV_HEAD names the columns. Pure: plate.test.mjs redoes each prediction from its row. */
export function objectRows() {
  return OBJECTS.map((o) => {
    const ts = theoryShadow(o.spin, o.incl);
    const cmp = compareShadow(ts.mean, o), p = cmp ? cmp.pred : null;
    const keys = [o.massSrc, o.distSrc, o.spinSrc, o.inclSrc, o.ruler?.src, o.ruler?.basis, o.eht?.src].filter(Boolean);
    const src = [...new Set(keys.map((k) => CITE[k]))].join(' | ') || o.massNote || '';
    const num = (v) => (v == null ? '' : sigNum(v));
    return [o.name, o.kind, num(o.mass), num(o.massErr), num(o.distPc), num(o.distErr), o.spin, o.spinTag, o.incl,
      num(ts.mean), p ? p.by : '', p ? num(p.thetaG) : '', p ? num(p.thetaErrP) : '', p ? num(p.thetaErrM) : '',
      p ? num(p.value) : '', p ? num(p.errP) : '', p ? num(p.errM) : '', num(cmp?.ring?.value), num(cmp?.ring?.err),
      num(cmp?.shadow?.value), num(cmp?.shadow?.err), cmp?.shadow ? sigNum(cmp.shadow.sigma, 3) : '', src];
  });
}

/** The table as CSV text, quoted where a cell holds a comma, a quote or a line break. */
export function objectsCsv(day = stamp()) {
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  return [`# luisblanco.dev black-hole objects, data version ${VERSION}, exported ${day}`, CSV_HEAD.join(',')]
    .concat(objectRows().map((r) => r.map(cell).join(','))).join('\n');
}

export function exportData() {
  download(new Blob([objectsCsv()], { type: 'text/csv' }), `kerr-objects-${VERSION}.csv`);
}
