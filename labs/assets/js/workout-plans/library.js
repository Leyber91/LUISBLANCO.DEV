/* ============================================================
   workout-plans/library.js — the exercise library and its
   substitution graph. Data only: no logic, no DOM.

   Each exercise is a node. `subs` are directed edges to the
   nearest alternatives for the same movement pattern, ordered by
   similarity. The planner walks these edges breadth-first from a
   template's first choice until it finds a node that the
   visitor's equipment and injury flags allow, and keeps the path
   so the page can show why each hop happened.

   Attributes the constraint predicates read:
     equip     items the exercise needs (see EQUIPMENT in constants)
     knee      'deep'    loaded knee flexion past ~90 degrees
               'partial' loaded flexion kept above parallel
               'none'    no loaded knee flexion
     spine     'high' | 'mod' | 'low'  axial / shear load on the low back
     shoulder  'high' overhead or end-range loaded shoulder, else 'mod'
     wrist     true when the wrist bears load in full extension
     impact    true for running or jumping
   Muscles: p = primary (counted 1 set), s = secondary (0.5 set).

   The attribute values are coaching judgement, tagged
   [ILLUSTRATIVE] on the page. The knee rule follows Escamilla
   2001 (patellofemoral and tibiofemoral forces rise with knee
   flexion and peak near full flexion).
   ============================================================ */

export const MUSCLES = [
  // id, label, view: 'front' | 'back' | 'both'
  { id: 'chest',      label: 'chest',        view: 'front' },
  { id: 'frontDelt',  label: 'front delts',  view: 'front' },
  { id: 'sideDelt',   label: 'side delts',   view: 'both' },
  { id: 'rearDelt',   label: 'rear delts',   view: 'back' },
  { id: 'biceps',     label: 'biceps',       view: 'front' },
  { id: 'triceps',    label: 'triceps',      view: 'back' },
  { id: 'forearms',   label: 'forearms',     view: 'both' },
  { id: 'abs',        label: 'abs',          view: 'front' },
  { id: 'obliques',   label: 'obliques',     view: 'front' },
  { id: 'upperBack',  label: 'upper back',   view: 'back' },
  { id: 'lats',       label: 'lats',         view: 'back' },
  { id: 'lowerBack',  label: 'lower back',   view: 'back' },
  { id: 'glutes',     label: 'glutes',       view: 'back' },
  { id: 'quads',      label: 'quads',        view: 'front' },
  { id: 'adductors',  label: 'adductors',    view: 'front' },
  { id: 'hamstrings', label: 'hamstrings',   view: 'back' },
  { id: 'calves',     label: 'calves',       view: 'both' },
];

export const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.id, m.label]));

/* movement patterns a session template asks for */
export const PATTERNS = {
  squat:     'knee-dominant squat',
  hinge:     'hip hinge',
  lunge:     'single-leg',
  kneeflex:  'hamstring curl',
  calf:      'calf',
  hpush:     'horizontal push',
  vpush:     'vertical push',
  hpull:     'horizontal pull',
  vpull:     'vertical pull',
  elbowflex: 'elbow flexion',
  elbowext:  'elbow extension',
  latraise:  'lateral raise',
  reardelt:  'rear delt',
  core:      'trunk',
  cardio:    'aerobic',
};

const X = (id, name, pattern, equip, m, attrs, subs) => ({
  id, name, pattern, equip,
  p: m.p, s: m.s || [],
  knee: attrs.knee || 'none', spine: attrs.spine || 'low', shoulder: attrs.shoulder || 'mod',
  wrist: !!attrs.wrist, impact: !!attrs.impact, compound: !!attrs.compound,
  subs,
});

