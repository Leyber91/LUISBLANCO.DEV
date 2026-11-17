/* ============================================================
   exoplanet/export.js — what the visitor takes away: a survey
   plate (PNG: the rendered world, its numbers, its system and
   light curve, the sources), the filtered catalogue with this
   engine's inferences as CSV, and a link to this exact view.
   ============================================================ */

import { DATA, SOURCES, PHYS } from './config.js';
import {
  forecastFor, equilibriumTemp, hzPosition, insolation, semiMajor, transitGeometry, earthLikeness, hasTrueMass, limitOf, isNum,
} from './science.js';
import { facts, deterministicNote, limitsLine } from './report.js';
import { tokens, alpha, fmt, fmtInt } from './views/common.js';
import { localDay, range } from '../kit/format.js';
import { starNum, STASSUN } from './starlight.js';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}

export function exportPlate(p, engine, views, albedo) {
  const T = tokens();
  const W = 1600, H = 900;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = T.void; ctx.fillRect(0, 0, W, H);
  // the world: crop a square around the planet's centre on the WebGL canvas
  const g = engine.canvas, k = g.width / Math.max(1, g.clientWidth);
  const sh = engine.camera.shift;
  const cx = g.width / 2 + (sh[0] || 0) * k, cy = g.height / 2 - (sh[1] || 0) * k;
  const side = Math.min(g.height * 0.86, g.width * 0.9);
  engine.render();
  try { ctx.drawImage(g, cx - side / 2, cy - side / 2, side, side, 40, 90, 760, 760); } catch (_) { /* tainted or lost: leave the field dark */ }
  // frame and brackets
  ctx.strokeStyle = alpha(T.horizon, 0.22); ctx.lineWidth = 1; ctx.strokeRect(20.5, 20.5, W - 41, H - 41);
  ctx.strokeStyle = T.bright;   // the brackets of the plate: gold is kept for a measured value and a saved world
  for (const [x, y, dx, dy] of [[20, 20, 1, 1], [W - 20, 20, -1, 1], [20, H - 20, 1, -1], [W - 20, H - 20, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x + 22 * dx, y + 0.5 * dy); ctx.lineTo(x + 0.5 * dx, y + 0.5 * dy); ctx.lineTo(x + 0.5 * dx, y + 22 * dy); ctx.stroke();
  }
  const mono = (w, s) => `${w} ${s}px "IBM Plex Mono", ui-monospace, Consolas, monospace`;
  ctx.fillStyle = T.dim; ctx.font = mono(500, 13); ctx.textAlign = 'left';
  ctx.fillText('Exomania survey', 44, 62);
  ctx.textAlign = 'right'; ctx.fillText('The lab L212, luisblanco.dev/labs/exomania-survey.html', W - 44, 62);
  ctx.textAlign = 'left';
  const X = 840;
  ctx.fillStyle = T.dim; ctx.font = mono(500, 12); ctx.fillText(`Sheet A, the planet, ${localDay(Date.now())}`, X, 112);
  ctx.fillStyle = T.bright; ctx.font = '400 44px Fraunces, Georgia, serif'; ctx.fillText(p.name, X, 160);
  const f = facts(p, albedo);
  ctx.fillStyle = T.text; ctx.font = mono(400, 15);
  let y = wrap(ctx, deterministicNote(p, f), X, 196, W - X - 50, 22);
  y += 10;
  const rows = [
    ['radius', f.radius_Rearth ? `${fmt(f.radius_Rearth, 3)} R⊕` : f.radius_limit_Rearth ? `${f.radius_kind === 'upper limit' ? '<' : '>'} ${fmt(f.radius_limit_Rearth, 3)} R⊕ (${f.radius_kind})` : 'no radius measured'],
    ['mass', f.mass_limit_Mearth ? `${f.mass_kind === 'upper limit' ? '<' : '>'} ${fmt(f.mass_limit_Mearth, 3)} M⊕ (${f.mass_kind})` : isNum(p.M) ? `${fmt(p.M, 3)} M⊕ (${f.mass_kind})` : 'not measured'],
    ['mass forecast', f.mass_forecast_Mearth ? `${fmt(f.mass_forecast_Mearth, 2)} M⊕ (68%: ${range(f.mass_forecast_68[0], f.mass_forecast_68[1])})` : '—'],
    ['period', isNum(p.P) ? `${fmt(p.P, 4)} d` : '—'], ['insolation', f.insolation_Searth ? `${starNum(f.insolation_Searth, 3)} S⊕` : '—'],
    ['Teq', f.teq_this_page_K ? `${fmtInt(f.teq_this_page_K)} K at albedo ${albedo.toFixed(2)}` : '—'],
    ['habitable zone', f.habitable_zone], ['star', `${isNum(p.Teff) ? fmtInt(p.Teff) + ' K' : '—'}, ${isNum(p.Rs) ? fmt(p.Rs, 3) + ' R☉' : '—'}`],
    ['transit', f.transit_depth_ppm ? `${fmtInt(f.transit_depth_ppm)} ppm deep, ${fmt(f.transit_duration_h, 3)} h long` : '—'],
  ];
  if (f.archive_limits) rows.push(['archive bounds', f.archive_limits]);
  ctx.font = mono(400, 13);
  // values wrap inside the plate (an archive-bounds line can run long)
  for (const [k, v] of rows) { ctx.fillStyle = T.dim; ctx.fillText(k, X, y); ctx.fillStyle = T.bright; y = wrap(ctx, String(v), X + 170, y, W - X - 220, 21); }
  // the linked views as they are now
  const vy = Math.max(y + 12, 560);
  const drawView = (c, x, w, label) => {
    if (!c) return;
    const h = Math.min(210, w * c.height / Math.max(1, c.width));
    ctx.strokeStyle = alpha(T.horizon, 0.18); ctx.strokeRect(x + 0.5, vy + 0.5, w, h);
    try { ctx.drawImage(c, x, vy, w, h); } catch (_) { /* skip */ }
    ctx.fillStyle = T.dim; ctx.font = mono(500, 11); ctx.fillText(label, x, vy - 6);
  };
  drawView(views.system, X, 330, 'D, the system to scale');
  drawView(views.transit, X + 360, 360, 'E, the signal');
  ctx.fillStyle = T.dim; ctx.font = mono(400, 10.5);
  let sy = H - 40 - 14 * 4;
  ctx.fillText(`Data: ${DATA.snapshotLabel}. This research has made use of the NASA Exoplanet Archive, operated by Caltech under contract with NASA.`, 44, sy); sy += 14;
  ctx.fillText('Models: ' + SOURCES.slice(1, 5).join('; '), 44, sy); sy += 14;
  ctx.fillText('         ' + SOURCES.slice(5).join('; '), 44, sy); sy += 14;
  ctx.fillText(`Planet image: procedural ray-traced render from the measured values [ILLUSTRATIVE surface]. ${location.href}`, 44, sy);
  cv.toBlob((b) => b && download(b, `exomania-${slug(p.name)}.png`), 'image/png');
}

/* The CSV of a list of planets, as text: pure, so tests/routes.test.mjs reads it. The page's own orbit and starlight
   (starlight.js) are inferred columns and are named so; the archive's values stand beside them under their own names.
   filter: the words of the filter the list was cut by, or ''. */
export function csvText(rows, albedo, filter = '') {
  const head = ['name', 'host', 'discovery_method', 'discovery_year', 'facility', 'radius_Rearth', 'radius_err', 'radius_measured',
    'mass_Mearth', 'mass_provenance', 'mass_limit', 'period_d', 'a_AU_page', 'a_AU_archive', 'eccentricity',
    'insolation_Searth_page', 'insolation_lo68_page', 'insolation_hi68_page', 'insolation_Searth_archive', 'teq_published_K',
    'teff_K', 'star_radius_Rsun', 'distance_ly',
    'mass_forecast_median', 'mass_forecast_lo68', 'mass_forecast_hi68', 'teq_this_page_K', 'habitable_zone',
    'transit_depth_ppm_model', 'transit_duration_h_model', 'earth_likeness_illustrative', 'archive_limits'];
  const q = (v) => (v === null || v === undefined || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? +v.toPrecision(5) : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = [
    `# Exomania survey export, ${localDay(Date.now())}. ${fmtInt(rows.length)} planets${filter ? ' (filter: ' + filter + ')' : ''}.`,
    `# Data: ${DATA.snapshotLabel}; weekly roster for planets confirmed after it. Acknowledgement: NASA Exoplanet Archive, operated by Caltech under contract with NASA. The archive's own orbit and insolation are a_AU_archive and insolation_Searth_archive.`,
    `# Inferred columns: a_AU_page, the orbit this page uses (Kepler's third law from the period and the star's mass; the archive's for a planet of two stars, a star whose mass is from ${STASSUN}, or a missing period or mass); insolation_Searth_page, the starlight this page uses (the archive's luminosity over a_AU_page squared, or the star's radius and temperature where the archive gives no luminosity; the median of the draws, with lo68 and hi68 its 68% range over the errors the snapshot carries, blank where it carries none); Chen & Kipping 2017 forecaster (log-uniform prior, censored by any mass limit), Teq at Bond albedo ${albedo} with full redistribution from insolation_Searth_page, Kopparapu et al. 2013 zone placed by it, transit model at the archive impact parameter (0 if absent).`,
    '# Limits: mass_limit 1 means mass_Mearth is an upper limit, -1 a lower limit, 0 a value. Every other value the archive flags as a limit is left blank in its column and written in archive_limits as a bound (< upper, > lower). No limit is used in an inferred column as a value.',
    head.join(','),
  ];
  for (const p of rows) {
    const fc = forecastFor(p);
    const geo = transitGeometry(p);
    const o = semiMajor(p), sl = insolation(p);
    lines.push([
      p.name, p.host, p.method, p.year, p.facility, p.R, p.Rerr, p.measuredR ? 1 : 0, limitOf(p, 'M') ? limitOf(p, 'M').v : p.M, p.Mprov, p.Mlim, p.P, o.a, o.archive, p.ecc,
      sl.S, sl.lo, sl.hi, p.S, p.Teq, p.Teff, p.Rs, isNum(p.dist) ? p.dist * PHYS.PC_LY : null,
      fc && fc.median, fc && fc.lo, fc && fc.hi, equilibriumTemp(p, albedo), hzPosition(p).key,
      geo ? geo.depthLD * 1e6 : null, geo ? geo.T14 : null, earthLikeness(p), limitsLine(p) || null,
    ].map(q).join(','));
  }
  return lines.join('\n') + '\n';
}

export function exportCSV(list, filterFn, filterActive, albedo, label) {
  const rows = filterActive ? list.filter(filterFn) : list;
  download(new Blob([csvText(rows, albedo, filterActive ? label : '')], { type: 'text/csv' }), `exomania-${filterActive ? 'filtered' : 'catalogue'}-${rows.length}.csv`);
  return rows.length;
}

export async function copyLink() {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); return true; } catch (_) { /* fall back */ }
  const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  t.remove(); return ok;
}
