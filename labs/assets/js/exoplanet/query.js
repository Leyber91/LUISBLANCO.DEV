/* ============================================================
   exoplanet/query.js — a question about the catalogue becomes a
   structured filter the engine runs over every world.

   Three readings, in this order:
   - by name: the search field lists the worlds and stars whose
     names match what is typed (main.js);
   - by the rules below, with no model. They know sizes, cold
     and hot, the habitable zone, distance, the host star, the
     period, the year and method of discovery, the order of the
     list, and the kind of world the picture draws (data.js
     LOOKS): seas, desert, cloud deck, ice, bare rock, lava, no
     surface, and one face to the star;
   - by a model, when the rules left something unread: ONE call
     (llm.js picks the route) that returns the same shape; the
     reply is validated field by field before it is used.

   The rule that keeps a wrong list off the screen: a reading
   is COMPLETE only when every word of the question was read.
   Each rule consumes the words it matched; a few words that
   cannot change a meaning (FILLER) are let through; any other
   word left over, a number included, makes the reading
   incomplete, and the page then filters nothing and names the
   word. So "planets that arent hot", "less hot planets" and
   "planets around cold stars" list nothing, where a reader that
   skipped small words would list hot or cold planets.

   The other guards, each with a test:
   - the words that stand before a star ("cold stars", "small
     red dwarfs") and the word after "around" or "orbiting" are
     about the star, and are hidden from the rules about planets;
   - a doubt stops the reading: a word consumed by two rules,
     cold with hot, two methods, two kinds of world side by side
     ("icy ocean worlds"), two values for one thing ("in 2019
     and in 2020", "hot jupiters with a long period");
   - a number that can be read two ways ("1,5", "1.000") is not
     read;
   - a word with two common meanings is not in the vocabulary:
     "oldest" could be the age or the year of discovery, and the
     catalogue has no ages.

   What is left after these is the reading printed in the note:
   every filter that is applied is said in words beside its
   results (say), so a reading the visitor did not mean is one
   they can see.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { AI, METHOD_GROUPS } from './config.js';
import { LOOKS } from './data.js';
import { COLD_K, HOT_K } from './find.js';
import { grouped } from '../kit/format.js';

/* the fields a query may constrain, with the units the page shows */
export const RANGE_FIELDS = [
  { key: 'R', label: 'Radius', unit: 'R⊕' },
  { key: 'Teq', label: 'Teq (published)', unit: 'K' },
  { key: 'S', label: 'Insolation', unit: 'S⊕' },
  { key: 'dist', label: 'Distance', unit: 'ly' },
  { key: 'Teff', label: 'Star Teff', unit: 'K' },
  { key: 'Rs', label: 'Star radius', unit: 'R☉' },
  { key: 'P', label: 'Period', unit: 'd' },
  { key: 'year', label: 'Discovered', unit: '' },
];
const SORTS = ['earthlike', 'Teq', 'dist', 'R', 'P', 'year', 'S'];

/* The kinds of world the picture draws, the words that ask for each, and how the page names the
   kind in a filter. A kind is the renderer's reading of the numbers (data.js lookOf), so a search
   by kind and the picture agree. */
export const KINDS = [
  { look: 'temperate', label: 'drawn with seas', re: /\b(oceans?|seas?|water worlds?|blue planets?|blue worlds?)\b/ },
  { look: 'desert', label: 'thin-air desert', re: /\b(deserts?|dry|dusty|arid|dunes?|mars like|like mars)\b/ },
  { look: 'shrouded', label: 'cloud-shrouded', re: /\b(cloudy|cloud covered|shrouded|overcast|greenhouse|venus like|like venus)\b/ },
  { look: 'ice', label: 'frozen', re: /\b(frozen|snowball|glaciers?|ic(e|y)(?! giants?))\b/ },
  { look: 'airless', label: 'airless rock', re: /\b(airless|no air|no atmosphere|without (an |any )?atmosphere|bare rock|barren|cratered|moon like|mercury like)\b/ },
  { look: 'molten', label: 'lava world', re: /\b(lava|molten|magma)\b/ },
  { look: 'fluid', label: 'no surface', re: /\b(no surface|cloud tops)\b/ },
];
const LOCKED = /\b((tidally |tide )?locked|one face|eyeball|permanent day|eternal day|synchronous( rotation)?)( to (its|their|the) (stars?|suns?|hosts?))?\b/;
const thousands = (v) => grouped(Math.round(v * 1000) / 1000);   // the kit's grouping, to three decimals at most
export const COLD_WORDS = `cold: equilibrium temperature under ${COLD_K} K, published or computed`;
export const HOT_WORDS = `hot: equilibrium temperature of ${thousands(HOT_K)} K or more, published or computed`;
export const LOCKED_WORDS = 'drawn with one face to its star';
/* who read a question when no model did */
export const PAGE = 'this page\'s own rules';
/* A star on the main sequence, by its radius: no giant and no white dwarf. In solar radii. */
export const DWARF_RS = [0.08, 1.5];

