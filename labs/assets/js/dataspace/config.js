/* ============================================================
   dataspace/config.js — everything about DATASPACE that is data,
   not logic: the bundled conversations, the five strength levels,
   the exact prompts, the visual palette, the motion table and the
   citations. Adding a sample conversation is one entry in PRESETS
   plus its recorded run file; no code changes.
   ============================================================ */

export const LAB = {
  id: 'dataspace',
  generation: 'G1',
  runSchema: 'dataspace.run/1',      // JSON Schema: labs/assets/data/dataspace/run.schema.json
  dataBase: 'assets/data/dataspace/', // relative to labs/dataspace.html
};

/* Strength: the capsule's word budget as a share of the source's words. */
export const LEVELS = [
  { id: 1, name: 'gentle', frac: 0.50 },
  { id: 2, name: 'firm',   frac: 0.30 },
  { id: 3, name: 'hard',   frac: 0.18 },
  { id: 4, name: 'harsh',  frac: 0.10 },
  { id: 5, name: 'brutal', frac: 0.05 },
];
export const MIN_BUDGET_WORDS = 5;
export const DEFAULT_LEVEL = 3;

/* The unit of a budget: a whitespace-separated piece holding at least one letter or digit. */
export const wordCount = (s) => (String(s || '').match(/\S+/g) || []).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
export const budgetFor = (sourceWords, level) =>
  Math.max(MIN_BUDGET_WORDS, Math.round(sourceWords * LEVELS.find((l) => l.id === level).frac));

/* What the model and the scorer receive. Text past these limits is cut, and the page says so. */
export const LIMITS = {
  sourceChars: 4000,   // the source as sent to the compress call
  capsuleChars: 1500,  // a capsule as sent to the rebuild call
  scoreTokens: 1600,   // LCS is O(n*m); both sides are cut here for scoring
  urlChars: 6000,      // own text carried in the URL fragment (before compression)
};

/* Bundled conversations. Kinds follow the ladder: dialogue, technical, number-heavy, instructions.
   All four are written for this lab [ILLUSTRATIVE content]; the people in them are invented. */
export const PRESETS = [
  {
    id: 'origin', kind: 'dialogue', title: 'origin',
    blurb: 'why one idea keeps returning under new names',
    text:
`USER: I keep restarting the same AI project under different names — DATASPACE, Ouroboros, the AEA. Why?
ASSISTANT: Because it was always one idea: make AI legible enough to be genuinely owned — self-modifying, watchable, local, named. The names change; the spine does not.
USER: DATASPACE was the first — Feb 2023. Compress a whole conversation into a few lines only the model can decode, so it keeps a self across sessions.
ASSISTANT: Identity through compression. The named enemy was Degradation — the quality collapse of a long thread. You were engineering against context-rot two years early.`,
  },
  {
    id: 'replica', kind: 'technical', title: 'replica lag',
    blurb: 'a database replica that falls behind every night',
    text:
`USER: Our Postgres 16 replica in Frankfurt lags 40 seconds behind the primary every night at 02:15. What should I check first?
ASSISTANT: Start with the nightly job. At 02:15 the VACUUM FULL on the events table rewrites about 30 GB, and the replica has to replay all of that WAL. Check pg_stat_replication: if replay_lag climbs while write_lag stays near zero, the replica applies WAL too slowly.
USER: replay_lag hits 41 s and write_lag stays under 1 s. The replica has 4 vCPUs, the primary has 16.
ASSISTANT: Then replay is the bottleneck. WAL replay runs on one process, so the extra cores do not help. Replace VACUUM FULL with pg_repack, which works in smaller batches, or move the job to 04:00 when traffic is lowest.
USER: Ana says pg_repack needs a primary key on the table. events has one, on event_id.
ASSISTANT: Then pg_repack works. Run it with --no-order first and watch replay_lag. If it stays under 5 s, keep the 02:15 slot.`,
  },
  {
    id: 'ledger', kind: 'number-heavy', title: 'trip ledger',
    blurb: 'five people settle a shared trip',
    text:
`USER: Five of us are splitting the Lisbon trip from 14 to 18 March. Flights were 1,240 euros in total, the flat was 860 euros for 4 nights, and the car was 310 euros.
ASSISTANT: That is 2,410 euros, or 482 euros each. Who paid what?
USER: I paid the flights. Marco paid the flat. Iris paid the car and also 95 euros of groceries on the 15th.
ASSISTANT: With groceries the total is 2,505 euros, so 501 euros each. You paid 1,240 and get back 739. Marco paid 860 and gets back 359. Iris paid 405 and owes 96. Tomas and Lena paid nothing and owe 501 each.
USER: Check: 739 plus 359 is 1,098. Owed is 96 plus 501 plus 501, also 1,098. It balances.
ASSISTANT: It balances. Tomas and Lena each send 501 euros and Iris sends 96, all by 25 March.`,
  },
  {
    id: 'flatbread', kind: 'instructions', title: 'pan flatbread',
    blurb: 'a recipe with quantities, times and an order',
    text:
`USER: How do I make flatbread for six people? I have 500 g of flour, yogurt and one packet of yeast.
ASSISTANT: Mix the 500 g of flour with 7 g of yeast, 1 teaspoon of salt and 1 teaspoon of sugar. Add 250 g of yogurt and 150 ml of warm water, then knead for 8 minutes until smooth.
USER: Then what? How long does it rest?
ASSISTANT: Cover the dough and let it rise for 1 hour in a warm place, until it doubles. Divide it into 6 balls of about 150 g each and roll each one to 5 mm thick.
USER: I only have a cast iron pan, no oven.
ASSISTANT: The pan is the right tool. Heat it on high for 3 minutes with no oil. Cook each flatbread for 90 seconds, flip it when bubbles form, then give it 60 seconds more. Brush with garlic butter while hot and stack them under a towel so they stay soft.`,
  },
];
export const DEFAULT_PRESET = 'origin';

