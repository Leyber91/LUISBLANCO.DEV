/* ============================================================
   heptapod/lexicon.js — the radicals.

   The grammar of this script is open: any proposition the schema
   can hold becomes one semagram. The concepts it can name are a
   closed list, as in every writing system's inventory of signs.
   Each concept is written as a six-cell radial code inside its
   role's sector of the ring:

     cell 0      the radical: the concept's semantic class
     cells 1-4   the concept's index inside its class (base 3, 1..80)
     cell 5      a check cell: the six values sum to 0 (mod 3)

   A cell value is -1 (the ring dips inward), 0 (flat) or +1 (it
   swells outward). Concepts of one class share their first cell,
   so related meanings look related. The check cell means any one
   misread cell yields a code that is not a word: the decoder
   sees the error instead of reading a wrong concept.

   Original design for this lab, on the published idea of
   semasiographic writing (Sampson 1985). [ILLUSTRATIVE]
   ============================================================ */

import { makeCode, codeValid } from './script.js';
export { makeCode, codeValid };
import { PRONOUNS, THING_PRONOUNS, BEINGS as BEINGS_S, THINGS as THINGS_S, ABSTRACT as ABSTRACT_S, MOTION as MOTION_S, MIND as MIND_S, CHANGE as CHANGE_S } from './lexicon-data.js';