/* Words that cannot change what a question asks for. Everything else must be read by a rule. A word that
   turns a list into a yes-or-no question ("can", "do", "how") or that makes another thing of the next
   word ("super") is not here. */
export const FILLER = new Set(('a an the and of in on at for with that which who whose are is be been was were am ' +
  'me my i we us our you your show find give list get want search look looking ' +
  'all any some every each planet planets world worlds exoplanet exoplanets one ones kind kinds type types sort sorts ' +
  'there here it they them this these those please thanks thank hi hello hey ' +
  'what where around orbiting ' +
  'found discovered detected discoveries known by have has had very really extremely quite pretty ever yet also just only').split(' '));
/* Words that turn a meaning round or bend it. None is read; one of them in a question is named in the note. */
export const TURNS = new Set(('not no non without except excluding exclude outside never neither nor minus unlike but cannot cant ' +
  'arent isnt dont wont doesnt didnt wasnt werent hasnt havent shouldnt couldnt wouldnt ' +
  'free less fewer instead besides apart other rather lacking lacks lack').split(' '));
/* The words a rule about planets reads that may stand directly before "star" without being a property of the
   star ("closest to its star", "their own stars"). With the words let through ("the", "a", "our") they are
   where the run of words that belong to the star ends. */
const BESIDE_STAR = new Set('its their own parent'.split(' '));
const STAR_NOUN = /^(stars?|hosts?|suns?|dwarfs?)$/;

const isNum = (v) => typeof v === 'number' && isFinite(v);
/* A number as written. "1,000" is a thousand. "1,5", "1.000" and "1.000.000" could each be read two ways, and
   are not read. */
const num = (s) => {
  const x = String(s);
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) return parseFloat(x.replace(/,/g, ''));
  if (x.includes(',') || /^[1-9]\d{0,2}(\.\d{3})+$/.test(x) || x.split('.').length > 2) return NaN;
  return parseFloat(x);
};
const NUMBER = '(\\d+(?:[.,]\\d+)*)';
const UNIT = '(light ?years?|ly|parsecs?|pc)';
const FROM_US = '( away)?( from (us|earth|here|home|the sun|our sun))?';
const blanks = (m) => ' '.repeat(m.length);
const TOKEN = /[a-z0-9]+(?:[.,][0-9]+)*/g;

