/* ============================================================
   memes/constants.js — the single home for every reusable meme-lab
   constant. Nothing downstream hard-codes a selector, a magic
   number, a palette key, a prompt string or a label map: it lives
   here, so behaviour is tuned in ONE place. Pure data + theme +
   tuning; the classes that consume it stay logic-only.
   ============================================================ */

import { AI_CONFIG } from '../ai/config.js';

/* ---- DOM selectors (ids in memes.html) ---- */
export const SEL = {
  form:           '#meme-form',
  topic:          '#topic',
  tone:           '#tone',
  seed:           '#seed',
  dice:           '#dice',
  generate:       '#generate',
  stop:           '#stop',
  resting:        '#resting',
  work:           '#work',
  reasoningWrap:  '#reasoning-wrap',
  reasoningBody:  '#reasoning-body',
  reasoningLabel: '#reasoning-label',
  reasoningTog:   '#reasoning-toggle',
  reasoningStat:  '#reasoning-status',
  meme:           '#meme',
  composing:      '#composing',
  capTop:         '#cap-top',
  capBottom:      '#cap-bottom',
  captionEdit:    '#caption-edit',
  exportBar:      '#export-bar',
  exportNote:     '#export-note',
  angleChips:     '#angle-chips',
  candidates:     '#candidates',
  fallbackNote:   '#fallback-note',
  aiStatus:       '#ai-status',
  aiStatusLabel:  '#ai-status-label',
  backendNote:    '#backend-note',
  upload:         '#upload',
  srcNote:        '#src-note',
  download:       '#download',
  copy:           '#copy',
  footerTag:      '#footer-tagline',
  year:           '#year',
  topicChips:     '#topic-chips',
  sourceToggle:   '#source-toggle',
  sizes:          '#sizes',
  rerollArt:      '#reroll-art',
  remix:          '#remix',
};

/* ---- defaults / magic numbers (one place to tune behaviour) ---- */
export const DEFAULTS = {
  topic:        'AGI timelines',
  tone:         'deadpan',
  seed:         1234,
  source:       'canvas',
  size:         { w: 1080, h: 1080 },
  temperature:  0.7,
  maxTokens:    2048,
  seedMax:      999999,
  flashMs:      1200,
  revokeMs:     1500,
  taintProbe:   { x: 0, y: 0, w: 1, h: 1 },
};

/* ---- the hosted-worker provider/model used when the worker tier is live ---- */
export const WORKER_CALL = {
  provider: 'nvidia',
  model:    'nvidia/nemotron-3-ultra-550b-a55b',
};

/* ============================================================
   status — backend mode -> [short label, long note]. Extend by
   adding a key, not a branch. (Functions so the long label can
   interpolate the live AI_CONFIG model name.)
   ============================================================ */
export const TIER_TEXT = {
  ollama: () => ['local', `Local model · ${AI_CONFIG.ollama.defaultModel}`],
  worker: () => ['hosted', 'Hosted relay · Nemotron-3-Ultra (reasoning)'],
  echo:   () => ['offline', 'Offline · built-in comedy engine, no network'],
};
export const TIER_TEXT_FALLBACK = 'echo';

export const BACKEND_NOTE = (long) =>
  `Backend: ${long}. The topic is sent only when you press the button; no keys touch the browser.`;

/* ---- footer tagline by mode (lookup, not a nested ternary) ---- */
export const FOOTER_TAGLINE = {
  worker: 'Reasoning by Nemotron-3-Ultra',
  ollama: 'Reasoning by your local model',
  echo:   'Built-in comedy engine',
};
export const FOOTER_SUFFIX = ' · a meme, not a manifesto.';

/* ---- reasoning-panel label by mode (lookup, not a nested ternary) ---- */
export const REASONING_LABEL = {
  worker: 'Nemotron-3-Ultra · reasoning',
  ollama: 'Local model · reasoning',
  echo:   'Comedy engine · reasoning',
};

/* ============================================================
   the scored-candidate axes — [scores key, display label].
   Drives both the card meters and the reasoning critique line.
   ============================================================ */
export const AXES = [
  ['punchy', 'punchy'], ['funny', 'funny'], ['onTopic', 'on-topic'],
  ['notCringe', 'clean'], ['readable', 'readable'],
];

/* ---- image-source notes; only the modes that show a note appear here ---- */
export const SOURCE_NOTE = {
  pollinations:
    'Network fetch. The composited meme stays downloadable when the service returns CORS headers; if not, saving is blocked (the meme still shows) — use art or upload to save.',
};

/* ---- export / taint copy ---- */
export const MSG = {
  taint:
    'This backdrop came from a remote service without CORS headers, so the browser blocks saving the composited file. Switch to event-horizon art or your own upload for a one-click download.',
  copyNeedsHttps: 'Clipboard copy needs https — Download is the always-works path.',
  copyBlocked:    'Copy was blocked here — use Download.',
  copied:         'Copied',
  pollinationsFail:
    "Couldn't load a backdrop (no response, or blocked by CORS) — staying on event-horizon art.",
};

/* ---- screen-reader status strings ---- */
export const SR = {
  start:    'Reasoning started — drafting and scoring caption candidates.',
  parseFail:
    'Model output was not valid JSON, so the built-in engine scored the slate instead.',
};

