/* ============================================================
   altverse/lexicon.js — data the classifier and the engine read:
   the knob vector of our world, the patterns that read a typed
   divergence, our technology ladder, our chronology, and the
   syllables names are built from. Adding a family is adding an
   entry here plus its rules in rules.js; the core does not change.
   ============================================================ */

/* Our world as a knob vector. A divergence is a delta on this. */
export const BASE_KNOBS = Object.freeze({
  gFactor: 1,          // surface gravity / ours (same radius, so mass scales with it)
  alphaFactor: 1,      // fine-structure constant / ours
  cFactor: 1,          // speed of light / ours (only its effect on alpha is modelled)
  iceDensity: 0.917,   // g/cm^3; above 1.0 ice sinks
  tiltDeg: 23.44,
  dayHours: 24,
  moon: 1,             // Moon mass / ours; 0 = no Moon
  moonDist: 1,         // Moon distance / ours
  solar: 1,            // irradiance at Earth / ours
  seaLevelM: 0,        // offset from our sea level
  oceanFrac: null,     // when set, sea level is solved to give this ocean fraction
  co2ppm: 280,
  o2Frac: 0.209,
  impact: true,        // the K-Pg impactor hits
  panama: true,        // the Isthmus of Panama closes
  medFlood: true,      // the Mediterranean refills after the Messinian crisis
  tech: {},            // tech id -> shift in years (negative = earlier), or 'never'
  removed: [],         // baseline event ids that do not happen
  popFactor: 1,        // population after the divergence / ours
  unity: 0,            // -1 fragmented .. +1 unified polities
  generic: null,       // { subject, polarity, domain } for a change no family covers
});

/* Number words the magnitude reader understands. */
export const NUMBER_WORDS = {
  half: 0.5, third: 1 / 3, quarter: 0.25, twice: 2, double: 2, doubled: 2, thrice: 3, triple: 3, tripled: 3,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, fifty: 50, hundred: 100, thousand: 1000,
};
export const DOWN_WORDS = /\b(slower|weaker|dimmer|fainter|smaller|less|lower|fewer|lighter|cooler|shorter|thinner|reduced|halved|drops?|falls?)\b/i;
export const UP_WORDS = /\b(faster|stronger|brighter|hotter|larger|bigger|more|higher|greater|heavier|longer|thicker|increased|rises?)\b/i;
export const NEGATION = /\b(never|no|not|without|didn't|did not|doesn't|does not|fails? to|avoid(ed|s)?|misses|missed|absent)\b/i;

/* Technology ladder of our world. year = first practical appearance
   in the record (rounded). deps = what it is built on. [REAL] dates. */
export const TECH = [
  { id: 'fire', name: 'habitual fire', year: -400000, deps: [], re: /\bfire\b/i },
  { id: 'agriculture', name: 'agriculture', year: -10000, deps: [], re: /agricultur|farming|crops?\b/i },
  { id: 'wheel', name: 'the wheel', year: -3500, deps: ['agriculture'], re: /\bwheel/i },
  { id: 'bronze', name: 'bronze', year: -3300, deps: ['agriculture', 'fire'], re: /bronze/i },
  { id: 'writing', name: 'writing', year: -3200, deps: ['agriculture'], re: /writing|alphabet|literacy|script\b/i },
  { id: 'iron', name: 'iron smelting', year: -1200, deps: ['bronze'], re: /\biron\b/i },
  { id: 'gunpowder', name: 'gunpowder', year: 850, deps: ['writing', 'iron'], re: /gunpowder/i },
  { id: 'printing', name: 'the movable-type press', year: 1450, deps: ['writing', 'iron'], re: /print(ing)?|press\b/i },
  { id: 'telescope', name: 'the telescope', year: 1608, deps: ['printing'], re: /telescope/i },
  { id: 'steam', name: 'the steam engine', year: 1712, deps: ['iron', 'printing'], re: /steam/i },
  { id: 'battery', name: 'the electric battery', year: 1800, deps: ['printing', 'iron'], re: /electric|battery|electricity/i },
  { id: 'telegraph', name: 'the telegraph', year: 1837, deps: ['battery'], re: /telegraph/i },
  { id: 'flight', name: 'powered flight', year: 1903, deps: ['steam'], re: /\bflight|aeroplane|airplane|aircraft|flying machine/i },
  { id: 'antibiotics', name: 'antibiotics', year: 1928, deps: ['printing'], re: /antibiotic|penicillin/i },
  { id: 'fission', name: 'nuclear fission', year: 1938, deps: ['battery'], re: /fission|nuclear|atomic/i },
  { id: 'transistor', name: 'the transistor', year: 1947, deps: ['telegraph'], re: /transistor|computer|computing|digital/i },
  { id: 'orbit', name: 'orbital flight', year: 1957, deps: ['flight'], re: /orbit|space ?flight|rocket|sputnik|satellite/i },
  { id: 'internet', name: 'packet networks', year: 1969, deps: ['transistor'], re: /internet|arpanet|network/i },
];
export const TECH_BY_ID = Object.fromEntries(TECH.map((t) => [t.id, t]));