/* ---------- prompts (version them: a change here means new recordings) ---------- */
export const PROMPTS = {
  version: 'p1',
  compressSystem:
    'You compress conversations into capsules. A capsule is a short text from which another model, given only the ' +
    'capsule, must rebuild the whole conversation: who spoke and in what order, and every number, date, name, decision ' +
    'and open question. Abbreviations and symbols are allowed. Each capsule covers the whole conversation, never one turn.',
  /** budgets: [{ level, words }] in level order */
  compressUser(source, budgets) {
    const n = budgets.length;
    const lines = budgets.map((b) => `L${b.level}: at most ${b.words} words`).join('\n');
    const shape = budgets.map((b) => `"L${b.level}": "capsule of the whole conversation"`).join(', ');
    const head = n > 1
      ? `Compress the whole conversation below ${n} times, at ${n} lengths. Every capsule covers all turns, from the ` +
        'first to the last, in order. A shorter capsule keeps fewer details, never fewer turns.'
      : 'Compress the whole conversation below into one capsule. The capsule covers all turns, from the first to the ' +
        'last, in order.';
    return `${head}\nWord limit${n > 1 ? 's' : ''}:\n${lines}\n` +
      `Reply with JSON of this shape: {${shape}}\n\nCONVERSATION:\n${source}`;
  },
  rebuildSystem:
    'You rebuild a conversation from a capsule that another model wrote. Use only what the capsule says. Write the ' +
    'conversation as turns, each starting with USER: or ASSISTANT: on a new line. Output only the conversation.',
  rebuildUser(capsule) { return `CAPSULE:\n${capsule}`; },
  temperature: 0.7,
};

/* llm.js appends this line to the system prompt of every JSON call (labs/assets/js/ai/llm.js, complete()).
   The recorder adds the same line so a recorded request is byte-identical to a live one. */
export const LLM_JSON_SUFFIX = '\n\nReply with one JSON object and nothing else.';

/* ---------- the public route (measured 2026-11-11, see LABS_LEVELS.md) ---------- */
export const PUBLIC_WINDOW_S = 45;
export const CACHED_MS = 450;   // a public reply faster than this is labelled "possibly cached" [ILLUSTRATIVE threshold]

/* ---------- palette: every colour the scene and the views use ---------- */
/* Ink ladder and gold come from labs/assets/css/tokens.css; the scene repeats them as linear RGB in FRAG's palette
   block (scene.js). One accent: gold, for what is active, fired or chosen. */
export const PALETTE = {
  void: '#06080D', ink: '#C5CCD8', bright: '#EAF0FB', line: '#2C3744',
  horizon: '#9FB3D6', horizonDim: '#565D72', goldSoft: '#F0C674',
  scrim: 'rgba(6, 8, 13, 0.86)',
};

/* ---------- motion table: every animated property, its one meaning, its speed ----------
   Every duration or speed constant used by scene.js and the views is read from here. */
