/* ============================================================
   blackhole/config.js — data, not logic. The state schema that
   drives the renderer, the panel and the URL; the real objects
   with their sources; the citations; the tour script; the views.
   Adding a parameter is one SCHEMA entry. Adding an object is one
   OBJECTS entry. Nothing here computes.
   ============================================================ */

export const VERSION = '2026-11-11';

/* ---------------- citations (author, year, venue) ---------------- */
export const CITE = {
  kerr1963: 'Kerr 1963, Phys. Rev. Lett. 11, 237',
  visser2007: 'Visser 2007, arXiv:0706.0622 (Kerr-Schild form)',
  bpt1972: 'Bardeen, Press & Teukolsky 1972, ApJ 178, 347',
  bardeen1973: 'Bardeen 1973, in Black Holes (Les Houches), eds. DeWitt & DeWitt, p. 215',
  synge1966: 'Synge 1966, MNRAS 131, 463',
  nt1973: 'Novikov & Thorne 1973, in Black Holes (Les Houches), p. 343',
  pt1974: 'Page & Thorne 1974, ApJ 191, 499',
  thorne1974: 'Thorne 1974, ApJ 191, 507',
  ss1973: 'Shakura & Sunyaev 1973, A&A 24, 337',
  st1995: 'Shimura & Takahara 1995, ApJ 445, 780 (colour correction f_col ~ 1.7)',
  chandra1960: 'Chandrasekhar 1960, Radiative Transfer (Dover), electron-scattering limb darkening',
  johnson2020: 'Johnson et al. 2020, Science Advances 6, eaaz1310',
  luminet1979: 'Luminet 1979, A&A 75, 228',
  chael2021: 'Chael, Johnson & Lupsasca 2021, ApJ 918, 6 (the inner shadow)',
  eht2019a: 'EHT Collaboration 2019, ApJL 875, L1 (Paper I)',
  eht2019e: 'EHT Collaboration 2019, ApJL 875, L5 (Paper V)',
  eht2019f: 'EHT Collaboration 2019, ApJL 875, L6 (Paper VI)',
  eht2022a: 'EHT Collaboration 2022, ApJL 930, L12 (Sgr A* Paper I)',
  mertens2016: 'Mertens et al. 2016, A&A 595, A54 (M87 jet viewing angle 17.2 +- 3.3 deg)',
  mj2021: 'Miller-Jones et al. 2021, Science 371, 1046',
  zhao2021: 'Zhao et al. 2021, ApJ 908, 117',
  hawking1975: 'Hawking 1975, Commun. Math. Phys. 43, 199',
  wyman2013: 'Wyman, Sloan & Shirley 2013, JCGT 2(2), 1 (CIE 1931 fit)',
  narkowicz2015: 'Narkowicz 2015, ACES filmic tone-mapping curve fit',
  mtw1973: 'Misner, Thorne & Wheeler 1973, Gravitation (Freeman), tidal tensor',
};

