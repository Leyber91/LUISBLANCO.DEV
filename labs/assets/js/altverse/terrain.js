/* ============================================================
   altverse/terrain.js — the ground of a world.

   An Earth-analog planet: continents are a fixed set of ellipses
   placed where ours are, their coasts roughened by seeded fractal
   noise, with mountain belts where ours stand. The silhouette reads
   as Earth; the detail is procedural and depends on the seed. It is
   not Earth's real geography. [ILLUSTRATIVE]

   What a divergence changes on it is computed: mountain height
   scales as 1/g (Weisskopf 1975), sea level moves with the knobs
   and with ice, the ocean is the water connected to the open sea
   (so a closed Gibraltar leaves a dry Mediterranean), temperature
   comes from the climate stage and a lapse rate scaled by g, ice
   forms where it is cold enough, rivers follow a priority-flood
   drainage (Barnes et al. 2014), settlements go where water and
   warmth allow, and routes are least-cost paths between them.
   ============================================================ */

import { GRID, ROUTE_GRID, EARTH } from './config.js';
import { makeNoise, makeRng, sph } from './rng.js';
import { tempAt } from './climate.js';

const { W, H } = GRID;
const N = W * H;
const DEG = 360 / W;
export const cellLon = (x) => -180 + (x + 0.5) * DEG;
export const cellLat = (y) => 90 - (y + 0.5) * DEG;
export const lonToX = (lon) => (lon + 180) / DEG - 0.5;
export const latToY = (lat) => (90 - lat) / DEG - 0.5;