export const MOTION = {
  diskOmega: { value: 0.5,   unit: 'rad/s at r = 1, falling as r^-1.5 (Kepler)', meaning: 'ambient: the disk orbits; carries no data' },
  infall:    { value: 1400,  unit: 'ms', meaning: 'stage 1, source measured: the disk bands light up with the source bits' },
  crush:     { value: 1200,  unit: 'ms', meaning: 'stage 2, capsule received: the disk contracts and the gold core rises to the rate' },
  reform:    { value: 1800,  unit: 'ms', meaning: 'stage 3, rebuild received: each band re-forms by the share of its tokens kept' },
  radiate:   { value: 0.055, unit: 'screen heights per s', meaning: 'stage 3: lost tokens drift outward as motes, then hold' },
  waitPulse: { value: 2000,  unit: 'ms per cycle', meaning: 'the core pulses while the public window is closed' },
  rateBar:   { value: 560,   unit: 'ms (CSS var(--t-slow))', meaning: 'the rate bar slides to capsule bits / source bits' },
  orbitKey:  { value: 0.06,  unit: 'rad per key press', meaning: 'keyboard orbit step (not animated)' },
  zoomKey:   { value: 0.7,   unit: 'distance units per key or wheel step', meaning: 'zoom step (not animated)' },
  dragOrbit: { value: 0.006, unit: 'rad per pixel dragged', meaning: 'pointer and one-finger orbit (not animated)' },
  pinchZoom: { value: 0.05,  unit: 'distance units per pixel of pinch', meaning: 'two-finger zoom (not animated)' },
  tierWindow:{ value: 1500,  unit: 'ms', meaning: 'not animated: frame time is averaged over 45 frames or this long, whichever comes first' },
  replayHold:{ value: 300,   unit: 'ms', meaning: 'a recorded replay holds the capsule this long after the crush before the rebuild lands' },
  tierFrames:{ value: 45,    unit: 'frames', meaning: 'not animated: the window over which frame time is averaged for the render tier' },
};
/* Timers that are not motion: input debounces and work slicing. Listed so no time constant hides in the code. */
export const TIMERS = {
  measureDebounce: 220,  // ms after the last keystroke before the source is re-measured
  urlDebounce: 250,      // ms before the URL fragment is rewritten
  losslessDebounce: 300, // ms before the worker re-measures DEFLATE, Brotli and PPM
  scoreSlice: 12,        // ms of scoring per slice while recorded runs are scored in the background
  scoreStart: 30,        // ms before background scoring starts
  linkSettle: 300,       // ms to let the URL settle before copying it
  revokeUrl: 1000,       // ms before a download's object URL is released
  countdownTick: 1000,   // ms between public-window countdown updates
};
/* Under prefers-reduced-motion and ?still every row above freezes: the scene draws each stage's end state once. */

/* ---------- citations shown in the methods section ---------- */
export const CITATIONS = [
  { id: 'shannon48', text: 'C. E. Shannon, "A Mathematical Theory of Communication", Bell System Technical Journal 27, 1948.' },
  { id: 'shannon59', text: 'C. E. Shannon, "Coding Theorems for a Discrete Source with a Fidelity Criterion", IRE National Convention Record, 1959.' },
  { id: 'rfc1951', text: 'P. Deutsch, "DEFLATE Compressed Data Format Specification version 1.3", RFC 1951, IETF, 1996.' },
  { id: 'rfc7932', text: 'J. Alakuijala and Z. Szabadka, "Brotli Compressed Data Format", RFC 7932, IETF, 2016.' },
  { id: 'ppm', text: 'J. G. Cleary and I. H. Witten, "Data Compression Using Adaptive Coding and Partial String Matching", IEEE Transactions on Communications 32(4), 1984.' },
  { id: 'ppmc', text: 'A. Moffat, "Implementing the PPM Data Compression Scheme", IEEE Transactions on Communications 38(11), 1990.' },
  { id: 'lcs', text: 'R. A. Wagner and M. J. Fischer, "The String-to-String Correction Problem", Journal of the ACM 21(1), 1974.' },
  { id: 'gpt2', text: 'A. Radford et al., "Language Models are Unsupervised Multitask Learners", OpenAI, 2019 (byte-level BPE, 50,000 merges).' },
  { id: 'canterbury', text: 'R. Arnold and T. Bell, "A Corpus for the Evaluation of Lossless Compression Algorithms", Data Compression Conference (DCC), 1997.' },
  { id: 'lmc', text: 'G. Deletang et al., "Language Modeling Is Compression", ICLR 2024.' },
  { id: 'llmlingua', text: 'H. Jiang et al., "LLMLingua: Compressing Prompts for Accelerated Inference of Large Language Models", EMNLP 2023.' },
  { id: 'mdl', text: 'J. Rissanen, "Modeling by Shortest Data Description", Automatica 14(5), 1978 (two-part codes).' },
  { id: 'elias', text: 'P. Elias, "Universal Codeword Sets and Representations of the Integers", IEEE Transactions on Information Theory 21(2), 1975.' },
];
