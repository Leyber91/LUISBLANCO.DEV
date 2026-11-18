/* tools/drives/survey.mjs: what the drives of the Exomania survey opened with ?still share (ticket 2.22).

   In still mode the engine draws a frame once and waits for that frame's program (exoplanet.js _draw, block =
   this.still): a look whose program this Chrome has not built yet is finished with getProgramParameter, which holds
   the page's main thread until the GPU process has compiled it, and no frame comes back meanwhile. Measured on
   2026-11-18 at 390 px in headless Chrome drawing in software (_reference/labs/process/scripts/stall_still.mjs, seed 1,
   main e01282d): the first build of a look held the page 2.4 to 5.7 s and its frame came 1.7 to 5.0 s late, the
   first look at load 8.7 to 10.4 s; the ground program, started with the seven looks, was ready after 38 s. The
   stalls of the log and shapes drives ("a frame came back ... none within 6 tries" of 5 s) fell at the same kind of
   step as the frames main's drives lost with each try cut to 0.4 s, a press that opens another world, and two of
   them at the very step (log.mjs's "Another world" while the stored log is held, and shapes' key r), so they are
   taken to be these builds slowed past 30 s by a loaded machine: inferred, since no build under load was timed.
   Chrome keeps a built program for a later document of the same Chrome: on one new load of the same address the same
   looks took under 160 ms, and the page was ready in 426 ms instead of 9.5 s (how many programs it keeps, and for how
   long, is not known). Without ?still the page builds in the background and held its main thread for no second at
   all (the same seed, frames in 54 to 94 ms).

   So a survey drive builds the programs first, in a document of its own on a fixture store (nothing of the visitor's
   own store is read or written), before any rule judges a frame, and says how long that took. A drive with a guard on
   what the page may fetch installs the guard first, so that document is under it too. The drives that call this are
   the ones that open the survey with ?still while frames are judged: log, shapes, search and orbit, which change its
   world, and record, which opens only its default world and was exposed at its first, cold load; and planets, whose
   contact sheet (tools/dev/planet_sheet.html, the same shader source) draws its looks in still mode with frames on
   (ticket 2.22b). air opens the survey live, where nothing waits. exomania opens it with ?still
   once, on WASP-12 b after a live visit that waits for the world's note and not for its build, so it is exposed to a
   build still running when the page leaves; with each try at a frame cut to 0.4 s it passed 76 of 76 at 390 (2.22b).
   seedRandom makes "Another world" open the same worlds on every run from the same state (its pool takes in the
   weekly roster once that has joined), so a failure can be run again: it replaces
   Math.random in every document with the kit's mulberry32. Labs OS makes its ids with crypto, so the seed reaches the
   survey's random pick (main.js randomWorld) and nothing else of the lab. */
import { mulberry32 } from '../../labs/assets/js/kit/rng.js';

export const LOOK_PROGRAMS = [0, 1, 2, 3, 4, 5, 6];   // data.js LOOKS: one orbit program per look
export const GROUND = 'surface';                        // the ground program, built only for a drive that lands

/* The script that seeds Math.random in every document opened from now on. The generator's state is kept in the tab's
   sessionStorage, so the documents of one drive draw one sequence: restarted in each document, it opened the same
   worlds after every load, and the log drive's visits then fell on worlds already in the log (2026-11-18, 8 checks). */
export const DRAWS_KEY = 'drive-random';
export const seededRandom = (seed = 1) => `(() => {
  const mulberry32 = ${mulberry32.toString()};
  let state = ${seed >>> 0};
  try { const kept = sessionStorage.getItem(${JSON.stringify(DRAWS_KEY)}); if (kept !== null) state = Number(kept) >>> 0; } catch { /* a document with no storage */ }
  Math.random = () => {
    const r = mulberry32(state)();   // the generator's next draw from this state
    state = (state + 0x6D2B79F5) >>> 0;   // and the state it leaves (kit/rng.js mulberry32)
    try { sessionStorage.setItem(${JSON.stringify(DRAWS_KEY)}, String(state)); } catch { /* a document with no storage */ }
    return r;
  };
})()`;

export async function seedRandom(p, seed = 1) { await p.before(seededRandom(seed)); }

/* Open the survey once and build its programs: each starts in the background, then each is waited for. Called before
   p.frames(), so the waits it makes judge no frame. One check, with the time in its detail; a program that fails to
   build, a survey that never opens and a page with no WebGL each fail it. */
export async function buildPrograms(p, { base, ground = false }) {
  const keys = [...LOOK_PROGRAMS, ...(ground ? [GROUND] : [])];
  const t0 = Date.now();
  await p.go(`${base}/labs/exomania-survey.html?still&os-fixture=first-visit`);
  const up = await p.until('!!window.__exoEngine && document.body.classList.contains("ready")', 120000);
  const built = up ? await p.ev(`(() => { const e = window.__exoEngine; if (!e.gl || e.gl.isContextLost()) return null;
    const ks = ${JSON.stringify(keys)}, out = {};
    for (const k of ks) e.prepare(k);
    for (const k of ks) out[k] = e._programFor(k, true) ? 'built' : 'failed';
    return out; })()`) : null;
  const ok = !!built && keys.every((k) => built[k] === 'built');
  p.check(`the survey's ${keys.length} programs are built before any frame is judged (${ground ? 'the seven looks and the ground' : 'the seven looks'})`, ok,
    `${Date.now() - t0} ms; ${built ? JSON.stringify(built) : up ? 'no WebGL context' : 'the survey did not open'}`);
}