/* ---- unpack the compact data strings ---- */
const regPlural = (w) => (/(s|x|z|ch|sh)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
function nounRows(list, defaultArt) {
  return list.map((str) => {
    const [id, gloss, pl, art] = str.split('|');
    return { id, sg: id, pl: pl || regPlural(id), art: art !== undefined ? art : defaultArt, gloss };
  });
}
function verbRows(list) {
  return list.map((str) => {
    const f = str.split('|');
    const v = { id: f[0], gloss: f[1] };
    const keys = ['past', 'pp', 'ing', 's'];
    f.slice(2).forEach((field, i) => {
      if (/\[dt\]/.test(field)) v.ditrans = true;
      if (/\[cl\]/.test(field)) v.clause = true;
      const val = field.replace(/\[(dt|cl)\]/g, '').trim();
      if (val && keys[i]) v[keys[i]] = val;
    });
    return v;
  });
}

const BEINGS = [...PRONOUNS.map((p) => ({ ...p, pron: true })), ...nounRows(BEINGS_S, 'the')];
const THINGS = [...THING_PRONOUNS.map((p) => ({ ...p, pron: true })), ...nounRows(THINGS_S, 'the')];
const ABSTRACT = nounRows(ABSTRACT_S, 'the');
const MOTION = verbRows(MOTION_S);
const MIND = verbRows(MIND_S);
const CHANGE = verbRows(CHANGE_S);

export const NOUN_CLASSES = [
  { trit: -1, name: 'being', gloss: 'beings and persons', list: BEINGS },
  { trit: 0, name: 'thing', gloss: 'things and substances', list: THINGS },
  { trit: 1, name: 'abstract', gloss: 'ideas, places and times', list: ABSTRACT },
];
export const VERB_CLASSES = [
  { trit: -1, name: 'motion', gloss: 'motion and transfer', list: MOTION },
  { trit: 0, name: 'mind', gloss: 'perception, thought and speech', list: MIND },
  { trit: 1, name: 'change', gloss: 'change, making and living', list: CHANGE },
];

/* ---- verb morphology ---- */
const VOWEL = /[aeiou]/;
function regS(b) {
  if (/(s|x|z|ch|sh|o)$/.test(b)) return b + 'es';
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ies';
  return b + 's';
}
function regPast(b) {
  if (b.endsWith('e')) return b + 'd';
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ied';
  return b + 'ed';
}
function regIng(b) {
  if (/ie$/.test(b)) return b.slice(0, -2) + 'ying';
  if (/[^e]e$/.test(b) && VOWEL.test(b.slice(0, -1))) return b.slice(0, -1) + 'ing';
  return b + 'ing';
}

function buildVerb(v, cls, index) {
  const base = v.id;
  const past = v.past || regPast(base);
  return {
    id: v.id, pos: 'verb', cls: cls.name, clsTrit: cls.trit, index, gloss: v.gloss || '',
    base, s: v.s || regS(base), past, pp: v.pp || past, ing: v.ing || regIng(base),
    ditrans: !!v.ditrans, clause: !!v.clause,
    code: makeCode(cls.trit, index),
  };
}

function buildNoun(n, cls, index) {
  const out = { ...n, pos: 'noun', cls: cls.name, clsTrit: cls.trit, index, code: makeCode(cls.trit, index) };
  if (!n.pron) out.third = true;
  return out;
}

export const NOUNS = [];
export const VERBS = [];
for (const cls of NOUN_CLASSES) cls.list.forEach((n, i) => NOUNS.push(buildNoun(n, cls, i + 1)));
for (const cls of VERB_CLASSES) cls.list.forEach((v, i) => VERBS.push(buildVerb(v, cls, i + 1)));

export const NOUN = Object.fromEntries(NOUNS.map((n) => [n.id, n]));
export const VERB = Object.fromEntries(VERBS.map((v) => [v.id, v]));

/* ---- surface lookups for the parser ---- */
export const NOUN_FORMS = new Map();   // word -> { id, num }
for (const n of NOUNS) {
  if (n.pron) {
    NOUN_FORMS.set(n.subj.toLowerCase(), { id: n.id, num: n.num });
    NOUN_FORMS.set(n.obj.toLowerCase(), { id: n.id, num: n.num });
  } else {
    NOUN_FORMS.set(n.sg, { id: n.id, num: 'sg' });
    NOUN_FORMS.set(n.pl, { id: n.id, num: 'pl' });
  }
}
/* A few synonyms the controlled grammar folds onto existing radicals. */
const NOUN_SYN = {
  alien: 'visitor', aliens: 'visitor', spaceship: 'ship', spaceships: 'ship', vessel: 'ship', craft: 'ship',
  kid: 'child', kids: 'child', mom: 'mother', dad: 'father', humanity: 'human', people: 'person', earth: 'world',
  ocean: 'sea', oceans: 'sea', present: 'gift', presents: 'gift', script: 'language', writing: 'language', device: 'machine',
  logogram: 'glyph', logograms: 'glyph', spacecraft: 'ship', creature: 'animal', creatures: 'animal',
};
const PLURAL_SYN = new Set(['humanity', 'aliens', 'spaceships', 'kids', 'oceans', 'presents', 'logograms', 'creatures']);
for (const [w, id] of Object.entries(NOUN_SYN)) {
  if (!NOUN_FORMS.has(w)) NOUN_FORMS.set(w, { id, num: PLURAL_SYN.has(w) ? 'pl' : 'sg', syn: true });
}

export const VERB_FORMS = new Map();  // word -> [{ id, form }]
const addForm = (w, id, form) => {
  if (!VERB_FORMS.has(w)) VERB_FORMS.set(w, []);
  VERB_FORMS.get(w).push({ id, form });
};
for (const v of VERBS) {
  addForm(v.base, v.id, 'base');
  addForm(v.s, v.id, 's');
  addForm(v.past, v.id, 'past');
  if (v.pp !== v.past) addForm(v.pp, v.id, 'pp');
  else addForm(v.pp, v.id, 'pp');
  addForm(v.ing, v.id, 'ing');
}

/* ---- codebooks for the decoder ---- */
export const NOUN_BOOK = NOUNS.map((n) => ({ id: n.id, code: n.code }));
export const VERB_BOOK = VERBS.map((v) => ({ id: v.id, code: v.code }));

export function lexiconStats() {
  return { nouns: NOUNS.length, verbs: VERBS.length, total: NOUNS.length + VERBS.length, perClassMax: 80, codeSpace: 729, validPerPos: 240 };
}
