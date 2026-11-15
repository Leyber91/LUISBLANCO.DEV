/* ============================================================
   The broken rules of query.js, for the test of the reader
   tests. Two files run them, a half each, so that neither comes
   near the 120 s the gate gives a file:
     node labs/assets/js/exoplanet/tests/query.mutants.test.mjs
     node labs/assets/js/exoplanet/tests/query.mutants2.test.mjs

   Each entry breaks one rule of query.js: a bound moved to
   either side, a branch removed, a word taken out of a list or
   let into one, a guard against a wrong reading switched off, a
   check of a model's reply loosened, a sentence of the note or
   of the model's instructions changed. The broken file is
   written to a copy of this lab in the system's temp folder and
   query.test.mjs is run on the copy (mutants.mjs). Every broken
   rule must fail a check there.

   Why this exists: on 2026-11-15 three independent reviews of
   the search found 17, 27 and 20 defects while its tests
   passed, and the second and third each showed about thirty
   broken rules the list of that hour did not hold. Add an entry
   here with every new rule in query.js.
   ============================================================ */

const R = String.raw;

/* The alternatives of the first bracketed group in a piece of the module, at the top level of that group. */
function alternatives(text) {
  const start = text.indexOf('(');
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) { end = i; break; }
  }
  const inner = text.slice(start + 1, end), parts = [];
  let d = 0, cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '\\') { cur += c + inner[++i]; continue; }
    if (c === '(') d++; else if (c === ')') d--;
    if (c === '|' && d === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return { start, end, parts };
}
/* One mutant for each word of a list of alternatives: the list without that word. */
const dropEach = (label, text) => {
  const { start, end, parts } = alternatives(text);
  return parts.map((w, k) => [`${label}: "${w}" taken out`, text, text.slice(0, start + 1) + parts.filter((_, j) => j !== k).join('|') + text.slice(end)]);
};
/* A rule switched off: its pattern is made to match nothing. The text must start at the pattern's first \b. */
const silence = (label, text) => [`${label}: switched off`, text, text.replace('\\b', '\\bzzzz')];
/* One mutant for each word of a list written as words between spaces, in quotes, as the module writes it. */
const dropWords = (label, piece) => {
  const words = piece.trim().split(' '), tail = piece.endsWith(' ') ? ' ' : '';
  return words.map((w) => [`${label}: "${w}" taken out`, `'${piece}'`, `'${words.filter((x) => x !== w).join(' ')}${tail}'`]);
};
/* One mutant for each of the given lines of a list: the list without that line. */
const dropLines = (label, lines) => lines.map((l) => [`${label}: ${l.trim()} taken out`, l + '\n', '']);

const F1 = 'a an the and of in on at for with that which who whose are is be been was were am ';
const F2 = 'me my i we us our you your show find give list get want search look looking ';
const F3 = 'all any some every each planet planets world worlds exoplanet exoplanets one ones kind kinds type types sort sorts ';
const F4 = 'there here it they them this these those please thanks thank hi hello hey ';
const F5 = 'what where around orbiting ';
const F6 = 'found discovered detected discoveries known by have has had very really extremely quite pretty ever yet also just only';
const T1 = 'not no non without except excluding exclude outside never neither nor minus unlike but cannot cant ';
const T2 = 'arent isnt dont wont doesnt didnt wasnt werent hasnt havent shouldnt couldnt wouldnt ';
const T3 = 'free less fewer instead besides apart other rather lacking lacks lack';
const SORT_KEYS = ['earthlike', 'Teq', 'dist', 'R', 'P', 'year', 'S'];

