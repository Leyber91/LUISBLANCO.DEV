/* ============================================================
   blackhole/plate.js — what the visitor keeps: a PNG plate with
   the parameters and the measurement stamped on it, the full state
   as JSON (re-importable), and the object table as CSV.
   ============================================================ */

import { OBJECTS, CITE, VERSION, EHT_RES } from './config.js';
import { facts } from './ask.js';
import { measurement, published, sigmaText, sigNum, s3, spinText, deg, pmText, noShadow, SHADOW_HOW, MEAN_DEF } from './physics.js';
import { Store } from './state.js';
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
/** The stamp's face at a size in px: the drive measures each line in it against the frame. */
export const plateFont = (px, w = 400) => `${w} ${Math.round(px)}px "IBM Plex Mono", ui-monospace, monospace`;
/** Samples per pixel along each axis of a plate; the action card's note quotes it. */
export const PLATE_SS = 2;
const hex = (t) => INK[t].hex;
const rgba = (t, alpha) => `rgba(${rgbOf(hex(t)).join(',')},${alpha})`;

/** The plate's band in units of u = width / 1920 px: its height, the left margin, and each line's baseline. */
export const PLATE_BAND = { h: 232, x: 48, frame: 24 };

/** The plate's stamp, line by line ({ text, px, weight, ink, y }: size and baseline in u), pure so that
 *  plate.test.mjs and the drive read what the plate prints. Every number in physics.js's format for its kind. The
 *  shadow's numbers are physics.measurement's and are printed with the inclination they were measured at, apart
 *  from the camera's (fix_s2_p1 K1, S1); its source label is the card's (SHADOW_HOW; K4, S7); the angle is printed
 *  with its scale's number and the scale's source (S6); what the EHT gave is named by what it is: a shadow in
 *  sigma, or a ring of emission and the sentence that no shadow was measured (ledger row 2; S2). */
export function plateLines(app, day = stamp()) {
  const f = facts(app), s = app.store.all(), ms = measurement(s), o = ms.obj, th = ms.th, cmp = ms.cmp;
  const lines = [{ text: `${o ? o.name : 'Custom hole'}  ·  a = ${spinText(s.a)}  ·  camera at i = ${deg(s.incl)} deg  ·  ${s.view}  ·  ${s.observer}`, px: 26, weight: 600, ink: '--text-bright' },
    { text: `horizon ${s3(f.horizon_radius_M)} M  ·  ISCO ${s3(f.isco_M)} M  ·  shadow ${s3(th.mean)} M across, ${MEAN_DEF}, seen from far away at i = ${deg(ms.incl)} deg (${SHADOW_HOW[th.how].label})`, px: 19, ink: '--text' }];
  if (cmp) {
    const p = cmp.pred;
    lines.push({ text: `on the sky ${pmText(p.value, p.errP, p.errM)} uas at ${pmText(p.thetaG, p.thetaErrP, p.thetaErrM)} uas per M, the scale from ${p.by}`, px: 19, ink: '--text' });
    const eht = cmp.shadow ? `EHT shadow ${published(cmp.shadow.value, cmp.shadow.err, '±')} uas: ${sigmaText(cmp.shadow.sigma)} from this one`
      : cmp.ring ? `EHT ring of emission ${published(cmp.ring.value, cmp.ring.err, '±')} uas, a different quantity: no sigma.  ${noShadow(o.name)}`
        : `far below the EHT's nominal resolution of ${EHT_RES.uas} uas`;
    lines.push({ text: eht, px: 19, ink: '--text' });
    lines.push({ text: `scale: ${p.src}`, px: 15, ink: '--text-dim' });
  }
  lines.push({ text: `Kerr null geodesics, RK4 in Kerr-Schild coordinates · Novikov-Thorne disk, ${s.color} colour · luisblanco.dev/labs · THE LAB · L212 · ${day}`, px: 15, ink: '--text-dim' });
  // baselines from the top of the band: the title, then one step per line by its size
  let y = 52;
  return lines.map((l, i) => { if (i) y += l.px + (l.px > 16 ? 13 : 11); return { ...l, weight: l.weight || 400, y }; });
}

