/* ============================================================
   The question reader of the survey's search (query.js). Run
   from the repository root:
     node labs/assets/js/exoplanet/tests/query.test.mjs

   The reader's first rule is that a reading is complete only
   when every word was read, and the page filters nothing on an
   incomplete one. So each rule here has phrases that must be
   read in full with the right values ("reads") and near phrases
   that must stop the reading ("stops"): "cold planets" reads,
   "cold stars", "less cold planets" and "planets that arent
   cold" stop. The note the page prints (say) and the check of a
   model's reply (validateQuery) are tested on their text.

   query.mutants.test.mjs breaks each rule in turn and runs this
   file: a rule added here needs an entry there.
   ============================================================ */

import { parseQuestion, validateQuery, needsModel, say, askModel, KINDS, RANGE_FIELDS, COLD_WORDS, HOT_WORDS, LOCKED_WORDS, PAGE, QUESTION_MAX, FILLER, TURNS, DWARF_RS, SYSTEM } from '../query.js';
import { COLD_K, HOT_K } from '../find.js';
import { LOOKS } from '../data.js';
import { LLM } from '../../ai/llm.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
/* a check that throws is a failed check, with a line that says so, and the run ends there */
const stop = (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); };
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);

const P = parseQuestion;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (q) => JSON.stringify({ ranges: q.ranges, zone: q.zone, looks: q.looks, locked: q.locked, cold: q.cold, hot: q.hot, method: q.method, sort: q.sort, unused: q.unused, doubts: q.doubts, turned: q.turned, complete: q.complete });
const holds = (s, test) => { try { return !!test(P(s)); } catch { return false; } };
const each = (name, phrases, test) => { const bad = phrases.filter((s) => !holds(s, test)); yes(name, bad.length === 0, bad.map((s) => `${s} -> ${show(P(s))}`).join(' | ')); };
/* every phrase is read in full, and the reading passes the test */
const reads = (name, phrases, test = () => true) => each(name, phrases, (q) => q.complete && same(q.unused, []) && test(q));
/* no phrase is read in full, so the page would filter nothing; the test says what the reading must still show */
const stops = (name, phrases, test = () => true) => each(name, phrases, (q) => !q.complete && test(q));
/* what a reading would filter by, apart from the fields a check names */
const nothingElse = (q, ...keep) => ['zone', 'looks', 'locked', 'cold', 'hot', 'method', 'sort'].every((k) => keep.includes(k) || q[k] === null) && (keep.includes('ranges') || same(q.ranges, {}));

/* ---- the search knows every kind of world the picture draws ---- */
{
  yes('every kind the picture draws has words in the search, and the search names no other', same(KINDS.map((k) => k.look).sort(), Object.keys(LOOKS).sort()), KINDS.map((k) => k.look).join(' '));
  const words = {
    temperate: ['oceans', 'an ocean', 'seas', 'a sea', 'water worlds', 'a water world', 'ocean worlds', 'blue planets', 'a blue planet', 'blue worlds'],
    desert: ['deserts', 'a desert', 'dry worlds', 'dusty', 'arid planets', 'dunes', 'mars like worlds', 'like mars'],
    shrouded: ['cloudy planets', 'cloud covered worlds', 'shrouded', 'overcast', 'greenhouse worlds', 'venus like', 'like venus'],
    ice: ['frozen planets', 'snowball', 'glaciers', 'a glacier', 'ice worlds', 'icy worlds'],
    airless: ['airless planets', 'no air', 'no atmosphere', 'planets without atmosphere', 'planets without an atmosphere', 'worlds without any atmosphere', 'bare rock', 'barren', 'cratered worlds', 'moon like', 'mercury like'],
    molten: ['lava worlds', 'molten planets', 'magma'],
    fluid: ['planets with no surface', 'cloud tops'],
  };
  for (const [look, list] of Object.entries(words)) reads(`the ${look} kind is asked for by each of its words, and by nothing else in them`, list, (q) => same(q.looks, [look]) && nothingElse(q, 'looks'));
  reads('a question that names no kind sets none', ['planets within 20 ly', 'earth sized and temperate', 'giants', 'cold planet', 'transiting planets found since 2020'], (q) => q.looks === null);
  yes('each kind is noted by the label the page prints for it', same(KINDS.map((k) => `${k.look}: ${k.label}`), ['temperate: drawn with seas', 'desert: thin-air desert', 'shrouded: cloud-shrouded', 'ice: frozen', 'airless: airless rock', 'molten: lava world', 'fluid: no surface'])
    && Object.entries({ 'ocean worlds': 'drawn with seas', 'deserts': 'thin-air desert', 'cloudy planets': 'cloud-shrouded', 'icy worlds': 'frozen', 'airless planets': 'airless rock', 'lava worlds': 'lava world', 'cloud tops': 'no surface' }).every(([q, label]) => same(P(q).notes, [label])));
  reads('two kinds are both kept, as one or the other, joined by "or" or by "and"', ['lava or icy worlds', 'lava and icy worlds', 'icy or lava worlds'], (q) => same(q.looks, ['ice', 'molten']) && same(q.notes, ['frozen or lava world']));
  stops('two kinds side by side could be one world with both, which no kind is: a doubt', ['icy ocean worlds', 'frozen ocean worlds', 'frozen water worlds', 'cratered ice worlds', 'cloudy deserts', 'dry seas', 'lava deserts', 'lava, ice or desert worlds'], (q) => same(q.doubts, ['two kinds of world are named side by side']) && same(q.unused, []));
  reads('two words for one kind side by side are that kind', ['frozen icy worlds', 'dry dusty deserts', 'barren cratered worlds'], (q) => q.looks.length === 1);
  reads('three kinds, each joined to the next', ['lava or ice or desert worlds', 'lava and ice and desert worlds'], (q) => q.looks.length === 3 && same(q.notes, ['thin-air desert or frozen or lava world']));
  stops('"or" anywhere but between two kinds is not read', ['cold or rocky planets', 'lava or giants', 'lava worlds or', 'or lava worlds'], (q) => q.unused.includes('or'));
  reads('"airless rock" is the airless kind and a rocky size', ['airless rock'], (q) => same(q.looks, ['airless']) && same(q.ranges, { R: [null, 1.6] }));
  reads('"bare rock" is the airless kind and sets no size', ['bare rock', 'worlds of bare rock'], (q) => same(q.looks, ['airless']) && same(q.ranges, {}));
}

