/* ============================================================
   ai-health/config.js — every constant the lab uses, and nothing
   that computes. Engine modules read from here; views read from
   here; nothing downstream hard-codes a band, a coefficient or a
   citation.

   Two kinds of numbers live in this file, and they are kept apart:

   [REAL]          NEWS2 parameter bands, aggregate thresholds and
                   clinical responses. Checked 2026-11-11 against the
                   published charts: Royal College of Physicians.
                   National Early Warning Score (NEWS) 2: Standardising
                   the assessment of acute-illness severity in the NHS.
                   Updated report of a working party. London: RCP, 2017.
                   Chart 1 (scoring system), Chart 2 (thresholds and
                   triggers), Chart 4 (clinical response).

   [ILLUSTRATIVE]  Every coefficient of the synthetic population and
                   its hidden deterioration process. Invented to show
                   the mechanism. They describe no real hospital and
                   no real patient.
   ============================================================ */

/* ---------- NEWS2 (RCP 2017), Chart 1 ----------
   Seven score columns, left to right: 3 2 1 0 1 2 3.
   Integer parameters are recorded as integers; temperature is
   recorded to 0.1 degC and compared in integer tenths, so no value
   can fall between two bands. Bounds are inclusive. */
export const NEWS2_COLUMNS = [3, 2, 1, 0, 1, 2, 3];

export const NEWS2_ROWS = [
  { key: 'rr', label: 'Respiration rate', unit: 'per minute',
    cells: ['≤8', '', '9–11', '12–20', '', '21–24', '≥25'],
    bands: [
      { max: 8, pts: 3, col: 0 },
      { min: 9, max: 11, pts: 1, col: 2 },
      { min: 12, max: 20, pts: 0, col: 3 },
      { min: 21, max: 24, pts: 2, col: 5 },
      { min: 25, pts: 3, col: 6 },
    ] },
  { key: 'spo2', scale: 1, label: 'SpO₂ Scale 1', unit: '%',
    cells: ['≤91', '92–93', '94–95', '≥96', '', '', ''],
    bands: [
      { max: 91, pts: 3, col: 0 },
      { min: 92, max: 93, pts: 2, col: 1 },
      { min: 94, max: 95, pts: 1, col: 2 },
      { min: 96, pts: 0, col: 3 },
    ] },
  { key: 'spo2', scale: 2, label: 'SpO₂ Scale 2', unit: '%',
    cells: ['≤83', '84–85', '86–87', '88–92 / ≥93 air', '93–94 O₂', '95–96 O₂', '≥97 O₂'],
    bands: [
      { max: 83, pts: 3, col: 0 },
      { min: 84, max: 85, pts: 2, col: 1 },
      { min: 86, max: 87, pts: 1, col: 2 },
      { min: 88, max: 92, pts: 0, col: 3 },
      { min: 93, air: true, pts: 0, col: 3 },
      { min: 93, max: 94, o2: true, pts: 1, col: 4 },
      { min: 95, max: 96, o2: true, pts: 2, col: 5 },
      { min: 97, o2: true, pts: 3, col: 6 },
    ] },
  { key: 'o2', label: 'Air or oxygen?', unit: '',
    cells: ['', 'Oxygen', '', 'Air', '', '', ''],
    bands: [
      { eq: 1, pts: 2, col: 1 },
      { eq: 0, pts: 0, col: 3 },
    ] },
  { key: 'sbp', label: 'Systolic BP', unit: 'mmHg',
    cells: ['≤90', '91–100', '101–110', '111–219', '', '', '≥220'],
    bands: [
      { max: 90, pts: 3, col: 0 },
      { min: 91, max: 100, pts: 2, col: 1 },
      { min: 101, max: 110, pts: 1, col: 2 },
      { min: 111, max: 219, pts: 0, col: 3 },
      { min: 220, pts: 3, col: 6 },
    ] },
  { key: 'hr', label: 'Heart rate', unit: 'per minute',
    cells: ['≤40', '', '41–50', '51–90', '91–110', '111–130', '≥131'],
    bands: [
      { max: 40, pts: 3, col: 0 },
      { min: 41, max: 50, pts: 1, col: 2 },
      { min: 51, max: 90, pts: 0, col: 3 },
      { min: 91, max: 110, pts: 1, col: 4 },
      { min: 111, max: 130, pts: 2, col: 5 },
      { min: 131, pts: 3, col: 6 },
    ] },
  { key: 'cvpu', label: 'Consciousness', unit: '',
    cells: ['', '', '', 'Alert', '', '', 'CVPU'],
    bands: [
      { eq: 0, pts: 0, col: 3 },
      { eq: 1, pts: 3, col: 6 },
    ] },
  { key: 'temp', label: 'Temperature', unit: '°C', tenths: true,
    cells: ['≤35.0', '', '35.1–36.0', '36.1–38.0', '38.1–39.0', '≥39.1', ''],
    bands: [
      { max: 350, pts: 3, col: 0 },
      { min: 351, max: 360, pts: 1, col: 2 },
      { min: 361, max: 380, pts: 0, col: 3 },
      { min: 381, max: 390, pts: 1, col: 4 },
      { min: 391, pts: 2, col: 5 },
    ] },
];

