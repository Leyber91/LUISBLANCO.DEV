/* ============================================================
   Personalized Plans — showcase logic.

   A reasoning model thinks through the user's constraints out
   loud (streamed), then commits to a structured training block.
   Wired to the shared tiered backend (ollama -> worker -> echo)
   so it works live with a local model, live via the hosted
   Nemotron relay, or fully offline against a built-in coach.

   The model is asked for ONE JSON object matching PLAN_SCHEMA;
   we stream its reasoning, accumulate the answer, parse on done,
   and render a real weekly grid. If parsing fails (or we're
   offline), the deterministic local coach produces the same
   shape so the experience never degrades to a dead box.
   ============================================================ */

import { AIProvider } from '../ai/provider.js';
import { AI_CONFIG } from '../ai/config.js';

/* ---------- tiny dom helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* ---------- refs ---------- */
const form        = $('#plan-form');
const genBtn      = $('#generate');
const stopBtn     = $('#stop');
const resting     = $('#resting');
const planEl      = $('#plan');
const reasonWrap  = $('#reasoning-wrap');
const reasonBody  = $('#reasoning-body');
const reasonLabel = $('#reasoning-label');
const reasonTog   = $('#reasoning-toggle');
const statusEl    = $('#ai-status');
const statusLabel = $('#ai-status-label');
const backendNote = $('#backend-note');

/* ---------- state ---------- */
const ai = new AIProvider();
let controller = null;

/* status label per backend tier */
const TIER_TEXT = {
  ollama: () => ['local', `Local model · ${AI_CONFIG.ollama.defaultModel}`],
  worker: () => ['hosted', 'Hosted relay · Nemotron-3-Ultra (reasoning)'],
  echo:   () => ['offline', 'Offline · built-in coach, no network'],
};

function paintStatus(mode) {
  const [short, long] = (TIER_TEXT[mode] || TIER_TEXT.echo)();
  statusEl.dataset.mode = mode;
  statusLabel.textContent = short;
  backendNote.textContent =
    `Backend: ${long}. Your inputs are sent only when you press the button; ` +
    `no keys ever touch the browser.`;
}

/* ============================================================
   submit -> generate
   ============================================================ */
function onSubmit(e) {
  e.preventDefault();
  const inputs = readInputs();
  generate(inputs);
}

function readInputs() {
  const f = new FormData(form);
  return {
    goal:        String(f.get('goal')),
    days:        Number(f.get('days')),
    minutes:     Number(f.get('minutes')),
    level:       String(f.get('level')),
    equipment:   String(f.get('equipment')),
    constraints: String(f.get('constraints') || '').trim(),
  };
}

async function generate(inputs) {
  controller?.abort();
  controller = new AbortController();

  // reset UI into "working" state
  resting.hidden = true;
  planEl.innerHTML = '';
  reasonBody.textContent = '';
  reasonWrap.hidden = false;
  reasonWrap.dataset.active = 'true';
  reasonTog.setAttribute('aria-expanded', 'true');
  reasonLabel.textContent =
    ai.mode === 'worker' ? 'Nemotron-3-Ultra · reasoning'
    : ai.mode === 'ollama' ? 'Local model · reasoning'
    : 'Coach · reasoning';
  setBusy(true);

  const composing = el('div', 'composing');
  composing.append(el('span', 'blip'), el('span', null, 'composing the block…'));
  planEl.append(composing);

  let answer = '';
  let gotReasoning = false;

  try {
    await ai.chat({
      provider: AI_CONFIG.worker.defaultProvider === 'groq' ? 'nvidia' : undefined, // prefer the reasoning model on the relay
      model: ai.mode === 'worker' ? 'nvidia/nemotron-3-ultra-550b-a55b' : undefined,
      messages: buildMessages(inputs),
      temperature: 0.6,
      maxTokens: 2048,
      signal: controller.signal,
      echo: buildEcho(inputs),
      onReasoning: (t) => {
        gotReasoning = true;
        reasonBody.textContent += t;
        reasonBody.scrollTop = reasonBody.scrollHeight;
      },
      onToken: (t) => { answer += t; },
      onDone: () => {},
    });
  } catch (err) {
    if (err?.name === 'AbortError') { /* user stopped */ }
    else console.warn('[plan] chat failed:', err);
  }

  reasonWrap.dataset.active = 'false';
  if (!gotReasoning) { reasonWrap.hidden = true; }

  // turn the model's answer into a plan; fall back to the local coach
  let plan = extractPlan(answer);
  let note = null;
  if (!plan) {
    plan = buildLocalPlan(inputs);
    note = ai.mode === 'echo'
      ? null
      : "Model output wasn't valid JSON, so the built-in coach drew the block instead.";
  }
  renderPlan(plan, inputs, note);
  setBusy(false);
}

