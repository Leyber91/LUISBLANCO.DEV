/* ============================================================
   workout-plans/constants.js — the single home for every reusable
   constant in the Personalized Plans showcase. Nothing downstream
   hard-codes a selector, a magic number, a label, a prompt string
   or a coaching table: it lives here, so behaviour is tuned in ONE
   place. Control flow that used to branch (split selection, status
   text, constraint swaps) is expressed as DATA here, so a new case
   is a new entry, never a new branch.
   ============================================================ */

/* ---- DOM selectors (ids in workout-plans.html) ---- */
export const SEL = {
  form:           '#plan-form',
  generate:       '#generate',
  stop:           '#stop',
  resting:        '#resting',
  plan:           '#plan',
  reasonWrap:     '#reasoning-wrap',
  reasonBody:     '#reasoning-body',
  reasonLabel:    '#reasoning-label',
  reasonToggle:   '#reasoning-toggle',
  aiStatus:       '#ai-status',
  aiStatusLabel:  '#ai-status-label',
  backendNote:    '#backend-note',
  year:           '#year',
  // form fields (also written by demo mode)
  goal:           '#goal',
  days:           '#days',
  minutes:        '#minutes',
  level:          '#level',
  equipment:      '#equipment',
  constraints:    '#constraints',
};

/* ---- the model call: provider/model selection + sampling ---- */
export const MODEL = {
  reasoningProvider: 'nvidia',                       // preferred reasoning upstream on the relay
  reasoningModel:    'nvidia/nemotron-3-ultra-550b-a55b',
  temperature:       0.6,
  maxTokens:         2048,
};

/* ---- button copy: idle vs busy ---- */
export const BTN_TEXT = { idle: 'Reason out a plan', busy: 'Reasoning…' };

/* ---- composing placeholder shown while the model thinks ---- */
export const COMPOSING_TEXT = 'composing the block…';

/* ---- reasoning-stream header label, per detected mode (no if/else) ---- */
export const REASON_LABEL = {
  worker: 'Nemotron-3-Ultra · reasoning',
  ollama: 'Local model · reasoning',
  echo:   'Coach · reasoning',
};
export const REASON_LABEL_FALLBACK = 'Coach · reasoning';

/* ---- header status line: detected tier -> [short, long] (lazy: long
   reads AI_CONFIG for the live local-model name) ---- */
export const TIER_TEXT = {
  ollama: (cfg) => ['local', `Local model · ${cfg.ollama.defaultModel}`],
  worker: () => ['hosted', 'Hosted relay · Nemotron-3-Ultra (reasoning)'],
  echo:   () => ['offline', 'Offline · built-in coach, no network'],
};

export const BACKEND_NOTE = (long) =>
  `Backend: ${long}. Your inputs are sent only when you press the button; ` +
  `no keys ever touch the browser.`;

/* the note shown when the model answered but its JSON didn't parse
   (suppressed in echo mode, where the coach was always going to draw it) */
export const FALLBACK_NOTE =
  "Model output wasn't valid JSON, so the built-in coach drew the block instead.";

/* ============================================================
   prompt construction
   ============================================================ */
export const PLAN_SCHEMA = `{
  "summary": "one sentence framing the block",
  "split": [
    { "day": "Mon", "focus": "Upper · Push", "minutes": 45,
      "exercises": [ { "name": "Bench Press", "sets": 4, "reps": "5", "rpe": "8", "note": "short cue" } ] }
  ],
  "progression": "how to add load week to week",
  "deload": "when and how to back off",
  "caveats": ["how injuries / constraints were handled"]
}`;