/* Chart 2 (clinical risk) and Chart 4 (monitoring and response).
   The "red score" is a 3 in any single parameter. letter and token
   are this lab's redundant encoding of the category (colour plus a
   letter), so a category reads in greyscale. */
export const NEWS2_RISK = [
  { id: 'low', letter: 'L', label: 'Low', response: 'Ward-based response',
    chart4: ['Inform registered nurse, who must assess the patient', 'Registered nurse decides whether increased frequency of monitoring and/or escalation of care is required'] },
  { id: 'red', letter: 'LM', label: 'Low–medium', response: 'Urgent ward-based response', monitoring: 'Minimum 1 hourly',
    chart4: ['Registered nurse to inform medical team caring for the patient, who will review and decide whether escalation of care is necessary'] },
  { id: 'medium', letter: 'M', label: 'Medium', response: 'Key threshold for urgent response', monitoring: 'Minimum 1 hourly',
    chart4: ['Registered nurse to immediately inform the medical team caring for the patient', 'Registered nurse to request urgent assessment by a clinician or team with core competencies in the care of acutely ill patients', 'Provide clinical care in an environment with monitoring facilities'] },
  { id: 'high', letter: 'H', label: 'High', response: 'Urgent or emergency response', monitoring: 'Continuous monitoring of vital signs',
    chart4: ['Registered nurse to immediately inform the medical team caring for the patient, at least at specialist registrar level', 'Emergency assessment by a team with critical care competencies, including practitioner(s) with advanced airway management skills', 'Consider transfer of care to a level 2 or 3 clinical care facility, ie higher-dependency unit or ICU'] },
];
/* Chart 4 monitoring for the low category depends on the total. */
export const NEWS2_LOW_MONITORING = { zero: 'Minimum 12 hourly', oneToFour: 'Minimum 4–6 hourly', zeroResponse: ['Continue routine NEWS monitoring'] };
export const NEWS2_KEY_THRESHOLD = 5;   // Chart 4: "Total 5 or more, urgent response threshold"
export const NEWS2_EMERGENCY = 7;       // Chart 4: "Total 7 or more, emergency response threshold"

/* How this lab records a value before scoring (stated on the page). */
export const RECORDING_RULES = 'Respiration rate, SpO₂, systolic BP and pulse are recorded as integers; temperature to 0.1 °C and compared in tenths; consciousness is Alert or new confusion/V/P/U (CVPU), which scores 3. No recordable value falls between two bands.';

/* Ten-plus vignettes scored by hand from Charts 1, 2 and 4 before the
   code ran. The page checks every one on load. */
