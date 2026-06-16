/* ============================================================
   altverse/render/card.js — the shareable World Card (Phase 4).
   A downloadable PNG poster per world (canvas.toBlob): name, motto,
   the divergence, a mini-map, and the REAL consistency counts +
   palette swatch. The hero share artifact (per-link OG unfurls are
   impossible on a static host; the card + the #w= replay link are).
   ============================================================ */

import { shareURL } from '../store.js';

const W = 1200, H = 675;

function hexRgb(h) { const n = parseInt((h || '#888').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function tempOf(r) { const s = ((r.climate || '') + ' ' + (r.dominantBiome || '')).toLowerCase();
  if (/frozen|ice|polar|cold|cool/.test(s)) return 0.12; if (/hot|arid|warm|tropic|volcan|steppe/.test(s)) return 0.88; return 0.5; }

function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' '); let line = '', yy = y;
  for (const w of words) {
    if (ctx.measureText(line + w).width > maxW && line) { ctx.fillText(line.trim(), x, yy); line = ''; yy += lh; }
    line += w + ' ';
  }
  ctx.fillText(line.trim(), x, yy); return yy + lh;
}

export function drawCard(canvas, world) {
  const id = world.identity || { palette: { accent: '#F2A93B', void: '#060709' } };
  const accent = id.palette.accent, voidc = id.palette.void;
  const dpr = 2;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = '100%'; canvas.style.aspectRatio = '1200 / 675';
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0b1018'); g.addColorStop(1, voidc);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 6);

  // mini map (right)
  const mx = 660, my = 150, mw = 480, mh = 240;
  ctx.fillStyle = 'rgba(7,11,18,0.6)'; ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = `rgba(${hexRgb(accent).join(',')},0.25)`; ctx.lineWidth = 1;
  for (let i = 0; i <= 6; i++) { const x = mx + (mw / 6) * i; ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mh); ctx.stroke(); }
  for (let i = 0; i <= 3; i++) { const y = my + (mh / 3) * i; ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + mw, y); ctx.stroke(); }
  (world.map.regions || []).forEach((r) => {
    const [lo, la, lo2, la2] = r.bbox;
    const x = mx + ((lo + 180) / 360) * mw, x2 = mx + ((lo2 + 180) / 360) * mw;
    const y = my + ((90 - la2) / 180) * mh, y2 = my + ((90 - la) / 180) * mh;
    const t = tempOf(r);
    const col = [Math.round(91 + (242 - 91) * t), Math.round(176 + (169 - 176) * t), Math.round(214 + (59 - 214) * t)];
    ctx.fillStyle = `rgba(${col.join(',')},0.30)`; ctx.fillRect(x, y, x2 - x, y2 - y);
    ctx.strokeStyle = `rgba(${col.join(',')},0.7)`; ctx.strokeRect(x, y, x2 - x, y2 - y);
  });
  ctx.fillStyle = '#79828F'; ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textBaseline = 'top';
  ctx.fillText('MAPAMUNDI · STYLIZED', mx, my + mh + 10);

  // title block (left)
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#79828F'; ctx.font = '13px "IBM Plex Mono", monospace';
  ctx.fillText('ALTVERSE · ALTERNATE REALITY', 60, 70);
  ctx.fillStyle = accent; ctx.font = '700 66px Orbitron, sans-serif';
  ctx.fillText((world.name || 'UNNAMED WORLD').slice(0, 16), 60, 100);
  ctx.fillStyle = '#C5CCD8'; ctx.font = 'italic 24px "Space Grotesk", sans-serif';
  ctx.fillText(world.motto || '', 60, 185);
  ctx.fillStyle = '#79828F'; ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillText('DIVERGENCE', 60, 250);
  ctx.fillStyle = '#EDF1F7'; ctx.font = '22px "Space Grotesk", sans-serif';
  wrap(ctx, world.divergence.statement, 60, 274, 540, 30);

  // consistency ledger (real counts)
  const c = world.consistency || {};
  ctx.fillStyle = '#79828F'; ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.fillText('CONSISTENCY LEDGER', 60, 470);
  ctx.fillStyle = '#EDF1F7'; ctx.font = '600 30px "IBM Plex Mono", monospace';
  ctx.fillText(`${c.structuralPassed || 0}/${c.structuralTotal || 0}`, 60, 494);
  ctx.fillStyle = '#79828F'; ctx.font = '13px "Space Grotesk", sans-serif';
  ctx.fillText('structural checks passed', 150, 504);
  ctx.fillStyle = '#EDF1F7'; ctx.font = '600 30px "IBM Plex Mono", monospace';
  ctx.fillText(`${(world.effects.firstOrder || []).length}`, 60, 540);
  ctx.fillStyle = '#79828F'; ctx.font = '13px "Space Grotesk", sans-serif';
  ctx.fillText('first-order consequences', 110, 550);

  // palette swatch
  ctx.fillStyle = accent; ctx.fillRect(60, H - 70, 28, 28);
  ctx.fillStyle = voidc; ctx.strokeStyle = '#2c3744'; ctx.fillRect(92, H - 70, 28, 28); ctx.strokeRect(92, H - 70, 28, 28);
  ctx.fillStyle = '#79828F'; ctx.font = '12px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle';
  ctx.fillText('luisblanco.dev / labs · ' + (world.tier === 'echo' ? 'OFFLINE SAMPLE' : world.tier.toUpperCase()), 132, H - 56);
}

async function toBlobDownload(world) {
  const canvas = document.createElement('canvas');
  try { await (document.fonts && document.fonts.ready); } catch (_) {}
  drawCard(canvas, world);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (world.name || 'altverse-world').replace(/\s+/g, '-').toLowerCase() + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

export function openCardModal(world) {
  const scrim = el('div', 'av-modal-scrim');
  const modal = el('div', 'av-modal');
  modal.appendChild(el('div', 'av-modal-head', 'World Card'));
  const canvas = document.createElement('canvas');
  canvas.className = 'av-card-canvas';
  modal.appendChild(canvas);
  const row = el('div', 'av-modal-actions');
  const dl = el('button', 'av-btn primary', 'Download PNG');
  const cp = el('button', 'av-btn', 'Copy share link');
  const cl = el('button', 'av-btn ghost', 'Close');
  row.append(dl, cp, cl);
  modal.appendChild(row);
  const note = el('div', 'av-modal-note', 'The link replays this exact world. The card is the image.');
  modal.appendChild(note);
  scrim.appendChild(modal);
  document.body.appendChild(scrim);

  const draw = () => drawCard(canvas, world);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw); else draw();
  draw();

  dl.addEventListener('click', () => toBlobDownload(world));
  cp.addEventListener('click', async () => {
    const url = shareURL(world);
    try { await navigator.clipboard.writeText(url); cp.textContent = 'Copied'; }
    catch { cp.textContent = 'Copy failed'; }
    setTimeout(() => (cp.textContent = 'Copy share link'), 1600);
  });
  const close = () => scrim.remove();
  cl.addEventListener('click', close);
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
}