function setBusy(busy) {
  genBtn.disabled = busy;
  genBtn.querySelector('span').textContent = busy ? 'Reasoning…' : 'Reason out a plan';
  stopBtn.hidden = !busy;
}

/* ============================================================
   prompt construction
   ============================================================ */
const PLAN_SCHEMA = `{
  "summary": "one sentence framing the block",
  "split": [
    { "day": "Mon", "focus": "Upper · Push", "minutes": 45,
      "exercises": [ { "name": "Bench Press", "sets": 4, "reps": "5", "rpe": "8", "note": "short cue" } ] }
  ],
  "progression": "how to add load week to week",
  "deload": "when and how to back off",
  "caveats": ["how injuries / constraints were handled"]
}`;

function buildMessages(i) {
  const sys =
    'You are an elite strength & conditioning coach. The user gives real-life constraints. ' +
    'First, think step by step about the trade-offs out loud — the platform streams your reasoning ' +
    'to the user, so make it concise and genuinely useful. ' +
    'THEN output ONLY a single JSON object (no markdown fences, no prose around it) that matches ' +
    'this schema exactly:\n' + PLAN_SCHEMA + '\n' +
    'Rules: exactly ' + i.days + ' training days. Keep each session within ' + i.minutes +
    ' minutes (compounds first, fewer exercises if time is tight). Match rep ranges and intensity ' +
    'to the goal and experience level. If the user lists an injury or constraint, swap any ' +
    'contraindicated lift and explain the swap in caveats. Keep every note under 12 words.';

  const usr =
    `Goal: ${i.goal}. Days/week: ${i.days}. Session length: ${i.minutes} min. ` +
    `Experience: ${i.level}. Equipment: ${i.equipment}. ` +
    (i.constraints ? `Constraints/injuries: ${i.constraints}.` : 'No injuries reported.');

  return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
}

/* echo: a believable reasoning script + the local plan as the "answer" */
function buildEcho(i) {
  return {
    thought: buildReasoningScript(i),
    speech: [JSON.stringify(buildLocalPlan(i))],
  };
}

/* ============================================================
   parse the model's JSON answer
   ============================================================ */
function extractPlan(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b === -1 || b <= a) return null;
  try {
    const obj = JSON.parse(s.slice(a, b + 1));
    if (!obj || !Array.isArray(obj.split) || !obj.split.length) return null;
    return obj;
  } catch { return null; }
}

/* ============================================================
   render
   ============================================================ */
function renderPlan(plan, inputs, note) {
  planEl.innerHTML = '';

  if (plan.summary) planEl.append(el('p', 'plan-summary', plan.summary));

  const meta = el('div', 'plan-meta');
  const tag = (label, val) => {
    const w = el('span'); w.append(document.createTextNode(label + ' '), el('b', null, val)); return w;
  };
  meta.append(
    tag('goal', GOAL_LABEL[inputs.goal] || inputs.goal),
    tag('days', String(inputs.days) + '/wk'),
    tag('session', inputs.minutes + ' min'),
    tag('level', inputs.level),
    tag('kit', EQUIP_LABEL[inputs.equipment] || inputs.equipment),
  );
  planEl.append(meta);

  for (const d of plan.split) {
    const day = el('div', 'day');
    const head = el('div', 'day-head');
    head.append(
      el('span', 'day-name', d.day || ''),
      el('span', 'day-focus', d.focus || ''),
      el('span', 'day-mins', (d.minutes || inputs.minutes) + ' min'),
    );
    day.append(head);
    for (const ex of (d.exercises || [])) {
      const row = el('div', 'ex');
      const top = el('div', 'ex-top');
      top.append(el('span', 'ex-name', ex.name || ''), el('span', 'ex-dose', dose(ex)));
      row.append(top);
      if (ex.note) row.append(el('span', 'ex-note', ex.note));
      day.append(row);
    }
    planEl.append(day);
  }

  const foot = el('div', 'plan-foot');
  if (plan.progression) foot.append(footBlock('Progression', plan.progression));
  if (plan.deload)      foot.append(footBlock('Deload', plan.deload));
  if (Array.isArray(plan.caveats) && plan.caveats.length) {
    const b = el('div', 'foot-block');
    b.append(el('span', 'k', 'Worked around'));
    const ul = el('ul', 'caveats');
    for (const c of plan.caveats) ul.append(el('li', null, c));
    b.append(ul);
    foot.append(b);
  }
  if (note) foot.append(footBlock('Note', note));
  planEl.append(foot);
}

