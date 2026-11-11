/* ============================================================
   trending/constants.js — configuration only: the source registry
   labels, the tuning block, the cause list, the storage key and the
   copy the views print. No computation, no DOM, no network.

   Every engine module (lenses, score, topics, verify, history) reads
   its numbers from TUNING so a retune is one edit here, and the method
   panel prints the same numbers the code uses.
   ============================================================ */

/* ---- tuning: the numbers the engine and the method panel share ---- */
export const TUNING = {
  fetchTimeoutMs: 12000,      // per request, every source
  modelTimeoutMs: 60000,      // one batched model call
  modelMaxWaitMs: 50000,      // wait for the public 45 s window at most this long

  hnHits: 30,                 // HN front page size (Algolia)
  showHits: 30,               // Show HN stories posted in the last showWindowH
  showWindowH: 48,
  hnAgeFloorH: 0.4,           // an HN item younger than 24 min is treated as 24 min old
  ghSinceDays: 14,            // GitHub repositories created in the last N days
  ghPerPage: 30,
  ghAgeFloorH: 6,             // a repository younger than 6 h is treated as 6 h old

  wikiBackoff: [1, 2, 3],     // days back from today (UTC) to try for the latest full day
  wikiRisers: 7,              // per edition: candidates by day-over-day ratio
  wikiLargest: 3,             // per edition: candidates by raw views
  wikiLinked: 2,              // per edition: extra candidates linked to an HN or GitHub title
  wikiSeriesDays: 35,         // per-article daily window ending on the scan day
  wikiWeeks: 4,               // same-weekday baseline: median of the prior 4 weeks
  wikiMinBaseline: 1,         // a baseline below this is "new", never an infinite ratio

  confidence: 0.95,           // Poisson (Garwood) interval on every count
  accelThreshold: 0.25,
  cusumK: 0.5,                // CUSUM allowance, in baseline standard deviations
  cusumH: 5,                  // CUSUM decision threshold, in baseline standard deviations
  cusumMonitorDays: 7,        // the last 7 days are monitored; the days before them are the baseline
  cusumMinSd: 0.05,           // floor on the baseline sd of ln(views + 1)       // |relative change in rate| above this = accelerating or decaying
  accelMinGapH: 0.15,         // two observations closer than 9 min do not make a rate
  madScale: 1.4826,           // MAD to standard deviation under a normal model

  topPerSource: 10,           // rising calls stored per source per scan
  boardMax: 40,               // rows on the board
  explainTop: 5,              // signals sent to the model in the one batched call
  hnCommentsPer: 3,           // top comments fetched per explained HN item

  jaccard: 0.3,               // topic rule (b): key-term Jaccard at or above this
  keyTerms: 3,                // key terms shown per signal
  minIdf: 1.0,                // a shared term must carry at least this idf to join

  pollMinutes: 10,            // auto re-scan interval while the tab is open
  historyMaxScans: 60,        // oldest scans drop past this count
  storageWarnKB: 3500,

  outcomeHorizonH: 6,         // probability horizon for HN and GitHub calls
  outcomeWindowH: [4, 9],     // a follow-up observation inside this window counts as "6 h later"
  minCallsToJudge: 30,        // fewer calls than this: "too few to judge"
  bootstrapReps: 1000,
  bootstrapLevel: 0.90,

  typeStepChars: 3,
  typeDelayMs: 12,
  stageMs: 320,               // one stage of the scan sequence (tokens.css --t-mid)
  fieldMoveMs: 560,           // object-constancy move between scans (tokens.css --t-slow)
};