/* phrase -> filter, for the questions people actually type */
export function parseQuestion(text) {
  const t = ' ' + String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/n['\u2019]t\b/g, ' not')
    .replace(/[^a-z0-9., ]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const ranges = {}, notes = [], spans = [], doubts = [];
  let zone = null, sort = null, locked = null, cold = null, hot = null;
  const looks = [], kindAt = [], methods = new Set();
  const doubt = (why) => { if (!doubts.includes(why)) doubts.push(why); };
  // The first match of a rule, for its values; every match is consumed. `ok` may refuse the match, which then
  // consumes nothing. `one` names the doubt when the rule matches twice with two different texts.
  const take = (re, fam, s, { ok, one } = {}) => {
    let first = null;
    for (const m of s.matchAll(new RegExp(re.source, 'g'))) {
      if (!first) { if (ok && !ok(m)) return null; first = m; }
      else if (one && m[0] !== first[0]) doubt(one);
      spans.push({ a: m.index, b: m.index + m[0].length, fam });
    }
    return first;
  };
  // a second, different value for a field that already has one is a doubt, and the first value stays
  const set = (k, lo, hi, why) => {
    if (k in ranges) { if (String(ranges[k]) !== String([lo, hi])) doubt('one thing is asked for twice, with two values'); return; }
    ranges[k] = [lo, hi]; notes.push(why);
  };

  // ---- a request for a list or a count: the page gives both, so these words ask for nothing more ----
  take(/\b(can|could|would|will) you\b|\bhow many\b/, 'ask', t);

  // ---- the host star, read on the question as typed. A "dwarf" and a Sun-like star are on the main sequence:
  // the star's radius keeps out the giants and the white dwarfs of the same temperature. ----
  const dwarf = (lo, hi, why) => { set('Teff', lo, hi, why); set('Rs', DWARF_RS[0], DWARF_RS[1], `star of ${DWARF_RS[0]} to ${DWARF_RS[1]} R☉`); };
  if (take(/\b(red|m) dwarfs?( stars?| hosts?)?\b/, 'host', t)) dwarf(null, 3900, 'M dwarf host: star of 3,900 K or less');
  else if (take(/\bm type( stars?| hosts?)?\b/, 'host', t)) set('Teff', null, 3900, 'M-type host: star of 3,900 K or less');
  else if (take(/\b(k|orange) dwarfs?( stars?| hosts?)?\b/, 'host', t)) dwarf(3900, 5300, 'K dwarf host: star of 3,900 to 5,300 K');
  else if (take(/\bk type( stars?| hosts?)?\b/, 'host', t)) set('Teff', 3900, 5300, 'K-type host: star of 3,900 to 5,300 K');
  else if (take(/\b(sun like|sunlike|solar type)( stars?| hosts?)?\b/, 'host', t)) dwarf(5300, 6000, 'Sun-like host: star of 5,300 to 6,000 K');
  else if (take(/\bg type( stars?| hosts?)?\b/, 'host', t)) set('Teff', 5300, 6000, 'G-type host: star of 5,300 to 6,000 K');
  // "a type" alone is the article and a noun ("a type of planet"); it is the star's class only beside "star"
  else if (take(/\bf type( stars?| hosts?)?\b|\ba type (stars?|hosts?)\b|\bhot (host )?(stars?|hosts?|suns?)\b/, 'host', t)) set('Teff', 6000, null, 'hot host: star of 6,000 K or more');

  // ---- the question as the rules about planets see it ----
  // The words that stand before a star, back to the last word that cannot carry a meaning, are about the star:
  // "cold stars" and "small red dwarfs" do not ask for cold or small planets. So are the words after "around"
  // or "orbiting", up to the next word that cannot carry a meaning: "planets around gas giants" does not ask
  // for giant planets.
  const toks = [...t.matchAll(TOKEN)].map((m) => ({ w: m[0], a: m.index, b: m.index + m[0].length }));
  const inHost = (i) => spans.some((s) => s.fam === 'host' && s.a <= toks[i].a && toks[i].b <= s.b);
  const hidden = new Set();
  toks.forEach((k, i) => {
    if (inHost(i)) hidden.add(i);   // what a host rule read is the star's
    const star = spans.some((s) => s.fam === 'host' && s.a === k.a) || (STAR_NOUN.test(k.w) && !inHost(i));
    for (let j = i - 1; star && j >= 0 && !FILLER.has(toks[j].w) && !BESIDE_STAR.has(toks[j].w) && !inHost(j); j--) hidden.add(j);
    if (k.w === 'around' || k.w === 'orbiting') {
      let j = i + 1;
      while (toks[j] && ['a', 'an', 'the'].includes(toks[j].w)) j++;
      for (; toks[j] && !FILLER.has(toks[j].w) && !STAR_NOUN.test(toks[j].w); j++) hidden.add(j);
    }
  });
  let w = t;
  for (const i of hidden) w = w.slice(0, toks[i].a) + blanks(toks[i].w) + w.slice(toks[i].b);
  // Idioms: a lava ocean and a sea of lava are lava, dry ice is ice, ice cold is cold. The words dropped are consumed.
  for (const [re, keep, fam] of [[/\b(lava|magma|molten) (oceans?|seas?|lakes?)\b/, 1, 'kind'], [/\b(oceans?|seas?|lakes?) of (lava|magma)\b/, 2, 'kind'],
    [/\b(dry) (ice)\b/, 2, 'kind'], [/\b(ice|icy) (cold)\b/, 2, 'cold'], [/\b(cold) (as ice)\b/, 1, 'cold']]) {
    w = w.replace(new RegExp(re.source, 'g'), (m, g1, g2, at) => {
      spans.push({ a: at, b: at + m.length, fam });
      return keep === 1 ? g1 + blanks(m.slice(g1.length)) : blanks(m.slice(g2.length)) + g2;
    });
  }

  // ---- size. "bare rock" is a kind, below, and not a size. The bounds are part of the size. ----
  const ws = w.replace(/\bbare rock\b/g, blanks);
  if (take(/\bsuper earths?( size| sized)?\b/, 'size', ws)) set('R', 1.25, 2, 'super-Earth: 1.25 to 2 R⊕');
  else if (take(/\bearth (size|sized)\b/, 'size', ws)) set('R', 0.8, 1.25, 'Earth-size: 0.8 to 1.25 R⊕');
  else if (take(/\b(sub|mini) neptunes?( size| sized)?\b/, 'size', ws)) set('R', 2, 4, 'sub-Neptune: 2 to 4 R⊕');
  else if (take(/\bneptunes?( size| sized)?\b|\b(ice|icy) giants?\b/, 'size', ws)) set('R', 4, 8, 'Neptune-size: 4 to 8 R⊕');
  else if (take(/\bhot jupiters?\b/, 'size', ws)) { set('R', 8, null, 'giant: 8 R⊕ or more'); set('P', null, 10, 'period of 10 days or less'); }
  else if (take(/\bjupiters?( size| sized)?\b|\bgas giants?\b|\bgiants?\b/, 'size', ws)) set('R', 8, null, 'giant: 8 R⊕ or more');
  else if (take(/\b(small|rocky|rock|terrestrial)\b/, 'size', ws)) set('R', null, 1.6, 'rocky: 1.6 R⊕ or less');

  // ---- the kind of world the picture draws. Two kinds joined by "or" or "and" are either one; two kinds side
  // by side ("icy ocean worlds") could be one world with both, which no kind is, so that is a doubt. ----
  for (const k of KINDS) for (const m of w.matchAll(new RegExp(k.re.source, 'g'))) { spans.push({ a: m.index, b: m.index + m[0].length, fam: 'kind' }); kindAt.push({ a: m.index, b: m.index + m[0].length, look: k.look }); if (!looks.includes(k.look)) looks.push(k.look); }
  kindAt.sort((x, y) => x.a - y.a);
  for (let i = 1; i < kindAt.length; i++) {
    const between = t.slice(kindAt[i - 1].b, kindAt[i].a).trim();
    if (kindAt[i].look === kindAt[i - 1].look) continue;
    if (between === 'or') spans.push({ a: kindAt[i - 1].b + 1, b: kindAt[i].a - 1, fam: 'kind' });
    else if (between !== 'and') doubt('two kinds of world are named side by side');
  }
  if (looks.length) notes.push(looks.map((l) => KINDS.find((k) => k.look === l).label).join(' or '));
  if (take(LOCKED, 'locked', w)) { locked = true; notes.push(LOCKED_WORDS); }

  // ---- the zone, cold and hot. "hot Jupiter" was read above as a size and a period. ----
  if (take(/\b(temperate|habitable( zones?)?|goldilocks( zones?)?|liquid water)( of (its|their|the) (stars?|suns?|hosts?))?\b/, 'zone', w)) { zone = ['cons', 'opt']; notes.push('inside the conservative or the optimistic habitable zone'); }
  if (take(/\b(cold|chilly|freezing|frigid)\b/, 'cold', w)) { cold = true; notes.push(COLD_WORDS); }
  if (take(/\b(hot|scorching)\b/, 'hot', w.replace(/\bhot jupiters?\b/g, blanks))) { hot = true; notes.push(HOT_WORDS); }
  if (cold && hot) doubt('cold and hot are both asked for');

  // ---- distance from here. "near" and "close" alone are not read: they are as often about the planet's own star. ----
  let m;
  const sound = (x) => isNum(num(x[2]));
  const ly = (x) => num(x[2]) * (/p/.test(x[3]) ? 3.26156 : 1);
  const twoDistances = 'two distances are given';
  if ((m = take(new RegExp(`\\b(within|under|inside|less than|closer than|nearer than|up to) ${NUMBER} ?${UNIT}${FROM_US}\\b`), 'dist', w, { ok: sound, one: twoDistances }))) set('dist', null, ly(m), `within ${thousands(Math.round(ly(m)))} ly`);
  else if ((m = take(new RegExp(`\\b(beyond|over|more than|farther than|further than) ${NUMBER} ?${UNIT}${FROM_US}\\b`), 'dist', w, { ok: sound, one: twoDistances }))) set('dist', ly(m), null, `${thousands(Math.round(ly(m)))} ly or farther`);
  else if (take(/\b(nearby|neighbou?rs?|neighbou?rhood|near (us|me|earth(?! siz)|here|home|the sun|our sun|sol)|close to (us|earth(?! siz)|home|here|the sun|our sun))\b/, 'dist', w)) set('dist', null, 50, 'within 50 ly');

  // ---- the period ----
  if (take(/\bultra short( period)?\b/, 'period', w)) set('P', null, 1, 'period of 1 day or less');
  else if (take(/\bshort period\b/, 'period', w)) set('P', null, 10, 'period of 10 days or less');
  else if (take(/\blong period\b/, 'period', w)) set('P', 365, null, 'period of a year or more');

  // ---- discovery. "since 2020" includes 2020; "after 2020" starts in 2021. ----
  const twoYears = 'two years are given';
  if ((m = take(/\b(since|after) (19|20)(\d\d)\b/, 'year', w, { one: twoYears }))) set('year', +(m[2] + m[3]) + (m[1] === 'after' ? 1 : 0), null, m[1] === 'after' ? `found after ${m[2]}${m[3]}` : `found in ${m[2]}${m[3]} or later`);
  else if ((m = take(/\bbefore (19|20)(\d\d)\b/, 'year', w, { one: twoYears }))) set('year', null, +(m[1] + m[2]) - 1, `found before ${m[1]}${m[2]}`);
  else if ((m = take(/\bin (19|20)(\d\d)\b/, 'year', w, { one: twoYears }))) set('year', +(m[1] + m[2]), +(m[1] + m[2]), `found in ${m[1]}${m[2]}`);
  for (const g of METHOD_GROUPS) {
    if (g.key === 'other') continue;
    if (take(new RegExp('\\b' + g.label.toLowerCase() + '\\w*'), 'method', w)) methods.add(g.key);
  }
  if (take(/\bmicrolens\w*/, 'method', w)) methods.add('Microlensing');
  if (take(/\b(rv|doppler)\b/, 'method', w)) methods.add('Radial Velocity');
  if (take(/\b(directly imaged|direct imaging|imaged)\b/, 'method', w)) methods.add('Imaging');
  const method = methods.size === 1 ? [...methods][0] : null;
  if (method) notes.push(`found by ${method.toLowerCase()}`);
  if (methods.size > 1) doubt('more than one method of discovery is named');

  // ---- the order of the list. "closest to its star" and "closest in" are about the orbit, not the distance
  // from here. "oldest" is not read: it could be the age or the year of discovery, and the catalogue has no ages. ----
  if (take(/\b(most )?earth like\b|\bearth twins?\b/, 'sort', w)) sort = { key: 'earthlike', dir: -1 };
  else if (take(/\bhottest\b/, 'sort', w)) sort = { key: 'T', dir: -1 };
  else if (take(/\bcoldest\b/, 'sort', w)) sort = { key: 'T', dir: 1 };
  else if (take(/\b(nearest|closest)\b( to (us|earth|home|here|the sun|our sun)\b)?(?! to (its|their|a|the) (own |parent )?(stars?|hosts?|suns?)\b| in( planets?| worlds?| orbits?)? $)/, 'sort', w)) sort = { key: 'dist', dir: 1 };
  else if (take(/\b(largest|biggest)\b/, 'sort', w)) sort = { key: 'R', dir: -1 };
  else if (take(/\bsmallest\b/, 'sort', w)) sort = { key: 'R', dir: 1 };
  else if (take(/\b(newest|latest|recent|recently)\b/, 'sort', w)) sort = { key: 'year', dir: -1 };
  else if (take(/\bearliest\b|\bfirst (found|discovered|known)\b/, 'sort', w)) sort = { key: 'year', dir: 1 };

  // ---- what was not read, and what was read twice ----
  const unused = [], twice = [];
  for (const k of toks) {
    const fams = new Set(spans.filter((s) => s.a <= k.a && k.b <= s.b).map((s) => s.fam));
    if (fams.size > 1 && !twice.includes(k.w)) twice.push(k.w);
    if (fams.size === 0 && !FILLER.has(k.w) && !unused.includes(k.w)) unused.push(k.w);
  }
  if (twice.length) doubt(`the word${twice.length > 1 ? 's' : ''} ${twice.map((x) => `“${x}”`).join(' and ')} could belong to two different readings`);
  const turned = unused.find((x) => TURNS.has(x)) || null;

  const recognised = notes.length + (sort ? 1 : 0);
  return { ranges, zone, method, sort, looks: looks.length ? looks : null, locked, cold, hot, notes, unused, doubts, turned,
    complete: recognised > 0 && unused.length === 0 && doubts.length === 0, recognised };
}

/* True when a model should be asked: the rules left something unread in a question that says something. A lone
   short scrap ("?", "a", "no") is not sent anywhere. */
export const needsModel = (r) => !r.complete && (r.recognised > 0 || r.unused.some((x) => /[a-z]{3}/.test(x)));

/* The note under the search field. r: a reading. by: PAGE or the name of the model that read it. count: the worlds
   on screen after the reading was applied. order: the words for the order of the list. A reading by the rules that
   is not complete was not applied, and the note says why. */
export function say({ r, text, by = PAGE, count, order }) {
  const head = `“${text}”`;
  if (by !== PAGE || r.complete) {
    let s = `${head} reads as ${r.notes.join(', ') || 'every planet'}; ${r.notes.length ? `${thousands(count)} ${count === 1 ? 'match' : 'matches'}` : `${thousands(count)} planets`}, ${order}; read by ${by}.`;
    if (count === 0 && r.looks && !r.looks.includes('fluid') && r.ranges.R && r.ranges.R[0] >= 4) s += ' No world that large is drawn with a surface.';
    if (count === 0 && (r.cold || r.hot) && r.method === 'Imaging') s += ' A directly imaged planet is seen by its own heat, and is given no equilibrium temperature here.';
    if (Object.keys(r.ranges).length) s += ' The numbers can be changed under Ranges.';
    return s;
  }
  if (r.turned) return `${head}: the word “${r.turned}” is not read here, so nothing was filtered.`;
  if (r.doubts.length) return `${head}: ${r.doubts.join('; ')}, so nothing was filtered.`;
  if (!r.unused.length) return `${head}: it names nothing to filter or to order by.`;
  const rest = r.recognised ? ` Without ${r.unused.length === 1 ? 'it' : 'them'} the question would read as: ${r.notes.join(', ') || order}.` : '';
  return `${head}: not read: ${r.unused.join(', ')}. Nothing was filtered.${rest}`;
}

/* a model reply -> the same shape, or null; every field checked */
export function validateQuery(j) {
  if (!j || typeof j !== 'object') return null;
  const out = { ranges: {}, zone: null, method: null, sort: null, looks: null, locked: null, cold: null, hot: null, notes: [], unused: [], doubts: [], turned: null, complete: true };
  const end = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(+v) ? +v : NaN);
  for (const f of RANGE_FIELDS) {
    const r = j.ranges && j.ranges[f.key];
    if (!r) continue;
    const lo = end(Array.isArray(r) ? r[0] : r.min), hi = end(Array.isArray(r) ? r[1] : r.max);
    if (Number.isNaN(lo) || Number.isNaN(hi) || (lo === null && hi === null)) continue;
    if (lo !== null && hi !== null && lo > hi) continue;
    out.ranges[f.key] = [lo, hi];
    const show = (v) => (f.key === 'year' ? String(v) : thousands(v));
    out.notes.push(`${f.label} ${lo === null ? `up to ${show(hi)}` : hi === null ? `from ${show(lo)}` : `${show(lo)} to ${show(hi)}`} ${f.unit}`.trim());
  }
  if (j.habitable_zone === true) { out.zone = ['cons', 'opt']; out.notes.push('inside the conservative or the optimistic habitable zone'); }
  if (typeof j.method === 'string' && METHOD_GROUPS.some((g) => g.key !== 'other' && g.key === j.method)) { out.method = j.method; out.notes.push(`found by ${j.method.toLowerCase()}`); }
  // kinds: only names the picture has, each once
  const kinds = Array.isArray(j.kinds) ? [...new Set(j.kinds.filter((k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(LOOKS, k)))] : [];
  if (kinds.length) { out.looks = kinds; out.notes.push(kinds.map((k) => KINDS.find((x) => x.look === k).label).join(' or ')); }
  if (j.tidally_locked === true) { out.locked = true; out.notes.push(LOCKED_WORDS); }
  if (j.temperature === 'cold') { out.cold = true; out.notes.push(COLD_WORDS); }
  else if (j.temperature === 'hot') { out.hot = true; out.notes.push(HOT_WORDS); }
  // an order by temperature uses the same temperature as "cold" and "hot": published, else computed
  if (j.sort && SORTS.includes(j.sort.key)) out.sort = { key: j.sort.key === 'Teq' ? 'T' : j.sort.key, dir: j.sort.dir === 'asc' || j.sort.dir === 1 ? 1 : -1 };
  out.recognised = out.notes.length + (out.sort ? 1 : 0);
  return out.recognised ? out : null;
}

/* What the model is told. Exported so that its units and bounds are tested against the page's. */
export const SYSTEM = 'You turn a question about the NASA exoplanet catalogue into a filter. Reply as JSON: ' +
  '{"ranges": {"R": [min, max], "Teq": [min, max], "S": [min, max], "dist": [min, max], "Teff": [min, max], "Rs": [min, max], "P": [min, max], "year": [min, max]}, ' +
  '"habitable_zone": true or false, "method": one of "Transit", "Radial Velocity", "Microlensing", "Imaging" or null, ' +
  '"kinds": a list of any of "temperate" (drawn with seas), "desert" (thin air, dry), "shrouded" (one cloud deck, like Venus), "ice" (frozen), "airless" (bare rock), "molten" (lava), "fluid" (no surface: gas and ice giants, sub-Neptunes), or null, ' +
  '"tidally_locked": true or null, ' +
  `"temperature": "cold" (equilibrium temperature under ${COLD_K} K), "hot" (${HOT_K} K or more) or null, ` +
  '"sort": {"key": one of "earthlike", "Teq", "dist", "R", "P", "year", "S", "dir": "asc" or "desc"} or null}. ' +
  'Units: R in Earth radii, Teq in kelvin (published equilibrium temperature), S insolation relative to Earth, dist in light-years, Teff of the host star in kelvin, Rs radius of the host star in solar radii, P orbital period in days, year the year of discovery. ' +
  'Use "kinds" when the question describes what a world is like, "temperature" for cold or hot with no number, and ranges only for numbers the question gives or plainly implies. ' +
  'A negation ("not cold", "outside the habitable zone") must be written as the ranges that hold, never as the thing negated. ' +
  'Use null for an open end. Include only the fields the question needs.';

/* The longest question sent to a model, in characters. */
export const QUESTION_MAX = 300;

export async function askModel(question, signal) {
  const res = await LLM.complete({
    system: SYSTEM, prompt: 'QUESTION: ' + String(question).slice(0, QUESTION_MAX), json: true, temperature: 0,
    maxWaitMs: AI.maxWaitMs, timeoutMs: AI.timeoutMs, signal, fallback: () => null,
  });
  const q = res.source === 'offline' ? null : validateQuery(res.json);
  return { q, res };
}