/* ---- words that sit next to a kind and mean something else ---- */
{
  reads('"ice giants" and "icy giants" are a size, 4 to 8 R, and not the ice kind', ['ice giants', 'icy giants', 'an icy giant'], (q) => q.looks === null && same(q.ranges, { R: [4, 8] }));
  reads('a lava ocean is lava and not a sea, in either word order', ['lava ocean', 'lava oceans', 'a lava sea', 'magma seas', 'a magma ocean', 'molten oceans', 'a molten sea', 'worlds with a lava lake', 'lava lakes', 'lava oceans and magma seas', 'seas of lava and oceans of magma', 'seas of lava', 'an ocean of lava', 'oceans of magma', 'a sea of magma', 'lakes of lava', 'a lake of lava'], (q) => same(q.looks, ['molten']) && nothingElse(q, 'looks'));
  reads('dry ice is ice and not a desert', ['dry ice worlds', 'dry ice'], (q) => same(q.looks, ['ice']));
  reads('"ice cold" and "cold as ice" are cold and not the ice kind', ['ice cold planets', 'ice-cold', 'icy cold worlds', 'cold as ice'], (q) => q.cold === true && nothingElse(q, 'cold'));
  reads('ice beside cold, when it is not that idiom, is both', ['cold ice worlds'], (q) => q.cold === true && same(q.looks, ['ice']));
  reads('"lava" is a kind, with no temperature of its own', ['lava planets'], (q) => same(q.looks, ['molten']) && nothingElse(q, 'looks'));
  reads('"earth like" orders by likeness and is not the kind drawn with seas', ['most earth like', 'the most earth like planets'], (q) => same(q.sort, { key: 'earthlike', dir: -1 }) && nothingElse(q, 'sort'));
}

/* ---- sizes ---- */
{
  const size = (lo, hi) => (q) => same(q.ranges, { R: [lo, hi] }) && nothingElse(q, 'ranges');
  reads('Earth-size is 0.8 to 1.25 R', ['earth size planets', 'earth sized'], size(0.8, 1.25));
  reads('a super-Earth is 1.25 to 2 R, with or without "size", and is not Earth-size', ['super earths', 'a super earth', 'super earth sized planets', 'super-earth-size'], size(1.25, 2));
  reads('a sub-Neptune is 2 to 4 R, and is not Neptune-size', ['sub neptunes', 'a sub neptune', 'mini neptune', 'mini-Neptunes', 'sub neptune sized', 'mini neptune size'], size(2, 4));
  reads('Neptune-size is 4 to 8 R', ['neptunes', 'neptune', 'neptune sized', 'neptune size planets'], size(4, 8));
  reads('a giant is above 8 R, with no period of its own', ['jupiters', 'a jupiter', 'jupiter sized planets', 'jupiter size', 'gas giants', 'a gas giant', 'giants', 'a giant'], size(8, null));
  reads('rocky is under 1.6 R', ['rocky planets', 'small worlds', 'terrestrial planets', 'worlds of rock'], size(null, 1.6));
  reads('a hot Jupiter is a giant with a period under 10 days', ['hot jupiters', 'a hot jupiter'], (q) => same(q.ranges, { R: [8, null], P: [null, 10] }) && nothingElse(q, 'ranges'));
  reads('a question with no size word sets no radius', ['cold planet', 'planets near us', 'lava worlds', 'earth like'], (q) => !('R' in q.ranges));
  stops('a size compared with something is not that size', ['twice earth size', 'bigger than jupiter', 'smaller than neptune', 'half the size of jupiter', 'earth size or super earth', 'between 1 and 2 earth radii']);
  yes('the size notes carry the bounds as the filter applies them, and the unit', same(P('super earths').notes, ['super-Earth: 1.25 to 2 R⊕']) && same(P('earth sized').notes, ['Earth-size: 0.8 to 1.25 R⊕']) && same(P('sub neptunes').notes, ['sub-Neptune: 2 to 4 R⊕'])
    && same(P('neptunes').notes, ['Neptune-size: 4 to 8 R⊕']) && same(P('giants').notes, ['giant: 8 R⊕ or more']) && same(P('rocky').notes, ['rocky: 1.6 R⊕ or less']) && same(P('hot jupiters').notes, ['giant: 8 R⊕ or more', 'period of 10 days or less']));
  stops('"super" before anything but an Earth makes another thing of it, and is not let through', ['super jupiters', 'super giants', 'super neptunes', 'super hot'], (q) => same(q.unused, ['super']));
  reads('two spaces between words are one', ['hot  jupiters', 'hot   jupiters'], (q) => same(q.ranges, { R: [8, null], P: [null, 10] }) && q.hot === null);
}

/* ---- cold, hot, the zone ---- */
{
  yes('the words say the bounds, and the bounds are find.js\'s', COLD_WORDS === 'cold: equilibrium temperature under 200 K, published or computed' && HOT_WORDS === 'hot: equilibrium temperature of 1,000 K or more, published or computed' && COLD_K === 200 && HOT_K === 1000);
  reads('"cold" asks for cold worlds, and for nothing else', ['cold planet', 'cold planets', 'chilly worlds', 'freezing planets', 'frigid', 'freezing cold planets'], (q) => q.cold === true && nothingElse(q, 'cold') && same(q.notes, [COLD_WORDS]));
  reads('a question without the word is not cold', ['giants near us', 'coldest planets', 'hot planets', 'temperate worlds'], (q) => q.cold === null);
  reads('"hot" asks for hot worlds, and for nothing else', ['hot planets', 'scorching worlds', 'hot', 'hot scorching worlds'], (q) => q.hot === true && nothingElse(q, 'hot') && same(q.notes, [HOT_WORDS]));
  reads('"hot jupiters" is a size and a period and is not the temperature', ['hot jupiters'], (q) => q.hot === null);
  reads('"hot planets around hot stars" is both the planet and the star', ['hot planets around hot stars'], (q) => q.hot === true && same(q.ranges, { Teff: [6000, null] }));
  reads('a question without the word is not hot', ['cold planet', 'hottest planets', 'lava worlds', 'giants'], (q) => q.hot === null);
  reads('a word that only strengthens changes nothing', ['very cold planets', 'really cold', 'extremely hot worlds', 'quite cold', 'pretty cold planets'], (q) => (q.cold === true) !== (q.hot === true) && nothingElse(q, 'cold', 'hot'));
  stops('cold and hot in one question are a doubt, whatever joins them', ['hot and cold planets', 'cold hot worlds'], (q) => same(q.doubts, ['cold and hot are both asked for']) && q.turned === null);
  reads('the habitable zone is asked for by each of its words', ['temperate worlds', 'habitable planets', 'planets in the habitable zone', 'in the habitable zones', 'goldilocks planets', 'goldilocks zone', 'the goldilocks zones', 'worlds with liquid water'], (q) => same(q.zone, ['cons', 'opt']) && nothingElse(q, 'zone') && same(q.notes, ['inside the conservative or the optimistic habitable zone']));
  reads('the zone may be said to be the star\'s', ['habitable zone of its star', 'in the habitable zone of their stars', 'the habitable zone of the sun', 'the habitable zone of their hosts'], (q) => same(q.zone, ['cons', 'opt']) && nothingElse(q, 'zone'));
  reads('a question without those words sets no zone', ['giants near us', 'cold planet', 'ocean worlds'], (q) => q.zone === null);
  reads('the zone and cold are separate: a question can ask for both', ['habitable cold planets'], (q) => same(q.zone, ['cons', 'opt']) && q.cold === true);
}

