/* ============================================================
   worlds/fungi-early.js: one world of the Orthogonal plate, as data.

   A lineage is a list of nodes. Each names its role (config.js
   ROLES), the branch it belongs to (both, world, earth) and the
   nodes it grows from (after: the first is the one it continues,
   any others are threads that meet in it). An Earth node names the
   world node that does the same job at the same step (pair), and
   is drawn on that node's row. engine.js checks all of it and lays
   it out; nothing in view.js knows this world.

   Each node carries its evidence as items tagged REAL or
   ILLUSTRATIVE. A REAL item cites a key of config.js SOURCES, or
   declares the gap where no source was opened (gap), so the page
   never shows a REAL tag with nothing behind it.
   ============================================================ */

export const WORLD = Object.freeze({
  id: 'fungi-early',
  plate: 'A',
  title: 'A world where the fungi came early',
  driver: 'lignin-eating fungi before the Carboniferous',
  job: 'light at night',
  favours: {
    branch: 'earth',
    line: 'The evidence favours the other branch: Nelsen et al. 2016 reject this lag; Floudas et al. 2012 support it in part.',
  },
  artifact: {
    node: 'lamp',
    params: 'assets/data/orthogonal/artifacts/mycelial-lamp.json',
    image: 'assets/data/orthogonal/renders/mycelial-lamp.webp',
    record: 'assets/data/orthogonal/renders/mycelial-lamp.render.json',
    title: 'The mycelial street lamp',
    line: "This world's answer to light at night",
    // [ILLUSTRATIVE] said beside the render: the scene is exposed up, as a long exposure records a dim source, and an
    // exposure that long records the night sky's faint light too (air.sky_ambient in the parameter file)
    exposure: 'Drawn as a long exposure records it, sky included; to the eye it is dimmer.',
    alt: 'At night in fog, a glass column on a ceramic plinth under a louvered hood, drawn in fine ink lines: shelves of gilled bracket fungus on a wooden spindle inside glow blue-white at their gill edges, and light only a small pool of the wet cobbled street around the plinth.',
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
      note: 'Wood is stiffened with lignin, which few organisms can break down. Both worlds start here.',
      evidence: [{ tag: 'REAL', text: 'Lignin decay is the subject of the genome study this plate leans on.', src: 'floudas2012' }],
    },
    {
      id: 'fungi', label: 'Fungi eat lignin', role: 'driver', branch: 'world', after: ['lignin'],
      note: 'The one change: white-rot fungi learn to digest lignin before the Carboniferous, so dead plants rot where on Earth they piled up.',
      evidence: [
        { tag: 'REAL', text: 'A molecular clock puts the origin of lignin decay near the end of the Carboniferous and supports this lag in part.', src: 'floudas2012' },
        { tag: 'REAL', text: 'Rejected on four kinds of evidence: coal formed where everwet tropics met sinking basins, much of it from bark without lignin, and still forms wherever those conditions hold.', src: 'nelsen2016' },
        { tag: 'ILLUSTRATIVE', text: 'This world takes the rejected branch on purpose, to grow what it would have built.' },
      ],
    },
    {
      id: 'buried', label: 'Swamp plants buried as peat', role: 'earth', branch: 'earth', after: ['lignin'], pair: 'fungi',
      note: 'On Earth, plant matter in everwet swamps was buried faster than it rotted.',
      evidence: [{ tag: 'REAL', text: 'Many Carboniferous coal beds are dominated by lycopsid bark that held no lignin.', src: 'nelsen2016' }],
    },
    {
      id: 'farmed', label: 'Fungi farmed', role: 'substrate', branch: 'world', after: ['fungi'],
      note: 'Where wood rots fast, the rot itself becomes the crop: beds of fungus are tended as food and as material.',
      evidence: [{ tag: 'ILLUSTRATIVE', text: 'Invented for this world.' }],
    },
    {
      id: 'nocoal', label: 'No coal; iron from rationed forests', role: 'pressure', branch: 'world', after: ['fungi'],
      note: 'With no coal seams, smelting burns charcoal and forests are rationed. Fuel to burn for light is scarce, and that scarcity forces another kind of lamp.',
      evidence: [{ tag: 'ILLUSTRATIVE', text: 'Invented for this world, on the rejected branch: the evidence says coal would still have formed.' }],
    },
    {
      id: 'seams', label: 'Coal seams', role: 'earth', branch: 'earth', after: ['buried'], pair: 'nocoal',
      note: 'On Earth the buried peat became coal.',
      evidence: [{ tag: 'REAL', text: 'Paleozoic coal abundance came from everwet tropical conditions and wide basins during the assembly of Pangea.', src: 'nelsen2016' }],
    },
    {
      id: 'luminous', label: 'Luminous mycelium + glass', role: 'combination', branch: 'world', after: ['nocoal', 'farmed'],
      note: 'Two threads meet: farmed fungi that glow, and glass that keeps them wet and breathing.',
      evidence: [
        { tag: 'REAL', text: 'Panellus stipticus glows on its gill edges, its cross-veins and its rolled margin.', src: 'okane1990' },
        { tag: 'ILLUSTRATIVE', text: 'Growing it under glass for light is invented.' },
      ],
    },
    {
      id: 'coalgas', label: 'Coal gas', role: 'earth', branch: 'earth', after: ['seams'], pair: 'luminous',
      note: 'On Earth, coal heated without air gave a gas that burned with a bright flame.',
      evidence: [{ tag: 'REAL', text: "Earth's history.", gap: 'No source opened for this step yet.' }],
    },
    {
      id: 'lamp', label: 'Mycelial lamp', role: 'artifact', branch: 'world', after: ['luminous'],
      note: 'The street lamp of this world: a column of glass on a ceramic plinth, a culture of shelf fungus on a spindle inside, a louvered hood it breathes through, a flask that keeps it wet.',
      evidence: [
        { tag: 'REAL', text: 'Real fungal light is dim: a culture of P. stipticus was photographed with an 8-minute exposure.', src: 'rabara2025' },
        { tag: 'ILLUSTRATIVE', text: 'The lamp, its brightness and its world are invented. Its form is drawn by a seeded procedural grammar after published mushroom-modelling methods.', src: 'desbenoit2004' },
      ],
    },
    {
      id: 'gaslamp', label: 'Gas street lamp', role: 'earth', branch: 'earth', after: ['coalgas'], pair: 'lamp',
      note: "Earth's answer to the same job: a gas flame in a glazed lantern on a post, fed by a main under the street.",
      evidence: [{ tag: 'REAL', text: "Earth's history.", gap: 'No source opened for this step yet.' }],
    },
    {
      id: 'trouble', label: 'The rot that lights the city eats its timber', role: 'trouble', branch: 'world', after: ['lamp'],
      note: 'Every success plants the next problem. A city lit by wood-eating fungi lives beside the thing that eats its beams.',
      evidence: [{ tag: 'ILLUSTRATIVE', text: "Invented: the hook of this world's next era." }],
    },
  ],
});