function footBlock(k, v) {
  const b = el('div', 'foot-block');
  b.append(el('span', 'k', k), el('span', 'v', v));
  return b;
}

function dose(ex) {
  const sets = ex.sets != null ? ex.sets : '';
  const reps = ex.reps != null ? ex.reps : '';
  let s = sets && reps ? `${sets} × ${reps}` : (reps || sets || '');
  if (ex.rpe) s += ` · RPE ${ex.rpe}`;
  return s;
}

/* ============================================================
   the local coach — deterministic, genuinely personalized.
   Source of truth for echo mode AND the parse-failure fallback.
   ============================================================ */
const GOAL_LABEL  = { strength:'strength', hypertrophy:'muscle', fatloss:'fat loss', endurance:'endurance', general:'general health' };
const EQUIP_LABEL = { gym:'full gym', dumbbells:'dumbbells', bodyweight:'bodyweight' };

const DOSE = {
  strength:    { sets: 5, reps: '3-5',   rpe: '8' },
  hypertrophy: { sets: 4, reps: '8-12',  rpe: '8' },
  fatloss:     { sets: 3, reps: '10-15', rpe: '7' },
  endurance:   { sets: 3, reps: '15-20', rpe: '7' },
  general:     { sets: 3, reps: '8-12',  rpe: '7' },
};

