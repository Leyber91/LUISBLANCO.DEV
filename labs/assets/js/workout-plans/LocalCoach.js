/* ============================================================
   workout-plans/LocalCoach.js — the deterministic coach.

   Pure logic, no DOM. Turns the user's constraints into the same
   plan shape the reasoning model is asked for, plus a believable
   reasoning script. It is the single source of truth for BOTH echo
   mode and the parse-failure fallback, so the experience never
   degrades to a dead box.

   Every former if/else ladder (split selection, exercise count,
   constraint swaps, progression copy) now resolves through the
   lookup/strategy tables in constants.js — extend the data, not
   this class.
   ============================================================ */

import {
  GOAL_LABEL, EQUIP_LABEL, DOSE, DOSE_FALLBACK, POOL, DAY_NAMES,
  SPLIT_RULES, SPLIT_DEFAULT, EXERCISE_COUNT, CONSTRAINT_RULES,
  PROGRESSION, DELOAD_TEXT, BASE_CAVEAT, PRIMARY_NOTE,
} from './constants.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export class LocalCoach {
  /* days/level -> [[pattern, label], ...] (SPLIT_RULES, then default) */
  chooseSplit(days, level) {
    const rule = SPLIT_RULES[days];
    if (!rule) return SPLIT_DEFAULT;
    if (rule.fixed) return rule.fixed;
    return rule.byLevel?.[level] || rule.default;
  }

  /* minutes -> movements/session (first threshold that caps it) */
  exerciseCount(minutes) {
    for (const [cap_, count] of EXERCISE_COUNT.thresholds) {
      if (minutes <= cap_) return count;
    }
    return EXERCISE_COUNT.overflow;
  }

  /* constraints text -> { ban:[lift], caveats:[line] } via the rule table */
  constraintSwaps(text) {
    const t = (text || '').toLowerCase();
    const ban = [];
    const caveats = [];
    for (const rule of CONSTRAINT_RULES) {
      if (rule.test.test(t)) { ban.push(...rule.ban); caveats.push(rule.caveat); }
    }
    return { ban, caveats };
  }

  /* the full structured plan (matches PLAN_SCHEMA) */
  buildPlan(i) {
    const split = this.chooseSplit(i.days, i.level);

    let n = this.exerciseCount(i.minutes);
    if (i.level === 'beginner') n = Math.max(3, n - 1);

    const d = DOSE[i.goal] || DOSE_FALLBACK;
    let sets = d.sets;
    if (i.level === 'beginner') sets = Math.max(2, sets - 1);
    if (i.level === 'advanced' && i.goal !== 'strength') sets += 1;

    const { ban, caveats } = this.constraintSwaps(i.constraints);
    const banSet = new Set(ban);

    const days = split.map(([key, focus], idx) => {
      let pool = POOL[i.equipment][key].filter((x) => !banSet.has(x));
      // top up from the full-body pool if swaps thinned it out
      if (pool.length < n) {
        pool = pool.concat(POOL[i.equipment].full.filter((x) => !banSet.has(x) && !pool.includes(x)));
      }
      const exercises = pool.slice(0, n).map((name, j) => ({
        name,
        sets: j === 0 ? sets : Math.max(2, sets - 1),   // top compound gets the full dose
        reps: d.reps,
        rpe: d.rpe,
        note: j === 0 ? PRIMARY_NOTE : '',
      }));
      return { day: DAY_NAMES[idx], focus, minutes: i.minutes, exercises };
    });

    return {
      summary: `${cap(GOAL_LABEL[i.goal])} block — ${i.days} days a week on ${EQUIP_LABEL[i.equipment]}, sessions capped at ${i.minutes} minutes.`,
      split: days,
      progression: i.goal === 'strength' ? PROGRESSION.strength : PROGRESSION.default,
      deload: DELOAD_TEXT,
      caveats: caveats.concat([BASE_CAVEAT]),
    };
  }

  /* a concise out-loud reasoning script for echo / demo mode */
  buildReasoningScript(i) {
    const splitName = this.chooseSplit(i.days, i.level).map((s) => s[1]).join(' / ');
    const dose = DOSE[i.goal] || DOSE_FALLBACK;
    const out = [
      `Goal is ${GOAL_LABEL[i.goal]} at ${i.level} level — that fixes rep ranges (${dose.reps}) and how hard each set should bite.`,
      `${i.days} days a week points at a ${splitName} layout — it keeps each pattern's frequency sensible without overlapping recovery.`,
      `${i.minutes}-minute cap means ${this.exerciseCount(i.minutes)} movements a session, compounds first so the important work happens fresh.`,
      `Equipment is ${EQUIP_LABEL[i.equipment]} — selecting lifts that actually load well with what's on hand.`,
    ];
    if (i.constraints) {
      const { caveats } = this.constraintSwaps(i.constraints);
      out.push(caveats.length
        ? `Constraint noted ("${i.constraints}"): ${caveats[0]}`
        : `Constraint noted ("${i.constraints}") — keeping ranges of motion conservative and swapping anything that aggravates it.`);
    }
    out.push('Trade-offs resolved — committing the block.');
    return out;
  }
}