/* ---- a word before "star" is about the star ---- */
{
  stops('a property said of the star is not read as the planet\'s', ['planets around cold stars', 'cold stars', 'cold hosts', 'a cold sun', 'frozen dwarfs', 'planets around giant stars', 'giant stars', 'small stars', 'rocky stars',
    'smallest stars', 'biggest stars', 'largest star', 'oldest star', 'newest star', 'hottest stars', 'the hottest star', 'coldest stars', 'coldest hosts', 'the coldest host', 'nearest stars', 'habitable stars', 'scorching suns', 'locked stars'],
  (q) => nothingElse(q) && q.unused.length >= 2);
  stops('the words before a star that is read are the star\'s too', ['small red dwarfs', 'coldest red dwarfs', 'planets around cold red dwarfs', 'small sunlike stars', 'small sun like stars', 'small k dwarfs', 'hot k type stars', 'giant m type stars', 'cold orange dwarfs'],
    (q) => !('R' in q.ranges) && q.cold === null && q.hot === null && q.sort === null && q.unused.length === 1 && 'Teff' in q.ranges);
  stops('every word in a run before the star is the star\'s', ['small cold stars', 'giant hot scorching suns', 'planets around small cold red dwarfs'], (q) => !('R' in q.ranges) && q.cold === null && q.hot === null && q.unused.length >= 2);
  stops('the word after "around" or "orbiting" is what is orbited, and is not the planet', ['planets around giants', 'planets orbiting giants', 'planets around gas giants', 'planets around a giant', 'planets around an ice giant', 'worlds orbiting the giants', 'moons around jupiters', 'planets around cold'],
    (q) => nothingElse(q) && q.unused.length >= 1);
  reads('the planet\'s own property beside a star that is read is still the planet\'s', ['giant planets around red dwarfs', 'cold giants around sun like stars'], (q) => same(q.ranges.R, [8, null]) && 'Teff' in q.ranges);
  stops('a star with a property that is not read stops the reading, and the planet\'s part is what would be left', ['giant planets around small stars'], (q) => same(q.ranges, { R: [8, null] }) && same(q.unused, ['small', 'stars']));
  stops('a star with nothing said of it is not read', ['planets around stars', 'planets with two suns', 'white dwarfs', 'brown dwarfs'], (q) => nothingElse(q));
}

/* ---- the host star ---- */
{
  const host = (lo, hi) => (q) => same(q.ranges, { Teff: [lo, hi] }) && nothingElse(q, 'ranges');
  const dwarf = (lo, hi) => (q) => same(q.ranges, { Teff: [lo, hi], Rs: [0.08, 1.5] }) && nothingElse(q, 'ranges');
  yes('a main-sequence star is one of 0.08 to 1.5 solar radii', same(DWARF_RS, [0.08, 1.5]));
  reads('an M dwarf is a host of 3,900 K or less on the main sequence', ['red dwarfs', 'planets around a red dwarf', 'red dwarf stars', 'a red dwarf host', 'm dwarfs', 'an m dwarf', 'm dwarf stars', 'm dwarf hosts'], dwarf(null, 3900));
  reads('an M-type star is one of 3,900 K or less, a giant included', ['m type', 'm type stars', 'm type hosts'], host(null, 3900));
  reads('a K dwarf is 3,900 to 5,300 K on the main sequence', ['k dwarfs', 'a k dwarf', 'k dwarf stars', 'k dwarf hosts', 'orange dwarfs', 'an orange dwarf', 'orange dwarf hosts', 'orange dwarf stars'], dwarf(3900, 5300));
  reads('a K-type star is 3,900 to 5,300 K, a giant included', ['k type', 'k type stars', 'k type hosts'], host(3900, 5300));
  reads('a Sun-like star is 5,300 to 6,000 K on the main sequence', ['sun like stars', 'sunlike', 'sunlike hosts', 'sun like hosts', 'solar type hosts', 'solar type stars', 'planets orbiting sun like stars'], dwarf(5300, 6000));
  reads('a G-type star is 5,300 to 6,000 K, a giant included', ['g type', 'g type stars', 'g type hosts'], host(5300, 6000));
  reads('a hot star is 6,000 K or more', ['f type', 'f type stars', 'f type hosts', 'a type stars', 'an a type star', 'a type hosts', 'hot stars', 'a hot star', 'hot hosts', 'a hot host', 'hot host stars', 'a hot sun', 'worlds around a hot star'], host(6000, null));
  stops('"type" with "dwarfs" after it is not read as a class', ['m type dwarfs', 'k type dwarfs', 'g type dwarfs', 'f type dwarfs', 'a type dwarfs']);
  each('"a type of" is the article and a noun, and is not the star\'s class', ['a type of planet', 'what is a type of world'], (q) => !('Teff' in q.ranges) && q.recognised === 0);
  reads('a question with no star in it sets no host', ['cold planet', 'lava worlds near us'], (q) => !('Teff' in q.ranges));
  reads('a host and a kind combine', ['cloudy super earths around red dwarfs'], (q) => same(q.ranges.R, [1.25, 2]) && same(q.ranges.Teff, [null, 3900]) && same(q.ranges.Rs, [0.08, 1.5]) && same(q.looks, ['shrouded']));
  stops('a second kind of star is not read', ['red dwarfs and sun like stars', 'k dwarfs or hot stars']);
  yes('the host notes say the bounds as the filter applies them, with their thousands marked', same(P('red dwarfs').notes, ['M dwarf host: star of 3,900 K or less', 'star of 0.08 to 1.5 R☉']) && same(P('m type stars').notes, ['M-type host: star of 3,900 K or less'])
    && same(P('k dwarfs').notes, ['K dwarf host: star of 3,900 to 5,300 K', 'star of 0.08 to 1.5 R☉']) && same(P('k type').notes, ['K-type host: star of 3,900 to 5,300 K'])
    && same(P('sun like stars').notes, ['Sun-like host: star of 5,300 to 6,000 K', 'star of 0.08 to 1.5 R☉']) && same(P('g type').notes, ['G-type host: star of 5,300 to 6,000 K']) && same(P('hot stars').notes, ['hot host: star of 6,000 K or more']));
}

/* ---- one face to the star ---- */
{
  reads('a locked world is asked for by each of its words', ['tidally locked planets', 'tide locked worlds', 'tide-locked', 'locked worlds', 'eyeball planets', 'one face', 'permanent day', 'eternal day', 'synchronous', 'synchronous rotation'], (q) => q.locked === true && nothingElse(q, 'locked') && same(q.notes, [LOCKED_WORDS]));
  reads('the star it is locked to may be said', ['one face to its star', 'tidally locked to its star', 'planets locked to their stars', 'tidally locked to the sun', 'locked to their hosts'], (q) => q.locked === true && nothingElse(q, 'locked'));
  reads('it combines with a kind', ['tidally locked desert'], (q) => q.locked === true && same(q.looks, ['desert']));
  reads('a question without them is not', ['desert planets', 'cold planet', 'giants near us'], (q) => q.locked === null);
  yes('the note says it is how the world is drawn', LOCKED_WORDS === 'drawn with one face to its star');
}

