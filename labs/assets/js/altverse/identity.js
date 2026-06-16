/* ============================================================
   altverse/identity.js — per-world identity (Phase 3).
   Each world earns its own CHARACTER, derived deterministically
   from its data + seed and QUANTIZED into the locked token system
   (never mutating :root). The differentiation budget lives mostly
   in STRUCTURE (map silhouette, motion temperament, accent), with
   colour kept inside the duotone lock and WCAG-clamped. Gold stays
   the site's active/built signal; a per-world accent is the stated,
   contrast-checked brand expansion.
   ============================================================ */

import { makeRng } from './rng.js';

const TOK = { warm: '#F2A93B', cold: '#5BB0D6', void: '#060709' };

/* ---- colour helpers (HSL, contrast) ---- */
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h * 360, s, l];
}
function hslToRgb(h, s, l) {
  h /= 360; const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function adjust(hex, { dh = 0, ds = 0, dl = 0 } = {}) {
  let [h, s, l] = rgbToHsl(hexToRgb(hex));
  h = (h + dh + 360) % 360; s = Math.max(0, Math.min(1, s + ds)); l = Math.max(0, Math.min(1, l + dl));
  return rgbToHex(hslToRgb(h, s, l));
}
function relLum([r, g, b]) {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) { const la = relLum(hexToRgb(a)), lb = relLum(hexToRgb(b)); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
/* pull an accent lighter until it clears `ratio` against the world void */
function ensureContrast(accent, bg, ratio) {
  let c = accent;
  for (let i = 0; i < 12 && contrast(c, bg) < ratio; i++) c = adjust(c, { dl: 0.05 });
  return c;
}

// climate/biome -> warmth 0 (cold) .. 1 (warm) — mirrors map-canvas
function tempOf(region) {
  const s = ((region.climate || '') + ' ' + (region.dominantBiome || '')).toLowerCase();
  if (/frozen|ice|arctic|polar|cold|cool/.test(s)) return 0.12;
  if (/hot|arid|desert|warm|tropic|volcan|steppe/.test(s)) return 0.88;
  return 0.5;
}

export function deriveIdentity(world) {
  const rng = makeRng((world.seed ^ 0x9e3779b9) >>> 0);
  const regions = world.map?.regions || [];
  const warmBias = regions.length ? regions.reduce((s, r) => s + tempOf(r), 0) / regions.length : 0.5;

  // accent: warm- or cold-dominant base, hue rotated within ±18°, chroma by divergence magnitude
  const ceiling = world.divergence?.escalation_ceiling;
  const mag = ceiling === 'SF' ? 1 : ceiling === 'SPECULATIVE' ? 0.7 : ceiling === 'THEORETICAL' ? 0.45 : 0.3;
  const base = warmBias >= 0.5 ? TOK.warm : TOK.cold;
  let accent = adjust(base, { dh: rng.float(-18, 18), ds: (mag - 0.5) * 0.2 });

  // void tint: deep-past worlds run warmer, far-future cooler; lightness nudged 0-3%
  const eras = world.chronology?.eras || [];
  const meanStart = eras.length ? eras.reduce((s, e) => s + e.start, 0) / eras.length : 0;
  const ageWarm = meanStart < -1e8 ? 0.5 : meanStart > 0 ? -0.5 : 0;      // -1 cool .. +1 warm
  const voidTint = adjust(TOK.void, { dh: (warmBias - 0.5) * 20 + ageWarm * 8, dl: 0.005 + rng.float(0, 0.02) });

  accent = ensureContrast(accent, voidTint, 3.0);                          // legible on the world void
  const accentSoft = adjust(accent, { dl: 0.12, ds: -0.05 });

  return {
    palette: { accent, accentSoft, void: voidTint },
    motion: {
      temperament: warmBias > 0.62 ? 'turbulent' : warmBias < 0.4 ? 'crystalline' : 'calm',
      speedScale: 0.6 + mag * 0.8,
    },
    mapStyle: {
      gridStep: 20 + Math.round(rng.float(0, 16)),       // graticule density
      landFraction: 0.3 + warmBias * 0.4,
      plateRadius: 3 + Math.round(rng.float(0, 8)),
    },
    warmBias,
    name: world.name,
    motto: world.motto,
  };
}

/** apply identity as scoped CSS custom props on the .av-world root (never :root) */
export function applyIdentity(world, rootEl) {
  const id = world.identity || (world.identity = deriveIdentity(world));
  rootEl.style.setProperty('--world-accent', id.palette.accent);
  rootEl.style.setProperty('--world-accent-soft', id.palette.accentSoft);
  rootEl.style.setProperty('--world-void', id.palette.void);
  rootEl.dataset.temperament = id.motion.temperament;
  return id;
}