export const VIGNETTES = [
  { id: 'V1', note: 'all normal', obs: { rr: 16, spo2: 97, o2: 0, sbp: 125, hr: 72, cvpu: 0, temp: 36.8, scale2: 0 }, total: 0, risk: 'low', monitoring: 'Minimum 12 hourly' },
  { id: 'V2', note: 'mild derangement, no single 3', obs: { rr: 22, spo2: 95, o2: 0, sbp: 118, hr: 96, cvpu: 0, temp: 37.6, scale2: 0 }, total: 4, risk: 'low', monitoring: 'Minimum 4–6 hourly' },
  { id: 'V3', note: 'new confusion alone: red score', obs: { rr: 18, spo2: 97, o2: 0, sbp: 132, hr: 84, cvpu: 1, temp: 37.0, scale2: 0 }, total: 3, risk: 'red', monitoring: 'Minimum 1 hourly' },
  { id: 'V4', note: 'many moderate points', obs: { rr: 24, spo2: 93, o2: 1, sbp: 105, hr: 104, cvpu: 0, temp: 38.4, scale2: 0 }, total: 9, risk: 'high', monitoring: 'Continuous monitoring of vital signs' },
  { id: 'V5', note: 'key threshold reached', obs: { rr: 21, spo2: 94, o2: 0, sbp: 108, hr: 92, cvpu: 0, temp: 38.2, scale2: 0 }, total: 6, risk: 'medium', monitoring: 'Minimum 1 hourly' },
  { id: 'V6', note: 'every parameter at its worst', obs: { rr: 26, spo2: 91, o2: 1, sbp: 88, hr: 132, cvpu: 1, temp: 35.0, scale2: 0 }, total: 20, risk: 'high', monitoring: 'Continuous monitoring of vital signs' },
  { id: 'V7', note: 'Scale 2, in target on air', obs: { rr: 20, spo2: 89, o2: 0, sbp: 140, hr: 88, cvpu: 0, temp: 37.2, scale2: 1 }, total: 0, risk: 'low', monitoring: 'Minimum 12 hourly' },
  { id: 'V8', note: 'Scale 2, over-oxygenated', obs: { rr: 19, spo2: 97, o2: 1, sbp: 128, hr: 80, cvpu: 0, temp: 36.9, scale2: 1 }, total: 5, risk: 'medium', monitoring: 'Minimum 1 hourly' },
  { id: 'V9', note: 'Scale 2, low on oxygen', obs: { rr: 23, spo2: 85, o2: 1, sbp: 112, hr: 101, cvpu: 0, temp: 37.9, scale2: 1 }, total: 7, risk: 'high', monitoring: 'Continuous monitoring of vital signs' },
  { id: 'V10', note: 'lower and upper band edges', obs: { rr: 9, spo2: 96, o2: 0, sbp: 220, hr: 50, cvpu: 0, temp: 36.0, scale2: 0 }, total: 6, risk: 'medium', monitoring: 'Minimum 1 hourly' },
  { id: 'V11', note: 'just inside the 0 bands', obs: { rr: 12, spo2: 92, o2: 0, sbp: 111, hr: 51, cvpu: 0, temp: 38.0, scale2: 0 }, total: 2, risk: 'low', monitoring: 'Minimum 4–6 hourly' },
  { id: 'V12', note: 'low tails', obs: { rr: 8, spo2: 94, o2: 1, sbp: 91, hr: 41, cvpu: 0, temp: 39.1, scale2: 0 }, total: 11, risk: 'high', monitoring: 'Continuous monitoring of vital signs' },
];

/* ---------- the features a learned model may read ----------
   cost: the scale used to measure "how big a change" in the
   counterfactual search (roughly one cohort standard deviation;
   [ILLUSTRATIVE] choice). syn: words the explanation verifier
   treats as naming this feature. group: features that a reader would
   name with the same words (a change in pulse is still "pulse"). */