/* ---- distance from here ---- */
{
  const within = (v) => (q) => same(q.ranges, { dist: [null, v] }) && nothingElse(q, 'ranges');
  reads('"within 30 ly" is 30 light-years, in each of its forms', ['within 30 ly', 'under 30 ly', 'inside 30 ly', 'less than 30 ly', 'closer than 30 ly', 'nearer than 30 ly', 'up to 30 ly', 'within 30ly'], within(30));
  reads('where it is measured from may be said', ['within 30 ly away', 'less than 30 ly from earth', 'within 30 ly from us', 'under 30 ly away from here', 'within 30 ly from home', 'within 30 ly from the sun', 'closer than 30 ly from our sun'], within(30));
  reads('it combines with a size', ['rocky planets within 30 ly'], (q) => same(q.ranges.R, [null, 1.6]) && same(q.ranges.dist, [null, 30]));
  reads('parsecs are turned into light-years: 10 pc is 32.6 ly', ['within 10 pc', 'within 10 parsecs', 'within 10 parsec'], (q) => q.ranges.dist[0] === null && Math.abs(q.ranges.dist[1] - 32.6156) < 1e-9 && same(q.notes, ['within 33 ly']));
  reads('light-years are kept as they are', ['within 10 ly', 'within 10 light years', 'within 10 lightyears', 'within 10 light-years', 'within 10 light year'], within(10));
  reads('a decimal point is read', ['within 4.5 ly'], within(4.5));
  reads('a thousands comma is read, and the note marks the thousands', ['within 1,000 light years', 'within 1,000.0 ly'], (q) => within(1000)(q) && same(q.notes, ['within 1,000 ly']));
  reads('"beyond" and its forms are a lower bound', ['beyond 500 ly', 'over 500 ly', 'more than 500 ly', 'farther than 500 ly', 'further than 500 ly', 'more than 500 light years away'], (q) => same(q.ranges, { dist: [500, null] }) && same(q.notes, ['500 ly or farther']));
  stops('a number that can be read two ways is not read', ['within 1,5 ly', 'within 1.000 light years', 'within 1.000.000 ly', 'within 1.2.3 ly', 'within 12,34 ly', 'beyond 1,5 ly'], (q) => same(q.ranges, {}) && q.unused.includes('within') === !q.unused.includes('beyond'));
  stops('a number with no unit is not a distance', ['within 30', 'within 30 miles', 'under 30'], (q) => same(q.ranges, {}));
  reads('"near us" in its forms is within 50 light-years and orders nothing', ['nearby worlds', 'our neighbours', 'neighbors', 'a neighbour', 'in our neighbourhood', 'in our neighborhood',
    'lava planets near us', 'near me', 'near earth', 'near here', 'near home', 'near the sun', 'near our sun', 'near sol',
    'close to us', 'planets close to earth', 'close to home', 'close to here', 'close to the sun', 'close to our sun'], (q) => same(q.ranges.dist, [null, 50]) && q.sort === null && q.notes.includes('within 50 ly'));
  stops('"near" and "close" about anything but us are not a distance', ['close to its star', 'planets near their star', 'close in planets', 'near earth size planets', 'planets close to earth size', 'close to earth sized', 'near', 'close'], (q) => !('dist' in q.ranges) && q.sort === null);
  stops('two different distances from one rule are a doubt', ['within 10 ly and within 100 ly', 'beyond 10 ly and beyond 20 ly', 'under 10 ly, under 20 pc'], (q) => same(q.doubts, ['two distances are given']));
  reads('one distance said twice is one distance', ['within 10 ly, within 10 ly'], (q) => same(q.ranges, { dist: [null, 10] }) && same(q.doubts, []));
  stops('two distances are not both read', ['nearby planets within 100 ly', 'within 10 ly and beyond 5 ly'], (q) => q.unused.length > 0);
  reads('"nearest" and "closest" order the list and leave every distance in it', ['nearest lava world', 'the closest giants', 'closest to us', 'nearest to earth', 'nearest to home', 'closest to here', 'closest to the sun', 'nearest to our sun'], (q) => same(q.sort, { key: 'dist', dir: 1 }) && !('dist' in q.ranges));
  stops('"closest to its star" is about the orbit: it orders nothing', ['closest to its star', 'planets closest to their star', 'closest to a star', 'closest to the star', 'closest to their own stars', 'closest to its parent star', 'closest to its host', 'nearest to their hosts', 'closest to their suns',
    'closest in', 'the closest in planets', 'closest in orbit', 'nearest in worlds'], (q) => q.sort === null && !('dist' in q.ranges) && (q.unused.includes('closest') || q.unused.includes('nearest')));
  stops('the orbit said in other words stops the reading too', ['the closest planet to its star', 'nearest planet to its star', 'the closest planets to their stars', 'closest orbit', 'the planet nearest its star']);
}

/* ---- the period ---- */
{
  reads('ultra short is a day or less, with or without "period"', ['ultra short period planets', 'ultra short', 'ultra-short period'], (q) => same(q.ranges, { P: [null, 1] }) && same(q.notes, ['period of 1 day or less']));
  reads('short period is 10 days or less', ['short period planets'], (q) => same(q.ranges, { P: [null, 10] }) && same(q.notes, ['period of 10 days or less']));
  reads('long period is a year or more', ['long period planets'], (q) => same(q.ranges, { P: [365, null] }) && same(q.notes, ['period of a year or more']));
  stops('"short" and "long" alone set no period', ['short planets', 'long ago', 'period'], (q) => !('P' in q.ranges));
  stops('a second, different value for one thing is a doubt, and the first value is what stays', ['hot jupiters with a long period', 'long period hot jupiters', 'ultra short period hot jupiters'], (q) => same(q.doubts, ['one thing is asked for twice, with two values']) && same(q.ranges.R, [8, null]) && q.notes.length === 2);
  reads('the same value said twice is no doubt', ['short period hot jupiters'], (q) => same(q.ranges, { R: [8, null], P: [null, 10] }) && same(q.doubts, []));
}