export const SYSTEM_PROMPT = (i) =>
  'You are an elite strength & conditioning coach. The user gives real-life constraints. ' +
  'First, think step by step about the trade-offs out loud — the platform streams your reasoning ' +
  'to the user, so make it concise and genuinely useful. ' +
  'THEN output ONLY a single JSON object (no markdown fences, no prose around it) that matches ' +
  'this schema exactly:\n' + PLAN_SCHEMA + '\n' +
  'Rules: exactly ' + i.days + ' training days. Keep each session within ' + i.minutes +
  ' minutes (compounds first, fewer exercises if time is tight). Match rep ranges and intensity ' +
  'to the goal and experience level. If the user lists an injury or constraint, swap any ' +
  'contraindicated lift and explain the swap in caveats. Keep every note under 12 words.';

export const USER_PROMPT = (i) =>
  `Goal: ${i.goal}. Days/week: ${i.days}. Session length: ${i.minutes} min. ` +
  `Experience: ${i.level}. Equipment: ${i.equipment}. ` +
  (i.constraints ? `Constraints/injuries: ${i.constraints}.` : 'No injuries reported.');

/* ============================================================
   the local coach — deterministic coaching tables. Source of
   truth for echo mode AND the parse-failure fallback.
   ============================================================ */

/* goal/equipment -> human label (used in the meta row + summary) */
export const GOAL_LABEL  = { strength:'strength', hypertrophy:'muscle', fatloss:'fat loss', endurance:'endurance', general:'general health' };
export const EQUIP_LABEL = { gym:'full gym', dumbbells:'dumbbells', bodyweight:'bodyweight' };

/* goal -> dosing (sets / rep range / RPE) */
export const DOSE = {
  strength:    { sets: 5, reps: '3-5',   rpe: '8' },
  hypertrophy: { sets: 4, reps: '8-12',  rpe: '8' },
  fatloss:     { sets: 3, reps: '10-15', rpe: '7' },
  endurance:   { sets: 3, reps: '15-20', rpe: '7' },
  general:     { sets: 3, reps: '8-12',  rpe: '7' },
};
export const DOSE_FALLBACK = DOSE.general;

/* equipment -> movement pool keyed by training pattern */
export const POOL = {
  gym: {
    push: ['Barbell Bench Press','Overhead Press','Incline DB Press','Cable Fly','Triceps Pushdown'],
    pull: ['Barbell Row','Pull-Up','Seated Cable Row','Face Pull','Biceps Curl'],
    legs: ['Back Squat','Romanian Deadlift','Leg Press','Lying Leg Curl','Standing Calf Raise'],
    upper:['Barbell Bench Press','Barbell Row','Overhead Press','Pull-Up','Lateral Raise'],
    lower:['Back Squat','Romanian Deadlift','Leg Press','Lying Leg Curl','Standing Calf Raise'],
    full: ['Back Squat','Barbell Bench Press','Barbell Row','Overhead Press','Plank'],
  },
  dumbbells: {
    push: ['DB Bench Press','DB Shoulder Press','Incline DB Press','DB Lateral Raise','DB Skull Crusher'],
    pull: ['DB Row','DB Pullover','Chest-Supported DB Row','DB Rear Fly','DB Hammer Curl'],
    legs: ['DB Goblet Squat','DB Romanian Deadlift','DB Walking Lunge','DB Step-Up','DB Calf Raise'],
    upper:['DB Bench Press','DB Row','DB Shoulder Press','DB Curl','DB Lateral Raise'],
    lower:['DB Goblet Squat','DB Romanian Deadlift','DB Reverse Lunge','DB Step-Up','DB Calf Raise'],
    full: ['DB Goblet Squat','DB Bench Press','DB Row','DB Shoulder Press','DB Romanian Deadlift'],
  },
  bodyweight: {
    push: ['Push-Up','Pike Push-Up','Bench Dip','Diamond Push-Up','Decline Push-Up'],
    pull: ['Inverted Row','Chin-Up','Towel Row','Doorframe Row','Superman Hold'],
    legs: ['Bodyweight Squat','Bulgarian Split Squat','Single-Leg RDL','Glute Bridge','Calf Raise'],
    upper:['Push-Up','Inverted Row','Pike Push-Up','Chin-Up','Plank'],
    lower:['Bodyweight Squat','Bulgarian Split Squat','Glute Bridge','Single-Leg RDL','Calf Raise'],
    full: ['Bodyweight Squat','Push-Up','Inverted Row','Glute Bridge','Plank'],
  },
};

