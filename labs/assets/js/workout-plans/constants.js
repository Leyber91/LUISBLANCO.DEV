/* ============================================================
   workout-plans/constants.js — every tunable number, rule table,
   label, source and prompt for Personalized Plans. The engine
   (Planner, LoadModel) reads these; nothing downstream hard-codes
   a parameter. Each value says where it comes from: a source key
   from SOURCES, or "illustrative" when it is a coaching
   convention chosen to make the mechanism work.
   ============================================================ */

/* ---------- sources, checked at their abstracts (Europe PMC) 2026-11-11 ---------- */
export const SOURCES = {
  foster2001: { short: 'Foster et al. 2001', full: 'Foster C, Florhaug JA, Franklin J, Gottschall L, Hrovatin LA, Parker S, Doleshal P, Dodge C. A new approach to monitoring exercise training. J Strength Cond Res. 2001;15(1):109-115.' },
  foster1998: { short: 'Foster 1998', full: 'Foster C. Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc. 1998;30(7):1164-1168.' },
  banister1975: { short: 'Banister et al. 1975', full: 'Banister EW, Calvert TW, Savage MV, Bach T. A systems model of training for athletic performance. Aust J Sports Med. 1975;7:57-61.' },
  morton1990: { short: 'Morton et al. 1990', full: 'Morton RH, Fitz-Clarke JR, Banister EW. Modeling human performance in running. J Appl Physiol. 1990;69(3):1171-1177.' },
  hellard2006: { short: 'Hellard et al. 2006', full: 'Hellard P, Avalos M, Lacoste L, Barale F, Chatard JC, Millet GP. Assessing the limitations of the Banister model in monitoring training. J Sports Sci. 2006;24(5):509-520.' },
  busso2003: { short: 'Busso 2003', full: 'Busso T. Variable dose-response relationship between exercise training and performance. Med Sci Sports Exerc. 2003;35(7):1188-1195.' },
  ceddia2025: { short: 'Ceddia et al. 2025', full: 'Ceddia D, Bondell H, Taylor P. Mathematical modelling and optimisation of athletic performance: tapering and periodisation. arXiv:2505.20859, 2025.' },
  impellizzeri2020: { short: 'Impellizzeri et al. 2020', full: 'Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ. Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform. 2020;15(6):907-913.' },
  acsm2009: { short: 'ACSM 2009', full: 'American College of Sports Medicine. Position stand: progression models in resistance training for healthy adults. Med Sci Sports Exerc. 2009;41(3):687-708.' },
  garber2011: { short: 'Garber et al. 2011', full: 'Garber CE, Blissmer B, Deschenes MR, et al. ACSM position stand: quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults. Med Sci Sports Exerc. 2011;43(7):1334-1359.' },
  who2020: { short: 'WHO 2020', full: 'Bull FC, Al-Ansari SS, Biddle S, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med. 2020;54(24):1451-1462.' },
  schoenfeld2017: { short: 'Schoenfeld et al. 2017', full: 'Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. J Sports Sci. 2017;35(11):1073-1082.' },
  pelland2025: { short: 'Pelland et al. 2025', full: 'Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The resistance training dose response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gains. Sports Med. 2025. doi:10.1007/s40279-025-02344-w' },
  rhea2002: { short: 'Rhea et al. 2002', full: 'Rhea MR, Ball SD, Phillips WT, Burkett LN. A comparison of linear and daily undulating periodized programs with equated volume and intensity for strength. J Strength Cond Res. 2002;16(2):250-255.' },
  harries2015: { short: 'Harries et al. 2015', full: 'Harries SK, Lubans DR, Callister R. Systematic review and meta-analysis of linear and undulating periodized resistance training programs on muscular strength. J Strength Cond Res. 2015;29(4):1113-1125.' },
  grgic2017: { short: 'Grgic et al. 2017', full: 'Grgic J, Mikulic P, Podnar H, Pedisic Z. Effects of linear and daily undulating periodized resistance training programs on measures of muscle hypertrophy: a systematic review and meta-analysis. PeerJ. 2017;5:e3695.' },
  issurin2010: { short: 'Issurin 2010', full: 'Issurin VB. New horizons for the methodology and physiology of training periodization. Sports Med. 2010;40(3):189-206.' },
  seiler2010: { short: 'Seiler 2010', full: 'Seiler S. What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform. 2010;5(3):276-291.' },
  bosquet2007: { short: 'Bosquet et al. 2007', full: 'Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc. 2007;39(8):1358-1365.' },
  zourdos2016: { short: 'Zourdos et al. 2016', full: 'Zourdos MC, Klemp A, Dolan C, et al. Novel resistance training-specific rating of perceived exertion scale measuring repetitions in reserve. J Strength Cond Res. 2016;30(1):267-275.' },
  buist2008: { short: 'Buist et al. 2008', full: 'Buist I, Bredeweg SW, van Mechelen W, Lemmink KA, Pepping GJ, Diercks RL. No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial. Am J Sports Med. 2008;36(1):33-39.' },
  fedb: { short: 'free-exercise-db', full: 'yuhonas. free-exercise-db: open public domain exercise dataset, 876 exercises. GitHub, dist/exercises.json at commit 79ca7b4 (2026-08-29). The Unlicense.' },
  escamilla2001: { short: 'Escamilla 2001', full: 'Escamilla RF. Knee biomechanics of the dynamic squat exercise. Med Sci Sports Exerc. 2001;33(1):127-141.' },
};