/* ---------------- the real objects ---------------- */
// Every number carries its source. 'tag' on a field: REAL = sourced measurement,
// ILLUSTRATIVE = a stand-in where nothing is measured (said so on the page).
// 'evidence' is the class of the object itself, shown on its button with the legend below
// (the three words and Primordial's THEORETICAL are the first version's).
export const EVIDENCE = {
  ESTABLISHED: 'observed',
  THEORETICAL: 'predicted, none detected',
  SPECULATIVE: 'needs new physics',
};
export const OBJECTS = [
  {
    id: 'm87', name: 'M87*', kind: 'supermassive, galaxy M87', evidence: 'ESTABLISHED',
    mass: 6.5e9, massErr: 0.7e9, massSrc: 'eht2019f',
    distPc: 16.8e6, distErr: 0.8e6, distSrc: 'eht2019f',
    spin: 0.94, spinTag: 'ILLUSTRATIVE', spinNote: 'not measured; 0.94 is one value of the EHT model grid',
    spinSrc: 'eht2019e',
    incl: 17, inclSrc: 'mertens2016', inclNote: 'jet viewing angle, adopted by EHT Paper V',
    edd: 1e-5, eddTag: 'ILLUSTRATIVE',
    // the EHT's ring of emission; no shadow diameter was published for M87* (ledger row 2)
    eht: { ring: 42, ringErr: 3, src: 'eht2019a', what: 'emission ring diameter' },
    thetaGPub: { v: 3.8, err: 0.4, src: 'eht2019f' },
    // the scale the shadow is drawn on the sky with: the stellar-dynamics theta of Gebhardt et al. 2011 at 16.8 Mpc,
    // as EHT 2019 Paper VI, Table 9 gives it, because the EHT's own mass above rests on its ring (ledger row 2)
    ruler: { thetaG: 3.62, errP: 0.60, errM: 0.34, src: 'eht2019f', by: 'the motions of its stars' },
    emitterNote: 'M87* accretes through a hot, thick, radiatively inefficient flow; a thin disk is a stand-in here.',
    view: { incl: 17 },
  },
  {
    id: 'sgra', name: 'Sgr A*', kind: 'supermassive, Milky Way centre', evidence: 'ESTABLISHED',
    mass: 4.297e6, massErr: 0.013e6, massSrc: 'eht2022a', massNote: 'VLTI/GRAVITY value as tabulated in EHT 2022 Paper I, Table 1',
    distPc: 8277, distErr: 34, distSrc: 'eht2022a',
    spin: 0.5, spinTag: 'ILLUSTRATIVE', spinNote: 'not measured; EHT favours prograde models with a* = 0.5 or 0.94 at i = 30 deg',
    spinSrc: 'eht2022a',
    incl: 30, inclSrc: 'eht2022a', inclNote: 'EHT disfavours i > 50 deg; 30 deg is the passing models\' value',
    edd: 1e-8, eddTag: 'ILLUSTRATIVE',
    massBy: 'the orbits of its stars',
    // the ring of emission and the shadow the EHT inferred from it "solely from EHT data" (2022 Paper I, Table 1)
    eht: { ring: 51.8, ringErr: 2.3, shadow: 48.7, shadowErr: 7.0, src: 'eht2022a', what: 'emission ring and shadow diameters' },
    thetaGPub: { v: 4.8, errP: 1.4, errM: 0.7, src: 'eht2022a' },
    emitterNote: 'Sgr A* is fed at about a billionth of its Eddington rate through a hot flow; a thin disk is a stand-in here.',
    view: { incl: 30 },
  },
  {
    id: 'cygx1', name: 'Cygnus X-1', kind: 'stellar-mass, X-ray binary', evidence: 'ESTABLISHED',
    mass: 21.2, massErr: 2.2, massSrc: 'mj2021', massBy: 'the orbit of its companion star',
    distPc: 2220, distErr: 180, distSrc: 'mj2021',
    spin: 0.998, spinTag: 'REAL', spinNote: 'a* > 0.9985 (3 sigma, continuum fitting); traced at the 0.998 Thorne limit',
    spinSrc: 'zhao2021',
    incl: 27.5, inclSrc: 'mj2021', inclNote: 'orbital inclination 27.51 deg',
    edd: 0.02, eddTag: 'ILLUSTRATIVE',
    eht: null,
    emitterNote: 'In its soft state Cygnus X-1 does host a thin disk: this is the case the Novikov-Thorne model was built for.',
    view: { incl: 27.5 },
  },
  {
    id: 'primordial', name: 'Primordial', kind: 'hypothetical, 10^12 kg', evidence: 'THEORETICAL',
    mass: 1e12 / 1.98847e30, massErr: 0, massSrc: null, massNote: 'hypothetical: no primordial black hole has been detected',
    distPc: null, spin: 0, spinTag: 'ILLUSTRATIVE', spinNote: 'hypothetical', incl: 80,
    edd: 0, eddTag: 'ILLUSTRATIVE',
    eht: null, hypothetical: true,
    emitterNote: 'Nothing accretes onto a mountain-mass hole; its glow is Hawking radiation, shown as a number.',
    view: { incl: 80, emit: 'off' },
  },
];

/* ---------------- views (camera presets) ---------------- */
export const VIEWS = {
  cinematic: { label: 'Cinematic', rcam: 46, fov: 31, tilt: 0, incl: 84, hint: 'a camera 46 M away, 5 M above the disk plane' },
  telescope: { label: 'Telescope', rcam: 1000, fov: 1.15, tilt: 0, hint: 'the object as the EHT sees it: observer at 1000 M, the object\'s inclination' },
  journey: { label: 'Fall in', rcam: 40, fov: 70, tilt: 0, incl: 75, hint: 'free fall from rest at infinity, two clocks running' },
};

