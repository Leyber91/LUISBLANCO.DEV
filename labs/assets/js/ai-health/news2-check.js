/* ============================================================
   ai-health/news2-check.js — a second NEWS2 written independently of
   news2.js: plain if-chains typed from RCP 2017 Chart 1, sharing no
   table, no helper and no band data with the first. The page sweeps
   every recordable value of every parameter through both and reports
   the disagreements (there should be none).
   ============================================================ */

import { scoreNEWS2 } from './news2.js';

function rrPts(v) { if (v <= 8) return 3; if (v <= 11) return 1; if (v <= 20) return 0; if (v <= 24) return 2; return 3; }
function spo2S1(v) { if (v <= 91) return 3; if (v <= 93) return 2; if (v <= 95) return 1; return 0; }
function spo2S2(v, onO2) {
  if (v <= 83) return 3;
  if (v <= 85) return 2;
  if (v <= 87) return 1;
  if (v <= 92) return 0;
  if (!onO2) return 0;          // 93 or more on air
  if (v <= 94) return 1;
  if (v <= 96) return 2;
  return 3;
}
function sbpPts(v) { if (v <= 90) return 3; if (v <= 100) return 2; if (v <= 110) return 1; if (v <= 219) return 0; return 3; }
function hrPts(v) { if (v <= 40) return 3; if (v <= 50) return 1; if (v <= 90) return 0; if (v <= 110) return 1; if (v <= 130) return 2; return 3; }
function tempPts(tenths) { if (tenths <= 350) return 3; if (tenths <= 360) return 1; if (tenths <= 380) return 0; if (tenths <= 390) return 1; return 2; }

export function independentTotal(o) {
  const onO2 = o.o2 === 1;
  return rrPts(o.rr) + (o.scale2 ? spo2S2(o.spo2, onO2) : spo2S1(o.spo2)) + (onO2 ? 2 : 0) +
    sbpPts(o.sbp) + hrPts(o.hr) + (o.cvpu === 1 ? 3 : 0) + tempPts(Math.round(o.temp * 10));
}

/* Every recordable value of each parameter, the others held normal. */
export function sweep() {
  const base = { rr: 16, spo2: 97, o2: 0, sbp: 120, hr: 70, cvpu: 0, temp: 37.0, scale2: 0 };
  const cases = [];
  for (let v = 0; v <= 60; v++) cases.push({ ...base, rr: v });
  for (let v = 20; v <= 250; v++) cases.push({ ...base, hr: v });
  for (let v = 40; v <= 300; v++) cases.push({ ...base, sbp: v });
  for (const scale2 of [0, 1]) for (const o2 of [0, 1]) for (let v = 50; v <= 100; v++) cases.push({ ...base, spo2: v, o2, scale2 });
  for (let t = 300; t <= 430; t++) cases.push({ ...base, temp: t / 10 });
  for (const cvpu of [0, 1]) cases.push({ ...base, cvpu });
  const bad = [];
  for (const c of cases) {
    const a = scoreNEWS2(c).total, b = independentTotal(c);
    if (a !== b) bad.push({ obs: c, table: a, independent: b });
  }
  return { n: cases.length, bad };
}
