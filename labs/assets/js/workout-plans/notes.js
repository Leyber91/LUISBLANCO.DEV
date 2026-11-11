/* ============================================================
   workout-plans/notes.js — reads the free-text notes field into
   typed constraints. Pure, rule-based, no model.

   Each rule is data: a pattern, the constraint it writes, and the
   phrase that fired it, which the page lists. A phrase is ignored
   when a negation sits just before it ("no knee problems") or a
   reassurance just after it ("knees are fine"), and bare words
   that only look like injuries ("back from holiday") match no
   rule because the patterns name joints and conditions.

   Red flags stop the planner: symptoms or conditions a training
   plan should not route around. The page then asks the visitor
   to talk to a clinician first. The list is a screen, not a
   diagnosis, and the page says so.
   ============================================================ */

const DAY_RE = [
  ['mon', 0], ['tue', 1], ['wed', 2], ['thu', 3], ['fri', 4], ['sat', 5], ['sun', 6],
];

export const RED_FLAGS = [
  { re: /\bchest (pain|tightness|pressure)\b/i, label: 'chest pain' },
  { re: /\b(faint\w*|passed out|black(ed)? out|syncope)\b/i, label: 'fainting' },
  { re: /\b(recent|just had|after) (an? )?(surgery|operation)\b|\b(surgery|operation) (last|this) (week|month)\b/i, label: 'recent surgery' },
  { re: /\bpregnan\w*\b/i, label: 'pregnancy' },
  { re: /\bheart (condition|disease|problem|failure|attack)\b|\barrhythmi\w*\b|\bcardiac\b/i, label: 'a heart condition' },
  { re: /\b(short(ness)? of breath|breathless at rest)\b/i, label: 'shortness of breath' },
  { re: /\bstroke\b/i, label: 'stroke' },
];

const INJURY_RULES = [
  { flag: 'knee', re: /\b(knees?|acl|mcl|pcl|menisc\w*|patell\w*)\b/i },
  { flag: 'back', re: /\b(low(er)?[- ]back|lumbar|slipped disc|disc (bulge|herniation|issue|problem)|herniat\w*|sciatica|back (pain|injury|issue|problem|trouble)s?|bad back)\b/i },
  { flag: 'shoulder', re: /\b(shoulders?|rotator cuff|impingement|labrum)\b/i },
  { flag: 'wrist', re: /\b(wrists?|carpal tunnel)\b/i },
];

const KIT_RULES = [
  { item: 'barbell', re: /\bbarbells?\b/i },
  { item: 'rack', re: /\b(squat )?racks?\b/i },
  { item: 'dumbbell', re: /\bdumb ?bells?\b/i },
  { item: 'bench', re: /\bbench\b/i },
  { item: 'bar', re: /\bpull[- ]?up bar\b|\bchin[- ]?up bar\b/i },
  { item: 'kettlebell', re: /\bkettle ?bells?\b/i },
  { item: 'bands', re: /\b(resistance )?bands?\b/i },
  { item: 'cable', re: /\bcables?\b/i },
  { item: 'machine', re: /\bmachines?\b/i },
];

const NEG_BEFORE = /\b(no|not|never|without|zero|free of|none|nothing wrong with)\b[\w\s'-]{0,18}$/i;
const NEG_AFTER = /^[\w\s'-]{0,14}\b(fine|ok|okay|good|healthy|great|perfect|recovered|healed)\b/i;
const LACK_BEFORE = /\b(no|don'?t have|do not have|without|lack|missing|can'?t use|cannot use)\b[\w\s'-]{0,12}$/i;
const HAVE_BEFORE = /\b(have|got|own|with|plus|and|also|use)\b[\w\s'-]{0,12}$/i;
const NODAY_BEFORE = /\b(no|not|never|can'?t|cannot|unable|busy|except|away|off)\b[\w\s',/-]{0,28}$/i;

function sentences(text) {
  return String(text || '').split(/[.;\n!?]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * @returns {{flags:string[], noDays:number[], kitAdd:string[], kitRemove:string[], red:string[], fired:object[], ignored:object[]}}
 */
export function parseNotes(text) {
  const out = { flags: [], noDays: [], kitAdd: [], kitRemove: [], red: [], fired: [], ignored: [] };
  const raw = String(text || '').slice(0, 400);
  if (!raw.trim()) return out;
  for (const r of RED_FLAGS) {
    const m = raw.match(r.re);
    if (m) { out.red.push(r.label); out.fired.push({ kind: 'red', phrase: m[0], wrote: 'stop: ' + r.label }); }
  }
  for (const s of sentences(raw)) {
    for (const rule of INJURY_RULES) {
      const m = s.match(rule.re);
      if (!m) continue;
      const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
      if (NEG_BEFORE.test(before) || NEG_AFTER.test(after)) { out.ignored.push({ phrase: m[0], why: 'negated' }); continue; }
      if (!out.flags.includes(rule.flag)) out.flags.push(rule.flag);
      out.fired.push({ kind: 'flag', phrase: m[0], wrote: rule.flag + ' flag' });
    }
    for (const rule of KIT_RULES) {
      const m = s.match(rule.re);
      if (!m) continue;
      const before = s.slice(0, m.index);
      if (LACK_BEFORE.test(before)) { out.kitRemove.push(rule.item); out.fired.push({ kind: 'kit', phrase: m[0], wrote: 'no ' + rule.item }); }
      else if (HAVE_BEFORE.test(before)) { out.kitAdd.push(rule.item); out.fired.push({ kind: 'kit', phrase: m[0], wrote: '+ ' + rule.item }); }
    }
    const dayRe = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)s?\b/gi;
    let dm;
    while ((dm = dayRe.exec(s))) {
      const before = s.slice(0, dm.index);
      if (!NODAY_BEFORE.test(before)) continue;
      const key = dm[1].slice(0, 3).toLowerCase();
      const idx = DAY_RE.find(([k]) => k === key)?.[1];
      if (idx != null && !out.noDays.includes(idx)) { out.noDays.push(idx); out.fired.push({ kind: 'day', phrase: dm[0], wrote: 'no ' + dm[0].slice(0, 3) }); }
    }
  }
  if (/\bback\b/i.test(raw) && !out.flags.includes('back')) {
    const m = raw.match(/[^.,;\n]*\bback\b[^.,;\n]*/i);
    out.ignored.push({ phrase: m ? m[0].trim().slice(0, 40) : 'back', why: 'names no back injury' });
  }
  return out;
}
