/* ============================================================
   The test of the render's fit to the machine (adapt.js,
   adapt.test.mjs). Run from the repository root:
     node labs/assets/js/blackhole/tests/adapt.mutants.test.mjs

   Each entry silences a rule or loosens a condition of adapt.js.
   The broken file is written to a copy of this lab in the system's
   temp folder and adapt.test.mjs is run on the copy. The list began
   with the 30 mutants of review_res (2026-11-18), 29 of which the
   first tests let pass; it is kept to the code as it now stands.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  // the constants
  ['climb bound 2.4 s', `climbMs: 1200,`, `climbMs: 2400,`],
  ['climb bound 1.0 s', `climbMs: 1200,`, `climbMs: 1000,`],
  ['drop bound 3 s', `dropMs: 2500,`, `dropMs: 3000,`],
  ['hold 3.5 s', `holdMs: 3000 };`, `holdMs: 3500 };`],
  ['slow preview 44 ms', `slowMs: 40,`, `slowMs: 44,`],
  ['keeping up 30 ms', `keepUpMs: 20,`, `keepUpMs: 30,`],
  ['keeping up 17 ms', `keepUpMs: 20,`, `keepUpMs: 17,`],
  ['preview hold 0.5 s', `holdMs: 1000, undoMs`, `holdMs: 500, undoMs`],
  ['preview undo 60 s', `undoMs: 5000 }`, `undoMs: 60000 }`],
  // the rays
  ['prediction ignores supersamples', `return Math.round(w * d) * Math.round(h * d) * t.ss * t.ss;`, `return Math.round(w * d) * Math.round(h * d) * t.ss;`],
  ['prediction ignores the dpr cap', `const d = Math.min(dpr, t.dprCap) * t.scale;`, `const d = dpr * t.scale;`],
  ['no prediction: the current picture time is compared', `const predicted = refineMs * tierRays(tiers[next], w, h, dpr) / tierRays(tiers[s.tier], w, h, dpr);`, `const predicted = refineMs;`],
  // the tier's bounds
  ['drop bound inclusive', `const slow = refineMs > ADAPT.dropMs;`, `const slow = refineMs >= ADAPT.dropMs;`],
  ['a slow picture at min restarts the hold', `return j === i ? s : { tier: ORDER[j], ceiling: s.ceiling, lastChange: now, from: null };`, `return j === i ? { ...s, lastChange: now } : { tier: ORDER[j], ceiling: s.ceiling, lastChange: now, from: null };`],
  ['a step down forgets the step up before it', `return { ps: PREVIEW_STEPS[k - 1], ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: s.lastUp };`, `return { ps: PREVIEW_STEPS[k - 1], ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: -Infinity };`],
  ['a failed climb never lowers the ceiling below the tier it left', `ceiling: Math.min(s.ceiling, k), lastChange: now, from: null }; }`, `ceiling: Math.max(0, Math.min(s.ceiling, k) - 1), lastChange: now, from: null }; }`],
  ['two-tier drop at 2x the bound', `refineMs > 3 * ADAPT.dropMs ? 2 : 1`, `refineMs > 2 * ADAPT.dropMs ? 2 : 1`],
  ['two-tier drop at 3.9x the bound', `refineMs > 3 * ADAPT.dropMs ? 2 : 1`, `refineMs > 3.9 * ADAPT.dropMs ? 2 : 1`],
  ['two-tier drop bound inclusive', `refineMs > 3 * ADAPT.dropMs ? 2 : 1`, `refineMs >= 3 * ADAPT.dropMs ? 2 : 1`],
  ['hold inclusive', `now - s.lastChange >= ADAPT.holdMs`, `now - s.lastChange > ADAPT.holdMs`],
  ['climb bound inclusive', `if (predicted < ADAPT.climbMs)`, `if (predicted <= ADAPT.climbMs)`],
  ['NaN guard removed', `if (i < 0 || !(refineMs >= 0)) return s;`, `if (i < 0) return s;`],
  // the undo of a climb
  ['a failed climb drops one tier instead of returning', `if (slow) { const k = ORDER.indexOf(s.from); return { tier: s.from, ceiling: Math.min(s.ceiling, k), lastChange: now, from: null }; }`, `if (slow) { const k = ORDER.indexOf(s.from); return { tier: ORDER[Math.max(0, i - 2)], ceiling: Math.min(s.ceiling, k), lastChange: now, from: null }; }`],
  ['a failed climb sets no ceiling', `return { tier: s.from, ceiling: Math.min(s.ceiling, k), lastChange: now, from: null }; }`, `return { tier: s.from, ceiling: s.ceiling, lastChange: now, from: null }; }`],
  ['a failed climb lowers the ceiling two tiers', `ceiling: Math.min(s.ceiling, k), lastChange: now, from: null }; }`, `ceiling: Math.min(s.ceiling, k - 1), lastChange: now, from: null }; }`],
  ['the climb never remembered', `if (predicted < ADAPT.climbMs) return { tier: next, ceiling: s.ceiling, lastChange: now, from: s.tier };`, `if (predicted < ADAPT.climbMs) return { tier: next, ceiling: s.ceiling, lastChange: now, from: null };`],
  ['the first picture after a climb never forgets it', `    s = { ...s, from: null };\n`, ``],
  ['any drop lowers the ceiling', `return j === i ? s : { tier: ORDER[j], ceiling: s.ceiling, lastChange: now, from: null };`, `return j === i ? s : { tier: ORDER[j], ceiling: Math.min(s.ceiling, j), lastChange: now, from: null };`],
  ['a drop does not restart the hold', `return j === i ? s : { tier: ORDER[j], ceiling: s.ceiling, lastChange: now, from: null };`, `return j === i ? s : { tier: ORDER[j], ceiling: s.ceiling, lastChange: s.lastChange, from: null };`],
  // the preview
  ['preview slow bound inclusive', `frameMs > PREVIEW.slowMs`, `frameMs >= PREVIEW.slowMs`],
  ['preview keep-up bound inclusive', `frameMs < PREVIEW.keepUpMs`, `frameMs <= PREVIEW.keepUpMs`],
  ['no preview hold', `if (!(frameMs > 0) || now < s.holdUntil) return s;`, `if (!(frameMs > 0)) return s;`],
  ['any step down lowers the preview ceiling', `now - s.lastUp < PREVIEW.undoMs ? Math.min(s.ceiling, k - 1) : s.ceiling`, `Math.min(s.ceiling, k - 1)`],
  ['preview undo inclusive', `now - s.lastUp < PREVIEW.undoMs`, `now - s.lastUp <= PREVIEW.undoMs`],
  ['preview ceiling lowered two steps', `Math.min(s.ceiling, k - 1) : s.ceiling`, `Math.min(s.ceiling, k - 2) : s.ceiling`],
  ['no floor guard on the step down', `if (frameMs > PREVIEW.slowMs && k > 0) {`, `if (frameMs > PREVIEW.slowMs) {`],
  ['a step down does not hold', `return { ps: PREVIEW_STEPS[k - 1], ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: s.lastUp };`, `return { ps: PREVIEW_STEPS[k - 1], ceiling, holdUntil: now, lastUp: s.lastUp };`],
  ['a step up is not remembered', `return { ps: PREVIEW_STEPS[k + 1], ceiling: s.ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: now };`, `return { ps: PREVIEW_STEPS[k + 1], ceiling: s.ceiling, holdUntil: now + PREVIEW.holdMs, lastUp: s.lastUp };`],
  ['a tier change keeps the preview\'s undo', `return { ...s, lastUp: -Infinity, holdUntil: now + PREVIEW.holdMs };`, `return { ...s, holdUntil: now + PREVIEW.holdMs };`],
  ['a tier change does not hold the preview', `return { ...s, lastUp: -Infinity, holdUntil: now + PREVIEW.holdMs };`, `return { ...s, lastUp: -Infinity };`],
  ['previewStart keeps an off-step scale', `return { ps: PREVIEW_STEPS[stepOf(ps)],`, `return { ps,`],
];

process.exit(await runMutants({ here, file: 'adapt.js', test: '../adapt.test.mjs', mutants: MUTANTS }));