/* ---- the year and the method of discovery ---- */
{
  reads('"since 2020" starts in 2020', ['found since 2020'], (q) => same(q.ranges, { year: [2020, null] }) && same(q.notes, ['found in 2020 or later']));
  reads('"after 2020" starts in 2021', ['discovered after 2020'], (q) => same(q.ranges, { year: [2021, null] }) && same(q.notes, ['found after 2020']));
  reads('"before 2000" ends in 1999', ['found before 2000'], (q) => same(q.ranges, { year: [null, 1999] }) && same(q.notes, ['found before 2000']));
  reads('"in 2019" is that year alone', ['found in 2019', 'in 1995'], (q) => q.ranges.year[0] === q.ranges.year[1] && [2019, 1995].includes(q.ranges.year[0]) && /^found in (2019|1995)$/.test(q.notes[0]));
  reads('a year of the 1900s is read as one', ['since 1995', 'found after 1999', 'before 1999'], (q) => same(q.ranges.year, P('since 1995').ranges.year) || same(q.ranges.year, [2000, null]) || same(q.ranges.year, [null, 1998]));
  yes('and to the year', same(P('since 1995').ranges, { year: [1995, null] }) && same(P('found after 1999').ranges, { year: [2000, null] }) && same(P('before 1999').ranges, { year: [null, 1998] }));
  stops('two different years from one rule are a doubt', ['found in 2019 and in 2020', 'in 1995 and in 2020', 'since 2015 and since 2020', 'before 2000 and before 2010'], (q) => same(q.doubts, ['two years are given']));
  reads('one year said twice is one year', ['in 2019, in 2019'], (q) => same(q.ranges, { year: [2019, 2019] }) && same(q.doubts, []));
  stops('a number that is not a year of this catalogue sets none, and is named as unread', ['in 1850', 'since 1850', 'after 1700', 'before 1850', 'found 2019 times', 'since 300'], (q) => !('year' in q.ranges) && q.unused.some((x) => /^\d+$/.test(x)));
  stops('a second year is not read, and is named', ['found in 2019 or 2020', 'found in 2015, 2016 or 2017', 'since 2015 before 2020'], (q) => q.unused.some((x) => /^20\d\d$/.test(x)));
  const by = (key) => (q) => q.method === key && same(q.notes, [`found by ${key.toLowerCase()}`]) && nothingElse(q, 'method');
  reads('transits', ['transit', 'transiting planets', 'found by transit', 'transits'], by('Transit'));
  reads('radial velocity', ['radial velocity', 'found by radial velocity', 'rv planets', 'doppler'], by('Radial Velocity'));
  reads('microlensing', ['microlensing', 'microlensed planets', 'found by microlensing'], by('Microlensing'));
  reads('imaging', ['imaging', 'directly imaged', 'direct imaging', 'imaged planets'], by('Imaging'));
  each('"other" is not a method a question can ask for, and a question with no method sets none', ['other methods', 'cold planet', 'giants'], (q) => q.method === null);
  stops('two methods in one question are a doubt, and neither is applied', ['transiting and imaged planets', 'rv and microlensing planets', 'doppler and transit'], (q) => q.method === null && same(q.doubts, ['more than one method of discovery is named']));
  reads('one method said twice is one method', ['radial velocity doppler planets', 'directly imaged by imaging'], (q) => q.method !== null && same(q.doubts, []));
}

/* ---- the order of the list ---- */
{
  const order = (key, dir) => (q) => same(q.sort, { key, dir }) && nothingElse(q, 'sort') && q.recognised === 1;
  reads('"hottest" orders by temperature, hottest first, and filters nothing', ['hottest planets', 'the hottest'], order('T', -1));
  reads('"coldest" orders by temperature, coldest first, and filters nothing', ['coldest planets', 'the coldest worlds', 'coldest known'], order('T', 1));
  reads('largest first', ['largest planets', 'biggest', 'biggest planet ever found'], order('R', -1));
  reads('smallest first', ['smallest planets', 'smallest'], order('R', 1));
  reads('most recently found first', ['newest', 'latest planets', 'recent', 'recently found', 'recent discoveries', 'recently discovered planets'], order('year', -1));
  reads('earliest found first', ['earliest', 'earliest planets', 'the earliest found', 'first found', 'first discovered planets', 'the first known'], order('year', 1));
  stops('"oldest" is not read: it could be the age or the year found, and the catalogue has no ages', ['oldest planets', 'the oldest known planet', 'oldest exoplanet', 'oldest giants', 'old planets', 'young planets', 'first'], (q) => q.sort === null);
  reads('most Earth-like first', ['most earth like', 'earth like', 'earth twins', 'an earth twin', 'earth-like planets'], order('earthlike', -1));
  reads('nearest first', ['nearest', 'the closest planets'], order('dist', 1));
  reads('a question with no order word orders nothing', ['cold planet', 'lava worlds near us', 'giants within 100 ly'], (q) => q.sort === null);
  reads('an order and a filter are two things read', ['coldest cold planets'], (q) => q.recognised === 2 && q.cold === true && same(q.sort, { key: 'T', dir: 1 }));
  stops('a second order is not read', ['largest and nearest', 'newest and biggest planets'], (q) => q.unused.length === 1);
}

/* ---- words that turn a meaning round ---- */
{
  const turns = 'not no non without except excluding exclude outside never neither nor minus unlike but cannot cant arent isnt dont wont doesnt didnt wasnt werent hasnt havent shouldnt couldnt wouldnt free less fewer instead besides apart other rather lacking lacks lack'.split(' ');
  yes('the words that turn a meaning are these and no others', same([...TURNS].sort(), turns.slice().sort()));
  const missed = turns.filter((x) => !holds(`${x} cold planets`, (q) => !q.complete && q.turned === x && q.cold === true));
  yes(`each of the ${turns.length} words that turn or bend a meaning stops the reading and is the word named`, missed.length === 0 && turns.length === 40, missed.join(' '));
  stops('the opposite of what was asked is never what is read', ['planets that arent hot', 'isnt cold', 'dont transit', 'cannot be habitable', 'anything but giants', 'other than giants', 'apart from giants', 'ice free planets', 'less hot planets', 'not too hot not too cold', 'no giants', 'never hot', 'outside the habitable zone', 'giants except hot jupiters'], (q) => q.turned !== null);
  stops('"n\'t" is "not", with either apostrophe, each time it appears', ["planets that aren't locked", "isn't cold", 'isn’t cold', "doesn't transit", "planets that aren't cold and aren't hot", 'isn’t cold, isn’t hot'], (q) => q.turned === 'not' && !q.unused.some((x) => ['t', 'aren', 'isn', 'doesn'].includes(x)));
  reads('"no" and "without" inside a phrase that is read are not a turn', ['no atmosphere', 'no air', 'planets with no surface', 'planets without an atmosphere', 'worlds without any atmosphere'], (q) => q.turned === null && q.looks !== null);
  each('a question with none has no turn', ['cold planet', 'lava worlds near us', 'purple planets with rings', 'nothing', 'north'], (q) => q.turned === null);
}