/* ---- the sources: labels, units, limits, caveats. fetch() lives in lenses.js ---- */
export const SOURCES = {
  hn: {
    id: 'hn', kind: 'forum', label: 'Hacker News', short: 'HN', glyph: 'circle',
    feed: 'front page', host: 'hn.algolia.com', endpoint: '/api/v1/search?tags=front_page',
    unit: 'points/h', total: 'points', third: 'comments', hasAge: true, defaultOn: true,
    limit: 'Algolia HN API: 10,000 requests per hour per IP (hn.algolia.com/api)',
    budget: 6, budgetNote: '1 front-page request, plus up to 5 comment requests for stories the model explains',
    caveat: 'Front page only: a story that never reached it is invisible, points are net votes with flagging hidden, and Algolia refreshes point counts with a lag, so a gap of minutes can read as zero gained.',
    what: 'Points per hour since posting, with a 24-minute age floor.',
  },
  show: {
    id: 'show', kind: 'forum', label: 'Show HN', short: 'SHOW', glyph: 'ring',
    feed: 'Show HN, last 48 h', host: 'hn.algolia.com', endpoint: '/api/v1/search?tags=show_hn',
    unit: 'points/h', total: 'points', third: 'comments', hasAge: true, defaultOn: true,
    limit: 'Algolia HN API: 10,000 requests per hour per IP (hn.algolia.com/api)',
    budget: 6, budgetNote: '1 Show HN request, plus up to 5 comment requests for stories the model explains',
    caveat: 'Launch posts only, ranked by Algolia relevance first, so a quiet launch may not be fetched at all; points off the front page refresh with a lag of up to hours.',
    what: 'Points per hour since posting for launches posted in the last 48 hours.',
  },
  gh: {
    id: 'gh', kind: 'code', label: 'GitHub', short: 'GH', glyph: 'triangle',
    feed: 'repositories created in the last 14 days', host: 'api.github.com', endpoint: '/search/repositories',
    unit: 'stars/day', total: 'stars', third: 'forks', hasAge: true, defaultOn: true,
    limit: 'GitHub search, unauthenticated: 10 requests per minute per IP, read live from X-RateLimit-Remaining',
    budget: 1, budgetNote: '1 search request',
    caveat: 'Stars can be bought or coordinated, and created_at is when the repository was made, which can be long before it went public.',
    what: 'Stars per day since created_at, with a 6-hour age floor.',
  },
  wen: {
    id: 'wen', kind: 'readership', label: 'Wikipedia EN', short: 'EN', glyph: 'square',
    feed: 'most-read, latest full day', host: 'wikimedia.org', endpoint: '/api/rest_v1/metrics/pageviews',
    project: 'en.wikipedia', site: 'https://en.wikipedia.org/wiki/',
    ns: ['Special:', 'Wikipedia:', 'File:', 'Portal:', 'Talk:', 'User:', 'Template:', 'Help:', 'Category:', 'Draft:'],
    main: ['Main_Page'],
    unit: 'x weekday median', total: 'views', third: 'views over 28 days', hasAge: false, defaultOn: true,
    limit: 'Wikimedia REST API: no per-IP quota published for this endpoint; the page sends at most 16 per edition',
    budget: 16, budgetNote: 'up to 3 top-list requests (latest published day), 1 for the day before, up to 12 per-article series',
    caveat: 'Daily totals that lag up to a day, and automated traffic that Wikimedia misclassifies as user views inflates some articles.',
    what: 'Views on the latest full day over the median of the same weekday in the 4 prior weeks.',
  },
  wde: {
    id: 'wde', kind: 'readership', label: 'Wikipedia DE', short: 'DE', glyph: 'diamond',
    feed: 'most-read, latest full day', host: 'wikimedia.org', endpoint: '/api/rest_v1/metrics/pageviews',
    project: 'de.wikipedia', site: 'https://de.wikipedia.org/wiki/',
    ns: ['Spezial:', 'Wikipedia:', 'Datei:', 'Portal:', 'Diskussion:', 'Benutzer:', 'Vorlage:', 'Hilfe:', 'Kategorie:'],
    main: ['Wikipedia:Hauptseite'],
    unit: 'x weekday median', total: 'views', third: 'views over 28 days', hasAge: false, defaultOn: true,
    limit: 'Wikimedia REST API: no per-IP quota published for this endpoint; the page sends at most 16 per edition',
    budget: 16, budgetNote: 'up to 3 top-list requests (latest published day), 1 for the day before, up to 12 per-article series',
    caveat: 'German-language readers only, so a subject that is news elsewhere can stay flat here.',
    what: 'Views on the latest full day over the median of the same weekday in the 4 prior weeks.',
  },
  wes: {
    id: 'wes', kind: 'readership', label: 'Wikipedia ES', short: 'ES', glyph: 'cross',
    feed: 'most-read, latest full day', host: 'wikimedia.org', endpoint: '/api/rest_v1/metrics/pageviews',
    project: 'es.wikipedia', site: 'https://es.wikipedia.org/wiki/',
    ns: ['Especial:', 'Wikipedia:', 'Archivo:', 'Portal:', 'Discusión:', 'Usuario:', 'Plantilla:', 'Ayuda:', 'Categoría:', 'Anexo:'],
    main: ['Wikipedia:Portada'],
    unit: 'x weekday median', total: 'views', third: 'views over 28 days', hasAge: false, defaultOn: true,
    limit: 'Wikimedia REST API: no per-IP quota published for this endpoint; the page sends at most 16 per edition',
    budget: 16, budgetNote: 'up to 3 top-list requests (latest published day), 1 for the day before, up to 12 per-article series',
    caveat: 'Spanish-language readers only; football and telenovela audiences dominate the daily list.',
    what: 'Views on the latest full day over the median of the same weekday in the 4 prior weeks.',
  },
};
export const SOURCE_ORDER = ['hn', 'show', 'gh', 'wen', 'wde', 'wes'];
export const KINDS = {
  forum: { label: 'forum', x: 'age since posting (h, log)', y: 'points per hour (log)' },
  code: { label: 'code host', x: 'age since created_at (h, log)', y: 'stars per day (log)' },
  readership: { label: 'readership', x: 'views over same-weekday median (log)', y: 'views on the day (log)' },
};