/* Our chronology: the river's ghost channel and the scaffold the
   engine edits. src keys point into sources.js. [REAL] dates, rounded. */
export const CHRONO = [
  { id: 'b-earth', year: -4.54e9, title: 'Earth forms', domain: 'planet', src: 'dalrymple2001' },
  { id: 'b-moon', year: -4.5e9, title: 'A giant impact makes the Moon', domain: 'planet', needs: 'moon', src: 'record' },
  { id: 'b-ocean', year: -4.4e9, title: 'Zircons record liquid water', domain: 'planet', needs: 'water', src: 'wilde2001' },
  { id: 'b-life', year: -3.7e9, title: 'Earliest traces of life', domain: 'life', needs: 'life', src: 'record' },
  { id: 'b-goe', year: -2.4e9, title: 'Oxygen accumulates in the air', domain: 'life', needs: 'life', src: 'record' },
  { id: 'b-snow', year: -7.17e8, title: 'The Cryogenian ice reaches the tropics', domain: 'climate', needs: 'water', src: 'record' },
  { id: 'b-cambrian', year: -5.39e8, title: 'Animal body plans diversify', domain: 'life', needs: 'complex', src: 'record' },
  { id: 'b-landplants', year: -4.7e8, title: 'Plants colonise land', domain: 'life', needs: 'complex', src: 'record' },
  { id: 'b-forest', year: -3.85e8, title: 'The first forests', domain: 'life', needs: 'complex', src: 'record' },
  { id: 'b-coal', year: -3.2e8, title: 'Buried wood becomes coal', domain: 'life', needs: 'complex', src: 'floudas2012' },
  { id: 'b-pt', year: -2.52e8, title: 'The end-Permian extinction', domain: 'life', needs: 'complex', src: 'record' },
  { id: 'b-messinian', year: -5.96e6, title: 'The Mediterranean dries out', domain: 'planet', needs: 'water', src: 'garcia2009' },
  { id: 'b-zanclean', year: -5.33e6, title: 'The Atlantic refills the Mediterranean', domain: 'planet', needs: 'water', src: 'garcia2009' },
  { id: 'b-kpg', year: -6.6e7, title: 'An asteroid ends the non-avian dinosaurs', domain: 'life', needs: 'complex', src: 'renne2013' },
  { id: 'b-panama', year: -2.8e6, title: 'The Isthmus of Panama closes', domain: 'planet', needs: 'water', src: 'odea2016' },
  { id: 'b-homo', year: -2.8e6, title: 'The genus Homo appears', domain: 'people', needs: 'observers', src: 'record' },
  { id: 'b-fire', year: -4e5, title: 'Fire becomes habitual', domain: 'people', needs: 'observers', tech: 'fire', src: 'record' },
  { id: 'b-sapiens', year: -3e5, title: 'Homo sapiens', domain: 'people', needs: 'observers', src: 'hublin2017' },
  { id: 'b-lgm', year: -2.6e4, title: 'The last glacial maximum', domain: 'climate', needs: 'water', src: 'record' },
  { id: 'b-agri', year: -1e4, title: 'Farming begins', domain: 'people', needs: 'observers', tech: 'agriculture', src: 'record' },
  { id: 'b-wheel', year: -3500, title: 'The wheel', domain: 'technology', needs: 'observers', tech: 'wheel', src: 'record' },
  { id: 'b-bronze', year: -3300, title: 'Bronze', domain: 'technology', needs: 'observers', tech: 'bronze', src: 'record' },
  { id: 'b-writing', year: -3200, title: 'Writing in Sumer', domain: 'people', needs: 'observers', tech: 'writing', src: 'record' },
  { id: 'b-iron', year: -1200, title: 'Iron smelting spreads', domain: 'technology', needs: 'observers', tech: 'iron', src: 'record' },
  { id: 'b-rome', year: 476, title: 'The western Roman Empire falls', domain: 'people', needs: 'observers', src: 'record' },
  { id: 'b-gunpowder', year: 850, title: 'Gunpowder', domain: 'technology', needs: 'observers', tech: 'gunpowder', src: 'record' },
  { id: 'b-plague', year: 1347, title: 'The Black Death', domain: 'people', needs: 'observers', src: 'record' },
  { id: 'b-print', year: 1450, title: 'The movable-type press', domain: 'technology', needs: 'observers', tech: 'printing', src: 'record' },
  { id: 'b-contact', year: 1492, title: 'Sustained contact between the hemispheres', domain: 'people', needs: 'observers', src: 'record' },
  { id: 'b-telescope', year: 1608, title: 'The telescope', domain: 'technology', needs: 'observers', tech: 'telescope', src: 'record' },
  { id: 'b-steam', year: 1712, title: 'The steam engine', domain: 'technology', needs: 'observers', tech: 'steam', src: 'record' },
  { id: 'b-battery', year: 1800, title: 'The electric battery', domain: 'technology', needs: 'observers', tech: 'battery', src: 'record' },
  { id: 'b-telegraph', year: 1837, title: 'The telegraph', domain: 'technology', needs: 'observers', tech: 'telegraph', src: 'record' },
  { id: 'b-flight', year: 1903, title: 'Powered flight', domain: 'technology', needs: 'observers', tech: 'flight', src: 'record' },
  { id: 'b-antibiotics', year: 1928, title: 'Penicillin', domain: 'technology', needs: 'observers', tech: 'antibiotics', src: 'record' },
  { id: 'b-fission', year: 1938, title: 'Nuclear fission', domain: 'technology', needs: 'observers', tech: 'fission', src: 'record' },
  { id: 'b-transistor', year: 1947, title: 'The transistor', domain: 'technology', needs: 'observers', tech: 'transistor', src: 'record' },
  { id: 'b-orbit', year: 1957, title: 'First satellite in orbit', domain: 'technology', needs: 'observers', tech: 'orbit', src: 'record' },
  { id: 'b-internet', year: 1969, title: 'The first packet network', domain: 'technology', needs: 'observers', tech: 'internet', src: 'record' },
];
export const CHRONO_BY_ID = Object.fromEntries(CHRONO.map((e) => [e.id, e]));