/* ---- continents: [lon, lat, rx, ry, rotDeg, tag] ---- */
const BLOBS = [
  // North America
  [-100, 48, 26, 13, -8], [-115, 62, 22, 9, 8], [-152, 64, 12, 5.5, 0], [-86, 36, 11, 8, 20], [-75, 60, 11, 8, 0],
  [-101, 24, 9, 5.5, -38], [-93, 17.5, 4, 2.6, -35], [-81.5, 28, 1.6, 3.6, 12], [-96, 74, 20, 4.5, 0], [-42, 73, 11, 9, 0],
  [-66, 47, 4, 2.5, 30],
  // Central America (the isthmus pieces are tagged so a divergence can open them)
  [-87, 13.5, 2.2, 4.2, -50], [-80.8, 8.8, 3.4, 1.3, -12, 'panama'], [-84, 10.5, 1.6, 2.2, -45, 'panama'],
  // South America
  [-60, -8, 17, 12.5, 0], [-64, -25, 10, 12, 8], [-69, -42, 4.5, 10, 4], [-73, 4, 7, 7, 0], [-40, -7, 6, 4.5, 0], [-77, -8, 3, 6, 15],
  // Europe
  [22, 52, 15, 5.5, 0], [42, 56, 15, 8, 0], [2, 47, 6, 3.8, 0], [-4, 40, 5, 3.4, 0], [12.5, 42.5, 1.4, 5, 38],
  [22, 40, 3.2, 2.6, 0], [15, 63, 4.6, 8, 28], [-2.5, 54, 2.2, 4, 0], [28, 64, 5, 4, 0], [-8, 53, 1.4, 1.6, 0],
  // Africa
  [15, 19, 22, 9.5, 0], [22, 2, 14, 10, 0], [26, -18, 10, 12, 0], [40, 8, 6, 5, 0], [47, 7, 4, 2.3, 32],
  [47, -19, 1.8, 6, 16], [-6, 10, 9, 5, 0], [-6, 31.5, 5, 3, 10],
  // Middle East
  [46, 24, 9, 7, -30], [36, 37.5, 6, 2.6, 0], [55, 32, 9, 5, 0],
  // Asia
  [85, 50, 30, 11, 0], [110, 61, 30, 9, 0], [142, 65, 18, 7, 0], [111, 32, 13, 10, 0], [78, 20, 7, 9, 0],
  [101, 15, 6, 8, 0], [102.5, 3, 1.8, 4, 32], [138, 37, 1.4, 6, 35], [127.5, 38.5, 1.8, 2.8, 0], [160, 57, 3.5, 6, 0],
  [80, 72, 15, 3.5, 0], [62, 42, 8, 4, 0],
  // Islands of Southeast Asia
  [101.5, -1, 2.6, 6, -45], [114, 0.5, 5, 3.8, 0], [110, -7.3, 5, 1.1, 0], [121, -2, 2, 3, 0], [140, -5, 8, 2.8, -10], [122, 12, 1.8, 5, 0],
  // Australia and New Zealand
  [134, -25, 18, 10.5, 0], [146.5, -41.5, 1.6, 1.4, 0], [143, -14, 2.6, 4, 0], [174.5, -39, 1.4, 3, 30], [170, -44.5, 1.5, 3, 35],
  // Antarctica
  [0, -85, 180, 10, 0], [-90, -76, 34, 7, 0], [90, -71, 42, 6, 0], [-63, -67, 3.5, 6, 22],
];
const HOLES = [
  // Hudson Bay, the Gulf of Mexico rim and the Baltic, so the silhouette reads
  [-86, 60, 6.5, 4.5, 0], [-90, 25, 7, 3.5, 0], [19, 58, 3, 3.5, 20], [-60, 47, 2.5, 1.5, 0],
];
/* mountain belts: polyline (lon,lat pairs), half-width deg, height m */
const BELTS = [
  { pts: [[68, 36], [78, 33], [88, 28.5], [97, 28]], w: 2.2, h: 8300 },           // Himalaya
  { pts: [[-77, 8], [-78, -4], [-75, -15], [-69, -22], [-70, -34], [-72, -48]], w: 1.5, h: 6000 }, // Andes
  { pts: [[-150, 62], [-125, 55], [-115, 45], [-108, 37], [-105, 30]], w: 2.4, h: 2500 }, // Cordillera
  { pts: [[5, 45.5], [11, 46.8], [15, 47]], w: 1.4, h: 4000 },                     // Alps
  { pts: [[59, 66], [59, 58], [58, 51]], w: 1.4, h: 1200 },                        // Urals
  { pts: [[44, 41], [52, 37], [60, 36], [70, 38]], w: 2.0, h: 3200 },              // Zagros to Pamir
  { pts: [[36, 14], [38, 9], [37, 2], [35, -5]], w: 2.2, h: 2300 },                // East African highlands
  { pts: [[-80, 37], [-73, 44], [-66, 47]], w: 1.6, h: 1300 },                     // Appalachians
  { pts: [[143, -12], [148, -24], [148, -37]], w: 1.4, h: 1300 },                  // Great Dividing Range
  { pts: [[6, 61], [12, 66], [17, 69]], w: 1.4, h: 1500 },                         // Scandes
  { pts: [[-40, 64], [-40, 72], [-38, 80]], w: 5.0, h: 2400 },                     // Greenland ice dome (bedrock + ice)
  { pts: [[-120, -82], [0, -82], [100, -80], [160, -78]], w: 7.0, h: 2600 },       // Antarctic dome
];
/* plateaus: [lon, lat, rx, ry, height] */
const PLATEAUS = [[87, 33.5, 12, 4.5, 4300], [-68, -19, 3, 6, 3300], [-105, 40, 6, 7, 1400], [38, 8, 4, 4, 1500], [24, -26, 8, 5, 1100]];
/* real volcanic hotspots and rift heat, used where geothermal heat matters */
export const HOTSPOTS = [
  { name: 'Iceland', lon: -19, lat: 64.5 }, { name: 'Yellowstone', lon: -110.5, lat: 44.5 }, { name: 'East African Rift', lon: 36.5, lat: -1 },
  { name: 'Kamchatka', lon: 159, lat: 55 }, { name: 'the central Andes', lon: -68, lat: -22 }, { name: 'Japan', lon: 138.5, lat: 36.5 },
  { name: 'the Taupo zone', lon: 176, lat: -38.5 }, { name: 'Hawaii', lon: -155.5, lat: 19.5 }, { name: 'Afar', lon: 41, lat: 11.5 },
  { name: 'the Aleutians', lon: -165, lat: 54 },
];