const POOL = {
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

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function chooseSplit(days, level) {
  if (days <= 2) return [['full','Full Body A'], ['full','Full Body B']];
  if (days === 3) {
    return level === 'beginner'
      ? [['full','Full Body A'], ['full','Full Body B'], ['full','Full Body C']]
      : [['push','Push'], ['pull','Pull'], ['legs','Legs']];
  }
  if (days === 4) return [['upper','Upper'], ['lower','Lower'], ['upper','Upper'], ['lower','Lower']];
  if (days === 5) return [['push','Push'], ['pull','Pull'], ['legs','Legs'], ['upper','Upper'], ['lower','Lower']];
  return [['push','Push'], ['pull','Pull'], ['legs','Legs'], ['push','Push'], ['pull','Pull'], ['legs','Legs']];
}

function exerciseCount(minutes) {
  if (minutes <= 30) return 3;
  if (minutes <= 45) return 4;
  if (minutes <= 60) return 5;
  return 6;
}

function constraintSwaps(text) {
  const t = (text || '').toLowerCase();
  const caveats = [];
  const ban = [];
  if (/knee/.test(t))      { ban.push('Back Squat','Leg Press','DB Walking Lunge','Bulgarian Split Squat','DB Reverse Lunge','DB Step-Up','Bodyweight Squat','DB Goblet Squat'); caveats.push('Knee: squats/lunges swapped for hip-hinge and box-height work; keep depth pain-free.'); }
  if (/(shoulder|rotator)/.test(t)) { ban.push('Overhead Press','DB Shoulder Press','Pike Push-Up','Barbell Bench Press'); caveats.push('Shoulder: overhead pressing dropped for neutral-grip and incline work.'); }
  if (/(low ?back|lumbar|herniat|disc|back)/.test(t)) { ban.push('Romanian Deadlift','Barbell Row','DB Romanian Deadlift','Back Squat'); caveats.push('Back: spinal-loading lifts swapped for supported and machine variants.'); }
  if (/wrist/.test(t))     { ban.push('Push-Up','Diamond Push-Up','Decline Push-Up','Plank'); caveats.push('Wrist: floor pressing on handles/dumbbells to keep wrists neutral.'); }
  return { ban, caveats };
}

function buildLocalPlan(i) {
  const split = chooseSplit(i.days, i.level);
  let n = exerciseCount(i.minutes);
  if (i.level === 'beginner') n = Math.max(3, n - 1);
  const d = DOSE[i.goal] || DOSE.general;
  let sets = d.sets;
  if (i.level === 'beginner') sets = Math.max(2, sets - 1);
  if (i.level === 'advanced' && i.goal !== 'strength') sets += 1;

  const { ban, caveats } = constraintSwaps(i.constraints);
  const banSet = new Set(ban);

  const days = split.map(([key, focus], idx) => {
    let pool = POOL[i.equipment][key].filter((x) => !banSet.has(x));
    // top up from the full-body pool if swaps thinned it out
    if (pool.length < n) pool = pool.concat(POOL[i.equipment].full.filter((x) => !banSet.has(x) && !pool.includes(x)));
    const exercises = pool.slice(0, n).map((name, j) => ({
      name,
      sets: j === 0 ? sets : Math.max(2, sets - 1),   // top compound gets the full dose
      reps: d.reps,
      rpe: d.rpe,
      note: j === 0 ? 'Primary lift — leave 1-2 reps in reserve.' : '',
    }));
    return { day: DAY_NAMES[idx], focus, minutes: i.minutes, exercises };
  });

  const baseCaveats = ['Warm up 5-10 min; stop anything that pinches a joint.'];
  return {
    summary: `${cap(GOAL_LABEL[i.goal])} block — ${i.days} days a week on ${EQUIP_LABEL[i.equipment]}, sessions capped at ${i.minutes} minutes.`,
    split: days,
    progression: i.goal === 'strength'
      ? 'Add 2.5-5 kg to the top set whenever you hit the top of the rep range at the target RPE.'
      : 'Add a rep each week; once you clear the top of the range on every set, add load and reset.',
    deload: 'Every 4th-6th week, cut sets ~40% and drop one RPE to let fatigue clear.',
    caveats: caveats.concat(baseCaveats),
  };
}

function buildReasoningScript(i) {
  const splitName = chooseSplit(i.days, i.level).map((s) => s[1]).join(' / ');
  const out = [
    `Goal is ${GOAL_LABEL[i.goal]} at ${i.level} level — that fixes rep ranges (${(DOSE[i.goal]||DOSE.general).reps}) and how hard each set should bite.`,
    `${i.days} days a week points at a ${splitName} layout — it keeps each pattern's frequency sensible without overlapping recovery.`,
    `${i.minutes}-minute cap means ${exerciseCount(i.minutes)} movements a session, compounds first so the important work happens fresh.`,
    `Equipment is ${EQUIP_LABEL[i.equipment]} — selecting lifts that actually load well with what's on hand.`,
  ];
  if (i.constraints) {
    const { caveats } = constraintSwaps(i.constraints);
    out.push(caveats.length
      ? `Constraint noted ("${i.constraints}"): ${caveats[0]}`
      : `Constraint noted ("${i.constraints}") — keeping ranges of motion conservative and swapping anything that aggravates it.`);
  }
  out.push('Trade-offs resolved — committing the block.');
  return out;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* ============================================================
   demo mode — instant, deterministic, for screenshots
   ============================================================ */
function renderDemo() {
  const inputs = { goal:'strength', days:4, minutes:60, level:'intermediate', equipment:'gym', constraints:'dodgy left knee' };
  // reflect into the form so the screenshot is coherent
  $('#goal').value = inputs.goal; $('#days').value = String(inputs.days);
  $('#minutes').value = String(inputs.minutes); $('#level').value = inputs.level;
  $('#equipment').value = inputs.equipment; $('#constraints').value = inputs.constraints;

  resting.hidden = true;
  reasonWrap.hidden = false;
  reasonWrap.dataset.active = 'false';
  reasonLabel.textContent = 'Nemotron-3-Ultra · reasoning';
  reasonBody.textContent = buildReasoningScript(inputs).join('\n');
  renderPlan(buildLocalPlan(inputs), inputs, null);
}

/* ============================================================
   init — runs LAST so every const data table above is live
   before demo mode or the first generate() can touch it.
   ============================================================ */
(async function init() {
  const y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());

  reasonTog.addEventListener('click', () => {
    const open = reasonTog.getAttribute('aria-expanded') === 'true';
    reasonTog.setAttribute('aria-expanded', String(!open));
  });
  form.addEventListener('submit', onSubmit);
  stopBtn.addEventListener('click', () => controller?.abort());

  // demo mode (screenshots / zero-click first impression): render synchronously,
  // before the network detect, so it never races the page paint.
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) renderDemo();

  const mode = await ai.detect();
  paintStatus(mode);
})();