export const FEATURES = [
  { key: 'rr',   group: 'rr', label: 'Respiration rate', short: 'resp rate', unit: '/min', min: 6, max: 45, step: 1, cost: 4, actionable: true,
    syn: ['respiration rate', 'respiratory rate', 'resp rate', 'breathing rate', 'breaths per minute', 'breathing', 'respiration', 'respiratory', 'tachypnoea', 'tachypnea'] },
  { key: 'spo2', group: 'spo2', label: 'SpO₂', short: 'SpO2', unit: '%', min: 75, max: 100, step: 1, cost: 3, actionable: true,
    syn: ['oxygen saturation', 'saturations', 'saturation', 'spo2', 'sats', 'oximetry', 'hypoxia', 'hypoxaemia', 'hypoxemia'] },
  { key: 'o2',   group: 'o2', label: 'On oxygen', short: 'on O2', unit: '', binary: true, cost: 1.5, actionable: true,
    syn: ['supplemental oxygen', 'on oxygen', 'oxygen therapy', 'receiving oxygen', 'oxygen support', 'nasal cannula', 'oxygen mask'] },
  { key: 'sbp',  group: 'sbp', label: 'Systolic BP', short: 'systolic BP', unit: 'mmHg', min: 70, max: 230, step: 1, cost: 18, actionable: true,
    syn: ['systolic blood pressure', 'systolic', 'blood pressure', 'hypotension', 'hypotensive', 'hypertension', 'bp'] },
  { key: 'hr',   group: 'hr', label: 'Heart rate', short: 'pulse', unit: '/min', min: 30, max: 180, step: 1, cost: 14, actionable: true,
    syn: ['heart rate', 'pulse rate', 'pulse', 'tachycardia', 'tachycardic', 'bradycardia', 'bradycardic', 'hr'] },
  { key: 'cvpu', group: 'cvpu', label: 'New confusion (CVPU)', short: 'CVPU', unit: '', binary: true, cost: 2.5, actionable: true,
    syn: ['new confusion', 'confusion', 'confused', 'consciousness', 'cvpu', 'drowsy', 'alertness', 'delirium', 'disoriented', 'responsive'] },
  { key: 'temp', group: 'temp', label: 'Temperature', short: 'temp', unit: '°C', min: 33.0, max: 41.5, step: 0.1, cost: 0.7, actionable: true,
    syn: ['temperature', 'fever', 'febrile', 'pyrexia', 'hypothermia', 'hypothermic', 'temp'] },
  { key: 'age',  group: 'age', label: 'Age', short: 'age', unit: 'y', min: 18, max: 99, step: 1, actionable: false,
    syn: ['age', 'older', 'elderly', 'years old', 'aged', 'old age'] },
  { key: 'copd', group: 'copd', label: 'COPD', short: 'COPD', unit: '', binary: true, actionable: false,
    syn: ['copd', 'chronic obstructive', 'lung disease', 'emphysema'] },
  { key: 'hf',   group: 'hf', label: 'Heart failure', short: 'heart failure', unit: '', binary: true, actionable: false,
    syn: ['heart failure', 'cardiac failure'] },
  { key: 'bb',   group: 'bb', label: 'Beta-blocker', short: 'beta-blocker', unit: '', binary: true, actionable: false,
    syn: ['beta-blocker', 'beta blocker', 'beta-blockade', 'beta blockade', 'beta-blockers', 'beta blockers'] },
  /* temporal features, derived from the observation history (never edited directly) */
  { key: 'd_rr', group: 'rr', derived: true, label: 'Change in resp rate', short: 'Δ resp rate', unit: '/min',
    syn: ['change in respiration rate', 'rising respiration rate', 'respiration rate rising', 'change in resp rate'] },
  { key: 'd_hr', group: 'hr', derived: true, label: 'Change in pulse', short: 'Δ pulse', unit: '/min',
    syn: ['change in pulse', 'rising pulse', 'pulse rising', 'change in heart rate'] },
  { key: 'd_sbp', group: 'sbp', derived: true, label: 'Change in systolic BP', short: 'Δ systolic', unit: 'mmHg',
    syn: ['change in systolic', 'falling blood pressure', 'blood pressure falling', 'change in blood pressure'] },
  { key: 'd_spo2', group: 'spo2', derived: true, label: 'Change in SpO₂', short: 'Δ SpO2', unit: '%',
    syn: ['change in saturation', 'falling saturation', 'saturation falling', 'change in spo2'] },
  { key: 'slope', group: 'slope', derived: true, label: 'NEWS2 trend', short: 'NEWS2 trend', unit: 'pts/h',
    syn: ['news2 trend', 'trend in news2', 'rising news2', 'news2 rising', 'score trend', 'worsening trend', 'trajectory'] },
  { key: 'gap', group: 'gap', derived: true, label: 'Hours since last set', short: 'hours since last', unit: 'h',
    syn: ['hours since', 'time since the last', 'since the previous observation', 'observation gap'] },
  { key: 'miss', group: 'miss', derived: true, label: 'Values carried forward', short: 'carried forward', unit: '',
    syn: ['carried forward', 'missing value', 'missing values', 'not recorded', 'unrecorded'] },
];
export const FEATURE_BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
export const VITAL_KEYS = ['rr', 'spo2', 'o2', 'sbp', 'hr', 'cvpu', 'temp'];
export const TEMPORAL_KEYS = ['d_rr', 'd_hr', 'd_sbp', 'd_spo2', 'slope', 'gap', 'miss'];