function ellipseField(out, blobs, sign, skipTag) {
  for (const b of blobs) {
    const [lon0, lat0, rx0, ry0, rot = 0, tag] = b;
    const grow = sign > 0 && rx0 < 179 ? 1.1 : 1;           // a little overlap so landmasses join
    const rx = rx0 * grow, ry = ry0 * grow;
    if (skipTag && tag && skipTag(tag)) continue;
    const ca = Math.cos(rot * Math.PI / 180), sa = Math.sin(rot * Math.PI / 180);
    const reach = Math.max(rx, ry) * 1.35 + 1;
    const y0 = Math.max(0, Math.floor(latToY(Math.min(90, lat0 + reach)))), y1 = Math.min(H - 1, Math.ceil(latToY(Math.max(-90, lat0 - reach))));
    for (let y = y0; y <= y1; y++) {
      const lat = cellLat(y);
      const cl = Math.max(0.15, Math.cos(lat * Math.PI / 180));
      const lonReach = Math.min(180, reach / cl);
      const xa = Math.floor(lonToX(lon0 - lonReach)), xb = Math.ceil(lonToX(lon0 + lonReach));
      for (let xx = xa; xx <= xb; xx++) {
        const x = ((xx % W) + W) % W;
        let dlon = cellLon(x) - lon0; if (dlon > 180) dlon -= 360; if (dlon < -180) dlon += 360;
        const dx = dlon * (rx >= 179 ? 1 : cl), dy = lat - lat0;
        const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
        const d = Math.sqrt(u * u + v * v);
        if (d >= 1.35) continue;
        const f = d < 1 ? 0.5 + 0.5 * (1 - d * d) : 0.5 * (1 - (d - 1) / 0.35);  // 0.5 at the rim
        const i = y * W + x;
        if (sign > 0) { if (f > out[i]) out[i] = f; }
        else out[i] = Math.min(out[i], 1 - f * 1.6);
      }
    }
  }
}

function distToPolyline(lon, lat, pts) {
  let best = 1e9;
  const cl = Math.cos(lat * Math.PI / 180);
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const px = (lon - ax) * cl, py = lat - ay, vx = (bx - ax) * cl, vy = by - ay;
    const t = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy || 1)));
    const dx = px - vx * t, dy = py - vy * t;
    best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
  }
  return best;
}