export async function exportPlate(app, W, onProgress) {
  const still = await app.renderer.renderStill(app.frameUniforms(app), W, { ss: PLATE_SS, onProgress });
  if (!still) throw new Error('needs float render targets');
  const { width, height, data } = still;
  const band = Math.round(width / 1920 * PLATE_BAND.h);
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
  // the stamp: plateLines, drawn in the band
  const s = app.store.all(), o = app.model.obj;
  for (const l of plateLines(app)) {
    g.fillStyle = hex(l.ink); g.font = plateFont(l.px * u, l.weight);
    g.fillText(l.text, PLATE_BAND.x * u, height + l.y * u);
  }
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

/** A saved state back on the page, by the way a link opens one: the preset of the object and view it names, then
 *  its own keys, through Store.set, whose rule turns a named object custom when its mass, distance, spin or charge
 *  is not the catalogue's (fix_s2_p1 K5). */
export async function importState(app, file) {
  const text = await file.text();
  const j = JSON.parse(text);
  const st = j.state || j;
  if (!st || typeof st !== 'object') throw new Error('no state object');
  app.tour?.stop();
  const { store } = app;
  store.set({ ...store.preset(store.coerce('obj', st.obj ?? store.get('obj')), store.coerce('view', st.view ?? store.get('view'))), ...st });
}

/** The objects table's columns. Every number a row's prediction uses is a column of that row: the traced mean
 *  diameter and the scale with its errors, so predicted = diameter x scale can be redone from the row alone
 *  (review_s2 P1-3), and the scale's source beside them (fix_s2_p1 S6). Numbers keep 4 significant figures (3 for
 *  a sigma), never fixed decimals (P1-2). */
export const CSV_HEAD = ['object', 'kind', 'mass_Msun', 'mass_err', 'distance_pc', 'distance_err', 'spin', 'spin_tag', 'inclination_deg',
  'shadow_mean_diameter_M', 'shadow_scale', 'shadow_scale_uas_per_M', 'shadow_scale_err_plus', 'shadow_scale_err_minus', 'shadow_scale_source',
  'predicted_shadow_uas', 'predicted_err_plus_uas', 'predicted_err_minus_uas', 'eht_ring_uas', 'eht_ring_err',
  'eht_shadow_uas', 'eht_shadow_err', 'sigma_shadow', 'sources'];

/** One row per object, as CSV_HEAD names the columns: the object as its telescope link opens it (Store.preset),
 *  measured by physics.measurement, the function every other writer calls, at the inclination the row prints
 *  (fix_s2_p1 K1). Pure: plate.test.mjs redoes each prediction from its row. */
export function objectRows() {
  const store = new Store();
  return OBJECTS.map((o) => {
    const ms = measurement(store.preset(o.id, 'telescope'));
    const cmp = ms.cmp, p = cmp ? cmp.pred : null;
    const keys = [o.massSrc, o.distSrc, o.spinSrc, o.inclSrc, o.ruler?.src, o.ruler?.basis, o.eht?.src].filter(Boolean);
    const src = [...new Set(keys.map((k) => CITE[k]))].join(' | ') || o.massNote || '';
    const num = (v) => (v == null ? '' : sigNum(v));
    return [o.name, o.kind, num(o.mass), num(o.massErr), num(o.distPc), num(o.distErr), o.spin, o.spinTag, ms.incl,
      num(ms.th.mean), p ? p.by : '', p ? num(p.thetaG) : '', p ? num(p.thetaErrP) : '', p ? num(p.thetaErrM) : '', p ? p.src : '',
      p ? num(p.value) : '', p ? num(p.errP) : '', p ? num(p.errM) : '', num(cmp?.ring?.value), num(cmp?.ring?.err),
      num(cmp?.shadow?.value), num(cmp?.shadow?.err), cmp?.shadow ? sigNum(cmp.shadow.sigma, 3) : '', src];
  });
}

/** The table as CSV text, quoted where a cell holds a comma, a quote or a line break. Its first line names the data
 *  version, the view each row is measured in and the definition of the diameter. */
export function objectsCsv(day = stamp()) {
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  return [`# luisblanco.dev black-hole objects, data version ${VERSION}, exported ${day}; each row seen from far away at its inclination_deg, the mean diameter ${MEAN_DEF}`, CSV_HEAD.join(',')]
    .concat(objectRows().map((r) => r.map(cell).join(','))).join('\n');
}

export function exportData() {
  download(new Blob([objectsCsv()], { type: 'text/csv' }), `kerr-objects-${VERSION}.csv`);
}
