/* ============================================================
   timeline/calc.js — the physics numbers the page computes live
   from the codex's stated values, so a visitor can check them.
   Pure; standard acoustics (I = p²/ρc, c = 331.3 √(1 + T/273.15)).
   ============================================================ */

export function soundSpeed(tC = 20) { return 331.3 * Math.sqrt(1 + tC / 273.15); }

export const CALC = {
  lambda() {
    const c = soundSpeed(20), f = 110, lam = c / f;
    return { value: lam, text: `At 110 Hz in air at 20 °C, c = ${c.toFixed(1)} m/s and the wavelength is λ = c/f = ${lam.toFixed(2)} m, so nodes sit ${(lam / 2).toFixed(2)} m apart. The codex gives λ ≈ 3.1 m.` };
  },
  power() {
    const spl = 138, r = 1.5, rho = 1.204, c = soundSpeed(20);
    const p = 20e-6 * Math.pow(10, spl / 20);
    const I = (p * p) / (rho * c);
    const P = 4 * Math.PI * r * r * I;
    return { value: P, text: `138 dB is p = ${p.toFixed(0)} Pa rms, so I = p²/ρc = ${I.toFixed(1)} W/m². Over a sphere of radius 1.5 m that is ${(P / 1000).toFixed(2)} kW of sound. The codex gives 1.8 kW.` };
  },
  stone() {
    const vs = 6000, va = soundSpeed(20), d = 500e3;
    return { value: vs / va, text: `A tap in rock is ${(vs / va).toFixed(1)} times faster than a shout. Across 500 km: ${(d / vs).toFixed(0)} s through stone, ${(d / va / 60).toFixed(0)} min through air.` };
  },
};
