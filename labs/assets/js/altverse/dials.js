/* ============================================================
   altverse/dials.js — the divergence's own number as a dial.
   For a root divergence the classifier read as one numeric family,
   the page shows a slider with the unit, its legal range and our
   value; moving it rewrites the divergence text and re-weaves.
   ============================================================ */

import { EARTH } from './config.js';
import { TECH_BY_ID } from './lexicon.js';

const r1 = (x) => Math.round(x * 10) / 10;
const yr = (y) => (y < 0 ? `${-y} BCE` : `${y} CE`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const DIALS = {
  gravity: { label: 'surface gravity', min: 2, max: 30, step: 0.05, unit: 'm/s2', ours: EARTH.g,
    get: (k) => EARTH.g * k.gFactor, fmt: (v) => `${r1(v)} m/s2`, text: (v) => `Surface gravity is ${r1(v)} m/s2.` },
  alpha: { label: 'speed of light (charge and h fixed)', min: 15000, max: 900000, step: 1000, unit: 'km/s', ours: EARTH.cKms,
    get: (k) => EARTH.cKms * k.cFactor, fmt: (v) => `${Math.round(v).toLocaleString('en-US')} km/s`, text: (v) => `Light travels at ${Math.round(v)} km/s, with charge and Planck's constant unchanged.` },
  ice: { label: 'ice density', min: 1.01, max: 1.25, step: 0.01, unit: 'g/cm3', ours: EARTH.iceDensity,
    get: (k) => k.iceDensity, fmt: (v) => `${v.toFixed(2)} g/cm3`, text: (v) => `Ice is ${Math.round((v - 1) * 100)}% denser than liquid water, so it sinks.` },
  tilt: { label: 'axial tilt', min: 0, max: 90, step: 1, unit: 'deg', ours: EARTH.tiltDeg,
    get: (k) => k.tiltDeg, fmt: (v) => `${Math.round(v)} deg`, text: (v) => `Earth's axis is tilted ${Math.round(v)} degrees.` },
  day: { label: 'length of day', min: 4, max: 240, step: 1, unit: 'h', ours: 24,
    get: (k) => k.dayHours, fmt: (v) => `${Math.round(v)} h`, text: (v) => `A day lasts ${Math.round(v)} hours.` },
  moon: { label: 'Moon mass', min: 0, max: 4, step: 0.1, unit: 'x ours', ours: 1,
    get: (k) => k.moon, fmt: (v) => (v < 0.05 ? 'no Moon' : `${r1(v)} x ours`), text: (v) => (v < 0.05 ? 'The Earth has no Moon.' : `The Moon has ${r1(v)} times its mass.`) },
  sun: { label: 'sunlight', min: 0.7, max: 1.2, step: 0.005, unit: 'x ours', ours: 1,
    get: (k) => k.solar, fmt: (v) => `${Math.round(EARTH.solarWm2 * v)} W/m2`, text: (v) => { const p = Math.round((v - 1) * 1000) / 10; return `The Sun is ${Math.abs(p)}% ${p >= 0 ? 'brighter' : 'dimmer'}.`; } },
  sea: { label: 'sea level', min: -600, max: 600, step: 10, unit: 'm', ours: 0,
    get: (k) => k.seaLevelM, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} m`, text: (v) => `Sea level is ${Math.abs(Math.round(v))} m ${v >= 0 ? 'higher' : 'lower'}.` },
  co2: { label: 'carbon dioxide', min: 50, max: 5000, step: 10, unit: 'ppm', ours: EARTH.co2ppm,
    get: (k) => k.co2ppm, fmt: (v) => `${Math.round(v)} ppm`, text: (v) => `CO2 is ${Math.round(v)} ppm.` },
  o2: { label: 'oxygen', min: 5, max: 40, step: 0.5, unit: '%', ours: 20.9,
    get: (k) => k.o2Frac * 100, fmt: (v) => `${r1(v)}%`, text: (v) => `Oxygen makes up ${r1(v)}% of the air.` },
};

export function dialFor(spec) {
  if (!spec || spec.family.length !== 1) return null;
  const f = spec.family[0];
  const base = { ...spec.knobs };
  const k = { gFactor: 1, cFactor: 1, iceDensity: EARTH.iceDensity, tiltDeg: EARTH.tiltDeg, dayHours: 24, moon: 1, solar: 1, seaLevelM: 0, co2ppm: EARTH.co2ppm, o2Frac: EARTH.o2Frac, ...base };
  if (f === 'tech' && spec.techId) {
    const t = TECH_BY_ID[spec.techId];
    const v = t.year + (base.tech && typeof base.tech[t.id] === 'number' ? base.tech[t.id] : 0);
    return { id: 'tech', label: `${t.name}, year`, min: Math.max(-3000, t.year - 2000), max: Math.min(2090, t.year + 300), step: 10, value: v, ours: t.year, fmt: (x) => yr(Math.round(x)), text: (x) => `${cap(t.name)} arrives in ${yr(Math.round(x))}.` };
  }
  const d = DIALS[f];
  if (!d) return null;
  if (f === 'alpha' && k.cFactor === 1) return null;
  if (f === 'sea' && base.oceanFrac != null) return null;
  return { id: f, ...d, value: d.get(k) };
}

export function dialText(d, v) { return d.text(v); }
