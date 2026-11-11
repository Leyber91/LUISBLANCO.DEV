/* ============================================================
   timeline/config.js — configuration only: the dimensions and
   their lanes, the calendars, the evidence and narrative tags,
   the spoiler ceiling and reading levels, the views, the tour.
   No logic. Adding a lane or a calendar edits this file and the
   event data, not the engine.

   The event data itself lives in data/events.json (fetched at
   runtime); its source and licence are stated there.
   ============================================================ */

export const NOW = 2068;              // the story present, Earth CE
export const DATA_URL = new URL('./data/events.json', import.meta.url).href;

/* Calendars. `toCE` and `fromCE` are the codex's own conversions
   (CODEX/CHRONOLOGY/CALENDAR_SYSTEMS.md); `dayLength` and `yearDays`
   are its stated year lengths, used for ages and elapsed spans. */
export const CALENDARS = {
  ce: { id: 'ce', name: 'Earth', unit: 'CE', yearDays: 365.25, epoch: 'conventional year 1 CE' },
  at: { id: 'at', name: 'Terra', unit: 'A.T.', yearDays: 400, offset: 3537, epoch: 'Year 0 A.T. = artifact discovery, c. 3537 BCE' },
  cycle: { id: 'cycle', name: 'Kha-Ren', unit: 'Cycle', yearDays: 365, cycleLen: 75, offset: 4750, epoch: 'Cycle 1, Year 0 = caste formalisation, c. 4675 BCE' },
};

/* The six dimensions. `kind` decides how a dimension is drawn:
   expression worlds are lanes, structural and core are layers. */
export const WORLDS = [
  {
    id: 'kharen', name: 'Kha-Ren', role: 'Expression 3', calendar: 'cycle',
    found: -8000, settled: -4675, offset: -1,
    stage: 'a Neolithic community with no writing, no metal and no cities',
    response: 'containment',
    responseLine: 'divide the knowledge so no one person holds enough to be destroyed by it',
    medium: 'sound', texture: 'wave',
  },
  {
    id: 'earth', name: 'Earth', role: 'Expression 1', calendar: 'ce',
    found: 2031, settled: null, diverges: NOW, offset: 0,
    stage: 'a global information-age civilisation with quantum computers and narrow AI',
    response: 'discovery',
    responseLine: 'study it, classify it, and try to understand it with the scientific method',
    medium: 'the electromagnetic path', texture: 'plain',
  },
  {
    id: 'terra', name: 'Terra', role: 'Expression 2', calendar: 'at',
    found: -3537, settled: -937, offset: 1,
    stage: 'an urban Bronze Age civilisation with cities, writing and scholars',
    response: 'acceleration',
    responseLine: 'embrace it, use it and let it transform how people think',
    medium: 'shared thought', texture: 'double',
  },
];

export const LAYERS = [
  {
    id: 'vortex', name: 'Vortex', role: 'Structural A', src: 'vortex', sec: 'WHAT VORTEX IS',
    title: 'Vortex, the inhabited structural dimension',
    text: 'A higher-dimensional geometry beneath ordinary space, shared by all three worlds. It is not a place anyone can walk into; it can only be reached through an artifact. Its physics is chaotic because something is active there. The codex dates its Inhabitants to about four billion years; at the story present no humanity knows what they intend.',
    phys: ['p-vortex', 'p-brane'],
  },
  {
    id: 'haven', name: 'Haven', role: 'Structural B', src: 'seldon', sec: 'THE DIMENSIONAL ARCHITECTURE',
    title: 'Haven, the empty structural dimension',
    text: 'The second structural dimension, part of the same substrate. It is empty and its physics is stable and predictable.',
    phys: ['p-kitaev'],
  },
  {
    id: 'core', name: 'Core', role: 'the sixth dimension', src: 'seldon', sec: 'THE BUILDERS — WHAT WE KNOW',
    title: 'The Core, the foundation',
    text: 'The base of the architecture. The codex places the Builders here: whoever made the dimensional architecture and the three artifacts. What they are and what they want is deliberately not yet established.',
    phys: ['p-defect'],
  },
  {
    id: 'expression', name: 'Expression', role: 'three worlds', src: 'dimPhysics', sec: 'The Three-Layer Architecture',
    title: 'The expression dimensions',
    text: 'Observable reality, where matter, energy and life exist. Earth, Terra and Kha-Ren are three branes on one shared bulk. The codex insists they are not parallel timelines and not branches of one past: three separate dimensions with the same physics and the same humanity, and different outcomes.',
    phys: ['p-brane', 'p-warp'],
  },
];

