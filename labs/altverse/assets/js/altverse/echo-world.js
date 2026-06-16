/* ============================================================
   altverse/echo-world.js — the offline world generator.
   Fills the SAME schemas the live Nemotron stages fill, from
   seeded, physically-grounded authored content, so the
   orchestrator / validator / renderers run IDENTICALLY with zero
   network. ECHO worlds are real-but-uncreative and badged
   "offline sample". The hero divergence (ice-sinks) is authored
   with worldbuilding rigor; a generic assembler covers the rest.
   ============================================================ */

import { createWorld, computeConsistency, addFact } from './worldstate.js';
import { makeRng } from './rng.js';

// bbox convention: [lonMin, latMin, lonMax, latMax]
const CONTENT = {
  /* ---------------- HERO: ice sinks ---------------- */
  'ice-sinks': {
    name: 'VETHLEND',
    motto: 'The deep keeps the cold.',
    premise: {
      text: 'When water freezes here, the ice sinks. With no density maximum near 4 °C, the coldest water falls to the bottom and solidifies there — so lakes, seas and finally oceans freeze from the bed upward, never sealed by an insulating lid. Nothing liquid survives a hard winter below the surface.',
      firstMechanism: 'Without the 4 °C density anomaly, cold water sinks and freezes at the floor; denser-than-liquid ice never rises to insulate what remains.',
      ladder: 'THEORETICAL',
    },
    axioms: [
      'Ice is denser than liquid water at every temperature; frozen water sinks.',
      'A freezing body of water solidifies from the bottom upward.',
      'No permanent liquid layer survives beneath winter ice.',
      'Deep ice, once formed at the bed, thaws only by slow conduction from above.',
      'Aquatic life cannot overwinter in a liquid refuge under the ice.',
    ],
    firstOrder: [
      { id: 'fx-001', text: 'Lakes and shallow seas freeze solid to the bed each winter; nothing liquid survives below.', mechanism: 'bottom-up freezing', ladder: 'THEORETICAL' },
      { id: 'fx-002', text: 'Polar oceans accumulate a thickening floor of perennial ice; water is displaced upward onto the shelves.', mechanism: 'dense ice settling on the seabed', ladder: 'SPECULATIVE' },
      { id: 'fx-003', text: 'Complex freshwater life is nearly impossible; aquatic ecosystems collapse and reseed each year.', mechanism: 'no under-ice liquid refuge', ladder: 'THEORETICAL' },
      { id: 'fx-004', text: 'Seasons swing violently: dark open water drinks summer heat, bare ice fields throw winter light back, with no surface layer to buffer either.', mechanism: 'lost surface insulation + albedo feedback', ladder: 'SPECULATIVE' },
      { id: 'fx-005', text: 'Once begun, an ice age is almost irreversible — oceans freeze from the floor and resist melting back.', mechanism: 'runaway bottom-ice', ladder: 'SPECULATIVE' },
      { id: 'fx-006', text: 'Life and people cluster where water refuses to freeze: fast rivers and geothermally warmed springs.', mechanism: 'refugia only where flow or heat persists', ladder: 'THEORETICAL' },
    ],
    regions: [
      { id: 'rg-001', name: 'The Standing Ice', bbox: [-180, 58, 180, 90], dominantBiome: 'perennial sea-floor ice', climate: 'frozen', rationale: 'oceans frozen from the bed up never fully thaw', ladder: 'SPECULATIVE' },
      { id: 'rg-002', name: 'The Quick Waters', bbox: [-130, 18, 70, 52], dominantBiome: 'fast rivers and geothermal lakes', climate: 'temperate, turbulent', rationale: 'only moving or heated water resists bottom-freezing; life and trade cluster here', ladder: 'THEORETICAL' },
      { id: 'rg-003', name: 'The Sere Equator', bbox: [-65, -16, 95, 16], dominantBiome: 'arid steppe', climate: 'hot, violently seasonal', rationale: 'the lost ocean buffer dries the tropics in long swings', ladder: 'SPECULATIVE' },
      { id: 'rg-004', name: 'The Hearthlands', bbox: [-150, -52, -88, -8], dominantBiome: 'volcanic warm springs', climate: 'cool, sheltered', rationale: 'geothermal heat keeps water liquid year-round; the cradle of settlement', ladder: 'THEORETICAL' },
      { id: 'rg-005', name: 'The Drowned Shelves', bbox: [80, -42, 165, 8], dominantBiome: 'tidal flats over sunken ice', climate: 'cold maritime', rationale: 'seabed ice displaces water up onto the continental shelves', ladder: 'SPECULATIVE' },
    ],
    chronology: {
      eras: [
        { id: 'er-1', name: 'The Cold Genesis', start: -4000000000, end: -540000000, divergenceDistance: 0 },
        { id: 'er-2', name: 'The Refuge Age', start: -540000000, end: -2500000, divergenceDistance: 1 },
        { id: 'er-3', name: 'The First Hearths', start: -2500000, end: -8000, divergenceDistance: 2 },
        { id: 'er-4', name: 'The Ice Compacts', start: -8000, end: 1850, divergenceDistance: 3 },
        { id: 'er-5', name: 'The Thaw Engines', start: 1850, end: 2200, divergenceDistance: 4 },
      ],
      events: [
        { id: 'ev-001', eraId: 'er-1', year: -3800000000, title: 'Life stalls in unstable waters', cause: 'fx-003', ladder: 'SPECULATIVE' },
        { id: 'ev-002', eraId: 'er-2', year: -480000000, title: 'The Vent Bloom — life takes hold at warm springs', cause: 'fx-006', ladder: 'THEORETICAL' },
        { id: 'ev-003', eraId: 'er-3', year: -90000, title: 'Hominids settle the geothermal Hearthlands', cause: 'fx-006', ladder: 'THEORETICAL' },
        { id: 'ev-004', eraId: 'er-4', year: -3200, title: 'The first Ice Compacts: cities organize to keep water liquid', cause: 'fx-001', ladder: 'SPECULATIVE' },
        { id: 'ev-005', eraId: 'er-4', year: 1601, title: 'The Long Freeze nearly ends civilization', cause: 'fx-005', ladder: 'SPECULATIVE' },
        { id: 'ev-006', eraId: 'er-5', year: 1980, title: 'Thaw-engines hold back the Standing Ice', cause: 'fx-002', ladder: 'SF' },
      ],
    },
    contrast: [
      { id: 'con-001', ours: 'Fish overwinter under a lid of floating ice.', theirs: 'Lakes freeze solid to the bed; freshwater fish as we know them never evolve.', path: ['fx-001', 'fx-003'], ladder: 'THEORETICAL' },
      { id: 'con-002', ours: 'Liquid polar oceans drive thermohaline currents and a stable climate.', theirs: 'Polar seabeds are paved with perennial ice; circulation is throttled and the climate lurches.', path: ['fx-002', 'fx-004'], ladder: 'SPECULATIVE' },
      { id: 'con-003', ours: 'Great cities rose on rivers and coasts.', theirs: 'Great cities rose on geothermal highlands — the only reliably liquid water.', path: ['fx-006', 'rg-004'], ladder: 'THEORETICAL' },
      { id: 'con-004', ours: 'An ice age is a slow, survivable cooling.', theirs: 'An ice age is a near-extinction: oceans freeze from the floor and barely melt back.', path: ['fx-005'], ladder: 'SPECULATIVE' },
    ],
    civs: [
      { id: 'civ-001', name: 'The Hearth-Keepers', regionId: 'rg-004', rises: 'ev-003', traits: ['geothermal cities', 'water-wardens', 'stone acoustics'], new_facts: ['liquid-water law'] },
      { id: 'civ-002', name: 'The Quickwater Traders', regionId: 'rg-002', rises: 'ev-004', traits: ['river-borne', 'seasonal nomads', 'ice-readers'] },
      { id: 'civ-003', name: 'The Compact Cities', regionId: 'rg-002', rises: 'ev-004', falls: 'ev-005', traits: ['heat-engineers', 'ice-compact law', 'nearly lost in the Long Freeze'] },
    ],
    entry: {
      vignette: 'You arrive at dusk on the shore of a lake that is not a lake but a floor of standing ice, and the warmth at your back is the only reason you are alive: behind you the Hearthlands breathe steam into a freezing sky. Somewhere under the ice, nothing moves. Everything that lives here lives because the water never stopped.',
      threads: [
        { title: 'Walk into the Hearthlands', regionId: 'rg-004', civId: 'civ-001', eventId: 'ev-003' },
        { title: 'Follow the Quick Waters', regionId: 'rg-002', civId: 'civ-002', eventId: 'ev-004' },
        { title: 'Witness the Long Freeze', regionId: 'rg-001', civId: 'civ-003', eventId: 'ev-005' },
      ],
    },
    facts: [
      { name: 'density maximum', fact: 'absent — water is densest as a solid', ladder: 'THEORETICAL' },
      { name: 'winter lake', fact: 'frozen solid to the bed', ladder: 'THEORETICAL', mag: '0 m liquid below' },
      { name: 'settlement anchor', fact: 'geothermal springs and fast rivers', ladder: 'THEORETICAL' },
    ],
    reasoning: {
      premise: ['anchoring the divergence: water loses its 4 °C density maximum', 'first mechanism: cold water sinks and freezes at the bed', 'holding it loosely: no insulating surface ice forms'],
      firstOrder: ['propagating: shallow water freezes solid, bottom-up', 'refugia check: only moving or heated water stays liquid', 'albedo + lost insulation -> sharper seasons'],
      geography: ['placing life where water resists freezing', 'geothermal highlands as the reliable hearth', 'polar seabeds paved with perennial ice'],
      chronology: ['life struggles to begin in unstable waters', 'settlement clusters at warm springs', 'civilization organizes around keeping water liquid'],
      contrast: ['ours: fish under floating ice; theirs: lakes frozen solid', 'tracing fx-001 -> fx-003'],
      civilizations: ['placing peoples where water stays liquid', 'the Hearth-Keepers hold the geothermal cities', 'the Compact Cities nearly fall in the Long Freeze'],
      entry: ['composing the arrival on the standing ice', 'anchoring threads to real regions and peoples'],
    },
  },

  /* ---------------- slow light ---------------- */
  'slow-light': {
    name: 'LENTUA',
    motto: 'The sky arrives late.',
    premise: {
      text: 'Light, and with it causality itself, crawls at a tenth of its familiar speed. Relativity is no longer a laboratory curiosity: time dilation, the mass-energy ceiling and signal lag become facts of engineering and everyday life. The world feels larger and slower, and minds grow up fluent in reference frames.',
      firstMechanism: 'With c ten times smaller, relativistic effects (which scale with v/c) and propagation delays appear at the speeds real machines and signals reach.',
      ladder: 'SPECULATIVE',
    },
    axioms: [
      'The speed of causality is one tenth of ours.',
      'Relativistic effects appear at the velocities of fast vehicles and machines.',
      'No signal crosses any distance faster than this slower light.',
      'The energy cost to accelerate mass rises steeply at far lower speeds.',
    ],
    firstOrder: [
      { id: 'fx-001', text: 'Long-distance real-time coordination is hard; the planet feels ten times wider.', mechanism: 'slower signal causality', ladder: 'SPECULATIVE' },
      { id: 'fx-002', text: 'Microchips hit a clock-speed ceiling early — signals cross the die too slowly to switch fast.', mechanism: 'light-limited gate timing', ladder: 'SPECULATIVE' },
      { id: 'fx-003', text: 'Fast aircraft and satellites show measurable time dilation; clocks must be corrected constantly.', mechanism: '(v/c)² up a hundredfold', ladder: 'THEORETICAL' },
      { id: 'fx-004', text: 'The mass-energy ceiling is a practical engineering wall, not an abstraction — high speed is brutally expensive.', mechanism: 'relativistic mass gain at lower v', ladder: 'SPECULATIVE' },
      { id: 'fx-005', text: 'Culture internalizes relativity early: simultaneity, delay and frames enter everyday intuition.', mechanism: 'lived relativistic experience', ladder: 'SPECULATIVE' },
      { id: 'fx-006', text: 'Computing turns to massive parallelism and optics rather than raw clock speed.', mechanism: 'routing around the light wall', ladder: 'SPECULATIVE' },
    ],
    regions: [
      { id: 'rg-001', name: 'The Latency Marches', bbox: [-160, 10, -40, 60], dominantBiome: 'sparse interior', climate: 'continental', rationale: 'slow signals leave the deep interior loosely governed', ladder: 'SPECULATIVE' },
      { id: 'rg-002', name: 'The Clockwork Coasts', bbox: [-30, 30, 50, 62], dominantBiome: 'dense industrial littoral', climate: 'temperate', rationale: 'short distances keep coordination tight; optical and parallel computing thrives', ladder: 'SPECULATIVE' },
      { id: 'rg-003', name: 'The Frame Cities', bbox: [60, 18, 150, 52], dominantBiome: 'relativity-native metropolises', climate: 'varied', rationale: 'cultures built around correcting for delay and dilation', ladder: 'SPECULATIVE' },
      { id: 'rg-004', name: 'The Slow-Sky Reaches', bbox: [-80, -50, 40, -10], dominantBiome: 'observatory highlands', climate: 'cold, clear', rationale: 'a visibly light-lagged sky reorganizes astronomy and timekeeping', ladder: 'THEORETICAL' },
    ],
    chronology: {
      eras: [
        { id: 'er-1', name: 'The Patient Antiquity', start: -6000, end: 1600, divergenceDistance: 0 },
        { id: 'er-2', name: 'The Frame Enlightenment', start: 1600, end: 1900, divergenceDistance: 1 },
        { id: 'er-3', name: 'The Light Wall', start: 1900, end: 2010, divergenceDistance: 2 },
        { id: 'er-4', name: 'The Parallel Age', start: 2010, end: 2200, divergenceDistance: 3 },
      ],
      events: [
        { id: 'ev-001', eraId: 'er-1', year: -300, title: 'Couriers, not signals: empires stay small and slow', cause: 'fx-001', ladder: 'SPECULATIVE' },
        { id: 'ev-002', eraId: 'er-2', year: 1687, title: 'Relativity discovered centuries early, from everyday delay', cause: 'fx-005', ladder: 'SPECULATIVE' },
        { id: 'ev-003', eraId: 'er-3', year: 1965, title: 'The clock-speed wall halts the single-processor era', cause: 'fx-002', ladder: 'SPECULATIVE' },
        { id: 'ev-004', eraId: 'er-4', year: 2030, title: 'Optical, massively-parallel computing takes over', cause: 'fx-006', ladder: 'SPECULATIVE' },
      ],
    },
    contrast: [
      { id: 'con-001', ours: 'Global real-time networks knit the planet together.', theirs: 'Distance reasserts itself; coordination is local, the world feels vast.', path: ['fx-001'], ladder: 'SPECULATIVE' },
      { id: 'con-002', ours: 'Chip clock speeds climbed into the gigahertz.', theirs: 'Clocks stall early; progress comes from parallelism and optics.', path: ['fx-002', 'fx-006'], ladder: 'SPECULATIVE' },
      { id: 'con-003', ours: 'Relativity is a 20th-century abstraction.', theirs: 'Relativity is folk knowledge, lived since antiquity.', path: ['fx-003', 'fx-005'], ladder: 'SPECULATIVE' },
    ],
    civs: [
      { id: 'civ-001', name: 'The Frame-Wrights', regionId: 'rg-003', rises: 'ev-002', traits: ['relativity-native', 'clock-correctors', 'delay-poets'] },
      { id: 'civ-002', name: 'The Coast Clockwrights', regionId: 'rg-002', rises: 'ev-003', traits: ['optical computing', 'parallel guilds', 'tight coordination'] },
      { id: 'civ-003', name: 'The March Couriers', regionId: 'rg-001', rises: 'ev-001', traits: ['long-haul riders', 'signal-skeptics', 'slow empires'] },
    ],
    entry: {
      vignette: 'The sky over Lentua arrives late. The star you see set an hour ago; the message in your hand left a city that has, by now, already answered. People here think in frames and delays as easily as you think in left and right, and they pity, gently, anyone who still expects the world to be simultaneous.',
      threads: [
        { title: 'Enter the Frame Cities', regionId: 'rg-003', civId: 'civ-001', eventId: 'ev-002' },
        { title: 'Tour the Clockwork Coasts', regionId: 'rg-002', civId: 'civ-002', eventId: 'ev-003' },
        { title: 'Ride the Latency Marches', regionId: 'rg-001', civId: 'civ-003', eventId: 'ev-001' },
      ],
    },
    facts: [
      { name: 'speed of light', fact: '≈ 30,000 km/s', ladder: 'SPECULATIVE', mag: '0.1×' },
      { name: 'chip clocks', fact: 'capped low; parallelism wins', ladder: 'SPECULATIVE' },
    ],
    reasoning: {
      premise: ['c set to one tenth', 'relativity scales with v/c -> everyday relevance', 'causality and signals slow with it'],
      firstOrder: ['signals lag -> the world feels larger', 'chips hit a light-timing wall', 'fast machines show real time dilation'],
      geography: ['tight coasts coordinate; interiors drift', 'cities built around delay'],
      chronology: ['small slow empires', 'relativity found early', 'the clock-speed wall'],
      contrast: ['ours: gigahertz; theirs: parallel + optics'],
      civilizations: ['peoples organized around delay and reference frames', 'the Frame-Wrights make relativity folk knowledge'],
      entry: ['the late sky as the opening image', 'threads into frame, coast, and march'],
    },
  },

  /* ---------------- stronger gravity ---------------- */
  'strong-gravity': {
    name: 'BARUND',
    motto: 'Everything keeps close to the ground.',
    premise: {
      text: 'Surface gravity is a third stronger. Everything is pulled harder toward the ground: life grows squat and thick-limbed, mountains cannot stand tall, the air piles dense and shallow, and leaving the planet is a punishing engineering problem. It is a low, heavy, grounded world.',
      firstMechanism: 'A 30% stronger pull rescales every structure that fights gravity — bone, rock, atmosphere and rocket alike.',
      ladder: 'THEORETICAL',
    },
    axioms: [
      'Every mass weighs about a third more.',
      'Structures that resist gravity must be squatter and stronger.',
      'The crust cannot support mountains as tall as ours (isostasy).',
      'The atmosphere is denser at the surface and thins faster with height.',
      'Escape velocity and the rocket-equation cost rise sharply.',
    ],
    firstOrder: [
      { id: 'fx-001', text: 'Mountains top out far lower; the crust cannot hold great heights.', mechanism: 'isostatic height limit under higher g', ladder: 'THEORETICAL' },
      { id: 'fx-002', text: 'Life is shorter, broader and thicker-limbed; tall, slender giants are impossible.', mechanism: 'square-cube scaling under higher weight', ladder: 'THEORETICAL' },
      { id: 'fx-003', text: 'The atmosphere is denser at sea level and thins quickly with altitude.', mechanism: 'a steeper pressure gradient', ladder: 'THEORETICAL' },
      { id: 'fx-004', text: 'Powered flight and tall trees are hard; gliders, low canopies and burrowers dominate.', mechanism: 'higher weight-to-lift ratio', ladder: 'THEORETICAL' },
      { id: 'fx-005', text: 'Reaching orbit is brutally expensive; spaceflight arrives late, or never.', mechanism: 'higher escape velocity worsens the rocket equation', ladder: 'SPECULATIVE' },
      { id: 'fx-006', text: 'Seas are heavier and erosion faster; coastlines are broad, shallow and restless.', mechanism: 'a stronger pull on water and sediment', ladder: 'SPECULATIVE' },
    ],
    regions: [
      { id: 'rg-001', name: 'The Worn Ranges', bbox: [-150, 25, -60, 55], dominantBiome: 'low rounded highlands', climate: 'cool', rationale: 'mountains ground down to gentle ranges by the isostatic limit', ladder: 'THEORETICAL' },
      { id: 'rg-002', name: 'The Dense-Air Basins', bbox: [-40, -10, 60, 30], dominantBiome: 'thick-atmosphere lowlands', climate: 'warm, heavy air', rationale: 'compressed atmosphere pools in the lowlands; rich, oxygen-dense', ladder: 'THEORETICAL' },
      { id: 'rg-003', name: 'The Tideheavy Coasts', bbox: [70, -30, 165, 25], dominantBiome: 'broad shallow shores', climate: 'maritime, stormy', rationale: 'heavier seas carve wide restless coastlines', ladder: 'SPECULATIVE' },
      { id: 'rg-004', name: 'The Grounded Steppe', bbox: [-120, -55, -40, -15], dominantBiome: 'low grassland', climate: 'continental', rationale: 'broad-bodied grazers and burrowers on flat, heavy land', ladder: 'THEORETICAL' },
    ],
    chronology: {
      eras: [
        { id: 'er-1', name: 'The Heavy Genesis', start: -4000000000, end: -300000000, divergenceDistance: 0 },
        { id: 'er-2', name: 'The Squat Ages', start: -300000000, end: -10000, divergenceDistance: 1 },
        { id: 'er-3', name: 'The Grounded Empires', start: -10000, end: 1900, divergenceDistance: 2 },
        { id: 'er-4', name: 'The Late Reach', start: 1900, end: 2200, divergenceDistance: 3 },
      ],
      events: [
        { id: 'ev-001', eraId: 'er-2', year: -200000000, title: 'No giants: life settles low and broad', cause: 'fx-002', ladder: 'THEORETICAL' },
        { id: 'ev-002', eraId: 'er-3', year: -3000, title: 'Cities build outward, never upward', cause: 'fx-001', ladder: 'THEORETICAL' },
        { id: 'ev-003', eraId: 'er-3', year: 1903, title: 'Powered flight stays a marginal, costly art', cause: 'fx-004', ladder: 'SPECULATIVE' },
        { id: 'ev-004', eraId: 'er-4', year: 2050, title: 'Orbit reached only by vast, rare efforts', cause: 'fx-005', ladder: 'SF' },
      ],
    },
    contrast: [
      { id: 'con-001', ours: 'Skyscrapers and tall forests reach upward.', theirs: 'Everything is low and broad; the skyline hugs the ground.', path: ['fx-001', 'fx-002'], ladder: 'THEORETICAL' },
      { id: 'con-002', ours: 'Aviation reshaped the 20th century.', theirs: 'Flight stays rare and costly; the world travels by land and sea.', path: ['fx-004'], ladder: 'SPECULATIVE' },
      { id: 'con-003', ours: 'We reached orbit in the 1960s.', theirs: 'Orbit is a once-a-generation feat, if achieved at all.', path: ['fx-005'], ladder: 'SF' },
    ],
    civs: [
      { id: 'civ-001', name: 'The Low Builders', regionId: 'rg-001', rises: 'ev-002', traits: ['outward architects', 'squat strongholds', 'no towers'] },
      { id: 'civ-002', name: 'The Basin Breathers', regionId: 'rg-002', rises: 'ev-001', traits: ['dense-air farmers', 'broad-bodied', 'deep-lunged'] },
      { id: 'civ-003', name: 'The Tide Wardens', regionId: 'rg-003', rises: 'ev-001', traits: ['heavy-sea sailors', 'low harbours', 'storm-readers'] },
    ],
    entry: {
      vignette: 'Barund pulls. You feel it the instant you stand: a third more of your own weight, the horizon low and close, the air thick and rich in your chest. Nothing here reaches up. The cities spread wide and squat across the worn ranges, and overhead the sky is empty of the things that, on lighter worlds, learned to fly.',
      threads: [
        { title: 'Cross the Worn Ranges', regionId: 'rg-001', civId: 'civ-001', eventId: 'ev-002' },
        { title: 'Breathe the Dense-Air Basins', regionId: 'rg-002', civId: 'civ-002', eventId: 'ev-001' },
        { title: 'Sail the Tideheavy Coasts', regionId: 'rg-003', civId: 'civ-003', eventId: 'ev-001' },
      ],
    },
    facts: [
      { name: 'surface gravity', fact: '≈ 12.7 m/s²', ladder: 'THEORETICAL', mag: '1.3×' },
      { name: 'tallest mountains', fact: 'far lower than ours', ladder: 'THEORETICAL' },
    ],
    reasoning: {
      premise: ['gravity scaled to 1.3×', 'everything that fights gravity must rescale', 'bone, rock, air, rocket alike'],
      firstOrder: ['mountains capped by isostasy', 'life goes squat (square-cube)', 'denser, shallower atmosphere'],
      geography: ['worn low ranges', 'thick-air basins pool atmosphere', 'broad restless coasts'],
      chronology: ['no giants', 'cities spread outward', 'flight stays marginal'],
      contrast: ['ours: skyscrapers; theirs: low and broad'],
      civilizations: ['low, broad peoples on heavy land', 'cities spread out, never up'],
      entry: ['the weight as the first sensation', 'an empty sky overhead'],
    },
  },
};