export const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/* ---- split selection as DATA: days -> rule. Each rule is either a
   fixed [pattern,label] list, or a {byLevel} branch resolved by a
   small lookup. SPLIT_DEFAULT covers 6+ days. (Replaces the old
   if/else ladder in chooseSplit.) ---- */
export const SPLIT_RULES = {
  2: { fixed: [['full','Full Body A'], ['full','Full Body B']] },
  3: {
    byLevel: {
      beginner: [['full','Full Body A'], ['full','Full Body B'], ['full','Full Body C']],
    },
    default: [['push','Push'], ['pull','Pull'], ['legs','Legs']],
  },
  4: { fixed: [['upper','Upper'], ['lower','Lower'], ['upper','Upper'], ['lower','Lower']] },
  5: { fixed: [['push','Push'], ['pull','Pull'], ['legs','Legs'], ['upper','Upper'], ['lower','Lower']] },
};
export const SPLIT_DEFAULT = [['push','Push'], ['pull','Pull'], ['legs','Legs'], ['push','Push'], ['pull','Pull'], ['legs','Legs']];

/* ---- exercise count: minutes -> movements/session, as ascending
   thresholds (first matching cap wins; else the overflow value) ---- */
export const EXERCISE_COUNT = { thresholds: [[30, 3], [45, 4], [60, 5]], overflow: 6 };

/* ---- constraint handling as DATA: each rule = a matcher + the lifts
   it bans + the caveat it adds. constraintSwaps just iterates these
   instead of an if-ladder, so a new injury is a new entry. ---- */
export const CONSTRAINT_RULES = [
  {
    test: /knee/,
    ban: ['Back Squat','Leg Press','DB Walking Lunge','Bulgarian Split Squat','DB Reverse Lunge','DB Step-Up','Bodyweight Squat','DB Goblet Squat'],
    caveat: 'Knee: squats/lunges swapped for hip-hinge and box-height work; keep depth pain-free.',
  },
  {
    test: /(shoulder|rotator)/,
    ban: ['Overhead Press','DB Shoulder Press','Pike Push-Up','Barbell Bench Press'],
    caveat: 'Shoulder: overhead pressing dropped for neutral-grip and incline work.',
  },
  {
    test: /(low ?back|lumbar|herniat|disc|back)/,
    ban: ['Romanian Deadlift','Barbell Row','DB Romanian Deadlift','Back Squat'],
    caveat: 'Back: spinal-loading lifts swapped for supported and machine variants.',
  },
  {
    test: /wrist/,
    ban: ['Push-Up','Diamond Push-Up','Decline Push-Up','Plank'],
    caveat: 'Wrist: floor pressing on handles/dumbbells to keep wrists neutral.',
  },
];

/* ---- progression copy: goal === 'strength' vs everything else ---- */
export const PROGRESSION = {
  strength: 'Add 2.5-5 kg to the top set whenever you hit the top of the rep range at the target RPE.',
  default:  'Add a rep each week; once you clear the top of the range on every set, add load and reset.',
};

export const DELOAD_TEXT  = 'Every 4th-6th week, cut sets ~40% and drop one RPE to let fatigue clear.';
export const BASE_CAVEAT  = 'Warm up 5-10 min; stop anything that pinches a joint.';
export const PRIMARY_NOTE = 'Primary lift — leave 1-2 reps in reserve.';

/* ---- demo mode (instant, deterministic, for screenshots) ---- */
export const DEMO_INPUTS = {
  goal: 'strength', days: 4, minutes: 60, level: 'intermediate', equipment: 'gym', constraints: 'dodgy left knee',
};
export const DEMO_PARAM = 'demo';