/* ---------- the synthetic population [ILLUSTRATIVE] ----------
   An acute medical intake: older-skewed, with a younger arm. */
export const POPULATION = {
  ageMix: [ { w: 0.52, mu: 77, sd: 9 }, { w: 0.48, mu: 50, sd: 16 } ],
  ageMin: 18, ageMax: 99,
  female: 0.5,                                       // sex carries no planted mechanism: a control slice
  oxGroup: 0.2,                                      // share of patients whose oximeter over-reads (see OXIMETRY)
  copd: { base: 0.05, over60: 0.10 },               // P(COPD)
  scale2GivenCopd: 0.45,                             // prescribed SpO2 target 88-92%
  hf: { base: 0.02, slopePer10y: 0.03, from: 50 },   // P(heart failure) rises after 50
  bb: { base: 0.05, hf: 0.40, over65: 0.10 },        // P(beta-blocker)
  type: { infection: 0.45, respiratory: 0.30, cardiac: 0.25 },
  severity: { meanQuiet: 0.55, acuteShare: 0.16, acuteMu: 1.7, acuteSd: 0.7 },
};

/* How each process type moves each vital per unit of latent severity s.
   hr and temp responses are multiplied by the patient's blunting
   factors (below). [ILLUSTRATIVE] */
export const LOADINGS = {
  infection:   { rr: 3.4, spo2: -1.3, hr: 15, sbp: -9,  temp: 0.85 },
  respiratory: { rr: 5.2, spo2: -3.1, hr: 9,  sbp: -2,  temp: 0.30 },
  cardiac:     { rr: 3.0, spo2: -1.9, hr: 10, sbp: -13, temp: 0.0 },
};

export const BASELINE = {
  rr:   { mu: 15.5, sd: 2.0, copd: 1.5 },
  spo2: { mu: 97.0, sd: 1.3, copd: 92.0 },
  hr:   { mu: 77,   sd: 9,   bb: -7 },
  sbp:  { mu: 128,  sd: 15,  agePer10y: 2.5 },
  temp: { mu: 36.8, sd: 0.28 },
};

/* Measurement noise per set and the recordable range. [ILLUSTRATIVE] */
export const OBS = {
  noise: { rr: 1.1, spo2: 0.7, hr: 4, sbp: 6, temp: 0.12 },
  offsetShare: { rr: 0.75, spo2: 0.8, hr: 0.85, sbp: 0.85, temp: 0.7 },   // personal offset sd, as a share of the baseline sd
  clamp: { rr: [5, 50], spo2: [70, 100], hr: [30, 190], sbp: [60, 240], temp: [32.5, 42] },
  o2Ceiling: 99.4,
};

/* The age effect the lab is built to expose. Older bodies mount a
   smaller tachycardia and a smaller fever for the same illness; a
   beta-blocker blunts the pulse further. The direction is clinically
   documented (blunted or absent fever in 20-30% of infected older
   adults: Norman, Clin Infect Dis 2000); the magnitudes here are
   [ILLUSTRATIVE]. */
export const BLUNTING = {
  hrFromAge: 55, hrPerYear: 0.014, hrFloor: 0.40, bbFactor: 0.55,
  tempFromAge: 55, tempPerYear: 0.019, tempFloor: 0.25,
  hypothermia: { fromAge: 75, minSeverity: 1.8, p: 0.35, perSeverity: 1.1 },
};

/* The oximeter over-reads in one group. Direction after Sjoding et al.
   (N Engl J Med 2020), who found occult hypoxaemia about three times
   as often in Black as in White patients at the same pulse-oximeter
   reading; the size of the bias here is [ILLUSTRATIVE]. */
export const OXIMETRY = { biasMu: 2.6, biasSd: 1.0, below: 96, otherMu: 0.2, otherSd: 0.5 };