/* ---------------- the state schema ---------------- */
// type: num | enum | bool. url: short query key. retrace: changing it needs new geodesics.
// panel: where the control lives ('metric', 'camera', 'disk', 'look', null = not shown as a slider).
export const SCHEMA = [
  { key: 'obj', type: 'enum', def: 'm87', url: 'o', options: ['m87', 'sgra', 'cygx1', 'primordial', 'custom'] },
  { key: 'view', type: 'enum', def: 'cinematic', url: 'v', options: ['cinematic', 'telescope', 'journey'], retrace: true },
  { key: 'a', type: 'num', def: 0.94, min: 0, max: 0.998, step: 0.001, url: 'a', retrace: true, panel: 'metric', label: 'spin a/M', unit: '', digits: 3 },
  { key: 'q', type: 'num', def: 0, min: 0, max: 0.99, step: 0.01, url: 'qq', retrace: true, panel: 'metric', label: 'charge Q/M', unit: '', digits: 2 },
  { key: 'incl', type: 'num', def: 84, min: 1, max: 179, step: 0.5, url: 'i', retrace: true, panel: 'camera', label: 'inclination', unit: 'deg', digits: 1 },
  { key: 'rcam', type: 'num', def: 46, min: 3, max: 1000, step: 0.1, url: 'r', retrace: true, panel: 'camera', label: 'observer r', unit: 'M', digits: 1, log: true },
  { key: 'fov', type: 'num', def: 31, min: 0.3, max: 140, step: 0.1, url: 'f', retrace: true, panel: 'camera', label: 'field of view', unit: 'deg', digits: 1, log: true },
  { key: 'az', type: 'num', def: 0, min: -180, max: 180, step: 0.5, url: 'z', retrace: false, panel: null, label: 'azimuth', unit: 'deg', digits: 1 },
  { key: 'tilt', type: 'num', def: 0, min: -80, max: 80, step: 0.5, url: 't', retrace: true, panel: null, label: 'look up', unit: 'deg', digits: 1 },
  { key: 'observer', type: 'enum', def: 'zamo', url: 'ob', options: ['zamo', 'faller', 'orbiter'], retrace: true },
  { key: 'mass', type: 'num', def: 9.8129, min: -19, max: 11, step: 0.01, url: 'm', retrace: false, panel: 'metric', label: 'mass log10', unit: 'Msun', digits: 2 },
  { key: 'dist', type: 'num', def: 7.2253, min: 0, max: 10, step: 0.01, url: 'd', retrace: false, panel: null, label: 'distance log10', unit: 'pc', digits: 2 },
  { key: 'edd', type: 'num', def: -5, min: -9, max: 0, step: 0.05, url: 'e', retrace: false, panel: 'disk', label: 'Eddington ratio log10', unit: '', digits: 2 },
  { key: 'rout', type: 'num', def: 20, min: 8, max: 60, step: 0.5, url: 'ro', retrace: true, panel: 'disk', label: 'disk outer edge', unit: 'M', digits: 1 },
  { key: 'emit', type: 'enum', def: 'thick', url: 'em', options: ['thick', 'thin', 'off'], retrace: true },
  { key: 'color', type: 'enum', def: 'thermal', url: 'c', options: ['thermal', 'true', 'redshift', 'order', 'steps'] },
  { key: 'tdisp', type: 'num', def: 5400, min: 2500, max: 12000, step: 50, url: 'td', retrace: false, panel: 'look', label: 'display peak T', unit: 'K', digits: 0 },
  { key: 'fcol', type: 'num', def: 1.7, min: 1, max: 1.8, step: 0.01, url: 'fc', retrace: false, panel: 'disk', label: 'colour correction f_col', unit: '', digits: 2 },
  { key: 'stretch', type: 'num', def: 0.8, min: 0.25, max: 1, step: 0.01, url: 's', retrace: false, panel: 'look', label: 'display stretch', unit: '', digits: 2 },
  { key: 'ev', type: 'num', def: 0, min: -4, max: 4, step: 0.1, url: 'x', retrace: false, panel: 'look', label: 'exposure', unit: 'EV', digits: 1 },
  { key: 'anim', type: 'bool', def: true, url: 'an' },
  { key: 'notes', type: 'bool', def: true, url: 'n' },
  { key: 'hotspot', type: 'num', def: 0, min: 0, max: 30, step: 0.1, url: 'h', retrace: false, panel: 'disk', label: 'hot spot r (0 = off)', unit: 'M', digits: 1 },
  { key: 'tier', type: 'enum', def: 'auto', url: 'q', options: ['auto', 'min', 'low', 'mid', 'high'] },
];

export const DEFAULTS = Object.fromEntries(SCHEMA.map((s) => [s.key, s.def]));