/* ---------- visitor inputs ---------- */
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const GOALS = {
  strength:    { label: 'strength',    family: 'resist' },
  hypertrophy: { label: 'muscle',      family: 'resist' },
  endurance:   { label: 'endurance',   family: 'endure' },
  general:     { label: 'health',      family: 'general' },
};
export const LEVELS = { beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced' };
export const MINUTES = [30, 45, 60, 75, 90];
export const WEEKS = [6, 8, 12];

/* equipment profiles: the items each one holds */
export const EQUIPMENT = {
  gym:        { label: 'full gym',   kit: ['barbell', 'rack', 'dumbbell', 'machine', 'cable', 'bench', 'bar', 'kettlebell', 'bands'] },
  dumbbells:  { label: 'dumbbells',  kit: ['dumbbell', 'bench'] },
  bodyweight: { label: 'bodyweight', kit: [] },
};
export const KIT_LABEL = { barbell: 'a barbell', rack: 'a rack', dumbbell: 'dumbbells', machine: 'a machine', cable: 'a cable stack', bench: 'a bench', bar: 'a pull-up bar', kettlebell: 'a kettlebell', bands: 'bands' };

/* injury flags: each is a predicate over exercise attributes, with the
   reason the page prints when it removes a node. The flags change
   exercise choice only. */
export const INJURIES = {
  knee:     { label: 'knee',      test: (x) => x.knee === 'deep' || x.impact, why: (x) => (x.impact ? 'impact loading' : 'deep loaded knee flexion'), src: 'escamilla2001' },
  back:     { label: 'low back',  test: (x) => x.spine === 'high', why: () => 'high spinal load', src: null },
  shoulder: { label: 'shoulder',  test: (x) => x.shoulder === 'high', why: () => 'overhead or end-range shoulder load', src: null },
  wrist:    { label: 'wrist',     test: (x) => x.wrist, why: () => 'loaded wrist extension', src: null },
};

/* ---------- frequency (sessions per week) ---------- */
/* ACSM 2009: 2-3 d/wk novice, 3-4 intermediate, 4-5 advanced (resistance).
   Endurance caps are illustrative. General health: WHO 2020 asks for
   150-300 min moderate aerobic a week plus muscle strengthening;
   Garber et al. 2011 put resistance work on 2-3 days a week. */
export const FREQ = {
  resist:  { beginner: [2, 3], intermediate: [3, 4], advanced: [4, 5], src: 'acsm2009', tag: 'REAL' },
  endure:  { beginner: [3, 4], intermediate: [4, 5], advanced: [5, 6], src: null, tag: 'ILLUSTRATIVE' },
  general: { beginner: [2, 5], intermediate: [3, 6], advanced: [3, 6], src: 'garber2011', tag: 'REAL' },
};
export const WHO_AEROBIC_MIN = [150, 300];

/* ---------- periodization ---------- */
/* Which scheme a goal and level get. Meta-analyses find linear and daily
   undulating models give similar strength (Harries 2015) and hypertrophy
   (Grgic 2017) outcomes, so this table is a convention; the page says so. */
export const SCHEME_RULE = {
  strength:    { beginner: 'linear', intermediate: 'undulating', advanced: 'block' },
  hypertrophy: { beginner: 'linear', intermediate: 'undulating', advanced: 'undulating' },
  endurance:   { beginner: 'linear', intermediate: 'block', advanced: 'block' },
  general:     { beginner: 'linear', intermediate: 'linear', advanced: 'undulating' },
};
export const SCHEME_LABEL = { linear: 'linear', undulating: 'daily undulating', block: 'block' };
export const SCHEMES = ['auto', 'linear', 'undulating', 'block'];
export const SCHEME_SRC = { linear: 'rhea2002', undulating: 'rhea2002', block: 'issurin2010' };

/* week multipliers. Deload: volume cut 40% and 2 RPE points lower
   (illustrative). Taper: volume cut exponentially by 41-60% over two
   weeks with intensity and frequency kept (Bosquet et al. 2007). */
export const WEEK_SHAPE = {
  buildVol:  [0.9, 1.0, 1.1],     // within a 3-week build, by week index (illustrative)
  buildRpe:  [0, 0.5, 1.0],       // RPE added across the build (illustrative)
  deloadVol: 0.6, deloadRpe: -1,
  taperVol:  [0.55, 0.45],        // two-week exponential taper (Bosquet 2007: cut 41-60%)
  block: {
    accumulation:  { vol: 1.1, rpe: 0 },
    transmutation: { vol: 0.9, rpe: 1 },
    realization:   { vol: 0.75, rpe: 1.5 },
  },
};

/* rep zones for main lifts. Linear steps 8 -> 6 -> 4 and daily undulating
   rotates 8 / 6 / 4, as in Rhea et al. 2002. Hypertrophy stays in ACSM
   2009's 6-12 RM emphasis; novices in 8-12 RM. */
export const REPS = {
  strength:    { linear: ['8', '6', '4'], undulating: { H: '4', M: '6', L: '8' }, block: { accumulation: '6-8', transmutation: '4-5', realization: '2-3' }, acc: '8-10' },
  hypertrophy: { linear: ['10-12', '8-10', '6-8'], undulating: { H: '6-8', M: '8-10', L: '10-12' }, acc: '10-15' },
  general:     { linear: ['10-12', '10-12', '8-10'], undulating: { H: '8-10', M: '10-12', L: '12-15' }, acc: '12-15' },
  endurance:   { linear: ['8-10', '8-10', '6-8'], block: { accumulation: '10-12', transmutation: '6-8', realization: '6-8' }, acc: '10-12' },
};
export const BASE_RPE = { strength: 7, hypertrophy: 7, general: 6, endurance: 6.5 };

/* ---------- weekly volume targets, sets per muscle ---------- */
/* Hypertrophy follows a graded dose-response (Schoenfeld 2017: 10+ weekly
   sets trended above <5 and 5-9; Pelland 2025: gains rise with volume with
   diminishing returns). The numbers per level are illustrative. */
export const VOLUME = {
  hypertrophy: { beginner: [8, 12], intermediate: [10, 16], advanced: [12, 20], src: 'schoenfeld2017' },
  strength:    { beginner: [6, 10], intermediate: [8, 12], advanced: [8, 14], src: 'pelland2025' },
  general:     { beginner: [4, 8], intermediate: [4, 10], advanced: [6, 12], src: 'garber2011' },
  endurance:   { beginner: [3, 6], intermediate: [3, 8], advanced: [4, 8], src: null },
};
/* muscles with a direct target; the rest count indirect work only */
export const TARGETED = ['chest', 'upperBack', 'lats', 'sideDelt', 'rearDelt', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];
/* endurance blocks target the legs and trunk only; upper-body work there is optional (illustrative) */
export const TARGETED_BY_FAMILY = { endure: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] };
export const SECONDARY_WEIGHT = 0.5;   // counting convention: a secondary muscle gets half a set (illustrative)
/* how much the solver cares about closing each muscle's gap: large muscle groups first (illustrative) */
export const MUSCLE_WEIGHT = { chest: 1, upperBack: 1, lats: 1, quads: 1, hamstrings: 1, glutes: 0.9, sideDelt: 0.7, rearDelt: 0.6, biceps: 0.6, triceps: 0.6, calves: 0.5, abs: 0.5 };