/* New confusion (CVPU) and oxygen prescribing. [ILLUSTRATIVE] */
export const CONFUSION = { b0: -5.4, s: 1.45, agePerYear: 0.03, from: 65 };
export const OXYGEN = { pGivenLow: 0.85, pOther: 0.03, liftMin: 2, liftMax: 5 };

/* Each cohort patient has 5 to 7 observation sets at irregular gaps
   before the index set (6 to 8 in all); acute patients worsen across them. [ILLUSTRATIVE] */
export const HISTORY = {
  minSets: 5, maxSets: 7, gapMin: 1, gapMax: 3.5,          // hours between sets
  trendAcute: { mu: 0.09, sd: 0.06 }, trendQuiet: { mu: 0.0, sd: 0.02 },   // severity change per hour
};

/* Recording artefacts. [ILLUSTRATIVE] */
export const ARTEFACTS = {
  missing: 0.06,       // P(one of rr, spo2, sbp, hr, temp is not recorded in a set); carried forward
  sbpRound10: 0.35,    // terminal-digit preference: systolic written to the nearest 10
  rrEven: 0.30,        // respiration rate written as an even number
};

/* The hidden truth: deterioration within 24 hours (a synthetic
   composite of unplanned ICU admission, cardiac arrest or death).
   logit P = b0 + s*S + age*(age-65) + ageXs*(age-65)*S + trend*(rise over 6 h)
             + hf + copd + cardiac.
   The interaction term is reduced physiological reserve: the same
   severity is more dangerous at 88 than at 48. [ILLUSTRATIVE] */
export const OUTCOME = { b0: -5.0, s: 1.55, agePerYear: 0.03, ageXs: 0.014, trend: 1.1, hf: 0.5, copd: 0.25, cardiac: 0.2 };

/* The world a visitor can change in the what-if bench. Every field
   regenerates the cohort and refits both models. */
export const WORLD_DEFAULT = { seed: 212, trainN: 4000, blunt: 1, oxBias: 1, b0Shift: 0 };
export const WORLD_LIMITS = { trainN: [1000, 8000], blunt: [0, 1.5], oxBias: [0, 2], b0Shift: [-1, 1] };

/* A second hospital for the shift test: younger, more respiratory,
   sicker, scored by models that never saw it. [ILLUSTRATIVE] */
export const SHIFTED = {
  label: 'hospital B: younger intake, more respiratory illness, higher acuity',
  ageMix: [ { w: 0.30, mu: 74, sd: 10 }, { w: 0.70, mu: 45, sd: 15 } ],
  type: { infection: 0.30, respiratory: 0.50, cardiac: 0.20 },
  acuteShare: 0.26, b0Shift: 0.35,
};

export const COHORT = {
  seed: 212,
  validShare: 0.25,  // of the training sample, held out to choose the L2 strength and compare models
  trainPool: 9000,
  testN: 2400,
};

/* ---------- the ward: one simulated shift [ILLUSTRATIVE] ---------- */
export const WARD = {
  beds: 20,
  hours: 12,          // observations at 0..12, one per hour
  startHour: 8,       // 08:00 to 20:00
  before: [-4, -2],   // night observations before the shift, so trends exist at 08:00
  deteriorators: 6,   // forced into each shift so the lesson always appears
  reserve: { base: 3.1, agePerYear: 0.013, hf: 0.35 },   // severity at which a patient crashes
  outreachCapacity: 4,                                     // reviews the visitor can call in a shift
  playMsPerHour: 1700,
};

/* ---------- the learned models ---------- */
/* The regression reads each vital through NEWS2's own band edges (one
   indicator per band, the 0 band as reference), so it can learn
   "too low or too high" and its fitted points can be read beside
   Chart 1. Age and the temporal features enter linearly. */
export const LR_BINS = {
  rr: [8, 11, 20, 24], spo2: [91, 93, 95], sbp: [90, 100, 110, 219], hr: [40, 50, 90, 110, 130], temp: [35.0, 36.0, 38.0, 39.0],
  ref: { rr: 2, spo2: 3, sbp: 3, hr: 2, temp: 2 },        // index of the 0-point band
};
export const MODEL = {
  lr:  { l2Grid: [1e-4, 1e-3, 1e-2, 3e-2, 1e-1], iters: 40 },
  gbt: { trees: 150, depth: 3, rate: 0.05, lambda: 1.0, minLeaf: 40, bins: 48, chunk: 10 },
  defaults: { kind: 'gbt' },
};
export const MODEL_FEATURES = ['rr', 'spo2', 'o2', 'sbp', 'hr', 'cvpu', 'temp', 'age', 'copd', 'hf', 'bb', 'd_rr', 'd_hr', 'd_sbp', 'd_spo2', 'slope', 'gap', 'miss'];