/* ---- every word is read, let through, or named ---- */
{
  const filler = ('a an the and of in on at for with that which who whose are is be been was were am me my i we us our you your show find give list get want search look looking ' +
    'all any some every each planet planets world worlds exoplanet exoplanets one ones kind kinds type types sort sorts there here it they them this these those please thanks thank hi hello hey ' +
    'what where around orbiting found discovered detected discoveries known by have has had very really extremely quite pretty ever yet also just only').split(' ');
  yes('the words let through are these and no others, so that a word added to them is a change someone made here too', same([...FILLER].sort(), filler.slice().sort()), [...FILLER].filter((x) => !filler.includes(x)).concat(filler.filter((x) => !FILLER.has(x))).join(' '));
  const blocked = filler.filter((x) => !holds(`cold ${x} planets`, (q) => q.complete && q.cold === true && nothingElse(q, 'cold')));
  yes(`each of the ${filler.length} words that cannot change a meaning is let through`, blocked.length === 0, blocked.join(' '));
  const mustStop = ('to its their than as like more most too star stars host sun orbit orbits or from zone near close far away radius size mass water life rings moons twice half between about almost nearly maybe ' +
    'can could would should will do does did how see super tell know many much if red warm old big young cool massive heavy').split(' ');
  const let_ = mustStop.filter((x) => !holds(`cold ${x} planets`, (q) => !q.complete && q.unused.includes(x)));
  yes('a word that can change a meaning is never let through', let_.length === 0, let_.join(' '));
  reads('a request for a list or for a count asks for nothing more than the page gives', ['can you show me cold planets please', 'could you list cold planets', 'would you find cold worlds', 'will you show cold planets', 'how many cold planets are there', 'how many planets are cold'], (r) => r.cold === true && nothingElse(r, 'cold'));
  stops('a question that asks whether, or how much, is not a filter', ['can cold planets have oceans', 'how cold are giants', 'do hot planets have moons', 'hot planets i can see', 'could hot planets be habitable', 'can you tell me if cold planets have oceans', 'how hot'], (r) => r.unused.length >= 1);
  const q = P('purple planets with rings');
  yes('words with no rule are named, in order, and nothing is read', same(q.unused, ['purple', 'rings']) && q.recognised === 0 && !q.complete, show(q));
  stops('one unread word beside read ones is named alone, and the rest is what would be left', ['fluffy lava worlds'], (r) => same(r.unused, ['fluffy']) && same(r.looks, ['molten']) && r.recognised === 1);
  reads('a second word for the same thing is read, not named', ['freezing cold planets', 'frozen icy worlds', 'dry dusty deserts', 'hot scorching worlds', 'tidally locked eyeball planets']);
  stops('a number no rule read is named', ['cold planets 42', 'planet 51', 'earth 2.0', 'top 10 cold planets'], (r) => r.unused.some((x) => /^\d/.test(x)));
  yes('each unread word is named once', same(P('purple purple rings').unused, ['purple', 'rings']));
  reads('capitals, hyphens and punctuation change nothing', ['COLD PLANET', 'Cold-Planets!', 'cold, planets?', '  cold   planet  ', 'cold planets.'], (r) => r.cold === true);
  yes('accents are folded, so a word in another language is named in plain letters and breaks nothing', same(P('planète glacée').unused, ['planete', 'glacee']) && P('planète glacée').recognised === 0, show(P('planète glacée')));
  yes('markup in a question is only words to it', same(P('<img src=x onerror=alert(1)>').unused, ['img', 'src', 'x', 'onerror', 'alert', '1']) && !P('<img src=x onerror=alert(1)>').complete);
  each('a question with nothing to read is not complete and names nothing', ['', '   ', null, undefined, 'planets', 'show me every world', '?', 'a', 'can you', 'how many'], (r) => r.recognised === 0 && !r.complete && same(r.unused, []) && same(r.ranges, {}) && r.turned === null);
  yes('a number alone is named', same(P(42).unused, ['42']) && !P(42).complete);
}

/* ---- a word claimed by two readings ---- */
{
  stops('a word that two rules both consumed is a doubt, and is named', ['planets close to earth like worlds'], (q) => same(q.doubts, ['the word “earth” could belong to two different readings']) && same(q.unused, []));
  reads('the same words read apart are no doubt', ['earth like planets close to us'], (q) => same(q.doubts, []) && same(q.sort, { key: 'earthlike', dir: -1 }) && same(q.ranges, { dist: [null, 50] }));
  reads('a reading with no doubt has none', ['cold planet', 'hot jupiters', 'lava ocean'], (q) => same(q.doubts, []));
  stops('each doubt is said once', ['hot and cold and hot and cold planets', 'within 10 ly and within 20 ly and within 30 ly'], (q) => q.doubts.length === 1);
}

/* ---- every question a review caught being read as something else (2026-11-15, three reviews) ---- */
{
  stops('each of them now stops the reading', [
    'planets that arent hot', 'isnt cold', 'dont transit', 'cannot be habitable', 'anything but giants', 'other than giants', 'apart from giants', 'ice free planets', 'less hot planets',
    'planets around cold stars', 'cold stars', 'cold hosts', 'planets around giant stars', 'giant stars', 'small stars', 'smallest stars', 'biggest stars', 'largest star', 'oldest star', 'newest star',
    'the closest planet to its star', 'nearest planet to its star', 'the closest planets to their stars', 'closest orbit', 'closest in', 'the planet nearest its star',
    'near earth size planets', 'planets close to earth size', 'close to earth sized', 'found in 2019 or 2020', 'found in 2015, 2016 or 2017', 'within 1,5 ly', 'within 1.000 light years',
    'twice earth size', 'bigger than jupiter', 'hot or cold planets',
    'oldest planets', 'the oldest known planet', 'oldest exoplanet', 'oldest giants', 'icy ocean worlds', 'frozen ocean worlds', 'frozen water worlds', 'cratered ice worlds', 'cloudy deserts', 'dry seas',
    'small red dwarfs', 'coldest red dwarfs', 'planets around cold red dwarfs', 'small sunlike stars', 'small k dwarfs', 'hot k type stars',
    'found in 2019 and in 2020', 'in 1995 and in 2020', 'within 10 ly and within 100 ly', 'since 2015 and since 2020', 'planets around giants', 'planets orbiting giants', 'planets around gas giants',
    'super jupiters', 'super giants', 'can cold planets have oceans', 'how cold are giants', 'hot planets i can see', 'within 1.000.000 ly', 'long period hot jupiters',
  ]);
  reads('and the ones that were read as two things read as the one they name', ['ice cold planets', 'ice-cold', 'seas of lava', 'an ocean of lava', 'oceans of magma', 'molten oceans', 'super earth sized planets', 'super-earth-size'], (q) => q.notes.length === 1);
}

/* ---- when a model is asked ---- */
{
  const ask = (s) => needsModel(P(s));
  yes('a question read in full is not sent to a model', !ask('cold planet') && !ask('tidally locked giants near us') && !ask('largest'));
  yes('a question with a word left unread is', ask('fluffy cold planets') && ask('purple planets with rings') && ask('planets that are not cold') && ask('planets around cold stars'));
  yes('an unread word of three letters is enough, and one of two is not', ask('fog') && ask('fog planets') && !ask('fo') && !ask('fo planets'));
  yes('a question with a doubt in it is, when something in it was read', ask('hot and cold planets') && ask('planets close to earth like worlds'));
  yes('a scrap is sent nowhere', !ask('?') && !ask('a') && !ask('no') && !ask('zz') && !ask('') && !ask('planets') && !ask('42'));
  yes('a short unread word beside something read is still worth a model', ask('cold or hot') && ask('no giants'));
}