/** Generic fallback for any physics divergence without authored content. */
function genericPhysics(divergence, rng) {
  const stub = (n, mk) => Array.from({ length: n }, (_, i) => mk(i + 1));
  const fx = (i) => 'fx-' + String(i).padStart(3, '0');   // match the minted padding
  const names = ['THRESHOLD', 'THE VEERING', 'OTHERWISE', 'THE FORKED EARTH', 'DIVERGENCE PRIME'];
  return {
    name: rng ? rng.pick(names) : names[0],               // seed-driven, so determinism has teeth
    motto: 'A change, and everything that follows.',
    premise: {
      text: `In this reality, ${divergence.statement} Its first consequence is ${divergence.entryNode}, and the rest of the world reorganizes around that single change.`,
      firstMechanism: divergence.entryNode,
      ladder: divergence.escalation_ceiling || 'SPECULATIVE',
    },
    axioms: [`The divergence holds everywhere and always: ${divergence.statement}`, `Downstream facts may not contradict it.`],
    firstOrder: stub(5, (i) => ({ id: 'fx-' + String(i).padStart(3, '0'), text: `Direct consequence ${i} of the divergence.`, mechanism: divergence.entryNode, ladder: 'SPECULATIVE' })),
    regions: stub(4, (i) => ({ id: 'rg-' + String(i).padStart(3, '0'), name: `Region ${i}`, bbox: [-180 + (i - 1) * 90, -30, -90 + (i - 1) * 90, 30], dominantBiome: 'mixed', climate: 'varied', rationale: 'shaped by the divergence', ladder: 'SPECULATIVE' })),
    chronology: {
      eras: stub(4, (i) => ({ id: 'er-' + i, name: `Era ${i}`, start: -4000 + (i - 1) * 1000, end: -4000 + i * 1000, divergenceDistance: i - 1 })),
      events: stub(3, (i) => ({ id: 'ev-' + String(i).padStart(3, '0'), eraId: 'er-' + (i + 1), year: -3000 + i * 1000, title: `Turning point ${i}`, cause: fx(i), ladder: 'SPECULATIVE' })),
    },
    contrast: stub(3, (i) => ({ id: 'con-' + String(i).padStart(3, '0'), ours: `In our world, situation ${i}.`, theirs: `Here, it diverges.`, path: [fx(i)], ladder: 'SPECULATIVE' })),
    civs: stub(2, (i) => ({ id: 'civ-' + String(i).padStart(3, '0'), name: `People ${i}`, regionId: 'rg-' + String(i).padStart(3, '0'), rises: 'ev-' + String(i).padStart(3, '0'), traits: ['adapted to the divergence'] })),
    entry: { vignette: `You arrive in a world where ${divergence.statement} Everything you see has been shaped by that single change.`, threads: [] },
    facts: [],
    reasoning: { premise: ['anchoring the divergence'], firstOrder: ['propagating direct effects'], geography: ['placing regions'], chronology: ['sketching the timeline'], contrast: ['comparing to our reality'], civilizations: ['placing peoples'], entry: ['composing the arrival'] },
  };
}

export function generateEcho(divergence) {
  const rng = makeRng(divergence.seed);
  const content = CONTENT[divergence.id] || genericPhysics(divergence, rng);

  const world = createWorld(divergence);
  world.tier = 'echo';
  world.name = content.name;
  world.motto = content.motto;
  world.premise = content.premise;
  world.axioms = content.axioms;
  world.effects.firstOrder = content.firstOrder;
  world.map.regions = content.regions;
  world.map.notes = content.mapNotes || ('Shaped by: ' + divergence.statement);
  world.chronology = content.chronology;
  world.contrast = content.contrast;
  world.civs = content.civs || [];
  world.entry = content.entry || null;
  (content.facts || []).forEach((f) => addFact(world, f.name, f.fact, f.ladder, f.mag));
  world.consistency = computeConsistency(world);

  return { world, reasoning: content.reasoning };
}
