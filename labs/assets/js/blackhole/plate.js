/* ============================================================
   blackhole/plate.js — what the visitor keeps: a PNG plate with
   the parameters and the measurement stamped on it, the full state
   as JSON (re-importable), and the object table as CSV.
   ============================================================ */

import { OBJECTS, CITE, VERSION } from './config.js';
import { facts } from './ask.js';
import { theoryShadow, shadowFor, predictedUas, sigmaDiff, sci } from './physics.js';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportPlate(app, W, onProgress) {
  const still = await app.renderer.renderStill(app.frameUniforms(app), W, { ss: 2, onProgress });
  if (!still) throw new Error('needs float render targets');
  const { width, height, data } = still;
  const band = Math.round(width * 0.075);
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = height + band;
  const g = cv.getContext('2d');
  g.fillStyle = '#06080D'; g.fillRect(0, 0, cv.width, cv.height);
  g.putImageData(new ImageData(data, width, height), 0, 0);
  const u = width / 1920;
  // hairline frame and gold corner brackets
  g.strokeStyle = 'rgba(159,179,214,0.35)'; g.lineWidth = Math.max(1, u);
  g.strokeRect(24 * u, 24 * u, width - 48 * u, cv.height - 48 * u);
  g.strokeStyle = '#D4A24C'; g.lineWidth = Math.max(1, 1.5 * u);
  const L = 26 * u, m = 24 * u;
  [[m, m, 1, 1], [width - m, m, -1, 1], [m, cv.height - m, 1, -1], [width - m, cv.height - m, -1, -1]].forEach(([x, y, sx, sy]) => {
    g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke();
  });
  // the stamp
  const f = facts(app), s = app.store.all();
  const o = app.model.obj;
  const ts = shadowFor(s.a, s.view === 'telescope' ? s.incl : (o ? o.incl : 90), s.q);
  const pred = o ? predictedUas(ts.mean, o) : null;
  const font = (px, w = 400) => `${w} ${Math.round(px * u)}px "IBM Plex Mono", ui-monospace, monospace`;
  const y0 = height + band * 0.42;
  g.fillStyle = '#EAF0FB'; g.font = font(26, 600);
  g.fillText(`${o ? o.name : 'Custom hole'}  ·  a = ${s.a.toFixed(3)}  ·  i = ${f.inclination_deg} deg  ·  ${s.view}  ·  ${s.observer}`, 48 * u, y0);
  g.fillStyle = '#C5CCD8'; g.font = font(19);
  let line2 = `horizon ${f.horizon_radius_M.toFixed(3)} M  ·  ISCO ${f.isco_M.toFixed(3)} M  ·  shadow ${ts.chords.width.toFixed(3)} M wide (Bardeen 1973, traced)`;
  if (pred && o.eht) line2 += `  ·  ${pred.value.toFixed(1)} ± ${pred.err.toFixed(1)} uas vs EHT ${o.eht.ring} ± ${o.eht.ringErr} (${sigmaDiff(pred, o.eht.ring, o.eht.ringErr).toFixed(2)} sigma)`;
  g.fillText(line2, 48 * u, y0 + 32 * u);
  g.fillStyle = '#79828F'; g.font = font(16);
  g.fillText(`Kerr null geodesics, RK4 in Kerr-Schild coordinates · Novikov-Thorne disk, ${s.color} colour · luisblanco.dev/labs · THE LAB · L212 · ${stamp()}`, 48 * u, y0 + 58 * u);
  await new Promise((res) => cv.toBlob((b) => { download(b, `kerr-${o ? o.id : 'custom'}-a${s.a.toFixed(3)}-i${Math.round(f.inclination_deg)}-${width}px.png`); res(); }, 'image/png'));
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

export function exportData(app) {
  const head = ['object', 'kind', 'mass_Msun', 'mass_err', 'distance_pc', 'distance_err', 'spin', 'spin_tag', 'inclination_deg',
    'predicted_shadow_uas', 'predicted_err_uas', 'eht_ring_uas', 'eht_ring_err', 'sigma', 'sources'];
  const rows = OBJECTS.map((o) => {
    const ts = theoryShadow(o.spin, o.incl);
    const pred = predictedUas(ts.mean, o);
    const sg = pred && o.eht ? sigmaDiff(pred, o.eht.ring, o.eht.ringErr).toFixed(3) : '';
    const src = [o.massSrc, o.spinSrc, o.inclSrc, o.eht?.src].filter(Boolean).map((k) => CITE[k]).filter((v, i, a) => a.indexOf(v) === i).join(' | ') || o.massNote || '';
    return [o.name, o.kind, o.mass, o.massErr, o.distPc ?? '', o.distErr ?? '', o.spin, o.spinTag, o.incl,
      pred ? pred.value.toFixed(3) : '', pred ? pred.err.toFixed(3) : '', o.eht?.ring ?? '', o.eht?.ringErr ?? '', sg, src];
  });
  const csv = [`# luisblanco.dev black-hole objects, data version ${VERSION}, exported ${stamp()}`, head.join(',')]
    .concat(rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','))).join('\n');
  download(new Blob([csv], { type: 'text/csv' }), `kerr-objects-${VERSION}.csv`);
  void sci;
}