/* All six, in drawing order, for the filter chips. */
export const DIMENSIONS = ['kharen', 'earth', 'terra', 'vortex', 'haven', 'core'];

/* The evidence ladder, in the codex's own words. */
export const RUNGS = [
  { id: 'ESTABLISHED', label: 'established', text: 'Experimentally verified, with a published source.' },
  { id: 'THEORETICAL', label: 'theoretical', text: 'Peer-reviewed and mathematically rigorous, not observed.' },
  { id: 'SPECULATIVE', label: 'speculative', text: 'A live scientific debate.' },
  { id: 'SF TERRITORY', label: 'sf territory', text: 'The series’ own extrapolation on real frameworks.' },
];

/* Narrative tags as the source sections carry them. Untagged codex text is
   reference material the source did not tag; sections the codex tags as
   scaffold, deep lore or Book 3 only are not published at all. */
export const NARRATIVE = [
  { id: 'CANON', label: 'canon', text: 'From a codex section tagged [CANON].' },
  { id: 'UNTAGGED', label: 'codex, provisional', text: 'From codex reference text that carries no narrative tag: provisional, not settled canon.' },
  { id: 'REAL', label: 'real', text: 'Real history or published science.' },
];

/* The spoiler ceiling (see data/ceiling.json for its wording and date) and the
   reading levels a visitor can choose. An event's tier is 0 for premise, or the
   Book 1 chapter that introduces it. Nothing above CEILING ships. */
export const CEILING = 7;
export const READING = [
  { id: 0, label: 'not started', text: 'premise only: the worlds, their histories and the physics' },
  { id: 1, label: 'Book 1, ch. 1', text: 'adds Samantha Lee and John Peters' },
  { id: 2, label: 'ch. 2', text: 'adds Emily Chen' },
  { id: 3, label: 'ch. 3', text: 'adds Alexander Bellamy' },
  { id: 4, label: 'ch. 4–5', text: 'adds Sera' },
  { id: 6, label: 'ch. 6', text: 'adds Martin Grey' },
  { id: 7, label: 'ch. 7', text: 'adds Nasha: the setup of Book 1, the ceiling of this page' },
];

/* The guided tour: event ids, in order, one per divergence point and the present. */
export const TOUR = ['inh-emerge', 'hs-origin', 'kr-disc', 'kr-c1', 'te-disc', 'kr-loop', 'ea-access', 'sync'];

/* View presets: [label, t0, t1] on Earth's clock. */
export const PRESETS = [
  { id: 'deep', label: 'deep time', t0: -4.6e9, t1: 2075 },
  { id: 'species', label: 'our species', t0: -330000, t1: 9000 },
  { id: 'branches', label: 'the discoveries', t0: -9200, t1: 2300 },
  { id: 'century', label: 'Earth since 1860', t0: 1860, t1: 2075 },
  { id: 'week', label: 'weeks 1–2 of 2068', t0: 2068.0, t1: 2068.04 },
];

/* Jumps: one per artifact discovery, and the present. */
export const JUMPS = [
  { id: 'kr-disc', label: 'Kha-Ren finds' },
  { id: 'te-disc', label: 'Terra finds' },
  { id: 'ea-access', label: 'Earth reaches' },
  { id: 'sync', label: 'the present' },
];

export const SUGGESTIONS = [
  'What was Kha-Ren doing when Terra found its artifact?',
  'What is 3537 BCE in the other calendars?',
  'Why did Kha-Ren choose containment?',
  'What is the Vortex?',
];

/* Motion, read from tokens.css at runtime by the view. */
/* Flights may run to 1.5 s (van Wijk and Nuij); every other transition takes its duration from tokens.css.
   TIMING holds the non-transition waits: how long the tour dwells, how long a button says "copied". */
export const TIMING = { tourDwell: 6400, tourDwellLong: 7600, flash: 1600, urlDebounce: 260, indexDebounce: 120 };
export const MOTION = { fast: '--t-fast', mid: '--t-mid', slow: '--t-slow', flightMax: 1500 };