/* ---- score modes: what the board ranks by. "total" is never called rising ---- */
export const SCORE_MODES = {
  lower: { label: 'lower bound', verb: 'rising', note: 'ranked by the lower end of the 95% Poisson interval of each rise score' },
  rate: { label: 'point rate', verb: 'rising', note: 'ranked by the raw rise score, no small-count correction' },
  total: { label: 'raw total', verb: 'largest', note: 'ranked by raw totals (points, stars, views); this is size, not rise' },
};

export const AGE_WINDOWS = { all: Infinity, '6h': 6, '24h': 24, '3d': 72 };

/* ---- causes: one fixed list shared by the model and the keyword engine ---- */
export const CAUSES = ['launch', 'outage', 'news event', 'death', 'release', 'controversy', 'sports result', 'anniversary'];
export const CAUSE_RULES = [
  ['death', /\b(dies|died|dead|death|obituary|passed away|murdered|killed|funeral|muere|fallece|muerte|gestorben|stirbt|tod)\b/i],
  ['outage', /\b(outage|is down|went down|goes down|downtime|incident|breach|hacked|vulnerab\w*|cve-\d+|exploit|leak(ed)?|postmortem|ddos|ransomware)\b/i],
  ['release', /\b(release[sd]?|changelog|v\d+(\.\d+)+|\d+\.\d+(\.\d+)? (is out|released|beta|alpha|rc\d*)|1\.0|version \d+)\b/i],
  ['launch', /\b(show hn|launch(e[sd])?|introducing|announc\w+|unveil\w*|open[- ]?source[sd]?|new tool|i built|i made)\b/i],
  ['controversy', /\b(lawsuit|sued|sues|ban(ned|s)?|scandal|fired|resign\w*|controvers\w*|accus\w+|fine[sd]?|antitrust|backlash|protest\w*|arrest\w*)\b/i],
  ['sports result', /\b(fc|cf|f\.c\.|vs\.?|cup|league|liga|bundesliga|copa|championship|grand prix|playoffs?|final|match|season|nfl|nba|mlb|fifa|uefa|olympics?|tournament)\b/i],
  ['anniversary', /\b(anniversary|years ago|\d{2,3}(st|nd|rd|th) birthday|centenary|aniversario|jahrestag)\b/i],
];
export const CAUSE_DEFAULT = 'news event';

/* ---- storage: one key, one schema version. history.js is the only reader ---- */
export const STORAGE = { key: 'lb.trending.history', version: 2 };

/* ---- query parameters the controller reads and writes ---- */
export const PARAMS = {
  src: 'src',        // comma list of enabled sources
  score: 'score',    // lower | rate | total
  win: 'win',        // all | 6h | 24h | 3d
  view: 'view',      // items | topics
  sel: 'sel',        // selected item id
  terms: 'terms',    // comma list of lookup terms (up to 5)
  scan: 'scan',      // present: start a live scan on load (value: comma list of sources, or 1)
  demo: 'demo',      // present: load the recorded fixture scan
  engine: 'engine',  // present: never call a model, the deterministic engine explains
  fixture: 'fixture',// present: use the recorded model reply fixture (one malformed entry, one wrong number)
  cause: 'cause',    // board cause filter
  only: 'only',      // board source filter
  open: 'open',      // present with sel: open that item's detail view
  tour: 'tour',      // present: start the walkthrough
};

/* ---- copy the views print (one place, plain sentences) ---- */
export const COPY = {
  idleRecorded: 'Recorded scan. Press Scan live to fetch the open web from this browser.',
  idleStored: 'Your last stored scan. Press Scan live to measure what moved since.',
  scanning: 'Scanning',
  stopped: 'Scan stopped. The board keeps the last complete scan.',
  empty: 'No source returned a usable item.',
  modelWait: 'The public model route allows one reply every 45 seconds per IP; waiting',
  modelFailed: 'No model route answered. The explanations below come from the deterministic engine.',
  limitWait: 'GitHub search limit reached; waiting',
};

/* ---- the selectors the controller resolves once ---- */
export const SEL = {
  route: '#route', status: '#status',
  sources: '#sources', scoreModes: '#score-modes', windows: '#windows',
  scan: '#scan', stop: '#stop', poll: '#poll', pollState: '#poll-state',
  stamp: '#stamp', field: '#field', trace: '#trace', legend: '#legend',
  top: '#top', explained: '#explained', digest: '#digest',
  board: '#board', boardHead: '#board-head', viewToggle: '#view-toggle', boardFilters: '#board-filters',
  history: '#history', diff: '#diff', store: '#store',
  verify: '#verify', method: '#method', worked: '#worked', hard: '#hard',
  lookupForm: '#lookup', lookupInput: '#lookup-terms', lookupOut: '#lookup-out',
  detail: '#detail', tour: '#tour', tourBtn: '#tour-btn', expRoute: '#exp-route',
  fileImport: '#import-file', evidence: '#evidence',
};