/* Named historical events a typed divergence can point at. */
export const EVENTS = [
  { id: 'rome', re: /\brom(e|an)\b/i, base: 'b-rome', year: 476,
    ours: 'The western Roman Empire fell in 476.', subject: 'the western Roman Empire',
    knobs: { unity: 0.6, tech: { printing: -250 } }, domain: 'politics' },
  { id: 'plague', re: /black death|bubonic|\bplague\b/i, base: 'b-plague', year: 1347,
    ours: 'The Black Death killed an estimated 30 to 60 percent of Europe between 1347 and 1351.', subject: 'the Black Death',
    knobs: { popFactor: 1.35, tech: { steam: 40, printing: 15 } }, domain: 'disease' },
  { id: 'contact', re: /columbus|1492|new world|americas/i, base: 'b-contact', year: 1492,
    ours: 'Sustained contact between the hemispheres began in 1492.', subject: 'contact between the hemispheres',
    knobs: { tech: { steam: 30 } }, domain: 'exploration' },
  { id: 'alexandria', re: /alexandria|great library/i, base: null, year: -48,
    ours: 'The Library of Alexandria declined over centuries; a fire in 48 BCE is the famous episode.', subject: 'the Library of Alexandria',
    knobs: { tech: { printing: -150, telescope: -120, steam: -80 } }, domain: 'science' },
];

/* Domains for a divergence no family covers. */
export const DOMAINS = [
  { id: 'science', re: /scien|discover|physic|math|theor|scholar|universit|library/i, tech: -60 },
  { id: 'war', re: /\bwar\b|battle|army|invasion|conquest|empire|militar/i, tech: 0, unity: 0.3 },
  { id: 'religion', re: /relig|church|faith|god|temple|prophet|belief/i, tech: 20 },
  { id: 'trade', re: /trade|market|merchant|money|bank|coin|econom/i, tech: -30 },
  { id: 'disease', re: /disease|pandemic|epidemic|virus|smallpox|plague/i, tech: 10, pop: 1.2 },
  { id: 'climate', re: /climate|drought|volcan|eruption|cold|warm|winter/i, tech: 15, pop: 0.85 },
  { id: 'politics', re: /king|queen|republic|democra|revolution|state|nation|law/i, tech: 0 },
  { id: 'exploration', re: /sail|voyage|explor|ship|navigat|map/i, tech: -20 },
];

/* Syllables for names. Monochrome, pronounceable, nothing branded. */
export const NAME_PARTS = {
  head: ['VET', 'LEN', 'BAR', 'OR', 'KAL', 'SER', 'TAM', 'IR', 'DO', 'MER', 'AS', 'HEL', 'NOR', 'VAL', 'TER', 'CAS', 'EM', 'RU', 'SOL', 'AR'],
  mid: ['', '', 'A', 'E', 'I', 'O', 'U', 'AN', 'EL', 'OR', 'IS'],
  tail: ['LEND', 'TUA', 'UND', 'VEN', 'MARA', 'HOLM', 'DRA', 'SETH', 'NOR', 'GARD', 'ETH', 'IS', 'ON', 'ARA', 'ESK'],
  place: ['Ash', 'Fenn', 'Hollow', 'Mere', 'Stade', 'Wick', 'Thorn', 'Cairn', 'Ford', 'Holt', 'Brae', 'Stead', 'Kell', 'Rime', 'Tor', 'Vale', 'Weir', 'Harl', 'Oss', 'Lune'],
  root: ['Ker', 'Ost', 'Mal', 'Tev', 'Rin', 'Sar', 'Hal', 'Dov', 'Ilm', 'Vor', 'Pel', 'Bri', 'Cal', 'Esk', 'Gal', 'Nim', 'Ord', 'Tul', 'Ys', 'Zan'],
  suffix: ['a', 'en', 'is', 'or', 'um', 'eth', 'ar', 'ov', 'ine', 'esh'],
};
