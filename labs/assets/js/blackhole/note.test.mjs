/* ============================================================
   blackhole/note.test.mjs — the view's caption hint (config.js
   viewHint). Run:  node labs/assets/js/blackhole/note.test.mjs

   The cinematic note said "a camera 46 M away, 5 M above the disk
   plane" at every inclination and distance; the final grade of
   2026-11-18 found it true at 84 deg only. The height is r cos i,
   from the camera's own distance and inclination.
   ============================================================ */

import { viewHint, VIEWS } from './config.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

const cases = [
  [84, 46, 'a camera 46 M away, 4.8 M above the disk plane'],
  [90, 46, 'a camera 46 M away, in the disk plane'],
  [120, 46, 'a camera 46 M away, 23 M below the disk plane'],
  [60, 8.5, 'a camera 8.5 M away, 4.3 M above the disk plane'],
  [17, 1000, 'a camera 1000 M away, 956 M above the disk plane'],
];
for (const [incl, rcam, want] of cases) {
  const got = viewHint({ view: 'cinematic', incl, rcam });
  ok(`the cinematic camera at ${rcam} M and ${incl} deg: "${want}"`, got === want, got);
}
ok('the other views keep their own hints', viewHint({ view: 'telescope', incl: 17, rcam: 1000 }) === VIEWS.telescope.hint && viewHint({ view: 'journey', incl: 75, rcam: 40 }) === VIEWS.journey.hint);
ok('no fixed hint claims a height: the cinematic one is computed, and its table entry says only what is always true',
  !Object.values(VIEWS).some((v) => /M above the disk plane/.test(v.hint || '')) && viewHint({ view: 'cinematic', incl: 84, rcam: 46 }) !== VIEWS.cinematic.hint, VIEWS.cinematic.hint);

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
