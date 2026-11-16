/* ============================================================
   exoplanet/orbit.js — where the orbit camera stands.

   The camera circles the planet in the plane of its star. With
   the pitch at zero, one turn of yaw passes over the point under
   the star and over the point opposite it, so turning the view
   sideways (a drag, a swipe on a phone, the arrow keys) goes from
   the day side through the terminator to the night side, where
   the star stands beyond the limb. Before 2026-11-15 the camera
   circled in the level plane of the scene while the star stood
   27 degrees above it, so no sideways turn ever brought the star
   into the frame, and a phone, which turns the view sideways
   only, could not show it at all.

   Pure: no page and no engine. The engine calls orbitDir for the
   camera's place and pitchMax for the pointer's bound.
   ============================================================ */

/* How far the camera's direction may rise from the level plane, in radians. The shader takes the scene's y
   axis as "up" and changes to another axis when the line of sight is within 8.1 degrees of it (0.99 as a
   cosine); that change rolls the picture at once. 1.4 rad keeps the camera 9.8 degrees clear of it. */
export const PITCH_LIMIT = 1.4;

/* The view a world opens in. The yaw shows a little over half of the day side. The pitch decides where the
   star stands when the view is turned to the far side: through the engine's lens of 1.5 it is 1.5 tan(pitch)
   of the picture's height above its middle. At 0.26 rad that is 0.40, between the limb of a planet that
   fills a phone's width (0.33) and the top of the picture (0.47 on a phone, where the world sits a little
   low). At the 0.30 used before 2026-11-15 it was 0.46, on the edge. */
export const HOME = Object.freeze({ yaw: 0.7, pitch: 0.26 });

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* The frame of the orbit, from the direction of the star: e1 toward the star, e2 level and square to it, e3 the
   pole of the circle (the scene's "up" leaned away from the star until it is square to it). azimuth is the
   star's bearing in the level plane and tilt its height above that plane. */
export function orbitFrame(lightDir) {
  const e1 = norm(lightDir);
  let e2 = cross(e1, [0, 1, 0]);
  if (Math.hypot(e2[0], e2[1], e2[2]) < 1e-3) e2 = [1, 0, 0];   // a star straight overhead: any level axis serves
  e2 = norm(e2);
  return { e1, e2, e3: cross(e2, e1), azimuth: Math.atan2(e1[2], e1[0]), tilt: Math.asin(e1[1]) };
}

/* The largest pitch the pointer may give. The circle is tilted by the star's height, so a pitch of p can lift
   the camera's direction p plus that tilt above the level plane. Never under 0.35 rad, so a star close to
   overhead still leaves room to look from above and below. */
export const pitchMax = (lightDir) => Math.max(0.35, PITCH_LIMIT - Math.abs(orbitFrame(lightDir).tilt));

/* The camera's direction from the planet's centre, a unit vector. yaw keeps the zero it has always had (the
   scene's x axis), so a view stored before the circle was tilted opens at the same bearing, lifted or lowered
   by no more than the star's height. A pitch beyond pitchMax is read as pitchMax. */
export function orbitDir(yaw, pitch, lightDir) {
  const { e1, e2, e3, azimuth } = orbitFrame(lightDir);
  const most = pitchMax(lightDir), p = Math.max(-most, Math.min(most, pitch)), y = yaw - azimuth;
  const a = Math.cos(p) * Math.cos(y), b = Math.cos(p) * Math.sin(y), c = Math.sin(p);
  return [a * e1[0] + b * e2[0] + c * e3[0], a * e1[1] + b * e2[1] + c * e3[1], a * e1[2] + b * e2[2] + c * e3[2]];
}

/* How far a finger travels, in CSS pixels, before its touch is read as a gesture. */
export const TOUCH_SLOP = 8;

/* Whose a touch is, from how far it has travelled since it began. null: it has not yet travelled TOUCH_SLOP.
   true: it turns the view. false: it is the page's, to scroll with. Where the page takes up-and-down touches
   for scrolling (the canvas has touch-action: pan-y, as on a phone), a touch that sets out more up or down
   than sideways is the page's, and one that sets out level with itself both ways is too; elsewhere every touch
   turns the view. Before 2026-11-15 a scroll of the page with the finger on the canvas also tilted the camera
   to its limit, and from there a sideways turn only spun the planet about its pole. */
export function touchTurns(dx, dy, pagePans) {
  if (Math.hypot(dx, dy) < TOUCH_SLOP) return null;
  return !pagePans || Math.abs(dx) > Math.abs(dy);
}

/* The yaw at which the camera stands opposite the star. */
export const farSideYaw = (lightDir) => orbitFrame(lightDir).azimuth + Math.PI;