/* ---------- time budget ---------- */
/* Rest: ACSM 2009, 3-5 min for heavy strength work, 1-2 min for
   hypertrophy. Work time and setup are illustrative. */
export const TIME = {
  warmup: 7,                     // min, general warm-up
  setupMain: 3, setupAcc: 1,     // min per exercise (ramp-up sets for main lifts)
  work: 0.75,                    // min per working set
  rest: {                        // min between sets [main, accessory]
    strength: [3.5, 2], hypertrophy: [2, 1.5], general: [1.5, 1], endurance: [2, 1.5],
  },
  sets: { main: [3, 5], second: [3, 4], acc: [2, 4] },   // [base, max] per slot (illustrative)
};

/* ---------- session templates ---------- */
/* a slot: [pattern, first-choice exercise, role] */
export const TEMPLATES = {
  FULL_A:  { name: 'Full body A', day: 'H', slots: [['squat', 'back_squat', 'main'], ['hpush', 'bench_press', 'main'], ['hpull', 'cable_row', 'second'], ['kneeflex', 'leg_curl', 'acc'], ['latraise', 'cable_lateral', 'acc'], ['core', 'plank', 'acc']] },
  FULL_B:  { name: 'Full body B', day: 'M', slots: [['hinge', 'rdl', 'main'], ['vpush', 'ohp', 'main'], ['vpull', 'pullup', 'second'], ['lunge', 'bss_db', 'second'], ['elbowflex', 'db_curl', 'acc'], ['calf', 'calf_machine', 'acc']] },
  FULL_C:  { name: 'Full body C', day: 'L', slots: [['squat', 'leg_press', 'main'], ['hpush', 'incline_db', 'second'], ['hpull', 'cs_db_row', 'main'], ['hinge', 'hip_thrust_bb', 'acc'], ['elbowext', 'pushdown', 'acc'], ['reardelt', 'face_pull', 'acc']] },
  UPPER_A: { name: 'Upper A', day: 'H', slots: [['hpush', 'bench_press', 'main'], ['hpull', 'bb_row', 'main'], ['vpush', 'db_shoulder_press', 'second'], ['vpull', 'lat_pulldown', 'second'], ['latraise', 'cable_lateral', 'acc'], ['elbowext', 'pushdown', 'acc'], ['elbowflex', 'bb_curl', 'acc']] },
  UPPER_B: { name: 'Upper B', day: 'L', slots: [['vpush', 'ohp', 'main'], ['vpull', 'pullup', 'main'], ['hpush', 'incline_db', 'second'], ['hpull', 'cs_db_row', 'second'], ['reardelt', 'face_pull', 'acc'], ['elbowflex', 'db_curl', 'acc'], ['elbowext', 'db_skull', 'acc']] },
  LOWER_A: { name: 'Lower A', day: 'H', slots: [['squat', 'back_squat', 'main'], ['hinge', 'rdl', 'second'], ['lunge', 'bss_db', 'acc'], ['kneeflex', 'leg_curl', 'acc'], ['calf', 'calf_machine', 'acc'], ['core', 'plank', 'acc']] },
  LOWER_B: { name: 'Lower B', day: 'L', slots: [['hinge', 'rdl', 'main'], ['squat', 'leg_press', 'second'], ['lunge', 'bss_db', 'acc'], ['kneeflex', 'leg_curl', 'acc'], ['calf', 'calf_machine', 'acc'], ['core', 'pallof', 'acc']] },
  PUSH:    { name: 'Push', day: 'M', slots: [['hpush', 'bench_press', 'main'], ['vpush', 'db_shoulder_press', 'second'], ['hpush', 'incline_db', 'acc'], ['latraise', 'cable_lateral', 'acc'], ['elbowext', 'pushdown', 'acc'], ['elbowext', 'db_skull', 'acc']] },
  PULL:    { name: 'Pull', day: 'M', slots: [['vpull', 'pullup', 'main'], ['hpull', 'bb_row', 'second'], ['hpull', 'cs_db_row', 'acc'], ['reardelt', 'face_pull', 'acc'], ['elbowflex', 'bb_curl', 'acc'], ['elbowflex', 'db_curl', 'acc']] },
  LEGS:    { name: 'Legs', day: 'M', slots: [['squat', 'back_squat', 'main'], ['hinge', 'rdl', 'second'], ['lunge', 'bss_db', 'acc'], ['kneeflex', 'leg_curl', 'acc'], ['calf', 'calf_machine', 'acc'], ['core', 'pallof', 'acc']] },
  STR_E:   { name: 'Strength', day: 'M', slots: [['squat', 'back_squat', 'main'], ['hinge', 'rdl', 'second'], ['calf', 'calf_machine', 'acc'], ['core', 'plank', 'acc'], ['lunge', 'bss_db', 'acc'], ['hpull', 'cs_db_row', 'acc']] },
};