/* ---- the note the page prints ---- */
{
  const note = (text, extra = {}) => say({ r: P(text), text, count: 315, order: 'nearest first', ...extra });
  yes('a question read in full: what was read, how many, in what order, and by what', note('cold planet') === `“cold planet” reads as ${COLD_WORDS}; 315 matches, nearest first; read by this page's own rules.` && PAGE === 'this page\'s own rules', note('cold planet'));
  yes('one match is "1 match", and thousands are marked', /; 1 match, /.test(note('cold planet', { count: 1 })) && /; 2,026 matches, /.test(note('giants', { count: 2026 })));
  yes('a question that only orders says every planet, and counts planets', note('largest', { count: 6464, order: 'largest first' }) === `“largest” reads as every planet; 6,464 planets, largest first; read by this page's own rules.`, note('largest', { count: 6464, order: 'largest first' }));
  yes('a reading with numbers says where to change them', / The numbers can be changed under Ranges\.$/.test(note('giants')) && !/Ranges/.test(note('cold planet')));
  yes('a surface kind asked of a world too large for one, with no match, says why', / No world that large is drawn with a surface\./.test(note('desert giants', { count: 0 })) && !/that large/.test(note('desert giants', { count: 3 })) && !/that large/.test(note('rocky deserts', { count: 0 })) && !/that large/.test(note('giants with no surface', { count: 0 })));
  yes('"that large" starts at Neptune-size, 4 R, and no lower', / No world that large is drawn with a surface\./.test(note('desert neptunes', { count: 0 })) && !/that large/.test(note('desert super earths', { count: 0 })) && !/that large/.test(note('deserts', { count: 0 })));
  yes('a word that turns the meaning is named, and the note says nothing was filtered', note('planets that are not cold') === '“planets that are not cold”: the word “not” is not read here, so nothing was filtered.', note('planets that are not cold'));
  yes('a doubt is said in words', note('hot and cold planets') === '“hot and cold planets”: cold and hot are both asked for, so nothing was filtered.' && note('planets close to earth like worlds') === '“planets close to earth like worlds”: the word “earth” could belong to two different readings, so nothing was filtered.', note('hot and cold planets'));
  yes('unread words are named, with what the rest would read as', note('fluffy cold planets') === `“fluffy cold planets”: not read: fluffy. Nothing was filtered. Without it the question would read as: ${COLD_WORDS}.`, note('fluffy cold planets'));
  yes('two unread words are "them"', /not read: fluffy, purple\. Nothing was filtered\. Without them the question would read as: /.test(note('fluffy purple cold planets')));
  yes('when the rest is only an order, the order is what is left', note('largest fluffy planets', { order: 'largest first' }) === '“largest fluffy planets”: not read: fluffy. Nothing was filtered. Without it the question would read as: largest first.', note('largest fluffy planets', { order: 'largest first' }));
  yes('when nothing else was read, only the unread words are named', note('purple planets with rings') === '“purple planets with rings”: not read: purple, rings. Nothing was filtered.', note('purple planets with rings'));
  yes('a question with nothing to filter or order by says so', note('planets') === '“planets”: it names nothing to filter or to order by.' && note('?') === '“?”: it names nothing to filter or to order by.');
  const own = ' A directly imaged planet is seen by its own heat, and is given no equilibrium temperature here.';
  yes('cold or hot asked of imaged planets, with no match, says why there is none', note('cold imaged planets', { count: 0 }).endsWith(own) && note('hot planets found by imaging', { count: 0 }).endsWith(own)
    && !note('cold imaged planets', { count: 2 }).includes(own) && !note('imaged planets', { count: 0 }).includes(own) && !note('cold transiting planets', { count: 0 }).includes(own));
  const model = validateQuery({ temperature: 'cold' });
  yes('a model\'s reading is named as the model\'s', say({ r: model, text: 'chilly ones', by: 'llama (ollama)', count: 315, order: 'nearest first' }) === `“chilly ones” reads as ${COLD_WORDS}; 315 matches, nearest first; read by llama (ollama).`);
  yes('a reading a model made is printed as applied, where the page\'s own reading of those words would not be', /reads as .*; read by m \(x\)\.$/.test(say({ r: { ...P('fluffy cold planets') }, text: 'fluffy cold planets', by: 'm (x)', count: 3, order: 'nearest first' })));
}

