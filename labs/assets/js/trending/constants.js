/* ============================================================
   trending/constants.js — the single home for every reusable
   trending constant. Nothing downstream hard-codes a selector, a
   magic number, an endpoint, a prompt or a label: it lives here, so
   behaviour is tuned in ONE place. The lens fetch STRATEGIES live in
   lenses.js (they need the dom/fetch helpers); this file is the
   selectors + tuning + the labelled offline snapshot data.
   ============================================================ */

/* ---- the labelled snapshot date (also the "captured" stamp) ---- */
export const SNAPSHOT_DATE = '2026-06-16';

/* ---- DOM selectors (ids in trending.html) ---- */
export const SEL = {
  form:        '#scan-form',
  lensToggle:  '#lens-toggle',
  lensWhat:    '#lens-what',
  scanBtn:     '#scan',
  stopBtn:     '#stop',
  resting:     '#resting',
  work:        '#work',
  livePill:    '#live-pill',
  liveText:    '#live-text',
  metaSrc:     '#meta-src',
  metaTime:    '#meta-time',
  traceWrap:   '#trace-wrap',
  traceBody:   '#trace-body',
  traceToggle: '#trace-toggle',
  featured:    '#featured',
  featBadge:   '#feat-badge',
  featMetric:  '#feat-metric',
  featLink:    '#feat-link',
  whyLabel:    '#why-label',
  whyBody:     '#why-body',
  board:       '#board',
  boardNote:   '#board-note',
  aiStatus:    '#ai-status',
  aiStatusLabel: '#ai-status-label',
  backendNote: '#backend-note',
  scanStatus:  '#scan-status',
  year:        '#year',
  /* used inside the lens toggle group */
  lens:        '.lens',
};

/* ---- behaviour / tuning (one place to retune the scan) ---- */
export const TUNING = {
  fetchTimeoutMs:   12000,   // per-source live fetch budget
  reasonTimeoutMs:  25000,   // pollinations reasoning budget
  hitsPerPage:      30,      // HN front-page page size
  topN:             12,      // signals kept per lens, after ranking
  githubSinceDays:  14,      // GitHub "created in the last N days"
  wikiBackoffDays:  [1, 2, 3], // prior full days to try for pageviews
  minVelocityAgeH:  0.4,     // floor on HN age (hours) so velocity stays finite
  heatMinPct:       4,       // minimum heat-bar fill width (%)
  reasonMinChars:   24,      // a reasoning reply shorter than this = treat as empty
  typeStep:         3,       // chars revealed per tick when typing the reasoning
  typeDelayMs:      14,      // delay between type ticks
};

/* ---- the live keyless reasoning endpoint (no backend, no keys) ---- */
export const REASON = {
  base:     'https://text.pollinations.ai/',
  model:    'openai',
  referrer: 'l212',
};

/* ---- query params that drive boot behaviour ---- */
export const PARAMS = {
  demo: 'demo',   // ?demo  -> instant deterministic snapshot render (screenshots)
  scan: 'scan',   // ?scan=<lensKey> -> auto-run a live scan of that lens
};

/* ---- live-pill: data-live state -> visible text (extend by key) ---- */
export const LIVE_TEXT = {
  live:     'live',
  snapshot: 'snapshot',
};

/* ---- ai-status (header dot): mode -> { data-mode, label } ----
   Driven by (dataLive, reasonLive); see STATUS_RESOLVER below.    */
export const STATUS_MODES = {
  live:   { mode: 'live',  label: 'live' },
  local:  { mode: 'local', label: 'local' },
  sample: { mode: 'local', label: 'sample' },
};

/* ---- backend-note copy: keyed, no string-building branches ---- */
export const BACKEND_NOTE = {
  idle: 'Press scan to fetch live signals and reason about them — entirely from your browser, no keys.',
  reasonLive:
    'Reasoning: text.pollinations.ai (keyless, live). Data + reasoning both fetched from your browser; no keys, no backend.',
  reasonLocal: (dataLive) =>
    'Reasoning: built-in heuristic (the model was unreachable). Data is ' +
    (dataLive ? 'live' : 'a labelled snapshot') + '.',
};

/* ============================================================
   labelled offline snapshot — REAL items captured 2026-06-16,
   shown only when the network is unreachable (never as "live").
   Keyed by lens id; the controller deep-copies before rendering.
   ============================================================ */
