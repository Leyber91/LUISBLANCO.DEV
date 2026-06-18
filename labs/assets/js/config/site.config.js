/* ============================================================
   site.config.js — the single source of truth for WHAT the hub
   contains. The hub renders itself from this data: nothing in
   index.html hard-codes a project card or a sidebar link.

   To ship a proposed project later:
     1. set its `status` to 'built'
     2. give it an `href` (its page) and optionally a `canvas`
   The hub updates with zero markup changes.
   ============================================================ */

export const SITE = {
  name: 'luisblanco.dev — Labs',
  short: 'Labs',
  tagline: 'Interactive experiments at the edge of AI, space-science and systems.',
  blurb:
    'Interactive experiments in AI, space-science and the systems that connect them. ' +
    'Built in the open, playable in the browser.',
  domain: 'luisblanco.dev',
  author: 'Leyber91',
};

export const SOCIALS = [
  { id: 'github',   label: 'GitHub',   icon: 'fa-brands fa-github',   href: 'https://github.com/Leyber91' },
  { id: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin-in', href: 'https://linkedin.com/in/luisblancorodriguez' },
];

export const NAV = [
  { id: 'home',     label: 'Home',     href: '#home' },
  { id: 'projects', label: 'Projects', href: '#projects' },
  { id: 'about',    label: 'About',    href: '#about' },
];

/* Status vocabulary -> drives the pill colour + interactivity.
   'built'   : has a real page, fully interactive
   'beta'    : playable but rough
   'planned' : conceived, not yet built (shown, honestly, as such) */
export const STATUS = {
  built:   { label: 'Live',     kind: 'built',   interactive: true },
  beta:    { label: 'Beta',     kind: 'beta',    interactive: true },
  planned: { label: 'Planned',  kind: 'planned', interactive: false },
};

export const CATEGORIES = [
  {
    id: 'space',
    label: 'Space',
    icon: 'fa-solid fa-meteor',
    intro: 'Physics you can fly through.',
    projects: [
      { id: 'black-hole', title: 'Black Hole', status: 'built',
        href: 'bh_animation_page.html',
        blurb: 'A Schwarzschild black hole with a doppler-asymmetric accretion disk and real-time gravitational lensing.' },
      { id: 'dimensional', title: 'Dimensional Test', status: 'built',
        href: 'md_animation_page.html',
        blurb: 'Project an n-dimensional hypercube down into three and watch dimensions fold.' },
      { id: 'exomania', title: 'Exomania', status: 'built',
        href: 'exomania.html',
        blurb: 'Fly between procedurally lit exoplanets, fed daily by NASA Exoplanet Archive data.' },
    ],
  },
  {
    id: 'tryverse',
    label: 'Tryverse',
    icon: 'fa-solid fa-infinity',
    intro: 'The narrative multiverse.',
    projects: [
      { id: 'heptapod', title: 'Heptapod Codec', status: 'built',
        href: 'heptapod.html',
        blurb: 'Type a sentence and a closed lexicon encodes it into circular logograms whose shape carries the meaning; hover one and it blooms back into its proposition. The premise of Arrival as a working, breakable codec.' },
      { id: 'timeline', title: 'Interactive Timeline', status: 'planned',
        blurb: 'A navigable timeline of the Tryverse — branch points, dimensions and the people inside them.' },
      { id: 'last-witness', title: 'Time-Slip: The Last Witness', status: 'beta',
        blurb: 'Cross a singularity, return ten thousand years late, and speak with the last machine mind awake.' },
      { id: 'alt-reality', title: 'Alternate Reality Scenarios', status: 'beta',
        href: 'altverse.html',
        blurb: 'A what-if engine: change one constant and a deterministic pipeline weaves a complete, consistent world — premise, chronology, map and the causal record of how it differs from ours.' },
    ],
  },
  {
    id: 'metapower',
    label: 'Metapower',
    icon: 'fa-solid fa-bolt',
    intro: 'AI that makes things.',
    projects: [
      { id: 'the-figure', title: 'The Figure', status: 'built',
        href: 'figure.html',
        blurb: 'A recursive mixture-of-agents, run live: three persona-framed calls fan out on your question, a local router clusters agreement against dissent, and a fourth call synthesises — orchestration you watch think.' },
      { id: 'primordial-seed', title: 'Primordial Seed', status: 'built',
        href: 'seed.html',
        blurb: 'A deterministic L-system grows itself into an organism, then crystallises the motif it repeats most into a new reusable rule — self-growth you can read, no model and no network.' },
      { id: 'content-gen', title: 'AI Content Studio', status: 'planned',
        blurb: 'Local-first generation (Ollama) with a hosted fallback — drafts, posts, art prompts.' },
      { id: 'learn-platform', title: 'Personalized Learning', status: 'planned',
        blurb: 'Adaptive learning paths assembled by a model from where you actually are.' },
      { id: 'social-tool', title: 'Social Manager', status: 'planned',
        blurb: 'Schedule, draft and analyse — an agentic assistant for the boring half.' },
    ],
  },
  {
    id: 'data',
    label: 'Data Driven',
    icon: 'fa-solid fa-chart-line',
    intro: 'Decisions, instrumented.',
    projects: [
      { id: 'token-ekg', title: 'Token EKG', status: 'built',
        href: 'token-ekg.html',
        blurb: 'A model does not emit tokens evenly. Token EKG timestamps each one as it streams and draws that hidden cadence as a live biosignal with a spectral read — real telemetry of the serving pipeline, not a brain.' },
      { id: 'dataspace', title: 'DATASPACE', status: 'built',
        href: 'dataspace.html',
        blurb: 'Compress a whole conversation into a capsule only a model can rebuild: it falls to a lensed horizon as measured bits, a fresh model reconstitutes it, and every lost word escapes as radiation. Degradation, measured.' },
      { id: 'sports-predict', title: 'Predictive Analytics', status: 'planned',
        blurb: 'Model match outcomes from open sports data — and show the uncertainty honestly.' },
      { id: 'ai-health', title: 'AI in Healthcare', status: 'planned',
        blurb: 'Explainable triage demos on synthetic records — interpretability first.' },
      { id: 'mentorship', title: 'Virtual Mentorship', status: 'planned',
        blurb: 'A retrieval-grounded mentor that cites what it draws on.' },
    ],
  },
  {
    id: 'self',
    label: 'Self Improvement',
    icon: 'fa-solid fa-brain',
    intro: 'Tools for the inner work.',
    projects: [
      { id: 'pathways', title: 'Learning Pathways', status: 'planned',
        blurb: 'Turn a goal into a sequenced, checkable path.' },
      { id: 'habits', title: 'Habit Formation', status: 'planned',
        blurb: 'Streaks that survive missed days — designed against the all-or-nothing trap.' },
      { id: 'mindful', title: 'Mindfulness', status: 'planned',
        blurb: 'Breath and focus sessions, generative soundscapes.' },
    ],
  },
  {
    id: 'instrumental',
    label: 'Instrumental',
    icon: 'fa-solid fa-screwdriver-wrench',
    intro: 'The maker stack.',
    projects: [
      { id: 'honesty-decoder', title: 'Honesty Decoder', status: 'built',
        href: 'honesty-decoder.html',
        blurb: 'Every system in this lab, decoded: the myth it could be sold as, the plain mechanism, and an honest reality-percentage between them. The anti-evangelism stance as a running receipt.' },
      { id: 'roaster', title: 'The Roaster', status: 'built',
        href: 'roaster.html',
        blurb: 'A model that loves real engineering too much to let it lie about itself — name a system and it roasts the myth live: brutal on the hype, precise on the mechanism, graded for how much is real.' },
      { id: 'pm-platform', title: 'Project Management', status: 'planned',
        blurb: 'Lightweight planning that gets out of the way.' },
      { id: 'automation', title: 'Automation & Integration', status: 'planned',
        blurb: 'Glue between tools — webhooks, schedules, small agents.' },
      { id: 'prototyping', title: 'Rapid Prototyping', status: 'planned',
        blurb: 'Spin a testable idea up in minutes, throw it away in seconds.' },
    ],
  },
  {
    id: 'fitness',
    label: 'Fitness',
    icon: 'fa-solid fa-dumbbell',
    intro: 'The body, in the loop.',
    projects: [
      { id: 'vr-fitness', title: 'VR Fitness', status: 'planned',
        blurb: 'Workouts that are games you actually want to finish.' },
      { id: 'challenges', title: 'Community Challenges', status: 'planned',
        blurb: 'Shared goals, honest leaderboards.' },
      { id: 'workout-plans', title: 'Personalized Plans', status: 'built',
        href: 'workout-plans.html',
        blurb: 'A reasoning model thinks through your constraints out loud, then builds a training block around the week you actually have.' },
    ],
  },
  {
    id: 'viral',
    label: 'Viral',
    icon: 'fa-solid fa-fire',
    intro: 'Made to be shared.',
    projects: [
      { id: 'memes', title: 'AI Meme Lab', status: 'built',
        href: 'memes.html',
        blurb: 'Watch a reasoning model argue with itself about what is funny — draft a slate, score each line against a taste rubric, commit, and composite a downloadable event-horizon meme.' },
      { id: 'trends', title: 'Trending Topics', status: 'built',
        href: 'trending.html',
        blurb: 'A live agentic scan: it fetches real signals from the open web in your browser, ranks what is actually rising, and a model explains why.' },
      { id: 'ugc', title: 'User-Generated Content', status: 'planned',
        blurb: 'Tools that turn an audience into co-authors.' },
    ],
  },
];

/* Flat, derived views — computed once, reused by the hub. */
export const ALL_PROJECTS = CATEGORIES.flatMap((c) =>
  c.projects.map((p) => ({ ...p, category: c.id, categoryLabel: c.label })));

export const COUNTS = {
  total: ALL_PROJECTS.length,
  built: ALL_PROJECTS.filter((p) => p.status === 'built').length,
  beta: ALL_PROJECTS.filter((p) => p.status === 'beta').length,
  planned: ALL_PROJECTS.filter((p) => p.status === 'planned').length,
  categories: CATEGORIES.length,
};