/* splits by sessions per week, per goal family */
export const SPLITS = {
  resist: {
    2: ['FULL_A', 'FULL_B'],
    3: ['FULL_A', 'FULL_B', 'FULL_C'],
    4: ['UPPER_A', 'LOWER_A', 'UPPER_B', 'LOWER_B'],
    5: ['UPPER_A', 'LOWER_A', 'PUSH', 'PULL', 'LEGS'],
    6: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL', 'LEGS'],
  },
  general: {
    2: ['FULL_A', 'FULL_B'],
    3: ['FULL_A', 'C:MOD', 'FULL_B'],
    4: ['FULL_A', 'C:MOD', 'FULL_B', 'C:MOD'],
    5: ['FULL_A', 'C:MOD', 'FULL_B', 'C:MOD', 'FULL_C'],
    6: ['FULL_A', 'C:MOD', 'FULL_B', 'C:MOD', 'FULL_C', 'C:MOD'],
  },
  endure: {
    2: ['C:EASY+STR_E', 'C:LONG'],
    3: ['C:INT', 'C:EASY+STR_E', 'C:LONG'],
    4: ['C:EASY+STR_E', 'C:INT', 'C:EASY', 'C:LONG'],
    5: ['C:EASY+STR_E', 'C:INT', 'C:EASY', 'C:EASY+STR_E', 'C:LONG'],
    6: ['C:EASY+STR_E', 'C:INT', 'C:EASY', 'C:TEMPO', 'C:EASY+STR_E', 'C:LONG'],
  },
};