/* ---- a model's reply is checked field by field ---- */
{
  // v: the reading, or null, or a record of the error it threw. V: the same with an empty record for null, to read a field of.
  const v = (j) => { try { return validateQuery(j); } catch (e) { return { threw: String(e && e.message) }; } };
  const V = (j) => v(j) || { nothing: true };
  yes('kinds the picture has are kept, each once; a kind it does not have is dropped', same(V({ kinds: ['airless', 'jungle', 'airless'] }).looks, ['airless']), JSON.stringify(v({ kinds: ['airless', 'jungle', 'airless'] })));
  yes('kinds are noted by the labels the page prints, as one or the other', same(V({ kinds: ['molten', 'ice'] }).notes, ['lava world or frozen']) && same(V({ kinds: ['ice'] }).notes, ['frozen']));
  yes('a reply with only an unknown kind is no reading at all', v({ kinds: ['jungle'] }) === null && v({ kinds: 'airless' }) === null && v({}) === null && v(null) === null && v('cold') === null);
  yes('a kind named after an object property is not a kind', v({ kinds: ['constructor', 'toString'] }) === null, JSON.stringify(v({ kinds: ['constructor', 'toString'] })));
  yes('tidally_locked must be true itself', V({ tidally_locked: true }).locked === true && same(V({ tidally_locked: true }).notes, [LOCKED_WORDS]) && v({ tidally_locked: 'yes' }) === null && v({ tidally_locked: 1 }) === null);
  yes('temperature "cold" is the page\'s cold, with its words', V({ temperature: 'cold' }).cold === true && V({ temperature: 'cold' }).hot === null && same(V({ temperature: 'cold' }).notes, [COLD_WORDS]));
  yes('temperature "hot" is the page\'s hot, with its words', V({ temperature: 'hot' }).hot === true && V({ temperature: 'hot' }).cold === null && same(V({ temperature: 'hot' }).notes, [HOT_WORDS]));
  yes('any other temperature is dropped', v({ temperature: 'warm' }) === null && v({ temperature: true }) === null && v({ temperature: 'Cold' }) === null);
  yes('a range with its ends the wrong way round is dropped, a sound one kept', v({ ranges: { R: [3, 1] } }) === null && same(V({ ranges: { R: [1, 3] } }).ranges, { R: [1, 3] }) && same(V({ ranges: { R: [2, 2] } }).ranges, { R: [2, 2] }));
  yes('a range may be open at one end, and not at both', same(V({ ranges: { R: [null, 2] } }).ranges, { R: [null, 2] }) && same(V({ ranges: { R: [2, null] } }).ranges, { R: [2, null] }) && v({ ranges: { R: [null, null] } }) === null);
  yes('an empty end is an open end, and is not zero', same(V({ ranges: { R: ['', 2] } }).ranges, { R: [null, 2] }) && same(V({ ranges: { R: [2, ''] } }).ranges, { R: [2, null] }) && v({ ranges: { R: ['', ''] } }) === null);
  yes('a range is noted in words, with its unit and its thousands; a year keeps its own form', same(V({ ranges: { dist: [null, 100] } }).notes, ['Distance up to 100 ly']) && same(V({ ranges: { Teq: [200, null] } }).notes, ['Teq (published) from 200 K'])
    && same(V({ ranges: { R: [1, 3] } }).notes, ['Radius 1 to 3 R⊕']) && same(V({ ranges: { year: [2020, null] } }).notes, ['Discovered from 2020']) && same(V({ ranges: { Teff: [null, 3900] } }).notes, ['Star Teff up to 3,900 K'])
    && same(V({ ranges: { P: [1, 10] } }).notes, ['Period 1 to 10 d']) && same(V({ ranges: { S: [0.5, 2] } }).notes, ['Insolation 0.5 to 2 S⊕']) && same(V({ ranges: { Rs: [0.5, 1] } }).notes, ['Star radius 0.5 to 1 R☉']));
  yes('a range written as min and max is read', same(V({ ranges: { dist: { min: null, max: 40 } } }).ranges, { dist: [null, 40] }) && same(V({ ranges: { dist: { min: 5, max: null } } }).ranges, { dist: [5, null] }));
  yes('a range on a field the page does not have is dropped', v({ ranges: { mass: [1, 2] } }) === null);
  yes('a range that is not a number is dropped', v({ ranges: { Teq: ['cold', null] } }) === null && v({ ranges: { Teq: [null, 'hot'] } }) === null);
  yes('every field the page has can carry a range', same(RANGE_FIELDS.map((x) => x.key), ['R', 'Teq', 'S', 'dist', 'Teff', 'Rs', 'P', 'year']) && RANGE_FIELDS.every((f) => f.key && f.label && same(V({ ranges: { [f.key]: [1, 2] } }).ranges, { [f.key]: [1, 2] })) && RANGE_FIELDS.find((f) => f.key === 'Teq').label === 'Teq (published)');
  yes('habitable_zone true sets the zone; a string does not', same(V({ habitable_zone: true }).zone, ['cons', 'opt']) && same(V({ habitable_zone: true }).notes, ['inside the conservative or the optimistic habitable zone']) && v({ habitable_zone: 'true' }) === null);
  yes('a method the page has is kept as written and noted; "other" and a misspelt one are dropped', V({ method: 'Transit' }).method === 'Transit' && same(V({ method: 'Radial Velocity' }).notes, ['found by radial velocity']) && v({ method: 'other' }) === null && v({ method: 'transit' }) === null && v({ method: 5 }) === null);
  yes('every key the page can order by is accepted, and no other', ['earthlike', 'dist', 'R', 'P', 'year', 'S'].every((k) => same(V({ sort: { key: k, dir: 'asc' } }).sort, { key: k, dir: 1 })) && V({ kinds: ['ice'], sort: { key: 'mass', dir: 'asc' } }).sort === null);
  yes('a sort by Teq uses the found temperature, as "coldest" does', same(V({ sort: { key: 'Teq', dir: 'asc' } }).sort, { key: 'T', dir: 1 }) && same(V({ sort: { key: 'Teq', dir: 'desc' } }).sort, { key: 'T', dir: -1 }));
  yes('a direction may be written as a word or as 1', same(V({ sort: { key: 'R', dir: 1 } }).sort, { key: 'R', dir: 1 }) && same(V({ sort: { key: 'R', dir: 'asc' } }).sort, { key: 'R', dir: 1 }) && same(V({ sort: { key: 'R', dir: 'desc' } }).sort, { key: 'R', dir: -1 }));
  yes('a sort with no direction is descending, and a sort alone is a reading', same(V({ sort: { key: 'R' } }).sort, { key: 'R', dir: -1 }) && V({ sort: { key: 'R' } }).recognised === 1);
  yes('a reply that passed is complete: it has no unread word, no doubt and no turn', V({ temperature: 'cold' }).complete === true && same(V({ temperature: 'cold' }).unused, []) && same(V({ temperature: 'cold' }).doubts, []) && V({ temperature: 'cold' }).turned === null);
}

/* ---- the one call to a model ---- */
{
  const real = LLM.complete;
  let sent = null;
  LLM.complete = async (req) => { sent = req; return { source: 'ollama', model: 'm', json: { temperature: 'cold' } }; };
  const long = 'cold '.repeat(200);
  const a = await askModel(long);
  yes('the model is told the page\'s units and bounds', sent.system === SYSTEM
    && ['R in Earth radii', 'Teq in kelvin (published equilibrium temperature)', 'S insolation relative to Earth', 'dist in light-years', 'Teff of the host star in kelvin', 'Rs radius of the host star in solar radii', 'P orbital period in days', 'year the year of discovery',
      '"cold" (equilibrium temperature under 200 K)', '"hot" (1000 K or more)', 'A negation ("not cold", "outside the habitable zone") must be written as the ranges that hold, never as the thing negated.',
      'Use null for an open end.', '"tidally_locked": true or null', '"habitable_zone": true or false', '"dir": "asc" or "desc"'].every((x) => SYSTEM.includes(x)), SYSTEM.slice(0, 80));
  yes('the model is told every field, kind, method and order the page will accept', RANGE_FIELDS.every((x) => SYSTEM.includes(`"${x.key}": [min, max]`)) && KINDS.every((k) => SYSTEM.includes(`"${k.look}"`))
    && ['Transit', 'Radial Velocity', 'Microlensing', 'Imaging'].every((x) => SYSTEM.includes(`"${x}"`)) && ['earthlike', 'Teq', 'dist', 'R', 'P', 'year', 'S'].every((k) => SYSTEM.includes(`"${k}"`)));
  yes('the question sent is cut at 300 characters, and the reply is asked for as JSON at temperature 0', QUESTION_MAX === 300 && sent.prompt === 'QUESTION: ' + long.slice(0, 300) && sent.json === true && sent.temperature === 0 && typeof sent.fallback === 'function' && sent.fallback() === null);
  yes('a sound reply comes back as a reading, with the route that gave it', a.q !== null && a.q.cold === true && a.res.source === 'ollama');
  LLM.complete = async () => ({ source: 'offline', model: 'deterministic', json: { temperature: 'cold' } });
  yes('with no model on the line there is no reading, whatever the fallback returned', (await askModel('x')).q === null);
  LLM.complete = async () => ({ source: 'ollama', model: 'm', json: { kinds: ['jungle'] } });
  yes('a reply that fails its checks is no reading', (await askModel('x')).q === null);
  const ctrl = new AbortController();
  LLM.complete = async (req) => { sent = req; return { source: 'ollama', model: 'm', json: null }; };
  await askModel('x', ctrl.signal);
  yes('the caller\'s abort signal is passed on', sent.signal === ctrl.signal);
  LLM.complete = real;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
