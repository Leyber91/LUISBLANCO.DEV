/* ============================================================
   heptapod/pod/world.js — the day-one world of the pod, as data.

   Six objects on a tray, each with four attributes a visitor can
   see. Four acts, two places, one hand. That gives 42 scene types
   (12 lift, 12 hold, 12 put down, 6 give: a thing is always given
   at the glass). A scene is what the being writes one ring about.
   [ILLUSTRATIVE: the world is designed for this lab]
   ============================================================ */

export const OBJECTS = {
  cube:  { form: 'rigid',  size: 'small', origin: 'made',  tone: 'dark'  },
  bowl:  { form: 'vessel', size: 'large', origin: 'made',  tone: 'light' },
  jug:   { form: 'vessel', size: 'large', origin: 'made',  tone: 'dark'  },
  seed:  { form: 'rigid',  size: 'small', origin: 'grown', tone: 'dark'  },
  cloth: { form: 'soft',   size: 'large', origin: 'made',  tone: 'light' },
  stone: { form: 'rigid',  size: 'small', origin: 'grown', tone: 'light' },
};
export const OBJ = Object.keys(OBJECTS);
export const ACTS = ['lift', 'hold', 'putdown', 'give'];
export const HELD_ACTS = ['hold', 'putdown', 'give'];
export const PLACES = ['near', 'far'];            // near the glass, or far from it
export const other = (p) => (p === 'near' ? 'far' : 'near');

/* What a watcher can perceive of a scene: 25 features, 9 or 10 of them true at once. */
export const FEATS = [
  'agent:you', ...ACTS.map((a) => 'act:' + a), ...OBJ.map((o) => 'kind:' + o),
  'form:rigid', 'form:vessel', 'form:soft', 'size:small', 'size:large', 'origin:made', 'origin:grown',
  'tone:dark', 'tone:light', 'place:near', 'place:far', 'hand:empty', 'hand:full', 'recip:me',
];
export const FID = Object.fromEntries(FEATS.map((f, i) => [f, i]));
export const IS_WORD = FEATS.map((f) => /^(agent|act|kind|recip):/.test(f));

export function sceneFeatures(act, obj, place) {
  const o = OBJECTS[obj];
  const fs = ['agent:you', 'act:' + act, 'kind:' + obj, 'form:' + o.form, 'size:' + o.size, 'origin:' + o.origin,
    'tone:' + o.tone, 'place:' + place, 'hand:' + (act === 'lift' ? 'empty' : 'full')];
  if (act === 'give') fs.push('recip:me');
  return fs.map((f) => FID[f]);
}

export const SCENES = [];
for (const act of ACTS) for (const obj of OBJ) for (const place of PLACES) {
  if (act === 'give' && place === 'far') continue;
  SCENES.push({ act, obj, place, key: `${act}|${obj}|${place}`, feats: sceneFeatures(act, obj, place) });
}
const SCENE_INDEX = new Map(SCENES.map((s, i) => [s.key, i]));
export const SCENE_MASK = SCENES.map((s) => { const m = new Uint8Array(FEATS.length); for (const f of s.feats) m[f] = 1; return m; });
export const sceneOf = (act, obj, place) => SCENE_INDEX.get(`${act}|${obj}|${place}`);