/* aerobic session kinds. Session RPE on Foster's CR-10 scale; the fraction
   of the visitor's minutes each kind uses. Values illustrative; the
   low / high split follows the ~80/20 distribution Seiler 2010 describes. */
export const CARDIO = {
  EASY:  { name: 'Easy aerobic', rpe: 3, frac: 0.75, high: false, note: 'conversational pace' },
  MOD:   { name: 'Moderate aerobic', rpe: 4, frac: 0.8, high: false, note: 'brisk, can still talk' },
  LONG:  { name: 'Long aerobic', rpe: 4, frac: 1.0, high: false, note: 'steady, the longest of the week' },
  TEMPO: { name: 'Tempo', rpe: 6, frac: 0.8, high: true, note: '20-30 min comfortably hard' },
  INT:   { name: 'Intervals', rpe: 8, frac: 1.0, high: true, note: '4 min hard, 3 min easy' },
};
export const STR_IN_COMBO_FRAC = 0.45;   // share of a combined session given to strength (illustrative)

/* session RPE (whole session, CR-10) for resistance work: the set RPE target
   minus one. Illustrative; a logged value replaces it. */
export const SESSION_RPE_OFFSET = -1;

/* ---------- load model ---------- */
/* Session load = session RPE x minutes, in arbitrary units (Foster et al. 2001).
   Fitness-fatigue impulse response (Banister et al. 1975). Population
   defaults k1 = 1, k2 = 2, tau1 = 45 d, tau2 = 15 d are the values reported
   for Morton et al. 1990 by Hellard et al. 2006, who also show how wide
   individual fits run: tau_a 38 (17-59) d, tau_f 19 (6-32) d in elite
   swimmers. Variable dose (Busso 2003): the fatigue gain k2 itself rises
   with recent load, k2(i) = k3 * sum w(j) exp(-(i-j)/tau3). tau3 = 2.3 d is
   Busso's mean fitted value as transcribed by Ceddia et al. 2025 (original
   table not checked here); k3 is rescaled so mean k2 = 2 on the visitor's
   own plan, because Busso's k3 is in cycle-ergometer units. */
