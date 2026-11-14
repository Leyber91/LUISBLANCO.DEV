/* ============================================================
   workout-plans/LocalCoach.js — the deterministic narrator and
   the claim checker. Pure logic, no DOM.

   narrate(plan, lived) writes the explanation straight from the
   planner's decision log: one sentence per decision worth saying,
   each citing the decision it comes from. It is the fallback when
   no model answers, and the reference the model is checked
   against.

   check(sentences, decisions, planNames) audits any narration, the model's
   included, sentence by sentence:
     1 it cites at least one decision, and every cited id exists
     2 every number it states appears in a cited decision
     3 every exercise it names is in the plan or a cited decision
     4 it makes no medical claim (MEDICAL_RE)
   A sentence that fails is kept on the page, struck through, with
   the reason, so the visitor sees what the model got wrong.
   ============================================================ */

import { MEDICAL_RE } from './constants.js';
import { EXERCISES } from './library.js';

const ORDER = ['notes', 'frequency', 'spacing', 'conflict', 'split', 'scheme', 'shape', 'swap', 'drop', 'time', 'cut', 'volume', 'balance', 'pin', 'distribution', 'who', 'load', 'busso', 'peak'];
const SKIP_WHEN_MANY = new Set(['spacing', 'conflict', 'cut', 'drop', 'busso', 'balance']);

export function allDecisions(plan, lived) {
  return plan.log.concat(lived ? lived.log : []);
}

export function narrate(plan, lived) {
  const out = [];
  const byKind = (k) => plan.log.filter((e) => e.kind === k);
  const many = plan.log.length > 11;
  for (const k of ORDER) {
    if (many && SKIP_WHEN_MANY.has(k)) continue;
    const es = byKind(k);
    for (const e of k === 'swap' ? es.slice(0, 2) : es.slice(0, 1)) out.push({ say: e.say || e.text, cites: [e.id] });
  }
  for (const e of (lived?.log || []).slice(-2)) out.push({ say: e.say || e.text, cites: [e.id] });
  return out;
}

/* numbers a sentence states; decision ids written into the prose ("decision D5") are not claims */
const numsIn = (s) => (String(s).replace(/\b[DR]\d{1,2}\b/gi, ' ').match(/\d+(?:\.\d+)?/g) || []).map(Number);

export const planExerciseNames = (plan, lived) =>
  [...new Set((lived || plan).days.concat(plan.days).flatMap((d) => (d.s ? d.s.items.map((it) => it.name.toLowerCase()) : [])))];

/* check(sentences, decisions, planNames): decisions = [{id, text, say, nums}] */
export function check(sentences, decisions, planNamesList) {
  const all = decisions;
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));
  const planNames = new Set(planNamesList);
  const names = EXERCISES.filter((x) => x.pattern !== 'cardio').map((x) => x.name.toLowerCase()).sort((a, b) => b.length - a.length);

  return sentences.map((raw) => {
    const say = String(raw.say || '').trim();
    const cites = [...new Set((raw.cites || []).map((c) => String(c).trim().toUpperCase()))];
    const res = { say, cites, ok: true, why: '' };
    const fail = (why) => { res.ok = false; res.why = why; return res; };
    if (!say) return fail('empty sentence');
    if (say.length > 420) return fail('longer than one sentence');
    if (!cites.length) return fail('cites no decision');
    const unknown = cites.filter((c) => !byId[c]);
    if (unknown.length) return fail(`cites ${unknown.join(', ')}, which the log does not have`);
    const src = cites.map((c) => byId[c]);
    const srcText = src.map((d) => `${d.text} ${d.say || ''} ${(d.nums || []).join(' ')}`).join(' ');
    const allowed = new Set(numsIn(srcText));
    const stray = numsIn(say).filter((n) => !allowed.has(n));
    if (stray.length) return fail(`states ${stray.join(', ')}, not in ${cites.join(', ')}`);
    const low = say.toLowerCase(), srcLow = srcText.toLowerCase();
    let masked = low;
    for (const nm of names) {
      if (!masked.includes(nm)) continue;
      if (!planNames.has(nm) && !srcLow.includes(nm)) return fail(`names ${nm}, which is not in the plan`);
      masked = masked.split(nm).join(' ');
    }
    if (MEDICAL_RE.test(say)) return fail('makes a medical claim');
    return res;
  });
}

/* normalise whatever JSON shape a model returns into [{say, cites}] */
export function normalise(json) {
  const arr = Array.isArray(json) ? json : json?.narration || json?.sentences || json?.explanation || [];
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 12).map((x) => {
    if (typeof x === 'string') {
      const cites = x.match(/\b[DR]\d{1,2}\b/g) || [];
      return { say: x.replace(/\s*\[(?:[DR]\d{1,2}(?:,\s*)?)+\]\s*/g, ' ').trim(), cites };
    }
    const say = x.say ?? x.text ?? x.sentence ?? '';
    let cites = x.cites ?? x.cite ?? x.ids ?? x.decisions ?? [];
    if (typeof cites === 'string') cites = cites.match(/[DR]\d{1,2}/gi) || [];
    return { say: String(say).replace(/\s*\[(?:[DR]\d{1,2}(?:,\s*)?)+\]\s*/g, ' ').trim(), cites };
  }).filter((x) => x.say);
}