/* Counterfactual search grid for pairs (single changes use each vital's recorded step). */
export const CF = { maxCost: 4, coarse: { rr: 1, spo2: 1, sbp: 3, hr: 2, temp: 0.2 }, diverse: 3 };

/* ---------- subgroups ---------- */
export const ATTRIBUTES = [
  { id: 'age', label: 'age', values: [
    { id: 'a18', label: 'Age 18–49', test: (p) => p.age < 50 },
    { id: 'a50', label: 'Age 50–64', test: (p) => p.age >= 50 && p.age < 65 },
    { id: 'a65', label: 'Age 65–79', test: (p) => p.age >= 65 && p.age < 80 },
    { id: 'a80', label: 'Age 80+', test: (p) => p.age >= 80 } ] },
  { id: 'sex', label: 'sex', values: [
    { id: 'f', label: 'Female', test: (p) => p.sex === 'F' }, { id: 'm', label: 'Male', test: (p) => p.sex === 'M' } ] },
  { id: 'oxg', label: 'oximeter group', values: [
    { id: 'ox1', label: 'Oximeter over-reads', test: (p) => p.oxg === 1 }, { id: 'ox0', label: 'Oximeter accurate', test: (p) => p.oxg === 0 } ] },
  { id: 'copd', label: 'COPD', values: [
    { id: 'copd', label: 'COPD', test: (p) => p.copd === 1 }, { id: 's2', label: 'COPD on Scale 2', test: (p) => p.scale2 === 1 } ] },
  { id: 'bb', label: 'beta-blocker', values: [ { id: 'bb', label: 'On beta-blocker', test: (p) => p.bb === 1 } ] },
  { id: 'hf', label: 'heart failure', values: [ { id: 'hf', label: 'Heart failure', test: (p) => p.hf === 1 } ] },
];
export const SLICES = [{ id: 'all', label: 'All patients', test: () => true }, ...ATTRIBUTES.flatMap((a) => a.values.map((v) => ({ ...v, attr: a.id })))];
export const SMALL_SLICE_EVENTS = 30;

/* What the generator planted behind each attribute: revealed only
   after the visitor has run the worst-slice search. */
export const MECHANISMS = {
  age: 'Older patients mount a smaller pulse and fever for the same severity (bluntHR, bluntT), and their outcome adds an age term and an age-by-severity term: less reserve, quieter vitals.',
  oxg: 'For this group the oximeter adds about 2.6 points to SpO₂ when true saturation is below 96%, so hypoxaemia scores low on NEWS2 and looks reassuring to the model (after Sjoding et al. 2020).',
  bb: 'A beta-blocker multiplies the pulse response by 0.55, so a rising severity shows up less in pulse.',
  copd: 'COPD lowers baseline SpO₂ to about 92% and raises respiration rate; on Scale 2 the 88–92% target scores 0.',
  hf: 'Heart failure adds 0.5 to the outcome logit and lowers the ward reserve, with no change in vitals.',
  sex: 'Nothing: sex has no planted mechanism. Any gap here is sampling noise, which is what a control slice is for.',
};