/* ---- generate-button label states ---- */
export const GEN_LABEL = { busy: 'Reasoning…', idle: 'Reason out a meme' };

/* ============================================================
   theme — palette token map (canvas reads CSS vars once at boot).
   [css custom property, fallback hex]. Kept in sync with tokens.css.
   ============================================================ */
export const PALETTE_TOKENS = {
  void:      ['--void', '#060709'],
  surface:   ['--surface', '#0B0E13'],
  accretion: ['--accretion', '#F2A93B'],
  accSoft:   ['--accretion-soft', '#F6C271'],
  accDim:    ['--accretion-dim', '#97681F'],
  horizon:   ['--horizon', '#5BB0D6'],
  horSoft:   ['--horizon-soft', '#93D0EB'],
  bright:    ['--text-bright', '#EDF1F7'],
  dim:       ['--text-dim', '#79828F'],
  faint:     ['--text-faint', '#424B57'],
};

/* ---- canvas painter tuning (one place to art-direct the backdrop) ---- */
export const CANVAS = {
  focalX:        { left: 0.32, right: 0.68, center: 0.5 },
  focalY:        0.46,
  glowReach:     0.75,
  starDivisor:   14000,    // star count = w*h / divisor
  warmStarChance: 0.85,    // rand() above this -> a horizon-soft star
  captionMargin: 0.07,     // side margin as a fraction of width
  captionBase:   0.092,    // base caption font as a fraction of height
  bandInset:     0.045,    // top/bottom caption inset as a fraction of height
  scrimFrac:     0.34,     // legibility scrim height as a fraction of height
  fitFloor:      0.5,      // smallest font as a fraction of base
  fitStep:       2,        // font shrink step (px) while fitting
  creditFont:    0.018,    // credit font as a fraction of height
};

export const CREDIT_TEXT = 'github.com/Leyber91 · taste filter';

/* ---- fonts to pre-warm before the first canvas paint ---- */
export const CANVAS_FONTS = ['700 64px "Space Grotesk"', '500 24px "IBM Plex Mono"'];
export const FONT_FAMILY = { display: '"Space Grotesk"', mono: '"IBM Plex Mono"' };

/* ---- default scene when the model (or echo) names none ---- */
export const DEFAULT_SCENE = { motif: 'event-horizon', warmCold: 0.55, focal: 'center' };

/* ============================================================
   the local comedy engine — deterministic data tables.
   ============================================================ */
export const TONE_FLAVOR = {
  deadpan:   { tag: 'deadpan', kicker: 'AS ONE DOES', closer: 'WORKING AS INTENDED' },
  absurdist: { tag: 'absurdist', kicker: 'AND THEN THE TOASTER SPOKE', closer: 'NOBODY ASKED THE TOASTER' },
  wholesome: { tag: 'wholesome', kicker: 'AND THAT IS OKAY', closer: 'YOU ARE DOING GREAT' },
  corporate: { tag: 'corporate', kicker: 'PER MY LAST STANDUP', closer: 'LET US CIRCLE BACK' },
  doomer:    { tag: 'doomer', kicker: 'WE ARE NOT READY', closer: 'IT IS FINE. IT IS FINE.' },
};
export const TONE_FALLBACK = 'deadpan';

export const MOTIFS = ['event-horizon', 'accretion-disk', 'lone-observer', 'collapsing-stack', 'signal-in-noise'];
export const CRINGE = ['lol', 'epic', 'rockstar', 'ninja', 'guru', 'synergy'];
export const CAND_IDS = ['A', 'B', 'C', 'D'];

/* ---- scoring tuning ---- */
export const SCORE = {
  candidateCount: 4,
  punchyLineFloor: 4,         // lines beyond this dock punchy
  readableWordFloor: 7,       // words beyond this dock readable
  readableWordPenalty: 0.7,
  onTopicHit: 5, onTopicMiss: 3,
  cringeHit: 1, cringeClean: 5,
  funnyBase: 3,
  surpriseA: /all the things|3am|pager|friday|nobody:/,   // juxtaposition / pain
  surpriseB: /don't understand|will fix everything/,       // self-own / hubris
  winnerKeep: 22,             // total >= this -> "keep" verdict
};

/* ---- verdict thresholds, evaluated in order (first match wins) ---- */
export const VERDICTS = [
  { test: (s, total) => total >= SCORE.winnerKeep, text: 'lands the joint — keep' },
  { test: (s) => s.funny <= 2,                     text: 'true but not funny — cut' },
  { test: (s) => s.notCringe <= 2,                 text: 'reads as try-hard — cut' },
  { test: (s) => s.readable <= 3,                  text: 'too wordy to land in 2s — cut' },
  { test: () => true,                              text: 'fine, but a runner-up' },
];

export const LOCAL_REFINEMENT = 'tightened the bottom line to land in two seconds';

/* ---- demo-mode preset (instant deterministic render for screenshots) ---- */
export const DEMO_INPUTS = { topic: 'AGI timelines', tone: 'doomer', seed: 1234, source: 'canvas' };
export const DEMO_PARAM = 'demo';

/* ---- pollinations backdrop endpoint ---- */
export const POLLINATIONS = {
  base: 'https://image.pollinations.ai/prompt/',
  defaultMotif: 'event horizon',
};