export const EXERCISES = [
  /* ---- squat ---- */
  X('back_squat', 'Back squat', 'squat', ['barbell', 'rack'], { p: ['quads', 'glutes'], s: ['adductors', 'lowerBack'] },
    { knee: 'deep', spine: 'high', compound: true }, ['box_squat_bb', 'goblet_squat', 'leg_press']),
  X('box_squat_bb', 'Box squat, above parallel', 'squat', ['barbell', 'rack', 'bench'], { p: ['quads', 'glutes'], s: ['adductors', 'lowerBack'] },
    { knee: 'partial', spine: 'high', compound: true }, ['goblet_box_squat', 'leg_press_partial']),
  X('goblet_squat', 'Goblet squat', 'squat', ['dumbbell'], { p: ['quads', 'glutes'], s: ['adductors', 'abs'] },
    { knee: 'deep', spine: 'mod', compound: true }, ['goblet_box_squat', 'bw_squat']),
  X('goblet_box_squat', 'Goblet box squat, above parallel', 'squat', ['dumbbell', 'bench'], { p: ['quads', 'glutes'], s: ['adductors'] },
    { knee: 'partial', spine: 'mod', compound: true }, ['bw_box_squat']),
  X('leg_press', 'Leg press', 'squat', ['machine'], { p: ['quads', 'glutes'], s: ['adductors'] },
    { knee: 'deep', spine: 'low', compound: true }, ['leg_press_partial', 'goblet_squat']),
  X('leg_press_partial', 'Leg press, partial range', 'squat', ['machine'], { p: ['quads', 'glutes'] },
    { knee: 'partial', spine: 'low', compound: true }, ['goblet_box_squat']),
  X('bw_squat', 'Bodyweight squat', 'squat', [], { p: ['quads', 'glutes'] },
    { knee: 'deep', compound: true }, ['bw_box_squat', 'split_squat_bw']),
  X('bw_box_squat', 'Squat to a chair, above parallel', 'squat', [], { p: ['quads', 'glutes'] },
    { knee: 'partial', compound: true }, ['glute_bridge']),

  /* ---- hinge ---- */
  X('rdl', 'Romanian deadlift', 'hinge', ['barbell'], { p: ['hamstrings', 'glutes'], s: ['lowerBack', 'forearms'] },
    { spine: 'high', compound: true }, ['db_rdl', 'hip_thrust_bb', 'back_extension']),
  X('db_rdl', 'Dumbbell Romanian deadlift', 'hinge', ['dumbbell'], { p: ['hamstrings', 'glutes'], s: ['lowerBack', 'forearms'] },
    { spine: 'mod', compound: true }, ['hip_thrust_db', 'sl_rdl_bw']),
  X('hip_thrust_bb', 'Barbell hip thrust', 'hinge', ['barbell', 'bench'], { p: ['glutes'], s: ['hamstrings'] },
    { compound: true }, ['hip_thrust_db', 'glute_bridge']),
  X('hip_thrust_db', 'Dumbbell hip thrust', 'hinge', ['dumbbell', 'bench'], { p: ['glutes'], s: ['hamstrings'] },
    { compound: true }, ['glute_bridge']),
  X('back_extension', '45-degree back extension', 'hinge', ['machine'], { p: ['lowerBack', 'glutes'], s: ['hamstrings'] },
    { spine: 'mod' }, ['hip_thrust_bb']),
  X('sl_rdl_bw', 'Single-leg Romanian deadlift', 'hinge', [], { p: ['hamstrings', 'glutes'] },
    {}, ['glute_bridge']),
  X('glute_bridge', 'Glute bridge', 'hinge', [], { p: ['glutes'], s: ['hamstrings'] },
    {}, []),

  /* ---- single-leg ---- */
  X('bss_db', 'Bulgarian split squat', 'lunge', ['dumbbell', 'bench'], { p: ['quads', 'glutes'], s: ['adductors'] },
    { knee: 'deep', spine: 'mod', compound: true }, ['split_squat_db', 'step_up_low_db', 'hip_thrust_db']),
  X('split_squat_db', 'Dumbbell split squat', 'lunge', ['dumbbell'], { p: ['quads', 'glutes'], s: ['adductors'] },
    { knee: 'deep', spine: 'mod', compound: true }, ['step_up_low_db', 'split_squat_bw']),
  X('step_up_low_db', 'Low-box step-up', 'lunge', ['dumbbell', 'bench'], { p: ['quads', 'glutes'] },
    { knee: 'partial', spine: 'mod', compound: true }, ['step_up_low_bw']),
  X('split_squat_bw', 'Split squat', 'lunge', [], { p: ['quads', 'glutes'] },
    { knee: 'deep', compound: true }, ['step_up_low_bw', 'glute_bridge']),
  X('step_up_low_bw', 'Low step-up', 'lunge', [], { p: ['quads', 'glutes'] },
    { knee: 'partial', compound: true }, ['glute_bridge']),

  /* ---- hamstring curl ---- */
  X('leg_curl', 'Lying leg curl', 'kneeflex', ['machine'], { p: ['hamstrings'], s: ['calves'] },
    {}, ['db_leg_curl', 'slider_curl']),
  X('db_leg_curl', 'Dumbbell leg curl', 'kneeflex', ['dumbbell', 'bench'], { p: ['hamstrings'] },
    {}, ['slider_curl']),
  X('slider_curl', 'Sliding leg curl on a towel', 'kneeflex', [], { p: ['hamstrings'], s: ['glutes'] },
    {}, ['sl_rdl_bw']),

  /* ---- calf ---- */
  X('calf_machine', 'Standing calf raise', 'calf', ['machine'], { p: ['calves'] }, {}, ['calf_db']),
  X('calf_db', 'Dumbbell calf raise', 'calf', ['dumbbell'], { p: ['calves'] }, {}, ['calf_bw']),
  X('calf_bw', 'Single-leg calf raise', 'calf', [], { p: ['calves'] }, {}, []),

  /* ---- horizontal push ---- */
  X('bench_press', 'Barbell bench press', 'hpush', ['barbell', 'bench', 'rack'], { p: ['chest'], s: ['triceps', 'frontDelt'] },
    { compound: true }, ['db_bench', 'machine_press', 'pushup']),
  X('db_bench', 'Dumbbell bench press', 'hpush', ['dumbbell', 'bench'], { p: ['chest'], s: ['triceps', 'frontDelt'] },
    { compound: true }, ['pushup', 'pushup_neutral']),
  X('incline_db', 'Incline dumbbell press', 'hpush', ['dumbbell', 'bench'], { p: ['chest', 'frontDelt'], s: ['triceps'] },
    { compound: true }, ['db_bench', 'pushup']),
  X('machine_press', 'Machine chest press', 'hpush', ['machine'], { p: ['chest'], s: ['triceps', 'frontDelt'] },
    { compound: true }, ['db_bench']),
  X('pushup', 'Push-up', 'hpush', [], { p: ['chest'], s: ['triceps', 'frontDelt', 'abs'] },
    { wrist: true, compound: true }, ['pushup_neutral']),
  X('pushup_neutral', 'Push-up on fists or handles', 'hpush', [], { p: ['chest'], s: ['triceps', 'frontDelt'] },
    { compound: true }, []),

  /* ---- vertical push ---- */
  X('ohp', 'Standing overhead press', 'vpush', ['barbell', 'rack'], { p: ['frontDelt'], s: ['triceps', 'sideDelt'] },
    { shoulder: 'high', spine: 'mod', compound: true }, ['db_shoulder_press', 'landmine_press']),
  X('db_shoulder_press', 'Seated dumbbell shoulder press', 'vpush', ['dumbbell', 'bench'], { p: ['frontDelt'], s: ['triceps', 'sideDelt'] },
    { shoulder: 'high', compound: true }, ['landmine_press', 'incline_db', 'pike_pushup']),
  X('landmine_press', 'Half-kneeling landmine press', 'vpush', ['barbell'], { p: ['frontDelt'], s: ['chest', 'triceps'] },
    { compound: true }, ['incline_db']),
  X('pike_pushup', 'Pike push-up', 'vpush', [], { p: ['frontDelt'], s: ['triceps'] },
    { shoulder: 'high', wrist: true, compound: true }, ['pushup_neutral']),

  /* ---- horizontal pull ---- */
  X('bb_row', 'Barbell bent-over row', 'hpull', ['barbell'], { p: ['upperBack', 'lats'], s: ['biceps', 'rearDelt', 'lowerBack'] },
    { spine: 'high', compound: true }, ['cable_row', 'cs_db_row']),
  X('cable_row', 'Seated cable row', 'hpull', ['cable'], { p: ['upperBack', 'lats'], s: ['biceps', 'rearDelt'] },
    { compound: true }, ['cs_db_row']),
  X('cs_db_row', 'Chest-supported dumbbell row', 'hpull', ['dumbbell', 'bench'], { p: ['upperBack', 'lats'], s: ['biceps', 'rearDelt'] },
    { compound: true }, ['db_row', 'inverted_row']),
  X('db_row', 'One-arm dumbbell row', 'hpull', ['dumbbell', 'bench'], { p: ['lats', 'upperBack'], s: ['biceps'] },
    { compound: true }, ['inverted_row']),
  X('inverted_row', 'Inverted row under a table', 'hpull', [], { p: ['upperBack', 'lats'], s: ['biceps', 'rearDelt'] },
    { compound: true }, ['towel_row']),
  X('towel_row', 'Door-frame towel row', 'hpull', [], { p: ['upperBack'], s: ['biceps'] },
    {}, []),

  /* ---- vertical pull ---- */
  X('pullup', 'Pull-up', 'vpull', ['bar'], { p: ['lats'], s: ['biceps', 'upperBack'] },
    { compound: true }, ['lat_pulldown', 'db_pullover', 'inverted_row_wide']),
  X('lat_pulldown', 'Lat pulldown', 'vpull', ['cable'], { p: ['lats'], s: ['biceps', 'upperBack'] },
    { compound: true }, ['db_pullover']),
  X('db_pullover', 'Dumbbell pullover', 'vpull', ['dumbbell', 'bench'], { p: ['lats'], s: ['chest', 'triceps'] },
    { shoulder: 'high' }, ['db_row', 'inverted_row_wide']),
  X('inverted_row_wide', 'Wide-grip inverted row', 'vpull', [], { p: ['lats', 'upperBack'], s: ['biceps'] },
    { compound: true }, ['towel_row']),

  /* ---- arms, delts, trunk ---- */
  X('bb_curl', 'Barbell curl', 'elbowflex', ['barbell'], { p: ['biceps'], s: ['forearms'] }, {}, ['db_curl']),
  X('db_curl', 'Dumbbell curl', 'elbowflex', ['dumbbell'], { p: ['biceps'], s: ['forearms'] }, {}, ['backpack_curl']),
  X('backpack_curl', 'Backpack curl', 'elbowflex', [], { p: ['biceps'], s: ['forearms'] }, {}, []),
  X('pushdown', 'Cable triceps pushdown', 'elbowext', ['cable'], { p: ['triceps'] }, {}, ['db_skull']),
  X('db_skull', 'Dumbbell skull crusher', 'elbowext', ['dumbbell', 'bench'], { p: ['triceps'] }, {}, ['close_pushup']),
  X('close_pushup', 'Close-grip push-up', 'elbowext', [], { p: ['triceps'], s: ['chest'] }, { wrist: true }, ['bench_dip']),
  X('bench_dip', 'Bench dip', 'elbowext', [], { p: ['triceps'] }, { shoulder: 'high', wrist: true }, []),
  X('cable_lateral', 'Cable lateral raise', 'latraise', ['cable'], { p: ['sideDelt'] }, {}, ['db_lateral']),
  X('db_lateral', 'Dumbbell lateral raise', 'latraise', ['dumbbell'], { p: ['sideDelt'] }, {}, ['y_raise']),
  X('y_raise', 'Prone Y-raise', 'latraise', [], { p: ['sideDelt'], s: ['upperBack'] }, {}, []),
  X('face_pull', 'Cable face pull', 'reardelt', ['cable'], { p: ['rearDelt'], s: ['upperBack'] }, {}, ['db_rear_fly']),
  X('db_rear_fly', 'Dumbbell rear-delt fly', 'reardelt', ['dumbbell'], { p: ['rearDelt'], s: ['upperBack'] }, {}, ['prone_t']),
  X('prone_t', 'Prone T-raise', 'reardelt', [], { p: ['rearDelt', 'upperBack'] }, {}, []),
  X('plank', 'Forearm plank', 'core', [], { p: ['abs'], s: ['obliques'] }, {}, ['dead_bug']),
  X('pallof', 'Pallof press', 'core', ['cable'], { p: ['obliques'], s: ['abs'] }, {}, ['side_plank']),
  X('side_plank', 'Side plank', 'core', [], { p: ['obliques'], s: ['abs'] }, {}, ['dead_bug']),
  X('dead_bug', 'Dead bug', 'core', [], { p: ['abs'] }, {}, []),

  /* ---- aerobic modalities (no equipment constraint; access assumed) ---- */
  X('run', 'Run', 'cardio', [], { p: [] }, { impact: true }, ['bike', 'walk']),
  X('bike', 'Ride (bike or trainer)', 'cardio', [], { p: [] }, {}, ['swim']),
  X('swim', 'Swim', 'cardio', [], { p: [] }, {}, []),
  X('walk', 'Brisk walk', 'cardio', [], { p: [] }, {}, ['bike']),
];