/* ---------- documentation shown on the page ---------- */
export const MODEL_CARD = {
  intended: 'Teaching how a learned triage score can be inspected: contributions, counterfactuals, calibration and subgroup failure, on synthetic patients only.',
  outOfScope: 'Any clinical use: triage, escalation, diagnosis or treatment of a real person; any claim about NEWS2 or a model on real patients; any use with real records.',
  data: 'A seeded synthetic cohort generated in the browser (section 05). Training, validation and test splits are disjoint draws from the same generator; a shifted second hospital tests transport.',
  caveats: 'The world is invented and close to additive in log-odds, so a regression is a strong baseline, as it is on real clinical data (Christodoulou et al. 2019). Subgroup gaps are planted on purpose. Small slices have few events, so their intervals are wide.',
};
export const DATASHEET = [
  ['Motivation', 'To show, with a known truth, how an early warning score and a learned model differ and where each fails. Created for an educational web lab.'],
  ['Composition', 'Each record is one synthetic adult admission: age, sex, COPD, heart failure, beta-blocker, a Scale 2 prescription, an oximeter-bias flag, 5 to 7 earlier observation sets and an index set of seven NEWS2 vitals (6 to 8 sets in all), and a hidden outcome (deterioration within 24 h). No record describes a real person.'],
  ['Generation', 'Seeded PRNG (mulberry32). Latent severity drives vitals through the published-style equations in section 05; artefacts (missing values, terminal-digit preference, oximeter bias) are added after; the outcome is drawn from the hidden logit.'],
  ['Intended use', 'Teaching interpretability and evaluation; refitting offline from the export.'],
  ['Forbidden use', 'Clinical decisions of any kind; validating or benchmarking a clinical tool; presenting results as evidence about real patients or about NEWS2.'],
  ['Distribution', 'Generated on the visitor\'s machine; exported as CSV and JSON with this sheet and the seed.'],
];

/* ---------- sources shown on the page ---------- */
export const CITATIONS = [
  { id: 'rcp', text: 'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017. Charts 1, 2 and 4.' },
  { id: 'lundberg17', text: 'Lundberg SM, Lee S-I. A unified approach to interpreting model predictions. Advances in Neural Information Processing Systems (NeurIPS), 2017.' },
  { id: 'lundberg20', text: 'Lundberg SM, Erion G, Chen H, et al. From local explanations to global understanding with explainable AI for trees. Nature Machine Intelligence, 2020.' },
  { id: 'friedman', text: 'Friedman JH. Greedy function approximation: a gradient boosting machine. Annals of Statistics, 2001.' },
  { id: 'wachter', text: 'Wachter S, Mittelstadt B, Russell C. Counterfactual explanations without opening the black box: automated decisions and the GDPR. Harvard Journal of Law & Technology, 2018.' },
  { id: 'vancalster', text: 'Van Calster B, McLernon DJ, van Smeden M, Wynants L, Steyerberg EW. Calibration: the Achilles heel of predictive analytics. BMC Medicine, 2019.' },
  { id: 'christodoulou', text: 'Christodoulou E, Ma J, Collins GS, Steyerberg EW, Verbakel JY, Van Calster B. A systematic review shows no performance benefit of machine learning over logistic regression for clinical prediction models. Journal of Clinical Epidemiology, 2019.' },
  { id: 'hanley', text: 'Hanley JA, McNeil BJ. The meaning and use of the area under a receiver operating characteristic (ROC) curve. Radiology, 1982.' },
  { id: 'saito', text: 'Saito T, Rehmsmeier M. The precision-recall plot is more informative than the ROC plot when evaluating binary classifiers on imbalanced datasets. PLoS ONE, 2015.' },
  { id: 'vickers', text: 'Vickers AJ, Elkin EB. Decision curve analysis: a novel method for evaluating prediction models. Medical Decision Making, 2006.' },
  { id: 'efron', text: 'Efron B, Tibshirani RJ. An Introduction to the Bootstrap. Chapman & Hall, 1993.' },
  { id: 'wilson', text: 'Wilson EB. Probable inference, the law of succession, and statistical inference. Journal of the American Statistical Association, 1927.' },
  { id: 'sjoding', text: 'Sjoding MW, Dickson RP, Iwashyna TJ, Gay SE, Valley TS. Racial bias in pulse oximetry measurement. New England Journal of Medicine, 2020.' },
  { id: 'norman', text: 'Norman DC. Fever in the elderly. Clinical Infectious Diseases, 2000.' },
  { id: 'mitchell', text: 'Mitchell M, Wu S, Zaldivar A, et al. Model cards for model reporting. Proceedings of FAT* (ACM Conference on Fairness, Accountability, and Transparency), 2019.' },
  { id: 'gebru', text: 'Gebru T, Morgenstern J, Vecchione B, et al. Datasheets for datasets. Communications of the ACM, 2021.' },
];
