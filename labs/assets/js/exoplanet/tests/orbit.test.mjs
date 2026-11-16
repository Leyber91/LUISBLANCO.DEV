/* ============================================================
   Where the orbit camera stands (orbit.js), and how far the
   system view reaches (views/system.js). Run from the
   repository root:
     node labs/assets/js/exoplanet/tests/orbit.test.mjs

   Two things a visitor reported on a phone on 2026-11-15:
   turning the planet never showed its star, and the Solar
   System comparison was drawn at a scale that left most of it
   outside the view. The rules that answer them are tested
   here with a case on each side of every bound; the engine's
   own numbers (its star, its lens, the shader's change of "up")
   are read from its source, so a change there fails here.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PITCH_LIMIT, HOME, TOUCH_SLOP, orbitFrame, orbitDir, pitchMax, farSideYaw, touchTurns } from '../orbit.js';
import { SOLAR_REACH, viewExtent, solarWords } from '../views/system.js';
import { SOLAR } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => a.map((x) => x / len(a));
const deg = (r) => r * 180 / Math.PI;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const nearV = (a, b, eps = 1e-9) => a.every((x, i) => near(x, b[i], eps));
/* the level circle the camera stood on before: what a stored view meant */
const level = (yaw, pitch) => [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];

/* ---- the engine's own numbers, read from its source ---- */
const engine = readFileSync(join(here, '..', 'exoplanet.js'), 'utf8').replace(/\r\n/g, '\n');
const pick = (re) => { const m = engine.match(re); return m ? m.slice(1).map(Number) : null; };
const STAR = pick(/lightDir: \[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\]/);
const [LENS] = pick(/yaw: HOME\.yaw, pitch: HOME\.pitch, fov: ([\d.]+)/) || [];
const [FLIP] = pick(/abs\(fwd\.y\) > ([\d.]+) \? vec3\(0\.0,0\.0,1\.0\)/) || [];
const YAW0 = HOME.yaw, PITCH0 = HOME.pitch;
const page = readFileSync(join(here, '..', 'main.js'), 'utf8');
{
  yes('the engine names its star, its lens and where the shader changes its "up"', !!STAR && STAR.length === 3 && LENS === 1.5 && FLIP === 0.99, JSON.stringify({ STAR, LENS, FLIP }));
  yes('a world opens at a yaw of 0.7 and a pitch of 0.26, and the view cannot be changed by accident', HOME.yaw === 0.7 && HOME.pitch === 0.26 && Object.isFrozen(HOME));
  yes('the engine opens every world there, says so to the page, and the page writes a view into the address only when it differs from it', (engine.match(/yaw: HOME\.yaw, pitch: HOME\.pitch/g) || []).length === 2 && /yaw0: HOME\.yaw, pitch0: HOME\.pitch/.test(engine)
    && /Math\.abs\(c\.yaw - c\.yaw0\) > 0\.01 \|\| Math\.abs\(c\.pitch - c\.pitch0\) > 0\.01/.test(page) && !/\?\? 0\.3\)/.test(page));
  yes('the engine takes the camera\'s place from orbit.js, and nowhere computes it on the level circle', /import \{ HOME, orbitDir, pitchMax, touchTurns \} from '\.\/orbit\.js';/.test(engine) && /vscale\(orbitDir\(cfg\.yaw, cfg\.pitch, cfg\.lightDir\), cfg\.camDist\)/.test(engine) && !/Math\.cos\(pitch\) \* Math\.cos\(yaw\)/.test(engine));
  yes('a drag and the arrow keys stop the pitch where orbit.js says, and no pitch is bounded by the old 1.45', (engine.match(/ tilt\(/g) || []).length === 2 && /const tilt = \(d\) => \{ const most = pitchMax\(this\.cfg\.lightDir\)/.test(engine) && !/1\.45, this\.cfg\.pitch/.test(engine));
  yes('a touch the browser takes for a scroll ends the drag', /addEventListener\('touchcancel', \(\) => \{ pinch = 0; up\(\); \}/.test(engine));
}
const L = unit(STAR), TILT = Math.asin(L[1]);

/* ---- the frame of the circle ---- */
{
  const f = orbitFrame(STAR);
  yes('the first axis points at the star', nearV(f.e1, L));
  yes('the second is level and the three are unit vectors square to each other', near(f.e2[1], 0) && [f.e1, f.e2, f.e3].every((v) => near(len(v), 1)) && near(dot(f.e1, f.e2), 0) && near(dot(f.e1, f.e3), 0) && near(dot(f.e2, f.e3), 0));
  yes('the pole is the scene\'s "up" leaned away from the star, on the upper side', f.e3[1] > 0 && near(f.e3[1], Math.cos(TILT)) && nearV(f.e3, unit([0, 1, 0].map((y, i) => y - L[1] * L[i]))));
  yes('the three keep their hand: a growing yaw turns the same way it did on the level circle', nearV(cross(f.e2, f.e1), f.e3) && dot(f.e2, level(f.azimuth + Math.PI / 2, 0)) > 0.99);
  yes('the tilt is the star\'s height and the azimuth its bearing', near(f.tilt, TILT) && near(f.azimuth, Math.atan2(L[2], L[0])) && deg(f.tilt) > 27 && deg(f.tilt) < 28, `${deg(f.tilt).toFixed(1)} deg up, bearing ${deg(f.azimuth).toFixed(1)} deg`);
  const up = orbitFrame([0, 1, 0]), down = orbitFrame([0, -3, 0]);
  yes('a star straight overhead or underfoot still gives a frame', [up, down].every((g) => [g.e1, g.e2, g.e3].every((v) => near(len(v), 1)) && near(dot(g.e1, g.e2), 0) && near(dot(g.e2, g.e3), 0)) && near(up.tilt, Math.PI / 2) && near(down.tilt, -Math.PI / 2));
  yes('a star that is not a unit vector gives the same frame', nearV(orbitFrame(STAR.map((x) => x * 7)).e3, f.e3) && near(orbitFrame(STAR.map((x) => x * 7)).azimuth, f.azimuth));
}

/* ---- one turn of yaw reaches both sides ---- */
{
  const turn = Array.from({ length: 3600 }, (_, i) => i * Math.PI / 1800);
  const toward = turn.map((y) => dot(orbitDir(y, 0, STAR), L));
  yes('with the pitch at zero, one turn passes over the point under the star and the point opposite it', Math.max(...toward) > 0.999999 && Math.min(...toward) < -0.999999, `${Math.max(...toward).toFixed(7)} to ${Math.min(...toward).toFixed(7)}`);
  yes('the camera is under the star at the star\'s bearing and opposite it half a turn on', nearV(orbitDir(orbitFrame(STAR).azimuth, 0, STAR), L) && nearV(orbitDir(farSideYaw(STAR), 0, STAR), L.map((x) => -x)) && near(farSideYaw(STAR), orbitFrame(STAR).azimuth + Math.PI));
  yes('on the level circle it never came nearer the far point than the star\'s height', Math.min(...turn.map((y) => dot(level(y, 0), L))) > -Math.cos(TILT) - 1e-9 && deg(Math.acos(Math.cos(TILT))) > 27);
  yes('the camera\'s direction is a unit vector at any yaw and pitch', [[0, 0], [1, 0.3], [4, -0.9], [-7, 2], [100, -5]].every(([y, p]) => near(len(orbitDir(y, p, STAR)), 1)));
}

/* ---- the far side: the star is in the frame, beyond the limb ---- */
{
  /* where a direction falls in the picture, as the shader builds it: "up" is the scene's y axis, the lens is
     LENS, and the picture is one unit high (so its top edge is at 0.5) */
  const inPicture = (camDir, target) => {
    const fwd = camDir.map((x) => -x), rgt = unit(cross(fwd, [0, 1, 0])), upv = cross(rgt, fwd);
    const z = dot(target, fwd);
    return { x: LENS * dot(target, rgt) / z, y: LENS * dot(target, upv) / z, ahead: z > 0 };
  };
  const far = orbitDir(farSideYaw(STAR), PITCH0, STAR), off = Math.acos(-dot(far, L)), at = inPicture(far, L);
  yes('opposite the star at the starting pitch, the star is off the line of sight by that pitch', near(off, PITCH0, 1e-9), `${deg(off).toFixed(1)} deg`);
  yes('there it stands straight above the planet, 0.40 of the picture\'s height above its middle: over the limb of a planet that fills a phone\'s width (0.33) and under the top of a phone\'s picture (0.47)', at.ahead && near(at.y, LENS * Math.tan(PITCH0), 1e-9) && at.y > 0.385 && at.y < 0.415 && Math.abs(at.x) < 1e-9, `x ${at.x.toFixed(3)}, y ${at.y.toFixed(3)} of a picture one unit high`);
  yes('at the pitch used before, 0.30, it stood at 0.46, on the edge of a phone\'s picture', near(inPicture(orbitDir(farSideYaw(STAR), 0.3, STAR), L).y, 0.464, 0.001));
  yes('and it is clear of the planet\'s disc from 3.9 planet radii out, behind it nearer than 3.8', off > Math.asin(1 / 3.9) && off < Math.asin(1 / 3.8));
  const before = level(farSideYaw(STAR), PITCH0), was = inPicture(before, L);
  yes('on the level circle the same turn left the star above the picture\'s top edge', was.y > 0.5, `y ${was.y.toFixed(3)}`);
  const sweep = Array.from({ length: 721 }, (_, i) => farSideYaw(STAR) + (i - 360) * Math.PI / 720).filter((y) => { const q = inPicture(orbitDir(y, PITCH0, STAR), L); return q.ahead && Math.abs(q.y) < 0.5 && Math.abs(q.x) < 0.5 * 390 / 523; });
  yes('on a phone the star stays in the picture over 20 to 40 degrees of the turn', sweep.length * 0.25 > 20 && sweep.length * 0.25 < 40, `${(sweep.length * 0.25).toFixed(1)} deg`);
}

/* ---- what a stored view means now ---- */
{
  yes('for a star in the level plane the circle is the level circle it was', [[0.7, 0.3], [2, -0.8], [-3, 1.2], [9, 0]].every(([y, p]) => nearV(orbitDir(y, p, [0.4, 0, -0.9]), level(y, p), 1e-12)));
  const moved = (y, p) => Math.acos(Math.min(1, dot(orbitDir(y, p, STAR), level(y, p))));
  const worst = Math.max(...Array.from({ length: 360 }, (_, i) => moved(i * Math.PI / 180, 0.3)));
  yes('a view stored before keeps its bearing and is lifted or lowered by no more than the star\'s height', worst <= TILT + 1e-9 && worst > TILT - 0.02, `at most ${deg(worst).toFixed(1)} deg`);
  const phase = (d) => deg(Math.acos(dot(d, L)));
  yes('the starting view shows a little less of the day side than it did: the phase angle goes from 56 to 61 degrees', near(phase(level(0.7, 0.3)), 55.8, 0.1) && near(phase(orbitDir(YAW0, PITCH0, STAR)), 61.0, 0.15), `${phase(level(0.7, 0.3)).toFixed(1)} then ${phase(orbitDir(YAW0, PITCH0, STAR)).toFixed(1)}`);
}

/* ---- the pitch's bound ---- */
{
  yes('the limit keeps the line of sight clear of the shader\'s change of "up"', Math.sin(PITCH_LIMIT) < FLIP && PITCH_LIMIT === 1.4 && Math.sin(1.45) > FLIP);
  const most = pitchMax(STAR);
  yes('the pointer\'s bound is the limit less the star\'s height', near(most, PITCH_LIMIT - TILT) && near(most, 0.919, 0.001), most.toFixed(4));
  yes('a level star leaves the whole limit, a star below the plane counts by its depth, and a star near overhead leaves 0.35', near(pitchMax([1, 0, 0]), PITCH_LIMIT) && near(pitchMax([STAR[0], -STAR[1], STAR[2]]), most) && pitchMax([0, 1, 0]) === 0.35 && pitchMax([0.1, 5, 0]) === 0.35 && pitchMax([Math.cos(1.04), Math.sin(1.04), 0]) > 0.35 && pitchMax([Math.cos(1.06), Math.sin(1.06), 0]) === 0.35);
  yes('a pitch past the bound is read as the bound, on both sides', nearV(orbitDir(1, 5, STAR), orbitDir(1, most, STAR)) && nearV(orbitDir(1, -5, STAR), orbitDir(1, -most, STAR)) && !nearV(orbitDir(1, most, STAR), orbitDir(1, most - 0.01, STAR), 1e-6) && nearV(orbitDir(1, most + 1e-4, STAR), orbitDir(1, most, STAR)));
  let top = 0;
  for (let y = 0; y < 360; y += 2) for (const p of [-2, -most, -0.5, 0, 0.5, most, 2]) top = Math.max(top, Math.abs(orbitDir(y * Math.PI / 180, p, STAR)[1]));
  yes('at no yaw and pitch does the camera rise past the limit, and at the bound it reaches it', top <= Math.sin(PITCH_LIMIT) + 1e-9 && top > Math.sin(PITCH_LIMIT) - 1e-3 && top < FLIP, top.toFixed(4));
}

/* ---- whose a touch is ---- */
{
  yes('a touch is not read before it has travelled 8 px, whichever way', TOUCH_SLOP === 8 && touchTurns(5, 5, true) === null && touchTurns(7.9, 0, true) === null && touchTurns(0, -7.9, false) === null && touchTurns(8, 0, true) === true && touchTurns(0, 8, true) === false);
  yes('where the page scrolls up and down, a touch that sets out sideways turns the view and one that sets out up or down is the page\'s', touchTurns(20, 5, true) === true && touchTurns(-20, 19, true) === true && touchTurns(5, 20, true) === false && touchTurns(19, -20, true) === false);
  yes('one that sets out as far up as sideways is the page\'s', touchTurns(10, 10, true) === false && touchTurns(-10, 10, true) === false);
  yes('where the page does not scroll, every touch turns the view', touchTurns(5, 20, false) === true && touchTurns(0, -30, false) === true && touchTurns(10, 10, false) === true);
  yes('the engine asks orbit.js whose each touch is, reads from the canvas whether the page scrolls, counts the turn from where the finger came down, and leaves a touch the browser is already scrolling with',
    /whose = e\.cancelable === false \? false : touchTurns\(t\.clientX - sx, t\.clientY - sy, pans\)/.test(engine) && /pans = \/pan-y\/\.test\(getComputedStyle\(cv\)\.touchAction\)/.test(engine) && /if \(whose\) dn\(sx, sy\);/.test(engine)
    && /if \(whose\) \{ if \(e\.cancelable\) e\.preventDefault\(\); mv\(t\.clientX, t\.clientY\); \}/.test(engine));
}

/* ---- how far the system view reaches ---- */
{
  const neptune = Math.max(...SOLAR.map((s) => s.a));
  yes('with the Solar System shown the view reaches 8 percent past Neptune', near(SOLAR_REACH, neptune * 1.08) && near(SOLAR_REACH, 32.59, 0.01), SOLAR_REACH.toFixed(2));
  yes('every orbit of the Sun\'s planets is inside it, Neptune\'s at 93 percent of the way out', SOLAR.every((s) => s.a < SOLAR_REACH) && near(neptune / SOLAR_REACH, 0.926, 0.001) && SOLAR.length === 8);
  yes('a small system is drawn back to that reach, and only while the Solar System is shown', viewExtent(0.06, true) === SOLAR_REACH && viewExtent(0.06, false) === 0.06 && viewExtent(0.06) === 0.06);
  yes('a system wider than that keeps its own reach', viewExtent(80, true) === 80 && viewExtent(SOLAR_REACH + 0.01, true) === SOLAR_REACH + 0.01 && viewExtent(SOLAR_REACH, true) === SOLAR_REACH && viewExtent(SOLAR_REACH - 0.01, true) === SOLAR_REACH);
}

/* ---- where a system falls among the Sun's planets ---- */
{
  const w = (x) => solarWords('TOI-1', x);
  yes('inside Mercury\'s orbit', w(0.012) === '[REAL] On the scale of the Solar System, the outermost known orbit of TOI-1 reaches 0.012 AU, inside the orbit of Mercury (0.39 AU).', w(0.012));
  yes('between two orbits, each with its size', w(0.5) === '[REAL] On the scale of the Solar System, the outermost known orbit of TOI-1 reaches 0.50 AU, between the orbits of Mercury (0.39 AU) and Venus (0.72 AU).' && /between the orbits of Mars \(1\.5 AU\) and Jupiter \(5\.2 AU\)\.$/.test(w(3)) && /between the orbits of Uranus \(19 AU\) and Neptune \(30 AU\)\.$/.test(w(25)), w(0.5));
  yes('every gap between two of the eight is named by its own two planets', SOLAR.slice(0, -1).every((s, i) => new RegExp(`between the orbits of ${s.name} \\(.* AU\\) and ${SOLAR[i + 1].name} \\(.* AU\\)\\.$`).test(w((s.a + SOLAR[i + 1].a) / 2))));
  yes('beyond Neptune\'s', /reaches 68 AU, beyond the orbit of Neptune \(30 AU\)\.$/.test(w(68)), w(68));
  yes('an orbit that prints at the size of one of the eight is "about as wide" as it, and one that prints differently is not', /reaches 1\.0 AU, about as wide as the orbit of Earth \(1\.0 AU\)\.$/.test(w(1)) && /about as wide as the orbit of Earth/.test(w(1.04)) && /reaches 1\.0 AU, about as wide as the orbit of Earth/.test(w(0.996))   /* 0.996 to two figures is 1.0 (kit/format.js keeps the figures when rounding carries) */
    && /reaches 1\.1 AU, between the orbits of Earth \(1\.0 AU\) and Mars/.test(w(1.06)) && /reaches 0\.94 AU, between the orbits of Venus \(0\.72 AU\) and Earth/.test(w(0.94))
    && /about as wide as the orbit of Mercury \(0\.39 AU\)/.test(w(0.387)) && /reaches 0\.38 AU, inside the orbit of Mercury/.test(w(0.384)) && /about as wide as the orbit of Neptune \(30 AU\)\.$/.test(w(30.18)) && /reaches 31 AU, beyond the orbit of Neptune/.test(w(30.6)), `${w(1.04)} | ${w(1.06)}`);
  yes('no sentence gives the system and a neighbour the same printed size and calls it between, inside or beyond', Array.from({ length: 4000 }, (_, i) => 0.01 * Math.pow(1.0025, i)).every((x) => { const num = (t) => Number(t.replace(/,/g, '')), s = w(x), n = num(s.match(/reaches ([\d.,]+) AU/)[1]); return /about as wide/.test(s) || [...s.matchAll(/\(([\d.,]+) AU\)/g)].every((m) => num(m[1]) !== n); }));
  yes('the sentence is tagged, names the host and ends', ['Kepler-90', 'TRAPPIST-1'].every((h) => solarWords(h, 0.2).startsWith(`[REAL] On the scale of the Solar System, the outermost known orbit of ${h} reaches 0.20 AU, `) && solarWords(h, 0.2).endsWith('.')));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