/* each curated node's entry in free-exercise-db (Unlicense; data/free-exercise-db.json),
   where one exists. A trailing '~' marks a close variant rather than the same lift. */
export const FEDB = {
  back_squat: 'Barbell_Squat', box_squat_bb: 'Box_Squat', goblet_squat: 'Goblet_Squat', goblet_box_squat: 'Dumbbell_Squat_To_A_Bench~',
  leg_press: 'Leg_Press', leg_press_partial: 'Leg_Press~', bw_squat: 'Bodyweight_Squat', rdl: 'Romanian_Deadlift',
  db_rdl: 'Stiff-Legged_Dumbbell_Deadlift~', hip_thrust_bb: 'Barbell_Hip_Thrust', hip_thrust_db: 'Barbell_Hip_Thrust~',
  back_extension: 'Hyperextensions_Back_Extensions', glute_bridge: 'Single_Leg_Glute_Bridge~', bss_db: 'Split_Squat_with_Dumbbells~',
  split_squat_db: 'Split_Squat_with_Dumbbells', step_up_low_db: 'Dumbbell_Step_Ups~', split_squat_bw: 'Split_Squats',
  step_up_low_bw: 'Step-up_with_Knee_Raise~', leg_curl: 'Lying_Leg_Curls', slider_curl: 'Ball_Leg_Curl~', calf_machine: 'Standing_Calf_Raises',
  calf_db: 'Standing_Dumbbell_Calf_Raise', bench_press: 'Barbell_Bench_Press_-_Medium_Grip', db_bench: 'Dumbbell_Bench_Press',
  incline_db: 'Incline_Dumbbell_Press', machine_press: 'Machine_Bench_Press', pushup: 'Pushups', pushup_neutral: 'Pushups~',
  ohp: 'Standing_Military_Press', db_shoulder_press: 'Dumbbell_Shoulder_Press', bb_row: 'Bent_Over_Barbell_Row',
  cable_row: 'Seated_Cable_Rows', cs_db_row: 'Dumbbell_Incline_Row', db_row: 'One-Arm_Dumbbell_Row', inverted_row: 'Inverted_Row',
  pullup: 'Pullups', lat_pulldown: 'Wide-Grip_Lat_Pulldown', db_pullover: 'Bent-Arm_Dumbbell_Pullover', inverted_row_wide: 'Inverted_Row~',
  bb_curl: 'Barbell_Curl', db_curl: 'Dumbbell_Bicep_Curl', pushdown: 'Triceps_Pushdown', db_skull: 'Lying_Dumbbell_Tricep_Extension',
  close_pushup: 'Push-Ups_-_Close_Triceps_Position', bench_dip: 'Bench_Dips', cable_lateral: 'Cable_Seated_Lateral_Raise~',
  db_lateral: 'Side_Lateral_Raise', face_pull: 'Face_Pull', db_rear_fly: 'Reverse_Flyes', plank: 'Plank', pallof: 'Pallof_Press',
  side_plank: 'Side_Bridge', dead_bug: 'Dead_Bug', run: 'Running_Treadmill~', bike: 'Bicycling', walk: 'Walking_Treadmill~',
};