/* Base fields per seed and isthmus/strait configuration (cached). */
const baseCache = new Map();
function baseFields(seed, panama, medFlood) {
  const key = `${seed}|${panama}|${medFlood}`;
  if (baseCache.has(key)) return baseCache.get(key);
  const noise = makeNoise(seed);
  const raw = new Float32Array(N);
  ellipseField(raw, BLOBS, 1, (tag) => tag === 'panama' && !panama);
  const holes = new Float32Array(N).fill(1);
  ellipseField(holes, HOLES, -1);
  for (let i = 0; i < N; i++) raw[i] = Math.min(raw[i], Math.max(0, holes[i]));
  // the Strait of Gibraltar: carved only when the Atlantic keeps the Mediterranean full
  if (medFlood) ellipseField(holes.fill(1), [[-5.6, 35.95, 1.3, 0.55, 0]], -1);
  else holes.fill(1);
  for (let i = 0; i < N; i++) raw[i] = Math.min(raw[i], Math.max(0, holes[i]));
  if (!panama) { const ch = new Float32Array(N).fill(1); ellipseField(ch, [[-81.5, 9.2, 4, 0.9, -15], [-84.5, 11, 1.2, 3.0, -45]], -1); for (let i = 0; i < N; i++) raw[i] = Math.min(raw[i], Math.max(0, ch[i])); }

  // domain warp on a coarse grid (sampled on the sphere so the map wraps), then fine detail
  const CW = 160, CH = 80;
  const warpX = new Float32Array(CW * CH), warpY = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const [sx, sy, sz] = sph(-180 + (x + 0.5) * 360 / CW, 90 - (y + 0.5) * 180 / CH);
    warpX[y * CW + x] = noise.fbm(sx * 2.4 + 7, sy * 2.4, sz * 2.4, 5) * 6.2;
    warpY[y * CW + x] = noise.fbm(sx * 2.4, sy * 2.4 + 13, sz * 2.4, 5) * 6.2;
  }
  const coarse = (arr, lon, lat) => {
    const fx = (lon + 180) / 360 * CW - 0.5, fy = Math.max(0, Math.min(CH - 1.001, (90 - lat) / 180 * CH - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % CW) + CW) % CW, xb = (xa + 1) % CW;
    return arr[y0 * CW + xa] * (1 - tx) * (1 - ty) + arr[y0 * CW + xb] * tx * (1 - ty) + arr[(y0 + 1) * CW + xa] * (1 - tx) * ty + arr[(y0 + 1) * CW + xb] * tx * ty;
  };
  const beltBox = BELTS.map((b) => {
    const lons = b.pts.map((p) => p[0]), lats = b.pts.map((p) => p[1]), pad = b.w * 3;
    return { b, lon0: Math.min(...lons) - pad * 2, lon1: Math.max(...lons) + pad * 2, lat0: Math.min(...lats) - pad, lat1: Math.max(...lats) + pad };
  });
  // fine noise on a half-resolution grid, sampled bilinearly (a quarter of the noise calls)
  const HW = W / 2, HH = H / 2;
  const fineH = new Float32Array(HW * HH), detH = new Float32Array(HW * HH);
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const [sx, sy, sz] = sph(-180 + (x + 0.5) * 360 / HW, 90 - (y + 0.5) * 180 / HH);
    fineH[y * HW + x] = noise.fbm(sx * 7, sy * 7, sz * 7, 5);
    detH[y * HW + x] = noise.fbm(sx * 5 + 3, sy * 5, sz * 5, 4);
  }
  const half = (arr, x, y) => {
    const fx = (x + 0.5) / 2 - 0.5, fy = Math.max(0, Math.min(HH - 1.001, (y + 0.5) / 2 - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = ((x0 % HW) + HW) % HW, xb = (xa + 1) % HW;
    return arr[y0 * HW + xa] * (1 - tx) * (1 - ty) + arr[y0 * HW + xb] * tx * (1 - ty) + arr[(y0 + 1) * HW + xa] * (1 - tx) * ty + arr[(y0 + 1) * HW + xb] * tx * ty;
  };
  const cont = new Float32Array(N), mount = new Float32Array(N), detail = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = cellLat(y);
    const cl = Math.cos(lat * Math.PI / 180);
    for (let x = 0; x < W; x++) {
      const lon = cellLon(x);
      const [sx, sy, sz] = sph(lon, lat);
      const wx = coarse(warpX, lon, lat), wy = coarse(warpY, lon, lat);
      const fx = lonToX(lon + wx / Math.max(0.3, cl)), fy = latToY(Math.max(-89.9, Math.min(89.9, lat + wy)));
      const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
      const tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
      const xa = ((x0 % W) + W) % W, xb = (xa + 1) % W;
      const c = raw[y0 * W + xa] * (1 - tx) * (1 - ty) + raw[y0 * W + xb] * tx * (1 - ty) +
        raw[(y0 + 1) * W + xa] * (1 - tx) * ty + raw[(y0 + 1) * W + xb] * tx * ty;
      const i = y * W + x;
      cont[i] = c + half(fineH, x, y) * 0.16;
      detail[i] = half(detH, x, y);
      let m = 0, r = -1;
      for (const bb of beltBox) {
        if (lon < bb.lon0 || lon > bb.lon1 || lat < bb.lat0 || lat > bb.lat1) continue;
        const b = bb.b;
        const d = distToPolyline(lon, lat, b.pts);
        if (d < b.w * 3) {
          if (r < 0) r = noise.ridged(sx * 7, sy * 7, sz * 7);
          m = Math.max(m, b.h * Math.exp(-(d * d) / (b.w * b.w)) * (0.55 + 0.45 * r));
        }
      }
      for (const [plon, plat, rx, ry, h] of PLATEAUS) {
        const dx = (lon - plon) * cl / rx, dy = (lat - plat) / ry;
        if (Math.abs(dx) > 1.4 || Math.abs(dy) > 1.4) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.4) m = Math.max(m, h * (d < 0.8 ? 1 : 1 - (d - 0.8) / 0.6) * (0.92 + 0.08 * detail[i]));
      }
      mount[i] = m;
    }
  }
  // calibrate: the highest belt stands 8.1 km above the land base, so our tallest peak is near 8.85 km
  let mmax = 0; for (let i = 0; i < N; i++) if (cont[i] > 0.6 && mount[i] > mmax) mmax = mount[i];
  if (mmax > 0) { const f = 8100 / mmax; for (let i = 0; i < N; i++) mount[i] *= f; }
  const out = { cont, mount, detail };
  if (baseCache.size > 8) baseCache.delete(baseCache.keys().next().value);
  baseCache.set(key, out);
  return out;
}

