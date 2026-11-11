/* ============================================================
   last-witness/record.js — the witness record the visitor keeps.
   Two files: a plain-text record to read, and JSON with every
   number and every turn, including which route voiced it.
   Only what TALLY actually said is in it; untold facts stay untold.
   ============================================================ */

import { LAB, SOURCES, CONSTANTS } from './config.js';
import { YEAR } from './physics.js';
import { fmtInt, fmtDur, fmtSci, shipStamp, fmtHz, fmtLen, storyCompare } from './world.js';

export function buildRecord({ world, plan, mind, transcript, ending, url, version = '', model = {} }) {
  const snap = mind.snapshot();
  const crossing = plan.method === 'orbit'
    ? { method: 'orbit', mass_msun: plan.mSun, spin_one_minus_a: plan.delta, stay_s: plan.stayS, isco_M: plan.iscoM, E: plan.E, bind_fraction: plan.bind, tidal_g: plan.tidalG }
    : plan.method === 'flight'
      ? { method: 'flight', accel_g: plan.aG, ship_s: plan.shipS, gamma_max: plan.gammaMax, turn_ly: plan.xMaxLy, mass_ratio_log10: plan.lnRatio / Math.LN10 }
      : { method: plan.method, mass_msun: plan.mSun, r_over_rs: plan.f, stay_s: plan.stayS };
  const told = new Set(snap.told);
  const json = {
    record: 'time-slip-the-last-witness/1',
    version,
    url,
    made: new Date().toISOString(),
    tags: { real: 'computed from the cited formulas and constants', illustrative: 'seeded story content: eras, people, TALLY\'s words, the tolerance bands' },
    sources: SOURCES.map((s) => s.cite),
    constants: CONSTANTS.map((c) => ({ name: c.k, value: c.v, source: c.src })),
    ledger: plan.journey.legs.map((l) => ({ leg: l.id, ship_s: l.shipS, home_s: l.homeS, rate_from: l.rate[0], rate_to: l.rate[1], dE_per_rest_mass: l.dE ?? null, integrator: l.tab ? 'RK4' : 'constant rate' })),
    model,
    crossing,
    clocks: {
      ship_seconds: plan.shipS, stay_ship_seconds: plan.stayS,
      home_years: world.years, home_years_from: 'the sum of the integrated legs in the ledger',
      story_years: LAB.storyYears, home_vs_story: storyCompare(world.years).text,
      ratio_at_depth: world.plan.factorMax,
      formula: plan.method === 'orbit' ? 'u^t at the prograde ISCO, Bardeen, Press & Teukolsky 1972'
        : plan.method === 'flight' ? 'hyperbolic motion, four legs, Misner, Thorne & Wheeler 1973 §6.2' : 'sqrt(1 - rs/r), Hartle 2003',
    },
    beacon: {
      heartbeats_sent: world.beacon.beatsSent,
      beat_interval_at_home_max_s: world.beacon.beatMaxS,
      carrier_sent_hz: world.beacon.carrierHz,
      carrier_received_min_hz: world.beacon.carrierMinHz,
      half_wave_m: world.beacon.halfWaveM,
    },
    message: { text: world.message.text, bits: world.message.bits, arrival_span_s: world.message.spanS },
    world: {
      seed: world.seed,
      eras_told: world.eras.filter((e) => told.has({ watch: 'watch', count: 'count', argument: 'argument', reverence: 'reading', dread: 'reading', after: 'alone_long' }[e.id] || 'fate')).map((e) => ({ name: e.name, from: e.from, to: e.to })),
      facts_told: snap.told.length, facts_total: snap.total,
    },
    ship_log: world.shipLog.map((l) => ({ ship_time: shipStamp(l.tau), home_year: told.has(l.anomaly ? 'answer' : 'fate') ? l.year : null, entry: l.text })),
    conversation: transcript.map((t) => ({ who: t.who, text: t.text, voiced_by: t.source || null, model: t.model || null })),
    state: { trust: Number(snap.trust.toFixed(3)), disclosure: snap.level, mood: snap.mood, memory: snap.memory },
    ending: ending ? { kind: ending.kind, title: ending.title, text: ending.text } : null,
  };

  const L = [];
  L.push('TIME-SLIP: THE LAST WITNESS', 'witness record', '');
  L.push(url, `made ${new Date().toISOString()} by ${version}`, '');
  L.push('THE CROSSING');
  if (plan.method === 'orbit') {
    L.push(`  orbit, prograde, at the innermost stable circular orbit`);
    L.push(`  mass ${fmtSci(plan.mSun)} Msun, spin a* = 1 - ${fmtSci(plan.delta, 2)}`);
    L.push(`  tidal stretch ${fmtSci(plan.tidalG)} g; to climb out: ${(plan.bind * 100).toFixed(1)} % of rest mass`);
  } else if (plan.method === 'flight') {
    L.push(`  flight, four legs at ${plan.aG} g; peak gamma ${fmtSci(plan.gammaMax)}; turned ${fmtInt(plan.xMaxLy)} light-years out`);
    L.push(`  ideal photon rocket mass ratio 1e${(plan.lnRatio / Math.LN10).toFixed(1)}`);
  }
  L.push('', 'THE CLOCKS');
  L.push(`  yours  ${fmtDur(plan.shipS)} (a stay of ${fmtDur(plan.stayS)} you chose)`);
  L.push(`  home   ${fmtInt(world.years)} years, the sum of the legs below`);
  L.push(`         ${storyCompare(world.years).text}`);
  L.push(`  ratio at the deepest point  ${fmtSci(world.plan.factorMax)}`);
  L.push('', 'THE LEDGER (each leg integrated with RK4) [real]');
  for (const l of plan.journey.legs) L.push(`  ${l.id.padEnd(11)} you ${fmtDur(l.shipS).padEnd(24)} home ${(l.homeS / YEAR).toPrecision(6)} yr`);
  L.push('', 'THE BEACON, AS HOME HEARD IT');
  L.push(`  ${fmtInt(world.beacon.beatsSent)} heartbeats; at most ${fmtDur(world.beacon.beatMaxS)} apart`);
  L.push(`  carrier sent at ${fmtHz(world.beacon.carrierHz)}, received as low as ${fmtHz(world.beacon.carrierMinHz)}; half-wave ${fmtLen(world.beacon.halfWaveM)}`);
  L.push(`  your line for home: "${world.message.text}" (${world.message.bits} bits, arrived over ${fmtDur(world.message.spanS)})`);
  L.push('', 'SHIP LOG');
  for (const r of json.ship_log) L.push(`  ${r.ship_time.padEnd(16)} ${r.entry}`);
  L.push('', 'CONVERSATION');
  for (const t of transcript) {
    const who = t.who === 'tally' ? `TALLY${t.source && t.source !== 'engine' ? ` (voiced by ${t.model || t.source})` : ''}` : 'YOU';
    L.push(`  ${who}: ${t.text}`);
  }
  if (ending) { L.push('', 'ENDING: ' + ending.title.toUpperCase(), ''); ending.text.split('\n\n').forEach((p) => L.push('  ' + p, '')); }
  L.push('', `TALLY told you ${snap.told.length} of the ${snap.total} things it knew.`);
  L.push('', 'Computed: the clocks, the costs, the beacon\'s stretch, the carrier drop, the antenna, the blueshifted answer.');
  L.push('Invented: the world\'s history, its people, TALLY\'s words. An original story in the spirit of TRIVERSE.');
  return { json, text: L.join('\n') };
}

export function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const yearsOf = (s) => s / YEAR;