export const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

/* nodes the open library adds at runtime (swap edits); the planner reads them through EX */
export function registerNodes(nodes) { for (const n of nodes) EX[n.id] = n; }

/* why an edge a -> b exists: computed from the two nodes' attributes, so every edge can be audited */
const KNEE_RANK = { none: 0, partial: 1, deep: 2 };
const SPINE_RANK = { low: 0, mod: 1, high: 2 };
const KIT_WORD = { barbell: 'barbell', rack: 'rack', dumbbell: 'dumbbells', machine: 'machine', cable: 'cable', bench: 'bench', bar: 'pull-up bar', kettlebell: 'kettlebell', bands: 'bands' };
export function edgeReason(aId, bId) {
  const a = EX[aId], b = EX[bId];
  if (!a || !b) return '';
  const parts = [];
  const shared = a.p.filter((m) => b.p.includes(m)).map((m) => MUSCLE_LABEL[m]);
  parts.push(a.pattern === b.pattern ? `same pattern${shared.length ? ', shares ' + shared.join(' and ') : ''}` : `${PATTERNS[b.pattern]} instead${shared.length ? ', shares ' + shared.join(' and ') : ''}`);
  if (KNEE_RANK[b.knee] < KNEE_RANK[a.knee]) parts.push('less knee flexion');
  if (SPINE_RANK[b.spine] < SPINE_RANK[a.spine]) parts.push('less spinal load');
  if (a.shoulder === 'high' && b.shoulder !== 'high') parts.push('less shoulder load');
  if (a.wrist && !b.wrist) parts.push('neutral wrist');
  if (a.impact && !b.impact) parts.push('no impact');
  const drop = a.equip.filter((k) => !b.equip.includes(k)), add = b.equip.filter((k) => !a.equip.includes(k));
  if (drop.length || add.length) parts.push(add.length ? `uses ${add.map((k) => KIT_WORD[k] || k).join(' and ')}${drop.length ? ' instead of ' + drop.map((k) => KIT_WORD[k] || k).join(' and ') : ''}` : `no ${drop.map((k) => KIT_WORD[k] || k).join(' or ')} needed`);
  return parts.join('; ');
}