/* ---------------- quality tiers ---------------- */
// scale: render resolution relative to CSS px x dpr (capped). ss: supersampling per axis when idle.
export const TIERS = {
  min: { label: 'min', scale: 0.4, ss: 1, k: 0.14, maxSteps: 220, dprCap: 1 },
  low: { label: 'low', scale: 0.65, ss: 1, k: 0.12, maxSteps: 260, dprCap: 1.5 },
  mid: { label: 'mid', scale: 0.7, ss: 2, k: 0.1, maxSteps: 360, dprCap: 1.25 },
  high: { label: 'high', scale: 1.0, ss: 2, k: 0.08, maxSteps: 480, dprCap: 1.5 },
};

/* ---------------- colour modes ---------------- */
export const COLOR_MODES = {
  thermal: { label: 'Thermal', note: 'hue = blackbody at g T with the peak shown at the display temperature; brightness = bolometric g^4 T^4' },
  true: { label: 'True colour', note: 'hue and brightness of the real blackbody at g T, as an eye would see it (stretched)' },
  redshift: { label: 'Redshift g', note: 'g < 1 amber, g > 1 blue-white: gravity and motion together' },
  order: { label: 'Photon order', note: 'n = 0 direct image, n = 1 and n = 2 light that circled the hole first' },
  steps: { label: 'Integrator', note: 'steps per ray (brightness) and null-condition drift |H| (gold where above 1e-4)' },
};

/* ---------------- the guided tour ---------------- */
// Each stop names its object, view and colour in full (tour.js resolves the presets against
// the stop itself), so a stop is the same scene reached forward or backward. Captions are
// templates filled from the state in tour.js: names, distances and numbers are never
// written into the text, so they cannot disagree with the object on screen.
export const TOUR = [
  { id: 'arrive', dur: 9, patch: { obj: 'm87', view: 'cinematic', color: 'thermal', emit: 'thick' },
    title: 'A spinning black hole, traced ray by ray',
    text: 'Every pixel is a light ray followed backward through the exact Kerr spacetime of spin a = {a}. Nothing here is painted.', focus: 'shadow' },
  { id: 'shadow', dur: 9, patch: { obj: 'm87', view: 'cinematic', color: 'thermal' },
    title: 'The shadow is not the horizon',
    text: 'The horizon is {rh} M across. The dark region is {shadowW} M wide: rays that pass inside the photon orbits never come back out.', focus: 'shadow' },
  { id: 'beaming', dur: 9, patch: { obj: 'm87', view: 'cinematic', color: 'redshift' },
    title: 'One side is brighter',
    text: 'The gas on the left moves toward you at up to {vmax} c. Its light is boosted by g^4, up to {gmax}x; the receding side is dimmed to {gmin}x.', focus: 'limb' },
  { id: 'order', dur: 10, patch: { obj: 'm87', view: 'cinematic', color: 'order' },
    title: 'Light that went around',
    text: 'The thin bright ring is the n = 1 image: light that circled the hole once. Each further turn makes the ring about e^-pi, 23 times, thinner.', focus: 'ring' },
  { id: 'telescope', dur: 11, patch: { obj: 'm87', view: 'telescope', color: 'thermal' },
    title: 'What the Event Horizon Telescope sees',
    text: 'From Earth, {name} sits at {incl} deg. The traced shadow is {shadowW} M wide, {shadowUas} uas on the sky at the scale {by} give. {eht}', focus: 'curve' },
  { id: 'isco', dur: 9, patch: { obj: 'm87', view: 'cinematic', color: 'thermal' },
    title: 'The last stable orbit',
    text: 'At spin {a} no circular orbit is stable inside {ri} M. The disk ends there, and {eta}% of the infalling rest mass has been radiated away.', focus: 'isco' },
  { id: 'fall', dur: 14, patch: { obj: 'm87', view: 'journey', color: 'thermal' },
    title: 'Falling in',
    text: 'Your clock and a distant clock disagree more each second. At {name} the fall from the horizon to {inner} takes {tauIn} of your time.', focus: 'none' },
  { id: 'cyg', dur: 10, patch: { obj: 'cygx1', view: 'cinematic', color: 'thermal' },
    title: 'A hole the size of a city',
    text: '{name} has {massSun} solar masses. Its horizon spans {horizonKm} km, and 2 m above it the tide stretches you at {tidalG} g.', focus: 'none' },
];

/* ---------------- UI copy ---------------- */
export const COPY = {
  kick: 'kerr ray tracer / measured',
  title: 'Measure the shadow of a spinning black hole.',
  sub: 'Light rays traced through the exact Kerr spacetime, a relativistic disk at its real temperature, and the shadow measured against the Event Horizon Telescope.',
};