export const MUTANTS = [
  /* ---- the words let through, the words that turn a meaning ---- */
  ...[F1, F2, F3, F4, F5, F6].flatMap((p) => dropWords('let through', p)),
  ...['than', 'to', 'its', 'star', 'or', 'like', 'less', 'from', 'more', 'can', 'how', 'super', 'old', 'red', 'warm', 'big', 'zzz'].map((x) => [`"${x}" let through`, `(('a an the and of in`, `(('${x} a an the and of in`]),
  ['every word let through', R`if (fams.size === 0 && !FILLER.has(k.w) && !unused.includes(k.w)) unused.push(k.w);`, ``],
  ['no word let through', R`fams.size === 0 && !FILLER.has(k.w) && `, R`fams.size === 0 && `],
  ...[T1, T2, T3].flatMap((p) => dropWords('a turn', p)),
  ['a turn never named', R`const turned = unused.find((x) => TURNS.has(x)) || null;`, R`const turned = null;`],
  ...['maybe', 'zzz'].map((x) => [`"${x}" made a turn`, `(('not no non without`, `(('${x} not no non without`]),

  /* ---- a request for a list or a count ---- */
  ...dropEach('a request', R`(can|could|would|will) you\b|`),
  ['"can" read as a request with no "you" after it', R`(can|could|would|will) you\b|`, R`(can|could|would|will)\b|`],
  silence('how many', R`\bhow many\b/, 'ask'`),

  /* ---- what belongs to the star ---- */
  ...dropWords('beside a star', 'its their own parent'),
  ...dropEach('a star noun', R`const STAR_NOUN = /^(stars?|hosts?|suns?|dwarfs?)$/;`),
  ['nothing hidden from the rules about planets', R`  for (const i of hidden) w = w.slice(0, toks[i].a) + blanks(toks[i].w) + w.slice(toks[i].b);` + '\n', ``],
  ['the words a host rule read are read as the planet\'s too', R`    if (inHost(i)) hidden.add(i);   // what a host rule read is the star's` + '\n', ``],
  ['only the word directly before a star is the star\'s', R`for (let j = i - 1; star && j >= 0 && !FILLER.has(toks[j].w) && !BESIDE_STAR.has(toks[j].w) && !inHost(j); j--) hidden.add(j);`, R`if (star && i > 0 && !FILLER.has(toks[i - 1].w) && !BESIDE_STAR.has(toks[i - 1].w) && !inHost(i - 1)) hidden.add(i - 1);`],
  ['the run before a star goes on through "around"', R`star && j >= 0 && !FILLER.has(toks[j].w) && !BESIDE_STAR`, R`star && j >= 0 && !BESIDE_STAR`],
  ['the run before a star goes on through "its"', R`!FILLER.has(toks[j].w) && !BESIDE_STAR.has(toks[j].w) && !inHost(j); j--)`, R`!FILLER.has(toks[j].w) && !inHost(j); j--)`],
  ['a star that a host rule read hides nothing before it', R`const star = spans.some((s) => s.fam === 'host' && s.a === k.a) || (STAR_NOUN`, R`const star = (STAR_NOUN`],
  ['a star no host rule read hides nothing before it', R`s.a === k.a) || (STAR_NOUN.test(k.w) && !inHost(i));`, R`s.a === k.a);`],
  ['the word after "around" read as the planet\'s', R`if (k.w === 'around' || k.w === 'orbiting') {`, R`if (k.w === 'orbiting') {`],
  ['the word after "orbiting" read as the planet\'s', R`if (k.w === 'around' || k.w === 'orbiting') {`, R`if (k.w === 'around') {`],
  ...['a', 'an', 'the'].map((x) => [`"${x}" after "around" ends what is orbited`, R`['a', 'an', 'the'].includes(toks[j].w)`, `[${['a', 'an', 'the'].filter((y) => y !== x).map((y) => `'${y}'`).join(', ')}].includes(toks[j].w)`]),
  ['only the first word after "around" is what is orbited', R`for (; toks[j] && !FILLER.has(toks[j].w) && !STAR_NOUN.test(toks[j].w); j++) hidden.add(j);`, R`if (toks[j] && !FILLER.has(toks[j].w) && !STAR_NOUN.test(toks[j].w)) hidden.add(j);`],

  /* ---- numbers ---- */
  ['a thousands comma not read', R`  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) return parseFloat(x.replace(/,/g, ''));` + '\n', ``],
  ['a thousands comma ends the number', R`return parseFloat(x.replace(/,/g, ''));`, R`return parseFloat(x);`],
  ['a number with thousands and a decimal not read', R`(,\d{3})+(\.\d+)?$/`, R`(,\d{3})+$/`],
  ['"1,5" read as 1', R`if (x.includes(',') || /^[1-9]`, R`if (/^[1-9]`],
  ['"1.000" read as 1', R`|| /^[1-9]\d{0,2}(\.\d{3})+$/.test(x) || x.split`, R`|| x.split`],
  ['"1.2.3" read as 1.2', R`.test(x) || x.split('.').length > 2) return NaN;`, R`.test(x)) return NaN;`],
  ['a decimal point ends the number', R`const NUMBER = '(\\d+(?:[.,]\\d+)*)';`, R`const NUMBER = '(\\d+)';`],
  ['a number that cannot be read is used anyway', R`if (ok && !ok(m)) return null; `, ``],
  ['every number counted as sound', R`const sound = (x) => isNum(num(x[2]));`, R`const sound = () => true;`],

  /* ---- what a rule consumes, and the doubts ---- */
  ['only the first match of a rule consumed', R`spans.push({ a: m.index, b: m.index + m[0].length, fam });`, R`spans.push({ a: m.index, b: m.index + m[0].length, fam }); break;`],
  ['a rule that matches twice with two values is no doubt', R`      else if (one && m[0] !== first[0]) doubt(one);` + '\n', ``],
  ['a rule that matches twice with one value is a doubt', R`else if (one && m[0] !== first[0]) doubt(one);`, R`else if (one) doubt(one);`],
  ['a second value for one thing takes the place of the first', R`    if (k in ranges) { if (String(ranges[k]) !== String([lo, hi])) doubt('one thing is asked for twice, with two values'); return; }` + '\n', ``],
  ['a second value for one thing is dropped with no doubt', R`if (k in ranges) { if (String(ranges[k]) !== String([lo, hi])) doubt('one thing is asked for twice, with two values'); return; }`, R`if (k in ranges) return;`],
  ['the same value said twice is a doubt', R`if (String(ranges[k]) !== String([lo, hi])) doubt('one thing`, R`doubt('one thing`],
  ['a doubt said each time it is raised', R`const doubt = (why) => { if (!doubts.includes(why)) doubts.push(why); };`, R`const doubt = (why) => { doubts.push(why); };`],
  ['an unread word named each time it appears', R` && !unused.includes(k.w)) unused.push`, R`) unused.push`],
  ['a word read twice is no doubt', R`if (twice.length) doubt(`, R`if (false) doubt(`],
  ['a word needs three readings to be a doubt', R`if (fams.size > 1 && !twice.includes(k.w))`, R`if (fams.size > 2 && !twice.includes(k.w))`],
  ['cold with hot is no doubt', R`  if (cold && hot) doubt('cold and hot are both asked for');` + '\n', ``],
  ['two methods are no doubt', R`  if (methods.size > 1) doubt('more than one method of discovery is named');` + '\n', ``],
  ['of two methods the first is applied', R`const method = methods.size === 1 ? [...methods][0] : null;`, R`const method = methods.size ? [...methods][0] : null;`],
  ['complete with nothing read', R`complete: recognised > 0 && unused.length === 0 && doubts.length === 0, recognised };`, R`complete: unused.length === 0 && doubts.length === 0, recognised };`],
  ['complete with words unread', R`complete: recognised > 0 && unused.length === 0 && doubts.length === 0, recognised };`, R`complete: recognised > 0 && doubts.length === 0, recognised };`],
  ['complete with a doubt', R`complete: recognised > 0 && unused.length === 0 && doubts.length === 0, recognised };`, R`complete: recognised > 0 && unused.length === 0, recognised };`],
  ['an order not counted as something read', R`const recognised = notes.length + (sort ? 1 : 0);`, R`const recognised = notes.length;`],
  ['no kind reported as an empty list', R`looks: looks.length ? looks : null,`, R`looks,`],
  ['accents not folded', R`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`, ``],
  ['capitals not folded', R`.toLowerCase().normalize('NFD')`, R`.normalize('NFD')`],
  ['two spaces not made one', R`.replace(/\s+/g, ' ') + ' ';`, R` + ' ';`],
  ['"n\'t" not read as "not"', R`.replace(/n['\u2019]t\b/g, ' not')`, ``],
  ['only the first "n\'t" read as "not"', R`.replace(/n['\u2019]t\b/g, ' not')`, R`.replace(/n['\u2019]t\b/, ' not')`],
  ['"n\'t" read with the straight apostrophe only', R`n['\u2019]t`, R`n[']t`],
  ['"n\'t" read with the curly apostrophe only', R`n['\u2019]t`, R`n[\u2019]t`],

  /* ---- the host star ---- */
  ['an M dwarf up to 4,000 K', R`dwarf(null, 3900, 'M dwarf`, R`dwarf(null, 4000, 'M dwarf`],
  ['an M dwarf up to 3,800 K', R`dwarf(null, 3900, 'M dwarf`, R`dwarf(null, 3800, 'M dwarf`],
  ['an M-type star up to 4,000 K', R`set('Teff', null, 3900, 'M-type`, R`set('Teff', null, 4000, 'M-type`],
  ['an M-type star up to 3,800 K', R`set('Teff', null, 3900, 'M-type`, R`set('Teff', null, 3800, 'M-type`],
  ['a K dwarf from 3,800 K', R`dwarf(3900, 5300, 'K dwarf`, R`dwarf(3800, 5300, 'K dwarf`],
  ['a K dwarf up to 5,400 K', R`dwarf(3900, 5300, 'K dwarf`, R`dwarf(3900, 5400, 'K dwarf`],
  ['a K-type star from 3,800 K', R`set('Teff', 3900, 5300, 'K-type`, R`set('Teff', 3800, 5300, 'K-type`],
  ['a K-type star up to 5,400 K', R`set('Teff', 3900, 5300, 'K-type`, R`set('Teff', 3900, 5400, 'K-type`],
  ['a Sun-like star from 5,200 K', R`dwarf(5300, 6000, 'Sun-like`, R`dwarf(5200, 6000, 'Sun-like`],
  ['a Sun-like star up to 6,100 K', R`dwarf(5300, 6000, 'Sun-like`, R`dwarf(5300, 6100, 'Sun-like`],
  ['a G-type star from 5,200 K', R`set('Teff', 5300, 6000, 'G-type`, R`set('Teff', 5200, 6000, 'G-type`],
  ['a G-type star up to 6,100 K', R`set('Teff', 5300, 6000, 'G-type`, R`set('Teff', 5300, 6100, 'G-type`],
  ['a hot star from 5,900 K', R`set('Teff', 6000, null,`, R`set('Teff', 5900, null,`],
  ['a hot star from 6,100 K', R`set('Teff', 6000, null,`, R`set('Teff', 6100, null,`],
  ['a dwarf up to 2 solar radii', R`export const DWARF_RS = [0.08, 1.5];`, R`export const DWARF_RS = [0.08, 2];`],
  ['a dwarf from 0.01 solar radii, a white dwarf included', R`export const DWARF_RS = [0.08, 1.5];`, R`export const DWARF_RS = [0.01, 1.5];`],
  ['a dwarf by its temperature alone, a giant included', R`{ set('Teff', lo, hi, why); set('Rs', DWARF_RS[0], DWARF_RS[1],`, R`{ set('Teff', lo, hi, why); if (false) set('Rs', DWARF_RS[0], DWARF_RS[1],`],
  ['the radius of a dwarf not noted', 'DWARF_RS[1], `star of ${DWARF_RS[0]} to ${DWARF_RS[1]} R☉`); };', 'DWARF_RS[1], `on the main sequence`); };'],
  ['an M-type star read as an M dwarf', R`\bm type( stars?| hosts?)?\b/, 'host', t)) set('Teff', null, 3900,`, R`\bm type( stars?| hosts?)?\b/, 'host', t)) dwarf(null, 3900,`],
  ['a K-type star read as a K dwarf', R`\bk type( stars?| hosts?)?\b/, 'host', t)) set('Teff', 3900, 5300,`, R`\bk type( stars?| hosts?)?\b/, 'host', t)) dwarf(3900, 5300,`],
  ['a G-type star read as Sun-like', R`\bg type( stars?| hosts?)?\b/, 'host', t)) set('Teff', 5300, 6000,`, R`\bg type( stars?| hosts?)?\b/, 'host', t)) dwarf(5300, 6000,`],
  ['an M dwarf read by its temperature alone', R`dwarf(null, 3900, 'M dwarf`, R`set('Teff', null, 3900, 'M dwarf`],
  ['a K dwarf read by its temperature alone', R`dwarf(3900, 5300, 'K dwarf`, R`set('Teff', 3900, 5300, 'K dwarf`],
  ['a Sun-like star read by its temperature alone', R`dwarf(5300, 6000, 'Sun-like`, R`set('Teff', 5300, 6000, 'Sun-like`],
  ['the M dwarf note changed', R`'M dwarf host: star of 3,900 K or less'`, R`'M dwarf host: star under 3,900 K'`],
  ['the M-type note changed', R`'M-type host: star of 3,900 K or less'`, R`'M-type host: star under 3,900 K'`],
  ['the K dwarf note changed', R`'K dwarf host: star of 3,900 to 5,300 K'`, R`'K host: 3900-5300 K'`],
  ['the K-type note changed', R`'K-type host: star of 3,900 to 5,300 K'`, R`'K host: 3900-5300 K'`],
  ['the Sun-like host note changed', R`'Sun-like host: star of 5,300 to 6,000 K'`, R`'Sun-like host: 5300-6000 K'`],
  ['the G-type note changed', R`'G-type host: star of 5,300 to 6,000 K'`, R`'G host: 5300-6000 K'`],
  ['the hot host note changed', R`'hot host: star of 6,000 K or more'`, R`'hot host: star above 6,000 K'`],
  ...dropEach('M dwarf', R`\b(red|m) dwarfs?(`),
  ...dropEach('M dwarf, the noun after', R`dwarfs?( stars?| hosts?)?\b/, 'host', t)) dwarf(null`),
  silence('M type', R`\bm type( stars?| hosts?)?\b/, 'host'`),
  ...dropEach('M type, the noun after', R`m type( stars?| hosts?)?\b/, 'host'`),
  ...dropEach('K dwarf', R`\b(k|orange) dwarfs?(`),
  ...dropEach('K dwarf, the noun after', R`dwarfs?( stars?| hosts?)?\b/, 'host', t)) dwarf(3900`),
  silence('K type', R`\bk type( stars?| hosts?)?\b/, 'host'`),
  ...dropEach('K type, the noun after', R`k type( stars?| hosts?)?\b/, 'host'`),
  ...dropEach('Sun-like', R`(sun like|sunlike|solar type)(`),
  ...dropEach('Sun-like, the noun after', R`solar type)( stars?| hosts?)?\b/, 'host'`),
  silence('G type', R`\bg type( stars?| hosts?)?\b/, 'host'`),
  ...dropEach('G type, the noun after', R`g type( stars?| hosts?)?\b/, 'host'`),
  silence('F type', R`\bf type( stars?| hosts?)?\b|`),
  ...dropEach('F type, the noun after', R`f type( stars?| hosts?)?\b|\ba type`),
  silence('A type star', R`\ba type (stars?|hosts?)\b|`),
  ...dropEach('A type', R`a type (stars?|hosts?)\b|`),
  ['"a type" read as the star\'s class with no star beside it', R`\ba type (stars?|hosts?)\b|`, R`\ba type\b|`],
  silence('hot star', R`\bhot (host )?(stars?|hosts?|suns?)\b/, 'host'`),
  ['"hot host stars" not read', R`\bhot (host )?(stars?`, R`\bhot (stars?`],
  ...dropEach('hot star', R`(stars?|hosts?|suns?)\b/, 'host', t)) set('Teff', 6000`),

  /* ---- idioms ---- */
  ['a lava ocean read as a sea', R`[[/\b(lava|magma|molten) (oceans?|seas?|lakes?)\b/, 1, 'kind'], [`, R`[[`],
  ['a sea of lava read as a sea', R` [/\b(oceans?|seas?|lakes?) of (lava|magma)\b/, 2, 'kind'],`, ``],
  ['dry ice read as a desert', R`[/\b(dry) (ice)\b/, 2, 'kind'], `, ``],
  ['ice cold read as the ice kind', R`[/\b(ice|icy) (cold)\b/, 2, 'cold'], `, ``],
  ['cold as ice read as the ice kind', R`, [/\b(cold) (as ice)\b/, 1, 'cold']`, ``],
  ...dropEach('a lava ocean', R`(lava|magma|molten) (oceans?`),
  ...dropEach('a lava ocean', R`(oceans?|seas?|lakes?)\b/, 1, 'kind']`),
  ...dropEach('a sea of lava', R`(oceans?|seas?|lakes?) of (lava|magma)`),
  ...dropEach('a sea of lava', R`of (lava|magma)\b/, 2, 'kind']`),
  ...dropEach('ice cold', R`(ice|icy) (cold)`),
  ['the wrong half of an idiom kept', R`return keep === 1 ? g1 + blanks(m.slice(g1.length)) : blanks(m.slice(g2.length)) + g2;`, R`return keep !== 1 ? g1 + blanks(m.slice(g1.length)) : blanks(m.slice(g2.length)) + g2;`],
  ['the dropped half of an idiom left unread', R`      spans.push({ a: at, b: at + m.length, fam });` + '\n', ``],
  ['only the first of two idioms rewritten', R`w = w.replace(new RegExp(re.source, 'g'), (m, g1, g2, at) => {`, R`w = w.replace(new RegExp(re.source), (m, g1, g2, at) => {`],

  /* ---- sizes ---- */
  ['Earth-size from 0.8 down to 0.7', R`set('R', 0.8, 1.25, 'Earth-size`, R`set('R', 0.7, 1.25, 'Earth-size`],
  ['Earth-size up to 1.3', R`set('R', 0.8, 1.25, 'Earth-size`, R`set('R', 0.8, 1.3, 'Earth-size`],
  ['super-Earth from 1.25 down to 1.2', R`set('R', 1.25, 2, 'super-Earth`, R`set('R', 1.2, 2, 'super-Earth`],
  ['super-Earth up to 2.5', R`set('R', 1.25, 2, 'super-Earth`, R`set('R', 1.25, 2.5, 'super-Earth`],
  ['sub-Neptune from 2 down to 1.5', R`set('R', 2, 4, 'sub-Neptune`, R`set('R', 1.5, 4, 'sub-Neptune`],
  ['sub-Neptune up to 5', R`set('R', 2, 4, 'sub-Neptune`, R`set('R', 2, 5, 'sub-Neptune`],
  ['Neptune-size from 4 down to 3', R`set('R', 4, 8, 'Neptune-size`, R`set('R', 3, 8, 'Neptune-size`],
  ['Neptune-size up to 9', R`set('R', 4, 8, 'Neptune-size`, R`set('R', 4, 9, 'Neptune-size`],
  ['a giant from 7 R', R`\bgiants?\b/, 'size', ws)) set('R', 8, null,`, R`\bgiants?\b/, 'size', ws)) set('R', 7, null,`],
  ['a giant from 9 R', R`\bgiants?\b/, 'size', ws)) set('R', 8, null,`, R`\bgiants?\b/, 'size', ws)) set('R', 9, null,`],
  ['a hot Jupiter from 9 R', R`{ set('R', 8, null, 'giant`, R`{ set('R', 9, null, 'giant`],
  ['a hot Jupiter with a period up to 20 d', R`set('P', null, 10, 'period of 10 days or less'); }`, R`set('P', null, 20, 'period of 10 days or less'); }`],
  ['a hot Jupiter with a period up to 5 d', R`set('P', null, 10, 'period of 10 days or less'); }`, R`set('P', null, 5, 'period of 10 days or less'); }`],
  ['a hot Jupiter with no period', R` set('P', null, 10, 'period of 10 days or less'); }`, R` }`],
  ['rocky up to 1.7 R', R`set('R', null, 1.6, 'rocky`, R`set('R', null, 1.7, 'rocky`],
  ['rocky up to 1.5 R', R`set('R', null, 1.6, 'rocky`, R`set('R', null, 1.5, 'rocky`],
  ['the super-Earth note changed', R`'super-Earth: 1.25 to 2 R`, R`'super-Earth: 1.25-2 R`],
  ['the Earth-size note changed', R`'Earth-size: 0.8 to 1.25 R`, R`'Earth-size: 0.8-1.25 R`],
  ['the sub-Neptune note changed', R`'sub-Neptune: 2 to 4 R`, R`'sub-Neptune: 2-4 R`],
  ['the Neptune-size note changed', R`'Neptune-size: 4 to 8 R`, R`'Neptune-size: 4-8 R`],
  ['the rocky note says "under"', R`'rocky: 1.6 R⊕ or less'`, R`'rocky: under 1.6 R⊕'`],
  ['the giant note says "above"', R`\bgiants?\b/, 'size', ws)) set('R', 8, null, 'giant: 8 R⊕ or more'`, R`\bgiants?\b/, 'size', ws)) set('R', 8, null, 'giant: above 8 R⊕'`],
  ['the hot Jupiter notes changed', R`{ set('R', 8, null, 'giant: 8 R⊕ or more'); set('P', null, 10, 'period of 10 days or less'); }`, R`{ set('R', 8, null, 'giant: above 8 R⊕'); set('P', null, 10, 'period under 10 days'); }`],
  ['Earth-size tried before super-Earth', R`if (take(/\bsuper earths?( size| sized)?\b/, 'size', ws))`, R`if (take(/\bearth (size|sized)\b/, 'size', ws)) set('R', 0.8, 1.25, 'Earth-size: 0.8 to 1.25 R⊕');
  else if (take(/\bsuper earths?( size| sized)?\b/, 'size', ws))`],
  ['"bare rock" read as a size too', R`const ws = w.replace(/\bbare rock\b/g, blanks);`, R`const ws = w;`],
  silence('super-Earth', R`\bsuper earths?(`),
  ...dropEach('super-Earth, with "size"', R`super earths?( size| sized)?`),
  ...dropEach('Earth-size', R`\bearth (size|sized)\b/, 'size', ws)) set`),
  ...dropEach('sub-Neptune', R`\b(sub|mini) neptunes?(`),
  ...dropEach('sub-Neptune, with "size"', R`mini) neptunes?( size| sized)?`),
  silence('Neptune', R`\bneptunes?( size| sized)?\b|`),
  ...dropEach('Neptune, with "size"', R`\bneptunes?( size| sized)?\b|`),
  ...dropEach('ice giant', R`\b(ice|icy) giants?\b/, 'size'`),
  silence('hot Jupiter', R`\bhot jupiters?\b/, 'size', ws)) {`),
  silence('Jupiter', R`\bjupiters?( size| sized)?\b|`),
  ...dropEach('Jupiter, with "size"', R`\bjupiters?( size| sized)?\b|`),
  silence('gas giant', R`\bgas giants?\b|`),
  silence('giant', R`\bgiants?\b/, 'size', ws)) set('R'`),
  ...dropEach('rocky', R`(small|rocky|rock|terrestrial)`),

  /* ---- the kinds ---- */
  ...dropEach('seas', R`(oceans?|seas?|water worlds?|blue planets?|blue worlds?)\b/ },`),
  ...dropEach('desert', R`(deserts?|dry|dusty|arid|dunes?|mars like|like mars)`),
  ...dropEach('cloud deck', R`(cloudy|cloud covered|shrouded|overcast|greenhouse|venus like|like venus)`),
  ...dropEach('ice', R`(frozen|snowball|glaciers?|ic(e|y)(?! giants?))`),
  ['an icy giant read as the ice kind', R`ic(e|y)(?! giants?))`, R`ic(e|y))`],
  ...dropEach('airless', R`(airless|no air|no atmosphere|without (an |any )?atmosphere|bare rock|barren|cratered|moon like|mercury like)`),
  ...dropEach('airless, "without"', R`(an |any )?atmosphere`),
  ['"without atmosphere" needing an article', R`without (an |any )?atmosphere`, R`without (an |any )atmosphere`],
  ...dropEach('lava', R`(lava|molten|magma)\b/ },`),
  ...dropEach('no surface', R`(no surface|cloud tops)`),
  ['the label of the seas changed', R`label: 'drawn with seas'`, R`label: 'with seas'`],
  ['the label of the desert changed', R`label: 'thin-air desert'`, R`label: 'desert'`],
  ['the label of the cloud deck changed', R`label: 'cloud-shrouded'`, R`label: 'cloudy'`],
  ['the label of the ice changed', R`label: 'frozen'`, R`label: 'ice'`],
  ['the label of the airless rock changed', R`label: 'airless rock'`, R`label: 'airless'`],
  ['the label of the lava world changed', R`label: 'lava world'`, R`label: 'lava'`],
  ['the label of no surface changed', R`label: 'no surface'`, R`label: 'fluid'`],
  ['a kind word left unread', R`{ spans.push({ a: m.index, b: m.index + m[0].length, fam: 'kind' }); kindAt.push(`, R`{ kindAt.push(`],
  ['one kind named by two words counted twice', R`if (!looks.includes(k.look)) looks.push(k.look);`, R`looks.push(k.look);`],
  ['the kinds taken in the order of the list, not of the question', R`  kindAt.sort((x, y) => x.a - y.a);` + '\n', ``],
  ['two words for one kind side by side are a doubt', R`    if (kindAt[i].look === kindAt[i - 1].look) continue;` + '\n', ``],
  ['"or" between two kinds not read', R`if (between === 'or') spans.push({ a: kindAt[i - 1].b + 1, b: kindAt[i].a - 1, fam: 'kind' });
    else if (between !== 'and')`, R`if (between !== 'and' && between !== 'or')`],
  ['two kinds joined by "and" are a doubt', R`else if (between !== 'and') doubt(`, R`else doubt(`],
  ['two kinds side by side are no doubt', R`    else if (between !== 'and') doubt('two kinds of world are named side by side');` + '\n', ``],
  ['two kinds noted with a comma', R`.join(' or '));` + '\n' + R`  if (take(LOCKED`, R`.join(', '));` + '\n' + R`  if (take(LOCKED`],
  ['a kind with no note', R`  if (looks.length) notes.push(looks.map(`, R`  if (false) notes.push(looks.map(`],

  /* ---- one face to the star ---- */
  ...dropEach('locked', R`const LOCKED = /\b((tidally |tide )?locked|one face|eyeball|permanent day|eternal day|synchronous( rotation)?)(`),
  ...dropEach('locked, the word before', R`(tidally |tide )?locked`),
  ['"synchronous rotation": the second word left unread', R`synchronous( rotation)?)`, R`synchronous)`],
  ['the star a world is locked to left unread', R`( to (its|their|the) (stars?|suns?|hosts?))?\b/;`, R`\b/;`],
  ...dropEach('locked to', R`to (its|their|the) (stars?|suns?|hosts?))?\b/;`),
  ...dropEach('locked to its', R`(stars?|suns?|hosts?))?\b/;`),
  ['a locked world with no note', R`{ locked = true; notes.push(LOCKED_WORDS); }`, R`{ locked = true; }`],
  ['the words for a locked world changed', R`export const LOCKED_WORDS = 'drawn with one face to its star';`, R`export const LOCKED_WORDS = 'one face to its star';`],

  /* ---- the zone, cold, hot ---- */
  ...dropEach('the zone', R`(temperate|habitable( zones?)?|goldilocks( zones?)?|liquid water)(`),
  ['"zone" after "habitable" left unread', R`habitable( zones?)?|`, R`habitable|`],
  ['"zone" after "goldilocks" left unread', R`goldilocks( zones?)?|`, R`goldilocks|`],
  ['"habitable zones" not read', R`habitable( zones?)?|`, R`habitable( zone)?|`],
  ['"goldilocks zones" not read', R`goldilocks( zones?)?|`, R`goldilocks( zone)?|`],
  ['the star whose zone it is left unread', R`liquid water)( of (its|their|the) (stars?|suns?|hosts?))?\b`, R`liquid water)\b`],
  ...dropEach('the zone of', R`of (its|their|the) (stars?|suns?|hosts?))?\b/, 'zone'`),
  ...dropEach('the zone of its', R`(stars?|suns?|hosts?))?\b/, 'zone'`),
  ['the zone without its optimistic bound', R`{ zone = ['cons', 'opt']; notes.push(`, R`{ zone = ['cons']; notes.push(`],
  ['the zone with no note', R`{ zone = ['cons', 'opt']; notes.push('inside the habitable zone'); }`, R`{ zone = ['cons', 'opt']; }`],
  ...dropEach('cold', R`(cold|chilly|freezing|frigid)\b/, 'cold'`),
  ['cold also set as a zone', R`{ cold = true; notes.push(COLD_WORDS); }`, R`{ cold = true; zone = ['cold']; notes.push(COLD_WORDS); }`],
  ['cold with no note', R`{ cold = true; notes.push(COLD_WORDS); }`, R`{ cold = true; }`],
  ...dropEach('hot', R`(hot|scorching)\b/, 'hot'`),
  ['"hot Jupiters" read as a hot planet too', R`w.replace(/\bhot jupiters?\b/g, blanks)`, R`w`],
  ['hot with no note', R`{ hot = true; notes.push(HOT_WORDS); }`, R`{ hot = true; }`],
  ['the words for cold changed', 'export const COLD_WORDS = `cold: equilibrium temperature under', 'export const COLD_WORDS = `cold: Teq under'],
  ['the words for hot changed', 'export const HOT_WORDS = `hot: equilibrium temperature of', 'export const HOT_WORDS = `hot: Teq of'],
  ['the bound of hot printed with no thousands mark', R`of ${'$'}{thousands(HOT_K)} K or more`, R`of ${'$'}{HOT_K} K or more`],

  /* ---- distance from here ---- */
  ...dropEach('within', R`(within|under|inside|less than|closer than|nearer than|up to)`),
  ...dropEach('beyond', R`(beyond|over|more than|farther than|further than)`),
  ...dropEach('a unit of distance', R`const UNIT = '(light ?years?|ly|parsecs?|pc)';`),
  ['a light-year written only as two words', R`const UNIT = '(light ?years?|ly|`, R`const UNIT = '(light years?|ly|`],
  ['a distance with no unit', R`const UNIT = '(light ?years?|ly|parsecs?|pc)';`, R`const UNIT = '(light ?years?|ly|parsecs?|pc)?';`],
  ['"away" after a distance left unread', R`const FROM_US = '( away)?( from`, R`const FROM_US = '( from`],
  ['"from us" after a distance left unread', R`( from (us|earth|here|home|the sun|our sun))?';`, R`';`],
  ...dropEach('measured from', R`from (us|earth|here|home|the sun|our sun))?';`),
  ['a parsec taken as 3 light-years', R`(/p/.test(x[3]) ? 3.26156 : 1)`, R`(/p/.test(x[3]) ? 3 : 1)`],
  ['a parsec taken as a light-year', R`(/p/.test(x[3]) ? 3.26156 : 1)`, R`(1)`],
  ['"within" read as a lower bound', R`set('dist', null, ly(m), `, R`set('dist', ly(m), null, `],
  ['"beyond" read as an upper bound', R`set('dist', ly(m), null, `, R`set('dist', null, ly(m), `],
  ['two distances within are no doubt', R`{ ok: sound, one: twoDistances }))) set('dist', null, ly(m),`, R`{ ok: sound }))) set('dist', null, ly(m),`],
  ['two distances beyond are no doubt', R`{ ok: sound, one: twoDistances }))) set('dist', ly(m), null,`, R`{ ok: sound }))) set('dist', ly(m), null,`],
  ['a distance noted with no thousands mark', "`within ${thousands(Math.round(ly(m)))} ly`", "`within ${Math.round(ly(m))} ly`"],
  ['a distance noted unrounded', "`within ${thousands(Math.round(ly(m)))} ly`", "`within ${thousands(ly(m))} ly`"],
  ['the note for "beyond" changed', "`${thousands(Math.round(ly(m)))} ly or farther`", "`farther than ${thousands(Math.round(ly(m)))} ly`"],
  ['"near us" within 40 ly', R`set('dist', null, 50, 'within 50 ly')`, R`set('dist', null, 40, 'within 50 ly')`],
  ['"near us" within 60 ly', R`set('dist', null, 50, 'within 50 ly')`, R`set('dist', null, 60, 'within 50 ly')`],
  ['the note for "near us" changed', R`set('dist', null, 50, 'within 50 ly')`, R`set('dist', null, 50, 'near us')`],
  ...dropEach('near us', R`(nearby|neighbou?rs?|neighbou?rhood|near (us|me|earth(?! siz)|here|home|the sun|our sun|sol)|close to (us|earth(?! siz)|home|here|the sun|our sun))\b/, 'dist', w)`),
  ...dropEach('near', R`near (us|me|earth(?! siz)|here|home|the sun|our sun|sol)`),
  ...dropEach('close to', R`close to (us|earth(?! siz)|home|here|the sun|our sun))\b/, 'dist'`),
  ['"near earth size" read as near us', R`near (us|me|earth(?! siz)|`, R`near (us|me|earth|`],
  ['"close to earth size" read as near us', R`close to (us|earth(?! siz)|`, R`close to (us|earth|`],
  ['"near" and "close" alone read as near us', R`\b(nearby|neighbou?rs?`, R`\b(nearby|near|close|neighbou?rs?`],
  ['"nearest" also limits the distance', R`\b(nearby|neighbou?rs?`, R`\b(nearby|nearest|closest|neighbou?rs?`],
  ['the American spelling of neighbour not read', R`neighbou?rs?|neighbou?rhood`, R`neighbours?|neighbourhood`],

  /* ---- the period ---- */
  ['ultra short up to 2 d', R`set('P', null, 1, 'period of 1 day or less')`, R`set('P', null, 2, 'period of 1 day or less')`],
  ['ultra short up to half a day', R`set('P', null, 1, 'period of 1 day or less')`, R`set('P', null, 0.5, 'period of 1 day or less')`],
  ['short period up to 20 d', R`\bshort period\b/, 'period', w)) set('P', null, 10,`, R`\bshort period\b/, 'period', w)) set('P', null, 20,`],
  ['short period up to 5 d', R`\bshort period\b/, 'period', w)) set('P', null, 10,`, R`\bshort period\b/, 'period', w)) set('P', null, 5,`],
  ['long period from 300 d', R`set('P', 365, null,`, R`set('P', 300, null,`],
  ['long period from 400 d', R`set('P', 365, null,`, R`set('P', 400, null,`],
  ['the ultra short note changed', R`'period of 1 day or less')`, R`'period under 1 day')`],
  ['the short period note changed', R`\bshort period\b/, 'period', w)) set('P', null, 10, 'period of 10 days or less')`, R`\bshort period\b/, 'period', w)) set('P', null, 10, 'period under 10 days')`],
  ['the long period note changed', R`'period of a year or more')`, R`'period over a year')`],
  ['"period" after "ultra short" left unread', R`\bultra short( period)?\b`, R`\bultra short\b`],
  silence('ultra short', R`\bultra short( period)?\b`),
  silence('short period', R`\bshort period\b`),
  silence('long period', R`\blong period\b`),

  /* ---- the year and the method ---- */
  ['"after" includes its year', R`+ (m[1] === 'after' ? 1 : 0), null,`, R`+ 0, null,`],
  ['"since" leaves out its year', R`+ (m[1] === 'after' ? 1 : 0), null,`, R`+ 1, null,`],
  ['"before" includes its year', R`+(m[1] + m[2]) - 1,`, R`+(m[1] + m[2]),`],
  ['"in" a year is that year and every later one', R`set('year', +(m[1] + m[2]), +(m[1] + m[2]),`, R`set('year', +(m[1] + m[2]), null,`],
  ['"since" reads any century', R`\b(since|after) (19|20)(\d\d)\b`, R`\b(since|after) (\d\d)(\d\d)\b`],
  ['"before" reads any century', R`\bbefore (19|20)(\d\d)\b`, R`\bbefore (\d\d)(\d\d)\b`],
  ['"in" reads any century', R`\bin (19|20)(\d\d)\b`, R`\bin (\d\d)(\d\d)\b`],
  ['"since" reads this century only', R`\b(since|after) (19|20)(\d\d)\b`, R`\b(since|after) (20)(\d\d)\b`],
  ['"before" reads this century only', R`\bbefore (19|20)(\d\d)\b`, R`\bbefore (20)(\d\d)\b`],
  ['"in" reads this century only', R`\bin (19|20)(\d\d)\b`, R`\bin (20)(\d\d)\b`],
  ['two years since are no doubt', R`\b(since|after) (19|20)(\d\d)\b/, 'year', w, { one: twoYears })`, R`\b(since|after) (19|20)(\d\d)\b/, 'year', w)`],
  ['two years before are no doubt', R`\bbefore (19|20)(\d\d)\b/, 'year', w, { one: twoYears })`, R`\bbefore (19|20)(\d\d)\b/, 'year', w)`],
  ['two years in are no doubt', R`\bin (19|20)(\d\d)\b/, 'year', w, { one: twoYears })`, R`\bin (19|20)(\d\d)\b/, 'year', w)`],
  ...dropEach('since', R`(since|after) (19|20)`),
  silence('before a year', R`\bbefore (19|20)`),
  silence('in a year', R`\bin (19|20)`),
  ['the notes for "since" and "after" the wrong way round', "m[1] === 'after' ? `found after ${m[2]}${m[3]}` : `found in ${m[2]}${m[3]} or later`", "m[1] !== 'after' ? `found after ${m[2]}${m[3]}` : `found in ${m[2]}${m[3]} or later`"],
  ['the note for "before" changed', "`found before ${m[1]}${m[2]}`", "`before ${m[1]}${m[2]}`"],
  ['the note for "in" changed', "`found in ${m[1]}${m[2]}`", "`in ${m[1]}${m[2]}`"],
  ['"other" asked for as a method', R`    if (g.key === 'other') continue;` + '\n', ``],
  ['a method read by its first letters only', R`g.label.toLowerCase() + '\\w*'`, R`g.label.toLowerCase()`],
  ['a method word that sets no method', R`'method', w)) methods.add(g.key);`, R`'method', w)) methods.size;`],
  ['"microlensed" not read', R`  if (take(/\bmicrolens\w*/, 'method', w)) methods.add('Microlensing');` + '\n', ``],
  ...dropEach('radial velocity', R`(rv|doppler)`),
  ...dropEach('imaging', R`(directly imaged|direct imaging|imaged)`),
  ['a method with no note', "  if (method) notes.push(`found by ${method.toLowerCase()}`);\n", ``],

  /* ---- the order ---- */
  ['most Earth-like last', R`sort = { key: 'earthlike', dir: -1 };`, R`sort = { key: 'earthlike', dir: 1 };`],
  ['hottest last', R`sort = { key: 'T', dir: -1 };`, R`sort = { key: 'T', dir: 1 };`],
  ['coldest last', R`sort = { key: 'T', dir: 1 };`, R`sort = { key: 'T', dir: -1 };`],
  ['hottest by the published temperature only', R`sort = { key: 'T', dir: -1 };`, R`sort = { key: 'Teq', dir: -1 };`],
  ['nearest last', R`sort = { key: 'dist', dir: 1 };`, R`sort = { key: 'dist', dir: -1 };`],
  ['largest last', R`sort = { key: 'R', dir: -1 };`, R`sort = { key: 'R', dir: 1 };`],
  ['smallest last', R`sort = { key: 'R', dir: 1 };`, R`sort = { key: 'R', dir: -1 };`],
  ['most recently found last', R`sort = { key: 'year', dir: -1 };`, R`sort = { key: 'year', dir: 1 };`],
  ['earliest found last', R`sort = { key: 'year', dir: 1 };`, R`sort = { key: 'year', dir: -1 };`],
  silence('Earth-like', R`\b(most )?earth like\b|`),
  ['"most" before "earth like" left unread', R`\b(most )?earth like\b|`, R`\bearth like\b|`],
  silence('Earth twin', R`\bearth twins?\b/, 'sort'`),
  silence('hottest', R`\bhottest\b/, 'sort'`),
  silence('coldest', R`\bcoldest\b/, 'sort'`),
  ...dropEach('nearest', R`(nearest|closest)\b( to`),
  ['"to us" after "nearest" left unread', R`( to (us|earth|home|here|the sun|our sun)\b)?(?! to`, R`(?! to`],
  ...dropEach('nearest to', R`to (us|earth|home|here|the sun|our sun)\b)?(?! to`),
  ['"closest to its star" orders by the distance from here', R`(?! to (its|their|a|the) (own |parent )?(stars?|hosts?|suns?)\b| in(`, R`(?! in(`],
  ...dropEach('closest to its star', R`(its|their|a|the) (own |parent )?(stars?`),
  ...dropEach('closest to its own star', R`(own |parent )?(stars?|hosts?|suns?)\b| in(`),
  ['"closest to its star" needing a word between', R`(own |parent )?(stars?|hosts?|suns?)\b| in(`, R`(own |parent )(stars?|hosts?|suns?)\b| in(`],
  ...dropEach('closest to its star', R`(stars?|hosts?|suns?)\b| in(`),
  ['"closest in" orders by the distance from here', R`| in( planets?| worlds?| orbits?)? $)/`, R`)/`],
  ...dropEach('closest in', R`in( planets?| worlds?| orbits?)? $)/`),
  ...dropEach('largest', R`(largest|biggest)`),
  silence('smallest', R`\bsmallest\b`),
  ...dropEach('most recently found', R`(newest|latest|recent|recently)`),
  silence('earliest', R`\bearliest\b|`),
  silence('first found', R`\bfirst (found|discovered|known)\b`),
  ...dropEach('first found', R`first (found|discovered|known)\b/, 'sort'`),
  ['"oldest" read as the earliest found', R`\bearliest\b|`, R`\b(earliest|oldest)\b|`],
  ['"first" alone read as the earliest found', R`\bfirst (found|discovered|known)\b/, 'sort'`, R`\bfirst\b/, 'sort'`],

  /* ---- when a model is asked ---- */
  ['a question read in full sent to a model', R`=> !r.complete && (r.recognised > 0 ||`, R`=> (r.recognised > 0 ||`],
  ['a short unread word beside something read not sent', R`(r.recognised > 0 || r.unused.some(`, R`(r.unused.some(`],
  ['a question with only unread words not sent', R`(r.recognised > 0 || r.unused.some((x) => /[a-z]{3}/.test(x)));`, R`(r.recognised > 0);`],
  ['a scrap of one letter sent', R`/[a-z]{3}/.test(x)`, R`/[a-z]{1}/.test(x)`],
  ['an unread word needs four letters to be sent', R`/[a-z]{3}/.test(x)`, R`/[a-z]{4}/.test(x)`],

  /* ---- the note ---- */
  ['a model\'s reading printed as not applied', R`if (by !== PAGE || r.complete) {`, R`if (r.complete) {`],
  ['the page\'s complete reading printed as not applied', R`if (by !== PAGE || r.complete) {`, R`if (by !== PAGE) {`],
  ['a question that only orders says nothing was read', R`r.notes.join(', ') || 'every planet'`, R`r.notes.join(', ') || 'nothing'`],
  ['one match printed as "1 matches"', R`${'$'}{count === 1 ? 'match' : 'matches'}`, R`matches`],
  ['an order alone counted in matches', "r.notes.length ? `${thousands(count)} ${count === 1 ? 'match' : 'matches'}` : `${thousands(count)} planets`", "`${thousands(count)} ${count === 1 ? 'match' : 'matches'}`"],
  ['the count printed with no thousands mark', "r.notes.length ? `${thousands(count)} ${count", "r.notes.length ? `${count} ${count"],
  ['the page not named as the reader', R`export const PAGE = 'this page\'s own rules';`, R`export const PAGE = 'the parser';`],
  ['"that large" said with matches on screen', R`if (count === 0 && r.looks && !r.looks.includes('fluid')`, R`if (r.looks && !r.looks.includes('fluid')`],
  ['"that large" said of a world with no surface', R`r.looks && !r.looks.includes('fluid') && r.ranges.R`, R`r.looks && r.ranges.R`],
  ['"that large" from 1 R', R`r.ranges.R[0] >= 4) s +=`, R`r.ranges.R[0] >= 1) s +=`],
  ['"that large" from 5 R', R`r.ranges.R[0] >= 4) s +=`, R`r.ranges.R[0] >= 5) s +=`],
  ['the imaging sentence said with matches on screen', R`if (count === 0 && (r.cold || r.hot) && r.method === 'Imaging')`, R`if ((r.cold || r.hot) && r.method === 'Imaging')`],
  ['the imaging sentence said of any method', R`(r.cold || r.hot) && r.method === 'Imaging') s +=`, R`(r.cold || r.hot)) s +=`],
  ['the imaging sentence said with no cold or hot asked', R`if (count === 0 && (r.cold || r.hot) && r.method`, R`if (count === 0 && r.method`],
  ['the imaging sentence not said for hot', R`(r.cold || r.hot) && r.method === 'Imaging'`, R`(r.cold) && r.method === 'Imaging'`],
  ['the imaging sentence not said for cold', R`(r.cold || r.hot) && r.method === 'Imaging'`, R`(r.hot) && r.method === 'Imaging'`],
  ['Ranges named with no numbers to change', R`if (Object.keys(r.ranges).length) s += ' The numbers can be changed under Ranges.';`, R`s += ' The numbers can be changed under Ranges.';`],
  ['Ranges not named', R`    if (Object.keys(r.ranges).length) s += ' The numbers can be changed under Ranges.';` + '\n', ``],
  ['a turn not named in the note', "  if (r.turned) return `${head}: the word “${r.turned}” is not read here, so nothing was filtered.`;\n", ``],
  ['a doubt not said in the note', "  if (r.doubts.length) return `${head}: ${r.doubts.join('; ')}, so nothing was filtered.`;\n", ``],
  ['a question with nothing in it said to have unread words', "  if (!r.unused.length) return `${head}: it names nothing to filter or to order by.`;\n", ``],
  ['a question with nothing in it said to be unread', "`${head}: it names nothing to filter or to order by.`", "`${head}: nothing in it was read.`"],
  ['a word read two ways said as a claim', R`could belong to two different readings`, R`claimed by two readings`],
  ['what the rest would read as said when nothing was read', R`const rest = r.recognised ? `, R`const rest = true ? `],
  ['what the rest would read as never said', R`const rest = r.recognised ? `, R`const rest = false ? `],
  ['"it" and "them" the wrong way round', R`r.unused.length === 1 ? 'it' : 'them'`, R`r.unused.length === 1 ? 'them' : 'it'`],
  ['an order alone left out of what the rest would read as', R`r.notes.join(', ') || order}.`, R`r.notes.join(', ')}.`],
  ['the note does not say nothing was filtered', "`${head}: not read: ${r.unused.join(', ')}. Nothing was filtered.${rest}`", "`${head}: not read: ${r.unused.join(', ')}.${rest}`"],

  /* ---- a model's reply ---- */
  ['an empty end of a range read as zero', R`(v === null || v === undefined || v === '' ? null`, R`(v === null || v === undefined ? null`],
  ['a range open at both ends kept', R`if (Number.isNaN(lo) || Number.isNaN(hi) || (lo === null && hi === null)) continue;`, R`if (Number.isNaN(lo) || Number.isNaN(hi)) continue;`],
  ['a lower end that is not a number kept', R`if (Number.isNaN(lo) || Number.isNaN(hi) || (lo === null && hi === null)) continue;`, R`if (Number.isNaN(hi) || (lo === null && hi === null)) continue;`],
  ['an upper end that is not a number kept', R`if (Number.isNaN(lo) || Number.isNaN(hi) || (lo === null && hi === null)) continue;`, R`if (Number.isNaN(lo) || (lo === null && hi === null)) continue;`],
  ['a range the wrong way round kept', R`    if (lo !== null && hi !== null && lo > hi) continue;` + '\n', ``],
  ['a range of one value dropped', R`lo !== null && hi !== null && lo > hi`, R`lo !== null && hi !== null && lo >= hi`],
  ['a range written as min and max: the lower end lost', R`end(Array.isArray(r) ? r[0] : r.min)`, R`end(r[0])`],
  ['a range written as min and max: the upper end lost', R`end(Array.isArray(r) ? r[1] : r.max)`, R`end(r[1])`],
  ['a range with no upper end noted as one with no lower end', "lo === null ? `up to ${show(hi)}` : hi === null ? `from ${show(lo)}`", "hi === null ? `up to ${show(lo)}` : lo === null ? `from ${show(hi)}`"],
  ['a range noted with no unit', "`${show(lo)} to ${show(hi)}`} ${f.unit}`.trim());", "`${show(lo)} to ${show(hi)}`}`.trim());"],
  ['a range noted with a dash', "`${show(lo)} to ${show(hi)}`", "`${show(lo)}-${show(hi)}`"],
  ['a year noted with a thousands mark', R`(f.key === 'year' ? String(v) : thousands(v))`, R`(thousands(v))`],
  ['a range noted with no thousands mark', R`(f.key === 'year' ? String(v) : thousands(v))`, R`(String(v))`],
  ['habitable_zone taken from any truthy value', R`if (j.habitable_zone === true)`, R`if (j.habitable_zone)`],
  ['the zone from a reply with another note', R`{ out.zone = ['cons', 'opt']; out.notes.push('inside the habitable zone'); }`, R`{ out.zone = ['cons', 'opt']; out.notes.push('zone'); }`],
  ['the method "other" accepted', R`g.key !== 'other' && g.key === j.method`, R`g.key === j.method`],
  ['any method accepted', R`g.key !== 'other' && g.key === j.method`, R`g.key !== 'other'`],
  ['the method note of a reply changed', "out.notes.push(`found by ${j.method.toLowerCase()}`);", "out.notes.push(`by ${j.method.toLowerCase()}`);"],
  ['a kind checked against every property of the list', R`Object.prototype.hasOwnProperty.call(LOOKS, k)`, R`k in LOOKS`],
  ['a kind the picture does not have kept', R`typeof k === 'string' && Object.prototype.hasOwnProperty.call(LOOKS, k)`, R`typeof k === 'string'`],
  ['a kind kept twice', R`? [...new Set(j.kinds.filter((k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(LOOKS, k)))] : [];`, R`? j.kinds.filter((k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(LOOKS, k)) : [];`],
  ['the kinds of a reply noted with a comma', R`.label).join(' or ')); }`, R`.label).join(', ')); }`],
  ['tidally_locked taken from any truthy value', R`if (j.tidally_locked === true)`, R`if (j.tidally_locked)`],
  ['temperature "cold" read as hot', R`if (j.temperature === 'cold') { out.cold = true;`, R`if (j.temperature === 'cold') { out.hot = true;`],
  ['temperature "hot" read as cold', R`else if (j.temperature === 'hot') { out.hot = true;`, R`else if (j.temperature === 'hot') { out.cold = true;`],
  ['any temperature read as cold', R`if (j.temperature === 'cold')`, R`if (j.temperature)`],
  ['any other temperature read as hot', R`else if (j.temperature === 'hot')`, R`else if (j.temperature)`],
  ['a sort on any key kept', R`if (j.sort && SORTS.includes(j.sort.key))`, R`if (j.sort)`],
  ...SORT_KEYS.map((k) => [`a sort by ${k} dropped`, R`const SORTS = ['earthlike', 'Teq', 'dist', 'R', 'P', 'year', 'S'];`, `const SORTS = [${SORT_KEYS.filter((x) => x !== k).map((x) => `'${x}'`).join(', ')}];`]),
  ['a sort by Teq left on the published temperature', R`key: j.sort.key === 'Teq' ? 'T' : j.sort.key,`, R`key: j.sort.key,`],
  ['a sort turned round', R`j.sort.dir === 'asc' || j.sort.dir === 1 ? 1 : -1`, R`j.sort.dir === 'asc' || j.sort.dir === 1 ? -1 : 1`],
  ['"asc" not read as ascending', R`j.sort.dir === 'asc' || j.sort.dir === 1 ? 1 : -1`, R`j.sort.dir === 1 ? 1 : -1`],
  ['1 not read as ascending', R`j.sort.dir === 'asc' || j.sort.dir === 1 ? 1 : -1`, R`j.sort.dir === 'asc' ? 1 : -1`],
  ['a sort alone not counted as a reading', R`out.recognised = out.notes.length + (out.sort ? 1 : 0);`, R`out.recognised = out.notes.length;`],
  ['an empty reply returned as a reading', R`return out.recognised ? out : null;`, R`return out;`],
  ['a reply that passed not marked complete', R`doubts: [], turned: null, complete: true };`, R`doubts: [], turned: null, complete: false };`],
  ...dropLines('a field a range may be on', [
    R`  { key: 'R', label: 'Radius', unit: 'R⊕' },`, R`  { key: 'Teq', label: 'Teq (published)', unit: 'K' },`, R`  { key: 'S', label: 'Insolation', unit: 'S⊕' },`,
    R`  { key: 'dist', label: 'Distance', unit: 'ly' },`, R`  { key: 'Teff', label: 'Star Teff', unit: 'K' },`, R`  { key: 'Rs', label: 'Star radius', unit: 'R☉' },`, R`  { key: 'P', label: 'Period', unit: 'd' },`, R`  { key: 'year', label: 'Discovered', unit: '' },`]),
  ['the unit of a radius changed', R`label: 'Radius', unit: 'R⊕'`, R`label: 'Radius', unit: 'R'`],
  ['the unit of a temperature changed', R`label: 'Teq (published)', unit: 'K'`, R`label: 'Teq (published)', unit: 'kelvin'`],
  ['the unit of the starlight changed', R`label: 'Insolation', unit: 'S⊕'`, R`label: 'Insolation', unit: 'S'`],
  ['the unit of a distance changed', R`label: 'Distance', unit: 'ly'`, R`label: 'Distance', unit: 'pc'`],
  ['the unit of the star\'s temperature changed', R`label: 'Star Teff', unit: 'K'`, R`label: 'Star Teff', unit: 'kelvin'`],
  ['the unit of the star\'s radius changed', R`label: 'Star radius', unit: 'R☉'`, R`label: 'Star radius', unit: 'R'`],
  ['the unit of a period changed', R`label: 'Period', unit: 'd'`, R`label: 'Period', unit: 'days'`],
  ['a unit given to the year', R`label: 'Discovered', unit: ''`, R`label: 'Discovered', unit: 'AD'`],

  /* ---- what the model is told, and the one call ---- */
  ['the model told that distances are in parsecs', R`dist in light-years, `, R`dist in parsecs, `],
  ['the model told that cold is under 300 K', '(equilibrium temperature under ${COLD_K} K)', '(equilibrium temperature under ${COLD_K + 100} K)'],
  ['the model told that hot is from 1,500 K', '"hot" (${HOT_K} K or more)', '"hot" (${HOT_K + 500} K or more)'],
  ['the model not told how to write a negation', R`  'A negation ("not cold", "outside the habitable zone") must be written as the ranges that hold, never as the thing negated. ' +` + '\n', ``],
  ['the model not told the unit of a radius', R`R in Earth radii, `, R`R the radius, `],
  ['the model not told that Teq is the published one', R`Teq in kelvin (published equilibrium temperature), `, R`Teq in kelvin, `],
  ['the model not told the unit of the star\'s radius', R`Rs radius of the host star in solar radii, `, ``],
  ['the model not told the unit of a period', R`P orbital period in days, `, R`P orbital period, `],
  ['the model not told of the star\'s radius as a field', R`"Teff": [min, max], "Rs": [min, max], "P"`, R`"Teff": [min, max], "P"`],
  ['the model not told of the lava kind', R`"molten" (lava), `, ``],
  ['the model not told of imaging', R`"Microlensing", "Imaging" or null`, R`"Microlensing" or null`],
  ['the model not told how to leave an end open', R`  'Use null for an open end. Include only the fields the question needs.';`, R`  'Include only the fields the question needs.';`],
  ['the model sent no instructions', R`system: SYSTEM, prompt:`, R`system: '', prompt:`],
  ['the whole question sent, however long', R`String(question).slice(0, QUESTION_MAX)`, R`String(question)`],
  ['a question cut at 400 characters', R`export const QUESTION_MAX = 300;`, R`export const QUESTION_MAX = 400;`],
  ['a fallback\'s answer taken for a model\'s', R`res.source === 'offline' ? null : validateQuery(res.json)`, R`validateQuery(res.json)`],
  ['the reply not asked for as JSON', R`json: true, temperature: 0,`, R`json: false, temperature: 0,`],
  ['the model asked at temperature 0.4', R`json: true, temperature: 0,`, R`json: true, temperature: 0.4,`],
  ['the abort signal not passed on', R`timeoutMs: AI.timeoutMs, signal, fallback: () => null,`, R`timeoutMs: AI.timeoutMs, fallback: () => null,`],
];