const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

/* elevation in metres, before sea level is applied */
function elevation(base, gFactor) {
  const e = new Float32Array(N);
  const mScale = 1 / gFactor;                       // isostatic and strength limit, h_max ~ 1/g
  for (let i = 0; i < N; i++) {
    const c = base.cont[i];
    let h;
    if (c >= 0.5) h = 20 + 420 * smooth(0.5, 0.62, c) + 380 * (0.5 + 0.5 * base.detail[i]) + base.mount[i] * mScale * smooth(0.47, 0.58, c);
    else if (c >= 0.4) h = -40 - 160 * (0.5 - c) / 0.1 + 30 * base.detail[i];
    else h = -200 - 4200 * smooth(0.4, 0.18, c) + 700 * base.detail[i];
    e[i] = h;
  }
  return e;
}

/* water connected to the open ocean (seeded mid-Pacific), wrapping in longitude */
function floodOcean(elev, sea) {
  const ocean = new Uint8Array(N);
  const start = Math.round(latToY(0)) * W + Math.round(lonToX(-150));
  if (elev[start] >= sea) return ocean;
  const q = new Int32Array(N); let qh = 0, qt = 0;
  q[qt++] = start; ocean[start] = 1;
  while (qh < qt) {
    const i = q[qh++]; const x = i % W, y = (i / W) | 0;
    const nb = [y * W + ((x + 1) % W), y * W + ((x - 1 + W) % W), y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
    for (const j of nb) if (j >= 0 && !ocean[j] && elev[j] < sea) { ocean[j] = 1; q[qt++] = j; }
  }
  return ocean;
}

function solveSeaLevel(elev, frac) {
  const s = Float32Array.from(elev).sort();
  return s[Math.max(0, Math.min(N - 1, Math.floor(frac * N)))];
}

/* priority-flood drainage: every land cell drains to the cell it was reached from */
function drainage(elev, water) {
  const down = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const order = new Int32Array(N); let on = 0;
  // binary heap of [height, index]
  const hh = new Float32Array(N + 8), hi = new Int32Array(N + 8); let hs = 0;
  const push = (h, i) => { let k = hs++; hh[k] = h; hi[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (hh[p] <= hh[k]) break; [hh[p], hh[k]] = [hh[k], hh[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
  const pop = () => { const top = hi[0], th = hh[0]; hs--; hh[0] = hh[hs]; hi[0] = hi[hs]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hs && hh[l] < hh[m]) m = l; if (r < hs && hh[r] < hh[m]) m = r; if (m === k) break; [hh[m], hh[k]] = [hh[k], hh[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m; } return [th, top]; };
  for (let i = 0; i < N; i++) if (water[i]) { seen[i] = 1; push(-1e9, i); }
  if (!hs) return { down, acc: new Float32Array(N) };
  while (hs) {
    const [h, i] = pop();
    if (!water[i]) order[on++] = i;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      const j = yy * W + ((x + dx + W) % W);
      if (seen[j]) continue;
      seen[j] = 1; down[j] = i;
      push(Math.max(elev[j], h + 0.01), j);
    }
  }
  const acc = new Float32Array(N);
  for (let k = on - 1; k >= 0; k--) { const i = order[k]; acc[i] += 1; const d = down[i]; if (d >= 0 && !water[d]) acc[d] += acc[i]; }
  return { down, acc };
}

/**
 * buildTerrain(seed, knobs, clim, opts) -> the ground of one world.
 * opts.seaShiftM: extra sea-level change computed by the engine (ice volume, basins)
 */
export function buildTerrain(seed, knobs, clim, { seaShiftM = 0, noOceans = false } = {}) {
  const base = baseFields(seed, knobs.panama, knobs.medFlood);
  const elev = elevation(base, knobs.gFactor);
  let sea = (knobs.seaLevelM || 0) + seaShiftM;
  if (knobs.oceanFrac != null) sea = knobs.oceanFrac <= 0.001 ? -1e9 : solveSeaLevel(elev, knobs.oceanFrac);
  if (noOceans) sea = -1e9;
  const ocean = sea < -1e8 ? new Uint8Array(N) : floodOcean(elev, sea);
  // enclosed basins below sea level: lakes, except the Mediterranean when cut off (a salt basin)
  const lake = new Uint8Array(N), saltFlat = new Uint8Array(N);
  if (sea > -1e8) for (let i = 0; i < N; i++) {
    if (ocean[i] || elev[i] >= sea) continue;
    const lon = cellLon(i % W), lat = cellLat((i / W) | 0);
    if (!knobs.medFlood && lon > -6 && lon < 37 && lat > 30 && lat < 46.5) saltFlat[i] = 1; else lake[i] = 1;
  }
  const water = new Uint8Array(N);
  for (let i = 0; i < N; i++) water[i] = ocean[i] || lake[i];

  // climate per cell
  const T = new Float32Array(N), Tw = new Float32Array(N), Ts = new Float32Array(N);
  const ice = new Uint8Array(N);   // 1 land ice, 2 ice-filled or frozen sea
  const iceSinks = knobs.iceDensity > 1.0;
  for (let y = 0; y < H; y++) {
    const lat = cellLat(y);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const land = !water[i];
      const ek = land ? Math.max(0, elev[i] - Math.max(0, sea)) / 1000 : 0;
      const t = tempAt(clim, lat, ek, knobs.gFactor);
      T[i] = t.T; Tw[i] = land ? t.Tw : t.TwSea; Ts[i] = t.Ts;
      if (land) { if (t.T < -10 || (t.T < -3 && ek > 1.5)) ice[i] = 1; }
      // currents bend the sea-ice edge: a seeded +/-2.5 C wobble on the freezing test [ILLUSTRATIVE]
      else if ((iceSinks ? t.TwSea : t.T + 7.1) + 2.5 * base.detail[i] < -1.9) ice[i] = 2;
    }
  }
  if (clim.snowball) for (let i = 0; i < N; i++) ice[i] = water[i] ? 2 : 1;
  if (clim.runaway) ice.fill(0);

  const { down, acc } = drainage(elev, water);

  let land = 0, oceanCells = 0, landArea = 0, area = 0, iceArea = 0, oceanArea = 0, frozenOceanArea = 0;
  for (let y = 0; y < H; y++) {
    const w = Math.cos(cellLat(y) * Math.PI / 180);
    for (let x = 0; x < W; x++) {
      const i = y * W + x; area += w;
      if (ocean[i]) { oceanCells++; oceanArea += w; if (ice[i] === 2) frozenOceanArea += w; }
      else if (!lake[i]) { land++; landArea += w; }
      if (ice[i]) iceArea += w;
    }
  }
  return {
    W, H, seed, sea, elev, ocean, lake, saltFlat, water, T, Tw, Ts, ice, down, acc,
    stats: {
      landFrac: landArea / area, oceanFrac: oceanArea / area, iceFrac: iceArea / area,
      frozenOceanFrac: oceanArea ? frozenOceanArea / oceanArea : 0,
      maxElev: Math.max(...elev) - Math.max(0, sea),
    },
  };
}

/* ---------- habitability, settlements, routes ---------- */

export function habitability(ter, knobs, { observers = true } = {}) {
  const hab = new Float32Array(N);
  if (!observers) return hab;
  const iceSinks = knobs.iceDensity > 1.0;
  const hotNear = new Float32Array(N);
  if (iceSinks) {
    for (const h of HOTSPOTS) {
      const hx = lonToX(h.lon), hy = latToY(h.lat);
      for (let y = Math.max(0, Math.floor(hy - 9)); y < Math.min(H, hy + 9); y++) for (let x = Math.floor(hx - 9); x < hx + 9; x++) {
        const xx = ((x % W) + W) % W, d = Math.hypot(x - hx, y - hy);
        hotNear[y * W + xx] = Math.max(hotNear[y * W + xx], Math.exp(-(d * d) / 18));
      }
    }
  }
  const coast = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (ter.water[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -2; dy <= 2 && !coast[i]; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      if (ter.ocean[yy * W + ((x + dx + W) % W)]) { coast[i] = 1; break; }
    }
  }
  const highM = 2600 / knobs.gFactor;
  for (let i = 0; i < N; i++) {
    if (ter.water[i] || ter.ice[i] || ter.saltFlat[i]) continue;
    const t = ter.T[i];
    let s = Math.exp(-(((t - 18) / 13) ** 2));
    const river = ter.acc[i] > 60 ? 1 : ter.acc[i] > 18 ? 0.75 : 0;
    s *= coast[i] ? 1 : river ? 0.55 + 0.4 * river : 0.32;
    if (ter.elev[i] > highM) s *= 0.35;
    if (ter.Ts[i] - ter.Tw[i] > 45) s *= 0.55;               // brutal seasons
    if (ter.Ts[i] > 42) s *= 0.4;
    if (iceSinks && ter.Tw[i] < 0) s *= Math.max(river ? 0.45 : 0.15, hotNear[i]);   // lakes freeze solid: only rivers and hot springs stay liquid
    if (iceSinks) s *= 1 + 1.6 * hotNear[i];
    hab[i] = s;
  }
  return hab;
}

export function placeSettlements(ter, hab, count, seed, names) {
  const rng = makeRng(seed ^ 0x7f4a7c15);
  const cand = [];
  for (let i = 0; i < N; i += 1) if (hab[i] > 0.12) cand.push(i);
  cand.sort((a, b) => hab[b] - hab[a]);
  const pool = cand.slice(0, 2600);
  const picked = [];
  const minD = 8.5;   // cells (about 6.4 degrees)
  let tries = 0;
  while (picked.length < count && tries < 6000 && pool.length) {
    tries++;
    const k = Math.floor(Math.pow(rng.next(), 2.2) * pool.length);
    const i = pool[k];
    const x = i % W, y = (i / W) | 0;
    let ok = true;
    for (const p of picked) { let dx = Math.abs(p.x - x); dx = Math.min(dx, W - dx); if (dx * dx + (p.y - y) ** 2 < minD * minD) { ok = false; break; } }
    if (!ok) continue;
    picked.push({ i, x, y, lon: cellLon(x), lat: cellLat(y), score: hab[i], coast: ter.ocean[i - 1] || ter.ocean[i + 1] || ter.ocean[i - W] || ter.ocean[i + W] });
  }
  picked.sort((a, b) => b.score - a.score);
  return picked.map((p, r) => ({ id: 'st-' + String(r + 1).padStart(2, '0'), name: names(r), rank: r, ...p }));
}

const RW = ROUTE_GRID.W, RH = ROUTE_GRID.H, RS = W / RW;

function routeCostGrid(ter, gFactor) {
  const cost = new Float32Array(RW * RH), sea = new Uint8Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    let land = 0, e = 0, ice = 0, n = 0;
    for (let dy = 0; dy < RS; dy++) for (let dx = 0; dx < RS; dx++) {
      const i = (y * RS + dy) * W + x * RS + dx; n++;
      if (!ter.water[i]) land++; e += Math.max(0, ter.elev[i]); if (ter.ice[i]) ice++;
    }
    const k = y * RW + x;
    sea[k] = land < n / 2 ? 1 : 0;
    cost[k] = sea[k] ? 2.2 : 1 + (e / n) / 900 * gFactor + (ice > n / 2 ? 5 : 0);
  }
  return { cost, sea };
}

function astar(grid, sx, sy, tx, ty) {
  const n = RW * RH;
  const g = new Float32Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
  const open = [];
  const h = (x, y) => { let dx = Math.abs(x - tx); dx = Math.min(dx, RW - dx); return Math.hypot(dx, y - ty); };
  const s = sy * RW + sx, t = ty * RW + tx;
  g[s] = 0; open.push([h(sx, sy), s]);
  let guard = 0;
  while (open.length && guard++ < 40000) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, i] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (i === t) break;
    if (closed[i]) continue; closed[i] = 1;
    const x = i % RW, y = (i / RW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y + dy; if (yy < 0 || yy >= RH) continue;
      const xx = (x + dx + RW) % RW, j = yy * RW + xx;
      if (closed[j]) continue;
      const step = (dx && dy ? 1.414 : 1) * (grid.cost[i] + grid.cost[j]) / 2;
      if (g[i] + step < g[j]) { g[j] = g[i] + step; from[j] = i; open.push([g[j] + h(xx, yy), j]); }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const path = []; let c = t;
  while (c >= 0) { path.push(c); if (c === s) break; c = from[c]; }
  path.reverse();
  return { cells: path, cost: g[t] };
}

/* minimum spanning tree over settlements plus a few short loops; each edge a least-cost path */
export function buildRoutes(ter, settlements, gFactor, { extra = 0.25 } = {}) {
  if (settlements.length < 2) return [];
  const grid = routeCostGrid(ter, gFactor);
  const n = settlements.length;
  const d = (a, b) => { let dx = Math.abs(a.lon - b.lon); dx = Math.min(dx, 360 - dx) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180); return Math.hypot(dx, a.lat - b.lat); };
  const inTree = new Array(n).fill(false); inTree[0] = true;
  const edges = [];
  for (let k = 1; k < n; k++) {
    let best = null;
    for (let a = 0; a < n; a++) if (inTree[a]) for (let b = 0; b < n; b++) if (!inTree[b]) { const dd = d(settlements[a], settlements[b]); if (!best || dd < best[2]) best = [a, b, dd]; }
    inTree[best[1]] = true; edges.push(best);
  }
  // add short non-tree edges for loops
  const cands = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (!edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) cands.push([a, b, d(settlements[a], settlements[b])]);
  cands.sort((p, q) => p[2] - q[2]);
  edges.push(...cands.slice(0, Math.round(n * extra)).filter((e) => e[2] < 32));
  const toR = (s) => [Math.min(RW - 1, Math.floor(s.x / RS)), Math.min(RH - 1, Math.floor(s.y / RS))];
  const routes = [];
  for (const [a, b, dd] of edges) {
    if (dd > 70) continue;
    const [sx, sy] = toR(settlements[a]), [tx, ty] = toR(settlements[b]);
    const p = astar(grid, sx, sy, tx, ty);
    if (!p) continue;
    const pts = p.cells.map((c) => [((c % RW) + 0.5) * RS - 0.5, (((c / RW) | 0) + 0.5) * RS - 0.5]);
    pts[0] = [settlements[a].x, settlements[a].y]; pts[pts.length - 1] = [settlements[b].x, settlements[b].y];
    const seaShare = p.cells.filter((c) => grid.sea[c]).length / p.cells.length;
    routes.push({ id: `rt-${settlements[a].id}-${settlements[b].id}`, a: settlements[a].id, b: settlements[b].id, pts, sea: seaShare > 0.5, cost: p.cost });
  }
  return routes;
}

/* ---------- geometry for the view: contours by marching squares ---------- */
export function contours(field, level, { wrapOk = false } = {}) {
  const segs = [];
  const v = (x, y) => field[y * W + x] - level;
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const top = [x + a / (a - b), y], right = [x + 1, y + b / (b - c)], bottom = [x + d / (d - c), y + 1], left = [x, y + a / (a - d)];
    const add = (p, q) => segs.push([p, q]);
    switch (idx) {
      case 1: case 14: add(left, bottom); break;
      case 2: case 13: add(bottom, right); break;
      case 3: case 12: add(left, right); break;
      case 4: case 11: add(top, right); break;
      case 5: add(left, top); add(bottom, right); break;
      case 6: case 9: add(top, bottom); break;
      case 7: case 8: add(left, top); break;
      case 10: add(left, bottom); add(top, right); break;
      default: break;
    }
  }
  // join into polylines through shared endpoints (segments are not oriented)
  const key = (p) => `${Math.round(p[0] * 512)},${Math.round(p[1] * 512)}`;
  const at = new Map();
  segs.forEach((s, k) => { for (const p of s) { const kk = key(p); const l = at.get(kk); if (l) l.push(k); else at.set(kk, [k]); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  const extend = (line, front) => {
    for (let guard = 0; guard < 50000; guard++) {
      const end = front ? line[0] : line[line.length - 1];
      const list = at.get(key(end)) || [];
      const nx = list.find((j) => !used[j]);
      if (nx == null) return;
      used[nx] = 1;
      const s2 = segs[nx];
      const other = key(s2[0]) === key(end) ? s2[1] : s2[0];
      if (front) line.unshift(other); else line.push(other);
    }
  };
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const line = [segs[k][0], segs[k][1]];
    extend(line, false); extend(line, true);
    if (line.length >= 3 || wrapOk) lines.push(line);
  }
  return lines;
}

export const TERRAIN_GRID = { W, H, DEG };
