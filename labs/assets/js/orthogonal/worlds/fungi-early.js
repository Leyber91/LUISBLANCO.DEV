/* ============================================================
   worlds/fungi-early.js: one world of the Orthogonal plate, as data.

   A lineage is a list of nodes. Each names its role (config.js
   ROLES), the branch it belongs to (both, world, earth) and the
   nodes it grows from (after: the first is the one it continues,
   any others are threads that meet in it). An Earth node names the
   world node that does the same job at the same step (pair), and
   is drawn on that node's row. engine.js checks all of it and lays
   it out; nothing in view.js knows this world.

   Each node also says what it rests on (needs), in the words of
   the steps it needs: the exercise shows that line under each step
   it lifts out, so the order can be reasoned out from the four
   steps alone, by a visitor who never read the lineage. tests.mjs
   holds each line to the links: it names a word of every step the
   node needs (the root aside, which needs nothing), and never a
   word of a step that needs the node.

   Each node carries its evidence as items tagged REAL or
   ILLUSTRATIVE. A REAL item cites a key of config.js SOURCES (or
   a list of them), or declares the gap where no source was opened
   (gap), so the page never shows a REAL tag with nothing behind
   it.
   ============================================================ */

export const WORLD = Object.freeze({
  id: 'fungi-early',
  plate: 'A',
  title: 'A world where the fungi came early',
  driver: 'lignin-eating fungi before the Carboniferous',
  job: 'light at night',
  // the header's evidence line, a [REAL] claim (review H1): each source with its venue as config.js SOURCES gives it,
  // and the lag it is about said in the sentence itself
  favours: {
    branch: 'earth',
    line: 'The evidence favours the other branch: Nelsen et al. 2016 (PNAS) reject that coal formed because fungi could not yet digest lignin; Floudas et al. 2012 (Science) support that lag in part.',
  },
  artifact: {
    node: 'lamp',
    params: 'assets/data/orthogonal/artifacts/mycelial-lamp.json',
    image: 'assets/data/orthogonal/renders/mycelial-lamp.webp',
    record: 'assets/data/orthogonal/renders/mycelial-lamp.render.json',
    title: 'The mycelial street lamp',
    line: "This world's answer to light at night",
    // [ILLUSTRATIVE] said beside the render: every way it departs from what the culture would look like, as the
    // pipeline declares them (render-words.js DEPARTURES, tests.mjs section 18). The scene is exposed up, as a long
    // exposure records a dim source; an exposure that long records the night sky's faint light too (air.sky_ambient);
    // and the glow is drawn blue-white for the plate's palette where fungal light is green (review H4)
    exposure: "Drawn as a long exposure, sky included, in the plate's blue-white; to the eye fungal light is dimmer, and green (Kotlobay et al. 2018, PNAS).",
    exposureCites: ['kotlobay2018'],
    // what the render shows, read from the image (renders/mycelial-lamp.webp, 900 x 1200) and held word by word to the
    // parameter file, the record and the pipeline (render-words.js, tests.mjs section 18): no word for a thing the
    // render does not draw, such as the ink lines an earlier alt text named (review C1)
    alt: "At night in fog, a glass column on a plinth under a hood of stacked rings. Inside it, shelves of gilled bracket fungus on a central spindle glow blue-white along their gills and rims, and a small glass flask stands at the plinth's side. Their light reaches the plinth's top and a pool of wet cobbles in front of it; the hood is dark against the faint sky.",
    // where the render put the instrument's top and foot, as shares of the frame's height from its top (the render's
    // record, measure.frame); Earth's lamp stands on the same two lines. tests.mjs holds the three to each other.
    frame: { top: 0.09, ground: 0.79 },
  },
  earthArtifact: {
    node: 'gaslamp',
    title: 'The coal-gas street lamp',
    line: "Earth's answer to the same job",
    supply: 'Gas main',
  },
  nodes: [
    {
      id: 'lignin', label: 'Land plants make lignin', role: 'root', branch: 'both', after: [],
      needs: 'nothing on this plate',
      note: 'Wood is stiffened with lignin, which few organisms can break down. Both worlds start here.',
      evidence: [{ tag: 'REAL', text: 'Lignin decay is the subject of the genome study this plate leans on.', src: 'floudas2012' }],
    },
    {
      id: 'fungi', label: 'Fungi eat lignin', role: 'driver', branch: 'world', after: ['lignin'],
      needs: 'wood stiffened with lignin',
      note: 'The one change: white-rot fungi learn to digest lignin before the Carboniferous, so dead plants rot where on Earth they piled up.',
      evidence: [
        { tag: 'REAL', text: 'A molecular clock puts the origin of lignin decay near the end of the Carboniferous and supports this lag in part.', src: 'floudas2012' },
        { tag: 'REAL', text: 'Rejected on four kinds of evidence: coal formed where everwet tropics met sinking basins, much of it from bark without lignin, and still forms wherever those conditions hold.', src: 'nelsen2016' },
        { tag: 'ILLUSTRATIVE', text: 'This world takes the rejected branch on purpose, to grow what it would have built.' },
      ],
    },
    {
      id: 'buried', label: 'Swamp plants buried as peat', role: 'earth', branch: 'earth', after: ['lignin'], pair: 'fungi',
      needs: 'lignin-stiff plants, buried in swamps',
      note: 'On Earth, plant matter in everwet swamps was buried faster than it rotted.',
      evidence: [{ tag: 'REAL', text: 'Many Carboniferous coal beds are dominated by lycopsid bark that held no lignin.', src: 'nelsen2016' }],
    },
    {
      id: 'farmed', label: 'Fungi farmed', role: 'substrate', branch: 'world', after: ['fungi'],
      needs: 'fungi that eat lignin, grown as a crop',
      note: 'Where wood rots fast, the rot itself becomes the crop: beds of fungus are tended as food and as material.',
      evidence: [{ tag: 'ILLUSTRATIVE', text: 'Invented for this world.' }],
    },
    {
      id: 'nocoal', label: 'No coal; iron from rationed forests', role: 'pressure', branch: 'world', after: ['fungi'],
      needs: 'fungi that rot wood before it piles up',
      note: 'With no coal seams, smelting burns charcoal and forests are rationed. Fuel to burn for light is scarce, and that scarcity forces another kind of lamp.',
      evidence: [{ tag: 'ILLUSTRATIVE', text: 'Invented for this world, on the rejected branch: the evidence says coal would still have formed.' }],
    },
    {
      id: 'seams', label: 'Coal seams', role: 'earth', branch: 'earth', after: ['buried'], pair: 'nocoal',
      needs: 'swamp peat, buried and pressed',
      note: 'On Earth the buried peat became coal.',
      evidence: [{ tag: 'REAL', text: 'Paleozoic coal abundance came from everwet tropical conditions and wide basins during the assembly of Pangea.', src: 'nelsen2016' }],
    },
    {
      id: 'luminous', label: 'Luminous mycelium + glass', role: 'combination', branch: 'world', after: ['nocoal', 'farmed'],
      needs: 'farmed fungi that glow, and no coal',
      note: 'Two threads meet: farmed fungi that glow, and glass that keeps them wet and breathing.',
      evidence: [
        { tag: 'ILLUSTRATIVE', text: 'Glow drawn where Panellus stipticus is reported to glow: gill edges, cross-veins, rolled margin. Uncertain: read through an unrecorded secondary source.', src: 'okane1990' },
        { tag: 'ILLUSTRATIVE', text: 'Growing it under glass for light is invented.' },
      ],
    },
    {
      id: 'coalgas', label: 'Coal gas', role: 'earth', branch: 'earth', after: ['seams'], pair: 'luminous',
      needs: 'coal of buried swamp peat, heated',
      note: 'On Earth, coal heated without air gave a gas that burned with a bright flame.',
      evidence: [{ tag: 'REAL', text: "Earth's history.", gap: 'No source opened for this step yet.' }],
    },
    {
      id: 'lamp', label: 'Mycelial lamp', role: 'artifact', branch: 'world', after: ['luminous'],
      needs: 'farmed fungi glowing under glass, and no coal',
      note: 'The street lamp of this world: a column of glass on a ceramic plinth, a culture of shelf fungus on a spindle inside, a louvered hood it breathes through, a flask that keeps it wet.',
      evidence: [
        { tag: 'REAL', text: 'Real fungal light is dim: a culture of P. stipticus was photographed with an 8-minute exposure.', src: 'rabara2025' },
        // what render_artifact.py does (review H5: it holds no grammar), with the two sources its header gives
        { tag: 'ILLUSTRATIVE', text: 'The lamp, its brightness and its world are invented. Each cap of its culture is a profile swept round an axis, built from the seed in its parameter file.', src: ['desbenoit2004', 'raistrick2023'] },
        // the lab's core claim is untested (Luis closed box 1 without the core test, 2026-11-21; CORE_TEST.md)
        { tag: 'ILLUSTRATIVE', text: 'Hand-written lineage; the core claim of the method is not yet tested.' },
      ],
    },
    {
      id: 'gaslamp', label: 'Gas street lamp', role: 'earth', branch: 'earth', after: ['coalgas'], pair: 'lamp',
      needs: 'gas from the coal of buried peat',
      note: "Earth's answer to the same job: a gas flame in a glazed lantern on a post, fed by a main under the street.",
      evidence: [{ tag: 'REAL', text: "Earth's history.", gap: 'No source opened for this step yet.' }],
    },
    {
      id: 'trouble', label: 'The rot that lights the city eats its timber', role: 'trouble', branch: 'world', after: ['lamp'],
      needs: 'mycelial lamps of fungi in a city with no coal',
      note: 'Every success plants the next problem. A city lit by wood-eating fungi lives beside the thing that eats its beams.',
      evidence: [{ tag: 'ILLUSTRATIVE', text: "Invented: the hook of this world's next era." }],
    },
  ],
});