export const LOAD_MODEL = {
  k1: 1, k2: 2, tau1: 45, tau2: 15, tau3: 2.3, k2Mean: 2,
  priorDays: 42,
  prior: { beginner: 0.3, intermediate: 0.7, advanced: 0.9 },  // share of week-1 load trained before the block (illustrative)
  hellard: { tauA: [38, 17, 59], tauF: [19, 6, 32] },
  /* the exponentially weighted chart popularised by TrainingPeaks (a practice convention, not a fit):
     CTL(t) = CTL(t-1) + (w - CTL(t-1)) / 42, ATL the same over 7 days, form = CTL - ATL. It is the
     Banister model with k1 = 1/42, k2 = 1/7 and decay factors 41/42 and 6/7 (tau about 41.5 d and 6.5 d). */
  pmc: { ctl: 42, atl: 7 },
  sensitivity: 0.5,        // the band varies tau1 and tau2 by +-50%
};

/* ---------- re-planning rules ---------- */
export const REPLAN = {
  hardRpeDelta: 1.5,        // logged session RPE this far above plan counts as hard
  tolSessionFrac: 0.5,      // re-plan when you would start a session more than half a typical planned session of form below plan (illustrative)
  maxAdjusted: 2,           // sessions a single hard log may adjust
  repeatWeekMisses: 2,      // misses in one week before the next week repeats its step
  loadStep: '2-10%',        // ACSM 2009: add 2-10% load when the visitor beats the target by 1-2 reps
  weekRiseFlag: 10,         // flag a week more than 10% above the mean of the 4 before it (a contested convention)
};

/* ---------- default state: the running example on load ---------- */
export const DEFAULT_STATE = {
  goal: 'hypertrophy', level: 'intermediate',
  days: [1, 1, 0, 1, 1, 0, 0], minutes: 60, equipment: 'gym',
  injuries: [], notes: 'dodgy left knee, back from holiday', scheme: 'auto', pins: {}, bm: 'week', weeks: 8, mode: 'busso',
  log: { 14: { kind: 'hard', rpe: 9 }, 15: { kind: 'hard', rpe: 9 }, 38: { kind: 'missed' } },
  sel: 17,
};

/* ---------- the one model call ---------- */
export const NARRATE_SYSTEM =
  'You narrate a training plan. A deterministic planner already made every decision; you did not. ' +
  'Explain its reasoning to the person in plain, exact sentences, using only the decision log you are given. ' +
  'Every sentence must cite the ids of the decisions it explains. Do not add exercises, numbers, ' +
  'percentages or claims that are not in the cited decisions. Do not diagnose or give medical advice. ' +
  'No lists, no markdown, no emoji. Return JSON: {"narration":[{"say":"one sentence","cites":["D1"]}]} ' +
  'with 5 to 8 sentences, in the order a coach would explain the block.';

export const NARRATE_USER = (summary, log) =>
  'Plan: ' + summary + '\nDecision log (id | decision | numbers):\n' +
  log.map((d) => `${d.id} | ${d.text} | ${d.nums.join(', ')}`).join('\n');

/* claims the narration may not make: the checker strikes a sentence that matches */
export const MEDICAL_RE = /\b(diagnos\w*|cures?|cured|heals?|healing|rehab\w*|injury[- ]proof|prevents? injur\w*|guarantee\w*|treatment|safe for your)\b/i;