export const SNAPSHOT = {
  tech: [
    { title: 'Iroh 1.0', url: 'https://news.ycombinator.com/item?id=48542480', metricLabel: 'points', metricValue: 982, sub: '982 pts · 293 comments · top of front page', ageText: 'on the front page', score: 982 },
    { title: 'A backdoor in a LinkedIn job offer', url: 'https://news.ycombinator.com/item?id=48546294', metricLabel: 'points', metricValue: 790, sub: '790 pts · 155 comments · climbing fast', ageText: 'fresh', score: 790 },
    { title: 'Ask HN: Has anyone replaced Claude/GPT with a local model for daily coding?', url: 'https://news.ycombinator.com/item?id=48542100', metricLabel: 'points', metricValue: 735, sub: '735 pts · 351 comments · heavy discussion', ageText: 'today', score: 735 },
    { title: 'TinyWind: a pixel pirate sailing game with real wind physics', url: 'https://news.ycombinator.com/item?id=48543475', metricLabel: 'points', metricValue: 638, sub: '638 pts · 132 comments', ageText: 'today', score: 638 },
    { title: 'Hetzner Price Adjustment', url: 'https://news.ycombinator.com/item?id=48540844', metricLabel: 'points', metricValue: 351, sub: '351 pts · 504 comments · contested', ageText: 'today', score: 351 },
    { title: 'Salesforce to Acquire Fin (formerly Intercom) for $3.6B', url: 'https://news.ycombinator.com/item?id=48540126', metricLabel: 'points', metricValue: 284, sub: '284 pts · 211 comments', ageText: 'today', score: 284 },
  ],
  culture: [
    { title: 'Oliver Tree', url: 'https://en.wikipedia.org/wiki/Oliver_Tree', metricLabel: 'views', metricValue: 1508668, sub: '1.5M views · rank #2', ageText: 'over the prior day', score: 1508668 },
    { title: 'Jalen Brunson', url: 'https://en.wikipedia.org/wiki/Jalen_Brunson', metricLabel: 'views', metricValue: 1326341, sub: '1.3M views · rank #3', ageText: 'over the prior day', score: 1326341 },
    { title: 'Curaçao', url: 'https://en.wikipedia.org/wiki/Cura%C3%A7ao', metricLabel: 'views', metricValue: 1215504, sub: '1.2M views · rank #4', ageText: 'over the prior day', score: 1215504 },
    { title: '2026 FIFA World Cup', url: 'https://en.wikipedia.org/wiki/2026_FIFA_World_Cup', metricLabel: 'views', metricValue: 777070, sub: '777k views · rank #6', ageText: 'over the prior day', score: 777070 },
  ],
  dev: [
    { title: 'DietrichGebert/ponytail', url: 'https://github.com/DietrichGebert/ponytail', metricLabel: 'stars', metricValue: 17068, sub: '17k stars · JavaScript · new', ageText: 'new', score: 17068 },
    { title: 'XiaomiMiMo/MiMo-Code', url: 'https://github.com/XiaomiMiMo/MiMo-Code', metricLabel: 'stars', metricValue: 9068, sub: '9.1k stars · TypeScript · new', ageText: 'new', score: 9068 },
    { title: 'shadcn/improve', url: 'https://github.com/shadcn/improve', metricLabel: 'stars', metricValue: 4887, sub: '4.9k stars · new', ageText: 'new', score: 4887 },
    { title: 'diffusionstudio/lottie', url: 'https://github.com/diffusionstudio/lottie', metricLabel: 'stars', metricValue: 2981, sub: '3.0k stars · TypeScript · new', ageText: 'new', score: 2981 },
    { title: 'omnigent-ai/omnigent', url: 'https://github.com/omnigent-ai/omnigent', metricLabel: 'stars', metricValue: 1975, sub: '2.0k stars · Python · new', ageText: 'new', score: 1975 },
    { title: 'NoopApp/noop', url: 'https://github.com/NoopApp/noop', metricLabel: 'stars', metricValue: 1690, sub: '1.7k stars · Swift · new', ageText: 'new', score: 1690 },
  ],
};

/* ---- the deterministic "why" used by demo mode (snapshot top signal) ---- */
export const DEMO_WHY = 'Iroh hitting a stable 1.0 lands just as teams are tiring of fragile, centralized networking glue and want direct peer-to-peer connections that simply work. A 1.0 is a public bet that the project is production-ready — exactly the trust threshold that moves a tool from weekend experiments into real stacks. Expect more infrastructure to quietly assume peer-to-peer by default rather than treating it as exotic.';
